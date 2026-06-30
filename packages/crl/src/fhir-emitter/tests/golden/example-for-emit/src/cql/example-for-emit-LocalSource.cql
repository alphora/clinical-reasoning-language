library "example-for-emit-LocalSource"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "example-for-emit-LocalConcepts"

context Patient

define "Implanted Estrogen Pellets":
  [Observation: "example-for-emit-LocalConcepts"."Implanted Estrogen Pellets"]

define "Implanted Estradiol Pellets":
  [Observation: "example-for-emit-LocalConcepts"."Implanted Estradiol Pellets"]
