library Sur716011MedicalPolicyStateMandatesLocalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Sur716 011 Medical Policy State Mandates Local Codes": 'http://example.org/hcsc/sur716-011/CodeSystem/sur716-011-medical-policy-state-mandates-local'
code "Resides In Illinois": 'resides-in-illinois' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "IL Policy Amended On Or After 2025-01-01": 'il-policy-amended-on-or-after-2025-01-01' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "IL Policy Delivered On Or After 2025-01-01": 'il-policy-delivered-on-or-after-2025-01-01' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "IL Policy Issued On Or After 2025-01-01": 'il-policy-issued-on-or-after-2025-01-01' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "IL Policy Renewed On Or After 2025-01-01": 'il-policy-renewed-on-or-after-2025-01-01' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "IL Plan Individual And Family PPO HMO POS": 'il-plan-individual-and-family-ppo-hmo-pos' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "IL Plan Student": 'il-plan-student' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "IL Plan Group Small Group": 'il-plan-group-small-group' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "IL Plan Group Mid Market": 'il-plan-group-mid-market' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "IL Plan Group Large Group Fully Insured PPO HMO POS": 'il-plan-group-large-group-fully-insured-ppo-hmo-pos' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "IL Plan Medicaid": 'il-plan-medicaid' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "Service Is Medically Necessary": 'service-is-medically-necessary' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "Intended To Restore Physical Appearance": 'intended-to-restore-physical-appearance' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "Body Structure Damaged By Trauma": 'body-structure-damaged-by-trauma' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "Resides In Arkansas": 'resides-in-arkansas' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "Plan Is Non ASO Group": 'plan-is-non-aso-group' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "Group Indicated Mandate Applies To ASO": 'group-indicated-mandate-applies-to-aso' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "AR Plan Fully Insured Group": 'ar-plan-fully-insured-group' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "AR Plan Student": 'ar-plan-student' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "AR Plan Small Group": 'ar-plan-small-group' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "AR Plan Mid Market": 'ar-plan-mid-market' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "AR Plan Large Group": 'ar-plan-large-group' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "AR Plan HMO": 'ar-plan-hmo' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "AR Plan EPO": 'ar-plan-epo' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "AR Plan PPO": 'ar-plan-ppo' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "AR Plan POS": 'ar-plan-pos' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "Receiving Benefits In Connection With A Mastectomy": 'receiving-benefits-in-connection-with-a-mastectomy' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "Elects Breast Reconstruction": 'elects-breast-reconstruction' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "AR 405 Reconstruction Of Mastectomy Breast": 'ar405-reconstruction-of-mastectomy-breast' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "AR 405 Reconstruction Of Other Breast For Symmetry": 'ar405-reconstruction-of-other-breast-for-symmetry' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "AR 405 Breast Prostheses": 'ar405-breast-prostheses' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "AR 405 Treatment Of Physical Complications Including Lymphedema": 'ar405-treatment-of-physical-complications-including-lymphedema' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "SB 83 Augmentation": 'sb83-augmentation' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "SB 83 Reduction": 'sb83-reduction' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "SB 83 Mastectomy": 'sb83-mastectomy' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "SB 83 Contralateral Procedure For Symmetry": 'sb83-contralateral-procedure-for-symmetry' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "SB 83 Breast Reconstruction Modality": 'sb83-breast-reconstruction-modality' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "SB 83 Chest Wall Reconstruction Including Aesthetic Flat Closure": 'sb83-chest-wall-reconstruction-including-aesthetic-flat-closure' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "SB 83 Custom Fabricated Breast Prosthesis Including Replacement": 'sb83-custom-fabricated-breast-prosthesis-including-replacement' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "SB 83 Treatment Of Physical Complications": 'sb83-treatment-of-physical-complications' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "Surgery Best Course Determined By Professional": 'surgery-best-course-determined-by-professional' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "Consistent With Prevailing Medical Standards": 'consistent-with-prevailing-medical-standards' from "Sur716 011 Medical Policy State Mandates Local Codes"
code "In Consultation With The Patient": 'in-consultation-with-the-patient' from "Sur716 011 Medical Policy State Mandates Local Codes"

context Patient
