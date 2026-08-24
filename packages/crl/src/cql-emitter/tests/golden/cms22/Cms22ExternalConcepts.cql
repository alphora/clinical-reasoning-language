library Cms22ExternalConcepts

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
valueset "Blood pressure panel with all children optional": 'http://hl7.org/fhir/us/cqfmeasures/crl/cms22/ValueSet/cms22-blood-pressure-panel-with-all-children-optional'
valueset "Systolic Blood Pressure Code": 'http://hl7.org/fhir/us/cqfmeasures/crl/cms22/ValueSet/cms22-systolic-blood-pressure-code'
valueset "Diastolic Blood Pressure Code": 'http://hl7.org/fhir/us/cqfmeasures/crl/cms22/ValueSet/cms22-diastolic-blood-pressure-code'
valueset "EKG 12 Lead Panel Code": 'http://hl7.org/fhir/us/cqfmeasures/crl/cms22/ValueSet/cms22-ekg-12-lead-panel-code'
valueset "EKG Study Code": 'http://hl7.org/fhir/us/cqfmeasures/crl/cms22/ValueSet/cms22-ekg-study-code'
valueset "Virtual Encounter Class": 'http://hl7.org/fhir/us/cqfmeasures/crl/cms22/ValueSet/cms22-virtual-encounter-class'

context Patient
