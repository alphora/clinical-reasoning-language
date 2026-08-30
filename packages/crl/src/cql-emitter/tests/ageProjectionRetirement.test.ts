import { describe, expect, it } from "vitest";

import { buildCRL } from "../../index";
import { Validator } from "../../validator/validator";
import {
  AGE_TODAY_OVER_BIRTHDATE,
  isRetiredAgeTodayDefinition,
  recencyOverrideById,
  resolveRecencyProjection,
} from "../../template-match/recencyProjectionOverride";
import { emitCQL } from "../emitCQL";

// #257 (age slice) T1 — the RETIREMENT of `definition is age today` at the EMIT boundary, and the
// registry that keeps validate + emit from drifting on the accepted age form. The author-time half
// of the retirement is covered by validator/tests/agePredicate.test.ts; this file covers the
// emit-boundary half (`emitCQLFromAST` does NOT run the Validator, so a validator-only retirement
// would leave `emitDefinitionIs` still emitting the retired call — gpt56 design-round [critical] #4).

const doc = (concept: string) => `# T\nlibrary "T".\n${concept}`;

const STANDALONE_AGE_TODAY = doc(
  `concept "Adult":\n- value type is boolean.\n- definition is age today at least 18 years.\n`,
);
const CODE_PLUS_AGE_TODAY = doc(
  `concept "Adult":\n- type is Observation.\n- value type is boolean.\n- code is \`adult\`.\n- definition is age today at least 18 years.\n`,
);
const ANCHORED = doc(
  `parameter "Measurement Period":\n- param type is Period.\nconcept "Adult At MP":\n- value type is boolean.\n- definition is age at start of "Measurement Period" at least 18 years.\n`,
);
const POSREP_AGE = (extra = "") =>
  doc(
    `concept "Adult":\n- value type is boolean.\n${extra}- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is date.\n  - value projection is age today at least 18 years.\n`,
  );

describe("age-today retirement — the EMIT boundary (emitCQLFromAST does not run the Validator)", () => {
  it("STANDALONE authored `definition is age today` → emit fails with the migration-pointing error", () => {
    const r = emitCQL(STANDALONE_AGE_TODAY, { libraryName: "T" });
    expect(r.success).toBe(false);
    const retired = (r.errors ?? []).find((e) => e.kind === "emit-age-definition-retired");
    expect(retired).toBeDefined();
    expect(retired!.message).toMatch(/source representation/);
    expect(retired!.message).toMatch(/Patient\.birthDate/);
    // NOT a resolved age call slipping through the generic catalog path.
    expect(r.result ?? "").not.toContain("CRLCommon.AtLeast(CRLCommon.AgeAt(), 18 'years')");
  });

  it("`code is` + authored `definition is age today` → emit fails with the migration-pointing error (single, not a duplicate mixed error)", () => {
    const r = emitCQL(CODE_PLUS_AGE_TODAY, { libraryName: "T" });
    expect(r.success).toBe(false);
    expect((r.errors ?? []).filter((e) => e.kind === "emit-age-definition-retired")).toHaveLength(1);
    // The generic mixed-code-and-definition error is SUPPRESSED for the retired age form.
    expect((r.errors ?? []).some((e) => e.kind === "emit-mixed-code-and-definition")).toBe(false);
  });

  it("anchored `age at start of …` is NOT retired — it stays a concept-level `definition is` and emits", () => {
    const r = emitCQL(ANCHORED, { libraryName: "T" });
    expect((r.errors ?? []).some((e) => e.kind === "emit-age-definition-retired")).toBe(false);
    expect(r.success).toBe(true);
    expect(r.result).toContain(`CRLCommon.AtLeast(CRLCommon.AgeAt(start of "Measurement Period"), 18 'years')`);
  });

  it("the migrated STANDALONE posrep form emits clean (the computed arm), no retirement error", () => {
    // The 2-representation recency case emits in the layered/case-feature lane (covered by
    // lowerLocalCodes.test.ts + fhir-emitter/patient-age.test.ts); here the standalone (no local
    // override) rides the ordinary emitDefinitionIs path in single-file emit.
    const r = emitCQL(POSREP_AGE(), { libraryName: "T" });
    expect(r.success).toBe(true);
    expect((r.errors ?? []).some((e) => e.kind === "emit-age-definition-retired")).toBe(false);
    expect(r.result).toContain("CRLCommon.AtLeast(CRLCommon.AgeAt(), 18 'years')");
  });
});

describe("the synthesized-from-posrep definition is compiler-internal (validation runs on the AUTHORED AST)", () => {
  it("a posrep-age concept's synthesized `definition is age today` is NOT flagged retired", () => {
    // `isRetiredAgeTodayDefinition` is the shared retirement predicate. A concept marked
    // `__synthesizedFromPosrep` (as lowering marks the synthesized twin) must never be flagged, so a
    // re-entrant lower (the layered path re-lowers) cannot spuriously retire its own output.
    const synthetic = {
      type: "Concept" as const,
      name: "Adult",
      valueTypes: [],
      representations: [],
      __synthesizedFromPosrep: true,
      definition: {
        type: "DefinitionIsDefinition" as const,
        body: { type: "NarrativeClause" as const, elements: [], location: LOC },
        location: LOC,
      },
      location: LOC,
    };
    expect(isRetiredAgeTodayDefinition(synthetic)).toBe(false);
  });

  it("the authored posrep-age form VALIDATES clean (the retirement never fires on the projection)", () => {
    const built = buildCRL(POSREP_AGE("- code is `adult`.\n"));
    expect(built.success).toBe(true);
    const v = new Validator().validate(built.result!);
    expect(v.errors.filter((e) => e.kind === "age-predicate-unsupported")).toHaveLength(0);
  });
});

describe("age concept-shape lattice — emit rejects, never a silent stub (shared resolveAgeConcept)", () => {
  it("non-boolean concept `value type` + age projection → emit fails (result-type mismatch)", () => {
    const src = doc(
      `concept "Adult":\n- value type is Quantity.\n- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is date.\n  - value projection is age today at least 18 years.\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(false);
    expect((r.errors ?? []).some((e) => e.kind === "emit-mixed-code-and-definition")).toBe(true);
  });

  it("top-level `definition` + age posrep (no `code is`) → emit fails, the age posrep is NOT silently dropped", () => {
    const src = doc(
      `concept "X":\n- type is Observation.\n- value type is boolean.\n- code is \`x\`.\nconcept "Adult":\n- value type is boolean.\n- defined as "X".\n- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is date.\n  - value projection is age today at least 18 years.\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(false);
    expect((r.errors ?? []).some((e) => e.kind === "emit-mixed-code-and-definition")).toBe(true);
  });

  it("anchored `age at start of` in a projection slot → emit fails (not a datum-local projection)", () => {
    const src = doc(
      `parameter "Measurement Period":\n- param type is Period.\nconcept "Adult":\n- value type is boolean.\n- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is date.\n  - value projection is age at start of "Measurement Period" at least 18 years.\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(false);
    expect((r.errors ?? []).some((e) => e.kind === "emit-age-projection-unsupported")).toBe(true);
  });
});

describe("recency-projection override registry (the single source validate + emit both consult)", () => {
  it("T1 ships exactly the age-today-over-Patient.birthDate override, resolvable by id", () => {
    expect(recencyOverrideById(AGE_TODAY_OVER_BIRTHDATE.id)).toBe(AGE_TODAY_OVER_BIRTHDATE);
    expect(recencyOverrideById("nope")).toBeUndefined();
    expect(AGE_TODAY_OVER_BIRTHDATE).toMatchObject({
      sourceType: "Patient",
      valueElementPath: "Patient.birthDate",
      repValueType: "date",
      recencyTimestamp: "Patient.meta.lastUpdated",
      recencyHelper: "recencyAgeTruths",
    });
    // #257 T2 — the compute fn is NO LONGER on the override (it is a per-unit HOW carried on
    // AgeProjectionArgs / __recencyComputeFn), so a single override serves both years and months.
    expect((AGE_TODAY_OVER_BIRTHDATE as Record<string, unknown>).computeFn).toBeUndefined();
  });

  it("resolveRecencyProjection classifies match / wrong-carrier / unsanctioned / not-age", () => {
    const rep = (proj: string | undefined, over: Partial<Record<string, unknown>> = {}) => {
      const base: Record<string, unknown> = {
        type: "Representation",
        conceptType: "Patient",
        valueTypes: ["date"],
        valueElement: { type: "ValueElement", path: "Patient.birthDate", location: LOC },
        location: LOC,
        ...over,
      };
      if (proj !== undefined) {
        base.valueProjection = {
          type: "ValueProjection",
          body: buildNarrative(proj),
          location: LOC,
        };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return base as any;
    };
    expect(resolveRecencyProjection(rep("age today at least 18 years")).kind).toBe("match");
    expect(resolveRecencyProjection(rep("age today less than 18 years")).kind).toBe(
      "unsanctioned-age-attempt",
    );
    expect(
      resolveRecencyProjection(rep("age today at least 18 years", { conceptType: "Observation" }))
        .kind,
    ).toBe("wrong-carrier");
    // ⭐ The rep's value TYPES no longer affect the carrier match (#189 P2). This used to require exactly
    // `["date"]` and rejected `["date","boolean"]`. A representation declares no value type at all now —
    // the projection knows its own carrier (`Patient.birthDate`, `date`), so there is nothing for the
    // author to state and nothing that can disagree. What is still checked is `type is`, which the
    // projection genuinely cannot supply (the Observation case above).
    expect(
      resolveRecencyProjection(rep("age today at least 18 years", { valueTypes: ["date", "boolean"] }))
        .kind,
    ).toBe("match");
    expect(
      resolveRecencyProjection(rep("age today at least 18 years", { valueTypes: [] })).kind,
    ).toBe("match");
    // #257 T2 — a MONTHS projection matches, and its args carry computeFn AgeInMonths (read off the
    // matched call). A years projection carries AgeAt. An unsanctioned unit (days) still is not a match.
    const monthsRes = resolveRecencyProjection(rep("age today under 6 months"));
    expect(monthsRes.kind).toBe("match");
    if (monthsRes.kind === "match") {
      expect(monthsRes.args.computeFn).toBe("AgeInMonths");
      expect(monthsRes.args.op).toBe("Below");
      expect(monthsRes.args.threshold).toBe("6 'months'");
    }
    const yearsRes = resolveRecencyProjection(rep("age today at least 18 years"));
    if (yearsRes.kind === "match") expect(yearsRes.args.computeFn).toBe("AgeAt");
    expect(resolveRecencyProjection(rep("age today under 6 days")).kind).toBe("unsanctioned-age-attempt");
    // Anchored `age at start of` references a concept → recognized, not a datum-local projection.
    expect(resolveRecencyProjection(rep('age at start of "Measurement Period" at least 18 years')).kind).toBe(
      "anchored-in-projection",
    );
    expect(resolveRecencyProjection(rep("most recent \"Weight\"")).kind).toBe("not-age");
    expect(resolveRecencyProjection(rep(undefined)).kind).toBe("not-age");
  });
});

const LOC = {
  start: { line: 1, column: 0, offset: 0 },
  end: { line: 1, column: 1, offset: 1 },
};

// A NarrativeClause parsed from a `value projection is <proj>` doc, so the registry classifier sees
// a real canonical narrative (not a hand-built element stream).
function buildNarrative(proj: string) {
  const built = buildCRL(
    `# T\nlibrary "T".\nconcept "P":\n- value type is boolean.\n- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is date.\n  - value projection is ${proj}.\n`,
  );
  const concept = built.result?.statements.find((s) => s.type === "Concept");
  if (concept?.type !== "Concept") throw new Error("no concept");
  const body = concept.representations[0]?.valueProjection?.body;
  if (!body) throw new Error("no projection body");
  return body;
}
