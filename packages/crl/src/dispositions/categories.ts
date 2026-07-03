/**
 * The framework CATEGORY table + the default vocabulary — grounded in the Da Vinci PAS (Prior Authorization
 * Support) IG, NOT raw X12 recollection.
 *
 * A determination's category is a Da Vinci PAS `reviewActionCode` (the certification ACTION). PAS binds it to the
 * X12 278 HCR01 value set (`REVIEW_ACTION_VALUESET`); an option's `reasonCode` (the "why") is a separate PAS
 * X12278ReviewDecisionReasonCode (`REVIEW_DECISION_REASON_SYSTEM`). This table is the SOLE source of truth for
 * category → {reviewActionCode, finality}; the deployment config supplies only option labels/reason-codes UNDER
 * these categories, never the action codes. (This table is what the prior-auth kit edge surfaces.)
 *
 * ⚠ CODE PROVENANCE: the actual X12 HCR01 code VALUES are X12-COPYRIGHTED and are NOT reproduced in the FHIR IG
 * (the PAS reviewActionCode extension binds to the value set by URL only). The PA category set is EXACTLY these
 * three (operator-confirmed, PAS review-action): certify=A1 (Certified in total), not-certify=A3 (Not certified),
 * pended=A4 (Pended). Other X12 review-action codes (A2 certified-partial, A6 modified, cancel, etc.) are OUT of
 * scope for PA — do not add them without an explicit scope decision.
 */
import type { DispositionCategory, DispositionOption } from "./types";

/** PAS binds `reviewActionCode` to this X12 278 HCR01 (response 2000F/HCR/1/01) value set. */
export const REVIEW_ACTION_VALUESET =
  "https://valueset.x12.org/x217/005010/response/2000F/HCR/1/01/00/306";

/** The PAS review-decision-REASON code system (X12278ReviewDecisionReasonCode) — for an option's `reasonCode`. */
export const REVIEW_DECISION_REASON_SYSTEM = "https://codesystem.x12.org/external/886";

export const DISPOSITION_CATEGORIES: readonly DispositionCategory[] = [
  {
    name: "certify",
    reviewActionCode: "A1",
    finality: "final",
    meaning: "Certified in total (PAS reviewActionCode A1) — the requested service is authorized. A FINAL outcome.",
  },
  {
    name: "not-certify",
    reviewActionCode: "A3",
    finality: "final",
    meaning: "Not certified (PAS reviewActionCode A3) — the requested service is not authorized. A FINAL outcome.",
  },
  {
    name: "pended",
    reviewActionCode: "A4",
    finality: "non-final",
    meaning:
      "Pended (PAS reviewActionCode A4) — an async/workflow state; the review is NOT final. Disallowed as a " +
      "standalone determination leaf; legitimate only where non-final leaves are allowed (embedded mode, or explicitly configured).",
  },
];

/** Fast category lookup by the authored name. */
export const CATEGORY_BY_NAME: ReadonlyMap<string, DispositionCategory> = new Map(
  DISPOSITION_CATEGORIES.map((c) => [c.name, c]),
);

/**
 * The DEFAULT vocabulary, applied only when a deployment declares no `options` (a deployment that declares options
 * fully owns its vocabulary — no merge). Defaults are the two final outcomes with the conventional labels; no pend.
 */
export const DEFAULT_OPTIONS: Record<string, Record<string, DispositionOption>> = {
  certify: { approve: { label: "Approve", narrative: "Prior authorization request approved." } },
  "not-certify": { deny: { label: "Deny", narrative: "Prior authorization request denied." } },
};

/** The current config schema version (the `crl.dispositions.version` discriminator). */
export const DISPOSITION_CONFIG_VERSION = 1;

/** The default mode when a deployment declares none. */
export const DEFAULT_MODE = "standalone" as const;
