library PatientAgeInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include PatientAgeInferred

context Patient

define "Age 18 Or Older":
  PatientAgeInferred."Age 18 Or Older".satisfied()
