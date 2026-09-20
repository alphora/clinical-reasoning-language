// REFACTOR:grounded: one compiler-only inventory names PlanDefinition conditions in both lanes.
// Nullable branch/priority complements and legacy action-unless have distinct carriers.
// Definitions follow the existing Criterion partition route; the action/input tree is unchanged.

import type {
  ActionGuard,
  BlockMember,
  BlockQualifier,
  BranchCondition,
  CRL,
  Criterion,
  Decision,
  Statement,
  WhenBlockBody,
} from "./types";
import type { CRLError } from "../types/errors";

/** One synthetic define: the name both lanes use, and the guard whose truth it names. */
export interface SyntheticGuardDefine {
  readonly name: string;
  readonly condition: BranchCondition;
  readonly planCondition?: { negated: boolean; carrier: "branch" | "action" };
}

/** A guard ATOM — a concept ref or a criterion ref. Both resolve to a bare CQL identifier naming a boolean
 *  define, so both are ONE leaf for exclusion purposes (#236: a criterion ref is a first-class guard literal,
 *  never its inline expansion). */
function isAtom(g: BranchCondition): boolean {
  return g.type === "BranchConditionRef" || g.type === "BranchConditionCriterionRef";
}

/**
 * The shapes whose negation `priorityExclusions` lowers DIRECTLY to conditions on one action.
 *
 * ⚠ This is the EXACT complement of the emitted dispatch, not an approximation of it, and the two must be
 * read together (`fhir-emitter/decision.ts`). An earlier version classified recursively — `not G` inherited
 * `G`'s answer, an `or` inherited its operands' — which is a DIFFERENT predicate: `not (A or B)` came back
 * "directly lowerable" while the dispatch has no arm for a `not` over a compound, so the prior emitted NO
 * exclusion at all and the later `otherwise` went unconditional. That is the pause-killer, one shape over.
 *
 * So: atom, `not <atom>`, and an `or` of atoms (De Morgan → a conjunction, which `$apply` ANDs). Everything
 * else — including a MIXED `or` — takes the named-define form, which is exact where a partial `or` exclusion
 * is merely monotone-safe.
 */
function directLowerablePriorGuard(g: BranchCondition): boolean {
  if (isAtom(g)) return true;
  if (g.type === "BranchConditionNot") return g.operand !== undefined && isAtom(g.operand);
  if (g.type === "BranchConditionOr") return g.operands.every((o) => isAtom(o));
  return false;
}

/**
 * True when ¬G cannot be expressed as conditions on a single action, so the guard must be NAMED and the
 * name negated.
 *
 * ⚠ Fail-closed means "gets a define", and it is deliberate: an unrecognised shape that is NAMED is computed
 * by the criterion-body emitter, which either renders it or fails loudly at CQL translation. An unrecognised
 * shape that is SKIPPED emits no exclusion, and no exclusion is a silent wrong disposition on unknown.
 */
export function needsGuardDefine(g: BranchCondition): boolean {
  return !directLowerablePriorGuard(g);
}

/**
 * The CQL define name for a guard. Derived from the guard's own source location so BOTH LANES compute the
 * same string from the same AST node, with no shared counter, index or traversal order to keep in step.
 */
/** REFACTOR:grounded: original source node + polarity + carrier identify a generated definition.
 * Partition rewriting retains this name; physical library qualification never enters its identity. */
export function planConditionDefineName(condition: BranchCondition, negated = false, carrier: "branch" | "action" = "branch"): string {
  const pos = condition.location.start;
  return (negated ? "Not " : "") + "CRL " + carrier + " " + condition.type.replace("BranchCondition", "") +
    " L" + pos.line + "C" + pos.column;
}

export function actionGuardCondition(guard: ActionGuard): BranchCondition {
  return { type: "BranchConditionRef", ref: guard.conceptName, location: guard.location };
}

export function guardDefineName(g: BranchCondition): string {
  return `Guard L${g.location.start.line}C${g.location.start.column}`;
}

/** Inventory compiler-only condition bodies for both emit lanes. Branch nodes have
 * nullable positive/negative carriers; action guards distinguish the totalized
 * unless carrier. Legacy compound-prior names remain independently available. */
export function collectGuardDefines(decision: Decision): SyntheticGuardDefine[] {
  const out: SyntheticGuardDefine[] = [];
  const seen = new Set<string>();

  const add = (g: BranchCondition): void => {
    const name = guardDefineName(g);
    const identity = name + "\0" + JSON.stringify(g);
    if (seen.has(identity)) return; // only identical bodies may share an inventory entry
    seen.add(identity);
    out.push({ name, condition: g });
  };

  // REFACTOR:grounded: inventory both polarities so CQL and FHIR cannot disagree after
  // DNF/priority lowering. Unused definitions add no actions, inputs or evaluations.
  const addCondition = (condition: BranchCondition, carrier: "branch" | "action"): void => {
    for (const negated of [false, true]) {
      const name = planConditionDefineName(condition, negated, carrier);
      // REFACTOR:grounded: retain conflicting bodies so collision validation can reject them.
      const identity = name + "\0" + JSON.stringify(condition);
      if (!seen.has(identity)) {
        seen.add(identity);
        out.push({ name, condition, planCondition: { negated, carrier } });
      }
    }
  };
  const walkCondition = (condition: BranchCondition): void => {
    addCondition(condition, "branch");
    if (condition.type === "BranchConditionNot") walkCondition(condition.operand);
    else if (condition.type === "BranchConditionAnd" || condition.type === "BranchConditionOr")
      condition.operands.forEach(walkCondition);
  };
  const walkBlock = (statements: readonly BlockMember[], qualifier: BlockQualifier | undefined): void => {
    statements.forEach((stmt, i) => {
      if (stmt.type === "ActionStatement") {
        if (stmt.guard) addCondition(actionGuardCondition(stmt.guard), "action");
        return;
      }
      if (stmt.type !== "WhenBlock" && stmt.type !== "OtherwiseBlock") return;
      if (stmt.type === "WhenBlock") {
        walkCondition(stmt.condition);
        if (qualifier === "first" && i < statements.length - 1 && needsGuardDefine(stmt.condition))
          add(stmt.condition);
      }
      walkBody(stmt.body);
    });
  };
  const walkBody = (body: WhenBlockBody | undefined): void => {
    if (body === undefined) return;
    if (body.type === "BlockBody") walkBlock(body.statements, body.qualifier);
    else if (body.guard) addCondition(actionGuardCondition(body.guard), "action");
  };

  walkBlock(decision.body.statements, decision.body.qualifier);
  return out;
}

/**
 * The synthetic guard defines for a whole source, expressed as `Criterion` statements.
 *
 * ⚠ A guard define IS a criterion in every respect except that the author did not name it: a decision-facing
 * boolean whose leaves render bare and which lowers to one `define`. So it is MODELLED as one, rather than
 * emitted from a second site with its own routing — the layered lane classifies `Criterion` into the
 * `Interface` layer (`classifyStatementLayer`), which is exactly the library the FHIR lane qualifies the
 * `not <define>` reference with, and the per-CRL lane emits every statement into its single library.
 *
 * That is not a convenience. A `Decision` statement classifies to NO layer — the layered lane drops it
 * deliberately, because the decision's surface is what the Interface layer RE-EXPORTS — so a guard define
 * emitted from the decision itself never reaches any emitted CQL library, while the FHIR lane still writes
 * the reference. The result is a DANGLING condition, which `$apply` treats as not-applicable: the precise
 * pause-killer this module exists to remove, reintroduced by the fix for it. (MEASURED 2026-08-29.)
 *
 * Emit-only, like `lowerLocalCodes`: the synthetics are appended to the emitter's working AST, never to the
 * AST the source round-trips from.
 */
export function synthesizeGuardCriteria(ast: CRL): Criterion[] {
  return synthesizeGuardDefinesFor(ast)
    .map((g) => ({
      type: "Criterion" as const,
      name: g.name,
      condition: g.condition,
      location: g.condition.location,
      ...(g.planCondition ? { __planCondition: g.planCondition } : {}),
    }));
}

/**
 * A synthetic guard define's name is an ordinary CRL-spellable identifier, so an author CAN declare a
 * concept, criterion or parameter that collides with one. Two `define`s of one name in a library is a CQL
 * translation failure at best; at worst the FHIR lane's `not <define>` silently negates the AUTHOR'S
 * declaration instead of the guard, which is a wrong disposition rather than a loud one.
 *
 * ⚠ So it is a hard error, raised BEFORE either lane emits, and raised in BOTH lanes — a FHIR-only emit
 * writes the reference just the same. Renaming the synthetic instead would be worse: the two lanes allocate
 * names independently, so an allocation either has to be threaded between them or re-derived identically on
 * both sides, and a name that MOVES is exactly the drift the source-location derivation exists to prevent.
 */
export function guardDefineNameCollisions(ast: CRL): CRLError[] {
  const generated = new Map<string, BranchCondition>();
  const errors: CRLError[] = [];
  for (const g of synthesizeGuardDefinesFor(ast)) {
    const prior = generated.get(g.name);
    // Two DISTINCT guards claiming one name. Within one parsed source their source locations differ, so
    // this is unreachable from an authored file — but the name is the only thing keeping the two lanes in
    // agreement, so a synthesized or merged AST that broke the assumption must not do it silently.
    if (prior !== undefined && JSON.stringify(prior) !== JSON.stringify(g.condition)) {
      errors.push({
        type: "Validation",
        kind: "guard-define-name-collision",
        line: g.condition.location.start.line,
        column: g.condition.location.start.column,
        message:
          `Two different compound branch guards both emit the guard define \`"${g.name}"\`. A guard ` +
          `define's name is derived from its source position, so this means two guards report the same ` +
          `position — the emitted CQL would carry one define where the FHIR lane expects two distinct ones.`,
      });
    }
    generated.set(g.name, g.condition);
  }
  if (generated.size === 0) return errors;
  for (const stmt of ast.statements) {
    const name = authoredTopLevelName(stmt);
    if (name === undefined) continue;
    const clash = generated.get(name);
    if (clash === undefined) continue;
    errors.push({
      type: "Validation",
      kind: "guard-define-name-collision",
      line: stmt.location?.start.line,
      column: stmt.location?.start.column,
      message:
        `\`${stmt.type.toLowerCase()} "${name}"\` collides with the name the emitter gives the compound ` +
        `branch guard at line ${clash.location.start.line}, column ${clash.location.start.column}. That ` +
        `guard's negation cannot be expressed as conditions on one action, so it is emitted as its own ` +
        `boolean define named after its source position — and two declarations cannot share one CQL ` +
        `identifier. Rename \`"${name}"\`.`,
    });
  }
  return errors;
}

/** The CQL top-level identifier a statement claims, if any. */
function authoredTopLevelName(stmt: Statement): string | undefined {
  if (stmt.type === "Concept" || stmt.type === "Criterion" || stmt.type === "Parameter") {
    const named = stmt as { name?: string };
    return named.name;
  }
  return undefined;
}

/** Every synthetic guard define across a source's decisions. */
function synthesizeGuardDefinesFor(ast: CRL): SyntheticGuardDefine[] {
  return ast.statements
    .filter((st): st is Decision => st.type === "Decision")
    .flatMap((d) => collectGuardDefines(d));
}
