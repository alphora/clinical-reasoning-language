// #212 S3 — the un-migrated-flag SAFETY NET (pure + unit-tested). A store-only cockpit reads flags ONLY from `medical-validation/flags/`; if a
// policy still has a `.crl`-EMBEDDED review flag (un-migrated / an old checkout), the cockpit would silently ignore it → a false
// `mvComplete`. This detects such flags so the cockpit can BLOCK the gate. Matched by the former flag TAGS (+ aliases) — a FIXED
// historical set (the registry flag entries are stripped in S4, so this can't read the registry; un-migrated content only ever
// carried these). STATUS-AGNOSTIC (an absent/`pending` status is still a real open flag) and multi-line-body-safe (the `@tag` is
// on the `- meta is` line). Whitespace-flexible per the grammar (`DASH META_IS backtickString`; WS is skipped, and no space is
// required before the backtick), and anchored past leading whitespace so a COMMENTED-OUT `// - meta is \`@…\`` isn't a false hit.

/** The former `flag:true` registry tags + `fidelity-defect`'s two aliases. A fixed historical set (see the header). */
export const FORMER_FLAG_TAGS = ["validation-concern", "fidelity-defect", "over-reach-to-fix", "criterion-drop-to-fix", "internal-inconsistency", "customer-confirmable", "open-fork"] as const;

const EMBEDDED_FLAG_RE = new RegExp("^\\s*-\\s+meta is\\s*`@(?:" + FORMER_FLAG_TAGS.join("|") + ")\\b", "gm");

/** How many `.crl`-embedded review-flag meta lines `text` contains (0 = none). Used by the cockpit to block the mvComplete gate
 *  on un-migrated flags. Whitespace-flexible, status-agnostic, comment-excluding (see the header). */
export function countEmbeddedFlags(text: string): number {
  return (text.match(EMBEDDED_FLAG_RE) ?? []).length;
}
