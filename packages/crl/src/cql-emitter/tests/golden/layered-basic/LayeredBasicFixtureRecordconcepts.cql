library LayeredBasicFixtureRecordconcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

valueset "Example Valueset A": 'http://example.org/fhir/ValueSet/a'
valueset "Example Valueset B": 'http://example.org/fhir/ValueSet/b'

context Patient
