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
- value from:
  - \`yes\` display is \`Listed\`, qualifying.
  - \`no\` display is \`None listed\`, not qualifying.
- shape reduction is most recent.
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

describe("selected membership authoring marker feedback", () => {
  it("reports an unmarked inline option before emit and anchors its source", () => {
    const raw = ast(`library "P".\n${operand.replace(", not qualifying", "")}${producer}`);
    const result = new Validator().validate(raw);
    expect(result.isValid).toBe(false);
    const errors = result.errors.filter((e) => e.kind === "answer-options-missing-marker");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("`no`");
    expect(errors[0].location.start.line).toBe(10);
  });
  it("accepts complete positive and negative inline classification", () => {
    const result = new Validator().validate(ast(`library "P".\n${operand}${producer}`));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
  it("warns but remains valid when the explicit answer-options domain has no negative value", () => {
    const result = new Validator().validate(
      ast(`library "P".\n${operand.replace("not qualifying", "qualifying")}${producer}`),
    );
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      kind: "publication-membership-no-negative-domain",
      severity: "warning",
    });
    expect(result.warnings[0].message).toContain("no negative value in its explicit domain");
  });
  it("allows an explicitly all-negative new domain without reviving the legacy positive-member requirement", () => {
    const result = new Validator().validate(
      ast(`library "P".\n${operand.replace(", qualifying", ", not qualifying")}${producer}`),
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
  it("requires inline classification for in-qualifying even when the offered set is named", () => {
    const raw = ast(
      `library "P". ${operand.replace(/- value from:[\s\S]*?- shape reduction/, '- value from "Options".\n- shape reduction')}${producer}terminology "Options": - system is \`urn:options\`. - code is \`yes\`.`,
    );
    expect(
      new Validator().validate(raw).errors.some((e) => e.kind === "answer-options-missing-marker"),
    ).toBe(true);
  });
  it("preserves legacy marker requirements when only the operand has migrated", () => {
    const raw = ast(
      `library "P". ${operand.replace(", not qualifying", "")}${producer.replace("- shape reduction is most recent.\n", "")}`,
    );
    const result = new Validator().validate(raw);
    expect(result.errors.some((e) => e.kind === "answer-options-missing-marker")).toBe(true);
    expect(
      result.errors.some((e) => "rule" in e && e.rule === "publication-unsupported-context"),
    ).toBe(true);
  });
  it("resolves a qualified same-named operand without marking another owner's declaration", () => {
    const root = entry(
      "Root",
      operand.replace(", not qualifying", "") +
        producer.replace('"Answer" in', '"Shared"."Answer" in'),
    );
    const shared = entry("Shared", operand);
    expect(scoped([root, shared], root).findings).toEqual([]);

    const badShared = entry("Shared", operand.replace(", not qualifying", ""));
    const result = scoped([root, badShared], root).findings;
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "answer-options-missing-marker",
      libraryName: "Shared",
      filePath: "local/Shared.crl",
    });
  });
  it("uses explicit package include precedence and does not leak obligation to a local namesake", () => {
    const root = entry(
      "Root",
      'include "Shared".\n' + producer.replace('"Answer" in', '"Shared"."Answer" in'),
    );
    const local = entry("Shared", operand.replace(", not qualifying", ""));
    const pkg = entry("Shared", operand, "package");
    expect(scoped([root, local, pkg], root).findings).toEqual([]);
    const badPkg = entry("Shared", operand.replace(", not qualifying", ""), "package");
    const result = scoped([root, local, badPkg], root).findings;
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "answer-options-missing-marker",
      filePath: "package/Shared.crl",
    });
  });
  it("does not resolve an un-included package for marker enforcement", () => {
    const root = entry("Root", producer.replace('"Answer" in', '"Shared"."Answer" in'));
    const pkg = entry("Shared", operand.replace(", not qualifying", ""), "package");
    const { findings, sources } = scoped([root, pkg], root);
    expect(findings).toEqual([]);
    expect(
      new Validator()
        .validate(root.ast, {}, sources)
        .errors.some((e) => e.kind === "external-library-not-included"),
    ).toBe(true);
  });
  it("a legacy qualified consumer also obligates only its actual owning target", () => {
    const legacyProducer = producer
      .replace("- shape reduction is most recent.\n", "")
      .replace('"Answer" in', '"Shared"."Answer" in');
    const root = entry("Root", operand.replace(", not qualifying", "") + legacyProducer);
    const shared = entry("Shared", operand.replace(", not qualifying", ""));
    const result = scoped([root, shared], root).findings;
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe("local/Shared.crl");
  });
  it("uses the same no-negative diagnostic kind in authoring and shared preparation", () => {
    const raw = ast(`library "P". ${operand.replace("not qualifying", "qualifying")}${producer}`);
    const authoring = new Validator().validate(raw).warnings;
    const prepared = prepareSingleLibraryPublication(raw, {
      canonicalBase: "https://example.org",
      policyId: "p",
      localDomainId: "p",
    });
    expect(prepared.diagnostics).toEqual([]);
    expect(authoring.map((warning) => warning.kind)).toEqual(
      prepared.warnings.map((warning) => warning.kind),
    );
    expect(authoring[0].kind).toBe("publication-membership-no-negative-domain");
  });
  it("preserves the legacy offered-options warning for an independently present legacy consumer", () => {
    const legacy = producer
      .replace('"Qualifies"', '"Legacy"')
      .replace("- shape reduction is most recent.\n", "");
    const raw = ast(
      `library "P". ${operand.replace("not qualifying", "qualifying")}${producer}${legacy}`,
    );
    const findings = new AnswerOptionsValidator().validate(raw);
    expect(findings.map((finding) => finding.kind).sort()).toEqual([
      "answer-options-all-qualifying",
      "publication-membership-no-negative-domain",
    ]);
  });
  it("a bare reference never acquires a same-named target from another source", () => {
    const root = entry("Root", producer);
    const shared = entry("Shared", operand.replace(", not qualifying", ""));
    const { findings, sources } = scoped([root, shared], root);
    const rawContext = createPublicationContext({
      libraries: [root, shared].map((e) => ({
        sourceIdentity: e.filePath,
        ast: e.ast,
        artifact: {},
      })),
      resolveLibrary: () => ({ kind: "not-visible" }),
    });
    expect(rawContext.lookupConcept(root.filePath, "Answer").kind).toBe("missing");
    expect(findings).toEqual([]);
    expect(
      new Validator()
        .validate(root.ast, {}, sources)
        .errors.some((e) => e.kind === "unresolved-reference"),
    ).toBe(true);
  });
  it("duplicate same-owner declarations are ambiguous in shared lookup and remain a primary authoring error", () => {
    const raw = ast(`library "P". ${operand}${operand.replace(", not qualifying", "")}${producer}`);
    const rawContext = createPublicationContext({
      libraries: [{ sourceIdentity: "p", ast: raw, artifact: {} }],
      resolveLibrary: () => ({ kind: "not-visible" }),
    });
    expect(rawContext.lookupConcept("p", "Answer").kind).toBe("ambiguous");
    const result = new Validator().validate(raw);
    expect(result.errors.some((e) => e.kind === "duplicate-name")).toBe(true);
    expect(result.errors.some((e) => e.kind === "answer-options-missing-marker")).toBe(false);
  });
  it("a wrong-kind declaration is not treated as an unmarked concept", () => {
    const raw = ast(
      `library "P". terminology "Answer": - system is \`urn:example\`. - code is \`a\`. ${producer}`,
    );
    const rawContext = createPublicationContext({
      libraries: [{ sourceIdentity: "p", ast: raw, artifact: {} }],
      resolveLibrary: () => ({ kind: "not-visible" }),
    });
    expect(rawContext.lookupConcept("p", "Answer").kind).toBe("wrong-kind");
    expect(new AnswerOptionsValidator().validate(raw)).toEqual([]);
    expect(new Validator().validate(raw).isValid).toBe(false);
  });
  it("declaration-only adaptation preserves intentionally partial validator source coverage", () => {
    const root = entry("Root", operand.replace(", not qualifying", "") + producer);
    const { sources } = scoped([root], root);
    const onlyProducer = sources.filter((source) => source.stmt.name === "Qualifies");
    // The source entry still holds the whole AST, but only supplied source statements are validated.
    expect(new AnswerOptionsValidator().validate(root.ast, onlyProducer)).toEqual([]);
    expect(
      new AnswerOptionsValidator()
        .validate(root.ast, sources)
        .some((finding) => finding.kind === "answer-options-missing-marker"),
    ).toBe(true);
  });
});

describe("finite terminology domain no-negative authoring feedback", () => {
  const literalOperand = (domain = '"Values"', offered = '"Values"') =>
    operand
      .replace("value domain is answer options.", `value domain is ${domain}.`)
      .replace(
        /- value from:[\s\S]*?- shape reduction/,
        `- value from ${offered}.\n- shape reduction`,
      );
  const literalProducer = producer.replace("in qualifying", 'in "All"');
  const values =
    'terminology "Values": - system is `urn:answers`. - code is `yes`. - code is `no`.\n';
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
      message: prepared.warnings[0].message,
    });
    expect(authoring[0].location?.start).toEqual({
      line: prepared.warnings[0].line,
      column: prepared.warnings[0].column,
    });
  });
  it("normalizes overlapping finite union terms across systems exactly once before comparing", () => {
    const second =
      'terminology "Second": - system is `urn:answers`. - code is `yes`. - system is `urn:other`. - code is `extra`.\n';
    const raw = ast(
      `library "P". ${literalOperand('"Values", "Second"')}${literalProducer}${values}${second}${all.replace("- code is `no`.", "- code is `no`. - system is `urn:other`. - code is `extra`.")}`,
    );
    expect(prepare(raw).diagnostics).toEqual([]);
    expect(authorWarnings(raw)).toHaveLength(1);
    expect(prepare(raw).warnings).toHaveLength(1);
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
      `library "P". ${literalOperand()}${literalProducer}${values}${all.replace("- code is `no`.", "")}`,
    );
    expect(prepare(raw).diagnostics).toEqual([]);
    expect(authorWarnings(raw)).toEqual([]);
    expect(prepare(raw).warnings).toEqual([]);
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
      values + all + 'terminology "Second": - system is `urn:answers`. - code is `yes`.',
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
