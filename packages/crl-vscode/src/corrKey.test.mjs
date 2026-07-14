// Unit tests for the at-rest correspondence key renderer (#163). vscode-free → imported directly (vitest transforms the .ts).
import assert from "node:assert/strict";

import { corrKeyHtml, corrColorClass, corrDepthClass, CORR_STYLE, CORR_PALETTE_SIZE } from "./corrKey.ts";

const check = test;

check("empty numbers → no slot", () => {
  assert.equal(corrKeyHtml([]), "");
});

check("single number → one swatch (colored by the number) + the number text", () => {
  const h = corrKeyHtml([3]);
  assert.ok(h.includes(`<span class="corr-sw ${corrColorClass(3)}"></span>`));
  assert.ok(h.includes('<span class="corr-num">3</span>'));
});

check("multi-unit → all numbers in text; swatches capped at 3", () => {
  const h = corrKeyHtml([1, 2, 4, 8]);
  assert.ok(h.includes('<span class="corr-num">1,2,4,8</span>'), "full membership in text");
  assert.equal((h.match(/corr-sw/g) || []).length, 3, "at most 3 swatches");
});

check("corrColorClass cycles mod the palette size", () => {
  assert.equal(corrColorClass(1), "corr-c0");
  assert.equal(corrColorClass(CORR_PALETTE_SIZE), `corr-c${CORR_PALETTE_SIZE - 1}`);
  assert.equal(corrColorClass(CORR_PALETTE_SIZE + 1), "corr-c0"); // wraps
});

check("corrDepthClass clamps (no unstyled deep class)", () => {
  assert.equal(corrDepthClass(0), "corr-d0");
  assert.equal(corrDepthClass(3), "corr-d3");
  assert.equal(corrDepthClass(999), "corr-d12"); // clamped
  assert.ok(CORR_STYLE.includes(".corr-d12{"), "the clamp ceiling class exists in the stylesheet");
});

check("CORR_STYLE is CSP-safe (classes only) + defines the palette + depth classes", () => {
  for (let i = 0; i < CORR_PALETTE_SIZE; i++) assert.ok(CORR_STYLE.includes(`.corr-sw.corr-c${i}{`), `palette class ${i}`);
  assert.ok(CORR_STYLE.includes("--vscode-charts-"), "uses theme chart-color vars");
  assert.ok(CORR_STYLE.includes("user-select:none"), "key slot is not selectable");
});

