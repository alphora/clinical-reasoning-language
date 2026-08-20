library Cms69Strategy

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

valueset "BMI Range as a Condition ValueSet": 'urn:example:placeholder'
valueset "BMI as an Observation ValueSet": 'BMI as an Observation'
valueset "Height Valueset": 'height valueset'
valueset "Weight Valueset": 'weight valueset'
valueset "Overweight or Obese Diagnoses VS": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1047.502'
valueset "Underweight Diagnoses VS": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1563'
valueset "Pregnancy Diagnoses VS": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.600.1.1623'
valueset "Weight Assessment Referrals VS": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.600.1.1527'
valueset "Anti-Obesity Medications VS": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1561'
valueset "Low BMI Follow-up Service Requests VS": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.600.1.1528'
valueset "Medical Reason VS": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1007'
valueset "Patient Declined VS": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1582'
valueset "Anti-Obesity Contraindication VS": 'urn:example:placeholder'
codesystem "Colonoscopy System": 'http://snomed.info/sct'
code "Colonoscopy": '73761001' from "Colonoscopy System"

context Patient

define "BMI Range as a Condition":
  [Condition: "BMI Range as a Condition ValueSet"]

define "BMI as an Observation":
  [Observation: "BMI as an Observation ValueSet"]

define "Patient Height":
  [Observation: "Height Valueset"]

define "Patient Weight":
  [Observation: "Weight Valueset"]

define "Overweight or Obese Diagnoses":
  [Condition: "Overweight or Obese Diagnoses VS"]

define "Underweight Diagnoses":
  [Condition: "Underweight Diagnoses VS"]

define "Pregnancy Diagnoses":
  [Condition: "Pregnancy Diagnoses VS"]

define "Pregnancy Diagnoses Exists":
  exists ("Pregnancy Diagnoses")

define "Weight Assessment Referrals":
  [ServiceRequest: "Weight Assessment Referrals VS"]

define "Anti-Obesity Medications":
  [MedicationRequest: "Anti-Obesity Medications VS"]

define "Low BMI Follow-up Service Requests":
  [ServiceRequest: "Low BMI Follow-up Service Requests VS"]

define "Medical Reasons":
  [Observation: "Medical Reason VS"]

define "Medical Reasons Exists":
  exists ("Medical Reasons")

define "Patient Declined Reasons":
  [Observation: "Patient Declined VS"]

define "Patient Declined Reasons Exists":
  exists ("Patient Declined Reasons")

define "Anti-Obesity Medication Contraindication":
  [Observation: "Anti-Obesity Contraindication VS"]

define "BMI":
  "BMI Range as a Condition"
    union "BMI as an Observation"
    union "Calculated BMI"

define "Most Recent BMI Selection":
  { CRLCommon.MostRecent("BMI") }

define "Most Recent BMI":
  "Most Recent BMI Selection"

define "Calculated BMI":
  "Patient Height"
    intersect "Patient Weight"

define "BMI With Confirmed Height-Weight Source":
  "Calculated BMI"
    except "BMI Range as a Condition"

define "Patient Eligible For BMI Screening":
  not "Pregnancy Diagnoses Exists" and not "Medical Reasons Exists" and not "Patient Declined Reasons Exists"

define "BMI Not Documented During Measurement Period":
  Coalesce(CRLCommon.Without('documented', "BMI"), false)

define "Has Documented High BMI":
  Coalesce(CRLCommon.High("BMI"), false)

define "Has Documented Low BMI":
  Coalesce(CRLCommon.Low("BMI"), false)

define "Patient Has Overweight or Obese Diagnosis":
  exists CRLCommon.Active("Overweight or Obese Diagnoses")

define "Patient Has Underweight Diagnosis":
  exists CRLCommon.Active("Underweight Diagnoses")

define "Has Anti-Obesity Medication Contraindication":
  exists CRLCommon.Has("Anti-Obesity Medication Contraindication")
