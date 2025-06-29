library RecordConcepts

using FHIR version '4.0.1'

include FHIRHelpers 
include FHIRCommon called FC

valueset "Height": 'http://example.org/hcscsdh/demo/ValueSet/height'
valueset "Weight": 'http://example.org/hcscsdh/demo/ValueSet/weight'
valueset "BMI": 'http://example.org/hcscsdh/demo/ValueSet/bmi'
