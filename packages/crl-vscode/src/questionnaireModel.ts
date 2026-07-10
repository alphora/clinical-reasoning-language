// Pure, vscode-free `buildQuestionnaire` — the heart of the read-only Medical Validation questionnaire panel.
// #187 Todo 3: it now renders the FULL first:-chain question surface (not the pruned fired path) so the panel is
// FAITHFUL to what the emitted PlanDefinition asks under `$apply`: on-path decisions RECURSE, `first:`-preempted
// siblings show DIMMED (terminal), an inferred composite `when` EXPANDS its `defined as` leaves (from the shipped
// `conceptShape`), and every row shows a case-derived answer (on-path from the run; off-path from `conceptTruth`).
// Design authority: .vibe-tools/discussions/193-mv-panes-todo3-questionnaire-render-plan.md (+ its round-1 review).
//
// SCOPE — the "full first:-chain surface": on-path recursion + reached siblings (evaluated, shown) + first:-preempted
// siblings (dimmed terminal). A `when` in an UNREACHED subtree (under a terminal parent) is NOT shown (the parent is
// terminal) — by design. Leaf expansion fires ONLY for an ON-PATH (recursed) composite `when`.
//
// ANSWER SOURCING (MIX, disc 193 Q2): an EVALUATED `when` shows `condition.satisfied` (what actually FIRED); a PREEMPTED
// `when` + an expanded LEAF show `conceptTruth` — absent ⇒ UNKNOWN (render blank), NEVER "no" (the Todo-2 contract).
//
// NAV/GROUNDING (disc 193 Q4/Q5): only RUNTIME rows (whens + the blocked guard) are nav-stops + cross-pane markable
// (their `nodeId` grounds in `sv.tree` via `resolveThisNode`). Expanded LEAF rows render but are NOT nav-stops — a
// synthetic leaf id can't ground `driveThisNode` (that's Todo 5). This module imports ONLY types from the core.
import type { ConceptShapeNode, DefExprEntry, DefStructExpr, ScenarioViewModel, ViewNode, GuardView, ConditionView } from "@smile-digital-health/crl";
import { buildDefStruct, displayDetermination } from "@smile-digital-health/crl";

export type ConceptValueType = string;

/** The `defined as` OPERATOR tree projected for RENDER — the boolean structure the questionnaire draws as ANY OF /
 *  ALL OF boxes with `or`/`and` connectives, each leaf carrying the case's answer. Built POSITIONALLY (a shared
 *  concept appears at each written position; only a path cycle-guard, NOT the leaf collector's diamond dedup) +
 *  capped by depth/width. Distinct from `ConceptShapeNode` (the flat, operator-free `$apply` projection). */
export type QExpr =
  | { kind: "or" | "and"; operands: QExpr[] }
  | { kind: "not"; operand: QExpr } // operand ALWAYS rendered — a dropped `not` operand would vanish a $apply-asked criterion
  | {
      kind: "leaf";
      name: string;
      lib: string;
      answer: "yes" | "no" | "unknown";
      isSource: boolean;
      isInferred: boolean;
      valueType: ConceptValueType | null;
      /** A named-composite / both-rep operand's OWN `defined as` body, as a nested box (the operand is answerable AND expandable). */
      composite?: QExpr;
    }
  | { kind: "external"; name: string; lib: string } // a cross-library operand — NOT evaluated here (distinct from local "unknown")
  | { kind: "more"; count: number }; // width truncation (`+N more`) or, count 0, a depth-cap `…` stub

/** How a row was reached — drives dimming (`preempted` ⇒ dim) and is future-proof for unreached rows. */
export type Reach = "evaluated" | "preempted";
/** What KIND of row this is — drives nav-stop + diverter eligibility + the leaf/guard render. */
export type RowKind = "when-evaluated" | "when-preempted" | "guard";

/** A single question row on the FULL surface. */
export interface Question {
  /** The runtime nodeId (a `when`/guard row — grounds cross-pane) OR a synthetic `<parentNodeId>|<nodeKey>` (a leaf). */
  nodeId: string;
  /** The BARE concept name. */
  conceptName: string;
  /** The concept's CONCRETE owning library (frame-resolved) — the `conceptTruth` join key. */
  libraryName?: string;
  valueType: ConceptValueType | null;
  options: string[];
  /** "yes"/"no" — the case's answer; "unknown" — no conceptTruth for an off-path row (render blank); null — n/a. */
  answer: "yes" | "no" | "unknown" | null;
  isBoolean: boolean;
  /** Indent level — DECISION nesting / guard depth only (composite operands render inside `expansion`, not as flat rows). */
  depth: number;
  rowKind: RowKind;
  reach: Reach;
  /** Has a local `code is` → Source. `false` ⇒ non-Source (grey channel). Defaults true when no shape is available. */
  isSource: boolean;
  /** `defined as`/`definition is` inferred concept — the inferred marker. */
  isInferred: boolean;
  /** A prev/next nav stop + cross-pane `.this-node` target (runtime rows only; leaves are false). */
  isNavStop: boolean;
  /** An evaluated on-path `when` — the ONLY rows `producedPathDiverterIds` may light (never a leaf/preempted row). */
  diverterEligible: boolean;
  /** #187 Option-3: on an ON-PATH-SATISFIED composite `when`, its `defined as` operator tree (ANY OF / ALL OF boxes).
   *  Absent for a non-composite / preempted / reached-false / off-path when (those stay flat rows). */
  expansion?: QExpr;
  source?: ViewNode["source"];
}

export interface Questionnaire {
  questions: Question[];
  outcome: { activity: string } | null;
  terminalKind: "produced" | "blocked" | "blocked-guard" | "error" | "empty";
  note?: string;
}

/**
 * The produced-path DIVERTERS — the evaluated-false ("no") on-path `when`s that routed the case to its produced
 * disposition, IFF something was produced. #187 Todo 3: on the FULL surface a "no" answer also appears on preempted
 * whens + composite leaves, which are NOT diverters — so filter on `diverterEligible` (evaluated on-path `when` only),
 * never on the answer alone. Reuses the ONE fired-path authority (`buildQuestionnaire`) — no second walk.
 */
export function producedPathDiverterIds(q: Questionnaire): string[] {
  if (q.outcome === null) return [];
  return q.questions.filter((x) => x.diverterEligible && x.answer === "no").map((x) => x.nodeId);
}

/** Resolve the value types a concept declares (frame-aware). Injected — decouples the builder from the shell's maps. */
export type ResolveValueTypes = (lib: string | undefined, name: string) => ConceptValueType[];
/** Resolve a concept's `defined as` SHAPE subtree (frame-aware) — for expanding a composite `when`'s leaves (#187). */
export type ResolveConceptShape = (lib: string | undefined, name: string) => ConceptShapeNode | undefined;
/** Resolve a concept's `defined as` OPERATOR-tree entry (frame-aware) — for the Option-3 ANY OF / ALL OF box render. */
export type ResolveDefExpr = (lib: string | undefined, name: string) => DefExprEntry | undefined;

/**
 * Reconstruct the FULL first:-chain question surface of a rendered scenario.
 *
 * @param sv               the rendered scenario (a real `ScenarioViewModel`; carries `conceptTruth`).
 * @param resolveValueTypes injected concept→value-types resolver (frame-aware).
 * @param rootLib          the root decision's library (the starting frame).
 * @param opts.conceptShape injected concept→shape-subtree resolver — the composite when's own Source/inferred flags.
 * @param opts.defExpr      injected concept→operator-tree resolver — an on-path composite when's ANY OF / ALL OF `expansion`.
 */
export function buildQuestionnaire(
  sv: ScenarioViewModel,
  resolveValueTypes: ResolveValueTypes,
  rootLib: string | undefined,
  opts: { conceptShape?: ResolveConceptShape; defExpr?: ResolveDefExpr } = {},
): Questionnaire {
  if (sv.status === "error") {
    return { questions: [], outcome: null, terminalKind: "error", note: sv.diagnostics[0] ?? "evaluation error" };
  }

  const produced = collectProducedActions(sv.tree);
  const questions: Question[] = [];

  // conceptTruth lookup (off-path answers), keyed COLLISION-PROOF by `JSON.stringify([lib,name])` — CRL library AND
  // concept names are quoted strings that routinely contain spaces, so any single-char delimiter can collide (e.g.
  // ("Medical Policy","patient age") vs ("Medical","Policy patient age")). Absent (lib,name) ⇒ UNKNOWN (never "no").
  const truthKey = (lib: string, name: string): string => JSON.stringify([lib, name]);
  const truthByKey = new Map<string, boolean>();
  for (const r of sv.conceptTruth ?? []) truthByKey.set(truthKey(r.libraryName, r.name), r.satisfied);
  const truthAnswer = (lib: string, name: string): "yes" | "no" | "unknown" => {
    const t = truthByKey.get(truthKey(lib, name));
    return t === undefined ? "unknown" : t ? "yes" : "no";
  };

  const shapeOf = (lib: string, name: string): ConceptShapeNode | undefined => opts.conceptShape?.(lib, name);

  // Emit a runtime `when` (or guard) row. `evaluatedSat` present ⇒ show what FIRED; absent ⇒ off-path `conceptTruth`.
  // Returns the pushed Question so an on-path composite can attach its `expansion` (the ANY OF / ALL OF box tree).
  const emitWhen = (
    concept: ConditionView["concept"] | GuardView["concept"],
    node: ViewNode,
    frameLib: string | undefined,
    depth: number,
    rowKind: RowKind,
    reach: Reach,
    evaluatedSat: boolean | undefined,
  ): Question => {
    const lib = concept.libraryName ?? frameLib ?? "";
    const valueTypes = resolveValueTypes(lib, concept.name);
    const shape = shapeOf(lib, concept.name);
    const answer: Question["answer"] =
      evaluatedSat !== undefined ? (evaluatedSat ? "yes" : "no") : truthAnswer(lib, concept.name);
    const q: Question = {
      nodeId: node.nodeId,
      conceptName: concept.name,
      libraryName: lib,
      valueType: valueTypes[0] ?? null,
      options: ["Yes", "No"],
      answer,
      isBoolean: valueTypes.includes("boolean"),
      depth,
      rowKind,
      reach,
      isSource: shape ? shape.hasCodeIs : true, // no shape ⇒ assume Source (don't spuriously grey)
      isInferred: shape ? shape.isInferred : false,
      isNavStop: true, // every runtime when/guard grounds in sv.tree → nav-stop + cross-pane markable
      diverterEligible: rowKind === "when-evaluated",
      ...(node.source ? { source: node.source } : {}),
    };
    questions.push(q);
    return q;
  };

  // ENRICH the shared POSITIONAL structure (`buildDefStruct`, crl core — the SAME builder the Tree pane consumes, so the
  // two panes stay in lockstep BY CONSTRUCTION) with the case's per-leaf answer + value-type. Structure/caps/positional
  // semantics all live in the core builder; this pass only layers on `answer` (conceptTruth) + `valueType`.
  const enrich = (s: DefStructExpr): QExpr => {
    switch (s.kind) {
      case "or":
      case "and":
        return { kind: s.kind, operands: s.operands.map(enrich) };
      case "not":
        return { kind: "not", operand: enrich(s.operand) };
      case "external":
        return { kind: "external", name: s.name, lib: s.lib };
      case "more":
        return { kind: "more", count: s.count };
      case "leaf": {
        const valueTypes = resolveValueTypes(s.lib, s.name);
        const leaf: Extract<QExpr, { kind: "leaf" }> = {
          kind: "leaf",
          name: s.name,
          lib: s.lib,
          answer: truthAnswer(s.lib, s.name),
          isSource: s.isSource,
          isInferred: s.isInferred,
          valueType: valueTypes[0] ?? null,
        };
        if (s.composite) leaf.composite = enrich(s.composite);
        return leaf;
      }
    }
  };

  // Attach the operator-tree `expansion` to an ON-PATH composite `when`'s Question (the box render). The when ROW itself
  // carries the composite's own answer (emitWhen); the expansion is its `defined as` BODY (operands only — no own-leaf).
  const attachExpansion = (q: Question, concept: ConditionView["concept"], frameLib: string | undefined): void => {
    if (!opts.defExpr) return;
    const lib = concept.libraryName ?? frameLib ?? "";
    const entry = opts.defExpr(lib, concept.name);
    // The `expansion` is the RAW operator tree (the ALL OF / ANY OF structure is unchanged). `defined as` is a disjunction
    // of alternative representations, but that top-level `or` is a RENDER annotation (a forced `or` chip above the body —
    // see renderExpansion), NOT an extra box — so a top-level `and` shows `or` then its ALL OF, one compound alternative.
    if (entry?.hasDefinedAs && entry.body) q.expansion = enrich(buildDefStruct(entry.body, opts.defExpr, new Set([entry.nodeKey]), 1));
  };

  type GuardTerminal = { node: ViewNode; guard: GuardView; frameLib: string | undefined; depth: number };
  const guardTerminals: GuardTerminal[] = [];
  const isBlocked = produced.length === 0;

  // Depth-first walk of the FULL tree. `frameLib` switches on a cross-library use-decision expansion; `depth` is the
  // indent level (increments only under an ON-PATH satisfied `when` — `otherwise`/`use decision` are transparent).
  const walk = (nodes: ViewNode[], frameLib: string | undefined, depth: number): void => {
    for (const node of nodes) {
      if (node.kind === "when") {
        const cond = node.condition;
        if (!cond) continue;
        if (node.unreachedReason === "preempted") {
          // first:-preempted sibling → DIMMED terminal; case answer from conceptTruth (off-path). No recurse/expand.
          emitWhen(cond.concept, node, frameLib, depth, "when-preempted", "preempted", undefined);
          continue;
        }
        if (cond.satisfied === true) {
          const wq = emitWhen(cond.concept, node, frameLib, depth, "when-evaluated", "evaluated", true);
          // ON-PATH composite → attach its `defined as` operator tree as the when's `expansion` (ANY OF / ALL OF box).
          attachExpansion(wq, cond.concept, frameLib);
          walk(node.children ?? [], frameLib, depth + 1);
          continue;
        }
        if (cond.satisfied === false) {
          // reached-and-false → terminal (shows what fired); no recurse, no leaf-expand (only on-path composites expand).
          emitWhen(cond.concept, node, frameLib, depth, "when-evaluated", "evaluated", false);
          continue;
        }
        continue; // unevaluated, non-preempted (unreached subtree under a terminal parent) → not on the surface
      }

      if (node.kind === "otherwise") {
        walk(node.children ?? [], frameLib, depth); // transparent: the fallback body fired, no row
        continue;
      }

      // node.kind === "action".
      if (isBlocked && node.guardedOut === true && node.guard) {
        guardTerminals.push({ node, guard: node.guard, frameLib, depth }); // the DEEPEST becomes the blocked-guard terminal
        continue;
      }
      if (node.action?.actionKind === "use-decision" && node.action.expanded) {
        const subLib = node.action.target.libraryName ?? frameLib;
        walk(node.children ?? [], subLib, depth); // transparent: inline the sub-tree, no row for the action
        continue;
      }
      // a recommend-activity leaf carries no question row (produced ⇒ the outcome below).
    }
  };

  walk(sv.tree, rootLib, 0);
  // The DEEPEST guarded-out action on the fired chain is the blocked-guard terminal (ties → last in DFS order). In the
  // nested-first: model this is the last-visited; picking by max depth is also correct for a multi-guarded-out menu.
  const blockedGuard = guardTerminals.reduce<GuardTerminal | undefined>(
    (best, g) => (best === undefined || g.depth >= best.depth ? g : best),
    undefined,
  );

  // ── Outcome / terminalKind (unchanged authority) ──────────────────────────────────────────────────────────
  if (produced.length >= 1) {
    let activity: string;
    let note: string | undefined;
    if (produced.length === 1) {
      activity = displayDetermination(produced[0].label);
    } else {
      const picked = produced.find((p) => p.label === sv.expected?.branch) ?? produced[0];
      activity = displayDetermination(picked.label);
      note = `multiple produced; showing ${activity}`;
    }
    const terminalKind = questions.length === 0 ? "empty" : "produced";
    return { questions, outcome: { activity }, terminalKind, ...(note ? { note } : {}) };
  }

  if (blockedGuard) {
    // A guarded-out action blocked the path — its guard is the terminal question (a runtime nav-stop row), rendered at
    // the guard's OWN depth (not left-aligned at 0), so it reads as nested under the whens that led to it.
    emitWhen(blockedGuard.guard.concept, blockedGuard.node, blockedGuard.frameLib, blockedGuard.depth, "guard", "evaluated", blockedGuard.guard.satisfied);
    return { questions, outcome: null, terminalKind: "blocked-guard" };
  }
  return { questions, outcome: null, terminalKind: "blocked" };
}

/** Collect produced recommend-activity leaves (label + nodeId) in fired-tree order (unchanged). EXPORTED (#210 all-pass
 *  badge): the SOUND execution reach — the disposition leaves a case actually PRODUCED (`n.action?.produced`), for
 *  re-rooting → structure nodeKeys. Distinct from the reveal/correspondence reach (`crlAnchorsForUnits`), which under-
 *  reaches a leaf when the case's units cite only the gating concept. */
export function collectProducedActions(nodes: ViewNode[]): { label: string; nodeId: string }[] {
  const out: { label: string; nodeId: string }[] = [];
  const visit = (ns: ViewNode[]): void => {
    for (const n of ns) {
      if (n.kind === "action" && n.action?.produced) out.push({ label: n.label, nodeId: n.nodeId });
      if (n.children) visit(n.children);
    }
  };
  visit(nodes);
  return out;
}
