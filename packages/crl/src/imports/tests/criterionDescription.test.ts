// REFACTOR:grounded (MR10): authored activities use CPGTaskRequest and produce FHIR Task.
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { emitCrlTwoLane } from "../../emit-two-lane";

// REFACTOR:grounded: source-owned descriptions survive the actual split emit closure without
// changing conditions, inputs or executable CQL. All wording and identities here are synthetic.
const text = "Supporting documentation for the grouped evidence.";
function source(described: boolean, guard = '"Group"', wording = text): string {
  return `library "Description Fixture".
concept "Answer":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`answer\`.
- shape reduction is most recent.
criterion "Inner":
${described ? '- description is "Inner supporting explanation.".' : ''}
- when ("Answer").
criterion "Group":
${described ? '- description is \`' + wording + '\`.' : ''}
- when ("Inner").
activity "Proceed": - request CPGTaskRequest. - with \`ok\`.
activity "Stop": - request CPGTaskRequest. - with \`no\`.
decision "D": first:
- when ${guard} then recommend activity "Proceed".
- otherwise then recommend activity "Stop".`;
}
function emit(src: string) {
  const root = mkdtempSync(path.join(tmpdir(), "criterion-description-"));
  try {
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "description-fixture", version: "1.0.0", crl: {canonicalBase: "https://example.org/description", date: "2026-09-29"} }));
    const entry = path.join(root, "fixture.crl");
    writeFileSync(entry, src);
    const result = emitCrlTwoLane(entry, {date: "2026-09-29"});
    expect(result.success, JSON.stringify(result.hardErrors)).toBe(true);
    return result;
  } finally { rmSync(root, {recursive: true, force: true}); }
}
const cqlWithoutComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\r\n]*/gm, "").replace(/\s+/g, " ").trim();
const conditions = (result: ReturnType<typeof emit>): Record<string, any>[] => {
  const found: Record<string, any>[] = [];
  const walk = (x: any) => { if (x && typeof x === "object") {
    if (x.kind === "applicability") found.push(x);
    for (const value of Object.values(x)) walk(value);
  }};
  walk(result.fhir.resources.filter(x => x.resourceType === "PlanDefinition"));
  return found;
};
describe("criterion description emission", () => {
  // @kit criterion:description-emission
  it("retains root and nested definition comments, and describes the generated positive condition", () => {
    const plain = emit(source(false));
    const described = emit(source(true));
    const cql = described.cqlLibraries.map(x => x.cql).join("\n");
    expect(cql).toContain(text);
    expect(cql).toContain("Inner supporting explanation.");
    expect(described.cqlLibraries.map(x => cqlWithoutComments(x.cql))).toEqual(plain.cqlLibraries.map(x => cqlWithoutComments(x.cql)));
    const describedConditions = conditions(described);
    expect(describedConditions.filter(x => x.expression.description)).toHaveLength(1);
    expect(describedConditions.find(x => x.expression.description)?.expression).toMatchObject({ description: text, language: "text/cql-identifier" });
    expect(describedConditions.find(x => x.expression.description)?.expression.expression).toMatch(/^CRL branch /);
    const omitMetadata = (value: unknown) => JSON.parse(JSON.stringify(value, (key, v) => key === "description" ? undefined : v));
    expect(omitMetadata(described.fhir.resources.filter(x => x.resourceType !== "Library"))).toEqual(omitMetadata(plain.fhir.resources.filter(x => x.resourceType !== "Library")));
  });
  it.each(['not "Group"', '("Group" and "Answer")'])("does not misattribute positive wording to %s or priority complements", guard => {
    const result = emit(source(true, guard));
    expect(conditions(result).filter(x => x.expression.description)).toHaveLength(0);
  });
  it("neutralizes comment delimiters and prefixes multiline text", () => {
    const result = emit(source(true, '"Group"', 'First */\ndefine "Injected": true\n/* Last'));
    const cql = result.cqlLibraries.map(x => x.cql).join("\n");
    expect(cql).toContain(' * First * /\n * define "Injected": true\n * / * Last');
    expect(cqlWithoutComments(cql)).not.toContain('define "Injected"');
    expect(conditions(result).find(x => x.expression.description)?.expression.description).toBe('First */\ndefine "Injected": true\n/* Last');
  });
});
