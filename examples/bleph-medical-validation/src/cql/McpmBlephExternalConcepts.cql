library McpmBlephExternalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

valueset "Blepharoplasty Service Codes": 'http://iehp.org/crl/ValueSet/mcpm-bleph-blepharoplasty-service-codes'
valueset "Blepharoptosis Repair Service Codes": 'http://iehp.org/crl/ValueSet/mcpm-bleph-blepharoptosis-repair-service-codes'
valueset "Blepharoplasty And Blepharoptosis Repair Visual Field Demonstration Submitted Answer Options": 'http://iehp.org/crl/ValueSet/mcpm-bleph-blepharoplasty-and-blepharoptosis-repair-2aa31e7fdaeb'
valueset "Blepharoplasty And Blepharoptosis Repair Photographic Demonstration Submitted Answer Options": 'http://iehp.org/crl/ValueSet/mcpm-bleph-blepharoplasty-and-blepharoptosis-repair-a0ebda795232'
valueset "Blepharoplasty And Blepharoptosis Repair Documented Patient Complaint Answer Options": 'http://iehp.org/crl/ValueSet/mcpm-bleph-blepharoplasty-and-blepharoptosis-repair-0c544edc395d'
valueset "Blepharoplasty And Blepharoptosis Repair Functional Or Reconstructive Surgical Indication Answer Options": 'http://iehp.org/crl/ValueSet/mcpm-bleph-blepharoplasty-and-blepharoptosis-repair-13387ec190e0'

context Patient
