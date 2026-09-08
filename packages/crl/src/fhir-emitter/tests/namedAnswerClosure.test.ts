import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emitFhirDefFromPath } from "../closureOrchestrator";
import { emitCQLImports } from "../../imports/emit";
import { resolveCelImports } from "../../cel/imports";
import { emitCelToFhir } from "../../cel/emitter/emitFhir";
import { runCel } from "../../cre/run";
import { validateCRLImports } from "../../imports/validate";
import { writeFhirResources } from "../writer";

import { ANSWER_EXAMPLE_BASE as base, ANSWER_EXAMPLE_TERMS as terms, ANSWER_EXAMPLE_CEL, answerExampleSource } from "../../authoring-kit/answerExample";
function source(publication: boolean, name = "Complaint") {
  const current = answerExampleSource(name);
  return publication ? current : current
    .replace("- value domain is answer options.\n- shape reduction is most recent.", "- definition is most recent this.")
    .replace("- shape is Record.\n- type is Observation.\n- shape reduction is most recent.", "- shape is Scalar.");
}
function withFixture(publication: boolean, fn: (file: string, directory: string) => void, rename?: string, extraTerms = "") {
  const directory = mkdtempSync(join(tmpdir(), "crl-named-answer-closure-"));
  try {
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "answers", version: "1.0.0", crl: { canonicalBase: base } }));
    const file = join(directory, "policy.crl");
    writeFileSync(file, source(publication, rename));
    writeFileSync(join(directory, "shared.crl"), `library "Shared".\n${terms}${extraTerms}`);
    fn(file, directory);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
describe("named answer closure ownership and imported classification", () => {
  it("replaces the written CodeSystem from current CRL without retaining a removed code", () => {
    withFixture(true, (file, directory) => {
      const shared = join(directory, "shared.crl"), output = join(directory, "output");
      const extra = '- code is `retired` display is `Retired answer`.\n';
      writeFileSync(shared, `library "Shared".\n${terms.replace('- system is `urn:standard`.', extra + '- system is `urn:standard`.')}`);
      const first = emitFhirDefFromPath(file, { date: "2026-09-08" });
      expect(first.success).toBe(true); writeFhirResources(first, output);
      const written = join(output, "CodeSystem", "p-complaint-answer-codes.json");
      expect(JSON.parse(readFileSync(written, "utf8")).concept.some((c: any) => c.code === "retired")).toBe(true);
      writeFileSync(shared, `library "Shared".\n${terms}`);
      const second = emitFhirDefFromPath(file, { date: "2026-09-08" });
      expect(second.success).toBe(true); writeFhirResources(second, output);
      expect(JSON.parse(readFileSync(written, "utf8")).concept).toEqual([{ code: "none", display: "None" }]);
    });
  });
  it.each(["additional", "consistent", "conflicting"])("checks members of an already emitted local system (%s)", (mode) => {
    withFixture(true, (file, directory) => {
      const code = mode === "additional" ? "none" : "complaint";
      const display = mode === "conflicting" ? "Wrong display" : mode === "consistent" ? "Complaint" : "None";
      writeFileSync(join(directory, "shared.crl"), `library "Shared".\nterminology "Choices": - system is \`${base}/CodeSystem/answers-local\`. - code is \`${code}\` display is \`${display}\`.`);
      writeFileSync(file, source(true).replace('not qualifying is `none`', `not qualifying is \`${code}\``));
      const result = emitFhirDefFromPath(file, { date: "2026-09-08" });
      expect(result.success, JSON.stringify(result.errors)).toBe(mode !== "conflicting");
      if (mode === "conflicting") expect(result.errors.some((e) => e.kind === "answer-options-conflicting-display")).toBe(true);
      else {
        const systems = result.resources.filter((r) => r.resourceType === "CodeSystem" && (r.resource as any).url === `${base}/CodeSystem/answers-local`);
        expect(systems).toHaveLength(1);
        expect((systems[0].resource as any).concept).toEqual(expect.arrayContaining([{ code: "complaint", display: "Complaint" }, { code, display }]));
      }
    });
  });
  it("emits local terminology codes outside value from, with system-owned metadata", () => {
    withFixture(true, (file) => {
      const result = emitFhirDefFromPath(file, { date: "2026-09-08" });
      expect(result.success, JSON.stringify(result.errors)).toBe(true);
      const system = result.resources.find((r) => (r.resource as any).url === `${base}/CodeSystem/shared-extra`)!;
      expect(system).toMatchObject({ sourceName: `${base}/CodeSystem/shared-extra`, resource: {
        id: "shared-extra", title: "shared-extra", concept: [{ code: "extra", display: "Extra" }],
      } });
    }, undefined, `terminology "Extra Domain": - system is \`${base}/CodeSystem/shared-extra\`. - code is \`extra\` display is \`Extra\`.`);
  });
  it("binds an imported opaque ValueSet without requiring a finite classification", () => {
    withFixture(false, (file, directory) => {
      const canonical = "https://example.org/external/ValueSet/answers";
      writeFileSync(join(directory, "shared.crl"), `library "Shared".\nterminology "Choices": - valueset is \`${canonical}\`.`);
      writeFileSync(file, source(false).replace('- value from is "Shared"."Choices":\n  - not qualifying is `none`.', '- value from is "Shared"."Choices".')
        .replace('- definition is "Complaint" in qualifying.', '- defined as exists ("Complaint").'));
      const result = emitFhirDefFromPath(file, { date: "2026-09-08" });
      expect(result.success, JSON.stringify(result.errors)).toBe(true);
      const profile = result.resources.find((r) => r.resourceType === "StructureDefinition" && (r.resource as any).title === "Complaint")!.resource as any;
      expect(profile.differential.element.find((e: any) => e.path === "Observation.value[x]").binding.valueSet).toBe(canonical);
    });
  });
  it("rejects an invalid locally owned system id with an actionable formatted replacement", () => {
    withFixture(true, (file, directory) => {
      writeFileSync(join(directory, "shared.crl"), `library "Shared".\n${terms.replace('p-complaint-answer-codes', 'x'.repeat(65))}`);
      const result = emitFhirDefFromPath(file, { date: "2026-09-08" });
      expect(result.success).toBe(false);
      expect(validateCRLImports(file).validationErrors.some((e) => e.kind === "answer-options-invalid-local-system")).toBe(true);
      expect(result.errors.find((e) => e.kind === "answer-options-invalid-local-system")?.message)
        .toContain(`${base}/CodeSystem/p-complaint-answer-codes`);
    });
  });
  it.each([false, true])("unions shared local system members and rejects inconsistent displays (conflict=%s)", (conflict) => {
    withFixture(true, (file, directory) => {
      writeFileSync(file, source(true) + `
concept "Second Question":
- shape is Record. - type is Observation. - value type is CodeableConcept. - code is \`second\`.
- value domain is answer options. - shape reduction is most recent.
- value from is "Shared"."Second Choices".
`);
      const result = emitFhirDefFromPath(file, { date: "2026-09-08" });
      expect(result.success, JSON.stringify(result.errors)).toBe(!conflict);
      if (conflict) {
        expect(result.errors.some((e) => e.kind === "answer-options-conflicting-display")).toBe(true);
        expect(validateCRLImports(file).validationErrors.some((e) => e.kind === "answer-options-conflicting-display")).toBe(true);
      }
      else {
        const systems = result.resources.filter((r) => (r.resource as any).url === `${base}/CodeSystem/p-complaint-answer-codes`);
        expect(systems).toHaveLength(1);
        expect((systems[0].resource as any).concept.map((c: any) => c.code).sort()).toEqual(["none", "second"]);
      }
    }, undefined, `terminology "Second Choices":
- system is \`${base}/CodeSystem/p-complaint-answer-codes\`.
- code is \`${conflict ? "none" : "second"}\` display is \`Second display\`.
`);
  });
  // @kit named-answer-options:imported-classification
  // @kit concept-presentation:emitted-text
  it.each([false, true])("uses an imported answer vocabulary in CQL, FHIR, CEL and CRE (publication=%s)", (publication) => {
    withFixture(publication, (file, directory) => {
      const cql = emitCQLImports(file);
      expect(cql.success, JSON.stringify(cql.errors)).toBe(true);
      expect(cql.cqlByLibrary!.map((entry) => entry.cql).join("\n")).toContain("publication-uninterpretable-value");
      const fhir = emitFhirDefFromPath(file, { date: "2026-09-08" });
      expect(fhir.success, JSON.stringify(fhir.errors)).toBe(true);
      const plan = fhir.resources.find((r) => r.sourceKind === "Decision")!.resource as any;
      const inputs = (nodes: any[]): any[] => nodes.flatMap((n) => [...(n.input ?? []), ...inputs(n.action ?? [])]);
      const questionInput = inputs(plan.action).find((input) => input.extension?.some((e: any) => e.url.endsWith("cpg-input-text")));
      expect(questionInput, JSON.stringify(plan)).toBeDefined();
      expect(questionInput.extension).toEqual(expect.arrayContaining([
        { url: "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-input-text", valueString: "Which complaint supports this request?" },
        { url: "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-input-description", valueMarkdown: "Select the documented complaint." },
      ]));
      const owned = fhir.resources.filter((entry) => entry.resourceType === "CodeSystem" && (entry.resource as any).url === `${base}/CodeSystem/p-complaint-answer-codes`);
      expect(owned).toHaveLength(1);
      expect((owned[0].resource as any).concept).toEqual([{ code: "none", display: "None" }]);
      const valueSet = fhir.resources.find((entry) => entry.resourceType === "ValueSet" && (entry.resource as any).expansion?.contains?.some((code: any) => code.code === "symptom"))!;
      expect((valueSet.resource as any).expansion.contains.map((code: any) => code.system)).toEqual([`${base}/CodeSystem/p-complaint-answer-codes`, "urn:standard"]);
      const cel = join(directory, "cases.cel");
      writeFileSync(cel, ANSWER_EXAMPLE_CEL);
      const graph = resolveCelImports(cel);
      const emission = emitCelToFhir(graph);
      expect(emission.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      const observations = emission.emittedCases.flatMap((c) => c.resources).filter((r) => r.resourceType === "Observation");
      expect(observations.map((r) => (r.body.valueCodeableConcept as any)?.coding?.[0]?.system)).toEqual(["urn:standard", `${base}/CodeSystem/p-complaint-answer-codes`]);
      expect(runCel(graph).runs.map((run) => ({ status: run.status, produced: run.produced.map((p) => p.recommendation) })))
        .toEqual([{ status: "pass", produced: ["Met"] }, { status: "pass", produced: ["Unmet"] }, { status: "pass", produced: [] }]);
    });
  });
  it("preserves an authored local CodeSystem identity across concept rename", () => {
    withFixture(true, (file) => {
      const result = emitFhirDefFromPath(file, { date: "2026-09-08" });
      expect(result.success, JSON.stringify(result.errors)).toBe(true);
      expect(result.resources.some((r) => (r.resource as any).url === `${base}/CodeSystem/p-complaint-answer-codes`)).toBe(true);
    }, "Renamed Complaint");
  });
});
