library SmallExample version '0.1.0'

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLPatterns version '0.2.0' called CRLPatterns

valueset "Hypertensive Reading Findings": 'http://example.org/vs/htn'

context Patient

define "Primary-Care Referrals":
  [ServiceRequest: "Hypertensive Reading Findings"]

define "Hypertensive Reading":
  [Observation: "Hypertensive Reading Findings"]

define "Primary-Care Referral Justified by Hypertensive Reading":
  CRLPatterns.Justified("Primary-Care Referrals", "Hypertensive Reading")

define "Primary-Care Referrals Ordered":
  CRLPatterns.WasOrdered("Primary-Care Referrals")

define "Referral and Reading":
  exists ("Primary-Care Referrals Ordered")
    and exists ("Primary-Care Referral Justified by Hypertensive Reading")
