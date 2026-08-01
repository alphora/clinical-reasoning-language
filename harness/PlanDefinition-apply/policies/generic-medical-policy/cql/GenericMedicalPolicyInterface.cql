library GenericMedicalPolicyInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include GenericMedicalPolicyLocalSource
include GenericMedicalPolicyInferred

context Patient

define "Request Is Medical Surgical":
  GenericMedicalPolicyLocalSource."Request Is Medical Surgical".asTruths().satisfied()

define "Initial Treatment (Medical Surgical)":
  GenericMedicalPolicyLocalSource."Initial Treatment (Medical Surgical)".asTruths().satisfied()

define "Treatment Already Begun (Medical Surgical)":
  GenericMedicalPolicyLocalSource."Treatment Already Begun (Medical Surgical)".asTruths().satisfied()

define "First Day Of Treatment (Medical Surgical) Provided":
  GenericMedicalPolicyInferred."First Day Of Treatment (Medical Surgical) Provided".satisfied()

define "Emergency Services Requested (Medical Surgical)":
  GenericMedicalPolicyLocalSource."Emergency Services Requested (Medical Surgical)".asTruths().satisfied()

define "Primary Diagnosis (Medical Surgical) Provided":
  GenericMedicalPolicyInferred."Primary Diagnosis (Medical Surgical) Provided".satisfied()

define "Clinical Documents And Order Available (Medical Surgical)":
  GenericMedicalPolicyLocalSource."Clinical Documents And Order Available (Medical Surgical)".asTruths().satisfied()

define "Additional Clinical Information (Medical Surgical) Provided":
  GenericMedicalPolicyInferred."Additional Clinical Information (Medical Surgical) Provided".satisfied()

define "Request Is Drug":
  GenericMedicalPolicyLocalSource."Request Is Drug".asTruths().satisfied()

define "Drug Type Provided":
  GenericMedicalPolicyInferred."Drug Type Provided".satisfied()

define "Treatment Already Begun (Drug)":
  GenericMedicalPolicyLocalSource."Treatment Already Begun (Drug)".asTruths().satisfied()

define "Reauthorization Response Demonstrated (Drug)":
  GenericMedicalPolicyLocalSource."Reauthorization Response Demonstrated (Drug)".asTruths().satisfied()

define "First Day Of Treatment (Drug) Provided":
  GenericMedicalPolicyInferred."First Day Of Treatment (Drug) Provided".satisfied()

define "Primary Diagnosis (Drug) Provided":
  GenericMedicalPolicyInferred."Primary Diagnosis (Drug) Provided".satisfied()

define "Dose Frequency Route Duration (Drug) Provided":
  GenericMedicalPolicyInferred."Dose Frequency Route Duration (Drug) Provided".satisfied()

define "Step Therapy Response (Drug) Provided":
  GenericMedicalPolicyInferred."Step Therapy Response (Drug) Provided".satisfied()

define "Clinical Documents Available (Drug)":
  GenericMedicalPolicyLocalSource."Clinical Documents Available (Drug)".asTruths().satisfied()

define "Additional Clinical Information (Drug) Provided":
  GenericMedicalPolicyInferred."Additional Clinical Information (Drug) Provided".satisfied()

define "Request Is Behavioral Or Mental Health":
  GenericMedicalPolicyLocalSource."Request Is Behavioral Or Mental Health".asTruths().satisfied()

define "Treatment Already Begun (Behavioral)":
  GenericMedicalPolicyLocalSource."Treatment Already Begun (Behavioral)".asTruths().satisfied()

define "First Day Of Treatment (Behavioral) Provided":
  GenericMedicalPolicyInferred."First Day Of Treatment (Behavioral) Provided".satisfied()

define "Emergency Services Requested (Behavioral)":
  GenericMedicalPolicyLocalSource."Emergency Services Requested (Behavioral)".asTruths().satisfied()

define "Patient Is Risk To Self Or Others (Behavioral)":
  GenericMedicalPolicyLocalSource."Patient Is Risk To Self Or Others (Behavioral)".asTruths().satisfied()

define "Requested Level Of Care (Behavioral) Provided":
  GenericMedicalPolicyInferred."Requested Level Of Care (Behavioral) Provided".satisfied()

define "Substance Use Treatment Related (Behavioral)":
  GenericMedicalPolicyLocalSource."Substance Use Treatment Related (Behavioral)".asTruths().satisfied()

define "Primary Diagnosis (Behavioral) Provided":
  GenericMedicalPolicyInferred."Primary Diagnosis (Behavioral) Provided".satisfied()

define "Clinical Documents Available (Behavioral)":
  GenericMedicalPolicyLocalSource."Clinical Documents Available (Behavioral)".asTruths().satisfied()

define "Additional Clinical Information (Behavioral) Provided":
  GenericMedicalPolicyInferred."Additional Clinical Information (Behavioral) Provided".satisfied()
