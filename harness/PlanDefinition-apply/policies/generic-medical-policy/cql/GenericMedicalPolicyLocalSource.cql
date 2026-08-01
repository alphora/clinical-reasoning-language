library GenericMedicalPolicyLocalSource

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include GenericMedicalPolicyLocalConcepts

context Patient

define "Request Is Medical Surgical":
  [Observation: GenericMedicalPolicyLocalConcepts."Request Is Medical Surgical"]

define "Request Is Drug":
  [Observation: GenericMedicalPolicyLocalConcepts."Request Is Drug"]

define "Request Is Behavioral Or Mental Health":
  [Observation: GenericMedicalPolicyLocalConcepts."Request Is Behavioral Or Mental Health"]

define "Initial Treatment (Medical Surgical)":
  [Observation: GenericMedicalPolicyLocalConcepts."Initial Treatment (Medical Surgical)"]

define "Treatment Already Begun (Medical Surgical)":
  [Observation: GenericMedicalPolicyLocalConcepts."Treatment Already Begun (Medical Surgical)"]

define "First Day Of Treatment (Medical Surgical) Value":
  [Observation: GenericMedicalPolicyLocalConcepts."First Day Of Treatment (Medical Surgical) Value"]

define "Emergency Services Requested (Medical Surgical)":
  [Observation: GenericMedicalPolicyLocalConcepts."Emergency Services Requested (Medical Surgical)"]

define "Primary Diagnosis (Medical Surgical) Value":
  [Observation: GenericMedicalPolicyLocalConcepts."Primary Diagnosis (Medical Surgical) Value"]

define "Clinical Documents And Order Available (Medical Surgical)":
  [Observation: GenericMedicalPolicyLocalConcepts."Clinical Documents And Order Available (Medical Surgical)"]

define "Additional Clinical Information (Medical Surgical) Value":
  [Observation: GenericMedicalPolicyLocalConcepts."Additional Clinical Information (Medical Surgical) Value"]

define "Drug Type Value":
  [Observation: GenericMedicalPolicyLocalConcepts."Drug Type Value"]

define "Treatment Already Begun (Drug)":
  [Observation: GenericMedicalPolicyLocalConcepts."Treatment Already Begun (Drug)"]

define "Reauthorization Response Demonstrated (Drug)":
  [Observation: GenericMedicalPolicyLocalConcepts."Reauthorization Response Demonstrated (Drug)"]

define "First Day Of Treatment (Drug) Value":
  [Observation: GenericMedicalPolicyLocalConcepts."First Day Of Treatment (Drug) Value"]

define "Primary Diagnosis (Drug) Value":
  [Observation: GenericMedicalPolicyLocalConcepts."Primary Diagnosis (Drug) Value"]

define "Dose Frequency Route Duration (Drug) Value":
  [Observation: GenericMedicalPolicyLocalConcepts."Dose Frequency Route Duration (Drug) Value"]

define "Step Therapy Response (Drug) Value":
  [Observation: GenericMedicalPolicyLocalConcepts."Step Therapy Response (Drug) Value"]

define "Clinical Documents Available (Drug)":
  [Observation: GenericMedicalPolicyLocalConcepts."Clinical Documents Available (Drug)"]

define "Additional Clinical Information (Drug) Value":
  [Observation: GenericMedicalPolicyLocalConcepts."Additional Clinical Information (Drug) Value"]

define "Treatment Already Begun (Behavioral)":
  [Observation: GenericMedicalPolicyLocalConcepts."Treatment Already Begun (Behavioral)"]

define "First Day Of Treatment (Behavioral) Value":
  [Observation: GenericMedicalPolicyLocalConcepts."First Day Of Treatment (Behavioral) Value"]

define "Emergency Services Requested (Behavioral)":
  [Observation: GenericMedicalPolicyLocalConcepts."Emergency Services Requested (Behavioral)"]

define "Patient Is Risk To Self Or Others (Behavioral)":
  [Observation: GenericMedicalPolicyLocalConcepts."Patient Is Risk To Self Or Others (Behavioral)"]

define "Requested Level Of Care (Behavioral) Value":
  [Observation: GenericMedicalPolicyLocalConcepts."Requested Level Of Care (Behavioral) Value"]

define "Substance Use Treatment Related (Behavioral)":
  [Observation: GenericMedicalPolicyLocalConcepts."Substance Use Treatment Related (Behavioral)"]

define "Primary Diagnosis (Behavioral) Value":
  [Observation: GenericMedicalPolicyLocalConcepts."Primary Diagnosis (Behavioral) Value"]

define "Clinical Documents Available (Behavioral)":
  [Observation: GenericMedicalPolicyLocalConcepts."Clinical Documents Available (Behavioral)"]

define "Additional Clinical Information (Behavioral) Value":
  [Observation: GenericMedicalPolicyLocalConcepts."Additional Clinical Information (Behavioral) Value"]
