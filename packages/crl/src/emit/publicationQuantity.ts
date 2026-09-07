import type { PublicationValueError } from "./publicationDomain";

// REFACTOR:grounded (#320, plan587): units are semantic codes, not display labels.
// CEL's existing {value, unit} form is an explicit supported wire representation.
export const PUBLICATION_UCUM = "http://unitsofmeasure.org";
export type PublicationQuantityValue = { kind: "unknown" } |
  { kind: "known"; value: number; unit: string } | PublicationValueError;

export function readPublicationQuantity(value: unknown): PublicationQuantityValue {
  const fail = (message: string): PublicationValueError => ({ kind: "error", code: "publication-invalid-quantity", message });
  if (value == null) return { kind: "unknown" };
  if (typeof value !== "object" || Array.isArray(value)) return fail("Expected a FHIR Quantity.");
  const q = value as Record<string, unknown>;
  if (q.comparator != null) return fail("A comparator Quantity is not an exact measurement.");
  if (q.value == null) return { kind: "unknown" };
  if (typeof q.value !== "number" || !Number.isFinite(q.value)) return fail("Quantity value must be a finite number or absent.");
  if (q.system != null && q.system !== PUBLICATION_UCUM) return fail("Quantity system must be UCUM when present.");
  if (q.system === PUBLICATION_UCUM && (typeof q.code !== "string" || !q.code.trim())) return fail("A UCUM Quantity requires its code.");
  const unit = q.code ?? q.unit;
  if (typeof unit !== "string" || !unit.trim()) return fail("An exact measurement requires an explicit unit code or CEL unit.");
  return { kind: "known", value: q.value, unit };
}

const units: Record<string, { group: string; factor: bigint }> = {
  m: { group: "length", factor: 100n }, cm: { group: "length", factor: 1n },
  kg: { group: "mass", factor: 1000n }, g: { group: "mass", factor: 1n },
  "kg/m2": { group: "bmi", factor: 1n },
};
/** Exact coefficient/rational comparison; no binary floating-point multiplication at thresholds. */
export function publicationDecimal(value: number): { coefficient: bigint; scale: bigint } {
  const [mantissa, exponent = "0"] = value.toString().toLowerCase().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const power = fraction.length - Number(exponent);
  const coefficient = BigInt(whole + fraction);
  return power >= 0 ? { coefficient, scale: 10n ** BigInt(power) } : { coefficient: coefficient * 10n ** BigInt(-power), scale: 1n };
}
export function isPublicationComparisonDecimal(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= 1e6 && publicationDecimal(value).scale <= 100000000n;
}
export function publicationQuantityAtLeast(value: unknown, threshold: { value: number; unit: string }):
  { kind: "unknown" } | { kind: "known"; value: boolean } | PublicationValueError {
  const q = readPublicationQuantity(value);
  if (q.kind !== "known") return q;
  if (!isPublicationComparisonDecimal(q.value) || !isPublicationComparisonDecimal(threshold.value))
    return { kind: "error", code: "publication-quantity-precision-unsupported", message: "Quantity comparison supports magnitude at most 10^6 and at most eight decimal places." };
  const a = units[q.unit], b = units[threshold.unit];
  if (a === undefined || b === undefined || a.group !== b.group)
    return { kind: "error", code: "publication-quantity-unit-unsupported", message: "Quantity comparison requires compatible supported units." };
  const left = publicationDecimal(q.value), right = publicationDecimal(threshold.value);
  return { kind: "known", value: left.coefficient * a.factor * right.scale >= right.coefficient * b.factor * left.scale };
}
