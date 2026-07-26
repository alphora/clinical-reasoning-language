import { CRL } from "../ast/types";
import type { LibraryDeclaration } from "../ast/types";
import type { ResolvedDispositionConfig } from "../dispositions/types";
import type { SourceContext } from "../imports/scopes";

import { CycleDetector } from "./cycleDetector";
import { DecisionShapeValidator } from "./decisionShapeValidator";
import { DispositionValidator } from "./dispositionValidator";
import { MetaTagValidator } from "./metaTagValidator";
import { NameUniquenessValidator } from "./nameUniquenessValidator";
import { ReferenceResolver } from "./referenceResolver";

/**
 * Stable, machine-readable discriminator for validation errors. Lets
 * consumers (CLI, extension, MCP) filter or specialize on the kind without
 * grepping message text.
 *
 * Kinds:
 *   - "empty-name"                      — declaration name is blank
 *   - "duplicate-name"                  — two declarations of the same kind
 *                                         share a name within the same library
 *   - "unresolved-reference"            — bare ref target doesn't exist
 *                                         in the local namespace
 *   - "reference-cycle"                 — concept refs form a cycle
 *   - "external-library-not-included"   — qualified ref `"Pkg"."X"` to a
 *                                         package library that the current
 *                                         file did not `include`, or to an
 *                                         unknown library
 *   - "qualified-ref-unresolved"        — qualified ref `"Lib"."X"` where
 *                                         Lib is in scope but X isn't
 *                                         declared there for the requested
 *                                         kind
 */
export type ValidationErrorKind =
  | "empty-name"
  | "duplicate-name"
  | "unresolved-reference"
  | "reference-cycle"
  | "decision-delegation-cycle"
  // #224 ii — a `criterion` whose body transitively references itself
  // (`A → B → A`, or a self-ref). Structural defect (like the other cycles);
  // never soft-demoted.
  | "criterion-cycle"
  // #224 ii — a `criterion` name used in a CONCEPT-only reference slot
  // (`defined as`, `sem-*` composition, `definition is` narrative, an action
  // guard `unless`/`only when`), or a library-qualified criterion ref. Criteria
  // may only appear in a decision `when` guard (or another criterion's body) in v0.
  | "criterion-misuse"
  // #224 iii.2 — a decision-guard negation (`not`) in a `when` guard or a criterion body.
  // The LANGUAGE (grammar/AST/DNF) lands in iii.2 but the emit/eval/display SEAMS land in
  // iii.3; until then `not` is gated here so no half-wired document ships. STRUCTURAL merge
  // gate — never soft-demoted. Removed in iii.3 when the seams go live.
  | "decision-negation-unsupported"
  | "external-library-not-included"
  | "qualified-ref-unresolved"
  | "decision-shape"
  | "reserved-library-name"
  // Configurable PA determinations (feature: configurable PA leaves). Only enforced when the project EXPLICITLY
  // configures `crl.dispositions.options` (the closed-set trigger); absent config = today's behavior.
  | "disposition-not-configured"
  | "disposition-request-type"
  | "disposition-non-final-leaf"
  // #154/#203 — registry-backed metadata (@tag) enforcement.
  | "meta-malformed-tag"
  | "meta-unknown-tag"
  | "meta-missing-field"
  | "meta-invalid-field"
  | "meta-duplicate-field"
  | "meta-cardinality"
  | "open-flag";

/**
 * #187 — the SHARED catalog library names the emitter ALWAYS materializes into
 * every policy package (`CRLCommon.cql` + `CaseFeatureCommon.cql` + `FHIRHelpers.cql`
 * plus the CRLCommon/CaseFeatureCommon FHIR Libraries). An author `library "…"`
 * declared with any of these would collide with the emitted catalog copy — the
 * CQL-lane filename-skip catches the `.cql` clash, but a root library's FHIR
 * Library url is policy-id-based (not name-based), so the FHIR-lane url-skip can
 * miss it. Make the collision impossible at authoring time (hard error) rather
 * than relying on downstream skip heuristics.
 */
export const RESERVED_CATALOG_LIBRARY_NAMES: ReadonlySet<string> = new Set([
  "CRLCommon",
  "CaseFeatureCommon",
  "FHIRHelpers",
]);

/**
 * The specific decision-shape rule a `decision-shape` error violates. Lets
 * consumers specialize without parsing message text. See docs/decision-shapes.md.
 */
export type DecisionShapeRule =
  | "qualifier-required"
  | "qualifier-on-single-member"
  | "any-over-branches"
  | "first-over-actions"
  | "otherwise-misplaced"
  | "otherwise-required"
  | "otherwise-only"
  | "guard-on-single-action";

interface ValidationErrorBase {
  message: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  severity: "error" | "warning";
  // Source attribution — populated by source-aware validators (multi-file
  // path). Absent in single-file `validateCRL` mode where the ast doesn't
  // carry file/library identity.
  libraryName?: string;
  filePath?: string;
}

export interface EmptyNameError extends ValidationErrorBase {
  kind: "empty-name";
}
export interface DuplicateNameError extends ValidationErrorBase {
  kind: "duplicate-name";
}
export interface UnresolvedReferenceError extends ValidationErrorBase {
  kind: "unresolved-reference";
}
export interface ReferenceCycleError extends ValidationErrorBase {
  kind: "reference-cycle";
}
// T02 / #96. Validator-side decision-delegation cycle. The FHIR-emitter side
// emits a separate `circular-decision-reference` kind (see fhir-emitter/types.ts)
// from its own SCC classification — distinct kind, distinct message shape,
// distinct call path; callers filtering by kind may need to handle both.
export interface DecisionDelegationCycleError extends ValidationErrorBase {
  kind: "decision-delegation-cycle";
}
// #224 ii — a cycle in the criterion-reference graph (`criterion "A"` whose body
// references `criterion "B"` whose body references `"A"`, or a self-reference).
// Detected over the COMPLETE criterion graph (including unused criteria) so a
// non-terminating expansion is caught at the source, not at expansion time.
export interface CriterionCycleError extends ValidationErrorBase {
  kind: "criterion-cycle";
}
// #224 ii — a criterion name used somewhere criteria are not allowed: a concept-only
// reference slot, or a library-qualified criterion ref. `slot` names the offending
// slot for consumers; the message spells out the v0 rule (criteria are `when`-guard-only).
export interface CriterionMisuseError extends ValidationErrorBase {
  kind: "criterion-misuse";
  slot: CriterionSlot;
}

// Where a criterion name was wrongly used. `qualified` = a FOREIGN library-qualified
// criterion ref — criterion refs cannot be library-qualified in v0. (A self-qualified
// ref is bare-equivalent, so it yields a slot-specific misuse or is valid, never
// `qualified`.)
export type CriterionSlot =
  | "defined-as"
  | "composition"
  | "narrative"
  | "action-guard"
  | "qualified";
// #224 iii.2 — a `not` used in a decision guard / criterion body before the emit+eval+display
// seams are wired (iii.3). One error per OUTERMOST negation (a `not not A` is one). Anchored at
// the `not`'s own location. Non-soft-demotable structural merge gate.
export interface DecisionNegationUnsupportedError extends ValidationErrorBase {
  kind: "decision-negation-unsupported";
}
export interface ExternalLibraryNotIncludedError extends ValidationErrorBase {
  kind: "external-library-not-included";
  // The library name in the offending qualified ref `"<targetLibrary>"."X"`.
  targetLibrary: string;
}
export interface QualifiedRefUnresolvedError extends ValidationErrorBase {
  kind: "qualified-ref-unresolved";
  // The library name in the offending qualified ref `"<targetLibrary>"."<targetName>"`.
  targetLibrary: string;
  targetName: string;
}
// Decision-shape structural rule violation (first/any/all/otherwise legality).
// Never demoted under `soft` — a malformed decision shape is a structural
// defect, not incomplete-but-fixable authoring state.
export interface DecisionShapeError extends ValidationErrorBase {
  kind: "decision-shape";
  rule: DecisionShapeRule;
}
// #187 — an author library declared with a name reserved for the emitter's
// shared catalog libraries (CRLCommon / CaseFeatureCommon / FHIRHelpers).
export interface ReservedLibraryNameError extends ValidationErrorBase {
  kind: "reserved-library-name";
  // The reserved name the author used.
  reservedName: string;
}
// A recommended activity that is NOT in the configured disposition set (the closed set — see the kind comment).
export interface DispositionNotConfiguredError extends ValidationErrorBase {
  kind: "disposition-not-configured";
  activityName: string;
}
// A configured determination activity whose `request` type is not `CPGCommunicationRequest` (a determination is
// COMMUNICATED, not ordered — meaning enforced by validation, not grammar).
export interface DispositionRequestTypeError extends ValidationErrorBase {
  kind: "disposition-request-type";
  activityName: string;
  actualRequestType: string;
}
// A non-final determination (e.g. `pended`) recommended under `standalone` mode, where our tree IS the whole
// adjudication and every leaf must be FINAL. Legitimate only in `embedded` mode (our tree feeds a larger one).
export interface DispositionNonFinalLeafError extends ValidationErrorBase {
  kind: "disposition-non-final-leaf";
  activityName: string;
}

// #154/#203 — a metadata (@tag) diagnostic. One interface for all meta kinds (the kind + payload live in `kind`
// + `message`); carries its intrinsic `severity` (open-flag/unknown/malformed = warning; field/cardinality = error).
export interface MetaDiagnostic extends ValidationErrorBase {
  kind:
    | "meta-malformed-tag"
    | "meta-unknown-tag"
    | "meta-missing-field"
    | "meta-invalid-field"
    | "meta-duplicate-field"
    | "meta-cardinality"
    | "open-flag";
}

export type ValidationError =
  | EmptyNameError
  | DuplicateNameError
  | UnresolvedReferenceError
  | ReferenceCycleError
  | DecisionDelegationCycleError
  | CriterionCycleError
  | CriterionMisuseError
  | DecisionNegationUnsupportedError
  | ExternalLibraryNotIncludedError
  | QualifiedRefUnresolvedError
  | DecisionShapeError
  | ReservedLibraryNameError
  | DispositionNotConfiguredError
  | DispositionRequestTypeError
  | DispositionNonFinalLeafError
  | MetaDiagnostic;

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validator options.
 *
 * `soft`: when true, RELAXED checks demote certain "would-be-error" findings
 * to warnings so authoring can continue with incomplete state. The kinds
 * that demote are listed in `SOFT_DEMOTABLE_KINDS` below; structural
 * diagnostics like `external-library-not-included` and cycles never demote.
 */
export interface ValidatorOptions {
  soft?: boolean;
  /**
   * The resolved PA disposition config (feature: configurable PA leaves). Threaded in by the project-aware caller
   * (`validateCRLImports`) — the Validator is filesystem-free, so the caller resolves it. Absent in single-file /
   * inline mode → the disposition rules don't run. Even when present, the closed-set enforcement fires only if the
   * deployment EXPLICITLY configured `options` (`config.configured`).
   */
  dispositionConfig?: ResolvedDispositionConfig;
}

/**
 * The set of validation kinds that downgrade to warnings under `soft` mode.
 * These represent incomplete-but-fixable authoring state, not structural
 * defects in the source.
 */
const SOFT_DEMOTABLE_KINDS: ReadonlySet<ValidationErrorKind> = new Set([
  "unresolved-reference",
  "qualified-ref-unresolved",
  // Mid-authoring, recommending a determination before wiring it into the config is incomplete-but-fixable state
  // (parallels unresolved-reference) — demote under soft. `disposition-request-type` is a STRUCTURAL defect
  // (a determination modeled as an order) and stays a hard error (like decision-shape), so it is NOT listed.
  "disposition-not-configured",
  // #154: a missing required @tag field is incomplete-but-fixable authoring state (parallels unresolved-reference)
  // → demote under soft. An INVALID enum value (`meta-invalid-field`) is misuse, not incompleteness → stays a hard error.
  "meta-missing-field",
]);

function demote(e: ValidationError): ValidationError {
  return { ...e, severity: "warning" } as ValidationError;
}

export class Validator {
  private readonly nameUniquenessValidator: NameUniquenessValidator;
  private readonly referenceResolver: ReferenceResolver;
  private readonly cycleDetector: CycleDetector;
  private readonly decisionShapeValidator: DecisionShapeValidator;
  private readonly dispositionValidator: DispositionValidator;
  private readonly metaTagValidator: MetaTagValidator;

  constructor() {
    this.nameUniquenessValidator = new NameUniquenessValidator();
    this.referenceResolver = new ReferenceResolver();
    this.cycleDetector = new CycleDetector();
    this.decisionShapeValidator = new DecisionShapeValidator();
    this.dispositionValidator = new DispositionValidator();
    this.metaTagValidator = new MetaTagValidator();
  }

  /**
   * Validate a CRL AST.
   *
   * Single-file mode (`sources` absent): validators treat `ast` as the only
   * library; `Concept`/`Decision`/`Activity`/`Terminology` names form a flat
   * local namespace; bare refs resolve against that namespace; qualified refs
   * to non-self libraries emit `external-library-not-included`.
   *
   * Multi-file mode (`sources` present): validators use per-statement scope
   * context to enforce per-library uniqueness, per-library bare-ref
   * resolution, and qualified-ref resolution against the target library's
   * scope.
   */
  public validate(
    ast: CRL,
    options: ValidatorOptions = {},
    sources?: SourceContext[],
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const pushSplit = (results: ValidationError[]): void => {
      for (const e of results) {
        // #154: route by INTRINSIC severity FIRST — sub-validators may now emit real warnings (open-flag,
        // unknown/malformed tag) that must NOT become errors / flip isValid. Only ERROR-severity findings are
        // eligible for soft demotion.
        if (e.severity === "warning") {
          warnings.push(e);
        } else if (options.soft && SOFT_DEMOTABLE_KINDS.has(e.kind)) {
          warnings.push(demote(e));
        } else {
          errors.push(e);
        }
      }
    };

    // Duplicate names — always an error (never demoted)
    const nameResult = this.nameUniquenessValidator.validate(ast, sources);
    errors.push(...nameResult);

    // Reference resolution — per-kind demotion via SOFT_DEMOTABLE_KINDS
    const refResult = this.referenceResolver.validate(ast, sources);
    pushSplit(refResult);

    // Cycles — always an error (structural defect)
    const cycleResult = this.cycleDetector.validate(ast, sources);
    errors.push(...cycleResult);

    // Decision-shape structural rules — always an error (never demoted)
    const shapeResult = this.decisionShapeValidator.validate(ast, sources);
    errors.push(...shapeResult);

    // #187 — reserved catalog library names — always an error (never demoted).
    errors.push(...this.validateReservedLibraryNames(ast, sources));

    // #154/#203 — registry-backed @tag metadata enforcement (vocabulary / field / cardinality / open-flag).
    // Routed through pushSplit so open-flag/unknown/malformed WARN (not fail) and meta-missing-field soft-demotes.
    pushSplit(this.metaTagValidator.validate(ast, sources));

    // Configurable PA determinations — only when the project supplied a config; the closed-set enforcement is
    // further gated on `config.configured` inside the validator. Always an error (a structural config violation).
    if (options.dispositionConfig) {
      errors.push(...this.dispositionValidator.validate(ast, options.dispositionConfig, sources));
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * #187 — reject an author `library "<name>"` declared with a name reserved for
   * the emitter's shared catalog libraries. In multi-file mode each distinct
   * source library is checked (deduped by name+file so one library isn't flagged
   * once per statement); in single-file mode the lone `ast.library` is checked.
   */
  private validateReservedLibraryNames(
    ast: CRL,
    sources?: SourceContext[],
  ): ReservedLibraryNameError[] {
    const out: ReservedLibraryNameError[] = [];
    const make = (
      name: string,
      location: LibraryDeclaration["location"],
      attrib?: { libraryName: string; filePath: string },
    ): ReservedLibraryNameError => ({
      kind: "reserved-library-name",
      reservedName: name,
      message:
        `Library name "${name}" is reserved for the CRL emitter's shared catalog ` +
        `library (CRLCommon / CaseFeatureCommon / FHIRHelpers), which every emitted ` +
        `policy always ships. Rename this library so it cannot collide with the ` +
        `emitted catalog copy.`,
      location: {
        start: { line: location.start.line, column: location.start.column },
        end: { line: location.end.line, column: location.end.column },
      },
      severity: "error",
      ...(attrib ? { libraryName: attrib.libraryName, filePath: attrib.filePath } : {}),
    });

    if (sources && sources.length > 0) {
      const seen = new Set<string>();
      for (const src of sources) {
        const lib = src.entry.ast.library;
        const name = lib?.name;
        if (!name || !RESERVED_CATALOG_LIBRARY_NAMES.has(name)) continue;
        const dedupeKey = `${src.entry.filePath} ${name}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push(
          make(name, lib.location, { libraryName: name, filePath: src.entry.filePath }),
        );
      }
      return out;
    }

    const name = ast.library?.name;
    if (name && RESERVED_CATALOG_LIBRARY_NAMES.has(name)) {
      out.push(make(name, ast.library.location));
    }
    return out;
  }
}
