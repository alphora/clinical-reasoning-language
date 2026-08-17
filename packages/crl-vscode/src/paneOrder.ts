// Pane-order normalization (vscode-free, unit-tested) — three-pane viewer C2b-4 (#156).
// The `crl.cockpit.paneOrder` / `crl.medical-validation.paneOrder` settings are user-editable JSON, so they can be
// malformed (dupes, unknown ids, missing panes, not even an array). normalizePaneOrder repairs ANY input so a bad setting
// can never break a panel (a missing canonical pane would leave a column gap; an unknown id would be dropped before it
// could open a stray column).
//
// SPEC-BASED (#156 medical-validation slice 3). The two panel modes (cockpit, medical-validation) share this one
// normalizer but differ in their valid set, canonical default, AND public→internal aliasing — so the rules are a SPEC
// parameter, not a hard-coded constant. A spec has:
//   - valid     — every PUBLIC pane key the mode CAN show (the package.json enum for that mode's paneOrder).
//   - canonical — the panes ALWAYS present, in the order missing ones are appended. A non-canonical valid key (e.g.
//                 "tree" for the cockpit) is honored when listed but never auto-appended — that's the opt-OUT.
//   - aliases   — optional public-key → InternalPane remap (a public key that renders as a DIFFERENT internal pane).
//                 Currently UNUSED (the MV `worklist → cel` alias was dropped when worklist became its own pane, disc 179);
//                 the mechanism stays for future public-key remaps. Output is always InternalPanes; dedup is BY INTERNAL
//                 pane, so two public keys aliasing the same internal pane collapse to one (the first wins).
import type { Pane } from "./correspondenceEngine";

/** An internal pane is what the shell actually renders (the engine's Pane). Public keys may alias onto one of these. */
export type InternalPane = Pane;
/** A public pane key is what a user types in settings — a superset of InternalPane (adds aliases like "worklist"). */
export type PublicPaneKey = string;

export interface PaneSpec {
  /** Every PUBLIC key this mode accepts (its package.json paneOrder enum). */
  valid: readonly PublicPaneKey[];
  /** The always-present panes (PUBLIC keys), in append order. Non-canonical valid keys are honored-but-not-appended. */
  canonical: readonly PublicPaneKey[];
  /** Optional public-key → internal-pane remap. Unmapped keys pass through unchanged (must already be an InternalPane). */
  aliases?: Record<PublicPaneKey, InternalPane>;
}

/** The cockpit spec. `canonical` is the FALLBACK (see normalizePaneOrder), so it MUST equal
 *  `crl.cockpit.paneOrder`'s `default` in package.json — otherwise deleting the setting and setting it to a
 *  non-array give different panels. It previously omitted `tree` (correct when canonical meant "always
 *  appended", wrong now that it means "what you get with no usable setting"); pinned by package.test.mjs. */
export const COCKPIT_PANE_SPEC: PaneSpec = {
  valid: ["source", "crl", "cel", "tree"],
  canonical: ["source", "crl", "cel", "tree"],
};

/** The medical-validation spec — `worklist` is now a FIRST-CLASS internal pane (the review surface), DISTINCT from `cel`
 *  (the read-only case-list). Default = [worklist, source, tree, questionnaire]. `cel` (read-only) + `crl` are valid-but-
 *  not-canonical, so a MV user can open the read-only CEL alongside the worklist. No alias (dropped when worklist split
 *  from cel — pane split, disc 179): listing both `worklist` and `cel` now opens BOTH (they're different internal panes). */
export const MEDICAL_VALIDATION_PANE_SPEC: PaneSpec = {
  // `canonical` here is the FALLBACK (see normalizePaneOrder) — what MV shows when the setting is unset, not a
  // set of panes forced into an explicit order. Every pane below, worklist included, can be omitted by writing
  // an order without it, and an empty order shows nothing.
  // MV defaults to ALL its panes; a user narrows from there.
  valid: ["worklist", "source", "tree", "questionnaire", "fhirQuestionnaire", "crl", "cel"],
  canonical: ["worklist", "source", "tree", "questionnaire", "fhirQuestionnaire", "crl", "cel"],
};

/** Every internal pane, in a stable order — the ONE authoritative list. Anything that needs to enumerate panes
 *  (the valid set below, the webview view types, the serializer registration) derives from this rather than
 *  repeating it, because the repeated copies have already drifted once: `fhirQuestionnaire` was added to the
 *  cockpit's list and to this file but missed in `correspondenceEngine.PANES`, silently costing that pane its
 *  reveal effects. None of those lists is compiler-checked against the `Pane` union. */
export const ALL_PANES: readonly Pane[] = ["source", "crl", "cel", "tree", "questionnaire", "fhirQuestionnaire", "worklist"];

/** The webview view type for a pane's panel. Shared so the panel that is CREATED and the serializer that
 *  RECLAIMS it after a window reload can never disagree — a mismatch there is invisible until a restored tab
 *  refuses to go away. */
export const cockpitViewType = (pane: Pane): string => `crlCockpit.${pane}`;

const VALID_PANES: ReadonlySet<Pane> = new Set<Pane>(ALL_PANES);

/** Resolve a PUBLIC key to an InternalPane via the spec's aliases (identity when unmapped); undefined if the result is
 *  not a real pane (so an alias can never introduce a non-pane). */
function toInternal(key: string, spec: PaneSpec): InternalPane | undefined {
  const resolved = spec.aliases?.[key] ?? key;
  return VALID_PANES.has(resolved as Pane) ? (resolved as Pane) : undefined;
}

/** Normalize a user-supplied paneOrder against `spec`: keep the user's valid prefix order (dropping non-strings,
 *  keys ∉ spec.valid, and dupes), resolving each through aliases to its InternalPane — then append any missing CANONICAL
 *  pane (also alias-resolved) in canonical order. Dedup is BY INTERNAL pane: if a user lists both a public key and its
 *  alias target (e.g. "worklist" and "cel"), the first wins and the second is dropped. A non-canonical valid key is
 *  honored when listed but never appended (the opt-out). Output is always InternalPanes. */
export function normalizePaneOrder(raw: unknown, spec: PaneSpec): Pane[] {
  const validKeys = new Set(spec.valid);
  const seen = new Set<Pane>(); // dedup space is INTERNAL panes (so alias + target can't both survive)
  const out: Pane[] = [];
  if (Array.isArray(raw)) {
    for (const x of raw) {
      if (typeof x !== "string" || !validKeys.has(x)) continue;
      const internal = toInternal(x, spec);
      if (internal === undefined || seen.has(internal)) continue;
      seen.add(internal);
      out.push(internal);
    }
  }
  // SETTINGS ARE THE SOURCE OF TRUTH. Any ARRAY the user writes is honored exactly — nothing is force-appended,
  // so every pane is opt-out-able, and an EMPTY array means an empty panel. That is a real thing to want, and
  // silently repopulating it would be the same bug as force-appending.
  //
  // `canonical` is the FALLBACK for when the user has expressed nothing AT ALL — the setting is unset or not an
  // array. It is not a set of mandatory panes.
  //
  // This changed (2026-08-16). Panes used to be appended whether or not the user listed them, so an order that
  // omitted one silently got it back and no pane could be turned off.
  if (!Array.isArray(raw)) {
    for (const key of spec.canonical) {
      const internal = toInternal(key, spec);
      if (internal !== undefined && !seen.has(internal)) {
        seen.add(internal);
        out.push(internal);
      }
    }
  }
  return out;
}
