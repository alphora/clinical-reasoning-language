library ExampleBothrepInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include ExampleBothrepInferences

context Patient

define "Implanted Estrogen Or Estradiol Pellets":
  ExampleBothrepInferences."Implanted Estrogen Or Estradiol Pellets".satisfied()
