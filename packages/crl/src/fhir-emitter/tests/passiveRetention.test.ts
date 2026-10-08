// REFACTOR:grounded - portable current-answer state without historical client reconstruction.
import { describe, it, expect } from "vitest";
import { resolve, join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { emitCrlBundle } from "../../index";

const fixture = (kind: string) => resolve(__dirname,"../../../test/acceptance/passive-retention",kind,"src/crl/synthetic-interview.crl");
const walk = (x: any): any[] => !x || typeof x !== "object" ? [] : [x,...Object.values(x).flatMap(walk)];
describe("passive current answer retention", () => {
  it("keeps scoped wording from an already gathered Criterion occurrence", () => {
    const root=mkdtempSync(join(tmpdir(),"passive-scope-"));
    try {
      mkdirSync(join(root,"src/crl"),{recursive:true});
      writeFileSync(join(root,"package.json"),readFileSync(resolve(__dirname,"../../../test/acceptance/passive-retention/nested/package.json")));
      const original=readFileSync(fixture("nested"),"utf8");
      const source=original.replace('decision "Assess":','criterion "Population": - when ("A").\npresentation for "A": - in criterion "Population". - question text is "Scoped A?".\ndecision "Assess":').replace('- when "A" then:', '- when "Population" then:');
      const file=join(root,"src/crl/scoped.crl");writeFileSync(file,source);
      const result=emitCrlBundle(file);expect(result.success,JSON.stringify(result.diagnostics)).toBe(true);
      const pd=result.bundle.entry.map(e=>e.resource as any).find(r=>r.id==="synthetic-interview" && r.resourceType==="PlanDefinition");
      expect(walk(pd).filter(x=>x.valueString==="Scoped A?").length).toBeGreaterThan(0);
      expect(pd.action.filter((a:any)=>a.title==="Retain available A")).toEqual([]);
    }finally{rmSync(root,{recursive:true,force:true});}
  });
  // @kit named-answer-options:available-wire-state
  it.each(["progressive","nested"])("emits bounded standard inputs without a question for the passive consumer: %s", kind => {
    const emitted=emitCrlBundle(fixture(kind));expect(emitted.success).toBe(true);
    const resources=emitted.bundle.entry.map(e=>e.resource as any);
    const pd=resources.find(r=>r.resourceType==="PlanDefinition" && r.id==="synthetic-interview");
    const retention=pd.action.filter((a:any)=>a.title?.startsWith("Retain available "));
    expect(retention).toHaveLength(kind==="progressive" ? 2 : 1);
    expect(retention.map((a:any)=>a.title)).toEqual(kind==="progressive" ? ["Retain available A","Retain available B"] : ["Retain available B"]);
    expect(pd.action[0].extension).toContainEqual({url:"http://hl7.org/fhir/StructureDefinition/cqf-applicabilityBehavior",valueString:"any"});
    for(const action of retention){
      expect(action.condition[0].expression.language).toBe("text/cql");
      expect(action.condition[0].expression.expression).toContain("else false");
      expect(action.action[0].condition[0].expression.expression).toContain("exists ([Observation]");
      expect(action.action[0].action[0].input).toHaveLength(1);
    }
    const profiles=resources.filter(r=>r.resourceType==="StructureDefinition");
    expect(profiles.filter(r=>/current-uncertainty|supplied-alternative/.test(r.id))).toEqual([]);
    const expressions=walk(pd.action[0]).filter(x=>typeof x.language==="string" && "expression" in x);
    expect(expressions.length).toBeGreaterThan(1);
    expect(expressions.every(e=>e.language==="text/cql-identifier")).toBe(true);
    // No custom retention marker enters the portable FHIR contract.
    expect(JSON.stringify(pd)).not.toContain("passive-retention");
  });
});
