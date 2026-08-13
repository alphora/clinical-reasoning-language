// A concept's FULL discriminated RESULT type (design §2) — the concept-model fact that a Scalar publishes
// its value type while a Record / RecordSet publishes records of a FHIR resource. This lives in `grammar/`
// (a leaf beside `conceptShapes`/`conceptValueTypes`/`conceptTypes`) so BOTH the validator and the emit
// representation-descriptor can share ONE result-type definition without either importing the other —
// "validate must never depend on emit" (see `template-match/recencyProjectionOverride.ts`), and the emitter
// must not own a language/model type (#189 T1, crl-emit panel R1 P7/P8). Relocated here from
// `validator/useSiteTypeValidator.ts` (`resolveConceptResultType` stays there — it is scope-resolution-coupled).

import type { ConceptShape } from "./conceptShapes";
import type { ConceptType } from "./conceptTypes";
import type { ConceptValueType } from "./conceptValueTypes";

// A Record / RecordSet resource (`conceptType`) may be UNKNOWN when the concept derives its resource from
// operands and carries no `type is` (a legitimate model form — `reductionShapeValidator` exempts it from
// `non-scalar-missing-type`). The SHAPE is always known; only a record's resource can be undetermined. Kept
// STRUCTURED (not a plain string) so a shape disagreement is decidable without the resource: `Scalar<V>` vs
// any record, or `Record` vs `RecordSet`, differ for every resource.
export type ResultType =
  | { shape: "Scalar"; valueType: ConceptValueType }
  | { shape: "Record" | "RecordSet"; resource: ConceptType | undefined };

/**
 * A concept's result type, or `undefined` when FULLY indeterminate — a Scalar with 0 (A.10) or >1 (A.9)
 * value types (no comparison possible). A record shape is NEVER fully indeterminate: its shape is known
 * even when its resource is not (`resource: undefined`), which is enough to decide a shape disagreement.
 */
export function conceptResultType(
  shape: ConceptShape,
  valueTypes: ConceptValueType[],
  conceptType: ConceptType | undefined,
): ResultType | undefined {
  if (shape === "Scalar") {
    return valueTypes.length === 1 ? { shape: "Scalar", valueType: valueTypes[0] } : undefined;
  }
  return { shape, resource: conceptType };
}

/**
 * Whether two result types DISAGREE (a reportable mismatch), AGREE, or the comparison is INDETERMINATE.
 * Shape disagreement is always decidable. Two same-shape records agree/disagree on their resource ONLY
 * when both resources are known; if either is unknown the record-vs-record compare is indeterminate (a
 * `RecordSet<?>` could be either) and is conservatively skipped — never a false mismatch. A record result
 * is RESOURCE-keyed and DATUM-AGNOSTIC (design §4 F4 / §7 F5, panel R1 Claude #6): a `Quantity`-datum and
 * a `boolean`-datum `RecordSet<Observation>` are the SAME result and compose without complaint (do NOT
 * fold the datum value type in — it would falsely split two aliasable record sets). The charter §3
 * "operands agree on value type" sentence is the SCALAR rule (where value type == result).
 */
export function compareResultTypes(
  a: ResultType,
  b: ResultType,
): "agree" | "disagree" | "indeterminate" {
  if (a.shape !== b.shape) return "disagree"; // Scalar vs record, or Record vs RecordSet — differ for all R
  if (a.shape === "Scalar" && b.shape === "Scalar") {
    return a.valueType === b.valueType ? "agree" : "disagree";
  }
  // Same record shape (Record | RecordSet) — compare resources, if both are known.
  const ra = (a as { resource: ConceptType | undefined }).resource;
  const rb = (b as { resource: ConceptType | undefined }).resource;
  if (ra === undefined || rb === undefined) return "indeterminate";
  return ra === rb ? "agree" : "disagree";
}

/** A result type rendered for a diagnostic message: `V` for a Scalar, `Record<R>` / `RecordSet<R>` for a
 * record (`<…>` when the resource is unknown, mirroring `guardRecordShapedWarning`). */
export function renderResultType(rt: ResultType): string {
  return rt.shape === "Scalar" ? rt.valueType : `${rt.shape}<${rt.resource ?? "…"}>`;
}
