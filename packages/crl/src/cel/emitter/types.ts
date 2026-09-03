import type { Location } from "../ast/types";

/** A single emitted FHIR resource as a JSON-shaped object. */
export interface EmittedResource {
  resourceType: string;
  id: string;
  /** Directory the writer should place this under, relative to out-dir. */
  outputPath: string;
  /** Full FHIR resource body as a JSON-shaped JS object. */
  body: Record<string, unknown>;
}

/** Per-case grouping of emitted resources (all inside the one Patient compartment). */
export interface EmittedCase {
  /**
   * ⭐ THE CASE'S DIRECTORY, relative to the emit `outDir` — `patient/<compartmentId>`. This is the
   * ONLY thing that addresses a case on disk; a producer writes into it and a viewer reads from it.
   *
   * ⚠ It is NOT `<librarySlug>/<caseSlug>`. Those two fields below are the case's IDENTITY, not its
   * location, and the two stopped agreeing at `0e7641da` when the compartment layout merged them into
   * one hashed segment. Compose a path from them and it will compile, run, and silently match nothing.
   */
  compartmentDir: string;
  /** Slugified case name — IDENTITY, not a path segment (see `compartmentDir`). */
  caseSlug: string;
  /** Slugified library name — IDENTITY, not a path segment (see `compartmentDir`). */
  librarySlug: string;
  /** Resources emitted for this case, all inside the one Patient compartment. */
  resources: EmittedResource[];
}

export interface EmitDiagnostic {
  kind: EmitDiagnosticKind;
  message: string;
  severity: "error" | "warning";
  caseSlug?: string;
  factName?: string;
  location?: Location;
  filePath?: string;
}

export type EmitDiagnosticKind =
  /** A fact's `defined by` couldn't derive a bare FHIR type — case is skipped per pitch v4. */
  | "unsupported-yet"
  /** A `result is` line was parsed but not emitted (deferred to #70/metric). */
  | "result-deferred"
  /** Pre-condition for emit failed (parse error, unresolved covers, etc.) — case skipped. */
  | "precondition-failed"
  /** #189 T3b — a local `code is` fact could not derive its `{system, code}` (no canonicalBase, no covers
   *  closure, empty concept code, or url composition threw). The fact is SKIPPED, never emitted coding-less
   *  (a coding-less instance is silently dropped by `$apply` → wrong PA determination). */
  | "local-coding-derivation-failed"
  /** #189 Piece 2 (disc 508) — a LOCAL-concept fact authors a MALFORMED canonical `code` token (empty code, or a
   *  pipe with an empty system/code: `""`, `"|c"`, `"s|"`). Routing it "as authored" would emit `coding.code:""`
   *  etc. — invalid FHIR `$apply` drops SILENTLY. The fact is SKIPPED. (A WELL-FORMED authored code that is not a
   *  member of the concept's local set is NOT an error — it is the legitimate wrong-code datum; it emits, and the
   *  CEL validator flags it with a `fact-code-not-in-local-set` warning.) */
  | "local-authored-code-malformed"
  /** #189 Piece 2 (disc 508 D5(3)) — a LOCAL determination fact is referenced with an `absent`/`negative` intent
   *  modifier. The modifier inverts clinical meaning but membership sees only the code, so the emitted resource
   *  (retrieved by code) would read PRESENT — the opposite of the intent. Rejected + skipped until negation
   *  semantics land (#257). Intent on an activity/recommendation fact is legitimate and untouched. */
  | "intent-modifier-on-local-fact"
  /** #189 (a) (disc 510) — a fact is `defined by` a RESOURCELESS DERIVED concept (no `code is` and no source
   *  binding: a pure `defined as` composition, a code-less reduction, or null-forever). It has no FHIR resource to
   *  emit, so the fact is SKIPPED with a loud error — never a fabricated resource for an ephemeral concept (a §4
   *  violation). The author must assert the concept's operands, or give it a `code is` + `type is`. Shares its
   *  diagnostic identity with the validator/CRE reject so all three lanes speak with one voice. */
  | "cannot-directly-assert-derived-concept"
  /** #189 Piece 3 (Option C, disc 512/513) — a fact directly asserts a VALUE-READING boolean concept (a
   *  member-existence interface, whose emitted CQL own-arm reads `.value as FHIR.boolean`) with NO explicit boolean
   *  `value is`. Its determination IS its value; a bare/non-boolean assertion emits a valueless record read as false.
   *  AUTHOR-TIME gate (shares the validator's kind name so all three lanes speak with one voice), so a caller that
   *  skips validation (e.g. projectless `emit_cel`) still sees it. The fact is SKIPPED — a valueless value-reading
   *  Observation reads false in `$apply` regardless, so the verdict (Deny) is unchanged and both lanes still agree. */
  | "value-reading-assertion-needs-boolean"
  /** #189 B4 (disc 501) — a LOCAL concept declares a CodeableConcept value type but its authored `value is` datum
   *  is unusable: not a `<system>|<code>` token (a bare/empty/multi-pipe token, or a non-string payload), or the
   *  concept's representation reads no value element. The fact is SKIPPED (never a manufactured/partial value —
   *  disc 501 gpt56 #2); full case-atomic discard is F/T3c. */
  | "local-coded-value-invalid"
  /** #189 — a case has no resolved subject Patient, so there is no compartment id to place its resources under.
   *  Per source-atomic gating the WHOLE case is skipped. */
  | "missing-subject"
  /** #189 — a resource cannot be placed in the Patient compartment (an unhandled non-patient-scoped resource
   *  type). Fail loud rather than invent an unverified `shared/` location. */
  | "non-compartment-resource"
  /** #189 — two distinct facts normalized to the same id / output path within one emit. The CEL lane has no
   *  closure invariant, so this backstop catches it before a silent filesystem overwrite. */
  | "id-collision";

export interface EmitResult {
  /** Cases that emitted at least one resource (source-atomic per case). */
  emittedCases: EmittedCase[];
  /** Diagnostics across all cases. unsupported-yet warnings cause exit-nonzero in the CLI. */
  diagnostics: EmitDiagnostic[];
}

/** Options for `emitCelToFhir`. */
export interface EmitCelOptions {
  // (no options today — reserved for future emit knobs.)
}

export interface EmitOptions {
  /**
   * Output directory root. Resources are written under
   *   <outDir>/patient/<compartmentId>/<lowercase-fhir-type>/<resource-id>.json
   * where `<compartmentId>` is `celCaseCompartmentId(library, case, subject)` — a capped slug of all
   * THREE names plus a 12-hex hash, not a library/case pair. Use `EmittedCase.compartmentDir` or the
   * exported helper; do not recompose it.
   */
  outDir?: string;
  /**
   * If true, in-memory emit only — no files written. Useful for tests and for
   * the future CEL extension preview. Defaults to false; if `outDir` is set,
   * defaults remain false (writes happen).
   */
  dryRun?: boolean;
}
