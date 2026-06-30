library cms69

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "cms69-Inferred"

context Patient

define "Initial Population":
  "cms69-Inferred"."Aged 18+ at Measurement Period Start"

define "Denominator":
  "Initial Population"

define "Denominator Exclusions":
  "cms69-Inferred"."Is Pregnant During Measurement Period"

define "Numerator":
  exists ("cms69-Inferred"."High BMI And Follow Up Provided")
    or exists ("cms69-Inferred"."Low BMI And Follow Up Provided")
    or exists ("cms69-Inferred"."Has Normal BMI")

define "Denominator Exceptions":
  exists ("cms69-Inferred"."Medical Reason For Not Documenting A Follow Up Plan For Low Or High BMI")
    or exists ("cms69-Inferred"."Medical Reason Or Patient Reason For Not Performing BMI Exam")
