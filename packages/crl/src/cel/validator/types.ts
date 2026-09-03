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
  // #189 Piece 3 (Option C, disc 512/513) — a fact directly asserts (by qualified `defined by`) a VALUE-READING
  // boolean determination (a member-existence interface, whose emitted CQL own-arm reads `.value as FHIR.boolean`)
  // that POPULATES it (a bare degenerate-member fact, or a fact whose code is the concept's own member) but does NOT
  // carry an explicit boolean `value is`. Its determination IS its value, so it must be stated: `value is true` /
  // `value is false`. A non-boolean `value is` (a number/string, which the legacy writer lands in
  // valueQuantity/valueString and the CQL `where O.value is FHIR.boolean` filter excludes) is the same error. This is
  // an AUTHOR-TIME gate (ERROR, not a manufactured default — manufacturing `true` is the magic §4 bans), mirrored by
  // an emitter diagnostic. It is NOT a runtime divergence: at run time a valueless value-reading record reads false in
  // BOTH `$apply` and the CRE (closed-world → the same Deny verdict). A wrong-code fact (non-member) does NOT reach
  // this rule (owned by `fact-code-not-in-local-set`); a PRESENCE-based (value-blind) `exists this` boolean is exempt.
  | "value-reading-assertion-needs-boolean"
  // #189 Piece 3 (Option C, disc 512) — a fact authors a `value is` on a PRESENCE-based (value-blind) boolean concept
  // (`code is` + `value type is boolean` but NOT value-reading: `definition is exists this`, a non-recency `defined as
  // exists`, a boolean composition). Both lanes compute such a concept by EXISTENCE (`exists([R: code])` / presence),
  // so the authored value is IGNORED — a `value is false` there computes the concept TRUE (the opposite of the author's
  // apparent intent), the authoring trap Option C's "false denies" rule teaches into existence. WARNING (not an error):
  // the fact still populates correctly by presence; explicit absence is an absence CODE (a record), not `value is false`.
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
