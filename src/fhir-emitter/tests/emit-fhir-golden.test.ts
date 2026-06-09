import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import * as path from "path";

import { describe, expect, it } from "@jest/globals";

import { emitFhirDefFromPath } from "../closureOrchestrator";

/**
 * CRL → FHIR (definition) golden regression. Emits the worked corpus
 * (cms22/cms69) from the SAME source tree the CRL→CQL and CEL→FHIR goldens use
 * (src/tests/fixtures/corpus/<corpus>-split) and diffs every emitted FHIR
 * knowledge artifact (ValueSet / Library / ActivityDefinition / PlanDefinition)
 * byte-for-byte against a committed golden under golden/<corpus>/.
 *
 * Serialization mirrors writeFhirResources exactly: <relativePath> with
 * `JSON.stringify(resource, null, 2) + "\n"`, so the goldens equal what ships.
 *
 * Uses the *strategy* CRL (the comprehensive cpg-artifact emit). emit returns
 * success:false because the strategy carries known unmatched narratives (#79
 * sentinel path) — that's expected and captured in _unmatched.json, so a change
 * in the unmatched set is caught. The hard invariant is errors.length === 0.
 *
 * Regenerate after an INTENTIONAL emit change:
 *   UPDATE_GOLDEN=1 npx jest src/fhir-emitter/tests/emit-fhir-golden.test.ts
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const GOLDEN_ROOT = path.join(__dirname, "golden");
const UPDATE = process.env.UPDATE_GOLDEN === "1";

const CORPORA: Record<string, string> = {
  cms22: "cms22-split/cms22-strategy.crl",
  cms69: "cms69-split/cms69-strategy.crl",
};

// The FHIR-def emitter stamps a fresh ISO timestamp (`date`) on each resource,
// so raw output is non-reproducible. Normalize that one volatile shape (ISO
// datetime with millis + Z) to a placeholder so the golden is stable; clinical
// date-only values (YYYY-MM-DD) are untouched.
const EMIT_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ser = (body: unknown): string =>
  JSON.stringify(body, (_k, v) => (typeof v === "string" && EMIT_TS.test(v) ? "<EMIT_TIMESTAMP>" : v), 2) + "\n";

function emitCorpus(crlRel: string): { files: Map<string, string>; unmatched: string } {
  const r = emitFhirDefFromPath(path.join(REPO_ROOT, "src/tests/fixtures/corpus", crlRel));
  if (r.errors.length) {
    throw new Error(`CRL→FHIR errors for ${crlRel}: ${JSON.stringify(r.errors)}`);
  }
  const files = new Map<string, string>();
  for (const res of r.resources) {
    files.set(res.relativePath, ser(res.resource));
  }
  return { files, unmatched: ser(r.unmatched) };
}

function listGolden(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const acc: string[] = [];
  const walk = (d: string, prefix: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), rel);
      else if (e.name.endsWith(".json")) acc.push(rel);
    }
  };
  walk(dir, "");
  return acc.sort();
}

describe("CRL → FHIR golden regression (worked corpus)", () => {
  for (const [corpus, crl] of Object.entries(CORPORA)) {
    describe(corpus, () => {
      const { files, unmatched } = emitCorpus(crl);
      const goldenDir = path.join(GOLDEN_ROOT, corpus);
      // _unmatched.json snapshots the known unmatched-narrative set.
      const entries = new Map(files);
      entries.set("_unmatched.json", unmatched);

      if (UPDATE) {
        it(`regenerates ${corpus} goldens`, () => {
          for (const [rel, content] of entries) {
            const file = path.join(goldenDir, rel);
            mkdirSync(path.dirname(file), { recursive: true });
            writeFileSync(file, content);
          }
          expect(entries.size).toBeGreaterThan(0);
        });
        return;
      }

      it("emits FHIR knowledge artifacts with no errors", () => {
        expect(files.size).toBeGreaterThan(0);
      });

      for (const [rel, content] of entries) {
        it(`matches golden ${rel}`, () => {
          const file = path.join(goldenDir, rel);
          if (!existsSync(file)) {
            throw new Error(
              `Missing golden ${path.relative(REPO_ROOT, file)} — run UPDATE_GOLDEN=1 to create.`,
            );
          }
          expect(content).toBe(readFileSync(file, "utf-8"));
        });
      }

      it("golden file set matches the emitted set", () => {
        expect(listGolden(goldenDir)).toEqual([...entries.keys()].sort());
      });
    });
  }
});
