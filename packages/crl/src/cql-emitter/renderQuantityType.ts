// REFACTOR:grounded (#328): emitted Quantity type admission and exact conversion.
import { PUBLICATION_CANDIDATE_CQL_TYPE } from "./renderPublicationSelection";
export const QUANTITY_TYPE_PREFIX = "__CRL_PublicationQuantityType_v1_";
export const QUANTITY_TYPE_CQL = "__CRL_PublicationQuantityType_v1_Normalize";
export function renderQuantityTypeHelpers(): string {
  return `define function "__CRL_PublicationQuantityType_v1_Factor"(unit System.String):
  case unit when 'm' then 100.0 when 'cm' then 1.0 when 'kg' then 1000.0 when 'g' then 1.0 else null as System.Decimal end
define function "__CRL_PublicationQuantityType_v1_Value"(Q FHIR.Quantity, unit System.String):
  if Q.value.value is null then Q
  else if Coalesce(Q.code.value, Q.unit.value) is null then
    Message(null as FHIR.Quantity, true, 'publication-invalid-quantity', 'Error', 'A populated Quantity requires an explicit unit')
  else if Coalesce(Q.code.value, Q.unit.value) = unit then
    FHIR.Quantity { id: Q.id, extension: Q.extension, value: Q.value, comparator: Q.comparator,
      unit: FHIR.string { id: Q.unit.id, extension: Q.unit.extension, value: unit }, code: FHIR.code { id: Q.code.id, extension: Q.code.extension, value: unit }, system: FHIR.uri { id: Q.system.id, extension: Q.system.extension, value: 'http://unitsofmeasure.org' } }
  else if not ((Coalesce(Q.code.value, Q.unit.value) in { 'm', 'cm' } and unit in { 'm', 'cm' })
    or (Coalesce(Q.code.value, Q.unit.value) in { 'kg', 'g' } and unit in { 'kg', 'g' })) then
    Message(null as FHIR.Quantity, true, 'publication-quantity-unit-unsupported', 'Error', 'Quantity is incompatible with its declared type unit')
  else "__CRL_PublicationQuantityType_v1_Converted"(Q, unit,
    Q.value.value * "__CRL_PublicationQuantityType_v1_Factor"(Coalesce(Q.code.value, Q.unit.value)) / "__CRL_PublicationQuantityType_v1_Factor"(unit))
define function "__CRL_PublicationQuantityType_v1_Converted"(Q FHIR.Quantity, unit System.String, number System.Decimal):
  if Abs(Q.value.value) > 1000000.0 or Q.value.value != Round(Q.value.value, 8)
    or Abs(number) > 1000000.0 or number != Round(number, 8)
    or number * "__CRL_PublicationQuantityType_v1_Factor"(unit) != Q.value.value * "__CRL_PublicationQuantityType_v1_Factor"(Coalesce(Q.code.value, Q.unit.value)) then
    Message(null as FHIR.Quantity, true, 'publication-quantity-precision-unsupported', 'Error', 'Quantity conversion requires exact input and output within magnitude 10^6 and eight decimal places')
  else FHIR.Quantity { id: Q.id, extension: Q.extension, value: FHIR.decimal { id: Q.value.id, extension: Q.value.extension, value: number }, comparator: Q.comparator,
    unit: FHIR.string { id: Q.unit.id, extension: Q.unit.extension, value: unit }, code: FHIR.code { id: Q.code.id, extension: Q.code.extension, value: unit }, system: FHIR.uri { id: Q.system.id, extension: Q.system.extension, value: 'http://unitsofmeasure.org' } }
define function "__CRL_PublicationQuantityType_v1_Record"(O FHIR.Observation, unit System.String):
  FHIR.Observation {
      id: O.id,
      meta: O.meta,
      implicitRules: O.implicitRules,
      language: O.language,
      text: O.text,
      contained: O.contained,
      extension: O.extension,
      modifierExtension: O.modifierExtension,
      identifier: O.identifier,
      basedOn: O.basedOn,
      partOf: O.partOf,
      status: O.status,
      category: O.category,
      code: O.code,
      subject: O.subject,
      focus: O.focus,
      encounter: O.encounter,
      effective: O.effective,
      issued: O.issued,
      performer: O.performer,
      dataAbsentReason: O.dataAbsentReason,
      interpretation: O.interpretation,
      note: O.note,
      bodySite: O.bodySite,
      method: O.method,
      specimen: O.specimen,
      device: O.device,
      referenceRange: O.referenceRange,
      hasMember: O.hasMember,
      derivedFrom: O.derivedFrom,
      component: O.component,
      value: "__CRL_PublicationQuantityType_v1_Value"(O.value as FHIR.Quantity, unit)
  }
define function "${QUANTITY_TYPE_CQL}"(C ${PUBLICATION_CANDIDATE_CQL_TYPE}, unit System.String):
  if C is null then null as ${PUBLICATION_CANDIDATE_CQL_TYPE}
  else Tuple { key: C.key, contributorId: C.contributorId, arm: C.arm, retrievedInputIdentity: C.retrievedInputIdentity,
    resource: "__CRL_PublicationQuantityType_v1_Record"(C.resource, unit), validity: C.validity }`;
}
