// #224 ii.2 Battery 2 (positive PRESENCE matrix) + Battery 6 (cross-lane coherence).
//
// The tripwire's safety argument (an un-expanded `BranchConditionCriterionRef` reaching a
// SEMANTIC consumer throws) is proven two-sided: the STRICT-lane NEGATIVES live in
// criterionClassify.test.ts (the 3 collector sites) + criterionEval.test.ts (the eval site);
// this file is the POSITIVE half — for a valid criterion doc, every PUBLIC entry EXPANDS the
// guard (no throw) AND the criterion-only atoms are PRESENT in its output.
//
// ⚠ Polarity (disc 304): "no-throw + criterion-free" passes TRIVIALLY on a mis-wired SOFT lane
// (it silently DROPS the atoms). So the SOFT lanes (provenance follow-walk, CQL interface,
// FHIR case-features) assert ATOM PRESENCE — a concept reachable ONLY through a criterion body
// must appear — not merely the absence of a tripwire node.

import { writeFileSync, mkdtempSync, rmSync } from "fs";
import * as os from "os";
import * as path from "path";

import { describe, it, expect } from "vitest";

import { resolveCelImports } from "../../cel/imports";
import { runCel } from "../../cre/run";
import { renderScenario } from "../../cre/viewModel";
import { emitCQLImports } from "../emit";
import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
import { buildProvenanceIndex } from "../../provenance/indexer";
import { buildCrlStructure } from "../../provenance/crlStructure";
import { generateProvenanceScaffold } from "../../provenance/generate";
import type { AnchorSourceMeta } from "../../provenance/artifact";
import type { ProvNodeRef } from "../../provenance/indexer";

// A composed policy reaching every seam: "Gate Concept" is referenced ONLY through a criterion
// body (`Inner`); `Eligible` NESTS `Inner`; `Eligible` is used TWICE; one use is a
// USE-DECISION body. So expansion must run in the CQL closure, the interface surface, the FHIR
// decision + case-feature collection, and all three provenance callers.
const POLICY = `# Policy
library "Policy".
concept "Gate Concept":
- type is Observation.
- code is \`gate\`.
- shape is RecordSet.
concept "Other":
- type is Observation.
- code is \`other\`.
- shape is RecordSet.
criterion "Inner":
- when ( "Gate Concept" ).
criterion "Eligible":
- when ( "Other" and "Inner" ).
decision "PolicyDec":
first:
- when "Eligible" then use decision "Sub".
- when "Eligible" then recommend activity "Act".
- otherwise then recommend activity "No".
decision "Sub":
first:
- when "Other" then recommend activity "Act".
- otherwise then recommend activity "No".
activity "Act":
- request CPGServiceRequest.
- with \`ok\`.
activity "No":
- request CPGCommunicationRequest.
- with \`no\`.`;

const CEL = `# C
library "C".
covers "Policy".
fact "Pat":
- name is "Pat".
- defined by "Patient".
fact "fGate":
- defined by "Policy"."Gate Concept".
fact "fOther":
- defined by "Policy"."Other".
case "c":
- subject is "Pat".
- fact is "fGate".
- fact is "fOther".
- result is "PolicyDec" is "Act".
case "noGate":
- subject is "Pat".
- fact is "fOther".
- result is "PolicyDec" is "No".`;

const META: AnchorSourceMeta = {
  path: "anchor.txt",
  derivedFrom: "x.docx",
  derivedFromHash: "sha256:0",
  canonicalizer: "crl-anchor-docx-text",
  canonicalizerVersion: "1.0.0",
  textHash: "sha256:0",
  offsetUnit: "utf8-byte",
  unicodeNormalization: "NFC",
  rangeConvention: "half-open",
};

function withFixture<T>(policySrc: string, fn: (paths: { crl: string; cel: string }) => T, celSrc: string = CEL): T {
  const root = mkdtempSync(path.join(os.tmpdir(), "crit-tw-"));
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
    const crl = path.join(root, "policy.crl");
    const cel = path.join(root, "f.cel");
    writeFileSync(crl, policySrc);
    writeFileSync(cel, celSrc);
    return fn({ crl, cel });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const gateRef = (name: string): ProvNodeRef => ({ lib: "Policy", kind: "concept", name });

// Recursively collect every concept name appearing in a rendered guard-expression tree. #236: a
// criterion ref renders as an `op:"criterion"` node whose concept leaves live under `body` (first
// occurrence); a `not` under `operand`. Walk all three (`operands`/`operand`/`body`) so a concept
// reachable only through a criterion body is still found.
function conceptNamesIn(expr: unknown): string[] {
  if (!expr || typeof expr !== "object") return [];
  const e = expr as { concept?: { name?: string }; operands?: unknown[]; operand?: unknown; body?: unknown };
  const here = e.concept?.name ? [e.concept.name] : [];
  const kids = Array.isArray(e.operands) ? e.operands.flatMap(conceptNamesIn) : [];
  const operandKid = e.operand ? conceptNamesIn(e.operand) : [];
  const bodyKid = e.body ? conceptNamesIn(e.body) : [];
  return [...here, ...kids, ...operandKid, ...bodyKid];
}

describe("#224 ii.2 — every public entry FOLLOWS the criterion + the criterion-only atom is PRESENT", () => {
  it("runCel — no throw; the criterion-only concept COUNTERFACTUALLY gates the result (PRESENCE)", () => {
    withFixture(POLICY, ({ cel }) => {
      const runs = runCel(resolveCelImports(cel)).runs;
      // Both cases resolve to their EXPECTED result: "c" (Gate + Other present) → Eligible holds
      // → delegates to Sub → Act; "noGate" (Gate ABSENT) → Eligible fails → otherwise → No.
      // The counterfactual is the real presence proof: removing the criterion-only Gate concept
      // FLIPS the disposition — a vacuous-true expansion or a dropped atom would keep "c" passing
      // but would ALSO wrongly pass "noGate" as Act (it expects No).
      expect(runs.map((r) => `${r.case}:${r.status}`).sort()).toEqual(["c:pass", "noGate:pass"]);
    });
  });

  it("renderScenario — no throw; the criterion-only concept appears in the rendered guard tree (PRESENCE)", () => {
    withFixture(POLICY, ({ cel }) => {
      const render = renderScenario(resolveCelImports(cel));
      expect(render.success).toBe(true);
      expect(render.errorCount).toBe(0);
      // A silent zip-degrade produces an unevaluated leaf, NOT an error — so success/errorCount
      // alone is vacuous. Assert the criterion-only Gate concept is an actual leaf in the zipped
      // guard tree of case "c" (proving renderScenario expanded + zipped the criterion body).
      const c = render.scenarios.find((s) => s.case.name === "c")!;
      const guardNames = c.tree.flatMap((row) =>
        conceptNamesIn((row as { condition?: { expr?: unknown } }).condition?.expr),
      );
      expect(guardNames).toContain("Gate Concept");
    });
  });

  it("emitCQLImports — no throw; the criterion-only concept is re-exported on the Interface (PRESENCE)", () => {
    withFixture(POLICY, ({ crl }) => {
      const result = emitCQLImports(crl);
      expect(result.success).toBe(true);
      const iface = result.cqlByLibrary.find((e) => e.libraryName === "PolicyInterface")?.cql ?? "";
      // Reachable ONLY via `Inner`'s body — its presence proves S6/S8 FOLLOWED the criterion.
      expect(iface).toContain("Gate Concept");
    });
  });

  it("emitFhirDefFromPath — no throw; the criterion-only concept reaches a case-feature StructureDefinition (PRESENCE)", () => {
    withFixture(POLICY, ({ crl }) => {
      const result = emitFhirDefFromPath(crl);
      expect(result.success).toBe(true);
      // PRESENCE must be in a StructureDefinition (the case-feature surface), not merely the
      // CodeSystem (which emits for the declared concept REGARDLESS of the guard — emitter emits
      // all declared). Reaching the case-feature SD proves the FHIR case-feature collection
      // followed the criterion into `Inner`'s body (silent-drop would leave the SD without it).
      const inStructDef = (result.resources as Array<{ resourceType?: string }>)
        .filter((r) => r.resourceType === "StructureDefinition")
        .some((r) => JSON.stringify(r).includes("Gate Concept"));
      expect(inStructDef).toBe(true);
    });
  });

  it("buildProvenanceIndex — no throw; the criterion-only concept is decision-REACHED (PRESENCE)", () => {
    withFixture(POLICY, ({ cel }) => {
      const idx = buildProvenanceIndex(resolveCelImports(cel));
      // Silent-drop would make this false: the follow-walk must reach Gate through Inner.
      expect(idx.isDecisionReached(gateRef("Gate Concept"))).toBe(true);
    });
  });

  it("buildCrlStructure — no throw; a guard row bridges to the criterion-only concept (PRESENCE)", () => {
    withFixture(POLICY, ({ cel }) => {
      const structs = buildCrlStructure(resolveCelImports(cel));
      const whenRows = structs.flatMap((s) => s.children).filter((n) => n.kind === "when");
      expect(whenRows.some((r) => r.refKeys.some((k) => k.includes("Gate Concept")))).toBe(true);
    });
  });

  it("generateProvenanceScaffold — no throw; the criterion-only concept appears in the scaffold (independent caller, PRESENCE)", () => {
    withFixture(POLICY, ({ cel }) => {
      // generate.ts calls the follow-walk INDEPENDENTLY of the indexer (disc 304 Claude #3) —
      // a 7th entry, not covered by the buildProvenanceIndex row.
      const r = generateProvenanceScaffold(resolveCelImports(cel), {
        policyId: "P",
        policyVersion: "1",
        anchorSource: META,
        celFileName: "f.cel",
      });
      const crlRefs = JSON.stringify(r.artifact.clusters.flatMap((c) => c.crl));
      expect(crlRefs).toContain("Gate Concept");
    });
  });
});

// #236 — Battery 6 (cross-lane coherence on an envelope-BREACHING criterion) is RETIRED. Its whole
// premise — a doubling criterion whose MATERIALIZED tree exceeds the atom cap, producing a
// `criterion-expansion-overflow` disposition (FHIR per-guard suppression, CQL structured error,
// provenance INLINE-only fallback) — no longer exists: post-flip a criterion is emitted ONCE as a
// named define reference and NEVER materialized, so a doubling DAG emits LINEARLY with no cap. The
// positive coverage (a doubling-DAG criterion doc emits cleanly across every lane, and its
// criterion-only atoms stay reached) lives in the criterionEmitEndToEnd + Step J acceptance battery.
