library PatientAgeUpperLocalPrimitives

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include PatientAgeUpperLocalConcepts

context Patient

define "Under Twenty One":
  [Observation: PatientAgeUpperLocalConcepts."Under Twenty One"]

define "At Most Twenty One":
  [Observation: PatientAgeUpperLocalConcepts."At Most Twenty One"]
