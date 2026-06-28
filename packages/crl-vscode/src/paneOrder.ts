// Pane-order normalization (vscode-free, unit-tested) — three-pane viewer C2b-4 (#156).
// The `crl.cockpit.paneOrder` setting is user-editable JSON, so it can be malformed (dupes, unknown ids, missing
// panes, not even an array). normalizePaneOrder repairs ANY input so a bad setting can never break the cockpit (a missing
// canonical pane would leave a column gap; an unknown id would be dropped before it could open a stray column).
//
// Two sets, deliberately distinct:
//   - VALID_PANES — every pane the cockpit CAN show. Includes the opt-in graphical decision-tree pane ("tree"): if the
//     user explicitly lists it, it is honored; it just isn't forced on anyone.
//   - CANONICAL_PANE_ORDER — the panes ALWAYS present, and the order missing ones are appended in. tree is intentionally
//     NOT canonical, so it is never auto-appended. tree DOES ship in the package.json `paneOrder` default (a fresh cockpit
//     shows it), but because it's non-canonical a user who sets a tree-less order keeps it — that's the opt-OUT. So output
//     is the 3 canonical panes (any user-given order) PLUS tree iff the user's list (or the package default) includes it.
import type { Pane } from "./correspondenceEngine";

export const CANONICAL_PANE_ORDER: readonly Pane[] = ["source", "crl", "cel"];
const VALID_PANES: ReadonlySet<Pane> = new Set<Pane>(["source", "crl", "cel", "tree"]);

/** Keeps the user's valid prefix order (dropping unknowns/dupes/non-strings), then appends any missing CANONICAL pane in
 *  canonical order. tree is valid-but-not-canonical: honored if listed, never appended. */
export function normalizePaneOrder(raw: unknown): Pane[] {
  const seen = new Set<Pane>();
  const out: Pane[] = [];
  if (Array.isArray(raw)) {
    for (const x of raw) {
      if (typeof x === "string" && VALID_PANES.has(x as Pane) && !seen.has(x as Pane)) {
        seen.add(x as Pane);
        out.push(x as Pane);
      }
    }
  }
  for (const p of CANONICAL_PANE_ORDER) if (!seen.has(p)) out.push(p); // always-present panes, appended in canonical order
  return out;
}
