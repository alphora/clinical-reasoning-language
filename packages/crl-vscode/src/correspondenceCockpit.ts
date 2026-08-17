// Correspondence cockpit SHELL (thin vscode) — three-pane viewer C2a (#156).
// Wires the pure cores to VS Code: a CRL activity-bar navigator (TreeView) + three webview panes (Source rendered;
// CRL/CEL placeholders that participate in the reveal protocol). Holds the full ViewerModel; feeds the engine a COMPACT
// CockpitIndex; routes the engine's SEMANTIC reveal effects through the PaneRevealCoordinator → each pane's webview.
// The pure logic lives in correspondenceEngine / paneRevealCoordinator / sourcePaneHtml (all unit-tested);
// this file is the untested integration per the established split. Design: .vibe-tools/discussions/118-c2a-source-spine.md.
import { randomBytes, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";

import {
  buildCockpitModel,
  buildCRL,
  conceptDeclRef,
  criterionGateIdentities,
  flagTags,
  flagLabelOf,
  flagDisplayNameOf,
  flagFieldRulesOf,
  validateFlagFields,
  hasForbiddenGistChars,
  nodeKey,
  topCriterion,
  type CorrespondenceModel,
  type CrlConceptNode,
  type ConceptShapeIndex,
  type CriterionIdentity,
  type DefExprIndex,
  type GuardOutline,
  type CrlDecisionStructure,
  type CrlStructureNode,
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
import { createGithubIssue, getGithubIssue, IssueCreateError, issueCreateErrorLabel, updateGithubIssue } from "./githubIssue";
import { renderFlagDrawer } from "./flagDrawerHtml";
import { renderFlagActionDrawer, type FlagActionField } from "./flagActionDrawerHtml";
import { computeFlagPlacement } from "./flagPlacement";
import { flagCloseEligibility } from "./flagCloseEligibility";
import { countEmbeddedFlags } from "./embeddedFlagDetect"; // #212 S3: the un-migrated-flag safety-net detector (pure)
// #212: the flag store model now lives in core (packages/crl) so the cockpit AND the MCP flag tools share it.
import {
  occurrenceByNodeKey,
  occurrenceKeyValue,
  parseOccurrenceKey,
  isOpen,
  flagStoreDir,
  hasLegacyFlagStore,
  loadFlags as loadStoredFlags,
  saveFlag,
  removeFlag,
  validateAndBuildMvFlagDraft,
  resolveAnchor,
  type OccurrenceRef,
  type MvFlag,
  type AnchorContext,
} from "@smile-digital-health/crl";
import {
  addNote,
  buildReviewPerCase,
  composeSidecar,
  criterionProgress,
  criterionVerdictKey,
  criterionVerdictState,
  deleteNote,
  deriveAllPassLeaves,
  deriveReviewOverlay,
  editNote,
  isReviewState,
  loadSidecar,
  medicalValidationSidecarPath,
  mvComplete,
  renderCriterionChrome,
  renderFlagChrome,
  renderProgressChrome,
  REVIEW_STATES,
  reviewProgress,
  saveSidecar,
  computeCriterionVerdictUpdate,
  setReviewState,
  setAllReviewState,
  unsettledReviewItems,
  reviewGridViewModel,
  applyGridAssignments,
  type BulkVerdictResult,
  type FlagChrome,
  type LiveCriterion,
  type Note,
  type PersistedCriterionVerdict,
  type PersistedReviewState,
  type ReviewItem,
  type ReviewState,
} from "./medicalValidationStore";
import { reviewGridHtml, REVIEW_GRID_DRAWER_STYLE, REVIEW_GRID_DRAWER_SCRIPT } from "./reviewGridHtml";
import { renderCrlPane } from "./crlPaneHtml";
import { collectDispositionLeafKeys, FLOW_STYLE, flowLegendChrome, renderFlowPane } from "./flowPaneHtml";
import { renderFlowSnapshotDocument } from "./flowSnapshotHtml";
import { SnapshotCapture, screenCapturedDom, snapshotFileName } from "./snapshotCapture";
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
import { isConceptHit, isCriterionOccurrenceHit, isCriterionToggleHit, isFactHit, isSubQuestionHit, type RevealHit, type WebviewHit } from "./webviewHit";
import {
  caseTokenId,
  cockpitAgentBridge,
  flagTargetId,
  type BeginFlagDrawer,
  type CockpitAppState,
  type FlagDrawerResult,
  type FlagTargetView,
  type OpenFlagDrawerArgs,
  type ReviewContextCase,
  type ReviewContextFlag,
  type ReviewContextIssue,
  type ReviewContextResult,
  type SelectedCaseView,
  type SetVerdictArgs,
  type SetVerdictResult,
  type SubmitFlagResult,
} from "./cockpitAgentBridge";
import type { CancelToken, ElicitationCancelReason, ElicitationOutcome } from "./agentDrivableUi";
import { PaneRevealCoordinator, type SemanticTarget } from "./paneRevealCoordinator";
import { discoverProvenance, findPolicySrc, PANEL_VALIDATION_MODE, policyIdFromSrc } from "./provenanceFindings";
import { resolveLaunchTarget } from "./policyLaunchTarget";
import { flagIssueBody, flagIssueTitle, replaceIssueTypeLine } from "./flagIssueText";
import { caseDisplayName } from "./caseDisplayName";
import { buildViewerModel, type ViewerModel } from "./provenanceViewer";
import { renderSourcePane, type OverlaySpan, type UnitSpan } from "./sourcePaneHtml";

const PANES: Pane[] = ["source", "crl", "cel", "tree", "questionnaire", "fhirQuestionnaire", "worklist"]; // all panes (render/clearPending/reveal fan-out); tree/questionnaire/fhirQuestionnaire/worklist opt-in; MUST stay in lockstep with engine `Pane` (silent-failure list — not compiler-checked; disc 179)
// The panes the navigator can WALK (primary/cycle/config-primary). tree is render+reveal+peek-only, never a primary —
// so it is absent here. Used to build the setPrimary quickpick + guard config-primary against a stray "tree".
const PRIMARY_PANES: PrimaryPane[] = ["source", "crl", "cel"];
// Column slots by position (explicit, not ViewColumn arithmetic). A pane's column = its index among the OPEN panes in
// the user's paneOrder (so hiding a pane never leaves a column gap). SIX slots: since the pane split (disc 179) worklist +
// cel are DISTINCT internal panes, so MV's valid set is up to 6 (worklist, cel, source, tree, questionnaire, crl) — a user
// paneOrder listing all six must get a 6th column instead of piling onto column One via the `?? One` fallback (VS Code
// supports up to 9). The default MV set stays 4 (worklist/source/tree/questionnaire); this only bounds the overflow case.
// NINE slots. MV now has SEVEN panes and defaults to all of them, so a six-slot list left the seventh falling
// back to `?? One` and piling on top of the first pane — reachable on a fresh install, not an edge case.
// Nine is VS Code's own maximum, so this cannot under-provision again as panes are added.
const ORDERED_COLUMNS = [vscode.ViewColumn.One, vscode.ViewColumn.Two, vscode.ViewColumn.Three, vscode.ViewColumn.Four, vscode.ViewColumn.Five, vscode.ViewColumn.Six, vscode.ViewColumn.Seven, vscode.ViewColumn.Eight, vscode.ViewColumn.Nine];
// The two questionnaire panes are named by their SOURCE, which is the whole point of showing both: "CRL
// Questionnaire" is the projection of what the CRL says, "FHIR Questionnaire" is what the emitted artifact
// actually produced via $apply. Naming one of them "$apply" would name the mechanism rather than the thing.
const PANE_TITLE: Record<Pane, string> = { source: "Source", crl: "CRL", cel: "CEL", tree: "Tree", questionnaire: "CRL Questionnaire", fhirQuestionnaire: "FHIR Questionnaire", worklist: "Worklist" };
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
  /** #224 ii.3 Slice 2b / #233 Todo 2a (TREE pane only): the flow render's per-criterion-BOX substrate — {gid,lib,name,
   *  collapsed,bodyConcepts} for each ROOT criterion `when` AND each NON-ROOT `flow-crit-row`. `driveCriterionVerdicts`
   *  maps a model-level verdict (by `{lib,name}` identity) → these gids + posts `.crit-*` (non-root rows are inert in 2a —
   *  see driveCriterionVerdicts); the flag rollup lights a COLLAPSED box. Captured atomically with the anchors; reset each render. */
  criterionOccurrences: { gid: string; lib: string; name: string; collapsed: boolean; bodyConcepts: { lib: string; name: string }[] }[];
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
    mode === "medical-validation" ? `Medical Validation - ${PANE_TITLE[pane]}` : PANE_TITLE[pane];
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
  let guardOutlines: Map<string, GuardOutline> = new Map(); // #224 ii.3 Todo 3 / #242: compound-when guard outlines (Flow pane)
  let criterionIdentities: Map<string, CriterionIdentity> = new Map(); // #233 Todo 2b: canonical criterion inventory (gate/verdict identity source)
  // #(tree-snapshot) Todo 2 — the one-shot host↔webview capture coordinator (the host doesn't hold the tree DOM; it asks the
  // webview for `#root`). Single-flight, settle-once; the pure state machine lives in snapshotCapture.ts.
  const snapshotCapture = new SnapshotCapture();
  let snapshotExporting = false; // command-level single-flight: guards the WHOLE export (capture → dialog → write), so a second toolbar click while the save dialog is open can't stack two dialogs
  // #224 ii.3 Slice 2: nodeKeys of single-criterion `when`s the user has EXPANDED (default: all collapsed). Ephemeral —
  // not persisted (reload → all-collapsed-with-verdict is the desired steady state). NodeKeys are case-independent, so
  // this survives Prev/Next re-renders; reset on doc change like the other render state.
  let expandedGuardWhens: Set<string> = new Set();
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
  // #224 ii.3 Slice 2b — model-level CRITERION verdicts (identity `JSON([lib,name])` → `{state,bodyHash}`), loaded from the
  // SAME sidecar as the other two maps and married by `persistMv` (composeSidecar's 3rd map) so a criterion-verdict change
  // can never wipe case verdicts / notes nor vice-versa. Verdict identity is library-local (a criterion reviewed ONCE across
  // all its occurrences + cases); the live render's `criterionOccurrences` + `guardOutlines` supply the bodyHash for staleness.
  let criterionVerdicts: Record<string, PersistedCriterionVerdict> = {};
  // #211 create-flag drawer — the in-flight flag draft (the resolved target + prefill + the policy identity captured at
  // open), or undefined when the drawer is closed. It lives in a DEDICATED `#flagDrawer` webview region that the render
  // handler never touches, so the drawer + the user's typed text SURVIVE a same-policy tree rebuild; the host clears it
  // (posting an empty region) on retarget / mode reset. `FlagDraftState` is declared with `FlagTargetChoice` below.
  let flagDraft: FlagDraftState | undefined;
  // Flag-ACTION drawer — the read-only "act on one flag" flyout, MUTUALLY EXCLUSIVE with the create drawer (both live in the
  // one `#flagDrawer` region; `postFlagDrawer` is the dispatcher — create wins, else action, else empty). `flag` is the
  // host-captured record the webview's opaque `flagActionResolve/OpenIssue/Close` intents act on (never named by the webview);
  // `ver`/`cel` are the policy identity captured at open (action-time revalidation). Re-found by id from the refreshed
  // `flagsList` after any status write / external store change (`refreshFlagActionDrawer`) — so the drawer never toggles off a
  // stale status snapshot. Cleared alongside `flagDraft` on every lifecycle drop (`clearFlagDraft`).
  let flagActionView: { flag: MvFlag; ver: number; cel: string | undefined } | undefined;
  // Todo 3 (disc 358): the EDIT form — the third `#flagDrawer` content mode (create → edit → view → empty). Carries the flag
  // being edited + the policy `cel` captured at open; NO `ver` (the typed form must SURVIVE a same-policy rebuild — the watcher/
  // refresh must not re-render it, so there's no ver to go stale; Save re-reads by id at write time — accept #1/#10). Mutually
  // exclusive with the other two (opening any clears the rest via the settle choke-point). `flagEditDirty` gates the discard
  // confirm on a switch/close while the form has unsaved edits (the operator's "blocked by lose-changes, if needed").
  let flagEditDraft: { flag: MvFlag; cel: string | undefined; descriptionOnly: boolean } | undefined;
  let flagEditDirty = false;
  let flagActionBusy = false; // single-flight for the drawer's async actions (a rapid 2nd click must not overlap a write / stale open-issue)
  // disc 359/360: request a ONE-TIME scroll of the gold-linked node into view — set ONLY by a genuine drawer OPEN/SWITCH
  // (`openFlagActionView`), consumed by the next `driveFlagNodeHighlight`. A rebuild/ack/refresh re-drive never sets it, so a
  // re-render can't yank the viewport (the impl-review [critical]: gids are gen-prefixed, so a webview set-comparison can't tell
  // an open from a re-render). Off = no scroll.
  let flagHlScrollPending = false;
  // #210 (disc 239) — the AGENT elicitation resolver for a BLOCKING open_flag_drawer. Installed ONLY by beginFlagDrawer;
  // settled EXACTLY ONCE by `settleDrawer` on every terminal (Insert-filed / Cancel / token / retarget / dispose / replace).
  // Idempotent: `settleDrawer` nulls it before resolving, so a Stop racing an Insert can't double-resolve. No-op when a human
  // right-click / autonomous submit opened the drawer (they install no resolver).
  let pendingDrawer: { settle: (o: ElicitationOutcome<FlagDrawerResult>) => void; sub?: vscode.Disposable } | undefined;
  let flagCommitting = false; // #211: an in-flight commit guard — a rapid second Insert must not double-POST / race the write
  let githubAuthDeclined = false; // #211: the user declined the GitHub sign-in this session → don't re-prompt on every flag
  // #210 Todo C — the AGENT flag anchor: the last flag-capable node the user clicked (a WebviewHit, NOT State.selection —
  // MV's `crl` primary is excluded, so a node click resolves to a source/cel selection with the nodeKey discarded). The
  // bridge's getAppState re-derives its flag targets LIVE from this hit; it's cleared on retarget/reset/mode-out/tree-close.
  // `cel` binds it to the policy so a coincidental nodeKey collision in another policy can't resolve it.
  let flagAnchor: { hit: WebviewHit; cel: string | undefined } | undefined;
  let mvSidecarPath: string | undefined;
  // #(bulk-verdict) Todo 5 (disc 366) — the "Review verdicts" bulk grid, now the 4th `#flagDrawer` content mode (was its own
  // `crlReviewGrid` webview tab). `reviewGridSnapshot` is BOTH the mode token (grid mode is active ⟺ it's set) AND the OPEN-TIME
  // capture the host resolves an apply against (the webview is untrusted): the frozen `ReviewItem[]` + the retarget-guard axes
  // (`sidecarPath`/`mode`/`cel`) + `revision` (see `mvRevision`). One authority — the drawer HTML renders FROM the snapshot, so
  // dispatcher render + apply-validation can't diverge. `reviewGridApplying` serialises apply (a 2nd apply must not race the one
  // persist); `reviewGridDirty` mirrors the webview's 0↔≥1 picks so the discard guard knows unsaved picks exist (both DOM-derived
  // there, host-mirrored here). `mvRevision` bumps on EVERY successful `persistMv` (disc 347): if it moved while the grid was open
  // (a worklist/right-click/agent/prior-apply verdict change), the snapshot is stale and apply ABORTS — the fail-closed backstop
  // per-item revalidation can't cover for value-only case changes.
  let reviewGridSnapshot: { items: ReviewItem[]; sidecarPath: string; mode: "medical-validation"; cel: string | undefined; revision: number; epoch: number } | undefined; // openReviewGrid guards MV before capture, so the mode is always the literal
  let reviewGridApplying = false;
  let reviewGridDirty = false;
  // The grid-SESSION id (impl-review [critical]): bumped on every open, stamped into the snapshot + the rendered root's data-epoch,
  // echoed by the webview on every message. `revision` guards against a PERSIST since open; `epoch` distinguishes two same-policy
  // sessions with no persist between (a delayed message from a torn-down session must not act on a later reopen's snapshot).
  let reviewGridEpoch = 0;
  let mvRevision = 0;
  // #203 Todo 4 / #212 S3 — the review-flag surface. `flagsList` = ALL flags (open + resolved) as `MvFlag`s, read from the
  // `medical-validation/flags/` STORE (the single flag home; the S2 dual-read is gone), refreshed in reloadReviewFlags(). `flagStateError`
  // (+ a specific `flagStateNote`) = flag state is UNKNOWN — a corrupt store record, an unreadable `.crl`, OR a still-embedded
  // `.crl` flag the safety net caught → the mvComplete gate conservatively does NOT report complete. `anchorCtx` = the current
  // CRL structure the anchor resolver matches a flag's stored target against (assembled in rebuild). All cleared on retarget/reset.
  let flagsList: MvFlag[] = [];
  // Todo 2 (disc 356): the node ⚑ → its OPEN flags reverse map, keyed by the render GID (gen-prefixed, so a stale-render click's
  // gid can't collide with the current map). REBUILT WHOLESALE every `driveFlagBadges` (never incremental) so it stays in lockstep
  // with the painted per-node badges; each bucket is in `flagsList` (open) order for QuickPick parity with `openFlagList`. A
  // per-node badge click posts `{nodeFlags, gid}`; `openNodeFlags` looks the gid up here (an unknown/stale gid → a no-op note).
  let flagsByGid = new Map<string, MvFlag[]>();
  let flagStateError = false;
  // DISTINCT from flagStateError (which ALSO absorbs `.crl`-parse failures + un-migrated-flag counts): true ONLY when the
  // `medical-validation/flags/` STORE read itself was partial/unreadable (a corrupt record OR a non-ENOENT readdir failure — EACCES/AV lock).
  // The long-lived action drawer uses THIS (not flagStateError) to tell "the open flag's record is momentarily unknown" (keep it,
  // don't close) from "the flag was genuinely deleted" (close) — else an unparseable-`.crl` policy would never close a real deletion.
  let flagStoreWarning = false;
  // #212 S3: the SPECIFIC reason flag state is unknown (e.g. "N un-migrated `.crl` flags — migrate to the store"), so a blocked
  // gate has a real remediation instead of the generic "a source could not be read". Set alongside flagStateError.
  let flagStateNote: string | undefined;
  let anchorCtx: AnchorContext | undefined;
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
  let flagsWatcher: vscode.FileSystemWatcher | undefined; // #212 S2 (I6): the `medical-validation/flags/` store is OUTSIDE the src-scoped watcher
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let flagsDebounce: ReturnType<typeof setTimeout> | undefined;
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
   *  ⚠ CHANGED 2026-08-16: ANY pane can now be disposed here. normalizePaneOrder no longer re-adds "canonical"
   *  panes to an explicit order (the setting is the source of truth), so a user can drop source/CRL/CEL/
   *  worklist/either questionnaire — not just the opt-in tree. Anything here that assumed a pane is always
   *  present must not. */
  const reconcilePaneOrder = (): void => {
    for (const pane of [...views.keys()]) if (!paneOrder.includes(pane)) views.get(pane)?.panel.dispose(); // dispose any dropped pane
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
    // #210 Todo D (disc 241 C1): a REAL focused-case change refreshes the agent's app-state (the "Set verdict" badge + the
    // selected-case chip track the selection). GATED on a CHANGED caseId — `dispatch` also re-runs on same-selection re-drives
    // (applyVerdict's re-select, restore-highlight after a re-render — :2457/:2960/:3128), which must NOT spam the emitter.
    // MV-only (a cel selection is MV-only in practice; guard anyway). `getAppState` reads live state, so no payload here.
    if (mode === "medical-validation" && prevCaseId !== nextCid) cockpitAgentBridge.notifyChanged();
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
        // Either questionnaire pane being open is reason enough to run this hook — they render the same case
        // from different sources (CRL projection vs the emitted artifact) and both must follow the selection.
        paneOpen: views.has("questionnaire") || views.has("fhirQuestionnaire"),
        mode,
      })
    ) {
      currentQuestionIndex = -1; // a new case starts with NO question focused
      renderPane("questionnaire");
      // The $apply pane follows the SAME case selection. Without this it is rendered only by rebuild() — which
      // runs before any case is focused — so it would sit permanently on its "select a case" placeholder while
      // the static questionnaire beside it updated. Its own render-identity guard makes a no-change render a
      // cheap no-op, so re-rendering here cannot churn the mounted form.
      renderPane("fhirQuestionnaire");
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
    // openFlags. `flagStateError` (an unparseable `.crl`) forces the gate open (mvComplete must never silently pass).
    let progress = "";
    if (mode === "medical-validation") {
      const p = reviewProgress(reviewByCaseId, [...scenarioByCaseId.keys()], scenarios?.scenarios.length ?? 0);
      const resolvedCount = flagsList.filter((f) => f.status === "resolved").length;
      const fc: FlagChrome = { open: flagsList.length - resolvedCount, resolved: resolvedCount, error: flagStateError };
      // #224 ii.3 Slice 2b — the THIRD gate half: model-level criterion verdicts. `criterionProgress` tallies the LIVE
      // rendered single-criterion identities (a stale-or-changed pass is NOT a pass); it is "" / inert when the policy has
      // no criteria, so a criterion-free policy's chrome is byte-unchanged. Composed at the DISPLAY level with the other two.
      const cp = criterionProgress(buildLiveCriterionIdentities(), criterionVerdicts);
      progress = mvComplete(p, fc, cp)
        ? `<div class="mv-progress mv-progress-done mv-gate-complete">✓ Medical validation complete</div>`
        : renderProgressChrome(p) + renderFlagChrome(fc) + renderCriterionChrome(cp);
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
    // #(tree-snapshot): the export control lives HERE, in the tree pane's OWN chrome (operator: "in the MV tree, not the
    // [navigator] panel"). A webview PANEL can't take a `view/title` toolbar button, so it's an in-pane button — always
    // visible whenever the tree is open, in both modes (the command gates on a loaded model, not on mode). data-export-snapshot
    // is handled by the fcChrome click delegate → posts `exportSnapshot` → the host command.
    const exportBtn =
      `<div class="fc-toggle fc-export-row"><button class="fc-toggle-btn fc-export" data-export-snapshot ` +
      `title="Export this decision tree as a self-contained HTML file — pan + zoom in any browser, no VS Code">⤓ Export snapshot</button></div>`;
    // #(bulk-verdict) Todo 2b: the bulk "Review verdicts" opener — MV-ONLY (verdicts only exist in MV; the operator scoped the
    // clinical-reviewer surface to the tree chrome, not Ctrl+Shift+P). data-review-verdicts → fcChrome click delegate → command.
    const reviewVerdictsBtn =
      mode === "medical-validation"
        ? `<div class="fc-toggle fc-review-verdicts-row"><button class="fc-toggle-btn fc-review-verdicts" data-review-verdicts ` +
          `title="Set case + criterion verdicts on many rows at once">☑ Review verdicts…</button></div>`
        : "";
    // #218: the color KEY sits AFTER the banner so a transient ⚠ gap alert stays adjacent to the toggles. MV-only (the
    // helper returns "" in cockpit mode — verdict fills only paint in MV, and the operator scoped the legend to MV).
    return progress + toggle + diverterToggle + exportBtn + reviewVerdictsBtn + banner + flowLegendChrome(mode);
  }

  /** Push the current tree-pane chrome (toggle + gap banner) to the tree webview, if open. Does NOT re-render the
   *  flowchart `#root` (so the failed-criterion overlay already painted on the SVG survives). */
  function renderTreeChrome(): void {
    const tree = views.get("tree");
    if (tree) void tree.panel.webview.postMessage({ type: "fcChrome", html: buildTreeChromeHtml() });
  }

  // ── #203 Todo 4 / #212 S3: the review-flag surface ───────────────────────────────────
  // Flags live in the `medical-validation/flags/` STORE (the single home; #212). The cockpit reads them from there, surfaces the count +
  // the mvComplete gate in the tree chrome, and WRITES status open↔resolved back to the `<id>.json` record via `saveFlag`.
  // It still reads the `.crl` text (live-buffer-aware) for authoritative library names + the un-migrated-flag safety net.

  /** Read a policy `.crl`'s text from the LIVE editor buffer when it's open (so an unsaved just-added embedded flag is caught
   *  by the safety-net scan, and library names reflect the buffer), else from disk. Undefined if unreadable. */
  function crlText(filePath: string): string | undefined {
    // Case-insensitive fsPath compare on Windows (drive-letter/casing differences must not make the scan read DISK while the
    // editor holds a newer BUFFER — the safety net + library names must reflect what the author sees).
    const same = (a: string, b: string): boolean => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
    const open = vscode.workspace.textDocuments.find((d) => same(d.uri.fsPath, filePath));
    if (open) return open.getText();
    try {
      return readFileSync(filePath, "utf8");
    } catch {
      return undefined;
    }
  }

  /** (Re)load ALL review flags into `flagsList` (as `MvFlag`s) from the `medical-validation/flags/` STORE — the single flag home (#212 S3:
   *  the S2 dual-read is gone; content is migrated). Also (re)assembles `anchorCtx` and runs the un-migrated-flag SAFETY NET.
   *  `flagStateError` (+ a specific `flagStateNote`) blocks the mvComplete gate when flag state is UNKNOWN — a corrupt store
   *  record, an unreadable `.crl`, OR a still-EMBEDDED `.crl` flag a store-only read would silently ignore. Called from
   *  rebuild() + after a status write-back / create. Still parses each `.crl` (via buildCRL) for AUTHORITATIVE library names
   *  (empty-library-safe) + the safety-net scan — but no longer reads flags from it. */
  function reloadReviewFlags(): void {
    flagsList = [];
    flagStateError = false;
    flagStoreWarning = false;
    flagStateNote = undefined;
    anchorCtx = undefined;
    if (mode !== "medical-validation" || !currentCel) return;
    const src = findPolicySrc(currentCel);
    if (!src) return;
    // ── parse each `.crl`: authoritative library names (anchorCtx) + the un-migrated-flag safety net ──
    const libNames = new Set<string>(); // a library-meta-only library is in NEITHER crlStructure NOR conceptLayer (I1)
    let unmigrated = 0; // still-embedded `.crl` flags a store-only read would silently drop
    let files: string[] = [];
    try {
      files = readdirSync(join(src, "crl")).filter((f) => f.toLowerCase().endsWith(".crl")).sort();
    } catch (e) {
      // A MISSING crl/ dir is legitimately "no flags" (a measure/activities-only policy). An unreadable PRESENT dir → block.
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") flagStateError = true;
    }
    for (const name of files) {
      const text = crlText(join(src, "crl", name)); // live-buffer-aware (an unsaved just-added flag must be detected)
      if (text === undefined) {
        flagStateError = true;
        continue;
      }
      // SAFETY NET: still-embedded `.crl` flags (matched by TAG — status-agnostic, whitespace-flexible, comment-excluding;
      // countEmbeddedFlags is pure + unit-tested) → block the gate so a store-only read never silently ignores them.
      unmigrated += countEmbeddedFlags(text);
      const parsed = buildCRL(text);
      if (!parsed.success || !parsed.result) {
        flagStateError = true;
        continue;
      }
      if (parsed.result.library?.name) libNames.add(parsed.result.library.name);
    }
    if (unmigrated > 0) {
      flagStateError = true;
      flagStateNote = `${unmigrated} un-migrated \`.crl\` flag(s) — migrate to the store`;
    }
    // ── the `medical-validation/flags/` store (the single flag home) ──
    const storeDir = flagStoreDir(currentCel); // undefined when the .cel isn't in a discoverable policy src/ → no store flags, no warning (I8)
    if (storeDir) {
      const loaded = loadStoredFlags(storeDir);
      if (loaded.warning) {
        flagStateError = true; // a corrupt/unreadable store record → flag state partially UNKNOWN → block the gate
        flagStoreWarning = true; // …AND specifically a STORE read problem → the action drawer keeps its record rather than closing it
        flagStateNote = flagStateNote ?? loaded.warning;
      }
      flagsList = loaded.flags;
    }
    // #230 MIGRATION SAFETY NET: records left at the OLD `.crl/flags/` location are NO LONGER READ by this code. If any remain, a
    // hidden OPEN flag would falsely pass mvComplete — so block the gate (exactly like the embedded-flag net above) with a note to
    // migrate AND delete the old dir (the untracked residue keeps dirtying the worktree — the original #230 complaint). Pure +
    // unit-tested; present iff a record remains (incl. resolved — the audit trail still needs moving) or the old store is corrupt.
    // (The MCP write tools additionally REFUSE authoring while this is present — blind-agent split-brain risk; the cockpit relies
    //  on this VISIBLE gate block + note instead of hard-refusing the human's own writes, since the human has the full signal.)
    const legacy = hasLegacyFlagStore(currentCel);
    if (legacy.present) {
      flagStateError = true;
      flagStateNote =
        flagStateNote ??
        (legacy.warning
          ? "unreadable old-location flag store `.crl/flags/` — migrate to `medical-validation/flags/` and delete the old dir"
          : `${legacy.count} old-location flag record(s) in \`.crl/flags/\` — migrate to \`medical-validation/flags/\` and delete the old dir`);
    }
    // ── the anchor context (badge placement + reveal classification match a flag's stored target against the CURRENT structure) ──
    anchorCtx = {
      decisions: crlStructure,
      concepts: conceptLayer.map((c) => ({ name: c.name, lib: c.lib })),
      // I1: union the decision libs + concept libs + the parsed library names, so a library-scope flag whose library has no
      // decisions/concepts in scope still resolves live (its name is in `libraries`).
      libraries: [...new Set([...crlStructure.map((d) => d.lib), ...conceptLayer.map((c) => c.lib), ...libNames])],
    };
  }

  const flagNote = (m: string): void => void vscode.window.setStatusBarMessage(`Medical Validation: ${m}`, 3000);

  /** The QuickPick row for one flag — SHARED by the whole-policy list (`openFlagList`) and the node-filtered list
   *  (`openNodeFlags`) so their labels stay structurally identical (disc 357 [nit]). GAP 3: an occurrence flag shows its node
   *  signature so it reads as a specific node, not the whole decision. (The `✓` arm is dead in the open-only node list; live in
   *  the whole-policy list, which includes resolved flags.) */
  const flagPickItem = (f: MvFlag): { label: string; description: string; flag: MvFlag; iconPath: vscode.ThemeIcon } => {
    const a = f.anchor;
    const resolved = f.status === "resolved";
    return {
      label: `${f.tag}${f.gist ? " — " + f.gist : ""}`,
      description: `${a.scope}:${a.name}${a.occurrenceKey ? " · " + parseOccurrenceKey(a.occurrenceKey).signature : ""} · ${f.status}${f.fields.ref ? " · " + f.fields.ref : ""}`,
      flag: f,
      // disc 359: color the glyph by status — open = charts.orange (the "open" brown/red), resolved = charts.green — matching the
      // drawer's status text. NOTE: a ThemeColor on a QuickPick iconPath is version-dependent (historically tree-item only); if it
      // renders monochrome, the fallback is bundled colored SVGs (a monochrome codicon would be worse than the ⚑/✓ emoji it replaced).
      iconPath: new vscode.ThemeIcon(resolved ? "pass" : "flag", new vscode.ThemeColor(resolved ? "charts.green" : "charts.orange")),
    };
  };

  /** Open the review-flag list (mirrors the verdict quick-pick idiom). Picking a flag opens the read-only ACTION DRAWER (a
   *  right flyout — tree + questionnaire stay in view) and ENDS the list: the drawer, not the list, is the action surface now
   *  (design 354). Until Todo 2's node-filtered entry, a multi-flag policy is list → drawer → badge → list (one extra click per
   *  flag) — a documented, transitional cost. Esc closes the list. */
  async function openFlagList(): Promise<void> {
    if (mode !== "medical-validation") return;
    if (!(await guardDrawerDiscard())) return; // Todo 3/5: browsing to another flag would abandon an in-progress edit OR the grid's picks — confirm first
    const ver = indexVersion; // retarget/rebuild guard: a policy switch while a picker is open must not act on the old policy
    const cel = currentCel;
    if (flagsList.length === 0) return flagNote(flagStateError ? flagStateNote ?? "flag state is unknown (a source could not be read)" : "no review flags");
    if (flagStateNote) flagNote(flagStateNote);
    // Embed the MvFlag on the item (via flagPickItem) so a rebuild that reloads `flagsList` during the pick can't make us act on
    // a different flag at the same position. #212 S3: if the gate is blocked by an un-migrated `.crl` flag, still surface the note.
    const items = flagsList.map(flagPickItem);
    const pick = await vscode.window.showQuickPick(items, { placeHolder: "Review flags — pick one (Esc to close)" });
    if (!pick) return; // Esc — done
    // Post-pick stale guard (design 354): the `showQuickPick` await can span a retarget, so re-validate BEFORE opening the drawer
    // over a now-different policy (the lifecycle clear already fired for the old one and won't fire again).
    if (indexVersion !== ver || currentCel !== cel || mode !== "medical-validation") return flagNote("policy changed — reopen the flags");
    // Re-find by id from the (possibly reloaded) list so the first render is fresh; the drawer re-finds on every action too.
    // Disc 355 [important]: if the watcher deleted it during the pick (a CLEAN store, indexVersion unchanged), don't open a ghost
    // over the dead snapshot — note + return. A store WARNING (state unknown) → keep the snapshot (matches refreshFlagActionDrawer).
    const live = flagsList.find((f) => f.id === pick.flag.id);
    if (!live && !flagStoreWarning) return flagNote("the flag changed on disk — reopen it");
    toggleFlagActionView(live ?? pick.flag, ver, cel); // disc 359: reclicking the same flag closes; a different one switches
  }

  /** Todo 2 (disc 356): the per-node ⚑ badge entry — open the ACTION DRAWER filtered to THIS node's OPEN flags. `gid` is a
   *  host-issued render key (gen-prefixed) looked up in `flagsByGid` — an unknown/stale gid (a click from a torn-down render, or
   *  a forged message) simply isn't in the current map → the empty branch → a no-op note. 1 flag → skip straight to the drawer
   *  (the operator's "skip the list, go to the action UI"); >1 → a filtered QuickPick (the `openFlagList` idiom, scoped) → pick →
   *  drawer. Every open re-finds by id (disc 355: never hand the drawer a stale map snapshot; clean deletion → note; store-warning
   *  → keep). The START-node count pill is a DIFFERENT channel (`mvFlags` → the full list) — untouched. */
  async function openNodeFlags(gid: string): Promise<void> {
    if (mode !== "medical-validation") return;
    if (!(await guardDrawerDiscard())) return; // Todo 3/5: switching to this node's flag would abandon an in-progress edit OR the grid's picks — confirm first
    const ver = indexVersion;
    const cel = currentCel;
    const flags = flagsByGid.get(gid) ?? []; // OPEN-only (driveFlagBadges builds it over `open`) — matches what the badge counts
    if (flags.length === 0) return flagNote("no open flags on this node"); // unknown/stale gid OR a concurrent resolve/delete emptied it
    if (flagStateNote) flagNote(flagStateNote);
    // Re-find by id from the LIVE list so the drawer never opens over a stale map snapshot when a live record exists.
    const openOne = (snap: MvFlag): void => {
      const live = flagsList.find((f) => f.id === snap.id);
      if (!live && !flagStoreWarning) return flagNote("the flag changed on disk — reopen it");
      toggleFlagActionView(live ?? snap, ver, cel); // disc 359: reclicking the same flag closes; a different one switches
    };
    if (flags.length === 1) return openOne(flags[0]); // single-skip (disc 356: skip predicate = length === 1)
    // >1 → a filtered QuickPick, structurally identical to openFlagList (shared flagPickItem), scoped to this node, then the drawer.
    const items = flags.map(flagPickItem);
    const pick = await vscode.window.showQuickPick(items, { placeHolder: "Flags on this node — pick one (Esc to close)" });
    if (!pick) return; // Esc
    if (indexVersion !== ver || currentCel !== cel || mode !== "medical-validation") return flagNote("policy changed — reopen the flags");
    openOne(pick.flag);
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

  /** #210 Todo D slice 2 — a SILENT-ONLY GitHub token for READ tools (`read_review_context`). Unlike `githubToken`, it NEVER
   *  prompts (no `createIfNone` modal fired mid-turn while the agent is "thinking" — Claude/gpt55 review) and NEVER latches
   *  `githubAuthDeclined` (an agent read must not suppress the next HUMAN flag-create's sign-in). No session → undefined →
   *  the read degrades to "not signed in" and the synthesis proceeds without issue bodies. */
  async function githubTokenSilent(): Promise<string | undefined> {
    try {
      const s = await vscode.authentication.getSession("github", ["repo"], { silent: true });
      return s?.accessToken;
    } catch {
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

  /** The file URI whose git origin resolves the issue base — the policy `src/crl` dir (a store flag has no source file of its
   *  own; a nested/submodule policy → its own repo's origin). The same resolution bridgeReadReviewContext uses. */
  function flagRepoFileUri(): vscode.Uri | undefined {
    const src = currentCel ? findPolicySrc(currentCel) : undefined;
    return src ? vscode.Uri.file(join(src, "crl")) : undefined;
  }

  /** Flip a store flag's status (#212 S3, store-only). Read-modify-write: re-read the CURRENT on-disk `<id>.json` by id and
   *  merge ONLY status+editedAt (so an edit to gist/fields/anchor/description that landed BEFORE this re-read is preserved; a
   *  record deleted out from under us is reported stale, never resurrected). Last-writer-wins — the JSON store has no lock/etag,
   *  so an edit landing between this re-read and the save is lost (inherent). A corrupt store (loadFlags `warning`) BLOCKS the
   *  write — don't advance state while flag state is partially unknown. Reloads + repaints EXPLICITLY (the watcher also fires). */
  async function writeFlagStatus(flag: MvFlag, next: FlagStatus, ver: number, cel: string | undefined): Promise<void> {
    const stale = (m: string): void => {
      reloadReviewFlags();
      renderTreeChrome();
      driveFlagBadges(); // the node badges track the (re)loaded flag state
      flagNote(m);
    };
    if (indexVersion !== ver || currentCel !== cel || mode !== "medical-validation") return stale("policy changed — reopen the flag");
    const dir = currentCel ? flagStoreDir(currentCel) : undefined;
    if (!dir) return flagNote("no flag store for this policy");
    const loaded = loadStoredFlags(dir);
    if (loaded.warning) return stale("flag store unreadable — repair the corrupt record first"); // a partially-unknown store must not be written into (parity with the MCP tool)
    const current = loaded.flags.find((f) => f.id === flag.id);
    if (!current) return stale("the flag changed on disk — reopen it"); // deleted/renamed on disk → don't recreate a stale snapshot
    if (current.status === next) {
      // already at the target (a concurrent toggle won the race) — refresh so the list reflects disk; no redundant write.
      reloadReviewFlags();
      renderTreeChrome();
      driveFlagBadges();
      return;
    }
    try {
      saveFlag(dir, { ...current, status: next, editedAt: new Date().toISOString() });
    } catch (e) {
      return flagNote(`could not write the flag: ${e instanceof Error ? e.message : String(e)}`);
    }
    reloadReviewFlags();
    renderTreeChrome(); // EXPLICIT refresh (the store watcher also fires — belt and suspenders)
    driveFlagBadges();
    flagNote(next === "resolved" ? "flag resolved" : "flag reopened");
  }

  /** The action drawer's Resolve/Reopen. Single-flight (a rapid 2nd click must not overlap the write). Writes via
   *  `writeFlagStatus` (which reloads `flagsList` on every path), then reconciles the drawer against the refreshed list
   *  (`refreshFlagActionDrawer` re-finds by id → replaces the captured record + re-renders, or closes if gone) — so the button
   *  flips off the FRESH status, never the pre-write snapshot. */
  async function flagActionToggle(): Promise<void> {
    const view = flagActionView;
    if (!view || flagActionBusy) return;
    flagActionBusy = true;
    try {
      await writeFlagStatus(view.flag, view.flag.status === "resolved" ? "open" : "resolved", view.ver, view.cel);
    } finally {
      flagActionBusy = false;
    }
    refreshFlagActionDrawer();
  }

  /** The action drawer's Open-issue #N. Single-flight + async-guarded: re-find the record by id and re-derive its numeric ref
   *  from the CURRENT store, then — AFTER `resolveOrDetectIssueBase` (git detection can span a retarget) and BEFORE
   *  `openExternal` — re-check the same drawer is still active on the same policy, so a retarget / drawer swap can't open the
   *  old flag's issue. No derivable base → a persistent Open-Settings warning (not a transient note). */
  async function flagActionOpenIssue(): Promise<void> {
    const view = flagActionView;
    if (!view || flagActionBusy) return;
    if (!issueRefOf(view.flag.fields.ref)) return flagNote("this flag has no linked issue"); // entry check off the captured record
    flagActionBusy = true;
    try {
      const base = await resolveOrDetectIssueBase(flagRepoFileUri());
      // Re-validate the drawer identity by (id, ver, cel) — stable across a `refreshFlagActionDrawer` object-replacement (it
      // re-stamps the SAME id/ver/cel), but false on a close / retarget / rebuild (ver) / different-flag drawer (disc 355 [reject]:
      // a close→reopen of the SAME flag opening its SAME issue is correct, so no epoch token is needed).
      if (!flagActionView || flagActionView.flag.id !== view.flag.id || indexVersion !== view.ver || currentCel !== view.cel || mode !== "medical-validation") return;
      // Re-derive the numeric ref from the CURRENT record (disc 355 [important]): an external `ref` edit during git detection
      // must not open the pre-await number. Gone/non-numeric now → abort.
      const issueNo = issueRefOf(flagActionView.flag.fields.ref);
      if (!issueNo) return;
      const url = buildIssueUrl(base, issueNo);
      if (!url) return promptSetIssueBase(issueNo);
      // openExternal is a Thenable that can REJECT (platform handler failure) — catch so a `void`-launched call never leaks an
      // unhandled rejection (disc 355 [important]); a false RESULT and a rejection get the same honest note.
      try {
        if (!(await vscode.env.openExternal(vscode.Uri.parse(url)))) flagNote(`could not open issue #${issueNo}`);
      } catch {
        flagNote(`could not open issue #${issueNo}`);
      }
    } finally {
      flagActionBusy = false;
    }
  }

  /** No derivable issue base for #N — a PERSISTENT warning with a one-click Open-Settings (relocates the old menu's ⚙ item to
   *  the failure moment; a 3s status-bar note is too easy to miss). In an untrusted workspace `resolveIssueBase` ignores the
   *  workspace value, so steer to a User-scope setting. */
  function promptSetIssueBase(issueNo: string): void {
    const hint = vscode.workspace.isTrusted ? "" : " — set it in your User settings (a workspace value is ignored in an untrusted workspace)";
    void vscode.window.showWarningMessage(`No issue tracker is configured to open issue #${issueNo}${hint}.`, "Open Settings").then((a) => {
      if (a) void vscode.commands.executeCommand("workbench.action.openSettings", "crl.issueBaseUrl");
    });
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
    if (!tree) {
      flagsByGid = new Map(); // no tree → no badges → no node map (keeps the "rebuilt wholesale every drive" invariant true, disc 357)
      return; // tree pane is opt-in
    }
    if (mode !== "medical-validation") {
      flagsByGid = new Map(); // lockstep: the painted badges are cleared here, so the node→flags map must be too (disc 356)
      void tree.panel.webview.postMessage({ type: "flagBadges", gen: tree.gen, flaggableGids: tree.flaggableGids, gids: [], startNodeGid: tree.startNodeGid, open: 0, resolved: 0, flagError: false, unplaced: 0 });
      return;
    }
    const open = flagsList.filter((f) => isOpen(f)); // the blocking set (matches openFlags / the gate)
    // Todo 2 (disc 356/357): the flag->node placement, extracted PURE (flagPlacement.ts) so the reverse-map assembly is
    // unit-tested. `flagsByGid` (WHICH open flags lit each gid) drives the node-filtered entry; `gids` LIGHT the per-node badges.
    // The crlStructure/resolveAnchor lookups are wired in `flagPlacementFor` (shared with the gold node-link, disc 359).
    const placement = flagPlacementFor(tree, open);
    const { gids, unplaced } = placement;
    flagsByGid = placement.byGid; // wholesale swap - only the CURRENT render's gids stay (lockstep with the painted badges)
    const resolvedCount = flagsList.length - open.length;
    void tree.panel.webview.postMessage({ type: "flagBadges", gen: tree.gen, flaggableGids: tree.flaggableGids, gids, startNodeGid: tree.startNodeGid, open: open.length, resolved: resolvedCount, flagError: flagStateError, unplaced });
    driveFlagNodeHighlight(); // disc 359: a fresh render lost `.flag-current` — re-drive the gold link for any open action drawer
  }

  /** The flag→node placement wired against the LIVE tree substrate + host state — SHARED by `driveFlagBadges` (the open set →
   *  badges + `flagsByGid`) and the gold node-link (`gidsForFlag`, a single flag). The two crlStructure/`resolveAnchor`-dependent
   *  lookups (decision-object segments, live-occurrence gid) live here so both callers agree; the pure assembly is `flagPlacement.ts`. */
  function flagPlacementFor(tree: PaneView, flags: MvFlag[]): ReturnType<typeof computeFlagPlacement> {
    return computeFlagPlacement(
      flags,
      { conceptOccurrences: tree.conceptOccurrences, criterionOccurrences: tree.criterionOccurrences },
      (a) => {
        const dec = crlStructure.find((sc) => sc.decision === a.name && sc.lib === a.library);
        return dec ? segmentsFor(tree, [dec.nodeKey]).segmentIds : []; // decision-OBJECT → the whole decision's segments
      },
      (a) => {
        const cls = resolveAnchor(a, anchorCtx); // decision OCCURRENCE → the ONE live keyed node (moved/orphan → undefined)
        return cls.state === "live" && cls.nodeKey ? tree.anchors[cls.nodeKey]?.scrollTo : undefined;
      },
    );
  }

  /** The render gid(s) a single flag (open OR resolved) draws as, in the CURRENT tree — the gold node-link + the drawer's
   *  `targetPresent`. Empty = the target isn't charted (a moved occurrence / library-wide / concept drawn nowhere). */
  function gidsForFlag(flag: MvFlag): string[] {
    const tree = views.get("tree");
    return tree ? flagPlacementFor(tree, [flag]).gids : [];
  }

  /** The render gid(s) a CREATE draft's target draws as — so the gold node-link answers "which node am I flagging?" WHILE the
   *  Add-flag drawer is open (not just for an existing flag, disc 361). Synthesize the anchor the flag WILL carry once created
   *  (buildFlagDraft's mapping: `kind`→scope, `lib`→library, an occurrence `key`→occurrenceKey) and run the SAME placement, so
   *  the draft highlights exactly the node(s) the filed flag would. `computeFlagPlacement` reads only `anchor.{scope,name,library,
   *  occurrenceKey}` + `id`, so this throwaway record needs nothing else; nothing is stored. */
  function gidsForTargetChoice(target: FlagTargetChoice): string[] {
    const tree = views.get("tree");
    if (!tree) return [];
    const synthetic: MvFlag = {
      schemaVersion: 1,
      id: "__draft__",
      category: "validation",
      tag: "__draft__",
      gist: "",
      status: "open",
      fields: {},
      createdAt: "",
      anchor: {
        scope: target.kind,
        name: target.name,
        label: target.label,
        ...(target.lib ? { library: target.lib } : {}),
        ...(target.key ? { occurrenceKey: target.key } : {}),
      },
    };
    return flagPlacementFor(tree, [synthetic]).gids;
  }

  /** Paint the GOLD node-link for the OPEN drawer's target (disc 359; disc 361: create drawer too) — a class-toggle channel
   *  (gen-guarded, survives a re-render via the tree ack) modeled on `driveFlagBadges`. Driven ONLY from `postFlagDrawer` (every
   *  drawer mutation funnels through it) + the tree ack — so no drive site can be missed. Precedence MIRRORS the postFlagDrawer
   *  dispatcher (create wins, then action) so the highlighted node is always the drawer that's actually showing. Empty gids when
   *  no drawer is open → clears. Gold means "this drawer's target", regardless of a filed flag's open/resolved status. */
  function driveFlagNodeHighlight(): void {
    const tree = views.get("tree");
    if (!tree) return; // no tree webview to highlight (the drawer lives in it; a fresh render starts classless + the ack re-drives)
    const gids = flagDraft
      ? gidsForTargetChoice(flagDraft.target) // the create draft's target — "which node am I flagging?" while authoring (disc 361)
      : flagEditDraft
        ? gidsForFlag(flagEditDraft.flag) // Todo 3: the edit form's flag stays gold-linked while editing
        : flagActionView
          ? gidsForFlag(flagActionView.flag)
          : []; // Todo 5 (D6): the bulk grid has no single target node → no gold link (falls through here, grid mode is mutually exclusive with the three above)
    const scroll = flagHlScrollPending; // true ONLY for a genuine open/switch — a re-render/ack/refresh drive never scrolls
    flagHlScrollPending = false;
    void tree.panel.webview.postMessage({ type: "flagHl", gen: tree.gen, gids, scroll });
  }

  /** #224 ii.3 Slice 2b / #233 Todo 2b — the LIVE criterion identities: `{lib,name}` → `{bodyHash, elided}`. The gate set is
   *  the criteria REACHABLE from the rendered guard outlines (`criterionGateIdentities` — a MODEL-tree walk, collapse-
   *  INDEPENDENT), mapped to their CANONICAL facts. So a criterion referenced ONLY in a compound/nested position (never sole)
   *  is STILL gated (the 2→6 growth), and a criterion under a collapsed ancestor still counts — but a criterion DECLARED yet
   *  never referenced by any guard is EXCLUDED (it renders nowhere → gating it would livelock the gate, disc 330 [critical]).
   *  Keyed by `criterionKey == criterionVerdictKey`. The staleness fold + the gate/chrome tally read this. */
  function buildLiveCriterionIdentities(): Map<string, LiveCriterion> {
    const out = new Map<string, LiveCriterion>();
    for (const [key, id] of criterionGateIdentities(guardOutlines, criterionIdentities)) out.set(key, { bodyHash: id.bodyHash, elided: id.elided });
    return out;
  }

  /** #224 ii.3 Slice 2b — paint the model-level criterion VERDICT chips (MIRRORS driveFlagBadges): for each rendered
   *  criterion occurrence, resolve its effective UI state (`criterionVerdictState` — unreviewed / pass / fail / pending /
   *  stale) by identity, group gids by state, and post a class-toggle (`.crit-*`) the webview applies WITHOUT a re-render.
   *  `allGids` lets the webview bulk-clear the 4 classes before re-applying (a verdict change must un-paint prior state).
   *  Selection-INDEPENDENT + re-driven on the tree ack, like the flag badges. No-op off MV / no tree pane. */
  function driveCriterionVerdicts(): void {
    const tree = views.get("tree");
    if (!tree) return; // tree pane is opt-in
    const allGids = tree.criterionOccurrences.map((o) => o.gid);
    const byState: { pass: string[]; fail: string[]; pending: string[]; stale: string[] } = { pass: [], fail: [], pending: [], stale: [] };
    if (mode === "medical-validation") {
      const identities = buildLiveCriterionIdentities();
      for (const occ of tree.criterionOccurrences) {
        const key = criterionVerdictKey(occ.lib, occ.name);
        const live = identities.get(key);
        // #233 Todo 2b: identities now come from the CANONICAL inventory, so EVERY rendered criterion occurrence — root
        // `when` box AND non-root `flow-crit-row` — resolves here and gets its `.crit-*` verdict chip painted (the chip
        // markup + `.crit-*` CSS now cover both row kinds). A missing `live` would mean a rendered criterion absent from the
        // canonical inventory (a builder divergence — shouldn't happen); skip defensively rather than paint a phantom chip.
        if (!live) continue;
        const s = criterionVerdictState(criterionVerdicts[key], live);
        if (s !== "unreviewed") byState[s].push(occ.gid); // unreviewed → no class (the bulk-clear leaves it bare)
      }
    }
    void tree.panel.webview.postMessage({ type: "criterionVerdicts", gen: tree.gen, allGids, byState });
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

  /** #210 (disc 239) — the CRL Assist FOCUS ring: a purple ring on the tree node the agent has as its FLAG ANCHOR (the last
   *  flag-capable node the user clicked). An INDEPENDENT channel (its own `.node-focus` class) that never touches the
   *  `.current` eval-chain highlight / `.has-flag` badges / `.this-node` / review overlays — mirrors `driveThisNode`'s tree
   *  leg but reads `flagAnchor` and marks ONLY the tree pane. An empty `segmentIds` clears it (gen-guarded, current tree gen).
   *  Re-driven on the tree ack (repaint after rebuild) + whenever the anchor changes. */
  function driveNodeFocus(): void {
    const tree = views.get("tree");
    if (!tree) return; // tree pane opt-in
    let segmentIds: string[] = [];
    if (mode === "medical-validation" && flagAnchor && flagAnchor.cel === currentCel) {
      const hit = flagAnchor.hit;
      // The anchored node's tree-anchor key (the SAME extraction flagTargetChoices uses) → its segment (one gid on the tree).
      const key = isSubQuestionHit(hit) ? hit.subQuestionLeafKey : "nodeKey" in hit ? hit.nodeKey : undefined;
      if (key) segmentIds = segmentsFor(tree, [key]).segmentIds;
    }
    void tree.panel.webview.postMessage({ type: "markNodeFocus", gen: tree.gen, segmentIds });
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
    v.criterionOccurrences = []; // #224 ii.3 Slice 2b (tree-only); reset each render, re-set in the tree branch
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
        guardOutlines, // #224 ii.3 Todo 3: a criterion-when hangs its criterion-body outline (no more dead-end)
        expandedGuardWhens, // #224 ii.3 Slice 2: which single-criterion whens are expanded (default: all collapsed)
      });
      v.anchors = r.anchors;
      v.reveals = r.reveals;
      v.leafConcepts = r.leafConcepts; // #187 Todo 5: the def-leaf verdict-join map (captured atomically with the anchors)
      v.conceptOccurrences = r.conceptOccurrences; // #203 Todo 4b Slice A: the flag-badge substrate (captured atomically)
      v.criterionOccurrences = r.criterionOccurrences; // #224 ii.3 Slice 2b: the criterion-verdict substrate (captured atomically)
      v.flaggableGids = r.flaggableGids;
      v.startNodeGid = r.startNodeGid; // the chrome-mirror count badge's node
      void v.panel.webview.postMessage({ type: "render", html: r.html, gen, indexVersion, mode });
    } else if (pane === "fhirQuestionnaire") {
      // The $apply-driven pane (LForms). Per the integration design it receives DATA ONLY — never `html` — so
      // there is no innerHTML swap for the mounted form to survive and no dead-script trap (scripts inserted via
      // innerHTML never execute). The vendor bundles live in this pane's own shell document.
      // ⚠ EXPLICIT BRANCH ON PURPOSE: the `questionnaire` case below is the bare `else`, so without this a new
      // pane id would silently render the STATIC questionnaire instead.
      v.anchors = {};
      v.reveals = {};
      // Reads the REAL qa path, not a compiled-in fixture — the same path the producer (#277) will write to, so
      // nothing here changes when it lands. Async, hence the gen guard.
      {
        const focused = focusedScenario();
        const cid = focusedCaseId(state);
        // Render identity — currently SELECTION identity, not content identity. It suppresses remounts on
        // unrelated cockpit re-renders (rebuild/applyShowKeys), which is what it is for. It does NOT detect a
        // Q/QR that changed on disk for the still-selected case; that needs the producer's revision or content
        // hash (requested on #277). Do not describe this as content-based until it is.
        const key = focused ? `${focused.decision?.libraryName ?? ""}::${cid ?? ""}` : undefined;
        // Same derivation the CRL Questionnaire pane uses (questionnairePaneHtml.ts:331) — strips the authored
        // `-> outcome` suffix — so the two panes show an identical case header.
        const label = focused ? caseDisplayName(focused.case?.name ?? "") : undefined;
        const post = (q?: unknown, qr?: unknown, lookedFor?: string): void => {
          if (v.gen !== gen) return; // a newer render superseded this async load
          // Contract breaches are detected HOST-side, where the JSON is already parsed, and shown above the form.
          // Left to LForms these degrade quietly (empty dropdown, absent widget), which is the one failure shape
          // this pane must not have.
          const unrenderable = q === undefined ? [] : unrenderableQuestionnaireFeatures(q);
          void v.panel.webview.postMessage({ type: "fhirQuestionnaire", gen, indexVersion, key, label, q, qr, lookedFor, unrenderable });
        };
        // The FULL authored name (arrow suffix included) is the artifact-directory key — see the note on
        // loadFhirQuestionnaireCase. `label` above is the display form, which deliberately strips it.
        const caseName = focused?.case?.name ?? "";
        if (!focused || !cid || !caseName) post();
        else void loadFhirQuestionnaireCase(caseName, focused.decision?.libraryName).then((r) => post(r.q, r.qr, r.lookedFor));
      }
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
  /**
   * Read the FHIR Questionnaire + QuestionnaireResponse for a case FROM DISK, at the settled qa layout
   * (docs/questionnaire-pane-integration-plan.md §5a):
   *
   *   <artifact>/tests/data/fhir/patient/<library-slug>-cases/<case-slug>/Questionnaire/*.json
   *   <artifact>/tests/data/fhir/patient/<library-slug>-cases/<case-slug>/QuestionnaireResponse/*.json
   *
   * This is deliberately a real filesystem read and not a compiled-in fixture: it exercises the exact path the
   * producer (issue #277) will write to, so when the producer lands nothing here changes. To test it today,
   * copy a Questionnaire/QuestionnaireResponse pair into a case directory.
   *
   * The case directory carries an outcome suffix (`…-met` / `…-unmet`) that the case id does not, hence the
   * trailing `*` on the slug.
   */
  async function loadFhirQuestionnaireCase(
    caseName: string,
    libraryName: string | undefined,
  ): Promise<{ q?: unknown; qr?: unknown; lookedFor: string }> {
    const slugify = artifactSlug;
    // ⚠ Keyed on the case's FULL AUTHORED NAME, including its `-> outcome` suffix — that is what the emitter
    // slugifies into the directory name:
    //   "exclusion overrides full documentation -> unmet (ordered precedence)"
    //     → exclusion-overrides-full-documentation-unmet-ordered-precedence
    // NOT the caseId (which is a different, shorter identifier — `exclusion-overrides-precedence` here) and NOT
    // caseDisplayName (which strips the arrow, and the outcome is part of the directory name). Keying on the
    // caseId matched by luck on cases whose id happened to prefix the directory, and silently missed otherwise.
    //
    // Because the whole name is used, the match is EXACT — no prefix glob, so no risk of binding a sibling case
    // whose slug extends this one.
    const slug = slugify(caseName);
    // Scope by library too when we know it — two libraries can carry the same case slug, and in a multi-root
    // workspace findFiles spans every folder.
    const libSeg = libraryName ? `${slugify(libraryName)}-cases` : "*";
    const lookedFor = `**/tests/data/fhir/patient/${libSeg}/${slug}/{Questionnaire,QuestionnaireResponse}/*.json`;
    const out: { q?: unknown; qr?: unknown; lookedFor: string } = { lookedFor };
    if (!slug) return { ...out, lookedFor: "(no case id — nothing was searched)" };
    let hits: readonly vscode.Uri[] = [];
    try {
      hits = await vscode.workspace.findFiles(lookedFor, "**/node_modules/**", 200);
    } catch {
      return out;
    }
    for (const uri of hits) {
      const segs = uri.path.split("/");
      const type = segs[segs.length - 2]; // the <ResourceType> dir holding the file
      const caseDir = segs[segs.length - 3]; // the <case-slug> dir holding that
      if (type !== "Questionnaire" && type !== "QuestionnaireResponse") continue;
      if (caseDir !== slug) continue; // exact case-directory match; belt and braces against a glob surprise
      if (type === "Questionnaire" && out.q) continue; // a case has one of each
      if (type === "QuestionnaireResponse" && out.qr) continue;
      // Per-FILE try: one malformed document must not abort the search and hide a valid one later in the list.
      try {
        const json: unknown = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8"));
        if (type === "Questionnaire") out.q = json;
        else out.qr = json;
      } catch {
        // skip this file; keep looking
      }
    }
    return out;
  }

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
      v.criterionOccurrences = []; // #224 ii.3 Slice 2b: reset the criterion-verdict substrate too (symmetry)
      v.flaggableGids = [];
      v.startNodeGid = undefined;
      if (pane === "fhirQuestionnaire") {
        // This pane owns its own DOM and holds a render-identity key in the webview. The generic `render`
        // message would replace #root (destroying the LForms mount) WITHOUT clearing that key, so re-selecting
        // the same case afterwards would hit the skip-remount check and never rebuild the form. Its own
        // data-only message clears the key and paints the placeholder.
        void v.panel.webview.postMessage({ type: "fhirQuestionnaire", gen, indexVersion, key: undefined, label: undefined });
        continue;
      }
      void v.panel.webview.postMessage({ type: "render", html: `<p class="placeholder">${escapeHtml(message)}</p>`, gen, indexVersion, mode });
    }
  }

  function onWebviewMessage(
    pane: Pane,
    msg: { type?: string; gen?: number; key?: string; value?: string; noteId?: string; mode?: string; idx?: number; dir?: string; on?: string; state?: string; gid?: string; tag?: unknown; summary?: unknown; stub?: unknown; fields?: unknown; token?: unknown; html?: unknown; assignments?: unknown; dirty?: unknown; epoch?: unknown },
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
        // #224 ii.3 Slice 2b: a fresh tree render dropped its `.crit-*` classes — re-drive the model-level criterion verdict
        // chips (selection-INDEPENDENT, like the flag badges). Uses this render's captured criterionOccurrences + guardOutlines.
        driveCriterionVerdicts();
        // #187 Todo 5: a fresh tree render dropped its `.flow-leaf-yes/no` classes (innerHTML replaced) — re-drive the
        // per-case leaf verdict overlay so a tree opened / re-rendered mid-session repaints the focused case's leaf answers.
        // NOTE: unlike the review overlay, this is selection-DEPENDENT — it rings `focusedScenario()`, which exists only in
        // cel-primary; it re-drives HERE (on ack) to survive the innerHTML replacement, and ALSO on every selection dispatch.
        driveLeafMarks();
        // #210 (disc 239): a fresh tree render dropped its `.node-focus` class — re-drive the agent's flag-anchor focus ring.
        driveNodeFocus();
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
      void openFlagList(); // #203 Todo 4: the tree-chrome flag badge / START-node count pill → the WHOLE-policy review-flag list (MV)
    } else if (msg.type === "nodeFlags" && typeof msg.gid === "string") {
      void openNodeFlags(msg.gid); // Todo 2 (disc 356): a PER-NODE ⚑ badge → the drawer/list filtered to THIS node (gid re-validated against flagsByGid)
    } else if (msg.type === "questionNav" && (msg.dir === "prev" || msg.dir === "next")) {
      navigateQuestion(msg.dir); // #177 slice 5: the questionnaire pane's prev/next sub-nav — moves currentQuestionIndex
    } else if (msg.type === "worklistSet" && typeof msg.key === "string") {
      setWorklist(msg.key, msg.value); // #156 slice 4: a worklist dropdown change (MV mode) — host validates + persists it
    } else if (msg.type === "nodeVerdictMenu" && typeof msg.key === "string") {
      void nodeMenu(msg.key); // #217 + #203 Todo 4b Slice B: right-click a flow node (MV) — combined menu (verdict / add-flag); a non-flaggable node routes straight to the verdict pick
    } else if (msg.type === "toggleCriterion" && typeof msg.key === "string") {
      // #224 ii.3 Slice 2: the criterion `▸`/`▾` disclosure. Resolve the opaque reveal key → the collapse key (trusted
      // lookup, never a webview-supplied path), then flip its state + re-render the tree (layout change). #233 Todo 2a:
      // a ROOT criterion resolves to its `when` nodeKey; a NON-ROOT criterion box resolves to `{criterionToggle: posKey}`.
      // Both flip a string in `expandedGuardWhens` (disjoint keyspaces — a JSON-array nodeKey vs a `leaf::` position key).
      const hit = v.reveals[msg.key];
      if (hit && "nodeKey" in hit) toggleCriterionExpand(hit.nodeKey);
      else if (hit && isCriterionToggleHit(hit)) toggleCriterionExpand(hit.criterionToggle);
    } else if (msg.type === "snapshotDom" && pane === "tree" && typeof msg.token === "string") {
      // #(tree-snapshot) Todo 2 — the tree webview's reply to `requestSnapshot` (only the TREE pane is a valid source). The
      // coordinator ignores a stale/late token; the payload is COERCED to string here + fully screened in captureTreeDom.
      snapshotCapture.resolve(msg.token, typeof msg.html === "string" ? msg.html : undefined);
    } else if (msg.type === "exportSnapshot" && pane === "tree") {
      // #(tree-snapshot): the in-pane "⤓ Export snapshot" chrome button (tree pane only) → the host command.
      void exportTreeSnapshot().catch((e) => vscode.window.showErrorMessage(`Tree snapshot: ${e instanceof Error ? e.message : String(e)}`));
    } else if (msg.type === "openReviewGrid" && pane === "tree") {
      // #(bulk-verdict) Todo 5: the in-pane "☑ Review verdicts…" chrome button (tree pane only) → open (or toggle-close) the drawer grid.
      void openReviewGrid();
    } else if (msg.type === "reviewGridApply" && pane === "tree") {
      // Todo 5: the grid drawer's Apply — pane+mode scoped (a non-tree webview / no active grid never applies). The untrusted
      // `assignments` payload is resolved against the CAPTURED snapshot inside applyReviewGrid (the trust boundary); the epoch
      // gates out a delayed message from a torn-down session.
      if (reviewGridSnapshot) applyReviewGrid(msg.assignments, msg.epoch);
    } else if (msg.type === "reviewGridCancel" && pane === "tree") {
      if (reviewGridSnapshot) cancelReviewGrid(msg.epoch); // Todo 5: the grid drawer's Cancel/✕ — deliberate discard (epoch-gated)
    } else if (msg.type === "reviewGridDirty" && pane === "tree") {
      if (reviewGridSnapshot && Number(msg.epoch) === reviewGridSnapshot.epoch) reviewGridDirty = msg.dirty === true; // Todo 5: mirror the webview's 0↔≥1 picks (epoch-gated, two-way)
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
      // #210 (disc 239): the human filed it (or hit a terminal failure). Await the outcome; if the drawer CLOSED (written or
      // a closing-failure — `flagDraft` now undefined), SETTLE the agent elicitation (completed on a write, else error). A
      // KEEP-OPEN form error leaves the drawer + the pending resolver up (the human fixes + re-Inserts). Idempotent: if Stop
      // already settled, `settleDrawer` no-ops. `commitFlagDraft` uses the host-captured target; the payload is untrusted.
      // HANG-SAFE proxy (Claude review): `!flagDraft` is "the drawer closed", not "THIS commit closed it". KNOWN minor
      // limitation — a SAME-policy lifecycle clear (sidecar reload / reset / tree-dispose) racing this commit's async window
      // settles `{cancelled}` while the commit still proceeds to file; the eventual `settleDrawer(completed)` then no-ops, so
      // the agent reports "not completed" though the flag WAS filed. Never a false-complete, never a hang, never data loss.
      void commitFlagDraft({ tag: msg.tag, summary: msg.summary, stub: msg.stub, fields: msg.fields }).then(
        (outcome) => {
          if (!flagDraft) settleDrawer(outcome.ok ? { status: "completed", result: { message: outcome.note } } : { status: "error", reason: outcome.note });
        },
        // Defensive (gpt55): an unexpected throw BEFORE commitFlagDraft's own try/catch would leave the promise rejected +
        // the agent's wait stranded — settle error so it can never hang.
        (e) => settleDrawer({ status: "error", reason: e instanceof Error ? e.message : String(e) }),
      );
    } else if (msg.type === "flagDraftCancel") {
      settleDrawer({ status: "cancelled", reason: "cancelled" }); // #210 (disc 239): the human cancelled the agent's request
      closeFlagDrawer();
    } else if (msg.type === "flagActionToggle") {
      void flagActionToggle(); // the action drawer's Resolve/Reopen (host acts on the host-captured flagActionView.flag — the msg carries no id)
    } else if (msg.type === "flagActionIssue") {
      void flagActionOpenIssue(); // the action drawer's Open-issue #N
    } else if (msg.type === "flagActionEdit") {
      openFlagEditDraft(); // Todo 3/3.5: the action drawer's Edit → the edit form (full for a human MV Type; description-only for AI)
    } else if (msg.type === "flagActionDelete") {
      void deleteFlagFromDrawer(); // Todo 4: the action drawer's Delete → confirm → remove local record + best-effort close issue not-planned
    } else if (msg.type === "flagActionClose") {
      closeFlagActionView(); // the action drawer's ✕ (UI clear — no agent elicitation)
    } else if (msg.type === "flagEditSave") {
      void saveFlagEdit({ tag: msg.tag, summary: msg.summary, stub: msg.stub, fields: msg.fields }); // Todo 3: the edit form's Save
    } else if (msg.type === "flagEditCancel") {
      cancelFlagEdit(); // Todo 3: the edit form's Cancel/✕ → back to the action view
    } else if (msg.type === "flagEditDirty") {
      if (flagEditDraft) flagEditDirty = true; // Todo 3: the form was modified → the lose-changes gate now applies to a switch
    } else if (msg.type === "reveal" && typeof msg.key === "string") {
      const hit = v.reveals[msg.key]; // trusted: looked up by opaque key, not a path/range from the webview
      if (!hit) return;
      // #210 Todo C: record the last FLAG-CAPABLE node click as the agent's flag anchor — BEFORE the peek/sub-question
      // early returns below, because a `when` condition renders as a sub-question hit that IS flaggable ("this condition").
      // No-ops on a non-flaggable click (a fact/concept peek → flagTargetChoices returns []). Fires the chip-refresh event.
      if (flagTargetChoices(hit).length) {
        flagAnchor = { hit, cel: currentCel };
        cockpitAgentBridge.notifyChanged();
        driveNodeFocus(); // #210 (disc 239): move the purple focus ring to the newly-anchored node (no rebuild here)
      }
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
        // #233 Todo 2a: a criterion collapse chevron resolves to `{criterionToggle}` — it drives ONLY the `toggleCriterion`
        // message, never a selection. Diverted defensively (the chevron posts `toggleCriterion`, not `reveal`).
        if (isCriterionToggleHit(hit)) return;
        // #233 Todo 2b: LEFT-click on a non-root criterion box (`{criterionOccurrence}`) is INERT (disc 327 pt 14) — the
        // criterion is reviewed via RIGHT-click (the encoding menu, `nodeMenu`/`criterionEncodingMenu`), not a case selection.
        if (isCriterionOccurrenceHit(hit)) return;
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
    // The $apply pane loads the vendored LForms runtime from media/lforms/. Setting localResourceRoots NARROWS
    // the webview to that one directory. (Omitting it does NOT mean "no local resources" — VS Code's default is
    // the workspace folders plus the extension directory; the other panes are protected by their
    // `default-src 'none'` CSP, not by an empty root list.)
    const lformsRoot = vscode.Uri.joinPath(context.extensionUri, "media", "lforms");
    const panel = vscode.window.createWebviewPanel(
      `crlCockpit.${pane}`,
      paneTitle(pane),
      { viewColumn: columnFor(pane), preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        ...(pane === "fhirQuestionnaire" ? { localResourceRoots: [lformsRoot] } : {}),
      },
    );
    panel.webview.html = shellHtml(pane, panel.webview.cspSource, (f: string) =>
      panel.webview.asWebviewUri(vscode.Uri.joinPath(lformsRoot, f)).toString(),
    );
    coord.setPaneCapability(pane, "renderable"); // all panes render + receive reveals (the tree flowchart lit up in T3)
    const disposables: vscode.Disposable[] = [
      panel.webview.onDidReceiveMessage((m) => onWebviewMessage(pane, m)),
    ];
    v = { panel, gen: 0, indexVersion: 0, acked: false, anchors: {}, reveals: {}, leafConcepts: {}, conceptOccurrences: [], criterionOccurrences: [], flaggableGids: [], disposables };
    views.set(pane, v);
    panel.onDidDispose(() => {
      for (const d of disposables) d.dispose();
      coord.disposePane(pane);
      views.delete(pane);
      // #211: the flag drawer lives in the tree pane's own region — if that pane is torn down mid-draft, drop the host
      // draft too (else `flagDraft` lingers invisible + uncommittable; a fresh tree panel wouldn't re-show it).
      if (pane === "tree") {
        clearFlagDraft("disposed"); // #210 (disc 239): drop the draft + SETTLE any pending agent elicitation (else it hangs)
        flagsByGid = new Map(); // Todo 2 (disc 357): drop the node→flags map — a reopened tree resets `gen` to 1, so a stale `g1_` bucket must not survive
        flagAnchor = undefined; // #210 Todo C: drop the anchor too — a reopened tree must not resurrect a stale target (B6)
        snapshotCapture.settleEmpty(); // #(tree-snapshot): a capture in flight against this pane must settle now (no 3s hang)
        cockpitAgentBridge.notifyChanged(); // the tree pane closed → the agent can't perceive/flag; update the chip
      }
    });
    // #210 Todo C: a tree pane (re)opened without a click still changes perceivability — refresh the chip off the new state.
    if (pane === "tree") cockpitAgentBridge.notifyChanged();
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
      guardOutlines = cm.guardOutlines; // #224 ii.3 Todo 3
      criterionIdentities = cm.criterionIdentities; // #233 Todo 2b: canonical criterion inventory (gate/verdict source)
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
    reloadReviewFlags();
    for (const pane of PANES) coord.clearPending(pane);
    dispatch({ type: "setInputs", index: toIndex(model, crlStructure, toCelNav(scenarios, caseIdByName, duplicateScenarioNames), indexVersion) });
    updateNavMessage();
    // Iterating GLOBAL PANES is robust (FIX 3 verified): renderPane early-returns on `!views.get(pane)`, so a pane not
    // currently open — the MV-only questionnaire in cockpit mode, or a pane dropped on a mode switch whose onDidDispose
    // hasn't pruned `views` yet — is a clean no-op (no render to a stale/disposing webview). Same for applyShowKeys below.
    for (const pane of PANES) renderPane(pane);
    // disc 355 [critical]: a same-policy rebuild bumped indexVersion — re-stamp the surviving action drawer's ver (else its
    // actions fail a stale guard forever). AFTER the render loop (disc 360 [important]): the drawer's `targetPresent` reads the
    // tree substrate `renderPane` just refreshed, so it can't disagree with the (post-render) gold node-link.
    refreshFlagActionDrawer();
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
    // #210 (disc 239): re-drive the agent's flag-anchor focus ring (immediate parity + a retarget clears it since the new
    // policy's openPanel dropped flagAnchor; the tree's ack also re-drives). Inert outside MV / with no anchor.
    driveNodeFocus();
  }

  /** On a discovery/build failure, drop stale provenance so the panes never stay interactive with wrong data. */
  function resetToEmpty(message: string): void {
    model = undefined;
    correspondence = undefined;
    crlStructure = [];
    conceptLayer = [];
    conceptShape = new Map();
    defExpr = new Map();
    guardOutlines = new Map();
    criterionIdentities = new Map();
    expandedGuardWhens = new Set();
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
    criterionVerdicts = {}; // #224 ii.3 Slice 2b: drop criterion verdicts with the rest of the MV state
    openNotesCaseId = undefined;
    editingNoteId = undefined;
    clearFlagDraft("retarget"); // #211/#210: drop the draft + postFlagDrawer + SETTLE any pending agent elicitation (else it hangs) — Todo 5: also stales the bulk grid
    flagAnchor = undefined; // #210 Todo C: drop the agent flag anchor too (a stale anchor must not survive a failed retarget)
    mvSidecarPath = undefined;
    flagsList = []; // #203 Todo 4: drop the review-flag state too (a stale flag list/gate must not survive a failed retarget)
    flagsByGid = new Map(); // Todo 2 (disc 356): drop the node→flags map with it (a stale gid must never resolve the next policy's flags)
    flagStateError = false;
    flagStoreWarning = false;
    flagStateNote = undefined; // #212 S3: drop the un-migrated note too
    anchorCtx = undefined; // #212 S2: drop the anchor context with the structure (a stale ctx must not resolve the next policy's flags)
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
    cockpitAgentBridge.notifyChanged(); // #210 Todo C: the anchor/policy cleared — refresh the agent chip
  }

  function setupWatcher(): void {
    watcher?.dispose();
    watcher = undefined;
    flagsWatcher?.dispose();
    flagsWatcher = undefined;
    if (flagsDebounce) clearTimeout(flagsDebounce); // a retarget must cancel a pending flags-refresh scheduled for the OLD policy
    flagsDebounce = undefined;
    if (!currentCel) return;
    const src = findPolicySrc(currentCel);
    const pat = src ? new vscode.RelativePattern(src, "{provenance/*.provenance.json,anchor-source/*.txt}") : undefined;
    if (pat) {
      watcher = vscode.workspace.createFileSystemWatcher(pat);
      const onFs = () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(rebuild, 150);
      };
      watcher.onDidCreate(onFs);
      watcher.onDidChange(onFs);
      watcher.onDidDelete(onFs);
    }
    // #212/#230: watch the `medical-validation/flags/` JSON store — it lives under `src/medical-validation/` but OUTSIDE this
    // watcher's src globs above ({provenance,anchor-source}), so it needs its own watcher. An external change (git
    // checkout/merge, a manual repair of a corrupt record) must refresh the live gate + badges. A LIGHT refresh (reload flags
    // + repaint chrome/badges), NOT a full rebuild — the model is unchanged.
    const flagsDir = flagStoreDir(currentCel);
    if (flagsDir) {
      const watchedCel = currentCel; // capture: a debounced fire after a retarget must NOT refresh a DIFFERENT policy (gpt55)
      flagsWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(flagsDir, "*.json"));
      const onFlags = () => {
        if (flagsDebounce) clearTimeout(flagsDebounce);
        flagsDebounce = setTimeout(() => {
          if (mode !== "medical-validation" || currentCel !== watchedCel) return; // policy moved on → drop the stale event
          reloadReviewFlags();
          renderTreeChrome();
          driveFlagBadges();
          refreshFlagActionDrawer(); // an open action drawer is long-lived — reconcile it against the externally-changed store (or close if the flag is gone)
        }, 150);
      };
      flagsWatcher.onDidCreate(onFlags);
      flagsWatcher.onDidChange(onFlags);
      flagsWatcher.onDidDelete(onFlags);
    }
  }

  // ── commands ──
  /** In-flight guard for the async show commands (#156 slice 3, FIX 6). The active-`.cel` fast-path is sync, but the
   *  `findFiles` quick-pick path awaits — two rapid show invocations (Cockpit then Medical Validation) would otherwise
   *  interleave two `openPanel` calls mutating the shared `mode`/`views`. While a pick is pending, a second UNTARGETED
   *  show is ignored (first-wins; the active user keeps their in-progress pick).
   *
   *  #244 adds a second async path (the ambiguity pick), so a boolean is no longer a sufficient guard — it says "a pick
   *  is running" but not WHICH, and whichever continuation landed first would clear it out from under the other.
   *
   *  Two pieces of state now, with distinct jobs:
   *   - `showEpoch` is the AUTHORITY on intent: every accepted show takes the next epoch, and any async continuation acts
   *     only if its epoch is still current. A targeted launch never waits — it supersedes (last explicit intent wins), so
   *     a stale pick can't retarget away from what KELP just asked for.
   *   - `activePick` is the on-screen picker, so a supersede can `hide()` it. Without that the superseded QuickPick stays
   *     visible and choosing in it does nothing — and, worse, whatever gate said "a pick is pending" would stay set until
   *     the user touched it, silently swallowing every later untargeted show. `pickPending` is derived from `activePick`
   *     rather than tracked separately, so the two can't disagree. */
  let showEpoch = 0;
  let activePick: vscode.QuickPick<vscode.QuickPickItem & { value: string }> | undefined;
  /** Epoch of the in-flight UNTARGETED show, if any — the first-wins gate. Set synchronously (before the `findFiles`
   *  await, which precedes any picker), released only by its owner. */
  let untargetedEpoch: number | undefined;

  /** Resolve the .cel to open a panel on (#156 slice 3, shared by BOTH commands). If the active editor is a `.cel`, use
   *  it (preserves the long-standing focused-`.cel` behavior). Otherwise scan the workspace for policy-shaped `.cel`
   *  files (those for which `findPolicySrc` succeeds — a non-policy `.cel` would fail discovery anyway) and quick-pick
   *  one. Returns the chosen path, or undefined when cancelled / none found. */
  async function pickCelForPanel(epoch: number): Promise<string | undefined> {
    const ed = vscode.window.activeTextEditor;
    if (ed && ed.document.uri.scheme === "file" && ed.document.uri.fsPath.toLowerCase().endsWith(".cel")) {
      return ed.document.uri.fsPath; // sync fast-path — no re-entrancy window
    }
    // FIX 7 (false-negative boundary): the 500 cap is applied by findFiles BEFORE the policy filter, so in a workspace
    // with >500 .cel files the cap could fill with non-policy files and miss policy-shaped ones. The content project is
    // well under 500; no fix now — just the honest note. (findPolicySrc also does sync existsSync ancestor walks per
    // candidate; fine at 500, a UI-thread concern only if the cap rises.)
    const uris = await vscode.workspace.findFiles("**/*.cel", "**/node_modules/**", 500);
    // Superseded WHILE scanning (a targeted launch landed during the await) — return before putting a picker on screen.
    // Without this the epoch guard would discard the answer, but only after showing a dialog nobody asked for (#244).
    if (epoch !== showEpoch) return undefined;
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
    return pickCel(items, "Pick a policy .cel to open");
  }

  /** The ONE cancellable QuickPick used by both pick paths. `showQuickPick` cannot be dismissed programmatically, so a
   *  superseded pick would stay on screen and its eventual selection would be a silent no-op — the user picks a file and
   *  nothing happens (#244 impl review, raised by both reviewers). `createQuickPick` gives us `hide()`, so
   *  `cancelActivePick` can take it down the moment a targeted launch supersedes it.
   *
   *  Resolves with the chosen value, or `undefined` if the user dismissed it OR it was superseded. */
  function pickCel(items: (vscode.QuickPickItem & { value: string })[], placeholder: string): Promise<string | undefined> {
    cancelActivePick(); // never stack two pickers — the newer intent replaces the older
    return new Promise<string | undefined>((resolve) => {
      const qp = vscode.window.createQuickPick<vscode.QuickPickItem & { value: string }>();
      qp.items = items;
      qp.placeholder = placeholder;
      let done = false;
      const settle = (v: string | undefined): void => {
        if (done) return; // onDidHide also fires after an accept — resolve exactly once
        done = true;
        if (activePick === qp) activePick = undefined; // clear ONLY our own registration, never a newer pick's
        resolve(v);
        qp.dispose();
      };
      qp.onDidAccept(() => settle(qp.selectedItems[0]?.value));
      qp.onDidHide(() => settle(undefined));
      activePick = qp;
      qp.show();
    });
  }

  /** Dismiss any on-screen pick. Its promise settles `undefined`, and the epoch guard stops its continuation acting. */
  function cancelActivePick(): void {
    const qp = activePick;
    activePick = undefined;
    qp?.hide(); // fires onDidHide → settle(undefined)
  }

  /** Open (or RETARGET) the single panel session in `targetMode` on `celPath`. One singleton controller + one
   *  parameterized webview: switching modes on an open session RETITLES the panes in place + reconciles the new mode's
   *  pane set/order (NO bulk dispose-and-reopen — `ensurePane` returns the still-`views`-tracked view and onDidDispose
   *  fires async, so reopening against a disposing webview is the race FIX 5 avoids). config reads use
   *  `configSection(targetMode)` + the matching pane spec; `failedCriteriaMode` stays SHARED under `crl.cockpit`. */
  function openPanel(targetMode: "cockpit" | "medical-validation", celPath: string): void {
    clearFlagDraft("retarget"); // #210 (disc 239): a (re)show/retarget SETTLES any pending agent elicitation + drops the draft
    mode = targetMode;
    currentCel = celPath;
    flagAnchor = undefined; // #210 Todo C: a retarget / mode switch drops the prior policy's flag anchor
    expandedGuardWhens = new Set(); // #224 ii.3 Slice 2: a retarget starts the new policy's criteria all-collapsed (nodeKeys aren't policy-qualified beyond lib/decision, so carry-over could pre-expand a same-named branch)
    cockpitAgentBridge.notifyChanged(); // refresh the agent chip for the new mode/policy (getAppState reads live state)
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
    criterionVerdicts = {}; // #224 ii.3 Slice 2b: reset criterion verdicts with the rest of the MV state (retarget)
    openNotesCaseId = undefined;
    editingNoteId = undefined;
    clearFlagDraft("retarget"); // #211/#210: a policy (re)load drops the draft + SETTLES any pending agent elicitation — Todo 5: also stales the bulk grid (retarget-only, not per-rebuild)
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
    criterionVerdicts = sidecar.criterionVerdictsByKey ?? {}; // #224 ii.3 Slice 2b: same sidecar, coerce-carried
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
  function persistMv(
    nextByCaseId: Record<string, PersistedReviewState>,
    nextNotes: Record<string, Note[]>,
    nextCriterionVerdicts: Record<string, PersistedCriterionVerdict> = criterionVerdicts, // #224 ii.3 Slice 2b: default to
    // the CURRENT map so every existing 2-arg caller (case verdict / note change) preserves criterion verdicts untouched —
    // the "next value of the map I changed + current value of the others" discipline, extended to the 3rd map.
  ): boolean {
    if (!mvSidecarPath) return false;
    try {
      saveSidecar(mvSidecarPath, composeSidecar(nextByCaseId, nextNotes, nextCriterionVerdicts));
    } catch (e) {
      void vscode.window.showErrorMessage(
        `Medical Validation: could not save: ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    }
    // #(bulk-verdict) Todo 2b: stale an open grid ONLY when a VERDICT map actually moved (a new map ref, per the "next value
    // of the map I changed + current value of the others" discipline) — a notes-only save keeps both refs, so it must NOT
    // trash the reviewer's picks with a false "the review changed" abort. Computed BEFORE the commit (compares to the current refs).
    if (nextByCaseId !== reviewByCaseId || nextCriterionVerdicts !== criterionVerdicts) mvRevision++;
    reviewByCaseId = nextByCaseId; // commit in-memory only AFTER a successful persist
    notesByCaseId = nextNotes;
    criterionVerdicts = nextCriterionVerdicts;
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

  /** #224 ii.3 Slice 2b / #233 Todo 2b — apply a MODEL-LEVEL criterion verdict (right-click "Criterion encoding"), keyed by
   *  the criterion IDENTITY `(lib,name)`. The live canonical bodyHash is RE-RESOLVED from `criterionIdentities` at APPLY time
   *  (never a captured snapshot) — so a rebuild that removed/changed the criterion since the menu opened safely no-ops. On
   *  success persists (the 3rd sidecar map), repaints the chips on EVERY occurrence (no tree re-render), and refreshes the
   *  gate/chrome. `unreviewed` clears the verdict. Returns false (untouched) on any guard/persist failure. */
  function applyCriterionVerdict(lib: string, name: string, value: unknown, expectedBodyHash: string, seenElided: boolean): boolean {
    if (mode !== "medical-validation" || !mvSidecarPath) return false; // defensive: MV-only + a sidecar to persist into
    if (!isReviewState(value)) return false; // trusted-input guard
    const key = criterionVerdictKey(lib, name);
    // #(bulk-verdict): the guard policy (no such criterion → no-op; body CHANGED mid-menu → refuse ALL, never attest a body
    // the reviewer didn't see, disc 320; PASS on a SEEN-ELIDED occurrence → refuse, disc 330) lives in the shared pure
    // `computeCriterionVerdictUpdate` — so the single and bulk paths can't drift. The single path's elision source is the
    // IN-SITU occurrence the reviewer right-clicked (`seenElided`); the bulk path passes the CURRENT canonical `elided`.
    const upd = computeCriterionVerdictUpdate(criterionVerdicts, key, value, expectedBodyHash, criterionIdentities.get(key), seenElided);
    if (!upd.ok) return false;
    if (!persistMv(reviewByCaseId, notesByCaseId, upd.map)) return false; // save (all three maps) failed → memory + disk untouched
    driveCriterionVerdicts(); // repaint the verdict chips on every occurrence (no tree re-render)
    renderTreeChrome(); // the criteria gate/chrome half changed
    return true;
  }

  // ── #(bulk-verdict) Todo 5 (disc 366) — the "Review verdicts" bulk grid, now a `#flagDrawer` mode: open, apply, report ────

  /** Clear the grid's host state (snapshot = the mode token, applying, dirty). Does NOT post — the caller decides (a mode
   *  switch posts the new mode; `clearFlagDraft` posts empty). Folded into `clearFlagDraft` so RETARGET/reset/tree-pane-dispose
   *  drop the grid too — a queue enumerated from policy A must not survive into policy B (the fail-closed apply guards would
   *  otherwise discard the reviewer's work), and the drawer dies with a disposed tree pane (the old separate panel didn't). */
  function clearReviewGridState(): void {
    reviewGridSnapshot = undefined;
    reviewGridApplying = false;
    reviewGridDirty = false;
  }

  /** Build the OPEN-TIME work queue: the unsettled case + criterion review items (the pure enumerator). Criteria come from
   *  the SAME reachable gate walk `mvComplete`/`driveCriterionVerdicts` use (`criterionGateIdentities`); live cases from the
   *  reviewable frozen set (`scenarioByCaseId` keys, ≡ `reviewProgress`'s set); orphans fall out of `unsettledReviewItems`. */
  function enumerateReviewItems(): ReviewItem[] {
    const criteria = [...criterionGateIdentities(guardOutlines, criterionIdentities)].map(([key, id]) => ({
      key,
      lib: id.lib,
      name: id.name,
      bodyHash: id.bodyHash,
      elided: id.elided,
    }));
    return unsettledReviewItems({
      criteria,
      criterionVerdicts,
      liveCaseIds: [...scenarioByCaseId.keys()],
      reviewByCaseId,
      caseLabel: (caseId) => labelInPrimary(caseId, "cel").label, // an orphan's caseId isn't in celNav → falls back to the raw id
    });
  }

  /** Open (Q1: or toggle-CLOSE) the bulk-verdict grid in the `#flagDrawer` right flyout. MV-only + a saved sidecar +
   *  (accept #2) a LIVE tree view — the drawer lives in the tree webview, so no tree = no UI; we require it (else a note) and
   *  `reveal()` the tree pane, never capturing a snapshot until it's guaranteed. An empty queue does NOT open. A 2nd invoke
   *  toggle-CLOSES (union of the Q1 split: gated by the discard guard, never while applying — a re-open re-enumerates fresh,
   *  beating a stale-snapshot reveal). Opening clears the other three modes via the settle choke-point (a pending create
   *  elicitation is settled `{replaced}`) after `guardDrawerDiscard` (Claude #2: opening the grid over a dirty edit confirms
   *  first). Captures the items + retarget axes + `mvRevision` as the snapshot the apply resolves against (the mode token too). */
  async function openReviewGrid(): Promise<void> {
    if (mode !== "medical-validation" || !mvSidecarPath) {
      void vscode.window.showInformationMessage("Review verdicts is available in Medical Validation with a saved policy.");
      return;
    }
    const tree = views.get("tree");
    if (!tree) {
      void vscode.window.showInformationMessage("Open the Medical Validation tree pane, then try Review verdicts again.");
      return;
    }
    // Q1 union: a 2nd invoke while the grid is showing toggle-CLOSES — but NEVER mid-apply, and only after the discard guard.
    if (reviewGridSnapshot) {
      if (reviewGridApplying) return;
      if (!(await guardDrawerDiscard())) return;
      if (!reviewGridSnapshot) return; // a concurrent retarget/reset cleared it during the modal await
      clearReviewGridState();
      postFlagDrawer(); // empty region (grid was the open mode)
      return;
    }
    if (!(await guardDrawerDiscard())) return; // a dirty edit form must confirm before the grid clobbers it (one slot)
    // Re-validate after the (possibly modal) guard await — a retarget could have moved the world, or a concurrent invoke could
    // have already opened the grid (impl-review [important]: close the double-invoke residue — don't double-post the snapshot).
    if (mode !== "medical-validation" || !mvSidecarPath || reviewGridSnapshot) return;
    const liveTree = views.get("tree"); // RE-acquire (impl-review): the pre-await `tree` may be a disposed pane after a modal
    if (!liveTree) return;
    const items = enumerateReviewItems();
    if (items.length === 0) {
      void vscode.window.showInformationMessage("No unsettled case or criterion verdicts.");
      return;
    }
    liveTree.panel.reveal(liveTree.panel.viewColumn ?? vscode.ViewColumn.One, true); // bring the tree pane forward so the drawer is visible (no focus steal)
    settleDrawer({ status: "cancelled", reason: "replaced" }); // supersede any pending create elicitation (one slot)
    flagDraft = undefined;
    flagEditDraft = undefined;
    flagEditDirty = false;
    flagActionView = undefined;
    reviewGridSnapshot = { items, sidecarPath: mvSidecarPath, mode, cel: currentCel, revision: mvRevision, epoch: ++reviewGridEpoch };
    reviewGridApplying = false;
    reviewGridDirty = false;
    flagHlScrollPending = false; // the grid has no gold target node
    postFlagDrawer();
  }

  /** Cancel the grid drawer (its ✕/Cancel) — a deliberate discard (no confirm), clear + empty the region. Epoch-gated so a
   *  delayed Cancel from a torn-down session can't close a later reopen. */
  function cancelReviewGrid(epoch: unknown): void {
    if (!reviewGridSnapshot || reviewGridApplying || Number(epoch) !== reviewGridSnapshot.epoch) return;
    clearReviewGridState();
    postFlagDrawer();
  }

  /** Apply the grid's picks. The untrusted `{kind,id,state}[]` resolves against the captured snapshot. Guards, in order:
   *  mode/snapshot present; single-flight (`reviewGridApplying`); RETARGET (policy/mode/cel moved → a different policy's maps →
   *  abort + close, disc 347); REVISION (any MV persist since open → snapshot stale → abort + close). Then the pure
   *  `applyGridAssignments` (best-effort). `changed===0` → nothing to persist (report + close). On persist SUCCESS → clear +
   *  empty the drawer, repaint (worklist + selection + both overlays + chrome) + one bridge notify + report. On persist FAILURE
   *  → keep the drawer OPEN, post `reviewGridReenable` (clears the DOM `data-applying` so the picks survive), error already
   *  surfaced by `persistMv`. A retarget/revision abort NAMES the consequence (the unsaved picks are discarded). */
  function applyReviewGrid(raw: unknown, epoch: unknown): void {
    const snap = reviewGridSnapshot;
    if (!snap || reviewGridApplying) return;
    if (Number(epoch) !== snap.epoch) return; // impl-review [critical]: a delayed Apply from a torn-down session must not act on THIS snapshot
    const tree = views.get("tree");
    if (!tree) return; // no drawer to act on
    if (mode !== "medical-validation" || !mvSidecarPath || snap.sidecarPath !== mvSidecarPath || snap.mode !== mode || snap.cel !== currentCel) {
      clearReviewGridState();
      postFlagDrawer();
      void vscode.window.showWarningMessage("The policy changed since Review verdicts opened — your unsaved picks were discarded. Reopen it.");
      return;
    }
    if (snap.revision !== mvRevision) {
      clearReviewGridState();
      postFlagDrawer();
      void vscode.window.showWarningMessage("The review changed since Review verdicts opened — your unsaved picks were discarded. Reopen it.");
      return;
    }
    reviewGridApplying = true;
    const result = applyGridAssignments(raw, snap.items, {
      criterionVerdicts,
      reviewByCaseId,
      liveCriteria: buildLiveCriterionIdentities(), // the GATE set, matching the enumeration + mvComplete
      liveCaseIds: new Set(scenarioByCaseId.keys()), // the reviewable frozen set
    });
    if (result.changed === 0) {
      clearReviewGridState();
      postFlagDrawer();
      void vscode.window.showInformationMessage(reviewGridReport(result));
      return;
    }
    if (!persistMv(result.reviewByCaseId, notesByCaseId, result.criterionVerdicts)) {
      reviewGridApplying = false; // persistMv already surfaced the error; keep the drawer open so the picks survive
      void tree.panel.webview.postMessage({ type: "reviewGridReenable", epoch: snap.epoch, note: "Not saved — try again." });
      return;
    }
    // Persisted (mvRevision bumped inside persistMv). Clear the grid + empty the drawer, THEN repaint BOTH halves (a bulk
    // apply can touch cases AND criteria). Success-clear is unconditional here (the persist is synchronous, so no mode switch
    // can interleave), but we re-check the snapshot is still ours first (parity with the webview's top guard, cheap insurance).
    if (reviewGridSnapshot === snap) {
      clearReviewGridState();
      postFlagDrawer();
    } else {
      reviewGridApplying = false;
    }
    renderPane("worklist"); // no-op when the worklist pane is closed
    if (state.selection) dispatch({ type: "select", selection: state.selection }); // renders chrome (incl. the new gate/progress)…
    else renderTreeChrome(); // …else render it directly — either way chrome is posted ONCE, post-commit (no double-post, cf. applyVerdict)
    driveDoneOverlay(); // re-drive AFTER the select's possible tree re-render: the reviewed case set changed
    driveCriterionVerdicts(); // …and the criterion verdict chips changed
    cockpitAgentBridge.notifyChanged(); // #210: a bulk verdict/gate change must notify CRL Assist once
    void vscode.window.showInformationMessage(reviewGridReport(result));
  }

  /** A human report from a bulk apply: how many verdicts actually MOVED (`changed`, not `applied.length` — a re-applied
   *  verdict is a no-op) + a per-reason breakdown of what was skipped (a row that went stale/gone/truncated since open). */
  function reviewGridReport(result: BulkVerdictResult): string {
    const parts: string[] = [result.changed ? `${result.changed} verdict${result.changed === 1 ? "" : "s"} updated` : "No verdicts changed"];
    if (result.skipped.length) {
      const by = { "body-changed": 0, "not-live": 0, elided: 0 };
      for (const s of result.skipped) by[s.reason]++;
      const desc: string[] = [];
      if (by["body-changed"]) desc.push(`${by["body-changed"]} edited since opening`);
      if (by["not-live"]) desc.push(`${by["not-live"]} no longer in review scope`); // a case left the reviewable set OR a criterion left the reachable gate (not necessarily deleted)
      if (by.elided) desc.push(`${by.elided} truncated`);
      parts.push(`${result.skipped.length} skipped (${desc.join(", ")})`);
    }
    return `Review verdicts: ${parts.join("; ")}.`;
  }

  /** #233 Todo 2b — resolve a right-click reveal hit to the criterion IDENTITY it addresses, or `undefined` if it is not a
   *  criterion. TWO shapes: a ROOT criterion `when` ({nodeKey} whose guard outline's TOP expr is a criterion → derived via
   *  `topCriterion`) OR a NON-ROOT `flow-crit-row` ({criterionOccurrence}, identity carried in the reveal). `bodyHash` is the
   *  body the reviewer SAW (from the render) — the stale-guard baseline `applyCriterionVerdict` compares to the live hash. */
  function resolveCriterionFromReveal(revealKey: string): { lib: string; name: string; bodyHash: string; elided: boolean } | undefined {
    const hit = views.get("tree")?.reveals[revealKey];
    if (!hit) return undefined;
    if (isCriterionOccurrenceHit(hit)) return { ...hit.criterionOccurrence }; // non-root: identity + in-situ elided carried in the reveal
    if ("nodeKey" in hit) {
      const go = guardOutlines.get(hit.nodeKey);
      const tc = go ? topCriterion(go.expr) : undefined;
      if (tc) return { lib: tc.lib, name: tc.name, bodyHash: tc.bodyHash, elided: tc.elided === true }; // root: in-situ elided == canonical
    }
    return undefined;
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

  /** #224 ii.3 Slice 2b — the right-click MODEL-LEVEL criterion-encoding menu. DISTINCT vocab from the per-case verdict
   *  ("Correctly encoded / Encoding wrong / Undecided / Clear", never "Needs work") because it judges the criterion's
   *  ENCODING (one verdict shared across all occurrences + cases), not a single case's outcome. Resolves the nodeKey at
   *  menu-open; `applyCriterionVerdict` re-resolves the identity + live bodyHash so a rebuild mid-menu safely no-ops. */
  async function criterionEncodingMenu(revealKey: string): Promise<void> {
    const note = (msg: string): void => void vscode.window.setStatusBarMessage(`Medical Validation: ${msg}`, 3000);
    if (mode !== "medical-validation" || !mvSidecarPath) return note("not ready"); // no sidecar → can't persist
    // #233 Todo 2b: resolve the criterion identity from EITHER a root `when` ({nodeKey}→topCriterion) or a non-root crit-row
    // ({criterionOccurrence}). `ident.bodyHash` = the body the reviewer SAW; `live` = the current canonical facts (elided + state).
    const ident = resolveCriterionFromReveal(revealKey);
    if (!ident) return note("not a criterion node");
    const openHash = ident.bodyHash; // captured at open — the body the reviewer is judging (disc 320 review [important] 1)
    const openSidecar = mvSidecarPath; // captured at open — a policy switch during the pick must not write the old target
    const key = criterionVerdictKey(ident.lib, ident.name);
    const live = criterionIdentities.get(key); // canonical elided/hash NOW (for the current-state + elided-warning display)
    // disc 330 [nit] (Claude): a criterion REFERENCED but never DECLARED renders (named, `…`, bodyHash "sha256:missing") yet
    // has no inventory entry → nothing to attest. Say so, rather than the misleading "the criterion may have changed".
    if (!live) return note("this criterion isn't defined in the policy — nothing to review");
    const liveFacts = { bodyHash: live.bodyHash, elided: live.elided };
    const cur = criterionVerdictState(criterionVerdicts[key], liveFacts);
    // disc 330 [critical]: the reviewer can't attest a body they SAW ELIDED — this OCCURRENCE's in-situ `…` (e.g. inside a
    // breaching guard) OR a canonical elision. `applyCriterionVerdict` REFUSES a pass on it; disable the pass row + explain.
    const seenElided = ident.elided || liveFacts.elided;
    const opt = (label: string, value: ReviewState, desc?: string): vscode.QuickPickItem & { value: ReviewState } => ({
      label,
      value,
      ...(desc ? { description: desc } : {}),
    });
    const passDesc = seenElided ? "body truncated here — review where fully shown" : cur === "pass" ? "current" : undefined;
    const pick = await vscode.window.showQuickPick(
      [
        opt("$(pass) Correctly encoded", "pass", passDesc),
        opt("$(error) Encoding wrong", "fail", cur === "fail" ? "current" : undefined),
        opt("$(question) Undecided", "pending", cur === "pending" ? "current" : undefined),
        opt("$(circle-slash) Clear", "unreviewed", cur === "unreviewed" ? "current" : undefined),
      ],
      { placeHolder: `Criterion "${ident.name}" — encoding review (all occurrences)` },
    );
    if (!pick) return;
    if (mvSidecarPath !== openSidecar) return note("policy changed — reopen the menu"); // a retarget during the pick
    if (pick.value === "pass" && seenElided) return note("can't mark truncated criterion correctly encoded — review it where its body is fully shown");
    if (!applyCriterionVerdict(ident.lib, ident.name, pick.value, openHash, seenElided)) return note("couldn't save — the criterion may have changed; reopen the menu");
    note(
      pick.value === "unreviewed"
        ? "criterion verdict cleared"
        : `criterion "${ident.name}" marked ${pick.value === "pass" ? "correctly encoded" : pick.value === "fail" ? "encoding wrong" : "undecided"}`,
    );
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
    signature?: string; // #210 (disc 239): the occurrence's guard-path signature (`lib:name/lib:name`) — for the chip label/hover
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
    /** #210 (disc 239) — which drawer element to ring in CRL Assist purple (a field key, or "submit"). Auto-derived by the
     *  agent-open path; undefined for the human right-click (no ring). */
    focus?: string;
  }
  /** The in-flight draft: the prefill + the POLICY (`currentCel`) captured at open. Identity is `cel`/`mode`, NOT
   *  `indexVersion` — a same-policy rebuild must NOT invalidate the draft (the commit re-resolves on live text). */
  type FlagDraftState = FlagDraftPrefill & { cel: string | undefined };
  /** The structured result of `commitFlagDraft` (#210 Todo C) — `ok` = the flag was WRITTEN (regardless of the best-effort
   *  issue); `note` = the same human message the status bar shows; `ref` = the created issue (`#N`) when there is one. */
  interface FlagCommitOutcome { ok: boolean; note: string; ref?: string; }

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
      choices.push({ kind: "decision", name: occ.decision, lib: occ.lib, key: occurrenceKeyValue(occ), label: `${short} (${occ.signature})`, shortLabel: short, signature: occ.signature });
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
    // #224 ii.3 Slice 2b / #233 Todo 2b: a criterion offers a model-level "Criterion encoding…" review. TWO shapes: a ROOT
    // criterion `when` ({nodeKey} whose guard outline's TOP expr is a criterion, via topCriterion) OR a NON-ROOT crit-row
    // ({criterionOccurrence}). A root criterion `when` still yields its "this condition" OCCURRENCE flag choice (only the
    // concept OBJECT choice is suppressed), so `choices` is non-empty and it takes the full menu (verdict + encoding + flag).
    // A non-root crit-row is NOT a case-bearing node (no fired-path `when`) → it offers ONLY the encoding review.
    const rootGo = "nodeKey" in hit ? guardOutlines.get(hit.nodeKey) : undefined;
    const isCriterion = (rootGo !== undefined && topCriterion(rootGo.expr) !== undefined) || isCriterionOccurrenceHit(hit);
    const hasCaseVerdict = !isCriterionOccurrenceHit(hit);
    if (choices.length === 0 && !isCriterion) return nodeVerdictMenu(revealKey); // otherwise / use-decision → verdict only, unchanged
    if (choices.length === 0 && isCriterion && !hasCaseVerdict) return criterionEncodingMenu(revealKey); // non-root crit-row → straight to encoding (no single-item menu)
    const ver = indexVersion; // capture BEFORE the menu — a retarget mid-menu must not act on this (now-old) hit
    const cel = currentCel;
    // Verdict + (criterion) "Criterion encoding" + one "Add flag on <target>" per choice — a `when` offers BOTH the
    // concept (object) and this condition (occurrence); a leaf offers just this recommendation; a decision root just the decision.
    const pick = await vscode.window.showQuickPick(
      [
        ...(hasCaseVerdict ? [{ label: "$(checklist) Set case verdict…", act: "verdict" as const, choice: undefined as FlagTargetChoice | undefined }] : []),
        ...(isCriterion ? [{ label: "$(law) Criterion encoding…", act: "criterion" as const, choice: undefined as FlagTargetChoice | undefined }] : []),
        ...choices.map((c) => ({ label: `$(flag) Add flag on ${c.label}`, act: "flag" as const, choice: c as FlagTargetChoice | undefined })),
      ],
      { placeHolder: "Medical Validation" },
    );
    if (!pick) return;
    if (indexVersion !== ver || currentCel !== cel || mode !== "medical-validation") return flagNote("policy changed — reopen the menu");
    if (pick.act === "verdict") return nodeVerdictMenu(revealKey); // revealKey is gen-scoped; nodeVerdictMenu re-validates
    if (pick.act === "criterion") return criterionEncodingMenu(revealKey); // revealKey re-validated inside
    // Option A: the target is chosen HERE (native quick-pick); the drawer opens on the RESOLVED target. The webview never
    // names a target (trusted-input discipline). `openFlagDrawer` is a standalone seam — the editor agent (EPIC #210)
    // resolves the target itself and calls it directly, so the flag command has ONE entry point for both paths.
    if (pick.choice) {
      if (!(await guardDrawerDiscard())) return; // Todo 3/5: a new create drawer would abandon an in-progress edit OR the grid's picks — confirm first
      openFlagDrawer({ target: pick.choice });
    }
  }

  /** Post the current `flagDraft` to the tree pane's dedicated `#flagDrawer` region (or an EMPTY region to clear it). The
   *  region is a sibling of `#root`, so this never re-renders the flowchart (no overlay loss) and the render handler never
   *  wipes the drawer (a same-policy rebuild leaves the user's typed text intact). */
  function postFlagDrawer(): void {
    const tree = views.get("tree");
    if (!tree) return;
    // Only the human MV "Type" tags (a `displayName`) are offered — the AI-authoring extraction tags are hidden from the drawer.
    const mvTypes = flagTags().filter((t) => t.displayName !== undefined);
    // One-slot dispatcher (design 354; Todo 3 adds edit): create → edit → action → empty. Never more than one set (each open
    // clears the others via the settle choke-point) — this precedence is just a total order for the "both somehow set" impossibility.
    const editFlag = flagEditDraft?.flag;
    const html = flagDraft
      ? renderFlagDrawer({ targetLabel: flagDraft.target.shortLabel, targetTitle: flagDraft.target.label, tags: mvTypes, tag: flagDraft.tag, summary: flagDraft.summary, stub: flagDraft.stub, fields: flagDraft.fields, focus: flagDraft.focus })
      : editFlag
        ? // A gist CAN be multi-line (validateFlagFields permits it; the MCP create_flag path can file one) but the summary is a
          // single-line <input> whose value-sanitization would STRIP newlines — silently CONCATENATING words on save (impl-review
          // Claude #2). Normalize newlines → a space at prefill so the user SEES + saves exactly the single line that survives.
          // Todo 3.5: `descriptionOnly` (an AI flag) renders the trimmed description-only form instead of the full edit form.
          renderFlagDrawer({ targetLabel: editFlag.anchor.label, targetTitle: editFlag.anchor.label, tags: mvTypes, tag: editFlag.tag, summary: editFlag.gist.replace(/[\r\n]+/g, " "), stub: editFlag.description, fields: editFlag.fields, edit: true, descriptionOnly: flagEditDraft!.descriptionOnly })
        : flagActionView
          ? renderFlagActionDrawer(flagActionViewModel(flagActionView.flag))
          : // Todo 5 (disc 366): the bulk-verdict grid — the 4th mode. Renders FROM the snapshot (the one render authority, so the
            // dispatcher HTML and the apply-validation set can't diverge). INVARIANT: the grid HTML is posted exactly once per grid
            // session — no unconditional `postFlagDrawer` may re-post it (a re-post rebuilds the grid DOM, wiping the DOM-only picks;
            // every call site is a deliberate mode switch or a guarded no-op refresh, cf. `refreshFlagActionDrawer`).
            reviewGridSnapshot
            ? reviewGridHtml(reviewGridViewModel(reviewGridSnapshot.items), reviewGridSnapshot.epoch)
            : "";
    void tree.panel.webview.postMessage({ type: "flagDrawer", html });
    driveFlagNodeHighlight(); // disc 359/361: EVERY drawer mutation (create + action) funnels here → the gold node-link stays lockstep with the drawer
  }

  // The plumbing field keys the action drawer's read-only view never lists as an extra field: `ref` is rendered specially (the
  // Ref row + the Open-issue affordance), the rest are host/derived internals. UNLIKE flagDrawerHtml's HOST_MANAGED_FIELDS this
  // does NOT include `kind` — the read-only view SHOWS kind (+ any other discriminator field) per design 354 accept #7; the
  // create drawer hides it (AI-only authoring), but reading a filed flag should surface everything it carries.
  const FLAG_VIEW_PLUMBING = new Set(["ref", "key", "status", "system"]);

  // Todo 3 (disc 358 accept #3): the fields the EDIT form NEVER owns — host plumbing (ref/key/status/system) + `kind` (AI-only,
  // hidden from the drawer). On save these are PRESERVED verbatim from the on-disk record (mirrors flagDrawerHtml's
  // HOST_MANAGED_FIELDS, incl. kind — unlike FLAG_VIEW_PLUMBING). The form supplies only the NEW tag's VISIBLE discriminators.
  const EDIT_PRESERVED_FIELDS = new Set(["ref", "key", "status", "system", "kind"]);

  /** Build the read-only view model the action drawer renders from a stored `MvFlag`. Derives the display-only bits here (Type
   *  via `flagDisplayNameOf` with a raw-tag fallback, the occurrence signature via `parseOccurrenceKey`, the numeric issue no
   *  via `issueRefOf`) so the renderer stays pure. */
  function flagActionViewModel(flag: MvFlag): Parameters<typeof renderFlagActionDrawer>[0] {
    const a = flag.anchor;
    const anchorAddress = `${a.scope}:${a.name}${a.library ? ` "${a.library}"` : ""}`;
    const occurrenceSignature = a.occurrenceKey ? parseOccurrenceKey(a.occurrenceKey).signature : undefined;
    const fields: FlagActionField[] = Object.entries(flag.fields)
      .filter(([k, v]) => !FLAG_VIEW_PLUMBING.has(k) && v !== "")
      .map(([key, value]) => ({ key, value }));
    const issueNoStr = issueRefOf(flag.fields.ref);
    return {
      typeLabel: flagDisplayNameOf(flag.tag) ?? flag.tag, // extraction/legacy tags have no displayName → the raw tag id
      category: flag.category,
      status: flag.status,
      targetLabel: a.label,
      targetTitle: a.label,
      anchorAddress,
      occurrenceSignature,
      summary: flag.gist,
      description: flag.description,
      fields,
      issueRef: flag.fields.ref,
      issueNo: issueNoStr ? Number(issueNoStr) : undefined,
      createdAt: flag.createdAt,
      editedAt: flag.editedAt,
      id: flag.id,
      targetPresent: gidsForFlag(flag).length > 0, // disc 359: no charted node → auto-open Details + a note (the gold link can't point)
      descriptionOnly: flagDisplayNameOf(flag.tag) === undefined, // Todo 3.5: an AI/extraction flag edits ONLY its description (no retype)
    };
  }

  /** Open the flag-ACTION drawer on a host-captured record. Routes through the settle choke-point (design 354 [critical]): a
   *  create drawer may have a BLOCKING agent elicitation pending, so settle it `{replaced}` + drop the draft before showing the
   *  action drawer — a bare `flagDraft = undefined` would hang the agent. Mutual exclusion enforced here (one of the two open sites). */
  function openFlagActionView(flag: MvFlag, ver: number, cel: string | undefined): void {
    if (mode !== "medical-validation") return;
    settleDrawer({ status: "cancelled", reason: "replaced" }); // a new flyout supersedes any pending create elicitation
    flagDraft = undefined;
    flagEditDraft = undefined; // Todo 3: opening the action view supersedes an edit form (one slot)
    flagEditDirty = false;
    clearReviewGridState(); // Todo 5: …and the bulk grid (one slot). The list/node paths that reach here already ran guardDrawerDiscard.
    flagActionView = { flag, ver, cel };
    flagHlScrollPending = true; // an OPEN/SWITCH scrolls the gold-linked node into view once (postFlagDrawer→driveFlagNodeHighlight consumes it)
    postFlagDrawer();
  }

  /** Close the action drawer (UI clear only — it carries no agent elicitation). No-op when already closed. */
  function closeFlagActionView(): void {
    if (!flagActionView) return;
    flagActionView = undefined;
    postFlagDrawer(); // empty region
  }

  /** The ENTRY toggle (disc 359): reclicking the flag whose drawer is already open CLOSES it; a different flag SWITCHES. Used by
   *  the node-badge + list entry paths ONLY — NOT `openFlagActionView` itself (Todo 3's Cancel→return-to-view calls that directly
   *  and must not toggle-close). (Todo 3: a "lose changes" guard will gate the switch/close when an edit has unsaved text.) */
  function toggleFlagActionView(flag: MvFlag, ver: number, cel: string | undefined): void {
    if (flagActionView && flagActionView.flag.id === flag.id) return closeFlagActionView();
    openFlagActionView(flag, ver, cel);
  }

  /** Todo 3 / 3.5: enter the EDIT form for the open action drawer's flag. EVERY flag is editable — a human MV Type edits the
   *  whole flag; an AI/extraction (no `displayName`) or legacy tag edits ONLY its description (mode captured HERE from the tag,
   *  never from the untrusted payload, so a forged Save can't retype). Routes through the settle choke-point + clears the other
   *  modes (one slot). Captures `cel` + the mode only (no ver — the form survives a same-policy rebuild). */
  function openFlagEditDraft(): void {
    const view = flagActionView;
    if (!view || flagActionBusy) return;
    // Todo 3.5: EVERY flag is editable — a human MV Type edits the whole flag; an AI/extraction (no `displayName`) or legacy tag
    // edits ONLY its description (no silent retype). The mode is captured here so the form + the save agree.
    const descriptionOnly = flagDisplayNameOf(view.flag.tag) === undefined;
    settleDrawer({ status: "cancelled", reason: "replaced" });
    flagDraft = undefined;
    flagActionView = undefined;
    clearReviewGridState(); // Todo 5: Edit is reached only from the action view (grid can't be open) — belt-and-braces one-slot exclusion
    flagEditDirty = false;
    flagEditDraft = { flag: view.flag, cel: view.cel, descriptionOnly };
    flagHlScrollPending = true; // keep the target scrolled into view on the mode switch
    postFlagDrawer();
  }

  /** Todo 3: Cancel/✕ from the edit form → back to the action VIEW for the same flag (re-found by id in the refreshed list; a
   *  clean deletion → empty region + note; a store WARNING → keep the captured record). A deliberate discard — NO lose-changes
   *  prompt (that gates only an implicit SWITCH away, `guardDrawerDiscard`). */
  function cancelFlagEdit(): void {
    const draft = flagEditDraft;
    if (!draft || flagActionBusy) return;
    flagEditDraft = undefined;
    flagEditDirty = false;
    const live = flagsList.find((f) => f.id === draft.flag.id);
    if (live) return openFlagActionView(live, indexVersion, currentCel);
    if (flagStoreWarning) return openFlagActionView(draft.flag, indexVersion, currentCel); // unknown, not gone — keep the captured record
    postFlagDrawer(); // genuinely gone → empty region
    flagNote("the flag changed on disk — reopen it");
  }

  /** Todo 3 / Todo 5 — the drawer "lose changes" gate: when an implicit SWITCH away (a different flag / node badge / new create
   *  drawer / the grid) would abandon UNSAVED work, confirm first. Covers BOTH one-slot drawer modes that hold unsaved state: a
   *  dirty edit FORM (typed text) and a dirty verdict GRID (picks). At most one is open at a time (mutual exclusion), so one
   *  prompt at most. No unsaved work → proceed immediately. Returns whether to proceed. */
  async function guardDrawerDiscard(): Promise<boolean> {
    if (flagEditDraft && flagEditDirty) {
      const pick = await vscode.window.showWarningMessage("Discard your unsaved flag edits?", { modal: true }, "Discard");
      return pick === "Discard";
    }
    if (reviewGridSnapshot && reviewGridDirty) {
      const pick = await vscode.window.showWarningMessage("Discard your unsaved verdict picks?", { modal: true }, "Discard");
      return pick === "Discard";
    }
    return true;
  }

  /** Todo 3 — write an edited flag back to the store (disc 358). Order (accept #8): validate → clean re-read (reject store-
   *  warning / deletion) → field-ownership merge → `saveFlag` LOCAL → reload/badges/return-to-view → THEN best-effort GitHub
   *  relabel on a Type change. A form/store error keeps the edit form OPEN (typed text preserved); a vanished record closes it.
   *  Guard = `cel`+mode ONLY (accept #1 — the form survived a rebuild, so `ver` would be spuriously stale); Save re-reads by id. */
  async function saveFlagEdit(payload: { tag?: unknown; summary?: unknown; stub?: unknown; fields?: unknown }): Promise<void> {
    const draft = flagEditDraft;
    if (!draft || flagActionBusy) return;
    const fail = (m: string): void => flagNote(m); // keeps the edit form OPEN (no state change) so the user's text isn't lost
    const cel = draft.cel;
    const rawTag = typeof payload.tag === "string" ? payload.tag : "";
    const summary = typeof payload.summary === "string" ? payload.summary.trim() : "";
    const stub = typeof payload.stub === "string" ? payload.stub : "";
    const payloadFields: Record<string, string> = {};
    if (payload.fields && typeof payload.fields === "object") {
      for (const [k, val] of Object.entries(payload.fields as Record<string, unknown>)) if (typeof val === "string" && val.trim() !== "") payloadFields[k] = val.trim();
    }
    // Todo 3.5: the description-only form (an AI flag) posts no tag/summary — those guards apply to the FULL edit only.
    if (!draft.descriptionOnly) {
      if (rawTag === "") return fail("a type is required");
      if (summary === "") return fail("a summary is required");
      if (/[\r\n]/.test(summary)) return fail("the summary must be a single line");
    }
    if (currentCel !== cel || mode !== "medical-validation") return fail("policy changed — reopen the flag");

    flagActionBusy = true;
    try {
      const dir = currentCel ? flagStoreDir(currentCel) : undefined;
      if (!dir) return fail("no flag store for this policy");
      const loaded = loadStoredFlags(dir);
      if (loaded.warning) return fail("flag store unreadable — repair the corrupt record first"); // parity with writeFlagStatus/create
      const current = loaded.flags.find((f) => f.id === draft.flag.id);
      if (!current) {
        // gone on disk → close the edit form (typed text lost, accepted — accept #13) + refresh.
        flagEditDraft = undefined;
        flagEditDirty = false;
        reloadReviewFlags();
        renderTreeChrome();
        driveFlagBadges();
        postFlagDrawer();
        return void flagNote("the flag changed on disk — reopen it");
      }
      // Todo 3.5: the DESCRIPTION-ONLY save (an AI flag) — write ONLY the description; PRESERVE tag/gist/fields/status verbatim.
      // No `validateFlagFields` (nothing to validate), no field-ownership merge, no eligibility re-gate (an AI flag is expected to
      // be non-MV), no relabel (the Type didn't change). The description is free text — the store holds newlines fine.
      if (draft.descriptionOnly) {
        const desc = stub.trim();
        const updated: MvFlag = { ...current, editedAt: new Date().toISOString() };
        if (desc) updated.description = desc;
        else delete updated.description;
        try {
          saveFlag(dir, updated);
        } catch (e) {
          return fail(`could not write the flag: ${e instanceof Error ? e.message : String(e)}`);
        }
        reloadReviewFlags();
        renderTreeChrome();
        driveFlagBadges();
        flagEditDraft = undefined;
        flagEditDirty = false;
        openFlagActionView(flagsList.find((f) => f.id === updated.id) ?? updated, indexVersion, currentCel);
        return;
      }
      // Re-gate eligibility on the RE-READ record (accept #4; impl-review gpt56 #2): an external writer may have retyped this
      // flag to an extraction/legacy tag since the FULL form opened — saving would then retype a now-non-MV record back to an MV
      // Type. (Todo 3.5: the flag IS still editable after reopening — as the description-only form; hence "reopen", not "read-only".)
      if (flagDisplayNameOf(current.tag) === undefined) return fail("the flag type changed on disk — reopen it to edit");
      // Field ownership (accept #3): the form owns ONLY the NEW tag's VISIBLE discriminators (registry minus host-managed). The
      // untrusted payload is restricted to those keys HERE (not via the <select>). validateFlagFields (accept #6) canonicalizes
      // the tag + validates gist/fields; then PRESERVE the host/hidden fields + any field unknown to BOTH registries; DROP the
      // old tag's discriminators absent from the new tag.
      const newRuleKeys = new Set(flagFieldRulesOf(rawTag).map((r) => r.key)); // flagFieldRulesOf accepts an alias
      const oldRuleKeys = new Set(flagFieldRulesOf(current.tag).map((r) => r.key));
      const formFields: Record<string, string> = {};
      for (const [k, v] of Object.entries(payloadFields)) if (newRuleKeys.has(k) && !EDIT_PRESERVED_FIELDS.has(k)) formFields[k] = v;
      const val = validateFlagFields({ tag: rawTag, gist: summary, status: current.status, fields: formFields });
      if (!val.ok) return fail(`can't save: ${val.message}`);
      if (flagDisplayNameOf(val.canon) === undefined) return fail("that flag type can't be set here"); // never retype to a non-MV tag
      const preserved: Record<string, string> = {};
      for (const [k, v] of Object.entries(current.fields)) if (EDIT_PRESERVED_FIELDS.has(k) || (!oldRuleKeys.has(k) && !newRuleKeys.has(k))) preserved[k] = v;
      const mergedFields = { ...preserved, ...val.fields };
      const desc = stub.trim();
      const updated: MvFlag = { ...current, tag: val.canon, category: val.category, gist: val.gist, fields: mergedFields, editedAt: new Date().toISOString() };
      if (desc) updated.description = desc;
      else delete updated.description;
      try {
        saveFlag(dir, updated);
      } catch (e) {
        return fail(`could not write the flag: ${e instanceof Error ? e.message : String(e)}`);
      }
      reloadReviewFlags();
      renderTreeChrome();
      driveFlagBadges();
      const refStr = issueRefOf(current.fields.ref);
      const issueNo = refStr ? Number(refStr) : undefined;
      // Return to the action VIEW for the saved flag (re-found by id; falls back to the just-built record). Clears flagEditDraft.
      flagEditDraft = undefined;
      flagEditDirty = false;
      openFlagActionView(flagsList.find((f) => f.id === updated.id) ?? updated, indexVersion, currentCel);
      // Best-effort Type-relabel — INSIDE the busy try (impl-review gpt56 #1 [critical]): holding `flagActionBusy` through the
      // GitHub round-trip means a second Save can't start an OVERLAPPING relabel whose out-of-order PATCH would leave the issue
      // on an older Type than the store. Only a REAL Type change with a numeric ref (local save already succeeded regardless).
      if (val.canon !== current.tag && issueNo !== undefined) await relabelIssueForTypeChange(issueNo, val.canon, cel);
    } finally {
      flagActionBusy = false;
    }
  }

  /** Todo 3 — re-sync a flag's born-together GitHub issue after a Type change (best-effort; the local save already succeeded).
   *  Same trust/origin/token gates as create (incl. the 401 forced-refresh). A PATCH replaces the WHOLE label set, so GET the
   *  current labels + body, swap ONLY the `mv:*` label (never erase human/bot labels), re-sync the body's `**Type:**` line, PATCH.
   *  Any failure → a "flag saved; issue not updated (…)" note (never re-opens the drawer / never reverts the local save). */
  async function relabelIssueForTypeChange(issueNo: number, newTag: string, cel: string | undefined): Promise<void> {
    const noteFail = (why: string): void => flagNote(`flag saved; issue #${issueNo} not updated (${why})`);
    if (!vscode.workspace.isTrusted) return noteFail("workspace not trusted");
    const policySrc = cel ? findPolicySrc(cel) : undefined;
    const repo = policySrc ? await githubRepoForFile(vscode.Uri.file(join(policySrc, "crl"))) : undefined;
    if (!repo) return noteFail("no GitHub origin");
    const newLabel = flagLabelOf(newTag);
    const typeName = flagDisplayNameOf(newTag);
    // ONE relabel attempt with a given token — GET the current issue, swap the mv:* label + re-sync the Type line, PATCH.
    const attempt = async (token: string): Promise<{ ok: true } | { ok: false; status: number; reason: string }> => {
      const got = await getGithubIssue({ owner: repo.owner, repo: repo.repo, number: issueNo, token });
      if (!got.ok) return got;
      const labels = got.issue.labels.filter((l) => !l.startsWith("mv:")); // preserve every non-MV label; drop the old mv:* one
      if (newLabel) labels.push(newLabel.name);
      const body = typeName ? replaceIssueTypeLine(got.issue.body, typeName) : got.issue.body;
      return updateGithubIssue({ owner: repo.owner, repo: repo.repo, number: issueNo, token, labels, body });
    };
    const token = await githubToken();
    if (!token) return noteFail("not signed in to GitHub");
    let res = await attempt(token);
    if (!res.ok && res.status === 401) {
      // a stale cached token — force a fresh session + retry ONCE (the create path's contract).
      const fresh = await githubToken(true);
      if (fresh) res = await attempt(fresh);
    }
    if (res.ok) flagNote(`flag saved; issue #${issueNo} re-labeled`);
    else noteFail(res.reason);
  }

  /** Todo 4 (disc 363) — the action drawer's Delete: remove the local `medical-validation/flags/<id>.json` record and (best-effort) close its
   *  born-together GitHub issue as NOT PLANNED. Order (panel): take busy → clean re-read → derive close eligibility off the FINAL
   *  on-disk record (accept #7) → confirm (consequence-naming, honest) → post-confirm re-check + re-read → LOCAL delete → refresh →
   *  best-effort close. A local-delete failure keeps the flag + does NOT touch GitHub. Close eligibility: a numeric `ref`, the flag
   *  is NOT resolved (operator 2b — a resolved flag's work was done, `not_planned` would mislabel it), and NO other live flag
   *  references the same issue (operator 1b — several flags can share one AI/kit-created tracking issue). */
  async function deleteFlagFromDrawer(): Promise<void> {
    const view = flagActionView;
    if (!view || flagActionBusy) return;
    const cel = view.cel;
    if (currentCel !== cel || mode !== "medical-validation") return flagNote("policy changed — reopen the flag"); // upfront guard (Claude nit, mirrors saveFlagEdit)
    flagActionBusy = true; // set BEFORE the modal (impl-review gpt56 #4: rapid clicks can't stack confirmations)
    try {
      const dir = currentCel ? flagStoreDir(currentCel) : undefined;
      if (!dir) return flagNote("no flag store for this policy");
      // Clean re-read: eligibility comes from the FRESH on-disk load via the PURE helper — NOT the cached `flagsList` (impl-review
      // gpt56 #1 / Claude #2: a cached list lags the watcher, so a just-added sharing flag would be missed → a wrongful close).
      const load1 = loadStoredFlags(dir);
      const elig1 = flagCloseEligibility(load1.flags, Boolean(load1.warning), view.flag.id);
      if (!elig1.present) {
        // absent + warning → the target is among the unreadable set → block (repair first, disc 363 finding B); else already gone.
        if (load1.warning) return flagNote("flag store unreadable — repair the corrupt record first");
        closeFlagActionView();
        reloadReviewFlags();
        renderTreeChrome();
        driveFlagBadges();
        return flagNote("the flag was already removed");
      }
      const current = load1.flags.find((f) => f.id === view.flag.id)!;
      const summaryLabel = current.gist || flagDisplayNameOf(current.tag) || current.tag;
      // Name the exact remote consequence; be honest when the workspace-trust gate is already known-failed (disc 363 finding #6).
      const closeLine = !elig1.willClose
        ? ""
        : vscode.workspace.isTrusted
          ? ` CRL will also try to close linked issue #${elig1.issueNo} as not planned.`
          : ` (Its linked issue #${elig1.issueNo} won't be closed — the workspace isn't trusted.)`;
      const pick = await vscode.window.showWarningMessage(`Delete "${summaryLabel}"? The local flag can't be restored.${closeLine}`, { modal: true }, "Delete flag");
      if (pick !== "Delete flag") return; // Cancel / Esc → no-op (busy released in finally)
      // Post-confirm: the modal spanned an await — re-check identity + RECOMPUTE eligibility off the FINAL record (impl-review both:
      // a flag resolved / a sharing flag added DURING the modal must flip `willClose`, else 1b/2b are violated on the final record).
      if (!flagActionView || flagActionView.flag.id !== view.flag.id || currentCel !== cel || mode !== "medical-validation") return flagNote("policy changed — reopen the flag");
      const load2 = loadStoredFlags(dir);
      const elig2 = flagCloseEligibility(load2.flags, Boolean(load2.warning), view.flag.id);
      if (!elig2.present) {
        if (load2.warning) return flagNote("flag store unreadable — repair the corrupt record first");
        closeFlagActionView(); // vanished during the modal → already-deleted (never close an issue on a vanished record's snapshot)
        reloadReviewFlags();
        renderTreeChrome();
        driveFlagBadges();
        return flagNote("the flag was already removed");
      }
      if (elig2.refStr !== elig1.refStr) return flagNote("the flag changed on disk — reopen it"); // the named issue moved under us → reconfirm
      // LOCAL DELETE first (disc 363 finding #4/#8): a throw → note + drawer stays + GitHub is NEVER touched.
      try {
        removeFlag(dir, view.flag.id);
      } catch (e) {
        return flagNote(`could not delete the flag: ${e instanceof Error ? e.message : String(e)}`);
      }
      // localCommitted (disc 363 finding #8): the unlink succeeded — a THROW in the best-effort UI refresh must NOT skip the close +
      // its partial-close warning. Isolate the refresh; the store watcher reconciles a swallowed one.
      try {
        closeFlagActionView();
        reloadReviewFlags();
        renderTreeChrome();
        driveFlagBadges();
      } catch {
        /* best-effort UI refresh — the store watcher will reconcile; never suppress the close below */
      }
      flagNote("flag deleted");
      if (elig2.willClose && elig2.issueNo !== undefined && elig2.refStr !== undefined && vscode.workspace.isTrusted) {
        await closeIssueAsNotPlanned(elig2.issueNo, elig2.refStr, cel, view.flag.id);
      }
    } finally {
      flagActionBusy = false;
    }
  }

  /** Todo 4 — best-effort close of a deleted flag's born-together issue as NOT PLANNED (the local delete already succeeded).
   *  Guards (impl-review both arms): FAIL CLOSED on a store warning (sole ownership unprovable); leave the issue open if the
   *  record RESURFACED (finding #7) or ANOTHER flag now shares the ref (a sharing flag added after `load2`); never close a PULL
   *  REQUEST (a hand-entered PR ref); GET-first-skip-if-already-closed (finding #3 — don't clobber a human's `completed`). Same
   *  trust/origin/token gates + 401 retry as the relabel. A real failure → a PERSISTENT partial-close warning (the ref is gone). */
  async function closeIssueAsNotPlanned(issueNo: number, refStr: string, cel: string | undefined, deletedId: string): Promise<void> {
    const dir = cel ? flagStoreDir(cel) : undefined;
    if (dir) {
      const reload = loadStoredFlags(dir);
      if (reload.warning) return flagNote(`flag deleted; issue #${issueNo} left open — the flag store is unreadable`); // fail closed
      if (reload.flags.some((f) => f.id === deletedId)) return flagNote(`flag deleted, but issue #${issueNo} left open — the flag reappeared on disk`);
      if (reload.flags.some((f) => issueRefOf(f.fields.ref) === refStr)) return flagNote(`flag deleted; issue #${issueNo} left open — another flag still references it`);
    }
    const policySrc = cel ? findPolicySrc(cel) : undefined;
    const repo = policySrc ? await githubRepoForFile(vscode.Uri.file(join(policySrc, "crl"))) : undefined;
    if (!repo) return reportPartialClose(issueNo, cel, "no GitHub origin");
    const attempt = async (token: string): Promise<{ ok: true; skipped?: "closed" | "pr" } | { ok: false; status: number; reason: string }> => {
      const got = await getGithubIssue({ owner: repo.owner, repo: repo.repo, number: issueNo, token });
      if (!got.ok) return got;
      if (got.issue.isPullRequest) return { ok: true, skipped: "pr" }; // a hand-entered PR ref — NEVER PATCH-close someone's PR
      if (got.issue.state === "closed") return { ok: true, skipped: "closed" }; // already closed (a human's `completed`) → don't clobber
      return updateGithubIssue({ owner: repo.owner, repo: repo.repo, number: issueNo, token, state: "closed", stateReason: "not_planned" });
    };
    const token = await githubToken();
    if (!token) return reportPartialClose(issueNo, cel, "not signed in to GitHub");
    let res = await attempt(token);
    if (!res.ok && res.status === 401) {
      const fresh = await githubToken(true);
      if (fresh) res = await attempt(fresh);
    }
    if (res.ok) {
      flagNote(res.skipped === "pr" ? `flag deleted; #${issueNo} is a pull request — left open` : res.skipped === "closed" ? `flag deleted; issue #${issueNo} was already closed` : `flag deleted; issue #${issueNo} closed as not planned`);
    } else reportPartialClose(issueNo, cel, res.reason);
  }

  /** Todo 4 — a PERSISTENT partial-close warning (disc 363 finding #6): after the delete the `ref` is gone from the flag UI, so a
   *  3s note is inadequate — surface the issue number with a one-click Open bound to the CAPTURED policy `cel` (impl-review both:
   *  the warning outlives a retarget, so its recovery must not resolve #N against a DIFFERENT policy's tracker). */
  function reportPartialClose(issueNo: number, cel: string | undefined, why: string): void {
    void vscode.window.showWarningMessage(`Flag deleted, but issue #${issueNo} could not be closed (${why}).`, `Open issue #${issueNo}`).then((a) => {
      if (a) void openIssueNumber(issueNo, cel);
    });
  }

  /** Todo 4 — open a bare issue number in the tracker (the partial-close warning's recovery action). Resolves the base from the
   *  CAPTURED policy's `src/crl` (NOT the live `currentCel`, which may have retargeted since the warning appeared); no base → the
   *  settings prompt. */
  async function openIssueNumber(issueNo: number, cel: string | undefined): Promise<void> {
    const src = cel ? findPolicySrc(cel) : undefined;
    const fileUri = src ? vscode.Uri.file(join(src, "crl")) : flagRepoFileUri();
    const base = await resolveOrDetectIssueBase(fileUri);
    const url = buildIssueUrl(base, String(issueNo));
    if (!url) return promptSetIssueBase(String(issueNo));
    try {
      if (!(await vscode.env.openExternal(vscode.Uri.parse(url)))) flagNote(`could not open issue #${issueNo}`);
    } catch {
      flagNote(`could not open issue #${issueNo}`);
    }
  }

  /** Reconcile the open action drawer against the current `flagsList` (design 354 [important]): re-find the record by id and
   *  REPLACE the host-captured `flag` (not just the HTML) — else a stale status snapshot makes the next toggle a no-op — then
   *  re-render. RE-STAMPS `ver`/`cel` to the live policy identity (disc 355 [critical]): every call site is same-policy by
   *  construction (retarget/reset run clearFlagDraft first; the watcher checks watchedCel===currentCel), so a same-policy
   *  `rebuild()` that bumped `indexVersion` doesn't leave the drawer's actions failing a stale `ver` guard forever. Absence:
   *  a CLEAN store → genuine deletion → close with a note; a store WARNING (a transient/partial read — disc 355 [important]) →
   *  KEEP the record + re-render (state is UNKNOWN, not "changed"), mirroring writeFlagStatus's warning-blocks-the-write parity. */
  function refreshFlagActionDrawer(): void {
    if (!flagActionView) return;
    const live = flagsList.find((f) => f.id === flagActionView!.flag.id);
    if (!live) {
      if (flagStoreWarning) return postFlagDrawer(); // partial/unreadable store → keep the captured record (don't assert "deleted")
      closeFlagActionView();
      flagNote("the flag changed on disk — reopen it");
      return;
    }
    flagActionView = { flag: live, ver: indexVersion, cel: currentCel };
    postFlagDrawer();
  }

  /** #211 — open the create-flag drawer on a RESOLVED target (the ONE agent seam). Captures the policy identity for the
   *  commit stale-guards, then renders the drawer. Standalone: both the right-click (Option A) and the editor agent call
   *  this directly. MV-only. */
  function openFlagDrawer(prefill: FlagDraftPrefill): void {
    if (mode !== "medical-validation") return;
    settleDrawer({ status: "cancelled", reason: "replaced" }); // #210 (disc 239): a NEW drawer supersedes any pending elicitation
    flagActionView = undefined; // mutual exclusion: the create drawer supersedes an open action drawer (one `#flagDrawer` slot)
    flagEditDraft = undefined; // …and an open edit form (Todo 3)
    flagEditDirty = false;
    clearReviewGridState(); // …and the bulk grid (Todo 5). Human path guards (guardDrawerDiscard @ right-click); the agent seam REFUSES a dirty grid first.
    flagDraft = { ...prefill, cel: currentCel };
    postFlagDrawer();
  }

  /** Clear the drawer (drop the host draft + empty the webview region). Does NOT settle the agent elicitation — the terminal
   *  paths (Insert/Cancel/lifecycle) settle explicitly; closeFlagDrawer is just the UI clear (so commitFlagDraft's SUCCESS
   *  path, which calls this, doesn't pre-settle `cancelled`). */
  function closeFlagDrawer(): void {
    if (!flagDraft) return;
    flagDraft = undefined;
    postFlagDrawer(); // posts an empty region
  }

  // #210 (disc 239) — the settle-once choke-point + the auto-derive. See the `pendingDrawer` declaration.
  /** Settle the agent elicitation EXACTLY ONCE (idempotent: nulls before resolving + disposes the token sub). No-op when no
   *  agent open is pending. */
  function settleDrawer(outcome: ElicitationOutcome<FlagDrawerResult>): void {
    const p = pendingDrawer;
    if (!p) return;
    pendingDrawer = undefined;
    p.sub?.dispose();
    p.settle(outcome);
  }
  /** The choke-point every LIFECYCLE drop of the draft (retarget / reset / pane-dispose) routes through: settle any pending
   *  agent elicitation `{cancelled}` (else a blocking open HANGS) then clear the drawer UI. */
  function clearFlagDraft(reason: ElicitationCancelReason): void {
    settleDrawer({ status: "cancelled", reason });
    flagDraft = undefined;
    flagActionView = undefined; // a lifecycle drop (retarget / reset / dispose) clears the action drawer too — same `#flagDrawer` slot
    flagEditDraft = undefined; // …and the edit form (Todo 3) — a retarget/reset abandons an in-progress edit
    flagEditDirty = false;
    // Todo 5 (impl-review refine of design accept #1): a policy switch/reset with staged verdict picks discards them — NAME the
    // consequence (the design promised the abort tells the user). Skipped on "disposed" (the whole cockpit is closing → a toast is noise).
    if (reviewGridSnapshot && reviewGridDirty && reason !== "disposed") void vscode.window.showInformationMessage("The policy changed — your unsaved verdict picks were discarded.");
    clearReviewGridState(); // …and the bulk grid (Todo 5) — a retarget/reset/tree-pane-dispose stales the snapshot (the drawer dies with the pane)
    postFlagDrawer();
  }
  /** The drawer element to ring — AUTHORITATIVELY derived from the live prefill (the agent supplies no override): the first
   *  empty EXPECTED field (summary → description), else "submit". NOTE (gpt55 review): the plan's order also includes "any
   *  empty REQUIRED tag-field" before submit — a no-op for the sole current consumer (`validation-concern`'s `kind` is
   *  optional), so it's omitted here; a future flag tag with a required field would extend this to ring its `data-flag-field`. */
  function deriveFlagFocus(prefill: FlagDraftPrefill): string {
    if (!prefill.summary?.trim()) return "summary";
    if (!prefill.stub?.trim()) return "description";
    return "submit";
  }
  /** The static-banner line the host shows while the drawer is the open request — derived from the focus + the target. */
  function deriveFlagPurpose(focus: string, target: FlagTargetChoice): string {
    if (focus === "submit") return `Review and submit the flag on ${target.shortLabel}`;
    return `Fill out the ${focus === "summary" ? "summary" : "description"} to flag ${target.shortLabel}`;
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

  /** #211/#212 — commit the drawer's Insert: author a flag record in the `medical-validation/flags/` STORE whose issue is created "born
   *  together" (the #204 loop). Order (design review 233/250): stale-guard → validate via the shared seam
   *  (`validateAndBuildMvFlagDraft`, no ref) so a tag/field/decl error aborts with NO orphan issue → store-warning gate →
   *  resolve the github repo → auth → create the issue stub (best-effort; ANY failure → the flag is still written, without a
   *  `; ref`) → build via the seam WITH the ref (dedupKey reflects persisted content) + re-layer `description` → `saveFlag` to
   *  the store → refresh. The webview supplies only `{tag, summary, stub, fields}` (untrusted); the TARGET is the host-captured
   *  `flagDraft.target` (never named by the webview). */
  async function commitFlagDraft(payload: { tag?: unknown; summary?: unknown; stub?: unknown; fields?: unknown }): Promise<FlagCommitOutcome> {
    // Every exit keeps its human `flagNote`/`reportNoIssue` (the webview Insert path ignores the return); the STRUCTURED
    // outcome is for the #210 agent submit path, which reports it back in chat. `ok` = the flag was written (regardless of
    // whether the issue was created). `fail` folds the flagNote + the outcome so a form error surfaces both.
    const fail = (note: string): FlagCommitOutcome => (flagNote(note), { ok: false, note });
    const draft = flagDraft;
    if (!draft) return { ok: false, note: "no flag draft is open" };
    if (flagCommitting) return { ok: false, note: "a flag is already being submitted" }; // in-flight guard (gpt55 [critical])
    if (mode !== "medical-validation") {
      closeFlagDrawer();
      return { ok: false, note: "the Medical Validation cockpit is not open" };
    }
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
    if (summary === "") return fail("a summary is required");
    if (/[\r\n]/.test(summary)) return fail("the summary must be a single line");
    if (hasForbiddenGistChars(summary)) return fail("the summary can't contain a backtick or `;`");
    // Identity guard keyed on `currentCel`/`mode`, NOT `indexVersion`: a same-policy rebuild (a background save) bumps
    // indexVersion but the write re-resolves on LIVE text, so the draft must survive it (both reviewers). Only a DIFFERENT
    // policy / mode change means there's nothing to write — and that surfaces a note (never a silent drop).
    if (currentCel !== cel || mode !== "medical-validation") {
      closeFlagDrawer();
      return fail("policy changed — flag not added");
    }
    const decl = findDeclaration(target.kind, target.name, target.lib);
    if (!decl) {
      closeFlagDrawer();
      return fail(`couldn't locate ${target.kind} "${target.name}" in the .crl`);
    }
    // LOCK before the FIRST await (both reviewers [critical]): the top guard READS `flagCommitting`, so it MUST be SET
    // synchronously before any suspension — else two rapid Inserts (or an agent submit racing the still-live webview Insert
    // button) both pass the check, both await `openTextDocument`, and both POST + write (a duplicate issue). `finally`
    // releases it, so a form error / retry still works. `ref`/`issueNote` are hoisted so the catch/finally see them.
    let ref: string | undefined;
    let issueNote: string | undefined; // the "no issue link" reason — folded into the FINAL note, never overwritten (gpt55 [important])
    flagCommitting = true;
    try {
      let doc: vscode.TextDocument;
      try {
        doc = await vscode.workspace.openTextDocument(decl.filePath);
      } catch {
        return fail("couldn't open the .crl");
      }
      // VALIDATE via the shared seam (no ref) — catch unknown-tag / missing-field / invalid-value / decl-not-found /
      // parse-failed BEFORE any issue POST, so a form error never orphans a GitHub issue. Keep the drawer open on failure.
      // (Discard the built draft; the real record is built AFTER the POST, with the `ref`, so its dedupKey reflects the
      // persisted content — gpt55 [critical]: a single pre-POST build would bake a stale dedupKey.)
      const dry = validateAndBuildMvFlagDraft(doc.getText(), { kind: target.kind, name: target.name, library: target.lib }, { tag, gist: summary, fields, status: "open" });
      if (!dry.ok) return fail(`flag not added: ${dry.message}`);
      // Block BEFORE the issue POST if the store is already partially unreadable — don't file a GitHub issue + write a new
      // record while another corrupt record keeps flag state unknown (parity with the MCP tool; gpt55/Claude). The drawer
      // stays open so the user can repair + retry. A missing store dir is handled after the build.
      const preStoreDir = cel ? flagStoreDir(cel) : undefined;
      if (preStoreDir && loadStoredFlags(preStoreDir).warning) return fail("the flag store is unreadable — repair the corrupt record before adding a flag");
      // Create the issue stub (best-effort). github-origin-only + trusted workspace (an authenticated write to a
      // repo-controlled origin needs trust — same gate as the link-out); any failure → no ref, flag still written.
      if (!vscode.workspace.isTrusted) {
        issueNote = "workspace not trusted";
      } else if (currentCel !== cel || mode !== "medical-validation") {
        // A retarget during the (async) repo-resolve/auth must NOT create an issue for a policy the user left. Pre-POST
        // abort is safe — nothing external has happened yet.
        closeFlagDrawer();
        return fail("policy changed — flag not added");
      } else {
        // #212 S2 (C1): resolve the issue repo from the policy `src/crl` dir — the SAME source `flagRepoFileUri` (store link-out)
        // and bridgeReadReviewContext (issue-read) use — so a store flag's `; ref #N` is created against, and later resolved
        // against, ONE repo (a `decl.filePath` in a nested/submodule repo would drift create vs read; gpt55 [critical]).
        const policySrc = cel ? findPolicySrc(cel) : undefined;
        const repo = policySrc ? await githubRepoForFile(vscode.Uri.file(join(policySrc, "crl"))) : undefined;
        if (!repo) {
          issueNote = "no GitHub origin";
        } else if (currentCel !== cel || mode !== "medical-validation") {
          closeFlagDrawer();
          return fail("policy changed — flag not added");
        } else {
          try {
            const token = await githubToken();
            // Recheck AFTER the auth await — a sign-in prompt can stall while the user retargets; this is the LAST guard
            // before the POST, so a policy switch during sign-in never files an issue for the old target (gpt55 [critical]).
            if (currentCel !== cel || mode !== "medical-validation") {
              closeFlagDrawer();
              return fail("policy changed — flag not added");
            }
            if (!token) issueNote = "not signed in to GitHub";
            else {
              // Make the issue self-describing on GitHub's side: prefix the title with the artifact id (the reviewers'
              // hand-prefix, now automatic) and prepend a body header naming the artifact + flagged target. `policySrc` is
              // in fact always defined here (this branch is reached only when `repo` — resolved from it — is truthy); the
              // ternary is just TS narrowing over its `string | undefined` type. A missing policy id degrades to the bare
              // summary / target-only header (never a stray " - ").
              const policyId = policySrc ? policyIdFromSrc(policySrc) : undefined;
              // The MV Type (drives the issue LABEL + a `**Type:**` body line). PARTIAL lookup: an unlabeled/unknown tag → no
              // label + no Type line (never an error). `labels` is omitted when there's no MV label (createGithubIssue drops it).
              const typeName = flagDisplayNameOf(tag);
              const label = flagLabelOf(tag);
              const args = {
                owner: repo.owner,
                repo: repo.repo,
                title: flagIssueTitle(policyId, summary),
                body: flagIssueBody(policyId, { kind: target.kind, name: target.name, label: target.label }, stub, typeName),
                ...(label ? { labels: [label.name] } : {}),
              };
              try {
                ref = `#${await createGithubIssue({ ...args, token })}`;
              } catch (e1) {
                // 401 Bad credentials = a stale/invalid cached VS Code token. Force a FRESH session + retry ONCE.
                if (e1 instanceof IssueCreateError && e1.status === 401) {
                  const fresh = await githubToken(true);
                  if (!fresh) throw e1;
                  // Recheck after the SECOND auth await too (same stall window) before the retry POST.
                  if (currentCel !== cel || mode !== "medical-validation") {
                    closeFlagDrawer();
                    return fail("policy changed — flag not added");
                  }
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
      // #212 — the write goes to the `medical-validation/flags/` STORE. Build the record via the SHARED seam (validate → MvFlag; the SAME
      // path the MCP tool uses, so one validation path). Build AFTER the POST, WITH the `ref` (so the dedupKey reflects the
      // persisted content). Write to the CAPTURED policy's store even if the cockpit identity moved on (do NOT abort post-POST
      // — that would strand a created issue). S4 swaps the seam's validator; the cockpit is then untouched.
      const doc2 = await vscode.workspace.openTextDocument(decl.filePath);
      const withRef = ref ? { ...fields, ref } : fields;
      const built = validateAndBuildMvFlagDraft(doc2.getText(), { kind: target.kind, name: target.name, library: target.lib }, { tag, gist: summary, fields: withRef, status: "open" });
      if (!built.ok) {
        closeFlagDrawer();
        const note = ref ? `issue ${ref} created but the flag couldn't be validated (${built.message}) — try again` : `flag not added: ${built.message}`;
        flagNote(note);
        return { ok: false, note, ref };
      }
      const storeDir = cel ? flagStoreDir(cel) : undefined;
      if (!storeDir) {
        closeFlagDrawer();
        const note = ref ? `issue ${ref} created but this policy has no flag store — add the flag manually` : "no flag store for this policy";
        flagNote(note);
        return { ok: false, note, ref };
      }
      // Re-layer the drawer's multi-line `stub` as `description` — the seam doesn't carry it (it takes only tag/gist/fields),
      // and the store CAN hold it (unlike the lean `.crl` tag), so the #203 GAP-2 note isn't lost when no issue is created.
      const desc = stub.trim();
      const flag: MvFlag = { ...built.flag, ...(desc ? { description: desc } : {}) };
      try {
        saveFlag(storeDir, flag);
      } catch (e) {
        // A local write failure AFTER a possible issue POST — surface it honestly (never silently drop a real issue).
        closeFlagDrawer();
        const why = e instanceof Error ? e.message : String(e);
        const note = ref ? `issue ${ref} created but the flag couldn't be written (${why}) — add it manually` : `flag not added (${why})`;
        flagNote(note);
        return { ok: false, note, ref };
      }
      closeFlagDrawer();
      // Refresh only if the policy we wrote is still current (the store watcher also fires, but repaint immediately).
      if (currentCel === cel && mode === "medical-validation") {
        reloadReviewFlags();
        renderTreeChrome();
        driveFlagBadges();
      }
      if (ref) {
        const note = `issue ${ref} created; flag added on ${target.kind} "${target.name}"`;
        flagNote(note);
        return { ok: true, note, ref };
      }
      // The flag is written but NO issue was created. A transient status-bar note is too easy to miss (a reviewer just
      // wonders where the issue went), so surface a PERSISTENT warning with the exact reason + a one-click fix.
      const noIssueMsg = `Flag added on ${target.kind} "${target.name}", but no GitHub issue was created`;
      reportNoIssue(noIssueMsg, issueNote ?? "no issue link");
      return { ok: true, note: `${noIssueMsg} (${issueNote ?? "no issue link"})` };
    } catch (e) {
      // Any unexpected throw AFTER a possible POST (openTextDocument/applyEdit/save/loadFlags reject) — surface it honestly,
      // never silent. If an issue was already created, say so + tell the user to add the flag manually.
      closeFlagDrawer();
      const why = e instanceof Error ? e.message : String(e);
      const note = ref ? `issue ${ref} created but the flag couldn't be written (${why}) — add it manually` : `flag not added (${why})`;
      flagNote(note);
      return { ok: false, note, ref };
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
    // #(pass-all): set EVERY case in the loop to Pass in ONE persist (operator ask). Overwrites a case already Fail/Pending
    // (the re-shown list makes any such flip visible + individually fixable); skips ones already Pass; only LIVE cases.
    // #(pass-all): Pass every UNREVIEWED ("To do") case in the loop in ONE persist — NON-destructive by operator decision: a
    // deliberate Fail/Pending (or an existing Pass) is LEFT untouched, so "Pass all" can never overwrite a real judgment.
    // "unreviewed" is never STORED (setReviewState deletes the key; absence = To do), so key-absence IS the unreviewed test.
    const unreviewedLive = (): string[] =>
      caseIds.filter((caseId) => scenarioByCaseId.has(caseId) && !(caseId in reviewByCaseId));
    const passAll = (): void => {
      const { map, changed } = setAllReviewState(reviewByCaseId, unreviewedLive(), "pass");
      if (changed === 0) return; // nothing unreviewed/live → nothing to persist
      if (!persistMv(map, notesByCaseId)) return; // save failed → memory + disk untouched (persistMv surfaced the error)
      renderPane("worklist");
      if (state.selection) dispatch({ type: "select", selection: state.selection });
      else renderTreeChrome();
      driveDoneOverlay(); // the reviewed set changed → repaint the tree done overlay
    };
    if (caseIds.length === 1) return pickVerdict(caseIds[0]);
    for (;;) {
      if (stale()) return staleNote();
      const rows = caseIds.map((caseId) => ({ label: nameOf(caseId), description: `verdict: ${verdictLabel(caseId)}`, caseId }));
      // A DISCRIMINANT field (not an overloaded sentinel caseId) routes the pick — collision-proof against any real caseId.
      // Offered ONLY when something is actually unreviewed (a dead "Pass all" when everything's decided is noise); its count
      // is exact, so the operator sees Fail/Pending are left alone.
      const todo = unreviewedLive().length;
      const passAllItem = { label: `$(check-all) Pass all`, description: `set the ${todo} unreviewed case${todo === 1 ? "" : "s"} to ${REVIEW_LABEL.pass} (leaves ${REVIEW_LABEL.fail}/${REVIEW_LABEL.pending} as-is)`, passAll: true as const };
      const items = todo > 0 ? [passAllItem, ...rows] : rows;
      const pick = await vscode.window.showQuickPick(items, { placeHolder: "Pick a case to set its verdict (Esc to finish)" });
      if (!pick) return; // Esc ends the loop — deliberate cancel, no note
      if (stale()) return staleNote();
      if ("passAll" in pick) {
        passAll();
        continue; // re-show the list (the passed cases now read Pass) so the operator sees the result + can Esc or tweak
      }
      if (!scenarioByCaseId.has(pick.caseId)) return staleNote(); // revalidate BEFORE opening the verdict picker (don't drive a stale second picker)
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

  /** Show a panel, optionally on a target supplied by the CALLER (#244). `rawTarget` is whatever the command was invoked
   *  with: KELP's entity-folder Uri, the `editor/title` button's resource Uri, or nothing (palette/keybinding). All of the
   *  resolution policy lives in `resolveLaunchTarget`; this function is the presentation + concurrency shell. */
  function runShow(targetMode: "cockpit" | "medical-validation", rawTarget?: unknown): void {
    const target = resolveLaunchTarget(rawTarget);

    const label = targetMode === "medical-validation" ? "Medical Validation" : "the CRL cockpit";

    if (target.kind === "error") {
      // Supplied but unresolvable → fail LOUDLY (agreed with KELP). Never a silent picker fallback: that would present a
      // mis-wired caller as ordinary behaviour.
      //
      // Deliberately does NOT take an epoch and does NOT cancel a pending pick (#244 impl review): this launch opened
      // nothing, so superseding would deliver NEITHER intent — the user's own in-flight pick would be silently voided by
      // someone else's bad path. A failed launch supersedes nothing.
      void vscode.window.showErrorMessage(`CRL: cannot open ${label} — ${target.detail}`);
      return;
    }

    if (target.kind === "cel") {
      showEpoch += 1; // supersede any pending pick — explicit intent wins
      cancelActivePick(); // …and take it off screen, so it can't be chosen into a void
      openPanel(targetMode, target.celPath);
      return;
    }

    if (target.kind === "ambiguous") {
      // Several `.cel`s under ONE policy (a normal layout, not a fault). Offer exactly those — scoped to the policy the
      // caller named, never the whole workspace. `pickCel` cancels any previous pick as it opens.
      const epoch = (showEpoch += 1);
      const items = target.cels.map((p) => ({
        label: basename(p),
        description: vscode.workspace.asRelativePath(p, false),
        value: p,
      }));
      void pickCel(items, `Pick a .cel in ${basename(dirname(target.policySrc))}`).then(
        (cel) => {
          if (epoch !== showEpoch) return; // a later show superseded this pick
          if (cel) openPanel(targetMode, cel);
        },
        (e) => console.warn(`[crl.cockpit] scoped pick failed: ${e instanceof Error ? e.message : e}`),
      );
      return;
    }

    // No usable target → today's behaviour: active `.cel`, else the workspace-wide picker. First-wins between two
    // UNTARGETED shows (FIX 6): the active user keeps their in-progress pick. The marker is set SYNCHRONOUSLY, because
    // `pickCelForPanel` awaits `findFiles` before any picker exists — gating on `activePick` alone would let two shows
    // through that window. Ownership is by epoch, so a stale continuation can never clear a newer show's marker.
    if (untargetedEpoch !== undefined) return;
    const epoch = (showEpoch += 1);
    untargetedEpoch = epoch;
    const release = (): void => {
      if (untargetedEpoch === epoch) untargetedEpoch = undefined;
    };
    void pickCelForPanel(epoch).then(
      (cel) => {
        release();
        if (epoch !== showEpoch) return; // superseded by a later (targeted) show — do NOT retarget away from it
        if (cel) openPanel(targetMode, cel);
      },
      (e) => {
        release(); // must run on the failure path too, or every later untargeted show is silently swallowed
        console.warn(`[crl.cockpit] pick failed: ${e instanceof Error ? e.message : e}`);
      },
    );
  }

  // Both commands accept an optional caller-supplied target. `...args` rather than `(target?)` so the registration is
  // explicit that anything beyond the first argument is ignored, and an absent argument is the same as `undefined`.
  const showCmd = vscode.commands.registerCommand("crl.cockpit.show", (...args: unknown[]) =>
    runShow("cockpit", args[0]),
  );
  const showMedicalValidationCmd = vscode.commands.registerCommand("crl.medicalValidation.show", (...args: unknown[]) =>
    runShow("medical-validation", args[0]),
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

  /** #224 ii.3 Slice 2 / #233 Todo 2a: flip a criterion's collapse state and re-render the TREE pane only — collapse
   *  changes the flow LAYOUT (the criterion body appears/disappears), so it needs a re-render, not a CSS re-apply like
   *  zoom. `collapseKey` is a ROOT criterion's `when` nodeKey (a JSON array) OR a NON-ROOT criterion's `leaf::` position
   *  key (`{criterionToggle}`); both live in the one `expandedGuardWhens` set (disjoint keyspaces). Mirrors
   *  `applyShowKeys`'s tail: the tree ack re-drives every overlay, and re-dispatching the selection restores the
   *  highlight the innerHTML swap dropped. Ephemeral: `expandedGuardWhens` is not persisted. */
  function toggleCriterionExpand(collapseKey: string): void {
    if (expandedGuardWhens.has(collapseKey)) expandedGuardWhens.delete(collapseKey);
    else expandedGuardWhens.add(collapseKey);
    renderPane("tree");
    if (state.selection) dispatch({ type: "select", selection: state.selection });
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

  // #(tree-snapshot) Todo 2 — capture the tree pane's CURRENT painted DOM (WYSIWYG) via a gated round-trip. Returns the
  // screened + declutter-stripped `#root` markup, or a human `note` for every refusal (no tree / still rendering / already
  // exporting / timeout / the tree changed mid-capture / a payload our renderer never emits). See disc 323.
  async function captureTreeDom(): Promise<{ ok: true; html: string } | { ok: false; note: string }> {
    const tree = views.get("tree");
    if (!tree) return { ok: false, note: "open the tree pane first" };
    if (!model) return { ok: false, note: "open a policy first — there's no decision tree to export" };
    if (!tree.acked) return { ok: false, note: "the tree is still rendering — try again" }; // acked ⇒ the overlay drives have RUN (posted before this request → FIFO-ahead of it), so the captured DOM is fully overlaid — the same host→webview ordering the overlay system relies on
    if (snapshotCapture.pending) return { ok: false, note: "a snapshot export is already in progress" };
    // FREEZE the identity so a re-render / policy retarget during the round-trip can't hand back a superseded DOM or mislabel it.
    const capturedTree = tree;
    const capturedGen = tree.gen;
    const capturedCel = currentCel;
    const token = randomUUID();
    const done = snapshotCapture.begin(token);
    // Install the timeout FIRST (so a synchronous postMessage throw can't strand the capture pending), then post. Every
    // failure path settles by TOKEN (`resolve(token, undefined)`) so a slow/late delivery of THIS capture can't abort a LATER
    // one — the un-scoped `settleEmpty` is reserved for the disposal aborts (Claude disc 324 [important]).
    const timer = setTimeout(() => snapshotCapture.resolve(token, undefined), 3000);
    try {
      if ((await tree.panel.webview.postMessage({ type: "requestSnapshot", token })) === false) snapshotCapture.resolve(token, undefined);
    } catch {
      snapshotCapture.resolve(token, undefined); // a dead webview / synchronous throw → fail fast, don't burn the timeout
    }
    const raw = await done;
    clearTimeout(timer);
    if (raw === undefined) return { ok: false, note: "couldn't capture the tree (it may still be rendering) — try again" };
    // The capture must still be OF the tree/policy the user is looking at — a render/retarget mid-round-trip invalidates it.
    if (views.get("tree") !== capturedTree || capturedTree.gen !== capturedGen || currentCel !== capturedCel) {
      return { ok: false, note: "the tree changed while capturing — try again" };
    }
    const screened = screenCapturedDom(raw); // trust boundary: the payload crossed the webview→host channel into a CSP-inline file
    if (!screened.ok) return { ok: false, note: screened.reason };
    // Refuse a placeholder / non-flow render (a failed retarget or a decision-less policy) — don't hand a customer a junk file
    // titled "…decision tree" holding only a placeholder paragraph (Claude disc 324 [important]).
    if (!screened.html.includes('class="flow-svg"')) return { ok: false, note: "the tree is empty — nothing to export" };
    return { ok: true, html: screened.html }; // the webview already stripped the ephemeral rings on its clone
  }

  /** #(tree-snapshot) Todo 2 — the command: capture the current tree → wrap into a self-contained HTML file (Todo 1) → save
   *  dialog → write UTF-8 → offer to open in a browser. Every failure surfaces (status bar for a soft refusal, an error
   *  message for a write/open failure); a cancelled save dialog is a silent no-op. */
  async function exportTreeSnapshot(): Promise<void> {
    if (snapshotExporting) return void vscode.window.setStatusBarMessage("Tree snapshot: an export is already in progress", 3000);
    snapshotExporting = true;
    try {
      const cap = await captureTreeDom();
      if (!cap.ok) return void vscode.window.setStatusBarMessage(`Tree snapshot: ${cap.note}`, 4000);
      const src = currentCel ? findPolicySrc(currentCel) : undefined;
      const policyId = (src ? policyIdFromSrc(src) : undefined) ?? policyLabel(); // policy-dir identity, else the .cel basename
      const html = renderFlowSnapshotDocument({ flowHtml: cap.html, styleCss: FLOW_STYLE, title: `${policyId ?? "decision"} — decision tree` });
      const defaultDir = src ?? (currentCel ? dirname(currentCel) : undefined); // policy src dir, else the .cel's own dir (multi-root safe — NOT the first workspace folder)
      const defaultUri = defaultDir ? vscode.Uri.file(join(defaultDir, snapshotFileName(policyId))) : undefined;
      const target = await vscode.window.showSaveDialog({ defaultUri, filters: { "HTML page": ["html"] }, title: "Export tree snapshot" });
      if (!target) return; // cancelled — silent
      try {
        await vscode.workspace.fs.writeFile(target, Buffer.from(html, "utf8"));
      } catch (e) {
        return void vscode.window.showErrorMessage(`Tree snapshot: could not save to ${target.fsPath}: ${e instanceof Error ? e.message : String(e)}`);
      }
      const pick = await vscode.window.showInformationMessage(`Tree snapshot saved: ${basename(target.fsPath)}`, "Open in browser");
      if (pick === "Open in browser") {
        let opened = false;
        try {
          opened = await vscode.env.openExternal(target);
        } catch {
          opened = false;
        }
        if (!opened) void vscode.window.showWarningMessage("Tree snapshot saved, but the browser couldn't be opened.");
      }
    } finally {
      snapshotExporting = false;
    }
  }
  // A top-level catch is the final backstop: any unexpected rejection (a dialog API throw, etc.) surfaces instead of becoming
  // an unhandled rejection swallowed by `void`.
  const exportTreeSnapshotCmd = vscode.commands.registerCommand("crl.cockpit.exportTreeSnapshot", () =>
    void exportTreeSnapshot().catch((e) => vscode.window.showErrorMessage(`Tree snapshot: ${e instanceof Error ? e.message : String(e)}`)),
  );
  // #(bulk-verdict) Todo 2b: the palette + tree-chrome entry to the bulk verdict grid (guards MV/sidecar/empty inside).
  const reviewVerdictsCmd = vscode.commands.registerCommand("crl.cockpit.reviewVerdicts", () => void openReviewGrid());

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
  // #210 Todo C — the CRL Assist agent bridge. Live-derived (reads mode/currentCel/flagAnchor/views at call time). The
  // agent perceives the flag anchor via `getAppState` and proposes a flag via `openFlagDrawer` (which guards the tree pane,
  // re-resolves the DETERMINISTIC opaque target id against the live choices, and validates the `kind` against the registry
  // enum). It never writes CRL — it opens the SAME drawer the right-click does; the human confirms + submits.
  const policyLabel = (): string | undefined =>
    currentCel ? basename(currentCel).replace(/\.(cel|crl)$/i, "") : undefined;
  const validationKinds = (): string[] => {
    const vc = flagTags().find((t) => t.id === "validation-concern");
    return vc?.fields.find((f) => f.key === "kind")?.values?.slice() ?? [];
  };
  // The anchor's flag targets, re-derived LIVE (empty unless MV + a policy-matching anchor + the tree pane is open).
  const anchorChoices = (): FlagTargetChoice[] => {
    if (mode !== "medical-validation" || !flagAnchor || flagAnchor.cel !== currentCel || !views.get("tree")) return [];
    return flagTargetChoices(flagAnchor.hit);
  };
  // #210 Todo D (disc 241, impl review) — a case is verdict-settable iff MV + a sidecar to persist into + it's in the LIVE
  // reviewable set. The SHARED accept predicate: `getAppState.selectedCase` (badge availability) uses it so the "Set verdict"
  // badge can't show for a case `bridgeSetVerdict` (which guards MV + `mvSidecarPath`) would reject (I1 — the mvSidecarPath half).
  const canReviewCase = (caseId: string): boolean => mode === "medical-validation" && !!mvSidecarPath && scenarioByCaseId.has(caseId);
  const getAppState = (): CockpitAppState | undefined => {
    // No MV cockpit if not in MV mode OR every pane was closed (A16 — the chip hides on a full cockpit close, not lingering
    // on "no tree pane"; `mode` stays MV after the last pane disposes, so the `views.size` check is what drops it).
    if (mode !== "medical-validation" || views.size === 0) return undefined;
    const choices = anchorChoices();
    const flagTargets: FlagTargetView[] = choices.map((c) => ({
      id: flagTargetId({ cel: currentCel, kind: c.kind, lib: c.lib, name: c.name, key: c.key }),
      label: c.label,
      shortLabel: c.shortLabel,
    }));
    // The chip label + hover (operator feedback): DROP the leading "this", and instead of the full colon-separated signature
    // show `<type> (<LAST segment>)` — the last colon-segment is the node actually in context (e.g. "condition (BMI Qualifies)").
    // The hover bullets each segment on its own line (the node path as a readable vertical list). Concept/decision anchors
    // have no signature → the short label as-is.
    let anchorLabel: string | null = null;
    let anchorTitle: string | null = null;
    if (choices.length) {
      const c = choices.find((x) => x.key) ?? choices[0];
      const type = c.shortLabel.replace(/^this /, "");
      if (c.signature) {
        // The signature is the guard chain `lib:name/lib:name/…` ("/"-separated steps, a leaf's activity via "→"), each step
        // LIBRARY-QUALIFIED. Split on the path (normalize "→"→"/"), then STRIP the "lib:" prefix per step — the repeated
        // library name is noise for this display (operator). → clean node names; the chip shows the LAST (the node in context).
        const segs = c.signature
          .replace(/→/g, "/")
          .split("/")
          .map((s) => (s.includes(":") ? s.slice(s.lastIndexOf(":") + 1) : s).trim())
          .filter(Boolean);
        anchorLabel = `${type} (${segs[segs.length - 1] ?? c.signature})`;
        anchorTitle = [type, ...segs.map((s) => `• ${s}`)].join("\n");
      } else {
        anchorLabel = type;
        anchorTitle = type;
      }
    }
    // #210 Todo D (disc 241): the selected review case (the set_verdict target). Non-null ONLY for a case the bridge would
    // ACCEPT — `canReviewCase` mirrors `bridgeSetVerdict`'s guards (MV + a sidecar to persist into + live membership), so the
    // "Set verdict" badge (isAvailable = !!selectedCase) never shows for a case set_verdict would reject (disc 241 I1; the
    // `mvSidecarPath` half caught in impl review — a non-policy .cel renders selectable cases but has no sidecar). A SHARED
    // predicate keeps the two sites from drifting. Tree-INDEPENDENT. The `token` embeds `currentCel` (no cross-policy collision — C2).
    const sel = state.selection;
    const selectedCase: SelectedCaseView | null =
      sel && sel.primary === "cel" && canReviewCase(sel.caseId)
        ? {
            token: caseTokenId(currentCel, sel.caseId),
            label: labelInPrimary(sel.caseId, "cel").label,
            verdictLabel: REVIEW_LABEL[reviewByCaseId[sel.caseId] ?? "unreviewed"],
          }
        : null;
    return { policy: policyLabel(), anchorLabel, anchorTitle, flagTargets, treePaneOpen: !!views.get("tree"), selectedCase };
  };
  // Resolve the agent's args → a drawer prefill (shared by open + submit): guard MV + the tree pane, re-resolve the opaque
  // target_id against the LIVE choices, and validate the kind against the registry enum. `error` becomes an isError result.
  const resolveFlagPrefill = (args: OpenFlagDrawerArgs): { prefill: FlagDraftPrefill } | { error: string } => {
    if (mode !== "medical-validation") return { error: "the Medical Validation cockpit is not open" };
    if (!views.get("tree")) return { error: "open the Medical Validation tree pane, then try again" };
    const choices = anchorChoices();
    if (!choices.length) return { error: "no flaggable node is selected — click a decision or condition in the tree first" };
    const match = choices.find((c) => flagTargetId({ cel: currentCel, kind: c.kind, lib: c.lib, name: c.name, key: c.key }) === args.targetId);
    if (!match) return { error: `no current flag target matches that id — the selection changed. Current targets: ${choices.map((c) => c.shortLabel).join("; ")}` };
    const kind = args.validationKind?.trim();
    if (kind && !validationKinds().includes(kind)) {
      const kinds = validationKinds();
      return { error: kinds.length ? `invalid kind "${kind}" — choose one of: ${kinds.join(", ")}` : `invalid kind "${kind}" — no validation kinds are configured` };
    }
    return { prefill: { target: match, tag: "validation-concern", summary: args.summary, stub: args.description, fields: kind ? { kind } : undefined } };
  };
  // #210 (disc 239) — open the flag drawer as a BLOCKING elicitation. TWO-PHASE: a SYNC guard fail returns `{error}` (no
  // drawer, no banner — the tool surfaces a recoverable isError); success opens the drawer (auto-deriving the purple focus
  // ring + the banner), installs the resolver (settled EXACTLY ONCE on every terminal), and returns `{wait, purpose}`.
  const bridgeBeginFlagDrawer = (args: OpenFlagDrawerArgs, token: CancelToken): BeginFlagDrawer => {
    // impl-review (both arms): the agent's `openFlagDrawer` bypasses the human `guardDrawerDiscard`, so REFUSE while a human has
    // unsaved edits OR unsaved verdict picks rather than silently clobbering the work — the agent reports this back instead.
    if (flagEditDraft && flagEditDirty) return { error: "the validator has unsaved flag edits — try again after they save or cancel" };
    if (reviewGridSnapshot && reviewGridDirty) return { error: "the validator has unsaved verdict picks — try again after they apply or cancel" }; // Todo 5
    const r = resolveFlagPrefill(args);
    if ("error" in r) return { error: r.error };
    const focus = deriveFlagFocus(r.prefill); // AUTHORITATIVE (first empty of summary→description, else "submit")
    const purpose = deriveFlagPurpose(focus, r.prefill.target);
    openFlagDrawer({ ...r.prefill, focus }); // settles any pending {replaced} + posts the drawer with the ring
    const wait = new Promise<ElicitationOutcome<FlagDrawerResult>>((resolve) => {
      pendingDrawer = { settle: resolve, sub: token.onCancellationRequested(() => settleDrawer({ status: "cancelled", reason: "stopped" })) };
      // Robust regardless of the token's late-subscription timing: VS Code fires an ALREADY-cancelled token's listener on a
      // LATER tick (setTimeout(0)), not synchronously — so settle NOW if it's already cancelled (a stranded resolver would
      // hang the agent). settleDrawer is idempotent, so the later async fire is a harmless no-op. Stop leaves the drawer OPEN.
      if (token.isCancellationRequested) settleDrawer({ status: "cancelled", reason: "stopped" });
    });
    return { wait, purpose };
  };
  const bridgeSubmitFlag = async (args: OpenFlagDrawerArgs): Promise<SubmitFlagResult> => {
    if (flagEditDraft && flagEditDirty) return { ok: false, reason: "the validator has unsaved flag edits — try again after they save or cancel" };
    if (reviewGridSnapshot && reviewGridDirty) return { ok: false, reason: "the validator has unsaved verdict picks — try again after they apply or cancel" }; // Todo 5
    const r = resolveFlagPrefill(args);
    if ("error" in r) return { ok: false, reason: r.error };
    const summary = args.summary?.trim();
    if (!summary) return { ok: false, reason: "a one-line summary is required to file the flag — ask the validator for it" };
    // Open the drawer prefilled (settles any pending elicitation {replaced} via openFlagDrawer), then commit via the SAME
    // guarded path the human Insert uses (dry-run → best-effort issue → byte-safe write). No resolver installed (autonomous).
    openFlagDrawer(r.prefill);
    const outcome = await commitFlagDraft({ tag: "validation-concern", summary, stub: args.description, fields: r.prefill.fields });
    // `issued` = an issue was already created before the write failed → the agent must NOT retry (would POST a duplicate).
    return outcome.ok ? { ok: true, message: outcome.note } : { ok: false, reason: outcome.note, issued: !!outcome.ref };
  };
  // #210 Todo D (disc 241) — set a case's verdict via the SHARED guarded persist path (`applyVerdict`). Re-resolve the opaque
  // `caseToken` → the live caseId by hashing each reviewable caseId under the CURRENT cel. This writes the case the AGENT NAMED
  // (the token it was given), NOT the live selection — so a mid-turn re-selection can't redirect the write (C2). A token whose
  // case is GONE (removed on rebuild, or a cross-policy retarget → a different cel hashes differently) finds NO match → rejected.
  // COLLISION-SAFE (gpt55 impl review): `caseTokenId` is a 32-bit djb2, so require EXACTLY ONE match — 0 = gone, >1 = an
  // (astronomically rare) intra-policy hash collision → reject as ambiguous rather than write the wrong case. Synchronous: no
  // await between resolve + apply, so no `pickVerdictLoop`-style stale-guard is needed (applyVerdict re-checks MV + sidecar
  // synchronously). Reasons are pre-classified (bad verdict / no-or-ambiguous match / save fail) for the agent to relay + retry
  // (I3/I4). notifyChanged so the agent's NEXT perception reflects the new verdict (applyVerdict's same-case re-select does not
  // fire the dispatch emitter — C1 gate).
  const bridgeSetVerdict = (args: SetVerdictArgs): SetVerdictResult => {
    if (mode !== "medical-validation" || !mvSidecarPath) return { ok: false, reason: "the Medical Validation cockpit is not open — open it first" };
    if (!isReviewState(args.verdict)) return { ok: false, reason: `"${args.verdict}" is not a valid verdict — use pass, fail, pending, or unreviewed.` };
    const matches = [...scenarioByCaseId.keys()].filter((id) => caseTokenId(currentCel, id) === args.caseToken);
    if (matches.length !== 1) {
      return {
        ok: false,
        reason:
          matches.length === 0
            ? "that case is no longer the reviewable selection — ask the validator to re-select the case, then try again."
            : "that case reference is ambiguous — ask the validator to re-select the case, then try again.",
      };
    }
    const caseId = matches[0];
    if (!applyVerdict(caseId, args.verdict)) return { ok: false, reason: "the verdict could not be saved (the review sidecar write failed) — it was NOT changed." };
    cockpitAgentBridge.notifyChanged();
    return { ok: true, message: `${labelInPrimary(caseId, "cel").label} → ${REVIEW_LABEL[args.verdict]}` };
  };
  // #210 Todo D slice 2 — assemble the READ-ONLY review context for the "where do we stand" synthesis. Purpose-bound (no
  // args). Captures `currentCel` ONCE; text is CAPPED at assembly (it's committed + re-sent every turn); the flag-linked
  // issues are fetched best-effort under a HARD `isTrusted` gate + SILENT auth + an abortable GET (the turn token / a timeout
  // can't strand the agent). A retarget across the single async window degrades to "policy changed".
  const REVIEW_CTX = { SOURCE_CAP: 40_000, CRL_CAP: 60_000, ISSUE_BODY_CAP: 8_000, ISSUE_TIMEOUT_MS: 8_000, MAX_ISSUES: 20 };
  const TRUNC_MARK = "\n…(truncated)";
  // Cap is a HARD budget: slice to leave room for the marker so the result never EXCEEDS `cap` (the whole context is committed
  // + re-sent every turn — gpt55 nit). `cap` ≥ the marker length for the review caps.
  const capText = (s: string, cap: number): { text: string; truncated: boolean } =>
    s.length <= cap ? { text: s, truncated: false } : { text: s.slice(0, Math.max(0, cap - TRUNC_MARK.length)) + TRUNC_MARK, truncated: true };
  const bridgeReadReviewContext = async (token: CancelToken): Promise<ReviewContextResult> => {
    if (mode !== "medical-validation" || !currentCel) return { ok: false, reason: "no Medical Validation cockpit is open" };
    if (!correspondence) return { ok: false, reason: "the policy model isn't loaded yet — try again in a moment" };
    const cel = currentCel; // capture ONCE — the whole assembly (incl. the async fetch) is validated against this
    const src = findPolicySrc(cel);
    // Source (in memory) + CRL (concat of <src>/crl/*.crl via crlText), both CAPPED. Collect per-file read errors.
    const source = capText(correspondence.anchor.text ?? "", REVIEW_CTX.SOURCE_CAP);
    const crlErrors: string[] = [];
    let crlRaw = "";
    if (src) {
      let files: string[] = [];
      try {
        files = readdirSync(join(src, "crl")).filter((f) => f.toLowerCase().endsWith(".crl")).sort();
      } catch (e) {
        if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") crlErrors.push("the crl/ directory is unreadable");
      }
      for (const name of files) {
        const t = crlText(join(src, "crl", name));
        if (t === undefined) {
          crlErrors.push(`${name}: unreadable`);
          continue;
        }
        // Report a PARSE failure too (the type promises read+parse errors) — but STILL include the text so the synthesis can
        // reason over what's there; an unparseable `.crl` is a caveat, not an omission.
        const parsed = buildCRL(t);
        if (!parsed.success || !parsed.result) crlErrors.push(`${name}: unparseable`);
        crlRaw += `\n=== ${name} ===\n${t}\n`;
      }
    } else {
      // No policy `src/` located → empty CRL. Say so, so the synthesis distinguishes "the logic is empty" from "couldn't find
      // the source dir" (Claude impl review — the crlErrors "don't invent a path around an unknown source" guard needs a signal).
      crlErrors.push("couldn't locate the policy source directory");
    }
    const crl = capText(crlRaw.trim(), REVIEW_CTX.CRL_CAP);
    // Review status — the pure helpers (the exact composition the tree chrome uses) + per-case detail. Snapshot `flagStateError`
    // ONCE (used for BOTH the mvComplete gate and the exposed field, so a same-policy reload mid-fetch can't tear them — Claude nit).
    const flagStateErrorSnapshot = flagStateError;
    const resolvedCount = flagsList.filter((f) => f.status === "resolved").length;
    const progress = reviewProgress(reviewByCaseId, [...scenarioByCaseId.keys()], scenarios?.scenarios.length ?? 0);
    const fc = { open: flagsList.length - resolvedCount, resolved: resolvedCount, error: flagStateErrorSnapshot };
    const cases: ReviewContextCase[] = [...scenarioByCaseId].map(([caseId, sv]) => ({
      label: labelInPrimary(caseId, "cel").label,
      runStatus: sv.status ?? "",
      verdict: REVIEW_LABEL[reviewByCaseId[caseId] ?? "unreviewed"],
    }));
    const refNum = (f: MvFlag): number | null => {
      const r = issueRefOf(f.fields.ref); // the digit STRING (or undefined for a non-numeric ref)
      const n = r !== undefined ? Number(r) : NaN;
      return Number.isInteger(n) && n > 0 ? n : null; // a positive issue number only (never `#0` → a pointless /issues/0 GET)
    };
    const flags: ReviewContextFlag[] = flagsList.map((f) => ({
      status: f.status,
      scope: f.anchor.scope,
      target: f.anchor.name,
      concern: f.gist,
      issue: refNum(f),
    }));
    const unresolvedRefs = flagsList.filter((f) => f.fields.ref && issueRefOf(f.fields.ref) === undefined).length;
    // The deduped flag-linked issue numbers, CAPPED (several flags often share one tracking issue — a dup is a wasted read; and
    // an unbounded set would commit a huge payload + fire a large concurrent GET burst — both reviewers).
    const allRefs = [...new Set(flags.map((f) => f.issue).filter((n): n is number => n !== null))];
    const refs = allRefs.slice(0, REVIEW_CTX.MAX_ISSUES);
    const issuesOmitted = allRefs.length - refs.length;
    // Fetch them best-effort — HARD trust gate (a repo-controlled origin + an authed GET needs trust, like the create path),
    // SILENT auth (no mid-turn modal), abortable (turn token OR an 8s timeout).
    let issues: ReviewContextIssue[] = [];
    let issuesNote: string | undefined;
    // Interrupted = the turn was cancelled OR the policy retargeted mid-read; checked after EACH await so an already-cancelled
    // / between-await cancel bails fast (the awaits themselves are normally fast — silent getSession + in-memory getRepository;
    // a genuine hang is the create path's shared residual). GET hangs are bounded by the AbortController below.
    const interrupted = (): boolean => token.isCancellationRequested || currentCel !== cel || mode !== "medical-validation";
    if (refs.length) {
      if (!vscode.workspace.isTrusted) issuesNote = "workspace not trusted — issues not read";
      else {
        const repo = src ? await githubRepoForFile(vscode.Uri.file(join(src, "crl"))) : undefined;
        if (interrupted()) return { ok: false, reason: "the read was interrupted (policy changed or cancelled) — ask again" };
        if (!repo) issuesNote = "no GitHub origin — issues not read";
        else {
          const tok = await githubTokenSilent();
          if (interrupted()) return { ok: false, reason: "the read was interrupted (policy changed or cancelled) — ask again" };
          if (!tok) issuesNote = "not signed in to GitHub — sign in to include issue details";
          else {
            const ac = new AbortController();
            const timer = setTimeout(() => ac.abort(), REVIEW_CTX.ISSUE_TIMEOUT_MS);
            const sub = token.onCancellationRequested(() => ac.abort());
            if (token.isCancellationRequested) ac.abort(); // already-cancelled: the structural token fires its listener async, so abort now
            try {
              issues = await Promise.all(
                refs.map(async (n): Promise<ReviewContextIssue> => {
                  const r = await getGithubIssue({ owner: repo.owner, repo: repo.repo, number: n, token: tok, signal: ac.signal });
                  return r.ok
                    ? { number: n, ok: true, title: r.issue.title, body: capText(r.issue.body, REVIEW_CTX.ISSUE_BODY_CAP).text, state: r.issue.state, isPullRequest: r.issue.isPullRequest }
                    : { number: n, ok: false, reason: r.reason };
                }),
              );
            } finally {
              clearTimeout(timer);
              sub.dispose();
            }
            if (interrupted()) return { ok: false, reason: "the read was interrupted (policy changed or cancelled) — ask again" };
          }
        }
      }
    }
    // Note the capped-out issues (only meaningful when we actually fetched — a degrade note already explains a no-read).
    if (issuesOmitted > 0) issuesNote = `${issuesNote ? issuesNote + "; " : ""}${issuesOmitted} more linked issue(s) not read (cap ${REVIEW_CTX.MAX_ISSUES})`;
    return {
      ok: true,
      context: {
        policy: policyLabel() ?? cel,
        sourceText: source.text,
        sourceTruncated: source.truncated,
        crlText: crl.text,
        crlTruncated: crl.truncated,
        crlErrors,
        status: {
          progress: { total: progress.total, passed: progress.passed, failed: progress.failed, pending: progress.pending, unreviewable: progress.unreviewable, stale: progress.stale },
          // #224 ii.3 Slice 2b: the agent's perceived gate must ALSO honor the criterion half (else it reports "complete"
          // while a criterion encoding is unreviewed/wrong/stale). Same live-identities tally the chrome uses.
          mvComplete: mvComplete(progress, fc, criterionProgress(buildLiveCriterionIdentities(), criterionVerdicts)),
          cases,
          flags,
          flagStateError: flagStateErrorSnapshot,
          unresolvedRefs,
        },
        issues,
        issuesNote,
      },
    };
  };
  context.subscriptions.push(
    cockpitAgentBridge.register({
      getAppState,
      beginFlagDrawer: bridgeBeginFlagDrawer,
      submitFlag: bridgeSubmitFlag,
      setVerdict: bridgeSetVerdict,
      readReviewContext: bridgeReadReviewContext,
      getValidationKinds: validationKinds,
    }),
  );

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
    exportTreeSnapshotCmd,
    reviewVerdictsCmd,
    onSave,
    onConfig,
    {
      dispose: () => {
        watcher?.dispose();
        flagsWatcher?.dispose();
        snapshotCapture.settleEmpty(); // #(tree-snapshot): a pending capture must not outlive the cockpit
        if (debounce) clearTimeout(debounce); // a pending rebuild/reorder must not fire on disposed panels
        if (flagsDebounce) clearTimeout(flagsDebounce);
        if (orderDebounce) clearTimeout(orderDebounce);
      },
    },
  );
}

/** Hermetic webview shell (strict CSP + nonce). Swaps #root on `render` + acks `ready`; `highlight` (gen-checked) toggles
 *  `.current` + scrolls; clicks on `[data-reveal]` post the opaque key back. No external resources. */
/**
 * The per-pane Content-Security-Policy. Pure + exported so the policy is string-testable, like
 * COCKPIT_WEBVIEW_SCRIPT below.
 *
 * Every pane is nonce-only TODAY and this returns one string for all of them. It exists as a seam because the
 * `$apply` questionnaire pane will need `style-src 'unsafe-inline' <cspSource>` — LForms is an Angular Elements
 * build that injects ~7 unnonced <style> elements at runtime, and a nonce present alongside `'unsafe-inline'`
 * makes browsers ignore the latter, so the nonce must be DROPPED rather than supplemented. That is the ONLY
 * directive that needs to change: `script-src` stays nonce-only (the vendored bundles carry no eval/new
 * Function) and `default-src` stays `'none'`. Measured on Desktop AND the web workbench — see
 * media/lforms/README.md.
 *
 * Because each pane is its own WebviewPanel with its own document, that relaxation lands in ONE pane and leaves
 * every other pane nonce-only.
 */
export function cockpitPaneCsp(
  pane: Pane,
  a: { nonce: string; styleNonce: string; cspSource: string },
): string {
  if (pane === "fhirQuestionnaire") {
    // The style nonce is DROPPED, not supplemented: a nonce present makes browsers ignore 'unsafe-inline',
    // so keeping both would silently remain nonce-only and LForms would render unstyled. `cspSource` is needed
    // for the vendored styles.css <link>, which style-src also governs. Measured clean on Desktop AND the web
    // workbench.
    //
    // `img-src ${cspSource}` (added when the producer contract was pinned to ALL R4 item types): `styles.css`
    // pulls two LOCAL images — down_arrow_gray_10_10.png and magnifying_glass.png, the autocompleter's dropdown
    // arrow and search icon — which appear for `choice`/`open-choice` items. The earlier group/boolean fixture
    // never requested one, which is why this stayed shut and looked clean. The image set is CLOSED: the vendored
    // files contain no other image reference, no @font-face, and no remote asset host, so this needs no `data:`
    // and no widening later. (The one `data:` image route is markdown-it's link validator, reachable only via
    // `rendering-markdown`/`rendering-xhtml` item text — contracted OUT on the producer side, not allowed here.)
    //
    // `connect-src` stays SHUT via default-src. The bundles carry live fetch/XHR call sites (ValueSet expansion,
    // external autocomplete); this pane does no computation, so it must do no fetching. See
    // `unrenderableQuestionnaireFeatures` for the host-side detector that makes that constraint LOUD.
    return `default-src 'none'; img-src ${a.cspSource}; style-src 'unsafe-inline' ${a.cspSource}; script-src 'nonce-${a.nonce}';`;
  }
  return `default-src 'none'; style-src 'nonce-${a.styleNonce}'; script-src 'nonce-${a.nonce}';`;
}

/**
 * The emitter's directory-name derivation: lowercase, non-alphanumerics collapsed to `-`, trimmed.
 *
 * Pure + exported so the ONE thing that decides whether a case's artifacts are found at all is pinned by tests
 * against real directory names. Applied to a case's FULL AUTHORED NAME (arrow suffix included) it yields the
 * case artifact directory; applied to a library name plus `-cases` it yields the library segment.
 */
export const artifactSlug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Questionnaire features this pane CANNOT render, found before handing the resource to LForms.
 *
 * Every one of these fails SILENTLY or near-silently — an empty dropdown, a missing widget, a six-second stall —
 * which is the failure shape this pane has been bitten by three times. The producer contract (#277) forbids them;
 * this is the detector that makes a contract breach loud instead of leaving a clinician to notice a control that
 * never populates.
 *
 * Each entry was verified against the VENDORED bundle, not assumed:
 *
 *   - `answerValueSet` — `loadAnswerValueSets` tries a terminology server, then `LForms.fhirContext.client`, then
 *     REJECTS ("A terminology server or a FHIR server is needed"). This shell configures neither, on purpose, so
 *     the reject fires with no network attempt and `connect-src` never even enters it. A CONTAINED ValueSet is no
 *     escape: `_expandContainedValueSet` still POSTs to a server rather than reading `expansion.contains` locally.
 *   - `preferredTerminologyServer` — the one input that makes LForms actually attempt a fetch, which `connect-src`
 *     then blocks. Detecting it beats discovering it as a CSP violation nothing displays.
 *   - `answerExpression` / `x-fhir-query` — SDC population extensions; both need a FHIR context that is absent.
 *   - item type `reference` — `_getDataType`'s switch has no case for it, so it returns the initializer `"string"`,
 *     which is not an LForms dataType (`ST` is) and matches no renderer branch: no widget, no throw, no violation.
 *   - `rendering-xhtml` / `rendering-markdown` carrying an image — the only `data:` image route in the bundle
 *     (markdown-it's link validator allows `data:image/(gif|png|jpeg|webp)`), and `img-src` deliberately excludes
 *     `data:`, so the image is blocked.
 *
 * Pure + exported so the list is unit-testable without a webview.
 */
export function unrenderableQuestionnaireFeatures(q: unknown): string[] {
  const found = new Set<string>();
  const at = (o: Record<string, unknown>): string =>
    typeof o.linkId === "string" && o.linkId ? ` (linkId ${o.linkId})` : "";

  const walk = (node: unknown, depth: number): void => {
    if (depth > 64 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1);
      return;
    }
    const o = node as Record<string, unknown>;

    if (typeof o.answerValueSet === "string") {
      const contained = o.answerValueSet.startsWith("#");
      found.add(
        `answerValueSet${at(o)} — answer lists must arrive fully expanded as inline answerOption; ` +
          (contained
            ? "a contained ValueSet is still expanded via a server, not read locally"
            : "no terminology server or FHIR context is configured in this pane"),
      );
    }
    if (o.type === "reference" && typeof o.linkId === "string") {
      found.add(`item type 'reference'${at(o)} — the vendored LForms converter maps it to no widget, silently`);
    }
    if (typeof o.url === "string") {
      const u = o.url;
      if (u.endsWith("preferredTerminologyServer")) {
        found.add("preferredTerminologyServer extension — the pane blocks outbound requests (connect-src)");
      }
      if (u.endsWith("sdc-questionnaire-answerExpression")) {
        found.add("answerExpression extension — needs a FHIR context this pane does not provide");
      }
      if ((u.endsWith("rendering-xhtml") || u.endsWith("rendering-markdown")) && typeof o.valueString === "string") {
        if (/<img\b|data:image\//i.test(o.valueString)) {
          found.add(`${u.split("/").pop()} with an embedded image — img-src does not permit data: images`);
        }
      }
    }
    const expr = o.valueExpression;
    if (expr !== null && typeof expr === "object" && !Array.isArray(expr)) {
      if ((expr as Record<string, unknown>).language === "application/x-fhir-query") {
        found.add("x-fhir-query expression — needs a FHIR context this pane does not provide");
      }
    }

    for (const v of Object.values(o)) walk(v, depth + 1);
  };

  walk(q, 0);
  return [...found].sort();
}

/**
 * The pane-specific pieces of the shell document, split by WHERE they must go. Pure + exported because every
 * silent failure this pane has had lived here, and none of them was catchable by typecheck or by the message
 * tests — each presented identically, as "LForms is undefined" over a blank pane:
 *
 *   - vendor scripts in <head> → they run before <body> exists, LForms throws on `document.body.appendChild`
 *     and never defines its global;
 *   - `zone.min.js` after `lhc-forms.js` → Angular never bootstraps (the bundle deliberately excludes Zone.js);
 *   - the error hooks after the scripts they exist to observe → the cause is unreported;
 *   - a nonce on the <link> → under this pane's `style-src 'unsafe-inline' <cspSource>` (nonce DROPPED) a
 *     nonced link would be blocked, and the form renders unstyled rather than failing loudly.
 *
 * Every one of those is a change a reasonable refactor would make, so they are pinned by tests rather than by
 * comments alone.
 */
export function paneShellFragments(
  pane: Pane,
  a: { nonce: string; asset: (f: string) => string },
): { head: string; bodyScripts: string } {
  if (pane !== "fhirQuestionnaire") return { head: "", bodyScripts: "" };
  const head =
    // Capture-phase error listener FIRST, before anything it needs to observe. THREE distinct failure channels
    // that do not overlap: a 404 gives an `error` whose target has a src; a script that loads then THROWS gives
    // an `error` with no target src; a CSP-blocked script raises `securitypolicyviolation` and neither of the
    // others. Listening to one makes the other two indistinguishable from "loaded fine and defined nothing".
    `<script nonce="${a.nonce}">window.__aqErrs=[];` +
    `window.addEventListener('error',function(e){var t=e&&e.target;` +
    `if(t&&(t.src||t.href)){window.__aqErrs.push('404 '+String(t.src||t.href).split('/').pop());}` +
    `else{window.__aqErrs.push('threw '+((e&&e.message)?e.message:'(no message)'));}},true);` +
    `document.addEventListener('securitypolicyviolation',function(e){window.__aqErrs.push('CSP '+e.violatedDirective+' blocked '+String(e.blockedURI||'').split('/').pop());});` +
    // FOURTH channel, added with the all-item-types contract. The three above are all SYNCHRONOUS; LForms fails
    // asynchronously in the paths the wider contract reaches. `loadAnswerValueSets` rejects outright when no
    // terminology server and no FHIR context are configured (neither is, deliberately) — verified in the
    // vendored bundle as `Promise.reject(new Error("Unable to load ValueSet ... A terminology server or a FHIR
    // server is needed."))`, raised WITHOUT any network attempt. Nothing listened for that, so it read as a
    // clean load with an empty dropdown.
    `window.addEventListener('unhandledrejection',function(e){var r=e&&e.reason;` +
    `window.__aqErrs.push('rejected '+((r&&r.message)?r.message:String(r)));});` +
    `</script>` +
    // NO nonce on the link — this pane's style-src is 'unsafe-inline' + cspSource, with the nonce dropped.
    `<link rel="stylesheet" href="${a.asset("styles.css")}">` +
    `<style>#root{white-space:normal}</style>`; // the shell's body{white-space:pre-wrap} would mangle the form
  // BODY, after the divs — see the throw described above. Zone.js first.
  const bodyScripts =
    `<script nonce="${a.nonce}" src="${a.asset("zone.min.js")}"></script>` +
    `<script nonce="${a.nonce}" src="${a.asset("lhc-forms.js")}"></script>` +
    `<script nonce="${a.nonce}" src="${a.asset("lformsFHIR.min.js")}"></script>`;
  return { head, bodyScripts };
}

function shellHtml(pane: Pane, cspSource: string, asset: (f: string) => string): string {
  const nonce = randomBytes(16).toString("base64");
  const styleNonce = randomBytes(16).toString("base64");
  const csp = cockpitPaneCsp(pane, { nonce, styleNonce, cspSource });
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
   tree re-render never wipes it. Column layout; the fields scroll; the actions pin to the bottom. z-index sits ABOVE the
   .flow-zoom control (7) so the drawer's Insert/Cancel row is never overlapped by it (the zoom is bottom-right, same spot). */
.flag-drawer{position:fixed;top:0;right:0;bottom:0;width:min(360px,70%);z-index:8;display:flex;flex-direction:column;gap:6px;padding:8px;box-sizing:border-box;background:var(--vscode-editorWidget-background,var(--vscode-editor-background));border-left:1px solid var(--vscode-panel-border,#454545);box-shadow:-2px 0 6px rgba(0,0,0,.25);overflow-y:auto}
/* …and while the drawer is open, hide the zoom entirely (you don't zoom the tree while authoring a flag; the drawer covers it). */
body:has(.flag-drawer) .flow-zoom{display:none}
.flag-head{display:flex;align-items:center;justify-content:space-between;font-weight:bold;padding-bottom:6px;border-bottom:1px solid var(--vscode-panel-border,#454545)}
.flag-title{overflow:hidden;text-overflow:ellipsis;white-space:normal}
/* Todo 3.5: the read-only summary context line in the description-only edit form (which AI finding you're annotating). */
.flag-ctx{opacity:.7;font-size:.9em;font-style:italic;overflow-wrap:anywhere}
.flag-close{cursor:pointer;background:none;border:none;color:inherit;font-size:1.1em;padding:0 4px}
.flag-row{display:flex;align-items:center;gap:6px}
.flag-col{display:flex;flex-direction:column;gap:2px;flex:1;min-height:60px}
.flag-label{opacity:.75;font-size:.85em;min-width:64px}
.flag-fieldgroup{display:flex;flex-direction:column;gap:4px}
.flag-fieldgroup[hidden]{display:none}
/* #210 (disc 239) — the CRL Assist purple focus ring on the element the agent wants completed (outline: no layout shift). */
.flag-focus{outline:2px solid var(--vscode-charts-purple,#c586c0);outline-offset:1px}
.flag-drawer input,.flag-drawer select,.flag-drawer textarea{width:100%;box-sizing:border-box;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,#3c3c3c);font-family:inherit;font-size:.95em}
.flag-drawer textarea{min-height:56px;resize:vertical;flex:1}
.flag-drawer select{background:var(--vscode-dropdown-background);color:var(--vscode-dropdown-foreground);border-color:var(--vscode-dropdown-border,#3c3c3c)}
.flag-actions{display:flex;justify-content:flex-end;gap:6px;padding-top:6px;border-top:1px solid var(--vscode-panel-border,#454545)}
.flag-cancel,.flag-insert,.flag-save{cursor:pointer;border:none;border-radius:2px;padding:2px 10px;font-size:.9em}
.flag-cancel{background:var(--vscode-button-secondaryBackground,#3a3d41);color:var(--vscode-button-secondaryForeground,#fff)}
.flag-insert,.flag-save{background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff)}
/* flag-ACTION drawer (read-only view) — shares .flag-drawer chrome; the body is a scrolling label/value list, actions pin bottom. */
.fa-body{display:flex;flex-direction:column;gap:6px;flex:1;overflow-y:auto;padding-top:2px}
.fa-row{display:flex;gap:8px;align-items:baseline}
.fa-key{flex:0 0 74px;opacity:.7;font-size:.82em;text-transform:uppercase;letter-spacing:.02em}
.fa-val{flex:1;min-width:0;overflow-wrap:anywhere}
.fa-pre{white-space:pre-wrap}
.fa-em{opacity:.5}
.fa-addr{display:block;opacity:.7;font-size:.85em;font-family:var(--vscode-editor-font-family,monospace);margin-top:1px}
.fa-status{font-weight:600}
.fa-status-open{color:var(--vscode-charts-orange,#d18616)}
.fa-status-resolved{color:var(--vscode-charts-green,#89d185)}
.fa-btn{cursor:pointer;border:none;border-radius:2px;padding:2px 10px;font-size:.9em;background:var(--vscode-button-secondaryBackground,#3a3d41);color:var(--vscode-button-secondaryForeground,#fff)}
.fa-btn.fa-primary{background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff)}
/* Todo 4: the destructive Delete affordance — a red-tinted text button (the modal confirm is the real guard). */
.fa-btn.fa-danger{color:var(--vscode-errorForeground,#f48771)}
/* disc 359/361: the header carries a GOLD accent linking it to the gold-haloed node in the tree (which thing is this flag
   for?). Scoped to .flag-drawer (the shared chrome), so BOTH the create (Add-flag) AND the action drawer show it — the create
   drawer highlights its target node too (disc 361), so its header must match. */
.flag-drawer .flag-head{border-bottom:2px solid var(--vscode-charts-yellow,#cca700)}
.flag-drawer .flag-title{color:var(--vscode-charts-yellow,#cca700)}
/* the technical Target address + id live in a collapsed Details (auto-opened when the target isn't drawn in the tree). */
.fa-details{font-size:.92em}
.fa-details>summary{cursor:pointer;opacity:.7;font-size:.82em;text-transform:uppercase;letter-spacing:.02em;padding:2px 0}
.fa-details[open]>summary{margin-bottom:4px}
.fa-note{opacity:.85;font-style:italic}
/* tree zoom control — its rules now live in FLOW_STYLE (flowPaneHtml.ts), co-located with the control markup + shared with the
   standalone snapshot export; the shell picks them up via the ${FLOW_STYLE} include below. */
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
/* #224 ii.3 Slice 2b: the criterion-encoding readout (the third gate half). Mirrors .mv-progress/.mv-flags spacing so the
   three halves stack consistently; the all-clean variant gets the same green done treatment as .mv-progress-done. */
.mv-criteria{padding:2px 2px 4px;font-size:.85em;opacity:.85}
.mv-criteria-done{color:var(--vscode-testing-iconPassed,var(--vscode-charts-green,#89d185));opacity:1;font-weight:bold}
${CORR_STYLE}${FLOW_STYLE}${QUESTIONNAIRE_STYLE}${REVIEW_GRID_DRAWER_STYLE}`;
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<style nonce="${styleNonce}">${style}</style>` +
    // The $apply pane's vendored runtime loads HERE, in the shell document — a real document load, so the
    // scripts execute. They must NOT be delivered in a render fragment: the cockpit installs those with
    // `root.innerHTML`, and <script> inserted that way never runs. Zone.js first (the concatenated bundle
    // deliberately excludes it, and without it Angular never bootstraps and the form silently paints nothing).
    // The stylesheet <link> needs no nonce here because this pane's style-src is 'unsafe-inline' + cspSource.
    paneShellFragments(pane, { nonce, asset }).head +
    `</head><body><div id="fcChrome"></div><div id="root"></div><div id="flagDrawer"></div>` +
    // ⚠ The vendor runtime loads in the BODY, after the divs — NOT in <head>. LForms bootstraps against
    // `document.body`, so loading it from <head> throws
    // "Cannot read properties of null (reading 'appendChild')" before it can define the `LForms` global, and
    // lformsFHIR then dies looking for `UcumLhcUtils`. Neither is a 404 or a CSP violation, so the only visible
    // symptom is "LForms is undefined".
    // Zone.js still first: the concatenated bundle deliberately excludes it and Angular will not bootstrap
    // without it. These are classic (non-module) scripts, so parse order is execution order, and the message
    // listener below registers in the same synchronous pass — message dispatch is async, so it cannot be missed.
    paneShellFragments(pane, { nonce, asset }).bodyScripts +
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
  // tree zoom — webview-local (persists across re-renders). SCALE the SVG's rendered width/height (not a CSS transform),
  // so the pane's scrollbars grow with it and native scroll pans. applyZoom re-reads the ORIGINAL size from the viewBox
  // (idempotent) and updates the % readout; it's re-run after every render so the persisted zoom survives a rebuild.
  `let treeZoom=1;` +
  `const applyZoom=()=>{const s=root.querySelector('.flow-svg');if(!s)return;const vb=s.viewBox&&s.viewBox.baseVal;const bw=vb&&vb.width?vb.width:parseFloat(s.getAttribute('width'))||0;const bh=vb&&vb.height?vb.height:parseFloat(s.getAttribute('height'))||0;s.style.width=(bw*treeZoom)+'px';s.style.height=(bh*treeZoom)+'px';const p=root.querySelector('.flow-zoom-pct');if(p)p.textContent=Math.round(treeZoom*100)+'%';};` +
  `const setZoom=(z)=>{treeZoom=Math.min(3,Math.max(.25,z));applyZoom();};` +
  `const clrFC=()=>{for(const el of root.querySelectorAll('.failed-criterion,.failed-criterion-preempt')){el.classList.remove('failed-criterion');el.classList.remove('failed-criterion-preempt');}};` +
  // #156 slice 5 / #210: the review-overlay clear. DISTINCT from clrFC — called ONLY by mark/clearReviewOverlay, NEVER by the
  // selection channel (highlight/clearHighlight), so the verdict fills SURVIVE selection (the survives-selection invariant).
  `const clrRO=()=>{for(const el of root.querySelectorAll('.review-pass,.review-fail,.review-pending,.error-node,.leaf-allpass')){el.classList.remove('review-pass');el.classList.remove('review-fail');el.classList.remove('review-pending');el.classList.remove('error-node');el.classList.remove('leaf-allpass');}};` +
  // #177 slice 4: the "this node" marker clear. DISTINCT from clrFC/clrRO — called ONLY by mark/clearThisNode, NEVER by the
  // selection channel (highlight/clearHighlight), so `.this-node` SURVIVES a cockpit reveal (it tracks the focused QUESTION,
  // not the selection — it moves only when the case or the question changes, the done-overlay lifecycle).
  `const clrTN=()=>{for(const el of root.querySelectorAll('.this-node'))el.classList.remove('this-node');};` +
  // #210 (disc 239): the CRL Assist focus-ring clear. Its OWN channel — called only by markNodeFocus, NEVER by the selection
  // channel — so the purple ring layers cleanly over `.current`/`.has-flag`/`.this-node` and tracks the agent's flag anchor.
  `const clrNF=()=>{for(const el of root.querySelectorAll('.node-focus'))el.classList.remove('node-focus');};` +
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
  `gen=m.gen;root.innerHTML=m.html;fcc.innerHTML='';if(m.mode)document.body.dataset.mode=m.mode;applyZoom();` +
  `for(const ta of root.querySelectorAll('textarea[data-note-draft]')){const k=ta.getAttribute('data-note-draft');if(Object.prototype.hasOwnProperty.call(_d,k)){ta.value=_d[k];if(k===_a){ta.focus();try{ta.setSelectionRange(_s,_e);}catch(_x){}}}}` +
  `v.postMessage({type:'ready',gen:m.gen,indexVersion:m.indexVersion});}` +
  // #(tree-snapshot) Todo 2: reply to the host's snapshot request with the CURRENT `#root` markup (WYSIWYG — the painted
  // overlay classes are on the rows). Strip the EPHEMERAL rings (selection `.current`/`.this-node`, agent `.node-focus`) off a
  // CLONE via classList (exact — never rewrites label text) so a customer artifact doesn't carry them; keep verdict/flag/
  // review state. Echoes the token so the host coordinator matches it; the host still SCREENS the payload (trust boundary).
  `else if(m.type==='requestSnapshot'){var _c=root.cloneNode(true);var _r=_c.querySelectorAll('.current,.this-node,.node-focus,.flag-current');for(var _i=0;_i<_r.length;_i++){_r[_i].classList.remove('current');_r[_i].classList.remove('this-node');_r[_i].classList.remove('node-focus');_r[_i].classList.remove('flag-current');}v.postMessage({type:'snapshotDom',token:m.token,html:_c.innerHTML});}` +
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
  // disc 359/360: the GOLD node-link for the open action drawer's flag — its own class-toggle channel (NEVER touched by
  // highlight/clearHighlight, so it survives a selection change). Clear via querySelectorAll (the webview has no flaggableGids
  // list), then add to the posted gids. Scroll the FIRST node into view ONLY when the HOST says so (`m.scroll` — a genuine
  // open/switch); a re-render/ack/refresh drive posts scroll=false so it can't yank the viewport (gids are gen-prefixed, so a
  // webview set-comparison couldn't tell an open from a re-render — impl-review [critical]). UNIQUE var names (post the 4.97.0
  // `ng` collision — the `new Function(SCRIPT)` guard also parses this).
  `else if(m.type==='flagHl'){if(m.gen!==gen)return;` +
  `for(const fe of document.querySelectorAll('.flag-current'))fe.classList.remove('flag-current');` +
  `var ffn=null;` +
  `for(const id of (m.gids||[])){const el=document.getElementById(id);if(el){el.classList.add('flag-current');if(!ffn)ffn=el;}}` +
  `if(m.scroll&&ffn&&ffn.scrollIntoView)ffn.scrollIntoView({block:'center',inline:'center'});}` +
  // #224 ii.3 Slice 2b: the model-level criterion VERDICT chips. Bulk-CLEAR the 4 crit-* classes off every criterion gid
  // (a verdict change must un-paint prior state), then add `crit-<state>` per byState. `unreviewed` gids are in allGids but
  // no byState list → they end bare. Gen-guarded + class-toggle only (no re-render), the flagBadges idiom.
  `else if(m.type==='criterionVerdicts'){if(m.gen!==gen)return;` +
  `for(const id of (m.allGids||[])){const el=document.getElementById(id);if(el){el.classList.remove('crit-pass');el.classList.remove('crit-fail');el.classList.remove('crit-pending');el.classList.remove('crit-stale');}}` +
  `var bs=m.byState||{};for(const s of ['pass','fail','pending','stale']){for(const id of (bs[s]||[])){const el=document.getElementById(id);if(el)el.classList.add('crit-'+s);}}}` +
  // #177 slice 4: the "this node" cross-pane marker — a SEPARATE channel from .current, .failed-criterion AND the review
  // overlay. Like the review overlay it is mutated ONLY here (mark/clearThisNode), NEVER by highlight/clearHighlight/clrFC/
  // clrRO — so it SURVIVES a cockpit reveal (the focused question's node stays marked as the clinician clicks around). mark
  // replaces the prior marker (clear-then-set, gen-guarded like the others); clear is ungated (a class-strip is always safe).
  // No scroll on the steady mark — the focused question doesn't yank the panes around (slice-5 nav can revisit scroll).
  `else if(m.type==='clearThisNode'){clrTN();}` +
  `else if(m.type==='markThisNode'){if(m.gen!==gen)return;clrTN();` +
  `for(const id of (m.segmentIds||[])){const el=document.getElementById(id);if(el)el.classList.add('this-node');}}` +
  // #210 (disc 239): the CRL Assist focus ring (.node-focus) on the agent's flag-anchor node. Gen-guarded clear-then-set,
  // its own channel; an empty segmentIds is a clean clear. NEVER touched by highlight/clearHighlight (independent overlay).
  `else if(m.type==='markNodeFocus'){if(m.gen!==gen)return;clrNF();` +
  `for(const id of (m.segmentIds||[])){const el=document.getElementById(id);if(el)el.classList.add('node-focus');}}` +
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
  // The $apply questionnaire pane. DATA ONLY — this branch never receives `html`, because a fragment carrying
  // <script> would be inert (innerHTML does not execute scripts) and re-rendering would tear down the mounted
  // form. The vendor runtime is already loaded by this pane's shell document.
  // `key` is the render identity: remount ONLY when the case's CONTENT changes. Every cockpit re-render
  // (rebuild/applyShowKeys/renderEmpty) reaches every pane, and remounting a 1.85 MB Angular app on an
  // unrelated render would churn and discard in-progress answers.
  `else if(m.type==='fhirQuestionnaire'){` +
  // The skip-remount latch is set ONLY after a successful mount (bottom of the try). Latching it up-front
  // latched FAILURES too: select a case with no artifacts -> "could not find" paints and the key sticks -> the
  // producer (or the seed script) writes the files -> every later render posts the same key and returns early,
  // so the pane shows "could not find" until you select a different case and come back. That is precisely the
  // workflow this pane exists for.
  `if(m.key&&m.key===window.__aqKey)return;` +
  `window.__aqKey=undefined;` +
  `const host=document.getElementById('root');` +
  // The case header mirrors the CRL Questionnaire pane's, so the two panes read as the same case side by side.
  `const head=(t)=>{const h=document.createElement('p');h.className='aq-case';h.textContent=t;return h;};` +
  `const fail=(t)=>{host.replaceChildren();if(m.label)host.appendChild(head('Case - '+m.label));const p=document.createElement('p');p.className='placeholder';p.textContent=t;host.appendChild(p);};` +
  `if(!m.label){fail('Select a case to see its FHIR questionnaire.');return;}` +
  // Distinguish "nothing selected" from "selected, but the producer has written nothing for it" — the second is
  // the normal state until #277 lands, and saying WHERE we looked is what makes it actionable.
  `if(!m.q){fail('Could not find FHIR Questionnaire data for this case.'+(m.lookedFor?(' Looked for: '+m.lookedFor):''));return;}` +
  `if(typeof LForms==='undefined'||!LForms.Util){` +
  `const errs=(window.__aqErrs||[]);` +
  `fail('The LForms runtime did not load. '+(errs.length?('Failures: '+errs.join(' | ')):'No 404, no throw, no CSP violation — the scripts ran and defined no LForms global. Check load ORDER (zone.js must precede lhc-forms.js).'));` +
  `return;}` +
  `try{` +
  `host.replaceChildren();host.appendChild(head('Case - '+m.label));` +
  // Producer-contract breaches, detected host-side. Shown ABOVE the form and NOT fatal: the rest of the
  // questionnaire still renders, and the operator sees exactly which items will not.
  `const un=(m.unrenderable||[]);` +
  `if(un.length){const c=document.createElement('p');c.className='aq-warning';` +
  `c.textContent='This questionnaire uses features the pane cannot render ('+un.length+'): '+un.join(' | ');` +
  `host.appendChild(c);}` +
  `const mount=document.createElement('div');host.appendChild(mount);mount.id='aqMount';` +
  `let form=LForms.Util.convertFHIRQuestionnaireToLForms(m.q,'R4');` +
  `if(!form){fail('convertFHIRQuestionnaireToLForms returned nothing.');return;}` +
  `if(m.qr)form=LForms.Util.mergeFHIRDataIntoLForms('QuestionnaireResponse',m.qr,form,'R4');` +
  `LForms.Util.addFormToPage(form,'aqMount',{prepopulate:false});` +
  `window.__aqKey=m.key;` + // latch ONLY on success — see the note at the top of this branch

  // addFormToPage can resolve without painting (an unrecognised item tree yields an empty form). Angular
  // Elements upgrades asynchronously, so poll briefly rather than measuring on the next frame.
  // The no-paint poll must not outlive its own render. It closes over `mount`, and on timeout it used to call
  // fail(), which clears #root — so a slow case A could wipe the LIVE form of case B selected moments later,
  // and label the wreckage with A. It now bails if the latch moved on, and reports WITHOUT tearing down a form
  // that may still be upgrading (Angular Elements can be slow on a cold codespace).
  `const mine=m.key;let n=0;const chk=()=>{if(window.__aqKey!==mine)return;` +
  `if(mount.getBoundingClientRect().height>0)return;` +
  `if(++n>40){const w=document.createElement('p');w.className='aq-warning';` +
  // Report WHAT failed, not just THAT nothing painted. Errors raised after addFormToPage resolves (Angular
  // Elements upgrades asynchronously, so they escape the try/catch below) land in __aqErrs and were previously
  // read only in the LForms-undefined branch — i.e. never, once the runtime loaded. A blank pane with a
  // generic warning is the exact shape of the two false-negative CSP readings this pane has already produced.
  `const errs=(window.__aqErrs||[]);` +
  `w.textContent='The questionnaire has not rendered yet. If it stays blank, the form did not paint.'` +
  `+(errs.length?(' Failures: '+errs.join(' | ')):'');` +
  `if(!mount.previousElementSibling||!mount.previousElementSibling.classList.contains('aq-warning'))host.insertBefore(w,mount);return;}` +
  `setTimeout(chk,50);};setTimeout(chk,50);` +
  `}catch(e){fail('Could not render the questionnaire: '+((e&&e.message)?e.message:String(e)));}` +
  `}` +
  // #211: the create-flag drawer's OWN region — set (or clear with '') its html. The render handler never touches it, so a
  // same-policy tree rebuild leaves the drawer + the user's typed text intact. aff() shows the selected tag's fields.
  // Todo 5 (impl-review [important]): the drawer is last in DOM + revealed preserveFocus, so a keyboard user would tab through
  // all chrome + the flowchart before reaching it. On a GRID inject, move focus to its first enabled control (parity with the
  // create drawer's autofocus). Scoped to the grid so the create/edit/action forms keep their own focus behavior (aff()).
  `else if(m.type==='flagDrawer'){fld.innerHTML=m.html;if(m.html){aff();var rg=fld.querySelector('[data-review-grid]');if(rg){var f0=rg.querySelector('.rvg-all,input[type=radio]:not([disabled])');if(f0&&f0.focus)f0.focus();}}}});` +
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
  // Todo 2 (disc 356): a PER-NODE badge carries data-node-flag-gid (read off the MATCHED badge <g>, NOT a second closest — the
  // start pill is its SIBLING in the same row) → node-filtered; the start-count pill has none → the whole-policy list.
  `if(fb){e.preventDefault();e.stopPropagation();var nfg=fb.getAttribute('data-node-flag-gid');if(nfg)v.postMessage({type:'nodeFlags',gid:nfg});else v.postMessage({type:'mvFlags'});return;}` +
  // tree zoom control (− / reset / +) — a local view op, no host round-trip. Intercepted BEFORE [data-reveal].
  `const zb=e.target.closest&&e.target.closest('[data-zoom]');` +
  `if(zb){e.preventDefault();e.stopPropagation();const a=zb.getAttribute('data-zoom');setZoom(a==='in'?treeZoom*1.2:a==='out'?treeZoom/1.2:1);return;}` +
  // #224 ii.3 Slice 2 / #233 Todo 2a: a criterion collapse chevron (▸/▾) — intercepted BEFORE [data-reveal] (the chevron
  // <g> is nested in the row's data-reveal); posts the opaque reveal key, the host resolves it → a ROOT criterion's `when`
  // nodeKey OR a NON-ROOT criterion's `{criterionToggle}` position key, then flips collapse + re-renders.
  `const ct=e.target.closest&&e.target.closest('[data-toggle-crit]');` +
  `if(ct){e.preventDefault();e.stopPropagation();v.postMessage({type:'toggleCriterion',key:ct.getAttribute('data-toggle-crit')});return;}` +
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
  // #233 Todo 2b: also match a non-root criterion box (`.flow-crit-row[data-reveal]`) — its right-click opens the model-level
  // criterion-encoding menu (host routes a `{criterionOccurrence}` hit to `criterionEncodingMenu`, never a case verdict).
  `const g=e.target.closest('.flow-row[data-reveal],.flow-crit-row[data-reveal]');if(!g)return;` +
  `e.preventDefault();e.stopPropagation();v.postMessage({type:'nodeVerdictMenu',key:g.getAttribute('data-reveal')});});` +
  // #156 slice 4: the worklist dropdown's 'change' posts the opaque key + the chosen value; the host validates the value
  // is a known ReviewState and persists it. A native <select> is keyboard- + screen-reader-operable, so no hand-rolled
  // keydown handling is needed. stopPropagation keeps the change from bubbling into any ancestor listener.
  `root.addEventListener('change',(e)=>{const ws=e.target.closest&&e.target.closest('[data-worklist-select]');` +
  `if(ws){e.stopPropagation();v.postMessage({type:'worklistSet',key:ws.getAttribute('data-worklist-select'),value:ws.value});}});` +
  // tree zoom via Ctrl+wheel (only when the tree/flow pane is present; passive:false so preventDefault stops the page zoom).
  // NOTE: no Ctrl +/-/0 keyboard leg — those are VS Code GLOBAL keybindings the webview iframe can't override (they'd zoom
  // all of VS Code). The floating control + Ctrl+wheel are the surfaces; a real keybinding would need a command + a
  // webview-focus context key + a non-conflicting chord (deferred).
  `root.addEventListener('wheel',(e)=>{if(!e.ctrlKey)return;if(!root.querySelector('.flow-svg'))return;e.preventDefault();setZoom(treeZoom*(e.deltaY<0?1.1:1/1.1));},{passive:false});` +
  // grab-drag PAN of the flow/tree pane — press on the tree and drag to pan its scroll (works with OR without zoom: a chart
  // wider/taller than the pane overflows the document, which is what scrolls). A press that MOVES past a small threshold pans
  // + swallows the ensuing node click; a stationary press still selects the node (so clicking a node is unaffected). move/up
  // ride `window` so a drag that leaves the pane still tracks; `fpMoved` resets on each pointerdown so a no-click pan can't
  // suppress the NEXT real click.
  `let fpPan=false,fpMoved=false,fpX=0,fpY=0,fpL=0,fpT=0;const fpSc=()=>document.scrollingElement||document.documentElement;` +
  `root.addEventListener('pointerdown',(e)=>{if(e.button!==0||!(e.target.closest&&e.target.closest('.flow-svg')))return;fpPan=true;fpMoved=false;fpX=e.clientX;fpY=e.clientY;const s=fpSc();fpL=s.scrollLeft;fpT=s.scrollTop;});` +
  `window.addEventListener('pointermove',(e)=>{if(!fpPan)return;const dx=e.clientX-fpX,dy=e.clientY-fpY;if(!fpMoved&&Math.abs(dx)+Math.abs(dy)<4)return;fpMoved=true;document.body.style.cursor='grabbing';const s=fpSc();s.scrollLeft=fpL-dx;s.scrollTop=fpT-dy;e.preventDefault();});` +
  `window.addEventListener('pointerup',()=>{if(fpPan){fpPan=false;document.body.style.cursor='';}});` +
  `root.addEventListener('click',(e)=>{if(fpMoved){fpMoved=false;e.stopPropagation();e.preventDefault();}},true);` +
  // Chrome clicks: the All/Blocking toggle (data-fc-mode) + a gap row's Open CRL source (data-fc-gap).
  `fcc.addEventListener('click',(e)=>{const mode=e.target.closest&&e.target.closest('[data-fc-mode]');` +
  `if(mode){v.postMessage({type:'fcMode',mode:mode.getAttribute('data-fc-mode')});return;}` +
  // disc 164: the produced-path diverter overlay on/off toggle (MV chrome).
  `const dv=e.target.closest&&e.target.closest('[data-diverter-toggle]');` +
  `if(dv){v.postMessage({type:'diverterToggle',on:dv.getAttribute('data-diverter-toggle')});return;}` +
  `const gap=e.target.closest&&e.target.closest('[data-fc-gap]');` +
  `if(gap){v.postMessage({type:'fcOpenSource',idx:Number(gap.getAttribute('data-fc-gap'))});return;}` +
  // #(tree-snapshot): the in-pane "Export snapshot" button → the host command.
  `const xs=e.target.closest&&e.target.closest('[data-export-snapshot]');` +
  `if(xs){v.postMessage({type:'exportSnapshot'});return;}` +
  // #(bulk-verdict) Todo 2b: the in-pane "Review verdicts" button → open the bulk grid.
  `const rv=e.target.closest&&e.target.closest('[data-review-verdicts]');` +
  `if(rv){v.postMessage({type:'openReviewGrid'});return;}` +
  // #203 Todo 4: the flag badge / mvComplete gate → open the review-flag list.
  `const fl=e.target.closest&&e.target.closest('[data-mv-flags]');` +
  `if(fl)v.postMessage({type:'mvFlags'});});` +
  // #211: the create-flag drawer's controls (its OWN region → a separate listener). Close/Cancel drops the draft; Insert
  // collects the tag + summary + stub + the VISIBLE tag's field values and posts them (the host uses the captured target).
  // The flag-ACTION drawer shares this region (mutually exclusive with create) but uses DISTINCT `data-flag-action-*` intents
  // so its ✕ never posts the create `flagDraftCancel` (which no-ops when there's no draft). It carries no flag id — the host
  // acts on its captured `flagActionView.flag` (trusted-input discipline).
  // Collect the drawer form's {tag, summary, stub, fields} — SHARED by the create Insert + the Todo-3 edit Save (the edit form
  // reuses the SAME `data-flag-*` control attributes). Only the SELECTED tag's visible field group is read (a Type change swaps
  // the group; the create field-drop + the edit field-ownership both drop non-current-group values).
  `function flagCollect(){` +
  `const ts=fld.querySelector('[data-flag-tag]');const tg=ts?ts.value:'';` +
  `const su=fld.querySelector('[data-flag-summary]');const st=fld.querySelector('[data-flag-stub]');` +
  // find the SELECTED tag's field group by iterating + comparing (NOT selector interpolation — a tag id with a quote/]
  // would throw a SyntaxError and abort the click; matches aff()'s approach).
  `const fields={};let grp=null;for(const g of fld.querySelectorAll('[data-flag-field-for]')){if(g.getAttribute('data-flag-field-for')===tg){grp=g;break;}}` +
  `if(grp){for(const c of grp.querySelectorAll('[data-flag-field]')){const k=c.getAttribute('data-flag-field');const val=c.value;if(val&&val.trim()!=='')fields[k]=val;}}` +
  `return{tag:tg,summary:su?su.value:'',stub:st?st.value:'',fields:fields};}` +
  `fld.addEventListener('click',(e)=>{` +
  `const ac=e.target.closest&&e.target.closest('[data-flag-action-toggle],[data-flag-action-issue],[data-flag-action-edit],[data-flag-action-delete],[data-flag-action-close]');` +
  `if(ac){e.preventDefault();e.stopPropagation();v.postMessage({type:ac.hasAttribute('data-flag-action-toggle')?'flagActionToggle':ac.hasAttribute('data-flag-action-issue')?'flagActionIssue':ac.hasAttribute('data-flag-action-edit')?'flagActionEdit':ac.hasAttribute('data-flag-action-delete')?'flagActionDelete':'flagActionClose'});return;}` +
  // Todo 3: the edit form's Cancel/✕ + Save carry DISTINCT `data-flag-edit-*` intents (checked BEFORE the create close/insert,
  // whose handlers no-op when only flagEditDraft is set). Save reuses flagCollect().
  `const ec=e.target.closest&&e.target.closest('[data-flag-edit-cancel]');` +
  `if(ec){e.preventDefault();v.postMessage({type:'flagEditCancel'});return;}` +
  `const es=e.target.closest&&e.target.closest('[data-flag-edit-save]');` +
  `if(es){e.preventDefault();const p=flagCollect();v.postMessage({type:'flagEditSave',tag:p.tag,summary:p.summary,stub:p.stub,fields:p.fields});return;}` +
  `const cx=e.target.closest&&e.target.closest('[data-flag-close],[data-flag-cancel]');` +
  `if(cx){e.preventDefault();v.postMessage({type:'flagDraftCancel'});return;}` +
  `const ins=e.target.closest&&e.target.closest('[data-flag-insert]');` +
  `if(ins){e.preventDefault();const p=flagCollect();v.postMessage({type:'flagDraftInsert',tag:p.tag,summary:p.summary,stub:p.stub,fields:p.fields});return;}` +
  `});` +
  // The tag select's change toggles the visible field group (client-side; no host round-trip).
  `fld.addEventListener('change',(e)=>{const ts=e.target.closest&&e.target.closest('[data-flag-tag]');if(ts){aff();}});` +
  // Todo 3: on the FIRST edit of the edit form, tell the host it's dirty (arms the lose-changes gate for an implicit switch). The
  // `data-dirty` marker de-dupes to one message per edit session (the form isn't re-rendered while open, so it persists).
  `fld.addEventListener('input',()=>{const ed=fld.querySelector('.flag-edit-drawer');if(ed&&!ed.hasAttribute('data-dirty')){ed.setAttribute('data-dirty','1');v.postMessage({type:'flagEditDirty'});}});` +
  // Todo 5 (disc 366): the bulk-verdict grid's OWN delegated listeners on `#flagDrawer`, an isolated IIFE (rg-prefixed, DOM-
  // resident state) that reuses the `fld`/`v` in this scope — see reviewGridHtml.ts. Appended LAST so the grid session's picks
  // live entirely in the drawer DOM (an innerHTML swap to another mode resets them; no cross-session closure deadlock).
  REVIEW_GRID_DRAWER_SCRIPT;
