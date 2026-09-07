// REFACTOR:grounded (#320, review 563): incomplete criterion graphs refuse emission;
// complete deep closures remain usable and unresolved priority references diagnose once.
// #236 — criterion EMIT wiring (FHIR decision lane). A `criterion` guard ref no longer inline-
// EXPANDS at `emitWhenBlock`. It lowers to a NAMED boolean CQL define, and the decision guard
// references it BY NAME via a single `text/cql-identifier` applicability condition (the same shape
// a concept ref uses). The invariants proved here:
//   1. a compound/sole/nested criterion → ONE applicability condition naming the CRITERION (never
//      its expanded body, never collapsed to an inner concept);
//   2. a criterion mixed into an `and`/`or`/`not` guard contributes ONE signed literal (one arm /
//      one condition), so the guard stays linear in distinct criteria — no DNF blow-up;
//   3. a deep doubling-chain criterion emits LINEARLY (no atom-cap, no `criterion-expansion-overflow`);
//   4. the decision lane does NOT resolve a criterion's BODY concepts — that is the CQL/interface
//      lane's concern — so an unresolved concept inside a criterion body does not suppress the guard.
// Fixed `LOC`/clock make the emitted resources exact.

import { describe, expect, it } from "vitest";

import type {
  Action,
  BranchBlock,
  BranchCondition,
  Criterion,
  Decision,
  RecommendActivity,
  WhenBlock,
  WhenBlockBody,
  ReferenceName,
} from "../../ast/types";
import { buildCriterionTable } from "../../ast/criterionExpansion";
import { buildCriterionIndex, CRITERION_INDEX_MAX_DEPTH } from "../../ast/criterionIndex";
import { foreignCriterionMessage } from "../../ast/criterionDiagnostics";
import {
  type ActivityResolver,
  type ConceptResolver,
  type DecisionResolver,
  type PublicationGuardTargetResolver,
  emitDecisionPlanDefinition,
} from "../decision";
import type { CpgMetadata } from "../types";

const LOC = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } as const;
const FIXED_CLOCK = () => new Date("2026-06-04T15:30:00.000Z");

const METADATA: CpgMetadata = {
  version: "1.0.0",
  name: "lib",
  title: "Lib",
  description: "Test library",
  publisher: "Smile Digital Health",
  contact: [],
  canonicalBase: "http://example.org/sdh/demo",
  status: "draft",
  experimental: true,
  jurisdiction: [],
  useContext: [],
};

const RESOLVE_ALL: ConceptResolver = (ref) => (typeof ref === "string" ? ref : ref.name);
const RESOLVE_ACT_OK: ActivityResolver = (ref) =>
  `${METADATA.canonicalBase}/PlanDefinition/lib-${(typeof ref === "string" ? ref : ref.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}-recommendation`;
const RESOLVE_DEC_OK: DecisionResolver = (ref) =>
  `${METADATA.canonicalBase}/PlanDefinition/lib-${(typeof ref === "string" ? ref : ref.name).toLowerCase()}`;

function recommend(name: string): RecommendActivity {
  return { type: "RecommendActivity", activityName: name, location: LOC };
}
function leaf(action: Action): WhenBlockBody {
  return { type: "ActionStatement", action, location: LOC };
}
function refC(ref: string): BranchCondition {
  return { type: "BranchConditionRef", ref, location: LOC };
}
function andC(...operands: BranchCondition[]): BranchCondition {
  return { type: "BranchConditionAnd", operands, location: LOC };
}
function orC(...operands: BranchCondition[]): BranchCondition {
  return { type: "BranchConditionOr", operands, location: LOC };
}
function notC(operand: BranchCondition): BranchCondition {
  return { type: "BranchConditionNot", operand, location: LOC };
}
function critRefC(name: string): BranchCondition {
  return { type: "BranchConditionCriterionRef", ref: name, location: LOC };
}
function whenC(condition: BranchCondition, body: WhenBlockBody): WhenBlock {
  return { type: "WhenBlock", condition, body, location: LOC };
}
function criterion(name: string, condition: BranchCondition): Criterion {
  return { type: "Criterion", name, condition, location: LOC };
}
function decision(name: string, statements: BranchBlock[], qualifier?: "first" | "all" | "any"): Decision {
  return {
    type: "Decision",
    name,
    body: { type: "DecisionBody", statements, location: LOC, ...(qualifier !== undefined ? { qualifier } : {}) },
    location: LOC,
  };
}

type EmitResult = { resource: PlanDefLike | null; errors: { kind: string }[]; unmatched: { kind: string }[] };
type CondExpr = { language: string; expression: string };
type ActionLike = { title?: string; condition?: { expression?: CondExpr }[]; action?: ActionLike[]; definitionCanonical?: string };
type PlanDefLike = { action?: ActionLike[]; library?: string[] };

function emit(d: Decision, table: Criterion[] = [], resolver: ConceptResolver = RESOLVE_ALL, isPublication: (ref: ReferenceName) => boolean = () => false, publicationTarget?: PublicationGuardTargetResolver, activityResolver: ActivityResolver = RESOLVE_ACT_OK): EmitResult {
  const r = emitDecisionPlanDefinition(
    d,
    "Lib",
    METADATA,
    resolver,
    activityResolver,
    RESOLVE_DEC_OK,
    true,
    { clock: FIXED_CLOCK },
    undefined,
    undefined,
    buildCriterionTable(table),
    undefined,
    isPublication,
    publicationTarget,
  );
  return { resource: (r.resource?.resource ?? null) as PlanDefLike | null, errors: r.errors, unmatched: r.unmatched };
}

// Every `text/cql-*` condition expression in the emitted resource, in DFS order (across nested arms).
function conditionExprs(resource: PlanDefLike | null): CondExpr[] {
  const out: CondExpr[] = [];
  const walk = (a: ActionLike): void => {
    for (const c of a.condition ?? []) if (c.expression) out.push(c.expression);
    for (const child of a.action ?? []) walk(child);
  };
  for (const a of resource?.action ?? []) walk(a);
  return out;
}
// Every action title in DFS order (a leaf-action title == the emitted CQL identifier it references).
function actionTitles(resource: PlanDefLike | null): string[] {
  const out: string[] = [];
  const walk = (a: ActionLike): void => {
    if (a.title !== undefined) out.push(a.title);
    for (const child of a.action ?? []) walk(child);
  };
  for (const a of resource?.action ?? []) walk(a);
  return out;
}

describe("#236 — criterion emit: named define reference (not expansion)", () => {
  // REFACTOR:grounded (#320, review 563 r5): gather all located criterion failures
  // before emitting a refused Decision; failed branch attempts do not add dependencies.
  it("reports distinct invalid criterion sites without resolving branches or priority complements", () => {
    const located = (name: string, line: number): BranchCondition => ({ ...critRefC(name), location: { start: { line, column: 2 }, end: { line, column: 3 } } });
    const table = [criterion("BrokenA", critRefC("MissingA")), criterion("BrokenB", critRefC("MissingB"))];
    const d = decision("Top", [whenC(orC(located("BrokenA", 10), located("BrokenB", 11)), leaf(recommend("Act"))),
      whenC(refC("Unresolved"), leaf(recommend("Later")))], "first");
    const calls: ReferenceName[] = [];
    const result = emit(d, table, (ref) => { calls.push(ref); return null; });
    expect(result.resource).toBeNull();
    expect(result.errors).toMatchObject([
      { kind: "criterion-guard-unavailable", line: 10, column: 2 },
      { kind: "criterion-guard-unavailable", line: 11, column: 2 },
    ]);
    expect(result.unmatched).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("reports a cyclic criterion and its nested foreign reference at their authored locations", () => {
    const foreign: BranchCondition = { type: "BranchConditionCriterionRef", ref: { type: "QualifiedReference", libraryName: "Foreign", name: "Ready", location: LOC }, location: { start: { line: 3, column: 2 }, end: { line: 3, column: 3 } } };
    const table = [criterion("Loop", orC(foreign, critRefC("Loop")))];
    const d = decision("Top", [whenC({ ...critRefC("Loop"), location: { start: { line: 8, column: 2 }, end: { line: 8, column: 3 } } }, leaf(recommend("Act")))]);
    const result = emit(d, table);
    expect(result.resource).toBeNull();
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "criterion-guard-unavailable", line: 8, message: expect.stringContaining("has cycle") }),
      expect.objectContaining({ kind: "criterion-guard-unavailable", line: 3, message: foreignCriterionMessage('"Foreign"."Ready"') }),
    ]));
    expect(result.unmatched).toEqual([]);
  });

  it.each(["all", "first"] as const)("retains a suppressed branch's foreign dependency only if a surviving %s action needs it", (qualifier) => {
    const foreign: BranchCondition = { type: "BranchConditionRef", ref: { type: "QualifiedReference", libraryName: "Foreign", name: "Answer", location: LOC }, location: LOC };
    const canonical = "http://example.org/Library/ForeignInferences";
    const d = decision("Top", [whenC(foreign, leaf(recommend("Missing"))), whenC(refC("Photo"), leaf(recommend("Act")))], qualifier);
    const result = emit(d, [], RESOLVE_ALL, (ref) => typeof ref !== "string", () => ({ libraryName: "ForeignInferences", define: "Answer", canonical }),
      (ref) => ref === "Missing" ? null : RESOLVE_ACT_OK(ref));
    expect(result.resource).not.toBeNull();
    expect(result.resource!.library!.includes(canonical)).toBe(qualifier === "first");
    expect(conditionExprs(result.resource).some((item) => item.expression.includes("ForeignInferences"))).toBe(qualifier === "first");
  });

  it("keeps the existing unresolved diagnostic for a missing criterion index entry", () => {
    const result = emit(decision("Top", [whenC(orC(refC("Photo"), critRefC("Absent")), leaf(recommend("Act")))]));
    expect(result.resource).toBeNull();
    expect(result.unmatched).toMatchObject([{ kind: "unresolved-criterion" }]);
  });
  it("does not turn the complete-closure depth label into an authoring limit", () => {
    const table = [criterion("C0", refC("Photo"))];
    const depth = CRITERION_INDEX_MAX_DEPTH + 2;
    for (let i = 1; i <= depth; i++) table.push(criterion(`C${i}`, critRefC(`C${i - 1}`)));
    expect(buildCriterionIndex(table).get(`C${depth}`)!.status).toBe("depth-exceeded");
    const result = emit(decision("Top", [whenC(critRefC(`C${depth}`), leaf(recommend("Act")))]), table);
    expect(result.resource).not.toBeNull();
    expect(result.errors).toEqual([]);
  });
  it.each(["cycle", "undefined-dependency"])("refuses an incomplete criterion graph at the direct emitter: %s", (status) => {
    const table = [criterion("Ready", critRefC(status === "cycle" ? "Ready" : "Missing"))];
    const d = decision("Top", [whenC(orC(refC("Photo"), critRefC("Ready")), leaf(recommend("Act"))), whenC(refC("Photo"), leaf(recommend("Independent")))], "all");
    const result = emit(d, table);
    expect(result.resource).toBeNull();
    expect(result.errors).toMatchObject([{ kind: "criterion-guard-unavailable", line: 1, column: 0 }]);
  });
  it.each([false, true])("refuses a foreign-qualified criterion before local namesake binding (nested=%s)", (nested) => {
    const foreign: BranchCondition = { type: "BranchConditionCriterionRef", ref: { type: "QualifiedReference", libraryName: "Foreign", name: "Ready", location: LOC }, location: LOC };
    const table = [criterion("Ready", refC("Photo")), ...(nested ? [criterion("Outer", foreign)] : [])];
    const d = decision("Top", [whenC(nested ? critRefC("Outer") : foreign, leaf(recommend("Act"))), whenC(refC("Photo"), leaf(recommend("Later")))], "first");
    const result = emit(d, table);
    expect(result.resource).toBeNull();
    expect(result.errors).toMatchObject([{ kind: "criterion-guard-unavailable", message: expect.stringContaining('Foreign-qualified criterion "Foreign"."Ready"'), line: 1, column: 0 }]);
  });
  it("keeps self-qualified criterion references legal at the direct emitter", () => {
    const self: BranchCondition = { type: "BranchConditionCriterionRef", ref: { type: "QualifiedReference", libraryName: "Lib", name: "Ready", location: LOC }, location: LOC };
    const result = emit(decision("Top", [whenC(self, leaf(recommend("Act")))]), [criterion("Ready", refC("Photo"))]);
    expect(result.errors).toEqual([]); expect(result.resource).not.toBeNull();
  });
  it("dedupes the same unresolved publication reference revisited by a priority complement", () => {
    const d = decision("Top", [whenC(orC(refC("Photo"), refC("Missing")), leaf(recommend("Act"))), whenC(refC("Photo"), leaf(recommend("Later")))], "first");
    const result = emit(d, [], (ref) => ref === "Missing" ? null : typeof ref === "string" ? ref : ref.name, () => true);
    expect(result.unmatched).toEqual([{ kind: "unresolved-concept", text: '"Missing"', line: 1, column: 0 }]);
  });
  it("a compound criterion guard emits ONE applicability condition naming the CRITERION (not its body)", () => {
    // criterion "Eligible": - when ( "A" and ( "B" or "C" ) ). The guard references "Eligible" by
    // name — the body atoms A/B/C never appear as conditions in the decision lane (they live in the
    // criterion's own CQL define). A single arm, no DNF grouping.
    const elig = criterion("Eligible", andC(refC("A"), orC(refC("B"), refC("C"))));
    const via = decision("Top", [whenC(critRefC("Eligible"), leaf(recommend("Act")))]);
    const { resource, errors } = emit(via, [elig]);
    expect(errors).toEqual([]);
    const exprs = conditionExprs(resource);
    expect(exprs).toEqual([{ language: "text/cql-identifier", expression: "Eligible" }]);
    // The single guarded action is titled by the criterion (not a run-on of its body).
    expect(resource!.action).toHaveLength(1);
    expect(resource!.action![0]!.title).toBe("Eligible");
  });

  it("a SOLE-ref criterion still emits a named reference (does NOT collapse to its inner concept)", () => {
    // criterion "Solo": - when ( "A" ). The guard references "Solo", NOT "A" — a criterion is a named
    // define even when its body is a single concept (the reference is the reusable unit).
    const solo = criterion("Solo", refC("A"));
    const via = decision("Top", [whenC(critRefC("Solo"), leaf(recommend("Act")))]);
    const { resource, errors } = emit(via, [solo]);
    expect(errors).toEqual([]);
    expect(conditionExprs(resource)).toEqual([{ language: "text/cql-identifier", expression: "Solo" }]);
    expect(resource!.action![0]!.title).toBe("Solo");
  });

  it("a NESTED criterion (body references another criterion) emits a single reference to the OUTER (define→define DAG)", () => {
    // Inner = B or C; Outer = A and Inner. The guard references "Outer" — one condition. Inner is a
    // separate define referenced inside Outer's define body (CQL lane), never inlined here. Linear.
    const inner = criterion("Inner", orC(refC("B"), refC("C")));
    const outer = criterion("Outer", andC(refC("A"), critRefC("Inner")));
    const via = decision("Top", [whenC(critRefC("Outer"), leaf(recommend("Act")))]);
    const { resource, errors } = emit(via, [inner, outer]);
    expect(errors).toEqual([]);
    expect(conditionExprs(resource)).toEqual([{ language: "text/cql-identifier", expression: "Outer" }]);
  });

  it("a deep doubling-chain criterion emits LINEARLY (one reference, no overflow)", () => {
    // C0 = A and A; C_k = C_{k-1} and C_{k-1}. Inline expansion would materialize 2^(k+1) atoms
    // (C10 = 2048, past the retired 1024 cap). Post-flip the guard is ONE reference to "C10"; each
    // C_k is one define referencing its predecessor — no atom-cap, no `criterion-expansion-overflow`.
    const chain: Criterion[] = [criterion("C0", andC(refC("A"), refC("A")))];
    for (let k = 1; k <= 10; k++) {
      chain.push(criterion(`C${k}`, andC(critRefC(`C${k - 1}`), critRefC(`C${k - 1}`))));
    }
    const d = decision("Top", [whenC(critRefC("C10"), leaf(recommend("Act")))]);
    const { resource, errors } = emit(d, chain);
    expect(errors.map((e) => e.kind)).not.toContain("criterion-expansion-overflow");
    expect(errors).toEqual([]);
    expect(conditionExprs(resource)).toEqual([{ language: "text/cql-identifier", expression: "C10" }]);
  });
});

describe("#236 — criterion in compound guards (one signed literal, no DNF blow-up)", () => {
  it("`A and Elig` → ONE arm with TWO ANDed identifier conditions (the criterion is one literal)", () => {
    // Elig = B or C. If the criterion were expanded, `A and (B or C)` would DNF to two arms
    // (A∧B, A∧C). As a signed literal it stays ONE arm: conditions [A, Elig].
    const elig = criterion("Elig", orC(refC("B"), refC("C")));
    const via = decision("Top", [whenC(andC(refC("A"), critRefC("Elig")), leaf(recommend("Act")))]);
    const { resource, errors } = emit(via, [elig]);
    expect(errors).toEqual([]);
    expect(resource!.action).toHaveLength(1); // one arm, not a DNF `any` grouping
    expect(conditionExprs(resource)).toEqual([
      { language: "text/cql-identifier", expression: "A" },
      { language: "text/cql-identifier", expression: "Elig" },
    ]);
  });

  it("`A or Elig` → exactly TWO arms (A, Elig) — the criterion contributes ONE arm, not its body's arms", () => {
    // Elig = B or C. Expanded, `A or (B or C)` would be THREE arms. As a signed literal it is TWO:
    // arm "A" (condition A) and arm "Elig" (condition Elig).
    const elig = criterion("Elig", orC(refC("B"), refC("C")));
    const via = decision("Top", [whenC(orC(refC("A"), critRefC("Elig")), leaf(recommend("Act")))]);
    const { resource, errors } = emit(via, [elig]);
    expect(errors).toEqual([]);
    // Two DNF arms under the `any` grouping action.
    const group = resource!.action![0]!;
    expect(group.action).toHaveLength(2);
    expect(conditionExprs(resource)).toEqual([
      { language: "text/cql-identifier", expression: "A" },
      { language: "text/cql-identifier", expression: "Elig" },
    ]);
  });

  it("`not Elig` → a negated, library-qualified, NULL-PROPAGATING condition", () => {
    // A negated criterion literal in a BRANCH guard lowers to `not "<lib>"."<crit>"` as a
    // text/cql-expression — the same null-propagating shape a negated concept uses there.
    // #189: NOT `Coalesce`d. A criterion over unanswered questions is unknown, and an unknown
    // branch guard must make its arm not-applicable so traversal halts; coalescing would read
    // the unanswered case as "no" and fire the arm. (The per-action `unless` carrier still
    // Coalesces — see decision.test.ts — because an action guard must never pause.)
    const elig = criterion("Elig", orC(refC("B"), refC("C")));
    const via = decision("Top", [whenC(notC(critRefC("Elig")), leaf(recommend("Act")))]);
    const { resource, errors } = emit(via, [elig]);
    expect(errors).toEqual([]);
    expect(conditionExprs(resource)).toEqual([
      { language: "text/cql-expression", expression: 'not "lib"."Elig"' },
    ]);
    expect(resource!.action![0]!.title).toBe("not Elig");
  });

  it("`A and not Elig` → ONE arm with a positive identifier condition + a negated condition (mixed signed arm)", () => {
    // The mixed-signed arm is where a DNF/emit regression on the operand-level negated-criterion
    // literal would hide: a positive concept literal and a NEGATED criterion literal in one arm.
    const elig = criterion("Elig", orC(refC("B"), refC("C")));
    const via = decision("Top", [whenC(andC(refC("A"), notC(critRefC("Elig"))), leaf(recommend("Act")))]);
    const { resource, errors } = emit(via, [elig]);
    expect(errors).toEqual([]);
    expect(resource!.action).toHaveLength(1); // one arm — the criterion negation did not multiply arms
    expect(conditionExprs(resource)).toEqual([
      { language: "text/cql-identifier", expression: "A" },
      { language: "text/cql-expression", expression: 'not "lib"."Elig"' },
    ]);
  });

  // ⭐ #189 null/pause (panel disc 517) — a CRITERION prior must exclude its successors, exactly like a
  // concept prior. Skipping it was the §10 unsafe-approve defect ONE INDIRECTION away: a criterion ref is
  // ONE leaf (#236 — a named boolean define, never its inline expansion), so ¬<criterion> is a single
  // condition and there was never a reason it could not be emitted.
  it("a CRITERION prior excludes its successors (#189) — one negated condition, like a concept prior", () => {
    const elig = criterion("Elig", orC(refC("B"), refC("C")));
    const via = decision(
      "Top",
      [whenC(critRefC("Elig"), leaf(recommend("First"))), whenC(refC("A"), leaf(recommend("Act")))],
      "first",
    );
    const { resource, errors } = emit(via, [elig]);
    expect(errors).toEqual([]);
    expect(conditionExprs(resource)).toEqual([
      { language: "text/cql-identifier", expression: "Elig" },
      // branch 2's priority exclusion of the criterion prior — null-propagating, no Coalesce.
      { language: "text/cql-expression", expression: 'not "lib"."Elig"' },
      { language: "text/cql-identifier", expression: "A" },
    ]);
  });

  it("a NEGATED criterion prior excludes positively (¬¬G = G)", () => {
    const elig = criterion("Elig", orC(refC("B"), refC("C")));
    const via = decision(
      "Top",
      [whenC(notC(critRefC("Elig")), leaf(recommend("First"))), whenC(refC("A"), leaf(recommend("Act")))],
      "first",
    );
    const { resource, errors } = emit(via, [elig]);
    expect(errors).toEqual([]);
    expect(conditionExprs(resource)).toEqual([
      { language: "text/cql-expression", expression: 'not "lib"."Elig"' },
      { language: "text/cql-identifier", expression: "Elig" },
      { language: "text/cql-identifier", expression: "A" },
    ]);
  });

  it("`first:` placement — a criterion in a NON-first branch emits its reference in position", () => {
    // Branch 1: plain concept "A"; branch 2: criterion "Elig". Both emit as sibling arms; the
    // criterion branch carries its own "Elig" reference (not an expansion spliced in).
    const elig = criterion("Elig", orC(refC("B"), refC("C")));
    const via = decision(
      "Top",
      [whenC(refC("A"), leaf(recommend("First"))), whenC(critRefC("Elig"), leaf(recommend("Act")))],
      "first",
    );
    const { resource, errors } = emit(via, [elig]);
    expect(errors).toEqual([]);
    // The branch conditions, in order: the plain concept, then branch 2's PRIORITY EXCLUSION of it,
    // then the criterion reference.
    //
    // #189 null/pause — under an ordered `first:` a later branch carries the null-propagating negation
    // of its priors. Without it, an UNKNOWN `A` merely makes branch 1 not-applicable and branch 2 fires
    // anyway — the wrong ARM, with no Questionnaire generated (V4, `tmp/NOTES-apply-null-behavior.md` §8).
    // The criterion reference itself is untouched: it stays ONE positive `text/cql-identifier` literal.
    expect(conditionExprs(resource)).toEqual([
      { language: "text/cql-identifier", expression: "A" },
      { language: "text/cql-expression", expression: 'not "lib"."A"' },
      { language: "text/cql-identifier", expression: "Elig" },
    ]);
  });

  it("a criterion guard on a `use decision` branch emits its reference + the sub-decision definition path", () => {
    // Exercises the action.definition (sub-decision) emit path. The via-criterion branch references
    // "Elig" for applicability and delegates to "Sub".
    const useSub: WhenBlockBody = leaf({ type: "UseDecision", decisionName: "Sub", location: LOC });
    const elig = criterion("Elig", andC(refC("A"), refC("B")));
    const via = decision("Top", [whenC(critRefC("Elig"), useSub)]);
    const { resource, errors } = emit(via, [elig]);
    expect(errors).toEqual([]);
    expect(conditionExprs(resource)).toEqual([{ language: "text/cql-identifier", expression: "Elig" }]);
    expect(resource!.action![0]!.definitionCanonical).toBe("http://example.org/sdh/demo/PlanDefinition/lib-sub");
  });
});

describe("#236 — the decision lane does not resolve criterion BODIES", () => {
  it("an unresolved concept INSIDE a criterion body does NOT suppress the guard (that is the CQL lane's concern)", () => {
    // Post-flip the decision lane never resolves a criterion's body concepts — it only references the
    // criterion by name. So a criterion whose body references an unresolved concept still emits its
    // reference and SURVIVES here; the unresolved concept is caught by VALIDATION (referenceResolver's
    // `walkCriterion` resolves criterion-body atoms). On UNVALIDATED input the emit lanes are
    // resolution-blind here, which is acceptable per the lane contract. A DIRECT concept guard on the
    // same unresolved name still suppresses — the divergence proves the lane boundary.
    const resolveExceptMissing: ConceptResolver = (ref) => {
      const n = typeof ref === "string" ? ref : ref.name;
      return n === "Missing" ? null : n;
    };
    const elig = criterion("Elig", refC("Missing"));
    // Criterion-guarded branch (body unresolved) + a valid sibling → the criterion branch survives.
    const viaCrit = decision(
      "Top",
      [whenC(critRefC("Elig"), leaf(recommend("Gone"))), whenC(refC("A"), leaf(recommend("Kept")))],
      "first",
    );
    const crit = emit(viaCrit, [elig], resolveExceptMissing);
    expect(crit.errors).toEqual([]);
    expect(crit.unmatched).toEqual([]);
    const critJson = JSON.stringify(crit.resource);
    expect(critJson).toContain("lib-gone-recommendation"); // the criterion branch SURVIVES
    expect(critJson).toContain("lib-kept-recommendation");
    expect(conditionExprs(crit.resource)).toContainEqual({ language: "text/cql-identifier", expression: "Elig" });

    // A DIRECT unresolved concept guard, by contrast, still cascade-suppresses its branch.
    const viaDirect = decision(
      "Top",
      [whenC(refC("Missing"), leaf(recommend("Gone"))), whenC(refC("A"), leaf(recommend("Kept")))],
      "first",
    );
    const direct = emit(viaDirect, [], resolveExceptMissing);
    expect(direct.unmatched.map((u) => u.kind)).toContain("unresolved-concept");
    const directJson = JSON.stringify(direct.resource);
    expect(directJson).not.toContain("lib-gone-recommendation"); // suppressed
    expect(directJson).toContain("lib-kept-recommendation");
  });
});
