library SemnotAge232FixtureInferred

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include SemnotAge232FixtureLocalSource

context Patient

define "Under Age 21":
  not ("Age 21 Or Older")

define "Age 21 Or Older":
  Coalesce(
    CFH.recencyAgeSelected(
      Last(
        (SemnotAge232FixtureLocalSource."Age 21 Or Older") O
          where O.value is FHIR.boolean
          sort by (effective as FHIR.dateTime).value, id
      ),
      CRLCommon.AtLeast(CRLCommon.AgeAt(), 21 'years')
    ),
    false
  )
