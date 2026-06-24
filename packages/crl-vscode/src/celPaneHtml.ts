// CEL pane RENDERER (vscode-free, unit-tested) — three-pane viewer C2c-1 (#156).
// Renders the scenario CASES condensed (name + status + subject + facts + produced recs) — the KE's compact correspondence
// view, distinct from the full scenario-runner (the clinician surface, left untouched). Each case is anchored by its
// FROZEN caseId (the join key with the correspondence — looked up from the case name via caseIdByName); a case with no
// frozen id renders but is NOT a reveal target (no anchor / no data-reveal). Mirrors crlPaneHtml conventions.
import type { RenderScenarioResult } from "@smile-digital-health/crl";

export interface CelAnchor {
  scrollTo: string;
  segmentIds: string[];
}
export interface RenderedCel {
  html: string;
  /** frozen caseId → its case block (highlight/reveal target). */
  anchors: Record<string, CelAnchor>;
  /** opaque key (per render) → the trusted caseId a click selects. */
  reveals: Record<string, { caseId: string }>;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);
const BADGE: Record<string, string> = { pass: "✓", fail: "✗", error: "⚠" };

export function renderCelPane(
  result: RenderScenarioResult,
  caseIdByName: Record<string, string>,
  opts: { revealPrefix?: string } = {},
): RenderedCel {
  const prefix = opts.revealPrefix ?? "";
  const anchors: Record<string, CelAnchor> = {};
  const reveals: Record<string, { caseId: string }> = {};

  if (!result.success || result.scenarios.length === 0) {
    const why = result.errors.length ? `: ${escapeHtml(result.errors.join("; "))}` : "";
    const msg = result.errors.length ? `CEL did not render${why}` : "No CEL cases.";
    return { html: `<p class="placeholder">${msg}</p>`, anchors, reveals };
  }

  let html = "";
  let idx = 0;
  for (const sc of result.scenarios) {
    const caseId = caseIdByName[sc.case.name]; // undefined → un-revealable (renders, no anchor)
    const id = `${prefix}cel${idx++}`;
    const attrs = [`id="${escapeHtml(id)}"`, `class="cel-case cel-${sc.status}"`];
    if (caseId !== undefined) {
      anchors[caseId] = { scrollTo: id, segmentIds: [id] };
      const key = `${prefix}k${id}`;
      reveals[key] = { caseId };
      attrs.push(`data-reveal="${escapeHtml(key)}"`);
    }
    const facts = sc.case.facts.map((f) => escapeHtml(f.name)).join(", ");
    const produced = sc.produced.map((p) => escapeHtml(p.recommendation)).join(", ");
    html +=
      `<div ${attrs.join(" ")}>` +
      `<span class="cel-status">${BADGE[sc.status] ?? "·"}</span> ` +
      `<span class="cel-name">${escapeHtml(sc.case.name)}</span>` +
      (sc.case.subject ? ` <span class="cel-subject">(${escapeHtml(sc.case.subject)})</span>` : "") +
      (facts ? `<div class="cel-facts">facts: ${facts}</div>` : "") +
      (produced ? `<div class="cel-produced">→ ${produced}</div>` : "") +
      `</div>`;
  }
  return { html, anchors, reveals };
}
