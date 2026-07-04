library ExampleDirectLocalSource

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include ExampleDirectLocalConcepts

context Patient

define "Qualifying Diagnosis":
  [Observation: ExampleDirectLocalConcepts."Qualifying Diagnosis"]
