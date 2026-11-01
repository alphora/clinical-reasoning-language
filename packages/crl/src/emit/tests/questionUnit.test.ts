// REFACTOR:grounded (#328): input defaults preserve unit-bearing data and shared profile semantics.
import { mkdtempSync, writeFileSync, readFileSync, cpSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildCRL } from "../../index";
import { questionUnitSource } from "../../authoring-kit/questionUnitExample";
import { prepareSingleLibraryPublication } from "../publicationProgram";
import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
import { emitCQLImports } from "../../imports/emit";
import { QUESTION_UNIT_URL, QUESTION_UNIT_SYSTEM } from "../questionUnit";
import { normalizePublicationQuantity } from "../publicationQuantity";
import { emitCaseFeatureStructureDefinition } from "../../fhir-emitter/structureDefinition";
import { planPresentationEdit } from "../../editing/presentationEdit";
import { resolveCelImports } from "../../cel/imports";
import { runCel } from "../../cre/run";
import { emitCelToFhir } from "../../cel/emitter/emitFhir";
import { emitCrlTwoLane } from "../../emit-two-lane";
import { writeTwoLane } from "../../emit-writers";
import { packageFhir } from "../../fhir-package";
import { extract } from "tar";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function ast(source = questionUnitSource()) {
  const parsed = buildCRL(source);
  expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
  return parsed.result!;
}
function fixture(source = questionUnitSource(), shared?: string) {
  const root = mkdtempSync(join(tmpdir(), "crl-question-unit-")); roots.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "question-unit", version: "0.0.0", private: true,
    crl: { canonicalBase: "https://example.org/question-unit", date: "2026-11-01" } }));
  const path = join(root, "main.crl"); writeFileSync(path, source);
  if (shared) writeFileSync(join(root, "Shared.crl"), shared);
  return path;
}
function objects(value: unknown): Record<string, any>[] {
  if (!value || typeof value !== "object") return [];
  return [value as Record<string, any>, ...Object.values(value).flatMap(v => Array.isArray(v) ? v.flatMap(objects) : objects(v))];
}

// @kit text-answers:question-unit
// REFACTOR:grounded (#328): typed units survive wording edits, not presentation inheritance.
test("parses a Quantity unit and retains it through a presentation edit", () => {
 const source=questionUnitSource();expect(ast(source).statements.find(s=>s.type==="Concept"&&s.name==="BMI")).toMatchObject({quantityUnit:"kg/m2",valueTypes:["Quantity"]});
 const edited=planPresentationEdit(source,{library:"Quantity Unit Intake",concept:"BMI",questionText:"Updated BMI"});
 expect(ast(edited.candidateSource).statements.find(s=>s.type==="Concept"&&s.name==="BMI")).toMatchObject({quantityUnit:"kg/m2"});
 expect(ast(source).presentations![0]).not.toHaveProperty("questionUnit");
});
// @kit text-answers:question-unit
test.each(["", " ", "kg m2"])("rejects invalid type unit %j", unit=>expect(buildCRL(questionUnitSource(unit)).success).toBe(false));
// @kit text-answers:question-unit
test("rejects a unit on a non-Quantity type and the retired presentation spelling",()=>{
 expect(buildCRL(questionUnitSource().replace("Quantity 'kg/m2'","boolean 'kg/m2'")).success).toBe(false);
 expect(buildCRL(questionUnitSource(null)+"\npresentation for \"BMI\": - question text is \"BMI\". - question unit is 'kg/m2'.").success).toBe(false);
});
// @kit text-answers:question-unit
test("emits the standard profile facet and executable CQL type normalization",()=>{
 const withUnit=fixture(),withoutUnit=fixture(questionUnitSource(null));const emitted=emitFhirDefFromPath(withUnit);
 expect(emitted.success,JSON.stringify(emitted.errors)).toBe(true);
 const metadata=objects(emitted.resources).filter(o=>o.url===QUESTION_UNIT_URL);expect(metadata).toEqual([{url:QUESTION_UNIT_URL,valueCodeableConcept:{coding:[{system:QUESTION_UNIT_SYSTEM,code:"kg/m2",display:"kg/m2"}]}}]);
 expect(emitted.resources.some(r=>r.resource.type==="Extension")).toBe(false);
 const cql=emitCQLImports(withUnit),old=emitCQLImports(withoutUnit);expect(cql.success,JSON.stringify(cql.errors)).toBe(true);
 expect(cql.cqlByLibrary.map(l=>l.cql).join("\n")).toContain('__CRL_PublicationQuantityType_v1_Normalize');
 expect(old.cqlByLibrary.map(l=>l.cql).join("\n")).not.toContain('__CRL_PublicationQuantityType_v1_Normalize');
});
// @kit text-answers:question-unit
test.each(["kg","[lb_av]"])("refuses incompatible type %s for a BMI threshold",unit=>{
 const prepared=prepareSingleLibraryPublication(ast(questionUnitSource(unit)),{canonicalBase:"https://example.org/quantity",policyId:"quantity"});
 expect(prepared.diagnostics.some(d=>d.kind==="publication-quantity-unit-incompatible")).toBe(true);
});
// @kit text-answers:question-unit
test.each([
 [{value:1.8,unit:"m"},"cm",{value:180,unit:"cm",code:"cm",system:QUESTION_UNIT_SYSTEM}],
 [{value:0,unit:"g"},"kg",{value:0,unit:"kg",code:"kg",system:QUESTION_UNIT_SYSTEM}],
 [{value:1234567,unit:"1"},"1",{value:1234567,unit:"1",code:"1",system:QUESTION_UNIT_SYSTEM}],
])("normalizes %j to %s without mutating raw input",(input,unit,expected)=>{
 const before=structuredClone(input);expect(normalizePublicationQuantity(input,unit)).toEqual({kind:"normalized",quantity:expected});expect(input).toEqual(before);
});
// @kit text-answers:question-unit
test.each([[{value:0.00000001,unit:"cm"},"m","publication-quantity-precision-unsupported"],[{value:1000000,unit:"m"},"cm","publication-quantity-precision-unsupported"],[{value:40},"kg/m2","publication-invalid-quantity"],[{value:1,unit:"kg"},"cm","publication-quantity-unit-unsupported"]])("rejects %j -> %s (%s)",(input,unit,code)=>expect(normalizePublicationQuantity(input,unit)).toMatchObject({kind:"error",code}));
// @kit text-answers:question-unit
test("unknown Quantity remains unknown and acquires no measurement",()=>{
 expect(normalizePublicationQuantity(undefined,"cm")).toEqual({kind:"normalized",quantity:undefined});expect(normalizePublicationQuantity({unit:"m"},"cm")).toEqual({kind:"normalized",quantity:{unit:"m"}});
});

// @kit text-answers:question-unit
// REFACTOR:grounded (#328): existing imported BMI fixture exercises typed operands and output.
test.each([false,true])("CEL/CRE normalize imported typed BMI operands (explicit include=%s)",include=>{
 const root=mkdtempSync(join(tmpdir(),"crl-quantity-owner-"));roots.push(root);cpSync(join(__dirname,"fixtures/publication-imports"),root,{recursive:true});
 for(const [file,unit]of [["weight.crl","g"],["height.crl","m"],["bmi.crl","kg/m2"]]){
  const p=join(root,file);writeFileSync(p,readFileSync(p,"utf8").replace('value type is Quantity.',`value type is Quantity '${unit}'.`));
 }
 if(include){const p=join(root,"policy.crl");writeFileSync(p,readFileSync(p,"utf8").replace('library "Policy".','library "Policy".\ninclude "BMI Library".'));}
 const context=resolveCelImports(join(root,"cases.cel")),data=emitCelToFhir(context),run=runCel(context);
 expect(data.diagnostics.filter(d=>d.severity==="error")).toEqual([]);expect(run.errors).toEqual([]);expect(run.runs.every(r=>r.status==="pass"),JSON.stringify(run)).toBe(true);
 const height=join(root,"height.crl");writeFileSync(height,readFileSync(height,"utf8").replace("Quantity 'm'","Quantity 'kg'"));
 expect(JSON.stringify(runCel(resolveCelImports(join(root,"cases.cel"))))).toContain("publication-quantity-unit-incompatible");
});
// @kit text-answers:question-unit
test("CEL emitted typed Quantity is canonical before claiming the profile",()=>{
 const policy=fixture(questionUnitSource('cm').replaceAll('BMI','Height').replace("35.00000001 'kg/m2'","1 'm'"));const cel=join(policy,"..","case.cel");
 writeFileSync(cel,`library "Cases". covers "Quantity Unit Intake".
 fact "P": - defined by "Patient".
 fact "H": - defined by "Quantity Unit Intake"."Height". - value is 1.8 'm'.
 case "Tall": - subject is "P". - fact is "H". - result is "Assessment" is "Above".`);
 const context=resolveCelImports(cel),data=emitCelToFhir(context);expect(data.diagnostics.filter(d=>d.severity==="error")).toEqual([]);
 expect(JSON.stringify(data)).toContain('"value":180');expect(JSON.stringify(data)).toContain('"unit":"cm"');
 expect(runCel(context).runs.every(r=>r.status==="pass")).toBe(true);
 writeFileSync(cel,readFileSync(cel,"utf8").replace("1.8 'm'","1.8 'kg'"));expect(JSON.stringify(emitCelToFhir(resolveCelImports(cel)))).toContain('publication-quantity-unit-unsupported');
});
// @kit text-answers:question-unit
test("admits equivalent comparison units and checks the imported owner rather than a local same-name shadow", () => {
  const shared = `library "Shared".\nconcept "Height":\n- shape is Record.\n- type is Observation.\n- value type is Quantity 'cm'.\n- code is \`height\`.\n- shape reduction is most recent.\npresentation for "Height":\n- question text is "Height".\n`;
  const main = `library "Main".\nconcept "Height":\n- shape is Record.\n- type is Observation.\n- value type is Quantity 'kg'.\n- code is \`shadow\`.\n- shape reduction is most recent.\npresentation for "Height":\n- question text is "Unrelated mass".\nconcept "Tall":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- definition is "Shared"."Height" at least 1 'm'.\n- shape reduction is most recent.\nactivity "Review": - request CPGTaskRequest. - with \`REVIEW\`.\ndecision "D":\nfirst:\n- when "Tall" then recommend activity "Review".\n- otherwise then recommend activity "Review".\n`;
  const good = emitFhirDefFromPath(fixture(main, shared));
  expect(good.success, JSON.stringify(good.errors)).toBe(true);
  expect(objects(good.resources).filter(x => x.url === QUESTION_UNIT_URL && x.valueCodeableConcept).flatMap(x => x.valueCodeableConcept.coding.map((c: any) => c.code))).toContain("cm");
  const bad = emitFhirDefFromPath(fixture(main, shared.replace("'cm'", "'kg'")));
  expect(bad.success).toBe(false);
  expect(bad.errors.some(d => d.kind === "publication-quantity-unit-incompatible" && d.message.includes('"Shared"."Height"'))).toBe(true);
});

// @kit text-answers:question-unit
test.each([
 questionUnitSource()+"\nconcept \"Other\": - shape is Record. - type is Observation. - value type is Quantity 'cm'. - value type is Quantity. - code is `other`. - shape reduction is most recent.",
 questionUnitSource().replace("- shape reduction is most recent.","- shape reduction is most recent.\n- source representation: - type is Observation. - value type is Quantity 'cm'."),
])("refuses duplicate type declarations and units on representation lines",source=>expect(buildCRL(source).success).toBe(false));

// @kit text-answers:question-unit
test("a declared unit cannot silently disappear when the profile has no Quantity answer slot",()=>{
 const emitted=emitCaseFeatureStructureDefinition("Invalid unit","test",{name:"unit-test",version:"0.0.0",canonicalBase:"https://example.org/unit-test"} as any,{},"Observation",undefined,undefined,undefined,undefined,true,{profileUrl:"https://example.org/unit-test/StructureDefinition/test",localCode:{system:"https://example.org/unit-test",code:"test"},quantityUnit:"cm"});
 expect(emitted.resource).toBeNull();expect(emitted.errors.some(e=>e.kind==="emit-quantity-unit-no-answer-slot")).toBe(true);
});
