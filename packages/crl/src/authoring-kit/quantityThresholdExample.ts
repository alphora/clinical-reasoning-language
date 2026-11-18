// REFACTOR:grounded: synthetic numeric thresholds shared by teaching, CRE, and native sessions.
export function quantityThresholdSource(unit: string, comparison: "at least" | "at most", threshold: number): string {
  return `library "Quantity Threshold Intake".
concept "Measurement":
- shape is Record.
- type is Observation.
- value type is Quantity '${unit}'.
- code is \`measurement\`.
- shape reduction is most recent.
presentation for "Measurement":
- question text is "Enter measurement (${unit})".

concept "Threshold Met":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is "Measurement" ${comparison} ${threshold} '${unit}'.
- shape reduction is most recent.
activity "Meets": - request CPGTaskRequest. - with \`MEETS\`.
activity "Does Not Meet": - request CPGTaskRequest. - with \`DOES-NOT-MEET\`.
decision "Assessment":
first:
- when "Threshold Met" then recommend activity "Meets".
- otherwise then recommend activity "Does Not Meet".
`;
}
