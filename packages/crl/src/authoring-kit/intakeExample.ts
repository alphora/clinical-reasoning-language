// REFACTOR:grounded (#322): synthetic intake, not a clinical eligibility policy.
export const INTAKE_BASE = "https://example.org/intake";
export const intakeAnswer = (name: string, type: string, code: string) => `concept "${name}":
- shape is Record.
- type is Observation.
- value type is ${type}.
- code is \`${code}\`.
- shape reduction is most recent.
`;
export const intakePresence = (name: string, operand: string) => `concept "${name}":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is ${operand} has a value.
- shape reduction is most recent.
`;
export const INTAKE_CRL = `library "Intake".
${intakeAnswer("Primary Diagnosis", "text", "primary-diagnosis")}
${intakeAnswer("Treatment Begun", "boolean", "treatment-begun")}
${intakeAnswer("Additional Information", "text", "additional-information")}
${intakePresence("Has Primary Diagnosis", '"Primary Diagnosis"')}
${intakePresence("Has Treatment Answer", '"Treatment Begun"')}
${intakePresence("Has Additional Information", '"Additional Information"')}
presentation for "Primary Diagnosis":
- question text is "What is the primary diagnosis?".
- question description is "Include a diagnosis code if known.".
presentation for "Treatment Begun":
- question text is "Has treatment begun?".
presentation for "Additional Information":
- question text is "What additional information should the reviewer consider?".
activity "Human Review":
- request CPGCommunicationRequest.
- with \`HUMAN_REVIEW\`.
decision "Intake":
first:
- when ("Has Primary Diagnosis" and "Has Treatment Answer" and "Has Additional Information") then recommend activity "Human Review".
- otherwise then recommend activity "Human Review".
`;
// The same result in both branches is intentional: answers are not eligibility requirements.
// This example recommends review immediately, including with incomplete data; it does not define submission timing.
export const INTAKE_CEL = `library "Intake Cases".
covers "Intake".
fact "Patient": - name is "Synthetic intake". - birth date is "1970-01-01". - defined by "Patient".
fact "Diagnosis": - value is "Example diagnosis, code if known". - date is "2026-09-01". - defined by "Intake"."Primary Diagnosis".
fact "Treatment": - value is false. - date is "2026-09-01". - defined by "Intake"."Treatment Begun".
fact "Additional": - value is "Please review the attached information.". - date is "2026-09-01". - defined by "Intake"."Additional Information".
case "Empty": - subject is "Patient". - result is "Intake" is "Human Review".
case "Answered": - subject is "Patient". - fact is "Diagnosis". - fact is "Treatment". - fact is "Additional". - result is "Intake" is "Human Review".
`;

export const DATETIME_ANSWER = intakeAnswer("Treatment Start", "dateTime", "treatment-start");
