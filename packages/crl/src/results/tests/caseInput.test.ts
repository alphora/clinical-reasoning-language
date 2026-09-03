import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { emitCelToFhir, resolveCelImports } from "../../index";
import { buildProducerInputs, casesMissingFromEmit } from "../caseInput";

const PROJECT = {
  "package.json": JSON.stringify({
    name: "pi",
    version: "1.0.0",
    private: true,
    crl: { canonicalBase: "http://example.org/pi", status: "draft", experimental: true },
  }),
  "p.crl": `library "Producer Input".

concept "Asked":
- shape is Scalar.
- type is Observation.
- value type is boolean.
- code is \`asked\`.
`,
  "c.cel": `library "Producer Input Cases".
covers "Producer Input".

fact "Pat One":
- name is "Patricia".
- birth date is "1970-01-01".
- defined by "Patient".

fact "Pat Two":
- name is "Peter".
- birth date is "1980-01-01".
- defined by "Patient".

fact "Asked True":
- value is true.
- date is "2026-01-02".
- defined by "Producer Input"."Asked".

case "first case -> met":
- subject is "Pat One".
- fact is "Asked True".

case "second case -> met":
- subject is "Pat Two".
- fact is "Asked True".
`,
};

const emit = () => {
  const dir = mkdtempSync(join(tmpdir(), "crl-pi-"));
  for (const [name, body] of Object.entries(PROJECT)) writeFileSync(join(dir, name), body);
  return emitCelToFhir(resolveCelImports(join(dir, "c.cel")));
};

describe("producer input comes from the emit result, not from `.cel` text", () => {
  it("⚠ EACH CASE CARRIES ITS OWN SUBJECT — a batch-wide patient would cross-wire cases", () => {
    // The handed-over driver takes one `patientRef` for a whole batch. Our emitter mints a distinct
    // Patient per case (the compartment id IS that patient's id), so a batch-wide subject would point
    // every case at one case's patient and every retrieve would read the wrong compartment.
    const { inputs, diagnostics } = buildProducerInputs(emit());
    expect(diagnostics).toEqual([]);
    expect(inputs.length).toBe(2);
    const subjects = inputs.map((i) => i.subjectReference);
    expect(new Set(subjects).size).toBe(2);
    for (const s of subjects) expect(s.startsWith("Patient/")).toBe(true);
  });

  it("⭐ each case's compartment is distinct and addresses its own results tree", () => {
    const { inputs } = buildProducerInputs(emit());
    expect(new Set(inputs.map((i) => i.compartmentDir)).size).toBe(2);
    for (const i of inputs) {
      expect(i.compartmentDir).toBe(`patient/${i.compartmentId}`);
      expect(i.compartmentId).not.toContain("/");
    }
  });

  it("⭐ the payload is the case's ALREADY-EMITTED resources — not re-read, not synthesized", () => {
    // The handed-over driver constructs ServiceRequests in Java from a JSON `requests` array. The facts
    // already exist as emitted resources; synthesizing them is a second description of the same case.
    const { inputs } = buildProducerInputs(emit());
    for (const i of inputs) {
      expect(i.resources.length).toBeGreaterThan(0);
      expect(i.resources.some((r) => r.resourceType === "Patient")).toBe(true);
      for (const r of i.resources) expect(typeof r.body).toBe("object");
    }
  });

  it("⚠ a CEL case the emitter DID NOT produce is reported, never silently skipped", () => {
    // Emit is source-atomic per case. A `.cel`-derived case list would hand the producer a case with no
    // compartment, and the failure would surface as a confusing engine error rather than the emit
    // diagnostic it actually is.
    const e = emit();
    const missing = casesMissingFromEmit(
      ["first case -> met", "second case -> met", "a case that never emitted"],
      e,
    );
    expect(missing).toEqual(["a case that never emitted"]);
  });

  it("⭐ the join key is the authored case NAME, not a slug", () => {
    // Two authored names can slug identically ("Case A!" / "Case A?"), so a slug join can bind the wrong
    // case's facts to a case's results.
    const { inputs } = buildProducerInputs(emit());
    expect(inputs.map((i) => i.caseName).sort()).toEqual(
      ["first case -> met", "second case -> met"].sort(),
    );
  });
});
