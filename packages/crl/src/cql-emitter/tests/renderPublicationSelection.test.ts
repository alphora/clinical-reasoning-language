// REFACTOR:grounded (#320, reviewed 557): execute the rendered helper, not a CQL string golden.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  type PublicationCandidate,
  selectPublicationCandidate,
} from "../../emit/publicationSelection";
import { publicationTemporalVectors } from "../../emit/tests/publicationTemporalVectors";
import { driverArgs } from "../../results/driver";
import { parseDriverStdout } from "../../results/repoBundle";
import { cqlStringLiteral as literal } from "../cqlStrings";
import {
  PUBLICATION_CANDIDATE_CQL_TYPE,
  PUBLICATION_SELECTION_CQL_FUNCTIONS as names,
  PUBLICATION_SELECTION_CQL_PREFIX,
  renderPublicationSelectionHelpers,
} from "../renderPublicationSelection";

type Resource = Record<string, unknown>;
type Candidate = PublicationCandidate<Resource>;
type Vector = {
  id: string;
  rows: Candidate[];
  outcome: string;
  equalTime?: "error" | "preferLocal";
};
const older = "2026-09-06T10:00:00Z";
const newer = "2026-09-06T11:00:00Z";
function row(
  key: string,
  validity?: string,
  arm: Candidate["arm"] = "source",
  value: boolean | null = true,
): Candidate {
  return {
    key,
    contributorId: arm,
    arm,
    validity,
    ...(arm === "inferred" ? {} : { retrievedInputIdentity: `input::Observation/${key}` }),
    resource: {
      resourceType: "Observation",
      id: key,
      status: "final",
      code: { text: `opaque ${key}` },
      subject: { reference: "Patient/test" },
      ...(value === null ? {} : { valueBoolean: value }),
      extension: [{ url: "http://example.org/lineage", valueString: key }],
    },
  };
}
const vectors: Vector[] = [
  { id: "missing", rows: [], outcome: "missing" },
  { id: "false", rows: [row("f", undefined, "local", false)], outcome: "f" },
  { id: "unknown", rows: [row("u", undefined, "inferred", null)], outcome: "u" },
  { id: "new-unknown", rows: [row("old", older), row("u", newer, "inferred", null)], outcome: "u" },
  { id: "new-false", rows: [row("old", older), row("f", newer, "local", false)], outcome: "f" },
  {
    id: "new-source",
    rows: [row("old", older, "local"), row("new", newer)],
    outcome: "new",
    equalTime: "preferLocal",
  },
  {
    id: "offset",
    rows: [row("old", older), row("new", "2026-09-06T07:00:00-04:00")],
    outcome: "new",
  },
  { id: "old-tie", rows: [row("a", older), row("b", older), row("new", newer)], outcome: "new" },
  {
    id: "old-overlap",
    rows: [row("year", "2026"), row("month", "2026-09"), row("new", "2027")],
    outcome: "new",
  },
  {
    id: "equal-values",
    rows: [row("a", newer), row("b", newer)],
    outcome: "publication-ambiguous-selection",
  },
  {
    id: "conflicting-values",
    rows: [row("a", newer), row("b", newer, "local", false)],
    outcome: "publication-ambiguous-selection",
  },
  {
    id: "authored-local",
    rows: [row("a", newer), row("local", newer, "local", false)],
    outcome: "local",
    equalTime: "preferLocal",
  },
  {
    id: "same-qr",
    rows: [row("calculation", newer, "inferred"), row("answer", newer, "local", false)],
    outcome: "answer",
    equalTime: "preferLocal",
  },
  {
    id: "persisted-computation",
    rows: [row("persisted", newer, "local"), row("answer", newer, "local", false)],
    outcome: "publication-ambiguous-selection",
    equalTime: "preferLocal",
  },
  {
    id: "seconds-zero",
    rows: [row("local", newer, "local"), row("fraction", "2026-09-06T11:00:00.000Z")],
    outcome: "local",
    equalTime: "preferLocal",
  },
  {
    id: "seconds-trailing",
    rows: [row("local", newer, "local"), row("fraction", "2026-09-06T11:00:00.00000Z")],
    outcome: "local",
    equalTime: "preferLocal",
  },
  {
    id: "fraction-trailing",
    rows: [
      row("local", "2026-09-06T11:00:00.1Z", "local"),
      row("fraction", "2026-09-06T11:00:00.10000Z"),
    ],
    outcome: "local",
    equalTime: "preferLocal",
  },
  {
    id: "offset-equal",
    rows: [row("local", "2026-09-06T07:00:00-04:00", "local"), row("other", newer)],
    outcome: "local",
    equalTime: "preferLocal",
  },
  {
    id: "partial-overlap",
    rows: [row("year", "2026"), row("month", "2026-09")],
    outcome: "publication-incomparable-validity",
  },
  {
    id: "calendar-instant",
    rows: [row("day", "2026-09-06"), row("instant", newer)],
    outcome: "publication-incomparable-validity",
  },
  { id: "sole-unsupported", rows: [row("leap", "2026-12-31T23:59:60Z")], outcome: "leap" },
  {
    id: "sub-ms",
    rows: [row("sub", "2026-09-06T11:00:00.0001Z"), row("other", newer)],
    outcome: "publication-incomparable-validity",
  },
  {
    id: "invalid-loser",
    rows: [row("bad", "2026-02-30"), row("new", newer)],
    outcome: "publication-invalid-validity",
  },
  {
    id: "invalid-april-day",
    rows: [row("bad", "2026-04-31"), row("new", newer)],
    outcome: "publication-invalid-validity",
  },
  {
    id: "missing-zone",
    rows: [row("bad", "2026-09-06T11:00:00")],
    outcome: "publication-invalid-validity",
  },
  {
    id: "dated-undated",
    rows: [row("u"), row("d", newer)],
    outcome: "publication-undated-input",
    equalTime: "preferLocal",
  },
  { id: "both-undated", rows: [row("u"), row("d")], outcome: "publication-undated-input" },
  {
    id: "corrected-date",
    rows: [row("u", older), row("answer", newer, "local", false)],
    outcome: "answer",
  },
  {
    id: "no-input-id",
    rows: [{ ...row("bad", older), retrievedInputIdentity: undefined }, row("new", newer)],
    outcome: "publication-missing-input-identity",
  },
  {
    id: "repeat-key",
    rows: [row("same", older, "inferred"), row("same", newer, "inferred")],
    outcome: "publication-duplicate-input",
  },
  {
    id: "identical-copy",
    rows: [row("same", newer), row("same", newer)],
    outcome: "publication-duplicate-input",
  },
  {
    id: "repeat-input",
    rows: [row("a", older), { ...row("b", newer), retrievedInputIdentity: "input::Observation/a" }],
    outcome: "publication-duplicate-input",
  },
  {
    id: "distinct-contributor",
    rows: [
      row("a", older),
      {
        ...row("b", newer),
        contributorId: "second",
        retrievedInputIdentity: "input::Observation/a",
      },
    ],
    outcome: "b",
  },
];
for (const [id, calendar, instant, comparison] of publicationTemporalVectors) {
  vectors.push({
    id: `mixed-${id}`,
    rows: [row("calendar", calendar), row("instant", instant, "local", false)],
    outcome: comparison === "before" ? "instant" : comparison === "after" ? "calendar" : "publication-incomparable-validity",
    equalTime: "preferLocal",
  });
}
for (const vector of [...vectors].filter((v) => v.rows.length > 1)) {
  vectors.push({ ...vector, id: `${vector.id}-reverse`, rows: [...vector.rows].reverse() });
}

describe("publication selector CQL helper registration", () => {
  it("exports one distinct reserved function symbol per reusable body", () => {
    const rendered = renderPublicationSelectionHelpers();
    const declarations = [...rendered.matchAll(/define function "([^"]+)"/g)].map((m) => m[1]);
    expect(declarations).toEqual(Object.values(names));
    expect(new Set(declarations).size).toBe(declarations.length);
    expect(declarations.every((name) => name.startsWith(PUBLICATION_SELECTION_CQL_PREFIX))).toBe(
      true,
    );
  });
});

// Opt-in because the 216 MB CQF runtime is not a source dependency. This suite creates its own tiny
// repository and executes CURRENT rendered source; no ignored emit fixture, saved-result oracle, or dist emitter.
// Set CRL_PUBLICATION_CQL_ENGINE_JAR, CRL_PUBLICATION_CQL_DRIVER_DIR and optionally CRL_PUBLICATION_CQL_JAVA.
const engineJar = process.env.CRL_PUBLICATION_CQL_ENGINE_JAR;
describe.skipIf(!engineJar)("publication selector against pinned CQF 4.7 $apply", () => {
  it("preserves exact selected resources and distinguishes all selection errors from missing data", () => {
    const loaderPath = process.env.CRL_PUBLICATION_CQL_DRIVER_DIR;
    if (!engineJar || !loaderPath)
      throw new Error("Explicit engine jar and compiled driver directory are required");
    const sha = (bytes: string | Buffer): string =>
      createHash("sha256").update(bytes).digest("hex");
    expect(sha(readFileSync(engineJar))).toBe(
      "10e6ae4e0846671bdfb8005fd577e9c195c7e9896bbd21342002eecd055e6ae0",
    );
    expect(sha(readFileSync(path.join(loaderPath, "ApplyDriver.class")))).toBe(
      "d1725f7f05f9e9e02409d426ead81a001d54907a086b300f477bcbf27f9e1c9c",
    );
    const workParent = process.env.CRL_PUBLICATION_CQL_WORK_DIR ?? tmpdir();
    mkdirSync(workParent, { recursive: true });
    const work = mkdtempSync(path.join(workParent, "publication-cql-"));
    const save = (name: string, value: unknown): void =>
      writeFileSync(
        path.join(work, name),
        typeof value === "string" ? value : JSON.stringify(value, null, 2),
      );
    const libraryUrl = "http://example.org/Library/PublicationSelectionTest";
    const resources: Resource[] = [{ resourceType: "Patient", id: "test" }];
    const actions: Resource[] = [];
    const expectedResources = new Map<string, Resource>();
    const expectedErrors = new Map<string, string>();
    const fn = (key: keyof typeof names): string => `"${names[key]}"`;
    let cql =
      "library PublicationSelectionTest\nusing FHIR version '4.0.1'\ncontext Patient\n" +
      renderPublicationSelectionHelpers();
    cql +=
      '\ndefine function "Resource"(id System.String): singleton from ([Observation] O where O.id.value = id)\n';
    for (const vector of vectors) {
      const rows = vector.rows.map((r) => ({
        ...r,
        resource: { ...r.resource, id: `${vector.id}-${r.resource.id}` },
      }));
      resources.push(...new Map(rows.map((r) => [r.resource.id, r.resource])).values());
      const result = selectPublicationCandidate(rows, {
        conceptId: vector.id,
        equalTime: vector.equalTime ?? "error",
      });
      expect(
        result.state === "selected"
          ? result.candidate.key
          : result.state === "failed"
            ? result.diagnostic.code
            : "missing",
        vector.id,
      ).toBe(vector.outcome);
      const tuple = (r: Candidate): string =>
        `Tuple { key: ${literal(r.key)}, contributorId: ${literal(r.contributorId)}, arm: ${literal(r.arm)}, retrievedInputIdentity: ${r.retrievedInputIdentity === undefined ? "null as System.String" : literal(r.retrievedInputIdentity)}, resource: "Resource"(${literal(String(r.resource.id))}), validity: ${r.validity === undefined ? "null as System.String" : literal(r.validity)} }`;
      const ref = `"${vector.id}-result"`;
      cql += `\ndefine ${ref}: ${fn("select")}({ ${rows.map(tuple).join(", ")} } as List<${PUBLICATION_CANDIDATE_CQL_TYPE}>, ${literal(vector.id)}, ${literal(vector.equalTime ?? "error")})\n`;
      cql += `define "${vector.id}-record": ${fn("record")}(${ref})\n`;
      const check =
        result.state === "selected"
          ? `${ref}.state = 'selected' and ${ref}.selected.key = ${literal(result.candidate.key)} and ${ref}.failureCode is null and ${ref}.selected.validity ${result.candidate.validity === undefined ? "is null" : `= ${literal(result.candidate.validity)}`}`
          : result.state === "failed"
            ? `${ref}.state = 'failed' and ${ref}.selected is null and ${ref}.failureCode = ${literal(result.diagnostic.code)}`
              + (result.diagnostic.code === "publication-incomparable-validity"
                ? ` and PositionOf(${literal(result.diagnostic.message.includes("unsupported comparison") ? "unsupported comparison" : "overlapping precision")}, ${ref}.failureMessage) >= 0`
                : "")
            : `${ref}.state = 'missing' and "${vector.id}-record" is null and ${ref}.failureCode is null`;
      cql += `define "${vector.id}-check": ${check}\n`;
      const adUrl = `http://example.org/ActivityDefinition/${vector.id}`;
      resources.push({
        resourceType: "ActivityDefinition",
        id: vector.id,
        url: adUrl,
        status: "draft",
        kind: "CommunicationRequest",
        intent: "proposal",
        library: [libraryUrl],
        ...(result.state === "selected"
          ? {
              dynamicValue: [
                {
                  path: "contained",
                  expression: {
                    language: "text/cql-identifier",
                    expression: `${vector.id}-record`,
                  },
                },
              ],
            }
          : {}),
      });
      actions.push({
        id: vector.id,
        condition: [
          {
            kind: "applicability",
            expression: { language: "text/cql-identifier", expression: `${vector.id}-check` },
          },
        ],
        definitionCanonical: adUrl,
      });
      if (result.state === "selected") expectedResources.set(vector.id, result.candidate.resource);
      // One raised guard per named failure is sufficient; result envelopes still execute for every permutation.
      if (
        result.state === "failed" &&
        ![...expectedErrors.values()].includes(result.diagnostic.code)
      ) {
        expectedErrors.set(`loud-${vector.id}`, result.diagnostic.code);
        cql += `define "loud-${vector.id}": "${vector.id}-record" is not null\n`;
        actions.push({
          id: `loud-${vector.id}`,
          condition: [
            {
              kind: "applicability",
              expression: { language: "text/cql-identifier", expression: `loud-${vector.id}` },
            },
          ],
          definitionCanonical: adUrl,
        });
      }
    }
    resources.push({
      resourceType: "Library",
      id: "PublicationSelectionTest",
      name: "PublicationSelectionTest",
      url: libraryUrl,
      status: "draft",
      type: {
        coding: [
          { system: "http://terminology.hl7.org/CodeSystem/library-type", code: "logic-library" },
        ],
      },
      content: [{ contentType: "text/cql", data: Buffer.from(cql).toString("base64") }],
    });
    resources.push({
      resourceType: "PlanDefinition",
      id: "publication-selection",
      url: "http://example.org/PlanDefinition/publication-selection",
      status: "draft",
      library: [libraryUrl],
      action: actions,
    });
    save("PublicationSelectionTest.cql", cql);
    save("repo.json", {
      resourceType: "Bundle",
      type: "collection",
      entry: resources.map((resource) => ({ resource })),
    });
    save("expectations.json", {
      vectors,
      expectedResources: [...expectedResources],
      expectedErrors: [...expectedErrors],
    });
    const args = driverArgs({
      jvmFlags: ["-Xmx1g"],
      engineJarPath: engineJar,
      loaderPath,
      repoPath: path.join(work, "repo.json"),
      planDefinitionId: "publication-selection",
      subjectReference: "Patient/test",
    });
    const java = process.env.CRL_PUBLICATION_CQL_JAVA ?? "java";
    save("command.json", { java, args, helperSha256: sha(renderPublicationSelectionHelpers()) });
    const run = spawnSync(java, args, {
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 30_000_000,
    });
    save("stdout.txt", run.stdout ?? "");
    save("stderr.txt", run.stderr ?? "");
    expect(run.error, work).toBeUndefined();
    expect(run.status, work).toBe(0);
    const parsed: unknown = parseDriverStdout(run.stdout);
    save("parsed.json", parsed);
    const actualActions: string[] = [],
      observations: Resource[] = [],
      issues: Resource[] = [];
    function visit(value: unknown): void {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      const node = value as Resource;
      if (node.resourceType === "RequestGroup")
        actualActions.push(...((node.action ?? []) as { id: string }[]).map((a) => a.id));
      if (node.resourceType === "Observation") observations.push(node);
      if (node.resourceType === "OperationOutcome")
        issues.push(...((node.issue ?? []) as Resource[]));
      Object.values(node).forEach(visit);
    }
    visit(parsed);
    save("summary.json", { actualActions, issues, observations, vectorCount: vectors.length });
    expect(actualActions.sort(), work).toEqual(vectors.map((v) => v.id).sort());
    for (const [id, expected] of expectedResources)
      expect(
        observations.find((r) => r.id === expected.id),
        `${work}: ${id}`,
      ).toEqual(expected);
    expect(issues, work).toHaveLength(6);
    for (const [id, code] of expectedErrors) {
      const matching = issues.filter((issue) => String(issue.diagnostics).includes(code));
      expect(matching, `${work}: ${code}`).toHaveLength(1);
      expect(matching[0].severity).toBe("error");
      expect(matching[0].code).toBe("exception");
      expect(String(matching[0].diagnostics)).toContain(id);
    }
  }, 150_000);
});
