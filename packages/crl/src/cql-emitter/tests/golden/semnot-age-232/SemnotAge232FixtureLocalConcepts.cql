library SemnotAge232FixtureLocalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Semnot Age 232 Fixture Local Codes": 'http://example.org/crl/semnot-age-232/CodeSystem/semnot-age-232-fixture-local'
code "Age 21 Or Older": 'age-21-or-older' from "Semnot Age 232 Fixture Local Codes"

context Patient
