library Cms22Strategy

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

valueset "Blood Pressure Panels VS": 'http://loinc.org/vs/85354-9'
valueset "Standalone Systolic BP VS": 'http://loinc.org/vs/8480-6'
valueset "Standalone Diastolic BP VS": 'http://loinc.org/vs/8462-4'
valueset "Hypertension Diagnoses VS": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.600.263'
valueset "Antihypertensive Medications VS": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.1577'
valueset "Follow Up Within 4 Weeks VS": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1578'
valueset "Lifestyle Recommendation VS": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1581'
valueset "Antihypertensive Contraindication VS": 'urn:example:placeholder'
valueset "Medical Reason VS": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1007'
valueset "Patient Declined VS": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.526.3.1582'

context Patient

define "Blood Pressure Panels":
  [Observation: "Blood Pressure Panels VS"]

define "Standalone Systolic BP Observations":
  [Observation: "Standalone Systolic BP VS"]

define "Standalone Diastolic BP Observations":
  [Observation: "Standalone Diastolic BP VS"]

define "Hypertension Diagnoses":
  [Condition: "Hypertension Diagnoses VS"]

define "Hypertension Diagnoses Exists":
  exists ("Hypertension Diagnoses")

define "Antihypertensive Medications":
  [MedicationRequest: "Antihypertensive Medications VS"]

define "Follow-up Within 4 Weeks":
  [ServiceRequest: "Follow Up Within 4 Weeks VS"]

define "Lifestyle Recommendations":
  [ServiceRequest: "Lifestyle Recommendation VS"]

define "Antihypertensive Contraindication":
  [Observation: "Antihypertensive Contraindication VS"]

define "Medical Reasons":
  [Observation: "Medical Reason VS"]

define "Medical Reasons Exists":
  exists ("Medical Reasons")

define "Patient Declined Reasons":
  [Observation: "Patient Declined VS"]

define "Patient Declined Reasons Exists":
  exists ("Patient Declined Reasons")

define "BP Reading":
  "Blood Pressure Panels"
    union "Standalone Systolic BP Observations"
    union "Standalone Diastolic BP Observations"

define "Last BP Reading At This Encounter Selection":
  { CRLCommon.MostRecent("BP Reading") }

define "Last BP Reading At This Encounter":
  "Last BP Reading At This Encounter Selection"

define "Hypertensive Reading Without Diagnosis":
  "Has Hypertensive Reading" and not "Hypertension Diagnoses Exists"

define "Patient Eligible For BP Cognitive Support":
  not "Medical Reasons Exists" and not "Patient Declined Reasons Exists"

define "No BP Reading At This Encounter":
  Coalesce(CRLCommon.Without('documented', "BP Reading"), false)

define "Has Hypertensive Reading":
  Coalesce(CRLCommon.High("Last BP Reading At This Encounter"), false)

define "Has Normal Reading With Hypertension On File":
  "Has Normal Reading" and "Has Confirmed Hypertension Diagnosis"

define "Has Normal Reading":
  Coalesce(CRLCommon.Normal("Last BP Reading At This Encounter"), false)

define "Has Confirmed Hypertension Diagnosis":
  exists CRLCommon.Active("Hypertension Diagnoses")

define "Has Antihypertensive Contraindication":
  exists CRLCommon.Has("Antihypertensive Contraindication")
