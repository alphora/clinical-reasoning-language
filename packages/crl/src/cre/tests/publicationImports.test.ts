import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCelImports } from "../../cel/imports";
import { runCel } from "../run";
import { emitCelToFhir, prepareCelPublications } from "../../cel/emitter/emitFhir";

// REFACTOR:grounded (#320, plan593): owner identity and actual CEL values, not registry presence.
const fixture = path.join(__dirname, "../../emit/tests/fixtures/publication-imports");
function project(check: (dir: string) => void) {
  const parent = path.resolve(os.tmpdir()), dir = mkdtempSync(path.join(parent, "crl-import-publication-"));
  if (path.dirname(dir) !== parent || !path.basename(dir).startsWith("crl-import-publication-")) throw Error("Unexpected temporary path");
  try { cpSync(fixture, dir, { recursive: true }); check(dir); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
function edit(dir: string, file: string, change: (s: string) => string) {
  const p = path.join(dir, file), before = readFileSync(p, "utf8"), after = change(before);
  expect(after, `Fixture edit must change ${file}`).not.toBe(before);
  writeFileSync(p, after);
}
function execute(dir: string, file = "cases.cel") {
  const graph = resolveCelImports(path.join(dir, file));
  expect(graph.celParseErrors).toEqual([]);
  return { graph, result: runCel(graph) };
}
function activityOnly(dir: string) {
  edit(dir, "cases.cel", s => s.slice(0, s.indexOf('case "Local complete":')) + s.slice(s.indexOf('case "Local complete":'), s.indexOf('case "Newer weight":')));
}
function installWeight(dir: string, keepLocal: boolean) {
  const installed = path.join(dir, "node_modules/measurements"); mkdirSync(installed, { recursive: true });
  writeFileSync(path.join(installed, "package.json"), JSON.stringify({ name: "measurements", version: "1.0.0", crl: { libraries: ["weight.crl"] } }));
  cpSync(path.join(dir, "weight.crl"), path.join(installed, "weight.crl"));
  if (!keepLocal) rmSync(path.join(dir, "weight.crl"));
}
describe("CRE imported publication preparation", () => {
  it.each([false, true])("evaluates both same-named operands across transitive libraries (include=%s)", include => project(dir => {
    if (include) edit(dir, "policy.crl", s => s.replace('library "Policy".', 'library "Policy".\ninclude "BMI Library".'));
    const { graph, result } = execute(dir);
    expect(result.errors).toEqual([]); expect(result.runs).toHaveLength(8);
    expect(result.runs.slice(0, 8).map(r => ({ status: r.status, diagnostics: r.diagnostics })))
      .toEqual(Array.from({ length: 8 }, () => ({ status: "pass", diagnostics: [] })));
    expect(result.runs[0].trace[0].facts?.sort()).toEqual(["Height", "Weight"]);
    expect(result.runs[1].trace[0].facts?.sort()).toEqual(["Height", "Low Weight"]);
    expect(result.runs[4].trace[0].facts).toEqual(["Override BMI"]);
    const prepared = prepareCelPublications(graph)!;
    expect(new Set(prepared.descriptors.map(d => d.identity.sourceIdentity)).size).toBe(4);
    expect(emitCelToFhir(graph).diagnostics.filter(d => d.severity === "error")).toEqual([]);
  }));
  it("rejects invalid Weight beside missing Height in the isolated negative fixture", () => project(dir => {
    const { result } = execute(dir, "invalid.cel");
    expect(result.errors).toEqual([]); expect(result.runs).toHaveLength(1);
    expect(result.runs[0].status).toBe("error"); expect(result.runs[0].produced).toEqual([]);
    expect(result.runs[0].diagnostics.join("\n")).toContain("publication-bmi-nonpositive");
  }));
  it.each(["missing", "cycle"])("rejects an unused %s include without relying on a pause assertion", kind => project(dir => {
    activityOnly(dir);
    edit(dir, "policy.crl", s => s.replace('library "Policy".', 'library "Policy".\ninclude "Broken".'));
    if (kind === "cycle") writeFileSync(path.join(dir, "broken.crl"), 'library "Broken".\ninclude "Policy".');
    const { result } = execute(dir); expect(result.runs).toHaveLength(1);
    expect(result.runs[0].status).toBe("error"); expect(result.runs[0].produced).toEqual([]);
    expect(result.runs[0].diagnostics.join("\n")).toContain("publication-import-error");
  }));
  it("ignores an unrelated broken registered library", () => project(dir => {
    activityOnly(dir); writeFileSync(path.join(dir, "unrelated.crl"), 'library "Unrelated".\ninclude "Missing".');
    const { result } = execute(dir); expect(result.runs[0].status).toBe("pass");
  }));
  it("evaluates explicitly included installed publication operands", () => project(dir => {
    installWeight(dir, false);
    edit(dir, "policy.crl", s=>s.replace('library "Policy".', 'library "Policy".\ninclude "BMI Library".'));
    edit(dir, "bmi.crl", s=>s.replace('library "BMI Library".', 'library "BMI Library".\ninclude "Weight Library".'));
    const { result } = execute(dir);
    expect(result.runs.slice(0,8).map(r=>({status:r.status,diagnostics:r.diagnostics})))
      .toEqual(Array.from({length:8},()=>({status:"pass",diagnostics:[]})));
  }));
  it("uses an explicitly included package declaration instead of its invalid local shadow", () => project(dir => {
    installWeight(dir, true); activityOnly(dir);
    edit(dir, "policy.crl", s=>s.replace('library "Policy".', 'library "Policy".\ninclude "BMI Library".'));
    edit(dir, "bmi.crl", s=>s.replace('library "BMI Library".', 'library "BMI Library".\ninclude "Weight Library".'));
    edit(dir, "weight.crl", s=>s.replace('value type is Quantity', 'value type is boolean'));
    // CEL's own defined-by resolver is local-first. Source data exercises the package's
    // prepared query without pretending that CEL can name the shadowed package assertion.
    edit(dir, "cases.cel", s=>s.replaceAll('- defined by "Weight Library"."Measurement".', '- defined by "Observation".\n- code is "http://loinc.org|29463-7".'));
    const { result } = execute(dir); expect(result.runs[0].status,result.runs[0].diagnostics.join("\n")).toBe("pass");
    expect(result.runs[0].trace[0].facts?.sort()).toEqual(["Height","Weight"]);
  }));
  it("uses a local sibling without accidentally preparing an unused installed shadow", () => project(dir => {
    installWeight(dir, true); activityOnly(dir);
    edit(dir, "node_modules/measurements/weight.crl", s=>s.replace('value type is Quantity', 'value type is boolean'));
    const { result } = execute(dir); expect(result.runs[0].status,result.runs[0].diagnostics.join("\n")).toBe("pass");
  }));
  it("does not reinterpret CEL's local legacy target as CRL's included package publication", () => project(dir => {
    installWeight(dir, true); activityOnly(dir);
    edit(dir, "policy.crl", s => s.replace('library "Policy".', 'library "Policy".\ninclude "BMI Library".'));
    edit(dir, "bmi.crl", s => s.replace('library "BMI Library".', 'library "BMI Library".\ninclude "Weight Library".'));
    writeFileSync(path.join(dir, "weight.crl"), `library "Weight Library".
concept "Measurement":
- shape is Scalar.
- type is Observation.
- value type is boolean.
- code is \`legacy-weight\`.`);
    const { result } = execute(dir);
    expect(result.runs[0].status).toBe("error");
    expect(result.runs[0].produced).toEqual([]);
    expect(result.runs[0].diagnostics.join("\n")).toContain("publication-ambiguous-scope");
  }));
  it("refuses two participating source owners sharing a trace/cache identity", () => project(dir => {
    installWeight(dir, true); activityOnly(dir);
    edit(dir, "policy.crl", s=>s.replace('library "Policy".', 'library "Policy".\ninclude "Weight Library".'));
    const { result } = execute(dir); expect(result.runs[0].status).toBe("error");
    expect(result.runs[0].produced).toEqual([]);
    expect(result.runs[0].diagnostics.join("\n")).toContain("publication-ambiguous-scope");
  }));
  it.each(["local", "package"])("rejects mixed CEL/CRE owners with an explicitly covered %s library", covered => project(dir => {
    const installed = path.join(dir, "node_modules/policy");
    mkdirSync(installed, { recursive: true });
    writeFileSync(path.join(installed, "package.json"), JSON.stringify({ name: "policy", version: "1.0.0", crl: { libraries: ["policy.crl"] } }));
    writeFileSync(path.join(installed, "policy.crl"), `library "Policy".
concept "Answer":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`package-answer\`.
- shape reduction is most recent.
activity "Approve":
- request CPGCommunicationRequest.
- with \`APPROVED\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`DENIED\`.
decision "D":
first:
- when "Answer" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`);
    writeFileSync(path.join(dir, "policy.crl"), `library "Policy".
include "Policy".
concept "Answer":
- shape is Scalar.
- type is Observation.
- value type is boolean.
- code is \`local-answer\`.
concept "Trigger":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`trigger\`.
- shape reduction is most recent.
activity "Approve":
- request CPGCommunicationRequest.
- with \`APPROVED\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`DENIED\`.
decision "D":
first:
- when "Answer" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`);
    writeFileSync(path.join(dir, "cases.cel"), `library "Cases".
covers "Policy".
fact "P":
- defined by "Patient".
fact "Local true":
- defined by "Policy"."Answer".
- value is true.
- date is "2026-09-01".
fact "Package false":
- defined by "Observation".
- code is "http://example.org/imports/CodeSystem/publication-imports-local|package-answer".
- value is false.
- date is "2026-09-01".
case "Wrong owner must fail":
- subject is "P".
- fact is "Local true".
- fact is "Package false".
- result is "D" is "Deny".`);
    // The public runner accepts caller-owned/overlay graphs. Exercise both
    // covered source identities explicitly, independent of covers name resolution.
    const graph = resolveCelImports(path.join(dir, "cases.cel"));
    graph.coversTarget = (covered === "local" ? graph.crlRegistry!.byNameLocal : graph.crlRegistry!.byNamePackage).get("Policy")!;
    graph.resolvedLibraryPaths = new Set([graph.coversTarget.filePath, graph.crlRegistry!.byNamePackage.get("Policy")!.filePath]);
    expect(prepareCelPublications(graph)!.diagnostics).toEqual([]);
    const result = runCel(graph);
    expect(result.runs[0].status).toBe("error");
    expect(result.runs[0].produced).toEqual([]);
    expect(result.runs[0].diagnostics.join("\n")).toContain(covered === "local"
      ? "has multiple participating source owners" : "to different source owners");
  }));
  it.each(["hidden", "alias", "wrong-kind", "cycle", "legacy-operand"])("refuses %s producer resolution", kind => project(dir => {
    activityOnly(dir);
    if (kind === "alias") edit(dir, "bmi.crl", s => s.replace('library "BMI Library".', 'library "BMI Library".\ninclude "Weight Library" as "W".').replaceAll('"Weight Library"."Measurement"', '"W"."Measurement"'));
    if (kind === "legacy-operand") edit(dir, "height.crl", s => s.replace("- shape reduction is most recent.", ""));
    if (kind === "wrong-kind") edit(dir, "weight.crl", s => s.slice(0, s.indexOf('concept "Measurement":')) + 'terminology "Measurement":\n- system is `http://example.org`.\n- code is `weight`.');
    if (kind === "cycle") edit(dir, "weight.crl", s => s.replace('- code is `weight`.', '- definition is body mass index of "BMI Library"."BMI" and "Height Library"."Measurement" using validity of "BMI Library"."BMI".'));
    if (kind === "hidden") {
      installWeight(dir, false);
    }
    const { result } = execute(dir); expect(result.runs[0].status).toBe("error"); expect(result.runs[0].produced).toEqual([]);
    if (kind === "legacy-operand") expect(result.runs[0].diagnostics.join("\n")).toContain("publication-bmi-operand-unsupported");
    else expect(result.runs[0].diagnostics.join("\n")).toMatch(/publication-(operand|producer|reference|unsupported|preparation|dependency-cycle)/);
  }));
  it.each(["missing", "activity", "bare"])("does not seed a package concept from a CEL %s target", kind => project(dir => {
    const installed = path.join(dir, "node_modules/policy"); mkdirSync(installed, { recursive: true });
    writeFileSync(path.join(installed, "package.json"), JSON.stringify({ name: "policy", version: "1.0.0", crl: { libraries: ["policy.crl"] } }));
    writeFileSync(path.join(installed, "policy.crl"), `library "Policy".
concept "X":
- shape is Scalar.
- type is Observation.
- value type is boolean.
- code is \`package-x\`.`);
    writeFileSync(path.join(dir, "policy.crl"), `library "Policy".
include "Policy".
concept "Trigger":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`trigger\`.
- shape reduction is most recent.
${kind === "activity" ? 'activity "X":\n- request CPGCommunicationRequest.\n- with `X`.' : ''}
activity "Approve":
- request CPGCommunicationRequest.
- with \`APPROVED\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`DENIED\`.
decision "D":
first:
- when "X" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`);
    writeFileSync(path.join(dir, "cases.cel"), `library "Cases".
covers "Policy".
fact "P":
- defined by "Patient".
fact "Wrong target":
- defined by ${kind === "bare" ? '"X"' : '"Policy"."X"'}.
- value is true.
- date is "2026-09-01".
case "Do not infer a concept target":
- subject is "P".
- fact is "Wrong target".
- result is "D" is "Approve".`);
    const { result } = execute(dir);
    expect(result.runs[0].status).toBe("error");
    expect(result.runs[0].produced).toEqual([]);
    expect(result.runs[0].diagnostics.join("\n")).toContain("publication-ambiguous-scope");
    expect(result.runs[0].diagnostics.join("\n")).toContain(`as ${kind === "activity" ? "activity" : "unresolved"}`);
  }));
});
