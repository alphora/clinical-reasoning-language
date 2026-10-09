// REFACTOR:grounded (MR10): authored activities use CPGTaskRequest and produce FHIR Task.
// REFACTOR:grounded: one executable teaching input, shared by the kit and its behavior checks.
// Synthetic eligibility slice, not a medical policy or a preferred ordering for every policy.
export const UNCERTAINTY_REFERENCE_CRL = `library "Uncertainty Example".

// G is required. Then ask A; only a negative A reaches alternative B.
// This example begins after request applicability and any EIU assessment.
// A missing reached guard pauses; otherwise does not bypass an unknown condition.
// A guard reads answer qualification; available-value membership reads the selected
// answer coding. Thus uncertain-yes routes as Yes and still matches Uncertain Answers.
// When changing the answer vocabulary, review both qualification exceptions and
// the uncertainty subset: neither one is inferred from the other.
// CEL covers valid codes and missing facts. Also verify invalid/conflicting codes
// and an uncertain -> Yes -> clear full-response session using native-apply-session.
// A selected explicit clear is a separate control from an absent CEL fact.
terminology "Four Answers":
- system is \`urn:example:four-answers\`.
- code is \`yes\` display is \`Yes\`.
- code is \`no\` display is \`No\`.
- code is \`uncertain-yes\` display is \`Uncertain - assume Yes\`.
- code is \`uncertain-no\` display is \`Uncertain - assume No\`.
terminology "Uncertain Answers":
- system is \`urn:example:four-answers\`.
- code is \`uncertain-yes\`.
- code is \`uncertain-no\`.

concept "G":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- code is \`g\`.
- value domain is answer options.
- value from is "Four Answers":
  - not qualifying is \`no\`.
  - not qualifying is \`uncertain-no\`.
- shape reduction is most recent.
presentation for "G":
- question text is "Is prerequisite G satisfied?".

concept "A":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- code is \`a\`.
- value domain is answer options.
- value from is "Four Answers":
  - not qualifying is \`no\`.
  - not qualifying is \`uncertain-no\`.
- shape reduction is most recent.
presentation for "A":
- question text is "Is alternative A satisfied?".

concept "B":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- code is \`b\`.
- value domain is answer options.
- value from is "Four Answers":
  - not qualifying is \`no\`.
  - not qualifying is \`uncertain-no\`.
- shape reduction is most recent.
presentation for "B":
- question text is "Is alternative B satisfied?".

// The operand list is explicit: retained B uncertainty counts even when A qualifies.
// No code is: the check has no answer slot. The available-value operation also
// prevents missing operands from becoming questions through this computation.
// G supplies the authored validity anchor. This uncoded result is consumed directly
// and has no competing candidate here, so recency is not tested by these outcomes.
// If a derived result competes with other candidates, its anchor affects selection;
// it is not automatically the latest contributing answer's date.
concept "Current G A B Answers Include Uncertainty":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is any available value of "G" and "A" and "B" in "Uncertain Answers" using validity of "G".
- shape reduction is most recent.

activity "certify.Met": - request CPGTaskRequest. - with \`Met\`.
activity "not-certify.Unmet": - request CPGTaskRequest. - with \`Unmet\`.

decision "Synthetic Eligibility":
first:
- when not "G" then recommend activity "not-certify.Unmet".
- otherwise then:
  first:
  - when "A" then:
    first:
    - when "Current G A B Answers Include Uncertainty" then recommend activity "not-certify.Unmet".
    - otherwise then recommend activity "certify.Met".
    end.
  - otherwise then:
    first:
    - when "B" then:
      first:
      - when "Current G A B Answers Include Uncertainty" then recommend activity "not-certify.Unmet".
      - otherwise then recommend activity "certify.Met".
      end.
    - otherwise then recommend activity "not-certify.Unmet".
    end.
  end.
`;

// Literal, independently specified expected outcomes. Missing has no answer code.
export const UNCERTAINTY_CASES = [
  { name: "missing prerequisite", answers: {}, result: "pause" },
  { name: "negative prerequisite", answers: { G: "no" }, result: "Unmet" },
  { name: "uncertain no prerequisite routes Unmet", answers: { G: "uncertain-no" }, result: "Unmet" },
  { name: "missing A", answers: { G: "yes" }, result: "pause" },
  { name: "A qualifies B absent", answers: { G: "yes", A: "yes" }, result: "Met" },
  { name: "A uncertain no needs B", answers: { G: "yes", A: "uncertain-no" }, result: "pause" },
  { name: "A uncertain yes", answers: { G: "yes", A: "uncertain-yes" }, result: "Unmet" },
  { name: "unused B uncertain yes", answers: { G: "yes", A: "yes", B: "uncertain-yes" }, result: "Unmet" },
  { name: "unused B uncertain no", answers: { G: "yes", A: "yes", B: "uncertain-no" }, result: "Unmet" },
  { name: "unused B definite no", answers: { G: "yes", A: "yes", B: "no" }, result: "Met" },
  { name: "B required missing", answers: { G: "yes", A: "no" }, result: "pause" },
  { name: "B qualifies", answers: { G: "yes", A: "no", B: "yes" }, result: "Met" },
  { name: "A uncertain no B qualifies", answers: { G: "yes", A: "uncertain-no", B: "yes" }, result: "Unmet" },
  { name: "B uncertain yes", answers: { G: "yes", A: "no", B: "uncertain-yes" }, result: "Unmet" },
  { name: "both alternatives no", answers: { G: "yes", A: "no", B: "no" }, result: "Unmet" },
  { name: "B uncertain no routes Unmet", answers: { G: "yes", A: "no", B: "uncertain-no" }, result: "Unmet" },
  { name: "uncertain prerequisite", answers: { G: "uncertain-yes", A: "yes" }, result: "Unmet" },
  { name: "ordered A absent B supplied", answers: { G: "yes", B: "yes" }, result: "pause" },
] as const;

const answerCodes = ["yes", "no", "uncertain-yes", "uncertain-no"];
export const UNCERTAINTY_REFERENCE_CEL = `library "Uncertainty Cases".
covers "Uncertainty Example".
fact "Patient": - name is "Synthetic example". - birth date is "1970-01-01". - defined by "Patient".
${["G", "A", "B"].flatMap(name => answerCodes.map(code => `fact "${name} ${code}":
- value is "${code}".
- date is "2026-01-01T00:00:00Z".
- defined by "Uncertainty Example"."${name}".`)).join("\n")}
${UNCERTAINTY_CASES.map(c => `case "${c.name}":
- subject is "Patient".
${Object.entries(c.answers).map(([name, code]) => `- fact is "${name} ${code}".`).join("\n")}
- result is "Synthetic Eligibility" is ${c.result === "pause" ? "pause" : `"${c.result === "Met" ? "certify.Met" : "not-certify.Unmet"}"`}.`).join("\n")}
`;
