library SemnotAge232FixtureExternalElements

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

context Patient

define "Age 21 Or Older Source 1":
  ([Patient] P where P.id.value = Patient.id.value)
