library DerivedInterface

using FHIR version '4.0.1'

include FHIRHelpers 
include FHIRCommon called FC
include CaseFeatureCommon called CFC
include DerivedInferred called DerivedInferred

context Patient

define "Normalized Most Recent BMI":
  { 
    DerivedInferred."Most Recent Record Elements BMI",
    DerivedInferred."Most Recent Record Elements Domain BMI",
    DerivedInferred."Most Recent Derived BMI"
  }

define "Most Recent BMI":
  CFC.MostRecent("Normalized Most Recent BMI")
