library Rx501147MedicalPolicyLocalSource

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include Rx501147MedicalPolicyLocalConcepts

context Patient

/*
 * @business-logic-deferred: the case-3 answer Observation must not persist beyond the client session (mechanism deferred — #190); the recency lattice treats it as session-fresh
 */
define "Adult Age 18 Or Older":
  [Observation: Rx501147MedicalPolicyLocalConcepts."Adult Age 18 Or Older"]

define "Moderate To Severely Active Crohn's Disease":
  [Observation: Rx501147MedicalPolicyLocalConcepts."Moderate To Severely Active Crohn's Disease"]

define "Moderate To Severely Active Ulcerative Colitis":
  [Observation: Rx501147MedicalPolicyLocalConcepts."Moderate To Severely Active Ulcerative Colitis"]
