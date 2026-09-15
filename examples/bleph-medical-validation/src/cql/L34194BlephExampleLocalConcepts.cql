library L34194BlephExampleLocalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "L34194 Bleph Example Local Codes": 'http://example.org/crl/CodeSystem/l34194-bleph-example-local'
code "Procedure Under Review": 'procedure-under-review' from "L34194 Bleph Example Local Codes"
code "Cosmetic Surgical Purpose": 'solely-cosmetic-without-functional-benefit' from "L34194 Bleph Example Local Codes"
code "Documented Patient Complaint": 'functional-complaint-affecting-daily-activities' from "L34194 Bleph Example Local Codes"
code "Individual Procedure Necessity Documented": 'individual-procedure-necessity-documented' from "L34194 Bleph Example Local Codes"
code "Upper Eyelid Skin Finding": 'upper-eyelid-skin-finding' from "L34194 Bleph Example Local Codes"
code "Ptosis Margin Requirement Met": 'true-mrd-at-most-2-mm-with-relaxed-brows' from "L34194 Bleph Example Local Codes"
code "Upper Blepharoplasty Photographs Documented": 'upper-blepharoplasty-photographs-documented' from "L34194 Bleph Example Local Codes"
code "Ptosis Photographs Documented": 'ptosis-photographs-documented' from "L34194 Bleph Example Local Codes"

context Patient
