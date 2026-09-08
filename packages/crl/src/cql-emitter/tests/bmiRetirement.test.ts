// REFACTOR:grounded (#320, plan595): retirement cannot succeed through an alternate entry point.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { buildCRL, validateCRL } from "../../index";
import { emitCQLFromAST } from "../emitCQL";
import { emitCQLImports } from "../../imports/emit";
import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
import { resolveCelImports } from "../../cel/imports";
import { runCel } from "../../cre/run";
import { prepareSingleLibraryPublication } from "../../emit/publicationProgram";
import { bmiRetirementReason } from "../../template-match/bmiPublication";
import { PUBLICATION_REFERENCE_CRL } from "../../authoring-kit/reference";

const fixture = path.resolve(__dirname, "../../emit/tests/fixtures/publication-imports");
const artifact = {
  canonicalBase: "http://example.org/imports",
  localDomainId: "publication-imports",
  policyId: "publication-imports",
};
function project(check: (dir: string) => void) {
  const parent = path.resolve(os.tmpdir()),
    dir = mkdtempSync(path.join(parent, "crl-bmi-retirement-"));
  if (path.dirname(dir) !== parent || !path.basename(dir).startsWith("crl-bmi-retirement-"))
    throw Error("Invalid test path");
  try {
    cpSync(fixture, dir, { recursive: true });
    check(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const legacy = [
  'body mass index of "W" and "H"',
  'body mass index of "W" and "H", then most recent this',
  'most recent body mass index of "W" and "H"',
  'body mass index of "Other"."W" and "Other"."H"',
  'body mass index of "W" and "H" using validity of',
];
describe("BMI retirement", () => {
  it("explains the ValueSet migration blocker without suggesting arbitrary replacement codes", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../emit/tests/fixtures/publication-bmi.crl"),
      "utf8",
    )
      .replace(/\r\n/g, "\n")
      .replace(
        "- system is `http://loinc.org`.\n- code is `29463-7`.",
        "- valueset is `http://example.org/ValueSet/weight`.",
      );
    expect(source).toContain("valueset is");
    const program = prepareSingleLibraryPublication(buildCRL(source).result!, artifact);
    expect(
      program.diagnostics.some(
        (d) =>
          d.kind === "publication-domain-not-finite" &&
          d.message.includes("substituting arbitrary codes changes its meaning"),
      ),
    ).toBe(true);
  });
  it.each(legacy)("refuses %s through validation, raw emit and preparation", (definition) => {
    const source = `library "Retired".\nconcept "BMI":\n- shape is Record.\n- type is Observation.\n- value type is Quantity.\n- code is \`bmi\`.\n- definition is ${definition}.`;
    const ast = buildCRL(source);
    expect(ast.success).toBe(true);
    expect(
      validateCRL(source, { soft: true }).errors.some((e) =>
        e.message.includes("legacy BMI authoring is retired"),
      ),
    ).toBe(true);
    const emitted = emitCQLFromAST(ast.result!, artifact);
    expect(emitted.success).toBe(false);
    expect(emitted.errors?.some((e) => e.kind === "emit-bmi-form-retired")).toBe(true);
    expect(
      prepareSingleLibraryPublication(ast.result!, artifact).diagnostics.some(
        (e) => e.kind === "emit-bmi-form-retired",
      ),
    ).toBe(true);
  });
  it("refuses an included legacy declaration in both emit lanes and non-pause CRE", () =>
    project((dir) => {
      const file = path.join(dir, "bmi.crl");
      writeFileSync(
        file,
        readFileSync(file, "utf8")
          .replace(' using validity of "Weight Library"."Measurement"', "")
          .replace("- shape reduction is most recent.", ""),
      );
      for (const result of [
        emitCQLImports(path.join(dir, "policy.crl")),
        emitFhirDefFromPath(path.join(dir, "policy.crl")),
      ]) {
        expect(result.success).toBe(false);
        expect(result.errors?.some((e) => e.kind === "emit-bmi-form-retired")).toBe(true);
      }
      const result = runCel(resolveCelImports(path.join(dir, "cases.cel")));
      expect(result.runs.length).toBe(8);
      for (const run of result.runs) {
        expect(run.status).toBe("error");
        expect(run.produced).toEqual([]);
        expect(run.diagnostics.join("\n")).toContain("BMI Library");
      }
    }));
  it("does not mistake quoted names or threshold comparisons for BMI syntax", () => {
    for (const definition of [
      "\"Body Mass Index\" at least 30 'kg/m2'",
      "\"BMI\" at least 30 'kg/m2'",
    ]) {
      const c = buildCRL(
        `library "T".\nconcept "C":\n- type is Observation.\n- value type is boolean.\n- definition is ${definition}.`,
      ).result!.statements[0];
      expect(c.type).toBe("Concept");
      expect(bmiRetirementReason(c as any)).toBeUndefined();
    }
  });
  it.each(["", "- shape is Scalar.", "- shape is Record."])(
    "refuses an explicit BMI definition without independent selection (%s)",
    (shape) => {
      const text = `library "T".
concept "BMI":
${shape}
- type is Observation.
- value type is Quantity.
- definition is body mass index of "W" and "H" using validity of "W".`;
      const ast = buildCRL(text);
      expect(ast.success).toBe(true);
      const program = prepareSingleLibraryPublication(ast.result!, artifact);
      expect(program.lookup("T", "BMI").kind).toBe("error");
      expect(
        emitCQLFromAST(ast.result!, artifact).errors?.some(
          (e) => e.kind === "emit-bmi-form-retired",
        ),
      ).toBe(true);
    },
  );
  it("refuses BMI hidden in a source projection", () => {
    const text = `library "T".
terminology "Source":
- system is \`http://example.org/test\`.
- code is \`measurement\`.
concept "BMI":
- shape is Record.
- type is Observation.
- value type is Quantity.
- shape reduction is most recent.
- source representation:
  - type is Observation.
  - coded from "Source".
  - value projection is body mass index of "W" and "H".`;
    const ast = buildCRL(text);
    expect(ast.success).toBe(true);
    expect(
      emitCQLFromAST(ast.result!, artifact).errors?.some((e) => e.kind === "emit-bmi-form-retired"),
    ).toBe(true);
  });
  it("does not reject unrelated registry siblings", () =>
    project((dir) => {
      writeFileSync(
        path.join(dir, "unrelated.crl"),
        `library "Unrelated".
concept "Old BMI":
- type is Observation.
- value type is Quantity.
- definition is body mass index of "W" and "H".`,
      );
      expect(emitCQLImports(path.join(dir, "policy.crl")).success).toBe(true);
      const result = runCel(resolveCelImports(path.join(dir, "cases.cel")));
      expect(result.runs).toHaveLength(8);
      expect(result.runs.every((r) => r.status === "pass")).toBe(true);
    }));
  it("author validation rejects a resolved but unrelated validity operand", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../emit/tests/fixtures/publication-bmi.crl"),
      "utf8",
    );
    const changed =
      source.replace('using validity of "Weight"', 'using validity of "Other"') +
      `
concept "Other":
- shape is Record.
- type is Observation.
- value type is Quantity.
- code is \`other\`.
- shape reduction is most recent.`;
    expect(
      validateCRL(changed, { soft: true }).errors?.some((e) =>
        e.message.includes("BMI validity must name one of its two operands"),
      ),
    ).toBe(true);
    expect(emitCQLFromAST(buildCRL(changed).result!, artifact).success).toBe(false);
  });
  it("rejects an included but unread legacy library as part of the emitted artifact", () =>
    project((dir) => {
      writeFileSync(
        path.join(dir, "unused.crl"),
        `library "Unused".
concept "Old BMI":
- type is Observation.
- value type is Quantity.
- definition is body mass index of "W" and "H".`,
      );
      const policy = path.join(dir, "policy.crl");
      writeFileSync(
        policy,
        readFileSync(policy, "utf8").replace(
          'library "Policy".',
          'library "Policy".\ninclude "Unused".',
        ),
      );
      for (const result of [emitCQLImports(policy), emitFhirDefFromPath(policy)]) {
        expect(result.success).toBe(false);
        expect(
          result.errors?.some(
            (e) => e.kind === "emit-bmi-form-retired" && e.message.includes("Unused"),
          ),
        ).toBe(true);
      }
      const result = runCel(resolveCelImports(path.join(dir, "cases.cel")));
      expect(result.runs).toHaveLength(8);
      for (const run of result.runs) {
        expect(run.status).toBe("error");
        expect(run.produced).toEqual([]);
        expect(run.diagnostics.some((d) => d.startsWith("emit-bmi-form-retired:"))).toBe(true);
      }
    }));
  it("reports retirement before dependent preparation regardless of declaration order", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../emit/tests/fixtures/publication-bmi.crl"),
      "utf8",
    ).replace(' using validity of "Weight"', "");
    const ast = buildCRL(source).result!;
    for (const statements of [ast.statements, [...ast.statements].reverse()]) {
      const program = prepareSingleLibraryPublication({ ...ast, statements }, artifact);
      expect(program.diagnostics[0].kind).toBe("emit-bmi-form-retired");
    }
  });
  it("emits each BMI answer dependency once despite the repeated validity reference", () =>
    project((dir) => {
      const file = path.join(dir, "single.crl");
      writeFileSync(
        file,
        readFileSync(
          path.resolve(__dirname, "../../emit/tests/fixtures/publication-bmi.crl"),
          "utf8",
        ),
      );
      const emitted = emitFhirDefFromPath(file);
      expect(emitted.success, JSON.stringify(emitted.errors)).toBe(true);
      const resources = emitted.resources.map((r) => r.resource) as any[];
      const urls = resources
        .filter((r) => r.resourceType === "StructureDefinition")
        .map((r) => r.url)
        .sort();
      expect(urls).toHaveLength(3);
      const inputs: string[][] = [];
      const visit = (node: any): void => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) {
          node.forEach(visit);
          return;
        }
        if (node.input?.length) inputs.push(node.input.flatMap((i: any) => i.profile ?? []));
        Object.values(node).forEach(visit);
      };
      resources.filter((r) => r.resourceType === "PlanDefinition").forEach(visit);
      expect(inputs.length).toBeGreaterThan(0);
      for (const profiles of inputs) expect(profiles.sort()).toEqual(urls);
    }));
  it.each([
    ['body mass index of "Weight"', 'body mass index of "Missing"'],
    ['"BMI" at least', '"Missing" at least'],
    ['"BMI" at least', '"Absent Library"."BMI" at least'],
  ])("author validation refuses unresolved numeric operands (%s)", (from, to) => {
    const source = readFileSync(
      path.resolve(__dirname, "../../emit/tests/fixtures/publication-bmi.crl"),
      "utf8",
    ).replace(from, to);
    // Strict validation rejects unresolved references; soft editor mode intentionally relaxes them.
    expect(validateCRL(source).errors?.length ?? 0, to).toBeGreaterThan(0);
  });
  it("the actual kit BMI subsection prepares and emits with synthetic finite sources", () => {
    const ast = buildCRL(PUBLICATION_REFERENCE_CRL).result!;
    const names = new Set([
      "Height VS",
      "Weight VS",
      "Clinical BMI",
      "Height",
      "Weight",
      "BMI",
      "High BMI",
    ]);
    const section = {
      ...ast,
      statements: ast.statements.filter((s) => "name" in s && names.has(s.name)),
    };
    const program = prepareSingleLibraryPublication(section, artifact);
    expect(program.diagnostics).toEqual([]);
    expect(program.descriptors.map((d) => d.title).sort()).toEqual([
      "BMI",
      "Height",
      "High BMI",
      "Weight",
    ]);
    expect(emitCQLFromAST(section, artifact).success).toBe(true);
    // The complete selected-publication example also prepares without diagnostics.
    expect(prepareSingleLibraryPublication(ast, artifact).diagnostics).toEqual([]);
  });
  // @kit bmi-publication:kit-finite-source-and-missing
  it("runs the unchanged kit BMI subsection against finite source data and missing data", () =>
    project((dir) => {
      const source = PUBLICATION_REFERENCE_CRL;
      const terms = source.slice(
        source.indexOf('terminology "Height VS":'),
        source.indexOf('concept "Height":'),
      );
      const concepts = source.slice(
        source.indexOf('concept "Height":'),
        source.indexOf("// ============ Patient age"),
      );
      // Native evidence in review596 executed these exact subsection bytes in its own
      // synthetic wrapper; this CRE policy wrapper is not that native artifact.
      // A change requires renewed native evidence before updating this pin.
      expect(
        createHash("sha256")
          .update(`${terms}\n${concepts}`.trim().replace(/\r\n/g, "\n"))
          .digest("hex"),
      ).toBe("20ffb0f9cdab6a1dbc558d6dfc5aaf2e8d42fbe0eabb5760ce11a185a0e589cf");
      const policy = `library "Kit BMI".\n${terms}\n${concepts}
activity "Approve":
- request CPGCommunicationRequest.
- with \`APPROVED\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`DENIED\`.
decision "D":
first:
- when "High BMI" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
      writeFileSync(path.join(dir, "kit.crl"), policy);
      writeFileSync(
        path.join(dir, "kit.cel"),
        `library "Kit Cases".
covers "Kit BMI".
fact "P":
- defined by "Patient".
fact "W":
- defined by "Observation".
- code is "http://example.org/synthetic-measurements|weight".
- value is 120 'kg'.
- date is "2026-09-01".
fact "H":
- defined by "Observation".
- code is "http://example.org/synthetic-measurements|height".
- value is 2 'm'.
- date is "2026-09-01".
fact "Low W":
- defined by "Observation".
- code is "http://example.org/synthetic-measurements|weight".
- value is 80 'kg'.
- date is "2026-09-02".
case "Qualifying":
- subject is "P".
- fact is "W".
- fact is "H".
- result is "D" is "Approve".
case "Below threshold":
- subject is "P".
- fact is "W".
- fact is "H".
- fact is "Low W".
- result is "D" is "Deny".
case "Missing height":
- subject is "P".
- fact is "W".
- result is "D" is pause.`,
      );
      expect(validateCRL(policy, { soft: true }).errors ?? []).toEqual([]);
      expect(emitCQLImports(path.join(dir, "kit.crl")).success).toBe(true);
      expect(emitFhirDefFromPath(path.join(dir, "kit.crl")).success).toBe(true);
      const result = runCel(resolveCelImports(path.join(dir, "kit.cel")));
      expect(result.runs).toHaveLength(3);
      expect(result.runs.map((r) => ({ status: r.status, diagnostics: r.diagnostics }))).toEqual([
        { status: "pass", diagnostics: [] },
        { status: "pass", diagnostics: [] },
        { status: "pass", diagnostics: [] },
      ]);
    }));
});
