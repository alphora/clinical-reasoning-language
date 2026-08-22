library Cms69ExternalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

valueset "Encounter to Evaluate BMI": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.600.1.1751'
valueset "Follow Up for Above Normal BMI": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.600.1.1525'
valueset "Follow Up for Below Normal BMI": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.600.1.1528'
valueset "Medical Reason": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1007'
valueset "Medications for Above Normal BMI": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1561'
valueset "Medications for Below Normal BMI": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1562'
valueset "Overweight or Obese": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1047.502'
valueset "Patient Declined": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1582'
valueset "Pregnancy or Other Related Diagnoses": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.600.1.1623'
valueset "Referrals Where Weight Assessment May Occur": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.600.1.1527'
valueset "Underweight": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1563'
valueset "Body Mass Index Observations": ''
codesystem "Virtual Encounter Class System": 'http://terminology.hl7.org/CodeSystem/v3-ActCode'
code "Virtual Encounter Class": 'VR' from "Virtual Encounter Class System"
valueset "Pregnancy Status": ''
valueset "Follow Up for Above Normal BMI Procedures": ''
valueset "Follow Up for Below Normal BMI Procedures": ''

context Patient
