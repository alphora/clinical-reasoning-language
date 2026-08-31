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

/** The boolean counterpart. A null System.Boolean stays null — the constructor drops it, so no candidate. */
export function fhirBooleanFromSystemBoolean(systemBooleanExpr: string): string {
  return `FHIR.boolean { value: ${systemBooleanExpr} }`;
}

/** The concept's own local code as a `FHIR.CodeableConcept` literal — what the candidate is coded as. */
export function candidateCodeCql(code: CandidateCode): string {
  return (
    `FHIR.CodeableConcept { coding: { FHIR.Coding { ` +
    `system: FHIR.uri { value: ${q(code.system)} }, code: FHIR.code { value: ${q(code.code)} } } } }`
  );
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
 */
export function renderConstructorCall(inputs: ConstructorCallInputs): string {
  const args = [
    candidateCodeCql(inputs.code),
    inputs.valueExpr,
    inputs.stampExpr,
    inputs.subjectExpr,
    q(inputs.profile),
    inputs.evidenceExpr ?? "{}",
  ];
  return `({ ${inputs.functionName}(\n    ${args.join(",\n    ")}\n  ) }) C\n    where C is not null`;
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
  return `Max({ ${componentStampExprs.join(", ")} })`;
}

/** A component's recency stamp, read off a selected record. `cast` mirrors the resource registry's row: a
 *  CHOICE element (`effective`/`performed`) needs the `as FHIR.dateTime` cast, a plain one does not. */
export function componentStampCql(recordExpr: string, sortExpr: string, cast: "dateTime" | "none"): string {
  return cast === "dateTime"
    ? `((${recordExpr}).${sortExpr} as FHIR.dateTime).value`
    : `(${recordExpr}).${sortExpr}.value`;
}
