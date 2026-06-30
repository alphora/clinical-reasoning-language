library "cms69-Inferred"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "cms69-RecordSource"

parameter "Measurement Period" Interval<DateTime>

context Patient

define "High BMI Follow-up Order Date":
  "cms69-RecordSource"."High BMI Follow-up Service Requests"

define "Weight Assessment Referral Date":
  "cms69-RecordSource"."Weight Assessment Referrals"

define "High BMI Medication Order Date":
  "cms69-RecordSource"."High BMI Medications"

define "Low BMI Follow-up Order Date":
  "cms69-RecordSource"."Low BMI Follow-up Service Requests"

define "Low BMI Medication Order Date":
  "cms69-RecordSource"."Low BMI Medications"

define "High BMI Procedure Performed Date":
  "cms69-RecordSource"."High BMI Follow-up Procedures"

define "Low BMI Procedure Performed Date":
  "cms69-RecordSource"."Low BMI Follow-up Procedures"

define "BMI Evaluation Encounter (not virtual)":
  "cms69-RecordSource"."Encounters to Evaluate BMI"
    except "cms69-RecordSource"."Virtual Encounters"

define "BMI Evaluation Encounter (not virtual) During MP":
  CRLCommon.During("BMI Evaluation Encounter (not virtual)", "Measurement Period")

define "BMI Evaluation Encounter (not virtual) Performed":
  CRLCommon.WasPerformed("BMI Evaluation Encounter (not virtual)")

define "Qualifying Encounter":
  "BMI Evaluation Encounter (not virtual) During MP"
    intersect "BMI Evaluation Encounter (not virtual) Performed"

define "BMI Observation During MP":
  CRLCommon.During("cms69-RecordSource"."BMI Observations", "Measurement Period")

define "BMI Observation Has Positive Value":
  // FIXME: Exceeds is inherently boolean; refinement consumer cannot use it as a list
  CRLCommon.Exceeds("cms69-RecordSource"."BMI Observations", 0 'kg/m2')

define "BMI During Measurement Period":
  "BMI Observation During MP"
    intersect "BMI Observation Has Positive Value"

define "BMI During MP Low":
  CRLCommon.Low("BMI During Measurement Period")

define "BMI During MP High":
  CRLCommon.High("BMI During Measurement Period")

define "BMI During MP Normal":
  CRLCommon.Normal("BMI During Measurement Period")

define "Documented Low BMI":
  "BMI During MP Low"

define "Documented High BMI":
  "BMI During MP High"

define "Normal BMI Range":
  "BMI During MP Normal"

define "Without Documented Abnormal BMI":
  CRLCommon.Without('documented', ("Documented High BMI" union "Documented Low BMI"))

define "Has Normal BMI":
  "Normal BMI Range"
    and "Without Documented Abnormal BMI"

define "Overweight or Obese Diagnoses Active":
  CRLCommon.Active("cms69-RecordSource"."Overweight or Obese Diagnoses")

define "Underweight Diagnoses Active":
  CRLCommon.Active("cms69-RecordSource"."Underweight Diagnoses")

define "Has Overweight or Obese":
  "Overweight or Obese Diagnoses Active"

define "Has Underweight":
  "Underweight Diagnoses Active"

define "High BMI Follow-up Justified by Overweight Diagnosis":
  CRLCommon.Justified("cms69-RecordSource"."High BMI Follow-up Service Requests", "cms69-RecordSource"."Overweight or Obese Diagnoses")

define "Has Overweight On Or Before High BMI Follow-up Order":
  exists CRLCommon.OnOrBefore("Has Overweight or Obese", "High BMI Follow-up Order Date")

define "High BMI Follow-up Order":
  "High BMI Follow-up Justified by Overweight Diagnosis"
    union /* FIXME: boolean operand in refinement composition */ "Has Overweight On Or Before High BMI Follow-up Order"

define "Weight Assessment Referral Justified by Overweight Diagnosis":
  CRLCommon.Justified("cms69-RecordSource"."Weight Assessment Referrals", "cms69-RecordSource"."Overweight or Obese Diagnoses")

define "Has Overweight On Or Before Weight Assessment Referral":
  exists CRLCommon.OnOrBefore("Has Overweight or Obese", "Weight Assessment Referral Date")

define "High BMI Weight Assessment Referral":
  "Weight Assessment Referral Justified by Overweight Diagnosis"
    union /* FIXME: boolean operand in refinement composition */ "Has Overweight On Or Before Weight Assessment Referral"

define "High BMI Medication Justified by Overweight Diagnosis":
  CRLCommon.Justified("cms69-RecordSource"."High BMI Medications", "cms69-RecordSource"."Overweight or Obese Diagnoses")

define "Has Overweight On Or Before High BMI Medication Order":
  exists CRLCommon.OnOrBefore("Has Overweight or Obese", "High BMI Medication Order Date")

define "High BMI Medication Order":
  "High BMI Medication Justified by Overweight Diagnosis"
    union /* FIXME: boolean operand in refinement composition */ "Has Overweight On Or Before High BMI Medication Order"

define "High BMI Interventions Ordered":
  exists ("High BMI Follow-up Order")
    or exists ("High BMI Weight Assessment Referral")
    or exists ("High BMI Medication Order")

define "High BMI Procedure Justified by Overweight Diagnosis":
  CRLCommon.Justified("cms69-RecordSource"."High BMI Follow-up Procedures", "cms69-RecordSource"."Overweight or Obese Diagnoses")

define "Has Overweight On Or Before High BMI Procedure":
  exists CRLCommon.OnOrBefore("Has Overweight or Obese", "High BMI Procedure Performed Date")

define "High BMI Procedure Performed":
  "High BMI Procedure Justified by Overweight Diagnosis"
    union /* FIXME: boolean operand in refinement composition */ "Has Overweight On Or Before High BMI Procedure"

define "High BMI Interventions Performed":
  "High BMI Procedure Performed"

define "Documented High BMI During MP":
  exists CRLCommon.During("Documented High BMI", "Measurement Period")

define "High BMI And Follow Up Provided":
  "Documented High BMI During MP"
    and ("High BMI Interventions Ordered"
    or exists ("High BMI Interventions Performed"))

define "Low BMI Follow-up Justified by Underweight Diagnosis":
  CRLCommon.Justified("cms69-RecordSource"."Low BMI Follow-up Service Requests", "cms69-RecordSource"."Underweight Diagnoses")

define "Has Underweight On Or Before Low BMI Follow-up Order":
  exists CRLCommon.OnOrBefore("Has Underweight", "Low BMI Follow-up Order Date")

define "Low BMI Follow-up Order Date During MP":
  exists CRLCommon.During("Low BMI Follow-up Order Date", "Measurement Period")

define "Low BMI Follow-up Order":
  "Low BMI Follow-up Justified by Underweight Diagnosis"
    union (/* FIXME: boolean operand in refinement composition */ "Has Underweight On Or Before Low BMI Follow-up Order"
    intersect /* FIXME: boolean operand in refinement composition */ "Low BMI Follow-up Order Date During MP")

define "Weight Assessment Referral Justified by Underweight Diagnosis":
  exists CRLCommon.Justified("cms69-RecordSource"."Weight Assessment Referrals", "cms69-RecordSource"."Underweight Diagnoses")

define "Has Underweight On Or Before Weight Assessment Referral":
  exists CRLCommon.OnOrBefore("Has Underweight", "Weight Assessment Referral Date")

define "Weight Assessment Referral Date During MP":
  exists CRLCommon.During("Weight Assessment Referral Date", "Measurement Period")

define "Low BMI Weight Assessment Referral":
  /* FIXME: boolean operand in refinement composition */ "Weight Assessment Referral Justified by Underweight Diagnosis"
    union (/* FIXME: boolean operand in refinement composition */ "Has Underweight On Or Before Weight Assessment Referral"
    intersect /* FIXME: boolean operand in refinement composition */ "Weight Assessment Referral Date During MP")

define "Low BMI Medication Justified by Underweight Diagnosis":
  CRLCommon.Justified("cms69-RecordSource"."Low BMI Medications", "cms69-RecordSource"."Underweight Diagnoses")

define "Has Underweight On Or Before Low BMI Medication Order":
  exists CRLCommon.OnOrBefore("Has Underweight", "Low BMI Medication Order Date")

define "Low BMI Medication Order Date During MP":
  exists CRLCommon.During("Low BMI Medication Order Date", "Measurement Period")

define "Low BMI Medication Order":
  "Low BMI Medication Justified by Underweight Diagnosis"
    union (/* FIXME: boolean operand in refinement composition */ "Has Underweight On Or Before Low BMI Medication Order"
    intersect /* FIXME: boolean operand in refinement composition */ "Low BMI Medication Order Date During MP")

define "Low BMI Interventions Ordered":
  exists ("Low BMI Follow-up Order")
    or exists ("Low BMI Weight Assessment Referral")
    or exists ("Low BMI Medication Order")

define "Low BMI Procedure Justified by Underweight Diagnosis":
  CRLCommon.Justified("cms69-RecordSource"."Low BMI Follow-up Procedures", "cms69-RecordSource"."Underweight Diagnoses")

define "Low BMI Follow-up Procedures Performed":
  CRLCommon.WasPerformed("cms69-RecordSource"."Low BMI Follow-up Procedures")

define "Has Underweight On Or Before Low BMI Procedure":
  exists CRLCommon.OnOrBefore("Has Underweight", "Low BMI Procedure Performed Date")

define "Low BMI Procedure Performed Date During MP":
  exists CRLCommon.During("Low BMI Procedure Performed Date", "Measurement Period")

define "Low BMI Procedure Performed":
  ("Low BMI Procedure Justified by Underweight Diagnosis"
    intersect "Low BMI Follow-up Procedures Performed")
    union (/* FIXME: boolean operand in refinement composition */ "Has Underweight On Or Before Low BMI Procedure"
    intersect /* FIXME: boolean operand in refinement composition */ "Low BMI Procedure Performed Date During MP")

define "Low BMI Interventions Performed":
  "Low BMI Procedure Performed"

define "Documented Low BMI During MP":
  exists CRLCommon.During("Documented Low BMI", "Measurement Period")

define "Low BMI And Follow Up Provided":
  "Documented Low BMI During MP"
    and ("Low BMI Interventions Ordered"
    or exists ("Low BMI Interventions Performed"))

define "BMI Observation Not Done With Reason":
  CRLCommon.NotDoneWithReason("cms69-RecordSource"."BMI Observations", ("cms69-RecordSource"."Medical Reasons" union "cms69-RecordSource"."Patient Declined Reasons"))

define "BMI Observation Same Day As Qualifying Encounter":
  CRLCommon.SameDay("cms69-RecordSource"."BMI Observations", "Qualifying Encounter")

define "Medical Reason Or Patient Reason For Not Performing BMI Exam":
  exists ("BMI Observation Not Done With Reason")
    and exists ("BMI Observation Same Day As Qualifying Encounter")

define "High BMI Follow-up Not Done With Medical Reason":
  CRLCommon.NotDoneWithReason("cms69-RecordSource"."High BMI Follow-up Service Requests", "cms69-RecordSource"."Medical Reasons")

define "High BMI Follow-up Same Day As Qualifying Encounter":
  CRLCommon.SameDay("cms69-RecordSource"."High BMI Follow-up Service Requests", "Qualifying Encounter")

define "High BMI Follow-up Performed":
  CRLCommon.WasPerformed("cms69-RecordSource"."High BMI Follow-up Service Requests")

define "High BMI Follow-up Not Done With Reason":
  "High BMI Follow-up Not Done With Medical Reason"
    intersect "High BMI Follow-up Same Day As Qualifying Encounter"
    intersect "High BMI Follow-up Performed"

define "Low BMI Follow-up Not Done With Medical Reason":
  CRLCommon.NotDoneWithReason("cms69-RecordSource"."Low BMI Follow-up Service Requests", "cms69-RecordSource"."Medical Reasons")

define "Low BMI Follow-up Same Day As Qualifying Encounter":
  CRLCommon.SameDay("cms69-RecordSource"."Low BMI Follow-up Service Requests", "Qualifying Encounter")

define "Low BMI Follow-up Performed":
  CRLCommon.WasPerformed("cms69-RecordSource"."Low BMI Follow-up Service Requests")

define "Low BMI Follow-up Not Done With Reason":
  "Low BMI Follow-up Not Done With Medical Reason"
    intersect "Low BMI Follow-up Same Day As Qualifying Encounter"
    intersect "Low BMI Follow-up Performed"

define "Weight Assessment Referral Not Done With Medical Reason":
  CRLCommon.NotDoneWithReason("cms69-RecordSource"."Weight Assessment Referrals", "cms69-RecordSource"."Medical Reasons")

define "Weight Assessment Referral Same Day As Qualifying Encounter":
  CRLCommon.SameDay("cms69-RecordSource"."Weight Assessment Referrals", "Qualifying Encounter")

define "Weight Assessment Referral Performed":
  CRLCommon.WasPerformed("cms69-RecordSource"."Weight Assessment Referrals")

define "Weight Assessment Referral Not Done With Reason":
  "Weight Assessment Referral Not Done With Medical Reason"
    intersect "Weight Assessment Referral Same Day As Qualifying Encounter"
    intersect "Weight Assessment Referral Performed"

define "High BMI Medication Not Done With Medical Reason":
  CRLCommon.NotDoneWithReason("cms69-RecordSource"."High BMI Medications", "cms69-RecordSource"."Medical Reasons")

define "High BMI Medication Same Day As Qualifying Encounter":
  CRLCommon.SameDay("cms69-RecordSource"."High BMI Medications", "Qualifying Encounter")

define "High BMI Medication Performed":
  CRLCommon.WasPerformed("cms69-RecordSource"."High BMI Medications")

define "High BMI Medication Not Done With Reason":
  "High BMI Medication Not Done With Medical Reason"
    intersect "High BMI Medication Same Day As Qualifying Encounter"
    intersect "High BMI Medication Performed"

define "Low BMI Medication Not Done With Medical Reason":
  CRLCommon.NotDoneWithReason("cms69-RecordSource"."Low BMI Medications", "cms69-RecordSource"."Medical Reasons")

define "Low BMI Medication Same Day As Qualifying Encounter":
  CRLCommon.SameDay("cms69-RecordSource"."Low BMI Medications", "Qualifying Encounter")

define "Low BMI Medication Performed":
  CRLCommon.WasPerformed("cms69-RecordSource"."Low BMI Medications")

define "Low BMI Medication Not Done With Reason":
  "Low BMI Medication Not Done With Medical Reason"
    intersect "Low BMI Medication Same Day As Qualifying Encounter"
    intersect "Low BMI Medication Performed"

define "Medical Reason For Not Documenting A Follow Up Plan For Low Or High BMI":
  exists ("High BMI Follow-up Not Done With Reason")
    or exists ("Low BMI Follow-up Not Done With Reason")
    or exists ("Weight Assessment Referral Not Done With Reason")
    or exists ("High BMI Medication Not Done With Reason")
    or exists ("Low BMI Medication Not Done With Reason")

define "Pregnancy Diagnoses Active During MP":
  CRLCommon.Active("cms69-RecordSource"."Pregnancy Diagnoses", "Measurement Period")

define "Active Pregnancy Diagnosis":
  "Pregnancy Diagnoses Active During MP"

define "Pregnancy Status Overlaps MP":
  CRLCommon.Overlaps("cms69-RecordSource"."Pregnancy Status Observations", "Measurement Period")

define "Pregnancy Status Verified":
  CRLCommon.IsVerified("cms69-RecordSource"."Pregnancy Status Observations")

define "Pregnancy Status Documented As Pregnancy Related":
  CRLCommon.DocumentedAs("cms69-RecordSource"."Pregnancy Status Observations", "cms69-RecordSource"."Pregnancy or Other Related Diagnoses")

define "Verified Pregnancy Status":
  exists ("Pregnancy Status Overlaps MP")
    and exists ("Pregnancy Status Verified")
    and exists ("Pregnancy Status Documented As Pregnancy Related")

define "Is Pregnant During Measurement Period":
  "Active Pregnancy Diagnosis"
    or "Verified Pregnancy Status"

define "Age At Start Of MP At Least 18 Years":
  CRLCommon.AtLeast(CRLCommon.AgeAt(start of "Measurement Period"), 18 'years')

define "Aged 18+ at Measurement Period Start":
  "Age At Start Of MP At Least 18 Years"
