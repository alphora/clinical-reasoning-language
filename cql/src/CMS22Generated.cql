library CMS22Generated version '0.1.0'

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLPatterns version '0.1.0' called CRLPatterns

valueset "Diagnosis of Hypertension": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.600.263'
valueset "Dietary Recommendations ValueSet": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.600.1515'
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
codesystem "Systolic Blood Pressure Code Code System": 'http://loinc.org'
code "Systolic Blood Pressure Code Code": '8480-6' from "Systolic Blood Pressure Code Code System"
codesystem "Diastolic Blood Pressure Code Code System": 'http://loinc.org'
code "Diastolic Blood Pressure Code Code": '8462-4' from "Diastolic Blood Pressure Code Code System"
codesystem "EKG 12 Lead Panel Code System": 'http://loinc.org'
code "EKG 12 Lead Panel Code": '34534-8' from "EKG 12 Lead Panel Code System"
codesystem "EKG Study Code System": 'http://loinc.org'
code "EKG Study Code": '11524-6' from "EKG Study Code System"
codesystem "Virtual Encounter Class System": 'http://terminology.hl7.org/CodeSystem/v3-ActCode'
code "Virtual Encounter Class": 'VR' from "Virtual Encounter Class System"

parameter "Measurement Period" Interval<DateTime>
  default Interval[@2024-01-01T00:00:00.000Z, @2025-01-01T00:00:00.000Z)

context Patient

define "BP Screening Encounters":
  [Encounter: "Encounter to Screen for Blood Pressure"]

define "Virtual Encounters":
  [Encounter: "Virtual Encounter Class"]

define "Hypertension Diagnoses":
  [Condition: "Diagnosis of Hypertension"]

define "Blood Pressure Panels":
  [Observation: "Blood pressure panel with all children optional"]

define "Systolic Blood Pressure Code":
  [Observation: "Systolic Blood Pressure Code Code"]

define "Diastolic Blood Pressure Code":
  [Observation: "Diastolic Blood Pressure Code Code"]

define "Standalone Systolic BP Observations":
  [Observation: "Systolic Blood Pressure Code Code"]

define "Standalone Diastolic BP Observations":
  [Observation: "Diastolic Blood Pressure Code Code"]

define "Follow-up Within 4 Weeks":
  [ServiceRequest: "Follow Up Within 4 Weeks"]

define "Follow-up Within 6 Months":
  [ServiceRequest: "Follow Up Within 6 Months"]

define "Lifestyle Recommendations":
  [ServiceRequest: "Lifestyle Recommendation"]

define "Weight Reduction Recommendations":
  [ServiceRequest: "Weight Reduction Recommended"]

define "Dietary Recommendations":
  [ServiceRequest: "Dietary Recommendations ValueSet"]

define "Physical Activity Recommendations":
  [ServiceRequest: "Recommendation to Increase Physical Activity"]

define "Alcohol Counseling Referrals":
  [ServiceRequest: "Referral or Counseling for Alcohol Consumption"]

define "Primary-Care Referrals":
  [ServiceRequest: "Referral to Primary Care or Alternate Provider"]

define "Hypertension Lab Tests":
  [ServiceRequest: "Laboratory Tests for Hypertension"]

define "EKG 12-Lead Panel Requests":
  [ServiceRequest: "EKG 12 Lead Panel Code"]

define "EKG Study Requests":
  [ServiceRequest: "EKG Study Code"]

define "Antihypertensive Medications":
  [MedicationRequest: "Pharmacologic Therapy for Hypertension"]

define "Hypertensive Reading Findings":
  [Observation: "Finding of Elevated Blood Pressure or Hypertension"]

define "Medical Reasons":
  [Observation: "Medical Reason"]

define "Patient Declined Reasons":
  [Observation: "Patient Declined"]

define "BP Evaluation Encounter (not virtual)":
  "BP Screening Encounters"
    except "Virtual Encounters"

define "BP Evaluation Encounter (not virtual) During MP":
  CRLPatterns.During("BP Evaluation Encounter (not virtual)", "Measurement Period")

define "BP Evaluation Encounter (not virtual) Performed":
  CRLPatterns.WasPerformed("BP Evaluation Encounter (not virtual)")

define "Qualifying Encounter":
  "BP Evaluation Encounter (not virtual) During MP"
    and "BP Evaluation Encounter (not virtual) Performed"

define "Systolic Code Component of BP Panels":
  CRLPatterns.ComponentOf("Blood Pressure Panels", "Systolic Blood Pressure Code")

define "Diastolic Code Component of BP Panels":
  CRLPatterns.ComponentOf("Blood Pressure Panels", "Diastolic Blood Pressure Code")

define "Systolic BP Reading":
  "Systolic Code Component of BP Panels"

define "Diastolic BP Reading":
  "Diastolic Code Component of BP Panels"

define "Last BP Panels On Qualifying Encounter Day":
  CRLPatterns.LastOf("Blood Pressure Panels", CRLPatterns.OnDayOf("Qualifying Encounter"))

define "Last BP Panel on Qualifying Encounter Day":
  "Last BP Panels On Qualifying Encounter Day"

define "Systolic Code Component of Last BP Panel On Encounter Day":
  CRLPatterns.ComponentOf("Last BP Panel on Qualifying Encounter Day", "Systolic Blood Pressure Code")

define "Diastolic Code Component of Last BP Panel On Encounter Day":
  CRLPatterns.ComponentOf("Last BP Panel on Qualifying Encounter Day", "Diastolic Blood Pressure Code")

define "Last Systolic on Qualifying Encounter Day":
  "Systolic Code Component of Last BP Panel On Encounter Day"

define "Last Diastolic on Qualifying Encounter Day":
  "Diastolic Code Component of Last BP Panel On Encounter Day"

define "Last Systolic Below 120":
  CRLPatterns.Below("Last Systolic on Qualifying Encounter Day", 120 'mm[Hg]')

define "Last Diastolic Below 80":
  CRLPatterns.Below("Last Diastolic on Qualifying Encounter Day", 80 'mm[Hg]')

define "Last Systolic Between 120 and 129":
  CRLPatterns.Between("Last Systolic on Qualifying Encounter Day", 120 'mm[Hg]', 129 'mm[Hg]')

define "Last Systolic At Least 130":
  CRLPatterns.AtLeast("Last Systolic on Qualifying Encounter Day", 130 'mm[Hg]')

define "Last Diastolic At Least 80":
  CRLPatterns.AtLeast("Last Diastolic on Qualifying Encounter Day", 80 'mm[Hg]')

define "Last Systolic Between 130 and 139":
  CRLPatterns.Between("Last Systolic on Qualifying Encounter Day", 130 'mm[Hg]', 139 'mm[Hg]')

define "Last Diastolic Between 80 and 89":
  CRLPatterns.Between("Last Diastolic on Qualifying Encounter Day", 80 'mm[Hg]', 89 'mm[Hg]')

define "Last Systolic At Least 140":
  CRLPatterns.AtLeast("Last Systolic on Qualifying Encounter Day", 140 'mm[Hg]')

define "Last Diastolic At Least 90":
  CRLPatterns.AtLeast("Last Diastolic on Qualifying Encounter Day", 90 'mm[Hg]')

define "Normal BP Reading":
  "Last Systolic Below 120"
    and "Last Diastolic Below 80"

define "Elevated BP Reading":
  "Last Systolic Between 120 and 129"
    and "Last Diastolic Below 80"

define "Hypertensive Reading":
  "Last Systolic At Least 130"
    or "Last Diastolic At Least 80"

define "Last BP Panels Within Year Prior To Qualifying Encounter":
  CRLPatterns.LastOf("Blood Pressure Panels", CRLPatterns.BeforeStartOf(1 'year', "Qualifying Encounter"))

define "Last BP Panel Within Year Prior to Qualifying Encounter":
  "Last BP Panels Within Year Prior To Qualifying Encounter"

define "Systolic Code Component of Prior-Year Last BP Panel":
  CRLPatterns.ComponentOf("Last BP Panel Within Year Prior to Qualifying Encounter", "Systolic Blood Pressure Code")

define "Diastolic Code Component of Prior-Year Last BP Panel":
  CRLPatterns.ComponentOf("Last BP Panel Within Year Prior to Qualifying Encounter", "Diastolic Blood Pressure Code")

define "Prior-Year Last Systolic":
  "Systolic Code Component of Prior-Year Last BP Panel"

define "Prior-Year Last Diastolic":
  "Diastolic Code Component of Prior-Year Last BP Panel"

define "Prior-Year Last Systolic At Least 130":
  CRLPatterns.AtLeast("Prior-Year Last Systolic", 130 'mm[Hg]')

define "Prior-Year Last Diastolic At Least 80":
  CRLPatterns.AtLeast("Prior-Year Last Diastolic", 80 'mm[Hg]')

define "Prior-Year Hypertensive Reading":
  "Prior-Year Last Systolic At Least 130"
    or "Prior-Year Last Diastolic At Least 80"

define "Without Record Of Prior-Year Hypertensive Reading":
  CRLPatterns.Without('record-of', "Prior-Year Hypertensive Reading")

define "First Hypertensive Reading":
  "Hypertensive Reading"
    and "Without Record Of Prior-Year Hypertensive Reading"

define "Second Hypertensive Reading 130s Body":
  ("Last Systolic Between 130 and 139"
    or "Last Diastolic Between 80 and 89")
    and not (("Last Systolic At Least 140"
    or "Last Diastolic At Least 90"))

define "Second Hypertensive Reading 130s":
  "Second Hypertensive Reading 130s Body"
    and "Prior-Year Hypertensive Reading"

define "Second Hypertensive Reading 140+ Body":
  "Last Systolic At Least 140"
    or "Last Diastolic At Least 90"

define "Second Hypertensive Reading 140+":
  "Second Hypertensive Reading 140+ Body"
    and "Prior-Year Hypertensive Reading"

define "Follow-up Within 4 Weeks Ordered":
  CRLPatterns.WasOrdered("Follow-up Within 4 Weeks")

define "Follow-up Within 6 Months Ordered":
  CRLPatterns.WasOrdered("Follow-up Within 6 Months")

define "Four-Week Rescreen Order":
  "Follow-up Within 4 Weeks Ordered"

define "Six-Month Rescreen Order":
  "Follow-up Within 6 Months Ordered"

define "Non-Pharmacological Recommendations":
  "Lifestyle Recommendations"
    union "Weight Reduction Recommendations"
    union "Dietary Recommendations"
    union "Physical Activity Recommendations"
    union "Alcohol Counseling Referrals"

define "Non-Pharmacological Recommendations Ordered":
  CRLPatterns.WasOrdered("Non-Pharmacological Recommendations")

define "Non-Pharmacological Recommendation Order":
  "Non-Pharmacological Recommendations Ordered"

define "Hypertension Lab or ECG Requests":
  "EKG 12-Lead Panel Requests"
    union "EKG Study Requests"
    union "Hypertension Lab Tests"

define "Hypertension Lab or ECG Requests Ordered":
  CRLPatterns.WasOrdered("Hypertension Lab or ECG Requests")

define "Hypertension Lab or ECG Order":
  "Hypertension Lab or ECG Requests Ordered"

define "Antihypertensive Medications Ordered":
  CRLPatterns.WasOrdered("Antihypertensive Medications")

define "Antihypertensive Medication Order":
  "Antihypertensive Medications Ordered"

define "Primary-Care Referral Justified by Hypertensive Reading":
  CRLPatterns.Justified("Primary-Care Referrals", "Hypertensive Reading Findings")

define "Primary-Care Referrals Ordered":
  CRLPatterns.WasOrdered("Primary-Care Referrals")

define "Referral for Hypertensive Reading":
  "Primary-Care Referral Justified by Hypertensive Reading"
    and "Primary-Care Referrals Ordered"

define "Six-Month Rescreen Order Same Day As Qualifying Encounter":
  CRLPatterns.SameDay("Six-Month Rescreen Order", "Qualifying Encounter")

define "Non-Pharm Recommendation Order Same Day As Qualifying Encounter":
  CRLPatterns.SameDay("Non-Pharmacological Recommendation Order", "Qualifying Encounter")

define "Referral for Hypertensive Reading Same Day As Qualifying Encounter":
  CRLPatterns.SameDay("Referral for Hypertensive Reading", "Qualifying Encounter")

define "Four-Week Rescreen Order Same Day As Qualifying Encounter":
  CRLPatterns.SameDay("Four-Week Rescreen Order", "Qualifying Encounter")

define "Hypertension Lab or ECG Order Same Day As Qualifying Encounter":
  CRLPatterns.SameDay("Hypertension Lab or ECG Order", "Qualifying Encounter")

define "Antihypertensive Medication Order Same Day As Qualifying Encounter":
  CRLPatterns.SameDay("Antihypertensive Medication Order", "Qualifying Encounter")

define "Elevated BP Followup Bundle":
  ("Six-Month Rescreen Order Same Day As Qualifying Encounter"
    and "Non-Pharm Recommendation Order Same Day As Qualifying Encounter")
    or "Referral for Hypertensive Reading Same Day As Qualifying Encounter"

define "First HTN Followup Bundle":
  ("Four-Week Rescreen Order Same Day As Qualifying Encounter"
    and "Non-Pharm Recommendation Order Same Day As Qualifying Encounter")
    or "Referral for Hypertensive Reading Same Day As Qualifying Encounter"

define "Second HTN 130s Followup Bundle":
  ("Six-Month Rescreen Order Same Day As Qualifying Encounter"
    and "Hypertension Lab or ECG Order Same Day As Qualifying Encounter"
    and "Non-Pharm Recommendation Order Same Day As Qualifying Encounter")
    or "Referral for Hypertensive Reading Same Day As Qualifying Encounter"

define "Second HTN 140+ Followup Bundle":
  ("Four-Week Rescreen Order Same Day As Qualifying Encounter"
    and "Hypertension Lab or ECG Order Same Day As Qualifying Encounter"
    and "Non-Pharm Recommendation Order Same Day As Qualifying Encounter"
    and "Antihypertensive Medication Order Same Day As Qualifying Encounter")
    or "Referral for Hypertensive Reading Same Day As Qualifying Encounter"

define "Elevated BP With Followup":
  "Elevated BP Reading"
    and "Elevated BP Followup Bundle"

define "First HTN With Followup":
  "First Hypertensive Reading"
    and "First HTN Followup Bundle"

define "Second HTN 130s With Followup":
  "Second Hypertensive Reading 130s"
    and "Second HTN 130s Followup Bundle"

define "Second HTN 140+ With Followup":
  "Second Hypertensive Reading 140+"
    and "Second HTN 140+ Followup Bundle"

define "Hypertension Diagnoses Is Verified":
  CRLPatterns.IsVerified("Hypertension Diagnoses")

define "Verified Hypertension":
  "Hypertension Diagnoses Is Verified"

define "Verified Hypertension As Of Qualifying Encounter Narrative":
  CRLPatterns.AsOf("Qualifying Encounter", "Verified Hypertension")

define "Verified Hypertension As Of Qualifying Encounter":
  "Verified Hypertension As Of Qualifying Encounter Narrative"

define "BP Measurement Sources":
  "Blood Pressure Panels"
    union "Standalone Systolic BP Observations"
    union "Standalone Diastolic BP Observations"

define "BP Measurement Sources Not Done With Reason":
  CRLPatterns.NotDoneWithReason("BP Measurement Sources", { "Medical Reasons", "Patient Declined Reasons" })

define "BP Measurement Sources Same Day As Qualifying Encounter":
  CRLPatterns.SameDay("BP Measurement Sources", "Qualifying Encounter")

define "BP Measurement Not Done With Reason":
  "BP Measurement Sources Not Done With Reason"
    and "BP Measurement Sources Same Day As Qualifying Encounter"

define "Follow-up Within 4 Weeks Declined by Patient":
  CRLPatterns.NotDoneWithReason("Follow-up Within 4 Weeks", "Patient Declined Reasons")

define "Follow-up Within 6 Months Declined by Patient":
  CRLPatterns.NotDoneWithReason("Follow-up Within 6 Months", "Patient Declined Reasons")

define "Primary-Care Referrals Declined by Patient":
  CRLPatterns.NotDoneWithReason("Primary-Care Referrals", "Patient Declined Reasons")

define "Non-Pharmacological Recommendations Declined by Patient":
  CRLPatterns.NotDoneWithReason("Non-Pharmacological Recommendations", "Patient Declined Reasons")

define "Hypertension Lab or ECG Requests Declined by Patient":
  CRLPatterns.NotDoneWithReason("Hypertension Lab or ECG Requests", "Patient Declined Reasons")

define "Antihypertensive Medications Declined by Patient":
  CRLPatterns.NotDoneWithReason("Antihypertensive Medications", "Patient Declined Reasons")

define "Four-Week Rescreen Declined":
  "Follow-up Within 4 Weeks Declined by Patient"

define "Six-Month Rescreen Declined":
  "Follow-up Within 6 Months Declined by Patient"

define "Primary-Care Referral Declined":
  "Primary-Care Referrals Declined by Patient"

define "Non-Pharm Recommendation Declined":
  "Non-Pharmacological Recommendations Declined by Patient"

define "Hypertension Lab or ECG Declined":
  "Hypertension Lab or ECG Requests Declined by Patient"

define "Antihypertensive Medication Declined":
  "Antihypertensive Medications Declined by Patient"

define "Primary-Care Referral Declined Same Day As Qualifying Encounter":
  CRLPatterns.SameDay("Primary-Care Referral Declined", "Qualifying Encounter")

define "Six-Month Rescreen Declined Same Day As Qualifying Encounter":
  CRLPatterns.SameDay("Six-Month Rescreen Declined", "Qualifying Encounter")

define "Non-Pharm Recommendation Declined Same Day As Qualifying Encounter":
  CRLPatterns.SameDay("Non-Pharm Recommendation Declined", "Qualifying Encounter")

define "Four-Week Rescreen Declined Same Day As Qualifying Encounter":
  CRLPatterns.SameDay("Four-Week Rescreen Declined", "Qualifying Encounter")

define "Hypertension Lab or ECG Declined Same Day As Qualifying Encounter":
  CRLPatterns.SameDay("Hypertension Lab or ECG Declined", "Qualifying Encounter")

define "Antihypertensive Medication Declined Same Day As Qualifying Encounter":
  CRLPatterns.SameDay("Antihypertensive Medication Declined", "Qualifying Encounter")

define "Elevated BP Declined Bundle":
  "Primary-Care Referral Declined Same Day As Qualifying Encounter"
    or "Six-Month Rescreen Declined Same Day As Qualifying Encounter"
    or "Non-Pharm Recommendation Declined Same Day As Qualifying Encounter"

define "First HTN Declined Bundle":
  "Four-Week Rescreen Declined Same Day As Qualifying Encounter"
    or "Primary-Care Referral Declined Same Day As Qualifying Encounter"
    or "Non-Pharm Recommendation Declined Same Day As Qualifying Encounter"

define "Second HTN 130s Declined Bundle":
  "Primary-Care Referral Declined Same Day As Qualifying Encounter"
    or "Six-Month Rescreen Declined Same Day As Qualifying Encounter"
    or "Hypertension Lab or ECG Declined Same Day As Qualifying Encounter"
    or "Non-Pharm Recommendation Declined Same Day As Qualifying Encounter"

define "Second HTN 140+ Declined Bundle":
  "Primary-Care Referral Declined Same Day As Qualifying Encounter"
    or "Four-Week Rescreen Declined Same Day As Qualifying Encounter"
    or "Antihypertensive Medication Declined Same Day As Qualifying Encounter"
    or "Hypertension Lab or ECG Declined Same Day As Qualifying Encounter"
    or "Non-Pharm Recommendation Declined Same Day As Qualifying Encounter"

define "Elevated BP With Declined Followup":
  "Elevated BP Reading"
    and "Elevated BP Declined Bundle"

define "First HTN With Declined Followup":
  "First Hypertensive Reading"
    and "First HTN Declined Bundle"

define "Second HTN 130s With Declined Followup":
  "Second Hypertensive Reading 130s"
    and "Second HTN 130s Declined Bundle"

define "Second HTN 140+ With Declined Followup":
  "Second Hypertensive Reading 140+"
    and "Second HTN 140+ Declined Bundle"

define "HTN Followup Declined By Patient":
  "Elevated BP With Declined Followup"
    or "First HTN With Declined Followup"
    or "Second HTN 130s With Declined Followup"
    or "Second HTN 140+ With Declined Followup"

define "Age At Start Of MP At Least 18 Years":
  CRLPatterns.AtLeast(CRLPatterns.AgeAt(CRLPatterns.StartOf("Measurement Period")), 18 'years')

define "Aged 18+ at Measurement Period Start":
  "Age At Start Of MP At Least 18 Years"

define "Initial Population":
  "Aged 18+ at Measurement Period Start"

define "Denominator":
  "Initial Population"

define "Denominator Exclusions":
  "Verified Hypertension As Of Qualifying Encounter"

define "Numerator":
  "Normal BP Reading"
    or "Elevated BP With Followup"
    or "First HTN With Followup"
    or "Second HTN 130s With Followup"
    or "Second HTN 140+ With Followup"

define "Denominator Exceptions":
  "BP Measurement Not Done With Reason"
    union "HTN Followup Declined By Patient"
