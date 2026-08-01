library Sur716011MedicalPolicyStateMandatesInferred

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include Sur716011MedicalPolicyStateMandatesLocalSource

context Patient

define "IL Policy Subject Event":
  Sur716011MedicalPolicyStateMandatesLocalSource."IL Policy Amended On Or After 2025-01-01".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."IL Policy Delivered On Or After 2025-01-01".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."IL Policy Issued On Or After 2025-01-01".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."IL Policy Renewed On Or After 2025-01-01".asTruths()

define "IL Eligible Plan Type":
  Sur716011MedicalPolicyStateMandatesLocalSource."IL Plan Individual And Family PPO HMO POS".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."IL Plan Student".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."IL Plan Group Small Group".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."IL Plan Group Mid Market".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."IL Plan Group Large Group Fully Insured PPO HMO POS".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."IL Plan Medicaid".asTruths()

define "AR ASO Allows Mandate":
  Sur716011MedicalPolicyStateMandatesLocalSource."Plan Is Non ASO Group".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."Group Indicated Mandate Applies To ASO".asTruths()

define "AR 405 Eligible Plan Type":
  Sur716011MedicalPolicyStateMandatesLocalSource."AR Plan Fully Insured Group".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."AR Plan Student".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."AR Plan Small Group".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."AR Plan Mid Market".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."AR Plan Large Group".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."AR Plan HMO".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."AR Plan EPO".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."AR Plan PPO".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."AR Plan POS".asTruths()

define "AR 405 Covered Item":
  Sur716011MedicalPolicyStateMandatesLocalSource."AR 405 Reconstruction Of Mastectomy Breast".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."AR 405 Reconstruction Of Other Breast For Symmetry".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."AR 405 Breast Prostheses".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."AR 405 Treatment Of Physical Complications Including Lymphedema".asTruths()

define "SB 83 Eligible Plan Type":
  Sur716011MedicalPolicyStateMandatesLocalSource."AR Plan Fully Insured Group".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."AR Plan Student".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."AR Plan HMO".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."AR Plan EPO".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."AR Plan PPO".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."AR Plan POS".asTruths()

define "SB 83 Category 1 Procedure":
  Sur716011MedicalPolicyStateMandatesLocalSource."SB 83 Augmentation".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."SB 83 Reduction".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."SB 83 Mastectomy".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."SB 83 Contralateral Procedure For Symmetry".asTruths()

define "SB 83 Breast Reconstruction Surgery":
  "SB 83 Category 1 Procedure"
    union Sur716011MedicalPolicyStateMandatesLocalSource."SB 83 Breast Reconstruction Modality".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."SB 83 Chest Wall Reconstruction Including Aesthetic Flat Closure".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."SB 83 Custom Fabricated Breast Prosthesis Including Replacement".asTruths()
    union Sur716011MedicalPolicyStateMandatesLocalSource."SB 83 Treatment Of Physical Complications".asTruths()
