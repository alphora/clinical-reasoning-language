library Dme101030LocalPrimitives

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include Dme101030LocalConcepts

context Patient

define "Fracture Of Skull Or Vertebrae Records":
  [Observation: Dme101030LocalConcepts."Fracture Of Skull Or Vertebrae"]

define "Tumor-Related Fracture Records":
  [Observation: Dme101030LocalConcepts."Tumor-Related Fracture"]

define "Documented Fracture Nonunion Records":
  [Observation: Dme101030LocalConcepts."Documented Fracture Nonunion"]
