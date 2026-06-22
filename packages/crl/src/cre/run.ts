/**
 * CRE — CRL Clinical Reasoning Engine (#115), v1.
 *
 * A headless, authoring-time interpreter: evaluate a CRL `decision` over a CEL
 * `case`'s facts, produce a recommendation set + trace, and check the case's
 * `result is` assertion (the oracle). It MIRRORS the FHIR/CQL engine at the
 * CRL/CEL level for fast authoring feedback — it is NOT the engine.
 *
 * SCOPE:
 *  - Concept satisfaction is ASSERTED + COMPOSED:
 *      • asserted — a concept is satisfied when ≥1 of the case's (non-subject)
 *        facts is `defined by` it (resolved to a (library, name) identity);
 *      • composed (#126) — a concept with a `defined as` body is satisfied when
 *        its boolean composition over operand concepts evaluates true:
 *        `sem-and` = all, `sem-or` = any, `sem-not` = not (closed-world: absence
 *        ⇒ operand false), bare alias = the aliased concept, nesting supported.
 *      A concept that is BOTH directly `defined by` a fact AND `defined as` is
 *      satisfied if EITHER holds (asserted ∪ composed); the composition is still
 *      walked on the asserted path so its trace + diagnostics surface.
 *    Operand refs: a BARE operand resolves within the DEFINING concept's library
 *      (CRL's local-namespace rule); cross-library operands must be qualified. An
 *      operand resolving to neither a concept nor a fact emits a diagnostic
 *      (silent-false under `sem-not` would invert to a spurious `true`). Cyclic
 *      `defined as` (validator-rejected) terminates with a diagnostic and is not
 *      memoized. Still NOT evaluated (deferred): `definition is` predicates
 *      (count/temporal/value), `coded from` / external value sets.
 *  - Decision walk: `first:` (ordered, first match wins, short-circuit),
 *    `all:` (every matching branch fires), `any:`/`all:` over actions (members
 *    enter the produced set; qualifier recorded), `otherwise` (catch-all), and
 *    the per-action guards `unless "C"` / `only when "C"`.
 *  - Oracle: a decision-leaf `result is` passes iff the expected branch is in
 *    the produced set (membership — a case asserts one valid disposition).
 *  - `use decision` targets are produced as direct recommendations (their NAME),
 *    NOT recursed — matching the CEL validator's direct-arm model. Transitive
 *    recursion is deferred.
 */
import type { CELCase, CELDefinedByField, CELFact, CELResultField } from "../cel/ast/types";
import type { ResolvedCelGraph } from "../cel/imports/types";
import type {
  ActionGuard,
  ActionStatement,
  BlockBody,
  BlockMember,
  BlockQualifier,
  BranchBlock,
  CompositionExpression,
  Concept,
  CRL,
  Decision,
  DefinedAsBareRef,
  DefinedAsComposition,
  Location,
  ReferenceName,
  WhenBlockBody,
} from "../ast/types";
import { getRefLibrary, getRefName } from "../ast/types";
import type { LsLocation } from "../language-services/contracts";
import { toZeroBasedRange } from "../language-services/contracts";
// childId is single-sourced in ast/ (natural layer direction); re-exported here for existing consumers (viewModel, etc.).
import { childId } from "../ast/decisionSpine";
export { childId };

type Id = string;
// Injective key over (library, name). Names contain spaces (e.g. "Documented
// Nonunion"), so a space-joined key collides ("A B"+"C" vs "A"+"B C"); JSON makes
// it injective. We never parse an id back — readable forms use labelOf.
const idOf = (lib: string, name: string): Id => JSON.stringify([lib, name]);
const labelOf = (lib: string, name: string): string => `"${lib}"."${name}"`;

export interface ProducedRec {
  recommendation: string;
  viaWhen: string | null;
  qualifier: BlockQualifier | null;
}

/** Sub-evaluation of a `defined as` composition — so the trace shows WHY a
 *  composite was (un)satisfied (which operand failed), for adversarial review. */
export interface CompositionTrace {
  op: "sem-and" | "sem-or" | "sem-not" | "ref";
  satisfied: boolean;
  concept?: string; // op === "ref"
  operands?: CompositionTrace[]; // op === "sem-and" | "sem-or"
  operand?: CompositionTrace; // op === "sem-not"
  composition?: CompositionTrace; // op === "ref" to a composite — its own sub-evaluation
}

export interface TraceNode {
  node: string;
  /** Decision-relative structural path id (e.g. "when[0]/action[1]", "otherwise", "when[1]/when[0]") —
   *  stable across re-runs of an unchanged decision; the key the scenario view-model aligns run-state
   *  onto the AST by. Single-sourced with the view-model walker via the same index-path scheme. */
  nodeId: string;
  kind: "when" | "otherwise" | "action";
  /** Source span of the originating CRL AST node, in the covered library's file. */
  source: LsLocation;
  concept?: string;
  satisfied?: boolean;
  evaluated: boolean;
  guardedOut?: boolean;
  guard?: { polarity: "unless" | "only-when"; concept: string; satisfied: boolean; composition?: CompositionTrace };
  facts?: string[];
  /** Present when the `when`/guard concept is `defined as` a composition. */
  composition?: CompositionTrace;
  children?: TraceNode[];
}

export interface CaseRun {
  case: string;
  decision: string | null;
  status: "pass" | "fail" | "error";
  expected: { leaf: string; branch: string } | null;
  produced: ProducedRec[];
  trace: TraceNode[];
  diagnostics: string[];
}

export interface CelRunResult {
  success: boolean;
  runs: CaseRun[];
  errors: string[];
}

interface ConceptEntry {
  node: Concept;
  lib: string;
}

interface ConceptEval {
  sat: boolean;
  composition?: CompositionTrace;
}

interface Ctx {
  /** Concepts directly satisfied by a case fact (`defined by`). */
  directFacts: Set<Id>;
  factsByConcept: Map<Id, string[]>;
  /** All concept definitions in the closure, by id, with their owning library. */
  concepts: Map<Id, ConceptEntry>;
  coveredLib: string;
  /** Absolute path of the covered CRL library — the source file every decision tree node belongs to. */
  filePath: string;
  /** Per-case memo of concept satisfaction (composition can re-reference). */
  cache: Map<Id, ConceptEval>;
  /** Concepts currently on the evaluation stack — cycle guard. */
  stack: Set<Id>;
  /** Count of cycle-breaks; a node whose subtree hit a cycle is not memoized. */
  cycleHits: number;
  /** Operand ids already reported unresolvable (dedup diagnostics). */
  reportedUnresolved: Set<Id>;
  produced: ProducedRec[];
  trace: TraceNode[];
  diagnostics: string[];
}

/**
 * Satisfaction of a concept by id: directly asserted (a fact `defined by` it) OR
 * its `defined as` composition evaluates true. Memoized per case; cycle-guarded
 * (the validator forbids cyclic concept refs, but guard defensively so an
 * un-revalidated input can't infinite-loop — and don't memoize a result computed
 * through a cycle-break, so it can't poison a node satisfiable on another path).
 */
function evalConcept(id: Id, ctx: Ctx): ConceptEval {
  const cached = ctx.cache.get(id);
  if (cached) return cached;
  if (ctx.stack.has(id)) {
    const e = ctx.concepts.get(id);
    ctx.diagnostics.push(
      `composition cycle detected at concept ${e ? labelOf(e.lib, e.node.name) : id} — treated as unsatisfied`,
    );
    ctx.cycleHits++;
    return { sat: false };
  }
  ctx.stack.add(id);
  const cyclesBefore = ctx.cycleHits;
  const entry = ctx.concepts.get(id);
  const direct = ctx.directFacts.has(id);
  let composition: CompositionTrace | undefined;
  let composed = false;
  const def = entry?.node.definition;
  if (def && def.type === "DefinedAsDefinition") {
    composition = walkDefinedAs(def.body, entry!.lib, ctx);
    composed = composition.satisfied;
  }
  ctx.stack.delete(id);
  const result: ConceptEval = { sat: direct || composed, ...(composition ? { composition } : {}) };
  if (ctx.cycleHits === cyclesBefore) ctx.cache.set(id, result); // memoize cycle-free evals only
  return result;
}

function walkDefinedAs(body: DefinedAsBareRef | DefinedAsComposition, lib: string, ctx: Ctx): CompositionTrace {
  return body.type === "DefinedAsBareRef" ? refTrace(body.ref, lib, ctx) : walkExpr(body.expression, lib, ctx);
}

/** A composition operand reference resolves against the DEFINING concept's
 *  library when unqualified (`lib`), or its explicit qualifier when present. */
function refTrace(ref: ReferenceName, lib: string, ctx: Ctx): CompositionTrace {
  const refLib = getRefLibrary(ref) ?? lib;
  const name = getRefName(ref);
  const id = idOf(refLib, name);
  if (!ctx.concepts.has(id) && !ctx.directFacts.has(id) && !ctx.reportedUnresolved.has(id)) {
    // Resolves to neither a concept nor a fact — unresolvable. Flag it: a silent
    // false under `sem-not` would invert to a spurious `true`. (A bare operand is
    // LOCAL to the defining library; cross-library operands must be qualified.)
    ctx.reportedUnresolved.add(id);
    ctx.diagnostics.push(`composition operand ${labelOf(refLib, name)} resolves to no concept or fact`);
  }
  const ev = evalConcept(id, ctx);
  return {
    op: "ref",
    concept: name,
    satisfied: ev.sat,
    ...(ev.composition ? { composition: ev.composition } : {}),
  };
}

function walkExpr(expr: CompositionExpression, lib: string, ctx: Ctx): CompositionTrace {
  switch (expr.type) {
    case "SemAndExpression": {
      const operands = expr.terms.map((t) => walkExpr(t, lib, ctx));
      return { op: "sem-and", operands, satisfied: operands.every((o) => o.satisfied) };
    }
    case "SemOrExpression": {
      const operands = expr.terms.map((t) => walkExpr(t, lib, ctx));
      return { op: "sem-or", operands, satisfied: operands.some((o) => o.satisfied) };
    }
    case "SemNotExpression": {
      const operand = walkExpr(expr.expression, lib, ctx);
      return { op: "sem-not", operand, satisfied: !operand.satisfied };
    }
    case "CompositionGroup":
      return walkExpr(expr.expression, lib, ctx); // parentheses are transparent
    case "CompositionRef":
      return refTrace(expr.ref, lib, ctx);
  }
}

function conceptSatisfied(
  ref: ReferenceName,
  ctx: Ctx,
): { sat: boolean; facts: string[]; composition?: CompositionTrace } {
  // A `when`/guard ref resolves against the covered decision's library when bare.
  const id = idOf(getRefLibrary(ref) ?? ctx.coveredLib, getRefName(ref));
  const ev = evalConcept(id, ctx);
  return {
    sat: ev.sat,
    facts: ctx.factsByConcept.get(id) ?? [],
    ...(ev.composition ? { composition: ev.composition } : {}),
  };
}

export function recName(action: ActionStatement["action"]): string {
  return action.type === "RecommendActivity"
    ? getRefName(action.activityName)
    : getRefName(action.decisionName);
}

/** A guard EXCLUDES an item when `unless C` and C holds, or `only when C` and C does not hold. */
function evalGuard(
  guard: ActionGuard | undefined,
  ctx: Ctx,
): { excluded: boolean; info?: TraceNode["guard"] } {
  if (!guard) return { excluded: false };
  const { sat, composition } = conceptSatisfied(guard.conceptName, ctx);
  const excluded = guard.polarity === "unless" ? sat : !sat;
  return {
    excluded,
    info: {
      polarity: guard.polarity,
      concept: getRefName(guard.conceptName),
      satisfied: sat,
      ...(composition ? { composition } : {}),
    },
  };
}

/** Source span of an AST node in the covered library file. */
const spanOf = (loc: Location, ctx: Ctx): LsLocation => ({ filePath: ctx.filePath, range: toZeroBasedRange(loc) });

function executeBody(body: WhenBlockBody, viaWhen: string | null, ctx: Ctx, into: TraceNode[], parentId: string): void {
  if (body.type === "ActionStatement") {
    // Inline single action — the grammar forbids a guard here.
    ctx.produced.push({ recommendation: recName(body.action), viaWhen, qualifier: null });
    into.push({
      node: recName(body.action),
      nodeId: childId(parentId, "action[0]"),
      kind: "action",
      source: spanOf(body.location, ctx),
      evaluated: true,
    });
    return;
  }
  const block: BlockBody = body;
  const isBranch = block.statements.some((m) => m.type === "WhenBlock" || m.type === "OtherwiseBlock");
  if (isBranch) {
    walkBranches(block.qualifier, block.statements as BranchBlock[], ctx, into, parentId);
    return;
  }
  // Action menu (`any:` / `all:` / single).
  let produced = 0;
  (block.statements as ActionStatement[]).forEach((stmt, j) => {
    const name = recName(stmt.action);
    const nodeId = childId(parentId, `action[${j}]`);
    const source = spanOf(stmt.location, ctx);
    const g = evalGuard(stmt.guard, ctx);
    if (g.excluded) {
      into.push({ node: name, nodeId, kind: "action", source, evaluated: true, guardedOut: true, guard: g.info });
      return;
    }
    ctx.produced.push({ recommendation: name, viaWhen, qualifier: block.qualifier ?? null });
    into.push({ node: name, nodeId, kind: "action", source, evaluated: true, ...(g.info ? { guard: g.info } : {}) });
    produced++;
  });
  if (produced === 0 && block.statements.length > 0) {
    ctx.diagnostics.push(
      `every option in the menu under "${viaWhen ?? "otherwise"}" was guarded out — branch produced nothing`,
    );
  }
}

function walkBranches(
  qualifier: BlockQualifier | undefined,
  branches: BranchBlock[],
  ctx: Ctx,
  into: TraceNode[],
  parentId: string,
): void {
  // `all:` = every matching branch fires; `first:` (or a single-member block) = ordered, first match wins.
  const ordered = qualifier !== "all";
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    if (b.type === "OtherwiseBlock") {
      const nodeId = childId(parentId, "otherwise");
      const node: TraceNode = {
        node: "otherwise",
        nodeId,
        kind: "otherwise",
        source: spanOf(b.location, ctx),
        evaluated: true,
        children: [],
      };
      into.push(node);
      executeBody(b.body, null, ctx, node.children!, nodeId);
      if (ordered) return;
      continue;
    }
    const { sat, facts, composition } = conceptSatisfied(b.conceptName, ctx);
    const nodeId = childId(parentId, `when[${i}]`);
    const node: TraceNode = {
      node: `when ${getRefName(b.conceptName)}`,
      nodeId,
      kind: "when",
      source: spanOf(b.location, ctx),
      concept: getRefName(b.conceptName),
      satisfied: sat,
      evaluated: true,
      facts,
      ...(composition ? { composition } : {}),
      children: [],
    };
    into.push(node);
    if (sat) {
      executeBody(b.body, getRefName(b.conceptName), ctx, node.children!, nodeId);
      if (ordered) return; // first match wins — remaining branches are not evaluated.
    }
  }
}

function runCase(
  c: CELCase,
  decisions: Map<string, Decision>,
  facts: Map<string, CELFact>,
  coveredLib: string,
  filePath: string,
  concepts: Map<Id, ConceptEntry>,
): CaseRun {
  const diagnostics: string[] = [];
  let subjectFact: string | undefined;
  const factRefs: string[] = [];
  let result: CELResultField | undefined;
  for (const b of c.body) {
    if (b.type === "CELSubjectField") subjectFact = b.factName;
    else if (b.type === "CELFactRefField") factRefs.push(b.factName);
    else if (b.type === "CELResultField") result = b; // v1: single decision-result assertion
  }

  // Build the directly-asserted concept set from the case's clinical (non-subject) facts.
  const directFacts = new Set<Id>();
  const factsByConcept = new Map<Id, string[]>();
  for (const fn of factRefs) {
    if (fn === subjectFact) continue;
    const fact = facts.get(fn);
    if (!fact) {
      diagnostics.push(`unknown fact "${fn}"`);
      continue;
    }
    const db = fact.body.find((x): x is CELDefinedByField => x.type === "CELDefinedByField");
    if (!db) continue; // a fact with no `defined by` satisfies no concept
    const name = getRefName(db.ref);
    if (name === "Patient") continue; // subject-type fact never satisfies a clinical concept
    const i = idOf(getRefLibrary(db.ref) ?? coveredLib, name);
    directFacts.add(i);
    const arr = factsByConcept.get(i) ?? [];
    arr.push(fn);
    factsByConcept.set(i, arr);
  }

  if (!result || result.value.type !== "CELBranchResult") {
    return {
      case: c.name,
      decision: null,
      status: "error",
      expected: null,
      produced: [],
      trace: [],
      diagnostics: [...diagnostics, "v1 CRE supports only a decision-branch `result is`"],
    };
  }
  const decisionName = result.leafName;
  const expectedBranch = result.value.branchName;
  const decision = decisions.get(decisionName);
  if (!decision) {
    return {
      case: c.name,
      decision: decisionName,
      status: "error",
      expected: { leaf: decisionName, branch: expectedBranch },
      produced: [],
      trace: [],
      diagnostics: [...diagnostics, `decision "${decisionName}" not found in the covered library`],
    };
  }

  const ctx: Ctx = {
    directFacts,
    factsByConcept,
    concepts,
    coveredLib,
    filePath,
    cache: new Map(),
    stack: new Set(),
    cycleHits: 0,
    reportedUnresolved: new Set(),
    produced: [],
    trace: [],
    diagnostics,
  };
  walkBranches(decision.body.qualifier, decision.body.statements, ctx, ctx.trace, "");

  const producedNames = new Set(ctx.produced.map((p) => p.recommendation));
  const status: CaseRun["status"] = producedNames.has(expectedBranch) ? "pass" : "fail";
  return {
    case: c.name,
    decision: decisionName,
    status,
    expected: { leaf: decisionName, branch: expectedBranch },
    produced: ctx.produced,
    trace: ctx.trace,
    diagnostics: ctx.diagnostics,
  };
}

/** Run every case in a resolved CEL graph against its covered CRL decision(s). */
export function runCel(graph: ResolvedCelGraph): CelRunResult {
  const errors: string[] = [];
  if (!graph.cel) return { success: false, runs: [], errors: ["CEL did not parse"] };
  if (!graph.coversTarget) return { success: false, runs: [], errors: ["`covers` target unresolved"] };

  const coveredLib = graph.coversTarget.name;
  if (coveredLib === null) {
    return { success: false, runs: [], errors: ["covered library has no name"] };
  }
  const decisions = new Map<string, Decision>();
  for (const s of graph.coversTarget.ast.statements) {
    if (s.type === "Decision") decisions.set(s.name, s);
  }

  // Concept definitions across the resolved closure — needed to evaluate
  // `defined as` operands (bare = local to the defining library; qualified =
  // an explicit library). Built from the covered library (covers the inline-
  // graph path where crlRegistry is absent) plus every registry entry when
  // present. Precedence: package first, then local, then the covered library
  // last — so a local/covered concept wins over a same-named package library.
  const concepts = new Map<Id, ConceptEntry>();
  const addConcepts = (libName: string, ast: CRL): void => {
    for (const s of ast.statements) {
      if (s.type === "Concept") concepts.set(idOf(libName, s.name), { node: s, lib: libName });
    }
  };
  if (graph.crlRegistry) {
    for (const e of graph.crlRegistry.byNamePackage.values()) if (e.name) addConcepts(e.name, e.ast);
    for (const e of graph.crlRegistry.byNameLocal.values()) if (e.name) addConcepts(e.name, e.ast);
  }
  addConcepts(coveredLib, graph.coversTarget.ast);

  const facts = new Map<string, CELFact>();
  for (const s of graph.cel.statements) {
    if (s.type === "CELFact") facts.set(s.name, s);
  }

  const filePath = graph.coversTarget.filePath;
  const runs: CaseRun[] = [];
  for (const s of graph.cel.statements) {
    if (s.type === "CELCase") runs.push(runCase(s, decisions, facts, coveredLib, filePath, concepts));
  }
  return { success: true, runs, errors };
}
