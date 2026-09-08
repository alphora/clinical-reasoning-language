import { describe, expect, it } from "vitest";
import { buildCRL } from "../../index";
import { emitCQLFromAST } from "../emitCQL";
import { publicationEnvelopeName } from "../renderPublicationProducer";
import { extractEmittedDefineHeaders } from "../../emit/booleanTotality";
import { resolveConstructor } from "../../emit/recordConstructor";
import { lowerLocalCodes } from "../lowerLocalCodes";

// REFACTOR:grounded (#320, review 560): public type and consumer contract, not a legacy output oracle.
const source = `library "P".
concept "Answer":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`answer\`.
- shape reduction is most recent.
`;
function emit(text = source, policyId: string | null = "membership-policy") {
  const parsed = buildCRL(text);
  expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
  return emitCQLFromAST(parsed.result!, { canonicalBase: "https://example.org", ...(policyId === null ? {} : { policyId }) });
}

describe("direct selected Record publication", () => {
  it("publishes the original selected Record and records that result type", () => {
    const result = emit();
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(result.result).toContain('define "Answer":');
    expect(result.result).toContain('"__CRL_PublicationSelection_v1_Record"(');
    expect(result.result).toContain('define "Answer Records":');
    expect(result.result).not.toContain("answeredValue()");
    expect(result.ledgerEntries?.find((entry) => entry.name === "Answer")?.result)
      .toEqual({ shape: "Record", resourceType: "Observation" });
  });

  it("projects the nullable value at a criterion leaf", () => {
    const result = emit(source + '\ncriterion "Known Answer":\n- when ("Answer").\n');
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(result.result).toContain('FHIRHelpers.ToBoolean(("Answer").value as FHIR.boolean)');
  });

  it("refuses unsupported new syntax before no-code legacy fallback", () => {
    const result = emit(source.replace('- code is `answer`.\n', ''));
    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => typeof e === "object" && e.kind === "publication-unsupported-form")).toBe(true);
  });

  it("refuses definition consumers pending value-result integration", () => {
    const result = emit(source + '\nconcept "Alias":\n- shape is Scalar.\n- value type is boolean.\n- defined as "Answer".\n');
    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => typeof e === "object" && e.kind === "publication-unsupported-context")).toBe(true);
  });

  it("refuses collisions with versioned helper names", () => {
    const result = emit(source + '\nconcept "__CRL_PublicationSelection_v1_Record":\n- type is Observation.\n- code is `collision`.\n');
    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => typeof e === "object" && e.kind === "publication-name-collision")).toBe(true);
  });

  it("enrolls every emitted top-level define including the compiler envelope", () => {
    const result = emit();
    const names = extractEmittedDefineHeaders(result.result!, "P").map((entry) => entry.name).sort();
    expect(result.ledgerEntries?.map((entry) => entry.name).sort()).toEqual(names);
    const envelope = result.ledgerEntries?.find((entry) => entry.name === publicationEnvelopeName("Answer"));
    expect(envelope).toMatchObject({
      resultType: "non-Boolean(publication envelope)",
      result: { shape: "opaque", form: "publication envelope" },
      obligation: { kind: "not-applicable" },
      discharge: { booleanEffect: "not-boolean" },
      visibility: "impl",
    });
    expect(extractEmittedDefineHeaders(envelope!.cql, "P")).toHaveLength(1);
  });

  it("reports a located typed diagnostic for incompatible demands of one constructor", () => {
    const parsed = buildCRL('library "P".\nconcept "First":\n- type is Observation.\nconcept "Second":\n- type is Observation.\n');
    expect(parsed.success).toBe(true);
    const resolved = resolveConstructor("Observation", "boolean");
    expect(resolved.kind).toBe("resolved");
    if (resolved.kind !== "resolved") throw new Error("Observation Boolean constructor unavailable");
    const concepts = parsed.result!.statements.filter((statement) => statement.type === "Concept");
    concepts[0].__recencyProducerSpecs = [{ signature: resolved.signature }];
    concepts[1].__recencyProducerSpecs = [{ signature: { ...resolved.signature, guardParam: "differentGuard" } }];
    const result = emitCQLFromAST(parsed.result!);
    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({
      type: "Validation", kind: "emit-conflicting-constructor-demand", line: 4, column: 0,
    }));
    expect(result.errors?.some((error) => typeof error === "object" && error.type === "Exception")).toBe(false);
  });

  it("locates an authored reserved constructor name when a generated constructor is demanded", () => {
    const parsed = buildCRL('library "P".\nconcept "Demand":\n- type is Observation.\n- code is `demand`.\nconcept "CRLConstructObservationBoolean":\n- type is Observation.\n- code is `reserved`.\n');
    expect(parsed.success).toBe(true);
    const lowered = lowerLocalCodes(parsed.result!, { canonicalBase: "https://example.org", policyId: "membership-policy" });
    expect(lowered.errors).toEqual([]);
    const resolved = resolveConstructor("Observation", "boolean");
    if (resolved.kind !== "resolved") throw new Error("Observation Boolean constructor unavailable");
    // This lowered-input control supplies a compiler demand without using a legacy narrative
    // producer as the language oracle. The colliding name itself is authored and parser-valid.
    lowered.ast.statements.find((statement) => statement.type === "Concept" && statement.name === "Demand")!.__recencyProducerSpecs = [{ signature: resolved.signature }];
    const result = emitCQLFromAST(lowered.ast);
    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({
      type: "Validation", kind: "emit-reserved-constructor-name", line: 5, column: 0,
    }));
    expect(result.errors?.some((error) => typeof error === "object" && error.type === "Exception")).toBe(false);
  });
});

const membershipSource = `library "P".
concept "Procedure":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- code is \`procedure\`.
- value domain is answer options.
- shape reduction is most recent.
- value from is "P Procedure Answer Options":
  - not qualifying is \`no\`.
concept "Qualifies":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is "Procedure" in qualifying.
- shape reduction is most recent.


terminology "P Procedure Answer Options":
- system is \`https://example.org/answer-codes\`.
- code is \`yes\` display is \`Yes\`.
- code is \`no\` display is \`No\`.
`;

describe("selected-datum membership publication emit", () => {
  it("uses one full operand envelope and emits an uncoded producer without a local retrieve", () => {
    const result = emit(membershipSource);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(result.result).toContain(`define "${publicationEnvelopeName("Procedure")}":`);
    expect(result.result).toContain(`"__CRL_PublicationProducer_v1_Candidate"("${publicationEnvelopeName("Procedure")}"`);
    expect(result.result).toContain('"__CRL_PublicationProducer_v1_Interpret"("__CRL_PublicationSelection_v1_Select"');
    expect(result.result).toContain('define "Qualifies":\n  "__CRL_PublicationSelection_v1_Record"("__CRL_PublicationEnvelope_v1_Qualifies")');
    expect(result.result).not.toContain('define "Qualifies Records"');
    expect(result.result).not.toContain('code "Qualifies Code"');
    expect(result.result).toContain("code: 'yes'");
    expect(result.result).toContain("code: 'no'");
    expect(result.result).toContain("null as System.String");
    expect(result.result).not.toContain("Now()");
    expect(result.ledgerEntries?.find((entry) => entry.name === "Qualifies")?.result).toEqual({shape:"Record",resourceType:"Observation"});
  });

  it("adds a coded own-answer contribution separately and preserves the default equal-time error", () => {
    const result = emit(membershipSource.replace('- definition is "Procedure" in qualifying.', '- code is `qualifies`.\n- definition is "Procedure" in qualifying.'), "membership-policy");
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(result.result).toContain('define "Qualifies Records":');
    expect(result.result).toContain('Flatten({ (("Qualifies Records") O return all');
    expect(result.result).toContain("'error'");
    expect(result.result?.match(/define function "__CRL_PublicationProducer_v1_ConstructBoolean"/g)).toHaveLength(1);
    expect(result.result).toContain("subjectReference System.String");
  });

  it("shares one constructor across coded and uncoded producer demands", () => {
    const result = emit(membershipSource + '\nconcept "Coded Qualifies":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `coded-qualifies`.\n- definition is "Procedure" in qualifying.\n- shape reduction is most recent.\n', "membership-policy");
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(result.result?.match(/define function "__CRL_PublicationProducer_v1_ConstructBoolean"/g)).toHaveLength(1);
    expect(result.result).toContain('define "Coded Qualifies Records":');
    expect(result.result).not.toContain('define "Qualifies Records":');
    expect(result.result).toContain("^[A-Za-z0-9.-]{1,64}$");
  });

  it("requires owning policy metadata for a named answer ValueSet, including uncoded producers", () => {
    const coded = emit(membershipSource.replace('- definition is "Procedure" in qualifying.', '- code is `qualifies`.\n- definition is "Procedure" in qualifying.'), null);
    expect(coded.success).toBe(false);
    expect(coded.errors?.some((error) => typeof error === "object" && error.kind === "publication-answer-identity-missing")).toBe(true);
    expect(emit(membershipSource, null).success).toBe(false);
    expect(emit(source).success).toBe(true);
  });

  it.each(["__CRL_PublicationEnvelope_v1_Qualifies", "__CRL_PublicationProducer_v1_ConstructBoolean"])("rejects reserved authored name %s", (name) => {
    const result = emit(membershipSource + `\nconcept "${name}":\n- type is Observation.\n- code is \`reserved\`.\n`);
    expect(result.success).toBe(false);
    expect(result.errors?.some((error) => typeof error === "object" && error.kind === "publication-name-collision")).toBe(true);
  });

  it("keeps a legacy consumer of the selected operand explicitly unsupported", () => {
    const result = emit(membershipSource + '\nconcept "Legacy Alias":\n- shape is Record.\n- type is Observation.\n- value type is CodeableConcept.\n- defined as "Procedure".\n');
    expect(result.success).toBe(false);
    expect(result.errors?.some((error) => typeof error === "object" && error.kind === "publication-unsupported-context")).toBe(true);
  });

  it("refuses a CodeableConcept publication used directly as a Boolean guard", () => {
    const result = emit(membershipSource + '\ncriterion "Wrong Type":\n- when ("Procedure").\n');
    expect(result.success).toBe(false);
    expect(result.errors?.some((error) => typeof error === "object" && error.kind === "publication-unsupported-context")).toBe(true);
  });

  it("refuses a decision-level CodeableConcept guard through validator-free direct emit", () => {
    const result = emit(membershipSource + '\nactivity "Approve":\n- request CPGCommunicationRequest.\n- with `APPROVED`.\ndecision "D":\nfirst:\n- when "Procedure" then recommend activity "Approve".\n');
    expect(result.success).toBe(false);
    expect(result.errors?.some((error) => typeof error === "object" && error.kind === "publication-unsupported-context")).toBe(true);
  });

  it.each(['"Procedure"', '"P"."Procedure"'])("refuses an already-lowered non-Boolean guard without a scope (%s)", (guard) => {
    const parsed = buildCRL(membershipSource + `\nactivity "Approve":\n- request CPGCommunicationRequest.\n- with \`APPROVED\`.\ndecision "D":\nfirst:\n- when ${guard} then recommend activity "Approve".\n`);
    expect(parsed.success).toBe(true);
    const lowered = lowerLocalCodes(parsed.result!, { canonicalBase: "https://example.org", policyId: "membership-policy" });
    expect(lowered.errors).toEqual([]);
    expect(lowered.ast.statements.some((statement) => statement.type === "Concept" && statement.__publication?.role === "public")).toBe(true);
    const result = emitCQLFromAST(lowered.ast, { canonicalBase: "https://example.org" });
    expect(result.success).toBe(false);
    expect(result.errors?.some((error) => typeof error === "object" && error.kind === "publication-unsupported-context")).toBe(true);
  });

  it("diagnoses a lowered producer emitted without its operand or a physical target", () => {
    const parsed = buildCRL(membershipSource);
    expect(parsed.success).toBe(true);
    const lowered = lowerLocalCodes(parsed.result!, { canonicalBase: "https://example.org", policyId: "membership-policy" });
    expect(lowered.errors).toEqual([]);
    const producer = lowered.ast.statements.find((statement) => statement.type === "Concept" && statement.name === "Qualifies")!;
    const result = emitCQLFromAST({ ...lowered.ast, statements: [producer] });
    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({
      type: "Validation", kind: "publication-missing-envelope", line: producer.location.start.line, column: producer.location.start.column,
    }));
    expect(result.errors?.some((error) => typeof error === "object" && error.type === "Exception")).toBe(false);
  });
});
