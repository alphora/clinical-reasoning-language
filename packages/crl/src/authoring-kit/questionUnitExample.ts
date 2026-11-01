// REFACTOR:grounded (#328): synthetic intake example shared by teaching and owning execution checks.
export function questionUnitSource(unit: string | null = "kg/m2"): string {
  return `library "Quantity Unit Intake".
concept "BMI":
- shape is Record.
- type is Observation.
- value type is Quantity.
- code is \`bmi\`.
- shape reduction is most recent.
presentation for "BMI":
- question text is "Enter BMI".
${unit === null ? "" : `- question unit is '${unit}'.\n`}
concept "Above Threshold":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is "BMI" at least 35.00000001 'kg/m2'.
- shape reduction is most recent.
activity "Above": - request CPGTaskRequest. - with \`ABOVE\`.
activity "Below": - request CPGTaskRequest. - with \`BELOW\`.
decision "Assessment":
first:
- when "Above Threshold" then recommend activity "Above".
- otherwise then recommend activity "Below".
`;
}
