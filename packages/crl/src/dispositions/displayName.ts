/**
 * DISPLAY-only helper for PA determination outcomes.
 *
 * A determination activity is named `"<category>.<key>"` where the category is a Da Vinci PAS review-action
 * (`certify` / `not-certify` / `pended`) and the key is the deployment-configured reason/flavor (which MAY contain
 * spaces, e.g. `"Unmet EIU"`). The category is implied by the key, so the cockpit shows only the human `<key>` part.
 *
 * This is the SINGLE SOURCE OF TRUTH for that projection — the view-model / CRE (this package) and the crl-vscode
 * webview renderers both import it. It is STRICTLY cosmetic: it never touches the underlying activity name used for
 * outcome MATCHING / expected-vs-actual comparison / `.cel` oracle checks / ids. Only the rendered string changes.
 *
 * A name that is not a determination (an ordinary activity or decision name, e.g. `"Order MRI"` or a name whose
 * prefix is not one of the PAS categories) is returned UNCHANGED.
 */
import { DISPOSITION_CATEGORIES } from "./categories";

/** `^(certify|not-certify|pended)\.(.+)$` — the category alternation is derived from the framework table so the two
 *  can never drift. `(.+)` captures the whole key, spaces included, after the FIRST `.` (category names hold no `.`). */
const DETERMINATION_NAME_RE = new RegExp(
  `^(?:${DISPOSITION_CATEGORIES.map((c) => c.name).join("|")})\\.(.+)$`,
);

/**
 * Return the human `<key>` for a determination activity name (`"certify.Met"` → `"Met"`,
 * `"not-certify.Unmet EIU"` → `"Unmet EIU"`); return `name` unchanged for any non-determination name.
 */
export function displayDetermination(name: string): string {
  const m = DETERMINATION_NAME_RE.exec(name);
  return m ? m[1] : name;
}
