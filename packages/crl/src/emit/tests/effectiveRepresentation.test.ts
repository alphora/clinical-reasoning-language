import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { parseInput } from "../../ast/tests/parseInput";
import type { Concept } from "../../ast/types";
import { localCodeSystemUrl } from "../../fhir-emitter/slug";
import {
  deriveEffectiveRepresentations,
  type OwningLibraryMetadata,
  type EffectiveRepresentationDescriptor,
} from "../effectiveRepresentation";

const OWNING: OwningLibraryMetadata = {
  libraryName: "T",
  canonicalBase: "http://example.org/crl/t",
  localDomainId: "t",
};

const concept = (src: string, name: string): Concept => {
  const c = parseInput(src).statements.find((s) => s.type === "Concept" && s.name === name);
  if (!c) throw new Error(`concept "${name}" not found`);
  return c as Concept;
};

/** Derive and assert `derived`, returning the descriptor list. */
const derived = (src: string, name: string): EffectiveRepresentationDescriptor[] => {
  const out = deriveEffectiveRepresentations(concept(src, name), OWNING);
  expect(out.status, JSON.stringify(out)).toBe("derived");
  return out.status === "derived" ? out.descriptors : [];
};

describe("deriveEffectiveRepresentations — local-exact arm", () => {
  it("Condition + exists this → valueless: no datum, recency recordedDate/none", () => {
    const [d, ...rest] = derived(
      `library "T".\nconcept "Cond":\n- type is Condition.\n- value type is boolean.\n- code is \`cond\`.\n- definition is exists this.\n`,
      "Cond",
    );
    expect(rest).toHaveLength(0);
    expect(d.arm).toBe("local-exact");
    if (d.arm !== "local-exact") return;
    expect(d.resourceType).toBe("Condition");
    expect(d.coding).toEqual({ kind: "codeable-concept", field: "code" });
    expect(d.system).toBe(localCodeSystemUrl(OWNING.canonicalBase, OWNING.localDomainId));
    expect(d.code).toBe("cond");
    expect(d.resultType).toEqual({ shape: "Scalar", valueType: "boolean" });
    expect(d.recency).toEqual({ sortExpr: "recordedDate", cast: "none" });
    expect(d.valueElement).toBeUndefined(); // valueless existence — no datum
    expect(d.datumValueType).toBeUndefined();
  });

  it("Observation + boolean + most recent this → value-bearing: valueElement value, datum boolean, recency effective/dateTime", () => {
    const [d] = derived(
      `library "T".\nconcept "Obs":\n- type is Observation.\n- value type is boolean.\n- code is \`obs\`.\n- definition is most recent this.\n`,
      "Obs",
    );
    if (d.arm !== "local-exact") throw new Error("expected local-exact");
    expect(d.resourceType).toBe("Observation");
    expect(d.valueElement).toBe("value");
    expect(d.datumValueType).toBe("boolean");
    expect(d.recency).toEqual({ sortExpr: "effective", cast: "dateTime" });
  });

  it("RecordSet<Condition> → record publisher: no datum, resultType RecordSet<Condition>", () => {
    const [d] = derived(
      `library "T".\nconcept "CondSet":\n- type is Condition.\n- shape is RecordSet.\n- code is \`condset\`.\n`,
      "CondSet",
    );
    if (d.arm !== "local-exact") throw new Error("expected local-exact");
    expect(d.resultType).toEqual({ shape: "RecordSet", resource: "Condition" });
    expect(d.valueElement).toBeUndefined();
    expect(d.datumValueType).toBeUndefined();
  });

  it("Record<Procedure> + most recent this → record selection: resultType Record<Procedure>, no datum", () => {
    const [d] = derived(
      `library "T".\nconcept "LastProc":\n- type is Procedure.\n- shape is Record.\n- code is \`lastproc\`.\n- definition is most recent this.\n`,
      "LastProc",
    );
    if (d.arm !== "local-exact") throw new Error("expected local-exact");
    expect(d.resultType).toEqual({ shape: "Record", resource: "Procedure" });
    expect(d.valueElement).toBeUndefined();
  });

  it("omitted `type is` RecordSet → resourceType Observation + resultType RecordSet<Observation> (NOT <undefined>)", () => {
    const [d] = derived(
      `library "T".\nconcept "AnySet":\n- shape is RecordSet.\n- code is \`anyset\`.\n`,
      "AnySet",
    );
    if (d.arm !== "local-exact") throw new Error("expected local-exact");
    expect(d.resourceType).toBe("Observation");
    expect(d.resultType).toEqual({ shape: "RecordSet", resource: "Observation" });
  });

  it("missing `type is` scalar → implicit Observation (charter §3)", () => {
    const [d] = derived(
      `library "T".\nconcept "Implicit":\n- value type is boolean.\n- code is \`implicit\`.\n- definition is exists this.\n`,
      "Implicit",
    );
    if (d.arm !== "local-exact") throw new Error("expected local-exact");
    expect(d.resourceType).toBe("Observation");
    expect(d.valueElement).toBe("value"); // Observation is value-bearing → value-filtered exists
    expect(d.datumValueType).toBe("boolean");
  });

  it("MedicationRequest → choice-codeable-concept@medication coding (the one non-default T1 strategy)", () => {
    const [d] = derived(
      `library "T".\nconcept "Rx":\n- type is MedicationRequest.\n- value type is boolean.\n- code is \`rx\`.\n- definition is exists this.\n`,
      "Rx",
    );
    if (d.arm !== "local-exact") throw new Error("expected local-exact");
    expect(d.resourceType).toBe("MedicationRequest");
    expect(d.coding).toEqual({ kind: "choice-codeable-concept", field: "medication" });
    expect(d.recency).toEqual({ sortExpr: "authoredOn", cast: "none" });
    expect(d.valueElement).toBeUndefined(); // MedicationRequest is valueless — existence over the natural resource
  });

  it("sibling owning metadata → sibling system URL + owningLibrary identity", () => {
    const sibling: OwningLibraryMetadata = {
      libraryName: "T-sub",
      canonicalBase: OWNING.canonicalBase,
      localDomainId: "t-sub",
    };
    const out = deriveEffectiveRepresentations(
      concept(
        `library "T".\nconcept "Cond":\n- type is Condition.\n- value type is boolean.\n- code is \`cond\`.\n- definition is exists this.\n`,
        "Cond",
      ),
      sibling,
    );
    expect(out.status).toBe("derived");
    if (out.status !== "derived") return;
    const d = out.descriptors[0];
    if (d.arm !== "local-exact") throw new Error("expected local-exact");
    expect(d.system).toBe(localCodeSystemUrl(sibling.canonicalBase, sibling.localDomainId));
    expect(d.system).toContain("t-sub-local");
    expect(d.owningLibrary.libraryName).toBe("T-sub");
  });
});

describe("deriveEffectiveRepresentations — patient-age arms", () => {
  const AGE_POSREP = `- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is date.\n  - value projection is age today at least 18 years.\n`;

  it("standalone age → single uncoded arm off AGE_TODAY_OVER_BIRTHDATE", () => {
    const [d, ...rest] = derived(
      `library "T".\nconcept "Adult":\n- value type is boolean.\n${AGE_POSREP}`,
      "Adult",
    );
    expect(rest).toHaveLength(0);
    expect(d.arm).toBe("uncoded");
    if (d.arm !== "uncoded") return;
    expect(d.resourceType).toBe("Patient");
    expect(d.valueElement).toBe("birthDate");
    expect(d.datumValueType).toBe("date");
    expect(d.resultType).toEqual({ shape: "Scalar", valueType: "boolean" });
    expect(d.recency).toEqual({ sortExpr: "meta.lastUpdated", cast: "none" }); // instant — never `as FHIR.dateTime`
  });

  it("local+age recency → BOTH [local-exact (boolean Observation), uncoded]", () => {
    const ds = derived(
      `library "T".\nconcept "AdultLocal":\n- value type is boolean.\n- code is \`adult-local\`.\n${AGE_POSREP}`,
      "AdultLocal",
    );
    expect(ds).toHaveLength(2);
    const [local, uncoded] = ds;
    expect(local.arm).toBe("local-exact");
    if (local.arm === "local-exact") {
      expect(local.resourceType).toBe("Observation");
      expect(local.valueElement).toBe("value");
      expect(local.datumValueType).toBe("boolean");
      expect(local.recency).toEqual({ sortExpr: "effective", cast: "dateTime" });
      expect(local.resultType).toEqual({ shape: "Scalar", valueType: "boolean" });
    }
    expect(uncoded.arm).toBe("uncoded");
  });
});

describe("deriveEffectiveRepresentations — source arms, deferral, pure-derived", () => {
  const SOURCE_REP = `- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is Quantity.\n`;

  it("code is + non-age source rep → [local-exact] with a visible deferred source arm (§6)", () => {
    const out = deriveEffectiveRepresentations(
      concept(
        `library "T".\nconcept "Diab":\n- type is Condition.\n- value type is boolean.\n- code is \`diab\`.\n- definition is exists this.\n${SOURCE_REP}`,
        "Diab",
      ),
      OWNING,
    );
    expect(out.status).toBe("derived");
    if (out.status !== "derived") return;
    expect(out.descriptors).toHaveLength(1);
    expect(out.descriptors[0].arm).toBe("local-exact");
    expect(out.deferredArms).toEqual([
      { kind: "source", detail: expect.stringContaining("deferred") },
    ]);
  });

  it("source-only non-age → deferred{sourced} (NOT derived{[]})", () => {
    const out = deriveEffectiveRepresentations(
      concept(
        `library "T".\nconcept "ExtLab":\n- value type is Quantity.\n${SOURCE_REP}`,
        "ExtLab",
      ),
      OWNING,
    );
    expect(out).toEqual({ status: "deferred", reason: "sourced" });
  });

  it("concept-level `coded from` (external base, no code) → deferred{sourced} (NOT derived{[]})", () => {
    const out = deriveEffectiveRepresentations(
      concept(
        `library "T".\nconcept "External":\n- type is Condition.\n- value type is CodeableConcept.\n- coded from "VS".\n`,
        "External",
      ),
      OWNING,
    );
    expect(out).toEqual({ status: "deferred", reason: "sourced" });
  });

  it("pure `defined as` (no code, no reps) → derived{[]} (legitimately no local instances)", () => {
    const src =
      `library "T".\nconcept "A":\n- type is Condition.\n- value type is boolean.\n- code is \`a\`.\n- definition is exists this.\n` +
      `concept "B":\n- type is Condition.\n- value type is boolean.\n- code is \`b\`.\n- definition is exists this.\n` +
      `concept "Either":\n- value type is boolean.\n- defined as ( "A" sem-or "B" ).\n`;
    const out = deriveEffectiveRepresentations(concept(src, "Either"), OWNING);
    expect(out).toEqual({ status: "derived", descriptors: [] });
  });
});

describe("deriveEffectiveRepresentations — fail-closed errors", () => {
  it("unsupported resourceType → error{unsupported-resource}", () => {
    const out = deriveEffectiveRepresentations(
      concept(
        `library "T".\nconcept "Enc":\n- type is Encounter.\n- value type is boolean.\n- code is \`enc\`.\n- definition is exists this.\n`,
        "Enc",
      ),
      OWNING,
    );
    expect(out.status).toBe("error");
    if (out.status === "error") expect(out.error.kind).toBe("unsupported-resource");
  });

  it("empty owning-library field → error{invalid-owning-library-metadata}", () => {
    const c = concept(
      `library "T".\nconcept "Cond":\n- type is Condition.\n- value type is boolean.\n- code is \`cond\`.\n- definition is exists this.\n`,
      "Cond",
    );
    const out = deriveEffectiveRepresentations(c, { ...OWNING, canonicalBase: "  " });
    expect(out.status).toBe("error");
    if (out.status === "error") {
      expect(out.error.kind).toBe("invalid-owning-library-metadata");
      expect(out.error.field).toBe("canonicalBase");
    }
  });

  it("bare `valueTypes:[]` Scalar → error{indeterminate-result-type} (defensive; A.10 rejects at validation)", () => {
    const out = deriveEffectiveRepresentations(
      concept(
        `library "T".\nconcept "Bare":\n- type is Observation.\n- code is \`bare\`.\n`,
        "Bare",
      ),
      OWNING,
    );
    expect(out.status).toBe("error");
    if (out.status === "error") expect(out.error.kind).toBe("indeterminate-result-type");
  });

  it('named-target reduction on a local arm (`exists "X"`) → error{unsupported-reduction-form} (reduces another concept, not own records)', () => {
    const src =
      `library "T".\nconcept "OtherSet":\n- type is Condition.\n- shape is RecordSet.\n- code is \`other\`.\n` +
      `concept "C":\n- type is Observation.\n- value type is boolean.\n- code is \`c\`.\n- definition is exists "OtherSet".\n`;
    const out = deriveEffectiveRepresentations(concept(src, "C"), OWNING);
    expect(out.status).toBe("error");
    if (out.status === "error") expect(out.error.kind).toBe("unsupported-reduction-form");
  });

  it("non-boolean `exists this` (Condition + Quantity) → error{unsupported-reduction-form} (exists produces boolean; no manufacturing)", () => {
    const out = deriveEffectiveRepresentations(
      concept(
        `library "T".\nconcept "C2":\n- type is Condition.\n- value type is Quantity.\n- code is \`c2\`.\n- definition is exists this.\n`,
        "C2",
      ),
      OWNING,
    );
    expect(out.status).toBe("error");
    if (out.status === "error") expect(out.error.kind).toBe("unsupported-reduction-form");
  });

  it("RecordSet + a reduction (`exists this`) → error{unsupported-reduction-form} (a reduction collapses a RecordSet)", () => {
    const out = deriveEffectiveRepresentations(
      concept(
        `library "T".\nconcept "Bad":\n- type is Condition.\n- shape is RecordSet.\n- value type is boolean.\n- code is \`bad\`.\n- definition is exists this.\n`,
        "Bad",
      ),
      OWNING,
    );
    expect(out.status).toBe("error");
    if (out.status === "error") expect(out.error.kind).toBe("unsupported-reduction-form");
  });

  it("Record without a selecting `most recent this` → error{unsupported-reduction-form}", () => {
    const out = deriveEffectiveRepresentations(
      concept(
        `library "T".\nconcept "Rec":\n- type is Procedure.\n- shape is Record.\n- code is \`rec\`.\n`,
        "Rec",
      ),
      OWNING,
    );
    expect(out.status).toBe("error");
    if (out.status === "error") expect(out.error.kind).toBe("unsupported-reduction-form");
  });

  it("`count this` with an authored value element → error{value-element-unmappable} (count reads no value; no silent drop)", () => {
    const out = deriveEffectiveRepresentations(
      concept(
        `library "T".\nconcept "Cnt":\n- type is Observation.\n- value type is boolean.\n- code is \`cnt\`.\n- value element is Observation.value.\n- definition is count this at least 2.\n`,
        "Cnt",
      ),
      OWNING,
    );
    expect(out.status).toBe("error");
    if (out.status === "error") expect(out.error.kind).toBe("value-element-unmappable");
  });
});

describe("T1 inertness — allowlist import boundary", () => {
  it("no production module OUTSIDE src/emit/ imports effectiveRepresentation (only tests do)", () => {
    const srcRoot = join(__dirname, "..", ".."); // packages/crl/src
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "emit" && dir === srcRoot) continue; // the module's own home is allowed
          if (entry.name === "tests" || entry.name === "generated" || entry.name === "node_modules")
            continue;
          walk(p);
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
          // Both modules are INERT in T1 — a partial early wiring of the registry ALONE (which carries the
          // cross-todo cast contract) is exactly the hazard this boundary guards (panel).
          const text = readFileSync(p, "utf8");
          if (text.includes("effectiveRepresentation") || text.includes("resourceEmitRegistry"))
            offenders.push(p.slice(srcRoot.length + 1));
        }
      }
    };
    walk(srcRoot);
    expect(
      offenders,
      `effectiveRepresentation is INERT — no production importer expected, found: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
