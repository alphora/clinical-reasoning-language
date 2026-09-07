import { mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";

import { afterEach, describe, expect, it } from "vitest";

import type { ReferenceName } from "../../ast/types";
import {
  PublicationContextError,
  type PublicationConceptLookup,
} from "../../emit/publicationContext";
import { buildCRL } from "../../index";
import { resolveImports } from "../index";
import { preparePublicationContext } from "../preparePublicationContext";
import { collectCqlIncludeRefs } from "../computeEmitClosure";
import { buildLibraryScopes } from "../scopes";
import type { RegistryEntry, ResolvedGraph } from "../types";

// REFACTOR:grounded (#320, plan 557) — exercise real registry/import scopes and separate
// CQL/FHIR closure membership. No mocked scope callback serves as the acceptance oracle here.

const FIXTURES = path.resolve(__dirname, "fixtures");
const temporaryProjects: string[] = [];

function project(files: Record<string, string>): string {
  const directory = mkdtempSync(path.join(tmpdir(), "crl-publication-context-"));
  temporaryProjects.push(directory);
  for (const [name, source] of Object.entries({
    "package.json": JSON.stringify({ name: "fixture", version: "9.0.0" }),
    ...files,
  })) {
    const filePath = path.join(directory, name);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, source, "utf8");
  }
  return directory;
}

afterEach(() => {
  for (const directory of temporaryProjects.splice(0)) {
    const resolved = path.resolve(directory);
    const permittedPrefix = path.join(path.resolve(tmpdir()), "crl-publication-context-");
    if (!resolved.startsWith(permittedPrefix))
      throw new Error("Refusing to remove a path outside the temporary fixture prefix");
    rmSync(resolved, { recursive: true, force: true });
  }
});

function fixture(name: string): ResolvedGraph {
  return resolveImports(path.join(FIXTURES, name, "root.crl"));
}

function reference(libraryName: string, name: string): ReferenceName {
  const built = buildCRL(
    `# Reference\nlibrary "Referrer".\ndecision "Use":\n- when "${libraryName}"."${name}" then recommend activity "Proceed".\n`,
  );
  if (!built.success || built.result === undefined) throw new Error(JSON.stringify(built.errors));
  const decision = built.result.statements[0];
  if (decision.type !== "Decision") throw new Error("Expected decision");
  const branch = decision.body.statements[0];
  if (branch.type !== "WhenBlock" || branch.condition.type !== "BranchConditionRef")
    throw new Error("Expected reference guard");
  return branch.condition.ref;
}

function hit(result: PublicationConceptLookup): Extract<PublicationConceptLookup, { kind: "hit" }> {
  if (result.kind !== "hit") throw new Error(JSON.stringify(result));
  return result;
}

function entry(
  graph: ResolvedGraph,
  name: string,
  origin?: RegistryEntry["origin"],
): RegistryEntry {
  const found = [...graph.resolvedLibraries, ...graph.localLibraries].find(
    (value) => value.name === name && (origin === undefined || value.origin === origin),
  );
  if (found === undefined) throw new Error(`Missing fixture entry ${name}/${origin}`);
  return found;
}

function snapshot(graph: ResolvedGraph): string {
  return JSON.stringify(graph, (_key, value: unknown) =>
    value instanceof Map ? [...value.entries()] : value instanceof Set ? [...value] : value,
  );
}

const localConcept = (name: string, code: string): string =>
  `concept "${name}":\n- type is Observation.\n- value type is boolean.\n- code is \`${code}\`.\n`;

describe("preparePublicationContext", () => {
  // REFACTOR:grounded (#320, review 562): actual package version changes must
  // reach portable computation identity, including repeated resolution in one process.
  it("captures owning package metadata and refreshes it between resolution invocations", () => {
    const directory = project({
      "root.crl": 'library "Root".\ninclude "Pkg".\n',
      "node_modules/pkg/package.json": JSON.stringify({ name: "pkg", version: "1.0.0", crl: { libraries: ["pkg.crl"] } }),
      "node_modules/pkg/pkg.crl": 'library "Pkg".\n',
    });
    const rootPath = path.join(directory, "root.crl");
    const first = preparePublicationContext(resolveImports(rootPath));
    expect(first.declarations.getLibrary(rootPath)?.packageIdentity).toEqual({ name: "fixture", version: "9.0.0" });
    const foreignPath = path.join(directory, "node_modules/pkg/pkg.crl");
    expect(first.declarations.getLibrary(foreignPath)?.packageIdentity).toEqual({ name: "pkg", version: "1.0.0" });
    writeFileSync(path.join(directory, "node_modules/pkg/package.json"), JSON.stringify({
      name: "pkg", version: "2.0.0", crl: { libraries: ["pkg.crl"] },
    }));
    const second = preparePublicationContext(resolveImports(rootPath));
    expect(second.declarations.getLibrary(foreignPath)?.packageIdentity).toEqual({ name: "pkg", version: "2.0.0" });
    expect(first.declarations.getLibrary(foreignPath)?.packageIdentity).toEqual({ name: "pkg", version: "1.0.0" });
  });

  // REFACTOR:grounded (#320, review 562): a domain-only sibling must resolve in
  // preparation without creating a runtime include for compile-time literal tables.
  it("expands a qualified value domain into both raw closures without a CQL include", () => {
    const directory = project({
      "root.crl": `library "Root".
concept "Choice":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- code is \`choice\`.
- value domain is "Domain"."All".
- shape reduction is most recent.
`,
      "domain.crl": `library "Domain".
terminology "All":
- system is \`https://example.org/options\`.
- code is \`yes\`.
- code is \`no\`.
`,
    });
    const graph = resolveImports(path.join(directory, "root.crl"));
    const prepared = preparePublicationContext(graph, { canonicalBase: "https://example.org/policy", policyId: "policy" });
    expect(prepared.publications.diagnostics).toEqual([]);
    expect(prepared.rawCqlClosure.map((item) => item.name)).toEqual(["Root", "Domain"]);
    expect(prepared.rawFhirClosure.map((item) => item.name)).toEqual(["Root", "Domain"]);
    const root = entry(graph, "Root");
    const scopes = buildLibraryScopes(graph.resolvedLibraries, graph.localLibraries, graph.registry!);
    expect([...collectCqlIncludeRefs(root, scopes.get(root.filePath)!)]).toEqual([]);
    expect(prepared.publications.descriptors[0].valueDomain).toEqual([
      { system: "https://example.org/options", code: "no" },
      { system: "https://example.org/options", code: "yes" },
    ]);
  });

  // REFACTOR:grounded (#320, review 560) — both emit lanes share one raw publication admission.
  it("prepares the admitted publication once against the identical declaration context", () => {
    const directory = project({
      "root.crl": '# Root\nlibrary "Root".\n' + localConcept("Answer", "answer") +
        '- shape is Record.\n- shape reduction is most recent.\n',
    });
    const graph = resolveImports(path.join(directory, "root.crl"));
    const before = snapshot(graph);
    const prepared = preparePublicationContext(graph, { canonicalBase: "https://example.org/policy", policyId: "policy" });
    expect(prepared.publications.declarations).toBe(prepared.declarations);
    expect(prepared.publications.diagnostics).toEqual([]);
    expect(prepared.publications.descriptors).toHaveLength(1);
    const descriptor = prepared.publications.descriptors[0];
    expect(descriptor).toMatchObject({
      identity: { sourceIdentity: graph.rootPath, libraryName: "Root", conceptName: "Answer" },
      localCode: { system: "https://example.org/policy/CodeSystem/policy-local", code: "answer" },
      resourceType: "Observation", valueType: "boolean", selector: { kind: "mostRecent", equalTime: "error" },
    });
    expect(prepared.publications.get(descriptor.identity.key)).toBe(descriptor);
    expect(prepared.publications.lookup(graph.rootPath, reference("Root", "Answer"))).toEqual({ kind: "publication", descriptor });
    expect(snapshot(graph)).toBe(before);
  });

  it("retains an unsupported publication diagnostic before either emit lane lowers", () => {
    const directory = project({
      "root.crl": '# Root\nlibrary "Root".\n' + localConcept("Answer", "answer") +
        '- shape is RecordSet.\n- shape reduction is most recent.\n',
    });
    const graph = resolveImports(path.join(directory, "root.crl"));
    const prepared = preparePublicationContext(graph, { canonicalBase: "https://example.org/policy" });
    expect(prepared.publications.descriptors).toEqual([]);
    expect(prepared.publications.diagnostics).toMatchObject([{ kind: "publication-unsupported-form" }]);
    expect(prepared.publications.lookup(graph.rootPath, "Answer")).toMatchObject({ kind: "error" });
  });

  it("uses actual package-first precedence for an explicit include with a same-named local library", () => {
    const graph = fixture("local-package-same-name");
    const prepared = preparePublicationContext(graph);
    const root = entry(graph, "Root");
    const pkg = entry(graph, "Foo", "package");
    const local = entry(graph, "Foo", "local");
    const result = hit(
      prepared.declarations.lookupConcept(root.filePath, reference("Foo", "Foo Concept")),
    );
    expect(result.identity.sourceIdentity).toBe(pkg.filePath);
    expect(result.node).toBe(pkg.ast.statements[0]);
    expect(prepared.declarations.getLibrary(local.filePath)).toBeUndefined();
    expect(prepared.rawCqlClosure.map((value) => value.filePath)).toContain(pkg.filePath);
    expect(prepared.rawCqlClosure.map((value) => value.filePath)).not.toContain(local.filePath);
  });

  it("uses actual local-first precedence without the explicit include", () => {
    const rootPath = path.join(FIXTURES, "local-package-same-name", "root.crl");
    const graph = resolveImports(rootPath, {
      overlays: new Map([
        [
          rootPath,
          '# Local precedence\nlibrary "Root".\nconcept "Root C":\n- type is Observation.\n- defined as "Foo"."Foo Concept".\n',
        ],
      ]),
    });
    const prepared = preparePublicationContext(graph);
    const local = entry(graph, "Foo", "local");
    expect(
      hit(prepared.declarations.lookupConcept(graph.rootPath, reference("Foo", "Foo Concept")))
        .identity.sourceIdentity,
    ).toBe(local.filePath);
    expect(prepared.rawCqlClosure.some((value) => value.origin === "package")).toBe(false);
  });

  it("enforces package visibility even when the full registry knows the target", () => {
    const graph = fixture("qualified-ref-no-include");
    const target = graph.registry?.byNamePackage.get("SomePkg");
    expect(target).toBeDefined();
    const prepared = preparePublicationContext(graph);
    const ref = reference("SomePkg", "Pkg C");
    expect(prepared.declarations.lookupConcept(graph.rootPath, ref)).toMatchObject({
      kind: "not-visible",
      detail: "external-library-not-included",
      targetSourceIdentity: target?.filePath,
      site: { fromSourceIdentity: graph.rootPath, reference: ref },
    });
    expect(prepared.declarations.getLibrary(target?.filePath ?? "")).toBeUndefined();
  });

  it("keeps a known unrelated local target distinct from an unknown library", () => {
    const graph = fixture("unrelated-local-sibling");
    const sibling = entry(graph, "Sibling");
    const prepared = preparePublicationContext(graph);
    expect(
      prepared.declarations.lookupConcept(graph.rootPath, reference("Sibling", "Anything")),
    ).toMatchObject({ kind: "outside-context", targetSourceIdentity: sibling.filePath });
    expect(
      prepared.declarations.lookupConcept(graph.rootPath, reference("Unknown", "Anything")),
    ).toMatchObject({ kind: "missing", reason: "library", detail: "library-not-known-in-scope" });
  });

  it("preserves the actual unsupported-alias boundary and still resolves the raw included name", () => {
    const graph = fixture("alias-not-yet-supported");
    const prepared = preparePublicationContext(graph);
    expect(
      graph.diagnostics.some((diagnostic) => diagnostic.kind === "alias-not-yet-supported"),
    ).toBe(true);
    expect(
      prepared.declarations.lookupConcept(graph.rootPath, reference("P", "Pkg C")),
    ).toMatchObject({ kind: "not-visible", detail: "unsupported-include-alias" });
    expect(
      hit(prepared.declarations.lookupConcept(graph.rootPath, reference("SomePkg", "Pkg C")))
        .identity.libraryName,
    ).toBe("SomePkg");
  });

  it("does not expose a consumer-local library from a package owner's scope", () => {
    const graph = fixture("package-include-local-no-fallback");
    const prepared = preparePublicationContext(graph);
    const pkg = entry(graph, "BadPkg");
    expect(
      prepared.declarations.lookupConcept(pkg.filePath, reference("ProjectOnly", "Anything")),
    ).toMatchObject({ kind: "missing", detail: "library-not-known-in-scope" });
    expect(
      prepared.graph.diagnostics.some((diagnostic) => diagnostic.kind === "unresolved-include"),
    ).toBe(true);
  });

  it("retains a FHIR-only activity terminology dependency without enlarging the raw CQL closure", () => {
    const directory = project({
      "root.crl":
        '# Root\nlibrary "Root".\nactivity "Vaccinate":\n- request CPGImmunizationRequest.\n- with "ActivityCodes"."Vaccine".\n',
      "activity-codes.crl":
        '# Codes\nlibrary "ActivityCodes".\nterminology "Vaccine":\n- system is `https://example.org/vaccine`.\n- code is `vaccine`.\n',
    });
    const graph = resolveImports(path.join(directory, "root.crl"));
    expect(graph.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    const prepared = preparePublicationContext(graph);
    expect(prepared.rawCqlClosure.map((value) => value.name)).toEqual(["Root"]);
    expect(prepared.rawFhirClosure.map((value) => value.name)).toEqual(["Root", "ActivityCodes"]);
    expect(
      prepared.declarations.lookupTerminology(graph.rootPath, reference("ActivityCodes", "Vaccine"))
        .kind,
    ).toBe("hit");
    expect(prepared.declarations.getLibraries()).toHaveLength(2);
  });

  it("captures raw code-is and seed inputs once and keeps domain bases stable through later layer names", () => {
    const directory = project({
      "root.crl":
        '# Root\nlibrary "Root".\n' +
        localConcept("Root Value", "root") +
        'concept "Use":\n- type is Observation.\n- defined as "Sibling"."Sibling Value".\n',
      "sibling.crl": '# Sibling\nlibrary "Sibling".\n' + localConcept("Sibling Value", "sibling"),
    });
    const graph = resolveImports(path.join(directory, "root.crl"));
    const prepared = preparePublicationContext(graph, {
      canonicalBase: "https://example.org/policy",
      policyId: "policy",
    });
    const root = entry(graph, "Root");
    const sibling = entry(graph, "Sibling");
    expect(prepared.primarySeedPaths).toEqual([root.filePath]);
    expect(prepared.localCodePaths).toEqual([root.filePath, sibling.filePath]);
    expect(prepared.localDomainResolver.domainIdFor(root)).toBe("policy");
    expect(prepared.localDomainResolver.domainIdFor(sibling)).toBe("policy-sibling");
    expect(prepared.localDomainResolver.disambiguatedBaseFor(root)).toBeUndefined();
    expect(prepared.localDomainResolver.disambiguatedBaseFor(sibling)).toBe("policy-sibling");
    expect(
      prepared.localDomainResolver.domainIdFor({
        filePath: sibling.filePath,
        name: "RewrittenInferences",
      }),
    ).toBe("policy-sibling");
    expect(prepared.declarations.getLibrary(sibling.filePath)?.artifact).toEqual({
      canonicalBase: "https://example.org/policy",
      policyId: "policy",
      localDomainId: "policy-sibling",
    });
    expect(
      prepared.localDomainResolver.domainIdFor({ filePath: "/not-prepared", name: "Other" }),
    ).toBeUndefined();
  });

  it("uses only caller-provided owning package metadata and preserves an absent dependency version", () => {
    const graph = fixture("local-package-same-name");
    const pkg = entry(graph, "Foo", "package");
    const prepared = preparePublicationContext(graph, {
      packageIdentityByPath: new Map([
        [graph.rootPath, { name: "root", version: "9.0.0" }],
        [pkg.filePath, { name: "dependency" }],
      ]),
    });
    expect(prepared.declarations.getLibrary(graph.rootPath)?.packageIdentity).toEqual({
      name: "root",
      version: "9.0.0",
    });
    expect(prepared.declarations.getLibrary(pkg.filePath)?.packageIdentity).toEqual({
      name: "dependency",
    });
    expect(prepared.canonicalBase).toBeUndefined();
    expect(prepared.policyId).toBeUndefined();
    expect(prepared.declarations.getLibrary(pkg.filePath)?.artifact).toEqual({});
    expect(prepared.localDomainResolver.domainIdFor(pkg)).toBeUndefined();
  });

  it("performs no project metadata reads after graph resolution", () => {
    const directory = project({
      "root.crl": '# Root\nlibrary "Root".\n' + localConcept("Value", "value"),
    });
    const graph = resolveImports(path.join(directory, "root.crl"));
    unlinkSync(path.join(directory, "package.json"));
    const prepared = preparePublicationContext(graph);
    expect(prepared.rawCqlClosure).toHaveLength(1);
    expect(prepared.declarations.lookupConcept(graph.rootPath, "Value").kind).toBe("hit");
    expect(prepared.policyId).toBeUndefined();
    // Metadata already captured by resolution survives deleting package.json;
    // preparation performs no filesystem fallback or new version inference.
    expect(prepared.declarations.getLibrary(graph.rootPath)?.packageIdentity).toEqual({ name: "fixture", version: "9.0.0" });
  });

  it("leaves graph, registry, raw nodes and import diagnostics unchanged", () => {
    const graph = fixture("local-package-same-name");
    const before = snapshot(graph);
    const prepared = preparePublicationContext(graph, { policyId: "fixture" });
    const result = hit(prepared.declarations.lookupConcept(graph.rootPath, "Root C"));
    expect(prepared.graph).toBe(graph);
    expect(result.node).toBe(entry(graph, "Root").ast.statements[0]);
    expect(snapshot(graph)).toBe(before);
    expect(Object.isFrozen(graph)).toBe(false);
    expect(Object.isFrozen(result.node)).toBe(false);
    for (const object of [
      prepared,
      prepared.rawCqlClosure,
      prepared.rawFhirClosure,
      prepared.primarySeedPaths,
      prepared.localCodePaths,
      prepared.localDomainResolver,
      prepared.declarations,
    ]) {
      expect(Object.isFrozen(object)).toBe(true);
    }
  });

  it("preserves source parse failures on the returned graph without inventing an empty-success claim", () => {
    const directory = project({ "root.crl": "This is not a CRL library." });
    const graph = resolveImports(path.join(directory, "root.crl"));
    const prepared = preparePublicationContext(graph);
    expect(prepared.rawFhirClosure).toEqual([]);
    expect(prepared.graph.diagnostics).toBe(graph.diagnostics);
    expect(prepared.graph.diagnostics).toMatchObject([
      { kind: "parse-failure", severity: "error", filePath: graph.rootPath },
    ]);
  });

  it("rejects an inconsistent registry name with the actual source identity", () => {
    const graph = fixture("unrelated-local-sibling");
    const root = entry(graph, "Root");
    const inconsistent = {
      ...graph,
      resolvedLibraries: [{ ...root, name: "Wrong Registry Name" }],
    };
    let caught: unknown;
    try {
      preparePublicationContext(inconsistent);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PublicationContextError);
    if (!(caught instanceof PublicationContextError)) throw new Error("Expected context error");
    expect(caught.diagnostics).toMatchObject([
      {
        kind: "library-name-mismatch",
        sourceIdentity: root.filePath,
        libraryNames: ["Wrong Registry Name", "Root"],
      },
    ]);
  });
});
