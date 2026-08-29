// #189 Piece 1 (disc 506 Claude #2) — the SHARED shape classifier for a both-representation RECENCY-VALUE concept:
// a local `code is` + `definition is most recent this` + exactly ONE `coded from` `source representation`, publishing
// a Scalar NON-boolean value (e.g. `Covered Device`: `code is covered-device` + `most recent this` + a ServiceRequest
// `coded from "Covered Devices"`, `value type is CodeableConcept`).
//
// WHY a dedicated resolver (not three inline conditions): the SAME predicate is consulted at THREE sites that must
// agree or the emit and its totality proof drift —
//   1. `lowerLocalCodes` — the (2-pre) reduction gate branches the 3-output split here instead of erroring;
//   2. `classifyBooleanTotality` — runs on the AUTHORED (pre-lowering) concept, where the `__bothRepMerge` marker is
//      invisible, so it must recognize the AUTHORED shape to reclassify the merge `not-applicable{nullable}`;
//   3. `deriveEffectiveRepresentations` (effectiveRepresentation.ts) — already classifies this as `[local-exact,
//      source]`; this resolver's predicate MIRRORS that both-rep branch so the value producer and the shape gate cannot
//      disagree.
// This is the `resolveAgeConcept` precedent (recencyProjectionOverride.ts:204 — "the SAME source the author-time
// validator consults, so validate and emit cannot drift"). PURELY STRUCTURAL: no owning-library metadata, so a pure
// AST consumer (the totality classifier) can call it.
//
// SHAPE-EXACT (disc 506): anything off-shape — >1 posrep, a non-`coded from` posrep, a `value projection` (age) posrep,
// a non-`mostRecent`/named-target reduction, a boolean or multi-value-type declaration — returns `not-recency-value`,
// so the build-debt `unclassified` arm still covers it. This resolver NARROWS; it never widens.

import { assumedShapePreMigration } from "../grammar/conceptShapes";
import type { Concept, Representation } from "../ast/types";
import { getRefLibrary, getRefName } from "../ast/types";
import { resolveAgeConcept } from "./recencyProjectionOverride";

export type RecencyValueResolution =
  | {
      kind: "recency-value";
      /** The single `coded from` source posrep — its `terminologyName` scopes the source membership retrieve. */
      sourceRep: Representation;
    }
  | { kind: "not-recency-value" };

/**
 * Classify whether `concept` is the both-rep recency-value form. Structural + total: every non-matching shape returns
 * `not-recency-value` (never throws), so callers branch on `kind === "recency-value"` and let their existing paths
 * handle everything else.
 */
export function resolveRecencyValueConcept(concept: Concept): RecencyValueResolution {
  const no: RecencyValueResolution = { kind: "not-recency-value" };

  // A local `code is` is required (the local arm of the both-rep pair).
  if (concept.code === undefined) return no;

  // `definition is most recent this` — a `mostRecent` reduction over the concept's OWN records (`ThisRecords`).
  const def = concept.definition;
  if (def === undefined || def.type !== "ReductionDefinition") return no;
  const red = def.reduction;
  if (red.kind !== "mostRecent" || red.target.type !== "ThisRecords") return no;

  // Publishes a Scalar NON-boolean value (a boolean value/interface concept is the `defined as exists` family, not
  // this recency-value merge; a Scalar boolean `most recent this` is the B2a cell).
  if (assumedShapePreMigration(concept.shape) !== "Scalar") return no;
  if (!(concept.valueTypes.length === 1 && concept.valueTypes[0] !== "boolean")) return no;

  // Exactly ONE `source representation`, `coded from` (a coded external value read), NOT a `value projection` (that is
  // the patient-age recency lane, owned by `resolveAgeConcept`).
  const reps = concept.representations ?? [];
  if (reps.length !== 1) return no;
  const rep = reps[0];
  if (rep.valueProjection !== undefined) return no; // age/recency lane
  if (rep.terminologyName === undefined) return no; // must be `coded from`

  // Age is the shared classification authority — never claim recency-value for something age owns (defense in depth;
  // a `value projection` rep is already excluded above, but this keeps the two resolvers from ever disagreeing).
  if (resolveAgeConcept(concept).kind !== "not-age") return no;

  return { kind: "recency-value", sourceRep: rep };
}

/**
 * #189 Piece 1 (disc 507 A/B) — is `concept` the value/interface MEMBER-EXISTENCE fold: a `code is X` +
 * `defined as exists ("V")` boolean interface whose referent V is a same-library RECENCY-VALUE concept? SHARED +
 * PURELY STRUCTURAL (no owning-library metadata / no descriptor derivation), so ALL activation sites decide
 * identically and cannot drift — the lowering union gate, `classifyBooleanTotality` (the authored obligation), and
 * the emit dispatch. `isRecencyValueReferent` reports whether a referent NAME is a recency-value concept (the caller
 * supplies it from its own whole-library view: `recencyValueNames` at lowering / obligation build; the resolved
 * referent's `__bothRepMerge` at emit).
 *
 * Gated shape-EXACT on BOTH arms (disc 507): the referent (via `isRecencyValueReferent`) AND the interface's OWN arm
 * — a same-library (`getRefLibrary === null`, so a cross-lib `Other."V"` stays the deferred loud rejection, NOT a
 * silent local rebind) `Scalar<boolean>` at the DEFAULT Observation value carrier. That guarantees the emit's
 * `O.value as FHIR.boolean` / `(effective as FHIR.dateTime).value` own-arm read is correct — a `type is Condition` /
 * non-boolean / authored-non-standard-value-element interface is NOT this form and stays the build-debt `unclassified` arm
 * (never a silently-untranslatable emit).
 */
export function isMemberExistenceInterface(
  concept: Concept,
  isRecencyValueReferent: (referentName: string) => boolean,
): boolean {
  if (concept.code === undefined) return false;
  const def = concept.definition;
  if (def === undefined || def.type !== "DefinedAsDefinition" || def.body.type !== "DefinedAsExists") return false;
  const ref = def.body.ref;
  if (getRefLibrary(ref) !== null) return false; // cross-library referent → deferred loud rejection (A)
  if (!isRecencyValueReferent(getRefName(ref))) return false;
  // The interface's OWN arm must be a standard boolean Observation with the default value carrier (B), so the
  // hardcoded own-arm read is provably correct.
  if (assumedShapePreMigration(concept.shape) !== "Scalar") return false;
  if (!(concept.valueTypes.length === 1 && concept.valueTypes[0] === "boolean")) return false;
  if (concept.conceptType !== undefined && concept.conceptType !== "Observation") return false;
  if (concept.valueElement !== undefined) return false; // an authored non-default value carrier defers
  // The interface's OWN arm is a pure local `code is` + `defined as exists` — it carries NO `source representation`.
  // A boolean interface with its own source rep type-validates (charter §3) but the emitter hard-errors the 3-way
  // (`emit-mixed-code-and-definition`, lowerLocalCodes.ts) — classifying it value-reading would let the validator/CRE
  // read a source-populated boolean as an OWN value for an emit-rejected concept. Exclude it so the shape-exact
  // contract holds on both arms. (disc 513, Claude nit.)
  if ((concept.representations ?? []).length !== 0) return false;
  return true;
}

/**
 * #189 Piece 3 (Option C, disc 512) — is `concept` a VALUE-READING boolean determination: one whose emitted CQL
 * own-arm READS `.value as FHIR.boolean` (rather than presence/`exists`)? Today this is exactly the
 * member-existence interface; the deferred B2a boolean `most recent this` cell (recencyValueConcept.ts:52) will join
 * the class when it emits, at which point it is added here — the SAME single predicate the CEL validator (bare/
 * non-boolean value rules) and the CRE (own-value read) both consult, so all lanes classify identically and cannot
 * drift. `siblingConcepts` is the concept's OWN-LIBRARY concept list (the member-existence referent is unqualified /
 * same-library, recencyValueConcept.ts:95), from which the per-library recency-value referent set is derived — a
 * cross-library same-named concept must NEVER activate it (disc 512, both arms).
 */
export function isValueReadingBooleanConcept(concept: Concept, siblingConcepts: readonly Concept[]): boolean {
  // #189 null/pause — a PURE QUESTION is value-reading too: its determination IS its value (the emitted
  // Interface read is `answeredValue()`, which reads `.value as FHIR.boolean`). Joining the class is what
  // makes the CEL validator demand an explicit `value is true/false` on it and the CRE read the own value —
  // exactly the extension this predicate's doc anticipated for new value-reading cells.
  if (isPureQuestionConcept(concept)) return true;
  const recencyReferents = new Set(
    siblingConcepts.filter((c) => resolveRecencyValueConcept(c).kind === "recency-value").map((c) => c.name),
  );
  return isMemberExistenceInterface(concept, (name) => recencyReferents.has(name));
}

/**
 * #189 null/pause — is `concept` a PURE QUESTION?
 *
 * A pure question is a locally-coded boolean determination that **nothing can compute**: no derivation, no
 * source representation. There is no evidence to fall back on and no rule to evaluate, so it is **UNKNOWN
 * until a human answers it** — and it is the ONLY shape a `when` guard may gate on, because only a stored
 * boolean lets a user answer true / false / leave-unanswered (design of record
 * `tmp/DESIGN-apply-null-pause.md` §3.1).
 *
 * Contrast the neighbouring shapes, none of which are questions:
 *   - `definition is exists this`  — a derivation over the concept's OWN records; absence is closed-world
 *     FALSE, so it never pauses (a "predicate dressed as a fact").
 *   - a `source representation`    — external data DEFAULTS the determination; absent evidence is FALSE.
 *   - no `code is`                 — read-only/derived; a local code is the ONLY way to create an answer,
 *     and you can never ask a question about a representation (that is system-of-record clinical data).
 *
 * A pure question is therefore VALUE-READING (its determination IS its value), which is why its emitted read
 * is the three-state `answeredValue()` rather than the truth-set `asTruths().satisfied()` collapse.
 *
 * Shared predicate, deliberately alongside `isValueReadingBooleanConcept`: the emitter, the CEL validator and
 * the CRE must classify identically or the two lanes drift while both look correct.
 */
export function isPureQuestionConcept(concept: Concept): boolean {
  if (concept.code === undefined) return false; // no local code → no answer slot
  if (concept.definition !== undefined) return false; // a derivation computes it → closed-world
  if ((concept.representations ?? []).length !== 0) return false; // a source rep defaults it → closed-world
  // REFACTOR:grounded (#189, panel finding disc 517) — CARDINALITY IS DECLARED, NOT INFERRED (charter §3).
  // A pure question publishes ONE answer, so it must declare `shape is Scalar` (the builder's normalization
  // for an omitted `shape is`). Without this check a `shape is RecordSet` boolean Observation with a local
  // code was classified as a question and emitted `.answeredValue()` — a SCALAR selected from its records —
  // silently contradicting the cardinality the author declared. A record set is not an answer slot.
  if (assumedShapePreMigration(concept.shape) !== "Scalar") return false;
  // Only a resource with a stored boolean can carry an answer; a pure question is Observation by construction
  // (the implicit-standard local resource when `type is` is omitted — charter §3).
  if ((concept.conceptType ?? "Observation") !== "Observation") return false;
  return concept.valueTypes.length === 1 && concept.valueTypes[0] === "boolean";
}
