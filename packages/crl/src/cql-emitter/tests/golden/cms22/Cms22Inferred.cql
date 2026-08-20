library Cms22Inferred

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include Cms22RecordSource

parameter "Measurement Period" Interval<DateTime>

context Patient

define "BP Evaluation Encounter (not virtual)":
  Cms22RecordSource."BP Screening Encounters"
    except Cms22RecordSource."Virtual Encounters"

define "BP Evaluation Encounter (not virtual) During MP":
  CRLCommon.During("BP Evaluation Encounter (not virtual)", "Measurement Period")

define "BP Evaluation Encounter (not virtual) Performed":
  CRLCommon.WasPerformed("BP Evaluation Encounter (not virtual)")

define "Qualifying Encounter":
  "BP Evaluation Encounter (not virtual) During MP"
    intersect "BP Evaluation Encounter (not virtual) Performed"

define "Systolic Code Component of BP Panels":
  CRLCommon.ComponentOf(Cms22RecordSource."Blood Pressure Panels", Cms22RecordSource."Systolic Blood Pressure Code")

define "Diastolic Code Component of BP Panels":
  CRLCommon.ComponentOf(Cms22RecordSource."Blood Pressure Panels", Cms22RecordSource."Diastolic Blood Pressure Code")

define "Systolic BP Reading":
  "Systolic Code Component of BP Panels"

define "Diastolic BP Reading":
  "Diastolic Code Component of BP Panels"

define "Last BP Panels On Qualifying Encounter Day":
  { CRLCommon.LastOf(Cms22RecordSource."Blood Pressure Panels", CRLCommon.OnDayOf("Qualifying Encounter")) }

define "Last BP Panel on Qualifying Encounter Day":
  "Last BP Panels On Qualifying Encounter Day"

define "Systolic Code Component of Last BP Panel On Encounter Day":
  CRLCommon.ComponentOf("Last BP Panel on Qualifying Encounter Day", Cms22RecordSource."Systolic Blood Pressure Code")

define "Diastolic Code Component of Last BP Panel On Encounter Day":
  CRLCommon.ComponentOf("Last BP Panel on Qualifying Encounter Day", Cms22RecordSource."Diastolic Blood Pressure Code")

define "Last Systolic on Qualifying Encounter Day":
  "Systolic Code Component of Last BP Panel On Encounter Day"

define "Last Diastolic on Qualifying Encounter Day":
  "Diastolic Code Component of Last BP Panel On Encounter Day"

define "Last Systolic Below 120":
  Coalesce(CRLCommon.Below("Last Systolic on Qualifying Encounter Day", 120 'mm[Hg]'), false)

define "Last Diastolic Below 80":
  Coalesce(CRLCommon.Below("Last Diastolic on Qualifying Encounter Day", 80 'mm[Hg]'), false)

define "Last Systolic Between 120 and 129":
  Coalesce(CRLCommon.Between("Last Systolic on Qualifying Encounter Day", 120 'mm[Hg]', 129 'mm[Hg]'), false)

define "Last Systolic At Least 130":
  Coalesce(CRLCommon.AtLeast("Last Systolic on Qualifying Encounter Day", 130 'mm[Hg]'), false)

define "Last Diastolic At Least 80":
  Coalesce(CRLCommon.AtLeast("Last Diastolic on Qualifying Encounter Day", 80 'mm[Hg]'), false)

define "Last Systolic Between 130 and 139":
  Coalesce(CRLCommon.Between("Last Systolic on Qualifying Encounter Day", 130 'mm[Hg]', 139 'mm[Hg]'), false)

define "Last Diastolic Between 80 and 89":
  Coalesce(CRLCommon.Between("Last Diastolic on Qualifying Encounter Day", 80 'mm[Hg]', 89 'mm[Hg]'), false)

define "Last Systolic At Least 140":
  Coalesce(CRLCommon.AtLeast("Last Systolic on Qualifying Encounter Day", 140 'mm[Hg]'), false)

define "Last Diastolic At Least 90":
  Coalesce(CRLCommon.AtLeast("Last Diastolic on Qualifying Encounter Day", 90 'mm[Hg]'), false)

define "Normal BP Reading":
  "Last Systolic Below 120" and "Last Diastolic Below 80"

define "Elevated BP Reading":
  "Last Systolic Between 120 and 129" and "Last Diastolic Below 80"

define "Hypertensive Reading":
  "Last Systolic At Least 130" or "Last Diastolic At Least 80"

define "Last BP Panels Within Year Prior To Qualifying Encounter":
  { CRLCommon.LastOf(Cms22RecordSource."Blood Pressure Panels", CRLCommon.BeforeStartOf(1 'year', "Qualifying Encounter")) }

define "Last BP Panel Within Year Prior to Qualifying Encounter":
  "Last BP Panels Within Year Prior To Qualifying Encounter"

define "Systolic Code Component of Prior-Year Last BP Panel":
  CRLCommon.ComponentOf("Last BP Panel Within Year Prior to Qualifying Encounter", Cms22RecordSource."Systolic Blood Pressure Code")

define "Diastolic Code Component of Prior-Year Last BP Panel":
  CRLCommon.ComponentOf("Last BP Panel Within Year Prior to Qualifying Encounter", Cms22RecordSource."Diastolic Blood Pressure Code")

define "Prior-Year Last Systolic":
  "Systolic Code Component of Prior-Year Last BP Panel"

define "Prior-Year Last Diastolic":
  "Diastolic Code Component of Prior-Year Last BP Panel"

define "Prior-Year Last Systolic At Least 130":
  Coalesce(CRLCommon.AtLeast("Prior-Year Last Systolic", 130 'mm[Hg]'), false)

define "Prior-Year Last Diastolic At Least 80":
  Coalesce(CRLCommon.AtLeast("Prior-Year Last Diastolic", 80 'mm[Hg]'), false)

define "Prior-Year Hypertensive Reading":
  "Prior-Year Last Systolic At Least 130" or "Prior-Year Last Diastolic At Least 80"

define "Without Record Of Prior-Year Hypertensive Reading":
  Coalesce(CRLCommon.Without('record-of', "Prior-Year Hypertensive Reading"), false)

define "First Hypertensive Reading":
  "Hypertensive Reading" and "Without Record Of Prior-Year Hypertensive Reading"

define "Second Hypertensive Reading 130s Body":
  ("Last Systolic Between 130 and 139" or "Last Diastolic Between 80 and 89") and not ("Last Systolic At Least 140" or "Last Diastolic At Least 90")

define "Second Hypertensive Reading 130s":
  "Second Hypertensive Reading 130s Body" and "Prior-Year Hypertensive Reading"

define "Second Hypertensive Reading 140+ Body":
  "Last Systolic At Least 140" or "Last Diastolic At Least 90"

define "Second Hypertensive Reading 140+":
  "Second Hypertensive Reading 140+ Body" and "Prior-Year Hypertensive Reading"

define "Follow-up Within 4 Weeks Ordered":
  CRLCommon.WasOrdered(Cms22RecordSource."Follow-up Within 4 Weeks")

define "Follow-up Within 6 Months Ordered":
  CRLCommon.WasOrdered(Cms22RecordSource."Follow-up Within 6 Months")

define "Four-Week Rescreen Order":
  "Follow-up Within 4 Weeks Ordered"

define "Six-Month Rescreen Order":
  "Follow-up Within 6 Months Ordered"

define "Non-Pharmacological Recommendations":
  Cms22RecordSource."Lifestyle Recommendations"
    union Cms22RecordSource."Weight Reduction Recommendations"
    union Cms22RecordSource."Dietary Recommendations"
    union Cms22RecordSource."Physical Activity Recommendations"
    union Cms22RecordSource."Alcohol Counseling Referrals"

define "Non-Pharmacological Recommendations Ordered":
  CRLCommon.WasOrdered("Non-Pharmacological Recommendations")

define "Non-Pharmacological Recommendation Order":
  "Non-Pharmacological Recommendations Ordered"

define "Hypertension Lab or ECG Requests":
  Cms22RecordSource."EKG 12-Lead Panel Requests"
    union Cms22RecordSource."EKG Study Requests"
    union Cms22RecordSource."Hypertension Lab Tests"

define "Hypertension Lab or ECG Requests Ordered":
  CRLCommon.WasOrdered("Hypertension Lab or ECG Requests")

define "Hypertension Lab or ECG Order":
  "Hypertension Lab or ECG Requests Ordered"

define "Antihypertensive Medications Ordered":
  CRLCommon.WasOrdered(Cms22RecordSource."Antihypertensive Medications")

define "Antihypertensive Medication Order":
  "Antihypertensive Medications Ordered"

define "Primary-Care Referral Justified by Hypertensive Reading":
  CRLCommon.Justified(Cms22RecordSource."Primary-Care Referrals", Cms22RecordSource."Hypertensive Reading Findings")

define "Primary-Care Referrals Ordered":
  CRLCommon.WasOrdered(Cms22RecordSource."Primary-Care Referrals")

define "Referral for Hypertensive Reading":
  "Primary-Care Referral Justified by Hypertensive Reading"
    intersect "Primary-Care Referrals Ordered"

define "Six-Month Rescreen Order Same Day As Qualifying Encounter":
  CRLCommon.SameDay("Six-Month Rescreen Order", "Qualifying Encounter")

define "Six-Month Rescreen Order Same Day As Qualifying Encounter Exists":
  exists ("Six-Month Rescreen Order Same Day As Qualifying Encounter")

define "Non-Pharm Recommendation Order Same Day As Qualifying Encounter":
  CRLCommon.SameDay("Non-Pharmacological Recommendation Order", "Qualifying Encounter")

define "Non-Pharm Recommendation Order Same Day As Qualifying Encounter Exists":
  exists ("Non-Pharm Recommendation Order Same Day As Qualifying Encounter")

define "Referral for Hypertensive Reading Same Day As Qualifying Encounter":
  CRLCommon.SameDay("Referral for Hypertensive Reading", "Qualifying Encounter")

define "Referral for Hypertensive Reading Same Day As Qualifying Encounter Exists":
  exists ("Referral for Hypertensive Reading Same Day As Qualifying Encounter")

define "Four-Week Rescreen Order Same Day As Qualifying Encounter":
  CRLCommon.SameDay("Four-Week Rescreen Order", "Qualifying Encounter")

define "Four-Week Rescreen Order Same Day As Qualifying Encounter Exists":
  exists ("Four-Week Rescreen Order Same Day As Qualifying Encounter")

define "Hypertension Lab or ECG Order Same Day As Qualifying Encounter":
  CRLCommon.SameDay("Hypertension Lab or ECG Order", "Qualifying Encounter")

define "Hypertension Lab or ECG Order Same Day As Qualifying Encounter Exists":
  exists ("Hypertension Lab or ECG Order Same Day As Qualifying Encounter")

define "Antihypertensive Medication Order Same Day As Qualifying Encounter":
  CRLCommon.SameDay("Antihypertensive Medication Order", "Qualifying Encounter")

define "Antihypertensive Medication Order Same Day As Qualifying Encounter Exists":
  exists ("Antihypertensive Medication Order Same Day As Qualifying Encounter")

define "Elevated BP Followup Bundle":
  "Six-Month Rescreen Order Same Day As Qualifying Encounter Exists" and "Non-Pharm Recommendation Order Same Day As Qualifying Encounter Exists" or "Referral for Hypertensive Reading Same Day As Qualifying Encounter Exists"

define "First HTN Followup Bundle":
  "Four-Week Rescreen Order Same Day As Qualifying Encounter Exists" and "Non-Pharm Recommendation Order Same Day As Qualifying Encounter Exists" or "Referral for Hypertensive Reading Same Day As Qualifying Encounter Exists"

define "Second HTN 130s Followup Bundle":
  "Six-Month Rescreen Order Same Day As Qualifying Encounter Exists" and "Hypertension Lab or ECG Order Same Day As Qualifying Encounter Exists" and "Non-Pharm Recommendation Order Same Day As Qualifying Encounter Exists" or "Referral for Hypertensive Reading Same Day As Qualifying Encounter Exists"

define "Second HTN 140+ Followup Bundle":
  "Four-Week Rescreen Order Same Day As Qualifying Encounter Exists" and "Hypertension Lab or ECG Order Same Day As Qualifying Encounter Exists" and "Non-Pharm Recommendation Order Same Day As Qualifying Encounter Exists" and "Antihypertensive Medication Order Same Day As Qualifying Encounter Exists" or "Referral for Hypertensive Reading Same Day As Qualifying Encounter Exists"

define "Elevated BP With Followup":
  "Elevated BP Reading" and "Elevated BP Followup Bundle"

define "First HTN With Followup":
  "First Hypertensive Reading" and "First HTN Followup Bundle"

define "Second HTN 130s With Followup":
  "Second Hypertensive Reading 130s" and "Second HTN 130s Followup Bundle"

define "Second HTN 140+ With Followup":
  "Second Hypertensive Reading 140+" and "Second HTN 140+ Followup Bundle"

define "Hypertension Diagnoses Verified":
  CRLCommon.IsVerified(Cms22RecordSource."Hypertension Diagnoses")

define "Verified Hypertension":
  "Hypertension Diagnoses Verified"

define "Verified Hypertension As Of Qualifying Encounter Narrative":
  CRLCommon.AsOf("Qualifying Encounter", "Verified Hypertension")

define "Verified Hypertension As Of Qualifying Encounter":
  "Verified Hypertension As Of Qualifying Encounter Narrative"

define "BP Measurement Sources":
  Cms22RecordSource."Blood Pressure Panels"
    union Cms22RecordSource."Standalone Systolic BP Observations"
    union Cms22RecordSource."Standalone Diastolic BP Observations"

define "BP Measurement Sources Not Done With Reason":
  CRLCommon.NotDoneWithReason("BP Measurement Sources", (Cms22RecordSource."Medical Reasons" union Cms22RecordSource."Patient Declined Reasons"))

define "BP Measurement Sources Same Day As Qualifying Encounter":
  CRLCommon.SameDay("BP Measurement Sources", "Qualifying Encounter")

define "BP Measurement Not Done With Reason":
  exists ("BP Measurement Sources Not Done With Reason")
    and exists ("BP Measurement Sources Same Day As Qualifying Encounter")

define "Follow-up Within 4 Weeks Declined by Patient":
  CRLCommon.NotDoneWithReason(Cms22RecordSource."Follow-up Within 4 Weeks", Cms22RecordSource."Patient Declined Reasons")

define "Follow-up Within 6 Months Declined by Patient":
  CRLCommon.NotDoneWithReason(Cms22RecordSource."Follow-up Within 6 Months", Cms22RecordSource."Patient Declined Reasons")

define "Primary-Care Referrals Declined by Patient":
  CRLCommon.NotDoneWithReason(Cms22RecordSource."Primary-Care Referrals", Cms22RecordSource."Patient Declined Reasons")

define "Non-Pharmacological Recommendations Declined by Patient":
  CRLCommon.NotDoneWithReason("Non-Pharmacological Recommendations", Cms22RecordSource."Patient Declined Reasons")

define "Hypertension Lab or ECG Requests Declined by Patient":
  CRLCommon.NotDoneWithReason("Hypertension Lab or ECG Requests", Cms22RecordSource."Patient Declined Reasons")

define "Antihypertensive Medications Declined by Patient":
  CRLCommon.NotDoneWithReason(Cms22RecordSource."Antihypertensive Medications", Cms22RecordSource."Patient Declined Reasons")

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
  CRLCommon.SameDay("Primary-Care Referral Declined", "Qualifying Encounter")

define "Primary-Care Referral Declined Same Day As Qualifying Encounter Exists":
  exists ("Primary-Care Referral Declined Same Day As Qualifying Encounter")

define "Six-Month Rescreen Declined Same Day As Qualifying Encounter":
  CRLCommon.SameDay("Six-Month Rescreen Declined", "Qualifying Encounter")

define "Six-Month Rescreen Declined Same Day As Qualifying Encounter Exists":
  exists ("Six-Month Rescreen Declined Same Day As Qualifying Encounter")

define "Non-Pharm Recommendation Declined Same Day As Qualifying Encounter":
  CRLCommon.SameDay("Non-Pharm Recommendation Declined", "Qualifying Encounter")

define "Non-Pharm Recommendation Declined Same Day As Qualifying Encounter Exists":
  exists ("Non-Pharm Recommendation Declined Same Day As Qualifying Encounter")

define "Four-Week Rescreen Declined Same Day As Qualifying Encounter":
  CRLCommon.SameDay("Four-Week Rescreen Declined", "Qualifying Encounter")

define "Four-Week Rescreen Declined Same Day As Qualifying Encounter Exists":
  exists ("Four-Week Rescreen Declined Same Day As Qualifying Encounter")

define "Hypertension Lab or ECG Declined Same Day As Qualifying Encounter":
  CRLCommon.SameDay("Hypertension Lab or ECG Declined", "Qualifying Encounter")

define "Hypertension Lab or ECG Declined Same Day As Qualifying Encounter Exists":
  exists ("Hypertension Lab or ECG Declined Same Day As Qualifying Encounter")

define "Antihypertensive Medication Declined Same Day As Qualifying Encounter":
  CRLCommon.SameDay("Antihypertensive Medication Declined", "Qualifying Encounter")

define "Antihypertensive Medication Declined Same Day As Qualifying Encounter Exists":
  exists ("Antihypertensive Medication Declined Same Day As Qualifying Encounter")

define "Elevated BP Declined Bundle":
  "Primary-Care Referral Declined Same Day As Qualifying Encounter Exists" or "Six-Month Rescreen Declined Same Day As Qualifying Encounter Exists" or "Non-Pharm Recommendation Declined Same Day As Qualifying Encounter Exists"

define "First HTN Declined Bundle":
  "Four-Week Rescreen Declined Same Day As Qualifying Encounter Exists" or "Primary-Care Referral Declined Same Day As Qualifying Encounter Exists" or "Non-Pharm Recommendation Declined Same Day As Qualifying Encounter Exists"

define "Second HTN 130s Declined Bundle":
  "Primary-Care Referral Declined Same Day As Qualifying Encounter Exists" or "Six-Month Rescreen Declined Same Day As Qualifying Encounter Exists" or "Hypertension Lab or ECG Declined Same Day As Qualifying Encounter Exists" or "Non-Pharm Recommendation Declined Same Day As Qualifying Encounter Exists"

define "Second HTN 140+ Declined Bundle":
  "Primary-Care Referral Declined Same Day As Qualifying Encounter Exists" or "Four-Week Rescreen Declined Same Day As Qualifying Encounter Exists" or "Antihypertensive Medication Declined Same Day As Qualifying Encounter Exists" or "Hypertension Lab or ECG Declined Same Day As Qualifying Encounter Exists" or "Non-Pharm Recommendation Declined Same Day As Qualifying Encounter Exists"

define "Elevated BP With Declined Followup":
  "Elevated BP Reading" and "Elevated BP Declined Bundle"

define "First HTN With Declined Followup":
  "First Hypertensive Reading" and "First HTN Declined Bundle"

define "Second HTN 130s With Declined Followup":
  "Second Hypertensive Reading 130s" and "Second HTN 130s Declined Bundle"

define "Second HTN 140+ With Declined Followup":
  "Second Hypertensive Reading 140+" and "Second HTN 140+ Declined Bundle"

define "HTN Followup Declined By Patient":
  "Elevated BP With Declined Followup" or "First HTN With Declined Followup" or "Second HTN 130s With Declined Followup" or "Second HTN 140+ With Declined Followup"

define "Age At Start Of MP At Least 18 Years":
  Coalesce(CRLCommon.AtLeast(CRLCommon.AgeAt(start of "Measurement Period"), 18 'years'), false)

define "Aged 18+ at Measurement Period Start":
  "Age At Start Of MP At Least 18 Years"
