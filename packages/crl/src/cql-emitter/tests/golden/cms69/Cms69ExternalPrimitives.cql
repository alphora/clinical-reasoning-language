library Cms69ExternalPrimitives

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include Cms69ExternalConcepts

context Patient

define "Pregnancy or Other Related Diagnoses":
  [Condition: Cms69ExternalConcepts."Pregnancy or Other Related Diagnoses"]

define "BMI Observations":
  [Observation: Cms69ExternalConcepts."Body Mass Index Observations"]

define "Pregnancy Diagnoses":
  [Condition: Cms69ExternalConcepts."Pregnancy or Other Related Diagnoses"]

define "Pregnancy Status Observations":
  [Observation: Cms69ExternalConcepts."Pregnancy Status"]

define "Overweight or Obese Diagnoses":
  [Condition: Cms69ExternalConcepts."Overweight or Obese"]

define "Underweight Diagnoses":
  [Condition: Cms69ExternalConcepts."Underweight"]

define "Encounters to Evaluate BMI":
  [Encounter: Cms69ExternalConcepts."Encounter to Evaluate BMI"]

define "Virtual Encounters":
  [Encounter: Cms69ExternalConcepts."Virtual Encounter Class"]

define "High BMI Follow-up Service Requests":
  [ServiceRequest: Cms69ExternalConcepts."Follow Up for Above Normal BMI"]

define "Low BMI Follow-up Service Requests":
  [ServiceRequest: Cms69ExternalConcepts."Follow Up for Below Normal BMI"]

define "Weight Assessment Referrals":
  [ServiceRequest: Cms69ExternalConcepts."Referrals Where Weight Assessment May Occur"]

define "High BMI Medications":
  [MedicationRequest: Cms69ExternalConcepts."Medications for Above Normal BMI"]

define "Low BMI Medications":
  [MedicationRequest: Cms69ExternalConcepts."Medications for Below Normal BMI"]

define "High BMI Follow-up Procedures":
  [Procedure: Cms69ExternalConcepts."Follow Up for Above Normal BMI Procedures"]

define "Low BMI Follow-up Procedures":
  [Procedure: Cms69ExternalConcepts."Follow Up for Below Normal BMI Procedures"]

define "Medical Reasons":
  [Observation: Cms69ExternalConcepts."Medical Reason"]

define "Patient Declined Reasons":
  [Observation: Cms69ExternalConcepts."Patient Declined"]
