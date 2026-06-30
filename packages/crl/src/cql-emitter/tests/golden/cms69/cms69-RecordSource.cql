library "cms69-RecordSource"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "cms69-RecordConcepts"

context Patient

define "Pregnancy or Other Related Diagnoses":
  [Condition: "cms69-RecordConcepts"."Pregnancy or Other Related Diagnoses"]

define "BMI Observations":
  [Observation: "cms69-RecordConcepts"."Body Mass Index Observations"]

define "Pregnancy Diagnoses":
  [Condition: "cms69-RecordConcepts"."Pregnancy or Other Related Diagnoses"]

define "Pregnancy Status Observations":
  [Observation: "cms69-RecordConcepts"."Pregnancy Status"]

define "Overweight or Obese Diagnoses":
  [Condition: "cms69-RecordConcepts"."Overweight or Obese"]

define "Underweight Diagnoses":
  [Condition: "cms69-RecordConcepts"."Underweight"]

define "Encounters to Evaluate BMI":
  [Encounter: "cms69-RecordConcepts"."Encounter to Evaluate BMI"]

define "Virtual Encounters":
  [Encounter: "cms69-RecordConcepts"."Virtual Encounter Class"]

define "High BMI Follow-up Service Requests":
  [ServiceRequest: "cms69-RecordConcepts"."Follow Up for Above Normal BMI"]

define "Low BMI Follow-up Service Requests":
  [ServiceRequest: "cms69-RecordConcepts"."Follow Up for Below Normal BMI"]

define "Weight Assessment Referrals":
  [ServiceRequest: "cms69-RecordConcepts"."Referrals Where Weight Assessment May Occur"]

define "High BMI Medications":
  [MedicationRequest: "cms69-RecordConcepts"."Medications for Above Normal BMI"]

define "Low BMI Medications":
  [MedicationRequest: "cms69-RecordConcepts"."Medications for Below Normal BMI"]

define "High BMI Follow-up Procedures":
  [Procedure: "cms69-RecordConcepts"."Follow Up for Above Normal BMI Procedures"]

define "Low BMI Follow-up Procedures":
  [Procedure: "cms69-RecordConcepts"."Follow Up for Below Normal BMI Procedures"]

define "Medical Reasons":
  [Observation: "cms69-RecordConcepts"."Medical Reason"]

define "Patient Declined Reasons":
  [Observation: "cms69-RecordConcepts"."Patient Declined"]
