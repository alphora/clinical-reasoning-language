library ExampleForEmitInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include ExampleForEmitInferences

context Patient

define "Implanted Estrogen Or Estradiol Pellets":
  ExampleForEmitInferences."Implanted Estrogen Or Estradiol Pellets".satisfied()
