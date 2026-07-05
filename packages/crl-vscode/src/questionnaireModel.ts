// Pure, vscode-free `buildQuestionnaire` — the heart of the read-only Medical Validation questionnaire
// panel (#177 slice 2). Given a `ScenarioViewModel` (the CRE↔UI contract) it reconstructs the ACTUAL fired
// path (root decision → the ACTUAL produced disposition) as an ordered list of "Is <concept>?" questions,
// ending in the produced activity. Design authority: .vibe-tools/discussions/163-questionnaire-panel-design.md
// ("Resolved decisions" + slice 2) + the slice-2 impl-review re-axis.
//
// AXIS (the model fix): the questionnaire is a PRESENTATION of the fired path to the ACTUALLY produced
// disposition — INDEPENDENT of pass/fail and of `expected.branch`. Pass/fail and the expected oracle are the
// VALIDATION concern (the worklist / done-painting), ORTHOGONAL to this view. So this module does NOT read
// `sv.status` (beyond the `error` short-circuit) or `sv.expected.branch` for path/terminal decisions: a case
// that FAILS by producing a DIFFERENT disposition than expected still shows the path to what it ACTUALLY
// produced (e.g. "Is exclusion? Yes → Deny"), terminal "produced" — not "blocked".
//
// This module imports ONLY types from `@smile-digital-health/crl` — NO `vscode`. The concept→value-type
// resolution is INJECTED (`resolveValueTypes`) so the builder stays decoupled from the shell's nodeKey /
// conceptByKey internals (those land in slice 3). The test passes a simple stub.
//
// The walk is FRAME-AWARE and follows the WINNERS, emitting a question for EVERY evaluated `when`:
//   - a satisfied `when` (`satisfied===true`) → emit "yes" + descend its children (the taken branch);
//   - a tried-and-failed `when` (`satisfied===false`) → emit "no" + continue to the next sibling. THIS is the
//     load-bearing fix: a false exclusion checked before a `first:` winner ("Is exclusion? No" before "Is it
//     covered? Yes → Approve") IS on the path and renders as a "no" question;
//   - an `otherwise` → descend its children (the fallback winner), no question;
//   - a `preempted` branch (a sibling AFTER a `first:` winner) → skip (never executed);
//   - an `expanded` `use decision` action → descend its inlined sub-tree (switch the frame lib to
//     `target.libraryName` for a cross-library expansion), emit NO question for the action node itself.
//
// KNOWN LIMITATION (note, not fixed): a non-idiomatic `all:` block of SIBLING WHENS emits each arm's questions
// as the walk descends, but a terminal deep in one arm does not reorder across arms. The medical-policy model
// is nested `first:` (a single chain), so this is fine in practice.
import type { ScenarioViewModel, ViewNode, GuardView, ConditionView } from "@smile-digital-health/crl";
// The one runtime import: a pure, vscode-free DISPLAY helper — projects a determination outcome name
// (`certify.Met`) to its human key (`Met`) for the `Outcome:` line. Matching still uses the RAW `label`.
import { displayDetermination } from "@smile-digital-health/crl";

// `ConceptValueType` is a string union in the core grammar (grammar/conceptValueTypes.ts), but the barrel
// does not re-export the type. The builder treats a value type as an opaque string token (it only does
// `.includes("boolean")` / `[0]`), so a local alias keeps the module decoupled without pulling the union in.
export type ConceptValueType = string;

/** A single "Is <concept>?" question on the fired path. */
export interface Question {
  /** The runtime nodeId of the originating `when` (or guard-bearing action) node. Slice 4 re-roots it for
   *  the cross-pane "this node" marker; the builder passes it through verbatim. */
  nodeId: string;
  /** The BARE concept name (the VM already extracted it via getRefName into `concept.name`) — NOT the
   *  "when X" label, NOT `meta is` (text-meta is #178). */
  conceptName: string;
  /** The first/primary value type, or null when the concept declares none. */
  valueType: ConceptValueType | null;
  /** ["Yes","No"] — boolean Yes/No OR satisfied/not. The case's answer VALUE is not in the VM, so richer
   *  value-type options are deferred (the `valueType` field still carries the type for that follow-on). */
  options: string[];
  /** "yes" when the condition was satisfied, "no" when evaluated-false, null when not evaluated. */
  answer: "yes" | "no" | null;
  /** `valueTypes.includes("boolean")`. */
  isBoolean: boolean;
  /** The originating node's source span (pass-through from `ViewNode.source`). */
  source?: ViewNode["source"];
}

export interface Questionnaire {
  questions: Question[];
  /** The ACTUAL produced disposition; null when blocked/error. */
  outcome: { activity: string } | null;
  /** "produced" = a leaf disposition fired; "empty" = produced with zero `when` questions (root otherwise →
   *  leaf); "blocked"/"blocked-guard" = nothing produced; "error" = unavailable (partial/cyclic trace). */
  terminalKind: "produced" | "blocked" | "blocked-guard" | "error" | "empty";
  /** e.g. "multiple produced; showing <which>", or the error reason. */
  note?: string;
}

/**
 * disc 164: the produced-path DIVERTERS — the runtime nodeIds of the evaluated-false ("no") questions on the fired path,
 * IFF a disposition was ACTUALLY produced (`outcome != null`). These are the criteria that, by being false, routed the case
 * to its produced disposition (the Adult gate for a not-adult deny); the cockpit re-roots them to a distinct source/tree/crl
 * overlay so the validator sees WHY the case got its outcome. Reuses the ONE fired-path authority (`buildQuestionnaire`) — no
 * second walk, no drift. EMPTY for a `blocked`/`blocked-guard`/`error` terminal: with NOTHING produced, "why the produced
 * disposition" is undefined, and a `blocked-guard` emits a false GUARD question (the action node) that must NOT be lit as a
 * diverter (gpt55 impl review, disc 164). EMPTY for `empty` too (zero questions). Inherits `buildQuestionnaire`'s `all:`
 * limitation (a non-idiomatic `all:` of sibling whens can surface an off-arm false `when`); the medical-policy model is
 * nested `first:`, so in practice every "no" is a true on-path diverter.
 */
export function producedPathDiverterIds(q: Questionnaire): string[] {
  if (q.outcome === null) return [];
  return q.questions.filter((x) => x.answer === "no").map((x) => x.nodeId);
}

/** Resolve the value types a concept declares. Injected so the builder is decoupled from the shell's
 *  nodeKey/conceptByKey wiring (slice 3 supplies the real one; the test a stub). `lib` is the FRAME lib
 *  (the concept's own `libraryName` when qualified, else the current walk frame). */
export type ResolveValueTypes = (lib: string | undefined, name: string) => ConceptValueType[];

/**
 * Reconstruct the fired path of a rendered scenario into a questionnaire.
 *
 * @param sv               the rendered scenario (a real `ScenarioViewModel` from `renderScenario`).
 * @param resolveValueTypes injected concept→value-types resolver (frame-aware).
 * @param rootLib          the root decision's library (`sv.decision?.libraryName`); the starting frame.
 */
export function buildQuestionnaire(
  sv: ScenarioViewModel,
  resolveValueTypes: ResolveValueTypes,
  rootLib: string | undefined,
): Questionnaire {
  // status==="error": the trace may be partial/cyclic — do NOT walk it. Surface the reason, no path. (This is
  // the ONLY use of `sv.status`: an error means the VM has no trustworthy path to present. pass/fail are NOT
  // consulted — the path/terminal follow the ACTUAL produced disposition, the orthogonal-axis fix.)
  if (sv.status === "error") {
    return {
      questions: [],
      outcome: null,
      terminalKind: "error",
      note: sv.diagnostics[0] ?? "evaluation error",
    };
  }

  // Compute the ACTUAL produced disposition(s) FIRST. This gates guard-handling: a guarded-out action is a
  // terminal ONLY when nothing was produced (step 5) — an unrelated guarded-out `any:`-menu sibling on a
  // path that DID produce must not turn the outcome into "blocked-guard".
  const produced = collectProducedActions(sv.tree);

  const questions: Question[] = [];

  const emitQuestion = (
    concept: ConditionView["concept"],
    satisfied: boolean | undefined,
    node: ViewNode,
    frameLib: string | undefined,
  ): void => {
    const conceptName = concept.name;
    const lib = concept.libraryName ?? frameLib;
    const valueTypes = resolveValueTypes(lib, conceptName);
    const isBoolean = valueTypes.includes("boolean");
    questions.push({
      nodeId: node.nodeId,
      conceptName,
      valueType: valueTypes[0] ?? null,
      // boolean → Yes/No; non-boolean/none → still Yes/No (satisfied / not-satisfied). The case's answer
      // VALUE is not in the VM, so richer value-type options are deferred (valueType still carried).
      options: ["Yes", "No"],
      answer: satisfied === true ? "yes" : satisfied === false ? "no" : null,
      isBoolean,
      ...(node.source ? { source: node.source } : {}),
    });
  };

  // The terminal a deep walk can surface ONLY in the blocked (0-produced) case: a guarded-out action's guard,
  // or — if nothing else — the last evaluated false `when`. In the produced case the walk returns null and the
  // outcome is the produced leaf.
  type GuardTerminal = { node: ViewNode; guard: GuardView; frameLib: string | undefined };
  // Guarded-out actions seen during the walk, in path order — a `const` array `.push`ed inside the closure
  // (NOT a reassigned `let`, which TS control-flow analysis narrows to its initializer past a closure call).
  // Used ONLY in the blocked (0-produced) case; the LAST entry is the deepest on the single fired chain.
  const guardTerminals: GuardTerminal[] = [];
  const isBlocked = produced.length === 0;

  // Depth-first walk following the winners. `frameLib` is the library that bare sub-`when` concepts resolve
  // against; it switches on a cross-library use-decision expansion.
  const walk = (nodes: ViewNode[], frameLib: string | undefined): void => {
    for (const node of nodes) {
      // A preempted branch never executed (a `first:` sibling after the winner) → not on the fired path.
      if (node.unreachedReason === "preempted") continue;

      if (node.kind === "when") {
        const cond = node.condition;
        if (cond?.satisfied === true) {
          // A satisfied `when`: emit "yes" and descend the taken branch.
          emitQuestion(cond.concept, true, node, frameLib);
          walk(node.children ?? [], frameLib);
          continue;
        }
        if (cond?.satisfied === false) {
          // A tried-and-failed `when`: it IS on the fired path (it was evaluated) — emit "no" and CONTINUE to
          // the next sibling (do NOT descend its untaken body). This is the dropped-no-question fix.
          emitQuestion(cond.concept, false, node, frameLib);
          continue;
        }
        // An unevaluated `when` (no `satisfied`) — not on the fired path. Skip.
        continue;
      }

      if (node.kind === "otherwise") {
        // The fallback winner — descend its children (its body fired), emit no question.
        walk(node.children ?? [], frameLib);
        continue;
      }

      // node.kind === "action".
      // Guard check FIRST (before the use-decision-expansion branch): a guarded-out action — including a
      // guarded-out USE DECISION — must surface its guard, not recurse. But ONLY in the blocked case; in the
      // produced case a guarded-out sibling is an unrelated untaken menu option, skip it.
      if (isBlocked && node.guardedOut === true && node.guard) {
        // Record this guarded-out action's guard as a candidate blocked terminal (the deepest/last wins below).
        guardTerminals.push({ node, guard: node.guard, frameLib });
        continue;
      }

      if (node.action?.actionKind === "use-decision" && node.action.expanded) {
        // An expanded `use decision` inlines its sub-decision as `children`. Descend INTO them (so the sub's
        // whens render) but emit NO question for the action node itself (it has no concept). Switch the frame
        // lib to the sub's owning library for a CROSS-library expansion so bare sub-`when` concepts resolve
        // there (the cross-lib same-name trap). A same-lib expansion keeps no `target.libraryName` → frame
        // unchanged.
        const subLib = node.action.target.libraryName ?? frameLib;
        walk(node.children ?? [], subLib);
        continue;
      }

      // A non-guarded recommend-activity leaf carries no question; if produced it is the outcome (handled
      // below), otherwise it is an untaken/un-fired leaf — nothing to emit.
    }
  };

  walk(sv.tree, rootLib);
  // The deepest guarded-out action on the fired chain (if any) is the blocked-guard terminal.
  const blockedGuard = guardTerminals[guardTerminals.length - 1];

  // ── Outcome / terminalKind ────────────────────────────────────────────────────────────────────────────
  if (produced.length >= 1) {
    let activity: string;
    let note: string | undefined;
    if (produced.length === 1) {
      // DISPLAY-only: show the determination's human key (`certify.Met` → `Met`); a no-op for ordinary activities.
      activity = displayDetermination(produced[0].label);
    } else {
      // >1 produced (a rare CDS `all:`). Prefer the expected branch's if the oracle named one (purely for a
      // human-friendly "which" label — it does NOT change the path or the terminal), else the first. The MATCH
      // is on the RAW `label` (expected.branch is the raw name); only the shown string is display-projected.
      const picked = produced.find((p) => p.label === sv.expected?.branch) ?? produced[0];
      activity = displayDetermination(picked.label);
      note = `multiple produced; showing ${activity}`;
    }
    // A produced path with ZERO `when` questions (root `otherwise` → leaf) is "empty" — distinct from a chain
    // of questions ending in a produced leaf ("produced").
    const terminalKind = questions.length === 0 ? "empty" : "produced";
    return { questions, outcome: { activity }, terminalKind, ...(note ? { note } : {}) };
  }

  // ── Blocked: nothing produced. ────────────────────────────────────────────────────────────────────────
  if (blockedGuard) {
    // A guarded-out action blocked the path — its guard is the terminal question.
    emitQuestion(blockedGuard.guard.concept, blockedGuard.guard.satisfied, blockedGuard.node, blockedGuard.frameLib);
    return { questions, outcome: null, terminalKind: "blocked-guard" };
  }
  // No guard, no production (no branch matched and no otherwise — an authoring gap). The last evaluated false
  // `when` already stands as the terminal question (emitted during the walk); just mark blocked.
  return { questions, outcome: null, terminalKind: "blocked" };
}

/** Collect produced recommend-activity leaves (label + nodeId) in fired-tree order. Mirrors the core's
 *  `collectProduced` (viewModel.ts) but keeps the node identity. A use-decision node is never `produced`
 *  (it delegates), so only recommend-activity leaves surface. */
function collectProducedActions(nodes: ViewNode[]): { label: string; nodeId: string }[] {
  const out: { label: string; nodeId: string }[] = [];
  const visit = (ns: ViewNode[]): void => {
    for (const n of ns) {
      if (n.kind === "action" && n.action?.produced) {
        out.push({ label: n.label, nodeId: n.nodeId });
      }
      if (n.children) visit(n.children);
    }
  };
  visit(nodes);
  return out;
}
