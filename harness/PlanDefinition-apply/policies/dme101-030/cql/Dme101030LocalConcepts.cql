library Dme101030LocalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Dme101 030 Local Codes": 'http://example.org/hcsc/dme101-030/CodeSystem/dme101-030-local'
code "Fracture Of Skull Or Vertebrae": 'skull-or-vertebrae-fracture' from "Dme101 030 Local Codes"
code "Tumor-Related Fracture": 'tumor-related-fracture' from "Dme101 030 Local Codes"
code "Documented Fracture Nonunion": 'documented-fracture-nonunion' from "Dme101 030 Local Codes"

context Patient
