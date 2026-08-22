library Dme101030Inferences

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include Dme101030LocalPrimitives

context Patient

define "Fracture Of Skull Or Vertebrae":
  exists (Dme101030LocalPrimitives."Fracture Of Skull Or Vertebrae Records")

define "Tumor-Related Fracture":
  exists (Dme101030LocalPrimitives."Tumor-Related Fracture Records")

define "Documented Fracture Nonunion":
  exists (Dme101030LocalPrimitives."Documented Fracture Nonunion Records")
