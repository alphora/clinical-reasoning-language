import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  celCaseCompartmentDir,
  emitCelToFhir,
  renderScenario,
  resolveCelImports,
} from "../../../index";

/**
 * ⭐⭐ THE DRIFT GATE. Pins the EXPORTED path authority against what the emitter ACTUALLY writes.
 *
 * ⚠ WHY THIS EXISTS, precisely. `0e7641da` (#189 KALM Patient-compartment layout) merged the former
 * `<library>-cases/<case>/` pair into ONE hashed compartment segment and lowercased the type dir. The MV
 * questionnaire pane composed the OLD shape by hand, kept compiling, and silently matched nothing — for
 * months. Four documents went on describing the old layout. NOTHING FAILED, because no test related the
 * pane's idea of the path to the emitter's.
 *
 * That is the gap this closes: any future change to the compartment scheme must move BOTH the exported
 * helper and the writer, or this fails. A test that pinned only the literal string would have gone green
 * against a stale helper and taught us nothing.
 */
const PROJECT = {
  "package.json": JSON.stringify({
    name: "cp",
    version: "1.0.0",
    private: true,
    crl: { canonicalBase: "http://example.org/cp", status: "draft", experimental: true },
  }),
  "p.crl": `library "Compartment Probe".

concept "Asked":
- shape is Scalar.
- type is Observation.
- value type is boolean.
- code is \`asked\`.
`,
  "c.cel": `library "Compartment Probe Cases".
covers "Compartment Probe".

fact "Subject Pat":
- name is "Patricia Q".
- birth date is "1970-01-01".
- defined by "Patient".

fact "Asked True":
- value is true.
- date is "2026-01-02".
- defined by "Compartment Probe"."Asked".

case "a case with a deliberately long authored name -> met":
- subject is "Subject Pat".
- fact is "Asked True".
`,
};

const emit = () => {
  const dir = mkdtempSync(join(tmpdir(), "crl-compartment-"));
  for (const [name, body] of Object.entries(PROJECT)) writeFileSync(join(dir, name), body);
  const graph = resolveCelImports(join(dir, "c.cel"));
  return emitCelToFhir(graph);
};

describe("the compartment path authority agrees with what the emitter writes", () => {
  it("⭐⭐ THE CONSUMER PATH: the view model's compartmentDir equals the emitter's", () => {
    // ⚠ THIS IS THE GATE THAT WAS MISSING, and its absence is why the first fix was still broken.
    // The original test related the exported HELPER to the emitter and passed — while the pane fed that
    // helper `DecisionView.libraryName` (the COVERED CRL library) instead of the CEL library's own name.
    // Two different strings, both honestly called "the library name", so the helper was correct and the
    // caller was wrong and nothing failed. Relating the CONSUMER's value to the emitter's is the only
    // formulation that catches that class.
    const dir = mkdtempSync(join(tmpdir(), "crl-compartment-vm-"));
    for (const [name, body] of Object.entries(PROJECT)) writeFileSync(join(dir, name), body);
    const graph = resolveCelImports(join(dir, "c.cel"));
    const rendered = renderScenario(graph) as unknown as {
      scenarios: { compartmentDir?: string }[];
    };
    const emitted = emitCelToFhir(graph);
    expect(rendered.scenarios.length).toBe(1);
    expect(emitted.emittedCases.length).toBe(1);
    expect(rendered.scenarios[0].compartmentDir).toBe(emitted.emittedCases[0].compartmentDir);
  });

  it("⭐ celCaseCompartmentDir reproduces the emitted case's compartmentDir EXACTLY", () => {
    const { emittedCases } = emit();
    expect(emittedCases.length).toBe(1);
    const c = emittedCases[0];
    // The three names an addressable case needs — library, case, SUBJECT. Two of them is not enough,
    // which is the reason the pane could never have composed this correctly from {library, case}.
    const viaAuthority = celCaseCompartmentDir(
      "Compartment Probe Cases",
      "a case with a deliberately long authored name -> met",
      "Subject Pat",
    );
    expect(viaAuthority).toBe(c.compartmentDir);
  });

  it("⭐ every emitted resource lands UNDER that directory", () => {
    const { emittedCases } = emit();
    const c = emittedCases[0];
    expect(c.resources.length).toBeGreaterThan(0);
    for (const r of c.resources) {
      expect(r.outputPath.startsWith(`${c.compartmentDir}/`)).toBe(true);
    }
  });

  it("⚠ the type segment is LOWERCASE — the pane greps for `questionnaire`, not `Questionnaire`", () => {
    const { emittedCases } = emit();
    for (const r of emittedCases[0].resources) {
      const typeSeg = r.outputPath.slice(`${emittedCases[0].compartmentDir}/`.length);
      expect(typeSeg).toBe(typeSeg.toLowerCase());
    }
  });

  it("⚠ the compartment is ONE segment under `patient/`, not a library/case PAIR", () => {
    // The shape `0e7641da` replaced. A regression to the two-segment layout fails here rather than
    // silently un-matching a consumer's glob.
    const { emittedCases } = emit();
    const rest = emittedCases[0].compartmentDir.replace(/^patient\//, "");
    expect(rest).not.toContain("/");
  });
});
