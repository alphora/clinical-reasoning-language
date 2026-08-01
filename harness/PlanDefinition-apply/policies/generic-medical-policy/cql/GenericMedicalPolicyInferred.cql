library GenericMedicalPolicyInferred

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include GenericMedicalPolicyLocalSource

context Patient

define "First Day Of Treatment (Medical Surgical) Provided":
  if exists (GenericMedicalPolicyLocalSource."First Day Of Treatment (Medical Surgical) Value" O where O.value is not null) then { true } else {} as List<System.Boolean>

define "Primary Diagnosis (Medical Surgical) Provided":
  if exists (GenericMedicalPolicyLocalSource."Primary Diagnosis (Medical Surgical) Value" O where O.value is not null) then { true } else {} as List<System.Boolean>

define "Additional Clinical Information (Medical Surgical) Provided":
  if exists (GenericMedicalPolicyLocalSource."Additional Clinical Information (Medical Surgical) Value" O where O.value is not null) then { true } else {} as List<System.Boolean>

define "Drug Type Provided":
  if exists (GenericMedicalPolicyLocalSource."Drug Type Value" O where O.value is not null) then { true } else {} as List<System.Boolean>

define "First Day Of Treatment (Drug) Provided":
  if exists (GenericMedicalPolicyLocalSource."First Day Of Treatment (Drug) Value" O where O.value is not null) then { true } else {} as List<System.Boolean>

define "Primary Diagnosis (Drug) Provided":
  if exists (GenericMedicalPolicyLocalSource."Primary Diagnosis (Drug) Value" O where O.value is not null) then { true } else {} as List<System.Boolean>

define "Dose Frequency Route Duration (Drug) Provided":
  if exists (GenericMedicalPolicyLocalSource."Dose Frequency Route Duration (Drug) Value" O where O.value is not null) then { true } else {} as List<System.Boolean>

define "Step Therapy Response (Drug) Provided":
  if exists (GenericMedicalPolicyLocalSource."Step Therapy Response (Drug) Value" O where O.value is not null) then { true } else {} as List<System.Boolean>

define "Additional Clinical Information (Drug) Provided":
  if exists (GenericMedicalPolicyLocalSource."Additional Clinical Information (Drug) Value" O where O.value is not null) then { true } else {} as List<System.Boolean>

define "First Day Of Treatment (Behavioral) Provided":
  if exists (GenericMedicalPolicyLocalSource."First Day Of Treatment (Behavioral) Value" O where O.value is not null) then { true } else {} as List<System.Boolean>

define "Requested Level Of Care (Behavioral) Provided":
  if exists (GenericMedicalPolicyLocalSource."Requested Level Of Care (Behavioral) Value" O where O.value is not null) then { true } else {} as List<System.Boolean>

define "Primary Diagnosis (Behavioral) Provided":
  if exists (GenericMedicalPolicyLocalSource."Primary Diagnosis (Behavioral) Value" O where O.value is not null) then { true } else {} as List<System.Boolean>

define "Additional Clinical Information (Behavioral) Provided":
  if exists (GenericMedicalPolicyLocalSource."Additional Clinical Information (Behavioral) Value" O where O.value is not null) then { true } else {} as List<System.Boolean>
