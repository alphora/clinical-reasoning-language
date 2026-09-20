// REFACTOR:grounded (#320, review 825) — reusable uncoded sources own physical
// library layers without inventing a local CodeSystem or changing the policy URL.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { emitCrlTwoLane } from "../../emit-two-lane";

const BASE = "http://example.org/crl/source-publication";
const dirs: string[] = [];
const source = (name: string, concept: string, years: number) => `library "${name}".
concept "${concept}":
- shape is Record.
- type is Observation.
- value type is boolean.
- shape reduction is most recent.
- source representation:
  - type is Patient.
  - value projection is age today at least ${years} years.
`;

function fixture(included: boolean, second?: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "crl-source-identity-"));
  dirs.push(dir);
  const crl = path.join(dir, "src", "crl");
  mkdirSync(crl, { recursive: true });
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({
    name: "qualification-age", version: "1.0.0",
    crl: { canonicalBase: BASE, date: "2026-09-20" },
  }));
  writeFileSync(path.join(crl, "age.crl"), source("Age Source", "Adult", 18));
  if (second) writeFileSync(path.join(crl, "other.crl"), source(second, "Older Adult", 65));
  const root = path.join(crl, "policy.crl");
  writeFileSync(root, `library "Age Policy".
${included ? 'include "Age Source".' : ""}
${included && second ? `include "${second}".` : ""}
concept "Evidence":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`evidence\`.
- shape reduction is most recent.
presentation for "Evidence":
- question text is \`Is the evidence confirmed?\`.
activity "Met":
- request CPGCommunicationRequest.
- with \`Synthetic met\`.
activity "Unmet":
- request CPGCommunicationRequest.
- with \`Synthetic unmet\`.
decision "Determination":
first:
- when "Age Source"."Adult"${second ? ` and "${second}"."Older Adult"` : ""} then:
  first:
  - when "Evidence" then recommend activity "Met".
  - otherwise then recommend activity "Unmet".
  end.
- otherwise then recommend activity "Unmet".
`);
  return root;
}

afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("uncoded source library identities", () => {
  it.each([false, true])("emits a reusable source with explicit include=%s", (included) => {
    const result = emitCrlTwoLane(fixture(included));
    expect(result.success, JSON.stringify(result.hardErrors)).toBe(true);
    const manifest = result.cql.cqlByLibrary;
    const names = manifest.map(e => e.libraryName);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("QualificationAgeAgeSourceInferences");
    expect(names).toContain("QualificationAgeInferences");
    for (const entry of manifest) {
      for (const dependency of entry.includes ?? []) expect(names).toContain(dependency);
    }
    const resources = result.fhir.resources.map(e => e.resource as Record<string, any>);
    const libraries = resources.filter(r => r.resourceType === "Library");
    for (const entry of manifest) {
      // FHIRHelpers is the external hl7.fhir.uv.cql dependency, not a policy artifact.
      if (entry.libraryName === "FHIRHelpers") continue;
      const library = libraries.find(r => r.id === entry.libraryName);
      expect(library, entry.libraryName).toBeDefined();
      expect(library!.url).toBe(`${BASE}/Library/${entry.libraryName}`);
      expect(library!.content).toContainEqual(expect.objectContaining({ url: `../../cql/${entry.outputFilename}` }));
    }
    const urls = resources.map(r => r.url).filter(Boolean);
    expect(new Set(urls).size).toBe(urls.length);
    const codeSystems = resources.filter(r => r.resourceType === "CodeSystem");
    expect(codeSystems).toHaveLength(1);
    expect(codeSystems[0].url).toBe(`${BASE}/CodeSystem/qualification-age-local`);
    expect(codeSystems[0].concept.map((c: any) => c.code)).toEqual(["evidence"]);
    const decision = resources.find(r => r.resourceType === "PlanDefinition" && r.id === "qualification-age");
    expect(decision!.url).toBe(`${BASE}/PlanDefinition/qualification-age`);
    expect(decision!.library).toEqual([`${BASE}/Library/QualificationAgeInterface`]);
    for (const resource of resources) {
      for (const library of resource.library ?? []) expect(libraries.map(l => l.url)).toContain(library);
    }
    expect(resources.find(r => r.resourceType === "StructureDefinition")!.url)
      .toBe(`${BASE}/StructureDefinition/qualification-age-evidence`);
    const iface = manifest.find(e => e.role === "interface")!;
    expect(iface.cql).toContain('QualificationAgeAgeSourceInferences."Adult"');
    expect(iface.cql).not.toContain('"Age Source".');
    const checkConditions = (actions: Record<string, any>[]) => {
      for (const action of actions) {
        for (const condition of action.condition ?? []) {
          expect(condition.expression.language).toBe("text/cql-identifier");
          expect(iface.cql).toContain(`define "${condition.expression.expression}":`);
        }
        checkConditions(action.action ?? []);
      }
    };
    checkConditions(decision!.action);
  });

  it.each([false, true])("keeps two source producers distinct, explicit include=%s", (included) => {
    const result = emitCrlTwoLane(fixture(included, "Older Source"));
    expect(result.success, JSON.stringify(result.hardErrors)).toBe(true);
    const manifest = result.cql.cqlByLibrary;
    expect(manifest.map(e => e.libraryName)).toEqual(expect.arrayContaining([
      "QualificationAgeAgeSourceInferences", "QualificationAgeOlderSourceInferences",
    ]));
    const iface = manifest.find(e => e.role === "interface")!;
    expect(iface.cql).toContain('QualificationAgeOlderSourceInferences."Older Adult"');
  });

  it("still refuses genuinely colliding physical names", () => {
    const result = emitCrlTwoLane(fixture(false, "Age-Source"));
    expect(result.success).toBe(false);
    expect(result.cql.errors?.some(e => e.kind === "layered-name-collision")).toBe(true);
    expect(result.cql.cqlByLibrary).toHaveLength(0);
  });
});
