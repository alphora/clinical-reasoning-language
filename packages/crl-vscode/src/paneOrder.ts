// Pane-order normalization (vscode-free, unit-tested) — three-pane viewer C2b-4 (#156).
// The `crl.correspondence.paneOrder` setting is user-editable JSON, so it can be malformed (dupes, unknown ids, missing
// panes, not even an array). normalizePaneOrder repairs ANY input into a valid length-3 permutation of the panes, so a
// bad setting can never break the cockpit (a missing pane would leave a column gap / an extra would open a 4th column).
import type { Pane } from "./correspondenceEngine";

export const CANONICAL_PANE_ORDER: readonly Pane[] = ["source", "crl", "cel"];

/** Always returns a permutation containing exactly source, crl, cel once each (keeps the user's valid prefix order,
 *  drops unknowns/dupes/non-strings, appends any missing in canonical order). */
export function normalizePaneOrder(raw: unknown): Pane[] {
  const valid = new Set<Pane>(CANONICAL_PANE_ORDER);
  const seen = new Set<Pane>();
  const out: Pane[] = [];
  if (Array.isArray(raw)) {
    for (const x of raw) {
      if (typeof x === "string" && valid.has(x as Pane) && !seen.has(x as Pane)) {
        seen.add(x as Pane);
        out.push(x as Pane);
      }
    }
  }
  for (const p of CANONICAL_PANE_ORDER) if (!seen.has(p)) out.push(p); // append missing in canonical order
  return out;
}
