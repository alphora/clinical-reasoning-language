import * as path from "node:path";
import { readFileSync } from "node:fs";

import { describe, it, expect } from "vitest";

import { buildCRL, validateCRL } from "../index";
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
 *   Layered    ⭐ the expected CONVENTION: RecordSet -> Record -> calculated. Records reduce the named
 *              RecordSets; calculations use the Records. Each layer is expressed ONCE and referred to by the
 *              next — the local code and the posrep live on the history and are never restated. Assumes a
 *              library whose every layer some other library consumes.
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

interface AuthoringOption {
  readonly name: string;
  readonly policy: string;
  readonly cases: string;
  /** The locally-coded, single-record concepts — i.e. the questions the Questionnaire will carry. */
  readonly questions: readonly string[];
  /**
   * ⚠ Whether the policy validates with ZERO errors TODAY. The layered option does not, and the reason is a
   * true statement about the language rather than a defect in the policy — see its own assertion below.
   */
  readonly validatesCleanToday: boolean;
}

const OPTIONS: readonly AuthoringOption[] = [
  {
    name: "Record",
    policy: path.join(FIXTURE, "policy.crl"),
    cases: path.join(FIXTURE, "cases.cel"),
    questions: ["Obese", "BMI", "Height", "Weight"],
    validatesCleanToday: false,
  },
  {
    name: "RecordSet",
    policy: path.join(FIXTURE, "policy-recordset.crl"),
    cases: path.join(FIXTURE, "cases-recordset.cel"),
    questions: ["Obese"],
    validatesCleanToday: true,
  },
  {
    // ⭐ THE CONVENTION: RecordSet -> Record -> calculated, each layer expressed ONCE and referred to by
    // the next. Assumes an Obesity LIBRARY whose every layer some other library consumes.
    name: "Layered",
    policy: path.join(FIXTURE, "policy-layered.crl"),
    cases: path.join(FIXTURE, "cases-layered.cel"),
    // ⚠ MEASURED CONSEQUENCE of layering: the leaves stop being questions. The local code lives on the
    // RecordSet (assertable, a history) and the reduction on an uncoded Record, so only the calculated
    // layer is answerable. That is the trade the convention makes.
    questions: ["BMI", "Obese"],
    validatesCleanToday: false,
  },
];

/**
 * The acceptance criterion (operator, 2026-08-29), which ALL THREE options owe:
 *
 *   Obese = true       -> Approve
 *   Obese = false      -> Deny
 *   Obese = unanswered -> NO recommendation: pause and ask
 *
 * ⭐ The ONLY route to a Deny is a STATED false.
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

describe("#189 canonical target — the Obese/BMI chain", () => {
  it("the three options expose DIFFERENT question sets — the property the Questionnaire is built from", () => {
    // A QUESTION is a locally-coded concept publishing ONE record: `code is` + `shape is Record`. That is what
    // makes it an answerable, and a legal `cpg-featureExpression` target. So `shape is` is not decoration — it
    // decides how many questions a user is asked.
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
      const questions = (built.result?.statements ?? [])
        .filter((st) => st.type === "Concept" && st.code !== undefined && st.shape === "Record")
        .map((st) => st.name ?? "");
      expect(questions, opt.name).toEqual([...opt.questions]);
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
          const today = PRODUCES_TODAY[name]!;
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
        const mixed = (fhir.errors ?? []).filter((e) => e.kind === "emit-mixed-code-and-definition");
        expect(mixed.length).toBeGreaterThan(0);
      });
    });
  }
});
