import { emitCQLImports } from "../../imports/emit";
import { resolveImports } from "../../imports/index";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import * as path from "path";

import { describe, expect, it } from "vitest";

import {
  applyContentUrlInvariant,
  emitFhirDefClosure,
  emitFhirDefFromPath,
} from "../closureOrchestrator";
import type { CpgMetadata, EmittedResource } from "../types";

/**
 * Slice 4c / E — PARTIAL-split FHIR closure golden.
 *
 * `code-is-decision` is the motivating partial-split case: a DECISION-bearing
 * library (disqualified from the FULL layered auto-split) that ALSO carries
 * concept-level `code is` codes. The CQL lane (A) partial-splits it into:
 *   - `Code Is Decision Concepts`  — the lowered local codes (role: concepts)
 *   - `Code Is Decision`           — the Root, which KEEPS the source name so
 *                                    the Decision/Activity `library[]` refs
 *                                    resolve to it (role: root)
 *
 * The FHIR lane (E) consumes that manifest and emits one FHIR Library per
 * emitted CQL library:
 *   - Library `code-is-decision`          depends-on `.../Library/code-is-decision-concepts`,
 *                                         content url `../../cql/Code Is Decision.cql`
 *   - Library `code-is-decision-concepts` depends-on `.../CodeSystem/code-is-decision-local`,
 *                                         content url `../../cql/Code Is Decision Concepts.cql`
 *   - the local CodeSystem; the PlanDefinitions/ActivityDefinitions keyed on the
 *     SOURCE name (their `library[]` resolves to the Root Library).
 *
 * Serialization mirrors writeFhirResources exactly (`JSON.stringify(resource,
 * null, 2) + "\n"`), so the golden equals what ships.
 *
 * Regenerate after an INTENTIONAL emit change:
 *   UPDATE_GOLDEN=1 npx jest src/fhir-emitter/tests/partial-split-fhir-golden.test.ts
 */

const HERE = __dirname;
const FIXTURE = path.join(HERE, "fixtures", "code-is-decision", "code-is-decision.crl");
const GOLDEN_DIR = path.join(HERE, "golden", "code-is-decision");
const UPDATE = process.env.UPDATE_GOLDEN === "1";

const FIXED_DATE = new Date("2020-01-01T00:00:00.000Z");
const ser = (body: unknown): string => JSON.stringify(body, null, 2) + "\n";

function listGolden(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const acc: string[] = [];
  const walk = (d: string, prefix: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), rel);
      else if (e.name.endsWith(".json")) acc.push(rel);
    }
  };
  walk(dir, "");
  return acc.sort();
}

describe("CRL → FHIR partial-split golden (code-is-decision)", () => {
  const result = emitFhirDefFromPath(FIXTURE, { date: FIXED_DATE });

  it("emits with no errors and no unmatched", () => {
    expect(result.errors).toEqual([]);
    expect(result.unmatched).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("R1 byte-equality: the FHIR CodeSystem.url == the CQL `codesystem '<url>'` literal, both POLICY-ID slugged", () => {

    // FHIR lane — the local CodeSystem url is policy-id based.
    const cs = result.resources.find((r) => r.resourceType === "CodeSystem")!;
    const csUrl = (cs.resource as { url: string }).url;
    // Policy id is the fixture package name "code-is-decision-fixture", NOT the
    // library-name slug "code-is-decision".
    expect(csUrl).toBe(
      "http://example.org/crl/code-is-decision/CodeSystem/code-is-decision-fixture-local",
    );

    // CQL lane — the emitted CQL carries a byte-equal `codesystem '<csUrl>'`.
    const cql = emitCQLImports(FIXTURE);
    expect(cql.success).toBe(true);
    const allCql = cql.cqlByLibrary.map((e) => e.cql).join("\n");
    expect(allCql).toContain(`'${csUrl}'`);
  });

  it("emits the R2 source-typed split Libraries (LocalConcepts + LocalSource + Interface) with the layered dep routing", () => {
    // R2 — `code-is-decision` (a DECISION-bearing library WITH local `code is`)
    // now routes to the `interface` split kind: a FULL source-typed split
    // (LocalConcepts → LocalSource) PLUS a synthesized `<policyId>-Interface`
    // re-export library (the decision/action-guard surface). It NO LONGER takes
    // the pre-R2 partial (Root + Concepts) path.
    // #187 — exclude the always-emitted shared catalog Libraries
    // (CRLCommon/CaseFeatureCommon); this asserts the 3 POLICY layer Libraries.
    const CATALOG_LIB_IDS = new Set(["CRLCommon", "CaseFeatureCommon"]);
    const libs = result.resources.filter(
      (r) => r.resourceType === "Library" && !CATALOG_LIB_IDS.has(r.resource.id as string),
    );
    expect(libs).toHaveLength(3);

    // #186 — ids are the UNIFIED hyphen-free `S` (id == url-tail == name), the
    // cap-safe PascalCase of `<policyId>-<layer>` the CQL lane stamps as the
    // library name (NOT a lowercase layer-token suffix). cqf resolves the
    // `include`/url-tail against `Library.name`, so all three must be this one S.
    const byId = new Map(
      libs.map((l) => [l.resource.id as string, l.resource as Record<string, unknown>]),
    );
    const localConcepts = byId.get("CodeIsDecisionFixtureLocalConcepts")!;
    const localSource = byId.get("CodeIsDecisionFixtureLocalSource")!;
    const iface = byId.get("CodeIsDecisionFixtureInterface")!;
    expect(localConcepts).toBeDefined();
    expect(localSource).toBeDefined();
    expect(iface).toBeDefined();
    // id == name == url-tail (the #186 identity agreement).
    for (const [id, res] of [
      ["CodeIsDecisionFixtureLocalConcepts", localConcepts],
      ["CodeIsDecisionFixtureLocalSource", localSource],
      ["CodeIsDecisionFixtureInterface", iface],
    ] as const) {
      expect(res.name).toBe(id);
      expect((res.url as string).endsWith(`/Library/${id}`)).toBe(true);
    }

    // LocalConcepts owns the local CodeSystem (the lowered `code is` domain).
    expect((localConcepts.content as Array<{ url?: string }>)[0]?.url).toBe(
      "../../cql/CodeIsDecisionFixtureLocalConcepts.cql",
    );
    expect(
      (localConcepts.relatedArtifact as Array<{ type?: string; resource?: string }>).map(
        (e) => e.resource,
      ),
    ).toEqual([
      "http://example.org/crl/code-is-decision/CodeSystem/code-is-decision-fixture-local",
    ]);

    // LocalSource depends-on its LocalConcepts sibling.
    expect((localSource.content as Array<{ url?: string }>)[0]?.url).toBe(
      "../../cql/CodeIsDecisionFixtureLocalSource.cql",
    );
    expect(
      (localSource.relatedArtifact as Array<{ type?: string; resource?: string }>).map(
        (e) => e.resource,
      ),
    ).toEqual([
      "http://example.org/crl/code-is-decision/Library/CodeIsDecisionFixtureLocalConcepts",
    ]);

    // Interface re-exports the decision surface; depends-on LocalSource.
    expect((iface.content as Array<{ url?: string }>)[0]?.url).toBe(
      "../../cql/CodeIsDecisionFixtureInterface.cql",
    );
    expect(
      (iface.relatedArtifact as Array<{ type?: string; resource?: string }>).map((e) => e.resource),
    ).toEqual([
      "http://example.org/crl/code-is-decision/Library/CodeIsDecisionFixtureLocalSource",
    ]);
  });

  it("the PlanDefinition + ActivityDefinition library[] resolve to the Interface Library canonical", () => {
    // R2 — the decision/activity/recommendation `library[]` now rewire onto the
    // synthesized Interface re-export library (NOT the source-name Root).
    const interfaceUrl =
      "http://example.org/crl/code-is-decision/Library/CodeIsDecisionFixtureInterface";
    for (const r of result.resources) {
      if (r.resourceType !== "PlanDefinition" && r.resourceType !== "ActivityDefinition") continue;
      const lib = (r.resource as { library?: unknown }).library;
      if (Array.isArray(lib)) expect(lib).toContain(interfaceUrl);
    }
  });

  // ── Byte-for-byte golden ──
  const files = new Map<string, string>();
  for (const res of result.resources) files.set(res.relativePath, ser(res.resource));

  if (UPDATE) {
    it("regenerates the code-is-decision golden", () => {
      for (const [rel, content] of files) {
        const file = path.join(GOLDEN_DIR, rel);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, content);
      }
      expect(files.size).toBeGreaterThan(0);
    });
  } else {
    for (const [rel, content] of files) {
      it(`matches golden ${rel}`, () => {
        const file = path.join(GOLDEN_DIR, rel);
        if (!existsSync(file)) {
          throw new Error(`Missing golden ${rel} — run UPDATE_GOLDEN=1 to create.`);
        }
        expect(content).toBe(readFileSync(file, "utf-8"));
      });
    }

    it("golden file set matches the emitted set", () => {
      expect(listGolden(GOLDEN_DIR)).toEqual([...files.keys()].sort());
    });
  }
});

/* ─── Inv 4 — content-url ↔ emitted-CQL-file integrity (slice 4c / E) ─── */

describe("applyContentUrlInvariant — Library content-url integrity (Inv 4)", () => {
  function lib(contentUrl: string, sourceName: string): EmittedResource {
    return {
      resourceType: "Library",
      relativePath: `Library/${sourceName}.json`,
      resource: {
        resourceType: "Library",
        content: [{ contentType: "text/cql", url: contentUrl }],
      },
      sourceKind: "Library",
      sourceName,
    };
  }

  it("Library pointing at a CQL file the manifest never paired with it → library-content-url-unresolved", () => {
    const errors = applyContentUrlInvariant(
      [lib("../../cql/Phantom.cql", "Phantom")],
      new Map([["Real", "Real.cql"]]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.kind).toBe("library-content-url-unresolved");
  });

  it("Library content url = its OWN manifest-paired filename → no error", () => {
    const errors = applyContentUrlInvariant(
      [lib("../../cql/Real.cql", "Real")],
      new Map([
        ["Real", "Real.cql"],
        ["Other", "Other.cql"],
      ]),
    );
    expect(errors).toEqual([]);
  });

  it("cross-wired: Library pointing at ANOTHER source's emitted CQL file → error (per-identity, not global)", () => {
    // "Real" exists in the manifest, but THIS Library's identity ("Real") is
    // paired with "Real.cql" — pointing at the sibling "Other.cql" must fail even
    // though "Other.cql" is a genuinely-emitted file.
    const errors = applyContentUrlInvariant(
      [lib("../../cql/Other.cql", "Real")],
      new Map([
        ["Real", "Real.cql"],
        ["Other", "Other.cql"],
      ]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.kind).toBe("library-content-url-unresolved");
  });

  it("wrong directory but matching basename → error (sibling-layout prefix required)", () => {
    const errors = applyContentUrlInvariant(
      [lib("../wrong/Real.cql", "Real")],
      new Map([["Real", "Real.cql"]]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.kind).toBe("library-content-url-unresolved");
  });

  it("empty manifest → invariant is a no-op (graph-only path)", () => {
    const errors = applyContentUrlInvariant([lib("../../cql/Anything.cql", "Anything")], new Map());
    expect(errors).toEqual([]);
  });
});

/* ─── Inv 4 wired into emitFhirDefClosure end-to-end (slice 4c / E) ───── */

describe("emitFhirDefClosure — content-url invariant is wired into the pipeline", () => {

  const METADATA: CpgMetadata = {
    version: "1.0.0",
    name: "code-is-decision-fixture",
    title: "Code Is Decision",
    description: "R2 source-typed split fixture",
    publisher: "unknown",
    contact: [],
    canonicalBase: "http://example.org/crl/code-is-decision",
    status: "draft",
    experimental: true,
    jurisdiction: [],
    useContext: [],
  };

  it("a manifest/closure mismatch (a source with NO manifest entry, but other sources present) surfaces the error through the full closure", () => {
    const graph = resolveImports(FIXTURE);
    const cql = emitCQLImports(FIXTURE);
    expect(cql.success).toBe(true);
    // Realistic drift: the FHIR closure will still emit a Library for the source
    // (single-entry fallback, since the source now has zero manifest entries),
    // but the per-identity expected-filename map is NON-empty (it carries a
    // STRAY phantom entry for an unrelated library), so Inv 4 is active and the
    // fallback Library's sourceName ("Code Is Decision") has no pairing → error.
    // This proves Inv 4 runs inside emitFhirDefClosure (not just the unit), and
    // that a Library the manifest forgot is caught rather than silently shipped.
    const phantomManifest = cql.cqlByLibrary
      .filter((e) => e.sourceLibraryName !== "Code Is Decision")
      .concat([
        {
          ...cql.cqlByLibrary[0]!,
          libraryName: "Unrelated Phantom",
          sourceLibraryName: "Unrelated Phantom",
          outputFilename: "Unrelated Phantom.cql",
          role: "root",
          includes: [],
        },
      ]);
    const result = emitFhirDefClosure(
      graph,
      METADATA,
      { date: new Date("2020-01-01T00:00:00.000Z") },
      phantomManifest,
    );
    expect(result.errors.some((e) => e.kind === "library-content-url-unresolved")).toBe(true);
    expect(result.success).toBe(false);
  });

  it("the unmodified manifest passes the closure with no content-url error", () => {
    const graph = resolveImports(FIXTURE);
    const cql = emitCQLImports(FIXTURE);
    const result = emitFhirDefClosure(
      graph,
      METADATA,
      { date: new Date("2020-01-01T00:00:00.000Z") },
      cql.cqlByLibrary,
    );
    expect(result.errors.some((e) => e.kind === "library-content-url-unresolved")).toBe(false);
  });
});

/* ─── D3 — the two structured-error guards (hand-built manifest) ──────── */

describe("emitFhirDefClosure — structured-error guards on a malformed manifest (D3)", () => {
  const FIXED = { date: new Date("2020-01-01T00:00:00.000Z") };

  const METADATA: CpgMetadata = {
    version: "1.0.0",
    name: "code-is-decision-fixture",
    title: "Code Is Decision",
    description: "R2 source-typed split fixture",
    publisher: "unknown",
    contact: [],
    canonicalBase: "http://example.org/crl/code-is-decision",
    status: "draft",
    experimental: true,
    jurisdiction: [],
    useContext: [],
  };

  it('a decision-bearing source with a multi-entry manifest but NO role:"interface"/"root" entry → decision-root-library-missing + decisions skipped (not thrown)', () => {
    const graph = resolveImports(FIXTURE);
    const cql = emitCQLImports(FIXTURE);
    expect(cql.success).toBe(true);
    // R2 — the real `interface`-kind manifest is [LocalConcepts, LocalSource,
    // Interface]; the Decision/Activity `library[]` resolves to the Interface
    // entry. Demote the Interface entry's role to "layer" so the manifest still
    // has 3 entries (multi-entry branch) but NO entry the decision surface can
    // reference (no `role:"interface"` and no source-name-keeping `role:"root"`).
    // The orchestrator must surface `decision-root-library-missing` and SKIP the
    // source's Decision PlanDefs rather than throw (no try/catch on the MCP path).
    const manifest = cql.cqlByLibrary.map((e) =>
      e.role === "interface" ? { ...e, role: "layer" as const } : e,
    );
    const result = emitFhirDefClosure(graph, METADATA, FIXED, manifest);
    expect(result.errors.some((e) => e.kind === "decision-root-library-missing")).toBe(true);
    // The source's decisions are skipped → NO Decision PlanDefinition emitted for
    // "Triage Crohns" (its R1 capped id is `code-is-decision-fixture-triage-crohns`).
    const decisionPlanDefs = result.resources.filter(
      (r) => r.resourceType === "PlanDefinition" && r.sourceKind === "Decision",
    );
    expect(decisionPlanDefs).toHaveLength(0);
    expect(result.success).toBe(false);
  });

  it("a single-entry manifest whose lone entry is NOT the name-keeping Root → single-entry malformed-manifest guard fires", () => {
    const graph = resolveImports(FIXTURE);
    const cql = emitCQLImports(FIXTURE);
    expect(cql.success).toBe(true);
    // Collapse to ONE entry for the source, and make it the Concepts entry
    // (role:"concepts", libraryName="Code Is Decision Concepts") — a single-entry
    // source that is NOT the per-CRL Root keeping the source name. The single-
    // entry fallback must flag this as malformed rather than silently emit a
    // source-named Library inconsistent with the manifest.
    const conceptsEntry = cql.cqlByLibrary.find(
      (e) => e.sourceLibraryName === "Code Is Decision" && e.role === "concepts",
    )!;
    expect(conceptsEntry).toBeDefined();
    const result = emitFhirDefClosure(graph, METADATA, FIXED, [conceptsEntry]);
    expect(
      result.errors.some(
        (e) =>
          e.kind === "library-content-url-unresolved" &&
          /single manifest entry that is not its Root/.test(e.message ?? ""),
      ),
    ).toBe(true);
    expect(result.success).toBe(false);
  });

  // F3 (impl-review) — direct-caller trap. A decision-bearing source with valid
  // `code is` decision conditions, passed DIRECTLY with NO manifest (the graph-
  // only / unit-test path), has no LocalSource layer → the case-feature gate
  // stays closed and the lane would be SILENTLY skipped (no SDs, no inputs) while
  // success stays true. The guard must hard-error so the missing lane cannot pass
  // unnoticed.
  it("a decision-bearing code-is source passed with NO manifest → decision-root-library-missing (case-feature lane can't silently skip)", () => {
    const graph = resolveImports(FIXTURE);
    // No manifest (cqlByLibrary defaults to []) — the direct-caller path.
    const result = emitFhirDefClosure(graph, METADATA, FIXED);
    const err = result.errors.find((e) => e.kind === "decision-root-library-missing");
    expect(err).toBeDefined();
    // The message names the would-be case-feature(s) the lane would have skipped.
    expect(err!.message).toMatch(/would emit case-features/);
    expect(err!.message).toMatch(/no LocalSource layer/);
    // No case-feature StructureDefinition was emitted on this path.
    expect(result.resources.filter((r) => r.resourceType === "StructureDefinition")).toHaveLength(
      0,
    );
    expect(result.success).toBe(false);
  });
});

/* ─── CQL-lane structural split failure surfaced through the FHIR public path ─ */

describe("emitFhirDefFromPath — CQL structural split failures surface (not silently swallowed)", () => {
  const URN_COLLISION = path.join(HERE, "fixtures", "urn-collision", "root.crl");

  it("a `emit-local-codesystem-urn-collision` (clean import graph, empty manifest) is folded into the FHIR result", () => {
    // This is the MCP-path gap the slice-4c review flagged: the CQL lane fails
    // AFTER import resolution with an empty manifest + a clean graph. Without
    // folding, the FHIR lane would single-entry-fallback and report success.
    const result = emitFhirDefFromPath(URN_COLLISION, { date: FIXED_DATE });
    // No import-time error (the collision is a CQL-lane structural error).
    expect(result.importDiagnostics.filter((d) => d.severity === "error")).toEqual([]);
    // The structural CQL error is surfaced + sinks success.
    expect(result.errors.some((e) => e.kind === "emit-local-codesystem-urn-collision")).toBe(true);
    expect(result.success).toBe(false);
  });

  // D2 — `emit-codesystem-url-conflict` is a CQL hard error that is NOT one of
  // the 3 structural-split kinds the pre-D2 allowlist folded, so the FHIR public
  // path (emit_crl_fhir / MCP) used to report a misleading success while the CQL
  // lane failed. The D2 denylist inversion folds it.
  const CODESYSTEM_URL_CONFLICT = path.join(
    HERE,
    "fixtures",
    "codesystem-url-conflict",
    "codesystem-url-conflict.crl",
  );

  it("a `emit-codesystem-url-conflict` (NOT a structural-split kind) is folded into the FHIR result (D2 denylist)", () => {
    const result = emitFhirDefFromPath(CODESYSTEM_URL_CONFLICT, { date: FIXED_DATE });
    // The conflict is a CQL-lane emit error, not an import-time one.
    expect(result.importDiagnostics.filter((d) => d.severity === "error")).toEqual([]);
    // Pre-D2 (allowlist) this kind was dropped → FHIR reported success. Post-D2 it
    // is folded and sinks success.
    expect(result.errors.some((e) => e.kind === "emit-codesystem-url-conflict")).toBe(true);
    expect(result.success).toBe(false);
  });
});
