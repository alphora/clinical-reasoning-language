import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCRL } from "../../index";
import { prepareSingleLibraryPublication, adaptPublicationCandidate } from "../publicationProgram";
import { produceHasValueCandidate } from "../publicationHasValue";
import { emitCQLImports } from "../../imports/emit";
import { validateCRLImports } from "../../imports/validate";
import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
import { resolveCelImports } from "../../cel/imports";
import { emitCelToFhir } from "../../cel/emitter/emitFhir";
import { validateCEL } from "../../cel/validator";
import { runCel } from "../../cre/run";
import {
  INTAKE_BASE,
  INTAKE_CRL,
  INTAKE_CEL,
  intakeAnswer,
  intakePresence,
} from "../../authoring-kit/intakeExample";

// REFACTOR:grounded (#322): selected-answer presence, not truth or clinical completeness.
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
function fixture(crl = INTAKE_CRL, cel = INTAKE_CEL, sibling?: string) {
  const dir = mkdtempSync(join(tmpdir(), "crl-intake-"));
  dirs.push(dir);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "intake",
      version: "1.0.0",
      crl: { canonicalBase: INTAKE_BASE, date: "2026-09-16" },
    }),
  );
  const path = join(dir, "intake.crl");
  writeFileSync(path, crl);
  if (sibling) writeFileSync(join(dir, "foreign.crl"), sibling);
  const cases = join(dir, "cases.cel");
  writeFileSync(cases, cel);
  return { path, graph: resolveCelImports(cases) };
}
function program(source = INTAKE_CRL) {
  const ast = buildCRL(source);
  expect(ast.success, JSON.stringify(ast.errors)).toBe(true);
  return prepareSingleLibraryPublication(ast.result!, {
    canonicalBase: INTAKE_BASE,
    policyId: "intake",
  });
}
const resource = (extra = {}) => ({
  resourceType: "Observation",
  id: "answer",
  status: "final",
  ...extra,
});

describe("typed intake and selected-value presence", () => {
  // @kit text-answers:datetime
  it.each(["2026", "2026-02", "2024-02-29", "2026-01-01T00:00:00Z", "2026-09-17T14:25:30-04:00"])("preserves dateTime precision %s across CEL and the selected publication", (date) => {
    const source = INTAKE_CRL.replace('value type is text', 'value type is dateTime');
    const cases = INTAKE_CEL.replace('Example diagnosis, code if known', date);
    const f = fixture(source, cases);
    expect(validateCRLImports(f.path).success).toBe(true);
    const p = program(source);
    expect(p.diagnostics).toEqual([]);
    const d = p.descriptors.find(d => d.title === "Primary Diagnosis")!;
    expect(d.valueType).toBe("dateTime");
    expect(adaptPublicationCandidate(d, resource({ valueDateTime: date })).kind).toBe("candidate");
    expect(validateCEL(f.graph).errors).toEqual([]);
    const emitted = emitCelToFhir(f.graph);
    expect(emitted.diagnostics.filter(d => d.severity === "error")).toEqual([]);
    expect(emitted.emittedCases[1].resources.map(r => r.body)).toContainEqual(expect.objectContaining({ valueDateTime: date }));
    expect(runCel(f.graph).runs.map(r => r.status)).toEqual(["pass", "pass"]);
    expect(emitCQLImports(f.path).success).toBe(true);
    const defs = emitFhirDefFromPath(f.path);
    expect(defs.success, JSON.stringify(defs.errors)).toBe(true);
    const sd = defs.resources.find(r => r.resourceType === "StructureDefinition" && r.resource.title === "Primary Diagnosis")!.resource as any;
    expect(sd.differential.element.find((e: any) => e.path === "Observation.value[x]").type).toEqual([{ code: "dateTime" }]);
  });
  it.each(["2025-02-29", "2026-13", "2026-04-31", "", "2026-01-01T00:00:00", "2026-01-01T00:00Z"])("rejects invalid dateTime answer %s instead of truncating or clearing", date => {
    const source = INTAKE_CRL.replace('value type is text', 'value type is dateTime');
    const p = program(source);
    const d = p.descriptors.find(d => d.title === "Primary Diagnosis")!;
    expect(adaptPublicationCandidate(d, resource({ valueDateTime: date })).kind).toBe("error");
    const f = fixture(source, INTAKE_CEL.replace('Example diagnosis, code if known', date));
    expect(validateCEL(f.graph).errors.some(e => e.kind === "invalid-date")).toBe(true);
    expect(emitCelToFhir(f.graph).diagnostics.some(e => e.severity === "error")).toBe(true);
  });
  it("does not use the answered date as recency and preserves primitive absence", () => {
    const source = INTAKE_CRL.replace('value type is text', 'value type is dateTime');
    const p = program(source), d = p.descriptors.find(d => d.title === "Primary Diagnosis")!;
    const r = adaptPublicationCandidate(d, resource({ valueDateTime: "1980-01-01", effectiveDateTime: "2026-09-17" }));
    expect(r.kind).toBe("candidate");
    if (r.kind === "candidate") expect(r.candidate.resource).toMatchObject({ valueDateTime: "1980-01-01", effectiveDateTime: "2026-09-17" });
    const absent = adaptPublicationCandidate(d, resource({ _valueDateTime: { extension: [{ url: "http://hl7.org/fhir/StructureDefinition/data-absent-reason", valueCode: "unknown" }] } }));
    expect(absent.kind).toBe("candidate");
    if (absent.kind === "candidate") {
      const producer = p.descriptors.find(d => d.title === "Has Primary Diagnosis")!;
      const result = produceHasValueCandidate(producer, absent.candidate, "Patient/test");
      expect(result.kind).toBe("candidate");
      if (result.kind === "candidate") expect(result.candidate.resource.valueBoolean).toBe(false);
    }
  });

  // @kit text-answers:selected-presence
  it("validates, emits actual string profiles and CEL values, and reaches exactly one review without mandatory fields", () => {
    const f = fixture();
    expect(validateCRLImports(f.path).success).toBe(true);
    const cql = emitCQLImports(f.path);
    expect(cql.success, JSON.stringify(cql)).toBe(true);
    const fhir = emitFhirDefFromPath(f.path);
    expect(fhir.success, JSON.stringify(fhir.errors)).toBe(true);
    const profiles = fhir.resources
      .filter((r) => r.resourceType === "StructureDefinition")
      .map((r) => r.resource as any);
    expect(profiles).toHaveLength(3);
    expect(
      profiles
        .find((p) => p.title === "Primary Diagnosis")
        .differential.element.find((e: any) => e.path === "Observation.value[x]").type,
    ).toEqual([{ code: "string" }]);
    const plans = JSON.stringify(fhir.resources.filter((r) => r.resourceType === "PlanDefinition"));
    for (const p of profiles) expect(plans).toContain(p.url);
    expect(validateCEL(f.graph).errors).toEqual([]);
    const cel = emitCelToFhir(f.graph);
    expect(cel.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(cel.emittedCases[1].resources.map((r) => r.body)).toContainEqual(
      expect.objectContaining({ valueString: "Example diagnosis, code if known" }),
    );
    const runs = runCel(f.graph).runs;
    expect(runs.map((r) => r.status)).toEqual(["pass", "pass"]);
    expect(runs.map((r) => r.produced.length)).toEqual([1, 1]);
  });
  it.each([undefined, false, true])("Boolean %s is presence, never truth", (value) => {
    const p = program();
    expect(p.diagnostics).toEqual([]);
    const d = p.descriptors.find((d) => d.title === "Treatment Begun")!;
    const producer = p.descriptors.find((d) => d.title === "Has Treatment Answer")!;
    const a = adaptPublicationCandidate(
      d,
      resource(value === undefined ? {} : { valueBoolean: value }),
    );
    expect(a.kind).toBe("candidate");
    if (a.kind !== "candidate") return;
    const result = produceHasValueCandidate(producer, a.candidate, "Patient/test");
    expect(result.kind).toBe("candidate");
    if (result.kind === "candidate")
      expect(result.candidate.resource.valueBoolean).toBe(value !== undefined);
  });
  it("missing input computes false without fabricating time, resource identity or lineage", () => {
    const d = program().descriptors.find((d) => d.title === "Has Primary Diagnosis")!;
    const r = produceHasValueCandidate(d, undefined, "Patient/test");
    expect(r.kind).toBe("candidate");
    if (r.kind === "candidate") {
      expect(r.candidate.resource.valueBoolean).toBe(false);
      expect(r.candidate.resource).not.toHaveProperty("id");
      expect(r.candidate.resource).not.toHaveProperty("effectiveDateTime");
      expect(r.candidate.resource).not.toHaveProperty("derivedFrom");
    }
  });
  it.each(["text", "string"])(
    "normalizes %s and preserves content, including whitespace",
    (type) => {
      const p = program(INTAKE_CRL.replaceAll("value type is text", `value type is ${type}`));
      expect(p.diagnostics).toEqual([]);
      const d = p.descriptors.find((d) => d.title === "Primary Diagnosis")!;
      expect(d.valueType).toBe("string");
      for (const value of ["  literal text  ", "  ", "?\nline two"]) {
        const r = adaptPublicationCandidate(d, resource({ valueString: value }));
        expect(r.kind).toBe("candidate");
        if (r.kind === "candidate") expect(r.candidate.resource.valueString).toBe(value);
      }
      for (const value of [true, 3, {}, ""])
        expect(adaptPublicationCandidate(d, resource({ valueString: value })).kind).toBe("error");
      expect(adaptPublicationCandidate(d, resource({ valueBoolean: false })).kind).toBe("error");
      expect(
        adaptPublicationCandidate(
          d,
          resource({ _valueString: { extension: [{ url: "urn:absent", valueCode: "unknown" }] } }),
        ).kind,
      ).toBe("candidate");
    },
  );
  it("newer valueless text displaces old text in CRE and does not produce the present branch", () => {
    const source =
      INTAKE_CRL.slice(0, INTAKE_CRL.indexOf('decision "Intake"')) +
      'activity "Missing": - request CPGCommunicationRequest. - with `MISSING`.\ndecision "Intake": first: - when "Has Primary Diagnosis" then recommend activity "Human Review". - otherwise then recommend activity "Missing".';
    const cel = `library "Cases". covers "Intake".
      fact "Patient": - defined by "Patient".
      fact "Old": - defined by "Intake"."Primary Diagnosis". - value is "Earlier". - date is "2026-01-01".
      fact "Clear": - defined by "Intake"."Primary Diagnosis". - date is "2026-02-01".
      case "Clear": - subject is "Patient". - fact is "Old". - fact is "Clear". - result is "Intake" is "Missing".`;
    const f = fixture(source, cel);
    const run = runCel(f.graph).runs[0];
    expect(run.status, JSON.stringify(run)).toBe("pass");
    expect(run.produced).toHaveLength(1);
  });
  // REFACTOR:grounded (#322, review783): a matched word sequence must not call a nonexistent legacy helper.
  it("rejects has-value embedded in a legacy pipeline", () => {
    const crl =
      'library "Intake". concept "X": - shape is RecordSet. - type is Observation. - value type is boolean. - code is `x`. concept "P": - shape is Record. - type is Observation. - value type is boolean. - definition is "X" has a value then most recent this.';
    const f = fixture(crl);
    expect(validateCRLImports(f.path).success).toBe(false);
    const emitted = emitCQLImports(f.path);
    expect(emitted.success).toBe(false);
    expect(JSON.stringify(emitted.cqlByLibrary)).not.toContain("CRLCommon.HasValue");
  });
  it("rejects a has-value definition without an explicit publication contract", () => {
    const source = INTAKE_CRL.replace(
      intakePresence("Has Primary Diagnosis", '\"Primary Diagnosis\"'),
      intakePresence("Has Primary Diagnosis", '\"Primary Diagnosis\"').replace(
        "- shape reduction is most recent.\n",
        "",
      ),
    );
    const f = fixture(source);
    expect(validateCRLImports(f.path).success).toBe(false);
    expect(emitCQLImports(f.path).success).toBe(false);
    expect(runCel(f.graph).runs.every((r) => r.status !== "pass")).toBe(true);
  });
  it("rejects complex presence rather than inferring object-not-null semantics", () => {
    const p = program(INTAKE_CRL.replace("value type is text", "value type is Quantity"));
    expect(p.diagnostics.some((d) => d.kind === "publication-has-value-operand-unsupported")).toBe(
      true,
    );
  });
  it("resolves foreign text dependencies into the form without extra guard profiles", () => {
    const child = intakeAnswer("Primary Diagnosis", "text", "foreign-diagnosis");
    const root = INTAKE_CRL.replace(child.replace("foreign-diagnosis", "primary-diagnosis"), "")
      .replace(
        'definition is "Primary Diagnosis" has a value',
        'definition is "Foreign"."Primary Diagnosis" has a value',
      )
      .replace(/presentation for "Primary Diagnosis":[\s\S]*?(?=presentation for)/, "");
    const f = fixture(
      root,
      INTAKE_CEL.split('fact "Diagnosis"')[0] +
        'case "Empty": - subject is "Patient". - result is "Intake" is "Human Review".',
      'library "Foreign".\n' + child,
    );
    const result = emitFhirDefFromPath(f.path);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(result.resources.filter((r) => r.resourceType === "StructureDefinition")).toHaveLength(
      3,
    );
    expect(runCel(f.graph).runs[0].status).toBe("pass");
  });
  it.each(["true", "12", "12 'mg'", '\"\"'])(
    "rejects a non-text CEL payload %s in validation, emit and CRE",
    (value) => {
      const f = fixture(
        INTAKE_CRL,
        INTAKE_CEL.replace('"Example diagnosis, code if known"', value),
      );
      expect(
        validateCEL(f.graph).errors.some((e) => e.kind === "value-reading-assertion-needs-text"),
      ).toBe(true);
      expect(
        emitCelToFhir(f.graph).diagnostics.some(
          (e) => e.kind === "value-reading-assertion-needs-text",
        ),
      ).toBe(true);
      expect(runCel(f.graph).runs[1].status).not.toBe("pass");
    },
  );
  it.each(["unknown", "na"])(
    "recognized coded %s is answered without classifying it as qualifying",
    (value) => {
      const source =
        'library "Intake".\n' +
        intakeAnswer("Choice", "CodeableConcept", "choice") +
        '- value domain is answer options.\n- value from is "Answers":\n  - not qualifying is `na`.\n' +
        'terminology "Answers": - system is `urn:answers`. - code is `unknown` display is `Unknown`. - code is `na` display is `N/A`.\n' +
        intakePresence("Has Choice", '"Choice"') +
        'activity "Yes": - request CPGCommunicationRequest. - with `PRESENT`.\nactivity "No": - request CPGCommunicationRequest. - with `ABSENT`.\ndecision "Intake": first: - when "Has Choice" then recommend activity "Yes". - otherwise then recommend activity "No".';
      const cel = `library "Cases". covers "Intake". fact "Patient": - defined by "Patient".
      fact "Answer": - defined by "Intake"."Choice". - value is "${value}".
      case "Answered": - subject is "Patient". - fact is "Answer". - result is "Intake" is "Yes".`;
      const f = fixture(source, cel);
      expect(runCel(f.graph).runs[0].status).toBe("pass");
      const bad = fixture(
        source,
        cel.replace(`value is "${value}"`, 'value is "urn:foreign|invalid"'),
      );
      const run = runCel(bad.graph).runs[0];
      expect(run.status).not.toBe("pass");
      expect(run.produced).toEqual([]);
    },
  );
});
