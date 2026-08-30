import * as path from "node:path";
import { readFileSync } from "node:fs";

import { describe, it, expect } from "vitest";

import { buildCRL, validateCRL } from "../index";
import type { CRL, Concept } from "../ast/types";
import { matchNarrative } from "../template-match/matcher";
import { resolveCelImports } from "../cel/imports";
import { runCel } from "../cre/run";

/**
 * ⭐ THE CANONICAL TARGET for the ServiceRequest membership chain (#189) — `fixtures/service-request/`.
 *
 * The acceptance criterion (operator, 2026-08-30):
 *
 *   an SR whose code IS in the value set         -> true  -> Approve
 *   an SR whose code is NOT in it, nothing newer -> false -> Deny
 *   no SR at all, OR the SR carries no code      -> unanswered: pause and ask
 *
 * ⭐ ROWS 2 AND 3 MUST DIFFER, and that is the entire reason this fixture exists. A request for another
 * service is a determinate NO — the request was read and it is not covered. No request at all is a question
 * nobody has answered. `exists this` cannot tell them apart because both retrieve nothing; `matches this`
 * can, because it reads the DATUM of a record that WAS retrieved.
 *
 * ⚠ THIS TEST PINS FAILURE ON PURPOSE. The policy is the CORRECT model; the implementation catches up to it
 * (`feedback_fixture-is-oracle-emit-catches-up`). Each pin states the value that must be reached beside the
 * value produced today, so closing a gap is a visible, deliberate edit to this file — and an accidental
 * regression is indistinguishable from progress, because both change a pin.
 *
 * ⚠ NEVER re-author the policy or a case to make a lane pass.
 */

const FIXTURE = path.resolve(__dirname, "fixtures/service-request");
const POLICY = path.join(FIXTURE, "policy.crl");
const CASES = path.join(FIXTURE, "cases.cel");

const APPROVE = "Approve Endoluminal Ablation";
const DENY = "Deny Endoluminal Ablation";

/** What every lane MUST eventually produce, for the rows CEL can STATE. */
const MUST_PRODUCE: Record<string, readonly string[]> = {
  "request is the covered service -> approve": [APPROVE],
  "request is a different service -> deny": [DENY],
  "answered yes, no request -> approve": [APPROVE],
  "answered no, no request -> deny": [DENY],
  "request covered but newer answer says no -> deny": [DENY],
};

/**
 * ⚠⚠ THE PAUSE ROWS, WHICH CEL CANNOT STATE — and they are the acceptance criterion's whole point.
 *
 * `result is "<leaf>" is <branch | boolean>` is CEL's entire result surface
 * (`cel/ast/types.ts`: `CELResultValue = CELBooleanResult | CELBranchResult`), so every case must name a
 * branch. A pause row's correct answer is that NO branch fires, so writing it in CEL means asserting the
 * collapse the fixture exists to catch.
 *
 * ⚠ THE BOUNDARY IS PERMANENT, NOT A GAP. CEL is Case EXAMPLE Language: a case exemplifies what a decision
 * DOES, and an absence cannot be exemplified. There is no pause form and there will not be one — pause
 * testing is what THIS file is for.
 *
 * ⚠ `fixtures/obesity/cases.cel` carries the same consequence — `case "obese unanswered -> no
 * recommendation"` asserts `"Approve Bariatric Surgery"`, so its name and its assertion disagree. That is a
 * known effect of the boundary and the OPERATOR'S CALL, not a defect to go fix.
 *
 * These rows are recorded here; `$apply` owns their execution.
 */
const OWED_PAUSE_ROWS: readonly string[] = [
  "no ServiceRequest at all -> no recommendation",
  "a ServiceRequest carrying NO code -> no recommendation",
];

interface Run {
  case?: string;
  status?: string;
  produced?: string[];
  trace?: { concept?: string; satisfied?: boolean; facts?: string[] }[];
}

function runFixture(): Run[] {
  const res = runCel(resolveCelImports(CASES) as never) as unknown as { runs?: Run[] };
  return res.runs ?? [];
}

function guardTrace(r: Run): { satisfied?: boolean; facts: string[] } {
  const t = (r.trace ?? []).find((x) => x.concept !== undefined);
  return { satisfied: t?.satisfied, facts: t?.facts ?? [] };
}

describe("ServiceRequest membership target — fixtures/service-request", () => {
  it("the policy validates with ZERO errors (the oracle bar; emit may lag, validation may not)", () => {
    const v = validateCRL(readFileSync(POLICY, "utf8"), { soft: true }) as unknown as {
      errors?: { kind?: string }[];
      warnings?: { kind?: string }[];
    };
    expect((v.errors ?? []).map((e) => e.kind)).toEqual([]);
    // The pre-flip cross-representation merge warning, exactly as the obesity target carries it.
    expect((v.warnings ?? []).map((w) => w.kind)).toEqual(["reduction-shape"]);
  });

  it("`matches this` RESOLVES to the Matches pattern — it is not soft-compiled narrative", () => {
    // ⚠ Load-bearing. A projection that fails to match still PARSES and still validates; it silently becomes
    // unmatched narrative. Without this assertion the fixture would look authored while meaning nothing.
    const built = buildCRL(readFileSync(POLICY, "utf8")) as unknown as { result?: CRL };
    const concept = (built.result!.statements as Concept[]).find((s) => s.type === "Concept")!;
    const projection = concept.representations[0].valueProjection!;
    const matched = matchNarrative(projection.body);
    expect(matched.pattern).toBe("Matches");
    expect(matched.known).toBe(true);
    expect(matched.args).toEqual([]); // the set is the rep's `coded from`, never a narrative operand
  });

  it("the SIBLING `exists this` still resolves — `matchesThis` is registered ahead of it", () => {
    // ⚠ Registry-drift coverage. Both matchers are two bare words, and `matchesThis` is declared FIRST, so a
    // future loosening of either (an optional operand, a wildcard word test) could shadow `existsThis`
    // silently — it would soft-compile to unmatched narrative and still validate.
    const src = [
      'library "S".',
      'terminology "VS":',
      "- valueset is `http://example.org/x`.",
      'concept "E":',
      "- type is Observation.",
      "- value type is boolean.",
      "- code is `e`.",
      "- source representation:",
      "  - type is Condition.",
      '  - coded from "VS".',
      "  - value projection is exists this.",
      "",
    ].join("\n");
    const built = buildCRL(src) as unknown as { result?: CRL };
    const concept = (built.result!.statements as Concept[]).find((s) => s.type === "Concept")!;
    const matched = matchNarrative(concept.representations[0].valueProjection!.body);
    expect(matched.pattern).toBe("Exists");
    expect(matched.known).toBe(true);
  });

  it("the PAUSE rows are recorded even though CEL cannot state them", () => {
    // Their absence from `cases.cel` is deliberate and documented there; this keeps them from being quietly
    // forgotten, and fails if someone trims the list without adding the CEL surface that would let them land.
    expect(OWED_PAUSE_ROWS).toHaveLength(2);
  });

  it("every case is declared in MUST_PRODUCE (no silent coverage gap)", () => {
    expect(runFixture().map((r) => r.case).sort()).toEqual(Object.keys(MUST_PRODUCE).sort());
  });

  it("⭐ the CRE now EVALUATES this family — the blanket refusal is gone, and what it produces is pinned", () => {
    // ⚠ WAS: "every run is a LOUD error", pinned as correct-behaviour-for-a-gap. The gap closed. The CRE
    // keys the refusal on the RESOLVED PROGRAM now, so `most recent this` is decided from the candidate
    // collection whenever the case makes it decidable (zero candidates → unknown; agreeing candidates →
    // that value; disagreement or an uncomputable contributor → a refusal that still says so loudly).
    //
    // ⚠ PIN WHAT IS PRODUCED, per case — a blanket `[]` would be satisfied by a regression back to refusal,
    // since a refusal DISCARDS `produced`.
    const runs = runFixture();
    const byCase = Object.fromEntries(
      runs.map((r) => [r.case!, { status: r.status, produced: (r.produced ?? []).map((p) => p.recommendation) }]),
    );
    // ⚠ EXPLICIT, NOT A SNAPSHOT. A snapshot would record all five rows as equally "current", hiding which
    // ones MEET `MUST_PRODUCE` and which are still owed — and an oracle fixture that cannot tell progress
    // from regression is worthless. Each row says which it is.
    expect(byCase).toEqual({
      // ⭐ THREE ROWS NOW MEET THE CRITERION.
      "answered yes, no request -> approve": { status: "pass", produced: [APPROVE] },
      "answered no, no request -> deny": { status: "pass", produced: [DENY] },
      "request is the covered service -> approve": { status: "pass", produced: [APPROVE] },

      // ⚠ OWED — an HONEST refusal, not a wrong answer. A covered request (source arm -> true) and a newer
      // local answer of false are two DISAGREEING candidates, and picking the newest needs the emitted
      // date+id sort the CRE deliberately does not replicate. ⚠ must become `{ pass, [DENY] }`.
      "request covered but newer answer says no -> deny": { status: "error", produced: [] },

      // ⚠ OWED — THE DEFECT THIS FIXTURE EXISTS TO CATCH, unchanged by this slice. The `coded from` retrieve
      // is FILTERED, so a non-member ServiceRequest never reaches the concept and leaves the same empty
      // evidence as no request at all. `matches this` needs the UNFILTERED retrieve to judge it.
      // ⚠ must become `{ pass, [DENY] }`.
      "request is a different service -> deny": { status: "fail", produced: [] },
    });
  });

  it("the ServiceRequest lane is ALIVE — a covered request DOES reach the concept", () => {
    // ⚠⚠ THIS ASSERTION IS WHAT GIVES THE NEXT ONE ITS MEANING, and without it that one is worthless.
    //
    // The collapse pin below reads "wrong-code and no-request both produce empty evidence". If the SR lane
    // were simply DEAD — a wrong stub code, an unresolved terminology, a later exclusion of
    // posreps-with-projections — then EVERY SR row would be empty and the pin would still pass, measuring
    // "lane dead" rather than "retrieve filtered". Pinning that a covered request DOES arrive is what makes
    // the emptiness of the other two rows evidence about FILTERING.
    const covered = guardTrace(runFixture().find((r) => r.case!.includes("covered service"))!);
    expect(covered.facts).toEqual(["RFA Request"]);
  });

  it("⭐⭐ THE DEFECT THIS FIXTURE EXISTS TO CATCH: a wrong-code request produces NO evidence", () => {
    const runs = runFixture();
    const wrongCode = guardTrace(runs.find((r) => r.case!.includes("different service"))!);

    // MEASURED, not predicted, and meaningful only because the test above proves the lane is live: the
    // `coded from` retrieve is FILTERED today, so a non-member ServiceRequest never reaches the concept and
    // leaves exactly the empty evidence that "no request at all" would.
    expect(wrongCode).toEqual({ satisfied: false, facts: [] });

    // ⭐ WHAT MUST BECOME TRUE: with `matches this` the retrieve is UNFILTERED, so the wrong-code request IS
    // retrieved and the projection judges it — a determinate `false` CARRYING the fact that produced it.
    // When that lands this test fails HERE, which is the signal, and the expectation becomes:
    //     expect(wrongCode).toEqual({ satisfied: false, facts: ["Other Service Request"] });
  });

  it("⭐ a STATED false now reads FALSE — the defect the obesity target carried is gone here too", () => {
    // ⚠ WAS `satisfied: true` (⚠ must become false). The guard used to read PRESENCE — the fact exists, so
    // the concept read true REGARDLESS of its `value is false`, and a stated denial approved. The CRE now
    // evaluates this family off the CANDIDATE COLLECTION and reads the candidate's boolean value.
    const runs = runFixture();
    const answeredNo = guardTrace(runs.find((r) => r.case!.includes("answered no"))!);
    expect(answeredNo).toEqual({ satisfied: false, facts: ["Answered No"] });
  });
});
