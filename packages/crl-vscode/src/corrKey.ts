// At-rest correspondence KEY (vscode-free, unit-tested) — #163. A compact per-unit key (sorted unit number(s) + a
// cycled color swatch) echoed on every corresponding element across the panes + navigator, so "what links to what" is
// visible WITHOUT selecting. The number is authoritative (colorblind-safe + handles multi-unit clusters: a COVER, so an
// element can belong to several units → "3,7"); color is a fast-grouping aid that cycles a small palette (numbers
// disambiguate collisions beyond the palette size). All styling is CSS CLASSES (the cockpit CSP forbids inline `style=`).
export const CORR_PALETTE_SIZE = 6; // the VS Code chart-color hues (red/blue/yellow/orange/green/purple)
const MAX_DEPTH = 12; // CRL indentation depth classes are clamped to this (deeper rows stop indenting further)
const MAX_SWATCHES = 3; // show at most this many color swatches; the number text always carries the full membership

/** The color class for a unit number (1-based) — cycled mod the palette size. */
export const corrColorClass = (unitNumber: number): string => `corr-c${(unitNumber - 1) % CORR_PALETTE_SIZE}`;
/** The CRL indentation depth class (clamped). */
export const corrDepthClass = (depth: number): string => `corr-d${Math.min(Math.max(depth, 0), MAX_DEPTH)}`;

/**
 * The at-rest key slot for an element's unit numbers. `numbers` MUST be sorted + deduped by the caller. Returns "" when
 * empty (no slot) — so an un-corresponding element renders unchanged. Up to MAX_SWATCHES color swatches (by the leading
 * numbers) + the full comma-joined number text. Numbers are integers → no escaping needed.
 */
export function corrKeyHtml(numbers: number[]): string {
  if (numbers.length === 0) return "";
  const swatches = numbers.slice(0, MAX_SWATCHES).map((n) => `<span class="corr-sw ${corrColorClass(n)}"></span>`).join("");
  const noun = numbers.length === 1 ? "unit" : "units";
  return `<span class="corr-key" title="correspondence ${noun} ${numbers.join(", ")}">${swatches}<span class="corr-num">${numbers.join(",")}</span></span>`;
}

/** Palette + key-slot + CRL depth CSS — concatenated into the cockpit's nonced <style> (CSP-safe; no inline styles). */
export const CORR_STYLE = (() => {
  const hues = ["red", "blue", "yellow", "orange", "green", "purple"]; // --vscode-charts-<hue>, with hex fallbacks
  const fallback = ["#f14c4c", "#3794ff", "#d29922", "#e2b33e", "#73c991", "#b180d7"];
  const palette = hues
    .map((h, i) => `.corr-sw.corr-c${i}{background:var(--vscode-charts-${h},${fallback[i]})}`)
    .join("");
  const depth = Array.from({ length: MAX_DEPTH + 1 }, (_, d) => `.corr-d${d}{padding-left:${d * 14}px}`).join("");
  return (
    `.corr-key{display:inline-flex;align-items:center;gap:2px;margin-right:6px;user-select:none;opacity:.85;flex:none}` +
    `.corr-sw{display:inline-block;width:7px;height:7px;border-radius:2px}` +
    `.corr-num{font-size:.85em;opacity:.8;font-variant-numeric:tabular-nums}` +
    palette +
    depth
  );
})();
