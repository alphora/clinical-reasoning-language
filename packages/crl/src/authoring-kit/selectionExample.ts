/** Pure inputs shared by the CRE publication tests and the delivered kit. */
export const SELECTION_POLICY = `library "Publication".
concept "Answer":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`answer\`.
- shape reduction is most recent.
activity "Approve":
- request CPGCommunicationRequest.
- with \`APPROVED\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`DENIED\`.
`;

export const SELECTION_DECISION = `decision "D":
first:
- when "Answer" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;

export const selectionFact = (name: string, value?: string, date?: string) => `fact "${name}":
${value === undefined ? "" : `- value is ${value}.`}
${date === undefined ? "" : `- date is "${date}".`}
- defined by "Publication"."Answer".`;

export function selectionCases(facts: string, references: string[], expected = "Deny", extraCases = "", coveredLibrary = "Publication"): string {
  return `library "Cases".
covers "${coveredLibrary}".
fact "Subject":
- name is "Synthetic subject".
- birth date is "1970-01-01".
- defined by "Patient".
${facts}
case "Case":
- subject is "Subject".
${references.map((r) => `- fact is "${r}".`).join("\n")}
- result is "D" is "${expected}".
${extraCases}`;
}

export const SELECTION_REFERENCE_CRL = SELECTION_POLICY + "\n" + SELECTION_DECISION;
export const SELECTION_NEWER_FALSE = {
  facts: selectionFact("Old", "true", "2026-01-01") + selectionFact("New", "false", "2026-02-01"),
  references: ["Old", "New"],
};
export const SELECTION_REFERENCE_CEL = selectionCases(
  SELECTION_NEWER_FALSE.facts,
  SELECTION_NEWER_FALSE.references,
);
