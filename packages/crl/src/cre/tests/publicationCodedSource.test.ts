import { buildCRL } from "../../index";
import { prepareSingleLibraryPublication } from "../../emit/publicationProgram";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveCelImports } from "../../cel/imports";
import * as celEmission from "../../cel/emitter/emitFhir";
import { runCel } from "../run";
import { CODED_SOURCE_POLICY, CODED_SOURCE_WITH_ANSWERS } from "../../authoring-kit/codedSourceExample";

const coding = (code: string) => ({ system: "urn:synthetic:result", code });
function source(value?: string, date = "2026-01-01", id = "result"): Record<string, unknown> {
  return {
    resourceType: "Observation",
    id,
    status: "final",
    code: { coding: [{ system: "urn:synthetic:test", code: "result" }] },
    effectiveDateTime: date,
    ...(value === undefined ? {} : { valueCodeableConcept: { coding: [coding(value)] } }),
  };
}
function evaluate(
  resources: Record<string, unknown>[],
  expected = "Yes",
  policy = CODED_SOURCE_POLICY,
) {
  const parent = path.resolve(os.tmpdir()),
    dir = mkdtempSync(path.join(parent, "crl-coded-source-"));
  if (path.dirname(dir) !== parent || !path.basename(dir).startsWith("crl-coded-source-"))
    throw Error("Unexpected test path");
  try {
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "coded-source",
        version: "1.0.0",
        crl: { canonicalBase: "https://example.org/coded-source" },
      }),
    );
    writeFileSync(path.join(dir, "policy.crl"), policy);
    const cel = path.join(dir, "cases.cel");
    writeFileSync(
      cel,
      `library "Cases". covers "Coded Source".
fact "P": - defined by "Patient".
case "Case": - subject is "P". - result is "D" is ${expected === "pause" ? "pause" : '"' + expected + '"'}.
`,
    );
    const graph = resolveCelImports(cel),
      emitted = celEmission.emitCelToFhir(graph);
    expect(emitted.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const c = emitted.emittedCases[0],
      patient = c.resources.find((r) => r.resourceType === "Patient")!;
    // Raw external FHIR boundary: preserve the supplied coded resources without a local answer.
    for (const resource of resources)
      c.resources.push({
        resourceType: "Observation",
        id: String(resource.id),
        outputPath: `Observation/${resource.id}.json`,
        body: { subject: { reference: `Patient/${patient.id}` }, ...resource },
      });
    const spy = vi.spyOn(celEmission, "emitCelToFhir").mockReturnValue(emitted);
    try {
      return runCel(graph).runs[0];
    } finally {
      spy.mockRestore();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
describe("CRE coded Observation source", () => {
  // @kit source-representation:coded-source-local-arbitration
  it.each([
    ["positive", "2026-02-01", "2026-01-01", "No"],
    ["positive", "2026-01-01", "2026-02-01", "Yes"],
    [undefined, "2026-02-01", "2026-01-01", "pause"],
  ])("arbitrates a local %s at %s against external negative at %s", (value, localDate, sourceDate, expected) => {
    const policy = CODED_SOURCE_WITH_ANSWERS;
    const built = buildCRL(policy);
    const descriptor = prepareSingleLibraryPublication(built.result!, { canonicalBase: "https://example.org/coded-source", policyId: "coded-source", version: "1.0.0" }).descriptors.find(d => d.title === "Result")!;
    expect(descriptor.localCode).toBeDefined();
    const local = { ...source(value, localDate, "local"), code: { coding: [descriptor.localCode] } };
    const run = evaluate([source("negative", sourceDate), local], expected, policy);
    expect(run.status, JSON.stringify(run.diagnostics)).toBe("pass");
    expect(run.produced.map(p => p.recommendation)).toEqual(expected === "pause" ? [] : [expected]);
  });
  // @kit source-representation:coded-source-outcomes
  it.each([
    ["negative", "Yes"],
    ["positive", "No"],
    [undefined, "pause"],
  ])("preserves selected %s", (value, expected) => {
    const run = evaluate([source(value)], expected);
    expect(run.status, JSON.stringify(run.diagnostics)).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(
      expected === "pause" ? [] : [expected],
    );
    if (expected === "pause") expect(run.trace[0].blockedUnknown).toBe(true);
  });
  it("missing source pauses", () => expect(evaluate([], "pause").status).toBe("pass"));
  it("newer missing value displaces older negative", () =>
    expect(
      evaluate([source("negative"), source(undefined, "2026-02-01", "new")], "pause").status,
    ).toBe("pass"));
  // @kit source-representation:coded-source-selection-before-interpretation
  it("older unrecognized value cannot defeat a newer valid result", () =>
    expect(evaluate([source("unrecognized"), source("negative", "2026-02-01", "new")]).status).toBe(
      "pass",
    ));
  it("newer unrecognized value fails without resurrecting older negative", () => {
    const run = evaluate([source("negative"), source("unrecognized", "2026-02-01", "new")]);
    expect(run.status).toBe("error");
    expect(JSON.stringify(run)).toContain("publication-uninterpretable-value");
    expect(run.produced).toEqual([]);
  });
  it.each([false, true])("checks recognized coding agreement (conflict=%s)", (conflict) => {
    const run = evaluate([
      {
        ...source("negative"),
        valueCodeableConcept: {
          coding: [
            coding("negative"),
            coding(conflict ? "positive" : "negative"),
            { system: "urn:other", code: "foreign" },
          ],
        },
      },
    ]);
    expect(run.status).toBe(conflict ? "error" : "pass");
    if (conflict) expect(JSON.stringify(run)).toContain("publication-ambiguous-coded-value");
  });
  it.each([
    { subject: { reference: "Patient/other" } },
    { code: { coding: [{ system: "urn:other", code: "result" }] } },
  ])("ignores unrelated source %j", (change) =>
    expect(evaluate([{ ...source("negative"), ...change }], "pause").status).toBe("pass"),
  );
  it("rejects a wrong present value type", () => {
    const run = evaluate([{ ...source(), valueBoolean: true }]);
    expect(run.status).toBe("error");
    expect(JSON.stringify(run)).toContain("publication-invalid-value");
  });
  it("preserves ordinary nonmembership for a synthetic additional domain code", () => {
    const policy = CODED_SOURCE_POLICY.replace(
      'terminology "Negative":',
      '- code is `other` display is `Other`.\nterminology "Negative":',
    );
    expect(evaluate([source("other")], "No", policy).status).toBe("pass");
  });
});
