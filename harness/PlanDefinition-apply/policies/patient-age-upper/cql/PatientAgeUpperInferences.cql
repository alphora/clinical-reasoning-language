library PatientAgeUpperInferences

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include PatientAgeUpperLocalPrimitives

context Patient

define "Under Twenty One":
  CFH.recencyAgeTruths(
    Last(
      (PatientAgeUpperLocalPrimitives."Under Twenty One") O
        where O.value is FHIR.boolean
        sort by (effective as FHIR.dateTime).value, id
    ),
    CRLCommon.Below(CRLCommon.AgeAt(), 21 'years')
  )

define "At Most Twenty One":
  CFH.recencyAgeTruths(
    Last(
      (PatientAgeUpperLocalPrimitives."At Most Twenty One") O
        where O.value is FHIR.boolean
        sort by (effective as FHIR.dateTime).value, id
    ),
    CRLCommon.AtMost(CRLCommon.AgeAt(), 21 'years')
  )
