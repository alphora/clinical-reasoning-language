library Sur716011MedicalPolicyStateMandatesInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include Sur716011MedicalPolicyStateMandatesLocalSource
include Sur716011MedicalPolicyStateMandatesInferred

context Patient

define "Resides In Illinois":
  Sur716011MedicalPolicyStateMandatesLocalSource."Resides In Illinois".asTruths().satisfied()

define "Resides In Arkansas":
  Sur716011MedicalPolicyStateMandatesLocalSource."Resides In Arkansas".asTruths().satisfied()

define "IL Policy Subject Event":
  Sur716011MedicalPolicyStateMandatesInferred."IL Policy Subject Event".satisfied()

define "IL Eligible Plan Type":
  Sur716011MedicalPolicyStateMandatesInferred."IL Eligible Plan Type".satisfied()

define "Service Is Medically Necessary":
  Sur716011MedicalPolicyStateMandatesLocalSource."Service Is Medically Necessary".asTruths().satisfied()

define "Intended To Restore Physical Appearance":
  Sur716011MedicalPolicyStateMandatesLocalSource."Intended To Restore Physical Appearance".asTruths().satisfied()

define "Body Structure Damaged By Trauma":
  Sur716011MedicalPolicyStateMandatesLocalSource."Body Structure Damaged By Trauma".asTruths().satisfied()

define "AR 405 Eligible Plan Type":
  Sur716011MedicalPolicyStateMandatesInferred."AR 405 Eligible Plan Type".satisfied()

define "AR ASO Allows Mandate":
  Sur716011MedicalPolicyStateMandatesInferred."AR ASO Allows Mandate".satisfied()

define "Receiving Benefits In Connection With A Mastectomy":
  Sur716011MedicalPolicyStateMandatesLocalSource."Receiving Benefits In Connection With A Mastectomy".asTruths().satisfied()

define "Elects Breast Reconstruction":
  Sur716011MedicalPolicyStateMandatesLocalSource."Elects Breast Reconstruction".asTruths().satisfied()

define "AR 405 Covered Item":
  Sur716011MedicalPolicyStateMandatesInferred."AR 405 Covered Item".satisfied()

define "SB 83 Eligible Plan Type":
  Sur716011MedicalPolicyStateMandatesInferred."SB 83 Eligible Plan Type".satisfied()

define "SB 83 Breast Reconstruction Surgery":
  Sur716011MedicalPolicyStateMandatesInferred."SB 83 Breast Reconstruction Surgery".satisfied()

define "Surgery Best Course Determined By Professional":
  Sur716011MedicalPolicyStateMandatesLocalSource."Surgery Best Course Determined By Professional".asTruths().satisfied()

define "Consistent With Prevailing Medical Standards":
  Sur716011MedicalPolicyStateMandatesLocalSource."Consistent With Prevailing Medical Standards".asTruths().satisfied()

define "In Consultation With The Patient":
  Sur716011MedicalPolicyStateMandatesLocalSource."In Consultation With The Patient".asTruths().satisfied()
