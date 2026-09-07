import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { emitCelToFhir } from "../../cel/emitter/emitFhir";
import { resolveCelImports } from "../../cel/imports";
import { validateCEL } from "../../cel/validator";
import { runCel } from "../run";

// REFACTOR:grounded (#320, discussion 555). Case-level dates are authored inputs, not a new selector.
// Independently ordered dates determine these membership examples. Assert exact activities and emitted
// dates together so agreement cannot be obtained by copying the helper into an expected-value function.
const POLICY = `library "Case Dates".
terminology "Choices":
- system is \`http://example.org/choices\`.
- code is \`yes\`.
- code is \`no\`.
terminology "Qualifying":
- system is \`http://example.org/choices\`.
- code is \`yes\`.
concept "Selected Choice":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- value from "Choices".
- code is \`selected-choice\`.
- definition is most recent this.
- source representation:
  - type is ServiceRequest.
  - coded from "Choices".
concept "Choice Qualifies":
- shape is Scalar.
- type is Observation.
- value type is boolean.
- definition is "Selected Choice" in "Qualifying".
activity "Approve":
- request CPGCommunicationRequest.
- with \`APPROVED\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`NOT APPROVED\`.
decision "Choice Decision":
first:
- when "Choice Qualifies" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
`;

const FACTS = `library "Date Cases".
covers "Case Dates".
fact "Subject":
- name is "Synthetic Subject".
- birth date is "1970-01-01".
- defined by "Patient".
fact "Positive Source":
- code is "http://example.org/choices|yes".
- date is "2026-01-01".
- defined by "ServiceRequest".
fact "Negative Answer":
- value is "http://example.org/choices|no".
- date is "2026-02-01".
- defined by "Case Dates"."Selected Choice".
`;

function celCase(
  name: string,
  sourceClause = "",
  answerClause = "",
  extra = "",
  expected = "Approve",
): string {
  return `case "${name}":
- subject is "Subject".
${extra}
- fact is "Positive Source"${sourceClause}.
- fact is "Negative Answer"${answerClause}.
- result is "Choice Decision" is "${expected}".
`;
}

function evaluate(
  cases: string,
  facts = FACTS,
  now?: Date,
): {
  cre: ReturnType<typeof runCel>;
  fhir: ReturnType<typeof emitCelToFhir>;
  validation: ReturnType<typeof validateCEL>;
} {
  const parent = path.resolve(os.tmpdir());
  const root = mkdtempSync(path.join(parent, "crl-case-dates-"));
  // Establish the immutable cleanup target before entering the test body.
  if (
    path.dirname(path.resolve(root)) !== parent ||
    !path.basename(root).startsWith("crl-case-dates-")
  ) {
    throw new Error("Unexpected temporary test directory");
  }
  try {
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "case-dates",
        version: "0.0.0",
        private: true,
        crl: { canonicalBase: "http://example.org/case-dates" },
      }),
    );
    writeFileSync(path.join(root, "policy.crl"), POLICY);
    const celPath = path.join(root, "cases.cel");
    writeFileSync(celPath, facts + cases);
    const graph = resolveCelImports(celPath);
    expect(graph.celParseErrors).toEqual([]);
    expect(graph.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const before = JSON.stringify(graph.cel);
    const cre = runCel(graph, { now });
    const fhir = emitCelToFhir(graph, { now });
    const validation = validateCEL(graph);
    expect(
      JSON.stringify(graph.cel),
      "Date resolution must not mutate reusable facts or clauses",
    ).toBe(before);
    return { cre, fhir, validation };
  } finally {
    // This test owns only the generated child of the OS temp directory.
    rmSync(root, { recursive: true, force: true });
  }
}

function expectOutcome(
  result: ReturnType<typeof evaluate>,
  expected: string[],
  sourceDates: (string | undefined)[],
): void {
  expect(result.cre.runs).toHaveLength(expected.length);
  expect(result.cre.runs.map((r) => r.status)).toEqual(expected.map(() => "pass"));
  expect(result.cre.runs.map((r) => r.produced.map((p) => p.recommendation))).toEqual(
    expected.map((x) => [x]),
  );
  expect(result.fhir.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(result.fhir.emittedCases).toHaveLength(expected.length);
  expect(
    result.fhir.emittedCases.map(
      (c) => c.resources.find((r) => r.resourceType === "ServiceRequest")?.body.authoredOn,
    ),
  ).toEqual(sourceDates);
}

describe("case fact dates shared by CRE and FHIR", () => {
  it("uses reusable fact-body dates when the case supplies no override", () => {
    expectOutcome(evaluate(celCase("fallback", "", "", "", "Deny")), ["Deny"], ["2026-01-01"]);
  });

  it("lets an absolute source override reverse the activity", () => {
    expectOutcome(evaluate(celCase("override", " on 2026-03-01")), ["Approve"], ["2026-03-01"]);
  });

  it("applies a local answer's case date too", () => {
    const result = evaluate(celCase("local override", "", " on 2025-12-01"));
    expectOutcome(result, ["Approve"], ["2026-01-01"]);
    expect(
      result.fhir.emittedCases[0].resources.find((r) => r.resourceType === "Observation")?.body
        .effectiveDateTime,
    ).toBe("2025-12-01");
  });

  it("resolves an ambient anchor rather than reading the body date", () => {
    expectOutcome(
      evaluate(celCase("ambient", " at anchor", "", "- anchor is 2026-03-01.")),
      ["Approve"],
      ["2026-03-01"],
    );
  });

  it("resolves a named anchor plus its offset", () => {
    expectOutcome(
      evaluate(celCase("named", ' at "Review" + 1 week', "", '- anchor "Review" is 2026-03-01.')),
      ["Approve"],
      ["2026-03-08"],
    );
  });

  it("keeps case overrides independent when the same facts are reused", () => {
    const result = evaluate(
      celCase("newer", " on 2026-03-01") + celCase("older", " on 2026-01-15", "", "", "Deny"),
    );
    expectOutcome(result, ["Approve", "Deny"], ["2026-03-01", "2026-01-15"]);
  });

  it("uses the override to resolve a formerly undated candidate", () => {
    const facts = FACTS.replace('- date is "2026-01-01".\n', "");
    expectOutcome(
      evaluate(celCase("previously undated", " on 2026-03-01"), facts),
      ["Approve"],
      ["2026-03-01"],
    );
  });

  it("uses the override to break a former fact-body tie", () => {
    const facts = FACTS.replace('date is "2026-01-01"', 'date is "2026-02-01"');
    expectOutcome(
      evaluate(celCase("former tie", " on 2026-03-01"), facts),
      ["Approve"],
      ["2026-03-01"],
    );
  });

  it.each([
    ["missing ambient", " at anchor", ""],
    ["missing named", ' at "Typo"', '- anchor "Review" is 2026-03-01.'],
    ["duplicate ambient", " at anchor", "- anchor is 2026-03-01.\n- anchor is 2026-04-01."],
    [
      "duplicate named",
      ' at "Review"',
      '- anchor "Review" is 2026-03-01.\n- anchor "Review" is 2026-04-01.',
    ],
  ])("rejects %s instead of falling back to the body date", (name, clause, extra) => {
    const result = evaluate(celCase(name, clause, "", extra));
    expect(result.cre.runs[0].status).toBe("error");
    expect(result.cre.runs[0].produced).toEqual([]);
    expect(result.cre.runs[0].diagnostics.join(" ")).toMatch(/anchor/i);
    expect(result.fhir.emittedCases).toEqual([]);
    expect(
      result.fhir.diagnostics.some((d) => d.severity === "error" && /anchor/i.test(d.message)),
    ).toBe(true);
  });

  it("refuses repeated emitting fact identities without choosing the first or last date", () => {
    const result = evaluate(
      celCase("duplicate fact", " on 2026-03-01", "", '- fact is "Positive Source" on 2026-04-01.'),
    );
    expect(result.cre.runs[0].status).toBe("error");
    expect(result.cre.runs[0].produced).toEqual([]);
    expect(result.fhir.emittedCases).toEqual([]);
    expect(result.fhir.diagnostics.some((d) => d.kind === "id-collision")).toBe(true);
    expect(result.validation.errors.some((d) => d.kind === "id-collision")).toBe(true);
  });

  it("represents two source data instances with distinct fact names and dates", () => {
    const facts =
      FACTS +
      `fact "Later Positive Source":
- code is "http://example.org/choices|yes".
- defined by "ServiceRequest".
`;
    const result = evaluate(
      celCase(
        "distinct instances",
        " on 2026-01-15",
        "",
        '- fact is "Later Positive Source" on 2026-03-01.',
      ),
      facts,
    );
    expect(result.cre.runs[0].status).toBe("pass");
    expect(result.cre.runs[0].produced.map((p) => p.recommendation)).toEqual(["Approve"]);
    expect(result.validation.errors).toEqual([]);
    expect(result.fhir.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const sources = result.fhir.emittedCases[0].resources.filter(
      (r) => r.resourceType === "ServiceRequest",
    );
    expect(sources.map((r) => r.body.authoredOn).sort()).toEqual(["2026-01-15", "2026-03-01"]);
    expect(new Set(sources.map((r) => r.id)).size).toBe(2);
  });

  it("does not invent an identity collision for skipped Patient references", () => {
    expectOutcome(
      evaluate(
        celCase("repeated subject", "", "", '- fact is "Subject".\n- fact is "Subject".', "Deny"),
      ),
      ["Deny"],
      ["2026-01-01"],
    );
  });

  it("returns diagnostics rather than crashing on an unfinished ambient encounter during identity preflight", () => {
    const facts = FACTS + 'fact "Unfinished Visit":\n- code is "http://example.org/visit|visit".\n';
    const result = evaluate(
      celCase(
        "unfinished encounter",
        "",
        "",
        '- encounter is "Unfinished Visit".\n- fact is "Positive Source".',
        "Deny",
      ),
      facts,
    );
    expect(result.cre.runs[0].status).toBe("error");
    expect(result.cre.runs[0].produced).toEqual([]);
    expect(result.validation.errors.some((d) => d.kind === "id-collision")).toBe(true);
    expect(result.fhir.diagnostics.some((d) => d.kind === "id-collision")).toBe(true);
    expect(result.fhir.diagnostics.some((d) => d.kind === "unsupported-yet")).toBe(true);
  });

  it.each(["1970-13-45", "1970-01-01T00:00:00Z"])(
    "rejects invalid Patient birthDate %s before either execution lane",
    (birthday) => {
      const result = evaluate(
        celCase("invalid birthday", " on 2026-03-01"),
        FACTS.replace('birth date is "1970-01-01"', `birth date is "${birthday}"`),
      );
      expect(result.cre.runs[0].status).toBe("error");
      expect(result.cre.runs[0].produced).toEqual([]);
      expect(result.fhir.emittedCases).toEqual([]);
      expect(result.fhir.diagnostics.some((d) => d.kind === "invalid-date")).toBe(true);
      expect(result.validation.errors.filter((d) => d.kind === "invalid-date")).toHaveLength(1);
    },
  );

  it.each(["Same Case", "same case", "Same Case!"])(
    "rejects the later actual output collision for case name %s",
    (secondName) => {
      const result = evaluate(
        celCase("Same Case", "", "", "", "Deny") + celCase(secondName, "", "", "", "Deny"),
      );
      expect(result.cre.runs.map((r) => r.status)).toEqual(["pass", "error"]);
      expect(result.cre.runs[0].produced.map((p) => p.recommendation)).toEqual(["Deny"]);
      expect(result.cre.runs[1].produced).toEqual([]);
      expect(result.cre.runs[1].diagnostics.join(" ")).toMatch(/id-collision/);
      expect(result.fhir.emittedCases).toHaveLength(1);
      expect(result.fhir.diagnostics.filter((d) => d.kind === "id-collision")).toHaveLength(1);
    },
  );

  it("keeps separate patient compartments independent even when case names repeat", () => {
    const facts = FACTS + 'fact "Other Subject":\n- name is "Other".\n- defined by "Patient".\n';
    const second = celCase("Same Case", "", "", "", "Deny").replace(
      'subject is "Subject"',
      'subject is "Other Subject"',
    );
    expectOutcome(
      evaluate(celCase("Same Case", "", "", "", "Deny") + second, facts),
      ["Deny", "Deny"],
      ["2026-01-01", "2026-01-01"],
    );
  });

  it.each(["month", "year"])(
    "rejects fractional %s offsets in every author/execution lane",
    (unit) => {
      const result = evaluate(
        celCase("fractional calendar", ` at anchor + 0.5 ${unit}`, "", "- anchor is 2026-03-01."),
      );
      expect(result.cre.runs[0].status).toBe("error");
      expect(result.cre.runs[0].produced).toEqual([]);
      expect(result.fhir.emittedCases).toEqual([]);
      expect(result.fhir.diagnostics.some((d) => d.kind === "invalid-date")).toBe(true);
      expect(result.validation.errors.some((d) => d.kind === "invalid-date")).toBe(true);
    },
  );

  it("rejects duplicate body dates even when a case supplies an override", () => {
    const facts = FACTS.replace(
      'date is "2026-01-01".',
      'date is "2026-01-01".\n- date is "2026-01-02".',
    );
    const result = evaluate(celCase("duplicate dates", " on 2026-03-01"), facts);
    expect(result.cre.runs[0].status).toBe("error");
    expect(result.cre.runs[0].produced).toEqual([]);
    expect(result.fhir.emittedCases).toEqual([]);
    expect(result.fhir.diagnostics.some((d) => d.kind === "duplicate-date")).toBe(true);
    expect(result.validation.errors.some((d) => d.kind === "duplicate-date")).toBe(true);
  });

  it("refuses calendar-versus-instant ordering without inventing a timezone or midnight", () => {
    const result = evaluate(
      celCase("same day", " at anchor + 12 hours", "", "- anchor is 2026-02-01."),
    );
    expect(result.cre.runs[0].status).toBe("error");
    expect(result.cre.runs[0].produced).toEqual([]);
    expect(result.cre.runs[0].diagnostics.join(" ")).toMatch(/temporal comparison.*indeterminate/);
    expect(result.cre.runs[0].diagnostics.join(" ")).toContain("2026-02-01T12:00:00.000Z");
    expect(result.cre.runs[0].diagnostics.join(" ")).toContain("explicit time zones");
    expect(result.fhir.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("compares offsets without reversing the engine winner", () => {
    // 11:00 -02:00 is 13:00 UTC: the local negative is newer than the noon positive source.
    const facts = FACTS.replace('date is "2026-02-01"', 'date is "2026-02-01T11:00:00.000-02:00"');
    const result = evaluate(
      celCase("offset conflict", " at anchor + 12 hours", "", "- anchor is 2026-02-01.", "Deny"),
      facts,
    );
    expectOutcome(result, ["Deny"], ["2026-02-01T12:00:00.000Z"]);
    expect(
      result.fhir.emittedCases[0].resources.find((r) => r.resourceType === "Observation")?.body
        .effectiveDateTime,
    ).toBe("2026-02-01T11:00:00.000-02:00");
  });

  it("treats equivalent offset spellings as a tie instead of choosing lexically", () => {
    const facts = FACTS.replace('date is "2026-01-01"', 'date is "2026-02-01T12:00:00Z"').replace(
      'date is "2026-02-01"',
      'date is "2026-02-01T10:00:00.000-02:00"',
    );
    const result = evaluate(celCase("equal instants"), facts);
    expect(result.cre.runs[0].status).toBe("error");
    expect(result.cre.runs[0].produced).toEqual([]);
    expect(result.cre.runs[0].diagnostics.join(" ")).toMatch(
      /disagreeing candidates on the same date/,
    );
    expect(result.fhir.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("rejects an invalid body date in all lanes even when overridden", () => {
    const result = evaluate(
      celCase("invalid body", " on 2026-03-01"),
      FACTS.replace('date is "2026-01-01"', 'date is "2026-02-30"'),
    );
    expect(result.cre.runs[0].status).toBe("error");
    expect(result.cre.runs[0].produced).toEqual([]);
    expect(result.fhir.emittedCases).toEqual([]);
    expect(result.fhir.diagnostics.some((d) => d.kind === "invalid-date")).toBe(true);
    expect(result.validation.errors.filter((d) => d.kind === "invalid-date")).toHaveLength(1);
  });

  it("uses the same explicitly supplied clock for authored now in both lanes", () => {
    const now = new Date("2026-03-01T12:34:56.000Z");
    expectOutcome(
      evaluate(
        celCase("now", " at anchor", "", "- anchor is now."),
        FACTS.replace('date is "2026-02-01"', 'date is "2026-02-01T00:00:00Z"'),
        now,
      ),
      ["Approve"],
      ["2026-03-01T12:34:56.000Z"],
    );
  });

  it("preserves an explicitly authored sub-day offset", () => {
    expectOutcome(
      evaluate(
        celCase("hours", " at anchor + 12 hours", "", "- anchor is 2026-03-01."),
        FACTS.replace('date is "2026-02-01"', 'date is "2026-02-01T00:00:00+00:00"'),
      ),
      ["Approve"],
      ["2026-03-01T12:00:00.000Z"],
    );
  });
});
