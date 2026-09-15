library McpmBlephExternalElements

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include McpmBlephExternalConcepts

context Patient

define "Blepharoplasty Requested Source 1":
  [ServiceRequest: { System.Code { system: 'http://www.ama-assn.org/go/cpt', code: '15822' }, System.Code { system: 'http://www.ama-assn.org/go/cpt', code: '15823' } }]

define "Blepharoptosis Repair Requested Source 1":
  [ServiceRequest: { System.Code { system: 'http://www.ama-assn.org/go/cpt', code: '67901' }, System.Code { system: 'http://www.ama-assn.org/go/cpt', code: '67902' }, System.Code { system: 'http://www.ama-assn.org/go/cpt', code: '67903' }, System.Code { system: 'http://www.ama-assn.org/go/cpt', code: '67904' }, System.Code { system: 'http://www.ama-assn.org/go/cpt', code: '67905' }, System.Code { system: 'http://www.ama-assn.org/go/cpt', code: '67906' }, System.Code { system: 'http://www.ama-assn.org/go/cpt', code: '67907' }, System.Code { system: 'http://www.ama-assn.org/go/cpt', code: '67908' } }]
