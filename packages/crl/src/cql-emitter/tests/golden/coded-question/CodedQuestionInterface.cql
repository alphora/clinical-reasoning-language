library CodedQuestionInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include CodedQuestionInferences

context Patient

define "Service Requested":
  CodedQuestionInferences."Service Requested"

define "Qualifying Symptom Documented":
  CodedQuestionInferences."Qualifying Symptom Documented"
