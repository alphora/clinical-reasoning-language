library Interface

using FHIR version '4.0.1'

include FHIRHelpers 
include FHIRCommon called FC
include CaseFeatureCommon called CFC
include Inferred called Inferred

context Patient


define "Normalized Most Recent Height":
  { Inferred."Most Recent Record Elements Domain Height", Inferred."Most Recent Domain Height" }

define "Most Recent Height":
  CFC.MostRecent("Normalized Most Recent Height")

define "Normalized Most Recent Weight":
  { Inferred."Most Recent Record Elements Domain Weight", Inferred."Most Recent Domain Weight" }

define "Most Recent Weight":
  CFC.MostRecent("Normalized Most Recent Weight")
