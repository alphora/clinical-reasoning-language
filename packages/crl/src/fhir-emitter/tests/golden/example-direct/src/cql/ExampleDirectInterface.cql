library ExampleDirectInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include ExampleDirectLocalPrimitives

context Patient

define "Qualifying Diagnosis":
  ExampleDirectLocalPrimitives."Qualifying Diagnosis".asTruths().satisfied()
