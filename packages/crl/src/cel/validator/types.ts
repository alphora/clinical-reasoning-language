import type { Location } from "../ast/types";

export type CELValidationErrorKind =
  // Bare and qualified defined-by
  | "unresolved-bare-type"
  | "unresolved-qualified-library"
  | "unresolved-qualified-declaration"
  // #224 ii — a `defined by "Lib"."X"` where X names a `criterion` in Lib. A
  // criterion is a decision-guard sub-expression with no case-feature identity, so
  // it is never a valid `defined by` target — a targeted error instead of the
  // misleading "no Concept or Activity named X".
  | "criterion-not-a-defined-by-target"
  | "unsupported-yet"
  // Result is
  | "unresolved-result-leaf"
  | "invalid-result-shape"
  | "invalid-result-leaf-kind"
  | "unresolved-result-branch"
  | "result-leaf-not-boolean-valued"
  // Fact / case / cross-resource
  | "unresolved-fact-ref"
  | "duplicate-fact-name"
  | "duplicate-case-name"
  // #189 Piece 2 (disc 508) — a fact naming a LOCAL concept authors a WELL-FORMED `code is` that is NOT the
  // concept's own local `{system, code}` (a wrong-code / wrong-system / system-less datum). A WARNING, not an
  // error: this is the legitimate wrong-code test datum (a non-member → closed-world absent → the concept is
  // false in both lanes), but it is usually an author mistake, so it is surfaced. (A MALFORMED token is the
  // emitter's `local-authored-code-malformed` error, not this.)
  | "fact-code-not-in-local-set"
  // ⭐ #280 defect 1 — a BARE-TYPE fact whose CODE matches a local concept but whose SYSTEM does not. The
  // qualified spelling is covered by `fact-code-not-in-local-set` above; this is the lane that fell through.
  | "fact-code-wrong-local-system"
  // #189 Piece 3 — a BARE-TYPE source fact (`defined by "<FhirType>"` + `code is <token>`, the sanctioned source
  // authoring) whose `(fhirType, system, code)` is a member of NO concept's SOURCE set (the mechanical stub set of
  // a `coded from` reference/instantiated VS). It populates nothing (closed-world → the concept it would feed is
  // false in BOTH lanes). A WARNING, not an error: a deliberate non-covered datum is legitimate (that IS the
  // not-covered test), but a typo'd stub code is the common mistake, so it is surfaced. Reference-VS membership is
  // the STUB code (`<canonicalBase>/CodeSystem/reference-vs-stub | <VS-url-tail>`), NOT a real terminology code.
  | "fact-code-not-in-source-set"
  // A fact populating a recognized value-reading boolean concept supplies a non-boolean value. Omitted values
  // remain allowed (unknown); no boolean is manufactured. Wrong-code facts are handled by membership diagnostics.
  | "value-reading-assertion-needs-boolean"
  // A locally coded boolean fact supplies a value outside this validator's recognized value-reading forms. WARNING:
  // The current classifier is broader than presence-only forms: unrecognized answer/merge forms can also reach it.
  // The message must therefore be conditional: preserve an explicit false answer; for existence-only computations,
  // a false value does not negate record existence. Do not recommend discarding an answer. There is no absence code.
  | "value-ignored-on-presence-concept"
  // ⭐ The NUMERIC cell of the value-type x literal-shape table (disc 529). A unitless number is a
  // DIMENSIONLESS quantity, not an undecided one — FHIRHelpers reads a missing unit as `'1'`, so it is
  // null against every real unit. Shipped in seven goldens before these existed.
  | "quantity-value-missing-unit"
  | "quantity-value-empty-unit"
  | "dimensionless-value-with-unit"
  | "value-type-mismatch"
  // #189 Piece 2 (disc 508 / impl-review gpt56 #4) — a fact naming a LOCAL concept authors a MALFORMED canonical
  // `code is` token (empty code, or a pipe with an empty system/code). The emitter skips it (invalid FHIR); the
  // validator flags it lane-neutrally as an ERROR (a KE author validating without emitting still sees it).
  | "fact-code-malformed-token"
  // #189 Piece 2 (disc 508 D5(3)) — a case references a LOCAL determination fact (its concept has `code is`) with
  // an `absent`/`negative` intent modifier. Membership sees only the CODE, so a ruled-out/negated fact would still
  // be a member → the concept computes PRESENT (the opposite of the author's intent), consistently wrong in BOTH
  // lanes. Correct negation semantics are #257 (status/refutation); until then this is rejected loud. (Intent on an
  // ACTIVITY/recommendation fact — a declined proposal — is legitimate and untouched.)
  | "intent-modifier-on-local-fact"
  // #189 (a) (disc 510) — a fact is `defined by` a RESOURCELESS DERIVED concept (no `code is` and no source binding:
  // a pure `defined as` composition, a code-less reduction, or null-forever). Such a concept is read-only — it has
  // no FHIR resource, so `$apply` has no way to receive "it is true"; a CRE direct-assert would have no `$apply`
  // equivalent (the `asserted ∪ composed` magic #189 removes). Declaration-level ERROR: assert the concept's
  // operands instead, or give it a `code is` + `type is` to make it a real record assertable in both lanes.
  | "cannot-directly-assert-derived-concept"
  // Case id (provenance spec §7)
  | "malformed-case-id"
  | "reserved-case-id"
  | "duplicate-case-id"
  | "multiple-case-ids"
  // CEL include
  | "unresolved-cel-include"
  | "alias-not-yet-supported"
  // Passthrough kinds (from resolver / parser)
  | "parse-failure"
  | "project-root-not-found"
  | "unresolved-covers"
  | "covers-missing-but-cases-present"
  | "crl-import";

export interface CELValidationError {
  kind: CELValidationErrorKind;
  message: string;
  severity: "error" | "warning";
  location?: Location;
  filePath?: string;
}

export interface CELValidationResult {
  errors: CELValidationError[];
  warnings: CELValidationError[];
}

export interface CELValidationOptions {
  /**
   * Soft mode silences `unsupported-yet` and `alias-not-yet-supported`
   * warnings. Bare/qualified ref-resolution, duplicate-name, and
   * invalid-result-* checks stay as errors regardless. NOT a 1:1 with
   * CRL's soft mode (which demotes ref-resolution to warnings) — CEL's
   * bare-type and qualified-ref resolution are foundational correctness
   * gates that shouldn't be papered over.
   */
  soft?: boolean;
}
