library GenericMedicalPolicyLocalConcepts

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include CRLCommon called CRLCommon

codesystem "Generic Medical Policy Local Codes": 'http://example.org/hcsc/generic-medical-policy/CodeSystem/generic-medical-policy-local'
code "Request Is Medical Surgical": 'request-type-medical-surgical' from "Generic Medical Policy Local Codes"
code "Request Is Drug": 'request-type-drug' from "Generic Medical Policy Local Codes"
code "Request Is Behavioral Or Mental Health": 'request-type-behavioral-mental-health' from "Generic Medical Policy Local Codes"
code "Initial Treatment (Medical Surgical)": 'ms-initial-treatment' from "Generic Medical Policy Local Codes"
code "Treatment Already Begun (Medical Surgical)": 'ms-treatment-already-begun' from "Generic Medical Policy Local Codes"
code "First Day Of Treatment (Medical Surgical) Value": 'ms-first-day-of-treatment' from "Generic Medical Policy Local Codes"
code "Emergency Services Requested (Medical Surgical)": 'ms-emergency-services-requested' from "Generic Medical Policy Local Codes"
code "Primary Diagnosis (Medical Surgical) Value": 'ms-primary-diagnosis' from "Generic Medical Policy Local Codes"
code "Clinical Documents And Order Available (Medical Surgical)": 'ms-clinical-documents-available' from "Generic Medical Policy Local Codes"
code "Additional Clinical Information (Medical Surgical) Value": 'ms-additional-clinical-information' from "Generic Medical Policy Local Codes"
code "Drug Type Value": 'drug-type' from "Generic Medical Policy Local Codes"
code "Treatment Already Begun (Drug)": 'drug-treatment-already-begun' from "Generic Medical Policy Local Codes"
code "Reauthorization Response Demonstrated (Drug)": 'drug-reauthorization-response-demonstrated' from "Generic Medical Policy Local Codes"
code "First Day Of Treatment (Drug) Value": 'drug-first-day-of-treatment' from "Generic Medical Policy Local Codes"
code "Primary Diagnosis (Drug) Value": 'drug-primary-diagnosis' from "Generic Medical Policy Local Codes"
code "Dose Frequency Route Duration (Drug) Value": 'drug-dose-frequency-route-duration' from "Generic Medical Policy Local Codes"
code "Step Therapy Response (Drug) Value": 'drug-step-therapy' from "Generic Medical Policy Local Codes"
code "Clinical Documents Available (Drug)": 'drug-clinical-documents-available' from "Generic Medical Policy Local Codes"
code "Additional Clinical Information (Drug) Value": 'drug-additional-clinical-information' from "Generic Medical Policy Local Codes"
code "Treatment Already Begun (Behavioral)": 'bh-treatment-already-begun' from "Generic Medical Policy Local Codes"
code "First Day Of Treatment (Behavioral) Value": 'bh-first-day-of-treatment' from "Generic Medical Policy Local Codes"
code "Emergency Services Requested (Behavioral)": 'bh-emergency-services-requested' from "Generic Medical Policy Local Codes"
code "Patient Is Risk To Self Or Others (Behavioral)": 'bh-risk-to-self-or-others' from "Generic Medical Policy Local Codes"
code "Requested Level Of Care (Behavioral) Value": 'requested-level-of-care' from "Generic Medical Policy Local Codes"
code "Substance Use Treatment Related (Behavioral)": 'bh-substance-use-related' from "Generic Medical Policy Local Codes"
code "Primary Diagnosis (Behavioral) Value": 'bh-primary-diagnosis' from "Generic Medical Policy Local Codes"
code "Clinical Documents Available (Behavioral)": 'bh-clinical-documents-available' from "Generic Medical Policy Local Codes"
code "Additional Clinical Information (Behavioral) Value": 'bh-additional-clinical-information' from "Generic Medical Policy Local Codes"

context Patient
