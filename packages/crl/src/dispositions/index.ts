/**
 * PA disposition configuration (feature: configurable PA determination leaves).
 *
 * A determination leaf is a `(category, key)` pair: the spec-anchored Da Vinci PAS review-action CATEGORY
 * (certify/not-certify/pended) + a deployment-configured option KEY (a reason/flavor bound to a label). This module
 * owns the framework category table (customer-agnostic, PAS-grounded) and the shared config resolver consumed by
 * the validator, CRE, the kit surfacing, and emit.
 */
export * from "./types";
export {
  DISPOSITION_CATEGORIES,
  CATEGORY_BY_NAME,
  DEFAULT_OPTIONS,
  DEFAULT_MODE,
  DISPOSITION_CONFIG_VERSION,
  REVIEW_ACTION_VALUESET,
  REVIEW_DECISION_REASON_SYSTEM,
} from "./categories";
export {
  normalizeDispositionConfig,
  resolveDispositionConfig,
  resolveDeterminationLeaf,
  leafId,
} from "./config";
export { displayDetermination, determinationCategory, parseDeterminationName } from "./displayName";
export type { DeterminationName } from "./displayName";
