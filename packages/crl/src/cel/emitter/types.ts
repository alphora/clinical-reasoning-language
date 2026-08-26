import type { Location } from "../ast/types";

/** REFACTOR:grounded (#189 remote-data channel, disc 492). The three emit CHANNELS — which REPRESENTATION of
 *  each concept a case emits (data-driven, NOT case-clones; charter §2/§4):
 *   - "local"   : each concept's LOCAL `code is` representation (the canonical/production lane).
 *   - "remote"  : each concept's POSREP / source representation (the optional/additive supplied lane).
 *   - "mixture" : a deterministic BLEND — local-only→local, posrep-only→posrep, both-rep concepts split 50/50
 *                 so both representations get exercised (measure content is posrep-heavy; preferring either
 *                 starves the other). See the channel model in `tmp/PLAN-t1-channel-layout.md`.
 *  A channel emits NOTHING (no folder) when it has no genuine dataset for a case. The channel becomes a PREFIX
 *  on every emitted FHIR id (`<channel>-<base56>`), so the KALM Patient-compartment directory carries it. */
export type Channel = "local" | "remote" | "mixture";

/** The canonical channel order (also the emit order for a no-arg / all-three run). */
export const ALL_CHANNELS: readonly Channel[] = ["local", "remote", "mixture"];

/** A single emitted FHIR resource as a JSON-shaped object. */
export interface EmittedResource {
  resourceType: string;
  id: string;
  /** Directory the writer should place this under, relative to out-dir. */
  outputPath: string;
  /** Full FHIR resource body as a JSON-shaped JS object. */
  body: Record<string, unknown>;
}

/** Per-case-per-channel grouping of emitted resources. */
export interface EmittedCase {
  /** Slugified case name. */
  caseSlug: string;
  /** Slugified library name. */
  librarySlug: string;
  /** #189 — which channel produced this compartment (`local`/`remote`/`mixture`). */
  channel: Channel;
  /** Resources emitted for this case+channel, all inside the one Patient compartment. */
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
  /** #189 B4 (disc 501) — a LOCAL concept declares a CodeableConcept value type but its authored `value is` datum
   *  is unusable: not a `<system>|<code>` token (a bare/empty/multi-pipe token, or a non-string payload), or the
   *  concept's representation reads no value element. The fact is SKIPPED (never a manufactured/partial value —
   *  disc 501 gpt56 #2); full case-atomic discard is F/T3c. */
  | "local-coded-value-invalid"
  /** #189 remote-channel (disc 492) — a case has no resolved subject Patient, so there is no compartment id to
   *  place its resources under. Per source-atomic gating the WHOLE case is skipped for every channel. */
  | "missing-subject"
  /** #189 remote-channel (disc 492) — a resource cannot be placed in the Patient compartment (an unhandled
   *  non-patient-scoped resource type). Fail loud rather than invent an unverified `shared/` location. */
  | "non-compartment-resource"
  /** #189 remote-channel (disc 492) — two distinct facts normalized to the same channel-prefixed id / output
   *  path within one emit. The CEL lane has no closure invariant, so this backstop catches it before a silent
   *  filesystem overwrite. */
  | "id-collision"
  /** #189 remote-channel (disc 492) — a `remote`/`mixture` channel was requested but its posrep/blend content
   *  emission is not built yet (T2/T3). The channel is skipped with this diagnostic; `local` is unaffected. */
  | "channel-not-implemented";

export interface EmitResult {
  /** Cases that emitted at least one resource (per-case-per-channel atomic). */
  emittedCases: EmittedCase[];
  /** Diagnostics across all cases. unsupported-yet warnings cause exit-nonzero in the CLI. */
  diagnostics: EmitDiagnostic[];
}

/** Options for `emitCelToFhir`. */
export interface EmitCelOptions {
  /**
   * #189 — which channels to emit. Undefined/empty ⇒ all three (`ALL_CHANNELS`). A non-empty list emits exactly
   * those channels. Validated at this boundary (the one seam CLI + MCP share): an unknown token, a duplicate, or
   * more than three is a hard error (there are only three distinct channels).
   */
  channels?: Channel[];
}

export interface EmitOptions {
  /**
   * Output directory root. Resources are written under
   * <outDir>/patient/<library-slug>/<case-slug>/<FHIR Type>/<resource-id>.json
   * per pitch v4 success signal. Required when calling `emitCelToFhirAndWrite`.
   */
  outDir?: string;
  /**
   * If true, in-memory emit only — no files written. Useful for tests and for
   * the future CEL extension preview. Defaults to false; if `outDir` is set,
   * defaults remain false (writes happen).
   */
  dryRun?: boolean;
}
