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
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);
const BADGE: Record<string, string> = { pass: "✓", fail: "✗", error: "⚠" };

export function renderCelPane(
  result: RenderScenarioResult,
  caseIdByName: Record<string, string>,
  opts: { revealPrefix?: string; revealableConceptKeys?: ReadonlySet<string> } = {},
): RenderedCel {
  const prefix = opts.revealPrefix ?? "";
  const revealable = opts.revealableConceptKeys;
  const anchors: Record<string, CelAnchor> = {};
  const reveals: Record<string, CelReveal> = {};

  if (!result.success || result.scenarios.length === 0) {
    const why = result.errors.length ? `: ${escapeHtml(result.errors.join("; "))}` : "";
    const msg = result.errors.length ? `CEL did not render${why}` : "No CEL cases.";
    return { html: `<p class="placeholder">${msg}</p>`, anchors, reveals };
  }

  let html = "";
  let idx = 0;
  for (const sc of result.scenarios) {
    const caseId = caseIdByName[sc.case.name]; // undefined → case un-revealable (renders, no case anchor)
    const id = `${prefix}cel${idx}`;
    const attrs = [`id="${escapeHtml(id)}"`, `class="cel-case cel-${sc.status}"`];
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
          return `<span id="${escapeHtml(factElId)}" class="cel-fact" data-reveal="${escapeHtml(factAnchorKey)}">${escapeHtml(f.name)}</span>`;
        }
      }
      return escapeHtml(f.name);
    });
    const produced = sc.produced.map((p) => escapeHtml(p.recommendation)).join(", ");
    html +=
      `<div ${attrs.join(" ")}>` +
      `<span class="cel-status">${BADGE[sc.status] ?? "·"}</span> ` +
      `<span class="cel-name">${escapeHtml(sc.case.name)}</span>` +
      (sc.case.subject ? ` <span class="cel-subject">(${escapeHtml(sc.case.subject)})</span>` : "") +
      (factParts.length ? `<div class="cel-facts">facts: ${factParts.join(", ")}</div>` : "") +
      (produced ? `<div class="cel-produced">→ ${produced}</div>` : "") +
      `</div>`;
    idx++;
  }
  return { html, anchors, reveals };
}
