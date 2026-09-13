// REFACTOR:grounded: suite contracts are derived from the approved MV/regression separation.
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { celSuiteRole, resolveCelSuite, suiteCaseKey, type CelSuite } from "../suite";
import { emitCelSuite } from "../suiteEmit";
import { publishMvCel } from "../publishSuite";
import { buildSuiteExecutionModel } from "../../provenance/cockpitModel";
import { caseViewKey } from "../../cre/viewModel";
import { runRegression } from "../regression";
import { validateCelCommand } from "../validateCommand";

const roots: string[] = [];
const crl = `library "Policy".
concept "Answer":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`answer\`.
`;
function cel(library: string, id: string, value = "true"): string {
  return `library "${library}".
covers "Policy".
fact "Subject":
- name is "Subject".
- defined by "Patient".
fact "Answer":
- defined by "Policy"."Answer".
- value is ${value}.
case "Same display name":
- id is "${id}".
- subject is "Subject".
- fact is "Answer".
`;
}
function put(root: string, file: string, text: string): string {
  const p = join(root, file); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); return p;
}
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "crl-suite-")); roots.push(root);
  put(root, "package.json", JSON.stringify({ name: "suite-test", version: "1.0.0", crl: { canonicalBase: "http://example.org/suite" } }));
  put(root, "src/crl/policy.crl", crl);
  put(root, "src/cel/mv/a.cel", cel("Clinical A", "a"));
  put(root, "src/cel/mv/nested/a.cel", cel("Clinical B", "b", "false"));
  put(root, "src/cel/regression/extra.cel", cel("Engineering", "extra"));
  return root;
}
function suite(root: string, purpose: "mv" | "regression" = "mv"): CelSuite {
  const result = resolveCelSuite(root, purpose);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.suite;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("CEL suite selection", () => {
  it("uses platform path casing and does not attribute same-file duplicate names to a sibling", () => {
    const root = fixture();
    expect(celSuiteRole(join(root, "src/cel/mv/a.cel"))).toBe("mv");
    expect(celSuiteRole(join(root, "src/cel/MV/a.cel"))).toBe(process.platform === "win32" ? "mv" : undefined);
    const original = cel("Clinical A", "a");
    put(root, "src/cel/mv/a.cel", original + "\n" + original.slice(original.indexOf("case ")).replace('- id is "a".', '- id is "a-duplicate".'));
    const model = buildSuiteExecutionModel(suite(root))!;
    const duplicate = suiteCaseKey("src/cel/mv/a.cel", "Same display name");
    expect(model.caseNameCollisions).toEqual([duplicate]);
    expect([...model.duplicateScenarioNames]).toEqual([duplicate]);
    expect(model.caseIdByName[suiteCaseKey("src/cel/mv/nested/a.cel", "Same display name")]).toBe("b");
  });
  it("keeps same-name MV cases navigable by their own IDs and excludes regression from MV progress", () => {
    const root = fixture(), model = buildSuiteExecutionModel(suite(root))!;
    expect(model.scenarios.scenarios).toHaveLength(2);
    expect(model.scenarios.scenarios.map(sc => model.caseIdByName[caseViewKey(sc.case)])).toEqual(["a", "b"]);
    expect(model.duplicateScenarioNames.size).toBe(0);
    const regression = runRegression(root);
    expect("caseCount" in regression && regression.caseCount).toBe(3);
    expect(readFileSync(join(root, "src/cel/mv/a.cel"), "utf8")).toBe(cel("Clinical A", "a"));
  });
  it("publishes the complete MV suite and preserves it on an invalid sibling", () => {
    const source = fixture(); const out = mkdtempSync(join(tmpdir(), "crl-suite-publish-")); roots.push(out);
    const first = publishMvCel(join(source, "src/cel/mv/a.cel"), out);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(JSON.stringify(first));
    const manifest = readFileSync(first.manifest, "utf8");
    expect(JSON.parse(manifest)).toMatchObject({ schemaVersion: 1, cases: [{ caseId: "a" }, { caseId: "b" }] });
    put(source, "src/cel/mv/nested/a.cel", "invalid CEL");
    expect(publishMvCel(source, out).ok).toBe(false);
    expect(readFileSync(first.manifest, "utf8")).toBe(manifest);
    for (const p of first.written) expect(readFileSync(p, "utf8")).toBeTruthy();
    rmSync(join(source, "src/cel/mv"), { recursive: true }); mkdirSync(join(source, "src/cel/mv"));
    expect(publishMvCel(source, out)).toMatchObject({ ok: true, written: [] });
    expect(JSON.parse(readFileSync(first.manifest, "utf8")).cases).toEqual([]);
  });
  // @kit mv-case-authoring:suite-selection
  it("selects every MV file from either file or policy, retaining same names in distinct files", () => {
    const root = fixture(), selected = suite(root);
    expect(selected.files.map(f => f.sourceFile)).toEqual(["src/cel/mv/a.cel", "src/cel/mv/nested/a.cel"]);
    const direct = resolveCelSuite(join(root, "src/cel/mv/nested/a.cel"));
    expect(direct.ok && direct.suite.files.map(f => f.sourceFile)).toEqual(selected.files.map(f => f.sourceFile));
    expect(suiteCaseKey(selected.files[0].sourceFile, "Same display name")).not.toBe(suiteCaseKey(selected.files[1].sourceFile, "Same display name"));
    expect(suite(root, "regression").files.map(f => f.role)).toEqual(["mv", "mv", "regression"]);
  });
  it("refuses normal direct regression and unclassified selections", () => {
    const root = fixture();
    expect(resolveCelSuite(join(root, "src/cel/regression/extra.cel"))).toMatchObject({ ok: false, diagnostics: [{ code: "selection" }] });
    put(root, "src/cel/old.cel", cel("Old", "old"));
    expect(resolveCelSuite(root)).toMatchObject({ ok: false, diagnostics: [{ code: "layout" }] });
  });
  it.each(["duplicate-library", "duplicate-case-id", "policy-mismatch"] as const)("diagnoses %s before aggregation", code => {
    const root = fixture();
    let text = cel(code === "duplicate-library" ? "Clinical A" : "Other", code === "duplicate-case-id" ? "a" : "other");
    if (code === "policy-mismatch") { put(root, "src/crl/foreign.crl", 'library "Foreign".'); text = text.replace('covers "Policy"', 'covers "Foreign"'); }
    put(root, "src/cel/mv/nested/a.cel", text);
    expect(resolveCelSuite(root)).toMatchObject({ ok: false, diagnostics: [{ code }] });
  });
  it("invalid regression content is not evaluated by normal MV selection", () => {
    const root = fixture(); put(root, "src/cel/regression/extra.cel", "invalid regression input");
    expect(suite(root).files).toHaveLength(2);
    expect(validateCelCommand(join(root, "src/cel/mv/a.cel")).errors).toEqual([]);
    expect(resolveCelSuite(root, "regression")).toMatchObject({ ok: false });
  });
  it("distinguishes a missing MV folder from an explicitly empty one", () => {
    const root = fixture(); rmSync(join(root, "src/cel/mv"), { recursive: true });
    expect(resolveCelSuite(root)).toMatchObject({ ok: false, diagnostics: [{ code: "layout" }] });
    mkdirSync(join(root, "src/cel/mv")); expect(suite(root).files).toHaveLength(0);
  });

});

describe("CEL suite aggregate emission", () => {
  it("emits same-named independent facts and cases with file ownership and unchanged Boolean values", () => {
    const root = fixture(), result = emitCelSuite(suite(root)).result;
    expect(result.diagnostics.filter(d => d.severity === "error")).toEqual([]);
    expect(result.emittedCases.map(c => c.caseId)).toEqual(["a", "b"]);
    expect(result.emittedCases.map(c => c.sourceFile)).toEqual(["src/cel/mv/a.cel", "src/cel/mv/nested/a.cel"]);
    expect(result.emittedCases.map(c => c.resources.find(r => r.resourceType === "Observation")?.body.valueBoolean)).toEqual([true, false]);
  });
  it("returns no publishable partial suite when the second file fails validation", () => {
    const root = fixture(); put(root, "src/cel/mv/nested/a.cel", cel("Clinical B", "b").replace('fact is "Answer"', 'fact is "Missing"'));
    const result = emitCelSuite(suite(root)).result;
    expect(result.diagnostics.some(d => d.severity === "error")).toBe(true);
    expect(result.emittedCases).toEqual([]);
    expect(validateCelCommand(join(root, "src/cel/mv/a.cel")).errors.some(d => d.filePath === join(root, "src/cel/mv/nested/a.cel") && d.message.includes("Missing"))).toBe(true);
  });
  it("validates semantic errors in regression only when checking the regression union", () => {
    const root = fixture(), control = join(root, "src/cel/regression/extra.cel");
    writeFileSync(control, cel("Engineering", "extra").replace('fact is "Answer"', 'fact is "Missing"'));
    expect(validateCelCommand(join(root, "src/cel/mv/a.cel")).errors).toEqual([]);
    expect(validateCelCommand(control).errors.some(d => d.filePath === control && d.message.includes("Missing"))).toBe(true);
    put(root, "src/cel/mv/nested/a.cel", cel("Clinical B", "b").replace('fact is "Answer"', 'fact is "Missing"'));
    expect(validateCelCommand(control).errors.some(d => d.filePath === join(root, "src/cel/mv/nested/a.cel") && d.message.includes("Missing"))).toBe(true);
  });
  it("uses one clock for authored now anchors in every selected file", () => {
    const root = fixture();
    for (const f of ["a.cel", "nested/a.cel"]) {
      const p = join(root, "src/cel/mv", f);
      writeFileSync(p, readFileSync(p, "utf8").replace('- fact is "Answer".', '- anchor is now.\n- fact is "Answer" at anchor.'));
    }
    const now = new Date("2026-09-13T10:00:00.000Z"), emitted = emitCelSuite(suite(root), now);
    expect(emitted.result.diagnostics.filter(d => d.severity === "error")).toEqual([]);
    expect(emitted.result.emittedCases.map(c => c.resources.find(r => r.resourceType === "Observation")?.body.effectiveDateTime)).toEqual([now.toISOString(), now.toISOString()]);
  });
});
