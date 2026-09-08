import { describe, expect, it } from "vitest";

import { buildCRL } from "../../index";
import type { CRLError } from "../../types/errors";
import type { Concept } from "../types";

// REFACTOR:grounded (#320, disc 557) — these tests establish the independent final
// selector syntax/AST boundary. They do not certify semantic admission or execution.
const buildConcept = (body: string): ReturnType<typeof buildCRL> =>
  buildCRL(`library "T".\nconcept "C":\n${body}`);

const ruleOf = (error: CRLError): string | undefined =>
  (error.details as { rule?: string } | undefined)?.rule;

const withoutLocations = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutLocations);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "location")
        .map(([key, item]) => [key, withoutLocations(item)]),
    );
  }
  return value;
};

const conceptFrom = (body: string): Concept => {
  const built = buildConcept(body);
  expect(built.success, JSON.stringify(built.errors)).toBe(true);
  return built.result!.statements.find((statement) => statement.type === "Concept") as Concept;
};

describe("first-class concept shape reduction", () => {
  // @kit publication-selection:syntax
  it("captures a plain final selector with its source location and no implicit tie preference", () => {
    const line = "- shape reduction is most recent.";
    const concept = conceptFrom(`- shape is Record.\n${line}`);
    expect(concept.shapeReduction).toEqual({
      type: "ShapeReduction",
      kind: "mostRecent",
      equalTime: "error",
      location: { start: { line: 4, column: 0 }, end: { line: 4, column: line.length } },
    });
    expect(concept.shape).toBe("Record");
    expect(concept.definition).toBeUndefined();
  });

  // @kit publication-selection:syntax
  it("captures only an authored prefer-local equal-time policy", () => {
    const concept = conceptFrom(
      "- shape reduction is most recent, on equal time prefer local.\n- shape is Record.",
    );
    expect(concept.shapeReduction).toMatchObject({
      type: "ShapeReduction",
      kind: "mostRecent",
      equalTime: "preferLocal",
    });
  });

  it("allows whitespace and comments between selector words without changing their meaning", () => {
    const concept = conceptFrom(
      "- shape reduction is most\t recent, on equal\n time prefer /* authored */ local.",
    );
    expect(concept.shapeReduction?.equalTime).toBe("preferLocal");
  });

  it("does not synthesize a final selector or a shape declaration when omitted", () => {
    const concept = conceptFrom("- type is Observation.\n- definition is most recent this.");
    expect(concept).not.toHaveProperty("shapeReduction");
    expect(concept.shape).toBeUndefined();
    expect(concept.definition).toMatchObject({
      type: "ReductionDefinition",
      reduction: { kind: "mostRecent", target: { type: "ThisRecords" } },
    });
  });

  it("a final selector does not itself imply a shape declaration", () => {
    expect(conceptFrom("- shape reduction is most recent.").shape).toBeUndefined();
  });

  it.each([
    "- definition is most recent this.",
    '- definition is "Operand" in qualifying.',
    '- defined as "Operand".',
    '- coded from "Codes".',
  ])("keeps the original definition untouched alongside the final selector: %s", (definition) => {
    const body = `- type is Observation.\n${definition}\n`;
    const original = conceptFrom(body);
    const withSelector = conceptFrom(`${body}- shape reduction is most recent.`);
    expect(withSelector.definition).toEqual(original.definition);
    expect(withSelector.shapeReduction?.kind).toBe("mostRecent");
  });

  it("preserves separate source projectors after the concept prefix", () => {
    const body = `- type is Observation.
- definition is "Operand" in qualifying.
- source representation:
  - type is ServiceRequest.
  - coded from "Codes".
  - value projection is most recent this.`;
    const original = conceptFrom(body);
    const withSelector = conceptFrom(
      body.replace(
        "- source representation:",
        "- shape reduction is most recent.\n- source representation:",
      ),
    );
    expect(withSelector.definition).toEqual(original.definition);
    expect(withSelector.representations).toHaveLength(1);
    expect(withoutLocations(withSelector.representations)).toEqual(
      withoutLocations(original.representations),
    );
    expect(withSelector.representations[0].valueProjection).not.toHaveProperty("shapeReduction");
    expect(withSelector.shapeReduction?.kind).toBe("mostRecent");
  });

  it.each([
    "- shape reduction is most recent.",
    "- shape reduction is most recent, on equal time prefer local.",
  ])("rejects a duplicate final selector on its own line: %s", (second) => {
    const built = buildConcept(`- shape reduction is most recent.\n${second}`);
    expect(built.success).toBe(false);
    const errors = built.errors ?? [];
    const duplicates = errors.filter((error) => ruleOf(error) === "duplicate-shape-reduction");
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].line).toBe(4);
    expect(errors.some((error) => ruleOf(error) === "multiple-definitions")).toBe(false);
  });

  it.each([
    "earliest",
    "most recent this",
    "exists this",
    "most recent, on equal time prefer remote",
    "most recent, on equal time prefer local or remote",
    "most recent on equal time prefer local",
    "most recent, on same time prefer local",
    "most recent, on equal time error",
    "most recent, on equal time prefer",
  ])("rejects unsupported selector/tie syntax rather than accepting narrative: %s", (selector) => {
    const built = buildConcept(`- shape reduction is ${selector}.`);
    expect(built.success).toBe(false);
    expect(built.errors?.length).toBeGreaterThan(0);
  });

  it("rejects a final selector placed inside or after a source representation", () => {
    const built = buildConcept(`- type is Observation.
- source representation:
  - type is ServiceRequest.
  - shape reduction is most recent.`);
    expect(built.success).toBe(false);
    expect(built.errors?.length).toBeGreaterThan(0);
  });

  it("keeps selector words available to ordinary definition narrative", () => {
    const concept = conceptFrom("- definition is on equal time prefer local most recent records.");
    expect(concept.definition?.type).toBe("DefinitionIsDefinition");
    expect(concept.shapeReduction).toBeUndefined();
  });
});
