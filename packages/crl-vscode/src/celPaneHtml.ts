// CEL pane RENDERER (vscode-free, unit-tested) — three-pane viewer C2c-1/C2c-2 (#156).
// Renders the scenario CASES condensed (name + status + subject + facts + produced recs) — the KE's compact correspondence
// view, distinct from the full scenario-runner (the clinician surface, left untouched). Each case is anchored by its
// FROZEN caseId (the join key with the correspondence — looked up from the case name via caseIdByName); a case with no
// frozen id renders but is NOT a case reveal target (no anchor / no data-reveal). Mirrors crlPaneHtml conventions.
//
// C2c-2 fact-level: a fact whose `defined by` resolves to a CONCEPT (qualified — bare refs are FHIR types, activity
// targets aren't concepts) AND whose concept key is revealable (in `revealableConceptKeys`) renders as a clickable span
// with its OWN `fact:`-namespaced anchor. A click "peeks" that concept across panes (shell-side, no engine selection).
// Fact peek is independent of the case's frozen id — the concept's correspondence doesn't depend on the case anchor.
import { nodeKey, type RenderScenarioResult } from "@smile-digital-health/crl";

import { corrKeyHtml } from "./corrKey";

export interface CelAnchor {
  scrollTo: string;
  segmentIds: string[];
}
/** A case-block reveal (selects the case) or a fact reveal (peeks the fact's concept — carries the cel anchor to self-
 *  highlight + the concept key for the source/CRL arms). The `conceptKey` field discriminates the two. */
export type CelReveal = { caseId: string } | { conceptKey: string; factAnchorKey: string };
export interface RenderedCel {
  html: string;
  /** anchor key → highlight target. Case blocks are keyed by frozen caseId; facts by their `fact:`-namespaced key
   *  (colon is invalid in a caseId, so the two key spaces never collide). */
  anchors: Record<string, CelAnchor>;
  /** opaque data-reveal key (per render) → the trusted payload a click resolves to. */
  reveals: Record<string, CelReveal>;
  /** Medical Validation (#156 slice 4): opaque `data-worklist-toggle` key (per render) → the frozen caseId the toggle
   *  acts on. Populated ONLY in worklist mode (`opts.worklist.enabled`) and ONLY for REVIEWABLE cases (frozen, non-
   *  ambiguous). Absent/empty in cockpit mode. The host maps key→caseId here (the webview never sees the caseId), so a
   *  toggle click resolves through the same trusted-opaque-key discipline as `reveals` — keyed by caseId, never by name. */
  worklistActions?: Record<string, { caseId: string }>;
  /** REVERSE map (C2c-2b): concept key → the fact anchor keys rendered THIS render for that concept (accumulated across
   *  cases — a concept can be a fact in several). Domain = the revealable concept-kind facts that got a `fact:` span;
   *  the values embed the per-render gen prefix, so capture this ATOMICALLY with `anchors` (don't cache across renders).
   *  Lets a source/CRL selection highlight the specific fact spans that reference its concepts. */
  conceptToFactAnchors: Record<string, string[]>;
}

/** Facts-first, deduped union of a selection's fact-anchor keys (from its concept keys) + its case-block anchor keys.
 *  Facts first so highlightRows scrolls to the pinpoint fact (case block still highlighted for context). Pure. */
export function reverseCelAnchors(
  conceptKeys: string[],
  caseAnchorKeys: string[],
  conceptToFactAnchors: Record<string, string[]>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (k: string): void => {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  };
  for (const ck of conceptKeys) for (const fa of conceptToFactAnchors[ck] ?? []) add(fa); // fact pinpoints first
  for (const ca of caseAnchorKeys) add(ca); // then case blocks for context
  return out;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);
const BADGE: Record<string, string> = { pass: "✓", fail: "✗", error: "⚠" };
// The 3-state review checkbox glyphs (#156 slice 4). unreviewed = empty box, pending = dashed/partial, reviewed = check.
const WORKLIST_GLYPH: Record<"unreviewed" | "pending" | "reviewed", string> = { unreviewed: "☐", pending: "◐", reviewed: "☑" };

export function renderCelPane(
  result: RenderScenarioResult,
  caseIdByName: Record<string, string>,
  // caseKeyNumbers: caseId → its corresponding units' numbers (#163 at-rest key). showKeys gates the slot.
  // duplicateScenarioNames: names shared by >1 case (frozen OR unfrozen). #173 FIX 1 (disc 160): such a case is NOT
  // anchored/clickable — clicking it would mis-attribute to the frozen same-name case's caseId. Rendered with a marker.
  // worklist (#156 slice 4, mode-gated): when `enabled`, render a 3-state review checkbox per case + (for reviewable
  // cases) emit a `data-worklist-toggle` key into `worklistActions`. ABSENT or `enabled:false` → byte-identical to the
  // cockpit render (no checkbox, no worklistActions). `statesByCaseId` is keyed by frozen caseId only (never by name).
  opts: { revealPrefix?: string; revealableConceptKeys?: ReadonlySet<string>; caseKeyNumbers?: Record<string, number[]>; showKeys?: boolean; duplicateScenarioNames?: ReadonlySet<string>; worklist?: { enabled: boolean; statesByCaseId: Record<string, "pending" | "reviewed"> } } = {},
): RenderedCel {
  const prefix = opts.revealPrefix ?? "";
  const revealable = opts.revealableConceptKeys;
  const caseKeyNumbers = opts.caseKeyNumbers ?? {};
  const showKeys = opts.showKeys ?? false;
  const duplicateNames = opts.duplicateScenarioNames ?? new Set<string>();
  const worklist = opts.worklist?.enabled ? opts.worklist : undefined; // undefined ⇒ cockpit path (byte-unchanged)
  const anchors: Record<string, CelAnchor> = {};
  const reveals: Record<string, CelReveal> = {};
  const conceptToFactAnchors: Record<string, string[]> = {};
  // Only allocated in worklist mode (kept undefined otherwise so cockpit's RenderedCel omits the field entirely).
  const worklistActions: Record<string, { caseId: string }> | undefined = worklist ? {} : undefined;

  // Render cases whenever there ARE cases — even when `result.success === false` (a sibling case errored, so the
  // RenderScenarioResult envelope is unsuccessful). Suppressing all cases on any failure hid the FAILING case #173
  // needs to select (disc 158 §"Cockpit robustness"). Only the no-cases path (e.g. a graph/parse failure → empty
  // scenarios) falls to the placeholder. Graph-level `errors` ride a banner ABOVE the cases instead of suppressing them.
  if (result.scenarios.length === 0) {
    const why = result.errors.length ? `: ${escapeHtml(result.errors.join("; "))}` : "";
    const msg = result.errors.length ? `CEL did not render${why}` : "No CEL cases.";
    return worklistActions ? { html: `<p class="placeholder">${msg}</p>`, anchors, reveals, conceptToFactAnchors, worklistActions } : { html: `<p class="placeholder">${msg}</p>`, anchors, reveals, conceptToFactAnchors };
  }

  // A banner only when there's a graph-level error string to show; errored CASES carry their own ⚠ badge + diagnostics
  // (the per-case error path leaves `result.errors` empty — no banner, the ⚠ rows tell the story).
  let html =
    result.errors.length > 0
      ? `<p class="placeholder fc-cel-banner">⚠ ${escapeHtml(result.errors.join("; "))}</p>`
      : "";
  let idx = 0;
  for (const sc of result.scenarios) {
    // FIX 1 (disc 160): an AMBIGUOUS-name case (its name shared by >1 case) must NOT be anchored to the frozen
    // caseIdByName[name] — clicking EITHER same-name block would otherwise select that ONE frozen caseId and apply
    // cross-pane `.current` highlights as if it were the frozen case (a mis-attribution). So treat it as un-revealable.
    const ambiguous = duplicateNames.has(sc.case.name);
    const caseId = ambiguous ? undefined : caseIdByName[sc.case.name]; // undefined → case un-revealable (no case anchor)
    const id = `${prefix}cel${idx}`;
    const attrs = [`id="${escapeHtml(id)}"`, `class="cel-case cel-${sc.status}${ambiguous ? " cel-ambiguous" : ""}"`];
    if (caseId !== undefined) {
      anchors[caseId] = { scrollTo: id, segmentIds: [id] };
      const key = `${prefix}k${id}`;
      reveals[key] = { caseId };
      attrs.push(`data-reveal="${escapeHtml(key)}"`);
    }

    // Facts: a concept-resolved, revealable fact becomes its own clickable peek anchor; others render as plain text.
    // The whole fact token sits inside its span (no clickable gaps); the separator is outside, so clicking between
    // facts falls through to the case block (closest('[data-reveal]') picks the nearest — the inner fact span wins).
    const factParts = sc.case.facts.map((f, fi) => {
      const db = f.definedBy;
      if (db?.kind === "concept") {
        const conceptKey = nodeKey({ lib: db.lib, kind: "concept", name: db.name });
        if (revealable?.has(conceptKey)) {
          const factElId = `${id}f${fi}`;
          const factAnchorKey = `fact:${id}:f${fi}`; // colon → never collides with a caseId anchor
          anchors[factAnchorKey] = { scrollTo: factElId, segmentIds: [factElId] };
          reveals[factAnchorKey] = { conceptKey, factAnchorKey };
          (conceptToFactAnchors[conceptKey] ??= []).push(factAnchorKey); // reverse: a concept can be a fact in many cases
          return `<span id="${escapeHtml(factElId)}" class="cel-fact" data-reveal="${escapeHtml(factAnchorKey)}">${escapeHtml(f.name)}</span>`;
        }
      }
      return escapeHtml(f.name);
    });
    const produced = sc.produced.map((p) => escapeHtml(p.recommendation)).join(", ");
    // At-rest key slot (#163): the units this case corresponds to. Only when the case is frozen (caseId-keyed) + showKeys.
    const keySlot = showKeys && caseId !== undefined ? corrKeyHtml(caseKeyNumbers[caseId] ?? []) : "";
    // Worklist checkbox (#156 slice 4, mode-gated). REVIEWABLE = a frozen, non-ambiguous case (caseId !== undefined,
    // which already excludes the ambiguous branch above) → an interactive `data-worklist-toggle` carrying an opaque key
    // (resolved host-side to the caseId). NON-reviewable = unfrozen (no caseId) OR ambiguous-name → a DISABLED checkbox
    // (no key, a title explaining why), never hidden. State is read from statesByCaseId by caseId only (never by name);
    // an unfrozen/ambiguous case has no caseId so it has no persisted state → always renders "unreviewed".
    let checkbox = "";
    if (worklist && worklistActions) {
      if (caseId !== undefined) {
        const wstate = worklist.statesByCaseId[caseId] ?? "unreviewed";
        // STABLE key, derived from the caseId — NOT gen-scoped (unlike the reveal keys). The worklist toggle does NOT go
        // through the reveal coordinator, so it needn't be gen-fresh; a stable key means a click on a STALE (pre-re-render)
        // DOM still resolves to the caseId, instead of being silently dropped when renderPane bumps the gen. The host then
        // advances nextReviewState from the COMMITTED reviewByCaseId[caseId] (not the stale visual), so rapid double-clicks
        // advance correctly. caseId is unique per frozen case, so `wl_<caseId>` is collision-free across cases.
        const wlKey = `wl_${caseId}`;
        worklistActions[wlKey] = { caseId };
        const ariaChecked = wstate === "reviewed" ? "true" : wstate === "pending" ? "mixed" : "false";
        checkbox =
          `<span class="cel-check cel-check-${wstate}" role="checkbox" aria-checked="${ariaChecked}" tabindex="0" ` +
          `data-worklist-toggle="${escapeHtml(wlKey)}" ` +
          `title="Mark this case reviewed (unreviewed → pending → reviewed)">${WORKLIST_GLYPH[wstate]}</span> `;
      } else {
        // DISABLED checkbox (unfrozen / ambiguous). It carries NO data-worklist-toggle AND no tabindex, so a click/keydown
        // on it is a no-op. INVARIANT: a disabled checkbox safely falls through (does NOT select) only because an unfrozen/
        // ambiguous case ALSO renders without a parent `data-reveal` (see above) — so the shell's reveal handler finds no
        // target either. If a future state ever made a disabled-checkbox case revealable, a disabled-checkbox click would
        // start selecting the case; guard the checkbox explicitly then.
        const why = ambiguous ? "name shared; not reviewable" : "freeze this case to review it";
        checkbox =
          `<span class="cel-check cel-check-disabled" role="checkbox" aria-disabled="true" aria-checked="false" title="${escapeHtml(why)}">${WORKLIST_GLYPH.unreviewed}</span> `;
      }
    }
    html +=
      `<div ${attrs.join(" ")}>` +
      checkbox +
      keySlot +
      `<span class="cel-status">${BADGE[sc.status] ?? "·"}</span> ` +
      `<span class="cel-name">${escapeHtml(sc.case.name)}</span>` +
      (sc.case.subject ? ` <span class="cel-subject">(${escapeHtml(sc.case.subject)})</span>` : "") +
      (ambiguous ? ` <span class="cel-ambiguous-marker" title="This case's name is shared by another case — give each a distinct name to make it selectable.">⚠ name shared; not selectable</span>` : "") +
      (factParts.length ? `<div class="cel-facts">facts: ${factParts.join(", ")}</div>` : "") +
      (produced ? `<div class="cel-produced">→ ${produced}</div>` : "") +
      `</div>`;
    idx++;
  }
  return worklistActions ? { html, anchors, reveals, conceptToFactAnchors, worklistActions } : { html, anchors, reveals, conceptToFactAnchors };
}
