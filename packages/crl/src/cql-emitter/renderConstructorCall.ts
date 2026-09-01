// #189 — the CALL SITE for a record constructor: turning a producer stage's computed value into a CANDIDATE
// that joins the concept's space.
//
// `renderRecordConstructor` emits the FUNCTION; this emits the CALL and the singleton that carries it. They
// are separate because the function is emitted ONCE per library and the call once per producer stage.
//
// ⭐ THE MODEL (operator): *"TWO ARMS ADD TO A COLLECTION AND A THIRD ARM WORKS ON THAT COLLECTION STEPWISE
// (POTENTIALLY ADDING TO IT)."* The two arms are the local `code is` records and the source representation's;
// this is how a `definition is` PRODUCER stage does its adding. The terminal selection then works on the
// union of all of it.
//
// ⚠ EVERY LINE HERE IS EXECUTION-VERIFIED, not designed: the exact shapes were run against the cqf CQL engine
// and are written up in `tmp/NOTES-bmi-producer-target-verified.md` (a Quantity producer) and
// `tmp/NOTES-obese-target-verified.md` (a boolean producer + the heterogeneous projection arm). Change a
// spelling here and re-run those probes — a byte-golden does NOT test translation.
//
// REFACTOR:grounded — derived from the executed target and the charter, not from adjacent emitter code.

/** A local code, as the concept's synthetic terminology defines it. */
export interface CandidateCode {
  /** The local codesystem's canonical url (the `codesystem "<domain>": '<urn>'` literal). */
  system: string;
  /** The code value (`code is \`bmi\`` -> `bmi`). */
  code: string;
}

export interface ConstructorCallInputs {
  /** The generated constructor's name, from `resolveConstructor` (never re-derived here). */
  functionName: string;
  /** The concept's own local code — what the constructed candidate is coded as. */
  code: CandidateCode;
  /**
   * The value expression, ALREADY IN ITS FHIR TYPE. Use `fhirQuantityFromSystemQuantity` /
   * `fhirBooleanFromSystemBoolean` to get here — a producer yields System types and the constructor takes
   * FHIR ones, and they do not line up (see below).
   */
  valueExpr: string;
  /** The §5b recency stamp: a `System.DateTime` expression. */
  stampExpr: string;
  /** The subject reference expression. */
  subjectExpr: string;
  /** The case-feature profile url stamped into `meta.profile`. */
  profile: string;
  /** Provenance references. `{}` when none — never null. */
  evidenceExpr?: string;
}

const q = (s: string): string => `'${s.replace(/'/g, "\\'")}'`;

/**
 * ⚠⚠ A PRODUCER YIELDS A `System.Quantity`; THE CONSTRUCTOR TAKES A `FHIR.Quantity`. They do not line up, and
 * `FHIRHelpers.ToQuantity` is the WRONG DIRECTION (FHIR -> System). MEASURED: passing a producer's result
 * straight in fails to translate —
 *
 *     Could not resolve call to operator ToQuantity with signature (System.Quantity)
 *
 * so the value is decomposed instead. The null guard is NOT optional: `FHIR.Quantity { value: FHIR.decimal
 * { value: null } }` is the same class of crash the recency stamp produced, and a producer over absent
 * operands yields null by design (that is what lets the tree PAUSE rather than deny).
 */
export function fhirQuantityFromSystemQuantity(systemQuantityExpr: string): string {
  return (
    `if ${systemQuantityExpr} is null then null as FHIR.Quantity\n` +
    `  else FHIR.Quantity {\n` +
    `    value: FHIR.decimal { value: (${systemQuantityExpr}).value },\n` +
    `    unit:  FHIR.string  { value: (${systemQuantityExpr}).unit }\n` +
    `  }`
  );
}

/**
 * ⚠⚠ THE BOOLEAN COUNTERPART NEEDS THE SAME GUARD, AND FOR A REASON THAT IS NOT OBVIOUS. An earlier version
 * of this function emitted the bare `FHIR.boolean { value: X }` under the comment *"a null System.Boolean
 * stays null — the constructor drops it, so no candidate"*. That was ASSERTED, and it is FALSE.
 *
 * MEASURED against the cqf CQL engine (`tmp/nullprobe/boolguard/`): a CQL instance selector with a null
 * property is a NON-NULL INSTANCE.
 *
 *     FHIR.boolean { value: null } is null   ->  FALSE
 *     (FHIR.boolean { value: null }).value is null  ->  true
 *
 * So the constructor's `value is null` guard NEVER FIRES on it and a candidate IS built — carrying a null
 * `valueBoolean` and a REAL recency stamp.
 *
 * ⚠ THAT CANDIDATE WINS. The reachable case is a BMI record that EXISTS but carries no value: `AtLeast`
 * returns null while the stamp is the record's own `effective`, so the valueless candidate is the NEWEST in
 * the space, beats an older ESTABLISHED `false`, and turns an owed DENY into a pause. Charter "VOCABULARY" —
 * absence is never established, so a non-claim must never compete in the merge.
 *
 * The guarded form is verified null (`Guarded Is Null = true`, same probe).
 */
export function fhirBooleanFromSystemBoolean(systemBooleanExpr: string): string {
  return (
    `if ${systemBooleanExpr} is null then null as FHIR.boolean
` +
    `  else FHIR.boolean { value: ${systemBooleanExpr} }`
  );
}

/** The concept's own local code as a `FHIR.CodeableConcept` literal — what the candidate is coded as. */
export function candidateCodeCql(code: CandidateCode): string {
  return (
    `FHIR.CodeableConcept { coding: { FHIR.Coding { ` +
    `system: FHIR.uri { value: ${q(code.system)} }, code: FHIR.code { value: ${q(code.code)} } } } }`
  );
}

/**
 * The BARE constructor call — ONE reading of the argument order, for every caller.
 *
 * ⚠ Extracted because the BOUNDARY transform needs a SINGLE resource expression while the arms need a LIST
 * (`renderConstructorCall` below wraps this one). Rendering the argument list in two places is how a call
 * and the function it calls come to disagree — the same reason `ProducerCandidateSpec` carries the
 * constructor signature WHOLE rather than just its name.
 */
export function constructorCallExpr(inputs: ConstructorCallInputs): string {
  const args = [
    candidateCodeCql(inputs.code),
    inputs.valueExpr,
    inputs.stampExpr,
    inputs.subjectExpr,
    q(inputs.profile),
    inputs.evidenceExpr ?? "{}",
  ];
  return `${inputs.functionName}(\n    ${args.join(",\n    ")}\n  )`;
}

/**
 * ⭐ The producer's candidate, as a LIST that is empty when nothing was produced.
 *
 * ⚠ THE `where C is not null` IS LOAD-BEARING AND WAS PROBED, not assumed. P2-D1 flagged the null-drop as
 * "ASSERTED, not probed"; executed, the bare `{ C }` form yields `[null]` — a null genuinely IN the list —
 * while this form yields `[]`. CQL's `union` happens to drop the null at the join site TODAY, so both
 * spellings agree there; that is incidental, and anything that counts or folds the candidate list without a
 * union would see it. Emit the form that is empty, not the one that is accidentally tolerated.
 *
 * The result is a list precisely so it can be `union`ed into the space with no special case for "the producer
 * produced nothing" — which is the state that makes the determination UNKNOWN and the guard PAUSE.
 *
 * ⚠ The BOUNDARY transform deliberately does NOT use this form: it publishes ONE record, not a list, so it
 * calls `constructorCallExpr` directly. The null-drop still happens — via the constructor's own
 * `recorded is null` guard — it just has no list to be empty.
 */
export function renderConstructorCall(inputs: ConstructorCallInputs): string {
  return `({ ${constructorCallExpr(inputs)} }) C\n    where C is not null`;
}

/**
 * ⭐ #189 — a PROJECTED source arm: every source record becomes ONE candidate of the concept's own `type is`.
 *
 * ⚠ THE `return` IS PER RECORD, AND THAT IS THE SEMANTICS, not a rendering detail. Zero source records means
 * zero invocations means NO candidate — so an `exists this` projection can only ever contribute `true`, and
 * can never contribute a `false`. That single property is the difference between an unestablished
 * determination PAUSING and it denying (executed, `tmp/NOTES-obese-target-verified.md`).
 *
 * ⚠ The candidate is stamped from the SOURCE record it was projected from (`C.recordedDate` for a Condition),
 * read through the source resource's own registry row — so it competes on recency with the local answers on
 * equal terms. The heterogeneity disappears at this point: the Condition never appears in the space AS a
 * Condition, only as the candidate the projection built from it.
 *
 * ⚠ NO `where C is not null` HERE, unlike the producer call. The value is the literal `true`, so the
 * constructor's value guard cannot fire; only a null STAMP can drop a record, and the constructor's own
 * `recorded is null` guard handles that — a source record with no date yields a null candidate that the
 * `union` drops. Adding a filter would suggest the value could be absent, which it cannot.
 */
export function renderProjectedSourceArm(inputs: {
  /** The source retrieve to project over (`ExternalPrimitives."Obese Source"`). */
  sourceRef: string;
  /** The generated constructor's name, from `resolveConstructor`. */
  functionName: string;
  /** The concept's own local code — the candidate is coded as the CONCEPT, never as the source record. */
  code: CandidateCode;
  /** The SOURCE resource's recency element and cast, from its own registry row. */
  recency: { sortExpr: string; cast: "dateTime" | "none" };
  subjectExpr: string;
  profile: string;
}): string {
  const stamp = componentStampCql("C", inputs.recency.sortExpr, inputs.recency.cast);
  const args = [
    candidateCodeCql(inputs.code),
    `FHIR.boolean { value: true }`,
    stamp,
    inputs.subjectExpr,
    q(inputs.profile),
    "{}",
  ];
  return (
    `(${inputs.sourceRef}) C\n` +
    `    return ${inputs.functionName}(\n` +
    `      ${args.join(",\n      ")}\n` +
    `    )`
  );
}

/**
 * §5b — a DERIVED candidate's stamp is the NEWEST OF THE COMPONENTS THAT DETERMINE ITS VALUE.
 *
 * The operator's reasoning, which is the one to keep: *"in a calculation, one argument updating changes the
 * result"* — a recalculation triggered by a newer input is a NEW claim, made as of that input. So a FORMULA
 * over several operands takes the max of their stamps; a THRESHOLD over one takes that one's.
 *
 * ⚠ Evaluation time (`Now()`) is FORBIDDEN as a fallback: an invented stamp lets a stale calculation outrank
 * a fresh assertion. With no components there is no stamp, the constructor drops the candidate, and the
 * determination is correctly unknown.
 *
 * ⚠ Returns `null as System.DateTime` for zero components rather than omitting the argument — the
 * constructor's guard is what turns that into "no candidate", and it must be reached, not bypassed.
 */
export function derivedStampCql(componentStampExprs: readonly string[]): string {
  if (componentStampExprs.length === 0) return "null as System.DateTime";
  if (componentStampExprs.length === 1) return componentStampExprs[0];
  // ⚠⚠ THE NULL CHECK IS EXPLICIT BECAUSE `Max` WOULD OTHERWISE DECIDE THIS SILENTLY, AND WRONGLY.
  //
  // MEASURED against the cqf CQL engine (`tmp/nullprobe/maxnull/`): CQL's aggregate `Max` IGNORES null list
  // elements. `Max({ @2026-05-01, null })` returns `2026-05-01` — it is null only when EVERY element is.
  //
  // An earlier version emitted the bare `Max({ … })` and leaned on that default. It is the wrong rule here:
  // a formula whose Height has a value but NO `effective` would be stamped by the WEIGHT ALONE, giving a
  // partially-undated claim a confident place in the recency order. That is the same manufactured stamp the
  // no-`Now()` rule below bans, arriving by a different route — and `renderRecordConstructor`'s own guard
  // doctrine already states the rule for the fully-unknown case: *"a candidate that cannot say when it was
  // claimed cannot be recency-ordered against the other arms, and guessing its place is exactly the
  // manufactured answer this design bans."* Partially-unknown is unknown.
  //
  // So the rule is ALL-OR-NOTHING: any null component ⇒ a null stamp ⇒ the constructor's `recorded is null`
  // guard fires ⇒ NO candidate. This does not over-pause — the concept's asserted and recorded arms are
  // untouched and still compete.
  const anyNull = componentStampExprs.map((e) => `${e} is null`).join(" or ");
  return (
    `if ${anyNull} then null as System.DateTime
` +
    `  else Max({ ${componentStampExprs.join(", ")} })`
  );
}

/** A component's recency stamp, read off a selected record. `cast` mirrors the resource registry's row: a
 *  CHOICE element (`effective`/`performed`) needs the `as FHIR.dateTime` cast, a plain one does not. */
export function componentStampCql(recordExpr: string, sortExpr: string, cast: "dateTime" | "none"): string {
  return cast === "dateTime"
    ? `((${recordExpr}).${sortExpr} as FHIR.dateTime).value`
    : `(${recordExpr}).${sortExpr}.value`;
}

/**
 * ⭐⭐ #189 — THE BOUNDARY TRANSFORM. Run the concept's pipeline, ask whether the published record already IS
 * the case feature, and construct one only if it is not.
 *
 * Operator, 2026-09-01: *"we should be able to run everything for a concept and then check if the result is
 * our CF then replace the result with our CF if not."* — and, scoping it: *"it only applies to concepts that
 * have a `code is`."*
 *
 * ⚠⚠ THE TRANSFORM GOES ON THE CONCEPT'S OWN DEFINE, AND THE HELPER HOLDS THE RAW SELECT — never the other
 * way round. Both panel arms caught this independently (disc 532 Q5): if the transform sat on a side define
 * that only the `cpg-featureExpression` targeted, every CQL consumer — a cross-library reference, the
 * Interface re-export, a downstream reduction — would still read the raw record. The ruling is
 * consumer-independent (charter §3: *"it does not depend on which consumer is asking"*), so the concept's
 * published define is where it must land.
 *
 * ⚠ CHECK-THEN-REPLACE, not always-reconstruct. A record that already carries the local code is a PERSISTED
 * resource with an `id`; reconstructing it would discard that identity on every evaluation to avoid a check
 * measured to be a single operator.
 *
 * ⭐ EXECUTED, both branches (`tmp/NOTES-kernel-spellings-executed.md`): the `if/then/else` type-unifies a
 * RETRIEVED resource with a CONSTRUCTED one; the conforming winner is preserved WITH its `id`; the
 * non-conforming one is replaced by a constructed record that carries the local code and PRESERVES the
 * source record's stamp.
 *
 * ⚠ NULL-RECENCY IS A DROP (disc 532 Q3) — CONDITIONALLY. The stamp is read off the winner; when it is null
 * the constructor's own guard yields nothing. But that guard is only reached on the REPLACE branch: a winner
 * that already carries the local code is PRESERVED undated. MEASURED, both rows, in
 * `tmp/NOTES-boundary-transform-executed.md`.
 *
 * ⚠⚠ TWO KNOWN GAPS, FILED RATHER THAN SILENTLY DECIDED (disc 533, both arms):
 *
 *   1. **`evidence` is `{}`** — the replacement carries NO back-reference to the record it replaced, even
 *      though that record HAS an `id` and is in scope. The Observation value-mode signature already declares
 *      `evidenceElement: "derivedFrom"`, so the slot exists and the expression is one line. It is NOT done
 *      here because `derivedFrom` exists only on that one cell: a general answer needs a per-resource
 *      registry decision, and inventing one per call site is how the lanes drift. The projected arm passes
 *      `{}` for the same reason. ⚠ Read this as OPEN, not as decided-forever.
 *   2. **`meta.profile` is asymmetric** — a CONSTRUCTED replacement carries the case-feature profile; a
 *      PRESERVED winner does not, because stamping a retrieved record would mean reconstructing it and
 *      discarding its `id`. So profile PRESENCE means "constructed", and conformance is established by the
 *      CODE (`patternCodeableConcept`), never by the profile. Any consumer testing `meta.profile` to decide
 *      whether a record is a case feature is asking the wrong question.
 */
export function renderBoundaryTransform(inputs: {
  /** The rendered reference to the helper define holding the raw select (e.g. `"Weight Selected"`). */
  selectedRef: string;
  /** The identity check over `selectedRef`, from `renderCodingIdentityCheck` — descriptor-driven. */
  identityCheck: string;
  /** The constructor call producing the replacement record. */
  constructedExpr: string;
}): string {
  const { selectedRef, identityCheck, constructedExpr } = inputs;
  // ⚠ The null arm is FIRST and explicit. Without it the identity check runs against null — which is null,
  // not false, so the `else` would construct from a record that is not there.
  return (
    `if ${selectedRef} is null then null\n` +
    `  else if ${identityCheck} then ${selectedRef}\n` +
    `  else ${constructedExpr}`
  );
}
