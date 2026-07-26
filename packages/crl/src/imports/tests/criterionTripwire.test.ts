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
concept "Other":
- type is Observation.
- code is \`other\`.
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
- code is "http://e|gate".
- defined by "Policy"."Gate Concept".
fact "fOther":
- code is "http://e|other".
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

// An envelope-breaching variant for Battery 6. The guard is `"Inline Gate" and "C10"` where
// "Inline Gate" is a directly-referenced concept and C10 is a doubling criterion whose
// materialized tree exceeds the atom cap. The inline concept is what makes the provenance
// FALLBACK observable EXACT (disc 305): on overflow the source-side follow-walk returns the
// INLINE refs only (skipping criterion refs), so "Inline Gate" must stay reached while the
// criterion-only "Gate Concept" is under-reported — a broken impl returning [] fails the
// positive control.
function overflowPolicy(): string {
  const criteria = [`criterion "C0":\n- when ( "Gate Concept" and "Gate Concept" ).`];
  for (let k = 1; k <= 10; k++) criteria.push(`criterion "C${k}":\n- when ( "C${k - 1}" and "C${k - 1}" ).`);
  return `# Policy
library "Policy".
concept "Gate Concept":
- type is Observation.
- code is \`gate\`.
concept "Inline Gate":
- type is Observation.
- code is \`inline\`.
${criteria.join("\n")}
decision "PolicyDec":
first:
- when ( "Inline Gate" and "C10" ) then recommend activity "Act".
- otherwise then recommend activity "No".
activity "Act":
- request CPGServiceRequest.
- with \`ok\`.
activity "No":
- request CPGCommunicationRequest.
- with \`no\`.`;
}

// A matching CEL for the overflow policy (its concepts are Gate Concept + Inline Gate — the
// composed CEL above references "Other", which the overflow policy does NOT declare).
const OVERFLOW_CEL = `# C
library "C".
covers "Policy".
fact "Pat":
- name is "Pat".
- defined by "Patient".
fact "fInline":
- code is "http://e|inline".
- defined by "Policy"."Inline Gate".
case "c":
- subject is "Pat".
- fact is "fInline".
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

// Recursively collect every concept name appearing in a rendered guard-expression tree.
function conceptNamesIn(expr: unknown): string[] {
  if (!expr || typeof expr !== "object") return [];
  const e = expr as { concept?: { name?: string }; operands?: unknown[] };
  const here = e.concept?.name ? [e.concept.name] : [];
  const kids = Array.isArray(e.operands) ? e.operands.flatMap(conceptNamesIn) : [];
  return [...here, ...kids];
}

describe("#224 ii.2 — tripwire POSITIVE matrix: every public entry expands + the criterion-only atom is PRESENT", () => {
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

// ── ii.2 Battery 6 — cross-lane COHERENCE on a single overflow doc ────────────────
// No single-lane disposition test catches INTER-lane incoherence (an SD/input emitted for a
// branch the emit lane suppressed). One overflow doc — guard `"Inline Gate" and "C10"` — driven
// through every lane, must show a COHERENT joint disposition: FHIR suppresses the branch with
// nothing dangling; CQL is a structured error naming the decision; provenance falls back to the
// INLINE refs only (Inline Gate stays reached; the criterion-only Gate Concept is under-reported).
describe("#224 ii.2 — cross-lane coherence on an envelope-breaching criterion", () => {
  it("FHIR suppresses the branch with nothing dangling; CQL structured-errors; provenance falls back EXACTLY", () => {
    withFixture(
      overflowPolicy(),
      ({ crl, cel }) => {
        // FHIR lane: the overflow is diagnosed and the OFFENDING BRANCH is suppressed (the
        // decision's surviving `otherwise` may still emit — this is per-guard suppression, NOT a
        // whole-decision failure).
        const fhir = emitFhirDefFromPath(crl);
        expect(fhir.errors.map((e) => e.kind)).toContain("criterion-expansion-overflow");

        // PER-GUARD (not whole-decision) suppression: the PolicyDec PlanDefinition SURVIVES and
        // carries its `otherwise` → "No" branch, while the overflowing `Act` branch is gone. A
        // regression to whole-decision (or whole-closure) suppression would make "nothing
        // dangles" trivially true — this assertion rules that out.
        const policyDec = (fhir.resources as Array<{ resource?: { id?: string } }>).find(
          (w) => w.resource?.id === "policy-policydec",
        );
        expect(policyDec).toBeDefined();
        const policyDecJson = JSON.stringify(policyDec);
        expect(policyDecJson).toContain("policy-no-recommendation"); // otherwise survives
        expect(policyDecJson).not.toContain("policy-act-recommendation"); // overflowing branch suppressed

        // NOTHING DANGLES: no PlanDefinition guard / case-feature StructureDefinition survives for
        // EITHER guard atom of the suppressed branch. The probe checks BOTH the display string
        // (carried in SD content + PD `cpg-input-text`/`-description`) AND the slugged canonical
        // (SD `url`/`id` + PD `action.input.profile`, e.g. `policy-gate-concept`) — a display-only
        // probe would miss a profile-canonical dangle. The concepts' own CodeSystem/Library
        // terminology still emits (emitter emits all declared) — NOT a dangle — so scope to PD+SD.
        const guardSurfaces = (fhir.resources as Array<{ resourceType?: string }>)
          .filter((r) => r.resourceType === "PlanDefinition" || r.resourceType === "StructureDefinition")
          .map((r) => JSON.stringify(r))
          .join("");
        for (const needle of ["Gate Concept", "policy-gate-concept", "Inline Gate", "policy-inline-gate"]) {
          expect(guardSurfaces.includes(needle)).toBe(false); // nothing dangles (display + slug)
        }

        // CQL lane: a STRUCTURED error at the boundary (never an uncaught throw) whose MESSAGE
        // names the decision and states the materialized-tree resource boundary (readability).
        const cql = emitCQLImports(crl);
        expect(cql.success).toBe(false);
        const cqlOverflow = (cql.errors ?? []).find((e) => e.kind === "criterion-expansion-overflow");
        expect(cqlOverflow).toBeDefined();
        expect(cqlOverflow!.message).toContain("PolicyDec");
        expect(cqlOverflow!.message).toContain("materialized-tree");

        // Provenance lane: FALLBACK-EXACT. The source-side follow-walk returns the INLINE refs
        // only, so "Inline Gate" (a real inline atom) stays reached — the POSITIVE CONTROL that
        // rules out a degenerate always-false index — while the criterion-only "Gate Concept" is
        // under-reported (its documented degrade).
        const idx = buildProvenanceIndex(resolveCelImports(cel));
        expect(idx.isDecisionReached(gateRef("Inline Gate"))).toBe(true);
        expect(idx.isDecisionReached(gateRef("Gate Concept"))).toBe(false);
      },
      OVERFLOW_CEL,
    );
  });
});
