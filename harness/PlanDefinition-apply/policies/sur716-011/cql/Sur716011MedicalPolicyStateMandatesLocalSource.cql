library Sur716011MedicalPolicyStateMandatesLocalSource

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include Sur716011MedicalPolicyStateMandatesLocalConcepts

context Patient

define "Resides In Illinois":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."Resides In Illinois"]

define "IL Policy Amended On Or After 2025-01-01":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."IL Policy Amended On Or After 2025-01-01"]

define "IL Policy Delivered On Or After 2025-01-01":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."IL Policy Delivered On Or After 2025-01-01"]

define "IL Policy Issued On Or After 2025-01-01":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."IL Policy Issued On Or After 2025-01-01"]

define "IL Policy Renewed On Or After 2025-01-01":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."IL Policy Renewed On Or After 2025-01-01"]

define "IL Plan Individual And Family PPO HMO POS":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."IL Plan Individual And Family PPO HMO POS"]

define "IL Plan Student":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."IL Plan Student"]

define "IL Plan Group Small Group":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."IL Plan Group Small Group"]

define "IL Plan Group Mid Market":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."IL Plan Group Mid Market"]

define "IL Plan Group Large Group Fully Insured PPO HMO POS":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."IL Plan Group Large Group Fully Insured PPO HMO POS"]

define "IL Plan Medicaid":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."IL Plan Medicaid"]

define "Service Is Medically Necessary":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."Service Is Medically Necessary"]

define "Intended To Restore Physical Appearance":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."Intended To Restore Physical Appearance"]

define "Body Structure Damaged By Trauma":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."Body Structure Damaged By Trauma"]

define "Resides In Arkansas":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."Resides In Arkansas"]

define "Plan Is Non ASO Group":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."Plan Is Non ASO Group"]

define "Group Indicated Mandate Applies To ASO":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."Group Indicated Mandate Applies To ASO"]

define "AR Plan Fully Insured Group":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."AR Plan Fully Insured Group"]

define "AR Plan Student":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."AR Plan Student"]

define "AR Plan Small Group":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."AR Plan Small Group"]

define "AR Plan Mid Market":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."AR Plan Mid Market"]

define "AR Plan Large Group":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."AR Plan Large Group"]

define "AR Plan HMO":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."AR Plan HMO"]

define "AR Plan EPO":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."AR Plan EPO"]

define "AR Plan PPO":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."AR Plan PPO"]

define "AR Plan POS":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."AR Plan POS"]

define "Receiving Benefits In Connection With A Mastectomy":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."Receiving Benefits In Connection With A Mastectomy"]

define "Elects Breast Reconstruction":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."Elects Breast Reconstruction"]

define "AR 405 Reconstruction Of Mastectomy Breast":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."AR 405 Reconstruction Of Mastectomy Breast"]

define "AR 405 Reconstruction Of Other Breast For Symmetry":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."AR 405 Reconstruction Of Other Breast For Symmetry"]

define "AR 405 Breast Prostheses":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."AR 405 Breast Prostheses"]

define "AR 405 Treatment Of Physical Complications Including Lymphedema":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."AR 405 Treatment Of Physical Complications Including Lymphedema"]

define "SB 83 Augmentation":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."SB 83 Augmentation"]

define "SB 83 Reduction":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."SB 83 Reduction"]

define "SB 83 Mastectomy":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."SB 83 Mastectomy"]

define "SB 83 Contralateral Procedure For Symmetry":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."SB 83 Contralateral Procedure For Symmetry"]

define "SB 83 Breast Reconstruction Modality":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."SB 83 Breast Reconstruction Modality"]

define "SB 83 Chest Wall Reconstruction Including Aesthetic Flat Closure":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."SB 83 Chest Wall Reconstruction Including Aesthetic Flat Closure"]

define "SB 83 Custom Fabricated Breast Prosthesis Including Replacement":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."SB 83 Custom Fabricated Breast Prosthesis Including Replacement"]

define "SB 83 Treatment Of Physical Complications":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."SB 83 Treatment Of Physical Complications"]

define "Surgery Best Course Determined By Professional":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."Surgery Best Course Determined By Professional"]

define "Consistent With Prevailing Medical Standards":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."Consistent With Prevailing Medical Standards"]

define "In Consultation With The Patient":
  [Observation: Sur716011MedicalPolicyStateMandatesLocalConcepts."In Consultation With The Patient"]
