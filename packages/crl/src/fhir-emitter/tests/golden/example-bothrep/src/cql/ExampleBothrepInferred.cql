library ExampleBothrepInferred

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include ExampleBothrepLocalSource

context Patient

define "Implanted Estrogen Or Estradiol Pellets":
  ExampleBothrepLocalSource."Implanted Estrogen Or Estradiol Pellets".asTruths()
    union (
      ExampleBothrepLocalSource."Implanted Estrogen Pellets".asTruths()
        union ExampleBothrepLocalSource."Implanted Estradiol Pellets".asTruths()
    )
