library Med201014MedicalPolicyLocalSource

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include Med201014MedicalPolicyLocalConcepts

context Patient

define "Primary Focal Hyperhidrosis":
  [Observation: Med201014MedicalPolicyLocalConcepts."Primary Focal Hyperhidrosis"]

define "Severe Secondary Gustatory Hyperhidrosis":
  [Observation: Med201014MedicalPolicyLocalConcepts."Severe Secondary Gustatory Hyperhidrosis"]

define "Acrocyanosis Of The Hands":
  [Observation: Med201014MedicalPolicyLocalConcepts."Acrocyanosis Of The Hands"]

define "History Of Recurrent Skin Maceration With Bacterial Infection":
  [Observation: Med201014MedicalPolicyLocalConcepts."History Of Recurrent Skin Maceration With Bacterial Infection"]

define "History Of Recurrent Skin Maceration With Fungal Infection":
  [Observation: Med201014MedicalPolicyLocalConcepts."History Of Recurrent Skin Maceration With Fungal Infection"]

define "History Of Recurrent Secondary Infections":
  [Observation: Med201014MedicalPolicyLocalConcepts."History Of Recurrent Secondary Infections"]

define "History Of Persistent Eczematous Dermatitis":
  [Observation: Med201014MedicalPolicyLocalConcepts."History Of Persistent Eczematous Dermatitis"]

define "Treated With Topical Dermatologic Agents":
  [Observation: Med201014MedicalPolicyLocalConcepts."Treated With Topical Dermatologic Agents"]

define "Treated With Systemic Anticholinergic Agents":
  [Observation: Med201014MedicalPolicyLocalConcepts."Treated With Systemic Anticholinergic Agents"]

define "Functional Impairment":
  [Observation: Med201014MedicalPolicyLocalConcepts."Functional Impairment"]

define "Axillary Hyperhidrosis Region":
  [Observation: Med201014MedicalPolicyLocalConcepts."Axillary Hyperhidrosis Region"]

define "Palmar Hyperhidrosis Region":
  [Observation: Med201014MedicalPolicyLocalConcepts."Palmar Hyperhidrosis Region"]

define "Plantar Hyperhidrosis Region":
  [Observation: Med201014MedicalPolicyLocalConcepts."Plantar Hyperhidrosis Region"]

define "Craniofacial Hyperhidrosis Region":
  [Observation: Med201014MedicalPolicyLocalConcepts."Craniofacial Hyperhidrosis Region"]

define "OnabotulinumtoxinA":
  [Observation: Med201014MedicalPolicyLocalConcepts."OnabotulinumtoxinA"]

define "Endoscopic Transthoracic Sympathectomy":
  [Observation: Med201014MedicalPolicyLocalConcepts."Endoscopic Transthoracic Sympathectomy"]

define "Surgical Excision Of Axillary Sweat Glands":
  [Observation: Med201014MedicalPolicyLocalConcepts."Surgical Excision Of Axillary Sweat Glands"]

define "Tympanic Neurectomy":
  [Observation: Med201014MedicalPolicyLocalConcepts."Tympanic Neurectomy"]

define "AbobotulinumtoxinA":
  [Observation: Med201014MedicalPolicyLocalConcepts."AbobotulinumtoxinA"]

define "IncobotulinumtoxinA":
  [Observation: Med201014MedicalPolicyLocalConcepts."IncobotulinumtoxinA"]

define "RimabotulinumtoxinB":
  [Observation: Med201014MedicalPolicyLocalConcepts."RimabotulinumtoxinB"]

define "Botulinum Toxin Unspecified":
  [Observation: Med201014MedicalPolicyLocalConcepts."Botulinum Toxin Unspecified"]

define "Subdermal Laser Treatment":
  [Observation: Med201014MedicalPolicyLocalConcepts."Subdermal Laser Treatment"]

define "Axillary Liposuction":
  [Observation: Med201014MedicalPolicyLocalConcepts."Axillary Liposuction"]

define "Iontophoresis":
  [Observation: Med201014MedicalPolicyLocalConcepts."Iontophoresis"]

define "Microwave Treatment":
  [Observation: Med201014MedicalPolicyLocalConcepts."Microwave Treatment"]

define "Radiofrequency Ablation":
  [Observation: Med201014MedicalPolicyLocalConcepts."Radiofrequency Ablation"]

define "Lumbar Sympathectomy":
  [Observation: Med201014MedicalPolicyLocalConcepts."Lumbar Sympathectomy"]

define "Other Secondary Gustatory Technique":
  [Observation: Med201014MedicalPolicyLocalConcepts."Other Secondary Gustatory Technique"]

define "Severe Hyperhidrosis":
  [Observation: Med201014MedicalPolicyLocalConcepts."Severe Hyperhidrosis"]

define "Inadequately Managed With Topical Agents":
  [Observation: Med201014MedicalPolicyLocalConcepts."Inadequately Managed With Topical Agents"]

/*
 * @business-logic-deferred: the case-3 answer Observation must not persist beyond the client session (mechanism deferred — #190); the recency lattice treats it as session-fresh
 */
define "Age 18 Or Older":
  [Observation: Med201014MedicalPolicyLocalConcepts."Age 18 Or Older"]

define "Conservative Treatment Failed":
  [Observation: Med201014MedicalPolicyLocalConcepts."Conservative Treatment Failed"]
