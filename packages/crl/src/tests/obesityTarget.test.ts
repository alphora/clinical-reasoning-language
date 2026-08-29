import * as path from "node:path";
import { readFileSync } from "node:fs";

import { describe, it, expect } from "vitest";

import { validateCRL } from "../index";
import { resolveCelImports } from "../cel/imports";
import { runCel } from "../cre/run";
import { emitCQLImports } from "../imports/emit";
import { emitFhirDefFromPath } from "../fhir-emitter/closureOrchestrator";

/**
 * ⭐ THE CANONICAL TARGET for the Obese/BMI chain (#189) — `fixtures/obesity/`.
 *
 * There is ONE policy and ONE truth table, and this file drives them across every lane so the target cannot
 * drift lane by lane. It replaces a folder of near-identical hand-edited drafts (`tmp/bmi/{bmi,record-version,
 * new-record,FULL-record}.crl`), two of which still carried a form the operator had already corrected. A
 * target that lives in scratch and is re-typed per experiment is not a target.
 *
 * ⚠ THIS TEST PINS FAILURE ON PURPOSE. The policy is the CORRECT model; the implementation catches up to it
 * (`feedback_fixture-is-oracle-emit-catches-up`). So each lane's assertion states the value the lane MUST
 * reach and, where it does not reach it yet, pins TODAY's value with the reason. That makes every remaining
 * step a visible edit to this file rather than a claim in a hand-off, and it makes an accidental regression
 * indistinguishable from progress — both change a pin.
 *
 * ⚠ NEVER re-author the policy or the cases to make a lane pass. That is the one move this file exists to
 * prevent.
 */

const FIXTURE = path.resolve(__dirname, "fixtures/obesity");
const POLICY = path.join(FIXTURE, "policy.crl");
const CASES = path.join(FIXTURE, "cases.cel");

/** The acceptance criterion, verbatim (operator, 2026-08-29). The ONLY route to a Deny is a STATED false. */
const TRUTH_TABLE = [
  { case: "obese stated true -> approve", mustProduce: ["Approve Bariatric Surgery"] },
  { case: "obese stated false -> deny", mustProduce: ["Deny Bariatric Surgery"] },
  { case: "obese unanswered -> no recommendation", mustProduce: [] },
] as const;

describe("#189 canonical target — the Obese/BMI chain", () => {
  it("VALIDATES clean; every warning maps to a named remaining step", () => {
    const v = validateCRL(readFileSync(POLICY, "utf8"), { soft: true });
    expect(v.errors ?? []).toEqual([]);
    // The model is complete and legal TODAY. What is not complete is emit, and the warnings say so — each is
    // a step in `tmp/PLAN-obesity-apply.md`, not a defect in the policy.
    //   `shape is` declared but not consulted by emit   → step 6
    //   cross-representation recency merge              → #257
    const kinds = new Set((v.warnings ?? []).map((w) => w.kind));
    expect([...kinds]).toEqual(["reduction-shape"]);
  });

  it("CRE — the truth table. ⚠ TWO ROWS FAIL TODAY; the expectation is the TARGET, not the behaviour", () => {
    const result = runCel(resolveCelImports(CASES)) as unknown as {
      success: boolean;
      runs?: { case: string; produced?: { recommendation: string }[] }[];
    };
    expect(result.success).toBe(true);
    const producedFor = (name: string): string[] =>
      (result.runs ?? []).find((r) => r.case === name)?.produced?.map((p) => p.recommendation) ?? [];

    // ✅ A stated TRUE approves. This row already holds.
    expect(producedFor(TRUTH_TABLE[0].case)).toEqual([...TRUTH_TABLE[0].mustProduce]);

    // ⚠ MUST BE `["Deny Bariatric Surgery"]`. Today the CRE PRESENCE-satisfies the assertion — the fact is
    // there, so `Obese` reads true regardless of `value is false` — and APPROVES. A stated false denied is the
    // only legitimate route to a Deny, so this is the row that matters most. (Same shape as the Option C fix
    // for `defined as exists` interfaces, disc 512; this concept is `code is` + `definition is`, a different arm.)
    expect(producedFor(TRUTH_TABLE[1].case)).toEqual(["Approve Bariatric Surgery"]);

    // ⚠ MUST BE `[]` — no recommendation, pause and ask. Today an unanswered question reads closed-world
    // false and the `otherwise` fires, so absence produces a DENY. That is the #189 defect itself, reaching
    // the target chain: a Deny that traces to an absence rather than to a stated answer.
    expect(producedFor(TRUTH_TABLE[2].case)).toEqual(["Deny Bariatric Surgery"]);
  });

  it("EMIT — ⚠ BOTH LANES REFUSE the canonical shape today: `code is` + `definition is`", () => {
    // The charter makes a local `code is` the canonical production representation and a derivation over it
    // ordinary (`project_local-domain-is-canonical`, North Star §3). Every concept in the target is exactly
    // that — a question that can also be computed. Emit rejects the combination outright.
    //
    // ⚠ MUST BECOME `success: true` with no `emit-mixed-code-and-definition`. Until then the chain cannot
    // reach `$apply` at all, which makes this — not `shape is` — the FIRST blocker on the path. The FHIR lane
    // still writes 12 resources (value sets, activities, plan definitions) but no case-feature
    // StructureDefinitions, so what it emits is a shell with no questions in it.
    const cql = emitCQLImports(POLICY) as unknown as { success: boolean; cqlByLibrary?: unknown[] };
    expect(cql.success).toBe(false);
    expect(cql.cqlByLibrary ?? []).toHaveLength(0);

    const fhir = emitFhirDefFromPath(POLICY, { date: new Date("2026-01-01T00:00:00.000Z") }) as unknown as {
      success: boolean;
      errors?: { kind?: string }[];
      resources?: unknown[];
    };
    expect(fhir.success).toBe(false);
    const mixed = (fhir.errors ?? []).filter((e) => e.kind === "emit-mixed-code-and-definition");
    // ⚠ MEASURED, and narrower than it first looks: `Obese` and `BMI` are refused, `Height` and `Weight` are
    // not. All four carry `code is` + `definition is`; the difference is that the leaves reduce over their OWN
    // representations (`most recent this`, the supported both-representation recency) while the two refused
    // ones derive from OTHER concepts. So the boundary is not "code is + definition is" as the message says —
    // it is a local code plus a CROSS-CONCEPT derivation, which is the ordinary shape of a question that can
    // also be computed. Naming that precisely is the first step to closing it.
    expect(mixed).toHaveLength(2);
  });
});
