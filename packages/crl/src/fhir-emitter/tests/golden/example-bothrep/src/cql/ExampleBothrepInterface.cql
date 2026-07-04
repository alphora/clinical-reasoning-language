library ExampleBothrepInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include ExampleBothrepInferred

context Patient

define "Implanted Estrogen Or Estradiol Pellets":
  ExampleBothrepInferred."Implanted Estrogen Or Estradiol Pellets".satisfied()
