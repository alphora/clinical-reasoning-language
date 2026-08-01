library Med201014MedicalPolicyInterface

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include Med201014MedicalPolicyLocalSource
include Med201014MedicalPolicyInferred

context Patient

define "Primary Focal Hyperhidrosis":
  Med201014MedicalPolicyLocalSource."Primary Focal Hyperhidrosis".asTruths().satisfied()

define "Axillary Hyperhidrosis Region":
  Med201014MedicalPolicyLocalSource."Axillary Hyperhidrosis Region".asTruths().satisfied()

define "OnabotulinumtoxinA":
  Med201014MedicalPolicyLocalSource."OnabotulinumtoxinA".asTruths().satisfied()

define "Severe Hyperhidrosis":
  Med201014MedicalPolicyLocalSource."Severe Hyperhidrosis".asTruths().satisfied()

define "Inadequately Managed With Topical Agents":
  Med201014MedicalPolicyLocalSource."Inadequately Managed With Topical Agents".asTruths().satisfied()

define "Age 18 Or Older":
  Med201014MedicalPolicyInferred."Age 18 Or Older".satisfied()

define "Primary Focal Qualifying Medical Condition":
  Med201014MedicalPolicyInferred."Primary Focal Qualifying Medical Condition".satisfied()

define "Functional Impairment":
  Med201014MedicalPolicyLocalSource."Functional Impairment".asTruths().satisfied()

define "Endoscopic Transthoracic Sympathectomy":
  Med201014MedicalPolicyLocalSource."Endoscopic Transthoracic Sympathectomy".asTruths().satisfied()

define "Conservative Treatment Failed":
  Med201014MedicalPolicyLocalSource."Conservative Treatment Failed".asTruths().satisfied()

define "Surgical Excision Of Axillary Sweat Glands":
  Med201014MedicalPolicyLocalSource."Surgical Excision Of Axillary Sweat Glands".asTruths().satisfied()

define "Subdermal Laser Treatment":
  Med201014MedicalPolicyLocalSource."Subdermal Laser Treatment".asTruths().satisfied()

define "Axillary Experimental Treatment":
  Med201014MedicalPolicyInferred."Axillary Experimental Treatment".satisfied()

define "Palmar Hyperhidrosis Region":
  Med201014MedicalPolicyLocalSource."Palmar Hyperhidrosis Region".asTruths().satisfied()

define "Palmar Experimental Treatment":
  Med201014MedicalPolicyInferred."Palmar Experimental Treatment".satisfied()

define "Plantar Hyperhidrosis Region":
  Med201014MedicalPolicyLocalSource."Plantar Hyperhidrosis Region".asTruths().satisfied()

define "Plantar Experimental Treatment":
  Med201014MedicalPolicyInferred."Plantar Experimental Treatment".satisfied()

define "Craniofacial Hyperhidrosis Region":
  Med201014MedicalPolicyLocalSource."Craniofacial Hyperhidrosis Region".asTruths().satisfied()

define "Craniofacial Experimental Treatment":
  Med201014MedicalPolicyInferred."Craniofacial Experimental Treatment".satisfied()

define "Severe Secondary Gustatory Hyperhidrosis":
  Med201014MedicalPolicyLocalSource."Severe Secondary Gustatory Hyperhidrosis".asTruths().satisfied()

define "Tympanic Neurectomy":
  Med201014MedicalPolicyLocalSource."Tympanic Neurectomy".asTruths().satisfied()

define "Secondary Experimental Treatment":
  Med201014MedicalPolicyInferred."Secondary Experimental Treatment".satisfied()
