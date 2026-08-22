library Cms22

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include Cms22Inferences

context Patient

define "Initial Population":
  Cms22Inferences."Aged 18+ at Measurement Period Start"

define "Denominator":
  "Initial Population"

define "Denominator Exclusions":
  Cms22Inferences."Verified Hypertension As Of Qualifying Encounter"

define "Numerator":
  Cms22Inferences."Normal BP Reading" or Cms22Inferences."Elevated BP With Followup" or Cms22Inferences."First HTN With Followup" or Cms22Inferences."Second HTN 130s With Followup" or Cms22Inferences."Second HTN 140+ With Followup"

define "Denominator Exceptions":
  Cms22Inferences."BP Measurement Not Done With Reason" or Cms22Inferences."HTN Followup Declined By Patient"
