import { describe, expect, it } from "vitest";
import { buildCRL } from "../../index";
import type { Concept, CRL } from "../../ast/types";
import { Validator } from "../../validator/validator";
import { createPublicationContext } from "../publicationContext";
import {
  adaptPublicationCandidate,
  preparePublicationProgram,
  prepareSingleLibraryPublication,
} from "../publicationProgram";
import {
  classifyPublicationMembership,
  interpretPublicationCodeableValue,
} from "../publicationDomain";
import { produceMembershipCandidate, publicationDerivedCandidateKey } from "../publicationProducer";
import { selectPublicationCandidate } from "../publicationSelection";

// REFACTOR:grounded (#320, review 562): these cases measure declared membership, not old raw-retrieve behavior.
const input = `concept "Answer":
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
const artifact = { canonicalBase: "https://example.org", localDomainId: "p", policyId: "policy" };
function ast(text = `library "P".\n${input}${producer}`): CRL {
  const built = buildCRL(text);
  expect(built.success, JSON.stringify(built.errors)).toBe(true);
  return built.result!;
}
function program(text?: string) {
  return prepareSingleLibraryPublication(ast(text), artifact);
}
function descriptors() {
  const p = program();
  expect(p.diagnostics).toEqual([]);
  return {
    operand: p.descriptors.find((d) => d.title === "Answer")!,
    output: p.descriptors.find((d) => d.title === "Qualifies")!,
  };
}
function resource(code?: string, extra: Record<string, unknown> = {}) {
  const { operand } = descriptors();
  return {
    resourceType: "Observation",
    id: "answer-1",
    status: "final",
    effectiveDateTime: "2026-01-01",
    ...(code === undefined
      ? {}
      : { valueCodeableConcept: { coding: [{ system: operand.valueDomain![0].system, code }] } }),
    ...extra,
  };
}

describe("explicit interpreted value domain frontend", () => {
  it("preserves a qualified union and term locations", () => {
    const raw = ast(
      `library "P".\n${input.replace("value domain is answer options.", 'value domain is answer options, "Shared"."Values".')}`,
    );
    const domain = (raw.statements[0] as Concept).valueDomain!;
    expect(domain.type).toBe("ValueDomain");
    expect(domain.terms).toHaveLength(2);
    expect(domain.terms[1]).toMatchObject({
      type: "TerminologyDomainTerm",
      terminologyName: { type: "QualifiedReference", libraryName: "Shared", name: "Values" },
    });
    expect(domain.terms[0].location.start.line).toBeGreaterThan(1);
  });
  it.each([
    input.replace(
      "value domain is answer options.",
      "value domain is answer options, answer options.",
    ),
    input + "- value domain is answer options.\n",
  ])("rejects duplicate authored clauses or terms", (body) => {
    expect(buildCRL(`library "P".\n${body}`).success).toBe(false);
  });
  it("rejects domain placement on retained legacy forms", () => {
    const raw = ast(
      `library "P".\n${input.replace("- shape reduction is most recent.\n", "").replace("shape is Record", "shape is Scalar")}`,
    );
    expect(
      new Validator()
        .validate(raw)
        .errors.some((e) => "rule" in e && e.rule === "publication-value-domain-placement"),
    ).toBe(true);
  });
  it("accepts complete new producers with optional own local answer and no tie preference", () => {
    for (const body of [
      producer,
      producer.replace("- definition is", "- code is `qualifies`.\n- definition is"),
    ]) {
      const raw = ast(`library "P".\n${input}${body}`);
      expect(new Validator().validate(raw).errors).toEqual([]);
      expect(prepareSingleLibraryPublication(raw, artifact).diagnostics).toEqual([]);
    }
  });
  it("retains legacy coded-membership refusal for half-migrated forms", () => {
    const raw = ast(
      `library "P".\n${input}${producer.replace("- definition is", "- code is `qualifies`.\n- definition is").replace("- shape reduction is most recent.\n", "")}`,
    );
    expect(
      new Validator()
        .validate(raw)
        .errors.some((e) => e.kind === "membership-predicate-not-assertable"),
    ).toBe(true);
  });
});

describe("qualified finite domain preparation", () => {
  it("requires profile metadata only when constructing a coded producer", () => {
    const withoutPolicy = { canonicalBase: artifact.canonicalBase, localDomainId: artifact.localDomainId };
    const coded = ast(`library "P".\n${input}${producer.replace("- definition is", "- code is `qualifies`.\n- definition is")}`);
    expect(prepareSingleLibraryPublication(coded, withoutPolicy).diagnostics).toContainEqual(expect.objectContaining({
      kind: "publication-producer-profile-identity-missing",
    }));
    expect(prepareSingleLibraryPublication(coded, artifact).diagnostics).toEqual([]);
    expect(prepareSingleLibraryPublication(ast(), withoutPolicy).diagnostics).toEqual([]);
  });

  // REFACTOR:grounded (#320, code review 563): mixed terminology is a union
  // with a referenced set, not a complete expansion of only its explicit codes.
  it.each(["domain", "qualifying", "offered"])("rejects unresolved mixed membership used as %s", (site) => {
    const mixed = 'terminology "Mixed": - valueset is `https://external/vs`. - system is `urn:external`. - code is `yes`.\n';
    const body = site === "domain" ? input.replace("value domain is answer options.", 'value domain is "Mixed".')
      : site === "offered" ? input.replace(/- value from:[\s\S]*?- shape reduction/, '- value from "Mixed".\n- shape reduction')
      : input;
    const definition = site === "qualifying" ? producer.replace("in qualifying", 'in "Mixed"') : producer;
    const result = program(`library "P".\n${body}${definition}${mixed}`);
    expect(result.diagnostics.some((d) => d.kind === "publication-domain-not-finite" && d.message.includes("mixed with explicit codes"))).toBe(true);
    expect(result.descriptors.find((d) => d.title === "Qualifies")).toBeUndefined();
  });

  it.each([
    [input.replace("- value domain is answer options.\n", ""), "publication-unsupported-form"],
    [
      input.replace("answer options.", '"Stub".') +
        'terminology "Stub": - valueset is `https://external/vs`.\n',
      "publication-domain-not-finite",
    ],
    [input.replace(", not qualifying", ""), "publication-membership-marker-required"],
    [
      input.replace("answer options.", '"OnlyYes".') +
        'terminology "OnlyYes": - system is `other`. - code is `yes`.\n',
      "publication-domain-answer-coverage",
    ],
  ])("refuses %s with %s", (body, kind) => {
    expect(
      program(`library "P".\n${body}${producer}`).diagnostics.some((d) => d.kind === kind),
    ).toBe(true);
  });
  it("uses exact owning qualified domain and predicate; sibling names cannot substitute", () => {
    const shared = ast(
      'library "Shared". terminology "Domain": - system is `urn:shared`. - code is `yes`. - code is `no`. terminology "Positive": - system is `urn:shared`. - code is `yes`.',
    );
    const local = ast(
      `library "P".\n${input.replace("- value domain is answer options.", '- value domain is "Alias"."Domain".').replace(/- value from:[\s\S]*?- shape reduction/, "- shape reduction")}${producer.replace("in qualifying", 'in "Alias"."Positive"')}terminology "Domain": - system is \`urn:wrong\`. - code is \`wrong\`.`,
    );
    const p = preparePublicationProgram(
      createPublicationContext({
        libraries: [
          { sourceIdentity: "p", ast: local, artifact },
          { sourceIdentity: "shared", ast: shared, artifact: { ...artifact, policyId: "shared" } },
        ],
        resolveLibrary: (from, qualifier) =>
          from === "p" && qualifier === "Alias"
            ? { kind: "resolved", sourceIdentity: "shared" }
            : { kind: "not-visible" },
      }),
    );
    expect(p.diagnostics).toEqual([]);
    expect(p.descriptors.find((d) => d.title === "Answer")!.valueDomain).toEqual([
      { system: "urn:shared", code: "no" },
      { system: "urn:shared", code: "yes" },
    ]);
    expect(p.descriptors.find((d) => d.title === "Qualifies")!.producer!.qualifying).toEqual([
      { system: "urn:shared", code: "yes" },
    ]);
  });
  it("rejects repeated resolved terminology terms and predicate outside domain", () => {
    const domain =
      'terminology "D": - system is `urn:x`. - code is `a`. terminology "Outside": - system is `urn:x`. - code is `b`.';
    const operand = input
      .replace("- value domain is answer options.", '- value domain is "D", "P"."D".')
      .replace(/- value from:[\s\S]*?- shape reduction/, "- shape reduction");
    expect(
      program(`library "P". ${operand}${domain}`).diagnostics.some(
        (d) => d.kind === "publication-domain-duplicate-term",
      ),
    ).toBe(true);
    expect(
      program(
        `library "P". ${operand.replace(', "P"."D"', "")}${producer.replace("in qualifying", 'in "Outside"')}${domain}`,
      ).diagnostics.some((d) => d.kind === "publication-membership-domain-coverage"),
    ).toBe(true);
  });
  it("warns but admits a domain with no negative member", () => {
    const p = program(`library "P". ${input.replace("not qualifying", "qualifying")}${producer}`);
    expect(p.diagnostics).toEqual([]);
    expect(p.warnings.map((w) => w.kind)).toEqual(["publication-membership-no-negative-domain"]);
  });
  it("rejects a Boolean downstream operand and cycles explicitly", () => {
    const tail = producer
      .replaceAll('"Qualifies"', '"Downstream"')
      .replace('"Answer" in', '"Qualifies" in');
    expect(
      program(`library "P". ${input}${producer}${tail}`).diagnostics.some(
        (d) => d.kind === "publication-membership-operand-unsupported",
      ),
    ).toBe(true);
    expect(
      program(`library "P". ${producer.replace('"Answer" in', '"Qualifies" in')}`).diagnostics.some(
        (d) => d.kind === "publication-dependency-cycle",
      ),
    ).toBe(true);
  });
});

describe("selected coded value classification and inferred candidate", () => {
  it.each([
    ["yes", true],
    ["no", false],
  ] as const)("classifies %s preserving %s and actual validity", (code, expected) => {
    const { operand, output } = descriptors();
    const raw = resource(code);
    const adapted = adaptPublicationCandidate(operand, raw);
    if (adapted.kind !== "candidate") throw new Error(adapted.message);
    const produced = produceMembershipCandidate(output, adapted.candidate, "Patient/p");
    expect(produced.kind).toBe("candidate");
    if (produced.kind !== "candidate") throw new Error("not produced");
    expect(produced.candidate.resource).toEqual({
      resourceType: "Observation",
      status: "final",
      subject: { reference: "Patient/p" },
      code: { text: "Qualifies" },
      valueBoolean: expected,
      effectiveDateTime: "2026-01-01",
      derivedFrom: [{ reference: "Observation/answer-1" }],
    });
    expect(produced.candidate).toMatchObject({
      arm: "inferred",
      validity: "2026-01-01",
      key: publicationDerivedCandidateKey(output.producer!.producerId, adapted.candidate.key),
    });
    expect(produced.candidate.resource.id).toBeUndefined();
    expect(produced.computationalLineage.operandKey).toBe(adapted.candidate.key);
  });
  it("distinguishes missing operand from an unknown undated operand", () => {
    const { output } = descriptors();
    expect(produceMembershipCandidate(output, undefined, "Patient/p")).toEqual({ kind: "none" });
    const produced = produceMembershipCandidate(
      output,
      {
        key: "idless",
        contributorId: "source",
        arm: "inferred",
        resource: { resourceType: "Observation", status: "final" },
      },
      "Patient/p",
    );
    expect(produced.kind).toBe("candidate");
    if (produced.kind !== "candidate") throw new Error("not produced");
    expect(produced.candidate.resource).toEqual({
      resourceType: "Observation",
      status: "final",
      subject: { reference: "Patient/p" },
      code: { text: "Qualifies" },
    });
    expect(produced.candidate.validity).toBeUndefined();
    expect(produced.computationalLineage.operandKey).toBe("idless");
  });
  it("ignores foreign/display/version codings but rejects conflict or no domain coding", () => {
    const { operand, output } = descriptors();
    const system = operand.valueDomain![0].system;
    for (const reverse of [false, true]) {
      const coding = [
        { system: "urn:foreign", code: "no" },
        { system, code: "yes", version: "old", display: "No" },
      ];
      if (reverse) coding.reverse();
      expect(
        classifyPublicationMembership(
          output.producer!,
          resource(undefined, { valueCodeableConcept: { coding } }),
        ),
      ).toEqual({ kind: "known", value: true });
      expect(
        classifyPublicationMembership(
          output.producer!,
          resource(undefined, {
            valueCodeableConcept: { coding: [...coding, { system, code: "no" }] },
          }),
        ),
      ).toMatchObject({ kind: "error", code: "publication-ambiguous-coded-value" });
    }
    expect(
      interpretPublicationCodeableValue(operand.valueDomain!, resource("unrecognized")),
    ).toMatchObject({ kind: "error", code: "publication-uninterpretable-value" });
  });
  it("does not interpret an older losing value", () => {
    const { operand, output } = descriptors();
    const rows = [
      resource("unrecognized", { id: "old" }),
      resource("yes", { id: "new", effectiveDateTime: "2026-02-01" }),
    ].map((r) => adaptPublicationCandidate(operand, r));
    if (rows.some((r) => r.kind !== "candidate")) throw new Error("bad candidates");
    const result = selectPublicationCandidate(
      rows.flatMap((r) => (r.kind === "candidate" ? [r.candidate] : [])),
      { conceptId: operand.conceptId, equalTime: "error" },
    );
    expect(result.state).toBe("selected");
    if (result.state !== "selected") throw new Error("not selected");
    expect(produceMembershipCandidate(output, result.candidate, "Patient/p")).toMatchObject({
      kind: "candidate",
      candidate: { resource: { valueBoolean: true } },
    });
  });
  it("coded output uses its own analytical identity, profile and computed identity", () => {
    const p = program(
      `library "P". ${input}${producer.replace("- definition is", "- code is `result`.\n- definition is")}`,
    );
    const output = p.descriptors.find((d) => d.title === "Qualifies")!;
    const produced = produceMembershipCandidate(
      output,
      { key: "x", arm: "inferred", contributorId: "x", resource: resource("no") },
      "Patient/p",
    );
    expect(produced).toMatchObject({
      kind: "candidate",
      candidate: {
        arm: "inferred",
        resource: {
          valueBoolean: false,
          meta: { profile: [output.profileUrl] },
          code: { coding: [output.localCode] },
        },
      },
    });
    expect(output.producer!.producerId).not.toBe(output.conceptId);
  });
  it("portable producer identity survives source relocation and distinguishes package versions", () => {
    const raw = ast();
    const get = (path: string, version: string) =>
      preparePublicationProgram(
        createPublicationContext({
          libraries: [
            { sourceIdentity: path, ast: raw, artifact, packageIdentity: { name: "pkg", version } },
          ],
          resolveLibrary: () => ({ kind: "not-visible" }),
        }),
      ).descriptors.find((d) => d.title === "Qualifies")!.producer!.producerId;
    expect(get("C:/private/p.crl", "1")).toBe(get("E:/other/p.crl", "1"));
    expect(get("p", "1")).not.toBe(get("p", "2"));
    expect(get("C:/private/p.crl", "1")).not.toContain("private");
    expect(publicationDerivedCandidateKey("a", "bc")).not.toBe(
      publicationDerivedCandidateKey("ab", "c"),
    );
  });
  it("same-named coded publications in different owning domains retain distinct profiles", () => {
    const p = preparePublicationProgram(
      createPublicationContext({
        libraries: [
          { sourceIdentity: "p", ast: ast(), artifact },
          {
            sourceIdentity: "q",
            ast: ast(`library "Q". ${input}${producer}`),
            artifact: { ...artifact, localDomainId: "q" },
          },
        ],
        resolveLibrary: () => ({ kind: "not-visible" }),
      }),
    );
    expect(p.diagnostics).toEqual([]);
    const inputs = p.descriptors.filter((d) => d.title === "Answer");
    expect(new Set(inputs.map((d) => d.profileUrl)).size).toBe(2);
    expect(new Set(inputs.map((d) => d.localCode!.system)).size).toBe(2);
  });
  it("single-library preparation retains available owning package identity", () => {
    const raw = ast();
    const first = prepareSingleLibraryPublication(raw, artifact, "old/path", { name: "pkg", version: "1" });
    const relocated = prepareSingleLibraryPublication(raw, artifact, "new/path", { name: "pkg", version: "1" });
    const next = prepareSingleLibraryPublication(raw, artifact, "new/path", { name: "pkg", version: "2" });
    const output = (p: typeof first) => p.descriptors.find((d) => d.title === "Qualifies")!;
    expect(first.diagnostics).toEqual([]);
    expect(output(first).identity.packageIdentity).toEqual({ name: "pkg", version: "1" });
    expect(output(first).producer!.producerId).toBe(output(relocated).producer!.producerId);
    expect(output(first).producer!.producerId).not.toBe(output(next).producer!.producerId);
  });
});
