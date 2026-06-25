// CRL pane RENDERER (vscode-free, unit-tested) — three-pane viewer C2b-2 (#156) + concept layer (#166 Slice 3a).
// Renders the WHOLE CRL: the decision tree (decision roots + sub-nodes, each keyed by its UNIQUE nodeKey) PLUS the
// concept layer (all concepts as addressable rows, grouped by library, with an ADR-0001 layer marker + `defined as`
// summary). Decision rows reveal a DECISION nodeKey (engine-selectable); concept rows reveal a CONCEPT node (a PEEK —
// a distinct hit shape so a concept can never be misrouted as a decision). Gen-prefixed ids/keys, XSS-escaped.
import { classifyConcept, type CrlConceptNode, type CrlDecisionStructure, type CrlStructureNode } from "@smile-digital-health/crl";

import { corrDepthClass, corrKeyHtml } from "./corrKey";

export interface CrlAnchor {
  scrollTo: string;
  segmentIds: string[];
}
export interface RenderedCrl {
  html: string;
  /** nodeKey (decision row OR concept node) → its row element (highlight target). */
  anchors: Record<string, CrlAnchor>;
  /** opaque key → the trusted payload a click resolves to: a decision row ({nodeKey}, engine-selectable) or a concept
   *  node ({conceptNodeKey}, a peek). */
  reveals: Record<string, { nodeKey: string } | { conceptNodeKey: string }>;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);

export function renderCrlPane(
  structure: CrlDecisionStructure[],
  // rowKeyNumbers/conceptKeyNumbers: nodeKey → its units' numbers (#163 at-rest key). showKeys gates the slot.
  opts: {
    revealPrefix?: string;
    rowKeyNumbers?: Record<string, number[]>;
    showKeys?: boolean;
    concepts?: CrlConceptNode[];
    conceptKeyNumbers?: Record<string, number[]>;
  } = {},
): RenderedCrl {
  const prefix = opts.revealPrefix ?? "";
  const rowKeyNumbers = opts.rowKeyNumbers ?? {};
  const conceptKeyNumbers = opts.conceptKeyNumbers ?? {};
  const concepts = opts.concepts ?? [];
  const showKeys = opts.showKeys ?? false;
  const anchors: Record<string, CrlAnchor> = {};
  const reveals: Record<string, { nodeKey: string } | { conceptNodeKey: string }> = {};
  const nameByKey = new Map(concepts.map((c) => [c.nodeKey, c.name]));
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

  // Decision tree.
  if (structure.length === 0 && concepts.length === 0) {
    return { html: '<p class="placeholder">No CRL decisions or concepts.</p>', anchors, reveals };
  }
  for (const d of structure) {
    emit(d.nodeKey, `decision "${d.decision}"`, ["crl-node", "crl-decision"], 0);
    walk(d.children, 1);
  }

  // Concept layer (#166): all concepts, grouped by library (covered policy first per the inventory order), each an
  // addressable PEEK row — at-rest key + ADR-0001 layer marker + orthogonal axis markers + a `defined as` summary.
  if (concepts.length) {
    html += `<div class="crl-concept-head">concepts</div>`;
    let lastLib: string | undefined;
    for (const c of concepts) {
      if (c.lib !== lastLib) {
        html += `<div class="crl-lib-head">${escapeHtml(c.lib)}</div>`;
        lastLib = c.lib;
      }
      const cls = classifyConcept(c);
      const id = `${prefix}crl${idx++}`;
      const key = `${prefix}k${id}`;
      anchors[c.nodeKey] = { scrollTo: id, segmentIds: [id] };
      reveals[key] = { conceptNodeKey: c.nodeKey };
      const keySlot = showKeys ? corrKeyHtml(conceptKeyNumbers[c.nodeKey] ?? []) : "";
      const markers = [
        `<span class="crl-layer crl-layer-${cls.layer}">${cls.layer}</span>`,
        cls.locallyAssertable ? `<span class="crl-mark" title="locally assertable (code is)">local</span>` : "",
        cls.standardized ? `<span class="crl-mark" title="coded from a value set">std</span>` : "",
        cls.external ? `<span class="crl-mark" title="has a source representation">ext</span>` : "",
      ].join("");
      const defNames = c.definitionRefs.map((k) => nameByKey.get(k)).filter((n): n is string => n !== undefined);
      const defSuffix = defNames.length ? `<span class="crl-concept-def"> — defined as: ${escapeHtml(defNames.join(", "))}</span>` : "";
      html +=
        `<div id="${escapeHtml(id)}" class="crl-row crl-concept-row" data-reveal="${escapeHtml(key)}">` +
        keySlot +
        markers +
        `<span class="crl-concept-name">${escapeHtml(c.name)}</span>` +
        defSuffix +
        `</div>`;
    }
  }
  return { html, anchors, reveals };
}
