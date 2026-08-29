import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import type { CRL, BranchCondition, Decision } from "../types";
import { collectGuardDefines, guardDefineNameCollisions, needsGuardDefine } from "../guardDefines";

/**
 * #189 — which branch guards need a NAMED define, and which lower directly.
 *
 * ⚠ This predicate is the EXACT complement of `priorityExclusions`' dispatch (`fhir-emitter/decision.ts`),
 * and the whole mechanism rests on them agreeing. A shape that neither lowers directly NOR gets a define
 * emits no exclusion at all, and no exclusion leaves the later `otherwise` UNCONDITIONAL — which DENIES
 * when the prior is unknown. A shape that gets a define nothing references leaves an orphan in the library.
 *
 * The cross-lane consequence is measured in `cql-emitter/tests/guardDefineBothLanes.test.ts`; this file
 * pins the classification itself, shape by shape, where a regression is cheap to read.
 */

const LOC = { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } };
const ref = (name: string): BranchCondition => ({ type: "BranchConditionRef", ref: name, location: LOC });
const critRef = (name: string): BranchCondition =>
  ({ type: "BranchConditionCriterionRef", ref: name, location: LOC }) as BranchCondition;
const not = (operand: BranchCondition): BranchCondition => ({ type: "BranchConditionNot", operand, location: LOC });
const and = (...operands: BranchCondition[]): BranchCondition =>
  ({ type: "BranchConditionAnd", operands, location: LOC }) as BranchCondition;
const or = (...operands: BranchCondition[]): BranchCondition =>
  ({ type: "BranchConditionOr", operands, location: LOC }) as BranchCondition;

describe("#189 needsGuardDefine — the shapes whose negation cannot lower to one action's conditions", () => {
  it("lowers DIRECTLY: an atom, a `not <atom>`, and an `or` of atoms", () => {
    // ¬atom is one condition; ¬¬G = G is one condition; De Morgan turns ¬(A or B) into a CONJUNCTION,
    // which `$apply` ANDs. All exact, no define needed.
    expect(needsGuardDefine(ref("A"))).toBe(false);
    expect(needsGuardDefine(critRef("Elig"))).toBe(false);
    expect(needsGuardDefine(not(ref("A")))).toBe(false);
    expect(needsGuardDefine(not(critRef("Elig")))).toBe(false);
    expect(needsGuardDefine(or(ref("A"), ref("B"), critRef("Elig")))).toBe(false);
  });

  it("needs a DEFINE: `and` — its negation is a disjunction, which one action's conditions cannot express", () => {
    expect(needsGuardDefine(and(ref("A"), ref("B")))).toBe(true);
    expect(needsGuardDefine(and(ref("A"), not(ref("B"))))).toBe(true);
  });

  it("needs a DEFINE: `not` over a COMPOUND — ¬¬(A or B) is the disjunction again", () => {
    // ⚠ The regression this pins: a predicate that recursed into the operand answered "lowers directly"
    // here (the inner `or` is atoms), while the dispatch has no arm for a `not` over a compound — so the
    // prior emitted NO exclusion and the `otherwise` went unconditional. The pause-killer, one shape over.
    expect(needsGuardDefine(not(or(ref("A"), ref("B"))))).toBe(true);
    expect(needsGuardDefine(not(and(ref("A"), ref("B"))))).toBe(true);
  });

  it("needs a DEFINE: a MIXED `or` — a per-operand exclusion would be partial, and partial is not enough", () => {
    // Emitting only the atom operands under-excludes: the later branch can still fire past an UNKNOWN
    // operand inside the non-atom one. The define is EXACT where the partial form is merely monotone-safe.
    expect(needsGuardDefine(or(ref("A"), and(ref("B"), ref("C"))))).toBe(true);
    expect(needsGuardDefine(or(ref("A"), or(ref("B"), ref("C"))))).toBe(true);
  });

  it("tolerates a malformed `not` with no operand rather than throwing", () => {
    // Reachable from the validator-free entries (an editor buffer mid-edit).
    expect(needsGuardDefine({ type: "BranchConditionNot", location: LOC } as unknown as BranchCondition)).toBe(true);
  });
});

const parse = (src: string): CRL => {
  const r = buildCRL(src);
  expect(r.success, JSON.stringify((r as { errors?: unknown }).errors ?? [])).toBe(true);
  return (r as unknown as { result: CRL }).result;
};

const POLICY = (extra: string): string => `library "GD".

concept "A":
- type is Observation.
- value type is boolean.
- code is \`a\`.

concept "B":
- type is Observation.
- value type is boolean.
- code is \`b\`.

activity "Approve":
- request CPGCommunicationRequest.
- with \`APPROVED\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`NOT APPROVED\`.
${extra}
decision "D":
first:
- when ( "A" and "B" ) then recommend activity "Approve".
- otherwise then recommend activity "Deny".
`;

describe("#189 collectGuardDefines — only PRIORS, only under `first:`", () => {
  it("names the compound prior of an ordered block", () => {
    const decisions = parse(POLICY("")).statements.filter((s): s is Decision => s.type === "Decision");
    expect(collectGuardDefines(decisions[0]!).map((g) => g.name)).toEqual([expect.stringMatching(/^Guard L\d+C\d+$/)]);
  });

  it("names nothing under `all:` — order carries no priority there, so there is nothing to exclude", () => {
    const src = POLICY("").replace("first:\n- when ( \"A\" and \"B\" )", "all:\n- when ( \"A\" and \"B\" )")
      .replace("- otherwise then recommend activity \"Deny\".", "- when \"A\" then recommend activity \"Deny\".");
    const decisions = parse(src).statements.filter((s): s is Decision => s.type === "Decision");
    expect(collectGuardDefines(decisions[0]!)).toEqual([]);
  });
});

describe("#189 guardDefineNameCollisions", () => {
  it("is a HARD ERROR when an authored declaration claims the generated name", () => {
    // The name is CRL-spellable, so an author CAN take it. Two `define`s of one name is a translation
    // failure at best; at worst the FHIR lane's `not <define>` negates the AUTHOR'S declaration instead
    // of the guard — a wrong disposition rather than a loud one.
    const ast = parse(POLICY(""));
    const generated = collectGuardDefines(
      ast.statements.filter((s): s is Decision => s.type === "Decision")[0]!,
    )[0]!.name;
    // ⚠ APPENDED, not prepended: the name is derived from the guard's source position, so a declaration
    // inserted above the decision would move the guard and generate a different name.
    const collided = parse(POLICY("") + `
criterion "` + generated + `":
- when ( "A" ).
`);
    const errors = guardDefineNameCollisions(collided);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.kind).toBe("guard-define-name-collision");
    expect(errors[0]!.message).toContain(generated);
  });

  it("is silent when nothing collides", () => {
    expect(guardDefineNameCollisions(parse(POLICY("")))).toEqual([]);
  });
});
