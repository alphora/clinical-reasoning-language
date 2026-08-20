library Cms22

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include Cms22Inferred

context Patient

define "Initial Population":
  Cms22Inferred."Aged 18+ at Measurement Period Start"

define "Denominator":
  "Initial Population"

define "Denominator Exclusions":
  Cms22Inferred."Verified Hypertension As Of Qualifying Encounter"

define "Numerator":
  Cms22Inferred."Normal BP Reading" or Cms22Inferred."Elevated BP With Followup" or Cms22Inferred."First HTN With Followup" or Cms22Inferred."Second HTN 130s With Followup" or Cms22Inferred."Second HTN 140+ With Followup"

define "Denominator Exceptions":
  Cms22Inferred."BP Measurement Not Done With Reason" or Cms22Inferred."HTN Followup Declined By Patient"
