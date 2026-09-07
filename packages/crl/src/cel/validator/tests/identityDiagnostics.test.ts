import { describe, expect, it } from "vitest";

import { celIdentityDiagnostics, emitCelToFhir } from "../../emitter/emitFhir";
import type { ResolvedCelGraph } from "../../imports/types";
import { buildCEL } from "../../index";
import { validateCEL } from "../validator";

// REFACTOR:grounded (#320, review 556): the authoring diagnostic must agree with actual
// emitted resource paths. Repetition alone is not an error: Patient refs can emit nothing.
const NOW = new Date("2026-09-06T12:00:00.000Z");

function graphFrom(body: string): ResolvedCelGraph {
  const parsed = buildCEL(`library "Identity Cases".
fact "P":
- defined by "Patient".
${body}`);
  expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
  return {
    filePath: "/virtual/identity.cel",
    cel: parsed.result,
    celParseErrors: [],
    diagnostics: [],
  };
}

function fact(name: string, resourceType = "Observation", extra = ""): string {
  return `fact "${name}":
- code is "http://example.org/codes|example".
- defined by "${resourceType}".
${extra}`;
}

function collisionKinds(graph: ResolvedCelGraph): string[] {
  return validateCEL(graph)
    .errors.filter((d) => d.kind === "id-collision")
    .map((d) => d.kind);
}

describe("CEL emitted identity diagnostics", () => {
  it("reports repeated emitting fact identity at its case, despite different dates and intents", () => {
    const graph = graphFrom(`${fact("Request", "ServiceRequest")}
case "Two requests":
- subject is "P".
- fact is "Request" on 2026-01-01 with absent intent.
- fact is "Request" on 2026-04-01 with negative intent.`);
    const emitted = emitCelToFhir(graph, { now: NOW });
    const actual = emitted.diagnostics.filter((d) => d.kind === "id-collision");
    expect(actual).toHaveLength(1);
    expect(emitted.emittedCases).toHaveLength(0);
    expect(celIdentityDiagnostics(graph, { now: NOW })).toEqual(actual);
    const authoredCase = graph.cel!.statements.find((s) => s.type === "CELCase")!;
    for (const soft of [false, true]) {
      expect(validateCEL(graph, { soft }).errors).toContainEqual(
        expect.objectContaining({
          kind: "id-collision",
          severity: "error",
          location: authoredCase.location,
          filePath: graph.filePath,
        }),
      );
    }
  });

  it("does not reject repeated skipped Patient refs, including the subject", () => {
    const graph = graphFrom(`case "Patient references":
- subject is "P".
- fact is "P".
- fact is "P" on 2026-01-01.`);
    expect(celIdentityDiagnostics(graph)).toEqual([]);
    expect(collisionKinds(graph)).toEqual([]);
    const emitted = emitCelToFhir(graph);
    expect(emitted.emittedCases).toHaveLength(1);
    expect(emitted.emittedCases[0].resources.map((r) => r.resourceType)).toEqual(["Patient"]);
  });

  it("includes the ambient Encounter in the collision check", () => {
    const graph = graphFrom(`${fact("Visit", "Encounter")}
case "Encounter references":
- subject is "P".
- encounter is "Visit".
- fact is "Visit".`);
    expect(collisionKinds(graph)).toEqual(["id-collision"]);
  });

  it("detects distinct fact names that normalize to the same resource identity", () => {
    const graph = graphFrom(`${fact("Reading!")}${fact("Reading?")}
case "Normalized facts":
- subject is "P".
- fact is "Reading!".
- fact is "Reading?".`);
    expect(collisionKinds(graph)).toEqual(["id-collision"]);
  });

  it("checks paths across the graph and attributes a collision to the later case", () => {
    const graph = graphFrom(`case "Same!":
- subject is "P".
case "Same?":
- subject is "P".`);
    const cases = graph.cel!.statements.filter((s) => s.type === "CELCase");
    expect(celIdentityDiagnostics(graph)).toEqual([
      expect.objectContaining({ kind: "id-collision", location: cases[1].location }),
    ]);
    expect(collisionKinds(graph)).toEqual(["id-collision"]);
  });

  it("allows the same reusable fact template in separate cases", () => {
    const graph = graphFrom(`${fact("Reading")}
case "First":
- subject is "P".
- fact is "Reading" on 2026-01-01.
case "Second":
- subject is "P".
- fact is "Reading" on 2026-04-01.`);
    expect(celIdentityDiagnostics(graph)).toEqual([]);
    expect(collisionKinds(graph)).toEqual([]);
    const emitted = emitCelToFhir(graph).emittedCases;
    expect(emitted).toHaveLength(2);
    expect(emitted[0].resources[1].id).not.toBe(emitted[1].resources[1].id);
  });

  it("uses actual type directories rather than rejecting every potential same-id pair", () => {
    const graph = graphFrom(`${fact("Datum!", "Observation")}${fact("Datum?", "Encounter")}
case "Different resource types":
- subject is "P".
- fact is "Datum!".
- fact is "Datum?".`);
    expect(celIdentityDiagnostics(graph)).toEqual([]);
    expect(collisionKinds(graph)).toEqual([]);
    const emitted = emitCelToFhir(graph).emittedCases;
    expect(emitted).toHaveLength(1);
    const [, observation, encounter] = emitted[0].resources;
    expect(observation.id).toBe(encounter.id);
    expect(observation.outputPath).not.toBe(encounter.outputPath);
  });

  it("supports two distinctly named instances with the same authored content", () => {
    const graph = graphFrom(`${fact("Recommended Activity", "ServiceRequest")}
${fact("Follow-up Recommended Activity", "ServiceRequest")}
case "Two instances":
- subject is "P".
- fact is "Recommended Activity" on 2026-01-01 with absent intent.
- fact is "Follow-up Recommended Activity" on 2026-04-01 with negative intent.`);
    expect(collisionKinds(graph)).toEqual([]);
    const emitted = emitCelToFhir(graph);
    expect(emitted.emittedCases).toHaveLength(1);
    const requests = emitted.emittedCases[0].resources.filter(
      (r) => r.resourceType === "ServiceRequest",
    );
    expect(requests).toHaveLength(2);
    expect(new Set(requests.map((r) => r.id)).size).toBe(2);
    expect(requests.map((r) => r.body.authoredOn)).toEqual(["2026-01-01", "2026-04-01"]);
    expect(requests[0].body.doNotPerform).toBe(true);
    expect(requests[1].body.status).toBe("stopped");
  });

  it("returns no unrelated emission diagnostic and tolerates an unparsed graph", () => {
    const graph = graphFrom(`fact "Skipped":
- defined by "NotAResource".
case "Skipped repeated refs":
- subject is "P".
- fact is "Skipped".
- fact is "Skipped".`);
    expect(emitCelToFhir(graph).diagnostics.length).toBeGreaterThan(0);
    expect(celIdentityDiagnostics(graph)).toEqual([]);
    expect(celIdentityDiagnostics({ ...graph, cel: undefined })).toEqual([]);
  });
});

describe("CEL declaration date diagnostic identity", () => {
  it("reports an invalid fact-body date once across repeated references and cases", () => {
    const graph = graphFrom(`${fact("Invalid", "Observation", '- date is "2026-02-30".')}
case "First":
- subject is "P".
- fact is "Invalid".
- fact is "Invalid" on 2026-03-01.
case "Second":
- subject is "P".
- fact is "Invalid".`);
    expect(validateCEL(graph).errors).toEqual([
      expect.objectContaining({
        kind: "invalid-date",
        message: expect.stringContaining('Fact "Invalid"'),
      }),
    ]);
  });

  it("keeps separate case-offset failures alongside the one declaration error", () => {
    const graph = graphFrom(`${fact("Invalid", "Observation", '- date is "2026-02-30".')}
${fact("Valid")}
case "First":
- subject is "P".
- anchor is 2026-01-01.
- fact is "Invalid".
- fact is "Valid" at anchor + 0.5 months.
case "Second":
- subject is "P".
- anchor is 2026-01-01.
- fact is "Invalid".
- fact is "Valid" at anchor + 0.5 months.`);
    const errors = validateCEL(graph).errors;
    expect(errors).toHaveLength(3);
    expect(errors.map((d) => d.kind)).toEqual(["invalid-date", "invalid-date", "invalid-date"]);
    expect(new Set(errors.map((d) => JSON.stringify(d.location))).size).toBe(3);
    expect(errors.filter((d) => d.message === "Invalid authored fact date offset.")).toHaveLength(
      2,
    );
  });
});
