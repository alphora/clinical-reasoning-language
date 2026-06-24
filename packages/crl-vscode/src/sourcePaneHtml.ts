// Source pane RENDERER (vscode-free, unit-tested) — three-pane viewer C2a (#156).
// Renders the anchor narrative as decorated HTML for a hermetic webview. The text is SEGMENTED at every mark boundary
// into non-overlapping runs (covered unit spans + uncovered/ignored overlays can partially overlap), each carrying the
// SET of classes covering it. Returns reveal anchors (unit → its segments) + an opaque-key reveal map (segment click →
// the trusted unit + its source range, never a path/range from the webview). Perf: this is the measured full-render
// floor (per disc 118); the caller gates on size and STOPs/falls back before calling for an over-threshold anchor.
// Design authority: .vibe-tools/discussions/118-c2a-source-spine.md.
import type { ZeroBasedRange } from "@smile-digital-health/crl/language-services";

import { corrKeyHtml } from "./corrKey";

export interface UnitSpan {
  unitId: string;
  range: ZeroBasedRange;
}
export interface OverlaySpan {
  kind: "uncovered" | "ignored";
  range: ZeroBasedRange;
}
export interface UnitAnchor {
  /** the first segment element id for this unit (scroll target). */
  scrollTo: string;
  /** ALL segment element ids covering this unit (so the shell can highlight a unit split across segments). */
  segmentIds: string[];
}
export interface RenderedSource {
  html: string;
  /** unitId → its segments (reveal/highlight target). */
  anchors: Record<string, UnitAnchor>;
  /** opaque key (namespaced per render) → the trusted unit + source range a segment click selects / opens. */
  reveals: Record<string, { unitId: string; range: ZeroBasedRange }>;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** Line start offsets (JS/UTF-16 indices), split on \n. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}
/** Map a ZeroBasedRange position → a JS (UTF-16) string offset. col is UTF-16 code units; clamp to the LINE's end so a
 *  malformed over-long col never bleeds into the next line. */
function toOffset(starts: number[], len: number, line: number, col: number): number {
  const li = Math.max(0, Math.min(line, starts.length - 1));
  const lineEnd = li + 1 < starts.length ? starts[li + 1] - 1 : len; // exclude the trailing \n
  return Math.max(0, Math.min(starts[li] + Math.max(0, col), lineEnd));
}

interface AbsSpan {
  start: number;
  end: number;
  unitId?: string;
  range?: ZeroBasedRange; // original source range (unit spans only) — trusted locus for open-raw
  kind?: "uncovered" | "ignored";
}

export function renderSourcePane(
  anchorText: string,
  units: UnitSpan[],
  overlays: OverlaySpan[],
  // unitNumber + showKeys = the #163 at-rest key. The source key is an INLINE badge before each covered run, deduped
  // while membership is unchanged across adjacent covered runs (re-shown after an uncovered gap).
  opts: { revealPrefix?: string; unitNumber?: Map<string, number>; showKeys?: boolean } = {},
): RenderedSource {
  const prefix = opts.revealPrefix ?? "";
  const unitNumber = opts.unitNumber ?? new Map<string, number>();
  const showKeys = opts.showKeys ?? false;
  const starts = lineStarts(anchorText);
  const len = anchorText.length;
  const toAbs = (r: ZeroBasedRange): { start: number; end: number } => ({
    start: toOffset(starts, len, r.startLine, r.startCol),
    end: toOffset(starts, len, r.endLine, r.endCol),
  });

  const spans: AbsSpan[] = [
    ...units.map((u) => ({ ...toAbs(u.range), unitId: u.unitId, range: u.range })),
    ...overlays.map((o) => ({ ...toAbs(o.range), kind: o.kind })),
  ].filter((s) => s.end > s.start); // drop zero-width / inverted

  const bset = new Set<number>([0, len]);
  for (const s of spans) {
    bset.add(s.start);
    bset.add(s.end);
  }
  const bounds = [...bset].filter((b) => b >= 0 && b <= len).sort((a, b) => a - b);

  const anchors: Record<string, UnitAnchor> = {};
  const reveals: Record<string, { unitId: string; range: ZeroBasedRange }> = {};
  let html = "";
  let segIdx = 0;
  let lastBadgedKey = ""; // the unit-number membership of the last badge emitted; reset on a non-covered run

  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i];
    const b = bounds[i + 1];
    if (b <= a) continue;
    const covering = spans.filter((s) => s.start <= a && b <= s.end);
    if (covering.length === 0) {
      html += escapeHtml(anchorText.slice(a, b)); // plain run, no marks
      lastBadgedKey = ""; // a gap → the next covered run re-shows its badge even if same membership
      continue;
    }
    const coveringUnits = covering.filter((s) => s.unitId);
    const unitIds = [...new Set(coveringUnits.map((s) => s.unitId!))];
    const kinds = [...new Set(covering.filter((s) => s.kind).map((s) => s.kind!))];
    const classes = [...(unitIds.length ? ["covered"] : []), ...kinds];
    const id = `${prefix}seg${segIdx++}`;
    const attrs = [`id="${escapeHtml(id)}"`, `class="${classes.join(" ")}"`];
    if (coveringUnits.length) {
      // opaque reveal key → the FIRST covering unit + its source range (multi-unit overlap selects the first; a
      // quick-pick is a later affordance). Trusted: the range comes from the model, never the webview.
      const first = coveringUnits[0];
      const key = `${prefix}k${id}`;
      reveals[key] = { unitId: first.unitId!, range: first.range! };
      attrs.push(`data-reveal="${escapeHtml(key)}"`);
      for (const uid of unitIds) {
        const anchor = (anchors[uid] ??= { scrollTo: id, segmentIds: [] });
        anchor.segmentIds.push(id);
      }
    }
    // At-rest badge (#163-2): placed AFTER the run's leading whitespace (so it never sits before indentation), BEFORE the
    // <span> (so it's not part of the covered highlight/click target → a badge click is an inert no-op). Deduped while the
    // unit membership is unchanged across adjacent covered runs (a nested overlay splits a run into same-membership pieces
    // → one badge). The span keeps the run's content (minus leading whitespace) so highlight/anchor/click are unchanged.
    const raw = anchorText.slice(a, b);
    const leadLen = raw.length - raw.trimStart().length;
    const restHtml = escapeHtml(raw.slice(leadLen));
    const numbers = [...new Set(unitIds.map((u) => unitNumber.get(u)).filter((n): n is number => n !== undefined))].sort((x, y) => x - y);
    let badge = "";
    if (numbers.length === 0) {
      lastBadgedKey = ""; // an overlay-only / unnumbered covered run is a visual GAP → the next numbered run re-badges
    } else if (showKeys && raw.slice(leadLen).length > 0 && numbers.join(",") !== lastBadgedKey) {
      badge = corrKeyHtml(numbers);
      lastBadgedKey = numbers.join(",");
    }
    // else: a numbered run with unchanged membership OR a whitespace-only numbered run → no badge, membership kept (so a
    // unit split only by internal whitespace shows ONE badge, not one per piece).
    html += escapeHtml(raw.slice(0, leadLen)) + badge + `<span ${attrs.join(" ")}>${restHtml}</span>`;
  }

  return { html, anchors, reveals };
}
