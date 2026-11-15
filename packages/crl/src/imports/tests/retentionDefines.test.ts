// REFACTOR:grounded — execute public emit paths and inspect actual bound owners,
// retained input profiles, and ledger coverage, independently of planner internals.
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { emitCQLImports } from "../emit";
import { emitCrlTwoLane } from "../../emit-two-lane";
import { extractEmittedDefineHeaders, proveWholeBoundaryTotality } from "../../emit/booleanTotality";
import { applyPlanExpressionInvariant } from "../../fhir-emitter/planExpressionInvariant";

const retentionAnswers = readFileSync(resolve(__dirname, "../../../test/acceptance/retention-owners/src/crl/foreign.crl"), "utf8");
const body = `criterion "Retained": - when ("Foreign"."Flagged").
presentation for "Retained": - uncertainty guard passes when false.
activity "Met": - request CPGTaskRequest. - with \`Met\`.
activity "Unmet": - request CPGTaskRequest. - with \`Unmet\`.
decision "Assess": first:
- when "Retained" then recommend activity "Unmet".
- otherwise then recommend activity "Met".
`;
const local = `concept "A": - shape is Record. - type is Observation. - value type is boolean. - code is \`local-a\`. - shape reduction is most recent.\n`;
const dirs: string[] = [];
function fixture(extra = "", foreign = retentionAnswers, tail = body) {
  const dir = mkdtempSync(join(tmpdir(), "retention-owners-")); dirs.push(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "retention-owners", version: "1.0.0", crl: { canonicalBase: "https://example.org/retention", date: "2026-11-14" } }));
  writeFileSync(join(dir, "foreign.crl"), foreign);
  const file = join(dir, "policy.crl"); writeFileSync(file, 'library "Policy".\n' + extra + tail);
  return file;
}
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
const walk = (value: any): any[] => !value || typeof value !== "object" ? [] : [value, ...Object.values(value).flatMap(walk)];

describe("named retention conditions in their physical library", () => {
  it.each([false, true])("binds both predicates, keeps foreign profiles, and is deterministic (Interface=%s)", split => {
    const file = fixture(split ? local : "");
    const result = emitCrlTwoLane(file); expect(result.success, JSON.stringify(result.hardErrors)).toBe(true);
    const cql = emitCQLImports(file); expect(cql.success, JSON.stringify(cql.errors)).toBe(true);
    expect(cql.cqlByLibrary).toEqual(result.cql.cqlByLibrary);
    expect(emitCrlTwoLane(file).cqlLibraries).toEqual(result.cqlLibraries);
    const owner = cql.cqlByLibrary.find(entry => entry.sourceLibraryName === "Policy" && entry.role === (split ? "interface" : "root"))!;
    expect(owner).toBeDefined();
    const plan = result.fhir.resources.find(entry => entry.sourceKind === "Decision")!.resource as any;
    expect(plan.library[0]).toBe(`https://example.org/retention/Library/${owner.libraryName}`);
    const retained = plan.action.filter((action: any) => action.title?.startsWith("Retain available "));
    expect(retained.map((action: any) => action.title)).toEqual(["Retain available A", "Retain available B"]);
    const profiles = retained.flatMap((action: any) => action.action[0].action[0].input[0].profile);
    const foreignProfiles = result.fhir.resources.filter(entry => entry.resourceType === "StructureDefinition" && ["A", "B"].includes(entry.sourceName!)).map(entry => (entry.resource as any).url);
    for (const profile of profiles) expect(foreignProfiles).toContain(profile);
    const predicates = walk(plan).filter(node => node.language !== undefined && node.expression !== undefined);
    for (const expression of predicates) {
      expect(expression.language).toBe("text/cql-identifier");
      expect(owner.ledgerEntries!.some(entry => entry.name === expression.expression && entry.visibility === "public")).toBe(true);
    }
    expect(owner.ledgerEntries!.filter(entry => entry.origin === "plan-retention-condition")).toHaveLength(3);
    const entries = cql.cqlByLibrary.filter(entry => !entry.isSharedCatalog);
    const proof = proveWholeBoundaryTotality(entries.flatMap(entry => entry.ledgerEntries ?? []), entries.flatMap(entry => extractEmittedDefineHeaders(entry.cql, entry.libraryName)));
    expect(proof.uncovered).toEqual([]); expect(proof.orphanEntries).toEqual([]);
    expect(proof.failures.filter(entry => entry.name.startsWith("CRL retention "))).toEqual([]);
    // A missing carrier is observable at the actual invariant boundary.
    const missing = structuredClone(cql.cqlByLibrary);
    const bound = missing.find(entry => entry.libraryName === owner.libraryName)!;
    bound.ledgerEntries = bound.ledgerEntries!.filter(entry => entry.name !== retained[0].condition[0].expression.expression);
    expect(applyPlanExpressionInvariant(result.fhir.resources, missing).some(error => error.kind === "dangling-plan-expression-define")).toBe(true);
  });

  it("refuses an authored declaration that claims a generated predicate name", () => {
    const file = fixture(); const first = emitCQLImports(file);
    const name = first.cqlByLibrary.flatMap(entry => entry.ledgerEntries ?? []).find(entry => entry.origin === "plan-retention-condition")!.name;
    const collision = fixture(`criterion "${name}": - when ("Foreign"."Flagged").\n`);
    const result = emitCrlTwoLane(collision);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.hardErrors)).toContain("retention-condition-name-collision");
  });

  it("retains the coded passive consumer's own question while retaining only its absent operands", () => {
    const file = fixture("", retentionAnswers.replace('concept "Flagged":', 'concept "Flagged":\n- code is `flagged`.'));
    const result = emitCrlTwoLane(file); expect(result.success, JSON.stringify(result.hardErrors)).toBe(true);
    const plan = result.fhir.resources.find(entry => entry.sourceKind === "Decision")!.resource as any;
    expect(plan.action.filter((action: any) => action.title?.startsWith("Retain available ")).map((action: any) => action.title)).toEqual(["Retain available A", "Retain available B"]);
    expect(walk(plan.action[0]).flatMap(node => node.input ?? []).some((input: any) => input.profile?.[0]?.endsWith("-flagged"))).toBe(true);
  });

  it.each(["direct", "legacy wrapper"])("keeps prior gathered answers out of retention through %s", kind => {
    const wrapper = kind === "direct" ? "" : 'concept "Wrapper": - type is Observation. - value type is boolean. - defined as exists ("Foreign"."A").\n';
    const gate = kind === "direct" ? '"Foreign"."A"' : '"Wrapper"';
    const tail = body.replace('- when "Retained" then recommend activity "Unmet".',
      `- when ${gate} then:\n first:\n - when "Retained" then recommend activity "Unmet".\n - otherwise then recommend activity "Met".\n end.`);
    const file = fixture(wrapper, retentionAnswers, tail);
    const result = emitCrlTwoLane(file);
    if (kind === "legacy wrapper") {
      // This mixed value bridge is explicitly unsupported. Carrier lowering must
      // preserve that refusal rather than advertise a new legacy alias contract.
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.hardErrors)).toContain("publication-unsupported-context");
      return;
    }
    expect(result.success, JSON.stringify(result.hardErrors)).toBe(true);
    const plan = result.fhir.resources.find(entry => entry.sourceKind === "Decision")!.resource as any;
    const retained = plan.action.filter((action: any) => action.title?.startsWith("Retain available "));
    expect(retained.map((action: any) => action.title)).toEqual(["Retain available B"]);
    expect(walk(plan.action[0]).flatMap(node => node.input ?? []).some((input: any) => input.profile?.[0]?.endsWith("-a"))).toBe(true);
    expect(retained[0].action[0].action[0].input[0].profile[0]).toMatch(/-b$/);
  });
});
