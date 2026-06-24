// CRL pane RENDERER (vscode-free, unit-tested) — three-pane viewer C2b-2 (#156).
// Renders the CRL-structure view-model (the decision tree) as decorated, indented HTML for the hermetic webview. Each
// row is one element keyed by its UNIQUE nodeKey (decision roots + sub-nodes are all distinct) — so `anchors` is 1:1 and
// simple; the source-unit→row multiplicity (one concept referenced by many rows) lives in crlRevealMaps, not here.
// Mirrors sourcePaneHtml's conventions (gen-prefixed ids/keys, XSS-escaped, opaque reveal keys). Design: disc 120.
import type { CrlDecisionStructure, CrlStructureNode } from "@smile-digital-health/crl";

export interface CrlAnchor {
  scrollTo: string;
  segmentIds: string[];
}
export interface RenderedCrl {
  html: string;
  /** nodeKey → its row element (highlight/reveal target). */
  anchors: Record<string, CrlAnchor>;
  /** opaque key (namespaced per render) → the trusted row nodeKey a click selects. */
  reveals: Record<string, { nodeKey: string }>;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);

export function renderCrlPane(
  structure: CrlDecisionStructure[],
  opts: { revealPrefix?: string } = {},
): RenderedCrl {
  const prefix = opts.revealPrefix ?? "";
  const anchors: Record<string, CrlAnchor> = {};
  const reveals: Record<string, { nodeKey: string }> = {};
  let idx = 0;
  let html = "";

  const emit = (nodeKey: string, label: string, classes: string[], depth: number): void => {
    const id = `${prefix}crl${idx++}`;
    const key = `${prefix}k${id}`;
    anchors[nodeKey] = { scrollTo: id, segmentIds: [id] };
    reveals[key] = { nodeKey };
    const pad = depth * 14;
    html +=
      `<div id="${escapeHtml(id)}" class="${classes.join(" ")}" data-reveal="${escapeHtml(key)}" ` +
      `style="padding-left:${pad}px">${escapeHtml(label)}</div>`;
  };

  const walk = (nodes: CrlStructureNode[], depth: number): void => {
    for (const n of nodes) {
      emit(n.nodeKey, n.label, ["crl-node", n.kind, ...(n.actionKind ? [n.actionKind] : [])], depth);
      walk(n.children, depth + 1);
    }
  };

  if (structure.length === 0) return { html: '<p class="placeholder">No CRL decisions.</p>', anchors, reveals };
  for (const d of structure) {
    emit(d.nodeKey, `decision "${d.decision}"`, ["crl-node", "crl-decision"], 0);
    walk(d.children, 1);
  }
  return { html, anchors, reveals };
}
