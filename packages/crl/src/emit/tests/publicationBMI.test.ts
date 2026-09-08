import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { buildCRL } from "../../index";
import {
  prepareSingleLibraryPublication,
  publicationProducerOperands,
} from "../publicationProgram";
import { publicationBMIValue, produceBMICandidate } from "../publicationBMI";
import { publicationQuantityAtLeast } from "../publicationQuantity";
import { selectPublicationCandidate, type PublicationCandidate } from "../publicationSelection";
import { emitCQLFromAST } from "../../cql-emitter/emitCQL";

// REFACTOR:grounded (#320, plan589): expected arithmetic and state transitions precede implementation.
const text = readFileSync(join(__dirname, "fixtures/publication-bmi.crl"), "utf8");
const q = (value: number, unit = "kg") => ({ value, unit });
function prepare(source = text) {
  const parsed = buildCRL(source);
  expect(parsed.success).toBe(true);
  const program = prepareSingleLibraryPublication(parsed.result!, {
    canonicalBase: "http://example.org/bmi",
    policyId: "bmi-publication",
  });
  return { ast: parsed.result!, program, d: program.descriptors.find((d) => d.title === "BMI")! };
}
function candidate(
  id: string,
  value: unknown,
  date: string | undefined = "2026-09-01",
): PublicationCandidate<Record<string, unknown>> {
  return {
    key: `Observation/${id}`,
    retrievedInputIdentity: `Observation/${id}`,
    contributorId: id,
    arm: "local",
    ...(date ? { validity: date } : {}),
    resource: {
      resourceType: "Observation",
      id,
      status: "final",
      ...(value ? { valueQuantity: value } : {}),
      ...(date ? { effectiveDateTime: date } : {}),
    },
  };
}
describe("BMI publication", () => {
  // @kit bmi-publication:bounded-decimal
  it.each([
    [q(36.3), q(1.1, "m"), 30],
    [q(36300, "g"), q(110, "cm"), 30],
    [q(36.29999999), q(1.1, "m"), 29.99999999],
    [q(36.30000001), q(1.1, "m"), 30],
    [q(36.30000002), q(1.1, "m"), 30.00000001],
    [q(29.99996), q(1, "m"), 29.99996],
    [q(1), q(3, "m"), 0.11111111],
    [q(1.00000001), q(100, "cm"), 1.00000001],
  ])("publishes exact bounded decimal %j / %j", (w, h, expected) => {
    expect(publicationBMIValue(w, h)).toEqual({ kind: "known", value: expected });
    expect(publicationQuantityAtLeast(q(expected, "kg/m2"), { value: 30, unit: "kg/m2" })).toEqual({
      kind: "known",
      value: expected >= 30,
    });
  });
  // @kit bmi-publication:invalid-input
  it.each([
    [q(0), q(1, "m"), "nonpositive"],
    [q(-1), q(1, "m"), "nonpositive"],
    [q(1), q(0, "m"), "nonpositive"],
    [q(1, "m"), q(1, "m"), "unit-unsupported"],
    [q(1), q(1, "kg"), "unit-unsupported"],
    [q(1), q(1.0000001, "m"), "precision-unsupported"],
    [q(1.000000001), q(1, "m"), "precision-unsupported"],
    [q(1000000), q(0.1, "m"), "result-unsupported"],
    [undefined, q(0, "m"), "nonpositive"],
    [q(0), undefined, "nonpositive"],
  ])("refuses %j / %j", (w, h, code) =>
    expect(publicationBMIValue(w, h)).toMatchObject({
      kind: "error",
      code: `publication-bmi-${code}`,
    }),
  );
  it("prepares two dependencies, explicit anchor and emitted candidate", () => {
    const { ast, program, d } = prepare();
    expect(program.diagnostics).toEqual([]);
    expect(publicationProducerOperands(d.producer).map((d) => d.conceptName)).toEqual([
      "Weight",
      "Height",
    ]);
    expect(d.producer).toMatchObject({ kind: "bodyMassIndex", validityOperand: 0 });
    const cql = emitCQLFromAST(ast, {
      canonicalBase: "http://example.org/bmi",
      policyId: "bmi-publication",
    });
    expect(cql.success, JSON.stringify(cql.errors)).toBe(true);
  });
  it.each([
    [
      'using validity of "Weight"',
      'using validity of "Missing"',
      "publication-bmi-validity-operand",
    ],
    [
      'body mass index of "Weight"',
      'body mass index of "Obese"',
      "publication-bmi-operand-unsupported",
    ],
    ['using validity of "Weight"', 'using validity of "BMI"', "publication-bmi-validity-operand"],
    [' using validity of "Weight"', "", "emit-bmi-form-retired"],
  ])("rejects unsupported authoring %s", (from, to, kind) =>
    expect(prepare(text.replace(from, to)).program.diagnostics.some((d) => d.kind === kind)).toBe(
      true,
    ),
  );
  // @kit bmi-publication:candidate-states-and-selection
  it("distinguishes absent, valueless, competing and undated inputs", () => {
    const { d } = prepare(),
      w = candidate("w", q(36.3)),
      h = candidate("h", q(1.1, "m"), "2026-08-01");
    const made = produceBMICandidate(d, w, h, "Patient/p");
    expect(made).toMatchObject({
      kind: "candidate",
      candidate: {
        validity: "2026-09-01",
        resource: {
          valueQuantity: { value: 30 },
          derivedFrom: [{ reference: "Observation/w" }, { reference: "Observation/h" }],
        },
      },
    });
    if (made.kind !== "candidate") throw Error("producer failed");
    expect(made.candidate.resource.id).toBeUndefined();
    expect(produceBMICandidate(d, undefined, h, "Patient/p")).toEqual({ kind: "none" });
    expect(produceBMICandidate(d, w, undefined, "Patient/p")).toEqual({ kind: "none" });
    const unknown = produceBMICandidate(d, w, candidate("h", undefined), "Patient/p");
    expect(unknown).toMatchObject({ kind: "candidate", candidate: { validity: "2026-09-01" } });
    if (unknown.kind !== "candidate") throw Error("no unknown candidate");
    expect(unknown.candidate.resource.valueQuantity).toBeUndefined();
    const old = candidate("old-bmi", q(20, "kg/m2"), "2026-07-01");
    expect(
      selectPublicationCandidate([old, unknown.candidate], {
        conceptId: d.conceptId,
        equalTime: "error",
      }),
    ).toMatchObject({ state: "selected", candidate: { key: unknown.candidate.key } });
    const undated = produceBMICandidate(d, candidate("w", q(36.3), ""), h, "Patient/p");
    if (undated.kind !== "candidate") throw Error("missing undated candidate");
    expect(undated.candidate.validity).toBeUndefined();
    expect(
      selectPublicationCandidate([old, undated.candidate], {
        conceptId: d.conceptId,
        equalTime: "error",
      }).state,
    ).toBe("failed");
    const anchored = prepare(
      text.replace('using validity of "Weight"', 'using validity of "Height"'),
    ).d;
    expect(produceBMICandidate(anchored, w, h, "Patient/p")).toMatchObject({
      kind: "candidate",
      candidate: { validity: "2026-08-01" },
    });
    const changed = produceBMICandidate(d, w, { ...h, key: "different-height" }, "Patient/p");
    if (changed.kind !== "candidate") throw Error("producer failed");
    expect(changed.candidate.key).not.toBe(made.candidate.key);
  });
});
