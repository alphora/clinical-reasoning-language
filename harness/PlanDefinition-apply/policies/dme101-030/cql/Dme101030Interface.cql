library Dme101030Interface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include Dme101030Inferences

context Patient

define "Fracture Of Skull Or Vertebrae":
  Dme101030Inferences."Fracture Of Skull Or Vertebrae"

define "Tumor-Related Fracture":
  Dme101030Inferences."Tumor-Related Fracture"

define "Documented Fracture Nonunion":
  Dme101030Inferences."Documented Fracture Nonunion"
