// Pure teaching inputs shared with the owning CRE tests; no test-runner dependency.
const question = (name: string, text: string) => `concept "${name}":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is \`${name.toLowerCase().replace(/ /g, "-")}\`.\n- shape reduction is most recent.\npresentation for "${name}":\n- question text is \`${text}\`.\n`;
const activities = 'activity "Met":\n- request CPGCommunicationRequest.\n- with `Met`.\nactivity "Unmet":\n- request CPGCommunicationRequest.\n- with `Unmet`.\n';

/** The scaling fixture and small reference have exactly the same source structure. */
export function sharedDecisionSource(depth: number): string {
  let crl = '// Fictional ordered interview: resolve each applicability C first, then its D only if applicable, then remaining E.\n// Step names expose the shared structure. This is not the flat formula (not C or D) and E.\n// CRE and definition-emission example; native output and clinical source fidelity need separate verification.\nlibrary "Shared".\n';
  for (let i = 0; i < depth; i++) crl += question(`C${i}`, `Does additional evidence requirement ${i + 1} apply?`) + question(`D${i}`, `Is the evidence for requirement ${i + 1} sufficient?`);
  crl += question("E", "Is the remaining requirement met?") + activities;
  for (let i = 0; i < depth; i++) crl += `decision "Step${i}":\nfirst:\n- when "C${i}" then:\n  first:\n  - when "D${i}" then use decision "Step${i + 1}".\n  - otherwise then recommend activity "Unmet".\n  end.\n- otherwise then use decision "Step${i + 1}".\n`;
  return crl + `decision "Step${depth}":\nfirst:\n- when "E" then recommend activity "Met".\n- otherwise then recommend activity "Unmet".\n`;
}

type Answer = boolean | undefined;
function cases(library: string, decision: string, names: string[], rows: { name: string; answers: Answer[]; expected: string }[]): string {
  let cel = `# Engineering reference: place under src/cel/regression; includes unknown-input controls.\nlibrary "${library} Checks".\ncovers "${library}".\nfact "Patient":\n- name is "Synthetic".\n- birth date is "1970-01-01".\n- defined by "Patient".\n`;
  for (const name of names) for (const value of [true, false]) cel += `fact "${name} ${value}":\n- defined by "${library}"."${name}".\n- value is ${value}.\n`;
  for (const row of rows) cel += `case "${row.name}":\n- subject is "Patient".\n${row.answers.map((v, i) => v === undefined ? "" : `- fact is "${names[i]} ${v}".\n`).join("")}- result is "${decision}" is ${row.expected === "pause" ? "pause" : `"${row.expected}"`}.\n`;
  return cel;
}

export const SHARED_CONTINUATION_CRL = sharedDecisionSource(1);
export const SHARED_CONTINUATION_CEL = cases("Shared", "Step0", ["C0", "D0", "E"], [
  { name: "Resolve applicability before a known later failure", answers: [undefined, undefined, false], expected: "pause" },
  { name: "Extra evidence not applicable and remaining check passes", answers: [false, undefined, true], expected: "Met" },
  { name: "Extra evidence not applicable and remaining check fails", answers: [false, undefined, false], expected: "Unmet" },
  { name: "Extra evidence not applicable and remaining check unknown", answers: [false, undefined, undefined], expected: "pause" },
  { name: "Resolve applicable evidence before a known later failure", answers: [true, undefined, false], expected: "pause" },
  { name: "Applicable evidence fails before remaining check", answers: [true, false, true], expected: "Unmet" },
  { name: "Applicable evidence and remaining check pass", answers: [true, true, true], expected: "Met" },
  { name: "Applicable evidence passes and remaining check fails", answers: [true, true, false], expected: "Unmet" },
  { name: "Applicable evidence passes and remaining check unknown", answers: [true, true, undefined], expected: "pause" },
]);

export const REUSED_CONDITION_SNIPPET = `criterion "Qualifying Evidence":
- when ("Finding A" or "Finding B").
decision "Determination":
first:
- when "Combined Service Requested" then:
  first:
  - when ("Qualifying Evidence" and "Combined Documentation Sufficient") then recommend activity "Met".
  - otherwise then recommend activity "Unmet".
  end.
- otherwise then:
  first:
  - when "Qualifying Evidence" then recommend activity "Met".
  - otherwise then recommend activity "Unmet".
  end.
`;
const reusedNames = ["Combined Service Requested", "Finding A", "Finding B", "Combined Documentation Sufficient"];
const reusedQuestions = ["Is the combined service requested?", "Is qualifying finding A present?", "Is qualifying finding B present?", "Is the documentation for the combined service sufficient?"];
export const REUSED_CONDITION_CRL = '// Fictional request universe: single or combined only. Resolve request type first.\n// Either finding qualifies; only combined requests also need documentation. Keep the AND and OR compound.\n// CRE and definition-emission example; native output and clinical source fidelity need separate verification.\nlibrary "Reused Evidence".\n' + reusedNames.map((n, i) => question(n, reusedQuestions[i])).join("") + activities + REUSED_CONDITION_SNIPPET;
export const REUSED_CONDITION_CEL = cases("Reused Evidence", "Determination", reusedNames, [
  { name: "Resolve request type first", answers: [undefined, false, false, false], expected: "pause" },
  { name: "Single service with finding A", answers: [false, true, undefined, undefined], expected: "Met" },
  { name: "Single service with neither finding", answers: [false, false, false, undefined], expected: "Unmet" },
  { name: "Single service with unresolved evidence", answers: [false, undefined, false, undefined], expected: "pause" },
  { name: "Combined documentation false decides despite unknown evidence", answers: [true, undefined, undefined, false], expected: "Unmet" },
  { name: "Combined service with finding B and documentation", answers: [true, undefined, true, true], expected: "Met" },
  { name: "Combined evidence false decides despite unknown documentation", answers: [true, false, false, undefined], expected: "Unmet" },
  { name: "Combined evidence true and documentation false", answers: [true, true, false, false], expected: "Unmet" },
  { name: "Combined evidence false and documentation true", answers: [true, false, false, true], expected: "Unmet" },
  { name: "Both findings qualify without precedence", answers: [true, true, true, true], expected: "Met" },
  { name: "Combined evidence true and documentation unknown", answers: [true, true, undefined, undefined], expected: "pause" },
]);
