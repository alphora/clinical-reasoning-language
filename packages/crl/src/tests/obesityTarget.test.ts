// REFACTOR:grounded (#320, plan595): old BMI inputs are migration controls, not correctness authority.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect } from "vitest";
import { buildCRL, validateCRL } from "../index";
import { collectCodeIsConceptsInInferenceOrder } from "../fhir-emitter/caseFeatureCollection";
import { emitCQLImports } from "../imports/emit";
import { emitFhirDefFromPath } from "../fhir-emitter/closureOrchestrator";
import { resolveCelImports } from "../cel/imports";
import { runCel } from "../cre/run";
import type { Concept } from "../ast/types";
const fixture = path.resolve(__dirname, "fixtures/obesity");
describe("Obesity migration inputs", () => {
  it.each(["", "-recordset", "-layered"])("refuses obsolete BMI in policy%s", (suffix) => {
    const policy = path.join(fixture, `policy${suffix}.crl`),
      text = readFileSync(policy, "utf8");
    expect(
      validateCRL(text, { soft: true }).errors.some((e) =>
        e.message.includes("legacy BMI authoring is retired"),
      ),
    ).toBe(true);
    for (const result of [emitCQLImports(policy), emitFhirDefFromPath(policy)]) {
      expect(result.success).toBe(false);
      expect(result.errors?.some((e) => e.kind === "emit-bmi-form-retired")).toBe(true);
    }
    const cases = runCel(resolveCelImports(path.join(fixture, `cases${suffix}.cel`)));
    expect(cases.runs.length).toBeGreaterThan(0);
    for (const run of cases.runs) {
      expect(run.status).toBe("error");
      expect(run.produced).toEqual([]);
      expect(run.diagnostics.join("\n")).toContain("legacy BMI authoring is retired");
    }
  });
  it("keeps both operands reachable through the new producer and explicit validity anchor", () => {
    const ast = buildCRL(
      readFileSync(path.resolve(__dirname, "../emit/tests/fixtures/publication-bmi.crl"), "utf8"),
    ).result!;
    const concepts = ast.statements.filter((s): s is Concept => s.type === "Concept"),
      byName = new Map(concepts.map((c) => [c.name, c]));
    const codes = new Map(
      concepts.filter((c) => c.code !== undefined).map((c) => [c.name, c.code!]),
    );
    expect(
      collectCodeIsConceptsInInferenceOrder("Obese", ast.library.name, byName, codes)
        .map((c) => c.name)
        .sort(),
    ).toEqual(["BMI", "Height", "Weight"]);
  });
});
describe("case-feature structure independent of BMI syntax", () => {
  it("preserves answer carriers, history population exclusion, input profiles and nullable guards", () => {
    const parent = path.resolve(os.tmpdir()),
      dir = mkdtempSync(path.join(parent, "crl-bmi-structure-"));
    if (path.dirname(dir) !== parent || !path.basename(dir).startsWith("crl-bmi-structure-"))
      throw Error("Invalid test path");
    try {
      cpSync(path.resolve(__dirname, "../emit/tests/fixtures/producer-wire"), dir, {
        recursive: true,
      });
      const policy = path.join(dir, "policy.crl");
      let source = readFileSync(policy, "utf8");
      source = source.replace(
        'activity "A":',
        `concept "History":
- shape is RecordSet.
- type is Observation.
- value type is Quantity.
- code is \`history\`.
concept "Has History":
- shape is Scalar.
- type is Observation.
- value type is boolean.
- defined as exists ("History").
activity "A":`,
      );
      source = source.replace(
        '- when "Has Weight" then recommend activity "A".',
        '- when "Obese" then recommend activity "A".\n- when "Has History" then recommend activity "A".',
      );
      writeFileSync(policy, source);
      const cql = emitCQLImports(policy),
        fhir = emitFhirDefFromPath(policy, { date: new Date("2026-09-07T00:00:00Z") });
      expect(cql.success, JSON.stringify(cql.errors)).toBe(true);
      expect(fhir.success, JSON.stringify(fhir.errors)).toBe(true);
      const text = cql.cqlByLibrary!.map((l) => l.cql).join("\n");
      expect(text).toContain("FHIRHelpers.ToBoolean(");
      expect(text).not.toMatch(/Coalesce\(\s*\(?[A-Za-z]*Inferences\."Obese"/);
      const resources = fhir.resources!.map((w) => w.resource) as any[],
        profiles = resources.filter((r) => r.resourceType === "StructureDefinition");
      expect(profiles.map((p) => p.id.split("-").pop()).sort()).toEqual([
        "history",
        "obese",
        "weight",
      ]);
      const history = profiles.find((r) => r.id.endsWith("-history"));
      expect(history).toBeDefined();
      const merged = profiles.find((r) => r.id.endsWith("-obese"));
      const feature = merged.extension.find((e: any) =>
        e.url.includes("cpg-featureExpression"),
      ).valueExpression;
      // A merge's answer population must read its inference-layer result.
      expect(feature.reference).toMatch(/Inferences$/);
      expect(feature.expression).toBe("Obese");
      expect(
        (history.extension ?? []).some((e: any) => e.url.includes("cpg-featureExpression")),
      ).toBe(false);
      for (const profile of profiles) {
        expect(
          profile.differential.element.some(
            (e: any) => /\.value(\[x\]|[A-Z])/.test(e.path) && e.min === 1,
          ),
          profile.id,
        ).toBe(true);
        if (profile !== history)
          expect(
            (profile.extension ?? []).some((e: any) => e.url.includes("cpg-featureExpression")),
            profile.id,
          ).toBe(true);
      }
      const urls = new Set(profiles.map((r) => r.url)),
        inputs: string[] = [];
      const walk = (node: any): void => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        if (Array.isArray(node.input))
          for (const input of node.input) inputs.push(...(input.profile ?? []));
        Object.values(node).forEach(walk);
      };
      resources.filter((r) => r.resourceType === "PlanDefinition").forEach(walk);
      expect(inputs).toContain(history.url);
      // One input per reachable answer carrier, even when dependency references repeat.
      expect(inputs.sort()).toEqual([...urls].sort());
      for (const input of inputs) expect(urls.has(input), input).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
