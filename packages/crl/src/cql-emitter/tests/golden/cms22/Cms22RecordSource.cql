library Cms22RecordSource

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include Cms22RecordConcepts

context Patient

define "BP Screening Encounters":
  [Encounter: Cms22RecordConcepts."Encounter to Screen for Blood Pressure"]

define "Virtual Encounters":
  [Encounter: Cms22RecordConcepts."Virtual Encounter Class"]

define "Hypertension Diagnoses":
  [Condition: Cms22RecordConcepts."Diagnosis of Hypertension"]

define "Blood Pressure Panels":
  [Observation: Cms22RecordConcepts."Blood pressure panel with all children optional"]

define "Systolic Blood Pressure Code":
  [Observation: Cms22RecordConcepts."Systolic Blood Pressure Code"]

define "Diastolic Blood Pressure Code":
  [Observation: Cms22RecordConcepts."Diastolic Blood Pressure Code"]

define "Standalone Systolic BP Observations":
  [Observation: Cms22RecordConcepts."Systolic Blood Pressure Code"]

define "Standalone Diastolic BP Observations":
  [Observation: Cms22RecordConcepts."Diastolic Blood Pressure Code"]

define "Follow-up Within 4 Weeks":
  [ServiceRequest: Cms22RecordConcepts."Follow Up Within 4 Weeks"]

define "Follow-up Within 6 Months":
  [ServiceRequest: Cms22RecordConcepts."Follow Up Within 6 Months"]

define "Lifestyle Recommendations":
  [ServiceRequest: Cms22RecordConcepts."Lifestyle Recommendation"]

define "Weight Reduction Recommendations":
  [ServiceRequest: Cms22RecordConcepts."Weight Reduction Recommended"]

define "Dietary Recommendations":
  [ServiceRequest: Cms22RecordConcepts."Dietary Recommendations"]

define "Physical Activity Recommendations":
  [ServiceRequest: Cms22RecordConcepts."Recommendation to Increase Physical Activity"]

define "Alcohol Counseling Referrals":
  [ServiceRequest: Cms22RecordConcepts."Referral or Counseling for Alcohol Consumption"]

define "Primary-Care Referrals":
  [ServiceRequest: Cms22RecordConcepts."Referral to Primary Care or Alternate Provider"]

define "Hypertension Lab Tests":
  [ServiceRequest: Cms22RecordConcepts."Laboratory Tests for Hypertension"]

define "EKG 12-Lead Panel Requests":
  [ServiceRequest: Cms22RecordConcepts."EKG 12 Lead Panel Code"]

define "EKG Study Requests":
  [ServiceRequest: Cms22RecordConcepts."EKG Study Code"]

define "Antihypertensive Medications":
  [MedicationRequest: Cms22RecordConcepts."Pharmacologic Therapy for Hypertension"]

define "Hypertensive Reading Findings":
  [Observation: Cms22RecordConcepts."Finding of Elevated Blood Pressure or Hypertension"]

define "Medical Reasons":
  [Observation: Cms22RecordConcepts."Medical Reason"]

define "Patient Declined Reasons":
  [Observation: Cms22RecordConcepts."Patient Declined"]
