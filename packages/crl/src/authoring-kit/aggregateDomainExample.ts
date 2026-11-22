/** Synthetic example shared by kit teaching and the owning aggregate tests. */
export function aggregateDomainSource(operation: "any of" | "any available value of" = "any available value of"): string {
  return `library "Distinct Answers".
terminology "Request Answers":
- system is \`urn:request\`.
- code is \`preferredA\` display is \`Preferred A\`.
- code is \`nonpreferredB\` display is \`Nonpreferred B\`.
- code is \`nonpreferredC\` display is \`Nonpreferred C\`.
terminology "Dose Answers":
- system is \`urn:dose\`.
- code is \`valid10\` display is \`Valid 10\`.
- code is \`valid20\` display is \`Valid 20\`.
- code is \`otherDose\` display is \`Other dose\`.
terminology "Flagged Answers":
- system is \`urn:request\`.
- code is \`nonpreferredB\`.
- code is \`nonpreferredC\`.
- system is \`urn:dose\`.
- code is \`otherDose\`.
concept "Request":
- code is \`request\`.
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- value domain is answer options.
- value from is "Request Answers".
- shape reduction is most recent.
concept "Dose":
- code is \`dose\`.
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- value domain is answer options.
- value from is "Dose Answers".
- shape reduction is most recent.
presentation for "Request": - question text is "Request?".
presentation for "Dose": - question text is "Dose?".
concept "Flagged":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is ${operation} "Request" and "Dose" in "Flagged Answers" using validity of "Request".
- shape reduction is most recent.
activity "Flagged": - request CPGTaskRequest. - with \`Flagged\`.
activity "Clear": - request CPGTaskRequest. - with \`Clear\`.
decision "Distinct Answers": first:
- when "Flagged" then recommend activity "Flagged".
- otherwise then recommend activity "Clear".
`;
}
