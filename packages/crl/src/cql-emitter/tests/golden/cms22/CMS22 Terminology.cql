library "CMS22 Terminology"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

valueset "Diagnosis of Hypertension": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.600.263'
valueset "Dietary Recommendations": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.600.1515'
valueset "Encounter to Screen for Blood Pressure": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.600.1920'
valueset "Finding of Elevated Blood Pressure or Hypertension": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1047.514'
valueset "Follow Up Within 4 Weeks": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1578'
valueset "Follow Up Within 6 Months": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1108.125'
valueset "Laboratory Tests for Hypertension": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.600.1482'
valueset "Lifestyle Recommendation": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1581'
valueset "Medical Reason": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1007'
valueset "Patient Declined": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1582'
valueset "Pharmacologic Therapy for Hypertension": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.1577'
valueset "Recommendation to Increase Physical Activity": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.600.1518'
valueset "Referral or Counseling for Alcohol Consumption": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1583'
valueset "Referral to Primary Care or Alternate Provider": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1580'
valueset "Weight Reduction Recommended": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.600.1510'
codesystem "Blood pressure panel with all children optional System": 'http://loinc.org'
code "Blood pressure panel with all children optional": '85354-9' from "Blood pressure panel with all children optional System"
codesystem "Systolic Blood Pressure Code System": 'http://loinc.org'
code "Systolic Blood Pressure Code": '8480-6' from "Systolic Blood Pressure Code System"
codesystem "Diastolic Blood Pressure Code System": 'http://loinc.org'
code "Diastolic Blood Pressure Code": '8462-4' from "Diastolic Blood Pressure Code System"
codesystem "EKG 12 Lead Panel Code System": 'http://loinc.org'
code "EKG 12 Lead Panel Code": '34534-8' from "EKG 12 Lead Panel Code System"
codesystem "EKG Study Code System": 'http://loinc.org'
code "EKG Study Code": '11524-6' from "EKG Study Code System"
codesystem "Virtual Encounter Class System": 'http://terminology.hl7.org/CodeSystem/v3-ActCode'
code "Virtual Encounter Class": 'VR' from "Virtual Encounter Class System"

context Patient
