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
  /**
   * The emit error kind that blocks this option today.
   *
   * ⚠ THIS PIN IS A RATCHET, NOT A CONSTANT — it records WHICH refusal is currently first, and it moves as
   * blockers clear. `emit-mixed-code-and-definition` ("`code is` + a definition is NOT LOWERED") is the
   * OUTER one; `emit-reduction-not-active` ("the merge lowers, but this concept runs a PRODUCER stage the
   * construction is not wired for") is strictly INSIDE it. So a move from the former to the latter is
   * PROGRESS: the concept now classifies as the both-representation merge and fails on a narrower, truer
   * thing. Moving the other way is a regression.
   */
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
    // ⭐⭐ MOVED AGAIN 2026-08-31 — the PRODUCER STAGE NOW LOWERS, so `BMI` no longer refuses at all. Its
    // constructed candidate is EXECUTION-VERIFIED against the real cqf engine (`tmp/nullprobe/bmiexec/`):
    // 90 kg / (1.7 m)^2 emits a candidate valued `31100 'g.m-2'` stamped MAY — the `Max` of Weight-May and
    // Height-Feb, per §5b — carrying the case-feature profile url, and a threshold over it constructs a
    // second candidate `true` at that same stamp.
    //
    // What blocks Record/Layered now is ONLY `Obese`'s source arm: a `type is Condition` posrep with
    // `value projection is exists this`, which `deriveOneSourceArm` still defers `out-of-scope`, so the merge
    // gets one descriptor where it needs `[local-exact, source]`. That is the NEXT slice, and the last one
    // between here and an end-to-end emit of these two options.
    emitBlocker: "emit-most-recent-derivation",
    reachableQuestions: ["Obese", "BMI", "Weight", "Height"],
  },
  {
    name: "RecordSet",
    policy: path.join(FIXTURE, "policy-recordset.crl"),
    cases: path.join(FIXTURE, "cases-recordset.cel"),
    singleValuedTargets: ["Obese"],
    validatesCleanToday: true,
    // ⚠ UNCHANGED KIND, DIFFERENT CONCEPT — and MEASURED, after a panel arm caught the earlier claim here
    // being false. `Obese` raises `emit-most-recent-derivation` in ALL THREE options (its Condition posrep
    // with `value projection is exists this` is identical across them, and descriptor derivation runs and
    // `continue`s BEFORE producer resolution is reached). What raises THIS kind is `BMI`, whose
    // `shape is RecordSet` reduces two HISTORIES.
    //
    // ⚠ That refusal is right for now but its KIND is wrong, and this slice is what made it wrong: the same
    // `code is` + definition mix now LOWERS for the Record option, so "NOT YET LOWERED" is no longer a true
    // statement about the form. The real blocker is that pairing two histories has no defined semantics —
    // which weight with which height. Re-kinding it is owed (panel round 1 item 5, round 2 item 10) and
    // needs the pairing question answered, not a relabel.
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
    // ⭐⭐ MOVED AGAIN 2026-08-31 — see the Record option. Same producer landing, same remaining blocker.
    emitBlocker: "emit-most-recent-derivation",
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

      it("⭐ CRE — the truth table. ALL THREE ROWS now meet the acceptance criterion", () => {
        // ⭐⭐ THE ROWS MOVED TO `MUST_PRODUCE` (2026-08-30, #189 P2). They were pinned to a wrong
        // a wrong status-quo pin because the CRE presence-satisfied a locally-coded concept — a stated FALSE read
        // true (the fact exists) and APPROVED, and an unanswered one read closed-world false and DENIED.
        // Both are gone: the CRE now evaluates the pipeline family off the CANDIDATE COLLECTION rather than
        // OR-ing a presence arm with a composition arm.
        const result = runCel(resolveCelImports(opt.cases)) as unknown as {
          success: boolean;
          runs?: {
            case: string;
            status?: string;
            produced?: { recommendation: string }[];
            diagnostics?: string[];
          }[];
        };
        expect(result.success).toBe(true);
        for (const [name, mustProduce] of Object.entries(MUST_PRODUCE)) {
          const run = (result.runs ?? []).find((r) => r.case === name);
          const produced = run?.produced?.map((p) => p.recommendation) ?? [];
          const why = opt.name + " / " + name;
          expect(produced, why).toEqual([...mustProduce]);

          // ⚠⚠ PIN `status`, NOT ONLY `produced`. A refusal DISCARDS `produced` and returns `[]`
          // (`cre/run.ts`, the `runtimeError` arm), so an engine that gave up would be BYTE-IDENTICAL to the
          // pause on the unanswered row — the one row `[]` is legitimately correct for. Without this the
          // acceptance marker could be "reached" by regressing.
          expect(run?.status, why + " — must not be an engine refusal").not.toBe("error");
          expect(
            (run?.diagnostics ?? []).filter((d) => d.includes("not evaluated by run_decision")),
            why + " — no refusal diagnostic",
          ).toEqual([]);
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
        // ⚠ MEASURED, and narrower than any message here says. The boundary is NOT "a local code plus a
        // cross-concept derivation" — that framing was true when this pin was `emit-mixed-code-and-definition`
        // for every option, and it stopped being true once the both-rep merge learned to lower that shape.
        // It is not "the producer stage" either: the producer LOWERS now, and `BMI` no longer refuses at all.
        //
        // What remains is `Obese`'s SOURCE ARM — a `type is Condition` posrep carrying `value projection is
        // exists this`, which `deriveOneSourceArm` defers `out-of-scope`, so the merge gets one descriptor
        // where it needs `[local-exact, source]`.
        //
        // ⭐ PROGRESS, 2026-08-31 — the LEAVES NOW LOWER. `Height`/`Weight` (`shape is Record` + `code is` +
        // `most recent this` + one `coded from` posrep) used to add `emit-reduction-not-active` to this list;
        // they no longer error at all. Their merge emits the two arms unioned into one collection with the
        // `definition is` stage selecting over it:
        //
        //     define "Height":
        //       Last( (LocalPrimitives."Height" union ExternalPrimitives."Height Source") O
        //               sort by (effective as FHIR.dateTime).value, id )
        //
        // EXECUTION-VERIFIED against the real CQL engine, not an emit diff: with a local answer (Jan) and a
        // source record (Jun), `Arm Count=2` and the newest across BOTH arms wins
        // (`tmp/nullprobe/hw-verify/`). ⚠ The library still emits NOTHING because `Obese`/`BMI` — the concepts
        // with a PRODUCER stage — still refuse, and one refusal fails the whole closure. So this assertion is
        // unchanged and correct; what shrank is WHY, and the remaining blocker is now exactly the producer
        // stage, not the leaves.
        //
        // ⭐ PROGRESS, 2026-08-31 (second) — `Obese` JOINED THEM. It reported the outer
        // `emit-mixed-code-and-definition` in all three options until a blanket `value projection` exclusion
        // was narrowed to the age lane it was actually written for. Its `type is Condition` + `value
        // projection is exists this` posrep is still refused DOWNSTREAM by `deriveOneSourceArm`
        // (`emit-most-recent-derivation`, probed at `tmp/nullprobe/projgate/`) — so the projection arm is
        // real remaining work — but the concept is no longer misreported as an unlowered shape.
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