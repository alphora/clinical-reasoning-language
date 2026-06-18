/**
 * Reproducible emit-date resolution. Resolves a SINGLE date once (at the
 * `emitFhirDefFromPath` / `emitFhirDefClosure` boundary) and returns it wrapped
 * as a fixed `clock`, so the per-resource emitters stay unchanged and there is
 * no intra-emit drift.
 *
 * Precedence (reproducible-builds aligned):
 *   1. `opts.date`            — explicit override (CLI `--date` / API)
 *   2. `SOURCE_DATE_EPOCH`    — env, epoch SECONDS (reproducible-builds spec)
 *   3. `crl.date`             — package.json managed default (authoritative SoT)
 *   4. `opts.clock()`         — test seam
 *   5. wall clock             — dev fallback
 *
 * Invalid explicit (`opts.date`) or env (`SOURCE_DATE_EPOCH`) inputs are hard
 * errors (returned in `errors`, never thrown); resolution still yields a usable
 * clock so a partial resource can be emitted for inspection while `success`
 * is forced false upstream.
 */

import type { CRLError } from "../types/errors";

import { isPublishablePlus } from "./types";
import type { CpgMetadata, EmitOptions } from "./types";

export function resolveEmitClock(
  opts: EmitOptions,
  metadata: CpgMetadata,
  env: NodeJS.ProcessEnv = process.env,
): { clock: () => Date; errors: CRLError[] } {
  const errors: CRLError[] = [];

  // 1. explicit opts.date
  if (opts.date !== undefined) {
    const d = opts.date instanceof Date ? opts.date : new Date(opts.date);
    if (Number.isNaN(d.getTime())) {
      errors.push({
        type: "Validation",
        kind: "invalid-emit-date",
        message: `\`date\` option is not a valid date: ${JSON.stringify(opts.date)}`,
      });
    } else {
      return { clock: () => d, errors };
    }
  }

  // 2. SOURCE_DATE_EPOCH — epoch seconds, digits only
  const sde = env.SOURCE_DATE_EPOCH;
  if (sde !== undefined && sde.trim() !== "") {
    const s = sde.trim();
    if (!/^\d+$/.test(s)) {
      errors.push({
        type: "Validation",
        kind: "invalid-source-date-epoch",
        message: `SOURCE_DATE_EPOCH must be a non-negative integer (epoch seconds); got ${JSON.stringify(sde)}`,
      });
    } else {
      const d = new Date(Number(s) * 1000);
      // Guard millisecond-shaped values (and overflow): epoch seconds for a
      // FHIR date can't exceed year 9999. Rejects e.g. "1700000000000" (ms).
      if (Number.isNaN(d.getTime()) || d.getUTCFullYear() > 9999) {
        errors.push({
          type: "Validation",
          kind: "invalid-source-date-epoch",
          message: `SOURCE_DATE_EPOCH out of range (epoch SECONDS; FHIR dates max year 9999): ${sde}`,
        });
      } else {
        return { clock: () => d, errors };
      }
    }
  }

  // 3. crl.date (validated parseable in metadata.ts — trust it).
  if (metadata.crlDate) {
    return { clock: () => new Date(metadata.crlDate as string), errors };
  }

  // 4. opts.clock test/legacy seam.
  if (opts.clock) return { clock: opts.clock, errors };

  // 5. wall clock — but a publishable+ emit MUST have a resolvable date
  // (reproducibility is not opt-in). Flag it so success is forced false; still
  // return a clock so a partial resource can be emitted for inspection.
  if (isPublishablePlus(opts.capability ?? "publishable")) {
    errors.push({
      type: "Validation",
      kind: "missing-publishable-date",
      message:
        "No resolvable publication date for a publishable+ emit. Reproducible builds require an explicit date — pass --date, set SOURCE_DATE_EPOCH, or add `crl.date` to package.json.",
    });
  }
  return { clock: () => new Date(), errors };
}
