// REFACTOR:grounded (#320, plan595): kit content is versioned and verified through MCP.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseInput } from "../../ast/tests/parseInput";
import { buildCRL } from "../../index";
import { buildCEL } from "../../cel";
import { resolveCelImports } from "../../cel/imports";
import { validateCELFile } from "../../cel/validator";
import { runCel } from "../../cre";
import { validateCRLImports } from "../../imports/validate";
import { activityTypes } from "../../grammar/activityTypes";
import { conceptTypes } from "../../grammar/conceptTypes";
import { conceptValueTypes } from "../../grammar/conceptValueTypes";
import type { DecisionShapeError } from "../../validator/validator";
import { Validator } from "../../validator/validator";

import {
  DISPOSITION_ARBITRATION_REFERENCE_CEL,
  DISPOSITION_ARBITRATION_REFERENCE_CRL,
  PA_DETERMINATION_REFERENCE_CEL,
  PA_DETERMINATION_REFERENCE_CRL,
  PATIENT_AGE_BOTH_REP_REFERENCE_CRL,
  PUBLICATION_REFERENCE_CRL,
  SOURCE_DELEGATED_DECISION_REFERENCE_CEL,
  SOURCE_DELEGATED_DECISION_REFERENCE_CRL,
} from "../reference";
import { getAuthoringKit } from "../index";
import { answerExampleSource, ANSWER_EXAMPLE_BASE, ANSWER_EXAMPLE_CEL, ANSWER_EXAMPLE_TERMS } from "../answerExample";
import { flagFieldRulesOf } from "../../flags/flagVocab"; // #212 step 4b: flag field rules live in the vocab now


/** Metadata completeness only; resolving an anchor does not execute its obligation. */
function assertForceCoverage(kit: ReturnType<typeof getAuthoringKit>): void {
  const anchors = new Set([
    ...kit.judgeLens.composition.map(c => 'judgeLens.composition:' + c.check),
    ...kit.verifyLoop.methodologyRequirements.map(m => 'verifyLoop:' + m.id),
  ]);
  for (const rule of kit.rules) {
    if (!Array.isArray(rule.clauses) || rule.clauses.length === 0)
      throw new Error(rule.id + ': missing force clauses');
    for (const clause of rule.clauses) {
      if (!clause.text.trim() || !['validator-enforced', 'invariant', 'default'].includes(clause.force))
        throw new Error(rule.id + ': invalid force clause');
      if (clause.force === 'invariant' && !anchors.has(clause.test ?? ''))
        throw new Error(rule.id + ': unresolved invariant anchor');
    }
  }
}

function crlErrors(src: string) {
  // Validate through the REAL single-file gate — `buildCRL` runs `classifyCriterionRefs`, so a `when`
  // that names a local `criterion` resolves as a criterion-ref (the resolver skips it) instead of a
  // spurious concept `unresolved-reference`. Using the raw `parseInput` (no classification) would make
  // the harness bless CRL the shipped validator rejects — and vice versa (#234 review catch).
  const built = buildCRL(src);
  if (!built.success) return built.errors;
  return new Validator().validate(built.result).errors;
}

describe("authoring-kit — reference artifacts", () => {
  it("serves the exact named-answer inputs used by the implementation test", () => {
    const artifacts = new Map(getAuthoringKit().referenceArtifacts.map((a) => [a.name, a.source]));
    expect(artifacts.get("named-answer-reference.crl")).toBe(answerExampleSource());
    expect(artifacts.get("named-answer-reference.cel")).toBe(ANSWER_EXAMPLE_CEL);
    expect(artifacts.get("named-answer-terms.crl")).toBe(`library "Shared".\n${ANSWER_EXAMPLE_TERMS}`);
  });

  it("rejects the known stale PA instruction and teaches the named form on the unified kit", () => {
    const obsoleteInstruction = /\b(?:use|author|prefer|write)\b[^.\n]*\binline\s+`value from:`/i;
    const prose = (value: unknown): string[] => typeof value === "string" ? [value]
      : value && typeof value === "object" ? Object.values(value).flatMap(prose) : [];
    const hasObsoleteInstruction = (value: unknown) => prose(value).some((text) => obsoleteInstruction.test(text));
    const bad = "Use inline `value from:` for local answer options.";
    expect(hasObsoleteInstruction({ clauses: [{ text: bad }] })).toBe(true);
    expect(hasObsoleteInstruction({ summary: bad })).toBe(true);
    expect(hasObsoleteInstruction({ text: "The removed inline `value from:` form is rejected." })).toBe(false);
    const kit = getAuthoringKit();
    expect(kit.rules.some((r) => r.id === "named-answer-options")).toBe(true);
    const model = kit.conceptLayerModel.find((m) => m.form.startsWith("- shape is"));
    expect(model?.scope).toBe("in");
    expect(hasObsoleteInstruction(kit)).toBe(false);
    for (const mutation of [
      { ...kit, summary: bad },
      { ...kit, rules: [...kit.rules, { clauses: [{ text: bad }] }] },
      { ...kit, boundary: [{ text: bad }] },
      { ...kit, referenceArtifacts: [{ purpose: bad }] },
    ]) expect(hasObsoleteInstruction(mutation)).toBe(true);
    const guard = kit.rules.find((r) => r.id === "guards")!;
    expect(guard.rule).toContain("publication-unsupported-context");
    const shared = kit.judgeLens.composition.find((c) => c.check === "invented-determination-boundary")!;
    expect(shared.guidance).toContain("source-delegation OR a genuinely shared determination");
    expect(shared.guidance).toContain("independent policies");
    {
      const pa = kit.rules.find((r) => r.id === "pa-answers-not-records")!;
      expect(pa.rule).toContain('value from is "Named Terminology"');
      expect(pa.ref).toContain("named-answer-options");
      expect(pa.ref).not.toContain("inline-answer-options");
    }
  });

  it("patient-age-both-rep-reference.crl (local override + Patient age posrep) validates clean + teaches BOTH bounds", () => {
    // Both concepts carry BOTH a `code is` (local override) and a Patient age `source representation`
    // whose `value projection is age today <cmp> <N> years` computes over Patient.birthDate (#257,
    // the migrated form). It must validate CLEAN embedded.
    expect(crlErrors(PATIENT_AGE_BOTH_REP_REFERENCE_CRL)).toEqual([]);
    // Guard the both-rep SHAPE on BOTH the lower- and upper-bound concept (a regression dropping either compute arm
    // would silently revert it to a plain local boolean — the content hash alone can't catch that, it re-pins on any change).
    expect(PATIENT_AGE_BOTH_REP_REFERENCE_CRL).toMatch(/- code is `age-18-or-older`\./);
    expect(PATIENT_AGE_BOTH_REP_REFERENCE_CRL).toMatch(
      /- value projection is age today at least 18 years\./,
    );
    // #215 upper bound: the pediatric `under 21` both-rep concept + decision must survive.
    expect(PATIENT_AGE_BOTH_REP_REFERENCE_CRL).toMatch(/concept "Patient Under Twenty One Years":/);
    expect(PATIENT_AGE_BOTH_REP_REFERENCE_CRL).toMatch(/- code is `under-21`\./);
    expect(PATIENT_AGE_BOTH_REP_REFERENCE_CRL).toMatch(
      /- value projection is age today under 21 years\./,
    );
    // Both concepts carry the Patient/birthDate posrep carrier.
    expect(PATIENT_AGE_BOTH_REP_REFERENCE_CRL).not.toMatch(/value element is|value type is date/);
    expect(PATIENT_AGE_BOTH_REP_REFERENCE_CRL).toMatch(
      /when "Patient Under Twenty One Years" then recommend activity "Approve"/,
    );
    // REFACTOR:grounded (#320, plan583): both use explicit Record publication; persistence is permitted.
    expect(PATIENT_AGE_BOTH_REP_REFERENCE_CRL.match(/shape reduction is most recent/g) ?? []).toHaveLength(2);
    expect(PATIENT_AGE_BOTH_REP_REFERENCE_CRL).not.toContain("@business-logic-deferred");
    // neutral disposition text — a pediatric approval must NOT read "adult"
    expect(PATIENT_AGE_BOTH_REP_REFERENCE_CRL).not.toMatch(/APPROVE \/ adult|DENY \/ not an adult/);
  });

  it("a migrated PA artifact validates through the PROJECT path (the config validator IS on the path) with a matching crl.dispositions — and a bogus determination is REJECTED (not a K4 fake-green)", () => {
    // The other kit tests use `new Validator().validate` / `validateCELFile`, which do NOT read `crl.dispositions`.
    // This one uses `validateCRLImports` — the project-aware path that resolves the config + runs DispositionValidator —
    // so it actually PROVES the config-driven closed set, positively AND negatively.
    const dir = mkdtempSync(join(tmpdir(), "authoring-kit-pa-config-"));
    const write = (crl: string) => {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({
          name: "pa-config-test",
          version: "1.0.0",
          private: true,
          crl: {
            canonicalBase: "http://example.org/pa-config-test",
            status: "draft",
            experimental: true,
            dispositions: {
              options: {
                certify: { Approve: { label: "Approve" } },
                "not-certify": { Deny: { label: "Deny" } },
              },
            },
          },
        }),
      );
      const p = join(dir, "pa-determination-reference.crl");
      writeFileSync(p, crl);
      return p;
    };

    // POSITIVE: the artifact's configured certify.Approve / not-certify.Deny determinations pass the closed set.
    const okPath = write(PA_DETERMINATION_REFERENCE_CRL);
    const ok = validateCRLImports(okPath);
    expect(ok.validationErrors.filter((e) => e.kind.startsWith("disposition-"))).toEqual([]);

    // NEGATIVE: swap a recommend to an UNCONFIGURED determination — enforcement is LIVE, so it must flag it.
    const badCrl = PA_DETERMINATION_REFERENCE_CRL.replace(
      'then recommend activity "certify.Approve"',
      'then recommend activity "certify.NotAConfiguredKey"',
    );
    const bad = validateCRLImports(write(badCrl));
    expect(bad.validationErrors.some((e) => e.kind === "disposition-not-configured")).toBe(true);
  });

  // @kit concept-form:local-answer-pause
  it("pa-determination-reference.cel + .crl: validate clean and true/false/missing cases pass with local activities (real path)", () => {
    const dir = mkdtempSync(join(tmpdir(), "authoring-kit-pa-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "authoring-kit-pa-determination-reference",
        version: "1.0.0",
        private: true,
        crl: {
          canonicalBase: "http://example.org/authoring-kit-pa-determination-reference",
          status: "draft",
          experimental: true,
        },
      }),
    );
    writeFileSync(join(dir, "pa-determination-reference.crl"), PA_DETERMINATION_REFERENCE_CRL);
    const celPath = join(dir, "pa-determination-reference.cel");
    writeFileSync(celPath, PA_DETERMINATION_REFERENCE_CEL);

    const v = validateCELFile(celPath);
    expect(v.errors).toEqual([]);

    const run = runCel(resolveCelImports(celPath));
    expect(run.success).toBe(true);
    expect(run.runs.length).toBe(3); // true → approve, false → deny, missing → pause
    expect(run.runs.every((r) => r.status === "pass")).toBe(true);
  });

  // @kit chaining-necessity:local-delegation-pause
  it("source-delegated-decision-reference (B): 5/5 pass + the delegated PATH bubbles the sub's disposition (§4-req1)", () => {
    // Exemplar B — source-required bare same-library `use decision`. The sub is recursed in place and its
    // determination bubbles up (#166), so the oracle names the delegated disposition, not the sub-decision name.
    const dir = mkdtempSync(join(tmpdir(), "authoring-kit-deleg-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "authoring-kit-source-delegated-decision-reference",
        version: "1.0.0",
        private: true,
        crl: {
          canonicalBase: "http://example.org/authoring-kit-source-delegated-decision-reference",
          status: "draft",
          experimental: true,
        },
      }),
    );
    writeFileSync(
      join(dir, "source-delegated-decision-reference.crl"),
      SOURCE_DELEGATED_DECISION_REFERENCE_CRL,
    );
    const celPath = join(dir, "source-delegated-decision-reference.cel");
    writeFileSync(celPath, SOURCE_DELEGATED_DECISION_REFERENCE_CEL);

    const v = validateCELFile(celPath);
    expect(v.errors).toEqual([]);

    const run = runCel(resolveCelImports(celPath));
    expect(run.success).toBe(true);
    expect(run.runs.length).toBe(5);
    expect(run.runs.every((r) => r.status === "pass")).toBe(true);

    // §4-req1: assert the PATH, not just the disposition. The continuation→Deny case must reach the DELEGATED
    // sub's `otherwise` (Deny via the chained "Continuation of Therapy Determination"), NOT the parent's
    // `otherwise`. Membership alone (both are "Deny") can't tell them apart — assert via the trace: the
    // top-level `when "Continuation Request"` branch fired and delegated.
    const denyViaSub = run.runs.find((r) => r.case.includes("no response"))!;
    expect(denyViaSub.produced.map((p) => p.recommendation)).toEqual(["not-certify.Deny"]);
    // The PATH: the top-level `when "Continuation Request"` branch fired and RECURSED into the delegated sub
    // ("Continuation of Therapy Determination"), whose own `otherwise` produced Deny — NOT the parent's
    // `otherwise`. Membership alone ("Deny") can't distinguish these; the trace shape can.
    type TNode = {
      concept?: string;
      node?: string;
      nodeId?: string;
      satisfied?: boolean;
      children?: TNode[];
    };
    const top = (denyViaSub.trace as TNode[]).find((n) => n.concept === "Continuation Request")!;
    expect(top.satisfied).toBe(true); // the delegating branch fired (vs falling through to the parent otherwise)
    expect((top.children ?? []).length).toBeGreaterThan(0); // it recursed into the delegated sub
    // The parent `otherwise` did NOT fire — no top-level otherwise node carried the production.
    const topOtherwise = (denyViaSub.trace as TNode[]).find((n) => n.nodeId === "otherwise");
    expect(topOtherwise).toBeUndefined();
  });

  // @kit decision-composition:arbitration
  it("disposition-arbitration-reference (C): validates clean + the CRE proves the arbitration 8/8 (including a load-bearing severe-markers negative)", () => {
    // Full conjunctions, explicit negatives and missing input preserve distinct outcomes.
    const dir = mkdtempSync(join(tmpdir(), "authoring-kit-arb-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "authoring-kit-disposition-arbitration-reference",
        version: "1.0.0",
        private: true,
        crl: {
          canonicalBase: "http://example.org/authoring-kit-disposition-arbitration-reference",
          status: "draft",
          experimental: true,
        },
      }),
    );
    writeFileSync(
      join(dir, "disposition-arbitration-reference.crl"),
      DISPOSITION_ARBITRATION_REFERENCE_CRL,
    );
    const celPath = join(dir, "disposition-arbitration-reference.cel");
    writeFileSync(celPath, DISPOSITION_ARBITRATION_REFERENCE_CEL);

    const v = validateCELFile(celPath);
    expect(v.errors).toEqual([]);

    const run = runCel(resolveCelImports(celPath));
    expect(run.success).toBe(true);
    expect(run.runs.length).toBe(8);
    expect(run.runs.every((r) => r.status === "pass")).toBe(true);
    // CEL activity assertions are membership checks. Exact outputs additionally reject
    // an unintended second disposition, including in the two overlap scenarios.
    expect(run.runs.map(r => r.produced.map(p => p.recommendation))).toEqual([
      ["certify.Approve"], // X qualifies
      ["certify.Approve"], // Y qualifies
      ["certify.Approve"], // overlap: X fails, Y qualifies
      ["certify.Approve"], // overlap: Y fails, X qualifies
      ["not-certify.Deny"], // Y lacks required severe markers; X is false
      ["not-certify.Deny"], // within indication, no qualifying pathway
      ["not-certify.EIU"], // neither indication
      [], // missing answer: pause before any disposition
    ]);
  });
});

describe("authoring-kit — getAuthoringKit", () => {
  it("returns one complete kit", () => {
    const kit = getAuthoringKit();
    expect(kit).not.toHaveProperty("useCase");
    expect(kit).not.toHaveProperty("stage");
    expect(kit).not.toHaveProperty("chain");
    expect(kit.schemaVersion).toBe("2.1");
    expect(kit.summary).toMatch(/Local decision support/);
  });





  it("serves the FULL grammar type vocabularies (source of truth, no drift)", () => {
    const kit = getAuthoringKit();
    expect(kit.typeAllowlist.conceptTypes).toEqual([...conceptTypes]);
    expect(kit.typeAllowlist.conceptValueTypes).toEqual([...conceptValueTypes]);
    expect(kit.typeAllowlist.activityTypes).toEqual([...activityTypes]);
  });

  it("recommended types are all members of the full grammar lists", () => {
    const kit = getAuthoringKit();
    // The grammar also contains legacy and source-only resource types. They must
    // not be promoted into current selected-concept teaching by this field.
    expect(kit.typeAllowlist.recommended.conceptTypes).toEqual(["Observation"]);
    for (const t of kit.typeAllowlist.recommended.conceptTypes) {
      expect(conceptTypes).toContain(t);
    }
    for (const t of kit.typeAllowlist.recommended.activityTypes) {
      expect(activityTypes).toContain(t);
    }
  });


  it("the unified kit embeds the complete artifact set", () => {
    const kit = getAuthoringKit();
    const names = kit.referenceArtifacts.map((a) => a.name).sort();
    expect(names).toEqual([
      "disposition-arbitration-reference.cel",
      "disposition-arbitration-reference.crl",
      "named-answer-reference.cel",
      "named-answer-reference.crl",
      "named-answer-terms.crl",
      "pa-determination-reference.cel",
      "pa-determination-reference.crl",
      "patient-age-both-rep-reference.crl",
      "publication-reference.crl",
      "selection-reference.cel",
      "selection-reference.crl",
      "source-delegated-decision-reference.cel",
      "source-delegated-decision-reference.crl",
    ]);
    const src = (n: string) => kit.referenceArtifacts.find((a) => a.name === n)?.source;
    expect(src("pa-determination-reference.crl")).toBe(PA_DETERMINATION_REFERENCE_CRL);
    expect(src("pa-determination-reference.cel")).toBe(PA_DETERMINATION_REFERENCE_CEL);
    expect(src("patient-age-both-rep-reference.crl")).toBe(PATIENT_AGE_BOTH_REP_REFERENCE_CRL);
    expect(src("source-delegated-decision-reference.crl")).toBe(
      SOURCE_DELEGATED_DECISION_REFERENCE_CRL,
    );
    expect(src("source-delegated-decision-reference.cel")).toBe(
      SOURCE_DELEGATED_DECISION_REFERENCE_CEL,
    );
    expect(src("disposition-arbitration-reference.crl")).toBe(
      DISPOSITION_ARBITRATION_REFERENCE_CRL,
    );
    expect(src("disposition-arbitration-reference.cel")).toBe(
      DISPOSITION_ARBITRATION_REFERENCE_CEL,
    );
    expect(src("publication-reference.crl")).toBe(PUBLICATION_REFERENCE_CRL);
  });

  it("STEP-4 (kit 1.18) — the `verification` taxonomy is honest, in-payload, and tier↔proof-consistent (disc 408)", () => {
    const kitScope = "unified";
    const kit = getAuthoringKit();
    // (a) EVERY artifact declares a nonempty set of recognized tiers.
    const tiers = new Set(["cre-run", "fhir-emit", "engine-run", "validate-only"]);
    for (const a of kit.referenceArtifacts) {
      expect(a.verification.length).toBeGreaterThan(0);
      expect(new Set(a.verification).size).toBe(a.verification.length);
      expect(
        a.verification.every((tier) => tiers.has(tier)),
        a.name,
      ).toBe(true);
    }
    // (b) The legend is IN the (hashed) payload — a TS docstring never reaches the MCP consumer. It is EXACTLY
    //     the set of tiers the shipped artifacts use — no duplicate entries (uniqueness), no dangling entry for
    //     an unused tier (coverage both ways = set equality) — each with a non-empty `means` + `doesNotProve`.
    const legendTierList = kit.verificationLegend.map((l) => l.tier);
    const legendTiers = new Set(legendTierList);
    const usedTiers = new Set(kit.referenceArtifacts.flatMap((a) => a.verification));
    expect(legendTierList.length, `duplicate legend entries in ${kitScope}`).toBe(legendTiers.size);
    expect([...legendTiers].sort(), `legend tiers != tiers artifacts use in ${kitScope}`).toEqual(
      [...usedTiers].sort(),
    );
    for (const l of kit.verificationLegend) {
      expect(l.means.length).toBeGreaterThan(0);
      expect(l.doesNotProve.length).toBeGreaterThan(0);
    }
    // (c) TIER↔PROOF structural consistency (the field must not be an unverified claim):
    //     - every `cre-run` `.crl` has a `.cel` companion (same basename) that is ALSO `cre-run` (the pair the
    //       kit harness actually runs); every `cre-run` `.cel` has its `.crl`.
    //     - `engine-run` / `validate-only` artifacts have NO `.cel` companion (not CRE-run).
    const byName = new Map(kit.referenceArtifacts.map((a) => [a.name, a]));
    const base = (n: string) => n.replace(/\.(crl|cel)$/, "");
    for (const a of kit.referenceArtifacts) {
      const cel = byName.get(`${base(a.name)}.cel`);
      const crl = byName.get(`${base(a.name)}.crl`);
      if (a.verification.includes("cre-run")) {
        if (a.name.endsWith(".crl")) {
          expect(cel, `cre-run ${a.name} must have a .cel companion in ${kitScope}`).toBeDefined();
          expect(cel!.verification).toContain("cre-run");
        } else {
          expect(crl, `cre-run ${a.name} must have a .crl companion in ${kitScope}`).toBeDefined();
        }
      } else {
        // engine-run / validate-only are NOT proven via a CEL pair — assert no companion CEL exists.
        expect(
          cel,
          `${a.name} has no cre-run proof and must NOT have a .cel companion in ${kitScope}`,
        ).toBeUndefined();
      }
    }
    // The selected producer example is emitted, with no unexecuted runtime stamp.
    const repr = byName.get("publication-reference.crl")!;
    expect(repr.verification).toEqual(["fhir-emit"]);
  });

  it("STEP-4 — the `cre-run` tier is SELF-VERIFYING: EVERY cre-run pair is materialized and run through the CRE (disc 408 impl round)", () => {
    // The `cre-run` legend claims each pair "is executed through the CRE every build". The tier↔proof structural
    // test only checks pair TOPOLOGY — a future cre-run pair with both files present but no run test would pass it
    // while the legend silently lies. This closes that gap the way `validate-only` is closed by crlErrors: it
    // DERIVES the run set from the payload, so a cre-run label with an unrunnable/absent CEL FAILS here.
    const kit = getAuthoringKit(); // the complete kit
    const byName = new Map(kit.referenceArtifacts.map((a) => [a.name, a]));
    const crePairs = kit.referenceArtifacts.filter(
      (a) => a.verification.includes("cre-run") && a.name.endsWith(".crl"),
    );
    expect(crePairs.length).toBe(5); // includes the shared selection test input
    for (const crl of crePairs) {
      const base = crl.name.replace(/\.crl$/, "");
      const cel = byName.get(`${base}.cel`);
      expect(cel, `cre-run ${crl.name} has no .cel companion in the payload`).toBeDefined();
      const dir = mkdtempSync(join(tmpdir(), "authoring-kit-crerun-"));
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({
          name: "authoring-kit-crerun",
          version: "1.0.0",
          private: true,
          crl: {
            canonicalBase: crl.name.startsWith("named-answer-") ? ANSWER_EXAMPLE_BASE : "http://example.org/authoring-kit-crerun",
            status: "draft",
            experimental: true,
          },
        }),
      );
      for (const dependency of kit.referenceArtifacts.filter((a) => a.language === "crl"))
        writeFileSync(join(dir, dependency.name), dependency.source);
      const celPath = join(dir, `${base}.cel`);
      writeFileSync(celPath, cel!.source);
      const v = validateCELFile(celPath);
      expect(v.errors, `${base}.cel does not validate clean`).toEqual([]);
      const run = runCel(resolveCelImports(celPath));
      expect(run.success, `${base} run failed`).toBe(true);
      expect(run.runs.length, `${base} produced no cases`).toBeGreaterThan(0);
      expect(
        run.runs.every((r) => r.status === "pass"),
        `${base} has a non-passing case`,
      ).toBe(true);
    }
  });


  it("conceptLayerModel admits supported selected-publication shapes, producers and sources", () => {
    const kit = getAuthoringKit();
    const byForm = (frag: string) => kit.conceptLayerModel.find((e) => e.form.includes(frag))!;
    expect(byForm("code is").scope).toBe("in");
    expect(byForm("defined as")).toBeUndefined();
    expect(byForm("definition is").scope).toBe("in");
    expect(byForm("source representation").scope).toBe("in");
    expect(getAuthoringKit().summary).not.toMatch(/boolean composition|local composition/i);
  });

  it("the decision-composition rule (#168) teaches: distinct criteria go in the decision TREE, not `defined as`", () => {
    const rule = getAuthoringKit().rules.find((r) => r.id === "decision-composition");
    expect(rule).toBeDefined();
    expect(rule!.rule).toMatch(/compound branch guard|named criterion/i);
    expect(rule!.rule).toMatch(/use decision/);
    expect(rule!.rule).toMatch(/Do not manufacture inference concepts/i); // the anti-pattern is called out
    expect(rule!.category).toBe("decision-shape");
  });

  it("verifyLoop is honest about what a green run does and does not prove", () => {
    const kit = getAuthoringKit();
    expect(kit.verifyLoop.doesNotProve).toMatch(/code membership/);
    expect(kit.verifyLoop.note).toMatch(/project root|package\.json/);
  });

  it("forceModel (§0) carries the three force levels + the governing principle", () => {
    const kit = getAuthoringKit();
    expect(kit.forceModel).toBeDefined();
    expect(kit.forceModel.summary.length).toBeGreaterThan(0);
    const levels = kit.forceModel.levels.map((l) => l.level).sort();
    expect(levels).toEqual(["default", "invariant", "validator-enforced"].sort());
    for (const l of kit.forceModel.levels) expect(l.meaning.length).toBeGreaterThan(0);
    // The governing principle: faithful-to-source over default, source over human refactor.
    expect(kit.forceModel.governingPrinciple).toMatch(/faithful/i);
  });

  // @kit verify-loop:kit-force-coverage
  it("every rule has explicit force clauses and every invariant anchor resolves", () => {
    expect(() => assertForceCoverage(getAuthoringKit())).not.toThrow();
  });

  // @kit verify-loop:kit-force-coverage
  it.each(getAuthoringKit().rules.map(rule => rule.id))("rejects missing or empty force clauses on %s", id => {
    for (const clauses of [undefined, []]) {
      const kit = getAuthoringKit();
      const malformed = { ...kit, rules: kit.rules.map(rule => rule.id === id ? { ...rule, clauses } : rule) };
      expect(() => assertForceCoverage(malformed as ReturnType<typeof getAuthoringKit>)).toThrow(id);
    }
  });

  it.each([
    { text: "Claim", force: "unspecified" },
    { text: "Claim", force: "invariant" },
    { text: "Claim", force: "invariant", test: "verifyLoop:missing" },
    { text: "Claim", force: "invariant", test: "judgeLens.composition:missing" },
    { text: "", force: "default" },
  ])("rejects malformed force metadata %j", clause => {
    const kit = getAuthoringKit();
    const rules = kit.rules.map((rule, index) => index === 0 ? { ...rule, clauses: [clause] } : rule);
    expect(() => assertForceCoverage({ ...kit, rules } as ReturnType<typeof getAuthoringKit>)).toThrow();
  });


  it("the `dispositions` rule is UN-FUSED — CPG-base only, NO PA `communicated-not-ordered` invariant", () => {
    const disp = getAuthoringKit().rules.find((r) => r.id === "dispositions")!;
    expect(disp).toBeDefined();
    // The base survives: plain activity / no invented verbs / disposition-type-follows-act.
    expect(disp.rule).toMatch(/plain `activity`/);
    expect(disp.rule).toMatch(/no approve\/deny\/pend verbs|do not invent/i);
    // The PA invariant is GONE from dispositions (relocated to pa-disposition-set).
    const paClause = (disp.clauses ?? []).find(
      (c) => c.test === "verifyLoop:communicated-not-ordered",
    );
    expect(paClause).toBeUndefined();
    // ...and dispositions no longer names the shared PA library.
    expect(disp.rule).not.toMatch(/Medical Policy Determination/);
  });

  it("pa-disposition-set carries the config-driven invariants — communicated-not-ordered + configured-membership + finality-by-mode, each a DISTINCT check", () => {
    const paRule = getAuthoringKit().rules.find(
      (r) => r.id === "pa-disposition-set",
    )!;
    const anchors = (paRule.clauses ?? [])
      .filter((c) => c.force === "invariant")
      .map((c) => c.test);
    expect(anchors).toEqual(
      expect.arrayContaining([
        "verifyLoop:communicated-not-ordered",
        "verifyLoop:configured-membership",
        "verifyLoop:mutual-exclusivity-spans-closure",
        "verifyLoop:finality-by-mode",
      ]),
    );
    // shared-lib-membership / no-pend were renamed to configured-membership / finality-by-mode (config-driven model).
    expect(anchors).not.toContain("verifyLoop:shared-lib-membership");
    expect(anchors).not.toContain("verifyLoop:no-pend");
    expect(new Set(anchors).size).toBe(anchors.length); // all distinct
  });

  it("determination guidance includes the configurable category model", () => {
    const dm = getAuthoringKit().dispositionModel!;
    expect(dm.categories.map((c) => c.name).sort()).toEqual(["certify", "not-certify", "pended"]);
    expect(dm.categories.find((c) => c.name === "pended")!.finality).toBe("non-final");
    expect(dm.localActivityRequired).toBe(true);
    expect(dm.config.modes.standalone).toMatch(/final/i);
    expect(dm.config.modes.embedded).toMatch(/pended|non-final/i);
  });

  it("judgeLens.composition (§2/§3) carries the three source-fidelity checks, each with a weightedBy + ≥1 checkpoint", () => {
    const kit = getAuthoringKit();
    expect(Array.isArray(kit.judgeLens.composition)).toBe(true);
    const checks = kit.judgeLens.composition.map((c) => c.check).sort();
    expect(checks).toEqual(
      ["dropped-or-added-criterion", "hollowed-criteria", "invented-determination-boundary"].sort(),
    );
    for (const c of kit.judgeLens.composition) {
      expect(c.weightedBy.length).toBeGreaterThan(0);
      expect(c.guidance.length).toBeGreaterThan(0);
      expect(c.checkpoints.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("the chaining-necessity rule (§2) teaches `use decision` serves source-delegation OR genuine reuse (genuinely-shared vs fabricated-shared)", () => {
    const rule = getAuthoringKit().rules.find((r) => r.id === "chaining-necessity");
    expect(rule).toBeDefined();
    expect(rule!.category).toBe("decision-shape");
    expect(rule!.rule).toMatch(/use decision/);
    expect(rule!.rule).toMatch(/source/i);
    // reuse is a FIRST-CLASS driver (not prohibited); the line is genuinely-shared vs fabricated-shared, not reuse-vs-not
    expect(rule!.rule).toMatch(/reuse/i);
    expect(rule!.rule).toMatch(/genuinely[ -]shared/i);
    expect(rule!.rule).toMatch(/fabricat/i);
    // the false-coupling guard survives: independent lookalikes still duplicate inline
    expect(rule!.rule).toMatch(/duplicate/i);
    // the invented-boundary invariant clause still anchors to the composition lens
    const invented = (rule!.clauses ?? []).find(
      (c) =>
        c.force === "invariant" &&
        c.test === "judgeLens.composition:invented-determination-boundary",
    );
    expect(invented).toBeDefined();
  });




  // ⚠⚠ THE GATE THAT MAKES A SILENT HASH MOVE IMPOSSIBLE.
  //
  // The pins above catch that content MOVED. They do not catch the thing that actually hurt a consumer:
  // content moving while `schemaVersion` STAYS PUT. That happened — `reference.ts` was corrected in-tree
  // and both hashes changed across three releases under a static `1.27`, with no changelog. To make the
  // suite green you only had to re-pin, and re-pinning is exactly what a person does without thinking.
  //
  // ⭐ WHY IT IS WORSE THAN A STALE AUTHOR. The consuming project's REVIEWER LENSES restate kit rules, so
  // a stale pin blinds the reviewer too. Measured downstream: two full judge rounds passed an artifact
  // built on a retired construct model, because neither arm's lens knew the new construct existed. The
  // reviewer is the thing that is supposed to catch the author, and a silent move takes out both.
  //
  // So hashes are keyed BY schemaVersion. Changing content now forces one of:
  //   - add a NEW version key (a bump, which is the correct move), or
  //   - edit a HISTORICAL entry, which is visible in review as rewriting the past.
  // There is no longer a way to re-pin that looks like routine test maintenance.
  it("the full content hash stays pinned for its kit version", () => {
    const kit = getAuthoringKit();
    expect(kit.schemaVersion).toBe("2.1");
    expect(kit.contentHash).toBe("28bf5d87e4802bd3da9a6e4b5798414a805ccecd740ecede8c6b977553809336");
  });

  it("the changelog names the current schemaVersion, so a bump cannot ship unexplained", () => {
    // A version with no entry is a hash move a consumer cannot diff — the same defect one step later.
    const src = readFileSync(join(__dirname, "..", "index.ts"), "utf8");
    const version = getAuthoringKit().schemaVersion;
    expect(src, `no changelog entry mentions "${version}"`).toContain(`→ "${version}"`);
  });

  it("SERIALIZED payload teaches the posrep age model with NO residue of the retired `definition is age today` doctrine (#257 T3 sweep guard)", () => {
    // Guards against the T1-era partial state recurring one layer down: a line-list edit is too fragile
    // POSITIVE retired doctrine only — retirement/anchored MENTIONS (e.g. "`definition is age today` is
    // now an author-time + emit error") are legitimately present and must pass.
    const forbidden: [RegExp, string][] = [
      [/AGE-ONLY guardrail|value projection` is age-only|only rep-level `value projection`|sole one with a built emit-lowering/i, "retired age-only implementation claim"],
      [/unit MUST be [`'"]?years/i, "years-only unit rule"],
      [/months`?\s*\/\s*`?days/i, "`months`/`days` error ordering (T2 sanctioned months)"],
      [/AgeAt\(\) is in (whole )?years/i, "AgeAt()-is-years rationale"],
      // Impl-panel fix (both arms): the old `[^.]{0,60}` stopped at the `.` in `age-code`.` and matched
      // NOTHING against the very form it guards. Use a punctuation-crossing gap; verified green against the
      // current payload (the legit "retired `definition is age today` form" mention is >120 chars from any
      // preceding `code is`).
      [
        /`code is`[\s\S]{0,120}`definition is age today`/i,
        "the retired `code is` + `definition is age today` both-rep form",
      ],
      // The retired FRAMING family (the "ONE/SOLE `definition is` exception/carve-out" doctrine) — patterns
      // above miss it. No false-positive surface: surviving "carve-out" hits are non-served comments or the
      // decision-composition "no carve-out"; current age doctrine says "SOLE sanctioned Stage-1 posrep".
      [
        /the (ONE|SOLE)[^.]{0,40}`?definition is`?[^.]{0,20}(exception|carve-out)/i,
        "the retired `definition is` exception/carve-out framing",
      ],
    ];
    const kitScope = "unified";
    const payload = JSON.stringify(getAuthoringKit());
    for (const [re, label] of forbidden) {
      expect(
        re.test(payload),
        `${kitScope}: retired doctrine "${label}" must not appear in the served payload`,
      ).toBe(false);
    }
    // POSITIVE — the posrep model + T2 months ARE taught.
    expect(payload, kitScope).toContain("value projection");
    expect(payload, kitScope).toContain("patient-age-projection"); // the renamed rule id (accurate teaching surface)
    expect(payload, kitScope).toContain("AgeInMonths"); // the months compute fn is taught
    const age = getAuthoringKit().rules.find(r => r.id === "patient-age-projection")!;
    expect(age.rule).toContain("PROJECTION COVERAGE");
    expect(age.clauses?.some(c => c.force === "invariant" && /age family only/.test(c.text))).toBe(true);
  });

  it("the representation-reference exemplar semantically pins the STANDALONE months age projection (#257 T3 impl-panel — generic prose `.toContain`s don't prove the exemplar survives)", () => {
    // Impl-panel catch (gpt56#6): the mirror-equality + crlErrors tests prove fidelity + grammar, and the
    // payload `.toContain`s above match prose that persists even if this exemplar block is removed/changed.
    // Pin the actual served block: the concept, its standalone shape (no local `code is`), the carrier, and
    // the `under 6 months` projection — so a regression that drops or mutates it goes red HERE.
    const src = PUBLICATION_REFERENCE_CRL;
    expect(src).toContain('concept "Patient Under Six Months":');
    expect(src).toContain("value projection is age today under 6 months");
    // ⚠ The exemplar no longer states the CARRIER — `value element is Patient.birthDate` is retired on a
    // representation, and the projection knows its own carrier. Pin what the author actually writes: the
    // Patient `type is` (the one fact the projection cannot supply) and the ABSENCE of the retired lines,
    // so a regression that re-teaches them goes red here.
    expect(src).toContain("- type is Patient.");
    expect(src).not.toContain("value element is");
    expect(src).not.toContain("- value type is date.");
    // STANDALONE = no local `code is` inside this concept's block (recency requires a `code is` arm).
    const block = src.slice(src.indexOf('concept "Patient Under Six Months":'), src.length);
    expect(block).not.toContain("code is");
  });

  it("no RETIRED positive doctrine survives anywhere in the serialized payload (#224 anti-half-inversion guard)", () => {
    // The #224 re-pin INVERTED hollowed-criteria; a half-inverted payload (a surviving 'composite is faithful' /
    // 'sem-not arbitration is the faithful refinement' claim in an example note, a reference `purpose`, or a clause)
    // is worse than the old rule — the review found four such survivors on the first pass. This sweeps the WHOLE
    // serialized payload for the retired POSITIVE claims. Patterns are chosen NEGATION-SAFE: the new prose's
    // retirement quotes (e.g. "'a single-consequence composite is faithful' rule") do NOT match these. Both
    const kitScope = "unified";
    const blob = JSON.stringify(getAuthoringKit());
    const retired: RegExp[] = [
      /EQUALLY faithful/i,
      /disposition-consequence, not (audit|visibility)/i,
      /faithful, provable refinement/i,
      /computed in the inference layer/i,
      /is FAITHFUL when (those criteria|they|all)/i,
      // #224 iii.3: no "monotone" / "no `not`" branch-guard doctrine survives (negation is
      // first-class). Catches the retired "a `when` takes a MONOTONE and/or boolean" claim.
      /\bmonotone\b/i,
      /no `?not`? at the branch/i,
      // #234: the FCT distinct-criteria composite is retired (drug/PT failure are SEPARATE events, DISTINCT
      // criteria, not one fact). Match the SOURCE FORM, not prose — a revert of the artifact/example reintroduces
      // this string. ESCAPE-TOLERANT: the sweep runs on JSON.stringify(kit), where a source `"` serializes as `\"`
      // and a newline as `\n`, so `\\?"` matches the operand's closing quote (escaped or raw) and `(?:\s|\\n)+`
      // spans the separator whether the composite is single-line or wrapped across lines. Mutation-tested against
      // both serializations. (The replacement example note is worded to NOT contain this literal; "one criterion,
      // two representations" is deliberately NOT banned — the viral-suppression example legitimately IS that.)
      /Failed (Drug|Physical) Therapy\\?"(?:\s|\\n)+sem-or/i,
    ];
    for (const re of retired) {
      expect(blob, `retired doctrine still in ${kitScope} payload: ${re}`).not.toMatch(re);
    }
  });

  it("keeps source-unit reasoning without recommending legacy sem composition", () => {
 const kit = getAuthoringKit();
 const rule = kit.rules.find(r => r.id === "decision-composition")!;
 expect(rule.clauses?.find(c => c.text.startsWith("UNIT ANCHORING"))).toMatchObject({ force: "invariant", test: "judgeLens.composition:hollowed-criteria" });
 expect(rule.rule).toContain("separate independently occurring facts");
 expect(kit.conceptLayerModel.some(m => m.form.includes("defined as"))).toBe(false);
});

  it("teaches value types on admitted publications without Scalar authoring", () => {
 const kit = getAuthoringKit();
 const rule = kit.rules.find(r => r.id === "value-type")!;
 expect(rule.rule).toContain("Declare value type explicitly on selected Observation publications");
 expect(rule.rule).toContain("Do not relabel coded or numeric data as boolean");
 expect(rule.clauses?.[0].force).toBe("validator-enforced");
 expect(rule.clauses?.[1].force).toBe("default");
 expect(kit.boundary.join(" ")).toContain("full compiler retirement is unfinished");
});

  it("teaches whole-expression publication guards without a legacy DNF size prescription", () => {
 const rule = getAuthoringKit().rules.find(r => r.id === "decision-composition")!;
 const emission = rule.clauses!.find(c => c.text.startsWith("Publication-reachable"))!;
 expect(emission.text).toContain("whole Boolean expression");
 expect(emission.text).toContain("dependency input[]");
 expect(rule.clauses!.some(c => c.text.includes("K×"))).toBe(false);
});


  it("judgeLens has one rule per the 4 provenance waiver kinds, each with a weightedBy + ≥1 checkpoint", () => {
    const kit = getAuthoringKit();
    expect(kit.judgeLens).toBeDefined();
    expect(typeof kit.judgeLens.summary).toBe("string");
    expect(kit.judgeLens.summary.length).toBeGreaterThan(0);
    const kinds = kit.judgeLens.waivers.map((w) => w.kind).sort();
    expect(kinds).toEqual(
      [
        "waiver-authored",
        "waiver-disposition-class",
        "waiver-ignored-span",
        "waiver-intentional-unlink",
      ].sort(),
    );
    for (const w of kit.judgeLens.waivers) {
      expect(typeof w.weightedBy).toBe("string");
      expect(w.weightedBy.length).toBeGreaterThan(0);
      expect(typeof w.guidance).toBe("string");
      expect(w.guidance.length).toBeGreaterThan(0);
      expect(Array.isArray(w.checkpoints)).toBe(true);
      expect(w.checkpoints.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("judgeLens weighting axes name their discriminators (authoredKind, MN-keyword, dispositionClass)", () => {
    const kit = getAuthoringKit();
    const byKind = (k: string) => kit.judgeLens.waivers.find((w) => w.kind === k)!;
    expect(byKind("waiver-authored").weightedBy).toMatch(/authoredKind/);
    expect(byKind("waiver-ignored-span").weightedBy).toMatch(/MN-keyword|clinical language/i);
    expect(byKind("waiver-disposition-class").weightedBy).toMatch(/dispositionClass/);
    // clinical-assumption = scrutinize; implementation-artifact = rubber-stamp
    expect(byKind("waiver-authored").weightedBy).toMatch(/clinical-assumption/);
    expect(byKind("waiver-authored").weightedBy).toMatch(/implementation-artifact/);
  });

  it("the pa-disposition-set rule (#134/#167) is STRUCTURAL + config-driven — membership/mutual-exclusivity/finality, naming no activities", () => {
    const rule = getAuthoringKit().rules.find(
      (r) => r.id === "pa-disposition-set",
    );
    expect(rule).toBeDefined();
    // config-driven membership (no shared library) + the never-CPGServiceRequest guard
    expect(rule!.rule).toMatch(/configured|crl\.dispositions/i);
    expect(rule!.rule).not.toMatch(/Medical Policy Determination/); // the shared-lib model is gone
    expect(rule!.rule).toMatch(/CPGServiceRequest/);
    // exactly one determination per case
    expect(rule!.rule).toMatch(/exactly one|mutual.{0,3}exclus|first:/i);
    // finality-by-mode (pended non-final)
    expect(rule!.rule).toMatch(/A4|pend|final/i);
    // customer-agnostic: the STRUCTURAL gate names NO determination labels — Approve/Deny/flavors are config (#167)
    expect(rule!.rule).not.toMatch(/\bApprove\b|\bDeny\b/);
    expect(rule!.why ?? "").not.toMatch(/\bApprove\b|\bDeny\b/);
  });

  it("the kit PAYLOAD names no content-repo / customer (customer-agnostic — serves any deployment's content project)", () => {
    // customer leak), not just rules — the leak this guards (e.g. a verifyLoop/referenceArtifact note) would slip a
    // rules-only check. contentHash is derived, so drop it.
    const { contentHash: _hash, audit: _audit, ...payload } = getAuthoringKit();
    expect(JSON.stringify(payload)).not.toMatch(/crl-content|hcsc|iehp|inland empire|bleph/i);
  });
});

describe("authoring-kit — examples are validated (no unverified CRL ships)", () => {
  const wrap = (snippet: string) => `# T\nlibrary "T".\n${snippet}`;

  it("do-cases are shape-clean; a mechanical don't-case raises its rule; a judge-lens don't-case is validator-clean", () => {
    const kit = getAuthoringKit();
    for (const ex of kit.examples) {
      if (ex.language !== "crl") continue;
      const errors = crlErrors(wrap(ex.snippet));
      const shape = errors.filter((e) => e.kind === "decision-shape") as DecisionShapeError[];
      if (ex.valid) {
        // Do-cases may reference external (unresolved) decls, but must be shape-clean
        // and free of grammar/parse errors.
        expect(shape).toEqual([]);
        expect(errors.every((e) => e.kind === "unresolved-reference")).toBe(true);
      } else if (ex.expectRule) {
        // MECHANICALLY invalid: the validator raises the named decision-shape rule.
        expect(shape.map((e) => e.rule)).toContain(ex.expectRule);
      } else {
        // JUDGE-lens violation (e.g. the `hollowed-criteria` vacuity trap): VALIDATOR-CLEAN. The grammar
        // cannot see the defect — this branch DEMONSTRATES it (#234): no decision-shape error. The vacuity
        // trap is now self-contained (kit 1.12, #234 follow-up finding 4), so it emits ZERO errors; any judge-lens
        // example that still cites external decls emits only unresolved-reference. Either way, no shape error.
        expect(shape).toEqual([]);
        expect(errors.every((e) => e.kind === "unresolved-reference")).toBe(true);
      }
    }
  });
});

// Flag field behavior is owned by flags/tests/flagVocab.test.ts; @gap-filed
// field validation is owned by validator/tests/metaTag.test.ts. The checks below
// verify delivered teaching, rather than repeating those implementations.
describe("authoring-kit — the review-flags rule teaches the `medical-validation/flags/` STORE model, not `.crl`-meta flags (#212 step 4c, #230 relocation)", () => {
  // Guards the kit PAYLOAD (what a KE agent receives) against re-teaching the deleted `.crl`-meta flag path (gpt55 impl
  // review, disc 253). The strip tests prove the tags left the registry; this proves the kit no longer instructs authoring
  // them as `.crl` lines / claims the tools return rewritten source.
  const kit = getAuthoringKit();
  const payload = JSON.stringify(kit);
  const rule = kit.rules.find((r) => r.id === "review-flags");

  it("the review-flags rule points at the flag STORE + create_flag (a flag is a store record, not a `- meta is` line)", () => {
    expect(rule).toBeDefined();
    const text = JSON.stringify(rule);
    expect(text).toContain("medical-validation/flags/"); // #230: the CURRENT store location the rule teaches
    expect(text).toContain("create_flag");
    expect(text).toContain("STORE RECORD");
  });

  // The former-flag-tag `- meta is` construction, anywhere (rule prose OR an example) — the structural regression signal.
  const FLAG_META_LINE =
    /-\s*meta is\s*`@(customer-confirmable|internal-inconsistency|open-fork|fidelity-defect|validation-concern)\b/;

  it("the DEAD `.crl`-meta flag teaching is gone from the WHOLE payload (prose + examples), not just a couple phrases", () => {
    expect(payload).not.toMatch(FLAG_META_LINE); // no "author a flag as `- meta is `@open-fork…`" reworded anywhere
    expect(payload).not.toMatch(/create_flag[\s\S]{0,200}returns?[\s\S]{0,80}(source|crl)/i); // "create_flag … returns … source/crl"
    expect(payload).not.toMatch(/(updated|rewritten)\s+\.?crl\s+source/i);
    expect(payload).not.toMatch(/RETURN the rewritten source/i); // the exact pre-4c phrase (belt-and-suspenders)
  });

  it("the flag EXAMPLES are `text` tool calls; NO `crl` example authors a former flag tag as a `- meta is` line", () => {
    const toolCallExamples = kit.examples.filter((e) => /create_flag/.test(e.snippet));
    expect(toolCallExamples.length).toBeGreaterThan(0);
    for (const e of toolCallExamples) expect(e.language).toBe("text");
    const teachesCrlFlag = kit.examples.some(
      (e) => e.language === "crl" && FLAG_META_LINE.test(e.snippet),
    );
    expect(teachesCrlFlag).toBe(false);
  });

  it("the `text` create_flag examples reference only real tool args + real flag fields (catches a stale/renamed key)", () => {
    // Every `<key>:` token in a create_flag illustration must be a real create_flag arg OR a real flagVocab field — so a
    // renamed arg (e.g. gist→summary) or a bogus field surfaces here (gpt55 + Claude impl review).
    const toolArgs = new Set([
      "path",
      "code",
      "kind",
      "name",
      "library",
      "tag",
      "gist",
      "fields",
      "status",
    ]);
    const flagFields = new Set(
      [
        "customer-confirmable",
        "internal-inconsistency",
        "open-fork",
        "fidelity-defect",
        "validation-concern",
      ].flatMap((t) => flagFieldRulesOf(t).map((r) => r.key)),
    );
    for (const e of kit.examples.filter((ex) => /create_flag/.test(ex.snippet))) {
      const keys = [...e.snippet.matchAll(/\b([a-z][a-z-]*)\s*:/g)].map((m) => m[1]);
      for (const k of keys) expect(toolArgs.has(k) || flagFields.has(k)).toBe(true);
    }
  });
});
