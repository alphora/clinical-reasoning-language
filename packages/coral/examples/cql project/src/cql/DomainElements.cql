library DomainElements

using FHIR version '4.0.1'

include FHIRHelpers 
include FHIRCommon called FC
include DomainConcepts called DomainConcepts

context Patient


define "Most Recent Height":
  [Observation: DomainConcepts."Most Recent Height Code"]

define "Most Recent Weight":
  [Observation: DomainConcepts."Most Recent Weight Code"]

define "Most Recent BMI":
  [Observation: DomainConcepts."Most Recent BMI Code"]
