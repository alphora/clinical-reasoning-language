library "CMS69 Asserted"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "CMS69 Concepts"

context Patient

define "Pregnancy or Other Related Diagnoses":
  [Condition: "CMS69 Concepts"."Pregnancy or Other Related Diagnoses"]

define "BMI Observations":
  [Observation: "CMS69 Concepts"."Body Mass Index Observations"]

define "Pregnancy Diagnoses":
  [Condition: "CMS69 Concepts"."Pregnancy or Other Related Diagnoses"]

define "Pregnancy Status Observations":
  [Observation: "CMS69 Concepts"."Pregnancy Status"]

define "Overweight or Obese Diagnoses":
  [Condition: "CMS69 Concepts"."Overweight or Obese"]

define "Underweight Diagnoses":
  [Condition: "CMS69 Concepts"."Underweight"]

define "Encounters to Evaluate BMI":
  [Encounter: "CMS69 Concepts"."Encounter to Evaluate BMI"]

define "Virtual Encounters":
  [Encounter: "CMS69 Concepts"."Virtual Encounter Class"]

define "High BMI Follow-up Service Requests":
  [ServiceRequest: "CMS69 Concepts"."Follow Up for Above Normal BMI"]

define "Low BMI Follow-up Service Requests":
  [ServiceRequest: "CMS69 Concepts"."Follow Up for Below Normal BMI"]

define "Weight Assessment Referrals":
  [ServiceRequest: "CMS69 Concepts"."Referrals Where Weight Assessment May Occur"]

define "High BMI Medications":
  [MedicationRequest: "CMS69 Concepts"."Medications for Above Normal BMI"]

define "Low BMI Medications":
  [MedicationRequest: "CMS69 Concepts"."Medications for Below Normal BMI"]

define "High BMI Follow-up Procedures":
  [Procedure: "CMS69 Concepts"."Follow Up for Above Normal BMI Procedures"]

define "Low BMI Follow-up Procedures":
  [Procedure: "CMS69 Concepts"."Follow Up for Below Normal BMI Procedures"]

define "Medical Reasons":
  [Observation: "CMS69 Concepts"."Medical Reason"]

define "Patient Declined Reasons":
  [Observation: "CMS69 Concepts"."Patient Declined"]
