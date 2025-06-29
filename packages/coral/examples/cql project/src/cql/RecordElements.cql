library RecordElements

using FHIR version '4.0.1'

include FHIRHelpers 
include FHIRCommon called FC
include RecordConcepts called RecordConcepts

context Patient


define "Height":
  [Observation: RecordConcepts."Height"]

define "Weight":
  [Observation: RecordConcepts."Weight"]

define "BMI":
  [Observation: RecordConcepts."BMI"]
