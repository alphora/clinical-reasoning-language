// #189 T3a — the lane-neutral FHIR element-path normalizer. A value/recency element is authored/cataloged as a
// QUALIFIED path (`Patient.birthDate`, `Observation.value`) but T1's descriptor and the value-read model key the
// RELATIVE segment (`birthDate`, `value`). This strip lives here — NOT in emit/ — so BOTH the validate lane
// (the flip's T7 value-type check, which must not import emit) and the emit lane share ONE normalizer rather
// than each re-implementing a documented convention (disc 425). See `fhirValueModel.valueReadValueTypes`, whose
// keys this produces.

/** Strip a leading `<resourceType>.` so a qualified authored/catalog path becomes the relative read path the
 *  value-read model and T1's descriptor key by (`Patient.birthDate` → `birthDate`,
 *  `Patient.meta.lastUpdated` → `meta.lastUpdated`, an already-relative `value` → `value`). Only the single
 *  leading resource segment is stripped; a genuinely nested remainder (`meta.lastUpdated`) is preserved (and is
 *  simply unmodeled by the value-read model → `undefined`). */
export function relativeElementPath(path: string, resourceType: string): string {
  const prefix = `${resourceType}.`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}
