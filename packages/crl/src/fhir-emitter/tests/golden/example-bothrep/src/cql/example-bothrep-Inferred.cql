library "example-bothrep-Inferred"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureHelpers called CFH
include "example-bothrep-LocalSource"

context Patient

define "Implanted Estrogen Or Estradiol Pellets":
  "example-bothrep-LocalSource"."Implanted Estrogen Or Estradiol Pellets".asTruths()
    union (
      "example-bothrep-LocalSource"."Implanted Estrogen Pellets".asTruths()
        union "example-bothrep-LocalSource"."Implanted Estradiol Pellets".asTruths()
    )
