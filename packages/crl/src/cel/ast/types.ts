import type { Location, QualifiedReference } from "../../ast/types";

export type { Location, QualifiedReference };

/**
 * CEL reference name. Mirrors CRL's `ReferenceName` shape (bare ref is a
 * raw string; qualified ref is a `QualifiedReference` object — same type as
 * CRL's). Cross-imports `QualifiedReference` so consumer code can treat a
 * CEL `defined by` qualified ref and a CRL qualified ref interchangeably.
 */
export type CELReferenceName = string | QualifiedReference;

/**
 * AST-vs-source-phrase mapping (for the closed enums below):
 *
 * - `IntentModifier` values `"absent"` / `"negative"` map from source phrases
 *   `absent intent` / `negative intent` — the builder strips the trailing
 *   `intent` word. The closed enum is enforced at lex time via the closed
 *   `ABSENT_INTENT` / `NEGATIVE_INTENT` phrase tokens.
 *
 * - `CrossResourceRelation` values `"based-on"`, `"part-of"`, etc. map from
 *   source phrases `based on`, `part of`, etc. — the builder lowers each
 *   phrase token to its hyphenated AST value. Closed at lex time via the
 *   six relation phrase tokens.
 *
 * BACKTICK_STRING contents (for `description is`, `because`):
 *
 * - AST `value` strips the surrounding backticks but PRESERVES backslash
 *   escapes verbatim. Source `` `Hello \`world\`` `` → AST value
 *   `Hello \`world\`` (the literal backslashes stay). Consumers that need
 *   rendered markdown call a presentation-layer helper.
 *
 * - Rationale: keeps the AST byte-faithful to source for round-trip /
 *   source-mapping needs; un-escape is a presentation-layer concern.
 */
export type IntentModifier = "absent" | "negative";

export type CrossResourceRelation =
  | "based-on"
  | "part-of"
  | "during-encounter"
  | "requested-by"
  | "performed-by"
  | "not-done-because";

// ============================================================
// Root
// ============================================================

export interface CEL {
  type: "CEL";
  /** Optional leading `# title` line. Omitted when absent (the header is now optional — `library` is the
   *  canonical identifier). Raw text incl. the `#`, mirroring the pre-existing CEL builder behavior. */
  header?: string;
  library: CELLibraryDeclaration;
  covers?: CELCoversDeclaration;
  includes: CELInclude[];
  statements: CELStatement[];
  location: Location;
}

export interface CELLibraryDeclaration {
  type: "CELLibraryDeclaration";
  name: string;
  location: Location;
}

export interface CELCoversDeclaration {
  type: "CELCoversDeclaration";
  name: string;
  location: Location;
}

export interface CELInclude {
  type: "CELInclude";
  name: string;
  alias?: string;
  location: Location;
}

export type CELStatement = CELFact | CELCase;

// ============================================================
// Fact
// ============================================================

export interface CELFact {
  type: "CELFact";
  name: string;
  body: CELFactBody[];
  location: Location;
}

export type CELFactBody =
  | CELNameField
  | CELBirthDateField
  | CELCodeField
  | CELDateField
  | CELValueField
  | CELStageField
  | CELDefinedByField;

export interface CELNameField {
  type: "CELNameField";
  value: string;
  location: Location;
}

export interface CELBirthDateField {
  type: "CELBirthDateField";
  value: string;
  location: Location;
}

export interface CELCodeField {
  type: "CELCodeField";
  /** Raw canonical-token string `<system-url>|<code>` (v1 — kept as a single string). */
  value: string;
  location: Location;
}

export interface CELDateField {
  type: "CELDateField";
  value: string;
  location: Location;
}

/**
 * ⭐⭐ A FACT'S STATED VALUE, as a DISCRIMINATED UNION — so a consumer cannot silently drop part of it.
 *
 * ⚠⚠ THIS SHAPE WAS EARNED, NOT CHOSEN ON PRINCIPLE. It first shipped as `value: number | string | boolean`
 * plus an optional `unit?: string`, and within that same change `readFactBody` — which flattens a fact into
 * a `Record<string, …>` — dropped the unit on the floor. `tsc` stayed green, the validator required units,
 * and the writer emitted dimensionless quantities anyway: it LOOKED fixed. Only the goldens failing to move
 * caught it. Both panel arms predicted exactly that class and asked for this union (disc 529 §5); the
 * optional field was the cheaper shape and it cost more.
 *
 * ⚠ A UNITLESS NUMBER IS `"number"`, NOT `"quantity"` — the AST records what was WRITTEN, and only the
 * validator (which resolves the fact's target and its declared value type) decides what it MEANS. Inferring
 * `quantity` here would be the guess the value-type table exists to prevent, and a unitless FHIR Quantity is
 * DIMENSIONLESS (`FHIRHelpers` reads a missing unit as `'1'`), not an under-specified one.
 */
export type CELValue =
  /** A bare number. Its meaning — integer, decimal, or an ERROR against a Quantity target — is the
   *  validator's call, from the target's declared value type. */
  | { kind: "number"; value: number }
  /** A number WITH a UCUM unit (`value is 90 'kg'`) — self-describing as a quantity. The unit string is
   *  author-owned and checked only for presence; validating it against a lexicon is the membership-proving
   *  trap this project refuses everywhere else. */
  | { kind: "quantity"; value: number; unit: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "string"; value: string };

/** The scalar behind a `CELValue`, for the sites that genuinely only need it (a diagnostic message, a
 *  presence test). ⚠ Use it DELIBERATELY: it discards the unit, which is the drop this union exists to make
 *  impossible by accident. Anything writing a datum must switch on `kind` instead. */
export function celValueScalar(v: CELValue): number | string | boolean {
  return v.value;
}

export interface CELValueField {
  type: "CELValueField";
  // #189 S1 — a boolean value (`value is true` / `value is false`) is first-class: a
  // `value type is boolean` local `code is` concept authors its determination directly, and the
  // emitter lowers it to `Observation.valueBoolean`.
  value: CELValue;
  location: Location;
}

export interface CELStageField {
  type: "CELStageField";
  /** Bare-word stage value (lexed via STAGE_MODE). */
  value: string;
  location: Location;
}

export interface CELDefinedByField {
  type: "CELDefinedByField";
  ref: CELReferenceName;
  location: Location;
}

// ============================================================
// Case
// ============================================================

export interface CELCase {
  type: "CELCase";
  name: string;
  /**
   * Authored case id (provenance spec §7), optional — hoisted from the first `- id is "<id>".` body field; omitted
   * when absent (omit-don't-synthesize, like the optional `header`). The DERIVED fallback for an un-id'd case lives in
   * `effectiveCaseId(...)`, never here. Becoming a STABLE provenance address (grammar-optional / provenance-mandatory)
   * is enforced at the provenance-emit step, not in T4.2.
   */
  caseId?: string;
  body: CELCaseBody[];
  location: Location;
}

export interface CELIdField {
  type: "CELIdField";
  value: string;
  location: Location;
}

export type CELCaseBody =
  | CELIdField
  | CELDescriptionField
  | CELSubjectField
  | CELEncounterField
  | CELAnchorField
  | CELFactRefField
  | CELResultField
  | CELCrossResourceField;

export interface CELDescriptionField {
  type: "CELDescriptionField";
  value: string;
  location: Location;
}

export interface CELSubjectField {
  type: "CELSubjectField";
  factName: string;
  location: Location;
}

export interface CELEncounterField {
  type: "CELEncounterField";
  factName: string;
  location: Location;
}

export interface CELAnchorField {
  type: "CELAnchorField";
  /** Named anchor name; absent for ambient `anchor is <expr>`. */
  name?: string;
  expr: CELAnchorExpr;
  location: Location;
}

export type CELAnchorExpr = CELNowAnchor | CELFixedDateAnchor;

export interface CELNowAnchor {
  type: "CELNowAnchor";
  offset?: CELDurationOffset;
  location: Location;
}

export interface CELFixedDateAnchor {
  type: "CELFixedDateAnchor";
  date: string;
  location: Location;
}

export interface CELFactRefField {
  type: "CELFactRefField";
  factName: string;
  at?: CELAtClause;
  intent?: IntentModifier;
  /** Backtick-string content; backslash-escapes preserved verbatim. */
  because?: string;
  location: Location;
}

export type CELAtClause = CELAtAnchor | CELAtNamedAnchor | CELAtAbsoluteDate;

export interface CELAtAnchor {
  type: "CELAtAnchor";
  offset?: CELDurationOffset;
  location: Location;
}

export interface CELAtNamedAnchor {
  type: "CELAtNamedAnchor";
  anchorName: string;
  offset?: CELDurationOffset;
  location: Location;
}

export interface CELAtAbsoluteDate {
  type: "CELAtAbsoluteDate";
  date: string;
  location: Location;
}

export interface CELDurationOffset {
  type: "CELDurationOffset";
  sign: "+" | "-";
  value: number;
  /** Closed at lex via TIME_UNIT allowlist (years/year/months/month/.../milliseconds/millisecond). */
  unit: string;
  location: Location;
}

export interface CELResultField {
  type: "CELResultField";
  leafName: string;
  value: CELResultValue;
  location: Location;
}

export type CELResultValue = CELBooleanResult | CELBranchResult;

export interface CELBooleanResult {
  type: "CELBooleanResult";
  value: boolean;
  location: Location;
}

export interface CELBranchResult {
  type: "CELBranchResult";
  branchName: string;
  location: Location;
}

export interface CELCrossResourceField {
  type: "CELCrossResourceField";
  sourceName: string;
  relation: CrossResourceRelation;
  targetName: string;
  location: Location;
}
