library Cms69

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include Cms69Inferred

context Patient

define "Initial Population":
  Cms69Inferred."Aged 18+ at Measurement Period Start"

define "Denominator":
  "Initial Population"

define "Denominator Exclusions":
  Cms69Inferred."Is Pregnant During Measurement Period"

define "Numerator":
  Cms69Inferred."High BMI And Follow Up Provided" or Cms69Inferred."Low BMI And Follow Up Provided" or Cms69Inferred."Has Normal BMI"

define "Denominator Exceptions":
  Cms69Inferred."Medical Reason For Not Documenting A Follow Up Plan For Low Or High BMI" or Cms69Inferred."Medical Reason Or Patient Reason For Not Performing BMI Exam"
