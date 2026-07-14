// #212 step 2 — the SINGLE seam that validates a flag draft + builds the store record. Both store-flag creators (the MCP
// `create_flag` tool AND the cockpit's commitFlagDraft) route through here, so there is ONE validation path (no drift). Today
// it reuses `createFlag` — the `.crl` registry validator (tag known / required fields / enum / target-declaration exists) — as
// a DRY RUN, discards its source-splice output, and adapts the validated FlagInstance to an `MvFlag`. STEP 4 swaps ONLY the
// validator inside here for a pure `MvFlag`-draft validator (for both callers atomically), then `createFlag` can be deleted.
import { createHash, randomUUID } from "node:crypto";

import { createFlag, type CreateFlagInput, type CreateFlagTarget, type SlimDiagnostic } from "../refactors/createFlag";
import { legacyToMvFlag } from "./mvFlagLegacy";
import type { MvFlag } from "./mvFlag";

/** The failure reasons a store-flag build can surface. The `.crl`-splice-only reason `resolve-failed` (and `createFlag`'s own
 *  `invalid-result` splice/read-back messages) are surfaced as `invalid-result` with a STORE-NEUTRAL message — an agent
 *  writing a JSON store shouldn't see "no legal meta slot" / "would make the document invalid" (those are `.crl` artifacts). */
export type BuildFlagFailure = "unknown-tag" | "missing-field" | "invalid-value" | "decl-not-found" | "invalid-result" | "parse-failed";

export type BuildFlagResult =
  | { ok: true; flag: MvFlag }
  | { ok: false; reason: BuildFlagFailure; message: string; diagnostics?: SlimDiagnostic[] };

/** A stable content fingerprint for retry-idempotency — an agent that retries a create after a dropped response gets the SAME
 *  dedupKey, so the caller can skip re-adding. (When the caller supplied a `; key` re-add-guard, `legacyToMvFlag` already put
 *  it on the record; we keep that and only synthesize a hash when there's none.) Includes `fields` (sorted) — two flags that
 *  share anchor+tag+gist but differ in a meaning-bearing field (e.g. `@fidelity-defect` `direction`, or a distinct `ref`) are
 *  DISTINCT and must NOT collapse (Claude impl review). */
function contentDedupKey(flag: MvFlag): string {
  const a = flag.anchor;
  const fields = Object.entries(flag.fields).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  return "d-" + createHash("sha1").update(JSON.stringify([a.scope, a.name, a.library ?? "", a.occurrenceKey ?? "", flag.tag, flag.gist, fields])).digest("hex");
}

/** Validate a flag draft against `source` and build a complete `MvFlag` (host-injected `id`/`createdAt`, a `dedupKey` for
 *  idempotency). `id`/`now` are injectable for deterministic tests. Returns a domain failure (never throws) on invalid input. */
export function validateAndBuildMvFlagDraft(
  source: string,
  target: CreateFlagTarget,
  input: CreateFlagInput,
  id: () => string = randomUUID,
  now: () => string = () => new Date().toISOString(),
): BuildFlagResult {
  const made = createFlag(source, target, input);
  if (!made.ok) {
    // `resolve-failed`/`invalid-result` are `.crl`-splice artifacts (no legal meta slot / would make the doc invalid) — they
    // don't apply to a JSON store, so surface a store-neutral message under `invalid-result` (keep the detail for debugging).
    if (made.reason === "resolve-failed" || made.reason === "invalid-result") {
      return { ok: false, reason: "invalid-result", message: `the flag could not be validated for that target (${made.message})`, diagnostics: made.diagnostics };
    }
    return { ok: false, reason: made.reason, message: made.message, diagnostics: made.diagnostics };
  }
  const base = legacyToMvFlag(made.flag).flag; // adapts the validated FlagInstance → MvFlag (splits fields, promotes the key to an anchor)
  const dedupKey = base.dedupKey ?? contentDedupKey(base);
  return { ok: true, flag: { ...base, dedupKey, id: id(), createdAt: now() } };
}
