import { intakeAnswer, intakePresence } from "./intakeExample";

// Synthetic count/rate intake: requiredness belongs to the authored decision, not a numeric threshold.
export const QUANTITY_INTAKE_FIELDS = [
  ["Completed Sessions", "completed-sessions", "1"],
  ["Days Per Week", "days-per-week", "d/wk"],
  ["Hours Per Day", "hours-per-day", "h/d"],
] as const;

export function quantityIntakeSource(required = false): string {
  return `library "Numeric Intake".
${QUANTITY_INTAKE_FIELDS.map(([name, code]) => intakeAnswer(name, "Quantity", code) +
  intakePresence(`Has ${name}`, `"${name}"`) +
  `presentation for "${name}":\n- question text is "${name}?".\n`).join("\n")}
activity "Review": - request CPGTaskRequest. - with \`REVIEW\`.
decision "Numeric Intake":
${required ? "" : "first:"}
- when (${QUANTITY_INTAKE_FIELDS.map(([name]) => `"Has ${name}"`).join(" and ")}) then recommend activity "Review".
${required ? "" : '- otherwise then recommend activity "Review".'}
`;
}

export const QUANTITY_INTAKE_CEL = `library "Numeric Cases".
covers "Numeric Intake".
fact "Patient": - defined by "Patient".
${QUANTITY_INTAKE_FIELDS.map(([name, , unit]) => `fact "${name}":
- defined by "Numeric Intake"."${name}".
- value is 0 '${unit}'.
- date is "2026-10-09".`).join("\n")}
case "Blank": - subject is "Patient". - result is "Numeric Intake" is "Review".
case "Answered": - subject is "Patient".
${QUANTITY_INTAKE_FIELDS.map(([name]) => `- fact is "${name}".`).join("\n")}
- result is "Numeric Intake" is "Review".
`;
