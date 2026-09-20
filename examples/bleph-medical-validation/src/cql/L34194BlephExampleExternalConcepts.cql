library L34194BlephExampleExternalConcepts

using FHIR version '4.0.1'

include hl7.fhir.uv.cql.FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

valueset "Procedure Options": 'http://example.org/crl/ValueSet/l34194-bleph-example-procedure-options'
valueset "Upper Blepharoplasty Option": 'http://example.org/crl/ValueSet/l34194-bleph-example-upper-blepharoplasty-option'
valueset "Functional Complaint Options": 'http://example.org/crl/ValueSet/l34194-bleph-example-functional-complaint-options'
valueset "Upper Eyelid Skin Finding Options": 'http://example.org/crl/ValueSet/l34194-bleph-example-upper-eyelid-skin-finding-options'

context Patient
