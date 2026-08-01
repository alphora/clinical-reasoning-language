library Med201014MedicalPolicyLocalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Med201 014 Medical Policy Local Codes": 'http://example.org/hcsc/med201-014/CodeSystem/med201-014-medical-policy-local'
code "Primary Focal Hyperhidrosis": 'primary-focal-hyperhidrosis' from "Med201 014 Medical Policy Local Codes"
code "Severe Secondary Gustatory Hyperhidrosis": 'severe-secondary-gustatory-hyperhidrosis' from "Med201 014 Medical Policy Local Codes"
code "Acrocyanosis Of The Hands": 'acrocyanosis-of-the-hands' from "Med201 014 Medical Policy Local Codes"
code "History Of Recurrent Skin Maceration With Bacterial Infection": 'history-of-recurrent-skin-maceration-with-bacterial-infection' from "Med201 014 Medical Policy Local Codes"
code "History Of Recurrent Skin Maceration With Fungal Infection": 'history-of-recurrent-skin-maceration-with-fungal-infection' from "Med201 014 Medical Policy Local Codes"
code "History Of Recurrent Secondary Infections": 'history-of-recurrent-secondary-infections' from "Med201 014 Medical Policy Local Codes"
code "History Of Persistent Eczematous Dermatitis": 'history-of-persistent-eczematous-dermatitis' from "Med201 014 Medical Policy Local Codes"
code "Treated With Topical Dermatologic Agents": 'treated-with-topical-dermatologic-agents' from "Med201 014 Medical Policy Local Codes"
code "Treated With Systemic Anticholinergic Agents": 'treated-with-systemic-anticholinergic-agents' from "Med201 014 Medical Policy Local Codes"
code "Functional Impairment": 'functional-impairment' from "Med201 014 Medical Policy Local Codes"
code "Axillary Hyperhidrosis Region": 'axillary-hyperhidrosis-region' from "Med201 014 Medical Policy Local Codes"
code "Palmar Hyperhidrosis Region": 'palmar-hyperhidrosis-region' from "Med201 014 Medical Policy Local Codes"
code "Plantar Hyperhidrosis Region": 'plantar-hyperhidrosis-region' from "Med201 014 Medical Policy Local Codes"
code "Craniofacial Hyperhidrosis Region": 'craniofacial-hyperhidrosis-region' from "Med201 014 Medical Policy Local Codes"
code "OnabotulinumtoxinA": 'onabotulinumtoxina' from "Med201 014 Medical Policy Local Codes"
code "Endoscopic Transthoracic Sympathectomy": 'endoscopic-transthoracic-sympathectomy' from "Med201 014 Medical Policy Local Codes"
code "Surgical Excision Of Axillary Sweat Glands": 'surgical-excision-of-axillary-sweat-glands' from "Med201 014 Medical Policy Local Codes"
code "Tympanic Neurectomy": 'tympanic-neurectomy' from "Med201 014 Medical Policy Local Codes"
code "AbobotulinumtoxinA": 'abobotulinumtoxina' from "Med201 014 Medical Policy Local Codes"
code "IncobotulinumtoxinA": 'incobotulinumtoxina' from "Med201 014 Medical Policy Local Codes"
code "RimabotulinumtoxinB": 'rimabotulinumtoxinb' from "Med201 014 Medical Policy Local Codes"
code "Botulinum Toxin Unspecified": 'botulinum-toxin-unspecified' from "Med201 014 Medical Policy Local Codes"
code "Subdermal Laser Treatment": 'subdermal-laser-treatment' from "Med201 014 Medical Policy Local Codes"
code "Axillary Liposuction": 'axillary-liposuction' from "Med201 014 Medical Policy Local Codes"
code "Iontophoresis": 'iontophoresis' from "Med201 014 Medical Policy Local Codes"
code "Microwave Treatment": 'microwave-treatment' from "Med201 014 Medical Policy Local Codes"
code "Radiofrequency Ablation": 'radiofrequency-ablation' from "Med201 014 Medical Policy Local Codes"
code "Lumbar Sympathectomy": 'lumbar-sympathectomy' from "Med201 014 Medical Policy Local Codes"
code "Other Secondary Gustatory Technique": 'other-secondary-gustatory-technique' from "Med201 014 Medical Policy Local Codes"
code "Severe Hyperhidrosis": 'severe-hyperhidrosis' from "Med201 014 Medical Policy Local Codes"
code "Inadequately Managed With Topical Agents": 'inadequately-managed-with-topical-agents' from "Med201 014 Medical Policy Local Codes"
code "Age 18 Or Older": 'age-18-or-older' from "Med201 014 Medical Policy Local Codes"
code "Conservative Treatment Failed": 'conservative-treatment-failed' from "Med201 014 Medical Policy Local Codes"

context Patient
