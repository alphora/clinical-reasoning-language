// #224 ii.1c — end-to-end CQL emit through the PUBLIC entry (`emitCQLImports`) over a
// decision whose guard references a `criterion`. This exercises the emit-family seams that
// run OUTSIDE the FHIR decision lane — the CQL emit closure (S6, `computeCqlEmitClosure`) and
// the Interface re-export surface (S8, `interfaceSurface`) — proving they EXPAND the guard
// (never trip the un-expanded-criterion tripwire) and that a concept referenced only via the
// criterion body still surfaces on the Interface. Also proves the C1 fix: an envelope-
// breaching criterion is a STRUCTURED error at this boundary, never an uncaught throw.

import { writeFileSync, mkdtempSync, rmSync } from "fs";
import * as os from "os";
import * as path from "path";

import { describe, it, expect } from "vitest";

import { emitCQLImports } from "../emit";
import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";

const ACTIVITIES = `activity "Act":
- request CPGServiceRequest.
- with \`ok\`.
activity "No":
- request CPGCommunicationRequest.
- with \`no\`.`;

// A decision-bearing `code is` policy (→ the layered split path, which runs interfaceSurface)
// whose guard is a criterion; "Gate Concept" is referenced ONLY through the criterion body.
const POLICY = `# Policy
library "Policy".
concept "Gate Concept":
- type is Observation.
- code is \`gate\`.
criterion "Eligible":
- when ( "Gate Concept" ).
decision "PolicyDec":
first:
- when "Eligible" then recommend activity "Act".
- otherwise then recommend activity "No".
${ACTIVITIES}`;

// Doubling-chain criterion C0..C10: C0 = Gate and Gate (2 atoms); C_k = C_{k-1} and C_{k-1}
// → 2^(k+1). C10 materializes 2048 leaves > the 1024 atom cap.
function overflowPolicy(): string {
  const criteria = [`criterion "C0":\n- when ( "Gate Concept" and "Gate Concept" ).`];
  for (let k = 1; k <= 10; k++) criteria.push(`criterion "C${k}":\n- when ( "C${k - 1}" and "C${k - 1}" ).`);
  return `# Policy
library "Policy".
concept "Gate Concept":
- type is Observation.
- code is \`gate\`.
${criteria.join("\n")}
decision "PolicyDec":
first:
- when "C10" then recommend activity "Act".
- otherwise then recommend activity "No".
${ACTIVITIES}`;
}

// The hand-inlined twin of POLICY: NO criterion declaration; the guard is written inline as
// `when ( "Gate Concept" )`. Otherwise byte-identical — so any emit divergence is the
// criterion machinery (classify → table-build → expand), which AST-constructed parity cannot
// see (it bypasses builder classification + lowering).
const POLICY_INLINE = `# Policy
library "Policy".
concept "Gate Concept":
- type is Observation.
- code is \`gate\`.
decision "PolicyDec":
first:
- when ( "Gate Concept" ) then recommend activity "Act".
- otherwise then recommend activity "No".
${ACTIVITIES}`;

function withPolicy<T>(policySrc: string, fn: (root: string) => T): T {
  const root = mkdtempSync(path.join(os.tmpdir(), "crit-cql-"));
  try {
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "policy",
        version: "0.0.0",
        private: true,
        crl: { canonicalBase: "http://example.org/x", date: "2026-06-04" },
      }),
    );
    writeFileSync(path.join(root, "policy.crl"), policySrc);
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("#224 ii.1c — criterion CQL emit (closure + interface surface)", () => {
  it("emits successfully and re-exports the criterion-only concept on the INTERFACE library", () => {
    withPolicy(POLICY, (root) => {
      const result = emitCQLImports(path.join(root, "policy.crl"));
      // Success proves S6 (computeCqlEmitClosure) + S8 (interfaceSurface) EXPANDED the
      // criterion guard rather than throwing the un-expanded-criterion tripwire.
      expect(result.success).toBe(true);
      // Assert specifically the INTERFACE library (`PolicyInterface`) re-exports the
      // criterion-body concept — NOT merely that some LocalSource library mentions the name
      // (which would pass trivially). The re-export existing proves S8 followed the criterion.
      const iface = result.cqlByLibrary.find((e) => e.libraryName === "PolicyInterface")?.cql ?? "";
      expect(iface).toContain("Gate Concept");
    });
  });

  it("an envelope-breaching criterion is a STRUCTURED error at the boundary, not a crash (C1)", () => {
    withPolicy(overflowPolicy(), (root) => {
      // Must not throw out of the public API (the pre-fix behavior was an uncaught
      // CriterionExpansionError from interfaceSurface).
      const result = emitCQLImports(path.join(root, "policy.crl"));
      expect(result.success).toBe(false);
      const overflow = (result.errors ?? []).find((e) => e.kind === "criterion-expansion-overflow");
      expect(overflow).toBeDefined();
      // Message READABILITY (disc 305): the CQL-lane diagnostic names the decision and states the
      // materialized-tree resource boundary (a `kind`-only assertion lets the message rot).
      // Wording is UNIFIED with the FHIR lane (disc 305 follow-up): "materialized tree exceeds the
      // criterion-expansion envelope".
      expect(overflow!.message).toContain("PolicyDec");
      expect(overflow!.message).toContain("materialized tree");
    });
  });
});

// ── ii.2 Battery 1 — PARSE-DRIVEN parity (the full pipeline, not just the emitter) ──
// AST-constructed parity (criterionEmit.test.ts) bypasses builder classification + lowering.
// A classification bug (a criterion ref left as a concept ref → silent cascade-suppression) is
// invisible to it. Driving two REAL `.crl` files (criterion vs hand-inlined) through the public
// emit entries proves the integrated classify → table-build → expand → emit chain does not
// desync. The hand-inlined twin has NO criterion declaration, so full-output parity ALSO proves
// "the emitter emits NOTHING for a Criterion statement" for free (a restored locked-scope item).
describe("#224 ii.2 — parse-driven emit parity (criterion vs hand-inlined)", () => {
  it("CQL lane: emitCQLImports over a criterion doc == over the hand-inlined doc (+ emits-nothing)", () => {
    const via = withPolicy(POLICY, (root) => emitCQLImports(path.join(root, "policy.crl")));
    const inl = withPolicy(POLICY_INLINE, (root) => emitCQLImports(path.join(root, "policy.crl")));
    expect(via.success).toBe(true);
    expect(inl.success).toBe(true);
    // A decision guard NEVER lowers to CQL and a Criterion statement emits nothing → the full
    // per-library emit is IDENTICAL. NORMALIZER DISCIPLINE (disc 305): compare the WHOLE
    // PerLibraryEmit — including the split-manifest fields the FHIR follow-up consumes
    // (`outputFilename`, `sourceLibraryName`, and any role/includes) — dropping ONLY `filePath`
    // (the absolute temp-dir path, the one field that legitimately differs). A projection to
    // `{libraryName, cql}` would hide a criterion-induced manifest divergence.
    const norm = (r: typeof via) =>
      [...r.cqlByLibrary]
        .map(({ filePath: _filePath, ...rest }) => rest)
        .sort((a, b) => a.libraryName.localeCompare(b.libraryName));
    expect(norm(via)).toEqual(norm(inl));
  });

  it("FHIR lane: emitFhirDefFromPath over a criterion doc == over the hand-inlined doc (+ emits-nothing)", () => {
    const via = withPolicy(POLICY, (root) => emitFhirDefFromPath(path.join(root, "policy.crl")));
    const inl = withPolicy(POLICY_INLINE, (root) => emitFhirDefFromPath(path.join(root, "policy.crl")));
    expect(via.success).toBe(true);
    expect(inl.success).toBe(true);
    // NORMALIZER DISCIPLINE (disc 305): the ONLY legitimate divergence is the `location` source
    // span (the criterion declaration shifts line numbers by 2), which rides on the resource
    // WRAPPER, NOT the FHIR content. Prove that precisely: (1) the FHIR content (`.resource`,
    // which carries no source span) is EXACTLY equal — the criterion decl contributes no resource
    // and the expanded guard emits the same structure; (2) the wrappers match too once ONLY the
    // top-level `location` key is dropped — asserting `location` is the SOLE differing field
    // (not a recursive strip that could hide a real nested divergence).
    expect(via.resources.map((w) => (w as { resource: unknown }).resource)).toEqual(
      inl.resources.map((w) => (w as { resource: unknown }).resource),
    );
    const dropWrapperLocation = (ws: unknown[]) =>
      ws.map((w) => {
        const { location: _location, ...rest } = w as Record<string, unknown>;
        return rest;
      });
    expect(dropWrapperLocation(via.resources)).toEqual(dropWrapperLocation(inl.resources));
  });

  it("FHIR emit is DETERMINISTIC under a fixed date (repeated emit byte-identical)", () => {
    // Design v2 Battery 5: the emit-side determinism is the one with a real failure mode (a
    // publication timestamp leaking wall-clock). Same source + fixed `crl.date` → fully identical
    // resources across runs (the temp dir differs but never rides the resources — canonicalBase
    // is fixed).
    const r1 = withPolicy(POLICY, (root) => emitFhirDefFromPath(path.join(root, "policy.crl")));
    const r2 = withPolicy(POLICY, (root) => emitFhirDefFromPath(path.join(root, "policy.crl")));
    expect(JSON.stringify(r1.resources)).toEqual(JSON.stringify(r2.resources));
  });
});
