library "CMS69 Asserted"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "CMS69 Terminology"

context Patient

define "Pregnancy or Other Related Diagnoses":
  [Condition: "CMS69 Terminology"."Pregnancy or Other Related Diagnoses"]

define "BMI Observations":
  [Observation: "CMS69 Terminology"."Body Mass Index Observations"]

define "Pregnancy Diagnoses":
  [Condition: "CMS69 Terminology"."Pregnancy or Other Related Diagnoses"]

define "Pregnancy Status Observations":
  [Observation: "CMS69 Terminology"."Pregnancy Status"]

define "Overweight or Obese Diagnoses":
  [Condition: "CMS69 Terminology"."Overweight or Obese"]

define "Underweight Diagnoses":
  [Condition: "CMS69 Terminology"."Underweight"]

define "Encounters to Evaluate BMI":
  [Encounter: "CMS69 Terminology"."Encounter to Evaluate BMI"]

define "Virtual Encounters":
  [Encounter: "CMS69 Terminology"."Virtual Encounter Class"]

define "High BMI Follow-up Service Requests":
  [ServiceRequest: "CMS69 Terminology"."Follow Up for Above Normal BMI"]

define "Low BMI Follow-up Service Requests":
  [ServiceRequest: "CMS69 Terminology"."Follow Up for Below Normal BMI"]

define "Weight Assessment Referrals":
  [ServiceRequest: "CMS69 Terminology"."Referrals Where Weight Assessment May Occur"]

define "High BMI Medications":
  [MedicationRequest: "CMS69 Terminology"."Medications for Above Normal BMI"]

define "Low BMI Medications":
  [MedicationRequest: "CMS69 Terminology"."Medications for Below Normal BMI"]

define "High BMI Follow-up Procedures":
  [Procedure: "CMS69 Terminology"."Follow Up for Above Normal BMI Procedures"]

define "Low BMI Follow-up Procedures":
  [Procedure: "CMS69 Terminology"."Follow Up for Below Normal BMI Procedures"]

define "Medical Reasons":
  [Observation: "CMS69 Terminology"."Medical Reason"]

define "Patient Declined Reasons":
  [Observation: "CMS69 Terminology"."Patient Declined"]
