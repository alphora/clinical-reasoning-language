library Cms22ExternalPrimitives

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include Cms22ExternalConcepts

context Patient

define "BP Screening Encounters":
  [Encounter: Cms22ExternalConcepts."Encounter to Screen for Blood Pressure"]

define "Virtual Encounters":
  [Encounter: Cms22ExternalConcepts."Virtual Encounter Class"]

define "Hypertension Diagnoses":
  [Condition: Cms22ExternalConcepts."Diagnosis of Hypertension"]

define "Blood Pressure Panels":
  [Observation: Cms22ExternalConcepts."Blood pressure panel with all children optional"]

define "Systolic Blood Pressure Code":
  [Observation: Cms22ExternalConcepts."Systolic Blood Pressure Code"]

define "Diastolic Blood Pressure Code":
  [Observation: Cms22ExternalConcepts."Diastolic Blood Pressure Code"]

define "Standalone Systolic BP Observations":
  [Observation: Cms22ExternalConcepts."Systolic Blood Pressure Code"]

define "Standalone Diastolic BP Observations":
  [Observation: Cms22ExternalConcepts."Diastolic Blood Pressure Code"]

define "Follow-up Within 4 Weeks":
  [ServiceRequest: Cms22ExternalConcepts."Follow Up Within 4 Weeks"]

define "Follow-up Within 6 Months":
  [ServiceRequest: Cms22ExternalConcepts."Follow Up Within 6 Months"]

define "Lifestyle Recommendations":
  [ServiceRequest: Cms22ExternalConcepts."Lifestyle Recommendation"]

define "Weight Reduction Recommendations":
  [ServiceRequest: Cms22ExternalConcepts."Weight Reduction Recommended"]

define "Dietary Recommendations":
  [ServiceRequest: Cms22ExternalConcepts."Dietary Recommendations"]

define "Physical Activity Recommendations":
  [ServiceRequest: Cms22ExternalConcepts."Recommendation to Increase Physical Activity"]

define "Alcohol Counseling Referrals":
  [ServiceRequest: Cms22ExternalConcepts."Referral or Counseling for Alcohol Consumption"]

define "Primary-Care Referrals":
  [ServiceRequest: Cms22ExternalConcepts."Referral to Primary Care or Alternate Provider"]

define "Hypertension Lab Tests":
  [ServiceRequest: Cms22ExternalConcepts."Laboratory Tests for Hypertension"]

define "EKG 12-Lead Panel Requests":
  [ServiceRequest: Cms22ExternalConcepts."EKG 12 Lead Panel Code"]

define "EKG Study Requests":
  [ServiceRequest: Cms22ExternalConcepts."EKG Study Code"]

define "Antihypertensive Medications":
  [MedicationRequest: Cms22ExternalConcepts."Pharmacologic Therapy for Hypertension"]

define "Hypertensive Reading Findings":
  [Observation: Cms22ExternalConcepts."Finding of Elevated Blood Pressure or Hypertension"]

define "Medical Reasons":
  [Observation: Cms22ExternalConcepts."Medical Reason"]

define "Patient Declined Reasons":
  [Observation: Cms22ExternalConcepts."Patient Declined"]
