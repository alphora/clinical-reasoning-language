library CodedQuestionInterface

using FHIR version '4.0.1'

include hl7.fhir.uv.cql.FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include CodedQuestionInferences

context Patient

define "Service Requested":
  CodedQuestionInferences."Service Requested"

define "Qualifying Symptom Documented":
  CodedQuestionInferences."Qualifying Symptom Documented"

define "CRL branch Ref L42C7":
  "Service Requested"

define "Not CRL branch Ref L42C7":
  not ("Service Requested")

define "CRL branch Ref L44C11":
  "Qualifying Symptom Documented"

define "Not CRL branch Ref L44C11":
  not ("Qualifying Symptom Documented")
