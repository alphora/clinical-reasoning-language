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
  CRITERIA_DECISION_REFERENCE_CEL,
  CRITERIA_DECISION_REFERENCE_CRL,
  DECISION_REFERENCE_CEL,
  DECISION_REFERENCE_CRL,
  DISPOSITION_ARBITRATION_REFERENCE_CEL,
  DISPOSITION_ARBITRATION_REFERENCE_CRL,
  PA_DETERMINATION_REFERENCE_CEL,
  PA_DETERMINATION_REFERENCE_CRL,
  PATIENT_AGE_BOTH_REP_REFERENCE_CRL,
  REPRESENTATION_REFERENCE_CRL,
  SOURCE_DELEGATED_DECISION_REFERENCE_CEL,
  SOURCE_DELEGATED_DECISION_REFERENCE_CRL,
} from "../reference";
import { getAuthoringKit, STAGES, USE_CASE_NAMES } from "../index";
import { fieldRulesOf } from "../../meta/registry";
import { flagFieldRulesOf, validateFlagFields } from "../../flags/flagVocab"; // #212 step 4b: flag field rules live in the vocab now

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
  it("decision-reference.crl validates clean (self-contained)", () => {
    const errors = crlErrors(DECISION_REFERENCE_CRL);
    expect(errors).toEqual([]);
  });

  it("decision-reference.crl exercises the full Stage-1 surface", () => {
    // Guards against an edit silently dropping the very features it demonstrates.
    expect(DECISION_REFERENCE_CRL).toMatch(/^first:/m);
    expect(DECISION_REFERENCE_CRL).toMatch(/- otherwise then/);
    expect(DECISION_REFERENCE_CRL).toMatch(/^\s*any:/m);
    expect(DECISION_REFERENCE_CRL).toMatch(/unless "Contrast Allergy"/);
    expect(DECISION_REFERENCE_CRL).toMatch(/only when "Complex Case"/);
    // At least one always-offered (unguarded) menu item.
    expect(DECISION_REFERENCE_CRL).toMatch(/- recommend activity "Order MRI"\.\n/);
  });

  it("decision-reference.cel + .crl: validate clean and all cases pass the CRE oracle (real path)", () => {
    // Materialize the embedded artifacts into a temp project and drive the REAL
    // resolver/validator/CRE — the same flow a KE agent runs via validate_cel /
    // run_decision. Proves the embedded text, not just that it parses.
    const dir = mkdtempSync(join(tmpdir(), "authoring-kit-ref-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "authoring-kit-reference",
        version: "1.0.0",
        private: true,
        crl: {
          canonicalBase: "http://example.org/authoring-kit-reference",
          status: "draft",
          experimental: true,
        },
      }),
    );
    writeFileSync(join(dir, "decision-reference.crl"), DECISION_REFERENCE_CRL);
    const celPath = join(dir, "decision-reference.cel");
    writeFileSync(celPath, DECISION_REFERENCE_CEL);

    const v = validateCELFile(celPath);
    expect(v.errors).toEqual([]);

    const run = runCel(resolveCelImports(celPath));
    expect(run.success).toBe(true);
    expect(run.runs.length).toBe(4);
    expect(run.runs.every((r) => r.status === "pass")).toBe(true);
  });

  it("buildCEL parses the reference CEL", () => {
    const built = buildCEL(DECISION_REFERENCE_CEL);
    expect(built.success).toBe(true);
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
    expect(PATIENT_AGE_BOTH_REP_REFERENCE_CRL.match(/- value element is Patient\.birthDate\./g) ?? []).toHaveLength(2);
    expect(PATIENT_AGE_BOTH_REP_REFERENCE_CRL).toMatch(
      /when "Patient Under Twenty One Years" then recommend activity "Approve"/,
    );
    // both concepts carry the do-not-persist marker (symmetry — no unsafe asymmetry, panel r1)
    expect(
      PATIENT_AGE_BOTH_REP_REFERENCE_CRL.match(/@business-logic-deferred/g) ?? [],
    ).toHaveLength(2);
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

  it("criteria-decision-reference.crl validates CLEAN self-contained (determinations are now LOCAL activities)", () => {
    // Post-migration the determinations are local `certify.Approve` / `not-certify.Deny` activities declared IN the
    // artifact — no shared-lib qualified ref — so single-file validation is fully clean (no external-library errors).
    expect(crlErrors(CRITERIA_DECISION_REFERENCE_CRL)).toEqual([]);
    expect(CRITERIA_DECISION_REFERENCE_CRL).toMatch(/activity "certify\.Approve":/);
    expect(CRITERIA_DECISION_REFERENCE_CRL).toMatch(/recommend activity "certify\.Approve"/);
  });

  it("criteria-decision-reference.cel + .crl: validates clean; the CRE proves criteria-as-NODES + the criterion or-guard (#168/#234)", () => {
    const dir = mkdtempSync(join(tmpdir(), "authoring-kit-criteria-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "authoring-kit-criteria-decision-reference",
        version: "1.0.0",
        private: true,
        crl: {
          canonicalBase: "http://example.org/authoring-kit-criteria-decision-reference",
          status: "draft",
          experimental: true,
        },
      }),
    );
    writeFileSync(join(dir, "criteria-decision-reference.crl"), CRITERIA_DECISION_REFERENCE_CRL);
    const celPath = join(dir, "criteria-decision-reference.cel");
    writeFileSync(celPath, CRITERIA_DECISION_REFERENCE_CEL);

    const v = validateCELFile(celPath);
    expect(v.errors).toEqual([]);

    const run = runCel(resolveCelImports(celPath));
    expect(run.success).toBe(true);
    expect(run.runs.length).toBe(5); // drug+VL→approve; PT+chart→approve; no-viral→deny (crit-3); no-therapy→deny (crit-2); no-dx→deny (crit-1)
    expect(run.runs.every((r) => r.status === "pass")).toBe(true);
    // "Failed Conservative Therapy" is a `criterion` (failed drug OR failed physical therapy — DISTINCT criteria that
    // can co-occur, #234), NOT a `defined as` composite. Referenced in a `when` it inline-expands to a decision-layer
    // OR-guard: the nested node carries `conditionTrace` (op:"or") and OMITS `concept`/`composition`. The
    // physical-therapy case satisfies it via the PT distinct-criterion operand alone (either distinct criterion does).
    type TNode = {
      concept?: string;
      composition?: unknown;
      conditionTrace?: {
        op: string;
        satisfied: boolean;
        operands: { op: string; satisfied: boolean; concept?: { name: string } }[];
      };
      children?: TNode[];
    };
    const find = (nodes: TNode[], pred: (n: TNode) => boolean): TNode | undefined => {
      for (const n of nodes) {
        if (pred(n)) return n;
        const hit = n.children && find(n.children, pred);
        if (hit) return hit;
      }
      return undefined;
    };
    const canary = run.runs.find((r) => r.case.includes("physical therapy"))!;
    const guard = find(canary.trace as TNode[], (n) => n.conditionTrace?.op === "or")!;
    expect(guard).toBeDefined(); // the criterion inline-expanded into an OR-guard node (not a composite)
    expect(guard.concept).toBeUndefined(); // a compound guard, not a single-concept `when`
    expect(guard.composition).toBeUndefined(); // NOT a `defined as` composite (the retired pre-#224 pattern)
    expect(guard.conditionTrace!.satisfied).toBe(true);
    const operand = (nm: string) =>
      guard.conditionTrace!.operands.find((o) => o.concept?.name === nm)!;
    expect(operand("Failed Drug Therapy").satisfied).toBe(false); // drug absent in this case
    expect(operand("Failed Physical Therapy").satisfied).toBe(true); // PT alone satisfies the distinct-criterion `or`
    // The CONTRAST node (#234 follow-up): "Viral Suppression Documented" is a GENUINE rung-1 `defined as` (one
    // occurrence recorded two ways). Unlike the or-guard above it rides the tree as a single-concept `when` that
    // DOES carry a `composition` (sem-or over the two records) — the artifact's end-to-end proof that the
    // sanctioned `defined as` construct emits + runs. The lab-record approve case satisfies it via the lab arm alone.
    const approveViaLab = run.runs.find((r) => r.case.includes("lab record"))!;
    const definedAs = find(
      approveViaLab.trace as TNode[],
      (n) => n.concept === "Viral Suppression Documented",
    )!;
    expect(definedAs).toBeDefined(); // a single-concept `when` on the `defined as` — KEEPS `concept` (not a compound guard)
    const comp = definedAs.composition as {
      op: string;
      satisfied: boolean;
      operands: { concept: string; satisfied: boolean }[];
    };
    expect(comp).toBeDefined(); // and DOES carry a `composition` — the sem-or inference (mirror of the or-guard's omission)
    expect(comp.op).toBe("sem-or");
    expect(comp.satisfied).toBe(true);
    const rec = (nm: string) => comp.operands.find((o) => o.concept === nm)!;
    expect(rec("Viral Load Below Threshold Lab Result").satisfied).toBe(true); // lab record present
    expect(rec("Viral Suppression Charted By Clinician").satisfied).toBe(false); // chart note absent — either record satisfies the ONE fact
    // The OTHER arm, inspected directly (not just diagonally): the chart-record approve case satisfies the SAME
    // `defined as` via the chart operand with the lab operand FALSE — proving both sem-or arms independently (panel r1).
    const approveViaChart = run.runs.find((r) => r.case.includes("chart record"))!;
    const daChart = find(
      approveViaChart.trace as TNode[],
      (n) => n.concept === "Viral Suppression Documented",
    )!;
    const compChart = daChart.composition as {
      satisfied: boolean;
      operands: { concept: string; satisfied: boolean }[];
    };
    expect(compChart.satisfied).toBe(true);
    const recChart = (nm: string) => compChart.operands.find((o) => o.concept === nm)!;
    expect(recChart("Viral Load Below Threshold Lab Result").satisfied).toBe(false); // lab absent this case
    expect(recChart("Viral Suppression Charted By Clinician").satisfied).toBe(true); // chart alone satisfies the ONE fact
    // And the crit-3 DENY path, pinned in-trace (the CEL `result is` oracle can't distinguish same-`Deny` nodes): the
    // no-viral case has dx + failed drug therapy, so ONLY the `defined as` node can fail — assert it does (panel r1).
    const denyNoViral = run.runs.find((r) => r.case.includes("no documented viral suppression"))!;
    const daDeny = find(
      denyNoViral.trace as TNode[],
      (n) => n.concept === "Viral Suppression Documented",
    )!;
    expect((daDeny.composition as { satisfied: boolean }).satisfied).toBe(false); // both records absent → the ONE fact is unmet → deny
  });

  it("pa-determination-reference.cel + .crl: validate clean and both cases pass via the shared determination lib (real path)", () => {
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
    expect(run.runs.length).toBe(2); // qualifying diagnosis→approve; otherwise→deny
    expect(run.runs.every((r) => r.status === "pass")).toBe(true);
  });

  it("source-delegated-decision-reference (B): 4/4 pass + the delegated PATH bubbles the sub's disposition (§4-req1)", () => {
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
    expect(run.runs.length).toBe(4);
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

  it("disposition-arbitration-reference (C): validates clean + the CRE proves the arbitration 6/6 (incl. both overlap cases)", () => {
    // Exemplar C — disposition-arbitration re-grounded to `first:`-precedence STRUCTURE (#224): sibling `when`
    // branches on full-conjunction compound guards, precedence = branch order. The CRE proves the arbitration
    // 6/6 incl. both overlap oracles; the frozen CEL's exact `result is` per case guards precedence fidelity
    // (a precedence inversion would produce a different disposition and fail). Truth function unchanged from the
    // retired pre-#224 `sem-not` form.
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
    expect(run.runs.length).toBe(6);
    expect(run.runs.every((r) => r.status === "pass")).toBe(true);
    // The two load-bearing overlap cases approve via the OTHER pathway (no overlap-pop) — and Deny EIU is a
    // distinct activity from Deny so `result is` can tell them apart (§4-req1, same-disposition disambiguation).
    const eiu = run.runs.find((r) => r.case.includes("off-indication"))!;
    expect(eiu.produced.map((p) => p.recommendation)).toEqual(["not-certify.EIU"]);
  });
});

describe("authoring-kit — getAuthoringKit", () => {
  it("returns the local-decision-support kit by default", () => {
    const kit = getAuthoringKit();
    expect(kit.stage).toBe("local-decision-support");
    expect(kit.schemaVersion).toBe("1.24");
    expect(kit.summary).toMatch(/local-decision-support/);
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
    for (const t of kit.typeAllowlist.stageRecommended.conceptTypes) {
      expect(conceptTypes).toContain(t);
    }
    for (const t of kit.typeAllowlist.stageRecommended.activityTypes) {
      expect(activityTypes).toContain(t);
    }
  });

  it("the cpg base embeds the PA-free artifacts (pure-CDS decision-reference + patient-age + representation-reference); NO PA artifacts", () => {
    const kit = getAuthoringKit(undefined, "cpg");
    const names = kit.referenceArtifacts.map((a) => a.name).sort();
    expect(names).toEqual([
      "decision-reference.cel",
      "decision-reference.crl",
      "patient-age-both-rep-reference.crl",
      "representation-reference.crl",
    ]);
    // Every cpg artifact is edge-tagged cpg, and (closure) references no PA determination lib.
    for (const a of kit.referenceArtifacts) {
      expect(a.edge).toBe("cpg");
      expect(a.source).not.toMatch(/Medical Policy Determination/);
    }
  });

  it("the prior-auth chain embeds the full 12-artifact set (cpg base + the PA edge, inheritance; shared lib removed)", () => {
    const kit = getAuthoringKit(undefined, "prior-auth");
    const names = kit.referenceArtifacts.map((a) => a.name).sort();
    expect(names).toEqual([
      "criteria-decision-reference.cel",
      "criteria-decision-reference.crl",
      "decision-reference.cel",
      "decision-reference.crl",
      "disposition-arbitration-reference.cel",
      "disposition-arbitration-reference.crl",
      "pa-determination-reference.cel",
      "pa-determination-reference.crl",
      "patient-age-both-rep-reference.crl",
      "representation-reference.crl",
      "source-delegated-decision-reference.cel",
      "source-delegated-decision-reference.crl",
    ]);
    const src = (n: string) => kit.referenceArtifacts.find((a) => a.name === n)?.source;
    expect(src("decision-reference.crl")).toBe(DECISION_REFERENCE_CRL);
    expect(src("decision-reference.cel")).toBe(DECISION_REFERENCE_CEL);
    expect(src("criteria-decision-reference.crl")).toBe(CRITERIA_DECISION_REFERENCE_CRL);
    expect(src("criteria-decision-reference.cel")).toBe(CRITERIA_DECISION_REFERENCE_CEL);
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
    expect(src("representation-reference.crl")).toBe(REPRESENTATION_REFERENCE_CRL);
  });

  it("STEP-4 (kit 1.18) — the `verification` taxonomy is honest, in-payload, and tier↔proof-consistent (disc 408)", () => {
    for (const uc of ["cpg", "prior-auth"] as const) {
      const kit = getAuthoringKit("local-decision-support", uc);
      // (a) EVERY artifact declares exactly one recognized tier.
      const tiers = new Set(["cre-run", "engine-run", "validate-only"]);
      for (const a of kit.referenceArtifacts) {
        expect(tiers.has(a.verification), `${a.name} has an unrecognized tier ${a.verification} in ${uc}`).toBe(
          true,
        );
      }
      // (b) The legend is IN the (hashed) payload — a TS docstring never reaches the MCP consumer. It is EXACTLY
      //     the set of tiers the shipped artifacts use — no duplicate entries (uniqueness), no dangling entry for
      //     an unused tier (coverage both ways = set equality) — each with a non-empty `means` + `doesNotProve`.
      const legendTierList = kit.verificationLegend.map((l) => l.tier);
      const legendTiers = new Set(legendTierList);
      const usedTiers = new Set(kit.referenceArtifacts.map((a) => a.verification));
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
        if (a.verification === "cre-run") {
          if (a.name.endsWith(".crl")) {
            expect(cel, `cre-run ${a.name} must have a .cel companion in ${uc}`).toBeDefined();
            expect(cel!.verification).toBe("cre-run");
          } else {
            expect(crl, `cre-run ${a.name} must have a .crl companion in ${uc}`).toBeDefined();
          }
        } else {
          // engine-run / validate-only are NOT proven via a CEL pair — assert no companion CEL exists.
          expect(cel, `${a.verification} ${a.name} must NOT have a .cel companion in ${uc}`).toBeUndefined();
        }
      }
      // (d) representation-reference is validate-only in BOTH assembled kits (cpg + inherited prior-auth), and its
      //     purpose flags it as a NON-authoring capability preview (proof axis ≠ authoring scope).
      const repr = byName.get("representation-reference.crl")!;
      expect(repr.verification).toBe("validate-only");
      expect(repr.edge).toBe("cpg");
      expect(repr.purpose).toMatch(/validate-only|CAPABILITY PREVIEW/);
      expect(repr.purpose).toMatch(/NOT .*Stage-1|OUT of Stage-1|not .*authoring/i);
      expect(repr.purpose).toMatch(/#257/);
      expect(repr.purpose).toMatch(/#270/);
    }
  });

  it("STEP-4 — representation-reference.crl is BYTE-EQUAL (EOL-normalized) to the rule-B fixture and VALIDATES CLEAN", () => {
    // The const is the shipped copy; the fixture is the canonical source (also the rule-B positive exemplar). An
    // EOL-normalized equality guards drift (win32 CRLF trap: compare LF-normalized, not raw bytes).
    const fixturePath = join(
      __dirname,
      "..",
      "..",
      "tests",
      "fixtures",
      "representation",
      "mammogram-and-bmi.crl",
    );
    const norm = (s: string) => s.replace(/\r\n/g, "\n");
    expect(norm(REPRESENTATION_REFERENCE_CRL)).toBe(norm(readFileSync(fixturePath, "utf8")));
    // validate-only means EXACTLY that: it builds + validates clean (the tier's floor is honored). It does NOT run
    // through the CRE — no CEL companion — so nothing beyond validate is asserted here.
    expect(crlErrors(REPRESENTATION_REFERENCE_CRL)).toEqual([]);
  });

  it("STEP-4 — the `cre-run` tier is SELF-VERIFYING: EVERY cre-run pair is materialized and run through the CRE (disc 408 impl round)", () => {
    // The `cre-run` legend claims each pair "is executed through the CRE every build". The tier↔proof structural
    // test only checks pair TOPOLOGY — a future cre-run pair with both files present but no run test would pass it
    // while the legend silently lies. This closes that gap the way `validate-only` is closed by crlErrors: it
    // DERIVES the run set from the payload, so a cre-run label with an unrunnable/absent CEL FAILS here.
    const kit = getAuthoringKit("local-decision-support", "prior-auth"); // the full 12-artifact chain
    const byName = new Map(kit.referenceArtifacts.map((a) => [a.name, a]));
    const crePairs = kit.referenceArtifacts.filter(
      (a) => a.verification === "cre-run" && a.name.endsWith(".crl"),
    );
    expect(crePairs.length).toBe(5); // the 5 decision exemplars — a mechanical guard so the loop can't silently no-op
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
            canonicalBase: "http://example.org/authoring-kit-crerun",
            status: "draft",
            experimental: true,
          },
        }),
      );
      writeFileSync(join(dir, crl.name), crl.source);
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

  it("conceptLayerModel marks `defined as` inference IN scope; predicates/external OUT", () => {
    const kit = getAuthoringKit();
    const byForm = (frag: string) => kit.conceptLayerModel.find((e) => e.form.includes(frag))!;
    expect(byForm("code is").scope).toBe("in");
    expect(byForm("defined as").scope).toBe("in");
    expect(byForm("definition is").scope).toBe("out");
    expect(byForm("source representation").scope).toBe("out");
    // #168: `defined as` is framed as INFERENCE (one concept), and explicitly disclaims DECISION composition.
    // Assert the disclaimer is PRESENT (catch the class, not one stale phrasing) + the summary doesn't relapse.
    expect(byForm("defined as").meaning).toMatch(/inference/i);
    expect(byForm("defined as").meaning).toMatch(/not.{0,20}composition|never combines distinct/i);
    expect(getAuthoringKit().summary).not.toMatch(/boolean composition|local composition/i);
  });

  it("the exemplar models criteria as nested `when` NODES, not a fused `defined as` composite (#168)", () => {
    // The structural half of #168: a regression that collapsed the two criteria back into one `Criteria Met`
    // composite would still run 4/pass, so assert the SHAPE — criterion-2 is a real `when` NESTED under criterion-1.
    const ast = parseInput(CRITERIA_DECISION_REFERENCE_CRL) as any;
    const decision = ast.statements.find((s: any) => s.type === "Decision");
    expect(decision).toBeDefined();
    const whens = (body: any) =>
      (body?.statements ?? []).filter((s: any) => s.type === "WhenBlock");
    const crit1 = whens(decision.body)[0];
    expect(crit1).toBeDefined(); // criterion-1 is a top-level `when` node
    expect(whens(crit1.body).length).toBeGreaterThanOrEqual(1); // criterion-2 is a NESTED `when` node (not a composite)
  });

  it("the decision-composition rule (#168) teaches: distinct criteria go in the decision TREE, not `defined as`", () => {
    const rule = getAuthoringKit().rules.find((r) => r.id === "decision-composition");
    expect(rule).toBeDefined();
    expect(rule!.rule).toMatch(/nested `when`|decision (STRUCTURE|tree)/i);
    expect(rule!.rule).toMatch(/use decision/);
    expect(rule!.rule).toMatch(/never|not a `defined as`|HIDES/i); // the anti-pattern is called out
    expect(rule!.category).toBe("decision-shape");
  });

  it("verifyLoop is honest about what a green run does and does not prove", () => {
    const kit = getAuthoringKit();
    expect(kit.verifyLoop.doesNotProve).toMatch(/asserted-only|never evaluates `code is`/);
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
    // `engine-run`/`validate-only`) + `verificationLegend` payload + the reachable `representation-reference.crl`
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
    expect(cpg.contentHash).toBe(
      "9dbe4b9e58439a12b22d6f6dd70ae41c09f16fee02a0fb5e5c3bbfa60566e3b3",
    );
    expect(priorAuth.contentHash).toBe(
      "1e6b1f6fd4e61118a34f48795596511e0e91c289c74be20e92a0cc81b95f9e8d",
    );
  });

  it("SERIALIZED payload teaches the posrep age model with NO residue of the retired `definition is age today` doctrine (#257 T3 sweep guard)", () => {
    // Guards against the T1-era partial state recurring one layer down: a line-list edit is too fragile
    // for a served artifact, so this asserts the ASSEMBLED payload over BOTH useCases. Patterns target
    // POSITIVE retired doctrine only — retirement/anchored MENTIONS (e.g. "`definition is age today` is
    // now an author-time + emit error") are legitimately present and must pass.
    const forbidden: [RegExp, string][] = [
      [/unit MUST be [`'"]?years/i, "years-only unit rule"],
      [/months`?\s*\/\s*`?days/i, "`months`/`days` error ordering (T2 sanctioned months)"],
      [/AgeAt\(\) is in (whole )?years/i, "AgeAt()-is-years rationale"],
      // Impl-panel fix (both arms): the old `[^.]{0,60}` stopped at the `.` in `age-code`.` and matched
      // NOTHING against the very form it guards. Use a punctuation-crossing gap; verified green against the
      // current payload (the legit "retired `definition is age today` form" mention is >120 chars from any
      // preceding `code is`).
      [/`code is`[\s\S]{0,120}`definition is age today`/i, "the retired `code is` + `definition is age today` both-rep form"],
      // The retired FRAMING family (the "ONE/SOLE `definition is` exception/carve-out" doctrine) — patterns
      // above miss it. No false-positive surface: surviving "carve-out" hits are non-served comments or the
      // decision-composition "no carve-out"; current age doctrine says "SOLE sanctioned Stage-1 posrep".
      [/the (ONE|SOLE)[^.]{0,40}`?definition is`?[^.]{0,20}(exception|carve-out)/i, "the retired `definition is` exception/carve-out framing"],
    ];
    for (const useCase of ["cpg", "prior-auth"] as const) {
      const payload = JSON.stringify(getAuthoringKit(undefined, useCase));
      for (const [re, label] of forbidden) {
        expect(re.test(payload), `${useCase}: retired doctrine "${label}" must not appear in the served payload`).toBe(false);
      }
      // POSITIVE — the posrep model + T2 months ARE taught.
      expect(payload, useCase).toContain("value projection");
      expect(payload, useCase).toContain("patient-age-projection"); // the renamed rule id (accurate teaching surface)
      expect(payload, useCase).toContain("AgeInMonths"); // the months compute fn is taught
    }
  });

  it("the representation-reference exemplar semantically pins the STANDALONE months age projection (#257 T3 impl-panel — generic prose `.toContain`s don't prove the exemplar survives)", () => {
    // Impl-panel catch (gpt56#6): the mirror-equality + crlErrors tests prove fidelity + grammar, and the
    // payload `.toContain`s above match prose that persists even if this exemplar block is removed/changed.
    // Pin the actual served block: the concept, its standalone shape (no local `code is`), the carrier, and
    // the `under 6 months` projection — so a regression that drops or mutates it goes red HERE.
    const src = REPRESENTATION_REFERENCE_CRL;
    expect(src).toContain('concept "Patient Under Six Months":');
    expect(src).toContain("value projection is age today under 6 months");
    expect(src).toContain("value element is Patient.birthDate");
    // STANDALONE = no local `code is` inside this concept's block (recency requires a `code is` arm).
    const block = src.slice(
      src.indexOf('concept "Patient Under Six Months":'),
      src.length,
    );
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

  it("#234 — the UNIT ANCHORING correction lands in both useCases (invariant clause + judge lens + cpg-visible model prose)", () => {
    for (const uc of ["cpg", "prior-auth"] as const) {
      const kit = getAuthoringKit("local-decision-support", uc);
      // (a) a NEW invariant clause anchored to the resolvable judge lens
      const dc = kit.rules.find((r) => r.id === "decision-composition")!;
      const anchoring = (dc.clauses ?? []).find((c) => /UNIT ANCHORING/.test(c.text));
      expect(anchoring, `UNIT ANCHORING clause missing in ${uc}`).toBeDefined();
      expect(anchoring!.force).toBe("invariant");
      expect(anchoring!.test).toBe("judgeLens.composition:hollowed-criteria");
      expect(anchoring!.text).toMatch(/WITHOUT the composite's own label/i);
      expect(anchoring!.text).toMatch(/guard atom anywhere/i); // the mechanical corollary
      // (b) the judge lens carries the unit-anchoring-first guidance + a 4th checkpoint
      const lens = kit.judgeLens.composition.find((c) => c.check === "hollowed-criteria")!;
      expect(lens.guidance).toMatch(/APPLY UNIT ANCHORING FIRST/);
      expect(lens.checkpoints.some((c) => /without using the composite's label/i.test(c))).toBe(
        true,
      );
      // (c) the co-occurrence tell rode into the cpg-VISIBLE model prose (conceptLayerModel `defined as`), not
      // only the prior-auth-edge-filtered reference artifact (so a cpg consumer still receives the discriminator)
      const definedAs = kit.conceptLayerModel.find((m) => /defined as/.test(m.form))!;
      expect(definedAs.meaning).toMatch(
        /SAME occurrence vs DIFFERENT|records may themselves coexist|SEPARATE underlying events/i,
      );
    }
  });

  it("#234 — the FCT distinct-criteria composite is retired everywhere it was taught", () => {
    const kit = getAuthoringKit("local-decision-support", "prior-auth");
    const ex = kit.examples;
    // the guard-`criterion` replacement (valid), the genuine rung-1 (valid), the vacuity trap (judge-lens invalid)
    const guardCrit = ex.find((e) =>
      /ALTERNATIVES are joined in the DECISION layer/.test(e.title),
    )!;
    expect(guardCrit.valid).toBe(true);
    expect(guardCrit.snippet).toMatch(/criterion "Failed Conservative Therapy"/);
    expect(guardCrit.snippet).not.toMatch(/defined as/);
    const genuine = ex.find((e) => /GENUINE rung-1/.test(e.title))!;
    expect(genuine.valid).toBe(true);
    expect(genuine.snippet).toMatch(/defined as \( "Viral Load/);
    const trap = ex.find((e) => /VACUITY TRAP/.test(e.title))!;
    expect(trap.valid).toBe(false);
    expect(trap.expectRule).toBeUndefined(); // judge-lens-only: validator-clean (the examples harness pins this)
    // finding 4 (kit 1.12): the trap now DECLARES its four operands, so pasting it is fully validator-clean
    // (ZERO errors, not four unresolved-reference warnings) — the judge-lens defect is its ONLY blemish.
    expect(trap.snippet).toMatch(/concept "Life Threatening Cardiovascular Disease":/);
    expect(crlErrors(`# T\nlibrary "T".\n${trap.snippet}`)).toEqual([]);
    // the flagship reference artifact re-grounds the DISTINCT criteria to a named `criterion` gated by an
    // or-guard (no `defined as` fusing them) — while carrying ONE genuine rung-1 `defined as` (viral suppression:
    // one occurrence recorded two ways) as the sanctioned-construct exemplar (finding 2, kit 1.12).
    expect(CRITERIA_DECISION_REFERENCE_CRL).toMatch(/criterion "Failed Conservative Therapy"/);
    expect(CRITERIA_DECISION_REFERENCE_CRL).toMatch(
      /when \( "Failed Drug Therapy" or "Failed Physical Therapy" \)/,
    );
    expect(CRITERIA_DECISION_REFERENCE_CRL).not.toMatch(/concept "Failed Conservative Therapy"/);
    // the distinct criteria are NOT fused by `defined as`; the ONLY surviving `defined as` is the genuine
    // rung-1 viral-suppression pair (one clinical state attested two ways). Panel r1 [important], both arms: a
    // negative regex alone doesn't enforce "only" (a renamed/reordered fusion evades it) — so pin the COUNT to exactly
    // one AND pin that one to the viral pair. Together these make the "only surviving `defined as`" claim true by construction.
    expect(CRITERIA_DECISION_REFERENCE_CRL.match(/- defined as \(/g)).toHaveLength(1);
    expect(CRITERIA_DECISION_REFERENCE_CRL).toMatch(
      /- defined as \( "Viral Load Below Threshold Lab Result" sem-or "Viral Suppression Charted By Clinician" \)/,
    );
    // the `concept-form` rule no longer endorses the drug/PT disjunction as ONE fact
    const conceptForm = kit.rules.find((r) => r.id === "concept-form")!;
    expect(conceptForm.rule).not.toMatch(/failed drug OR (failed )?physical therapy/i);
  });

  it("STEP-3 (kit 1.17) — the `value-type` rule teaches the published-shape doctrine in BOTH useCases, matched DIRECTIONALLY to the SHIPPED validator (disc 407 impl round)", () => {
    for (const uc of ["cpg", "prior-auth"] as const) {
      const kit = getAuthoringKit("local-decision-support", uc);
      const vt = kit.rules.find((r) => r.id === "value-type");
      expect(vt, `value-type rule missing in ${uc}`).toBeDefined();
      // Names the A.10 requirement + the guard⇒boolean check (the two shipped enforcements the doctrine rests on).
      expect(vt!.rule).toMatch(/missing-value-type/);
      expect(vt!.rule).toMatch(/decision-guard-nonboolean/);
      // Published-shape (a SHAPE, not a scalar) + the ROLE heuristic (choose by RESULT, not resource type).
      expect(vt!.rule).toMatch(/PUBLISHED result shape/);
      expect(vt!.rule).toMatch(/CHOOSE BY ROLE/);
      // DIRECTIONAL doctrine assertions — a polarity/scope reversal must FAIL these, not just a deletion.
      // bare-ref alias = FULL equality (not "need not be equal"); only TOP-LEVEL sem-not/exists is boolean.
      expect(vt!.rule).toMatch(/bare-ref alias must EQUAL[\s\S]*?FULL equality/);
      expect(vt!.rule).toMatch(/NON-boolean composition requires every LEAF non-boolean/);
      expect(vt!.rule).toMatch(/TOP-LEVEL `sem-not` \/ `defined as exists` result must be boolean/);
      // The lane matrix in the RIGHT direction: standard CQL emits, BUT run_decision cannot prove it ON-PATH.
      expect(vt!.rule).toMatch(/STANDARD CQL emit lowers it to `exists[\s\S]*?BUT `run_decision` cannot PROVE it/);
      expect(vt!.rule).toMatch(/EVALUATED ON A DECISION PATH/);
      // Honesty hedge — split so a bare "#266" token alone can't satisfy it (the most load-bearing assertion).
      expect(vt!.rule).toMatch(/NORMATIVE vs SHIPPED/);
      expect(vt!.rule).toMatch(/#266/);
      // `defined as exists` is CAPABILITY-STATUS, NOT a usable Stage-1 form (run_decision status:errors, #270).
      expect(vt!.rule).toMatch(/LANE MATRIX/);
      expect(vt!.rule).toMatch(/NOT a usable Stage-1 form/);
      expect(vt!.rule).toMatch(/#270/);
      // CLAUSE FORCES — doctrine must NOT shelter under a `validator-enforced` tag (FORCE_MODEL §0). The
      // value-preserving DOCTRINE + the "don't relabel" guidance are `default`; only the shipped-check list
      // is `validator-enforced`. A regression that re-fuses them (the impl-round finding) fails here.
      const clauses = vt!.clauses ?? [];
      const preserving = clauses.find((c) => /VALUE-PRESERVING inference \(DOCTRINE/.test(c.text));
      const relabel = clauses.find((c) => /Do NOT relabel/.test(c.text));
      const shipped = clauses.find((c) => /SHIPPED rule-B checks/.test(c.text));
      expect(preserving?.force, `value-preserving doctrine clause must be default in ${uc}`).toBe("default");
      expect(relabel?.force, `don't-relabel guidance clause must be default in ${uc}`).toBe("default");
      expect(shipped?.force, `shipped-checks clause must be validator-enforced in ${uc}`).toBe(
        "validator-enforced",
      );
      // concept-form still preserves the Stage-1 producer exclusions (posreps / general `definition is` OUT).
      const cf = kit.rules.find((r) => r.id === "concept-form")!;
      expect(cf.clauses?.[0]?.text).toMatch(/OUT this stage/);
      expect(cf.rule).toMatch(/value type is/);
    }
  });

  it("#234 follow-up (kit 1.12, finding 1) — decision-composition carries the DNF SIZE note flagging #236 load-bearing", () => {
    for (const uc of ["cpg", "prior-auth"] as const) {
      const dc = getAuthoringKit("local-decision-support", uc).rules.find(
        (r) => r.id === "decision-composition",
      )!;
      const size = (dc.clauses ?? []).find(
        (c) => /#236/.test(c.text) && /DISJUNCTIVE NORMAL FORM|DNF/.test(c.text),
      );
      expect(size, `DNF size note missing in ${uc}`).toBeDefined();
      expect(size!.force).toBe("default"); // mechanics/advisory, not an invariant
      expect(size!.text).toMatch(/K×\(S\+1\)|MULTIPLICATIVE/); // the expansion is quantified (K arms, not source-disjunct count)
      expect(size!.text).toMatch(/CARTESIAN/i); // and the and-of-or worst case is named, not just tree-level multiplication
      expect(size!.text).toMatch(/ONE opaque `condition\[\]`/); // contrasted against the bounded `defined as`
      expect(size!.text).toMatch(/51×/); // grounded in #236's MEASURED blow-up on a real policy, not a hypothetical
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
      expect(JSON.stringify(payload)).not.toMatch(/crl-content|hcsc|iehp|inland empire/i);
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

describe("authoring-kit — review-flag + @gap-filed required fields are enforced (backs the review-flags rule)", () => {
  // #212 step 4b: review FLAGS left the `.crl` registry — their field enforcement moved to the flag vocab
  // (`validateFlagFields`), while `@gap-filed` (a NON-flag `.crl` meta tag) stays validator-enforced. The kit's
  // "`@fidelity-defect` needs `; direction`, `@gap-filed` needs `; ref`" claim is backed HERE.
  const conceptWith = (metaLine: string): string =>
    `# T\nlibrary "T".\nconcept "C":\n- type is Observation.\n- meta is \`${metaLine}\`.\n- code is \`c\`.`;

  it("@fidelity-defect WITHOUT `; direction` → validateFlagFields missing-field", () => {
    const r = validateFlagFields({ tag: "fidelity-defect", gist: "over-reached somewhere" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing-field");
  });
  it("@gap-filed WITHOUT `; ref` → meta-missing-field (a NON-flag `.crl` tag, still validator-enforced)", () => {
    expect(
      crlErrors(conceptWith("@gap-filed: eGFR normalization not expressible")).map((e) => e.kind),
    ).toContain("meta-missing-field");
  });
  it("well-formed @fidelity-defect (+ `; direction`) validates; @gap-filed (+ `; ref`) raises NO missing-field error", () => {
    expect(
      validateFlagFields({
        tag: "fidelity-defect",
        gist: "x",
        fields: { direction: "over-reach", ref: "#207" },
      }).ok,
    ).toBe(true);
    expect(crlErrors(conceptWith("@gap-filed: x; ref #180")).map((e) => e.kind)).not.toContain(
      "meta-missing-field",
    );
  });
  it("the taught optional `; ref` is VOCAB-MODELED on ALL FIVE flag tags — proven via the accessor", () => {
    for (const tag of [
      "customer-confirmable",
      "internal-inconsistency",
      "open-fork",
      "fidelity-defect",
      "validation-concern",
    ]) {
      const ref = flagFieldRulesOf(tag).find((r) => r.key === "ref");
      expect(ref).toBeDefined();
      expect(ref?.required).toBe(false);
    }
    // @gap-filed's ref stays REQUIRED in the `.crl` registry (the not-a-flag pointer).
    expect(fieldRulesOf("gap-filed").find((r) => r.key === "ref")?.required).toBe(true);
  });
});

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
