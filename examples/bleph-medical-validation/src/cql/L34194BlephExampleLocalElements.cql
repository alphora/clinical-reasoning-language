library L34194BlephExampleLocalElements

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include L34194BlephExampleLocalConcepts

context Patient

define "Procedure Under Review Records":
  [Observation: L34194BlephExampleLocalConcepts."Procedure Under Review"]

define "Cosmetic Surgical Purpose Records":
  [Observation: L34194BlephExampleLocalConcepts."Cosmetic Surgical Purpose"]

define "Documented Patient Complaint Records":
  [Observation: L34194BlephExampleLocalConcepts."Documented Patient Complaint"]

define "Individual Procedure Necessity Documented Records":
  [Observation: L34194BlephExampleLocalConcepts."Individual Procedure Necessity Documented"]

define "Upper Eyelid Skin Finding Records":
  [Observation: L34194BlephExampleLocalConcepts."Upper Eyelid Skin Finding"]

define "Ptosis Margin Requirement Met Records":
  [Observation: L34194BlephExampleLocalConcepts."Ptosis Margin Requirement Met"]

define "Upper Blepharoplasty Photographs Documented Records":
  [Observation: L34194BlephExampleLocalConcepts."Upper Blepharoplasty Photographs Documented"]

define "Ptosis Photographs Documented Records":
  [Observation: L34194BlephExampleLocalConcepts."Ptosis Photographs Documented"]
