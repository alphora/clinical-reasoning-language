library "cms22-RecordSource"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "cms22-RecordConcepts"

context Patient

define "BP Screening Encounters":
  [Encounter: "cms22-RecordConcepts"."Encounter to Screen for Blood Pressure"]

define "Virtual Encounters":
  [Encounter: "cms22-RecordConcepts"."Virtual Encounter Class"]

define "Hypertension Diagnoses":
  [Condition: "cms22-RecordConcepts"."Diagnosis of Hypertension"]

define "Blood Pressure Panels":
  [Observation: "cms22-RecordConcepts"."Blood pressure panel with all children optional"]

define "Systolic Blood Pressure Code":
  [Observation: "cms22-RecordConcepts"."Systolic Blood Pressure Code"]

define "Diastolic Blood Pressure Code":
  [Observation: "cms22-RecordConcepts"."Diastolic Blood Pressure Code"]

define "Standalone Systolic BP Observations":
  [Observation: "cms22-RecordConcepts"."Systolic Blood Pressure Code"]

define "Standalone Diastolic BP Observations":
  [Observation: "cms22-RecordConcepts"."Diastolic Blood Pressure Code"]

define "Follow-up Within 4 Weeks":
  [ServiceRequest: "cms22-RecordConcepts"."Follow Up Within 4 Weeks"]

define "Follow-up Within 6 Months":
  [ServiceRequest: "cms22-RecordConcepts"."Follow Up Within 6 Months"]

define "Lifestyle Recommendations":
  [ServiceRequest: "cms22-RecordConcepts"."Lifestyle Recommendation"]

define "Weight Reduction Recommendations":
  [ServiceRequest: "cms22-RecordConcepts"."Weight Reduction Recommended"]

define "Dietary Recommendations":
  [ServiceRequest: "cms22-RecordConcepts"."Dietary Recommendations"]

define "Physical Activity Recommendations":
  [ServiceRequest: "cms22-RecordConcepts"."Recommendation to Increase Physical Activity"]

define "Alcohol Counseling Referrals":
  [ServiceRequest: "cms22-RecordConcepts"."Referral or Counseling for Alcohol Consumption"]

define "Primary-Care Referrals":
  [ServiceRequest: "cms22-RecordConcepts"."Referral to Primary Care or Alternate Provider"]

define "Hypertension Lab Tests":
  [ServiceRequest: "cms22-RecordConcepts"."Laboratory Tests for Hypertension"]

define "EKG 12-Lead Panel Requests":
  [ServiceRequest: "cms22-RecordConcepts"."EKG 12 Lead Panel Code"]

define "EKG Study Requests":
  [ServiceRequest: "cms22-RecordConcepts"."EKG Study Code"]

define "Antihypertensive Medications":
  [MedicationRequest: "cms22-RecordConcepts"."Pharmacologic Therapy for Hypertension"]

define "Hypertensive Reading Findings":
  [Observation: "cms22-RecordConcepts"."Finding of Elevated Blood Pressure or Hypertension"]

define "Medical Reasons":
  [Observation: "cms22-RecordConcepts"."Medical Reason"]

define "Patient Declined Reasons":
  [Observation: "cms22-RecordConcepts"."Patient Declined"]
