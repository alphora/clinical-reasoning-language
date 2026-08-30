import { type ConceptValueType } from "../grammar/conceptValueTypes";

// #189 T3a — the FHIR value-read model (design §8 flip-blocker). The single authority for the question every
// value-type check asks: "does resource R carry the value-read element E, and what concept value-type(s) does E
// admit?" Pinned to FHIR R4 (4.0.1). LANE-NEUTRAL (both validators and, at the flip, the emitter consume it —
// so it lives OUTSIDE emit/ and grammar/: it is FHIR-model knowledge, version-bound, NOT CRL syntax).
//
// INERT in T3a — no production module reads it (an allowlist test enforces this). The flip (T7) wires the
// value-type-must-match-a-real-element validation check; T4's migration inventory may consume this query
// DIRECTLY to classify each bare-`code is` value-read (no validator wiring needed for that).
//
// ── THE RETURN CONTRACT (∅ vs `undefined` — load-bearing, design panel disc 425) ────────────────────────────
//   • a NON-EMPTY set → the element exists and admits exactly these concept value-types (consumer checks
//     membership: declared value type ∈ set ⟹ legal).
//   • the EMPTY set ∅ → the QUERIED ELEMENT is MODELED and positively carries no readable value (a value-read /
//     `most recent this` on THIS element is invalid — e.g. `Condition.value`, `ServiceRequest.value`). ∅ is a
//     per-ELEMENT claim, NOT a resource-level one: a resource may have `value → ∅` (its standard carrier bears no
//     value) AND a DIFFERENT element that IS a value-read (`ServiceRequest.code → {CodeableConcept}`, the source
//     datum, #189 B1). An existing value-read element admits ≥1 type, so ∅ is unambiguously "this element
//     known-valueless", never "unknown".
//   • `undefined` → UNMODELED, no knowledge (out of T3a scope). A consumer keeps failing closed, and any
//     diagnostic must say *unsupported/unmodeled*, NEVER *absent* — claiming `Observation.interpretation` "is
//     not a real element" (it is, just unmodeled) would fabricate a fact.
// The three-way distinction MUST live inside this module: the flip's §2 hard error ("`most recent this` on a
// valueless rep") is only a correct claim when valuelessness is POSITIVELY known (Condition → ∅); and the
// validate lane cannot disambiguate by consulting `RESOURCE_EMIT_REGISTRY` (that is in emit/;
// validate-must-not-import-emit).
//
// ── SCOPE ────────────────────────────────────────────────────────────────────────────────────────────────
// The effective-representation subset: the 5 `RESOURCE_EMIT_REGISTRY` resources + the uncoded Patient age arm
// (T1 `uncodedDescriptor` reads `Patient.birthDate` as `date`). VALUE-READ elements are modeled; recency elements
// are structural and asserted by `RESOURCE_EMIT_REGISTRY` (T1/T2), NOT this model. The ONE modeled element that
// doubles as a coding element is `ServiceRequest.code` (#189 B1): for a SOURCE representation the external
// request's `code` IS the datum read (which covered device was requested), so it is a genuine CodeableConcept
// value-read. That the same element is the LOCAL arm's identity coding is an ARM-specific fact the deriver
// enforces (`computeLocalDatum` rejects a local value-read of the coding element — the disc-496 conflation on the
// local arm), NOT a fact this arm-agnostic model asserts. Other authored non-`value` elements and every other
// resource stay `undefined` → fail closed (nothing else in the corpus reads them; T4's inventory confirms).
//
// Patient is modeled ONLY for `birthDate` (the uncoded age arm). Its standard `value` carrier is deliberately
// left `undefined`, NOT ∅: Patient is not a value-read resource on the standard carrier (Patient concepts route
// through the age-catalog lane, `recencyProjectionOverride`), so the model asserts no positive fact about a
// `Patient.value` a KE will not author. `("Patient","value") → undefined` is pinned so a later edit is conscious.
//
// ── elementPath NORMALIZATION CONTRACT ───────────────────────────────────────────────────────────────────
// `elementPath` is RELATIVE to the resource (T1 stores relative paths: `value`, `birthDate`). A choice element
// is keyed by its BASE name without `[x]` (`value`, never `value[x]` or `valueQuantity`). Case-sensitive. A
// dotted input is legal and returns `undefined` (a nested path is simply unmodeled, not an error). So the key
// is `"value"`, never `"Observation.value"`.

/** The R4 4.0.1 `Observation.value[x]` admitted variants — ENUMERATED explicitly, NEVER derived as
 *  `conceptValueTypes` minus a couple names (that fails OPEN: a future CRL value type would silently become
 *  legal on Observation without an R4 check — disc 425). The complement (`date`, `Attachment`) is pinned by a
 *  test so a new grammar type breaks LOUDLY, forcing a conscious legality decision. (`date` is not an
 *  `Observation.value[x]` variant in R4; `Attachment` is R5-only.)
 *  DURABLE SOURCE: R4 4.0.1 `Observation.value[x]` — https://hl7.org/fhir/R4/observation.html (StructureDefinition
 *  http://hl7.org/fhir/StructureDefinition/Observation, element `Observation.value[x]`). Verify a legality change
 *  against the spec, not these literals. */
const OBSERVATION_VALUE_X: readonly ConceptValueType[] = [
  "boolean",
  "CodeableConcept",
  "dateTime",
  "integer",
  "Period",
  "Quantity",
  "Range",
  "Ratio",
  "SampledData",
  "string",
  "time",
];

/** `resourceType → { relative value-read elementPath → admitted concept value-types }`. ∅ = modeled-valueless;
 *  an absent resource or absent element key → `undefined` (unmodeled) via `valueReadValueTypes`. */
const FHIR_VALUE_READ_MODEL: Readonly<
  Record<string, Readonly<Record<string, ReadonlySet<ConceptValueType>>>>
> = {
  Observation: { value: new Set(OBSERVATION_VALUE_X) },
  Patient: { birthDate: new Set<ConceptValueType>(["date"]) }, // the uncoded age arm's value-read
  Condition: { value: new Set<ConceptValueType>() }, // ∅ — modeled, valueless (presence via `exists`)
  Procedure: { value: new Set<ConceptValueType>() }, // ∅
  ServiceRequest: {
    value: new Set<ConceptValueType>(), // ∅ — the standard `value` carrier is modeled-valueless
    // #189 B1 — the SOURCE datum read: `ServiceRequest.code` (which covered device was requested) is a genuine
    // CodeableConcept value-read, DISTINCT from the ∅ `value` carrier. (Local-arm identity-coding conflation is
    // guarded in `computeLocalDatum`, not here — this model states the honest FHIR fact that SR.code admits CC.)
    code: new Set<ConceptValueType>(["CodeableConcept"]),
  },
  MedicationRequest: { value: new Set<ConceptValueType>() }, // ∅
};

/** The admitted concept value-types for a resource's value-read element — see THE RETURN CONTRACT above. A
 *  non-empty set = element admits these; ∅ = modeled, positively no value element; `undefined` = unmodeled. */
export function valueReadValueTypes(
  resourceType: string,
  elementPath: string,
): ReadonlySet<ConceptValueType> | undefined {
  // own-property guards: `resourceType`/`elementPath` are `string` at the type level, so a name like
  // `toString`/`constructor` must not resolve to a prototype member and masquerade as a modeled cell.
  if (!Object.prototype.hasOwnProperty.call(FHIR_VALUE_READ_MODEL, resourceType)) return undefined;
  const elements = FHIR_VALUE_READ_MODEL[resourceType];
  if (!Object.prototype.hasOwnProperty.call(elements, elementPath)) return undefined;
  return elements[elementPath];
}

/** The value types that are NOT admitted on `Observation.value[x]` in R4 — exported so a test can pin the
 *  complement (`conceptValueTypes − OBSERVATION_VALUE_X`) and break loudly when the grammar value-type set
 *  grows without an R4-legality decision. */
export const OBSERVATION_VALUE_X_EXCLUDED: readonly ConceptValueType[] = ["date", "Attachment"];

/** The resource types this model knows about — exported so a test can pin the model's keyset against
 *  `RESOURCE_EMIT_REGISTRY` ∪ {Patient} in BOTH directions (a future stray row, e.g. `Encounter`, would silently
 *  widen the stated scope otherwise; disc 425). */
export const MODELED_RESOURCE_TYPES: readonly string[] = Object.keys(FHIR_VALUE_READ_MODEL);

/**
 * The modeled value-read elements on `resourceType` that ADMIT `valueType`, in declaration order.
 *
 * ⭐ The carrier LOOKUP, inverted (#189 P2). Callers used to be handed an element path by the author
 * (`value element is …`) and this module only checked it. With that construct retired, a caller has the
 * concept's value type and needs the element — which is this function, and it is the ONLY sanctioned way to
 * get one.
 *
 * ⚠ Returns `[]` for both "unmodeled resource" and "modeled, but nothing admits that type". Callers must
 * FAIL CLOSED on an empty result rather than fall back to a default carrier: charter §3, RULED — *"a
 * resource whose canonical carrier has not been ruled is UNMODELED … Never guess a carrier."* A result of
 * length > 1 is likewise not a menu to pick from; it means no canonical carrier is ruled between them.
 */
export function valueReadElementsAdmitting(
  resourceType: string,
  valueType: ConceptValueType,
): readonly string[] {
  if (!Object.prototype.hasOwnProperty.call(FHIR_VALUE_READ_MODEL, resourceType)) return [];
  const elements = FHIR_VALUE_READ_MODEL[resourceType];
  return Object.keys(elements).filter((path) => elements[path].has(valueType));
}
