library cms22

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "cms22-Inferred"

context Patient

define "Initial Population":
  "cms22-Inferred"."Aged 18+ at Measurement Period Start"

define "Denominator":
  "Initial Population"

define "Denominator Exclusions":
  "cms22-Inferred"."Verified Hypertension As Of Qualifying Encounter"

define "Numerator":
  exists ("cms22-Inferred"."Normal BP Reading")
    or exists ("cms22-Inferred"."Elevated BP With Followup")
    or exists ("cms22-Inferred"."First HTN With Followup")
    or exists ("cms22-Inferred"."Second HTN 130s With Followup")
    or exists ("cms22-Inferred"."Second HTN 140+ With Followup")

define "Denominator Exceptions":
  exists ("cms22-Inferred"."BP Measurement Not Done With Reason")
    or exists ("cms22-Inferred"."HTN Followup Declined By Patient")
