library "Code Is Decision"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Code Is Decision Local Codes": 'urn:crl:codesystem:code-is-decision-local'
code "Adult Patient Code": 'adult-18-or-older' from "Code Is Decision Local Codes"
code "Active Crohns Disease Code": 'active-crohns-disease' from "Code Is Decision Local Codes"

context Patient

define "Adult Patient":
  [Observation: "Adult Patient Code"]

define "Active Crohns Disease":
  [Condition: "Active Crohns Disease Code"]
