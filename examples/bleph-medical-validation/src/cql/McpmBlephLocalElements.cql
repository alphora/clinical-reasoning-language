library McpmBlephLocalElements

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include McpmBlephLocalConcepts

context Patient

define "Blepharoplasty Requested Records":
  [Observation: McpmBlephLocalConcepts."Blepharoplasty Requested"]

define "Blepharoptosis Repair Requested Records":
  [Observation: McpmBlephLocalConcepts."Blepharoptosis Repair Requested"]

define "Cosmetic Surgical Purpose Records":
  [Observation: McpmBlephLocalConcepts."Cosmetic Surgical Purpose"]

define "Functional Or Reconstructive Surgical Indication Records":
  [Observation: McpmBlephLocalConcepts."Functional Or Reconstructive Surgical Indication"]

define "Documented Patient Complaint Records":
  [Observation: McpmBlephLocalConcepts."Documented Patient Complaint"]

define "Photographic Demonstration Submitted Records":
  [Observation: McpmBlephLocalConcepts."Photographic Demonstration Submitted"]

define "Visual Field Demonstration Submitted Records":
  [Observation: McpmBlephLocalConcepts."Visual Field Demonstration Submitted"]

define "Photograph Submission Standards Met Records":
  [Observation: McpmBlephLocalConcepts."Photograph Submission Standards Met"]

define "Visual Field Examination Standards Met Records":
  [Observation: McpmBlephLocalConcepts."Visual Field Examination Standards Met"]

define "Individual Blepharoplasty Documentation Records":
  [Observation: McpmBlephLocalConcepts."Individual Blepharoplasty Documentation"]

define "Individual Blepharoptosis Repair Documentation Records":
  [Observation: McpmBlephLocalConcepts."Individual Blepharoptosis Repair Documentation"]
