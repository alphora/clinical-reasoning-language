import { describe, expect, it, vi } from "vitest";

import type { CRL, Location, ReferenceName } from "../../ast/types";
import { buildCRL } from "../../index";
import {
  createPublicationContext,
  PublicationContextError,
  type PublicationConceptLookup,
  type PublicationLibraryInput,
  type PublicationLibraryResolution,
} from "../publicationContext";

// REFACTOR:grounded (#320, plan 557) — these tests establish raw declaration identity and
// authored scope. Existing emit families, inferred shapes and answer options are not resolver rules.

const concept = (name: string): string =>
  `concept "${name}":\n- type is Observation.\n- value type is boolean.\n`;
const terminology = (name: string): string =>
  `terminology "${name}":\n- system is \`https://example.org/codes\`.\n- code is \`a\`.\n`;

function parse(name: string, body: string): CRL {
  const built = buildCRL(`# Publication context fixture\nlibrary "${name}".\n${body}`);
  if (!built.success || built.result === undefined) {
    throw new Error(`Fixture parse failed: ${JSON.stringify(built.errors)}`);
  }
  return built.result;
}

function library(
  sourceIdentity: string,
  name: string,
  body = concept("Value"),
): PublicationLibraryInput {
  return { sourceIdentity, ast: parse(name, body), artifact: {} };
}

function reference(name: string, qualifier?: string): { ref: ReferenceName; location: Location } {
  const spelling = qualifier === undefined ? `"${name}"` : `"${qualifier}"."${name}"`;
  const ast = parse(
    "Referrer",
    `decision "Use":\n- when ${spelling} then recommend activity "Proceed".\n`,
  );
  const decision = ast.statements[0];
  if (decision.type !== "Decision") throw new Error("Expected decision fixture");
  const branch = decision.body.statements[0];
  if (branch.type !== "WhenBlock" || branch.condition.type !== "BranchConditionRef") {
    throw new Error("Expected a single authored guard reference");
  }
  return { ref: branch.condition.ref, location: branch.condition.location };
}

function hit(result: PublicationConceptLookup): Extract<PublicationConceptLookup, { kind: "hit" }> {
  if (result.kind !== "hit") throw new Error(`Expected hit: ${JSON.stringify(result)}`);
  return result;
}

describe("raw publication context", () => {
  it("resolves bare and self-qualified references in the owner before external lookup", () => {
    const owner = library("/owner.crl", "Owner");
    const resolveLibrary = vi.fn((): PublicationLibraryResolution => ({ kind: "missing" }));
    const context = createPublicationContext({ libraries: [owner], resolveLibrary });
    const bare = reference("Value");
    const self = reference("Value", "Owner");
    const first = hit(context.lookupConcept(owner.sourceIdentity, bare.ref, bare.location));
    const second = hit(context.lookupConcept(owner.sourceIdentity, self.ref));
    expect(first.node).toBe(owner.ast.statements[0]);
    expect(second.node).toBe(first.node);
    expect(second.identity).toBe(first.identity);
    expect(first.site.location).toEqual(bare.location);
    expect(second.site.location).toEqual(self.location);
    expect(resolveLibrary).not.toHaveBeenCalled();
  });

  it("uses each owner's callback scope to distinguish a local and package library of the same name", () => {
    const local = library("/local/shared.crl", "Shared");
    const pkg = library("/package/shared.crl", "Shared");
    const resolveLibrary = vi.fn(
      (from: string): PublicationLibraryResolution => ({
        kind: "resolved",
        sourceIdentity: from === "/included.crl" ? pkg.sourceIdentity : local.sourceIdentity,
      }),
    );
    const context = createPublicationContext({
      libraries: [
        library("/included.crl", "Included"),
        library("/local-owner.crl", "LocalOwner"),
        local,
        pkg,
      ],
      resolveLibrary,
    });
    const ref = reference("Value", "Shared").ref;
    expect(hit(context.lookupConcept("/included.crl", ref)).node).toBe(pkg.ast.statements[0]);
    expect(hit(context.lookupConcept("/local-owner.crl", ref)).node).toBe(local.ast.statements[0]);
    expect(resolveLibrary.mock.calls).toEqual([
      ["/included.crl", "Shared"],
      ["/local-owner.crl", "Shared"],
    ]);
  });

  it("allows an explicitly resolved alias to target a different authored library name", () => {
    const context = createPublicationContext({
      libraries: [library("/owner", "Owner"), library("/pkg", "ActualName")],
      resolveLibrary: () => ({ kind: "resolved", sourceIdentity: "/pkg" }),
    });
    expect(
      hit(context.lookupConcept("/owner", reference("Value", "Alias").ref)).identity.libraryName,
    ).toBe("ActualName");
  });

  it("does not bypass missing or not-visible callback outcomes with a global same-name hit", () => {
    for (const kind of ["missing", "not-visible"] as const) {
      const context = createPublicationContext({
        libraries: [library("/owner", "Owner"), library("/pkg", "Shared")],
        resolveLibrary: () => ({
          kind,
          sourceIdentity: "/pkg",
          detail: "include-required",
          message: "Package library was not included.",
        }),
      });
      const ref = reference("Value", "Shared");
      expect(context.lookupConcept("/owner", ref.ref)).toMatchObject({
        kind,
        targetSourceIdentity: "/pkg",
        detail: "include-required",
        message: "Package library was not included.",
        site: { fromSourceIdentity: "/owner", reference: ref.ref, location: ref.location },
        ...(kind === "missing" ? { reason: "library" } : {}),
      });
    }
  });

  it("distinguishes a missing library from a resolved target outside the supplied context", () => {
    const context = createPublicationContext({
      libraries: [library("/owner", "Owner")],
      resolveLibrary: (_from, qualifier) =>
        qualifier === "Unknown"
          ? { kind: "missing" }
          : { kind: "resolved", sourceIdentity: "/outside" },
    });
    expect(context.lookupConcept("/owner", reference("Value", "Unknown").ref)).toMatchObject({
      kind: "missing",
      reason: "library",
    });
    expect(context.lookupConcept("/owner", reference("Value", "Known").ref)).toMatchObject({
      kind: "outside-context",
      targetSourceIdentity: "/outside",
    });
  });

  it("retains an adapter's explicit outside-context reason", () => {
    const context = createPublicationContext({
      libraries: [library("/owner", "Owner")],
      resolveLibrary: () => ({
        kind: "outside-context",
        sourceIdentity: "/excluded",
        detail: "FHIR-only subset",
      }),
    });
    expect(context.lookupTerminology("/owner", reference("Codes", "Shared").ref)).toMatchObject({
      kind: "outside-context",
      targetSourceIdentity: "/excluded",
      detail: "FHIR-only subset",
    });
  });

  it("reports an unknown owner before asking an unrelated scope to resolve a foreign name", () => {
    const resolveLibrary = vi.fn(
      (): PublicationLibraryResolution => ({ kind: "resolved", sourceIdentity: "/owner" }),
    );
    const context = createPublicationContext({
      libraries: [library("/owner", "Owner")],
      resolveLibrary,
    });
    expect(context.lookupConcept("/absent", reference("Value", "Owner").ref)).toMatchObject({
      kind: "missing",
      reason: "owner-library",
      site: { fromSourceIdentity: "/absent" },
    });
    expect(resolveLibrary).not.toHaveBeenCalled();
  });

  it("keeps concept and terminology namespaces separate when their names coincide", () => {
    const input = library("/owner", "Owner", concept("Shared") + terminology("Shared"));
    const context = createPublicationContext({
      libraries: [input],
      resolveLibrary: () => ({ kind: "missing" }),
    });
    const c = hit(context.lookupConcept("/owner", "Shared"));
    const t = context.lookupTerminology("/owner", "Shared");
    expect(t.kind).toBe("hit");
    if (t.kind !== "hit") throw new Error("Expected terminology hit");
    expect(c.node).toBe(input.ast.statements[0]);
    expect(t.node).toBe(input.ast.statements[1]);
    expect(t.identity.terminologyName).toBe("Shared");
    expect(t.identity.key).not.toBe(c.identity.key);
  });

  it("distinguishes an absent declaration from a declaration of the wrong kind", () => {
    const context = createPublicationContext({
      libraries: [
        library(
          "/owner",
          "Owner",
          concept("Value") +
            terminology("Codes") +
            'activity "Do":\n- request CPGImmunizationRequest.\n',
        ),
      ],
      resolveLibrary: () => ({ kind: "missing" }),
    });
    expect(context.lookupConcept("/owner", "Absent")).toMatchObject({
      kind: "missing",
      reason: "declaration",
      targetSourceIdentity: "/owner",
    });
    expect(context.lookupConcept("/owner", "Codes")).toMatchObject({
      kind: "wrong-kind",
      expectedKind: "Concept",
      actualKinds: ["Terminology"],
    });
    expect(context.lookupTerminology("/owner", "Value")).toMatchObject({
      kind: "wrong-kind",
      expectedKind: "Terminology",
      actualKinds: ["Concept"],
    });
    expect(context.lookupConcept("/owner", "Do")).toMatchObject({
      kind: "wrong-kind",
      actualKinds: ["Activity"],
    });
  });

  it("reports duplicate declarations as ambiguous without selecting the last declaration", () => {
    const input = library(
      "/owner",
      "Owner",
      concept("Value") + concept("Value") + terminology("Codes") + terminology("Codes"),
    );
    const context = createPublicationContext({
      libraries: [input],
      resolveLibrary: () => ({ kind: "missing" }),
    });
    for (const [result, indexes] of [
      [context.lookupConcept("/owner", "Value"), [0, 1]],
      [context.lookupTerminology("/owner", "Codes"), [2, 3]],
    ] as const) {
      expect(result).toMatchObject({ kind: "ambiguous", targetSourceIdentity: "/owner" });
      if (result.kind !== "ambiguous") throw new Error("Expected ambiguity");
      expect(result.declarationLocations).toEqual(
        indexes.map((index) => input.ast.statements[index].location),
      );
    }
  });

  it("rejects duplicate source keys and conflicting names atomically", () => {
    for (const otherName of ["Owner", "Different"]) {
      let caught: unknown;
      try {
        createPublicationContext({
          libraries: [library("/same", "Owner"), library("/same", otherName)],
          resolveLibrary: () => ({ kind: "missing" }),
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(PublicationContextError);
      if (!(caught instanceof PublicationContextError))
        throw new Error("Expected context rejection");
      expect(caught.diagnostics).toMatchObject([
        {
          kind: otherName === "Owner" ? "duplicate-source-identity" : "library-name-mismatch",
          sourceIdentity: "/same",
          libraryNames: ["Owner", otherName],
        },
      ]);
      expect(caught.diagnostics[0].declarationLocations).toHaveLength(2);
    }
  });

  it("keys identical declaration spellings by source identity with collision-safe tuple boundaries", () => {
    const context = createPublicationContext({
      libraries: [
        library("A B", "Shared", concept("C")),
        library("A", "Shared", concept("B C")),
        library("other", "Shared", concept("C")),
      ],
      resolveLibrary: () => ({ kind: "missing" }),
    });
    const identities = [
      hit(context.lookupConcept("A B", "C")).identity,
      hit(context.lookupConcept("A", "B C")).identity,
      hit(context.lookupConcept("other", "C")).identity,
    ];
    expect(new Set(identities.map((identity) => identity.key)).size).toBe(3);
    expect(JSON.parse(identities[0].key)).toEqual(["Concept", "A B", "Shared", "C"]);
  });

  it("preserves absent package/version metadata and copies owning artifact metadata", () => {
    const root = {
      ...library("/root", "Root"),
      packageIdentity: { name: "root", version: "9.0.0" },
    };
    const dependency = {
      ...library("/dependency", "Dependency"),
      packageIdentity: { name: "dependency" },
      artifact: {
        policyId: "owned-policy",
        canonicalBase: "https://example.org",
        localDomainId: "owned-domain",
      },
    };
    const noPackage = library("/anonymous-package", "NoPackage");
    const context = createPublicationContext({
      libraries: [root, dependency, noPackage],
      resolveLibrary: () => ({ kind: "missing" }),
    });
    expect(hit(context.lookupConcept("/root", "Value")).identity.packageIdentity).toEqual(
      root.packageIdentity,
    );
    const dependencyHit = hit(context.lookupConcept("/dependency", "Value"));
    expect(dependencyHit.identity.packageIdentity).toEqual({ name: "dependency" });
    expect(
      Object.prototype.hasOwnProperty.call(dependencyHit.identity.packageIdentity ?? {}, "version"),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(
        hit(context.lookupConcept("/anonymous-package", "Value")).identity,
        "packageIdentity",
      ),
    ).toBe(false);
    dependency.artifact.policyId = "changed-after-preparation";
    dependency.packageIdentity.name = "changed-after-preparation";
    expect(dependencyHit.library.artifact.policyId).toBe("owned-policy");
    expect(dependencyHit.identity.packageIdentity?.name).toBe("dependency");
  });

  it("caches qualifier resolution once per owner across declaration kinds and retains each use site", () => {
    const response = { kind: "resolved" as const, sourceIdentity: "/shared" };
    const resolveLibrary = vi.fn(() => response);
    const context = createPublicationContext({
      libraries: [
        library("/one", "One"),
        library("/two", "Two"),
        library("/shared", "Shared", concept("Value") + terminology("Codes")),
      ],
      resolveLibrary,
    });
    const c = reference("Value", "Shared");
    const t = reference("Codes", "Shared");
    expect(context.lookupConcept("/one", c.ref).kind).toBe("hit");
    response.sourceIdentity = "/not-in-context";
    expect(context.lookupTerminology("/one", t.ref)).toMatchObject({
      kind: "hit",
      site: { reference: t.ref, location: t.location },
    });
    expect(context.lookupConcept("/one", reference("Missing", "Shared").ref).kind).toBe("missing");
    expect(context.lookupConcept("/two", c.ref).kind).toBe("outside-context");
    expect(resolveLibrary.mock.calls).toEqual([
      ["/one", "Shared"],
      ["/two", "Shared"],
    ]);
  });

  it("also caches refusal without losing the individual authored reference location", () => {
    const resolveLibrary = vi.fn(
      (): PublicationLibraryResolution => ({ kind: "not-visible", detail: "include-required" }),
    );
    const context = createPublicationContext({
      libraries: [library("/owner", "Owner")],
      resolveLibrary,
    });
    const a = reference("A", "Foreign");
    const b = reference("Longer Name", "Foreign");
    expect(context.lookupConcept("/owner", a.ref)).toMatchObject({
      kind: "not-visible",
      site: { location: a.location },
    });
    expect(context.lookupTerminology("/owner", b.ref)).toMatchObject({
      kind: "not-visible",
      site: { location: b.location },
    });
    expect(resolveLibrary).toHaveBeenCalledTimes(1);
  });

  it("exposes immutable metadata and enumeration without mutating or freezing caller ASTs", () => {
    const input = library("/owner", "Owner");
    const before = JSON.stringify(input.ast);
    const context = createPublicationContext({
      libraries: [input],
      resolveLibrary: () => ({ kind: "missing" }),
    });
    const result = hit(context.lookupConcept("/owner", "Value", input.ast.statements[0].location));
    expect(context.getLibrary("/owner")).toBe(result.library);
    expect(context.getLibrary("/absent")).toBeUndefined();
    expect(context.getLibraries()).toEqual([result.library]);
    for (const object of [
      context,
      context.getLibraries(),
      result,
      result.library,
      result.library.artifact,
      result.identity,
      result.site,
      result.site.location,
      result.site.location?.start,
    ]) {
      expect(Object.isFrozen(object)).toBe(true);
    }
    expect(Reflect.set(result.identity, "conceptName", "Other")).toBe(false);
    expect(Object.isFrozen(input.ast)).toBe(false);
    expect(Object.isFrozen(input.ast.statements)).toBe(false);
    expect(Object.isFrozen(result.node)).toBe(false);
    expect(Object.isFrozen(input.ast.statements[0].location)).toBe(false);
    expect(JSON.stringify(input.ast)).toBe(before);
    expect(hit(context.lookupConcept("/owner", "Value")).identity.conceptName).toBe("Value");
  });
});
