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
      /**
       * ⭐ #189 — WHAT THE MERGE PUBLISHES, and it is the concept's DECLARED `shape is`, never inferred.
       *
       *   `"value"`  — `shape is Scalar`: the merge publishes the newest RECORD'S VALUE (a `Scalar<T>` or null).
       *   `"record"` — `shape is Record`: the merge publishes the newest RECORD itself.
       *
       * Both select the same way over the same union of arms; they differ ONLY in what the selected candidate
       * is read down to. Splitting them into two resolvers would let the two selections drift, which is the
       * thing this file exists to prevent (validate and emit read ONE authority).
       */
      publishes: "value" | "record";
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

  // ⭐ #189 — REFACTOR:grounded. `Scalar` publishes the newest record's VALUE; `Record` publishes the newest
  // RECORD. Re-derived from the GOAL (charter §0a: GOAL > CHARTER > CODE) and execution-verified against the
  // real CQL engine, not from the adjacent Scalar-only code. Both are this
  // form. The `Record` arm is what the GOAL's `Height`/`Weight` are (`shape is Record` + `code is` + `most recent
  // this` + one `coded from` posrep), and excluding it was the single line that kept the goal from emitting —
  // MEASURED: every other condition here already passed for them.
  //
  // ⚠ `RecordSet` is NOT admitted: a merge that selects ONE candidate cannot publish a set, and inferring a
  // cardinality the author did not declare is the magic charter §3/§4 bans. It stays the build-debt arm.
  const declaredShape = assumedShapePreMigration(concept.shape);
  if (declaredShape !== "Scalar" && declaredShape !== "Record") return no;
  const publishes = declaredShape === "Scalar" ? ("value" as const) : ("record" as const);
  // A Scalar publishes a value, so it must DECLARE exactly one non-boolean value type (a Scalar boolean `most
  // recent this` is the B2a cell; a boolean value/interface concept is the `defined as exists` family). A Record
  // publishes the record, and its `value type` is an OPTIONAL datum description — it constrains nothing here.
  if (publishes === "value" && !(concept.valueTypes.length === 1 && concept.valueTypes[0] !== "boolean")) return no;

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

  return { kind: "recency-value", sourceRep: rep, publishes };
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
 * ⚠ THIS PREDICATE DETECTS THE DEGENERATE ONE-ARM CASE. It is NOT the test for "can this pause", and must
 * never be used as one. Three-state-ness is a property of a determination's MERGE — a determination is
 * UNKNOWN when NO arm establishes it — so a multi-arm determination pauses too, and the merge is what has to
 * preserve that. This predicate answers the narrower question "is the answer slot the ONLY arm", because
 * that is the case whose emitted read is exactly `answeredValue()`.
 *
 * The neighbouring shapes, and what an absent arm actually contributes:
 *   - `definition is exists this`  — a derivation over the concept's OWN RECORDS. A retrieval always
 *     computes, so absence here IS closed-world FALSE and it never pauses. ⚠ That holds because of what it
 *     READS, not because it is a derivation: a derivation over a QUESTION inherits the question's unknown
 *     (`"BMI" at least 30` over an unestablished BMI is UNKNOWN, charter §4).
 *   - a `source representation`    — an external arm. ⚠ An absent source record contributes NOTHING to the
 *     merge; it does not DEFAULT the determination to false. An untimestamped false cannot compete in a
 *     merge, and totalizing it manufactures a stated answer out of an absence.
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
  // ⚠ These two exclusions make this the ONE-ARM detector. They are NOT a claim that a derivation or a
  // posrep makes a determination closed-world — that claim is false (see the header), and reading them that
  // way is what would deny an unestablished `Obese` instead of pausing on it.
  if (concept.definition !== undefined) return false; // a second arm — the merge decides, not this predicate
  if ((concept.representations ?? []).length !== 0) return false; // a second arm — likewise
  // REFACTOR:grounded (#189, panel finding disc 517) — CARDINALITY IS DECLARED, NOT INFERRED (charter §3).
  // A pure question publishes ONE answer, so it must declare `shape is Scalar`. An OMITTED `shape is` is
  // UNDECLARED, not `Scalar` (charter §3; the normalization was removed in `c4ae00cb`) — this read routes
  // through the one marked transitional helper, which RETIREs with `189-shape-declared`.
  // Without this check a `shape is RecordSet` boolean Observation with a local
  // code was classified as a question and emitted `.answeredValue()` — a SCALAR selected from its records —
  // silently contradicting the cardinality the author declared. A record set is not an answer slot.
  if (assumedShapePreMigration(concept.shape) !== "Scalar") return false;
  // Only a resource with a stored boolean can carry an answer; a pure question is Observation by construction
  // (the implicit-standard local resource when `type is` is omitted — charter §3).
  if ((concept.conceptType ?? "Observation") !== "Observation") return false;
  return concept.valueTypes.length === 1 && concept.valueTypes[0] === "boolean";
}
