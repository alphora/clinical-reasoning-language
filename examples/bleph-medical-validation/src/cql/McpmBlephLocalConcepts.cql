library McpmBlephLocalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Mcpm Bleph Local Codes": 'http://iehp.org/crl/CodeSystem/mcpm-bleph-local'
code "Blepharoplasty Requested": 'blepharoplasty-requested' from "Mcpm Bleph Local Codes"
code "Blepharoptosis Repair Requested": 'blepharoptosis-repair-requested' from "Mcpm Bleph Local Codes"
code "Cosmetic Surgical Purpose": 'performed-for-cosmetic-purposes' from "Mcpm Bleph Local Codes"
code "Functional Or Reconstructive Surgical Indication": 'functional-or-reconstructive-surgery-performed-to-correct-indication' from "Mcpm Bleph Local Codes"
code "Documented Patient Complaint": 'documented-patient-complaint' from "Mcpm Bleph Local Codes"
code "Photographic Demonstration Submitted": 'photographic-demonstration-submitted' from "Mcpm Bleph Local Codes"
code "Visual Field Demonstration Submitted": 'visual-field-demonstration-submitted' from "Mcpm Bleph Local Codes"
code "Photograph Submission Standards Met": 'submitted-photographs-conform-to-the-photograph-submission-standards' from "Mcpm Bleph Local Codes"
code "Visual Field Examination Standards Met": 'submitted-visual-field-examination-conforms-to-the-examination-standards' from "Mcpm Bleph Local Codes"
code "Individual Blepharoplasty Documentation": 'blepharoplasty-individually-documented' from "Mcpm Bleph Local Codes"
code "Individual Blepharoptosis Repair Documentation": 'blepharoptosis-repair-individually-documented' from "Mcpm Bleph Local Codes"

context Patient
