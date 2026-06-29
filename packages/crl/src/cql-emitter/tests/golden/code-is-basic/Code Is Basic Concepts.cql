library "Code Is Basic Concepts"

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Adult Patient System": 'urn:crl:codesystem:code-is-basic-local'
code "Adult Patient": 'adult-18-or-older' from "Adult Patient System"
codesystem "Active Crohns Disease System": 'urn:crl:codesystem:code-is-basic-local'
code "Active Crohns Disease": 'active-crohns-disease' from "Active Crohns Disease System"

context Patient
