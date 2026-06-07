library "CMS22 Asserted"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "CMS22 Terminology"

context Patient

define "BP Screening Encounters":
  [Encounter: "CMS22 Terminology"."Encounter to Screen for Blood Pressure"]

define "Virtual Encounters":
  [Encounter: "CMS22 Terminology"."Virtual Encounter Class"]

define "Hypertension Diagnoses":
  [Condition: "CMS22 Terminology"."Diagnosis of Hypertension"]

define "Blood Pressure Panels":
  [Observation: "CMS22 Terminology"."Blood pressure panel with all children optional"]

define "Systolic Blood Pressure Code":
  [Observation: "CMS22 Terminology"."Systolic Blood Pressure Code"]

define "Diastolic Blood Pressure Code":
  [Observation: "CMS22 Terminology"."Diastolic Blood Pressure Code"]

define "Standalone Systolic BP Observations":
  [Observation: "CMS22 Terminology"."Systolic Blood Pressure Code"]

define "Standalone Diastolic BP Observations":
  [Observation: "CMS22 Terminology"."Diastolic Blood Pressure Code"]

define "Follow-up Within 4 Weeks":
  [ServiceRequest: "CMS22 Terminology"."Follow Up Within 4 Weeks"]

define "Follow-up Within 6 Months":
  [ServiceRequest: "CMS22 Terminology"."Follow Up Within 6 Months"]

define "Lifestyle Recommendations":
  [ServiceRequest: "CMS22 Terminology"."Lifestyle Recommendation"]

define "Weight Reduction Recommendations":
  [ServiceRequest: "CMS22 Terminology"."Weight Reduction Recommended"]

define "Dietary Recommendations":
  [ServiceRequest: "CMS22 Terminology"."Dietary Recommendations"]

define "Physical Activity Recommendations":
  [ServiceRequest: "CMS22 Terminology"."Recommendation to Increase Physical Activity"]

define "Alcohol Counseling Referrals":
  [ServiceRequest: "CMS22 Terminology"."Referral or Counseling for Alcohol Consumption"]

define "Primary-Care Referrals":
  [ServiceRequest: "CMS22 Terminology"."Referral to Primary Care or Alternate Provider"]

define "Hypertension Lab Tests":
  [ServiceRequest: "CMS22 Terminology"."Laboratory Tests for Hypertension"]

define "EKG 12-Lead Panel Requests":
  [ServiceRequest: "CMS22 Terminology"."EKG 12 Lead Panel Code"]

define "EKG Study Requests":
  [ServiceRequest: "CMS22 Terminology"."EKG Study Code"]

define "Antihypertensive Medications":
  [MedicationRequest: "CMS22 Terminology"."Pharmacologic Therapy for Hypertension"]

define "Hypertensive Reading Findings":
  [Observation: "CMS22 Terminology"."Finding of Elevated Blood Pressure or Hypertension"]

define "Medical Reasons":
  [Observation: "CMS22 Terminology"."Medical Reason"]

define "Patient Declined Reasons":
  [Observation: "CMS22 Terminology"."Patient Declined"]
