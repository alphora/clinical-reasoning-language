library "example-for-emit-Inferred"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include "example-for-emit-LocalSource"

context Patient

define "Implanted Estrogen Or Estradiol Pellets":
  "example-for-emit-LocalSource"."Implanted Estrogen Pellets".asTruths()
    union "example-for-emit-LocalSource"."Implanted Estradiol Pellets".asTruths()
