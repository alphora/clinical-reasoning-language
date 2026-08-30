import * as path from "node:path";
import { readFileSync } from "node:fs";

import { describe, it, expect } from "vitest";

import { buildCRL, validateCRL } from "../index";
import { collectCodeIsConceptsInInferenceOrder } from "../fhir-emitter/caseFeatureCollection";
import type { Concept } from "../ast/types";
import { resolveCelImports } from "../cel/imports";
import { runCel } from "../cre/run";
import { emitCQLImports } from "../imports/emit";
import { emitFhirDefFromPath } from "../fhir-emitter/closureOrchestrator";

/**
 * ⭐ THE CANONICAL TARGET for the Obese/BMI chain (#189) — `fixtures/obesity/`.
 *
 * ⭐ THREE AUTHORING OPTIONS, ALL LEGITIMATE (operator, 2026-08-29). None is a variant of another:
 *
 *   Record     every level is `code is` + `shape is Record`, so every level is a QUESTION. FOUR questions;
 *              a user may answer at any level — assert obesity, or a BMI, or a height and a weight.
 *   RecordSet  the histories are assertable but NOT answerable. ONE question, and the reduction happens at
 *              the top instead of at every level.
 *   Layered    ⭐ the expected CONVENTION. Layering NAMES REDUCTIONS: `Most Recent Weight` and `Greatest
 *              Weight` both read ONE `Weight Records`, each stated once, neither restating its code or
 *              posrep. ⚠ It says NOTHING about what may be answered — a local `code is` is the answer slot
 *              at EVERY level, and a concept with a code AND a derivation simply has two arms.
 *
 * Different generated Questionnaires, same decision. So they owe the SAME truth table, and this file drives
 * all three through every lane — a lane that works for one authoring option and not the others is not done.
 *
 * ⚠ THIS TEST PINS FAILURE ON PURPOSE. The policies are the CORRECT models; the implementation catches up to
 * them (`feedback_fixture-is-oracle-emit-catches-up`). Each lane asserts the value it MUST reach and, where
 * it does not reach it yet, pins TODAY's value with the reason. That makes every remaining step a visible
 * edit to this file rather than a claim in a hand-off, and it makes an accidental regression
 * indistinguishable from progress — both change a pin.
 *
 * ⚠ NEVER re-author a policy or a case to make a lane pass. That is the one move this file exists to prevent.
 */

const FIXTURE = path.resolve(__dirname, "fixtures/obesity");

/**
 * The acceptance criterion (operator, 2026-08-29), which ALL THREE options owe:
 *
 *   Obese = true       -> Approve
 *   Obese = false      -> Deny
 *   Obese = unanswered -> NO recommendation: pause and ask
 *
 * ⭐ A Deny requires an ESTABLISHED false — asserted, recorded, OR computed (charter "VOCABULARY").
 * Absence is never established. ⚠ "STATED" is NOT "asserted by a human": a computed false (a BMI of 25
 * against `at least 30`) denies exactly as an asserted one does.
 */
const MUST_PRODUCE: Record<string, readonly string[]> = {
  "obese stated true -> approve": ["Approve Bariatric Surgery"],
  "obese stated false -> deny": ["Deny Bariatric Surgery"],
  "obese unanswered -> no recommendation": [],
};

/**
 * What the CRE produces TODAY. ⚠ Two of three rows are WRONG, identically under EVERY authoring option —
 * which is itself the finding: the defect is in how a locally-coded concept is READ, not in either shape
 * model, so one fix closes both.
 *
 *   stated FALSE  the CRE PRESENCE-satisfies the assertion — the fact exists, so `Obese` reads true whatever
 *                 its value — and APPROVES. A stated false denied is the only legitimate route to a Deny, so
 *                 this is the row that matters most. (Same shape as the Option C fix for `defined as exists`
 *                 interfaces, disc 512; these concepts are `code is` + `definition is`, a different arm.)
 *   UNANSWERED    absence reads closed-world false, so the `otherwise` fires and produces a DENY. That is the
 *                 #189 defect itself, reaching the target chain: a Deny tracing to an absence, not an answer.
 */
const PRODUCES_TODAY: Record<string, readonly string[]> = {
  "obese stated true -> approve": ["Approve Bariatric Surgery"], // already correct
  "obese stated false -> deny": ["Approve Bariatric Surgery"], // ⚠ must become ["Deny Bariatric Surgery"]
  "obese unanswered -> no recommendation": ["Deny Bariatric Surgery"], // ⚠ must become []
};

interface AuthoringOption {
  readonly name: string;
  readonly policy: string;
  readonly cases: string;
  /**
   * ⚠ The locally-coded concepts that ALSO publish one record — i.e. the valid `cpg-featureExpression`
   * targets, whose read yields a single value. NOT "the questions": every coded concept is answerable
   * whatever its shape (charter §3), and a coded history is answered by ADDING A RECORD.
   */
  readonly singleValuedTargets: readonly string[];
  /**
   * ⚠ Whether the policy validates with ZERO errors TODAY.
   *
   * ⭐ ALL THREE now do (2026-08-30). It was `false` for the Record and Layered options because
   * `body mass index of …` matched NO catalog pattern — arithmetic was not in the language. Adding the
   * `BodyMassIndex` pattern closed it, and THIS PIN IS HOW WE FOUND OUT: the driver failed with
   * `expected [] to deeply equal ["reduction-shape"]`, which is the pin doing its job in the good direction.
   *
   * ⚠⚠ VALIDATING CLEAN DOES NOT MEAN THE LOWERING IS RIGHT, and this option is the live proof. MEASURED
   * (`tmp/nullprobe/analysis/pipelineShape-out.txt`): `body mass index of A and B, then most recent this`
   * currently matches as `MostRecent(BodyMassIndex(A, B))` — it COLLAPSES INTO THE PREFIX SPELLING, which
   * `policy.crl`'s own comment names as wrong ("reduces only the calculation's output — silently dropping
   * the recorded and answered arms"), and it does not even translate ("Could not resolve call to operator
   * MostRecent with signature (System.Quantity)"). So this flag says the VALIDATOR is satisfied, nothing
   * more. What guards correctness is the EMIT assertion below plus an executed `$apply` run — never this.
   */
  readonly validatesCleanToday: boolean;
  /** What the CRE produces TODAY, per case. ⚠ The Layered option differs — see its entry. */
  readonly producesToday: Record<string, readonly string[]>;
  /** The emit error kind that blocks this option today. */
  readonly emitBlocker: string;
  /**
   * ⭐ The QUESTIONS a user is offered: every locally-coded concept reachable from the decision's guard by
   * walking the DEPENDENCY path. This is goal item 2 — "the user can answer at any level".
   */
  readonly reachableQuestions: readonly string[];
}

const OPTIONS: readonly AuthoringOption[] = [
  {
    name: "Record",
    policy: path.join(FIXTURE, "policy.crl"),
    cases: path.join(FIXTURE, "cases.cel"),
    singleValuedTargets: ["Obese", "BMI", "Height", "Weight"],
    validatesCleanToday: true,
    producesToday: PRODUCES_TODAY,
    emitBlocker: "emit-mixed-code-and-definition",
    reachableQuestions: ["Obese", "BMI", "Weight", "Height"],
  },
  {
    name: "RecordSet",
    policy: path.join(FIXTURE, "policy-recordset.crl"),
    cases: path.join(FIXTURE, "cases-recordset.cel"),
    singleValuedTargets: ["Obese"],
    validatesCleanToday: true,
    producesToday: PRODUCES_TODAY,
    emitBlocker: "emit-mixed-code-and-definition",
    reachableQuestions: ["Obese", "BMI", "Weight", "Height"],
  },
  {
    // ⭐ THE CONVENTION: RecordSet -> Record -> calculated, each layer expressed ONCE and referred to by
    // the next. Assumes an Obesity LIBRARY whose every layer some other library consumes.
    name: "Layered",
    policy: path.join(FIXTURE, "policy-layered.crl"),
    cases: path.join(FIXTURE, "cases-layered.cel"),
    // ⭐ LAYERING NAMES REDUCTIONS — `Most Recent Weight` and `Greatest Weight` over ONE `Weight Records`,
    // each stated once. It says NOTHING about what may be answered.
    //
    // ⚠ AN EARLIER VERSION OF THIS FILE CLAIMED IT DID: "a measurement history is the answer slot and the
    // Records above it are selections, derived and never answered." That was invented, not derived. A local
    // `code is` is the answer slot at every level, and whether a concept offers one is the AUTHOR's call.
    // `Greatest Weight` carries a code here precisely so the mistake cannot be re-read off the file's shape
    // — asserting "the greatest weight is 200" is a little odd, and asserting obesity (or a BMI, or a height
    // and a weight) is entirely natural. Same mechanism, different naturalness.
    //
    // ⚠ ALSO MEASURED, and a separate error: SPLITTING a determination into a coded history plus an uncoded
    // derivation produced an answer slot nothing reads — an asserted obesity accepted and IGNORED while the
    // decision denied. That looked like a missing merge construct in the language; it was the split. Merged
    // back, this option's CRE rows match the other two and its emit blocker becomes the same one.
    singleValuedTargets: ["Greatest Weight", "BMI", "Obese"],
    validatesCleanToday: true,
    producesToday: PRODUCES_TODAY,
    emitBlocker: "emit-mixed-code-and-definition",
    // ⭐ Four, reached THROUGH the uncoded reductions: Obese -> BMI -> Most Recent Weight/Height ->
    // Weight/Height Records. The intermediates carry no code so they offer no question, but the walk
    // traverses them — which is what makes the layering invisible to a user answering the questionnaire.
    reachableQuestions: ["Obese", "BMI", "Weight Records", "Height Records"],
  },
];

describe("#189 canonical target — the Obese/BMI chain", () => {
  it("the three options differ in which answerables publish ONE record (the featureExpression targets)", () => {
    // ⚠ This measures `code is` + `shape is Record` — the valid `cpg-featureExpression` targets, whose read
    // yields ONE value. It is NOT the question set: EVERY coded concept is answerable whatever its shape, and
    // a coded history is answered by adding a record. The question set is the dependency walk, asserted
    // separately below; conflating the two is what made an earlier version of this file assert both.
    //
    // ⚠ It is also a DISCRIMINATOR, and a suite declaring only one value of it cannot notice when the
    // discriminator is ignored — which is the open defect (step 6). And it selects a different emitter path:
    // a reduction over a local `shape is RecordSet` OPERAND is gated explicitly (`cql-emitter/emitCQL.ts`),
    // so `BMI`'s operands differ between the two.
    for (const opt of OPTIONS) {
      const built = buildCRL(readFileSync(opt.policy, "utf8")) as unknown as {
        success: boolean;
        result?: { statements: { type: string; name?: string; code?: unknown; shape?: string }[] };
      };
      expect(built.success, opt.name).toBe(true);
      const singleValued = (built.result?.statements ?? [])
        .filter((st) => st.type === "Concept" && st.code !== undefined && st.shape === "Record")
        .map((st) => st.name ?? "");
      expect(singleValued, opt.name).toEqual([...opt.singleValuedTargets]);
    }
  });

  for (const opt of OPTIONS) {
    describe(opt.name + " authoring option", () => {
      it("VALIDATES; every warning maps to a named remaining step", () => {
        const v = validateCRL(readFileSync(opt.policy, "utf8"), { soft: true });
        if (opt.validatesCleanToday) {
          expect(v.errors ?? []).toEqual([]);
        } else {
          // ⚠ `body mass index of …` is an UNMATCHED NARRATIVE — it resolves to no catalog pattern, so a
          // `shape is Record` concept cannot be shown to yield one record. That is TRUE: arithmetic is not in
          // the catalog (plan step 4, still open). MUST BECOME clean when it lands.
          //
          // ⭐ This used to be reported by the Layered option ALONE, and the difference was spelling, not
          // correctness. `most recent body mass index of "Weight" and "Height"` composes TWO operations with
          // the second written first — against the left-to-right rule — and the validator treats `most recent
          // X` as one operation over an opaque argument, so it never looks inside. MEASURED: `most recent
          // flurble bloop of "A"` validates CLEAN. The prefix spelling therefore violated left-to-right AND
          // disabled the narrative check, which is ONE defect, not two. Written left-to-right, every option
          // reports the gap honestly.
          expect((v.errors ?? []).map((e) => e.kind)).toEqual(["reduction-shape"]);
        }
        // The model is complete and legal TODAY. What is not complete is emit, and the warnings say so — each
        // is a step in `tmp/PLAN-obesity-apply.md`, not a defect in the policy:
        //   `shape is` declared but not consulted for the DECLARING concept -> step 6
        //   cross-representation recency merge                              -> #257
        expect([...new Set((v.warnings ?? []).map((w) => w.kind))]).toEqual(["reduction-shape"]);
      });

      it("CRE — the truth table. ⚠ TWO ROWS FAIL; the expectation is the TARGET, not the behaviour", () => {
        const result = runCel(resolveCelImports(opt.cases)) as unknown as {
          success: boolean;
          runs?: { case: string; produced?: { recommendation: string }[] }[];
        };
        expect(result.success).toBe(true);
        for (const [name, mustProduce] of Object.entries(MUST_PRODUCE)) {
          const produced =
            (result.runs ?? []).find((r) => r.case === name)?.produced?.map((p) => p.recommendation) ?? [];
          const today = opt.producesToday[name]!;
          // Assert TODAY's value so a regression is caught, and say what it must become. When a fix lands,
          // this line moves to `mustProduce` — a deliberate, visible edit.
          const why = opt.name + " / " + name + " — must become " + JSON.stringify(mustProduce);
          expect(produced, why).toEqual([...today]);
        }
      });

      it("EMIT — ⚠ BOTH LANES REFUSE the canonical shape today", () => {
        // The charter makes a local `code is` the canonical production representation and a derivation over it
        // ordinary (`project_local-domain-is-canonical`, North Star §3). These concepts are exactly that — a
        // question that can also be computed. Emit rejects the combination.
        //
        // ⚠ MUST BECOME `success: true` with no `emit-mixed-code-and-definition`. Until then the chain cannot
        // reach `$apply` at all, which makes this — not `shape is` — the FIRST blocker on the path.
        const cql = emitCQLImports(opt.policy) as unknown as { success: boolean; cqlByLibrary?: unknown[] };
        expect(cql.success).toBe(false);
        expect(cql.cqlByLibrary ?? []).toHaveLength(0);

        const fhir = emitFhirDefFromPath(opt.policy, {
          date: new Date("2026-01-01T00:00:00.000Z"),
        }) as unknown as { success: boolean; errors?: { kind?: string }[] };
        expect(fhir.success).toBe(false);
        // ⚠ MEASURED, and narrower than the message says: the refused concepts are the ones deriving from
        // OTHER concepts (`Obese`, `BMI`). A leaf reducing over its OWN representations (`most recent this`)
        // is fine — that is the supported both-representation recency. So the real boundary is a local code
        // plus a CROSS-CONCEPT derivation, the ordinary shape of a question that can also be computed.
        const blocking = (fhir.errors ?? []).filter((e) => e.kind === opt.emitBlocker);
        expect(blocking.length, opt.name + " expected " + opt.emitBlocker).toBeGreaterThan(0);
      });
    });
  }

  it("⭐ ANSWER AT ANY LEVEL — the question walk follows the DEPENDENCY path (goal item 2)", () => {
    // A local `code is` IS an answer slot, so the questions a user is offered are every coded concept
    // reachable from the guard through the definitions. Two ways to answer come from TWO CODED CONCEPTS in
    // one chain, each with its own code — no code-sharing mechanism is needed for it.
    //
    // ⚠ MEASURED BEFORE THE FIX: this reached ONE concept in every option, because the walk followed only
    // `defined as` edges and the whole chain is `definition is` — goal item 2 silently absent, with no error
    // anywhere.
    //
    // ⚠ WHAT THIS ASSERTS IS REACHABILITY, and only that. It is a unit call on the collector, so it does NOT
    // prove an emitted questionnaire carries four items: the downstream consumers (`inputsByCondition`,
    // `resolveCaseFeatureRecord`, the emitted `action.input` and the StructureDefinitions) are unreachable
    // today because emit stops at `emit-mixed-code-and-definition`. Those get pinned when emit clears; saying
    // "four questions are offered" before then would be a claim about output nothing has produced.
    for (const opt of OPTIONS) {
      const built = buildCRL(readFileSync(opt.policy, "utf8")) as unknown as {
        result?: { library: { name: string }; statements: Concept[] };
      };
      const concepts = (built.result?.statements ?? []).filter(
        (s) => (s as { type?: string }).type === "Concept",
      );
      const byName = new Map<string, Concept>();
      const codeByConcept = new Map<string, string>();
      for (const c of concepts) {
        if (c.name) byName.set(c.name, c);
        if (c.name && c.code !== undefined) codeByConcept.set(c.name, String(c.code));
      }
      const reached = collectCodeIsConceptsInInferenceOrder(
        "Obese",
        built.result?.library.name ?? "",
        byName,
        codeByConcept,
      ).map((c) => c.name);
      expect(reached, opt.name).toEqual([...opt.reachableQuestions]);
    }
    // ⚠ And the walk is the DECISION'S path, not "every coded concept": the Layered option codes
    // `Greatest Weight` — a sibling reduction another library consumes — and it is correctly NOT offered
    // here, because this decision never reads it.
    const layered = OPTIONS.find((o) => o.name === "Layered")!;
    expect(layered.reachableQuestions).not.toContain("Greatest Weight");
  });
});