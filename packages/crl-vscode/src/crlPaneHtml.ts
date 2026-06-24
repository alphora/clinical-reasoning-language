// CRL pane RENDERER (vscode-free, unit-tested) — three-pane viewer C2b-2 (#156).
// Renders the CRL-structure view-model (the decision tree) as decorated, indented HTML for the hermetic webview. Each
// row is one element keyed by its UNIQUE nodeKey (decision roots + sub-nodes are all distinct) — so `anchors` is 1:1 and
// simple; the source-unit→row multiplicity (one concept referenced by many rows) lives in crlRevealMaps, not here.
// Mirrors sourcePaneHtml's conventions (gen-prefixed ids/keys, XSS-escaped, opaque reveal keys). Design: disc 120.
import type { CrlDecisionStructure, CrlStructureNode } from "@smile-digital-health/crl";

import { corrDepthClass, corrKeyHtml } from "./corrKey";

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
  // rowKeyNumbers: nodeKey → its corresponding units' numbers (#163 at-rest key). showKeys gates the slot.
  opts: { revealPrefix?: string; rowKeyNumbers?: Record<string, number[]>; showKeys?: boolean } = {},
): RenderedCrl {
  const prefix = opts.revealPrefix ?? "";
  const rowKeyNumbers = opts.rowKeyNumbers ?? {};
  const showKeys = opts.showKeys ?? false;
  const anchors: Record<string, CrlAnchor> = {};
  const reveals: Record<string, { nodeKey: string }> = {};
  let idx = 0;
  let html = "";

  // A row = flex container [at-rest key slot | depth-classed label]. Indentation is a CSS depth class on the LABEL (NOT
  // an inline style — the webview CSP forbids `style=`; the old inline padding was silently dropped) so the key column
  // stays left-aligned regardless of branch depth. The container carries the id/data-reveal (the whole row is the target).
  const emit = (nodeKey: string, label: string, labelClasses: string[], depth: number): void => {
    const id = `${prefix}crl${idx++}`;
    const key = `${prefix}k${id}`;
    anchors[nodeKey] = { scrollTo: id, segmentIds: [id] };
    reveals[key] = { nodeKey };
    const keySlot = showKeys ? corrKeyHtml(rowKeyNumbers[nodeKey] ?? []) : "";
    html +=
      `<div id="${escapeHtml(id)}" class="crl-row" data-reveal="${escapeHtml(key)}">` +
      keySlot +
      `<span class="${[...labelClasses, corrDepthClass(depth)].join(" ")}">${escapeHtml(label)}</span>` +
      `</div>`;
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
