library SemnotAge232FixtureInferences

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include SemnotAge232FixtureLocalPrimitives

context Patient

define "Under Age 21":
  not ("Age 21 Or Older")

define "Age 21 Or Older":
  CFH.recencyAgeSelected(
    Last(
      (SemnotAge232FixtureLocalPrimitives."Age 21 Or Older") O
        where O.value is FHIR.boolean
        sort by (effective as FHIR.dateTime).value, id
    ),
    CRLCommon.AtLeast(CRLCommon.AgeAt(), 21 'years')
  )
