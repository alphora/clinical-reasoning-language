library Semnot232FixtureLocalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Semnot 232 Fixture Local Codes": 'http://example.org/crl/semnot-232/CodeSystem/semnot-232-fixture-local'
code "Alpha": 'alpha' from "Semnot 232 Fixture Local Codes"
code "Beta": 'beta' from "Semnot 232 Fixture Local Codes"

context Patient
