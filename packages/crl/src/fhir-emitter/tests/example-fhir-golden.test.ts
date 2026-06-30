import { existsSync, readdirSync, readFileSync } from "fs";
import * as path from "path";

import { describe, expect, it } from "@jest/globals";

import { emitFhirDefFromPath } from "../closureOrchestrator";

/**
 * CRL → FHIR (definition) golden regression for the LOCKED truth-set EXAMPLE
 * goldens (example-{direct,semand,nested,bothrep,for-emit}). These are the EXACT
 * spec for the recursive `code is` case-feature FHIR lane.
 *
 * SCOPE (per the deliverable): this harness diffs the two things this lane
 * produces — the decision PlanDefinition's `action[].input[]` (recursive
 * case-feature inputs, in INFERENCE ORDER) and the case-feature
 * `StructureDefinition/*.json` (one per collected `code is` concept,
 * `cpg-featureExpression.reference` → the `<policyId>-LocalSource` Library):
 *   - Every case-feature StructureDefinition that EXISTS under `src/fhir/
 *     StructureDefinition/` is matched BYTE-FOR-BYTE.
 *   - The coverage-determination PlanDefinition's `action[].input` arrays are
 *     matched (deep-equal) against the golden's, walking nested actions.
 *
 * It does NOT diff the PlanDefinition envelope (`name`/etc.) or the omitted
 * Library/CodeSystem/recommendation wrappers — those carry pre-existing golden
 * authoring divergences unrelated to this lane (the committed code-is-decision /
 * code-is-decision-vs goldens pin the full PlanDefinition byte-for-byte).
 *
 * Serialization mirrors writeFhirResources: `JSON.stringify(resource, null, 2) +
 * "\n"`.
 */

const GOLDEN_ROOT = path.join(__dirname, "golden");

const EXAMPLES = [
  "example-direct",
  "example-semand",
  "example-nested",
  "example-bothrep",
  "example-for-emit",
] as const;

const FIXED_DATE = new Date("2026-01-01T00:00:00.000Z");
const ser = (body: unknown): string => JSON.stringify(body, null, 2) + "\n";

/** Collect every `action[...].input` array from a PlanDefinition (pre-order). */
function collectInputs(resource: { action?: unknown }): unknown[] {
  const out: unknown[] = [];
  const walk = (actions: unknown): void => {
    if (!Array.isArray(actions)) return;
    for (const a of actions) {
      const rec = a as { input?: unknown; action?: unknown };
      if (Array.isArray(rec.input)) out.push(...rec.input);
      walk(rec.action);
    }
  };
  walk(resource.action);
  return out;
}

describe("CRL → FHIR golden regression (locked truth-set examples)", () => {
  for (const example of EXAMPLES) {
    describe(example, () => {
      const crl = path.join(GOLDEN_ROOT, example, "src", "crl", `${example}.crl`);
      const fhirDir = path.join(GOLDEN_ROOT, example, "src", "fhir");

      const r = emitFhirDefFromPath(crl, { date: FIXED_DATE });
      const emittedByPath = new Map<string, { relativePath: string; resource: unknown }>();
      for (const res of r.resources) emittedByPath.set(res.relativePath, res);

      it("emits with no errors", () => {
        expect(r.errors).toEqual([]);
      });

      // (a) Byte-match every materialized case-feature StructureDefinition.
      const sdDir = path.join(fhirDir, "StructureDefinition");
      const sdFiles = existsSync(sdDir)
        ? readdirSync(sdDir).filter((f) => f.endsWith(".json")).sort()
        : [];
      for (const f of sdFiles) {
        it(`case-feature SD ${f} matches byte-for-byte`, () => {
          const rel = `StructureDefinition/${f}`;
          const emitted = emittedByPath.get(rel);
          expect(emitted).toBeDefined();
          expect(ser(emitted!.resource)).toBe(readFileSync(path.join(sdDir, f), "utf-8"));
        });
      }

      // (b) Match the decision PlanDefinition's recursive `input[]` (inference
      //     order) against the golden's.
      const pdDir = path.join(fhirDir, "PlanDefinition");
      const coverageFile = existsSync(pdDir)
        ? readdirSync(pdDir).find((f) => f.endsWith("-coverage-determination.json"))
        : undefined;
      it("decision PlanDefinition input[] matches (inference order)", () => {
        expect(coverageFile).toBeDefined();
        const rel = `PlanDefinition/${coverageFile}`;
        const emitted = emittedByPath.get(rel);
        expect(emitted).toBeDefined();
        const goldenPd = JSON.parse(readFileSync(path.join(pdDir, coverageFile!), "utf-8"));
        expect(collectInputs(emitted!.resource as { action?: unknown })).toEqual(
          collectInputs(goldenPd),
        );
      });
    });
  }
});
