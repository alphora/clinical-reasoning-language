library ExampleForEmitInferred

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include ExampleForEmitLocalSource

context Patient

define "Implanted Estrogen Or Estradiol Pellets":
  ExampleForEmitLocalSource."Implanted Estrogen Pellets".asTruths()
    union ExampleForEmitLocalSource."Implanted Estradiol Pellets".asTruths()
