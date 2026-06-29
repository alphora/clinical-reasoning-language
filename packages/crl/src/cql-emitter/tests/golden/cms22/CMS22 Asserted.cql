library "CMS22 Asserted"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "CMS22 Concepts"

context Patient

define "BP Screening Encounters":
  [Encounter: "CMS22 Concepts"."Encounter to Screen for Blood Pressure"]

define "Virtual Encounters":
  [Encounter: "CMS22 Concepts"."Virtual Encounter Class"]

define "Hypertension Diagnoses":
  [Condition: "CMS22 Concepts"."Diagnosis of Hypertension"]

define "Blood Pressure Panels":
  [Observation: "CMS22 Concepts"."Blood pressure panel with all children optional"]

define "Systolic Blood Pressure Code":
  [Observation: "CMS22 Concepts"."Systolic Blood Pressure Code"]

define "Diastolic Blood Pressure Code":
  [Observation: "CMS22 Concepts"."Diastolic Blood Pressure Code"]

define "Standalone Systolic BP Observations":
  [Observation: "CMS22 Concepts"."Systolic Blood Pressure Code"]

define "Standalone Diastolic BP Observations":
  [Observation: "CMS22 Concepts"."Diastolic Blood Pressure Code"]

define "Follow-up Within 4 Weeks":
  [ServiceRequest: "CMS22 Concepts"."Follow Up Within 4 Weeks"]

define "Follow-up Within 6 Months":
  [ServiceRequest: "CMS22 Concepts"."Follow Up Within 6 Months"]

define "Lifestyle Recommendations":
  [ServiceRequest: "CMS22 Concepts"."Lifestyle Recommendation"]

define "Weight Reduction Recommendations":
  [ServiceRequest: "CMS22 Concepts"."Weight Reduction Recommended"]

define "Dietary Recommendations":
  [ServiceRequest: "CMS22 Concepts"."Dietary Recommendations"]

define "Physical Activity Recommendations":
  [ServiceRequest: "CMS22 Concepts"."Recommendation to Increase Physical Activity"]

define "Alcohol Counseling Referrals":
  [ServiceRequest: "CMS22 Concepts"."Referral or Counseling for Alcohol Consumption"]

define "Primary-Care Referrals":
  [ServiceRequest: "CMS22 Concepts"."Referral to Primary Care or Alternate Provider"]

define "Hypertension Lab Tests":
  [ServiceRequest: "CMS22 Concepts"."Laboratory Tests for Hypertension"]

define "EKG 12-Lead Panel Requests":
  [ServiceRequest: "CMS22 Concepts"."EKG 12 Lead Panel Code"]

define "EKG Study Requests":
  [ServiceRequest: "CMS22 Concepts"."EKG Study Code"]

define "Antihypertensive Medications":
  [MedicationRequest: "CMS22 Concepts"."Pharmacologic Therapy for Hypertension"]

define "Hypertensive Reading Findings":
  [Observation: "CMS22 Concepts"."Finding of Elevated Blood Pressure or Hypertension"]

define "Medical Reasons":
  [Observation: "CMS22 Concepts"."Medical Reason"]

define "Patient Declined Reasons":
  [Observation: "CMS22 Concepts"."Patient Declined"]
