/** Shared executable input for the kit and namedAnswerClosure behavior tests. */
export const ANSWER_EXAMPLE_BASE = "https://example.org/answers";
export const ANSWER_EXAMPLE_TERMS = `terminology "Choices":
- system is \`${ANSWER_EXAMPLE_BASE}/CodeSystem/p-complaint-answer-codes\`.
- code is \`none\` display is \`None\`.
- system is \`urn:standard\`.
- code is \`symptom\` display is \`Symptom\`.
`;
export function answerExampleSource(name = "Complaint") { return `library "P".
concept "${name}":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- code is \`complaint\`.
- value domain is answer options.
- shape reduction is most recent.
- value from is "Shared"."Choices":
  - not qualifying is \`none\`.
presentation for "${name}":
- question text is "Which complaint supports this request?".
- question description is "Select the documented complaint.".
concept "Qualifies":
- shape is Record.
- type is Observation.
- shape reduction is most recent.
- value type is boolean.
- definition is "${name}" in qualifying.
activity "Met": - request CPGCommunicationRequest. - with \`MET\`.
activity "Unmet": - request CPGCommunicationRequest. - with \`UNMET\`.
decision "D": first:
- when "Qualifies" then recommend activity "Met".
- otherwise then recommend activity "Unmet".
`; }

export const ANSWER_EXAMPLE_CEL = `library "Cases". covers "P".
fact "Patient": - name is "Synthetic". - birth date is "1970-01-01". - defined by "Patient".
fact "Positive": - value is "symptom". - date is "2026-09-08". - defined by "P"."Complaint".
fact "Negative": - value is "none". - date is "2026-09-08". - defined by "P"."Complaint".
case "Positive": - subject is "Patient". - fact is "Positive". - result is "D" is "Met".
case "Negative": - subject is "Patient". - fact is "Negative". - result is "D" is "Unmet".
case "Missing": - subject is "Patient". - result is "D" is pause.
`;
