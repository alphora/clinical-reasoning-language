library PatientAgeUpperInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include PatientAgeUpperInferences

context Patient

define "Under Twenty One":
  PatientAgeUpperInferences."Under Twenty One".satisfied()

define "At Most Twenty One":
  PatientAgeUpperInferences."At Most Twenty One".satisfied()
