/** Synthetic executable source-only example shared by kit, CRE and emitter tests. */
export const CODED_SOURCE_POLICY = `library "Coded Source".
terminology "Tests":
- system is \`urn:synthetic:test\`.
- code is \`result\`.
terminology "Results":
- system is \`urn:synthetic:result\`.
- code is \`negative\` display is \`Negative\`.
- code is \`positive\` display is \`Positive\`.
terminology "Negative":
- system is \`urn:synthetic:result\`.
- code is \`negative\`.
concept "Result":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- value domain is "Results".
- shape reduction is most recent.
- source representation:
  - type is Observation.
  - coded from "Tests".
concept "Is Negative":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is "Result" in "Negative".
- shape reduction is most recent.
activity "Yes": - request CPGCommunicationRequest. - with \`YES\`.
activity "No": - request CPGCommunicationRequest. - with \`NO\`.
decision "D": first:
- when "Is Negative" then recommend activity "Yes".
- otherwise then recommend activity "No".
`;

/** Same source with an explicit local answer representation and offered values. */
export const CODED_SOURCE_WITH_ANSWERS = CODED_SOURCE_POLICY
  .replace('concept "Result":', 'concept "Result":\n- code is `result`.')
  .replace('- value domain is "Results".', '- value domain is answer options.\n- value from is "Results".')
  .replace('concept "Is Negative":', 'presentation for "Result":\n- question text is "Which synthetic result was reported?".\nconcept "Is Negative":');
