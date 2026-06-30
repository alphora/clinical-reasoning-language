library "example-bothrep-LocalSource"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include "example-bothrep-LocalConcepts"

context Patient

define "Implanted Estrogen Pellets":
  [Observation: "example-bothrep-LocalConcepts"."Implanted Estrogen Pellets"]

define "Implanted Estradiol Pellets":
  [Observation: "example-bothrep-LocalConcepts"."Implanted Estradiol Pellets"]

define "Implanted Estrogen Or Estradiol Pellets":
  [Observation: "example-bothrep-LocalConcepts"."Implanted Estrogen Or Estradiol Pellets"]
