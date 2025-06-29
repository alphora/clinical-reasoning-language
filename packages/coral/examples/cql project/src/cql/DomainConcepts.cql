library DomainConcepts

using FHIR version '4.0.1'

include FHIRHelpers 
include FHIRCommon called FC


codesystem "BodyMeasureCodes": 'http://example.org/hcscsdh/demo/CodeSystem/o-ch-gc-bm-codes'

code "Most Recent Height Code": 'most-recent-height' from "BodyMeasureCodes"
code "Most Recent Weight Code": 'most-recent-weight' from "BodyMeasureCodes"
code "Most Recent BMI Code": 'most-recent-bmi' from "BodyMeasureCodes"

define "Most Recent Height Concept":
  CodeableConcept {
    coding: {
        Coding {
            system: uri { value: 'http://example.org/hcscsdh/demo/CodeSystem/o-ch-gc-bm-codes' },
            code: code { value: 'most-recent-height' },
            display: string { value: 'Most Recent Height' }
        }
    }
  }

define "Most Recent Weight Concept":
  CodeableConcept {
    coding: {
        Coding {
            system: uri { value: 'http://example.org/hcscsdh/demo/CodeSystem/o-ch-gc-bm-codes' },
            code: code { value: 'most-recent-weight' },
            display: string { value: 'Most Recent Weight' }
        }
    }
  }
  
define "Most Recent BMI Concept":
  CodeableConcept {
    coding: {
        Coding {
            system: uri { value: 'http://example.org/hcscsdh/demo/CodeSystem/o-ch-gc-bm-codes' },
            code: code { value: 'most-recent-bmi' },
            display: string { value: 'Most Recent BMI' }
        }
    }
  }