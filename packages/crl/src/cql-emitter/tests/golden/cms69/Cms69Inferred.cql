library Cms69Inferred

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include Cms69RecordSource

parameter "Measurement Period" Interval<DateTime>

context Patient

define "BMI Evaluation Encounter (not virtual)":
  Cms69RecordSource."Encounters to Evaluate BMI"
    except Cms69RecordSource."Virtual Encounters"

define "BMI Evaluation Encounter (not virtual) During MP":
  CRLCommon.During("BMI Evaluation Encounter (not virtual)", "Measurement Period")

define "BMI Evaluation Encounter (not virtual) Performed":
  CRLCommon.WasPerformed("BMI Evaluation Encounter (not virtual)")

define "Qualifying Encounter":
  "BMI Evaluation Encounter (not virtual) During MP"
    intersect "BMI Evaluation Encounter (not virtual) Performed"

define "BMI Observation During MP":
  CRLCommon.During(Cms69RecordSource."BMI Observations", "Measurement Period")

define "BMI During Measurement Period":
  "BMI Observation During MP"

define "BMI During MP Low":
  Coalesce(CRLCommon.Low("BMI During Measurement Period"), false)

define "BMI During MP High":
  Coalesce(CRLCommon.High("BMI During Measurement Period"), false)

define "BMI During MP Normal":
  Coalesce(CRLCommon.Normal("BMI During Measurement Period"), false)

define "Documented Low BMI":
  "BMI During MP Low"

define "Documented High BMI":
  "BMI During MP High"

define "Normal BMI Range":
  "BMI During MP Normal"

define "Without Documented Abnormal BMI":
  Coalesce(CRLCommon.Without('documented', ("Documented High BMI" union "Documented Low BMI")), false)

define "Has Normal BMI":
  "Normal BMI Range" and "Without Documented Abnormal BMI"

define "Overweight or Obese Diagnoses Active":
  CRLCommon.Active(Cms69RecordSource."Overweight or Obese Diagnoses")

define "Underweight Diagnoses Active":
  CRLCommon.Active(Cms69RecordSource."Underweight Diagnoses")

define "High BMI Follow-up Justified by Overweight Diagnosis":
  CRLCommon.Justified(Cms69RecordSource."High BMI Follow-up Service Requests", Cms69RecordSource."Overweight or Obese Diagnoses")

define "High BMI Follow-up Preceded by Overweight Diagnosis":
  CRLCommon.OnDayOfOrAfter(Cms69RecordSource."High BMI Follow-up Service Requests", "Overweight or Obese Diagnoses Active")

define "High BMI Follow-up Order":
  "High BMI Follow-up Justified by Overweight Diagnosis"
    union "High BMI Follow-up Preceded by Overweight Diagnosis"

define "High BMI Follow-up Order Exists":
  exists ("High BMI Follow-up Order")

define "Weight Assessment Referral Justified by Overweight Diagnosis":
  CRLCommon.Justified(Cms69RecordSource."Weight Assessment Referrals", Cms69RecordSource."Overweight or Obese Diagnoses")

define "Weight Assessment Referral Preceded by Overweight Diagnosis":
  CRLCommon.OnDayOfOrAfter(Cms69RecordSource."Weight Assessment Referrals", "Overweight or Obese Diagnoses Active")

define "High BMI Weight Assessment Referral":
  "Weight Assessment Referral Justified by Overweight Diagnosis"
    union "Weight Assessment Referral Preceded by Overweight Diagnosis"

define "High BMI Weight Assessment Referral Exists":
  exists ("High BMI Weight Assessment Referral")

define "High BMI Medication Justified by Overweight Diagnosis":
  CRLCommon.Justified(Cms69RecordSource."High BMI Medications", Cms69RecordSource."Overweight or Obese Diagnoses")

define "High BMI Medication Preceded by Overweight Diagnosis":
  CRLCommon.OnDayOfOrAfter(Cms69RecordSource."High BMI Medications", "Overweight or Obese Diagnoses Active")

define "High BMI Medication Order":
  "High BMI Medication Justified by Overweight Diagnosis"
    union "High BMI Medication Preceded by Overweight Diagnosis"

define "High BMI Medication Order Exists":
  exists ("High BMI Medication Order")

define "High BMI Interventions Ordered":
  "High BMI Follow-up Order Exists" or "High BMI Weight Assessment Referral Exists" or "High BMI Medication Order Exists"

define "High BMI Procedure Justified by Overweight Diagnosis":
  CRLCommon.Justified(Cms69RecordSource."High BMI Follow-up Procedures", Cms69RecordSource."Overweight or Obese Diagnoses")

define "High BMI Procedure Preceded by Overweight Diagnosis":
  CRLCommon.OnDayOfOrAfter(Cms69RecordSource."High BMI Follow-up Procedures", "Overweight or Obese Diagnoses Active")

define "High BMI Procedure Performed":
  "High BMI Procedure Justified by Overweight Diagnosis"
    union "High BMI Procedure Preceded by Overweight Diagnosis"

define "High BMI Procedure Performed Exists":
  exists ("High BMI Procedure Performed")

define "High BMI And Follow Up Provided":
  "Documented High BMI" and ("High BMI Interventions Ordered" or "High BMI Procedure Performed Exists")

define "Low BMI Follow-up Justified by Underweight Diagnosis":
  CRLCommon.Justified(Cms69RecordSource."Low BMI Follow-up Service Requests", Cms69RecordSource."Underweight Diagnoses")

define "Low BMI Follow-up Orders During MP":
  CRLCommon.During(Cms69RecordSource."Low BMI Follow-up Service Requests", "Measurement Period")

define "Low BMI Follow-up Preceded by Underweight During MP":
  CRLCommon.OnDayOfOrAfter("Low BMI Follow-up Orders During MP", "Underweight Diagnoses Active")

define "Low BMI Follow-up Order":
  "Low BMI Follow-up Justified by Underweight Diagnosis"
    union "Low BMI Follow-up Preceded by Underweight During MP"

define "Low BMI Follow-up Order Exists":
  exists ("Low BMI Follow-up Order")

define "Weight Assessment Referral Justified by Underweight Diagnosis":
  CRLCommon.Justified(Cms69RecordSource."Weight Assessment Referrals", Cms69RecordSource."Underweight Diagnoses")

define "Weight Assessment Referral During MP":
  CRLCommon.During(Cms69RecordSource."Weight Assessment Referrals", "Measurement Period")

define "Weight Assessment Referral Preceded by Underweight During MP":
  CRLCommon.OnDayOfOrAfter("Weight Assessment Referral During MP", "Underweight Diagnoses Active")

define "Low BMI Weight Assessment Referral":
  "Weight Assessment Referral Justified by Underweight Diagnosis"
    union "Weight Assessment Referral Preceded by Underweight During MP"

define "Low BMI Weight Assessment Referral Exists":
  exists ("Low BMI Weight Assessment Referral")

define "Low BMI Medication Justified by Underweight Diagnosis":
  CRLCommon.Justified(Cms69RecordSource."Low BMI Medications", Cms69RecordSource."Underweight Diagnoses")

define "Low BMI Medication Orders During MP":
  CRLCommon.During(Cms69RecordSource."Low BMI Medications", "Measurement Period")

define "Low BMI Medication Preceded by Underweight During MP":
  CRLCommon.OnDayOfOrAfter("Low BMI Medication Orders During MP", "Underweight Diagnoses Active")

define "Low BMI Medication Order":
  "Low BMI Medication Justified by Underweight Diagnosis"
    union "Low BMI Medication Preceded by Underweight During MP"

define "Low BMI Medication Order Exists":
  exists ("Low BMI Medication Order")

define "Low BMI Interventions Ordered":
  "Low BMI Follow-up Order Exists" or "Low BMI Weight Assessment Referral Exists" or "Low BMI Medication Order Exists"

define "Low BMI Procedure Justified by Underweight Diagnosis":
  CRLCommon.Justified(Cms69RecordSource."Low BMI Follow-up Procedures", Cms69RecordSource."Underweight Diagnoses")

define "Low BMI Follow-up Procedures Performed":
  CRLCommon.WasPerformed(Cms69RecordSource."Low BMI Follow-up Procedures")

define "Low BMI Procedures During MP":
  CRLCommon.During(Cms69RecordSource."Low BMI Follow-up Procedures", "Measurement Period")

define "Low BMI Procedure Preceded by Underweight During MP":
  CRLCommon.OnDayOfOrAfter("Low BMI Procedures During MP", "Underweight Diagnoses Active")

define "Low BMI Procedure Performed":
  ("Low BMI Procedure Justified by Underweight Diagnosis"
    intersect "Low BMI Follow-up Procedures Performed")
    union "Low BMI Procedure Preceded by Underweight During MP"

define "Low BMI Procedure Performed Exists":
  exists ("Low BMI Procedure Performed")

define "Low BMI And Follow Up Provided":
  "Documented Low BMI" and ("Low BMI Interventions Ordered" or "Low BMI Procedure Performed Exists")

define "BMI Observation Not Done With Reason":
  CRLCommon.NotDoneWithReason(Cms69RecordSource."BMI Observations", (Cms69RecordSource."Medical Reasons" union Cms69RecordSource."Patient Declined Reasons"))

define "BMI Observation Same Day As Qualifying Encounter":
  CRLCommon.SameDay(Cms69RecordSource."BMI Observations", "Qualifying Encounter")

define "BMI Observations Not Done On Encounter Day":
  "BMI Observation Not Done With Reason"
    intersect "BMI Observation Same Day As Qualifying Encounter"

define "Medical Reason Or Patient Reason For Not Performing BMI Exam":
  exists ("BMI Observations Not Done On Encounter Day")

define "High BMI Follow-up Not Done With Medical Reason":
  CRLCommon.NotDoneWithReason(Cms69RecordSource."High BMI Follow-up Service Requests", Cms69RecordSource."Medical Reasons")

define "High BMI Follow-up Same Day As Qualifying Encounter":
  CRLCommon.SameDay(Cms69RecordSource."High BMI Follow-up Service Requests", "Qualifying Encounter")

define "High BMI Follow-up Performed":
  CRLCommon.WasPerformed(Cms69RecordSource."High BMI Follow-up Service Requests")

define "High BMI Follow-up Not Done With Reason":
  "High BMI Follow-up Not Done With Medical Reason"
    intersect "High BMI Follow-up Same Day As Qualifying Encounter"
    intersect "High BMI Follow-up Performed"

define "High BMI Follow-up Not Done With Reason Exists":
  exists ("High BMI Follow-up Not Done With Reason")

define "Low BMI Follow-up Not Done With Medical Reason":
  CRLCommon.NotDoneWithReason(Cms69RecordSource."Low BMI Follow-up Service Requests", Cms69RecordSource."Medical Reasons")

define "Low BMI Follow-up Same Day As Qualifying Encounter":
  CRLCommon.SameDay(Cms69RecordSource."Low BMI Follow-up Service Requests", "Qualifying Encounter")

define "Low BMI Follow-up Performed":
  CRLCommon.WasPerformed(Cms69RecordSource."Low BMI Follow-up Service Requests")

define "Low BMI Follow-up Not Done With Reason":
  "Low BMI Follow-up Not Done With Medical Reason"
    intersect "Low BMI Follow-up Same Day As Qualifying Encounter"
    intersect "Low BMI Follow-up Performed"

define "Low BMI Follow-up Not Done With Reason Exists":
  exists ("Low BMI Follow-up Not Done With Reason")

define "Weight Assessment Referral Not Done With Medical Reason":
  CRLCommon.NotDoneWithReason(Cms69RecordSource."Weight Assessment Referrals", Cms69RecordSource."Medical Reasons")

define "Weight Assessment Referral Same Day As Qualifying Encounter":
  CRLCommon.SameDay(Cms69RecordSource."Weight Assessment Referrals", "Qualifying Encounter")

define "Weight Assessment Referral Performed":
  CRLCommon.WasPerformed(Cms69RecordSource."Weight Assessment Referrals")

define "Weight Assessment Referral Not Done With Reason":
  "Weight Assessment Referral Not Done With Medical Reason"
    intersect "Weight Assessment Referral Same Day As Qualifying Encounter"
    intersect "Weight Assessment Referral Performed"

define "Weight Assessment Referral Not Done With Reason Exists":
  exists ("Weight Assessment Referral Not Done With Reason")

define "High BMI Medication Not Done With Medical Reason":
  CRLCommon.NotDoneWithReason(Cms69RecordSource."High BMI Medications", Cms69RecordSource."Medical Reasons")

define "High BMI Medication Same Day As Qualifying Encounter":
  CRLCommon.SameDay(Cms69RecordSource."High BMI Medications", "Qualifying Encounter")

define "High BMI Medication Performed":
  CRLCommon.WasPerformed(Cms69RecordSource."High BMI Medications")

define "High BMI Medication Not Done With Reason":
  "High BMI Medication Not Done With Medical Reason"
    intersect "High BMI Medication Same Day As Qualifying Encounter"
    intersect "High BMI Medication Performed"

define "High BMI Medication Not Done With Reason Exists":
  exists ("High BMI Medication Not Done With Reason")

define "Low BMI Medication Not Done With Medical Reason":
  CRLCommon.NotDoneWithReason(Cms69RecordSource."Low BMI Medications", Cms69RecordSource."Medical Reasons")

define "Low BMI Medication Same Day As Qualifying Encounter":
  CRLCommon.SameDay(Cms69RecordSource."Low BMI Medications", "Qualifying Encounter")

define "Low BMI Medication Performed":
  CRLCommon.WasPerformed(Cms69RecordSource."Low BMI Medications")

define "Low BMI Medication Not Done With Reason":
  "Low BMI Medication Not Done With Medical Reason"
    intersect "Low BMI Medication Same Day As Qualifying Encounter"
    intersect "Low BMI Medication Performed"

define "Low BMI Medication Not Done With Reason Exists":
  exists ("Low BMI Medication Not Done With Reason")

define "Medical Reason For Not Documenting A Follow Up Plan For Low Or High BMI":
  "High BMI Follow-up Not Done With Reason Exists" or "Low BMI Follow-up Not Done With Reason Exists" or "Weight Assessment Referral Not Done With Reason Exists" or "High BMI Medication Not Done With Reason Exists" or "Low BMI Medication Not Done With Reason Exists"

define "Pregnancy Diagnoses Active During MP":
  CRLCommon.Active(Cms69RecordSource."Pregnancy Diagnoses", "Measurement Period")

define "Active Pregnancy Diagnosis":
  exists ("Pregnancy Diagnoses Active During MP")

define "Pregnancy Status Overlaps MP":
  CRLCommon.Overlaps(Cms69RecordSource."Pregnancy Status Observations", "Measurement Period")

define "Pregnancy Status Verified":
  CRLCommon.IsVerified(Cms69RecordSource."Pregnancy Status Observations")

define "Pregnancy Status Documented As Pregnancy Related":
  CRLCommon.DocumentedAs(Cms69RecordSource."Pregnancy Status Observations", Cms69RecordSource."Pregnancy or Other Related Diagnoses")

define "Verified Pregnancy Status Observations":
  "Pregnancy Status Overlaps MP"
    intersect "Pregnancy Status Verified"
    intersect "Pregnancy Status Documented As Pregnancy Related"

define "Verified Pregnancy Status":
  exists ("Verified Pregnancy Status Observations")

define "Is Pregnant During Measurement Period":
  "Active Pregnancy Diagnosis" or "Verified Pregnancy Status"

define "Age At Start Of MP At Least 18 Years":
  Coalesce(CRLCommon.AtLeast(CRLCommon.AgeAt(start of "Measurement Period"), 18 'years'), false)

define "Aged 18+ at Measurement Period Start":
  "Age At Start Of MP At Least 18 Years"
