// REFACTOR:grounded (#320, plan595): both BMI kit payloads are versioned and verified through MCP.
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
import { getAuthoringKit, STAGES, USE_CASE_NAMES } from "../index";
import { answerExampleSource, ANSWER_EXAMPLE_BASE, ANSWER_EXAMPLE_CEL, ANSWER_EXAMPLE_TERMS } from "../answerExample";
import { flagFieldRulesOf } from "../../flags/flagVocab"; // #212 step 4b: flag field rules live in the vocab now

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
    for (const useCase of USE_CASE_NAMES) {
      const artifacts = new Map(getAuthoringKit(undefined, useCase).referenceArtifacts.map((a) => [a.name, a.source]));
      expect(artifacts.get("named-answer-reference.crl")).toBe(answerExampleSource());
      expect(artifacts.get("named-answer-reference.cel")).toBe(ANSWER_EXAMPLE_CEL);
      expect(artifacts.get("named-answer-terms.crl")).toBe(`library "Shared".\n${ANSWER_EXAMPLE_TERMS}`);
    }
  });

  it("rejects the known stale PA instruction and teaches the named form on both chains", () => {
    const obsoleteInstruction = /\b(?:use|author|prefer|write)\b[^.\n]*\binline\s+`value from:`/i;
    const prose = (value: unknown): string[] => typeof value === "string" ? [value]
      : value && typeof value === "object" ? Object.values(value).flatMap(prose) : [];
    const hasObsoleteInstruction = (value: unknown) => prose(value).some((text) => obsoleteInstruction.test(text));
    const bad = "Use inline `value from:` for local answer options.";
    expect(hasObsoleteInstruction({ clauses: [{ text: bad }] })).toBe(true);
    expect(hasObsoleteInstruction({ summary: bad })).toBe(true);
    expect(hasObsoleteInstruction({ text: "The removed inline `value from:` form is rejected." })).toBe(false);
    for (const useCase of USE_CASE_NAMES) {
      const kit = getAuthoringKit(undefined, useCase);
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
      if (useCase === "prior-auth") {
        const pa = kit.rules.find((r) => r.id === "pa-answers-not-records")!;
        expect(pa.rule).toContain('value from is "Named Terminology"');
        expect(pa.ref).toContain("named-answer-options");
        expect(pa.ref).not.toContain("inline-answer-options");
      }
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
  it("disposition-arbitration-reference (C): validates clean + the CRE proves the arbitration 7/7 (incl. both overlap cases)", () => {
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
    expect(run.runs.length).toBe(7);
    expect(run.runs.every((r) => r.status === "pass")).toBe(true);
    // CEL activity assertions are membership checks. Exact outputs additionally reject
    // an unintended second disposition, including in the two overlap scenarios.
    expect(run.runs.map(r => r.produced.map(p => p.recommendation))).toEqual([
      ["certify.Approve"], // X qualifies
      ["certify.Approve"], // Y qualifies
      ["certify.Approve"], // overlap: X fails, Y qualifies
      ["certify.Approve"], // overlap: Y fails, X qualifies
      ["not-certify.Deny"], // within indication, no qualifying pathway
      ["not-certify.EIU"], // neither indication
      [], // missing answer: pause before any disposition
    ]);
  });
});

describe("authoring-kit — getAuthoringKit", () => {
  it("returns the local-decision-support kit by default", () => {
    const kit = getAuthoringKit();
    expect(kit.stage).toBe("local-decision-support");
    expect(kit.schemaVersion).toBe("1.38");
    expect(kit.summary).toMatch(/Local decision support/);
  });

  it("an OMITTED useCase resolves to the neutral cpg base (fail-loud, NOT silent-PA)", () => {
    const kit = getAuthoringKit();
    expect(kit.useCase).toBe("cpg");
    expect(kit.chain).toEqual(["cpg"]); // name-resolved chain
  });

  it("useCase:'prior-auth' resolves the inherited chain [cpg, prior-auth] (name-order)", () => {
    const kit = getAuthoringKit(undefined, "prior-auth");
    expect(kit.useCase).toBe("prior-auth");
    expect(kit.chain).toEqual(["cpg", "prior-auth"]);
  });

  it("throws on an unknown stage, listing valid stages", () => {
    expect(() => getAuthoringKit("emit")).toThrow(/Unknown authoring stage/);
    expect(() => getAuthoringKit("emit")).toThrow(/local-decision-support/);
  });

  it("throws on an unknown useCase, listing valid useCases", () => {
    expect(() => getAuthoringKit(undefined, "measure")).toThrow(/Unknown authoring useCase/);
    expect(() => getAuthoringKit(undefined, "measure")).toThrow(/cpg.*prior-auth|prior-auth/);
    // Measure is RESERVED by docs, deliberately not a shipped chain — so the throw stays honest.
    expect([...USE_CASE_NAMES]).toEqual(["cpg", "prior-auth"]);
  });

  it("serves the FULL grammar type vocabularies (source of truth, no drift)", () => {
    const kit = getAuthoringKit();
    expect(kit.typeAllowlist.conceptTypes).toEqual([...conceptTypes]);
    expect(kit.typeAllowlist.conceptValueTypes).toEqual([...conceptValueTypes]);
    expect(kit.typeAllowlist.activityTypes).toEqual([...activityTypes]);
  });

  it("stageRecommended types are all members of the full grammar lists", () => {
    const kit = getAuthoringKit();
    // The grammar also contains legacy and source-only resource types. They must
    // not be promoted into current selected-concept teaching by this field.
    expect(kit.typeAllowlist.stageRecommended.conceptTypes).toEqual(["Observation"]);
    for (const t of kit.typeAllowlist.stageRecommended.conceptTypes) {
      expect(conceptTypes).toContain(t);
    }
    for (const t of kit.typeAllowlist.stageRecommended.activityTypes) {
      expect(activityTypes).toContain(t);
    }
  });

  it("the cpg base embeds the PA-free artifacts (named answers + patient age + publications); NO PA artifacts", () => {
    const kit = getAuthoringKit(undefined, "cpg");
    const names = kit.referenceArtifacts.map((a) => a.name).sort();
    expect(names).toEqual([
      "named-answer-reference.cel",
      "named-answer-reference.crl",
      "named-answer-terms.crl",
      "patient-age-both-rep-reference.crl",
      "publication-reference.crl",
      "selection-reference.cel",
      "selection-reference.crl",
    ]);
    // Every cpg artifact is edge-tagged cpg, and (closure) references no PA determination lib.
    for (const a of kit.referenceArtifacts) {
      expect(a.edge).toBe("cpg");
      expect(a.source).not.toMatch(/Medical Policy Determination/);
    }
  });

  it("the prior-auth chain embeds the full artifact set (cpg base + the PA edge)", () => {
    const kit = getAuthoringKit(undefined, "prior-auth");
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
    for (const uc of ["cpg", "prior-auth"] as const) {
      const kit = getAuthoringKit("local-decision-support", uc);
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
      expect(legendTierList.length, `duplicate legend entries in ${uc}`).toBe(legendTiers.size);
      expect([...legendTiers].sort(), `legend tiers != tiers artifacts use in ${uc}`).toEqual(
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
            expect(cel, `cre-run ${a.name} must have a .cel companion in ${uc}`).toBeDefined();
            expect(cel!.verification).toContain("cre-run");
          } else {
            expect(crl, `cre-run ${a.name} must have a .crl companion in ${uc}`).toBeDefined();
          }
        } else {
          // engine-run / validate-only are NOT proven via a CEL pair — assert no companion CEL exists.
          expect(
            cel,
            `${a.name} has no cre-run proof and must NOT have a .cel companion in ${uc}`,
          ).toBeUndefined();
        }
      }
      // The selected producer example is emitted, with no unexecuted runtime stamp.
      const repr = byName.get("publication-reference.crl")!;
      expect(repr.verification).toEqual(["fhir-emit"]);
      expect(repr.edge).toBe("cpg");
    }
  });

  it("STEP-4 — the `cre-run` tier is SELF-VERIFYING: EVERY cre-run pair is materialized and run through the CRE (disc 408 impl round)", () => {
    // The `cre-run` legend claims each pair "is executed through the CRE every build". The tier↔proof structural
    // test only checks pair TOPOLOGY — a future cre-run pair with both files present but no run test would pass it
    // while the legend silently lies. This closes that gap the way `validate-only` is closed by crlErrors: it
    // DERIVES the run set from the payload, so a cre-run label with an unrunnable/absent CEL FAILS here.
    const kit = getAuthoringKit("local-decision-support", "prior-auth"); // the complete inherited chain
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

  it("artifact edges are CLOSURE-CORRECT: no cpg artifact references ANY prior-auth artifact's library by qualified ref", () => {
    // Post-migration the PA determination exemplars are self-contained (local `<category>.<key>` activities) — no
    // shared library. Generalize the closure guard anyway: derive the LIBRARY name declared by every prior-auth
    // artifact, then assert no cpg artifact quotes any of them — so a FUTURE prior-auth library referenced from a
    // cpg artifact fails here too.
    const kit = getAuthoringKit(undefined, "prior-auth");
    const libNameOf = (src: string): string | undefined =>
      /(?:^|\n)\s*library\s+"([^"]+)"/.exec(src)?.[1];
    const priorAuthLibs = new Set(
      kit.referenceArtifacts
        .filter((a) => a.edge === "prior-auth")
        .map((a) => libNameOf(a.source))
        .filter((n): n is string => !!n),
    );
    expect(priorAuthLibs.has("PA Determination Reference")).toBe(true); // the derivation actually found libs
    const cpgArtifacts = kit.referenceArtifacts.filter((a) => a.edge === "cpg");
    for (const a of cpgArtifacts) {
      for (const lib of priorAuthLibs) {
        // A cpg artifact must not QUOTE a prior-auth library name (a qualified `"Lib"."Activity"` ref would dangle).
        expect(a.source).not.toContain(`"${lib}"`);
      }
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

  it("every invariant clause's `test` RESOLVES within its OWN assembled useCase kit — no dangling anchors (§0 — no fake-green)", () => {
    // Run PER useCase: a prior-auth clause anchors a prior-auth methodologyRequirement, so the check must be
    // done against the SAME assembled kit — else the edge-filtered anchor would dangle (the very orphan the
    // un-fuse's clause[2] relocation avoids).
    let totalInvariantClauses = 0;
    for (const useCase of USE_CASE_NAMES) {
      const kit = getAuthoringKit(undefined, useCase);
      const compositionChecks = new Set(kit.judgeLens.composition.map((c) => c.check));
      const methodologyIds = new Set(kit.verifyLoop.methodologyRequirements.map((m) => m.id));
      for (const rule of kit.rules) {
        for (const clause of rule.clauses ?? []) {
          expect(["validator-enforced", "invariant", "default"]).toContain(clause.force);
          if (clause.force === "invariant") {
            totalInvariantClauses++;
            const ref = clause.test ?? "";
            const comp = /^judgeLens\.composition:(.+)$/.exec(ref);
            const meth = /^verifyLoop:(.+)$/.exec(ref);
            if (comp) expect(compositionChecks.has(comp[1])).toBe(true);
            else if (meth) {
              if (!methodologyIds.has(meth[1])) {
                throw new Error(
                  `invariant clause in rule "${rule.id}" (useCase "${useCase}") anchors "${ref}" but no methodologyRequirement resolves it in that assembled kit`,
                );
              }
            } else {
              throw new Error(
                `invariant clause in rule "${rule.id}" has an unresolvable test anchor: "${ref}"`,
              );
            }
          }
        }
      }
    }
    expect(totalInvariantClauses).toBeGreaterThan(0); // the package is supposed to carry invariant clauses
  });

  it("the cpg base is PA-FREE: no PA rule, no PA methodology, no PA boundary, no PA prose tokens", () => {
    const cpg = getAuthoringKit(undefined, "cpg");
    // No PA rule.
    expect(cpg.rules.find((r) => r.id === "pa-disposition-set")).toBeUndefined();
    expect(cpg.rules.every((r) => r.edge === "cpg")).toBe(true);
    // No PA methodology requirement.
    const methIds = cpg.verifyLoop.methodologyRequirements.map((m) => m.id);
    expect(methIds).not.toContain("communicated-not-ordered");
    expect(methIds).not.toContain("shared-lib-membership");
    expect(methIds).not.toContain("no-pend");
    expect(methIds).not.toContain("mutual-exclusivity-spans-closure");
    // No PA boundary items.
    expect(cpg.boundary.join("\n")).not.toMatch(/Pended|HCR01/);
    // No facets on the base.
    expect(cpg.facets).toBeUndefined();
    // No unambiguous PA prose tokens anywhere in the serialized cpg payload (contentHash is derived — drop it).
    // NB: the generic word "prior-auth" legitimately appears in "CRL is general (…CDS, prior-auth, quality…)"
    // framing prose, so it is NOT a PA-content marker — the shared-lib name + X12/HCR01 codes are.
    const { contentHash: _h, ...payload } = cpg;
    expect(JSON.stringify(payload)).not.toMatch(
      /Medical Policy Determination|Pended|HCR01|X12|communicated-not-ordered|shared-lib-membership|no-pend/,
    );
  });

  it("the `dispositions` rule is UN-FUSED — CPG-base only, NO PA `communicated-not-ordered` invariant", () => {
    const disp = getAuthoringKit(undefined, "cpg").rules.find((r) => r.id === "dispositions")!;
    expect(disp).toBeDefined();
    expect(disp.edge).toBe("cpg");
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
    const paRule = getAuthoringKit(undefined, "prior-auth").rules.find(
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

  it("the 3 advisory facets are RETIRED (became concrete rules); the prior-auth dispositionModel replaces them", () => {
    expect(getAuthoringKit(undefined, "cpg").facets).toBeUndefined();
    expect(getAuthoringKit(undefined, "prior-auth").facets).toBeUndefined();
    // The prior-auth edge now surfaces the framework category model + config contract (customer-agnostic).
    expect(getAuthoringKit(undefined, "cpg").dispositionModel).toBeUndefined();
    const dm = getAuthoringKit(undefined, "prior-auth").dispositionModel!;
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

  it("omitted useCase and explicit cpg return the byte-identical payload + the same contentHash", () => {
    const omitted = getAuthoringKit();
    const explicitCpg = getAuthoringKit(undefined, "cpg");
    const { contentHash: h1, ...p1 } = omitted;
    const { contentHash: h2, ...p2 } = explicitCpg;
    expect(p1).toEqual(p2);
    expect(h1).toBe(h2); // the default-note is out-of-band (MCP description), never a hashed payload delta
  });

  it("each useCase has its OWN distinct, stable contentHash", () => {
    const cpg = getAuthoringKit(undefined, "cpg");
    const priorAuth = getAuthoringKit(undefined, "prior-auth");
    expect(cpg.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(priorAuth.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(cpg.contentHash).not.toBe(priorAuth.contentHash); // different content → different identity
    // Deterministic per useCase.
    expect(getAuthoringKit(undefined, "cpg").contentHash).toBe(cpg.contentHash);
    expect(getAuthoringKit(undefined, "prior-auth").contentHash).toBe(priorAuth.contentHash);
  });

  it("contentHash is a stable, deterministic sha256 over the payload (pinned per useCase)", () => {
    const cpg = getAuthoringKit(undefined, "cpg");
    const priorAuth = getAuthoringKit(undefined, "prior-auth");
    expect(cpg.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // Pinned snapshots — any payload byte change must update these deliberately (KE seats pin them; re-sync on a bump).
    // Re-pinned for the KE decision-composition teaching package (§0–§4, schemaVersion 1.1→1.2): added the
    // `forceModel` (§0 force levels), per-rule `clauses` force breakdowns, the `chaining-necessity` rule, the
    // §1 ladder + §3 asymmetry into `decision-composition`, the delegated-closure mutual-exclusivity into
    // `pa-disposition-set`, the `judgeLens.composition` family (§2/§3 source-fidelity checks), the qualified
    // `use decision` boundary entry (#172), the §4 proof-methodology in verifyLoop, Deny EIU in the shared
    // determination lib, and two new exemplars (B source-delegated, C disposition-arbitration).
    // Re-pinned again (#172 COMPLETE): qualified / cross-library `use decision` now EVALUATES end-to-end (run_decision
    // + validate_cel + provenance + cockpit), so the "NOT yet evaluated" BOUNDARY entry was removed and the proof-status
    // example updated. KE skills pin this hash — re-sync on the bump.
    // Re-pinned (clusterBy kit-proofing, per KE request): the verifyLoop note now names the PROVENANCE/PROMOTION
    // generate mode — generate_provenance clusterBy:"disposition-path" (correspondence-correct by construction) for
    // promotion vs the default "decision" concept-attribution view. The kit was silent on a generate mode before.
    // Re-pinned (chaining-necessity reuse fix): `use decision` now serves source-delegation OR genuine REUSE (the SUR
    // cross-library shared determination IS reuse) — the line is genuinely-shared vs fabricated-shared, not reuse-vs-not.
    // Reworded the chaining-necessity rule/why/clauses + decision-composition rung 3 to match. KE skills pin this hash — re-sync.
    // Re-pinned (interface-concept-naming rule, #180): added the `interface-concept-naming` concept-model rule — name a
    // decision's `when` (interface) concepts askably (the FHIR emit forms the case-feature input prompt as `<name>?`); the
    // case-feature StructureDefinition + PlanDefinition action.input emit is TOP-LAYER directly-asserted only (recursive
    // inferred-condition inputs deferred, #180). KE skills pin this hash — re-sync.
    // Re-pinned (schemaVersion 1.2→1.3, patient-age both-rep carve-out): added the CONCEPT_LAYER_MODEL both-rep entry,
    // the `patient-age-both-rep` rule + its verifyLoop methodology anchor, the concept-form/boundary carve-out wording,
    // the recency-execution `doesNotProve` note, and the `patient-age-both-rep-reference.crl` exemplar.
    // Re-pinned (schemaVersion 1.3→1.4, the `useCase` specialization axis, #191): the payload gained `useCase`+`chain`;
    // every rule/artifact/methodologyRequirement gained an `edge`; the PA/CPG-fused `dispositions` was un-fused (PA prose
    // out, clause[2] `communicated-not-ordered` RELOCATED to pa-disposition-set); PA boundary items + PA artifacts moved
    // to the prior-auth edge; advisory `facets` added on prior-auth. TWO hashes now — cpg (the default) and prior-auth.
    // KE seats pin these — re-sync on the bump.
    // Re-pinned (schemaVersion 1.4→1.5, configurable-PA-leaves T3a): pa-disposition-set rewritten config-driven,
    // configure-dispositions + disposition-mode rules added, verifyLoop shared-lib-membership→configured-membership +
    // no-pend→finality-by-mode, facets retired, prior-auth `dispositionModel` field added. schemaVersion is hashed on
    // BOTH payloads so both pins move. KE seats re-sync on the bump.
    // Todo 4 (same schemaVersion 1.5, prior-auth hash re-pinned): the emit half now CODES the A1/A3 outcome on the
    // determination ActivityDefinition (`reasonCode` + `payload`/`note`), so the "coded-HCR01 outcome is a later
    // stage" boundary is RETIRED and the config `narrative` field dropped from the shape doc. Prior-auth content
    // changed → cpg hash holds, prior-auth hash moves.
    // KE #203 Todo 6 (schemaVersion 1.5→1.6): the `review-flags` rule (cpg/process) + 3 examples were added; BOTH
    // hashes move (schemaVersion is in the hashed base AND the cpg-edge rule/examples inherit into the prior-auth
    // chain). KE seats re-sync both pins on the bump.
    // KE #203 Piece 1 (schemaVersion 1.6→1.7): the `review-flags` rule gained a phase-boundary + preservation clause
    // for the new `category:validation` `@validation-concern`. BOTH hashes move (schemaVersion is hashed + the cpg-edge
    // rule inherits into prior-auth). KE seats re-sync both pins on the bump (the SINGLE re-pin — full working set).
    // KE #207 (schemaVersion 1.7→1.8): the `review-flags` rule gained an EMIT clause documenting Todo 5's shipped
    // status-aware CQL emit (concept→block comment; decision/library→gate-only; resolved→none). BOTH hashes move
    // (schemaVersion is hashed + the cpg-edge rule inherits into prior-auth). Folds into the SAME single KE re-pin.
    // KE #205/#203 (schemaVersion 1.8→1.9): the `review-flags` rule gained a WRITE-TOOLS clause (author via create_flag/
    // set_flag_status). BOTH hashes move.
    // #212 step 4c (schemaVersion 1.9→1.10): review FLAGS left `.crl` for the `.crl/flags/` store — the `review-flags` rule
    // is rewritten to the store model (create_flag WRITES the store, no rewritten source; flags don't emit; the 3 flag
    // examples became `text` tool calls); @gap-filed stays a `.crl` meta tag. BOTH hashes move. KE seats re-sync both pins.
    // #224 re-pin (content-only, schemaVersion unchanged) — SUPERSEDES the prior #219 entry above (which recorded the
    // now-retired disposition-consequence doctrine as current). The `hollowed-criteria` invariant is INVERTED to
    // SEMANTIC-SAMENESS + EMIT-OPACITY: a `defined as`/`sem-*` composite over a policy's DISTINCT criteria is a VIOLATION
    // regardless of shared consequence (it ships ONE opaque `condition[]` and asserts a sameness distinct criteria lack);
    // distinct criteria compose in decision STRUCTURE (compound branch guard / `criterion` / sibling `when` branches).
    // Adds the branch-guards / criterion / guard-or-vs-sibling-or rules + 2 #224 do-examples; re-grounds the
    // disposition-arbitration reference from `sem-not` inference to `first:`-precedence structure (its CEL truth function
    // is FROZEN). Swept across decision-composition, concept-form, the judge-lens, boundary, minimalism, cel-cases,
    // verify-loop, the examples, and BOTH reference artifacts. BOTH hashes move. KE seats re-sync both pins.
    // #224 iii.1 re-pin (content-only) — the per-action-guard `guards` rule + the branch-guards `text`
    // flipped their "action guards NOT YET lowered to FHIR" caveat: `unless`/`only when` now LOWER to a
    // per-item `condition[applicability]` (`unless` → library-qualified null-safe `not Coalesce(...)`).
    // BOTH hashes move (the `guards` rule is a cpg edge inheriting into prior-auth). KE seats re-sync both pins.
    // #224 iii.3 re-pin (content-only) — the `branch-guards` + `criterion` rules flipped their "there is
    // NO branch `not`" claim: branch `not` now lowers to a per-atom `not Coalesce(...)` applicability
    // `condition[]` (closed-world), the emit-capable path a menu-only `unless` cannot express. BOTH
    // hashes move (branch-guards is a cpg edge inheriting into prior-auth). KE seats re-sync both pins.
    // KE #234 (schemaVersion 1.10→1.11): the `decision-composition` invariant was UNFALSIFIABLE (the composite's own
    // NAME supplied "the one fact"). Adds a UNIT ANCHORING invariant clause (nameable WITHOUT the label; co-occurrence
    // tell; mechanical corollary), amends the rule `why` + `hollowed-criteria` guidance/4th checkpoint, REPLACES the
    // `Failed Conservative Therapy` `defined as` EXAMPLE with the guard-`or` `criterion` + adds genuine-rung-1 (viral
    // suppression) + vacuity-trap examples, re-grounds the `criteria-decision-reference` artifact (FCT `defined as` →
    // a named `criterion` gated by an or-guard; truth-identical, CEL cases unchanged), and re-words the `concept-form`
    // rule + conceptLayerModel `defined as` + model prose off the FCT-as-inference gloss. (The co-occurrence tell is
    // stated as SAME-underlying-occurrence vs SEPARATE-events, NOT "mutually exclusive" — a lab result and a chart note
    // of one suppression may coexist yet are one fact.) schemaVersion is bumped (the KE's Step-0 re-sync keys off it —
    // the governing convention). BOTH hashes move (cpg-edge rule/examples/judgeLens inherit into prior-auth; the
    // prior-auth-edge artifact reinforces the PA move). KE seats re-sync both pins.
    // KE #234 FOLLOW-UPS (schemaVersion 1.11→1.12): finding 4 (vacuity-trap example declares its 4 operands → fully
    // validator-clean), finding 2 (the `criteria-decision-reference` artifact regains ONE genuine rung-1 `defined as` —
    // viral suppression = a lab result OR a chart note of one occurrence — as a third nested `when` node; emits + runs,
    // 5 CEL cases), finding 1 (a DNF SIZE clause on `decision-composition` flagging #236 load-bearing). Finding 3
    // resolved: KEEP the schemaVersion-bumps-on-content convention, so this CONTENT change moves schemaVersion. BOTH
    // hashes move (cpg-edge decision-composition clause + examples inherit into prior-auth; the artifact rides the PA edge).
    // #215 (schemaVersion 1.12→1.13): the patient-age both-rep rule/clauses + concept-form carve-out mentions +
    // conceptLayerModel entry + the reference exemplar WIDEN from `at least <N>` to the full comparator set
    // (`at least`/`at most`/`under`/`younger than`); the exemplar gains an `Under Twenty One` (`under 21`) both-rep
    // concept + pediatric decision; the value-type-boolean clause is annotated with #241. BOTH hashes move.
    // #230 (schemaVersion 1.13→1.14): the review-flags rule + examples teach the relocated `medical-validation/flags/` store
    // + a new migration clause (create_flag/set_flag_status refuse a legacy `.crl/flags/` store). BOTH hashes move.
    // #257 (schemaVersion 1.15→1.16): the concept-model redesign makes `value type` REQUIRED on every concept
    // (A.10 — `missing-value-type` is now a validator ERROR); every reference/example concept declares its
    // `value type` (case-feature determinations are `value type is boolean`). BOTH hashes move.
    // #257 (schemaVersion 1.16→1.17): the concept-model PROSE — a new `value-type` rule (published-shape doctrine +
    // ROLE heuristic + the A.10b guard⇒boolean lesson + VALUE-PRESERVING inference to the shipped rule-B checks +
    // NORMATIVE-vs-SHIPPED + the `defined as exists` LANE MATRIX as capability-status); `concept-form` gains
    // `value type is` + the composition formula; a leading conceptLayerModel value-type entry; the stale posrep
    // `form` fixed; the patient-age #241 annotation reconciled with rule-B. Correlated temporal DEFERRED (scope
    // note only). Design round: disc 407. BOTH hashes move (cpg rule/model inherit into prior-auth).
    // #257 (schemaVersion 1.17→1.18): SHAPE + CONTENT — the artifact `verification` taxonomy (`cre-run`/
    // `engine-run`/`validate-only`) + `verificationLegend` payload + the reachable `publication-reference.crl`
    // (validate-only) + boundary proof-vs-authoring-axis cross-refs. Design round: disc 408. BOTH hashes move.
    // #257 age slice (schemaVersion 1.18→1.19): T1 MECHANICAL migration of `patient-age-both-rep-reference.crl`
    // from the retired `definition is age today` carve-out to the Patient age `source representation` +
    // `value projection` recency form (the migrated exemplar inherits into both useCases; schemaVersion is
    // hashed). Deeper kit re-teach is T3 (same pre-release work-set). Design + impl rounds: disc 409. BOTH hashes move.
    // #257 age slice (schemaVersion 1.19→1.20): T3 DEEPER kit re-teach — patient-age reframed as a Patient
    // `source representation` `value projection` (NOT a `definition is` carve-out); the rule renamed
    // `patient-age-projection` + reframed to both shapes; CONCEPT_LAYER_MODEL/concept-form/methodology/boundary/
    // purposes/SUMMARY swept of the retired doctrine (anti-regression payload test added); units widen to
    // `years|months`; the `representation-reference` exemplar + fixture gain a standalone months age concept.
    // Design + impl rounds: disc 411. BOTH hashes move.
    // #257 age slice (schemaVersion 1.20→1.21): T3 impl-panel follow-up (disc 411 impl round) — honesty fixes:
    // catalog-boundary claim NARROWED (only the age-today family is tool-enforced), `coded from`/`value
    // projection` are independent slots, the recency `type is Observation` reworded to effective/implicit, and
    // the `validate-only` legend + representation-reference `purpose` reworded (artifact tier vs construct
    // status). BOTH hashes move again.
    // #271 (schemaVersion 1.21→1.22): teach the project-config `crl.canonicalBase` REQUIREMENT (emitted local
    // CodeSystem url + removed urn fallback) in the verify-loop note. NO payload-shape change. BOTH hashes moved.
    // #189 IMPL 4 (schemaVersion 1.22→1.23): the `value type` requirement is now SHAPE-CONDITIONAL — the shipped
    // validation slice added `- shape is Scalar | Record | RecordSet.` (A.10 relaxation: `missing-value-type` errors
    // only for a Scalar concept; Record/RecordSet take their result type from `type is`). Reworded the global "value
    // type REQUIRED on EVERY concept / A.10 ERROR" claim (a contradiction against the shipped validator) to
    // shape-conditional in `value-type` (rule + enforced clause), `concept-form`, and the CONCEPT_LAYER_MODEL value-type
    // entry; added a MINIMAL `shape is` CONCEPT_LAYER_MODEL entry (scope `out`, validate-only, OUT of Stage-1). The
    // two-arm panel (disc 415) additionally corrected the kit `value-type` composition teaching to the SHIPPED b1068ca
    // rule — the `composition-result-type-mismatch` WARNING (→ error at flip) + `decision-guard-record-shaped`, and the
    // shape-aware `concept = declared shape + …` package-wide model. BOTH hashes move.
    // #189 full-slice sanity follow-up (schemaVersion 1.23→1.24, disc 415 R4): the `code is` entry names the
    // `no-bare-scalar-code` validate-only migration prompt + reconciles it with `definition is` OUT-of-stage; the
    // `value-type` shipped-checks clause narrows `decision-guard-record-shaped` to a TYPED record operand (untyped is
    // silent in N). Paired validator fix exempts the age-recency `value projection` posrep from the false warning. BOTH hashes move.
    // #236 criterion-as-reducer flip (schemaVersion 1.24→1.25, disc 422): the criterion framing is inverted — a
    // `criterion` lowers ONCE to a named boolean CQL define referenced BY IDENTITY (one condition per ref; body once;
    // IS an arm reducer when its body carries an `or`). The faithfulness discriminator was re-grounded across the
    // `decision-composition` + `concept-form` invariants and the `hollowed-criteria`/`dropped-or-added-criterion`
    // judge lenses (action-condition-count → opaque-inference-vs-named-transparent-define); every "each atom visible"
    // prose surface swept to distinguish inline vs named; `criterion-expansion-overflow`/criterion-atom bound retired.
    // CONTENT bump, NO payload-shape change. BOTH hashes move.
    // #189 P2 — `value element is` / `value type` are RETIRED on a source representation. The two `form`
    // strings taught them, so a KE agent reading the kit would author a construct the compiler no longer
    // wants. That is a CORRECTNESS fix, not teaching, so it lands with the slice and re-pins at 1.25 with NO
    // bump — the doctrine re-teach + schemaVersion bump stay BATCHED (`tmp/WORKLIST-kit-deltas.md`).
    expect(cpg.contentHash).toBe(
      "d5640ae00853ae013d6a101bac3181156548dffd446c3604ac87629f94653f6c",
    );
    // #189 null/pause — the priorAuth payload embeds the reference `.cel` artifacts, which gained explicit
    // `value is true/false` facts (a NEGATIVE must now be STATED; omission means UNKNOWN and PAUSES). That is
    // a CORRECTNESS change, not teaching — reverting it fails the CRE proofs — so it lands with the slice
    // while the schemaVersion bump + doctrine re-teach are BATCHED to one final kit pass
    // (`tmp/WORKLIST-kit-deltas.md`, operator 2026-08-27). Hence a re-pin at 1.25 with NO bump.
    // ⚠ The cpg hash is UNCHANGED — that payload does not embed the reference artifacts.
    // ⚠ 1.27 → 1.28: teaches `emit_results` (the kit had never mentioned it) AND gives a version to the
    // reference-artifact correction that had already moved BOTH hashes under a static 1.27. BOTH re-pin, and the
    //   changelog entry that explains the re-sync is the `inline-answer-options` rule itself. A KE pinning
    //   1.25 re-syncs and gets the teaching for the new construct in the same step.
    expect(priorAuth.contentHash).toBe(
      "7e4ca21f79260a282970a64e3bcb40cb35dcb6f4f02934832af2cb12c903675f",
    );
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
  const KIT_PINS: Readonly<Record<string, { cpg: string; priorAuth: string }>> = {
    "1.38": { cpg: "d5640ae00853ae013d6a101bac3181156548dffd446c3604ac87629f94653f6c", priorAuth: "7e4ca21f79260a282970a64e3bcb40cb35dcb6f4f02934832af2cb12c903675f" },
    "1.37": { cpg: "3fde02056d866c24b3cb61a84608fd70cef89d2996f5dffc3d51867af415e30b", priorAuth: "a5f4309604a0e222a9e3dfcfff101dbed4a2075dcace94f84da0e6798d3789f3" },
    "1.36": { cpg: "417b27c9557431cde15b1cf2c7f45f646a3598bb02bfdf559ffd7b260becdcfc", priorAuth: "183f26f2a9ff6f2b82087505f3a63e91e6a034ba3013b003bb71aa2a8a6882e9" },
    "1.35": { cpg: "72cdbf0d7f8db6fa7b3f843d3e82a76f6ca12558c7c560bff2dd3d913fff6c3a", priorAuth: "4d5004b9ff65d7370b83f3b352c7cf5d7662158c0f83cca4a1bb3c460f271423" },
    "1.33": { cpg: "2aadd7985be1f254d3f326ed67f0c84fd5ac39f98e175279aad2bcb498244718", priorAuth: "681b3cf460b26ca415244e0b65211516bfa401ab4728565a71bf6a4c6bba5fe0" },
    "1.34": { cpg: "69ed9b2f29f19ee0b6d85535c4646d3ea537f5d2948aeb066b115c694eb5ca6f", priorAuth: "84e3c1682b150ca663df913862188f5859b8eb461721e12a529f1ca50202e038" },
    "1.31": { cpg: "c0c2bc07da34e315af33fbfae40782396895ae7ff7b074a2951db50b815ee8c0", priorAuth: "fcae7880574b91ffa1fef562cf9878478e3ba36e6a23f49f7d9c1e564ce48342" },
    "1.32": { cpg: "6296a7e64112f3002056f23ce1daa4e4a24024f33f4b0f5cddd6a7a212cebbb1", priorAuth: "21dbed3880bd6d9981b330306297db4e0f22f163d4118185b96483294068a298" },
    "1.30": { cpg: "017e2016ddc9672eac37acca4cf9d48fad4a8a1dcf6784790f61a9130dc09603", priorAuth: "0c94484c277b7624ee9accd56a8b610eb49dffaa5b44b0798497f0108d718b85" },
    "1.29": {
      cpg: "d2e88ac031928abbed94cfa4fe5b5795fa16226d6050ac58e98e7fded91d974d",
      priorAuth: "0bc71aad566638e321a1428df0d72137e0ddbb6e1b04d75918bb2772a3905b39",
    },
  };

  it("⭐ the contentHash cannot move without a schemaVersion bump (hashes are keyed by version)", () => {
    const cpg = getAuthoringKit("local-decision-support", "cpg");
    const priorAuth = getAuthoringKit("local-decision-support", "prior-auth");
    const pinned = KIT_PINS[cpg.schemaVersion];

    expect(
      pinned,
      `schemaVersion ${cpg.schemaVersion} has no pinned hashes. If you changed kit CONTENT, bump ` +
        `SCHEMA_VERSION and add an entry to KIT_PINS — do not re-pin an existing version.`,
    ).toBeDefined();

    expect(cpg.contentHash, `cpg payload moved under schemaVersion ${cpg.schemaVersion}`).toBe(
      pinned.cpg,
    );
    expect(
      priorAuth.contentHash,
      `prior-auth payload moved under schemaVersion ${priorAuth.schemaVersion}`,
    ).toBe(pinned.priorAuth);
    expect(priorAuth.schemaVersion).toBe(cpg.schemaVersion);
  });

  it("the changelog names the current schemaVersion, so a bump cannot ship unexplained", () => {
    // A version with no entry is a hash move a consumer cannot diff — the same defect one step later.
    const src = readFileSync(join(__dirname, "..", "index.ts"), "utf8");
    const version = getAuthoringKit("local-decision-support", "cpg").schemaVersion;
    expect(src, `no changelog entry mentions "${version}"`).toContain(`→ "${version}"`);
  });

  it("SERIALIZED payload teaches the posrep age model with NO residue of the retired `definition is age today` doctrine (#257 T3 sweep guard)", () => {
    // Guards against the T1-era partial state recurring one layer down: a line-list edit is too fragile
    // for a served artifact, so this asserts the ASSEMBLED payload over BOTH useCases. Patterns target
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
    for (const useCase of ["cpg", "prior-auth"] as const) {
      const payload = JSON.stringify(getAuthoringKit(undefined, useCase));
      for (const [re, label] of forbidden) {
        expect(
          re.test(payload),
          `${useCase}: retired doctrine "${label}" must not appear in the served payload`,
        ).toBe(false);
      }
      // POSITIVE — the posrep model + T2 months ARE taught.
      expect(payload, useCase).toContain("value projection");
      expect(payload, useCase).toContain("patient-age-projection"); // the renamed rule id (accurate teaching surface)
      expect(payload, useCase).toContain("AgeInMonths"); // the months compute fn is taught
      const age = getAuthoringKit(undefined, useCase).rules.find(r => r.id === "patient-age-projection")!;
      expect(age.rule).toContain("PROJECTION COVERAGE");
      expect(age.clauses?.some(c => c.force === "invariant" && /age family only/.test(c.text))).toBe(true);
    }
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
    // useCases, since cpg content inherits into prior-auth.
    for (const uc of ["cpg", "prior-auth"] as const) {
      const blob = JSON.stringify(getAuthoringKit("local-decision-support", uc));
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
        expect(blob, `retired doctrine still in ${uc} payload: ${re}`).not.toMatch(re);
      }
    }
  });

  it("keeps source-unit reasoning without recommending legacy sem composition", () => {
 for (const useCase of ["cpg", "prior-auth"] as const) {
   const kit = getAuthoringKit(undefined, useCase);
   const rule = kit.rules.find(r => r.id === "decision-composition")!;
   expect(rule.clauses?.find(c => c.text.startsWith("UNIT ANCHORING"))).toMatchObject({ force: "invariant", test: "judgeLens.composition:hollowed-criteria" });
   expect(rule.rule).toContain("separate independently occurring facts");
   expect(kit.conceptLayerModel.some(m => m.form.includes("defined as"))).toBe(false);
 }
});

  it("teaches value types on admitted publications without Scalar authoring", () => {
 for (const useCase of ["cpg", "prior-auth"] as const) {
   const kit = getAuthoringKit(undefined, useCase);
   const rule = kit.rules.find(r => r.id === "value-type")!;
   expect(rule.rule).toContain("Declare value type explicitly on selected Observation publications");
   expect(rule.rule).toContain("Do not relabel coded or numeric data as boolean");
   expect(rule.clauses?.[0].force).toBe("validator-enforced");
   expect(rule.clauses?.[1].force).toBe("default");
   expect(kit.boundary.join(" ")).toContain("full compiler retirement is unfinished");
 }
});

  it("teaches whole-expression publication guards without a legacy DNF size prescription", () => {
 for (const useCase of ["cpg", "prior-auth"] as const) {
   const rule = getAuthoringKit(undefined, useCase).rules.find(r => r.id === "decision-composition")!;
   const emission = rule.clauses!.find(c => c.text.startsWith("Publication-reachable"))!;
   expect(emission.text).toContain("whole Boolean expression");
   expect(emission.text).toContain("dependency input[]");
   expect(rule.clauses!.some(c => c.text.includes("K×"))).toBe(false);
 }
});

  it("STAGES contains exactly the one Stage-1 slice", () => {
    expect([...STAGES]).toEqual(["local-decision-support"]);
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
    const rule = getAuthoringKit(undefined, "prior-auth").rules.find(
      (r) => r.id === "pa-disposition-set",
    );
    expect(rule).toBeDefined();
    expect(rule!.edge).toBe("prior-auth");
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
    // Sweep the WHOLE serialized payload of BOTH useCases (the PA edge carries the fuller content most at risk of a
    // customer leak), not just rules — the leak this guards (e.g. a verifyLoop/referenceArtifact note) would slip a
    // rules-only check. contentHash is derived, so drop it.
    for (const useCase of USE_CASE_NAMES) {
      const { contentHash: _hash, ...payload } = getAuthoringKit(undefined, useCase);
      expect(JSON.stringify(payload)).not.toMatch(/crl-content|hcsc|iehp|inland empire|bleph/i);
    }
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
