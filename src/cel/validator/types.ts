import type { Location } from "../ast/types";

export type CELValidationErrorKind =
  // Bare and qualified defined-by
  | "unresolved-bare-type"
  | "unresolved-qualified-library"
  | "unresolved-qualified-declaration"
  | "unsupported-yet"
  // Result is
  | "unresolved-result-leaf"
  | "invalid-result-shape"
  | "invalid-result-leaf-kind"
  // Fact / case / cross-resource
  | "unresolved-fact-ref"
  | "duplicate-fact-name"
  | "duplicate-case-name"
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
