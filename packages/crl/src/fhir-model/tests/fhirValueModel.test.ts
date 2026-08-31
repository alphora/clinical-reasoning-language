import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { RESOURCE_EMIT_REGISTRY } from "../../emit/resourceEmitRegistry";
import { conceptValueTypes, type ConceptValueType } from "../../grammar/conceptValueTypes";
import { AGE_TODAY_OVER_BIRTHDATE } from "../../template-match/recencyProjectionOverride";
import { relativeElementPath } from "../elementPath";
import {
  valueReadValueTypes,
  valueReadElementsAdmitting,
  OBSERVATION_VALUE_X_EXCLUDED,
  MODELED_RESOURCE_TYPES,
} from "../fhirValueModel";

// T3a — the FHIR value-read model. Pins the R4 4.0.1 admitted sets, the ∅-vs-`undefined` return contract, the
// exhaustiveness/complement guard against grammar-growth drift, and the two coherence pins.

describe("valueReadValueTypes — Observation.value[x] admitted variants (R4 4.0.1)", () => {
  const OBS = [
    "boolean",
    "CodeableConcept",
    "dateTime",
    "integer",
    "Period",
    "Quantity",
    "Range",
    "Ratio",
    "SampledData",
    "string",
    "time",
  ] as const;

  it("admits exactly the 11 R4 Observation.value[x] variants", () => {
    const s = valueReadValueTypes("Observation", "value");
    expect(s).toBeDefined();
    expect([...s!].sort()).toEqual([...OBS].sort());
  });

  for (const t of OBS) {
    it(`admits ${t}`, () => {
      expect(valueReadValueTypes("Observation", "value")!.has(t as ConceptValueType)).toBe(true);
    });
  }

  it("does NOT admit date or Attachment (the T2 spelling/legality-seam cells, now DECIDED here)", () => {
    const s = valueReadValueTypes("Observation", "value")!;
    expect(s.has("date" as ConceptValueType)).toBe(false);
    expect(s.has("Attachment" as ConceptValueType)).toBe(false);
  });
});

describe("valueReadValueTypes — exhaustiveness over the grammar value-type set (fail-LOUD on drift)", () => {
  // The admitted set is enumerated explicitly, NOT `conceptValueTypes` minus two. These two tests make a new
  // grammar value type BREAK loudly (forcing a conscious R4-legality decision) rather than silently admitting.
  it("every admitted + excluded name is a real concept value type (no typos/renames)", () => {
    const obs = valueReadValueTypes("Observation", "value")!;
    for (const t of obs) expect(conceptValueTypes).toContain(t);
    for (const t of OBSERVATION_VALUE_X_EXCLUDED) expect(conceptValueTypes).toContain(t);
  });

  it("admitted ∪ excluded partitions the WHOLE grammar value-type set (complement pin)", () => {
    const obs = valueReadValueTypes("Observation", "value")!;
    const excluded = new Set<string>(OBSERVATION_VALUE_X_EXCLUDED);
    const complement = conceptValueTypes.filter((t) => !obs.has(t as ConceptValueType));
    // Every non-admitted grammar type must be a DELIBERATE exclusion — if a new type appears here, this fails.
    expect([...complement].sort()).toEqual([...excluded].sort());
  });
});

describe("valueReadValueTypes — ∅ (modeled valueless) vs `undefined` (unmodeled)", () => {
  for (const r of ["Condition", "Procedure", "ServiceRequest", "MedicationRequest"]) {
    it(`${r}.value → ∅ (modeled, positively valueless — NOT undefined)`, () => {
      const s = valueReadValueTypes(r, "value");
      expect(s).toBeDefined();
      expect(s!.size).toBe(0);
    });
  }

  it("Patient.birthDate → { date } (the uncoded age arm's value-read)", () => {
    const s = valueReadValueTypes("Patient", "birthDate");
    expect(s).toBeDefined();
    expect([...s!]).toEqual(["date"]);
  });

  it("ServiceRequest.code → { CodeableConcept } (#189 B1 — the SOURCE datum read), while .value stays ∅", () => {
    // The one modeled element that doubles as a coding element: for a SOURCE rep the external request's `code`
    // IS the datum. `.value` remains ∅ (the standard carrier is valueless) — the two coexist per the element-level
    // ∅ contract. (The local-arm identity-coding conflation is guarded in the deriver, not this model.)
    const code = valueReadValueTypes("ServiceRequest", "code");
    expect(code).toBeDefined();
    expect([...code!]).toEqual(["CodeableConcept"]);
    expect(valueReadValueTypes("ServiceRequest", "value")!.size).toBe(0); // ∅ unchanged
    expect(valueReadValueTypes("ServiceRequest", "status")).toBeUndefined(); // only `code` is modeled, not status
  });

  it("an unmodeled RESOURCE → undefined (no knowledge; never asserts `absent`)", () => {
    // ⚠ Encounter used to be an example of an UNMODELED resource. It is modeled now (its `type` is a
    // readable visit code), so the examples must be genuinely unmodeled ones.
    expect(valueReadValueTypes("Immunization", "value")).toBeUndefined();
    expect(valueReadValueTypes("DiagnosticReport", "value")).toBeUndefined();
  });

  it("an unmodeled ELEMENT on a modeled resource → undefined (real R4 element, just not value-read knowledge)", () => {
    expect(valueReadValueTypes("Observation", "interpretation")).toBeUndefined();
    expect(valueReadValueTypes("Condition", "recordedDate")).toBeUndefined(); // recency, not value-read
  });

  it("a dotted/qualified key → undefined (keys are RELATIVE base names, not `Resource.element`)", () => {
    expect(valueReadValueTypes("Observation", "Observation.value")).toBeUndefined();
    expect(valueReadValueTypes("Observation", "value[x]")).toBeUndefined();
  });

  it("Patient.value → undefined, NOT ∅ (deliberate: Patient routes through the age-catalog lane, not `value`)", () => {
    // The one resource in both categories: modeled (birthDate) yet no standard value carrier. Left `undefined`
    // by design (see the module SCOPE note) so a KE-unauthored `Patient.value` is not asserted valueless.
    expect(valueReadValueTypes("Patient", "value")).toBeUndefined();
  });

  it("a prototype-member name → undefined (own-property guarded, not a masquerading row)", () => {
    expect(valueReadValueTypes("toString", "value")).toBeUndefined();
    expect(valueReadValueTypes("Observation", "constructor")).toBeUndefined();
  });
});

describe("valueReadValueTypes — coherence pins", () => {
  it("TRANSITIONAL: RESOURCE_EMIT_REGISTRY.valueless ↔ ∅ for the `value` carrier", () => {
    // T1's `valueless` flag and this model must agree on which subset resources are value-bearing. Marked
    // TRANSITIONAL: once ∅ semantics land, `valueless` is a cache of a fact THIS model owns — the flip (which
    // already restructures T1's consumers) may collapse to deriving `valueless` from here (emit importing a
    // lane-neutral leaf is the permitted direction). Not collapsed now — the cross-check is the inert-precursor
    // right-sized choice.
    // Only case-feature rows (`caseFeature: true`) are value-read resources this model must cover. ⚠ That is a
    // scope statement about ESTABLISHED cells, not a category of resource — the flag defaults to `true` and
    // `false` records that we have not established something yet (see `caseFeature`'s docstring). Encounter was
    // the standing example of the `false` side and is now `true`; no live row is on the other side.
    for (const [resourceType, row] of Object.entries(RESOURCE_EMIT_REGISTRY)) {
      if (!row.caseFeature) continue;
      const s = valueReadValueTypes(resourceType, "value");
      expect(s, `${resourceType} must be modeled by the value-read model`).toBeDefined();
      expect(row.valueless, `${resourceType}: valueless flag must match ∅`).toBe(s!.size === 0);
    }
  });

  it("Patient.birthDate row agrees with the age catalog on ALL THREE axes (derived, not double-entry)", () => {
    // Ties resource type, normalized path, AND datum type to AGE_TODAY_OVER_BIRTHDATE via the shared normalizer,
    // and requires an EXACT singleton (birthDate admits only `date`) — so a drift of any catalog axis is caught,
    // not just the value-element literal.
    const o = AGE_TODAY_OVER_BIRTHDATE;
    const key = relativeElementPath(o.valueElementPath, o.sourceType);
    const s = valueReadValueTypes(o.sourceType, key);
    expect(s, `${o.sourceType}.${key} must be modeled`).toBeDefined();
    expect([...s!]).toEqual([o.repValueType]);
  });

  it("the model's keyset is EXACTLY the emit-registry resources ∪ {Patient} (model→registry, both directions)", () => {
    // Registry→model is pinned by the valueless↔∅ loop above (a new registry row forces a model row). This pins
    // the OTHER direction: a stray model row would silently widen the stated scope.
    //
    // Scope = the case-feature registry rows ∪ {Patient}. ⚠ The old note here read "CEL-writer-only rows are
    // excluded — they carry no value-read element and are never a case-feature", using Encounter as the
    // example. Both halves were false of Encounter: `type` IS its value-read element, and it IS a case feature.
    // A CEL-written resource CAN be a case feature; it simply does not have to be.
    const expected = [
      ...Object.entries(RESOURCE_EMIT_REGISTRY)
        .filter(([, row]) => row.caseFeature)
        .map(([rt]) => rt),
      "Patient",
    ].sort();
    expect([...MODELED_RESOURCE_TYPES].sort()).toEqual(expected);
  });
});

describe("T3a wiring boundary — allowlisted importers of fhirValueModel", () => {
  it("outside src/fhir-model/, only the T4 migration inventory + the §4.1 T1 deriver import fhirValueModel", () => {
    // T3a is a LANE-NEUTRAL query with two legitimate production consumers: T4's migration inventory
    // (`migration/migrationInventory.ts`, pre-existing) and — as of #189 §4.1 — the T1 deriver
    // (`emit/effectiveRepresentation.ts`). This boundary asserts EXACTLY those two: match an actual IMPORT
    // (not a comment mention — the old substring scan false-positived on migration/*.ts docstrings), and
    // flag anything else outside src/fhir-model/.
    const srcRoot = join(__dirname, "..", ".."); // packages/crl/src
    const IMPORT_RE = /from\s+["'][^"']*\/fhirValueModel["']/;
    // ⭐ #189 — a THIRD consumer, added deliberately: `emit/recordBooleanGuard.ts` proves the boolean
    // CARRIER on a `shape is Record` + `value type is boolean` guard source, which is the same category of
    // question the T1 deriver asks (resolve a carrier from the model, fail closed when it is unmodeled or
    // ambiguous) and must consult the SAME authority or the two can disagree about what a resource carries.
    //
    // ⚠ THE ALTERNATIVE WAS CONSIDERED AND REJECTED, and a panel arm argued for it: thread the carrier
    // through the descriptor instead. That would make a Record descriptor carry datum metadata it
    // deliberately does NOT carry — the record SELECTION reads no value, and the emit asserts exactly that
    // (`desc.valueElement === undefined`). Weakening a clear invariant to avoid naming a consumer is the
    // worse trade. This boundary exists to keep the consumers FEW and DELIBERATE, not zero.
    const ALLOW = new Set([
      "emit/effectiveRepresentation.ts",
      "emit/recordBooleanGuard.ts",
      "migration/migrationInventory.ts",
    ]);
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "fhir-model" && dir === srcRoot) continue; // the module's own home is allowed
          if (entry.name === "tests" || entry.name === "generated" || entry.name === "node_modules")
            continue;
          walk(p);
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
          const rel = p.slice(srcRoot.length + 1).replace(/\\/g, "/");
          if (IMPORT_RE.test(readFileSync(p, "utf8")) && !ALLOW.has(rel)) offenders.push(rel);
        }
      }
    };
    walk(srcRoot);
    expect(
      offenders,
      `unexpected fhirValueModel importers (outside src/fhir-model/ + the §4.1 allowlist): ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("no barrel `index.ts` in src/fhir-model/ (a re-export would let a consumer import fhirValueModel via the dir, escaping the grep)", () => {
    const dir = join(__dirname, ".."); // packages/crl/src/fhir-model
    expect(existsSync(join(dir, "index.ts"))).toBe(false);
    expect(existsSync(join(dir, "index.tsx"))).toBe(false);
  });
});

describe("#189 P2 — the SOURCE carrier lookup (`valueReadElementsAdmitting`)", () => {
  /**
   * ⭐ The whole carrier table, pinned per (resource, value type).
   *
   * With `value element is` retired on a representation, a source arm no longer receives its element from
   * the author — it LOOKS ONE UP by asking which modeled element admits the concept's value type. So this
   * table IS the contract: adding a resource, or a readable element on one, must be a VISIBLE edit here,
   * because charter §3 rules that an unruled carrier is UNMODELED and is never guessed.
   */
  it("pins the complete readable-carrier set", () => {
    const table: Record<string, string[]> = {};
    for (const resourceType of [...Object.keys(RESOURCE_EMIT_REGISTRY), "Patient"]) {
      const hits: string[] = [];
      for (const valueType of conceptValueTypes) {
        const admitting = valueReadElementsAdmitting(resourceType, valueType);
        if (admitting.length > 0) hits.push(`${valueType}->${admitting.join("|")}`);
      }
      table[resourceType] = hits;
    }
    expect(table).toEqual({
      // every R4 `Observation.value[x]` variant lands on the one carrier
      Observation: conceptValueTypes
        .filter((t) => !OBSERVATION_VALUE_X_EXCLUDED.includes(t))
        .map((t) => `${t}->value`),
      // ⭐ TWO readable elements, admitting DISJOINT types — they answer different questions
      // ("which condition" vs "when did it start"), so the lookup never has a choice to make.
      Condition: ["CodeableConcept->code", "dateTime->onset"],
      Procedure: ["CodeableConcept->code"],
      ServiceRequest: ["CodeableConcept->code"],
      MedicationRequest: ["CodeableConcept->medication"],
        // ⭐ Encounter is a case-feature row now; `type` is its readable visit code.
      Encounter: ["CodeableConcept->type"],
      Patient: ["date->birthDate"],
    });
  });

  it("⚠ `date` is NOT admitted anywhere a dateTime carrier exists — R4 has no `valueDate`/`onsetDate`", () => {
    // The same FHIR fact that excludes `date` from `Observation.value[x]` excludes it from
    // `Condition.onset[x]` (`dateTime|Age|Period|Range|string`). `Patient.birthDate` is a genuine `date`
    // element, which is why it is the one place `date` resolves.
    expect(OBSERVATION_VALUE_X_EXCLUDED).toContain("date");
    expect(valueReadElementsAdmitting("Observation", "date")).toEqual([]);
    expect(valueReadElementsAdmitting("Condition", "date")).toEqual([]);
    expect(valueReadElementsAdmitting("Condition", "dateTime")).toEqual(["onset"]);
    expect(valueReadElementsAdmitting("Patient", "date")).toEqual(["birthDate"]);
  });

  it("⚠ a boolean concept resolves NO carrier on a valueless resource — its truth is EXISTENCE", () => {
    // Ruling `code`/`onset` readable does NOT make existence obsolete: `boolean` is admitted by neither, so
    // a boolean Condition/Procedure concept still reads `exists`. That is the whole corpus today.
    for (const rt of ["Condition", "Procedure", "ServiceRequest", "MedicationRequest"]) {
      expect(valueReadElementsAdmitting(rt, "boolean"), rt).toEqual([]);
    }
    expect(valueReadElementsAdmitting("Observation", "boolean")).toEqual(["value"]);
  });

  it("fails closed on an unmodeled resource rather than defaulting to a carrier", () => {
    expect(valueReadElementsAdmitting("Flurble", "CodeableConcept")).toEqual([]);
    expect(valueReadElementsAdmitting("ImagingStudy", "dateTime")).toEqual([]);
  });
});
