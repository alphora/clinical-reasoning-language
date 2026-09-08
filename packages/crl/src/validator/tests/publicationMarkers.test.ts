import { describe, expect, it } from "vitest";
import { buildCRL } from "../../index";
import type { CRL } from "../../ast/types";
import { buildLibraryScopes, type SourceContext } from "../../imports/scopes";
import type { Registry, RegistryEntry } from "../../imports/types";
import { Validator } from "../validator";
import { AnswerOptionsValidator } from "../answerOptionsValidator";
import { createPublicationContext } from "../../emit/publicationContext";
import { prepareSingleLibraryPublication } from "../../emit/publicationProgram";

// REFACTOR:grounded (#320, review 563 I5): authoring feedback must precede emit failure,
// and marker obligations follow the resolved consumer rather than a global concept name.
const operand = `concept "Answer":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- code is \`answer\`.
- value domain is answer options.
- value from is "Fixture Answer Answer Options":
  - not qualifying is \`no\`.
- shape reduction is most recent.


terminology "Fixture Answer Answer Options":
- system is \`https://example.org/answer-codes\`.
- code is \`yes\` display is \`Listed\`.
- code is \`no\` display is \`None listed\`.
`;
const producer = `concept "Qualifies":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is "Answer" in qualifying.
- shape reduction is most recent.
`;
function ast(text: string): CRL {
  const built = buildCRL(text);
  if (!built.success || built.result === undefined) throw new Error(JSON.stringify(built.errors));
  return built.result;
}
function entry(
  name: string,
  body: string,
  origin: RegistryEntry["origin"] = "local",
): RegistryEntry {
  return {
    name,
    filePath: `${origin}/${name}.crl`,
    ast: ast(`library "${name}".\n${body}`),
    origin,
    isRoot: name === "Root",
  };
}
function scoped(entries: RegistryEntry[], root: RegistryEntry) {
  const registry: Registry = { byNameLocal: new Map(), byNamePackage: new Map() };
  for (const e of entries)
    (e.origin === "package" ? registry.byNamePackage : registry.byNameLocal).set(e.name!, e);
  const scopes = buildLibraryScopes(entries, [], registry);
  const sources: SourceContext[] = entries.flatMap((e) =>
    e.ast.statements.map((stmt) => ({ stmt, entry: e, scope: scopes.get(e.filePath)! })),
  );
  return { sources, findings: new AnswerOptionsValidator().validate(root.ast, sources) };
}

describe("named answer exception scope", () => {
  const noNegative = (text: string) => text.replace(/":\n  - not qualifying is[^\n]*\n/, '".\n');
  it("warns on an all-positive domain without requiring a consumer", () => {
    const result = new Validator().validate(ast(`library "P". ${noNegative(operand)}`));
    expect(result.errors).toEqual([]);
    expect(result.warnings.filter((w) => w.kind === "answer-options-all-qualifying")).toMatchObject([{ kind: "answer-options-all-qualifying" }]);
  });
  it("resolves a qualified operand's exceptions in its owner", () => {
    const root = entry("Root", producer.replace('"Answer" in', '"Shared"."Answer" in'));
    const shared = entry("Shared", operand);
    expect(scoped([root, shared], root).findings).toEqual([]);
    const bad = entry("Shared", operand.replace('not qualifying is `no`', 'not qualifying is `missing`'));
    expect(scoped([root, bad], root).findings).toMatchObject([{ kind: "answer-options-invalid-exception", libraryName: "Shared", filePath: "local/Shared.crl" }]);
  });
  it("keeps duplicate declaration ambiguity visible", () => {
    const raw = ast(`library "P". ${operand}${operand}${producer}`);
    expect(new Validator().validate(raw).errors.some((e) => e.kind === "duplicate-name")).toBe(true);
  });
  it("reports one question warning consistently in prepare and validate", () => {
    const raw = ast(`library "P". ${noNegative(operand)}${producer}`);
    const author = new Validator().validate(raw);
    const prepared = prepareSingleLibraryPublication(raw, { canonicalBase: "https://example.org", policyId: "p", localDomainId: "p" });
    expect(author.errors).toEqual([]);
    expect(prepared.diagnostics).toEqual([]);
    expect(author.warnings.filter((d) => d.kind === "answer-options-all-qualifying").map((d) => d.kind)).toEqual(["answer-options-all-qualifying"]);
    expect(prepared.warnings.map((d) => d.kind)).toEqual(["answer-options-all-qualifying"]);
  });
});

describe("finite terminology domain no-negative authoring feedback", () => {
  const literalOperand = (domain = '"Values"', offered = '"Values"') =>
    operand
      .replace("value domain is answer options.", `value domain is ${domain}.`)
      .replace(
        /- value from is[^\n]*\n(?:  - not qualifying is[^\n]*\n)*- shape reduction/,
        `- value from is ${offered}.\n- shape reduction`,
      );
  const literalProducer = producer.replace("in qualifying", 'in "All"');
  const values =
    'terminology "Values": - system is `urn:answers`. - code is `yes` display is `Yes`. - code is `no` display is `No`.\n';
  const all = values.replace('"Values"', '"All"');
  const warnKind = "publication-membership-no-negative-domain";
  const authorWarnings = (raw: CRL) =>
    new Validator().validate(raw).warnings.filter((warning) => warning.kind === warnKind);
  const prepare = (raw: CRL) =>
    prepareSingleLibraryPublication(raw, {
      canonicalBase: "https://example.org",
      policyId: "p",
      localDomainId: "p",
    });

  it("matches preparation for a finite enumerated terminology domain and named predicate", () => {
    const raw = ast(`library "P". ${literalOperand()}${literalProducer}${values}${all}`);
    const authoring = authorWarnings(raw);
    const prepared = prepare(raw);
    expect(prepared.diagnostics).toEqual([]);
    expect(authoring).toHaveLength(1);
    expect(authoring[0]).toMatchObject({
      kind: warnKind,
      conceptName: "Qualifies",
      message: prepared.warnings.find((w) => w.kind === warnKind)!.message,
    });
    expect(authoring[0].location?.start).toEqual({
      line: prepared.warnings.find((w) => w.kind === warnKind)!.line,
      column: prepared.warnings.find((w) => w.kind === warnKind)!.column,
    });
  });
  it("normalizes overlapping finite union terms across systems exactly once before comparing", () => {
    const second =
      'terminology "Second": - system is `urn:answers`. - code is `yes` display is `Yes`. - system is `urn:other`. - code is `extra`.\n';
    const raw = ast(
      `library "P". ${literalOperand('"Values", "Second"')}${literalProducer}${values}${second}${all.replace("- code is `no` display is `No`.", "- code is `no` display is `No`. - system is `urn:other`. - code is `extra`.")}`,
    );
    expect(prepare(raw).diagnostics).toEqual([]);
    expect(authorWarnings(raw)).toHaveLength(1);
    expect(prepare(raw).warnings.filter((w) => w.kind === warnKind)).toHaveLength(1);
  });
  it("expands an answer-options term backed by a finite named offered set", () => {
    const raw = ast(
      `library "P". ${literalOperand('answer options, "Second"')}${literalProducer}${values}${all}terminology "Second": - system is \`urn:answers\`. - code is \`yes\`.`,
    );
    expect(prepare(raw).diagnostics).toEqual([]);
    expect(authorWarnings(raw)).toHaveLength(1);
  });
  it("does not warn when the finite domain includes an actual negative value", () => {
    const raw = ast(
      `library "P". ${literalOperand()}${literalProducer}${values}${all.replace("- code is `no` display is `No`.", "")}`,
    );
    expect(prepare(raw).diagnostics).toEqual([]);
    expect(authorWarnings(raw)).toEqual([]);
    expect(prepare(raw).warnings.filter((w) => w.kind === warnKind)).toEqual([]);
  });
  it("resolves foreign operand domain terms in their owner and the predicate in its author's owner", () => {
    const root = entry(
      "Root",
      literalProducer.replace('"Answer" in', '"Shared"."Answer" in') +
        all +
        values.replace("urn:answers", "urn:wrong"),
    );
    const shared = entry("Shared", literalOperand() + values);
    const result = scoped([root, shared], root).findings.filter(
      (finding) => finding.kind === warnKind,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      conceptName: "Qualifies",
      filePath: "local/Root.crl",
      libraryName: "Root",
    });
  });
  it("resolves qualified finite union terms without substituting local same-named terminologies", () => {
    const root = entry(
      "Root",
      literalOperand('"Shared"."Values", "Shared"."Second"', '"Shared"."Values"') +
        literalProducer.replace('in "All"', 'in "Shared"."All"') +
        values.replace("urn:answers", "urn:wrong"),
    );
    const shared = entry(
      "Shared",
      values + all + 'terminology "Second": - system is `urn:answers`. - code is `yes` display is `Yes`.',
    );
    expect(
      scoped([root, shared], root).findings.filter((finding) => finding.kind === warnKind),
    ).toHaveLength(1);
  });
  it.each([
    ["unresolved", values.replace('"Values"', '"Missing"')],
    ["URI only", 'terminology "Values": - valueset is `https://example.org/ValueSet/remote`.'],
    ["mixed reference and codes", values + "- valueset is `https://example.org/ValueSet/remote`."],
  ])("does not manufacture a tautology for %s domain membership", (_label, term) => {
    const raw = ast(`library "P". ${literalOperand()}${literalProducer}${term}${all}`);
    expect(authorWarnings(raw)).toEqual([]);
    expect(prepare(raw).diagnostics.length).toBeGreaterThan(0);
  });
  it("does not turn duplicate resolved domain terms into a new warning", () => {
    const raw = ast(
      `library "P". ${literalOperand('"Values", "P"."Values"')}${literalProducer}${values}${all}`,
    );
    expect(authorWarnings(raw)).toEqual([]);
    expect(
      prepare(raw).diagnostics.some((error) => error.kind === "publication-domain-duplicate-term"),
    ).toBe(true);
  });
});
