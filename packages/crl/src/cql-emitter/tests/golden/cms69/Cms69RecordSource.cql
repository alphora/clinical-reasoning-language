library Cms69RecordSource

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include Cms69RecordConcepts

context Patient

define "Pregnancy or Other Related Diagnoses":
  [Condition: Cms69RecordConcepts."Pregnancy or Other Related Diagnoses"]

define "BMI Observations":
  [Observation: Cms69RecordConcepts."Body Mass Index Observations"]

define "Pregnancy Diagnoses":
  [Condition: Cms69RecordConcepts."Pregnancy or Other Related Diagnoses"]

define "Pregnancy Status Observations":
  [Observation: Cms69RecordConcepts."Pregnancy Status"]

define "Overweight or Obese Diagnoses":
  [Condition: Cms69RecordConcepts."Overweight or Obese"]

define "Underweight Diagnoses":
  [Condition: Cms69RecordConcepts."Underweight"]

define "Encounters to Evaluate BMI":
  [Encounter: Cms69RecordConcepts."Encounter to Evaluate BMI"]

define "Virtual Encounters":
  [Encounter: Cms69RecordConcepts."Virtual Encounter Class"]

define "High BMI Follow-up Service Requests":
  [ServiceRequest: Cms69RecordConcepts."Follow Up for Above Normal BMI"]

define "Low BMI Follow-up Service Requests":
  [ServiceRequest: Cms69RecordConcepts."Follow Up for Below Normal BMI"]

define "Weight Assessment Referrals":
  [ServiceRequest: Cms69RecordConcepts."Referrals Where Weight Assessment May Occur"]

define "High BMI Medications":
  [MedicationRequest: Cms69RecordConcepts."Medications for Above Normal BMI"]

define "Low BMI Medications":
  [MedicationRequest: Cms69RecordConcepts."Medications for Below Normal BMI"]

define "High BMI Follow-up Procedures":
  [Procedure: Cms69RecordConcepts."Follow Up for Above Normal BMI Procedures"]

define "Low BMI Follow-up Procedures":
  [Procedure: Cms69RecordConcepts."Follow Up for Below Normal BMI Procedures"]

define "Medical Reasons":
  [Observation: Cms69RecordConcepts."Medical Reason"]

define "Patient Declined Reasons":
  [Observation: Cms69RecordConcepts."Patient Declined"]
