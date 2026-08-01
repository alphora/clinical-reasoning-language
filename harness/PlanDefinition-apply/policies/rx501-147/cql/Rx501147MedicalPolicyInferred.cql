library Rx501147MedicalPolicyInferred

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include Rx501147MedicalPolicyLocalSource

context Patient

/*
 * @business-logic-deferred: the case-3 answer Observation must not persist beyond the client session (mechanism deferred — #190); the recency lattice treats it as session-fresh
 */
define "Adult Age 18 Or Older":
  CFH.recencyAgeTruths(
    Last(
      (Rx501147MedicalPolicyLocalSource."Adult Age 18 Or Older") O
        where O.value is FHIR.boolean
        sort by (effective as FHIR.dateTime).value, id
    ),
    CRLCommon.AtLeast(CRLCommon.AgeAt(), 18 'years')
  )
