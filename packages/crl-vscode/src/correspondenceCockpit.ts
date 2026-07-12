// Correspondence cockpit SHELL (thin vscode) — three-pane viewer C2a (#156).
// Wires the pure cores to VS Code: a CRL activity-bar navigator (TreeView) + three webview panes (Source rendered;
// CRL/CEL placeholders that participate in the reveal protocol). Holds the full ViewerModel; feeds the engine a COMPACT
// CockpitIndex; routes the engine's SEMANTIC reveal effects through the PaneRevealCoordinator → each pane's webview.
// The pure logic lives in correspondenceEngine / paneRevealCoordinator / sourcePaneHtml (all unit-tested);
// this file is the untested integration per the established split. Design: .vibe-tools/discussions/118-c2a-source-spine.md.
import { randomBytes, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, sep } from "node:path";

import {
  buildCockpitModel,
  buildCRL,
  collectFlags,
  conceptDeclRef,
  createFlag,
  flagTags,
  hasForbiddenGistChars,
  nodeKey,
  parseMetaTag,
  rewriteMetaStatus,
  type CorrespondenceModel,
  type CrlConceptNode,
  type ConceptShapeIndex,
  type DefExprIndex,
  type CrlDecisionStructure,
  type CrlStructureNode,
  type FlagInstance,
  type FlagStatus,
  type RenderScenarioResult,
  type ScenarioViewModel,
} from "@smile-digital-health/crl";
import type { LsLocation, ZeroBasedRange } from "@smile-digital-health/crl/language-services";
import {
  allUnsatisfiedCriteria,
  failedCriterionFrontier,
  type FailedCriterionNode,
} from "@smile-digital-health/crl/provenance";
import * as vscode from "vscode";

import {
  initialState,
  navigatorItems,
  reduce,
  shouldReflectNavigatorSelection,
  type Action,
  type CelNavItem,
  type CockpitIndex,
  type CrlNavItem,
  type Effect,
  type NavigatorItem,
  type Pane,
  type PrimaryPane,
  type Selection,
  type State,
} from "./correspondenceEngine";
import { renderCelPane, REVIEW_LABEL, REVIEW_ORDER, reverseCelAnchors } from "./celPaneHtml";
import { CORR_STYLE } from "./corrKey";
import {
  buildRuntimeRefIndex,
  resolveFailedCriteria,
  type ResolvedCriterion,
} from "./failedCriterionPeek";
import { resolveThisNode } from "./thisNodeMarker";
import { failedCriterionLabel } from "./failedCriterionLabel";
import { buildIssueUrl, githubIssuesBaseFromRemote, githubRepoFromRemote, issueRefOf, sanitizeIssueBase } from "./issueLink";
import { createGithubIssue, IssueCreateError, issueCreateErrorLabel } from "./githubIssue";
import { renderFlagDrawer } from "./flagDrawerHtml";
import { isOccurrenceKey, occurrenceByNodeKey, occurrenceKeyValue, parseOccurrenceKey, resolveOccurrence, type OccurrenceRef } from "./occurrenceKey";
import {
  addNote,
  buildReviewPerCase,
  composeSidecar,
  deleteNote,
  deriveAllPassLeaves,
  deriveReviewOverlay,
  editNote,
  isReviewState,
  loadSidecar,
  medicalValidationSidecarPath,
  mvComplete,
  renderFlagChrome,
  renderProgressChrome,
  REVIEW_STATES,
  reviewProgress,
  saveSidecar,
  setReviewState,
  type FlagChrome,
  type Note,
  type PersistedReviewState,
  type ReviewState,
} from "./medicalValidationStore";
import { renderCrlPane } from "./crlPaneHtml";
import { collectDispositionLeafKeys, FLOW_STYLE, flowLegendChrome, renderFlowPane } from "./flowPaneHtml";
import { QUESTIONNAIRE_STYLE, renderQuestionnairePane, shouldRerenderQuestionnaire, nextQuestionIndex } from "./questionnairePaneHtml";
import { buildQuestionnaire, collectProducedActions, producedPathDiverterIds, type Questionnaire } from "./questionnaireModel";
import type { ConceptValueType, ResolveValueTypes, ResolveConceptShape, ResolveDefExpr } from "./questionnaireModel";
import {
  buildCrlRevealMaps,
  caseIdsForNode,
  caseIdsForUnit,
  conceptCrlAnchors,
  conceptKeysForNode,
  conceptKeysForUnit,
  conceptNodesForRow,
  crlAnchorsForUnits,
  rowNodeKeysForConcept,
  rowNodeKeysForUnit,
  unitNumbersForCase,
  unitNumbersForRow,
  unitsForCase,
  unitsForConcept,
  unitsForConceptNode,
  unitsForRow,
  type CrlRevealMaps,
} from "./crlRevealMaps";
import {
  COCKPIT_PANE_SPEC,
  MEDICAL_VALIDATION_PANE_SPEC,
  normalizePaneOrder,
  type PaneSpec,
} from "./paneOrder";
import { isConceptHit, isFactHit, isSubQuestionHit, type RevealHit, type WebviewHit } from "./webviewHit";
import { PaneRevealCoordinator, type SemanticTarget } from "./paneRevealCoordinator";
import { discoverProvenance, findPolicySrc, PANEL_VALIDATION_MODE } from "./provenanceFindings";
import { buildViewerModel, type ViewerModel } from "./provenanceViewer";
import { renderSourcePane, type OverlaySpan, type UnitSpan } from "./sourcePaneHtml";

const PANES: Pane[] = ["source", "crl", "cel", "tree", "questionnaire", "worklist"]; // all panes (render/clearPending/reveal fan-out); tree/questionnaire/worklist opt-in; MUST stay in lockstep with engine `Pane` (silent-failure list — not compiler-checked; disc 179)
// The panes the navigator can WALK (primary/cycle/config-primary). tree is render+reveal+peek-only, never a primary —
// so it is absent here. Used to build the setPrimary quickpick + guard config-primary against a stray "tree".
const PRIMARY_PANES: PrimaryPane[] = ["source", "crl", "cel"];
// Column slots by position (explicit, not ViewColumn arithmetic). A pane's column = its index among the OPEN panes in
// the user's paneOrder (so hiding a pane never leaves a column gap). SIX slots: since the pane split (disc 179) worklist +
// cel are DISTINCT internal panes, so MV's valid set is up to 6 (worklist, cel, source, tree, questionnaire, crl) — a user
// paneOrder listing all six must get a 6th column instead of piling onto column One via the `?? One` fallback (VS Code
// supports up to 9). The default MV set stays 4 (worklist/source/tree/questionnaire); this only bounds the overflow case.
const ORDERED_COLUMNS = [vscode.ViewColumn.One, vscode.ViewColumn.Two, vscode.ViewColumn.Three, vscode.ViewColumn.Four, vscode.ViewColumn.Five, vscode.ViewColumn.Six];
const PANE_TITLE: Record<Pane, string> = { source: "Source", crl: "CRL", cel: "CEL", tree: "Tree", questionnaire: "Questionnaire", worklist: "Worklist" };
// Perf gate (disc 118): the measured full-render floor. Over → fall back to a navigation-only placeholder, don't freeze.
const MAX_SOURCE_CHARS = 200_000;
const MAX_SOURCE_MARKS = 2000;

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);

interface PaneView {
  panel: vscode.WebviewPanel;
  gen: number;
  /** the indexVersion the current render was posted at — the authoritative freshness key (NOT trusted from the webview). */
  indexVersion: number;
  acked: boolean;
  /** Source: keyed by unitId. CRL: keyed by row nodeKey. CEL: case blocks by caseId, fact peeks by `fact:` key. */
  anchors: Record<string, { scrollTo: string; segmentIds: string[] }>;
  /** Per-pane click payload (a WebviewHit): source spans → {unitId,range}; CRL rows → {nodeKey}; CEL cases → {caseId};
   *  CEL facts → {conceptKey,factAnchorKey} (a peek, NOT an engine selection — routed before mapHitToPrimary). */
  reveals: Record<string, WebviewHit>;
  /** #187 Todo 5 (TREE pane only): synthetic def-leaf anchor key → its leaf concept identity + owning composite `when`,
   *  from the flow render. `driveLeafMarks` joins `{lib,name}` to a case's conceptTruth for the yes/no verdict and gates on
   *  `topWhenKey` being an on-path-satisfied composite. Empty on every non-tree pane (and reset each render, like anchors). */
  leafConcepts: Record<string, { lib: string; name: string; topWhenKey: string }>;
  /** #203 Todo 4b Slice A (TREE pane only): the flow render's per-node flag-badge substrate — `conceptOccurrences`
   *  ({gid,lib,name} for each `when`/def-leaf) + `flaggableGids` (every gid that CAN carry a badge). `driveFlagBadges`
   *  matches open flags → gids off these + posts `.has-flag`. Captured atomically with the anchors; reset each render. */
  conceptOccurrences: { gid: string; lib: string; name: string }[];
  flaggableGids: string[];
  /** the start/primary-node gid — carries the chrome-mirror count badge (see driveFlagBadges). */
  startNodeGid?: string;
  disposables: vscode.Disposable[];
}

/** CRL nav list — pre-order flatten of the structure (roots + when/otherwise/action); the crl-primary cycle/selectable
 *  set + a SUPERSET of every row a source unit can map to. Description = the owning decision (flat labels duplicate). */
function toCrlNav(structure: CrlDecisionStructure[]): CrlNavItem[] {
  const out: CrlNavItem[] = [];
  const walk = (nodes: CrlStructureNode[]): void => {
    for (const n of nodes) {
      out.push({ nodeKey: n.nodeKey, label: n.label, description: n.decision });
      walk(n.children);
    }
  };
  for (const d of structure) {
    out.push({ nodeKey: d.nodeKey, label: `decision "${d.decision}"` });
    walk(d.children);
  }
  return out;
}

/** CEL nav list — one item per scenario case that HAS a frozen caseId (the join key); un-frozen cases render in the pane
 *  but aren't navigable/reveal targets. Label = case name, description = pass/fail/error. FIX 1 (disc 160): an
 *  AMBIGUOUS-name case (name in duplicateScenarioNames) is EXCLUDED — navigating it would mis-select the frozen
 *  same-name case's caseId, the same mis-attribution the pane block guards against. */
function toCelNav(
  scenarios: RenderScenarioResult,
  caseIdByName: Record<string, string>,
  duplicateScenarioNames: ReadonlySet<string>,
): CelNavItem[] {
  const out: CelNavItem[] = [];
  for (const sc of scenarios.scenarios) {
    if (duplicateScenarioNames.has(sc.case.name)) continue;
    const caseId = caseIdByName[sc.case.name];
    if (caseId !== undefined) out.push({ caseId, label: sc.case.name, description: sc.status });
  }
  return out;
}

function toIndex(
  model: ViewerModel,
  structure: CrlDecisionStructure[],
  celNav: CelNavItem[],
  version: number,
): CockpitIndex {
  return {
    version,
    anchorFilePath: model.anchor.filePath,
    steps: model.steps,
    sourceCycleIds: model.steps.filter((s) => s.source.length > 0).map((s) => s.unitId),
    crlNav: toCrlNav(structure),
    celNav,
  };
}

/** #187 Todo 5 (PURE, unit-tested): bucket the tree's def-leaves into yes/no verdict keys for a case. A leaf lights ONLY
 *  when (a) its owning composite `when` is on-path-SATISFIED — `topWhenKey ∈ satisfiedWhenKeys` (parity with the
 *  questionnaire, which expands leaves only there) — AND (b) its concept has a conceptTruth answer. An ABSENT concept is
 *  UNKNOWN → neither bucket (Todo-2 contract, render blank). `truthByKey` is keyed by `JSON.stringify([lib,name])`
 *  (collision-proof, matches the questionnaire's truthKey). Returns leaf ANCHOR keys (the caller maps → segment ids). */
export function leafMarkBuckets(
  leafConcepts: Record<string, { lib: string; name: string; topWhenKey: string }>,
  satisfiedWhenKeys: Set<string>,
  truthByKey: Map<string, boolean>,
): { yesKeys: string[]; noKeys: string[] } {
  const yesKeys: string[] = [];
  const noKeys: string[] = [];
  for (const [leafKey, info] of Object.entries(leafConcepts)) {
    if (!satisfiedWhenKeys.has(info.topWhenKey)) continue; // off-path composite → no mark
    const sat = truthByKey.get(JSON.stringify([info.lib, info.name]));
    if (sat === true) yesKeys.push(leafKey);
    else if (sat === false) noKeys.push(leafKey); // undefined ⇒ UNKNOWN ⇒ neither
  }
  return { yesKeys, noKeys };
}

/** #210 Slice 1b (PURE, unit-tested): the yes/no leaf bucketing over an ALREADY-BUILT questionnaire + an INJECTED
 *  `resolveKey` (runtime `nodeId` → structure `when` nodeKey). Taking the questionnaire (not building it) + injecting the
 *  resolver keeps this vscode-free AND lets BOTH callers share ONE bucketing path with no drift: `driveLeafMarks` (the
 *  focused-case ring) and `driveDoneOverlay` (per-reviewed-case verdict paint). The FOCUSED case's questionnaire build is
 *  shared across all its drivers via `focusedQMemo` (`#187 Todo 5`); a non-focused reviewed case builds its questionnaire
 *  once per repaint (see `questionnaireFor`). The on-path-SATISFIED composite whens = the `when-evaluated`/`answer:"yes"`
 *  rows resolved via `resolveKey`; `leafMarkBuckets` then applies the on-path gate + the absent-is-unknown rule. */
export function leafBucketsFromQuestionnaire(
  questions: Questionnaire["questions"],
  resolveKey: (nodeId: string) => string | undefined,
  conceptTruth: readonly { libraryName?: string; name: string; satisfied: boolean }[] | undefined,
  leafConcepts: Record<string, { lib: string; name: string; topWhenKey: string }>,
): { yesKeys: string[]; noKeys: string[] } {
  const satisfiedWhenKeys = new Set<string>();
  for (const x of questions) {
    if (x.rowKind !== "when-evaluated" || x.answer !== "yes") continue;
    const k = resolveKey(x.nodeId);
    if (k !== undefined) satisfiedWhenKeys.add(k);
  }
  const truthByKey = new Map<string, boolean>();
  for (const r of conceptTruth ?? []) truthByKey.set(JSON.stringify([r.libraryName, r.name]), r.satisfied);
  return leafMarkBuckets(leafConcepts, satisfiedWhenKeys, truthByKey);
}

/** #210 (PURE, unit-tested): the composition at the heart of the all-pass badge + leaf-paint execution reach. Given a
 *  scenario's PRODUCED actions (`collectProducedActions` → `{nodeId}`), an INJECTED `resolveKey` (runtime nodeId →
 *  structure nodeKey, via `resolveThisNode`), and the `dispositionLeafKeys` set: re-root each produced action → its
 *  structure nodeKey, keep only those that ARE disposition leaves, deduped. An action that doesn't resolve, or resolves to
 *  a non-leaf (a use-decision boundary), is dropped. Injecting `resolveKey` keeps this vscode-free + lets the test prove
 *  the produced→leaf composition directly (the load-bearing seam). */
export function resolveProducedLeafKeys(
  producedActions: readonly { nodeId: string }[],
  resolveKey: (nodeId: string) => string | undefined,
  dispositionLeafKeys: Set<string>,
): string[] {
  const out: string[] = [];
  for (const p of producedActions) {
    const k = resolveKey(p.nodeId);
    if (k !== undefined && dispositionLeafKeys.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

/** #216/#217 (PURE, unit-tested): the frozen cases a clicked node applies to — the cases whose per-case key set (`keys`)
 *  contains the clicked SEMANTIC node key. ONE membership core shared by BOTH the Slice-1b sub-question left-click (keys =
 *  the on-path `yesLeafKeys` — leaf-true-but-when-off-path / when-on-but-leaf-false / same-concept-other-operand-path are all
 *  correctly excluded because they aren't in that set) AND the Slice-3 right-click resolver (keys = the case's full execution
 *  lit set: interior ∪ produced disposition leaves ∪ on-path yes-leaves). `key` is a SEMANTIC key (a structure `nodeKey` or a
 *  synthetic `leaf::` key — NOT the webview's render-scoped `data-reveal` key), valid for rendered tree nodes. Returns case
 *  ids in ENTRY ITERATION ORDER (stable QuickPick order), a case at most ONCE even if its `keys` repeats the match. Applies
 *  NO status/reviewability filter — the caller supplies exactly the entries it wants considered (e.g. an errored run passes
 *  `keys: []` so it never matches a leaf, but its interior keys still match; a non-reviewable case is simply omitted). */
export function caseIdsForNodeThroughLit(
  key: string,
  entries: Iterable<{ caseId: string; keys: readonly string[] }>,
): string[] {
  const out: string[] = [];
  for (const e of entries) {
    if (e.keys.includes(key) && !out.includes(e.caseId)) out.push(e.caseId);
  }
  return out;
}

/** #214 (PURE, unit-tested): should a selection auto-WIDEN the worklist verdict filter? True iff a NEW primary-cel case
 *  (`nextCaseId` present + DIFFERENT from `prevCaseId` — so a same-selection re-dispatch doesn't re-widen and undo a
 *  deliberate filter-off) whose `verdict` is NOT currently shown. When true the caller adds `verdict` to the filter + re-
 *  renders the worklist BEFORE the reveal, so the selected case's row/anchor exist (else `highlightRows` clears the pane). */
export function shouldWidenFilterForSelection(
  prevCaseId: string | undefined,
  nextCaseId: string | undefined,
  verdict: ReviewState,
  filter: ReadonlySet<ReviewState>,
): boolean {
  return nextCaseId !== undefined && nextCaseId !== prevCaseId && !filter.has(verdict);
}

export function registerCorrespondenceCockpit(context: vscode.ExtensionContext): void {
  // NOTE: crl.active is owned + gated (on workspace .crl/.cel content) by registerProvenancePanel — do NOT set it here.
  // An unconditional setContext at activation would surface both the provenance view and this navigator in EVERY window.

  let state: State = initialState();
  // The panel MODE (#156 medical-validation slice 3). One singleton controller + one parameterized webview: `CRL: Show
  // Cockpit` runs it in "cockpit" mode; `CRL: Show Medical Validation` RETARGETS the same session into "medical-validation"
  // mode (no fork, no 2nd webview). In THIS slice the mode changes only (a) which config section is read, (b) the pane
  // spec / default order, and (c) the panel title. The mode-gated features (the worklist checkbox render = slice 4; the
  // done/error overlay = slice 5) are threaded but NOT built here.
  let mode: "cockpit" | "medical-validation" = "cockpit";
  /** The config section for the current mode. `failedCriteriaMode` is SHARED (always `crl.cockpit`) and read directly. */
  const configSection = (m: "cockpit" | "medical-validation"): string =>
    m === "medical-validation" ? "crl.medical-validation" : "crl.cockpit";
  /** The pane spec for the current mode (valid set / canonical default / aliases). */
  const paneSpecFor = (m: "cockpit" | "medical-validation"): PaneSpec =>
    m === "medical-validation" ? MEDICAL_VALIDATION_PANE_SPEC : COCKPIT_PANE_SPEC;
  /** A pane's webview-panel title, reflecting the MODE (#156 slice 3). In medical-validation mode the panels carry a
   *  "CRL Medical Validation" prefix. Since the pane split (disc 179) the `worklist` pane carries its own title ("Worklist")
   *  and the `cel` pane reads "CEL" in BOTH modes (it's the read-only case-list now, not the worklist). */
  const paneTitle = (pane: Pane): string =>
    mode === "medical-validation" ? `CRL Medical Validation · ${PANE_TITLE[pane]}` : PANE_TITLE[pane];
  /** The navigable primary panes for the current mode (#156 slice 3, FIX 2). MV's primary enum is [source, cel] (no crl —
   *  it has no CRL pane in the default and its config enum excludes crl), so the set-primary quickpick + the persisted
   *  guard must reject "crl" in MV mode. Cockpit keeps the full [source, crl, cel]. */
  const primaryPanesForMode = (m: "cockpit" | "medical-validation"): PrimaryPane[] =>
    m === "medical-validation" ? ["source", "cel"] : PRIMARY_PANES;
  /** The set-primary quickpick LABEL for a pane in the current mode. The `cel` PRIMARY is the case-navigation kind (a case
   *  selection is `{primary:"cel"}` regardless of whether it's surfaced in the Worklist or the read-only CEL pane), so in
   *  MV it reads the pane-neutral "Cases" — NOT "Worklist" (which is now a distinct pane, disc 179). Cockpit uses "CEL". */
  const primaryLabel = (p: PrimaryPane): string =>
    mode === "medical-validation" && p === "cel" ? "Cases" : PANE_TITLE[p];
  const coord = new PaneRevealCoordinator();
  let model: ViewerModel | undefined;
  let correspondence: CorrespondenceModel | undefined;
  let crlStructure: CrlDecisionStructure[] = [];
  let conceptLayer: CrlConceptNode[] = [];
  let conceptShape: ConceptShapeIndex = new Map(); // #187 Todo 3: per-concept `defined as` shape subtrees (leaf expansion)
  let defExpr: DefExprIndex = new Map(); // #187 Option-3: per-concept `defined as` OPERATOR tree (questionnaire box render)
  let crlMaps: CrlRevealMaps | undefined;
  let scenarios: RenderScenarioResult | undefined;
  let caseIdByName: Record<string, string> = {};
  // #173 T3 (disc 158/159) — failed-criterion peek state, all recomputed in rebuild():
  //  - `scenarioByCaseId`: the caseId → ScenarioViewModel reverse join (the shell holds scenarios keyed by NAME; the
  //    cel selection carries a caseId, so we invert through the frozen caseIdByName — never by raw name, so a collision
  //    can't mis-join).
  //  - `duplicateScenarioNames`: names shared by >1 case (frozen or unfrozen) — peek DISABLED for these (collision guard).
  //  - `runtimeRefIndex`: the runtime-ref → CRL-row-nodeKey join (a pure map off crlStructure; failedCriterionPeek.ts).
  //  - `fcGaps`: the CURRENT peek's ungroundable criteria (the "Open CRL source at criterion" fallback list), rendered
  //    as a banner in the tree pane; `fcGapDisabledMsg` is the collision/disabled status the tree banner shows instead.
  let scenarioByCaseId: Map<string, ScenarioViewModel> = new Map();
  let duplicateScenarioNames: ReadonlySet<string> = new Set();
  let runtimeRefIndex: Map<string, string> = new Map();
  let fcGaps: { label: string; source: LsLocation }[] = [];
  let fcGapDisabledMsg: string | undefined;
  // The All/Blocking toggle (default Blocking). Cached from `crl.cockpit.failedCriteriaMode`; the tree pane's
  // segmented control + a settings edit both route through `applyFailedCriteriaMode`.
  let failedCriteriaMode: "blocking" | "all" = "blocking";
  // disc 164 (operator follow-on): the produced-path diverter overlay is OFF by default — it adds a lot of ink (a not-adult
  // deny lights both indications), so the validator opts in per session/workspace. Config-backed + live like failedCriteriaMode
  // (`crl.cockpit.showDetails`, default false), toggled from the tree chrome (MV mode only — diverters never paint in cockpit).
  let showDetails = false;
  /** Concept keys that have ≥1 source-bearing unit OR ≥1 CRL row — the gate for a fact being a clickable peek anchor
   *  (recomputed from crlMaps each rebuild; read at CEL render time, mirroring caseIdByName). */
  let revealableConceptKeys: ReadonlySet<string> = new Set();
  /** REVERSE map (C2c-2b): concept key → CEL fact anchors of the CURRENT cel render. UNLIKE revealableConceptKeys above
   *  (rebuild-cadence, render-stable), this is RENDER-scoped: its values embed the render gen, so it's captured atomically
   *  with the cel pane's `v.anchors` in renderPane's cel branch — NEVER set in rebuild() / never cached across renders.
   *  A single shell global (not per-PaneView) is safe because there is exactly one CEL pane and every rebuild renders it;
   *  revisit if panes ever re-render independently. */
  let conceptToFactAnchors: Record<string, string[]> = {};
  // Medical Validation (#156 slice 4) — the worklist review state, mode-scoped. `reviewByCaseId` is the persisted sidecar
  // map (caseId → "pending" | "pass" | "fail"; ABSENCE = "To do", never stored). Loaded BEFORE the first rebuild in MV mode
  // (so the dropdowns paint correctly on first show, no flash); empty in cockpit mode (worklist disabled). HOST is the
  // authority for the next state (the webview is not). `mvSidecarPath` is the resolved sidecar path for `currentCel` (set
  // alongside the load) — the toggle's save target. `worklistActions` is the CURRENT cel render's opaque-key → caseId map
  // (render-scoped, captured atomically with the cel pane's anchors, like conceptToFactAnchors).
  let reviewByCaseId: Record<string, PersistedReviewState> = {};
  // #156 notes — the per-case conversation threads (caseId → Note[]; ABSENCE = no notes). Loaded alongside reviewByCaseId
  // from the SAME sidecar. `persistMv()` is the SINGLE save path that marries both maps (composeSidecar) so a verdict change
  // can never wipe notes nor vice-versa. `openNotesCaseId` = which case's right-drawer is open (host UI-state, survives the
  // cel pane's innerHTML re-renders); `editingNoteId` = which note (if any) is in edit-in-place mode. Both are cleared in
  // every MV-state reset path (load / rebuild-reset / retarget) so a stale drawer can't post against a prior policy's case.
  let notesByCaseId: Record<string, Note[]> = {};
  let openNotesCaseId: string | undefined;
  let editingNoteId: string | undefined;
  // #211 create-flag drawer — the in-flight flag draft (the resolved target + prefill + the policy identity captured at
  // open), or undefined when the drawer is closed. It lives in a DEDICATED `#flagDrawer` webview region that the render
  // handler never touches, so the drawer + the user's typed text SURVIVE a same-policy tree rebuild; the host clears it
  // (posting an empty region) on retarget / mode reset. `FlagDraftState` is declared with `FlagTargetChoice` below.
  let flagDraft: FlagDraftState | undefined;
  let flagCommitting = false; // #211: an in-flight commit guard — a rapid second Insert must not double-POST / race the write
  let githubAuthDeclined = false; // #211: the user declined the GitHub sign-in this session → don't re-prompt on every flag
  let mvSidecarPath: string | undefined;
  // #203 Todo 4 — the review-flag surface. `flagsList` = ALL flags (open + resolved) across the policy's `src/crl/*.crl`
  // files, freshly (re)loaded in loadFlags() from the LIVE editor buffer when a `.crl` is open (else disk) so a dirty edit's
  // line offsets match what the write-back edits. `flagLoadError` = a `.crl` failed to parse → flag state is UNKNOWN, so the
  // mvComplete gate conservatively does NOT report complete. Both cleared on retarget/reset (mirrors the MV-state resets).
  let flagsList: FlagInstance[] = [];
  let flagLoadError = false;
  let worklistActions: Record<string, { caseId: string }> = {};
  // #214: the worklist verdict FILTER — the set of verdicts whose rows are SHOWN. Session-only VIEW state (NOT persisted;
  // reset to all-shown on every MV retarget alongside the drawer state), so policy A's filter can't hide policy B.
  let worklistFilter: Set<ReviewState> = new Set(REVIEW_STATES);
  // #177 slice 3 — the questionnaire panel's focused-question cursor. DEFAULT `-1` = "no question focused" (the pane
  // shows "Question 0 of Y"; Next moves to question 1) — a case does NOT auto-focus its first question. RESET to -1 on a
  // real cel-case change. Declared HERE so slices 4 (the "this node" marker) + 5 (the prev/next sub-nav) build on it.
  let currentQuestionIndex = -1;
  // #177 slice 4 — the CURRENT questionnaire render's ordered question runtime nodeIds (captured atomically with the
  // questionnaire pane's anchors, mirroring worklistActions/conceptToFactAnchors). `driveThisNode` resolves the FOCUSED
  // question's nodeId as `questionNodeIds[currentQuestionIndex]` without re-running the walk. Empty when no case/no
  // questions (→ driveThisNode clears all panes).
  let questionNodeIds: string[] = [];
  /** The last sidecar (path + warning) we surfaced — so a corrupt/forward-version sidecar warns ONCE, not on every
   *  re-`Show Medical Validation` on the same path within a session. Reset implicitly: a different path or warning re-warns. */
  let lastWarnedSidecar: { path: string; warning: string } | undefined;
  // #163 at-rest correspondence key. `unitNumber` = unitId → its 1-based index in `model.steps` order (= the navigator
  // order; an ephemeral within-render index, re-numbered each rebuild). `rowKeyNumbers`/`caseKeyNumbers` = the per-element
  // number lists the CRL/CEL renderers stamp. `showKeys` gates the whole channel. All recomputed in rebuild + cached here
  // so the onConfig toggle can re-render WITHOUT a full rebuild.
  let unitNumber: Map<string, number> = new Map();
  let rowKeyNumbers: Record<string, number[]> = {};
  let caseKeyNumbers: Record<string, number[]> = {};
  let conceptKeyNumbers: Record<string, number[]> = {}; // #166 Slice 3a — at-rest key on concept rows
  let showKeys = true;
  let indexVersion = 0;
  let currentCel: string | undefined;
  /** last span-click locus (trusted, from the renderer) — open-raw uses it when it still matches the selection. */
  let lastClicked: { unitId: string; range: ZeroBasedRange } | undefined;
  // #219: the pane a CLICK-driven reveal ORIGINATED in — its own highlight/overlay must NOT scroll (the user positioned this
  // pane; a same-pane reveal must respect that). Set in the reveal handler (covering peeks + selection) + re-armed around the
  // async multi-case dispatch; consumed by postReveal→highlightRows AND driveFailedCriteriaPeek→markFailedCriteria (both the
  // scroll channels). Undefined for every non-click re-drive (restore / keyboard-nav / ack) → they keep the scroll-to-anchor
  // behavior (desired: you asked to navigate, not to hold position). Cross-pane targets (pane ≠ origin) still scroll to bring
  // the match into view. CAVEAT: an ack-DEFERRED origin reveal (the pane was mid-render at click time, so applyReveal queued
  // and postReveal runs in a later turn with the flag cleared) will scroll — rare (a click implies an acked DOM); accepted.
  let scrollSuppressPane: Pane | undefined;
  const views = new Map<Pane, PaneView>();
  let paneOrder: Pane[] = normalizePaneOrder(undefined, COCKPIT_PANE_SPEC); // user layout (configSection(mode).paneOrder), normalized
  let watcher: vscode.FileSystemWatcher | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let orderDebounce: ReturnType<typeof setTimeout> | undefined;

  /** The column a pane opens in = its index among the OPEN panes in paneOrder (panels already created PLUS the one being
   *  opened) — gap-free when a pane is hidden. Uses `views` (the same runtime signal applyPaneOrder uses) so creation-time
   *  and live-reorder columns stay in lockstep — keep both predicates `views`-based. */
  const columnFor = (paneToOpen: Pane): vscode.ViewColumn => {
    const open = paneOrder.filter((p) => views.has(p) || p === paneToOpen);
    return ORDERED_COLUMNS[Math.max(0, open.indexOf(paneToOpen))] ?? vscode.ViewColumn.One;
  };

  /** Reassert the full pane layout from paneOrder by revealing each OPEN panel at its slot (ascending column). */
  const applyPaneOrder = (): void => {
    const open = paneOrder.filter((p) => views.has(p));
    open.forEach((pane, i) => views.get(pane)?.panel.reveal(ORDERED_COLUMNS[i] ?? vscode.ViewColumn.One, true));
  };

  /** Reconcile OPEN panels to the (normalized) paneOrder, then place columns. Unlike applyPaneOrder (reorder-only), this
   *  OPENS a now-listed visible pane (rendering it immediately so it isn't blank) and DISPOSES an open pane dropped from
   *  the order — so toggling the opt-in tree pane in settings takes effect live, without re-running "Show Cockpit". Only
   *  the tree pane can ever be disposed here: normalizePaneOrder always re-adds the 3 canonical panes. */
  const reconcilePaneOrder = (): void => {
    for (const pane of [...views.keys()]) if (!paneOrder.includes(pane)) views.get(pane)?.panel.dispose(); // dispose dropped (tree only)
    let opened = false;
    for (const pane of paneOrder) {
      if (!state.paneVisibility[pane]) continue;
      const existed = views.has(pane);
      ensurePane(pane);
      if (!existed) {
        renderPane(pane); // a freshly-opened pane needs its content posted (rebuild won't run on a settings edit)
        opened = true;
      }
    }
    applyPaneOrder();
    // A pane opened mid-session holds no queued reveal (absent-pane effects were dropped in applyReveal) → re-drive the
    // current selection so the new pane highlights it on ack, instead of showing a blank/un-highlighted flowchart.
    if (opened && state.selection) dispatch({ type: "select", selection: state.selection });
  };

  // ── navigator TreeView (adapter over the headless navigatorItems model) ──
  const onNav = new vscode.EventEmitter<NavigatorItem | undefined>();
  const navProvider: vscode.TreeDataProvider<NavigatorItem> = {
    onDidChangeTreeData: onNav.event,
    getChildren: () => navigatorItems(state),
    // reveal() requires getParent (flat list → all roots) + a stable TreeItem.id, so reflecting a pane-driven selection
    // back to the navigator matches the rendered item across refreshes (navigatorItems returns fresh objects each call).
    getParent: () => undefined,
    getTreeItem: (it) => {
      // #163 at-rest key: prefix the row with the unit number(s) it corresponds to (shell-side, so the pure engine
      // stays number-free). Source item = its own unit number; CRL/CEL item = the units its row/case maps to. id +
      // description are untouched (reveal-match by id / decision-status text unaffected).
      const navNums =
        it.selection.primary === "source"
          ? unitNumber.has(it.id)
            ? [unitNumber.get(it.id)!]
            : []
          : it.selection.primary === "crl"
            ? rowKeyNumbers[it.id] ?? []
            : caseKeyNumbers[it.id] ?? [];
      const label = showKeys && navNums.length ? `${navNums.join(",")} · ${it.label}` : it.label;
      const t = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
      t.id = it.id;
      if (it.description) t.description = it.description;
      // A TreeItem command fires only on USER click/enter — programmatic reveal() does not invoke it, so no round-trip guard is needed.
      t.command = { command: "crl.cockpit.selectItem", title: "Select", arguments: [it.selection] };
      return t;
    },
  };
  const navView = vscode.window.createTreeView<NavigatorItem>("crlCockpitNavigator", {
    treeDataProvider: navProvider,
  });
  // Re-sync the navigator to the current selection on the visible→true edge. In MV mode
  // reflectSelectionToTree skips while the flyout is hidden (so worklist clicks don't re-open
  // it) — which leaves the navigator stale; opening the flyout later must show the CURRENT
  // selection, not the last one synced before it was hidden. (reflectSelectionToTree is a
  // hoisted function declaration, so referencing it here is fine.)
  context.subscriptions.push(
    navView.onDidChangeVisibility((e) => {
      if (e.visible) reflectSelectionToTree();
    }),
  );

  /** The currently-focused cel caseId for a state (undefined when the selection is not a cel case). The questionnaire's
   *  selection key — the re-render hook fires only when THIS changes (a real case switch), not on a same-selection
   *  redispatch (the highlight-restore re-dispatch setWorklist/applyShowKeys fire). */
  const focusedCaseId = (s: State): string | undefined =>
    s.selection && s.selection.primary === "cel" ? s.selection.caseId : undefined;

  // ── dispatch / effects ──
  function dispatch(action: Action): void {
    const prevCaseId = focusedCaseId(state); // #177 slice 3: capture the focused case BEFORE reduce (real-change detection)
    const { state: next, effects } = reduce(state, action);
    state = next;
    // #214 AUTO-WIDEN: a NEW primary-cel selection of a case whose verdict is filtered OUT must not vanish from its OWN
    // worklist (highlightRows posts clearHighlight on the missing anchor — the case would show everywhere BUT the worklist).
    // Include that verdict + re-render the worklist BEFORE the reveal, so the case's row + anchor exist. GATED on a CHANGED
    // caseId, so a same-selection re-dispatch (a filter toggle / verdict change re-drive) does NOT re-widen — that would undo
    // a deliberate filter-off of the currently-selected case's verdict. A source/crl→cel multi-case reveal is NOT a primary
    // cel selection, so it respects the filter (a partial highlight of the matching cases is the filter working as intended).
    const nextCid = focusedCaseId(next);
    if (mode === "medical-validation" && views.has("worklist") && nextCid !== undefined) {
      const v: ReviewState = reviewByCaseId[nextCid] ?? "unreviewed";
      if (shouldWidenFilterForSelection(prevCaseId, nextCid, v, worklistFilter)) {
        worklistFilter.add(v);
        renderPane("worklist"); // re-render with the widened filter so the selection's reveal (below) finds the case's anchor
      }
    }
    for (const e of effects) applyReveal(e);
    onNav.fire(undefined);
    reflectSelectionToTree();
    // #173 T3: drive the failed-criterion overlay for the (now-settled) selection. MUST run AFTER applyReveal so the
    // selection's `.current` highlight is posted FIRST and the `.failed-criterion` overlay (a separate channel) lands
    // after it — the next selection's `.current`/clearHighlight then wipes the overlay, but this same-click reveal does
    // not (disc 159, the ordering invariant). The overlay is its own channel, so it coexists with `.current`.
    driveFailedCriteriaPeek();
    // disc 164: the produced-path diverter overlay — same post-dispatch timing + ordering invariant as the failed-criterion
    // peek (lands AFTER the selection's `.current`/clrDV, so the SAME-click marks survive; the NEXT reveal's clrDV drops them).
    // Its own channel, MV-only, selection-coupled. Inert (clears) in cockpit / for a non-cel, errored, or no-diverter case.
    driveDiverters();
    // #187 Todo 5: the per-case def-leaf verdict overlay (tree-only). PERSISTENT (survives a cockpit reveal, re-driven on
    // tree-ack + rebuild) — but re-driven here too so a selection change repaints immediately (latency opt; the ack self-heals).
    driveLeafMarks();
    // #177 slice 3: the selection-scoped questionnaire re-render — the genuinely NEW trigger (no pane re-rendered on
    // selection before this). The decision is the PURE, unit-tested `shouldRerenderQuestionnaire` (FIX 2): MV mode + the
    // questionnaire pane open + a REAL focused-case change (not a same-selection highlight-restore redispatch). On a true
    // change we reset the host-held `currentQuestionIndex` to 0 (slices 4/5 build on it) THEN re-render the pane for the
    // new case. A non-cel / cleared selection (prevCaseId set → undefined) is a real change too: it re-renders to the
    // placeholder. The pane-open gate also makes cockpit mode inert (questionnaire ∉ cockpit spec → never in `views`).
    if (
      shouldRerenderQuestionnaire({
        prevCaseId,
        nextCaseId: focusedCaseId(next),
        mode,
        paneOpen: views.has("questionnaire"),
      })
    ) {
      currentQuestionIndex = -1; // a new case starts with NO question focused
      renderPane("questionnaire");
      // #177 slice 4: the questionnaire just re-rendered for the new case (no focused question) — re-drive the "this node" marker
      // across all panes. CORRECTNESS MODEL (mirrors driveDoneOverlay): the PANE-ACK re-drive (onWebviewMessage's `ready` →
      // driveThisNode, fires on every marker-bearing pane render) is the guarantee — a freshly rendered pane always re-paints
      // from current state. This immediate post is a LATENCY optimization relying on VS Code webview postMessage being
      // FIFO-ordered on the single serialized host→webview channel: render → mark arrive in order, gen-stamped so a mark
      // aimed at a superseded render is dropped — NOT an unguarded race. A non-cel / cleared selection (questionNodeIds
      // emptied on the placeholder render) → driveThisNode clears all panes.
      driveThisNode();
    }
  }

  function applyReveal(e: Effect): void {
    const v = views.get(e.pane);
    if (!v) return;
    coord.queueReveal(e.pane, e.target, indexVersion);
    // Steady-state flush ONLY when the pane's CURRENT render is acked AND is for the current index. During a rebuild
    // the global indexVersion has advanced past the still-acked old render, so this is skipped and the reveal waits for
    // the new render's ack (avoiding a flush against the about-to-be-replaced DOM that would also drop the new reveal).
    if (v.acked && v.indexVersion === indexVersion) {
      const target = coord.ready(e.pane, v.gen, v.indexVersion);
      if (target) postReveal(e.pane, target);
    }
  }

  /** Post a highlight for a set of anchor keys (source anchors keyed by unitId; CRL anchors by nodeKey). Accumulates
   *  segmentIds across all keys + scrolls to the first found — so a target spanning N units/rows highlights them all. */
  function highlightRows(v: PaneView, anchorKeys: string[], suppressScroll = false): void {
    const segmentIds: string[] = [];
    let scrollTo: string | undefined;
    for (const k of anchorKeys) {
      const a = v.anchors[k];
      if (!a) continue;
      if (!scrollTo) scrollTo = a.scrollTo;
      for (const id of a.segmentIds) if (!segmentIds.includes(id)) segmentIds.push(id);
    }
    // No anchor for this selection in this pane → CLEAR its prior highlight rather than leave it stale.
    // #219: `suppressScroll` (a same-pane click) → paint the `.current` highlight but OMIT scrollTo, so the pane the user
    // clicked in keeps its scroll position (the reveal's first anchor is the decision ROOT — scrolling there yanked the
    // viewport away from the clicked node). The webview's highlight handler no-ops the scroll when scrollTo is absent.
    void v.panel.webview.postMessage(
      scrollTo ? { type: "highlight", gen: v.gen, scrollTo: suppressScroll ? undefined : scrollTo, segmentIds } : { type: "clearHighlight" },
    );
  }

  /** Case → the CRL rows of all its units, DIRECT + branch-scoped per unit (a case legitimately spans branches). Used by
   *  mapHitToPrimary (the SELECTION direction — stays direct so it round-trips, like the unit arm). The postReveal
   *  HIGHLIGHT direction uses crlAnchorsForUnits instead (containment + concept rows). NOTE: a case whose units cite ONLY
   *  containment-nested concepts (no direct row) maps to [] here → the CRL-primary case-click is an intentional no-op
   *  (selecting a containment-only container `when` would not round-trip back to the case — same reason the unit arm is direct). */
  function rowsForCase(caseId: string): string[] {
    if (!crlMaps) return [];
    const rows: string[] = [];
    for (const u of unitsForCase(caseId, crlMaps))
      for (const r of rowNodeKeysForUnit(u, crlMaps)) if (!rows.includes(r)) rows.push(r);
    return rows;
  }

  /** Resolve a SEMANTIC reveal target to a pane's anchor keys (3×3 of target.kind × pane), then highlight.
   *  Anchor keys per pane: source by unitId, crl by nodeKey, cel by caseId. Cross-resolutions go via the unit maps. */
  function postReveal(pane: Pane, target: SemanticTarget): void {
    const v = views.get(pane);
    if (!v || !crlMaps) return;
    const m = crlMaps;
    // The TREE (flowchart) pane highlights in lockstep with the CRL pane: it anchors the SAME structure nodeKeys, so it
    // reuses the crl anchor-key sets verbatim. (The crl sets also include concept-row keys; the flow pane has no concept
    // anchors, so those simply no-op in highlightRows — the structure rows light up, which is the intent.)
    // #219: a reveal targeting the pane the click originated in must NOT scroll (respect the user's viewport). Cross-pane
    // targets (pane ≠ origin) still scroll to bring the corresponding row into view.
    const noScroll = pane === scrollSuppressPane;
    if (target.kind === "unit") {
      if (pane === "source") highlightRows(v, [target.id], noScroll);
      // #166 3b: unit → its driving decisions (direct + concept containment, scoped ONCE) THEN its applicable concept
      // rows (direct concepts). Decisions first so highlightRows scrolls to the decision tree (today's behavior).
      else if (pane === "crl" || pane === "tree") highlightRows(v, crlAnchorsForUnits([target.id], m), noScroll);
      // CEL: the unit's artifact cases (block-level) + the fact spans referencing its concepts (C2c-2b reverse, facts first)
      else if (pane === "cel") highlightRows(v, reverseCelAnchors(conceptKeysForUnit(target.id, m), caseIdsForUnit(target.id, m), conceptToFactAnchors), noScroll);
      // WORKLIST (disc 179): the same case rows, but NO fact-peek spans (the worklist render omits them), so just the case blocks.
      else if (pane === "worklist") highlightRows(v, caseIdsForUnit(target.id, m), noScroll);
    } else if (target.kind === "crlNode") {
      // #166 3b: a decision row → itself THEN the concepts it surfaces (direct refKeys + their contained sub-concepts).
      if (pane === "crl" || pane === "tree") highlightRows(v, [target.id, ...conceptNodesForRow(target.id, m)], noScroll);
      else if (pane === "source") highlightRows(v, unitsForRow(target.id, m), noScroll); // crl node → its source units (direct)
      else if (pane === "cel") highlightRows(v, reverseCelAnchors(conceptKeysForNode(target.id, m), caseIdsForNode(target.id, m), conceptToFactAnchors), noScroll);
      else if (pane === "worklist") highlightRows(v, caseIdsForNode(target.id, m), noScroll); // case blocks only (no fact spans)
    } else {
      // celCase — both case-display panes light the same case block/row (fanned to each; each paints its own DOM).
      if (pane === "cel" || pane === "worklist") highlightRows(v, [target.id], noScroll);
      else if (pane === "source") highlightRows(v, unitsForCase(target.id, m).filter((u) => m.sourceBearingUnits.has(u)), noScroll);
      // #166 3b-fix: case → its units' driving decisions (direct + containment) AND their applicable concept rows.
      else if (pane === "crl" || pane === "tree") highlightRows(v, crlAnchorsForUnits(unitsForCase(target.id, m), m), noScroll);
    }
  }

  function clearAllHighlights(): void {
    for (const v of views.values()) void v.panel.webview.postMessage({ type: "clearHighlight" });
  }

  /** Post the DISTINCT `.failed-criterion` overlay for a set of anchor keys in one pane (#173 T3, disc 158 §"Reveal
   *  model"). UNLIKE highlightRows (which posts `.current` + scrolls), this paints a SEPARATE channel that COEXISTS with
   *  the engine selection's `.current` highlight — so the failed-criteria peek never conflates with the at-rest
   *  selection. Empty anchorKeys → clear the channel (so a pass/empty frontier wipes a stale overlay). The MARK is
   *  gen-carried so the webview drops a mark aimed at a superseded render (mirrors highlightRows; disc 159 Claude-17);
   *  the CLEAR is global by design (removing a class is always safe — no gen needed; disc 160 FIX 6). */
  /** Resolve a set of anchor keys → the deduped segmentIds + the first scrollTo for THIS pane. */
  function segmentsFor(v: PaneView, anchorKeys: string[]): { segmentIds: string[]; scrollTo?: string } {
    const segmentIds: string[] = [];
    let scrollTo: string | undefined;
    for (const k of anchorKeys) {
      const a = v.anchors[k];
      if (!a) continue;
      if (!scrollTo) scrollTo = a.scrollTo;
      for (const id of a.segmentIds) if (!segmentIds.includes(id)) segmentIds.push(id);
    }
    return { segmentIds, scrollTo };
  }

  function markFailedCriteria(v: PaneView, blockerKeys: string[], preemptKeys: string[], suppressScroll = false): void {
    // #173 T3 FIX 3 (disc 160): TWO honesty channels in one message — a real blocker (unsatisfied-when / guarded-out)
    // paints `.failed-criterion` (red); a `preemption` row is the SATISFIED matched sibling that DIVERTED the run, so it
    // paints the DISTINCT `.failed-criterion-preempt` (amber "diverted"), never red — consistent with the run-tree.
    const blocker = segmentsFor(v, blockerKeys);
    const preempt = segmentsFor(v, preemptKeys);
    const scrollTo = blocker.scrollTo ?? preempt.scrollTo;
    // #219: this overlay ALSO scrolls (its own scroll path, distinct from highlightRows). It runs AFTER the selection's
    // highlight in the SAME dispatch, so for a same-pane click it would re-scroll the pane the click's highlight just left
    // in place — suppress it too (omit scrollTo; the mark still paints the `.failed-criterion` channel).
    void v.panel.webview.postMessage(
      scrollTo
        ? { type: "markFailedCriteria", gen: v.gen, scrollTo: suppressScroll ? undefined : scrollTo, blockerIds: blocker.segmentIds, preemptIds: preempt.segmentIds }
        : { type: "clearFailedCriteria" },
    );
  }

  /** Clear the failed-criterion overlay channel across every pane (independent of `.current`). */
  function clearAllFailedCriteria(): void {
    for (const v of views.values()) void v.panel.webview.postMessage({ type: "clearFailedCriteria" });
  }

  /** Fact peek (C2c-2): a transient cross-pane highlight of a CEL fact's CONCEPT — shell-side, NO engine selection (so
   *  it never perturbs the navigator/coord/selection). Clears all panes FIRST so the peek is self-consistent; the next
   *  engine reveal (selection / next / prev / primary-switch) touches every visible pane (highlightRows clears-on-empty)
   *  and so wipes the peek. Posts directly to the webview (bypassing the coordinator, like clearAllHighlights) — safe
   *  because a click only fires from an acked DOM and the shell drops a highlight whose gen ≠ the rendered gen; the
   *  segmentIds are read LIVE from crlMaps/v.anchors, not a stale snapshot. A *clickable* fact's concept is in
   *  revealableConceptKeys ⇒ at least one of the source/crl arms is non-empty, so a peek is never a blank clear. */
  function peekConcept(hit: { conceptKey: string; factAnchorKey: string }): void {
    clearAllHighlights(); // clear first → even a no-maps peek wipes any stale highlight
    if (!crlMaps) return;
    const src = views.get("source");
    const crl = views.get("crl");
    const cel = views.get("cel");
    const tree = views.get("tree");
    if (src) highlightRows(src, unitsForConcept(hit.conceptKey, crlMaps)); // concept → source-bearing units
    if (crl) highlightRows(crl, conceptCrlAnchors(hit.conceptKey, crlMaps)); // #166 3b: own row + driven decisions (direct + containment)
    if (tree) highlightRows(tree, conceptCrlAnchors(hit.conceptKey, crlMaps)); // T3: the flowchart decisions the concept gates
    if (cel) highlightRows(cel, [hit.factAnchorKey]); // self-highlight the clicked fact span
  }

  /** Concept-row peek (#166 Slice 3a): clicking a concept in the CRL pane → a transient highlight of its source units +
   *  the decisions it drives (direct + via containment) + the concept row itself. Shell-side, no engine selection (the
   *  concept is not a navigator item). Mirrors peekConcept; source arm uses the source-bearing units (only those anchor). */
  function peekConceptNode(conceptKey: string): void {
    clearAllHighlights();
    if (!crlMaps) return;
    const src = views.get("source");
    const crl = views.get("crl");
    const tree = views.get("tree");
    if (src) highlightRows(src, unitsForConcept(conceptKey, crlMaps)); // concept → source-bearing units (only those anchor)
    // crl: the concept's own row (self) + the decision rows it drives (direct + containment) — shared with the fact peek.
    if (crl) highlightRows(crl, conceptCrlAnchors(conceptKey, crlMaps));
    if (tree) highlightRows(tree, conceptCrlAnchors(conceptKey, crlMaps)); // T3: the flowchart decisions the concept gates
  }

  /** Build the tree-pane CHROME (the All/Blocking segmented toggle + the gap "Open CRL source" banner) as HTML posted
   *  to a `#fcChrome` region ABOVE the flowchart — so it never clobbers the SVG `#root` (disc 159 Claude-16). The toggle
   *  buttons carry `data-fc-mode`; each gap row carries `data-fc-gap` (its index into `fcGaps`). Both are handled by the
   *  shell webview script (distinct from the `[data-reveal]` path). */
  function buildTreeChromeHtml(): string {
    // #156 slice 6: the worklist progress readout, MV mode ONLY (cockpit omits it → its chrome is byte-unchanged). PREPENDED
    // above the (unconditional) #173 All/Blocking toggle + gap banner. The reviewable denominator is the SAME paintable set
    // the done overlay uses (`scenarioByCaseId.keys()` — frozen, non-ambiguous); the total case count (`scenarios.length`)
    // lets the readout surface the unreviewable (unfrozen/ambiguous) rows the worklist shows but can't review (disc 161
    // §"Architecture": "never hidden — honesty"). Recomputed on every renderTreeChrome() call (tree ack, toggle, mode change).
    // `unreviewable = scenarios.length − scenarioByCaseId.size` assumes one frozen caseId per scenario row (the cel pane
    // renders one checkbox per row; scenarioByCaseId, a Map, is the reviewable set slice 5 already paints from). A frozen
    // caseId is a per-case identity, so two differently-named rows can't collapse to one key — the same invariant the done
    // overlay's `scenarioByCaseId.keys()` paintable set relies on; this readout is no more fragile than the overlay it pairs with.
    // #156 slice 6 (cases half) + #203 Todo 4 (flags half). The two are composed at the DISPLAY level only: when BOTH are
    // clean the gate collapses to a single "✓ Medical validation complete"; otherwise each half shows what's blocking. The
    // flag counts are conservative — only an explicit `; status resolved` clears (absent/unknown status blocks), matching
    // openFlags. `flagLoadError` (an unparseable `.crl`) forces the gate open (mvComplete must never silently pass).
    let progress = "";
    if (mode === "medical-validation") {
      const p = reviewProgress(reviewByCaseId, [...scenarioByCaseId.keys()], scenarios?.scenarios.length ?? 0);
      const resolvedCount = flagsList.filter((f) => f.status === "resolved").length;
      const fc: FlagChrome = { open: flagsList.length - resolvedCount, resolved: resolvedCount, error: flagLoadError };
      progress = mvComplete(p, fc)
        ? `<div class="mv-progress mv-progress-done mv-gate-complete">✓ Medical validation complete</div>`
        : renderProgressChrome(p) + renderFlagChrome(fc);
    }
    const btn = (mode: "blocking" | "all", label: string): string =>
      `<button class="fc-toggle-btn${failedCriteriaMode === mode ? " fc-active" : ""}" data-fc-mode="${mode}">${label}</button>`;
    const toggle =
      `<div class="fc-toggle" title="Which failed criteria to highlight for the selected case">` +
      `<span class="fc-toggle-label">Failed criteria:</span>${btn("blocking", "Blocking")}${btn("all", "All")}</div>`;
    // disc 164 (operator follow-on): the produced-path diverter overlay on/off. MV-only (diverters never paint in cockpit
    // mode); persisted SHARED under crl.cockpit, default OFF. Two buttons mirror the fc toggle's active-state idiom.
    const dbtn = (on: boolean, label: string): string =>
      `<button class="fc-toggle-btn${showDetails === on ? " fc-active" : ""}" data-diverter-toggle="${on ? "1" : "0"}">${label}</button>`;
    const diverterToggle =
      mode === "medical-validation"
        ? `<div class="fc-toggle" title="Show why the selected case got its outcome — highlight the deciding criteria (the ones that, by being false, routed it there, e.g. the age gate for a not-adult denial) across the Source, Tree and CRL panes">` +
          `<span class="fc-toggle-label">Details:</span>${dbtn(false, "Off")}${dbtn(true, "On")}</div>`
        : "";
    let banner = "";
    if (fcGapDisabledMsg) {
      banner = `<div class="fc-gaps fc-gaps-disabled">${escapeHtml(fcGapDisabledMsg)}</div>`;
    } else if (fcGaps.length) {
      const rows = fcGaps
        .map(
          (g, i) =>
            `<div class="fc-gap-row" data-fc-gap="${i}" title="Exact CRL row couldn't be determined — opens the criterion's source">` +
            `⚠ ${escapeHtml(g.label)} <span class="fc-gap-open">Open CRL source</span></div>`,
        )
        .join("");
      banner =
        `<div class="fc-gaps"><div class="fc-gaps-head">Couldn't locate the CRL row for:</div>${rows}</div>`;
    }
    // #218: the color KEY sits AFTER the banner so a transient ⚠ gap alert stays adjacent to the toggles. MV-only (the
    // helper returns "" in cockpit mode — verdict fills only paint in MV, and the operator scoped the legend to MV).
    return progress + toggle + diverterToggle + banner + flowLegendChrome(mode);
  }

  /** Push the current tree-pane chrome (toggle + gap banner) to the tree webview, if open. Does NOT re-render the
   *  flowchart `#root` (so the failed-criterion overlay already painted on the SVG survives). */
  function renderTreeChrome(): void {
    const tree = views.get("tree");
    if (tree) void tree.panel.webview.postMessage({ type: "fcChrome", html: buildTreeChromeHtml() });
  }

  // ── #203 Todo 4: the review-flag surface ────────────────────────────────────────────
  // Flags live IN the `.crl` (unlike verdicts, which live in the sidecar). The cockpit LOADS them (all `src/crl/*.crl`,
  // live-buffer-aware), surfaces the count + the mvComplete gate in the tree chrome, and WRITES BACK the open↔resolved
  // status via the #205 `rewriteMetaStatus` refactor primitive (a WorkspaceEdit + save, guarded against a stale line).

  /** Read a policy `.crl`'s text from the LIVE editor buffer when it's open (so an unsaved edit's line offsets match the
   *  buffer the write-back edits), else from disk. Undefined if unreadable. */
  function crlText(filePath: string): string | undefined {
    // Case-insensitive fsPath compare on Windows (drive-letter/casing differences must not make loadFlags read DISK while
    // the write-back edits the live BUFFER — the design depends on both seeing the same line offsets; gpt55 impl review).
    const same = (a: string, b: string): boolean => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
    const open = vscode.workspace.textDocuments.find((d) => same(d.uri.fsPath, filePath));
    if (open) return open.getText();
    try {
      return readFileSync(filePath, "utf8");
    } catch {
      return undefined;
    }
  }

  /** (Re)load ALL review flags across the policy's `src/crl/*.crl` files into `flagsList`. An unparseable/unreadable `.crl`
   *  sets `flagLoadError` (→ the mvComplete gate stays open — flag state is unknown, must not silently pass). Called from
   *  rebuild() (MV mode) and after a status write-back. Globs the WHOLE crl/ dir so a library-scope flag in a decision-only
   *  file is still found (the cross-library separate-file layout, #196); each flag carries its OWN filePath for the write-back. */
  function loadFlags(): void {
    flagsList = [];
    flagLoadError = false;
    if (mode !== "medical-validation" || !currentCel) return;
    const src = findPolicySrc(currentCel);
    if (!src) return;
    let files: string[];
    try {
      // Case-insensitive `.crl` match + sorted, so the flag list order is deterministic across platforms/filesystems.
      files = readdirSync(join(src, "crl")).filter((f) => f.toLowerCase().endsWith(".crl")).sort();
    } catch (e) {
      // A MISSING crl/ dir is legitimately "no flags" (a measure/activities-only policy has no decision `.crl`). But an
      // unreadable PRESENT dir (EACCES/EIO) is an unknown source → block the gate (Claude impl review: don't silently pass).
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") flagLoadError = true;
      return;
    }
    for (const name of files) {
      const filePath = join(src, "crl", name);
      const text = crlText(filePath);
      if (text === undefined) {
        flagLoadError = true;
        continue;
      }
      const parsed = buildCRL(text);
      if (!parsed.success || !parsed.result) {
        flagLoadError = true;
        continue;
      }
      flagsList.push(...collectFlags(parsed.result, { filePath }));
    }
  }

  const flagNote = (m: string): void => void vscode.window.setStatusBarMessage(`Medical Validation: ${m}`, 3000);

  /** Open the review-flag list (mirrors the verdict quick-pick idiom). Re-entrant: after a toggle the list re-opens over the
   *  REFRESHED `flagsList` (loadFlags re-parses, so a stale FlagInstance is never reused across two edits). Esc, or a reveal
   *  (which navigates away), ends the loop. */
  async function openFlagList(): Promise<void> {
    if (mode !== "medical-validation") return;
    const ver = indexVersion; // retarget/rebuild guard: a policy switch while a picker is open must not write the old .crl
    const cel = currentCel;
    for (;;) {
      if (indexVersion !== ver || currentCel !== cel || mode !== "medical-validation") return; // policy changed underneath
      if (flagsList.length === 0) return flagNote(flagLoadError ? "a policy .crl could not be parsed" : "no review flags");
      // Embed the FlagInstance on the item (not an index) so a rebuild that reloads `flagsList` during the pick can't make
      // us act on a different flag at the same position (Claude impl review). The `ver` guard also aborts on rebuild.
      const items = flagsList.map((f) => ({
        label: `${f.status === "resolved" ? "✓" : "⚑"} ${f.canonicalTag}${f.body ? " — " + f.body : ""}`,
        // GAP 3: an occurrence flag (a keyed decision flag) shows its node signature — `decision:D · <guard→activity> · open`
        // — so it reads as a specific node, not the whole decision.
        description: `${f.scope}:${f.targetName}${f.key && isOccurrenceKey(f.key) ? " · " + parseOccurrenceKey(f.key).signature : ""} · ${f.status}${f.fields.get("ref") ? " · " + f.fields.get("ref") : ""}`,
        flag: f,
      }));
      const pick = await vscode.window.showQuickPick(items, { placeHolder: "Review flags — pick one (Esc to finish)" });
      if (!pick) return; // Esc — done
      if ((await flagActionMenu(pick.flag, ver, cel)) === "closed") return; // a reveal navigated away
    }
  }

  /** #203 Todo 4b Slice C — resolve the issue-tracker collection base for the link-out. `crl.issueBaseUrl`, USER-scope
   *  preferred (a global value isn't repo-controlled → usable regardless of workspace trust); a WORKSPACE value is
   *  repo-controlled (`.vscode/settings.json`) → only when the workspace is TRUSTED (a repo must not silently steer the
   *  browser). `sanitizeIssueBase` is the URL allowlist (http(s), no creds/query/frag). Returns undefined → no base. */
  function resolveIssueBase(): string | undefined {
    const info = vscode.workspace.getConfiguration("crl").inspect<string>("issueBaseUrl");
    const userVal = sanitizeIssueBase(info?.globalValue);
    if (userVal) return userVal;
    if (!vscode.workspace.isTrusted) return undefined; // a repo-scoped base needs trust
    return sanitizeIssueBase(info?.workspaceValue);
  }

  // The `vscode.git` extension API surface we touch (VS Code doesn't ship its types) — a minimal read-only view.
  interface GitRemote { name: string; fetchUrl?: string; pushUrl?: string }
  interface GitRepository { rootUri: vscode.Uri; state: { remotes: GitRemote[] } }
  interface GitApi { getRepository(uri: vscode.Uri): GitRepository | null }
  interface GitExtensionExports { getAPI(version: 1): GitApi }

  /** The `vscode.git` repo that CONTAINS `fileUri` (the CLOSEST one — nested/submodule-correct, never a first-repo guess),
   *  or undefined. Pure read: NO persist, NO note. TOTAL try/catch (extension absent/not-activated/API drift) → undefined.
   *  Shared by the link-out auto-detect (`detectIssueBaseFromGit`) AND the #211 issue-create repo resolver
   *  (`githubRepoForFile`) — the ONE place that touches the git extension, so the two can't diverge (design review 233). */
  async function gitRepositoryForFile(fileUri: vscode.Uri): Promise<GitRepository | undefined> {
    try {
      const ext = vscode.extensions.getExtension<GitExtensionExports>("vscode.git");
      if (!ext) return undefined;
      const api = (ext.isActive ? ext.exports : await ext.activate())?.getAPI?.(1);
      return api?.getRepository(fileUri) ?? undefined;
    } catch {
      return undefined; // git extension quirks / API drift → manual fallback, never a throw
    }
  }

  /** #211 — the GitHub `{owner, repo}` that owns `fileUri`, from its origin remote. PURE (no persist, no note) — distinct
   *  from `detectIssueBaseFromGit` (which writes config): the issue-CREATE path must not have side effects. github.com-only
   *  via `githubRepoFromRemote`. undefined → no auto-create (the flag is written without a `; ref`). */
  async function githubRepoForFile(fileUri: vscode.Uri): Promise<{ owner: string; repo: string } | undefined> {
    const repo = await gitRepositoryForFile(fileUri);
    if (!repo) return undefined;
    const origin = repo.state.remotes.find((r) => r.name === "origin");
    return githubRepoFromRemote(origin?.fetchUrl || origin?.pushUrl);
  }

  /** #211 — a GitHub access token via VS Code's built-in auth provider: try SILENT first (no UI if a session exists), else
   *  prompt ONCE (`createIfNone`). A decline / no-provider REJECTS → caught → undefined (→ the flag is written without a
   *  ref). `repo` scope (policy repos are typically private, so `public_repo` wouldn't suffice). */
  async function githubToken(forceNew = false): Promise<string | undefined> {
    if (!forceNew) {
      // Try the SILENT probe first (so a sign-in via the Accounts menu after an earlier decline is still picked up).
      try {
        const existing = await vscode.authentication.getSession("github", ["repo"], { silent: true });
        if (existing) return existing.accessToken;
      } catch {
        /* silent probe failed — fall through */
      }
      if (githubAuthDeclined) return undefined; // declined earlier this session → don't nag on every flag
    }
    // `forceNew` (after a 401) forces a BRAND-NEW session — the cached token was rejected as "Bad credentials", so a plain
    // createIfNone (which returns that same stale session) wouldn't help.
    try {
      const created = await vscode.authentication.getSession("github", ["repo"], forceNew ? { forceNewSession: true } : { createIfNone: true });
      return created?.accessToken;
    } catch {
      if (!forceNew) githubAuthDeclined = true; // a normal decline latches; a forced re-auth decline shouldn't (they're mid-fix)
      return undefined;
    }
  }

  /** #204 auto-detect — derive the issue base from the git ORIGIN of the repo that owns `fileUri` (via `gitRepositoryForFile`
   *  — in-memory, no subprocess), validate it (github.com-only + `sanitizeIssueBase`, in `githubIssuesBaseFromRemote`), and
   *  — the operator's "write it if it doesn't exist" — PERSIST it to that folder's settings (one source of truth) + a
   *  non-silent note. TOTAL: any throw is swallowed → undefined → the manual `⚙ Set crl.issueBaseUrl`. Never throws. */
  async function detectIssueBaseFromGit(fileUri: vscode.Uri): Promise<string | undefined> {
    try {
      const repo = await gitRepositoryForFile(fileUri);
      if (!repo) return undefined;
      const origin = repo.state.remotes.find((r) => r.name === "origin");
      const base = githubIssuesBaseFromRemote(origin?.fetchUrl || origin?.pushUrl);
      if (!base) return undefined;
      // Persist ONLY if unset anywhere (never clobber a user value) — to the OWNING folder (per-repo; origin is per-repo).
      const cfg = vscode.workspace.getConfiguration("crl", fileUri);
      const info = cfg.inspect<string>("issueBaseUrl");
      if (!info?.globalValue && !info?.workspaceValue && !info?.workspaceFolderValue) {
        try {
          await cfg.update("issueBaseUrl", base, vscode.ConfigurationTarget.WorkspaceFolder);
          flagNote("derived the issue tracker from your git origin — saved to crl.issueBaseUrl (edit it to change)");
        } catch {
          /* no folder / read-only settings — still return the base to open once this click */
        }
      }
      return base;
    } catch {
      return undefined; // git extension quirks / API drift → manual fallback, never a throw on a click
    }
  }

  /** Resolve the issue base at OPEN time (operator workflow): the config wins (so a user value is always respected); else,
   *  in a TRUSTED workspace, auto-detect + persist from the git origin. Read-only `resolveIssueBase` stays for menu display. */
  async function resolveOrDetectIssueBase(fileUri: vscode.Uri | undefined): Promise<string | undefined> {
    const configured = resolveIssueBase();
    if (configured) return configured;
    if (!vscode.workspace.isTrusted || !fileUri) return undefined;
    return detectIssueBaseFromGit(fileUri);
  }

  /** The per-flag action menu — the status toggle (the crl-refactors write-back) + reveal-in-source + (Slice C) the issue
   *  link-out when the flag carries a numeric `; ref #N`. `ver`/`cel` are the policy-identity captured at list-open; the
   *  write-back + the open both revalidate them so a retarget mid-menu can't patch the old `.crl` / open a stale link. */
  async function flagActionMenu(flag: FlagInstance, ver: number, cel: string | undefined): Promise<"continue" | "closed"> {
    const actions: { label: string; act: "toggle" | "reveal" | "issue" | "config" }[] = [
      { label: flag.status === "resolved" ? "↻ Reopen flag" : "✓ Mark resolved", act: "toggle" },
      { label: "→ Reveal in source", act: "reveal" },
    ];
    // Slice C: offer the issue link ONLY for a numeric ref (the injection guard). A resolvable base → open; a trusted
    // workspace with no base yet → a discoverable "set the setting" item (never silently hide the config path); an
    // untrusted workspace or a non-numeric ref → no item. The base is re-resolved at click, so this is just for display.
    const issueNo = issueRefOf(flag.fields.get("ref"));
    if (issueNo) {
      // Menu build is READ-ONLY (never touches git / writes config — that would fire on merely opening the menu). A
      // configured base → open directly; else a trusted workspace → offer "from git origin" (the click detects+persists);
      // else the manual setting. Detection happens ONLY on the explicit click (below).
      if (buildIssueUrl(resolveIssueBase(), issueNo)) actions.push({ label: `↗ Open issue #${issueNo}`, act: "issue" });
      else if (vscode.workspace.isTrusted && flag.filePath) actions.push({ label: `↗ Open issue #${issueNo} (from git origin)`, act: "issue" });
      else if (vscode.workspace.isTrusted) actions.push({ label: `⚙ Set crl.issueBaseUrl to open issue #${issueNo}…`, act: "config" });
    }
    const pick = await vscode.window.showQuickPick(actions, { placeHolder: `${flag.canonicalTag} — ${flag.body}` });
    if (!pick) return "continue"; // Esc → back to the list
    if (pick.act === "reveal") {
      await revealFlag(flag);
      return "closed";
    }
    if (pick.act === "config") {
      await vscode.commands.executeCommand("workbench.action.openSettings", "crl.issueBaseUrl");
      return "continue";
    }
    if (pick.act === "issue") {
      if (indexVersion !== ver || currentCel !== cel || mode !== "medical-validation") return "continue";
      // Resolve at click: config wins; else auto-detect + persist from the flag's repo origin (the operator workflow).
      // Keyed off the FLAG's `.crl` file (not the workspace root) so a nested/submodule flag uses its own repo's origin.
      const fileUri = flag.filePath ? vscode.Uri.file(flag.filePath) : undefined;
      const url = buildIssueUrl(await resolveOrDetectIssueBase(fileUri), issueNo);
      if (!url) {
        flagNote("no issue base and none derivable from git — set crl.issueBaseUrl");
        return "continue";
      }
      if (!(await vscode.env.openExternal(vscode.Uri.parse(url)))) flagNote(`could not open issue #${issueNo}`);
      return "continue";
    }
    await writeFlagStatus(flag, flag.status === "resolved" ? "open" : "resolved", ver, cel);
    return "continue";
  }

  /** #205 crl-refactors — flip a flag's `; status` in its OWN `.crl` via `rewriteMetaStatus` + a WorkspaceEdit (undoable) +
   *  save, then reload flags + refresh the chrome. GUARDS: the edit targets the LIVE document (offsets match the buffer);
   *  the target line is re-read + re-parsed and must still be the SAME flag at the SAME status before we apply (a prior edit
   *  / external change → abort, never patch the wrong line). The watcher does NOT watch `.crl`, so the refresh is EXPLICIT. */
  async function writeFlagStatus(flag: FlagInstance, next: FlagStatus, ver: number, cel: string | undefined): Promise<void> {
    if (!flag.filePath) return flagNote("flag has no source file");
    // A stale guard that reloads the list so a retry sees fresh state (else the loop keeps re-showing the stale list).
    const stale = (m: string): void => {
      loadFlags();
      renderTreeChrome();
      driveFlagBadges(); // #203 Todo 4b Slice A: the node badges track the (re)loaded flag state
      flagNote(m);
    };
    if (indexVersion !== ver || currentCel !== cel || mode !== "medical-validation") return stale("policy changed — reopen the flags");
    let doc: vscode.TextDocument;
    try {
      doc = await vscode.workspace.openTextDocument(flag.filePath);
    } catch {
      return flagNote("could not open the flag's .crl");
    }
    if (indexVersion !== ver || currentCel !== cel) return stale("policy changed — reopen the flags"); // the await could straddle a retarget
    const lineNo = flag.lineLocation.start.line - 1; // AST Location is 1-based; vscode is 0-based
    if (lineNo < 0 || lineNo >= doc.lineCount) return stale("flags changed — reopen the list");
    const rawLine = doc.lineAt(lineNo).text;
    // Stale guard: the target line must STILL be this exact flag (a prior/external edit could have shifted or changed it).
    // We require a `- meta is` prefix + the same tag + body + loaded status — tag alone would let a same-tag flag at a
    // shifted line be mis-edited (gpt55 impl review).
    const bt1 = rawLine.indexOf("`");
    const bt2 = rawLine.lastIndexOf("`");
    if (!rawLine.trimStart().startsWith("- meta is") || bt1 === -1 || bt2 <= bt1) return stale("flags changed — reopen the list");
    const res = parseMetaTag(rawLine.slice(bt1 + 1, bt2));
    if (
      res.kind !== "tag" ||
      res.parsed.tag !== flag.tag ||
      res.parsed.body !== flag.body ||
      (res.parsed.fields.get("status") ?? "open") !== flag.status ||
      // when present, the stable join key disambiguates two byte-identical meta lines in one file (Claude impl review).
      (flag.key !== undefined && res.parsed.fields.get("key") !== flag.key)
    ) {
      return stale("flags changed — reopen the list");
    }
    const newLine = rewriteMetaStatus(rawLine, next);
    if (newLine !== rawLine) {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(doc.uri, doc.lineAt(lineNo).range, newLine);
      if (!(await vscode.workspace.applyEdit(edit))) return flagNote("edit could not be applied");
      if (!(await doc.save())) return stale("could not save the .crl — flag not changed"); // false → disk still open; don't advance the gate
    }
    loadFlags(); // re-parse → fresh flagsList (never reuse a stale FlagInstance across edits)
    renderTreeChrome(); // EXPLICIT refresh — the watcher does not watch .crl
    driveFlagBadges(); // #203 Todo 4b Slice A: repaint the per-node badges (a resolve un-paints its node without a re-render)
    flagNote(next === "resolved" ? "flag resolved" : "flag reopened");
  }

  /** Reveal a flag at its meta line in the `.crl` source (its authoritative home). This is uniform for ALL flags incl.
   *  GAP 3 occurrence flags — an occurrence flag physically LIVES on its owning decision's meta line, so "Reveal in source"
   *  opens exactly where it is; the tree ⚑ badge (driveFlagBadges) + the flag-list signature label convey WHICH node it's
   *  about. (Revealing/scrolling the specific tree node is a possible follow-on; the source line is the authoritative home.) */
  async function revealFlag(flag: FlagInstance): Promise<void> {
    if (!flag.filePath) return;
    try {
      const doc = await vscode.workspace.openTextDocument(flag.filePath);
      const lineNo = Math.max(0, Math.min(flag.lineLocation.start.line - 1, doc.lineCount - 1));
      await vscode.window.showTextDocument(doc, { selection: doc.lineAt(lineNo).range });
    } catch {
      flagNote("could not open the flag's source");
    }
  }

  /**
   * Failed-criterion PEEK (#173 T3, disc 158 §"Reveal model" / §Gap / §"Case-name collision"; impl disc 159). UNLIKE
   * peekConcept (a transient, no-selection hover), this is SELECTION-COUPLED: it fires AFTER a cel-case engine selection
   * settles (driveFailedCriteriaPeek, post-dispatch) and paints the DISTINCT `.failed-criterion` channel that COEXISTS
   * with that selection's `.current` highlight. For each frozen, UNAMBIGUOUS, failing (Blocking) / any (All) case:
   *   - frontier/all (T2) → a SET of FailedCriterionNodes → re-root each runtime nodeId to its standalone CRL row
   *     (resolveFailedCriteria via runtimeNodePathRefs + runtimeRefIndex) → mark that row in crl + tree + (its units in) source.
   *   - an ungroundable criterion (gap) → NO faked source highlight; surfaced in `fcGaps` with an "Open CRL source"
   *     affordance using the node's OWN source (disc 158 §Gap). Never silently dropped.
   * Guards: an ambiguous name (duplicateScenarioNames) or a missing scenario → peek DISABLED with a status message;
   * `status==="error"` → out of scope (partial trace) → clear + leave diagnostics. Blocking is naturally EMPTY for a
   * pass (self-gating) → clears any stale overlay.
   */
  function peekFailedCriteria(caseId: string): void {
    clearAllFailedCriteria(); // distinct channel — does NOT touch the `.current` selection highlight
    fcGaps = [];
    fcGapDisabledMsg = undefined;

    const sv = scenarioByCaseId.get(caseId);
    if (!sv) {
      // No frozen/unambiguous scenario for this caseId (e.g. its name is in duplicateScenarioNames) — disable + explain.
      fcGapDisabledMsg = "Failed-criteria peek disabled: this case's name is shared by another case (give each a distinct name).";
      renderTreeChrome();
      return;
    }
    if (sv.status === "error") {
      // Partial trace, expected path undefined — out of scope (disc 158 §Trigger). Leave the case's diagnostics as-is.
      fcGapDisabledMsg = "Failed-criteria peek not available for an errored case (see diagnostics).";
      renderTreeChrome();
      return;
    }

    const criteria: FailedCriterionNode[] =
      failedCriteriaMode === "all" ? allUnsatisfiedCriteria(sv) : failedCriterionFrontier(sv);
    // Root = the TOP-LEVEL covered decision; runtimeNodePathRefs re-roots cross-lib `use decision` frames internally
    // (the criterion nodeId is the caller-INLINED deep id, so the criterion's OWN lib would mis-root — disc 159).
    const root = { lib: sv.decision?.libraryName ?? "", decision: sv.decision?.name ?? "" };
    const resolved: ResolvedCriterion<FailedCriterionNode>[] = resolveFailedCriteria(
      criteria,
      root,
      sv.tree,
      runtimeRefIndex,
    );

    if (crlMaps) {
      const m = crlMaps;
      // Split grounded rows by reason (FIX 3): a `preemption` row is a SATISFIED diverting sibling → its own amber
      // channel; all other reasons are red blockers. (A nodeKey shared by a blocker + a preemption — structurally
      // unlikely — favors the blocker: a real failed criterion outranks the diversion marker.)
      const blockerKeys: string[] = [];
      const preemptKeys: string[] = [];
      for (const r of resolved) {
        if (!r.grounded) continue;
        const target = r.criterion.reason === "preemption" ? preemptKeys : blockerKeys;
        if (!target.includes(r.nodeKey) && !blockerKeys.includes(r.nodeKey)) target.push(r.nodeKey);
      }
      const unitsOf = (keys: string[]): string[] => {
        const units: string[] = [];
        for (const k of keys) for (const u of unitsForRow(k, m)) if (!units.includes(u)) units.push(u);
        return units;
      };
      const crl = views.get("crl");
      const tree = views.get("tree");
      const src = views.get("source");
      // #219: suppress the overlay's scroll for the pane the click originated in (each pane checks the shared origin flag).
      if (crl) markFailedCriteria(crl, blockerKeys, preemptKeys, scrollSuppressPane === "crl"); // CRL pane: the standalone rows
      if (tree) markFailedCriteria(tree, blockerKeys, preemptKeys, scrollSuppressPane === "tree"); // tree flowchart: same structure nodeKeys (FLOW_STYLE paints the rect)
      // Source: the grounded rows' source-bearing units, split into the two channels. A gap row gets NO source mark.
      if (src) markFailedCriteria(src, unitsOf(blockerKeys), unitsOf(preemptKeys), scrollSuppressPane === "source");
    }

    // Gap list: the ungroundable criteria → the "Open CRL source at criterion" fallback (the node's own source).
    fcGaps = resolved
      .filter((r): r is { criterion: FailedCriterionNode; grounded: false } => !r.grounded)
      .map((r) => ({ label: failedCriterionLabel(r.criterion), source: r.criterion.source as LsLocation }));
    renderTreeChrome();
  }

  /** Drive the failed-criterion peek for the CURRENT selection IFF it is a cel case (post-dispatch hook). Selecting a
   *  non-cel target clears the overlay + the gap banner (the failed-criteria view is cel-case scoped). */
  function driveFailedCriteriaPeek(): void {
    const sel = state.selection;
    if (sel && sel.primary === "cel") {
      peekFailedCriteria(sel.caseId);
    } else {
      clearAllFailedCriteria();
      fcGaps = [];
      fcGapDisabledMsg = undefined;
      renderTreeChrome();
    }
  }

  /**
   * Drive the Medical Validation VERDICT tree overlay (#156 slice 5 / #210, disc 161 §1 + §"Architecture"). This is a
   * SEPARATE, PERSISTENT channel from `.current` (selection) and `.failed-criterion` (peek): it is recomputed from the
   * REVIEWED worklist cases (not the selection) and survives selection changes — the webview mutates the verdict fills
   * (`.review-pass/-fail/-pending`/`.error-node`) + the all-pass `.leaf-allpass` badge ONLY on mark/clearReviewOverlay, never
   * on highlight/clearHighlight (so they never blink off when the clinician clicks around). Clone of `driveFailedCriteriaPeek`'s
   * shape (host recompute → post), but to the TREE pane only (the verdict overlay is the tree's at-rest review state).
   *
   *  - Cockpit mode (or no model) → TEARDOWN: post the ungated `clearReviewOverlay` (no MV mark can race it here, so an
   *    order-independent class-strip is safe + correct — it wipes a leftover overlay after `Show Cockpit`).
   *  - MV mode → PAINTING folds the REVIEWED cases: each `litNodeKeys` = INTERIOR structure (`crlAnchorsForUnits` MINUS
   *    disposition leaves, the reveal reach) ∪ its PRODUCED disposition leaves (the EXECUTION reach, `#210` align-both) ∪ its
   *    on-path sub-question yes-leaves; `deriveReviewOverlay` → the disjoint `{pass, fail, pending}` + `error` sets. The ✓
   *    BADGE folds ALL frozen scenarios (`deriveAllPassLeaves` over `producedDispositionLeafKeys` — the sound reach) → the
   *    `allPassLeaves` set. Map every set to TREE segment ids via the SAME `segmentsFor` the
   *    failed-criterion channel uses, and ALWAYS post the gen-stamped `markReviewOverlay` — even when the sets are EMPTY
   *    (FIX 1, gpt55 impl review). The webview's mark handler does clrRO()+add-nothing = a clear-EFFECT, but it is
   *    gen-stamped + gen-ordered, so an empty mark cannot race a non-empty one out of order (the un-review-to-empty case:
   *    review a case then un-review it). We deliberately do NOT use the ungated clear in MV mode — that channel is
   *    teardown-only, where nothing competes with it.
   *
   * CORRECTNESS MODEL: the TREE-ACK re-drive (onWebviewMessage's `ready` → driveDoneOverlay, fires on EVERY tree render)
   * is the correctness guarantee — a freshly rendered tree always re-paints from current state. The immediate post after
   * rebuild()/setWorklist is a LATENCY optimization that relies on the OBSERVED FIFO ordering of VS Code webview
   * `postMessage` on the single serialized host→webview channel (not a doc-guaranteed contract we've verified — the tree-ack
   * re-drive above is the actual correctness guarantee, so a reorder degrades to a redundant re-paint, never a wrong one):
   * render → mark arrive in order, and successive marks stay ordered.
   */
  /** #217: the per-case EXECUTION lit-node-key set — the single source of truth shared by BOTH `driveDoneOverlay`'s verdict
   *  paint AND the right-click resolver (`nodeVerdictMenu`). `interior` (`crlAnchorsForUnits` MINUS disposition leaves —
   *  correspondence reveal reach, computed even for an errored/non-executing run) ∪ `produced` (the disposition leaves the run
   *  actually PRODUCED — the sound EXECUTION reach; empty for an errored run) ∪ `yes` (on-path TRUE sub-question operands).
   *  HOST GLUE, NOT pure — closes over `crlMaps`/`questionnaireFor`/`whenKeyResolver`; it recomputes `produced` per case
   *  (NEVER reads an overlay-local `producedByCaseId` map — that would couple resolution to when the overlay last ran, gpt55/
   *  Claude R2). MUST route through `questionnaireFor` (guards the focused/raw split), NEVER `buildFocusedQuestionnaire` (its
   *  memo poisons on a non-focused `sv`, which the resolver passes). NOTE: only the `produced` term literally means "the fired
   *  path runs through this node"; `interior` is correspondence reach, so it resolves errored / non-executing cases at interior
   *  `when` nodes — intentionally retained because it EQUALS the paint side (which also paints interior for errored cases). */
  function litNodeKeysForCase(
    caseId: string,
    sv: ScenarioViewModel | undefined,
    m: CrlRevealMaps,
    dispositionLeafKeys: Set<string>,
    leafConcepts: Record<string, { lib: string; name: string; topWhenKey: string }>,
  ): string[] {
    const interior = crlAnchorsForUnits(unitsForCase(caseId, m), m).filter((k) => !dispositionLeafKeys.has(k));
    const produced = sv ? producedDispositionLeafKeys(sv, dispositionLeafKeys) : [];
    const yes = !sv || sv.status === "error" ? [] : leafBucketsFromQuestionnaire(questionnaireFor(caseId, sv).questions, whenKeyResolver(sv), sv.conceptTruth, leafConcepts).yesKeys;
    return [...interior, ...produced, ...yes];
  }

  function driveDoneOverlay(): void {
    const tree = views.get("tree");
    if (!tree) return; // tree pane is opt-in; nothing to paint
    if (mode !== "medical-validation" || !crlMaps) {
      void tree.panel.webview.postMessage({ type: "clearReviewOverlay" }); // teardown only (no MV mark races this)
      return;
    }
    const m = crlMaps;
    // #210: disposition LEAVES (recommend-activity tips) — the fold's `isLeaf` set AND the anchor for the execution reach.
    const dispositionLeafKeys = collectDispositionLeafKeys(crlStructure);
    // #210 EXECUTION REACH ("align both"): for EVERY frozen scenario (the FULL `scenarios.scenarios` list — `scenarioByCaseId`
    // DROPS ambiguous duplicate-name cases), the disposition leaves it actually PRODUCED (sound reach; `crlAnchorsForUnits`
    // under-reaches a produced leaf whose case cites only the gate). Shared by the badge (all frozen) AND the leaf painting
    // (reviewed subset). An ambiguous/unreviewable case → verdict `unreviewed` → correctly SUPPRESSES its produced leaf's ✓.
    // PERF (deferred, Claude R2): this walks `collectProducedActions` + `resolveThisNode` for EVERY frozen scenario each
    // repaint (a NEW cost — previously only reviewed cases were traversed). Bounded + OFF the click/selection hot path
    // (driveDoneOverlay fires on tree re-render / verdict change / model refresh). If a large worklist janks, memoize the
    // per-case produced-leaf reach per `indexVersion` (with the non-focused questionnaire memo — same deferral).
    const badgeEntries: { producedLeafKeys: readonly string[]; verdict: ReviewState }[] = [];
    for (const sc of scenarios?.scenarios ?? []) {
      const produced = producedDispositionLeafKeys(sc, dispositionLeafKeys);
      const caseId = duplicateScenarioNames.has(sc.case.name) ? undefined : caseIdByName[sc.case.name];
      const verdict: ReviewState = (caseId !== undefined ? reviewByCaseId[caseId] : undefined) ?? "unreviewed";
      badgeEntries.push({ producedLeafKeys: produced, verdict });
    }
    const allPassLeaves = deriveAllPassLeaves(badgeEntries);
    // PAINTING — iterate REVIEWED cases only (`Object.keys(reviewByCaseId)`; an unreviewed case can't vote). Each reviewed
    // case's lit set is the SHARED `litNodeKeysForCase` (interior ∪ produced ∪ on-path yes-leaves) — the SAME function the
    // right-click resolver uses, so right-click reach and paint reach share one definition (they differ only in the case SET
    // each iterates: paint = reviewed here, resolve = all reviewable). A stale reviewed id → sv undefined → interior-only,
    // statusOf undefined → skipped by the fold. (Perf: a non-focused reviewed case rebuilds its questionnaire; focused memo.)
    const perCase = buildReviewPerCase(
      Object.keys(reviewByCaseId),
      (caseId) => scenarioByCaseId.get(caseId)?.status,
      (caseId) => litNodeKeysForCase(caseId, scenarioByCaseId.get(caseId), m, dispositionLeafKeys, tree.leafConcepts),
    );
    // #210 verdict painting: the leaf-aware precedence (interior→pass wins, leaf→fail wins) lives in the pure fold via `isLeaf`.
    const { pass, fail, pending, error } = deriveReviewOverlay(reviewByCaseId, perCase, (k) => dispositionLeafKeys.has(k));
    // Map each nodeKey set → tree segment ids via the SAME segmentsFor the failed-criterion channel uses. `allPassLeaves` rides
    // the same gen-stamped channel (a 5th set); ALWAYS a mark in MV mode (even when empty) — gen-ordered, no race (FIX 1).
    void tree.panel.webview.postMessage({
      type: "markReviewOverlay",
      gen: tree.gen,
      pass: segmentsFor(tree, [...pass]).segmentIds,
      fail: segmentsFor(tree, [...fail]).segmentIds,
      pending: segmentsFor(tree, [...pending]).segmentIds,
      error: segmentsFor(tree, [...error]).segmentIds,
      allPassLeaves: segmentsFor(tree, [...allPassLeaves]).segmentIds,
    });
  }

  /** #203 Todo 4b — paint the flag badges. Mirrors `driveDoneOverlay`: a gen-stamped class-toggle message (never a `#root`
   *  re-render, so the verdict/failed-criterion overlays survive). TWO channels: (1) per-node ⚑ (`.has-flag`) marks WHICH
   *  nodes carry an OPEN flag — a concept flag → `conceptOccurrences` by (lib,name) (badges every `when`/leaf it draws as);
   *  a decision flag → the decision root's gid via `anchors`; an unmatchable (library-scope, or a concept drawn nowhere)
   *  flag lights no per-node ⚑. (2) the START-NODE COUNT badge (`.has-startflag` on `startNodeGid`) mirrors the tree chrome
   *  (`⚑ N open flags`): the policy-wide TOTAL open count + the catch-all, so an unmatchable flag is never dropped. Open-only
   *  (resolved flags never badge a node; the count badge shows `✓` when all resolved). */
  function driveFlagBadges(): void {
    const tree = views.get("tree");
    if (!tree) return; // tree pane is opt-in
    if (mode !== "medical-validation") {
      void tree.panel.webview.postMessage({ type: "flagBadges", gen: tree.gen, flaggableGids: tree.flaggableGids, gids: [], startNodeGid: tree.startNodeGid, open: 0, resolved: 0, flagError: false, unplaced: 0 });
      return;
    }
    const open = flagsList.filter((f) => f.status !== "resolved"); // the blocking set (matches openFlags / the gate)
    const gids = new Set<string>();
    let unplaced = 0; // PER-FLAG: how many open flags matched ZERO nodes (orphaned/moved occurrence, or a concept drawn nowhere)
    for (const f of open) {
      let matched: string[] = [];
      if (f.scope === "concept") {
        // (lib,name) — NEVER name alone (cross-lib same-name concepts). A flag with no libraryName (best-effort
        // attribution absent) can't be safely placed → it stays unmatched (counts as unplaced).
        matched = tree.conceptOccurrences.filter((o) => o.name === f.targetName && o.lib === f.libraryName).map((o) => o.gid);
      } else if (f.scope === "decision") {
        const dec = crlStructure.find((s) => s.decision === f.targetName && s.lib === f.libraryName);
        // GAP 3: a decision flag whose `key` is an OCCURRENCE key (`<nodeId>~<sig>`) → resolve to the ONE keyed node
        // (nodeId + signature verify) BEFORE the decision-root path; orphan/moved → matched stays [] → unplaced (never a
        // wrong node). A NON-occurrence key (e.g. a pre-existing re-add-guard source-hash) or NO key → the decision OBJECT
        // → the whole decision (today), so an existing keyed decision flag isn't misread as a broken occurrence (gpt55).
        if (f.key && isOccurrenceKey(f.key)) {
          if (dec) {
            const res = resolveOccurrence(dec, f.key);
            const g = res.placed ? tree.anchors[res.ref.nodeKey]?.scrollTo : undefined;
            if (g) matched = [g];
          }
        } else if (dec) {
          matched = segmentsFor(tree, [dec.nodeKey]).segmentIds;
        }
      }
      // "unplaced" means ONLY a genuine OCCURRENCE flag whose target moved/removed (a keyed decision flag that resolved
      // orphan/moved). An OBJECT flag drawn nowhere (a library flag, or a concept used only as decision-input / inside a
      // collapsed composite) is "not charted" — expected, NOT "moved/removed" — so it must NOT dilute this signal (Claude).
      if (matched.length === 0 && f.scope === "decision" && f.key && isOccurrenceKey(f.key)) unplaced++;
      for (const g of matched) gids.add(g);
    }
    // The START-NODE COUNT badge is the chrome mirror + catch-all: the TOTAL open count. `unplaced` = open flags that lit
    // NO node (an orphaned/moved occurrence, or a concept/decision drawn nowhere) — surfaced so a re-homed flag is never a
    // silent aggregate-count-only blocker (the flag list labels which). Per-flag tracked, not a gid-count subtraction.
    const resolvedCount = flagsList.length - open.length;
    void tree.panel.webview.postMessage({ type: "flagBadges", gen: tree.gen, flaggableGids: tree.flaggableGids, gids: [...gids], startNodeGid: tree.startNodeGid, open: open.length, resolved: resolvedCount, flagError: flagLoadError, unplaced });
  }

  /** Post a gen-stamped `markThisNode` for a set of segment ids in one pane (#177 slice 4), after clearing the prior
   *  marker (clear-then-mark, like the overlay channels). Empty segs is still a valid mark (clears the pane's marker) —
   *  but `clearThisNode` is the explicit no-focused-question path; here an empty set means "this pane has no segment for
   *  the focused node" (e.g. source for a no-source-unit `when`). Gen-carried so a mark aimed at a superseded render is
   *  dropped by the webview (mirrors markFailedCriteria); the clear leg is ungated. */
  function markThisNode(v: PaneView, segmentIds: string[]): void {
    void v.panel.webview.postMessage({ type: "markThisNode", gen: v.gen, segmentIds });
  }

  /** Clear the "this node" marker across every pane (no focused question / cockpit mode). Ungated — a class-strip is
   *  always safe (mirrors clearAllFailedCriteria / the review-overlay teardown). */
  function clearAllThisNode(): void {
    for (const v of views.values()) void v.panel.webview.postMessage({ type: "clearThisNode" });
  }

  /** disc 164: paint the produced-path diverter overlay on one pane (the rows/units already mapped to segment ids). No
   *  scroll (mirrors markThisNode — the .current reveal owns scroll; the diverter is a secondary rationale highlight). */
  function markDiverters(v: PaneView, segmentIds: string[]): void {
    void v.panel.webview.postMessage({ type: "markDiverters", gen: v.gen, segmentIds });
  }

  /** Clear the diverter overlay across every pane (non-MV / no diverters / errored case). Ungated like the others. */
  function clearAllDiverters(): void {
    for (const v of views.values()) void v.panel.webview.postMessage({ type: "clearDiverters" });
  }

  /**
   * Drive the "this node" cross-pane MARKER for the CURRENTLY-focused questionnaire question (#177 slice 4, disc 163
   * §"This node marker"). A SEPARATE, PERSISTENT channel from `.current` (selection), `.failed-criterion` (peek), and the
   * review overlay: it tracks the FOCUSED QUESTION, not the cockpit selection, so it SURVIVES a cockpit reveal (the
   * webview mutates `.this-node` ONLY on mark/clearThisNode, never on highlight/clearHighlight — the done-overlay
   * lifecycle, NOT the failed-criterion-clears-on-reveal one). Re-driven on the questionnaire re-render hook (slice 3),
   * rebuild (segments changed), and each pane's ack (a fresh render re-gets the mark).
   *
   *  - Not MV mode / questionnaire pane closed / no focused question (no case, no questions, or the index is out of
   *    range) → `clearAllThisNode` (no marker ever in cockpit; nothing to mark with no question).
   *  - Else re-root the focused runtime nodeId → standalone CRL row nodeKey + its source units (the SAME
   *    `resolveFailedCriteria` join the peek uses), then per pane:
   *      · questionnaire — the focused `<li>` via the questionnaire pane's own anchors (keyed by nodeId);
   *      · tree + crl   — the nodeKey via `segmentsFor` (their anchors are keyed by structure nodeKey);
   *      · source       — the row's source-bearing units' segments, DEGRADING SILENTLY to an empty mark when the `when`
   *                       bears no source unit (the fcGaps fallback shape — tree/crl still mark).
   */
  function driveThisNode(): void {
    const qView = views.get("questionnaire");
    // The marker is MV-only + questionnaire-scoped. In cockpit (or with the pane closed) clear every pane it could have
    // touched — a leftover marker after a mode switch / pane close must not linger.
    if (mode !== "medical-validation" || !qView) {
      clearAllThisNode();
      return;
    }
    const nodeId = questionNodeIds[currentQuestionIndex];
    const sv = focusedScenario();
    if (nodeId === undefined || !sv) {
      clearAllThisNode(); // no focused question (no case / no questions / index out of range) → clear all panes
      return;
    }

    // Questionnaire pane: the focused <li> via its OWN anchors (keyed by the runtime nodeId, no re-root needed).
    markThisNode(qView, segmentsFor(qView, [nodeId]).segmentIds);

    // Tree + crl + source: re-root the runtime nodeId → standalone CRL row + source units (the peek's join), then per-pane
    // segments. A non-MV-frozen / errored case never reaches here (focusedScenario excludes ambiguous/unfrozen; an errored
    // case yields no questions, so questionNodeIds is empty). An ungroundable nodeId → resolveThisNode returns no nodeKey
    // → tree/crl/source all mark with EMPTY segments (clear-then-mark to empty = a clean clear for those panes).
    const root = { lib: sv.decision?.libraryName ?? "", decision: sv.decision?.name ?? "" };
    const { nodeKey, sourceUnits } = resolveThisNode(nodeId, root, sv.tree, runtimeRefIndex, crlMaps);
    const tree = views.get("tree");
    const crl = views.get("crl");
    const src = views.get("source");
    const nodeKeys = nodeKey !== undefined ? [nodeKey] : [];
    if (tree) markThisNode(tree, segmentsFor(tree, nodeKeys).segmentIds);
    if (crl) markThisNode(crl, segmentsFor(crl, nodeKeys).segmentIds);
    if (src) markThisNode(src, segmentsFor(src, sourceUnits).segmentIds); // empty sourceUnits → silent source degrade
  }

  /**
   * Drive the produced-path DIVERTER overlay for the current selection (disc 164, design round 164). The diverters are the
   * evaluated-FALSE `when`s on the fired path to the ACTUALLY produced disposition — the criteria that, by being false,
   * routed the case to its outcome (e.g. the Adult gate for a "Crohn's but not an adult" → outer otherwise → Deny). They
   * answer "WHY the produced disposition", which the produced provenance cluster (`.current`) does NOT show: the cluster is
   * the produced node's own span (the experimental clause), not the gate that diverted here. DISTINCT from the failed-
   * criterion peek ("what blocked the EXPECTED" — empty for a PASS, and these denies PASS) and from `.this-node` (focus).
   *
   * Source-of-truth: the diverters ARE the questionnaire's evaluated-false "no" questions — we reuse that ONE fired-path
   * authority (`buildQuestionnaire`) rather than a second whole-tree scan, so there is no drift (a whole-tree
   * `allUnsatisfiedCriteria` would over-light OFF-path false `when`s under an `all:` block — design round 164 [critical]).
   *
   * Lifecycle (selection-coupled, like the failed-criterion peek, NOT the survives-reveal marker): cleared by the webview's
   * highlight/clearHighlight (clrDV), re-driven post-dispatch + on each pane ack + on rebuild. MV-only. Cleared (not painted)
   * for a non-MV mode, no/ambiguous scenario, an errored case, or zero diverters. An ungroundable diverter degrades silently
   * (no nodeKey → no mark for that row), and a diverter `when` with no source unit degrades the SOURCE leg silently — tree+crl
   * still mark (mirrors driveThisNode). Reuses `resolveThisNode` (the marker's runtime-id→nodeKey+units join) per diverter.
   *
   * PERF (Claude impl review, disc 164): this RECOMPUTES `buildQuestionnaire` on each call (dispatch + each tree/crl/source
   * ack) — UNLIKE driveThisNode, which reads the cached `questionNodeIds`. It cannot reuse that cache: the diverter overlay
   * is pane-INDEPENDENT (it paints tree/crl/source even with the questionnaire pane CLOSED, where `questionNodeIds` is
   * empty), so it must build the fired path itself on selection. The walk is synchronous + cheap (small decision trees); a
   * per-case memo keyed on the selected caseId is the optimization if policies ever grow large.
   */
  function driveDiverters(): void {
    if (mode !== "medical-validation" || !showDetails) {
      clearAllDiverters();
      return;
    }
    const sv = focusedScenario();
    if (!sv || sv.status === "error") {
      clearAllDiverters();
      return;
    }
    // The diverters ARE the questionnaire's evaluated-false "no" questions — but ONLY when a disposition was produced
    // (producedPathDiverterIds gates on q.outcome): a blocked/blocked-guard terminal emits a false guard/when question
    // with NO produced disposition, which must NOT light as a "produced-path diverter" (gpt55 impl review, disc 164).
    // #187 Todo 3: `producedPathDiverterIds` filters `diverterEligible` (evaluated on-path whens) — leaves/preempted rows
    // never light. #187 Todo 5: shared single-slot memo (driveLeafMarks walks the same q on the same dispatch/ack).
    const q = buildFocusedQuestionnaire(sv);
    const diverterIds = producedPathDiverterIds(q);
    if (diverterIds.length === 0) {
      clearAllDiverters();
      return;
    }
    // Re-root each runtime nodeId → standalone CRL row + its source units (the SAME join the marker uses), deduped.
    const root = { lib: sv.decision?.libraryName ?? "", decision: sv.decision?.name ?? "" };
    const nodeKeys: string[] = [];
    const units: string[] = [];
    for (const nodeId of diverterIds) {
      const { nodeKey, sourceUnits } = resolveThisNode(nodeId, root, sv.tree, runtimeRefIndex, crlMaps);
      if (nodeKey !== undefined && !nodeKeys.includes(nodeKey)) nodeKeys.push(nodeKey);
      for (const u of sourceUnits) if (!units.includes(u)) units.push(u);
    }
    const tree = views.get("tree");
    const crl = views.get("crl");
    const src = views.get("source");
    if (tree) markDiverters(tree, segmentsFor(tree, nodeKeys).segmentIds);
    if (crl) markDiverters(crl, segmentsFor(crl, nodeKeys).segmentIds);
    if (src) markDiverters(src, segmentsFor(src, units).segmentIds); // empty units → silent source degrade
  }

  /** Post a gen-stamped `markLeaves` (the per-case def-leaf verdict) to the TREE. Gen-carried so a mark aimed at a
   *  superseded render is dropped by the webview (mirrors markReviewOverlay); the webview branch clears both leaf classes
   *  before applying, so an EMPTY mark is a valid clear-effect (used in MV steady state, gen-ordered — never an ungated race). */
  function markLeaves(v: PaneView, yesIds: string[], noIds: string[]): void {
    void v.panel.webview.postMessage({ type: "markLeaves", gen: v.gen, yesIds, noIds });
  }

  /**
   * #187 Todo 5/Todo 3: drive the per-case leaf overlay on the TREE — the on-path RING on each TRUE `defined as` operand
   * (`.flow-leaf-yes`); a false / unknown operand shows nothing (`.flow-leaf-no` is a reserved no-op class — see FLOW_STYLE).
   * Its own channel, mutated ONLY by markLeaves/clearLeaves — so a leaf's ring survives the REVEAL channel
   * (highlight/clearHighlight never touch it, like the review + this-node overlays). But
   * it is FOCUSED-CASE-coupled, EXACTLY like `driveThisNode`/`driveDiverters` (all three read `focusedScenario()`): when
   * the focused case is lost (a non-cel selection / cleared selection) it clears via the empty gen-stamped mark below, in
   * lockstep with the questionnaire emptying to its placeholder. (It is NOT the case-INDEPENDENT `driveDoneOverlay`, which
   * paints EVERY reviewed case — the leaf verdict is THIS case's answers, so it must clear when there is no focused case.)
   * PARITY with the questionnaire over the RENDERED (Todo-4-capped) leaf set: a leaf lights ONLY when its owning composite
   * `when` is on-path-SATISFIED — the exact set the questionnaire expands leaves under (`rowKind:"when-evaluated"` +
   * `answer:"yes"`; a preempted → `when-preempted`, a reached-false → `answer:"no"`, neither expands). Every tick shown is
   * correct; a composite deeper than MAX_LEAF_DEPTH / wider than LEAF_CAP simply ticks fewer leaves than the (unbounded)
   * questionnaire expands — a Todo-4 display cap, not a verdict error. Verdict = the leaf concept's own conceptTruth (the
   * SAME source the questionnaire's leaf rows use); an ABSENT concept is UNKNOWN → no mark (Todo-2 contract).
   *
   *  - Cockpit / no model → TEARDOWN: ungated `clearLeaves` (no MV mark races it — safe class-strip after Show Cockpit).
   *  - MV mode, no / errored focused case → an EMPTY gen-stamped mark (NOT the ungated clear — gen-ordered so the
   *    un-select-to-empty case can't race a live mark out of order, mirroring driveDoneOverlay's FIX 1).
   */
  function driveLeafMarks(): void {
    const tree = views.get("tree");
    if (!tree) return; // tree pane is opt-in
    if (mode !== "medical-validation" || !crlMaps) {
      void tree.panel.webview.postMessage({ type: "clearLeaves" }); // teardown only (no MV mark races this)
      return;
    }
    const sv = focusedScenario();
    if (!sv || sv.status === "error") {
      markLeaves(tree, [], []); // empty gen-stamped (steady-state clear-effect)
      return;
    }
    // On-path-SATISFIED composite `when`s = the questionnaire's leaf-expanding rows; the pure `leafBucketsFromQuestionnaire`
    // resolves each `when-evaluated`/yes row's runtime nodeId → its structure `when` nodeKey (via `whenKeyResolver` →
    // `resolveThisNode`, the IDENTICAL join `driveDiverters`/`driveThisNode` use, so the gate coincides with the flow
    // render's `topWhenKey`) then applies the on-path gate + the absent-is-unknown rule. SHARED with `driveDoneOverlay`'s
    // per-reviewed-case paint (no drift). Here `q` comes from the focused memo (`#187 Todo 5` — driveDiverters already walked it).
    const q = buildFocusedQuestionnaire(sv);
    const { yesKeys, noKeys } = leafBucketsFromQuestionnaire(q.questions, whenKeyResolver(sv), sv.conceptTruth, tree.leafConcepts);
    markLeaves(tree, segmentsFor(tree, yesKeys).segmentIds, segmentsFor(tree, noKeys).segmentIds);
  }

  /**
   * The panel-local prev/next sub-nav (#177 slice 5). Moves `currentQuestionIndex` one step (CLAMPED to the CURRENT
   * `questionNodeIds.length` — so a stale index can never over-run a shorter questionnaire; the slice-3 case-select reset
   * already keeps it in range, this clamp is the second guard), then re-renders the questionnaire pane (refreshing the
   * "Question X of Y" + the Prev/Next disabled states) AND re-drives the `.this-node` marker so the new focused question
   * lights across panes + self-highlights. A no-op questionnaire (0 questions → nextQuestionIndex returns 0) just re-renders
   * harmlessly. Render-then-drive mirrors the slice-3/4 case-select hook: the render bumps the pane gen; driveThisNode
   * re-marks (the immediate post is a FIFO latency optimization, the pane-ack re-drive is the guarantee — gen-stamped so a
   * mark aimed at a superseded render is dropped).
   */
  function navigateQuestion(dir: "prev" | "next"): void {
    const moved = nextQuestionIndex(currentQuestionIndex, dir, questionNodeIds.length);
    if (moved === currentQuestionIndex) return; // already at the edge (or 0 questions) — nothing changed
    currentQuestionIndex = moved;
    renderPane("questionnaire"); // re-render with the new index → updated "X of Y" + Prev/Next disabled states
    driveThisNode(); // re-light the now-focused question across the panes + self-highlight (immediate post; ack re-drives)
  }

  function updateNavMessage(): void {
    const empty = navigatorItems(state).length === 0;
    navView.message = empty
      ? state.primary === "crl"
        ? "No CRL decisions in this policy."
        : state.primary === "cel"
          ? "No CEL cases in this policy."
          : "No source-linked units in this policy."
      : undefined;
  }

  function reflectSelectionToTree(): void {
    const sel = state.selection;
    // only reflect when the selection is in the CURRENT primary's space (the navigator shows that space)
    if (!sel || sel.primary !== state.primary) return;
    // MV mode: the WORKLIST pane is the navigation, so a selection must NOT re-open a
    // closed navigator flyout — `TreeView.reveal` shows a hidden view, which is the
    // duplicative fly-out the worklist replaces. Sync only when the navigator is ALREADY
    // visible; never bring a hidden one back. Cockpit mode (where the flyout IS the nav)
    // keeps the always-reveal behavior. Re-sync on the visible→true edge below covers the
    // stale-navigator case (worklist clicks skipped while hidden, then the flyout opened).
    if (!shouldReflectNavigatorSelection(mode, navView.visible)) return;
    const id = sel.primary === "source" ? sel.unitId : sel.primary === "crl" ? sel.nodeKey : sel.caseId;
    const item = navigatorItems(state).find((i) => i.id === id);
    if (item) void navView.reveal(item, { select: true, focus: false }).then(undefined, () => undefined);
  }

  // ── render a pane ──
  function renderPane(pane: Pane): void {
    const v = views.get(pane);
    if (!v || !model) return;
    const gen = coord.startRender(pane);
    v.gen = gen;
    v.indexVersion = indexVersion;
    v.acked = false;
    v.anchors = {};
    v.reveals = {};
    v.leafConcepts = {}; // #187 Todo 5 (tree-only); reset each render, re-set below in the tree branch
    v.conceptOccurrences = []; // #203 Todo 4b Slice A (tree-only); reset each render, re-set in the tree branch
    v.flaggableGids = [];
    v.startNodeGid = undefined;
    if (pane === "source") {
      const units: UnitSpan[] = model.steps.flatMap((s) =>
        s.source.map((loc) => ({ unitId: s.unitId, range: loc.range })),
      );
      const overlays: OverlaySpan[] = model.marks.source
        .filter((m) => m.kind === "uncovered" || m.kind === "ignored")
        .map((m) => ({ kind: m.kind as "uncovered" | "ignored", range: m.range }));
      const textLen = model.anchor.text.length;
      const markCount = units.length + overlays.length;
      if (textLen > MAX_SOURCE_CHARS || markCount > MAX_SOURCE_MARKS) {
        // Over the measured floor — STOP (per disc 118): post a navigation-only fallback rather than freeze the webview.
        console.warn(
          `[crl.cockpit] Source inline render skipped: ${textLen} chars, ${markCount} marks (> ${MAX_SOURCE_CHARS}/${MAX_SOURCE_MARKS}). Navigate + Open Raw still work.`,
        );
        const kb = Math.round(textLen / 1024);
        const html = `<p class="placeholder">Source is large (${kb} KB, ${markCount} marks) — inline render skipped. Use the navigator + “CRL: Open Raw Source at Locus”.</p>`;
        void v.panel.webview.postMessage({ type: "render", html, gen, indexVersion, mode });
        return;
      }
      const r = renderSourcePane(model.anchor.text, units, overlays, { revealPrefix: `g${gen}_`, unitNumber, showKeys });
      v.anchors = r.anchors;
      v.reveals = r.reveals;
      void v.panel.webview.postMessage({ type: "render", html: r.html, gen, indexVersion, mode });
    } else if (pane === "crl") {
      const r = renderCrlPane(crlStructure, { revealPrefix: `g${gen}_`, rowKeyNumbers, showKeys, concepts: conceptLayer, conceptKeyNumbers });
      v.anchors = r.anchors;
      v.reveals = r.reveals;
      void v.panel.webview.postMessage({ type: "render", html: r.html, gen, indexVersion, mode });
    } else if (pane === "cel") {
      // CEL pane — the READ-ONLY condensed scenario cases (C2c-1). Since the pane split (disc 179) this pane NEVER renders
      // the worklist UI (that's the separate `worklist` pane); it's the case-list slated to become the typed-hole editor.
      // It OWNS `conceptToFactAnchors` (the fact-peek reverse map) — the worklist render omits fact spans, so this global is
      // set ONLY here (no clobber between the two case-display panes). It does NOT touch `worklistActions`.
      const r = scenarios
        ? renderCelPane(scenarios, caseIdByName, { revealPrefix: `g${gen}_`, revealableConceptKeys, caseKeyNumbers, showKeys, duplicateScenarioNames })
        : { html: '<p class="placeholder">No CEL.</p>', anchors: {}, reveals: {}, conceptToFactAnchors: {} };
      v.anchors = r.anchors;
      v.reveals = r.reveals;
      conceptToFactAnchors = r.conceptToFactAnchors; // fact-peek reverse map — cel-pane-owned (captured atomically w/ anchors)
      void v.panel.webview.postMessage({ type: "render", html: r.html, gen, indexVersion, mode });
    } else if (pane === "worklist") {
      // WORKLIST pane (disc 179) — the MV review surface: renderCelPane WITH worklist opts (verdict dropdowns, notes, row
      // numbers). Fact-peek is OFF here (revealableConceptKeys OMITTED → no fact spans, empty conceptToFactAnchors), so it
      // never touches the cel-pane-owned fact map. It OWNS `worklistActions` (the opaque-key → caseId map the verdict/notes
      // handlers resolve) — set ONLY here, so a read-only `cel` render can't clobber it.
      const r = scenarios
        ? renderCelPane(scenarios, caseIdByName, { revealPrefix: `g${gen}_`, caseKeyNumbers, showKeys, duplicateScenarioNames, worklist: { enabled: true, statesByCaseId: reviewByCaseId, policyLabel: currentCel ? basename(currentCel).replace(/\.(cel|crl)$/i, "") : undefined, notesByCaseId, openNotesCaseId, editingNoteId, filter: worklistFilter } })
        : { html: '<p class="placeholder">No CEL.</p>', anchors: {}, reveals: {}, conceptToFactAnchors: {}, worklistActions: {} };
      v.anchors = r.anchors;
      v.reveals = r.reveals;
      worklistActions = r.worklistActions ?? {}; // worklist-pane-owned (captured atomically with this render's anchors)
      void v.panel.webview.postMessage({ type: "render", html: r.html, gen, indexVersion, mode });
    } else if (pane === "tree") {
      // tree — the graphical decision-tree flowchart (T2 renderer). Same structure + concept inputs as the CRL pane; its
      // reveal shapes are IDENTICAL ({nodeKey} | {conceptNodeKey}), so clicks route through the existing onWebviewMessage
      // path with no new hit kinds, and it highlights in lockstep with the CRL pane (postReveal's crl|tree arms).
      const r = renderFlowPane(crlStructure, {
        revealPrefix: `g${gen}_`,
        concepts: conceptLayer,
        defExpr: buildDefExprResolver(), // #187 Option-C: composite → the ANY OF / ALL OF operator OUTLINE (shared builder)
      });
      v.anchors = r.anchors;
      v.reveals = r.reveals;
      v.leafConcepts = r.leafConcepts; // #187 Todo 5: the def-leaf verdict-join map (captured atomically with the anchors)
      v.conceptOccurrences = r.conceptOccurrences; // #203 Todo 4b Slice A: the flag-badge substrate (captured atomically)
      v.flaggableGids = r.flaggableGids;
      v.startNodeGid = r.startNodeGid; // the chrome-mirror count badge's node
      void v.panel.webview.postMessage({ type: "render", html: r.html, gen, indexVersion, mode });
    } else {
      // questionnaire (#177 slice 3) — a STATIC, read-only projection of the FOCUSED cel case's fired path. Gets the
      // selected-case `sv` via the SAME `scenarioByCaseId` join `driveFailedCriteriaPeek` uses + a frame-aware
      // `resolveValueTypes` built off `crlMaps.conceptByKey`. No focused case (no cel selection) → a placeholder. The
      // renderer's `reveals` are always {} (read-only); `anchors` are per-question (keyed by nodeId) for slice 4/5.
      const sv = focusedScenario(); // hoisted (FIX 5): one resolve, used for both the VM and its rootLib frame
      const r = renderQuestionnairePane(sv, buildResolveValueTypes(), sv?.decision?.libraryName, {
        revealPrefix: `g${gen}_`,
        currentIndex: currentQuestionIndex, // #177 slice 5: the sub-nav renders "Question X of Y" + Prev/Next disabled states
        conceptShape: buildConceptShapeResolver(), // #187 Todo 3: the composite when's own Source/inferred flags
        defExpr: buildDefExprResolver(), // #187 Option-3: composite → ANY OF / ALL OF operator boxes
      });
      v.anchors = r.anchors;
      v.reveals = r.reveals;
      questionNodeIds = r.questionNodeIds; // #177 slice 4: captured atomically with this render's anchors (gen-scoped li ids)
      // #177 slice 5 (FIX 1): clamp the cursor into range against THIS render's question list. The case-select reset (→0)
      // covers a case change, but a SAME-case rebuild that SHRINKS the questionnaire (a .crl/.cel edit dropping questions)
      // would leave a stale index — and driveThisNode reads the RAW questionNodeIds[currentQuestionIndex] (not the
      // display-clamped one renderQuestionNav uses), so a stale index → undefined → the marker clears + the disabled
      // buttons can't recover (and a `next` from beyond-end would step BACKWARD instead of no-op). Clamping at the single
      // questionNodeIds-reassignment point keeps the cursor valid after ANY render (select, nav, rebuild). The chrome at
      // line ~907 already display-clamps via renderQuestionNav, so this only corrects the host-held index for driveThisNode.
      currentQuestionIndex = questionNodeIds.length ? Math.min(currentQuestionIndex, questionNodeIds.length - 1) : 0;
      void v.panel.webview.postMessage({ type: "render", html: r.html, gen, indexVersion, mode });
    }
  }

  /** The FOCUSED cel case's `ScenarioViewModel` — the questionnaire's input. Resolved via the SAME frozen
   *  `scenarioByCaseId` join the failed-criterion peek uses (caseId → sv; ambiguous/unfrozen cases excluded in
   *  rebuild). undefined when the selection is not a cel case (or no case is selected) → the pane shows a placeholder. */
  function focusedScenario(): ScenarioViewModel | undefined {
    const sel = state.selection;
    return sel && sel.primary === "cel" ? scenarioByCaseId.get(sel.caseId) : undefined;
  }

  // #187 Todo 5 (Claude impl review): a SINGLE-SLOT memo for the focused case's questionnaire. Both `driveDiverters` and
  // `driveLeafMarks` run buildQuestionnaire on the SAME (sv) back-to-back per dispatch/ack — the walk is deterministic in
  // (focused caseId, indexVersion) (sv, crlMaps + all resolvers are rebuilt together, bumping indexVersion), so a slot
  // keyed on that pair serves both without a second walk. Auto-invalidates on any case/model change (no explicit clear).
  let focusedQMemo: { caseId: string; iv: number; q: Questionnaire } | undefined;
  /** The UN-memoized questionnaire build for ANY case's sv. #210 Slice 1b: `driveDoneOverlay` builds a per-reviewed-case
   *  questionnaire and MUST NOT touch `focusedQMemo` for a non-focused sv (its caseId key would poison the focused slot),
   *  so it routes through `questionnaireFor` → this raw builder for non-focused cases. */
  function buildQuestionnaireRaw(sv: ScenarioViewModel): Questionnaire {
    return buildQuestionnaire(sv, buildResolveValueTypes(), sv.decision?.libraryName, {
      conceptShape: buildConceptShapeResolver(),
      defExpr: buildDefExprResolver(),
    });
  }
  // CAUTION: this memoizes on the FOCUSED `state.selection.caseId`, NOT on `sv` — so it is CORRECT ONLY for the focused
  // scenario. Passing a NON-focused sv would return the focused case's cached questionnaire (or poison the slot with a
  // non-focused build). Every caller passes `focusedScenario()`; per-case builds MUST route through `questionnaireFor`.
  function buildFocusedQuestionnaire(sv: ScenarioViewModel): Questionnaire {
    const caseId = state.selection?.primary === "cel" ? state.selection.caseId : "";
    if (focusedQMemo && focusedQMemo.caseId === caseId && focusedQMemo.iv === indexVersion) return focusedQMemo.q;
    const q = buildQuestionnaireRaw(sv);
    focusedQMemo = { caseId, iv: indexVersion, q };
    return q;
  }
  /** #210 Slice 1b: the questionnaire for an ARBITRARY reviewed case. The FOCUSED case shares the `focusedQMemo` build
   *  (driveDiverters/driveLeafMarks already walked it this dispatch/ack); a NON-focused case builds raw (never the memo —
   *  its caseId key would poison the focused slot). Keyed on the SAME `state.selection.caseId` the memo keys on. */
  function questionnaireFor(caseId: string, sv: ScenarioViewModel): Questionnaire {
    const focused = state.selection?.primary === "cel" && state.selection.caseId === caseId;
    return focused ? buildFocusedQuestionnaire(sv) : buildQuestionnaireRaw(sv);
  }
  /** #210 Slice 1b: the injected `resolveKey` for `leafBucketsFromQuestionnaire` — a runtime `nodeId` → its structure
   *  `when` nodeKey, via the SAME `resolveThisNode` join `driveDiverters`/`driveThisNode`/`driveLeafMarks` use (keyed by
   *  structure nodeKey = the flow render's `topWhenKey`). Returns undefined off-model (crlMaps null) → the row is skipped. */
  function whenKeyResolver(sv: ScenarioViewModel): (nodeId: string) => string | undefined {
    const root = { lib: sv.decision?.libraryName ?? "", decision: sv.decision?.name ?? "" };
    return (nodeId) => (crlMaps ? resolveThisNode(nodeId, root, sv.tree, runtimeRefIndex, crlMaps).nodeKey : undefined);
  }
  /** #210 (all-pass badge + leaf-paint align): the SOUND execution reach — the disposition-leaf structure nodeKeys a
   *  scenario actually PRODUCED. `collectProducedActions(sv.tree)` (the fired `n.action?.produced` leaves) re-rooted via
   *  `resolveThisNode` (the same runtime→structure join the marker uses; `buildRuntimeRefIndex` indexes action rows too) and
   *  ∩ `dispositionLeafKeys`. Distinct from `crlAnchorsForUnits` (reveal reach), which under-reaches a produced leaf when the
   *  case's units cite only the gating concept. An errored/blocked case produced nothing → `[]`. Dedups. */
  function producedDispositionLeafKeys(sv: ScenarioViewModel, dispositionLeafKeys: Set<string>): string[] {
    if (!crlMaps || sv.status === "error") return [];
    return resolveProducedLeafKeys(collectProducedActions(sv.tree), whenKeyResolver(sv), dispositionLeafKeys);
  }

  /** Build the frame-aware concept→value-types resolver `buildQuestionnaire` injects. A bare sub-`when` concept resolves
   *  to `conceptByKey` via `nodeKey(conceptDeclRef(lib, name))` — the SAME join key the indexer/structure use, so the
   *  cross-lib same-name frame (the walk supplies the sub's lib) keys the right concept. `[]` when maps absent or the
   *  concept is location-less (not inventoried). */
  function buildResolveValueTypes(): ResolveValueTypes {
    return (lib: string | undefined, name: string): ConceptValueType[] => {
      if (!crlMaps || lib === undefined) return [];
      return crlMaps.conceptByKey.get(nodeKey(conceptDeclRef(lib, name)))?.valueTypes ?? [];
    };
  }

  /** #187 Todo 3 — the injected resolver `buildQuestionnaire` uses for a composite `when`'s own Source/inferred flags.
   *  `conceptShape(lib,name)` fetches the concept's shape subtree (keyed by the SAME nodeKey as `conceptByKey`); returns
   *  undefined when maps are absent. (The `defined as` OPERATOR structure comes from `buildDefExprResolver`, below.) */
  function buildConceptShapeResolver(): ResolveConceptShape {
    return (lib, name) => (lib === undefined ? undefined : conceptShape.get(nodeKey(conceptDeclRef(lib, name))));
  }
  /** #187 Option-3 — the injected resolver `buildQuestionnaire` uses to render an on-path composite `when`'s `defined as`
   *  OPERATOR tree (ANY OF / ALL OF boxes). Keyed by the SAME nodeKey as `conceptByKey`; undefined when maps absent. */
  function buildDefExprResolver(): ResolveDefExpr {
    return (lib, name) => (lib === undefined ? undefined : defExpr.get(nodeKey(conceptDeclRef(lib, name))));
  }

  function renderEmpty(message: string): void {
    for (const [pane, v] of views) {
      const gen = coord.startRender(pane);
      v.gen = gen;
      v.indexVersion = indexVersion;
      v.acked = false;
      v.anchors = {};
      v.reveals = {};
      v.leafConcepts = {}; // #187 Todo 5
      v.conceptOccurrences = []; // #203 Todo 4b Slice A: reset the flag-badge substrate too (symmetry; no stale tree data)
      v.flaggableGids = [];
      v.startNodeGid = undefined;
      void v.panel.webview.postMessage({ type: "render", html: `<p class="placeholder">${escapeHtml(message)}</p>`, gen, indexVersion, mode });
    }
  }

  function onWebviewMessage(
    pane: Pane,
    msg: { type?: string; gen?: number; key?: string; value?: string; noteId?: string; mode?: string; idx?: number; dir?: string; on?: string; state?: string; tag?: unknown; summary?: unknown; stub?: unknown; fields?: unknown },
  ): void {
    const v = views.get(pane);
    if (!v) return;
    if (msg.type === "ready" && typeof msg.gen === "number") {
      if (msg.gen !== v.gen) return; // superseded render's ack
      v.acked = true;
      // Use the render's authoritative indexVersion (stored shell-side), NOT a value echoed by the untrusted webview.
      const target = coord.ready(pane, v.gen, v.indexVersion);
      if (target) postReveal(pane, target);
      // #173 T3: a fresh tree render starts with an empty #fcChrome — re-post the toggle + gap banner on ack so they
      // survive a re-render (rebuild / showKeys toggle). The failed-criterion OVERLAY itself re-applies via the normal
      // reveal-on-ack path is NOT automatic (it's selection-driven), so a tree opened mid-session re-drives the peek
      // through the `if (opened && state.selection) dispatch(...)` path in reconcilePaneOrder.
      if (pane === "tree") {
        renderTreeChrome();
        // #156 slice 5 / #210: a freshly-(re)rendered tree loses its verdict classes (innerHTML replaced) — re-post the MV
        // review overlay on ack so the at-rest verdict painting survives a render. (The failed-criterion overlay
        // re-applies via the selection-driven dispatch path; the review overlay is selection-INDEPENDENT, so it re-drives here.)
        driveDoneOverlay();
        // #203 Todo 4b Slice A: a fresh tree render dropped its `.has-flag` classes — re-drive the per-node flag badges
        // (selection-INDEPENDENT, like the review overlay). Uses this render's captured conceptOccurrences/flaggableGids.
        driveFlagBadges();
        // #187 Todo 5: a fresh tree render dropped its `.flow-leaf-yes/no` classes (innerHTML replaced) — re-drive the
        // per-case leaf verdict overlay so a tree opened / re-rendered mid-session repaints the focused case's leaf answers.
        // NOTE: unlike the review overlay, this is selection-DEPENDENT — it rings `focusedScenario()`, which exists only in
        // cel-primary; it re-drives HERE (on ack) to survive the innerHTML replacement, and ALSO on every selection dispatch.
        driveLeafMarks();
      }
      // #177 slice 4: a freshly-(re)rendered marker-bearing pane (tree/crl/source/questionnaire) loses its `.this-node`
      // class (innerHTML replaced) — re-drive the marker on its ack so the focused question's node re-paints. Like the
      // review overlay this is selection-INDEPENDENT (it tracks the focused question), so it re-drives HERE, not via the
      // selection-dispatch path. driveThisNode is gen-stamped per pane + reads the live questionNodeIds, so an ack from a
      // stale render posts a mark the webview drops. (cel pane carries no marker → skipped; its ack needs no re-drive.)
      if (pane === "tree" || pane === "crl" || pane === "source" || pane === "questionnaire") {
        driveThisNode();
      }
      // disc 164: the diverter overlay paints tree/crl/source only (never the questionnaire pane), so re-drive it on JUST
      // those acks — a fresh render lost its `.diverter` classes (and the ack's postReveal re-posted the highlight, whose
      // clrDV cleared them). NOT on a questionnaire-only ack (nav): tree/crl/source didn't re-render, their marks survive,
      // so re-running buildQuestionnaire there would be pure churn (gpt55 impl review, disc 164).
      if (pane === "tree" || pane === "crl" || pane === "source") {
        driveDiverters();
      }
    } else if (msg.type === "diverterToggle" && (msg.on === "1" || msg.on === "0")) {
      applyShowDetails(msg.on === "1"); // disc 164: the tree-pane diverter on/off toggle (MV)
    } else if (msg.type === "fcMode" && (msg.mode === "blocking" || msg.mode === "all")) {
      applyFailedCriteriaMode(msg.mode); // the tree-pane segmented toggle
    } else if (msg.type === "fcOpenSource" && typeof msg.idx === "number") {
      openFailedCriterionSource(msg.idx); // a gap row's "Open CRL source"
    } else if (msg.type === "mvFlags") {
      void openFlagList(); // #203 Todo 4: the tree-chrome flag badge → open the review-flag list (MV)
    } else if (msg.type === "questionNav" && (msg.dir === "prev" || msg.dir === "next")) {
      navigateQuestion(msg.dir); // #177 slice 5: the questionnaire pane's prev/next sub-nav — moves currentQuestionIndex
    } else if (msg.type === "worklistSet" && typeof msg.key === "string") {
      setWorklist(msg.key, msg.value); // #156 slice 4: a worklist dropdown change (MV mode) — host validates + persists it
    } else if (msg.type === "nodeVerdictMenu" && typeof msg.key === "string") {
      void nodeMenu(msg.key); // #217 + #203 Todo 4b Slice B: right-click a flow node (MV) — combined menu (verdict / add-flag); a non-flaggable node routes straight to the verdict pick
    } else if (msg.type === "worklistFilterToggle") {
      toggleWorklistFilter(msg.state); // #214: toggle a verdict in/out of the worklist filter (host validates the state)
    } else if (msg.type === "notesToggle" && typeof msg.key === "string") {
      toggleNotes(msg.key); // #156 notes: open/close a case's right drawer
    } else if (msg.type === "notesClose") {
      closeNotes();
    } else if (msg.type === "noteAdd" && typeof msg.key === "string") {
      addNoteFromWebview(msg.key, msg.value); // host stamps id + created, validates the open drawer, persists
    } else if (msg.type === "noteEditStart" && typeof msg.noteId === "string") {
      startEditNote(msg.noteId);
    } else if (msg.type === "noteEditSave" && typeof msg.noteId === "string") {
      saveEditNote(msg.noteId, msg.value);
    } else if (msg.type === "noteEditCancel") {
      cancelEditNote();
    } else if (msg.type === "noteDelete" && typeof msg.noteId === "string") {
      deleteNoteFromWebview(msg.noteId);
    } else if (msg.type === "flagDraftInsert") {
      void commitFlagDraft({ tag: msg.tag, summary: msg.summary, stub: msg.stub, fields: msg.fields }); // host uses the captured target; payload is untrusted
    } else if (msg.type === "flagDraftCancel") {
      closeFlagDrawer();
    } else if (msg.type === "reveal" && typeof msg.key === "string") {
      const hit = v.reveals[msg.key]; // trusted: looked up by opaque key, not a path/range from the webview
      if (!hit) return;
      // #219: this is a CLICK in `pane` → its OWN reveal (peek or selection) must not scroll (respect the user's viewport;
      // cross-pane targets still scroll). Set at the TOP so it covers the peek paths too. Live for the SYNCHRONOUS work below
      // (a single-case selection dispatches inline → postReveal + the same-dispatch failed-criteria mark both see it) and
      // cleared in `finally`. A multi-case pick is async: the origin is threaded into `selectInPrimary`/`pickThenSelect`,
      // which re-arm the flag around the DEFERRED dispatch — so the post-quick-pick selection also holds the viewport.
      scrollSuppressPane = pane;
      try {
        // A fact peek is transient + shell-only — divert it BEFORE the engine-selection path (no lastClicked, no dispatch)
        // AND before the !crlMaps guard, so a peek always clears prior highlights even if maps are momentarily absent.
        if (isFactHit(hit)) {
          peekConcept(hit);
          return;
        }
        // A CRL concept-row click is likewise a PEEK (#166 Slice 3a) — diverted before the engine-selection path so a
        // concept node is never routed through mapHitToPrimary as a DECISION.
        if (isConceptHit(hit)) {
          peekConceptNode(hit.conceptNodeKey);
          return;
        }
        if (!crlMaps) return;
        // #216: a tree SUB-QUESTION click → select the case(s) where THIS operand is TRUE on-path (dynamic), NOT via
        // `mapHitToPrimary` (the leaf key isn't a unit/nodeKey/caseId). Diverted here (needs crlMaps + the per-case run truth).
        if (isSubQuestionHit(hit)) {
          selectSubQuestionCases(hit.subQuestionLeafKey, crlMaps);
          return;
        }
        // Otherwise the click sets the selection in the CURRENT primary's space (mapping cross-pane as needed).
        const p = state.primary;
        // record the open-raw locus only for a source-span click while source-primary
        lastClicked = "unitId" in hit && p === "source" ? { unitId: hit.unitId, range: hit.range } : undefined;
        selectInPrimary(mapHitToPrimary(hit, p, crlMaps), p);
      } finally {
        scrollSuppressPane = undefined;
      }
    }
  }

  /** #216: resolve a clicked tree SUB-QUESTION (its stable `leaf::` key) → the frozen cases whose fired path lights that leaf
   *  `.flow-leaf-yes` (the operand is TRUE on-path — the SAME per-case leaf truth Slice 1b paints, via `leafBucketsFromQuestionnaire`),
   *  then select them in the current primary (each case → the primary's ids via `mapHitToPrimary`, so one case selects and
   *  several raise the multi-case quick-pick). An unreached operand (no case lights it) → no cases → a no-op (prior selection
   *  stays). Only the on-path cases are offered; in cel-primary (the MV default) the selected case re-rings the clicked leaf.
   *  In source-primary no leaf ever rings (that is a cel-primary/focused-case feature) — the case still selects, without a ring. */
  function selectSubQuestionCases(leafKey: string, m: CrlRevealMaps): void {
    const tree = views.get("tree");
    if (!tree) return;
    // keys = the on-path `yesLeafKeys` (an errored run → `[]` so it never matches a leaf) — the pure helper then filters to
    // the cases whose fired path lights THIS leaf. NARROWER than the right-click resolver's full lit set (leaves only), on
    // purpose: a sub-question left-click navigates to the cases the operand is TRUE on-path for, not every case through it.
    const entries = [...scenarioByCaseId].map(([caseId, sv]) => ({
      caseId,
      keys: sv.status === "error" ? [] : leafBucketsFromQuestionnaire(questionnaireFor(caseId, sv).questions, whenKeyResolver(sv), sv.conceptTruth, tree.leafConcepts).yesKeys,
    }));
    const caseIds = caseIdsForNodeThroughLit(leafKey, entries); // the on-path cases (the shared, tested membership core)
    const p = state.primary;
    const ids = [...new Set(caseIds.flatMap((caseId) => mapHitToPrimary({ caseId }, p, m)))];
    selectInPrimary(ids, p);
  }

  /** Map a webview click hit → the candidate ids in the CURRENT primary's space (the 3×3 click matrix; cross arms via maps).
   *  These produce an engine SELECTION, so they stay DIRECT — deliberately NOT in lockstep with postReveal's #166-3b
   *  containment ENRICHMENT. The unit→crl arm uses rowNodeKeysForUnit (direct), NOT rowNodeKeysForUnitWithConcepts: a
   *  selection must round-trip (the reverse crlNode→source arm is direct unitsForRow), and selecting a containment-only
   *  container `when` would clear the originally-clicked nested-only unit. Containment is a HIGHLIGHT concern (postReveal). */
  function mapHitToPrimary(hit: RevealHit, primary: PrimaryPane, m: CrlRevealMaps): string[] {
    if ("unitId" in hit)
      return primary === "source" ? [hit.unitId] : primary === "crl" ? rowNodeKeysForUnit(hit.unitId, m) : caseIdsForUnit(hit.unitId, m);
    if ("nodeKey" in hit)
      return primary === "crl" ? [hit.nodeKey] : primary === "source" ? unitsForRow(hit.nodeKey, m) : caseIdsForNode(hit.nodeKey, m);
    return primary === "cel"
      ? [hit.caseId]
      : primary === "source"
        ? unitsForCase(hit.caseId, m).filter((u) => m.sourceBearingUnits.has(u))
        : rowsForCase(hit.caseId);
  }

  const selOf = (primary: PrimaryPane, id: string): Selection =>
    primary === "source" ? { primary: "source", unitId: id } : primary === "crl" ? { primary: "crl", nodeKey: id } : { primary: "cel", caseId: id };

  function labelInPrimary(id: string, primary: PrimaryPane): { label: string; description?: string } {
    if (primary === "source") return { label: correspondence?.units.find((u) => u.id === id)?.label ?? id, description: id };
    if (primary === "crl") {
      const n = state.index?.crlNav.find((x) => x.nodeKey === id);
      return { label: n?.label ?? id, description: n?.description };
    }
    const n = state.index?.celNav.find((x) => x.caseId === id);
    return { label: n?.label ?? id, description: n?.description };
  }

  /** Async-safe pick-then-select: drops a stale pick after a rebuild OR a primary switch (the engine select-guard is the
   *  backstop, but guarding here avoids dispatching a known-stale selection). */
  function pickThenSelect<T>(items: (vscode.QuickPickItem & { value: T })[], placeHolder: string, toSel: (v: T) => Selection, origin?: Pane): void {
    const ver = indexVersion;
    const pri = state.primary;
    void vscode.window.showQuickPick(items, { placeHolder }).then((pick) => {
      if (pick && indexVersion === ver && state.primary === pri) {
        // #219: re-arm the click origin around the DEFERRED dispatch (the reveal handler's finally already cleared it) so
        // the pane the click came from still holds its viewport. The dispatch is synchronous, so the flag is scoped to it.
        scrollSuppressPane = origin;
        try {
          dispatch({ type: "select", selection: toSel(pick.value) });
        } finally {
          scrollSuppressPane = undefined;
        }
      }
    });
  }

  /** Select the mapped target in `primary`: 1 → select; >1 → quick-pick; 0 → no-op. */
  function selectInPrimary(ids: string[], primary: PrimaryPane, origin: Pane | undefined = scrollSuppressPane): void {
    if (ids.length === 0) return;
    if (ids.length === 1) {
      dispatch({ type: "select", selection: selOf(primary, ids[0]) }); // #219: origin flag is already live (set by the caller)
      return;
    }
    // #219: the multi-case dispatch is DEFERRED behind the quick-pick — capture the click origin (default: the live flag)
    // and re-arm it around that later dispatch so the origin pane still holds its viewport.
    pickThenSelect(
      ids.map((id) => ({ ...labelInPrimary(id, primary), value: id })),
      `Maps to multiple ${PANE_TITLE[primary]} targets`,
      (id) => selOf(primary, id),
      origin,
    );
  }

  function ensurePane(pane: Pane): PaneView {
    let v = views.get(pane);
    if (v) return v;
    const panel = vscode.window.createWebviewPanel(
      `crlCockpit.${pane}`,
      paneTitle(pane),
      { viewColumn: columnFor(pane), preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.webview.html = shellHtml();
    coord.setPaneCapability(pane, "renderable"); // all panes render + receive reveals (the tree flowchart lit up in T3)
    const disposables: vscode.Disposable[] = [
      panel.webview.onDidReceiveMessage((m) => onWebviewMessage(pane, m)),
    ];
    v = { panel, gen: 0, indexVersion: 0, acked: false, anchors: {}, reveals: {}, leafConcepts: {}, conceptOccurrences: [], flaggableGids: [], disposables };
    views.set(pane, v);
    panel.onDidDispose(() => {
      for (const d of disposables) d.dispose();
      coord.disposePane(pane);
      views.delete(pane);
      // #211: the flag drawer lives in the tree pane's own region — if that pane is torn down mid-draft, drop the host
      // draft too (else `flagDraft` lingers invisible + uncommittable; a fresh tree panel wouldn't re-show it).
      if (pane === "tree") flagDraft = undefined;
    });
    return v;
  }

  // ── (re)build the model from the active .cel ──
  function rebuild(): void {
    if (!currentCel) return;
    const d = discoverProvenance(currentCel);
    if (!d.found) {
      resetToEmpty(`${basename(currentCel)}: ${d.reason}`);
      return;
    }
    try {
      const cm = buildCockpitModel(d.artifactPath, currentCel, d.anchorPath, PANEL_VALIDATION_MODE); // resolve ONCE → corr + structure + scenarios
      correspondence = cm.correspondence;
      crlStructure = cm.crlStructure;
      conceptLayer = cm.conceptLayer;
      conceptShape = cm.conceptShape; // #187 Todo 3
      defExpr = cm.defExpr; // #187 Option-3
      scenarios = cm.scenarios;
      caseIdByName = cm.caseIdByName;
      duplicateScenarioNames = cm.duplicateScenarioNames;
      // caseId → ScenarioViewModel, inverted through the FROZEN caseIdByName (never by raw name) so a name collision
      // can't mis-join a peek to the wrong case (#173 collision guard, disc 159 Claude-4).
      scenarioByCaseId = new Map();
      for (const sc of cm.scenarios.scenarios) {
        const caseId = cm.caseIdByName[sc.case.name];
        if (caseId !== undefined && !duplicateScenarioNames.has(sc.case.name)) scenarioByCaseId.set(caseId, sc);
      }
      if (cm.caseNameCollisions.length)
        console.warn(
          `[crl.cockpit] CEL has cases sharing a name (${cm.caseNameCollisions.join(", ")}) — those cases render but aren't cross-pane reveal targets; give each a distinct name.`,
        );
      model = buildViewerModel(cm.correspondence);
    } catch (e) {
      resetToEmpty(`Failed to build provenance: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    indexVersion += 1;
    lastClicked = undefined;
    // #173 T3: the runtime-ref → CRL-row-nodeKey join (pure, off crlStructure). A prior peek's gap list is stale now.
    runtimeRefIndex = buildRuntimeRefIndex(crlStructure);
    fcGaps = [];
    fcGapDisabledMsg = undefined;
    crlMaps = buildCrlRevealMaps(correspondence, crlStructure, conceptLayer);
    // A concept key is fact-clickable iff it has ≥1 source-bearing unit OR ≥1 CRL row (the two map key spaces are
    // independent — has-unit and has-row are separate quadrants). The fact-side kind guard (definedBy.kind==="concept")
    // is applied in renderCelPane; this set just drops concepts with no correspondence to reveal.
    const m = crlMaps;
    // A concept is fact-peek-clickable if a peek of it wouldn't be blank: it has a source-bearing unit OR a CRL row.
    // #166 3b adds the THIRD term (purely additive) — nested sub-concepts whose driving `when` is reachable only via
    // containment (∉ keyToRowNodeKeys directly), so a CEL fact `defined by` a nested concept becomes clickable too.
    revealableConceptKeys = new Set<string>([
      ...[...m.keyToUnitIds].filter(([, units]) => units.some((u) => m.sourceBearingUnits.has(u))).map(([k]) => k),
      ...m.keyToRowNodeKeys.keys(),
      ...[...m.conceptByKey.keys()].filter((k) => rowNodeKeysForConcept(k, m).length > 0),
    ]);
    // #163 at-rest key: number units by model.steps order (= nav order); precompute the CRL-row + CEL-case number lists
    // (branch-scoped for rows). Cached so the showKeys toggle re-renders without rebuilding. Only non-empty entries stored.
    unitNumber = new Map(model.steps.map((s, i) => [s.unitId, i + 1]));
    rowKeyNumbers = {};
    const numberRows = (nodes: CrlStructureNode[]): void => {
      for (const n of nodes) {
        const nums = unitNumbersForRow(n.nodeKey, m, unitNumber);
        if (nums.length) rowKeyNumbers[n.nodeKey] = nums;
        numberRows(n.children);
      }
    };
    for (const d of crlStructure) {
      const nums = unitNumbersForRow(d.nodeKey, m, unitNumber);
      if (nums.length) rowKeyNumbers[d.nodeKey] = nums;
      numberRows(d.children);
    }
    caseKeyNumbers = {};
    for (const caseId of Object.values(caseIdByName)) {
      const nums = unitNumbersForCase(caseId, m, unitNumber);
      if (nums.length) caseKeyNumbers[caseId] = nums;
    }
    // #166 Slice 3a: at-rest key on concept rows — a concept's citing units' numbers (raw; a concept isn't branch-bound).
    conceptKeyNumbers = {};
    for (const c of conceptLayer) {
      const nums = [...new Set(unitsForConceptNode(c.nodeKey, m).map((u) => unitNumber.get(u)).filter((n): n is number => n !== undefined))].sort((a, b) => a - b);
      if (nums.length) conceptKeyNumbers[c.nodeKey] = nums;
    }
    // #203 Todo 4b Slice A: (re)parse the policy `.crl` review flags BEFORE the panes render — the tree-chrome gate AND the
    // per-node badges read `flagsList`, so loading AFTER the render (as it was) left both a rebuild stale (gpt55/Claude
    // review). Independent of the correspondence model (reads the `.crl` directly); inert in cockpit mode (MV-only).
    loadFlags();
    for (const pane of PANES) coord.clearPending(pane);
    dispatch({ type: "setInputs", index: toIndex(model, crlStructure, toCelNav(scenarios, caseIdByName, duplicateScenarioNames), indexVersion) });
    updateNavMessage();
    // Iterating GLOBAL PANES is robust (FIX 3 verified): renderPane early-returns on `!views.get(pane)`, so a pane not
    // currently open — the MV-only questionnaire in cockpit mode, or a pane dropped on a mode switch whose onDidDispose
    // hasn't pruned `views` yet — is a clean no-op (no render to a stale/disposing webview). Same for applyShowKeys below.
    for (const pane of PANES) renderPane(pane);
    // #156 slice 5: the model/segments just rebuilt (new segment ids) — re-drive the MV done/error overlay so the freshly
    // rendered tree paints its at-rest review state. (The tree render is async; the post here lands gen-stamped and the
    // webview drops it if superseded — but the tree's own ack re-drives via driveDoneOverlay below, so a race self-heals.)
    driveDoneOverlay();
    // #177 slice 4: the model/segments just rebuilt (new gen-scoped ids; questionNodeIds re-captured by the questionnaire
    // render above) — re-drive the "this node" marker so the freshly rendered panes paint the focused question's node.
    // Same self-healing-on-ack contract as driveDoneOverlay (each pane's ack re-drives). Inert in cockpit (clears).
    driveThisNode();
    // disc 164: the rebuilt panes lost their `.diverter` classes — re-drive the produced-path diverter overlay too
    // (same self-healing-on-ack contract; each pane's ack also re-drives). Inert in cockpit / for a no-diverter case.
    driveDiverters();
    // #187 Todo 5: the rebuilt tree lost its `.flow-leaf-yes/no` classes — re-drive the leaf verdict overlay too (same
    // self-healing-on-ack contract; the tree's ack also re-drives). Inert in cockpit / for a no/errored focused case.
    driveLeafMarks();
    // #203 Todo 4b Slice A: the rebuilt tree lost its `.has-flag` classes — re-drive the per-node flag badges (flagsList
    // was refreshed BEFORE the render above; the tree's ack also re-drives). Inert in cockpit mode.
    driveFlagBadges();
  }

  /** On a discovery/build failure, drop stale provenance so the panes never stay interactive with wrong data. */
  function resetToEmpty(message: string): void {
    model = undefined;
    correspondence = undefined;
    crlStructure = [];
    conceptLayer = [];
    conceptShape = new Map();
    defExpr = new Map();
    crlMaps = undefined;
    scenarios = undefined;
    caseIdByName = {};
    scenarioByCaseId = new Map();
    duplicateScenarioNames = new Set();
    runtimeRefIndex = new Map();
    fcGaps = [];
    fcGapDisabledMsg = undefined;
    revealableConceptKeys = new Set();
    conceptToFactAnchors = {};
    // #156 slice 4: drop the worklist state too (mirror loadReviewSidecar's clearing) — else a click on the not-yet-
    // replaced old CEL DOM would resolve a stale worklistActions key + persist against the stale mvSidecarPath.
    reviewByCaseId = {};
    notesByCaseId = {}; // #156 notes: drop the threads + drawer UI-state too (mirror loadReviewSidecar's clearing)
    openNotesCaseId = undefined;
    editingNoteId = undefined;
    flagDraft = undefined; // #211: drop the create-flag draft (a stale drawer must not commit against a prior policy)
    postFlagDrawer(); // clear the webview region (posts empty since flagDraft is now undefined)
    mvSidecarPath = undefined;
    flagsList = []; // #203 Todo 4: drop the review-flag state too (a stale flag list/gate must not survive a failed retarget)
    flagLoadError = false;
    worklistActions = {};
    worklistFilter = new Set(REVIEW_STATES); // #214: reset the verdict filter to all-shown (a stale filter must not hide the next policy)
    currentQuestionIndex = -1; // #177 slice 3: drop the questionnaire sub-nav cursor (no question focused) with the MV state
    questionNodeIds = []; // #177 slice 4 (FIX 5): drop the focused-question id list too (symmetry/defense — renderEmpty leaves a stale list)
    unitNumber = new Map();
    rowKeyNumbers = {};
    caseKeyNumbers = {};
    conceptKeyNumbers = {};
    lastClicked = undefined;
    indexVersion += 1;
    for (const pane of PANES) coord.clearPending(pane);
    dispatch({ type: "setInputs", index: { version: indexVersion, anchorFilePath: "", steps: [], sourceCycleIds: [], crlNav: [], celNav: [] } });
    navView.message = message;
    renderEmpty(message);
  }

  function setupWatcher(): void {
    watcher?.dispose();
    watcher = undefined;
    if (!currentCel) return;
    const src = findPolicySrc(currentCel);
    const pat = src ? new vscode.RelativePattern(src, "{provenance/*.provenance.json,anchor-source/*.txt}") : undefined;
    if (!pat) return;
    watcher = vscode.workspace.createFileSystemWatcher(pat);
    const onFs = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(rebuild, 150);
    };
    watcher.onDidCreate(onFs);
    watcher.onDidChange(onFs);
    watcher.onDidDelete(onFs);
  }

  // ── commands ──
  /** In-flight guard for the async show commands (#156 slice 3, FIX 6). The active-`.cel` fast-path is sync, but the
   *  `findFiles` quick-pick path awaits — two rapid show invocations (Cockpit then Medical Validation) would otherwise
   *  interleave two `openPanel` calls mutating the shared `mode`/`views`. While a pick is pending, a second show is
   *  ignored (first-wins; the active user keeps their in-progress pick). */
  let pickPending = false;

  /** Resolve the .cel to open a panel on (#156 slice 3, shared by BOTH commands). If the active editor is a `.cel`, use
   *  it (preserves the long-standing focused-`.cel` behavior). Otherwise scan the workspace for policy-shaped `.cel`
   *  files (those for which `findPolicySrc` succeeds — a non-policy `.cel` would fail discovery anyway) and quick-pick
   *  one. Returns the chosen path, or undefined when cancelled / none found. */
  async function pickCelForPanel(): Promise<string | undefined> {
    const ed = vscode.window.activeTextEditor;
    if (ed && ed.document.uri.scheme === "file" && ed.document.uri.fsPath.toLowerCase().endsWith(".cel")) {
      return ed.document.uri.fsPath; // sync fast-path — no re-entrancy window
    }
    // FIX 7 (false-negative boundary): the 500 cap is applied by findFiles BEFORE the policy filter, so in a workspace
    // with >500 .cel files the cap could fill with non-policy files and miss policy-shaped ones. The content project is
    // well under 500; no fix now — just the honest note. (findPolicySrc also does sync existsSync ancestor walks per
    // candidate; fine at 500, a UI-thread concern only if the cap rises.)
    const uris = await vscode.workspace.findFiles("**/*.cel", "**/node_modules/**", 500);
    // Policy-shaped only: a .cel under a policy `src/` with a `provenance/` sibling. Sort for a stable list.
    const policyCels = uris.map((u) => u.fsPath).filter((p) => findPolicySrc(p) !== undefined).sort();
    if (policyCels.length === 0) {
      void vscode.window.showInformationMessage("CRL: no policy-shaped .cel files found in this workspace (a .cel under a policy src/ with a provenance/ folder).");
      return undefined;
    }
    const items = policyCels.map((p) => {
      const rel = vscode.workspace.asRelativePath(p, false);
      return { label: basename(p), description: rel, value: p };
    });
    const pick = await vscode.window.showQuickPick(items, { placeHolder: "Pick a policy .cel to open" });
    return pick?.value;
  }

  /** Open (or RETARGET) the single panel session in `targetMode` on `celPath`. One singleton controller + one
   *  parameterized webview: switching modes on an open session RETITLES the panes in place + reconciles the new mode's
   *  pane set/order (NO bulk dispose-and-reopen — `ensurePane` returns the still-`views`-tracked view and onDidDispose
   *  fires async, so reopening against a disposing webview is the race FIX 5 avoids). config reads use
   *  `configSection(targetMode)` + the matching pane spec; `failedCriteriaMode` stays SHARED under `crl.cockpit`. */
  function openPanel(targetMode: "cockpit" | "medical-validation", celPath: string): void {
    mode = targetMode;
    currentCel = celPath;
    const uri = vscode.Uri.file(celPath);
    const section = configSection(mode);
    // Safe on-demand reveal (mirrors provenancePanel) — runs only when the user explicitly opens a panel on a .cel,
    // NOT unconditionally at activation. Ensures the navigator shows even if the gate's one-shot findFiles missed.
    void vscode.commands.executeCommand("setContext", "crl.active", true);
    // Apply the persisted default primary BEFORE the first rebuild's navigator render (else it flips visibly). FIX 2:
    // reject a primary not navigable in THIS mode (e.g. a hand-edited `crl.medical-validation.primary: "crl"`) → the
    // mode's default stands.
    const pref = vscode.workspace.getConfiguration(section, uri).get<string>("primary");
    if (pref === "source" || (pref === "crl" || pref === "cel") && primaryPanesForMode(mode).includes(pref))
      state = reduce(state, { type: "setPrimary", primary: pref as PrimaryPane }).state;
    // paneOrder is window-scoped (User settings = global/cross-project; Workspace settings = per-project) — read with the
    // .cel resource URI so a workspace/folder override is honored; normalize against the mode's spec; open panes in order.
    paneOrder = normalizePaneOrder(
      vscode.workspace.getConfiguration(section, uri).get("paneOrder"),
      paneSpecFor(mode),
    );
    showKeys = vscode.workspace.getConfiguration(section, uri).get<boolean>("showKeys") ?? true;
    // #173 T3: the persisted All/Blocking failed-criteria mode is SHARED — always read from `crl.cockpit` (the toggle is
    // cross-surface; the scenarioRunner reads the same key), regardless of panel mode.
    const fcm = vscode.workspace.getConfiguration("crl.cockpit", uri).get<string>("failedCriteriaMode");
    failedCriteriaMode = fcm === "all" ? "all" : "blocking";
    // disc 164: the diverter overlay's persisted on/off (SHARED under crl.cockpit like failedCriteriaMode; default OFF).
    showDetails = vscode.workspace.getConfiguration("crl.cockpit", uri).get<boolean>("showDetails") ?? false;
    // FIX 5: retitle any already-open pane in place for the new mode (settable property), then let reconcilePaneOrder
    // open/dispose the delta for the new spec's order. ensurePane any not-yet-open visible pane. NO bulk dispose.
    for (const [pane, v] of views) v.panel.title = paneTitle(pane);
    for (const pane of paneOrder) if (state.paneVisibility[pane]) ensurePane(pane);
    reconcilePaneOrder(); // drop panes not in the new order (e.g. cockpit's crl when switching to MV) + re-place columns
    loadReviewSidecar(); // #156 slice 4: MV mode → load the worklist sidecar BEFORE the first rebuild (no checkbox flash)
    setupWatcher();
    rebuild();
  }

  /** Load the Medical Validation worklist sidecar for `currentCel` into `reviewByCaseId` (#156 slice 4). MV mode only;
   *  cockpit mode → empty (the worklist is disabled, no sidecar). Resolves the policy-scoped sidecar path, loads it (the
   *  store NEVER throws — a corrupt/missing file degrades to empty + a soft `warning`), and surfaces any warning ONCE via
   *  a non-blocking message. Called BEFORE the first rebuild so the checkboxes paint correctly on first show. Stale entries
   *  (a deleted/re-frozen case) are inert — the renderer keys by live caseId, so an orphan row simply never matches. */
  function loadReviewSidecar(): void {
    reviewByCaseId = {};
    notesByCaseId = {}; // #156 notes: reset the threads + drawer UI-state with the rest of the MV state
    openNotesCaseId = undefined;
    editingNoteId = undefined;
    flagDraft = undefined; // #211: a policy (re)load drops any in-flight create-flag draft
    postFlagDrawer(); // clear the webview region
    mvSidecarPath = undefined;
    worklistActions = {};
    worklistFilter = new Set(REVIEW_STATES); // #214: reset the verdict filter to all-shown on retarget (policy A's filter must not hide policy B)
    if (mode !== "medical-validation" || !currentCel) return;
    const path = medicalValidationSidecarPath(currentCel);
    if (!path) return; // .cel not inside a discoverable policy src/ → no sidecar (worklist renders all-unreviewed)
    mvSidecarPath = path;
    const { sidecar, warning } = loadSidecar(path);
    reviewByCaseId = sidecar.byCaseId;
    notesByCaseId = sidecar.notesByCaseId ?? {}; // loaded from the SAME sidecar (coerce carried them through)
    // Warn ONCE per (path, warning): re-opening the SAME corrupt/forward-version sidecar in the same session shouldn't
    // re-nag. A changed path OR a changed warning string (the file was edited) re-warns.
    if (warning && (lastWarnedSidecar?.path !== path || lastWarnedSidecar?.warning !== warning)) {
      lastWarnedSidecar = { path, warning };
      void vscode.window.showWarningMessage(`Medical Validation: ${warning}`);
    }
  }

  /** Handle a worklist dropdown change (#156 slice 4). The webview posts the opaque `data-worklist-select` key + the
   *  SELECTED value; we resolve the key to a caseId via THIS render's `worklistActions` (trusted-opaque-key discipline, like
   *  `reveals`) AND validate the value is a known ReviewState (never write an arbitrary webview string). The HOST persists,
   *  then re-renders ONLY the cel pane (the dropdown updates) — never a full rebuild (perf). On a save failure we surface a
   *  user-visible error AND keep the in-memory map at its prior value, so disk + memory don't diverge (and the re-render
   *  shows the un-changed state). After a successful set the pass set may have changed → re-drive the tree DONE/ERROR
   *  overlay (#156 slice 5). */
  /** The SINGLE Medical Validation save path. Composes the WHOLE sidecar from BOTH maps (`composeSidecar`) so no save can
   *  ever write one map and forget the other — the verdict-eraser / note-eraser bug the reviewers flagged. Atomically
   *  persists, and on success COMMITS both maps in memory (so a failed save leaves disk + memory both untouched — the
   *  caller's re-render then shows the un-changed state). Returns false on failure (after surfacing it). Callers pass the
   *  NEXT value of the map they changed + the CURRENT value of the other. */
  function persistMv(nextByCaseId: Record<string, PersistedReviewState>, nextNotes: Record<string, Note[]>): boolean {
    if (!mvSidecarPath) return false;
    try {
      saveSidecar(mvSidecarPath, composeSidecar(nextByCaseId, nextNotes));
    } catch (e) {
      void vscode.window.showErrorMessage(
        `Medical Validation: could not save: ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    }
    reviewByCaseId = nextByCaseId; // commit in-memory only AFTER a successful persist
    notesByCaseId = nextNotes;
    return true;
  }

  /** #217: apply a verdict to a case + persist + refresh — the SHARED tail of a worklist dropdown change (`setWorklist`) AND a
   *  tree right-click (`nodeVerdictMenu`). Validates `value` is a known ReviewState (trusted-input); on a persist FAILURE
   *  returns `false` with memory+disk untouched (a caller must NOT paint an unpersisted verdict). `renderPane("worklist")`
   *  safely no-ops when the worklist pane is closed (a tree-set with no worklist open, renderPane guards `!v`); the selection
   *  re-drive re-reveals the CURRENTLY-selected case (which for a right-click may differ from `caseId` — the click is an
   *  affordance, not a selection — harmless: `driveDoneOverlay` repaints ALL reviewed cases). Double-chrome guard: the select
   *  dispatch also renders chrome, so `renderTreeChrome()` only when there's NO selection (else chrome posts twice). */
  function applyVerdict(caseId: string, value: unknown): boolean {
    if (mode !== "medical-validation" || !mvSidecarPath) return false; // defensive: MV-only + a sidecar to persist into
    if (!isReviewState(value)) return false; // trusted-input guard: drop any value not in the known state set
    const next = setReviewState(reviewByCaseId, caseId, value);
    if (!persistMv(next, notesByCaseId)) return false; // save (both maps) failed → memory + disk untouched
    renderPane("worklist"); // single-pane re-render (the dropdown selection); no-op when the worklist pane is closed
    if (state.selection) dispatch({ type: "select", selection: state.selection });
    else renderTreeChrome(); // #156 slice 6: the reviewed/pending counts changed → refresh the tree-chrome progress readout
    driveDoneOverlay(); // #156 slice 5: the reviewed set changed → repaint the tree done/error overlay (no tree re-render)
    return true;
  }

  function setWorklist(key: string, value: unknown): void {
    if (mode !== "medical-validation") return; // defensive: the dropdown only exists in MV mode
    const action = worklistActions[key]; // trusted: looked up by opaque key, not a caseId from the webview
    if (!action) return;
    applyVerdict(action.caseId, value); // the shared persist+refresh tail (validates the value)
  }

  /** #217: a right-click on a flow-pane node → open a native verdict quick-pick for the case(s) whose fired path runs through
   *  it. The webview posts the OPAQUE render `data-reveal` key; we look it up in the tree's `reveals`, normalize the hit to
   *  its SEMANTIC key (`{nodeKey}`→nodeKey, `{subQuestionLeafKey}`→that; a concept/fact peek → no verdict), then resolve the
   *  cases via the SHARED `litNodeKeysForCase` reach + the pure `caseIdsForNodeThroughLit` membership test over `scenarioByCaseId`
   *  (the reviewable set — excludes ambiguous duplicate-name cases; an errored case still matches at interior when-nodes).
   *  EVERY no-op exit emits a transient status note — the webview has already suppressed the native menu, so a silent return
   *  would be a dead right-click (reachable mid-rebuild `!crlMaps`, or a stale-MV webview posting after a retarget). */
  async function nodeVerdictMenu(revealKey: string): Promise<void> {
    const note = (msg: string): void => void vscode.window.setStatusBarMessage(`Medical Validation: ${msg}`, 3000);
    if (mode !== "medical-validation" || !crlMaps || !mvSidecarPath) return note("not ready"); // no sidecar → applyVerdict can't persist; note here (else a feedback-less dead pick)
    const tree = views.get("tree");
    const hit = tree?.reveals[revealKey]; // trusted: looked up by opaque key, not a semantic key from the webview
    if (!tree || !hit) return note("no node here");
    const semanticKey = isSubQuestionHit(hit)
      ? hit.subQuestionLeafKey
      : isFactHit(hit) || isConceptHit(hit)
        ? undefined // a concept/fact peek is not a case-bearing verdict node
        : "nodeKey" in hit
          ? hit.nodeKey
          : undefined;
    if (semanticKey === undefined) return note("this node has no reviewable cases");
    const m = crlMaps;
    const dispositionLeafKeys = collectDispositionLeafKeys(crlStructure);
    const ver = indexVersion; // stale-pick guard: capture the model version + sidecar at menu-open (revalidated before each apply)
    const sidecar = mvSidecarPath;
    // PERF: this builds `litNodeKeysForCase` for EVERY reviewable case — each non-focused case does a full `buildQuestionnaireRaw`
    // (only the focused case hits the memo). Broader than any prior path (driveDoneOverlay's paint builds questionnaires for
    // REVIEWED cases only), but bounded + OFF the hot path (a right-click). The deferred `indexVersion`-keyed memo (see driveDoneOverlay) is the escape valve if a large worklist janks.
    const entries = [...scenarioByCaseId].map(([caseId, sv]) => ({ caseId, keys: litNodeKeysForCase(caseId, sv, m, dispositionLeafKeys, tree.leafConcepts) }));
    const caseIds = caseIdsForNodeThroughLit(semanticKey, entries);
    if (caseIds.length === 0) return note("no reviewable cases run through this node");
    await pickVerdictLoop(caseIds, ver, sidecar);
  }

  // ── #203 Todo 4b Slice B: create-flag ────────────────────────────────────────────
  // Right-click a FLAGGABLE node → a combined menu (Set verdict / Add flag). A flag lives on a concept or decision (the
  // only meta carriers), so the target is: a decision ROOT (→ the decision) or a `when`/def-leaf (→ its concept, resolved
  // via the Slice A conceptOccurrences the render captured). An action/otherwise node has no meta target → no Add-flag.

  /** A flag TARGET a reveal hit offers. An OBJECT flag (concept/decision, no key) OR an OCCURRENCE flag (GAP 3 — a keyed
   *  decision flag on one tree node). The flag always LIVES on a concept or decision (the meta carriers); `key` narrows a
   *  decision flag to one node. `label` is the menu wording. */
  interface FlagTargetChoice {
    kind: "concept" | "decision";
    name: string;
    lib: string;
    key?: string; // an occurrence key `<nodeId>~<signature>` — present iff this is an occurrence target
    label: string; // the FULL wording incl. the occurrence signature — the native menu item + the drawer's hover title
    shortLabel: string; // the human header ("this condition" / the concept / the decision) — no verbose signature
  }

  /** #211 — the prefill for `openFlagDrawer`: the RESOLVED target (chosen host-side, never named by the webview) + optional
   *  seed values. The right-click path passes just `{ target }`; the future editor agent (EPIC #210) passes more. This is
   *  the ONE agent surface for the flag command — a standalone callable, so the add-flag skill drives it directly. */
  interface FlagDraftPrefill {
    target: FlagTargetChoice;
    tag?: string;
    summary?: string;
    stub?: string;
    fields?: Record<string, string>;
  }
  /** The in-flight draft: the prefill + the POLICY (`currentCel`) captured at open. Identity is `cel`/`mode`, NOT
   *  `indexVersion` — a same-policy rebuild must NOT invalidate the draft (the commit re-resolves on live text). */
  type FlagDraftState = FlagDraftPrefill & { cel: string | undefined };

  /** The flag targets a reveal hit offers (GAP 3): a decision ROOT → the decision (object); a `when` → BOTH the concept
   *  (object, all uses) AND this condition (occurrence, decision+key); a recommend-activity LEAF → this recommendation
   *  (occurrence). A menu shows one "Add flag on <label>" per choice. `[]` → not flaggable (verdict-only). */
  function flagTargetChoices(hit: WebviewHit): FlagTargetChoice[] {
    const tree = views.get("tree");
    if (!tree) return [];
    const nodeKey = isSubQuestionHit(hit) ? hit.subQuestionLeafKey : "nodeKey" in hit ? hit.nodeKey : undefined;
    if (!nodeKey) return [];
    // A decision ROOT (a top-level crlStructure entry) → object-decision only.
    const decTop = crlStructure.find((s) => s.nodeKey === nodeKey);
    if (decTop) return [{ kind: "decision", name: decTop.decision, lib: decTop.lib, label: `decision "${decTop.decision}"`, shortLabel: `decision "${decTop.decision}"` }];
    const choices: FlagTargetChoice[] = [];
    // A `when` carries a CONCEPT (object) target — its gating concept, resolved via conceptOccurrences (Slice A).
    const gid = tree.anchors[nodeKey]?.scrollTo;
    const conceptOcc = gid ? tree.conceptOccurrences.find((o) => o.gid === gid) : undefined;
    if (conceptOcc) choices.push({ kind: "concept", name: conceptOcc.name, lib: conceptOcc.lib, label: `the concept "${conceptOcc.name}" (every use)`, shortLabel: `the concept "${conceptOcc.name}" (every use)` });
    // An OCCURRENCE node (a `when` condition, or a recommend-activity leaf) → a keyed decision flag on ONE node.
    let occ: OccurrenceRef | undefined;
    for (const dec of crlStructure) {
      const o = occurrenceByNodeKey(dec, nodeKey);
      if (o) { occ = o; break; }
    }
    if (occ) {
      const short = occ.isLeaf ? "this recommendation" : "this condition"; // the human header — no verbose signature
      choices.push({ kind: "decision", name: occ.decision, lib: occ.lib, key: occurrenceKeyValue(occ), label: `${short} (${occ.signature})`, shortLabel: short });
    }
    return choices;
  }

  /** Find a concept/decision's DECLARATION (file + 1-based decl line + source) by (name, lib) — re-parses the policy's
   *  `src/crl/*.crl` (live-buffer-aware), matching the declaring library. The insertion resolver + WorkspaceEdit need it. */
  function findDeclaration(kind: "concept" | "decision", name: string, lib: string): { filePath: string; declLine: number; source: string } | undefined {
    if (!currentCel) return undefined;
    const src = findPolicySrc(currentCel);
    if (!src) return undefined;
    let files: string[];
    try {
      files = readdirSync(join(src, "crl")).filter((f) => f.toLowerCase().endsWith(".crl")).sort(); // deterministic (match loadFlags)
    } catch {
      return undefined;
    }
    const astType = kind === "concept" ? "Concept" : "Decision";
    for (const fname of files) {
      const filePath = join(src, "crl", fname);
      const text = crlText(filePath);
      if (text === undefined) continue;
      const parsed = buildCRL(text);
      if (!parsed.success || !parsed.result || parsed.result.library?.name !== lib) continue;
      const decl = parsed.result.statements.find((s) => s.type === astType && (s as { name?: string }).name === name);
      if (decl) return { filePath, declLine: decl.location.start.line, source: text };
    }
    return undefined;
  }

  /** The combined node menu (right-click): verdict (existing) + Add-flag (flaggable nodes). A non-flaggable node routes
   *  straight to the verdict flow (unchanged), preserving Todo #217. */
  async function nodeMenu(revealKey: string): Promise<void> {
    if (mode !== "medical-validation") return;
    const tree = views.get("tree");
    const hit = tree?.reveals[revealKey];
    if (!tree || !hit) return flagNote("no node here");
    const choices = flagTargetChoices(hit);
    if (choices.length === 0) return nodeVerdictMenu(revealKey); // otherwise / use-decision → verdict only, unchanged
    const ver = indexVersion; // capture BEFORE the menu — a retarget mid-menu must not act on this (now-old) hit
    const cel = currentCel;
    // Verdict + one "Add flag on <target>" per choice — a `when` offers BOTH the concept (object) and this condition
    // (occurrence); a leaf offers just this recommendation; a decision root just the decision.
    const pick = await vscode.window.showQuickPick(
      [
        { label: "$(checklist) Set case verdict…", act: "verdict" as const, choice: undefined as FlagTargetChoice | undefined },
        ...choices.map((c) => ({ label: `$(flag) Add flag on ${c.label}`, act: "flag" as const, choice: c as FlagTargetChoice | undefined })),
      ],
      { placeHolder: "Medical Validation" },
    );
    if (!pick) return;
    if (indexVersion !== ver || currentCel !== cel || mode !== "medical-validation") return flagNote("policy changed — reopen the menu");
    if (pick.act === "verdict") return nodeVerdictMenu(revealKey); // revealKey is gen-scoped; nodeVerdictMenu re-validates
    // Option A: the target is chosen HERE (native quick-pick); the drawer opens on the RESOLVED target. The webview never
    // names a target (trusted-input discipline). `openFlagDrawer` is a standalone seam — the editor agent (EPIC #210)
    // resolves the target itself and calls it directly, so the flag command has ONE entry point for both paths.
    if (pick.choice) openFlagDrawer({ target: pick.choice });
  }

  /** Post the current `flagDraft` to the tree pane's dedicated `#flagDrawer` region (or an EMPTY region to clear it). The
   *  region is a sibling of `#root`, so this never re-renders the flowchart (no overlay loss) and the render handler never
   *  wipes the drawer (a same-policy rebuild leaves the user's typed text intact). */
  function postFlagDrawer(): void {
    const tree = views.get("tree");
    if (!tree) return;
    const html = flagDraft ? renderFlagDrawer({ targetLabel: flagDraft.target.shortLabel, targetTitle: flagDraft.target.label, tags: flagTags(), tag: flagDraft.tag, summary: flagDraft.summary, stub: flagDraft.stub, fields: flagDraft.fields }) : "";
    void tree.panel.webview.postMessage({ type: "flagDrawer", html });
  }

  /** #211 — open the create-flag drawer on a RESOLVED target (the ONE agent seam). Captures the policy identity for the
   *  commit stale-guards, then renders the drawer. Standalone: both the right-click (Option A) and the editor agent call
   *  this directly. MV-only. */
  function openFlagDrawer(prefill: FlagDraftPrefill): void {
    if (mode !== "medical-validation") return;
    flagDraft = { ...prefill, cel: currentCel };
    postFlagDrawer();
  }

  /** Clear the drawer (drop the host draft + empty the webview region). */
  function closeFlagDrawer(): void {
    if (!flagDraft) return;
    flagDraft = undefined;
    postFlagDrawer(); // posts an empty region
  }

  /** #211 — surface a "flag written, but NO issue" outcome LOUDLY (a persistent warning, not a 3s status-bar note a
   *  reviewer misses) with the exact reason + a one-click fix where one applies: trust the workspace, or re-attempt the
   *  GitHub sign-in (clearing the no-nag latch, since the user explicitly asked). Other reasons (github error / no origin)
   *  just show the message — the raw GitHub text (e.g. a 403 scope error) is the actionable detail. */
  function reportNoIssue(lead: string, reason: string): void {
    const msg = `${lead} — ${reason}.`;
    if (reason === "workspace not trusted") {
      void vscode.window.showWarningMessage(msg, "Manage Workspace Trust").then((a) => {
        if (a) void vscode.commands.executeCommand("workbench.trust.manage");
      });
    } else if (reason === "not signed in to GitHub") {
      void vscode.window.showWarningMessage(msg, "Sign in to GitHub").then((a) => {
        if (a) {
          githubAuthDeclined = false; // the user explicitly wants to sign in — clear the no-nag latch
          void vscode.authentication.getSession("github", ["repo"], { createIfNone: true });
        }
      });
    } else {
      void vscode.window.showWarningMessage(msg);
    }
  }

  /** #211 — commit the drawer's Insert: author a lean flag whose issue is created "born together" (the #204 loop). Order
   *  (design review 233, both reviewers): stale-guard → local validate + a PURE `createFlag` DRY-RUN (no ref) so a
   *  tag/field/decl error aborts with NO orphan issue → resolve the github repo (pure) → auth → create the issue stub
   *  (best-effort; ANY failure → the flag is still written, without a `; ref`) → real `createFlag` + byte-safe
   *  WorkspaceEdit + save → refresh. The webview supplies only `{tag, summary, stub, fields}` (untrusted); the TARGET is
   *  the host-captured `flagDraft.target` (never named by the webview). */
  async function commitFlagDraft(payload: { tag?: unknown; summary?: unknown; stub?: unknown; fields?: unknown }): Promise<void> {
    const draft = flagDraft;
    if (!draft) return;
    if (flagCommitting) return; // in-flight guard: a rapid second Insert must not double-POST / race the write (gpt55 [critical])
    if (mode !== "medical-validation") return closeFlagDrawer();
    const { target, cel } = draft;
    // Sanitize the webview payload (all untrusted). Reserved keys are stripped so a tampered message can't smuggle a fake
    // issue link (`ref`) or occurrence address (`key`) — those are host-owned (`status` is rejected by createFlag).
    const tag = typeof payload.tag === "string" ? payload.tag : "";
    const summary = typeof payload.summary === "string" ? payload.summary.trim() : "";
    const stub = typeof payload.stub === "string" ? payload.stub : "";
    const fields: Record<string, string> = {};
    if (payload.fields && typeof payload.fields === "object") {
      for (const [k, val] of Object.entries(payload.fields as Record<string, unknown>)) if (typeof val === "string" && val.trim() !== "") fields[k] = val.trim();
    }
    delete fields.ref;
    delete fields.key;
    if (target.key) fields.key = target.key; // GAP 3: an occurrence flag carries the node address `<nodeId>~<signature>`
    // Local summary validation (the lean gist must be ONE line — createFlag itself permits newline gists). Keep the drawer
    // OPEN on a form error so the user's text isn't lost — they fix + Insert again.
    if (summary === "") return flagNote("a summary is required");
    if (/[\r\n]/.test(summary)) return flagNote("the summary must be a single line");
    if (hasForbiddenGistChars(summary)) return flagNote("the summary can't contain a backtick or `;`");
    // Identity guard keyed on `currentCel`/`mode`, NOT `indexVersion`: a same-policy rebuild (a background save) bumps
    // indexVersion but the write re-resolves on LIVE text, so the draft must survive it (both reviewers). Only a DIFFERENT
    // policy / mode change means there's nothing to write — and that surfaces a note (never a silent drop).
    if (currentCel !== cel || mode !== "medical-validation") {
      closeFlagDrawer();
      return flagNote("policy changed — flag not added");
    }
    const decl = findDeclaration(target.kind, target.name, target.lib);
    if (!decl) {
      closeFlagDrawer();
      return flagNote(`couldn't locate ${target.kind} "${target.name}" in the .crl`);
    }
    let doc: vscode.TextDocument;
    try {
      doc = await vscode.workspace.openTextDocument(decl.filePath);
    } catch {
      return flagNote("couldn't open the .crl");
    }
    // DRY-RUN the shared #205 transform (no ref) — catch unknown-tag / missing-field / invalid-value / decl-not-found /
    // invalid-result BEFORE any issue POST, so a form error never orphans a GitHub issue. Keep the drawer open on failure.
    const dry = createFlag(doc.getText(), { kind: target.kind, name: target.name, library: target.lib }, { tag, gist: summary, fields, status: "open" });
    if (!dry.ok) return flagNote(`flag not added: ${dry.message}`);
    // Past the dry-run boundary: LOCK (only one commit runs) and wrap EVERYTHING so any throw still surfaces an honest note
    // (never silently drop a created issue). `finally` releases the lock so a later Insert can retry.
    flagCommitting = true;
    let ref: string | undefined;
    let issueNote: string | undefined; // the "no issue link" reason — folded into the FINAL note, never overwritten (gpt55 [important])
    try {
      // Create the issue stub (best-effort). github-origin-only + trusted workspace (an authenticated write to a
      // repo-controlled origin needs trust — same gate as the link-out); any failure → no ref, flag still written.
      if (!vscode.workspace.isTrusted) {
        issueNote = "workspace not trusted";
      } else if (currentCel !== cel || mode !== "medical-validation") {
        // A retarget during the (async) repo-resolve/auth must NOT create an issue for a policy the user left. Pre-POST
        // abort is safe — nothing external has happened yet.
        closeFlagDrawer();
        return flagNote("policy changed — flag not added");
      } else {
        const repo = await githubRepoForFile(vscode.Uri.file(decl.filePath));
        if (!repo) {
          issueNote = "no GitHub origin";
        } else if (currentCel !== cel || mode !== "medical-validation") {
          closeFlagDrawer();
          return flagNote("policy changed — flag not added");
        } else {
          try {
            const token = await githubToken();
            if (!token) issueNote = "not signed in to GitHub";
            else {
              const args = { owner: repo.owner, repo: repo.repo, title: summary, body: stub };
              try {
                ref = `#${await createGithubIssue({ ...args, token })}`;
              } catch (e1) {
                // 401 Bad credentials = a stale/invalid cached VS Code token. Force a FRESH session + retry ONCE.
                if (e1 instanceof IssueCreateError && e1.status === 401) {
                  const fresh = await githubToken(true);
                  if (!fresh) throw e1;
                  ref = `#${await createGithubIssue({ ...args, token: fresh })}`;
                } else throw e1;
              }
            }
          } catch (e) {
            // Surface the RAW GitHub message when we have one (e.g. "GitHub 403: Resource not accessible …") — a short
            // label alone hides the actionable detail (scope/permission). Falls back to the label for a non-typed error.
            issueNote = e instanceof Error && e.message ? `issue not created — ${e.message}` : `issue not created (${issueCreateErrorLabel(e)})`;
          }
        }
      }
      // Real write. RE-READ live text (the doc may have changed during the async POST); write to the CAPTURED file even if
      // the cockpit identity moved on (do NOT abort post-POST — that would strand the created issue). createFlag re-validates
      // on the live text (byte-safe). On a post-POST failure, surface it honestly — never silently drop a real issue.
      const doc2 = await vscode.workspace.openTextDocument(decl.filePath);
      const withRef = ref ? { ...fields, ref } : fields;
      const made = createFlag(doc2.getText(), { kind: target.kind, name: target.name, library: target.lib }, { tag, gist: summary, fields: withRef, status: "open" });
      if (!made.ok) {
        closeFlagDrawer();
        flagNote(ref ? `issue ${ref} created but the flag couldn't be written (${made.message}) — add it manually` : `flag not added: ${made.message}`);
        return;
      }
      const eol = doc2.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n"; // preserve the doc's line ending (CRLF `.crl` files)
      const edit = new vscode.WorkspaceEdit();
      // EOF case: insertLine can legally === lineCount (a concept as the LAST statement, no trailing newline). Insert at
      // end-of-last-line with a LEADING eol (a point insert keeps cursor/undo stable) rather than concatenating onto it.
      if (made.insertLine >= doc2.lineCount) {
        edit.insert(doc2.uri, doc2.lineAt(doc2.lineCount - 1).range.end, eol + made.lineText);
      } else {
        edit.insert(doc2.uri, new vscode.Position(made.insertLine, 0), made.lineText + eol);
      }
      const applied = await vscode.workspace.applyEdit(edit);
      closeFlagDrawer();
      if (!applied) {
        flagNote(ref ? `issue ${ref} created but the edit couldn't be applied — add the flag manually` : "edit could not be applied");
        return;
      }
      const saved = await doc2.save();
      // Refresh only if the policy we wrote is still current (loadFlags/chrome/badges read the current model).
      if (currentCel === cel && mode === "medical-validation") {
        loadFlags();
        renderTreeChrome();
        driveFlagBadges();
      }
      const savedTail = saved ? "" : " — but save the .crl (it's unsaved)";
      if (ref) {
        flagNote(`issue ${ref} created; flag added on ${target.kind} "${target.name}"${savedTail}`);
      } else {
        // The flag is written but NO issue was created. A transient status-bar note is too easy to miss (a reviewer just
        // wonders where the issue went), so surface a PERSISTENT warning with the exact reason + a one-click fix.
        reportNoIssue(`Flag added on ${target.kind} "${target.name}"${savedTail}, but no GitHub issue was created`, issueNote ?? "no issue link");
      }
    } catch (e) {
      // Any unexpected throw AFTER a possible POST (openTextDocument/applyEdit/save/loadFlags reject) — surface it honestly,
      // never silent. If an issue was already created, say so + tell the user to add the flag manually.
      closeFlagDrawer();
      const why = e instanceof Error ? e.message : String(e);
      flagNote(ref ? `issue ${ref} created but the flag couldn't be written (${why}) — add it manually` : `flag not added (${why})`);
    } finally {
      flagCommitting = false;
    }
  }

  /** #217: present the verdict quick-pick(s). ONE case → straight to the verdict pick. SEVERAL → a re-entrant loop: pick a
   *  case (its row shows the live verdict) → pick a verdict → re-show the case list with the updated verdict → Esc to finish
   *  (the faithful native realization of "per-case dropdowns"). Every await is stale-guarded (a rebuild / policy retarget /
   *  mode change between open and choice must not write to the wrong sidecar). */
  async function pickVerdictLoop(caseIds: string[], ver: number, sidecar: string | undefined): Promise<void> {
    const stale = (): boolean => indexVersion !== ver || mvSidecarPath !== sidecar || mode !== "medical-validation";
    // EVERY stale exit surfaces a note (never a silent return) — the webview already suppressed the native menu, so a bare
    // return would be a dead right-click. An Esc/cancel is NOT stale (a deliberate user dismissal) and gets no note.
    const staleNote = (): void => void vscode.window.setStatusBarMessage("Medical Validation: cases changed — verdict not applied", 3000);
    const nameOf = (caseId: string): string => labelInPrimary(caseId, "cel").label;
    const verdictLabel = (caseId: string): string => REVIEW_LABEL[reviewByCaseId[caseId] ?? "unreviewed"];
    const pickVerdict = async (caseId: string): Promise<void> => {
      const current = reviewByCaseId[caseId] ?? "unreviewed";
      const items = REVIEW_ORDER.map((st) => ({ label: REVIEW_LABEL[st], description: st === current ? "current" : "", state: st }));
      const pick = await vscode.window.showQuickPick(items, { placeHolder: `Set review verdict — ${nameOf(caseId)}` });
      if (!pick) return; // Esc — deliberate cancel, no note
      if (stale() || !scenarioByCaseId.has(caseId)) return staleNote();
      applyVerdict(caseId, pick.state);
    };
    if (caseIds.length === 1) return pickVerdict(caseIds[0]);
    for (;;) {
      if (stale()) return staleNote();
      const items = caseIds.map((caseId) => ({ label: nameOf(caseId), description: `verdict: ${verdictLabel(caseId)}`, caseId }));
      const pick = await vscode.window.showQuickPick(items, { placeHolder: "Pick a case to set its verdict (Esc to finish)" });
      if (!pick) return; // Esc ends the loop — deliberate cancel, no note
      if (stale() || !scenarioByCaseId.has(pick.caseId)) return staleNote(); // revalidate BEFORE opening the verdict picker (don't drive a stale second picker)
      await pickVerdict(pick.caseId);
    }
  }

  // ── notes drawer (#156) — the per-case conversation. All mutations go through persistMv (never a bare saveSidecar), so a
  // note change writes the verdicts too. A note change re-renders ONLY the cel pane (the glyph + the drawer); it does NOT
  // touch the tree overlay/progress (notes don't affect the verdict counts). Trusted-input discipline: mutations resolve the
  // case via the OPEN drawer (openNotesCaseId) and validate the posted noteId exists in that case's thread.

  /** Toggle a case's notes drawer (open, or close if it's already the open one). Resolves the opaque worklist key → caseId
   *  (reusing worklistActions — a notes glyph carries the SAME `wl_<caseId>` key as the row's verdict select). Opening a
   *  different case drops any in-progress edit from the prior drawer. */
  function toggleNotes(key: string): void {
    if (mode !== "medical-validation") return;
    const action = worklistActions[key];
    if (!action) return;
    openNotesCaseId = openNotesCaseId === action.caseId ? undefined : action.caseId;
    editingNoteId = undefined;
    renderPane("worklist");
  }

  function closeNotes(): void {
    if (openNotesCaseId === undefined && editingNoteId === undefined) return; // nothing open → no-op (skip a wasted render)
    openNotesCaseId = undefined;
    editingNoteId = undefined;
    renderPane("worklist");
  }

  /** #214: toggle a verdict in/out of the worklist filter. Validates the posted state (untrusted webview string), flips its
   *  membership, and re-renders the worklist. CLEARS the notes drawer ONLY when this toggle HIDES the open case (its verdict
   *  is now filtered out) — else the drawer + its unsaved draft survive the re-render (the webview draft-preservation restores
   *  into the still-present textarea). RE-DRIVES the current selection (like setWorklist, NOT toggleNotes — the reveal is
   *  one-shot, so a bare re-render drops `.current`): a surviving selected row re-highlights; a now-hidden one clears
   *  harmlessly (the dispatch auto-widen won't fire — the caseId is unchanged). */
  function toggleWorklistFilter(state_: unknown): void {
    if (mode !== "medical-validation" || !isReviewState(state_)) return; // trusted-input guard
    if (worklistFilter.has(state_)) worklistFilter.delete(state_);
    else worklistFilter.add(state_);
    // Clear the drawer ONLY if the open case just became hidden (its verdict left the filter) — a visible open case keeps its
    // draft. (openNotesCaseId is a reviewable caseId, so `reviewByCaseId[...] ?? "unreviewed"` is its verdict.)
    if (openNotesCaseId !== undefined && !worklistFilter.has(reviewByCaseId[openNotesCaseId] ?? "unreviewed")) {
      openNotesCaseId = undefined;
      editingNoteId = undefined;
    }
    renderPane("worklist");
    if (state.selection) dispatch({ type: "select", selection: state.selection }); // re-drive so a surviving selection re-highlights
  }

  /** True iff the posted noteId is a live note in the OPEN drawer's case — the trusted-input gate for edit/save/delete. */
  function openNoteExists(noteId: unknown): noteId is string {
    if (typeof noteId !== "string" || openNotesCaseId === undefined) return false;
    return (notesByCaseId[openNotesCaseId] ?? []).some((n) => n.id === noteId);
  }

  function addNoteFromWebview(key: string, value: unknown): void {
    if (mode !== "medical-validation" || !mvSidecarPath) return;
    const action = worklistActions[key];
    if (!action || action.caseId !== openNotesCaseId) return; // must target the OPEN drawer's case (not a stale row)
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) return; // empty/blank → no-op (never create an invisible note that inflates the glyph count)
    const note: Note = { id: randomUUID(), text, created: Date.now() };
    if (!persistMv(reviewByCaseId, addNote(notesByCaseId, action.caseId, note))) return;
    renderPane("worklist"); // glyph count + thread update; verdict counts unchanged → no overlay/progress re-drive
  }

  function startEditNote(noteId: unknown): void {
    if (mode !== "medical-validation" || !openNoteExists(noteId)) return;
    editingNoteId = noteId;
    renderPane("worklist"); // re-render so the note becomes a prefilled textarea (host-state-driven edit-in-place)
  }

  function saveEditNote(noteId: unknown, value: unknown): void {
    if (mode !== "medical-validation" || !mvSidecarPath || openNotesCaseId === undefined || !openNoteExists(noteId)) return;
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) return; // an emptied edit is a no-op — Delete is the explicit removal path; keep the original text
    if (!persistMv(reviewByCaseId, editNote(notesByCaseId, openNotesCaseId, noteId, text, Date.now()))) return;
    editingNoteId = undefined;
    renderPane("worklist");
  }

  function cancelEditNote(): void {
    if (editingNoteId === undefined) return;
    editingNoteId = undefined;
    renderPane("worklist");
  }

  function deleteNoteFromWebview(noteId: unknown): void {
    if (mode !== "medical-validation" || !mvSidecarPath || openNotesCaseId === undefined || !openNoteExists(noteId)) return;
    if (!persistMv(reviewByCaseId, deleteNote(notesByCaseId, openNotesCaseId, noteId))) return;
    if (editingNoteId === noteId) editingNoteId = undefined; // deleted the note that was being edited
    renderPane("worklist"); // the drawer stays OPEN even if the thread is now empty (glyph flips to outline)
  }

  /** Run a show command: guard re-entrancy (FIX 6), pick a .cel, open the panel in `targetMode`. */
  function runShow(targetMode: "cockpit" | "medical-validation"): void {
    if (pickPending) return; // a pick is already in flight — ignore (first-wins)
    pickPending = true;
    void pickCelForPanel().then(
      (cel) => {
        pickPending = false;
        if (cel) openPanel(targetMode, cel);
      },
      (e) => {
        pickPending = false;
        console.warn(`[crl.cockpit] pick failed: ${e instanceof Error ? e.message : e}`);
      },
    );
  }

  const showCmd = vscode.commands.registerCommand("crl.cockpit.show", () => runShow("cockpit"));
  const showMedicalValidationCmd = vscode.commands.registerCommand("crl.medicalValidation.show", () =>
    runShow("medical-validation"),
  );

  function applyPrimary(next: PrimaryPane): void {
    for (const pane of PANES) coord.clearPending(pane); // drop reveals queued under the old primary
    dispatch({ type: "setPrimary", primary: next }); // clears selection + refreshes the navigator
    clearAllHighlights(); // setPrimary emits no reveals → drop the now-orphaned highlights
    updateNavMessage();
    if (currentCel)
      void vscode.workspace
        .getConfiguration(configSection(mode), vscode.Uri.file(currentCel))
        .update("primary", next) // most-specific writable scope (workspace if open, else global)
        .then(undefined, (e) => console.warn(`[crl.cockpit] could not persist primary: ${e instanceof Error ? e.message : e}`));
  }

  /** Apply a failed-criteria mode change (#173 T3): persist to config; the onDidChangeConfiguration branch is the SINGLE
   *  re-drive path (so a manual settings edit behaves identically to the segmented toggle). */
  function applyFailedCriteriaMode(next: "blocking" | "all"): void {
    if (next === failedCriteriaMode || !currentCel) {
      // no-op (or persisted but unchanged) — still refresh the toggle chrome so the active button reflects the click.
      renderTreeChrome();
      return;
    }
    // Target-less update = most-specific writable scope (Workspace if a workspace/folder is open, else Global) — the
    // SAME rule the existing `primary`/`showKeys` writes use, so the cockpit + scenarioRunner (same window, same
    // workspace state) resolve to the SAME target and the shared-sync onDidChangeConfiguration event fires consistently.
    void vscode.workspace
      .getConfiguration("crl.cockpit", vscode.Uri.file(currentCel))
      .update("failedCriteriaMode", next)
      .then(undefined, (e) =>
        console.warn(`[crl.cockpit] could not persist failedCriteriaMode: ${e instanceof Error ? e.message : e}`),
      );
  }

  /** Re-render the chrome + re-drive the peek for the current selection under the new mode (the live apply path). */
  function applyFailedCriteriaModeLive(next: "blocking" | "all"): void {
    failedCriteriaMode = next;
    driveFailedCriteriaPeek(); // recompute the overlay + gaps for the selected case in the new mode (renders chrome)
  }

  /** disc 164: apply a diverter-overlay on/off change — persist to config; the onDidChangeConfiguration branch is the
   *  SINGLE live re-drive path (a settings.json edit behaves identically to the tree-chrome toggle). Mirrors applyFailedCriteriaMode. */
  function applyShowDetails(next: boolean): void {
    if (next === showDetails || !currentCel) {
      renderTreeChrome(); // unchanged (or no cel) — still refresh the chrome so the active button reflects the click
      return;
    }
    void vscode.workspace
      .getConfiguration("crl.cockpit", vscode.Uri.file(currentCel))
      .update("showDetails", next)
      .then(undefined, (e) =>
        console.warn(`[crl.cockpit] could not persist showDetails: ${e instanceof Error ? e.message : e}`),
      );
  }

  /** Re-render the chrome + paint/clear the diverter overlay for the current selection under the new flag (the live path). */
  function applyShowDetailsLive(next: boolean): void {
    showDetails = next;
    driveDiverters(); // paint (on) or clear (off) the overlay for the current selection
    renderTreeChrome(); // refresh the toggle's active button
  }

  /** Open the .crl source for a gap criterion's own location (disc 158 §Gap — the honest fallback when the exact CRL row
   *  couldn't be re-rooted). Uses the VM node's own `source` (an LsLocation), opening the file directly — NOT a faked
   *  source-pane highlight (the cockpit source pane renders provenance units, not raw CRL spans). */
  function openFailedCriterionSource(idx: number): void {
    const gap = fcGaps[idx];
    if (!gap) return;
    const { filePath, range } = gap.source;
    void vscode.window.showTextDocument(vscode.Uri.file(filePath), {
      selection: new vscode.Range(range.startLine, range.startCol, range.endLine, range.endCol),
      viewColumn: vscode.ViewColumn.Active,
    });
  }

  const setPrimaryCmd = vscode.commands.registerCommand("crl.cockpit.setPrimary", () => {
    if (!currentCel || !model) return; // not shown yet → don't switch + persist before the cockpit exists
    // FIX 2: iterate the MODE's navigable primaries (tree is never a primary; MV excludes crl) — so MV offers only
    // Source + the case primary (labeled "Cases", surfaced in the Worklist + read-only CEL panes), cockpit offers Source/CRL/CEL.
    const items: (vscode.QuickPickItem & { value: PrimaryPane })[] = primaryPanesForMode(mode).map((p) => ({
      label: `${primaryLabel(p)}${p === state.primary ? "  •" : ""}`,
      description: p === "source" ? "source units" : p === "crl" ? "CRL decision nodes" : "CEL cases",
      value: p,
    }));
    void vscode.window.showQuickPick(items, { placeHolder: "Navigator primary pane" }).then((pick) => {
      if (pick && pick.value !== state.primary) applyPrimary(pick.value);
    });
  });

  const selectItemCmd = vscode.commands.registerCommand("crl.cockpit.selectItem", (selection: Selection) => {
    lastClicked = undefined; // navigator click → no specific span; open-raw falls back to the unit's earliest range
    dispatch({ type: "select", selection });
  });

  /** Apply a showKeys change WITHOUT a rebuild: re-render the key-bearing panes (all three — source badge landed in
   *  #163-2) + refresh the navigator labels (the prefix is read in getTreeItem). The cached number maps are still valid
   *  (same model). Re-rendering swaps the pane DOM (dropping the selection's `.current`), so re-drive the current
   *  selection afterwards to restore its highlight (queues a reveal that lands when the re-rendered panes re-ack). */
  function applyShowKeys(next: boolean): void {
    showKeys = next;
    for (const pane of PANES) renderPane(pane);
    onNav.fire(undefined); // re-run getTreeItem → label prefixes appear/disappear
    if (state.selection) dispatch({ type: "select", selection: state.selection }); // restore highlights post-re-render
  }

  const toggleKeysCmd = vscode.commands.registerCommand("crl.cockpit.toggleKeys", () => {
    if (!currentCel) return;
    // Read the LIVE persisted value (not the cached render-state `showKeys`) and write its inverse, to the most-specific
    // writable scope (resource-aware like primary/paneOrder). The onConfig handler is the single re-render path (so a
    // manual settings.json edit behaves identically to the button).
    const cfg = vscode.workspace.getConfiguration(configSection(mode), vscode.Uri.file(currentCel));
    const cur = cfg.get<boolean>("showKeys") ?? true;
    void cfg
      .update("showKeys", !cur)
      .then(undefined, (e) => console.warn(`[crl.cockpit] could not persist showKeys: ${e instanceof Error ? e.message : e}`));
  });
  const nextCmd = vscode.commands.registerCommand("crl.cockpit.next", () => {
    lastClicked = undefined;
    dispatch({ type: "next" });
  });
  const prevCmd = vscode.commands.registerCommand("crl.cockpit.prev", () => {
    lastClicked = undefined;
    dispatch({ type: "prev" });
  });

  const openRawCmd = vscode.commands.registerCommand("crl.cockpit.openRaw", () => {
    // Open the anchor .txt at the clicked span's range when it still matches the selection, else the unit's earliest
    // source range. Locus is always from the trusted model / renderer, never a webview payload.
    if (!model || state.selection?.primary !== "source") {
      void vscode.window.showInformationMessage("CRL: select a source unit first.");
      return;
    }
    const unitId = state.selection.unitId;
    const step = model.steps.find((s) => s.unitId === unitId);
    const range = lastClicked?.unitId === unitId ? lastClicked.range : step?.source[0]?.range;
    if (!range) {
      void vscode.window.showInformationMessage("CRL: this unit has no source span.");
      return;
    }
    void vscode.window.showTextDocument(vscode.Uri.file(model.anchor.filePath), {
      selection: new vscode.Range(range.startLine, range.startCol, range.endLine, range.endCol),
      viewColumn: vscode.ViewColumn.Active,
    });
  });

  // Rebuild on a save of the active .cel or a policy .crl (the rendered CRL pane reflects the resolved graph; re-resolve
  // picks up logic edits even before the artifact is re-emitted). The FileSystemWatcher above covers artifact/anchor regen.
  const onSave = vscode.workspace.onDidSaveTextDocument((doc) => {
    if (!currentCel) return;
    const p = doc.uri.fsPath;
    const src = findPolicySrc(currentCel);
    const under = (f: string): boolean => {
      if (!src) return false;
      const r = relative(src, f);
      return r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r);
    };
    if (p === currentCel || (p.toLowerCase().endsWith(".crl") && under(p))) {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(rebuild, 150);
    }
  });

  // Live pane reorder on a paneOrder setting change (debounced — settings.json edits fire per keystroke-settle). Gated on
  // affectsConfiguration + currentCel. (application scope: an edit in another window may only take effect on reload — fine.)
  const onConfig = vscode.workspace.onDidChangeConfiguration((e) => {
    if (!currentCel) return;
    const section = configSection(mode); // the ACTIVE mode's config namespace (paneOrder/showKeys live there)
    if (e.affectsConfiguration(`${section}.paneOrder`)) {
      // FIX 3: capture the mode at event time; inside the debounce, re-derive BOTH section AND spec from the LIVE mode
      // (consistent) and abort if mode or currentCel changed within the 150ms window (a switch could otherwise normalize
      // the new mode's spec against the old section's value, or fire on a closed session).
      const modeAtEvent = mode;
      if (orderDebounce) clearTimeout(orderDebounce);
      orderDebounce = setTimeout(() => {
        if (!currentCel || mode !== modeAtEvent) return; // stale — a mode switch / close superseded this edit
        const liveSection = configSection(mode);
        const uri = vscode.Uri.file(currentCel);
        paneOrder = normalizePaneOrder(vscode.workspace.getConfiguration(liveSection, uri).get("paneOrder"), paneSpecFor(mode));
        reconcilePaneOrder(); // open/close opt-in panes (tree) + re-place columns — not just reorder the already-open set
      }, 150);
    }
    // showKeys (#163): re-render with the at-rest key channel on/off. Separate branch — a showKeys edit must re-render
    // even when paneOrder didn't change. Re-render only (no rebuild — the number maps are unchanged).
    if (e.affectsConfiguration(`${section}.showKeys`)) {
      const next = vscode.workspace.getConfiguration(section, vscode.Uri.file(currentCel)).get<boolean>("showKeys") ?? true;
      if (next !== showKeys) applyShowKeys(next);
    }
    // #173 T3: the All/Blocking failed-criteria toggle. The segmented control persists the config; THIS is the single
    // live re-drive path (so a settings.json edit re-peeks identically to the button). No rebuild — just recompute the
    // overlay/gaps for the current selection in the new mode.
    if (e.affectsConfiguration("crl.cockpit.failedCriteriaMode")) {
      const raw = vscode.workspace.getConfiguration("crl.cockpit", vscode.Uri.file(currentCel)).get<string>("failedCriteriaMode");
      const next = raw === "all" ? "all" : "blocking";
      if (next !== failedCriteriaMode) applyFailedCriteriaModeLive(next);
    }
    // disc 164: the diverter-overlay on/off toggle — same single live re-drive path (a settings.json edit re-paints
    // identically to the tree-chrome toggle).
    if (e.affectsConfiguration("crl.cockpit.showDetails")) {
      const raw = vscode.workspace.getConfiguration("crl.cockpit", vscode.Uri.file(currentCel)).get<boolean>("showDetails") ?? false;
      if (raw !== showDetails) applyShowDetailsLive(raw);
    }
  });

  navView.message = "Open a .cel and run “CRL: Show Knowledge Engineering” or “CRL: Show Medical Validation”.";
  context.subscriptions.push(
    navView,
    showCmd,
    showMedicalValidationCmd,
    setPrimaryCmd,
    toggleKeysCmd,
    selectItemCmd,
    nextCmd,
    prevCmd,
    openRawCmd,
    onSave,
    onConfig,
    {
      dispose: () => {
        watcher?.dispose();
        if (debounce) clearTimeout(debounce); // a pending rebuild/reorder must not fire on disposed panels
        if (orderDebounce) clearTimeout(orderDebounce);
      },
    },
  );
}

/** Hermetic webview shell (strict CSP + nonce). Swaps #root on `render` + acks `ready`; `highlight` (gen-checked) toggles
 *  `.current` + scrolls; clicks on `[data-reveal]` post the opaque key back. No external resources. */
function shellHtml(): string {
  const nonce = randomBytes(16).toString("base64");
  const styleNonce = randomBytes(16).toString("base64");
  const csp = `default-src 'none'; style-src 'nonce-${styleNonce}'; script-src 'nonce-${nonce}';`;
  const style = `body{font:13px var(--vscode-editor-font-family,monospace);color:var(--vscode-foreground);white-space:pre-wrap;padding:8px}
.covered{background:var(--vscode-editor-findMatchHighlightBackground,rgba(100,170,255,.18))}
.uncovered{background:var(--vscode-diffEditor-removedTextBackground,rgba(255,170,80,.22))}
.ignored{opacity:.55}
.current{outline:2px solid var(--vscode-focusBorder,#3794ff);background:var(--vscode-editor-findMatchBackground,rgba(100,170,255,.4))}
[data-reveal]{cursor:pointer}.placeholder{opacity:.6;font-style:italic}
.crl-row{display:flex;align-items:baseline;padding:1px 4px;border-radius:2px}
.crl-row:has(.crl-decision){margin-top:4px}
.crl-node{border-radius:2px}
.crl-decision{font-weight:bold}
.crl-node.when{color:var(--vscode-symbolIcon-keywordForeground,#c586c0)}
.crl-node.otherwise{opacity:.75;font-style:italic}
.crl-node.action{color:var(--vscode-symbolIcon-functionForeground,#dcdcaa)}
.crl-node.use-decision{text-decoration:underline}
.cel-case{display:block;padding:3px 4px;border-radius:2px;border-left:3px solid transparent}
.cel-case.cel-pass{border-left-color:var(--vscode-testing-iconPassed,#73c991)}
.cel-case.cel-fail{border-left-color:var(--vscode-testing-iconFailed,#f14c4c)}
.cel-case.cel-error{border-left-color:var(--vscode-testing-iconErrored,#e2b33e)}
.cel-worklist-header{font-weight:bold;font-size:1.05em;padding:2px 0 6px;margin-bottom:6px;border-bottom:1px solid var(--vscode-panel-border,#454545);position:sticky;top:0;background:var(--vscode-editor-background);z-index:1}
.cel-filter-chips{display:flex;flex-wrap:wrap;gap:4px;padding:2px 0 6px;font-weight:normal;font-size:.85em}
.cel-filter-chip{cursor:pointer;background:var(--vscode-dropdown-background);border:1px solid var(--vscode-dropdown-border,#3c3c3c);border-radius:10px;padding:1px 8px;font-size:inherit;opacity:.5}
.cel-filter-chip.cel-filter-on{opacity:1;border-color:var(--vscode-focusBorder,#3794ff)}
.cel-filter-chip:focus-visible{outline:1px solid var(--vscode-focusBorder,#3794ff);outline-offset:1px}
.cel-filter-count{opacity:.7;font-variant-numeric:tabular-nums;margin-left:1px}
.cel-name{font-weight:bold}.cel-subject{opacity:.7}
.cel-review{margin-right:4px;font-size:.9em;vertical-align:middle;background:var(--vscode-dropdown-background);border:1px solid var(--vscode-dropdown-border,#3c3c3c);color:var(--vscode-dropdown-foreground)}
.cel-review:focus-visible{outline:1px solid var(--vscode-focusBorder,#3794ff);outline-offset:1px}
.cel-review-pass{color:var(--vscode-testing-iconPassed,#73c991)}
.cel-review-fail{color:var(--vscode-testing-iconFailed,#f14c4c)}
.cel-review-pending{color:var(--vscode-charts-yellow,#d29922)}
.cel-review-disabled{opacity:.4}
.cel-rownum{opacity:.5;font-variant-numeric:tabular-nums;user-select:none}
.cel-notes-glyph{cursor:pointer;user-select:none;opacity:.55;margin-left:2px;font-size:.9em}
.cel-notes-glyph.cel-notes-has{opacity:1;color:var(--vscode-textLink-foreground,#3794ff)}
.cel-notes-glyph.cel-notes-open{text-decoration:underline;text-underline-offset:2px}
.cel-notes-glyph:focus-visible{outline:1px solid var(--vscode-focusBorder,#3794ff);outline-offset:1px}
.cel-notes-drawer{position:fixed;top:0;right:0;bottom:0;width:min(340px,66%);z-index:5;display:flex;flex-direction:column;padding:8px;box-sizing:border-box;background:var(--vscode-editorWidget-background,var(--vscode-editor-background));border-left:1px solid var(--vscode-panel-border,#454545);box-shadow:-2px 0 6px rgba(0,0,0,.25);overflow:hidden}
.cel-notes-head{display:flex;align-items:center;justify-content:space-between;font-weight:bold;padding-bottom:6px;border-bottom:1px solid var(--vscode-panel-border,#454545);margin-bottom:6px}
.cel-notes-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cel-notes-close{cursor:pointer;background:none;border:none;color:inherit;font-size:1.1em;padding:0 4px}
.cel-note-list{list-style:none;margin:0;padding:0;overflow-y:auto;flex:1}
.cel-note{padding:5px 0;border-bottom:1px solid var(--vscode-panel-border,#3c3c3c33)}
.cel-note-text{white-space:pre-wrap;word-break:break-word}
.cel-note-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px;font-size:.85em;opacity:.75}
.cel-note-actions{display:flex;gap:4px}
.cel-note-btn,.cel-note-send{cursor:pointer;background:var(--vscode-button-secondaryBackground,#3a3d41);color:var(--vscode-button-secondaryForeground,#fff);border:none;border-radius:2px;padding:1px 8px;font-size:.85em}
.cel-note-send{background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff);align-self:flex-end;margin-top:4px}
.cel-note-empty{opacity:.6;flex:1}
.cel-note-add{display:flex;flex-direction:column;padding-top:6px;border-top:1px solid var(--vscode-panel-border,#454545);margin-top:6px}
.cel-note-input{width:100%;box-sizing:border-box;min-height:48px;resize:vertical;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,#3c3c3c);font-family:inherit;font-size:.95em}
.cel-note-editing{display:flex;flex-direction:column;gap:4px}
.cel-case.cel-ambiguous{opacity:.7;cursor:default}
.cel-ambiguous-marker{color:var(--vscode-charts-yellow,#d29922);font-size:.85em;font-style:italic}
.cel-facts,.cel-produced{opacity:.8;padding-left:14px;font-size:.95em}
.cel-fact{cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px}
.cel-fact:hover{color:var(--vscode-textLink-activeForeground)}
.crl-concept-head{margin-top:10px;padding:2px 4px;font-weight:bold;text-transform:uppercase;font-size:.85em;opacity:.7;border-top:1px solid var(--vscode-panel-border,#454545)}
.crl-lib-head{padding:2px 4px;font-size:.85em;opacity:.6;font-style:italic}
.crl-concept-row{cursor:pointer}
.crl-concept-row:hover{background:var(--vscode-list-hoverBackground)}
.crl-layer{display:inline-block;font-size:.8em;padding:0 4px;margin-right:4px;border-radius:3px;font-weight:bold}
.crl-layer-asserted{background:var(--vscode-charts-blue,#3794ff);color:var(--vscode-editor-background,#1e1e1e)}
.crl-layer-inferred{background:var(--vscode-charts-purple,#c586c0);color:var(--vscode-editor-background,#1e1e1e)}
.crl-mark{display:inline-block;font-size:.75em;padding:0 3px;margin-right:3px;border-radius:3px;opacity:.85;border:1px solid var(--vscode-panel-border,#454545)}
.crl-concept-name{font-weight:bold}
.crl-concept-def{opacity:.7;font-size:.95em}
/* disc 164: the produced-path DIVERTER overlay — the evaluated-false when-criteria that routed the case to its PRODUCED
   disposition (the Adult gate for a not-adult deny). A DISTINCT channel from .current (the produced cluster), the
   failed-criterion peek (empty for a pass), and .this-node (focus). Selection-coupled like .failed-criterion (cleared
   by highlight/clearHighlight, re-marked post-dispatch). NEUTRAL teal DOTTED outline — NOT red (these denies are CORRECT,
   red would read as failure); distinct style (dotted) from the dashed failed-criterion channels. Ordered BEFORE
   .failed-criterion (same outline property + specificity → source order decides) so a real blocker's red wins over a
   diverter's teal on the rare overlap — matching the tree precedence in flowPaneHtml (gpt55 impl review, disc 164). */
.diverter{outline:2px dotted var(--vscode-terminal-ansiCyan,#4ec9b0);outline-offset:1px}
.failed-criterion{outline:2px dashed var(--vscode-editorError-foreground,#f14c4c);outline-offset:1px}
.failed-criterion-preempt{outline:2px dashed var(--vscode-charts-yellow,#d29922);outline-offset:1px}
/* #177 slice 4: the "this node" cross-pane marker on the HTML panes (crl + source). ONLY a left-edge accent BAR (inset
   box-shadow) and NO background (FIX 2 impl review): .current also sets a background, so a background here would override
   .current's find-match wash on a node that is BOTH selected and the focused question (a legal coexistence). box-shadow is
   an independent axis from .current's outline+background and .failed-criterion's dashed outline, so the bar layers cleanly.
   Tree leg in FLOW_STYLE (a stroke); questionnaire leg in QUESTIONNAIRE_STYLE (a bar + wash — that pane never gets .current). */
.this-node{box-shadow:inset 3px 0 0 var(--vscode-charts-orange,#d18616)}
.failed-criterion-preempt::after{content:" ◂ diverted here";color:var(--vscode-charts-yellow,#d29922);font-size:.85em;opacity:.9}
#fcChrome{white-space:normal}
#fcChrome:empty{display:none}
#flagDrawer:empty{display:none}
/* #211 create-flag drawer — a fixed right-side panel (mirrors .cel-notes-drawer), in its OWN #flagDrawer region so a
   tree re-render never wipes it. Column layout; the fields scroll; the actions pin to the bottom. */
.flag-drawer{position:fixed;top:0;right:0;bottom:0;width:min(360px,70%);z-index:6;display:flex;flex-direction:column;gap:6px;padding:8px;box-sizing:border-box;background:var(--vscode-editorWidget-background,var(--vscode-editor-background));border-left:1px solid var(--vscode-panel-border,#454545);box-shadow:-2px 0 6px rgba(0,0,0,.25);overflow-y:auto}
.flag-head{display:flex;align-items:center;justify-content:space-between;font-weight:bold;padding-bottom:6px;border-bottom:1px solid var(--vscode-panel-border,#454545)}
.flag-title{overflow:hidden;text-overflow:ellipsis;white-space:normal}
.flag-close{cursor:pointer;background:none;border:none;color:inherit;font-size:1.1em;padding:0 4px}
.flag-row{display:flex;align-items:center;gap:6px}
.flag-col{display:flex;flex-direction:column;gap:2px;flex:1;min-height:60px}
.flag-label{opacity:.75;font-size:.85em;min-width:64px}
.flag-fieldgroup{display:flex;flex-direction:column;gap:4px}
.flag-fieldgroup[hidden]{display:none}
.flag-drawer input,.flag-drawer select,.flag-drawer textarea{width:100%;box-sizing:border-box;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,#3c3c3c);font-family:inherit;font-size:.95em}
.flag-drawer textarea{min-height:56px;resize:vertical;flex:1}
.flag-drawer select{background:var(--vscode-dropdown-background);color:var(--vscode-dropdown-foreground);border-color:var(--vscode-dropdown-border,#3c3c3c)}
.flag-actions{display:flex;justify-content:flex-end;gap:6px;padding-top:6px;border-top:1px solid var(--vscode-panel-border,#454545)}
.flag-cancel,.flag-insert{cursor:pointer;border:none;border-radius:2px;padding:2px 10px;font-size:.9em}
.flag-cancel{background:var(--vscode-button-secondaryBackground,#3a3d41);color:var(--vscode-button-secondaryForeground,#fff)}
.flag-insert{background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff)}
.fc-toggle{display:flex;align-items:center;gap:4px;padding:4px 2px 6px;font-size:.85em}
.fc-toggle-label{opacity:.7;margin-right:2px}
.fc-toggle-btn{font:inherit;cursor:pointer;padding:1px 8px;border:1px solid var(--vscode-panel-border,#454545);background:var(--vscode-editorWidget-background,#252526);color:var(--vscode-foreground)}
.fc-toggle-btn.fc-active{background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff);border-color:var(--vscode-button-background,#0e639c)}
.fc-gaps{margin:0 0 6px;padding:4px 6px;border-left:3px solid var(--vscode-editorError-foreground,#f14c4c);background:var(--vscode-inputValidation-warningBackground,rgba(255,170,80,.12));font-size:.85em}
.fc-gaps-disabled{opacity:.85;font-style:italic}
.fc-gaps-head{opacity:.8;margin-bottom:2px}
.fc-gap-row{cursor:pointer;padding:1px 2px}
.fc-gap-row:hover{background:var(--vscode-list-hoverBackground)}
.fc-gap-open{text-decoration:underline;opacity:.85;margin-left:4px}
.mv-progress{padding:4px 2px 2px;font-size:.85em;opacity:.85}
.mv-progress-done{color:var(--vscode-testing-iconPassed,var(--vscode-charts-green,#89d185));opacity:1;font-weight:bold}
/* #203 Todo 4: the review-flag readout (the flags half of the MV gate) — all clickable (→ the flag list). */
.mv-flags{padding:2px 2px 4px;font-size:.85em;cursor:pointer}
.mv-flags-open{color:var(--vscode-testing-iconQueued,var(--vscode-charts-yellow,#cca700));font-weight:bold}
.mv-flags-clear{color:var(--vscode-testing-iconPassed,var(--vscode-charts-green,#89d185));opacity:.9}
.mv-flags-error{color:var(--vscode-testing-iconErrored,var(--vscode-charts-red,#f14c4c));font-weight:bold}
.mv-flags:hover{text-decoration:underline}
${CORR_STYLE}${FLOW_STYLE}${QUESTIONNAIRE_STYLE}`;
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<style nonce="${styleNonce}">${style}</style></head><body><div id="fcChrome"></div><div id="root"></div><div id="flagDrawer"></div>` +
    `<script nonce="${nonce}">` +
    COCKPIT_WEBVIEW_SCRIPT +
    `</script></body></html>`
  );
}

/** The cockpit/MV webview SCRIPT BODY — extracted as a pure, vscode-free, nonce-free string so the channel invariants are
 *  string-testable (FIX 2, gpt55 impl review). Nothing here references the nonce/CSP (those live in the shellHtml wrapper),
 *  so the const is byte-identical to the inlined script that preceded it. The central #156-slice-5 invariant locked by the
 *  test: the selection handlers (highlight/clearHighlight) never call clrRO() (the review overlay survives selection), and
 *  the markReviewOverlay handler paints error-over-pass (skips .review-pass for ids in the error set) + the disjoint
 *  .review-fail/.review-pending sets + the all-pass .leaf-allpass badge (#210). */
export const COCKPIT_WEBVIEW_SCRIPT =
  `const v=acquireVsCodeApi();const root=document.getElementById('root');const fcc=document.getElementById('fcChrome');const fld=document.getElementById('flagDrawer');let gen=-1;` +
  // #211: show ONLY the selected flag tag's field group (client-side; no host round-trip). Called after the drawer is
  // injected and on a tag-select change. Safe no-op when the drawer is empty.
  `const aff=()=>{const ts=fld.querySelector('[data-flag-tag]');if(!ts)return;const tg=ts.value;for(const g of fld.querySelectorAll('[data-flag-field-for]')){g.hidden=g.getAttribute('data-flag-field-for')!==tg;}};` +
  `const clrFC=()=>{for(const el of root.querySelectorAll('.failed-criterion,.failed-criterion-preempt')){el.classList.remove('failed-criterion');el.classList.remove('failed-criterion-preempt');}};` +
  // #156 slice 5 / #210: the review-overlay clear. DISTINCT from clrFC — called ONLY by mark/clearReviewOverlay, NEVER by the
  // selection channel (highlight/clearHighlight), so the verdict fills SURVIVE selection (the survives-selection invariant).
  `const clrRO=()=>{for(const el of root.querySelectorAll('.review-pass,.review-fail,.review-pending,.error-node,.leaf-allpass')){el.classList.remove('review-pass');el.classList.remove('review-fail');el.classList.remove('review-pending');el.classList.remove('error-node');el.classList.remove('leaf-allpass');}};` +
  // #177 slice 4: the "this node" marker clear. DISTINCT from clrFC/clrRO — called ONLY by mark/clearThisNode, NEVER by the
  // selection channel (highlight/clearHighlight), so `.this-node` SURVIVES a cockpit reveal (it tracks the focused QUESTION,
  // not the selection — it moves only when the case or the question changes, the done-overlay lifecycle).
  `const clrTN=()=>{for(const el of root.querySelectorAll('.this-node'))el.classList.remove('this-node');};` +
  // disc 164: the produced-path diverter clear. Like clrFC (and UNLIKE clrTN/clrRO) it IS called by the selection channel
  // (highlight/clearHighlight) — the diverters are per-selected-case, so they clear on a reveal and the same-selection
  // markDiverters (a later post-dispatch post) re-applies; the NEXT selection's reveal drops them.
  `const clrDV=()=>{for(const el of root.querySelectorAll('.diverter'))el.classList.remove('diverter');};` +
  // #187 Todo 5: the per-case leaf VERDICT clear. Like clrRO/clrTN (and UNLIKE clrFC/clrDV) it is called ONLY by
  // mark/clearLeaves, NEVER by the selection REVEAL (highlight/clearHighlight) — so a leaf's tick survives a reveal within
  // the focused case. (The host re-drives per focused case: it clears in lockstep with the questionnaire when no case is
  // focused — the this-node/diverter lifecycle, driven by focusedScenario — NOT the case-independent done-overlay one.)
  `const clrLeaf=()=>{for(const el of root.querySelectorAll('.flow-leaf-yes,.flow-leaf-no')){el.classList.remove('flow-leaf-yes');el.classList.remove('flow-leaf-no');}};` +
  `window.addEventListener('message',(e)=>{const m=e.data;` +
  // #156 notes: PRESERVE in-progress note drafts across the innerHTML swap. An unrelated re-render (a verdict change on
  // another row re-renders the whole cel pane) would otherwise wipe a half-typed note/edit. Snapshot every [data-note-draft]
  // textarea by its key (+ the focused one's caret), swap, then restore matching textareas. A SENT note doesn't reappear
  // because the click handler cleared its textarea BEFORE this render arrived (snapshot already empty).
  `if(m.type==='render'){var _d={},_a=null,_s=0,_e=0;` +
  `for(const ta of root.querySelectorAll('textarea[data-note-draft]')){const k=ta.getAttribute('data-note-draft');_d[k]=ta.value;if(ta===document.activeElement){_a=k;_s=ta.selectionStart;_e=ta.selectionEnd;}}` +
  // #217: LIVE mode signal — a cockpit↔MV retarget doesn't rebuild the shell HTML, so a static <body data-mode> would go
  // stale; every render carries the current mode and stamps it here. The right-click contextmenu gate reads it (host stays
  // authoritative — a webview that hasn't re-rendered since a retarget still gates as its last mode, but the host re-checks).
  `gen=m.gen;root.innerHTML=m.html;fcc.innerHTML='';if(m.mode)document.body.dataset.mode=m.mode;` +
  `for(const ta of root.querySelectorAll('textarea[data-note-draft]')){const k=ta.getAttribute('data-note-draft');if(Object.prototype.hasOwnProperty.call(_d,k)){ta.value=_d[k];if(k===_a){ta.focus();try{ta.setSelectionRange(_s,_e);}catch(_x){}}}}` +
  `v.postMessage({type:'ready',gen:m.gen,indexVersion:m.indexVersion});}` +
  // The at-rest selection channel (.current). Clearing/applying it ALSO wipes the failed-criterion overlay — so the
  // NEXT engine reveal (a new selection / clear) drops the overlay; the SAME selection's failed-criteria mark arrives
  // AFTER this message (a later post) and so survives (#173 overlay lifecycle, disc 159). NEVER calls clrRO (#156 slice 5).
  `else if(m.type==='clearHighlight'){for(const el of root.querySelectorAll('.current'))el.classList.remove('current');clrFC();clrDV();}` +
  `else if(m.type==='highlight'){if(m.gen!==gen)return;` + // drop a reveal aimed at a superseded render
  `for(const el of root.querySelectorAll('.current'))el.classList.remove('current');clrFC();clrDV();` +
  `for(const id of m.segmentIds){const el=document.getElementById(id);if(el)el.classList.add('current');}` +
  // #219: scroll ONLY when scrollTo is present — a same-pane click omits it so the clicked pane keeps its viewport.
  `if(m.scrollTo){const t=document.getElementById(m.scrollTo);if(t)t.scrollIntoView({block:'center'});}}` +
  // The DISTINCT failed-criterion overlay channel (.failed-criterion). Gen-guarded like .current; replaces the prior
  // overlay (clear-then-set). Does NOT touch .current — the two channels coexist.
  `else if(m.type==='clearFailedCriteria'){clrFC();}` +
  `else if(m.type==='markFailedCriteria'){if(m.gen!==gen)return;clrFC();` +
  // Two channels: blockerIds → red `.failed-criterion`; preemptIds → amber `.failed-criterion-preempt` (a satisfied
  // diverting sibling, honestly distinct from a real blocker — disc 160 FIX 3).
  `for(const id of (m.blockerIds||[])){const el=document.getElementById(id);if(el)el.classList.add('failed-criterion');}` +
  `for(const id of (m.preemptIds||[])){const el=document.getElementById(id);if(el)el.classList.add('failed-criterion-preempt');}` +
  // #219: scroll ONLY when scrollTo is present — a same-pane click suppresses it so the clicked pane keeps its viewport.
  `if(m.scrollTo){const t=document.getElementById(m.scrollTo);if(t)t.scrollIntoView({block:'center'});}}` +
  // #156 slice 5 / #210: the PERSISTENT Medical Validation VERDICT overlay — a SEPARATE channel from .current and
  // .failed-criterion. CRITICAL: it is mutated ONLY here (mark/clearReviewOverlay), NEVER by highlight/clearHighlight/
  // clrFC — so it SURVIVES selection changes (the clinician's verdict painting never blinks off as they click around).
  // mark replaces the prior overlay (clear-then-set, gen-guarded like the others). The host already resolved each node to
  // ONE verdict (pass/fail/pending are DISJOINT); error (⊆ pass, a pass-verdict node whose run errored) paints .error-node
  // INSTEAD of .review-pass (error-over-pass). No scroll (at-rest paint).
  `else if(m.type==='clearReviewOverlay'){clrRO();}` +
  `else if(m.type==='markReviewOverlay'){if(m.gen!==gen)return;clrRO();` +
  `const errSet=new Set(m.error||[]);` +
  `for(const id of errSet){const el=document.getElementById(id);if(el)el.classList.add('error-node');}` +
  `for(const id of (m.pass||[])){if(errSet.has(id))continue;const el=document.getElementById(id);if(el)el.classList.add('review-pass');}` +
  `for(const id of (m.fail||[])){const el=document.getElementById(id);if(el)el.classList.add('review-fail');}` +
  `for(const id of (m.pending||[])){const el=document.getElementById(id);if(el)el.classList.add('review-pending');}` +
  // #210 all-pass ✓ badge: a 5th DISJOINT-purpose set on the same channel — the disposition leaves whose EVERY producing
  // route is pass. `.leaf-allpass` reveals a hidden green+white ✓ grandchild (CSS). Persistent + survives selection like the rest.
  `for(const id of (m.allPassLeaves||[])){const el=document.getElementById(id);if(el)el.classList.add('leaf-allpass');}}` +
  // #203 Todo 4b Slice A: the per-node flag-badge channel — clear `.has-flag` from every flaggable node then set it on the
  // flagged gids (clear-then-set, gen-guarded like the overlays; a class-toggle preserves the painted verdict overlays).
  `else if(m.type==='flagBadges'){if(m.gen!==gen)return;` +
  `for(const id of (m.flaggableGids||[])){const el=document.getElementById(id);if(el)el.classList.remove('has-flag');}` +
  `for(const id of (m.gids||[])){const el=document.getElementById(id);if(el)el.classList.add('has-flag');}` +
  // the start-node COUNT badge (chrome mirror): set its text (`⚑ N` / `✓` / `⚠`) + `.has-startflag`, or hide it when clean.
  `var sg=m.startNodeGid?document.getElementById(m.startNodeGid):null;` +
  `if(sg){var st=sg.querySelector('.flow-startflag-text');` +
  `var label=m.flagError?'⚠':(m.open>0?'⚑ '+m.open:(m.resolved>0?'✓':''));` +
  // GAP 3: N flags couldn't be placed (an orphaned/moved occurrence) → show it on the badge (title + a suffix) so a
  // re-homed flag is visible, not a silent count. The flag list labels which are unplaced.
  `if(m.unplaced>0){label+=' · '+m.unplaced+'⚠';}` +
  `var tt=sg.querySelector('title');if(tt)tt.textContent=(m.unplaced>0?m.unplaced+' flag(s) couldn\\'t be placed (target moved/removed) — ':'')+'open review flags — click to review';` +
  `if(st)st.textContent=label;sg.classList.toggle('has-startflag',label!=='');}}` +
  // #177 slice 4: the "this node" cross-pane marker — a SEPARATE channel from .current, .failed-criterion AND the review
  // overlay. Like the review overlay it is mutated ONLY here (mark/clearThisNode), NEVER by highlight/clearHighlight/clrFC/
  // clrRO — so it SURVIVES a cockpit reveal (the focused question's node stays marked as the clinician clicks around). mark
  // replaces the prior marker (clear-then-set, gen-guarded like the others); clear is ungated (a class-strip is always safe).
  // No scroll on the steady mark — the focused question doesn't yank the panes around (slice-5 nav can revisit scroll).
  `else if(m.type==='clearThisNode'){clrTN();}` +
  `else if(m.type==='markThisNode'){if(m.gen!==gen)return;clrTN();` +
  `for(const id of (m.segmentIds||[])){const el=document.getElementById(id);if(el)el.classList.add('this-node');}}` +
  // disc 164: the produced-path diverter channel (.diverter). Gen-guarded clear-then-set like the others; coexists with
  // .current/.failed-criterion/.this-node/the review overlay (independent class). No scroll (the .current reveal already
  // scrolls to the produced cluster; the diverter is a secondary rationale highlight, must not yank the pane).
  `else if(m.type==='clearDiverters'){clrDV();}` +
  `else if(m.type==='markDiverters'){if(m.gen!==gen)return;clrDV();` +
  `for(const id of (m.segmentIds||[])){const el=document.getElementById(id);if(el)el.classList.add('diverter');}}` +
  // #187 Todo 5/Todo 3: the PERSISTENT per-case leaf channel (.flow-leaf-yes/.flow-leaf-no on a leaf <g>; CSS reveals the
  // on-path RING on `-yes`, nothing on `-no`). A SEPARATE channel from all above. Like the review overlay + this-node it is
  // mutated ONLY here (mark/clearLeaves), NEVER by highlight/clearHighlight/clrFC/clrDV — so the leaf marks SURVIVE a reveal.
  // CRITICAL: clrLeaf() FIRST (clear-then-set, gen-guarded) — else a leaf answered `yes` for case A keeps its ring under
  // case B when B has no conceptTruth row for it (absent ⇒ no mark). yes/no are mutually exclusive per leaf. No scroll.
  `else if(m.type==='clearLeaves'){clrLeaf();}` +
  `else if(m.type==='markLeaves'){if(m.gen!==gen)return;clrLeaf();` +
  `for(const id of (m.yesIds||[])){const el=document.getElementById(id);if(el)el.classList.add('flow-leaf-yes');}` +
  `for(const id of (m.noIds||[])){const el=document.getElementById(id);if(el)el.classList.add('flow-leaf-no');}}` +
  // The tree-pane chrome (toggle + gap banner) — injected ABOVE #root so it never clobbers the flowchart.
  `else if(m.type==='fcChrome'){fcc.innerHTML=m.html;}` +
  // #211: the create-flag drawer's OWN region — set (or clear with '') its html. The render handler never touches it, so a
  // same-policy tree rebuild leaves the drawer + the user's typed text intact. aff() shows the selected tag's fields.
  `else if(m.type==='flagDrawer'){fld.innerHTML=m.html;if(m.html)aff();}});` +
  // #156 slice 4: a worklist review <select> sits INSIDE the .cel-case block (itself a data-reveal target). A CLICK on the
  // select must open the native dropdown WITHOUT selecting the case, so we stopPropagation (block the reveal) but do NOT
  // preventDefault (let the dropdown open). The state change rides the separate 'change' listener below. A DISABLED select
  // carries no data-worklist-select → falls through to the reveal path harmlessly (its parent case isn't a reveal target).
  `root.addEventListener('click',(e)=>{const ws=e.target.closest&&e.target.closest('[data-worklist-select]');` +
  `if(ws){e.stopPropagation();return;}` +
  // #156 notes: the glyph + drawer controls. ALL intercepted BEFORE [data-reveal] (the glyph sits inside a .cel-case, a
  // reveal target — stopPropagation blocks the case-select; the drawer is pane-level so it has no reveal ancestor anyway).
  // Send/Save read the associated textarea SCOPED to the clicked control's container (never a global querySelector), then
  // CLEAR the add textarea so the post-render draft-restore sees it empty (a sent note doesn't reappear; an interrupted
  // draft, never cleared, survives). Clicking the textarea itself just stops the reveal (no message; typing is local).
  `const ng=e.target.closest&&e.target.closest('[data-notes-toggle]');` +
  `if(ng){e.preventDefault();e.stopPropagation();v.postMessage({type:'notesToggle',key:ng.getAttribute('data-notes-toggle')});return;}` +
  `const nc=e.target.closest&&e.target.closest('[data-notes-close]');` +
  `if(nc){e.preventDefault();e.stopPropagation();v.postMessage({type:'notesClose'});return;}` +
  `const na=e.target.closest&&e.target.closest('[data-note-add]');` +
  `if(na){e.preventDefault();e.stopPropagation();const box=na.closest('.cel-note-add');const ta=box&&box.querySelector('[data-note-draft]');const val=ta?ta.value:'';v.postMessage({type:'noteAdd',key:na.getAttribute('data-note-add'),value:val});if(ta)ta.value='';return;}` +
  `const nsv=e.target.closest&&e.target.closest('[data-note-save]');` +
  `if(nsv){e.preventDefault();e.stopPropagation();const box=nsv.closest('.cel-note-editing');const ta=box&&box.querySelector('[data-note-draft]');v.postMessage({type:'noteEditSave',noteId:nsv.getAttribute('data-note-save'),value:ta?ta.value:''});return;}` +
  `const ne=e.target.closest&&e.target.closest('[data-note-edit]');` +
  `if(ne){e.preventDefault();e.stopPropagation();v.postMessage({type:'noteEditStart',noteId:ne.getAttribute('data-note-edit')});return;}` +
  `const ncan=e.target.closest&&e.target.closest('[data-note-cancel]');` +
  `if(ncan){e.preventDefault();e.stopPropagation();v.postMessage({type:'noteEditCancel'});return;}` +
  `const nd=e.target.closest&&e.target.closest('[data-note-delete]');` +
  `if(nd){e.preventDefault();e.stopPropagation();v.postMessage({type:'noteDelete',noteId:nd.getAttribute('data-note-delete')});return;}` +
  `const nt=e.target.closest&&e.target.closest('[data-note-draft]');` +
  `if(nt){e.stopPropagation();return;}` +
  // #177 slice 5: the questionnaire pane's prev/next sub-nav (it renders INTO #root, so it shares this click delegation).
  // A [data-qnav] button posts the opaque direction; the host moves currentQuestionIndex, re-renders + re-drives the marker.
  // Intercepted before [data-reveal] (the questionnaire is read-only — its buttons never select). A disabled button still
  // carries data-qnav, so guard on .disabled to make an edge click a no-op (the host clamps too, but skip the round-trip).
  `const qn=e.target.closest&&e.target.closest('[data-qnav]');` +
  `if(qn){e.preventDefault();e.stopPropagation();if(!qn.disabled)v.postMessage({type:'questionNav',dir:qn.getAttribute('data-qnav')});return;}` +
  // #214: a verdict filter chip (native <button>, so Enter/Space fire a click for free). Intercepted BEFORE [data-reveal]
  // ("controls first"); the chip lives in the worklist header (no reveal ancestor), so this just posts the toggle + returns.
  `const wf=e.target.closest&&e.target.closest('[data-worklist-filter]');` +
  `if(wf){e.preventDefault();e.stopPropagation();v.postMessage({type:'worklistFilterToggle',state:wf.getAttribute('data-worklist-filter')});return;}` +
  // #203 Todo 4b Slice A: a click on a per-node ⚑ flag badge — intercepted BEFORE [data-reveal] ("controls first") since
  // the badge <g> is nested inside the row's data-reveal; opens the flag list (the same channel as the chrome badge).
  `const fb=e.target.closest&&e.target.closest('[data-mv-flag-badge]');` +
  `if(fb){e.preventDefault();e.stopPropagation();v.postMessage({type:'mvFlags'});return;}` +
  `const t=e.target.closest&&e.target.closest('[data-reveal]');` +
  `if(t)v.postMessage({type:'reveal',key:t.getAttribute('data-reveal')});});` +
  // #217: RIGHT-CLICK a flow node → the host opens a verdict quick-pick for the case(s) whose fired path runs through it.
  // Gate: MV mode (live `data-mode`) + inside `.flow-svg` (the FLOW/tree pane ONLY — the script is shared by every pane, so
  // without this we'd `preventDefault` the native menu in source/cel/worklist too) + a `.flow-row[data-reveal]` (a rendered
  // structure node; the guard tab is `.flow-guard-tab` NOT a `.flow-row`, so `closest('.flow-row[data-reveal]')` on a tab
  // resolves to the parent action's key — sets the guarded action's verdict, acceptable). We post the OPAQUE render key; the
  // host normalizes it to the semantic node key. The host is AUTHORITATIVE (re-checks mode/maps) and emits a status note on
  // any no-op — since we've already suppressed the native menu, a silent host return would be a dead right-click.
  `root.addEventListener('contextmenu',(e)=>{` +
  `if(document.body.dataset.mode!=='medical-validation')return;` +
  `if(!(e.target.closest&&e.target.closest('.flow-svg')))return;` +
  `const g=e.target.closest('.flow-row[data-reveal]');if(!g)return;` +
  `e.preventDefault();e.stopPropagation();v.postMessage({type:'nodeVerdictMenu',key:g.getAttribute('data-reveal')});});` +
  // #156 slice 4: the worklist dropdown's 'change' posts the opaque key + the chosen value; the host validates the value
  // is a known ReviewState and persists it. A native <select> is keyboard- + screen-reader-operable, so no hand-rolled
  // keydown handling is needed. stopPropagation keeps the change from bubbling into any ancestor listener.
  `root.addEventListener('change',(e)=>{const ws=e.target.closest&&e.target.closest('[data-worklist-select]');` +
  `if(ws){e.stopPropagation();v.postMessage({type:'worklistSet',key:ws.getAttribute('data-worklist-select'),value:ws.value});}});` +
  // Chrome clicks: the All/Blocking toggle (data-fc-mode) + a gap row's Open CRL source (data-fc-gap).
  `fcc.addEventListener('click',(e)=>{const mode=e.target.closest&&e.target.closest('[data-fc-mode]');` +
  `if(mode){v.postMessage({type:'fcMode',mode:mode.getAttribute('data-fc-mode')});return;}` +
  // disc 164: the produced-path diverter overlay on/off toggle (MV chrome).
  `const dv=e.target.closest&&e.target.closest('[data-diverter-toggle]');` +
  `if(dv){v.postMessage({type:'diverterToggle',on:dv.getAttribute('data-diverter-toggle')});return;}` +
  `const gap=e.target.closest&&e.target.closest('[data-fc-gap]');` +
  `if(gap){v.postMessage({type:'fcOpenSource',idx:Number(gap.getAttribute('data-fc-gap'))});return;}` +
  // #203 Todo 4: the flag badge / mvComplete gate → open the review-flag list.
  `const fl=e.target.closest&&e.target.closest('[data-mv-flags]');` +
  `if(fl)v.postMessage({type:'mvFlags'});});` +
  // #211: the create-flag drawer's controls (its OWN region → a separate listener). Close/Cancel drops the draft; Insert
  // collects the tag + summary + stub + the VISIBLE tag's field values and posts them (the host uses the captured target).
  `fld.addEventListener('click',(e)=>{` +
  `const cx=e.target.closest&&e.target.closest('[data-flag-close],[data-flag-cancel]');` +
  `if(cx){e.preventDefault();v.postMessage({type:'flagDraftCancel'});return;}` +
  `const ins=e.target.closest&&e.target.closest('[data-flag-insert]');` +
  `if(ins){e.preventDefault();` +
  `const ts=fld.querySelector('[data-flag-tag]');const tg=ts?ts.value:'';` +
  `const su=fld.querySelector('[data-flag-summary]');const st=fld.querySelector('[data-flag-stub]');` +
  // find the SELECTED tag's field group by iterating + comparing (NOT selector interpolation — a tag id with a quote/]
  // would throw a SyntaxError and abort the click; matches aff()'s approach).
  `const fields={};let grp=null;for(const g of fld.querySelectorAll('[data-flag-field-for]')){if(g.getAttribute('data-flag-field-for')===tg){grp=g;break;}}` +
  `if(grp){for(const c of grp.querySelectorAll('[data-flag-field]')){const k=c.getAttribute('data-flag-field');const val=c.value;if(val&&val.trim()!=='')fields[k]=val;}}` +
  `v.postMessage({type:'flagDraftInsert',tag:tg,summary:su?su.value:'',stub:st?st.value:'',fields:fields});return;}` +
  `});` +
  // The tag select's change toggles the visible field group (client-side; no host round-trip).
  `fld.addEventListener('change',(e)=>{const ts=e.target.closest&&e.target.closest('[data-flag-tag]');if(ts){aff();}});`;
