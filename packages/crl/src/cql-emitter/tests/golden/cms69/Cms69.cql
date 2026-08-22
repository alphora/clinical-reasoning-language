library Cms69

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include Cms69Inferences

context Patient

define "Initial Population":
  Cms69Inferences."Aged 18+ at Measurement Period Start"

define "Denominator":
  "Initial Population"

define "Denominator Exclusions":
  Cms69Inferences."Is Pregnant During Measurement Period"

define "Numerator":
  Cms69Inferences."High BMI And Follow Up Provided" or Cms69Inferences."Low BMI And Follow Up Provided" or Cms69Inferences."Has Normal BMI"

define "Denominator Exceptions":
  Cms69Inferences."Medical Reason For Not Documenting A Follow Up Plan For Low Or High BMI" or Cms69Inferences."Medical Reason Or Patient Reason For Not Performing BMI Exam"
