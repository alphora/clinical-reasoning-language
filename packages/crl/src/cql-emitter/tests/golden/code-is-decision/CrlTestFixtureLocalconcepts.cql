library CrlTestFixtureLocalconcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Crl Test Fixture Local Codes": 'urn:crl:codesystem:crl-test-fixture-local'
code "Adult Patient": 'adult-18-or-older' from "Crl Test Fixture Local Codes"
code "Active Crohns Disease": 'active-crohns-disease' from "Crl Test Fixture Local Codes"

context Patient
