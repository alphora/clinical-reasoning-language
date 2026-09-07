import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { emitCelToFhir } from "../../cel/emitter/emitFhir";
import { resolveCelImports } from "../../cel/imports";
import { runCel } from "../run";
import { validateCEL } from "../../cel/validator";
import * as celEmission from "../../cel/emitter/emitFhir";

// REFACTOR:grounded (#320, review 564): actual emitted source records, not a shadow presence index.
function execute(references: string[], answer?: string, code = "repair", sourceDate = "2026-01-01", alterSubject?: (reference: string) => unknown, modifiers: { intent?: string; stage?: string } = {}) {
  const parent = path.resolve(os.tmpdir());
  const directory = mkdtempSync(path.join(parent, "crl-source-publication-"));
  if (path.dirname(directory) !== parent || !path.basename(directory).startsWith("crl-source-publication-")) throw new Error("Unexpected test directory");
  try {
    writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "source-publication", private: true, crl: { canonicalBase: "http://example.org" } }));
    writeFileSync(path.join(directory, "policy.crl"), readFileSync(path.join(__dirname, "../../emit/tests/fixtures/publication-source.crl")));
    const cel = path.join(directory, "cases.cel");
    writeFileSync(cel, `library "Source Cases".
covers "Source Publication".
fact "Subject":
- name is "Synthetic subject".
- birth date is "1970-01-01".
- defined by "Patient".
fact "Request":
- code is "http://example.org/procedures|${code}".
- date is "${sourceDate}".
- defined by "ServiceRequest".
${modifiers.stage ? `- stage is ${modifiers.stage}.` : ""}
fact "Answer":
${answer === undefined ? "" : `- value is ${answer}.`}
- date is "2026-02-01".
- defined by "Source Publication"."Requested".
case "Case":
- subject is "Subject".
${references.map((ref) => `- fact is "${ref}"${ref === "Request" && modifiers.intent ? ` with ${modifiers.intent} intent` : ""}.`).join("\n")}
- result is "D" is "${answer === "false" ? "Deny" : "Approve"}".
`);
    const graph = resolveCelImports(cel);
    expect(validateCEL(graph).errors).toEqual([]);
    const emission = emitCelToFhir(graph);
    expect(emission.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    // Boundary injection: these forms are not authored by CEL, whose writer emits relative Patient refs.
    if (alterSubject !== undefined) {
      const supplied = structuredClone(emission);
      for (const c of supplied.emittedCases) for (const r of c.resources) if (r.resourceType === "ServiceRequest") {
        const subject = r.body.subject as { reference: string };
        r.body.subject = { reference: alterSubject(subject.reference) };
      }
      const spy = vi.spyOn(celEmission, "emitCelToFhir").mockReturnValue(supplied);
      try { return { run: runCel(graph).runs[0], emission: supplied }; } finally { spy.mockRestore(); }
    }
    return { run: runCel(graph).runs[0], emission };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
describe("CRE ServiceRequest publication", () => {
  it.each(["repair", "second-code"])("a matching %s request supplies true", (code) => {
    const { run, emission } = execute(["Request"], undefined, code);
    expect(run.produced.map((p) => p.recommendation)).toEqual(["Approve"]);
    expect(run.status).toBe("pass");
    expect(emission.emittedCases[0].resources.find((r) => r.resourceType === "ServiceRequest")?.body.authoredOn).toBe("2026-01-01");
  });
  it.each([{ refs: [] }, { refs: ["Request"] }])("absence/nonmatch pauses %j", ({ refs }) => {
    const { run } = execute(refs, undefined, "unrelated");
    expect(run.produced).toEqual([]);
    expect(run.trace[0].blockedUnknown).toBe(true);
  });
  it("newer explicit false overrides a matching source", () => {
    const { run } = execute(["Request", "Answer"], "false");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["Deny"]);
    expect(run.status).toBe("pass");
  });
  it("newer unknown pauses despite a matching source", () => {
    const { run } = execute(["Request", "Answer"]);
    expect(run.produced).toEqual([]);
    expect(run.trace[0].blockedUnknown).toBe(true);
  });
  it("a later source displaces the earlier false answer", () => {
    const { run } = execute(["Request", "Answer"], "false", "repair", "2026-03-01");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["Approve"]);
  });
  it.each([{ intent: "absent" }, { intent: "negative" }, { stage: "proposed" }])("reports unsupported source state authored through CEL %j", (modifiers) => {
    const { run } = execute(["Request"], undefined, "repair", "2026-01-01", undefined, modifiers);
    expect(run.status).toBe("error");
    expect(JSON.stringify(run)).toContain("publication-source-state-unsupported");
    expect(run.produced).toEqual([]);
  });
  it("refuses valid sub-millisecond input in CRE rather than silently truncating it", () => {
    const { run } = execute(["Request", "Answer"], "false", "repair", "2026-01-01T10:00:00.1234567Z");
    expect(run.status).toBe("error");
    expect(JSON.stringify(run)).toContain("publication-incomparable-validity");
    expect(run.produced).toEqual([]);
  });
  it.each([
    (_ref: string) => undefined,
    (ref: string) => ref.replace("Patient/", "Group/"),
    (ref: string) => `http://server/fhir/${ref}`,
    (ref: string) => `${ref}/_history/3`,
  ])("matches the pinned provider's unreturned-subject boundary", (alter) => {
    const { run } = execute(["Request"], undefined, "repair", "2026-01-01", alter);
    expect(run.status).not.toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.trace[0].blockedUnknown).toBe(true);
  });
});
