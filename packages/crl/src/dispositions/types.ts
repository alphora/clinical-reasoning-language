/**
 * PA disposition configuration — types.
 *
 * A determination LEAF in a PA decision is a `(category, key)` pair (Model B, feature: configurable PA leaves):
 *  - the CATEGORY is spec-anchored (an X12 278 HCR01 outcome, framework-owned, customer-agnostic) and carries the
 *    X12 code + a finality class;
 *  - the option KEY is a distinguishable REASON/FLAVOR within a category (e.g. `not-certify."experimental"`), and a
 *    deployment binds it to a human LABEL (+ an optional code) in its config.
 *
 * A determination is exactly ONE `(category, key)` leaf; mutual-exclusivity/single-outcome is over that leaf, in
 * BOTH modes. `mode` gates ONLY finality: `standalone` leaves must be final; `embedded` leaves may be non-final
 * (the sub-tree still issues exactly one contribution per run — the parent adjudication combines nothing extra).
 */

/** Whether our decision tree IS the adjudication (standalone) or feeds a larger one (embedded). Gates finality only. */
export type DispositionMode = "standalone" | "embedded";

/** A category's finality class. `pended` is non-final; certify/not-certify are final. */
export type Finality = "final" | "non-final";

/**
 * A framework CATEGORY — spec-anchored, customer-agnostic, 1:1 with a Da Vinci PAS `reviewActionCode` (the
 * certification action). Framework-owned (the deployment never re-declares these); surfaced as prior-auth-edge kit
 * content, never authored in config. The action code is bound by PAS to the X12 278 HCR01 value set (see
 * `REVIEW_ACTION_VALUESET`); a determination's PAS ClaimResponse `reviewAction` carries this action code plus,
 * optionally, the option's review-decision-REASON code.
 */
export interface DispositionCategory {
  /** The category name authored in CRL (`recommend <name>."<key>"`), e.g. "certify" / "not-certify" / "pended". */
  name: string;
  /** The Da Vinci PAS review-action code (X12 278 HCR01), e.g. "A1" / "A3" / "A4". Bound to `REVIEW_ACTION_VALUESET`. */
  reviewActionCode: string;
  /** The review-action code's display, e.g. "Certified in total" (A1). Emitted in the reviewActionCode Coding. */
  reviewActionDisplay: string;
  finality: Finality;
  meaning: string;
}

/** A config-specified coding for an option (`{ system, code }`, FHIR Coding-shaped; the label is the display). */
export interface DispositionCode {
  system: string;
  code: string;
}

/** One configured option (a deployment's binding for a `(category, key)` leaf). */
export interface DispositionOption {
  /** The human label (Mode-1 relabels this without touching CRL). Required, non-empty. */
  label: string;
  /**
   * The option's config-specified CODE, `{ system, code }` — its source depends on the deployment's intent:
   *  - full-PAS / Approve-Deny (Smile is the whole PA): a Da Vinci PAS review-decision-REASON code
   *    (system `REVIEW_DECISION_REASON_SYSTEM`), the "why" alongside the category's PAS review-action code;
   *  - embedded / Met-Unmet (Smile is part of a larger system): the larger system's own code (a custom system),
   *    which that system defines — NOT a PAS reason code.
   * Optional at the schema level; whether one is REQUIRED (e.g. full-PAS options must carry a PAS reason code) is a
   * mode-aware kit/validator rule, not a config-structure rule.
   */
  code?: DispositionCode;
}

/** The RAW deployment config shape (`crl.dispositions` in package.json). All fields optional → defaults apply. */
export interface RawDispositionConfig {
  /** Schema discriminator (reversibility). Absent → treated as the current version. */
  version?: number;
  mode?: string;
  /** category-name → { optionKey → { label, code? } }. Present → fully defines the vocabulary (no merge with defaults). */
  options?: Record<string, Record<string, DispositionOption>>;
}

/** One fully-resolved determination leaf: the config binding joined with its framework category metadata. */
export interface ResolvedOption {
  category: string;
  key: string;
  label: string;
  /** The option's config-specified code, if any (a PAS reason code in full-PAS, or the larger system's code). */
  code?: DispositionCode;
  /** From the category (framework), never authored: the PAS review-action code + its display + finality. */
  reviewActionCode: string;
  reviewActionDisplay: string;
  finality: Finality;
}

/**
 * The resolved config — defaults merged, validated. Consumed by the validator, CRE, the kit surfacing, and emit.
 * `options` and `byLeaf` alias the SAME `ResolvedOption` instances — treat as READ-ONLY (do not mutate a leaf).
 */
export interface ResolvedDispositionConfig {
  version: number;
  mode: DispositionMode;
  /**
   * Whether the deployment EXPLICITLY declared `crl.dispositions.options` (vs the built-in defaults). This is the
   * CLOSED-SET trigger: when `true`, the config set is the only valid set of recommendation activities (the
   * validator enforces it); when `false` (defaults), nothing is enforced — today's behavior.
   */
  configured: boolean;
  /** The flattened resolved leaves, in a stable order: framework category order, then ECMAScript key-enumeration order. */
  options: ResolvedOption[];
  /** Lookup by the `"category/key"` leaf id (e.g. "not-certify/experimental"). */
  byLeaf: Record<string, ResolvedOption>;
}

/** A structural config problem. `severity` lets the validator render diagnostics and emit choose hard-fail vs warn. */
export interface DispositionConfigError {
  kind:
    | "malformed-config"
    | "malformed-version"
    | "unknown-version"
    | "unknown-mode"
    | "unknown-category"
    | "malformed-options"
    | "empty-key"
    | "malformed-key"
    | "empty-label"
    | "malformed-code"
    | "empty-vocabulary"
    | "unreadable-package-json";
  /**
   * `error` = the config is not safe to use as-is; a consumer MUST surface/block, not silently use the returned
   * (best-effort) config. `warning` = usable but suspect (an unknown future version, an empty declared vocabulary).
   */
  severity: "error" | "warning";
  /** The config key path relative to `crl.dispositions` (e.g. `["options","certify","approve","code"]`); `[]` = the block itself. */
  path: string[];
  message: string;
}

/** The resolver result — never throws; a caller inspects `errors` and decides how to surface them. */
export interface DispositionResolution {
  config: ResolvedDispositionConfig;
  errors: DispositionConfigError[];
}
