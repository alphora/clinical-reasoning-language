import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCRL } from "../../index";
import { AgePredicateValidator } from "../../validator/agePredicateValidator";
import { resolveAgeConcept } from "../../template-match/agePublication";
import { emitCQL, emitCQLFromAST } from "../emitCQL";
import { lowerLocalCodes, preLowerAge } from "../lowerLocalCodes";

// REFACTOR:grounded (#320, plan585): retirement has one explicit executable replacement.
const source = readFileSync(path.join(__dirname, "../../emit/tests/fixtures/publication-age.crl"), "utf8");
const opts = { canonicalBase: "http://example.org/age", policyId: "age-publication" };
const parse = (s: string) => { const p = buildCRL(s); expect(p.success, JSON.stringify(p.errors)).toBe(true); return p.result!; };
describe("age-today publication and retirement", () => {
  it.each([true, false])("supports an explicit Record with local answer=%s", coded => {
    const text = coded ? source : source.replace(/^- code is .*\r?\n/m, "");
    const ast = parse(text), c = ast.statements.find(s => s.type === "Concept")!;
    expect(resolveAgeConcept(c as any)).toEqual({ kind: "publication" });
    expect(new AgePredicateValidator().validate(ast)).toEqual([]);
    const r = emitCQLFromAST(ast, opts); expect(r.success, JSON.stringify(r.errors)).toBe(true);
    expect(r.result).not.toMatch(/recencyAge|lastUpdated|CRLCommon\.AgeAt/);
    expect(r.result).toContain("__CRL_AgeToday_v1_Produce");
  });
  it.each(["at least 18 years", "at most 18 years", "under 18 years", "younger than 18 years", "at least 6 months", "at most 6 months", "under 1 month", "younger than 1 year"])("admits the supported comparator/unit spelling %s", phrase => {
    const r = emitCQL(source.replace("at least 18 years", phrase), opts); expect(r.success, JSON.stringify(r.errors)).toBe(true);
  });
  it.each(["less than 18 years", "at least 18 days"])("rejects unsupported projection %s", phrase => {
    const ast = parse(source.replace("at least 18 years", phrase));
    expect(preLowerAge(ast).errors.some(e => e.kind === "emit-age-projection-unsupported")).toBe(true);
  });
  it.each([true, false])("rejects implicit age with local answer=%s on every entry", coded => {
    let text = source.replace(/^- shape is .*\r?\n/m, "").replace(/^- shape reduction is .*\r?\n/m, "");
    if (!coded) text = text.replace(/^- code is .*\r?\n/m, "");
    const ast = parse(text);
    for (const es of [preLowerAge(ast).errors, lowerLocalCodes(ast, opts).errors, emitCQLFromAST(ast, opts).errors!]) {
      expect(es.some(e => e.kind === "emit-age-form-retired")).toBe(true);
      expect(es.map(e => e.message).join()).toContain("shape reduction is most recent");
    }
    expect(new AgePredicateValidator().validate(ast).length).toBeGreaterThan(0);
  });
  it("cannot bypass retirement with a hand-built synthesized-definition marker", () => {
    const ast = parse('library "T".\nconcept "Adult":\n- value type is boolean.\n- definition is age today at least 18 years.');
    (ast.statements[0] as any).__synthesizedFromPosrep = true;
    expect(emitCQLFromAST(ast, opts).errors?.some(e => e.kind === "emit-age-definition-retired")).toBe(true);
  });
  it("rejects an old lowered age twin instead of reinterpreting its private markers", () => {
    const ast = parse(source);
    const c = ast.statements.find(s => s.type === "Concept") as any;
    c.__bothRepMerge = "recency";
    c.__recencyComputeFn = "AgeAt";
    expect(emitCQLFromAST(ast, opts).errors?.some(e => e.kind === "emit-age-form-retired")).toBe(true);
  });
  it("supports uncoded age with a canonical base and no policy ID", () => {
    const r = emitCQL(source.replace(/^- code is .*\r?\n/m, ""), { canonicalBase: opts.canonicalBase });
    expect(r.success, JSON.stringify(r.errors)).toBe(true);
  });
  it.each([
    'concept "Alias":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- defined as "Adult".',
    'concept "Negated":\n- shape is Scalar.\n- type is Observation.\n- value type is boolean.\n- defined as ( sem-not "Adult" ).',
  ])("keeps unsupported dependent publication definitions explicit", consumer => {
    const r = emitCQL(source + "\n" + consumer, opts);
    expect(r.success).toBe(false);
    expect(r.errors?.some(e => e.kind === "publication-unsupported-context")).toBe(true);
  });
  it("keeps anchored age separate", () => {
    const text = 'library "T".\nparameter "Measurement Period":\n- param type is Period.\nconcept "Adult":\n- value type is boolean.\n- definition is age at start of "Measurement Period" at least 18 years.';
    const r = emitCQL(text, opts); expect(r.success).toBe(true); expect(r.result).toContain('CRLCommon.AgeAt(start of "Measurement Period")');
  });
});
