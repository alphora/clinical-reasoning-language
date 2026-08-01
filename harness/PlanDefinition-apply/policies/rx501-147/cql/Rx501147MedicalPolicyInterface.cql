library Rx501147MedicalPolicyInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include Rx501147MedicalPolicyLocalSource
include Rx501147MedicalPolicyInferred

context Patient

define "Adult Age 18 Or Older":
  Rx501147MedicalPolicyInferred."Adult Age 18 Or Older".satisfied()

define "Moderate To Severely Active Crohn's Disease":
  Rx501147MedicalPolicyLocalSource."Moderate To Severely Active Crohn's Disease".asTruths().satisfied()

define "Moderate To Severely Active Ulcerative Colitis":
  Rx501147MedicalPolicyLocalSource."Moderate To Severely Active Ulcerative Colitis".asTruths().satisfied()
