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
import { CATEGORY_BY_NAME } from "./categories";
import type { DispositionCategoryName } from "./types";

/** A determination activity name split into its PAS category + optional reason key. */
export interface DeterminationName {
  category: DispositionCategoryName;
  /** The reason/flavor after the first `.` (spaces allowed); ABSENT for a bare single-option category name. */
  key?: string;
}

/**
 * Parse a determination activity name (`"<category>.<key>"`, or a bare single-option `"<category>"`) into its PAS
 * category + optional key — the SINGLE parse both `displayDetermination` and `determinationCategory` share (so display
 * and color can never drift). Splits at the FIRST `.` (category names hold no `.`; a key may). A name whose head is NOT
 * a framework category (`CATEGORY_BY_NAME`) → `undefined` (an ordinary activity/decision name, e.g. `"Order MRI"`).
 */
export function parseDeterminationName(name: string): DeterminationName | undefined {
  const dot = name.indexOf(".");
  const head = dot === -1 ? name : name.slice(0, dot);
  const cat = CATEGORY_BY_NAME.get(head);
  if (!cat) return undefined;
  // `cat` came from CATEGORY_BY_NAME (the closed framework 3-set), so `cat.name` is a `DispositionCategoryName`.
  const category = cat.name as DispositionCategoryName;
  if (dot === -1) return { category }; // bare single-option category (e.g. "certify")
  const key = name.slice(dot + 1);
  return key === "" ? undefined : { category, key }; // "certify." (empty key) is malformed → not a determination
}

/**
 * Return the human `<key>` for a determination activity name (`"certify.Met"` → `"Met"`,
 * `"not-certify.Unmet EIU"` → `"Unmet EIU"`); return `name` unchanged for a bare category or any non-determination name.
 */
export function displayDetermination(name: string): string {
  return parseDeterminationName(name)?.key ?? name;
}

/** The PAS category (`certify` / `not-certify` / `pended`) of a determination activity name, or `undefined` if the name
 *  is not a determination — the join the MV Tree colors by (certify → green, not-certify + pended → gold). */
export function determinationCategory(name: string): DispositionCategoryName | undefined {
  return parseDeterminationName(name)?.category;
}
