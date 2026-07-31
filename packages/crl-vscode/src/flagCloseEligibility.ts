// Todo 4 (disc 363; impl-review both arms) — the PURE decision of whether deleting a flag should best-effort close its
// born-together GitHub issue as NOT PLANNED. Extracted from the cockpit so the load-bearing eligibility (the two locked
// operator decisions + the fail-closed rules the impl panel surfaced) is node-testable without vscode. No `vscode` import.

import type { MvFlag } from "@smile-digital-health/crl";

import { issueRefOf } from "./issueLink";

export interface FlagCloseEligibility {
  /** the flag resolves cleanly (by id) in the passed load — false ⇒ already gone / among the unreadable set. */
  present: boolean;
  /** close the born-together issue as not-planned? See the rule set below. */
  willClose: boolean;
  /** the numeric issue number, when the flag's `ref` is `#<digits>`. */
  issueNo?: number;
  /** the digit-string `ref` (for the caller's moved-ref re-check across the confirm). */
  refStr?: string;
}

/**
 * Decide the delete-close eligibility for flag `id` from a store LOAD (`flags` + whether the load had a `warning`). Close iff
 * ALL hold — otherwise the flag is still deleted locally, only the issue is left open:
 *  - `present`: the flag resolves cleanly by id (a target among the unreadable set → not present → block/skip upstream);
 *  - NO store `warning`: a partially-unreadable store can't PROVE sole ownership (an unreadable record may share the ref) →
 *    fail closed (impl-review gpt56 #2 / Claude nit);
 *  - the `ref` is a numeric issue (`#<digits>`); a non-numeric / absent ref has no issue to close;
 *  - the flag is NOT `resolved` (operator 2b — a resolved flag's work was DONE; `not_planned` would mislabel it);
 *  - NO OTHER flag IN THIS LOAD references the same issue (operator 1b — several flags can share one AI/kit-created tracking
 *    issue; closing on one delete would strand the others). The caller MUST pass the FRESH re-read, never a cached list, and
 *    MUST recompute from the post-confirm re-read (the modal window is user-paced; status/sharing can change under it).
 */
export function flagCloseEligibility(flags: readonly MvFlag[], warning: boolean, id: string): FlagCloseEligibility {
  const current = flags.find((f) => f.id === id);
  if (!current) return { present: false, willClose: false };
  const refStr = issueRefOf(current.fields.ref);
  const issueNo = refStr !== undefined ? Number(refStr) : undefined;
  const sharedByOther = refStr !== undefined && flags.some((f) => f.id !== id && issueRefOf(f.fields.ref) === refStr);
  const willClose = issueNo !== undefined && !warning && current.status !== "resolved" && !sharedByOther;
  return { present: true, willClose, issueNo, refStr };
}
