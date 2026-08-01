library Med201014MedicalPolicyInferred

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon
include CaseFeatureCommon called CFH
include Med201014MedicalPolicyLocalSource

context Patient

define "History Of Recurrent Skin Maceration With Bacterial Or Fungal Infection":
  Med201014MedicalPolicyLocalSource."History Of Recurrent Skin Maceration With Bacterial Infection".asTruths()
    union Med201014MedicalPolicyLocalSource."History Of Recurrent Skin Maceration With Fungal Infection".asTruths()

define "Treated With Topical Or Systemic Agents":
  Med201014MedicalPolicyLocalSource."Treated With Topical Dermatologic Agents".asTruths()
    union Med201014MedicalPolicyLocalSource."Treated With Systemic Anticholinergic Agents".asTruths()

define "History Of Persistent Eczematous Dermatitis Despite Treatment":
  Med201014MedicalPolicyLocalSource."History Of Persistent Eczematous Dermatitis".asTruths()
    intersect "Treated With Topical Or Systemic Agents"

define "Primary Focal Qualifying Medical Condition":
  Med201014MedicalPolicyLocalSource."Acrocyanosis Of The Hands".asTruths()
    union "History Of Recurrent Skin Maceration With Bacterial Or Fungal Infection"
    union Med201014MedicalPolicyLocalSource."History Of Recurrent Secondary Infections".asTruths()
    union "History Of Persistent Eczematous Dermatitis Despite Treatment"

define "Axillary Experimental Treatment":
  Med201014MedicalPolicyLocalSource."Axillary Liposuction".asTruths()
    union Med201014MedicalPolicyLocalSource."Iontophoresis".asTruths()
    union Med201014MedicalPolicyLocalSource."Microwave Treatment".asTruths()
    union Med201014MedicalPolicyLocalSource."Radiofrequency Ablation".asTruths()

define "Palmar Experimental Treatment":
  Med201014MedicalPolicyLocalSource."RimabotulinumtoxinB".asTruths()
    union Med201014MedicalPolicyLocalSource."Iontophoresis".asTruths()
    union Med201014MedicalPolicyLocalSource."Microwave Treatment".asTruths()
    union Med201014MedicalPolicyLocalSource."Radiofrequency Ablation".asTruths()
    union Med201014MedicalPolicyLocalSource."Subdermal Laser Treatment".asTruths()

define "Plantar Experimental Treatment":
  Med201014MedicalPolicyLocalSource."OnabotulinumtoxinA".asTruths()
    union Med201014MedicalPolicyLocalSource."AbobotulinumtoxinA".asTruths()
    union Med201014MedicalPolicyLocalSource."IncobotulinumtoxinA".asTruths()
    union Med201014MedicalPolicyLocalSource."RimabotulinumtoxinB".asTruths()
    union Med201014MedicalPolicyLocalSource."Iontophoresis".asTruths()
    union Med201014MedicalPolicyLocalSource."Lumbar Sympathectomy".asTruths()
    union Med201014MedicalPolicyLocalSource."Microwave Treatment".asTruths()
    union Med201014MedicalPolicyLocalSource."Radiofrequency Ablation".asTruths()
    union Med201014MedicalPolicyLocalSource."Subdermal Laser Treatment".asTruths()

define "Craniofacial Experimental Treatment":
  Med201014MedicalPolicyLocalSource."OnabotulinumtoxinA".asTruths()
    union Med201014MedicalPolicyLocalSource."AbobotulinumtoxinA".asTruths()
    union Med201014MedicalPolicyLocalSource."IncobotulinumtoxinA".asTruths()
    union Med201014MedicalPolicyLocalSource."RimabotulinumtoxinB".asTruths()
    union Med201014MedicalPolicyLocalSource."Iontophoresis".asTruths()
    union Med201014MedicalPolicyLocalSource."Microwave Treatment".asTruths()
    union Med201014MedicalPolicyLocalSource."Radiofrequency Ablation".asTruths()
    union Med201014MedicalPolicyLocalSource."Subdermal Laser Treatment".asTruths()

define "Any Botulinum Toxin For Secondary":
  Med201014MedicalPolicyLocalSource."OnabotulinumtoxinA".asTruths()
    union Med201014MedicalPolicyLocalSource."AbobotulinumtoxinA".asTruths()
    union Med201014MedicalPolicyLocalSource."IncobotulinumtoxinA".asTruths()
    union Med201014MedicalPolicyLocalSource."RimabotulinumtoxinB".asTruths()
    union Med201014MedicalPolicyLocalSource."Botulinum Toxin Unspecified".asTruths()

define "Secondary Experimental Treatment":
  "Any Botulinum Toxin For Secondary"
    union Med201014MedicalPolicyLocalSource."Iontophoresis".asTruths()
    union Med201014MedicalPolicyLocalSource."Subdermal Laser Treatment".asTruths()
    union Med201014MedicalPolicyLocalSource."Other Secondary Gustatory Technique".asTruths()

/*
 * @business-logic-deferred: the case-3 answer Observation must not persist beyond the client session (mechanism deferred — #190); the recency lattice treats it as session-fresh
 */
define "Age 18 Or Older":
  CFH.recencyAgeTruths(
    Last(
      (Med201014MedicalPolicyLocalSource."Age 18 Or Older") O
        where O.value is FHIR.boolean
        sort by (effective as FHIR.dateTime).value, id
    ),
    CRLCommon.AtLeast(CRLCommon.AgeAt(), 18 'years')
  )
