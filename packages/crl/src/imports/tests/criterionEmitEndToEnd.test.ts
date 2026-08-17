// #224 ii.1c — end-to-end CQL emit through the PUBLIC entry (`emitCQLImports`) over a
// decision whose guard references a `criterion`. This exercises the emit-family seams that
// run OUTSIDE the FHIR decision lane — the CQL emit closure (S6, `computeCqlEmitClosure`) and
// the Interface re-export surface (S8, `interfaceSurface`).
//
// #236 flip: a criterion no longer inline-EXPANDS into each guard that references it. It lowers
// ONCE to a named boolean CQL `define`, and every guard references it BY NAME
// (`text/cql-identifier`). So the assertions here are the define-reference semantics:
//   - the Interface library carries a `define "<criterion>"` (the boolean surface);
//   - a concept reachable ONLY through the criterion body still re-exports on the Interface and
//     still flows to a case-feature StructureDefinition + action input (the atom closure);
//   - the guard's applicability condition names the CRITERION, not its inlined body;
//   - a deep doubling-chain criterion emits LINEARLY (one define per criterion), where the
//     retired inline-expansion path would have blown past the atom cap.

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
- shape is RecordSet.
criterion "Eligible":
- when ( "Gate Concept" ).
decision "PolicyDec":
first:
- when "Eligible" then recommend activity "Act".
- otherwise then recommend activity "No".
${ACTIVITIES}`;

// Doubling-chain criterion C0..C10: C0 = Gate and Gate; C_k = C_{k-1} and C_{k-1}. Inline
// expansion would materialize 2^(k+1) leaves — C10 = 2048 atoms, past the retired 1024 cap.
// Post-flip each C_k is ONE named define referencing C_{k-1} by name → 11 defines, LINEAR.
function doublingChainPolicy(): string {
  const criteria = [`criterion "C0":\n- when ( "Gate Concept" and "Gate Concept" ).`];
  for (let k = 1; k <= 10; k++) criteria.push(`criterion "C${k}":\n- when ( "C${k - 1}" and "C${k - 1}" ).`);
  return `# Policy
library "Policy".
concept "Gate Concept":
- type is Observation.
- code is \`gate\`.
- shape is RecordSet.
${criteria.join("\n")}
decision "PolicyDec":
first:
- when "C10" then recommend activity "Act".
- otherwise then recommend activity "No".
${ACTIVITIES}`;
}

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
  it("emits a named define + re-exports the criterion-only concept on the INTERFACE library", () => {
    withPolicy(POLICY, (root) => {
      const result = emitCQLImports(path.join(root, "policy.crl"));
      // Success proves S6 (computeCqlEmitClosure) + S8 (interfaceSurface) followed the criterion.
      expect(result.success).toBe(true);
      const iface = result.cqlByLibrary.find((e) => e.libraryName === "PolicyInterface")?.cql ?? "";
      // #236: the criterion lowers to a named boolean define on the Interface (the reference
      // target every guard cites) — NOT inlined into each guard.
      expect(iface).toContain('define "Eligible"');
      // The criterion-body concept re-exports on the Interface (NOT merely that some LocalSource
      // library mentions the name) — proving S8 followed the criterion into its body.
      expect(iface).toContain("Gate Concept");
    });
  });

  it("a MIXED guard `( Inline and Eligible )` re-exports BOTH the inline concept AND the criterion-body concept", () => {
    // The guard-concept closure must follow a criterion ref sitting BESIDE an inline concept ref in
    // one guard: `Inline` (direct) and `Gate Concept` (reachable only through the criterion body) must
    // both re-export on the Interface, so neither the emitted `define "Eligible"` reference nor the
    // inline condition dangles.
    const src = `# Policy
library "Policy".
concept "Inline":
- type is Observation.
- code is \`inline\`.
- shape is RecordSet.
concept "Gate Concept":
- type is Observation.
- code is \`gate\`.
- shape is RecordSet.
criterion "Eligible":
- when ( "Gate Concept" ).
decision "PolicyDec":
first:
- when ( "Inline" and "Eligible" ) then recommend activity "Act".
- otherwise then recommend activity "No".
${ACTIVITIES}`;
    withPolicy(src, (root) => {
      const result = emitCQLImports(path.join(root, "policy.crl"));
      expect(result.success).toBe(true);
      const iface = result.cqlByLibrary.find((e) => e.libraryName === "PolicyInterface")?.cql ?? "";
      expect(iface).toContain('define "Eligible"'); // the criterion define
      expect(iface).toContain("Inline"); // the inline guard concept
      expect(iface).toContain("Gate Concept"); // reachable only via the criterion body — still re-exported
    });
  });

  it("a deep doubling-chain criterion emits LINEARLY (one define per criterion), not an overflow", () => {
    withPolicy(doublingChainPolicy(), (root) => {
      // The retired path threw a `criterion-expansion-overflow` here (C10 materialized 2048 atoms
      // past the cap). Post-flip every criterion is emitted ONCE as a named define → success.
      const result = emitCQLImports(path.join(root, "policy.crl"));
      expect(result.success).toBe(true);
      const iface = result.cqlByLibrary.find((e) => e.libraryName === "PolicyInterface")?.cql ?? "";
      // Linearity: exactly 11 criterion defines (C0..C10), each emitted once. An expansion would
      // be impossible to even emit at this depth; a linear DAG emits one define per criterion.
      const defineCount = (iface.match(/define "C\d+"/g) ?? []).length;
      expect(defineCount).toBe(11);
      // Each define references its predecessor BY NAME (the DAG edge), not an inlined subtree.
      expect(iface).toContain('define "C10"');
      expect(iface).toContain('"C9"');
    });
  });
});

// ── #224 iii.1 — per-action guard emit, end-to-end through the real orchestrator ──
// A concept referenced ONLY by a SELF-QUALIFIED `unless` action guard must (a) get an
// Interface re-export (else the negated condition dangles at $apply — the self-qualified
// normalization fix), (b) emit a case-feature StructureDefinition + action input, and
// (c) lower to a library-qualified, Coalesce-wrapped negated applicability condition.
const GUARD_POLICY = `# Policy
library "Policy".
concept "Gate Concept":
- type is Observation.
- code is \`gate\`.
- shape is RecordSet.
concept "Blocker":
- type is Observation.
- code is \`blocker\`.
- shape is RecordSet.
decision "PolicyDec":
first:
- when "Gate Concept" then:
  any:
  - recommend activity "Act" unless "Policy"."Blocker".
  - recommend activity "No".
  end.
${ACTIVITIES}`;

describe("#224 iii.1 — per-action guard emit (self-qualified, guard-only concept)", () => {
  it("re-exports the guard-only concept on the INTERFACE (self-qualified `unless \"Policy\".\"Blocker\"` does not dangle)", () => {
    withPolicy(GUARD_POLICY, (root) => {
      const result = emitCQLImports(path.join(root, "policy.crl"));
      expect(result.success).toBe(true);
      // Before the interfaceSurface normalization fix, `"Policy"."Blocker"` was skipped as a
      // qualified ref → no re-export → the emitted negated condition referenced a missing define.
      const iface = result.cqlByLibrary.find((e) => e.libraryName === "PolicyInterface")?.cql ?? "";
      expect(iface).toContain("Blocker");
    });
  });

  it("emits the negated condition (qualified + Coalesce) + the guard concept's input & case-feature SD", () => {
    withPolicy(GUARD_POLICY, (root) => {
      const result = emitFhirDefFromPath(path.join(root, "policy.crl"), { date: "2026-06-04" });
      expect(result.success).toBe(true);
      const resources = result.resources.map((r) => r.resource as Record<string, any>);
      // (a) the negated applicability condition, library-qualified to the Interface + Coalesce.
      const pd = resources.find((r) => r.resourceType === "PlanDefinition" && String(r.id).includes("policydec"));
      const conds: any[] = [];
      const stack = [...(pd!.action ?? [])];
      while (stack.length) {
        const a = stack.pop();
        if (a.condition) conds.push(...a.condition);
        if (a.action) stack.push(...a.action);
      }
      const neg = conds.find((c) => c.expression?.language === "text/cql-expression");
      expect(neg?.expression.expression).toBe('not Coalesce("PolicyInterface"."Blocker", false)');
      // (b) a case-feature StructureDefinition for the guard-only concept.
      const sd = resources.find(
        (r) => r.resourceType === "StructureDefinition" && String(r.id).includes("blocker"),
      );
      expect(sd).toBeDefined();
      // (c) the guarded action carries an input profiled to that SD (no dangle).
      const actStack = [...(pd!.action ?? [])];
      let guardedInputProfile: string | undefined;
      while (actStack.length) {
        const a = actStack.pop();
        if (a.title === "Act" && a.input) guardedInputProfile = a.input[0]?.profile?.[0];
        if (a.action) actStack.push(...a.action);
      }
      expect(guardedInputProfile).toBe(sd!.url);
    });
  });
});

// ── #236 — the criterion guard lowers to a NAMED define reference (not its inlined body) ──
// The inverse of the retired "criterion == hand-inlined" parity: a decision whose guard is a
// criterion must reference the criterion BY NAME at the applicability condition, while the
// concept reachable only through the criterion body still flows to a case-feature SD + input.
describe("#236 — criterion guard emits a define reference + the atom-closure input", () => {
  it("FHIR lane: the applicability condition names the criterion; the criterion-only concept still gets its SD + input", () => {
    withPolicy(POLICY, (root) => {
      const result = emitFhirDefFromPath(path.join(root, "policy.crl"), { date: "2026-06-04" });
      expect(result.success).toBe(true);
      const resources = result.resources.map((r) => r.resource as Record<string, any>);
      const pd = resources.find(
        (r) => r.resourceType === "PlanDefinition" && String(r.id).includes("policydec"),
      );
      // The guarded action references the CRITERION by name (a `text/cql-identifier` define
      // reference), NOT the inlined body concept "Gate Concept".
      const actStack = [...(pd!.action ?? [])];
      let guarded: Record<string, any> | undefined;
      while (actStack.length) {
        const a = actStack.pop();
        if (a.condition?.some((c: any) => c.expression?.language === "text/cql-identifier")) guarded = a;
        if (a.action) actStack.push(...a.action);
      }
      const cond = guarded!.condition.find((c: any) => c.expression?.language === "text/cql-identifier");
      expect(cond.expression.expression).toBe("Eligible");
      // The criterion-only concept still reaches a case-feature StructureDefinition …
      const sd = resources.find(
        (r) => r.resourceType === "StructureDefinition" && String(r.id).includes("gate-concept"),
      );
      expect(sd).toBeDefined();
      // … and the guarded action carries an input profiled to it (the atom closure flowed).
      expect(guarded!.input?.some((i: any) => i.profile?.[0] === sd!.url)).toBe(true);
    });
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
