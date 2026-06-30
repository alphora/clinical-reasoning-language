library "code-is-basic-fixture-Inferred"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureHelpers called CFH
include "code-is-basic-fixture-LocalSource"

context Patient

define "Adult With Crohns":
  "code-is-basic-fixture-LocalSource"."Adult Patient".asTruths()
    intersect "code-is-basic-fixture-LocalSource"."Active Crohns Disease".asTruths()
