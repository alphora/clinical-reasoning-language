import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseInput } from "../../ast/tests/parseInput";
import { buildCEL } from "../../cel";
import { resolveCelImports } from "../../cel/imports";
import { validateCELFile } from "../../cel/validator";
import { runCel } from "../../cre";
import { activityTypes } from "../../grammar/activityTypes";
import { conceptTypes } from "../../grammar/conceptTypes";
import { conceptValueTypes } from "../../grammar/conceptValueTypes";
import type { DecisionShapeError } from "../../validator/validator";
import { Validator } from "../../validator/validator";

import {
  COMPOSITION_REFERENCE_CEL,
  COMPOSITION_REFERENCE_CRL,
  DECISION_REFERENCE_CEL,
  DECISION_REFERENCE_CRL,
  MEDICAL_POLICY_DETERMINATION_CRL,
  PA_DETERMINATION_REFERENCE_CEL,
  PA_DETERMINATION_REFERENCE_CRL,
} from "../reference";
import { getAuthoringKit, STAGES } from "../index";

function crlErrors(src: string) {
  return new Validator().validate(parseInput(src)).errors;
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
        crl: { canonicalBase: "http://example.org/authoring-kit-reference", status: "draft", experimental: true },
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

  it("medical-policy-determination.crl (shared lib) validates clean (self-contained)", () => {
    expect(crlErrors(MEDICAL_POLICY_DETERMINATION_CRL)).toEqual([]);
  });

  it("composition-reference.crl is shape-clean; only the shared-lib determination refs flag single-file", () => {
    // The determination now lives in the shared "Medical Policy Determination" lib (qualified ref). Single-file
    // (no sibling context) the validator flags the two Approve/Deny refs `external-library-not-included` — no
    // shape/parse errors. With the vendored sibling present it validates fully clean (materialized test below).
    const errs = crlErrors(COMPOSITION_REFERENCE_CRL);
    const ext = errs.filter((e) => e.kind === "external-library-not-included");
    expect(ext.length).toBe(2); // the two shared-lib determination refs (Approve, Deny)
    expect(errs.length).toBe(ext.length); // ...and NOTHING else — no shape/parse error
    expect(ext.every((e) => (e.message ?? "").includes("Medical Policy Determination"))).toBe(true);
  });

  it("composition-reference.cel + .crl: validate clean and the CRE evaluates the composition (real path, shared determination lib)", () => {
    const dir = mkdtempSync(join(tmpdir(), "authoring-kit-comp-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "authoring-kit-composition-reference",
        version: "1.0.0",
        private: true,
        crl: {
          canonicalBase: "http://example.org/authoring-kit-composition-reference",
          status: "draft",
          experimental: true,
        },
      }),
    );
    writeFileSync(join(dir, "composition-reference.crl"), COMPOSITION_REFERENCE_CRL);
    // The determination activities live in the shared lib, resolved as a vendored sibling (no `include`).
    writeFileSync(join(dir, "medical-policy-determination.crl"), MEDICAL_POLICY_DETERMINATION_CRL);
    const celPath = join(dir, "composition-reference.cel");
    writeFileSync(celPath, COMPOSITION_REFERENCE_CEL);

    const v = validateCELFile(celPath);
    expect(v.errors).toEqual([]);

    const run = runCel(resolveCelImports(celPath));
    expect(run.success).toBe(true);
    expect(run.runs.length).toBe(4); // both-met→approve; drop-failed-therapy→deny; drop-diagnosis→deny; otherwise→deny
    expect(run.runs.every((r) => r.status === "pass")).toBe(true);
    // The composite is satisfied via composition (not a direct fact).
    const canary = run.runs.find((r) => r.case.startsWith("both criteria met"))!;
    const node = canary.trace.find((n) => n.concept === "Meets Coverage Criteria")!;
    expect(node.composition?.satisfied).toBe(true);
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
    writeFileSync(join(dir, "medical-policy-determination.crl"), MEDICAL_POLICY_DETERMINATION_CRL);
    const celPath = join(dir, "pa-determination-reference.cel");
    writeFileSync(celPath, PA_DETERMINATION_REFERENCE_CEL);

    const v = validateCELFile(celPath);
    expect(v.errors).toEqual([]);

    const run = runCel(resolveCelImports(celPath));
    expect(run.success).toBe(true);
    expect(run.runs.length).toBe(2); // qualifying diagnosis→approve; otherwise→deny
    expect(run.runs.every((r) => r.status === "pass")).toBe(true);
  });
});

describe("authoring-kit — getAuthoringKit", () => {
  it("returns the local-decision-support kit by default", () => {
    const kit = getAuthoringKit();
    expect(kit.stage).toBe("local-decision-support");
    expect(kit.schemaVersion).toBe("1.1");
    expect(kit.summary).toMatch(/local-decision-support/);
  });

  it("throws on an unknown stage, listing valid stages", () => {
    expect(() => getAuthoringKit("emit")).toThrow(/Unknown authoring stage/);
    expect(() => getAuthoringKit("emit")).toThrow(/local-decision-support/);
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

  it("embeds the reference artifacts inline (decision + composition + shared determination lib + PA)", () => {
    const kit = getAuthoringKit();
    const names = kit.referenceArtifacts.map((a) => a.name).sort();
    expect(names).toEqual([
      "composition-reference.cel",
      "composition-reference.crl",
      "decision-reference.cel",
      "decision-reference.crl",
      "medical-policy-determination.crl",
      "pa-determination-reference.cel",
      "pa-determination-reference.crl",
    ]);
    const src = (n: string) => kit.referenceArtifacts.find((a) => a.name === n)?.source;
    expect(src("decision-reference.crl")).toBe(DECISION_REFERENCE_CRL);
    expect(src("decision-reference.cel")).toBe(DECISION_REFERENCE_CEL);
    expect(src("composition-reference.crl")).toBe(COMPOSITION_REFERENCE_CRL);
    expect(src("composition-reference.cel")).toBe(COMPOSITION_REFERENCE_CEL);
    expect(src("medical-policy-determination.crl")).toBe(MEDICAL_POLICY_DETERMINATION_CRL);
    expect(src("pa-determination-reference.crl")).toBe(PA_DETERMINATION_REFERENCE_CRL);
    expect(src("pa-determination-reference.cel")).toBe(PA_DETERMINATION_REFERENCE_CEL);
  });

  it("conceptLayerModel marks `defined as` composition IN scope; predicates/external OUT", () => {
    const kit = getAuthoringKit();
    const byForm = (frag: string) => kit.conceptLayerModel.find((e) => e.form.includes(frag))!;
    expect(byForm("code is").scope).toBe("in");
    expect(byForm("defined as").scope).toBe("in");
    expect(byForm("definition is").scope).toBe("out");
    expect(byForm("source representation").scope).toBe("out");
  });

  it("verifyLoop is honest about what a green run does and does not prove", () => {
    const kit = getAuthoringKit();
    expect(kit.verifyLoop.doesNotProve).toMatch(/asserted-only|never evaluates `code is`/);
    expect(kit.verifyLoop.note).toMatch(/project root|package\.json/);
  });

  it("contentHash is a stable, deterministic sha256 over the payload", () => {
    const a = getAuthoringKit();
    const b = getAuthoringKit();
    expect(a.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.contentHash).toBe(b.contentHash);
    // Pinned snapshot — any payload byte change must update this deliberately.
    // Re-pinned for the judgeLens addition (schemaVersion 1.0 → 1.1; the new waiver-adjudication rubric).
    expect(a.contentHash).toBe("05600f7cf3ccf2233a02cab41993235b1be784b11a3789190af9ce22d1cdc9a9");
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

  it("the pa-disposition-set rule (#134) states set-equality over the shared Approve/Deny + mutual exclusivity", () => {
    const rule = getAuthoringKit().rules.find((r) => r.id === "pa-disposition-set");
    expect(rule).toBeDefined();
    expect(rule!.rule).toMatch(/"Medical Policy Determination"\."Approve"/);
    expect(rule!.rule).toMatch(/"Medical Policy Determination"\."Deny"/);
    expect(rule!.rule).toMatch(/Pended/);
    expect(rule!.rule).toMatch(/exactly one|XOR|mutually-exclusive/i);
  });
});

describe("authoring-kit — examples are validated (no unverified CRL ships)", () => {
  const wrap = (snippet: string) => `# T\nlibrary "T".\n${snippet}`;

  it("every CRL do-case has no decision-shape errors; every don't-case raises its expected rule", () => {
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
      } else {
        expect(shape.map((e) => e.rule)).toContain(ex.expectRule);
      }
    }
  });
});
