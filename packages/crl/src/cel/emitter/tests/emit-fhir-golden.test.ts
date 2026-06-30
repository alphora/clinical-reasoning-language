import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import * as path from "path";

import { describe, expect, it } from "@jest/globals";

import { resolveCelImports } from "../../imports";
import { emitCelToFhir } from "../emitFhir";

/**
 * CEL → FHIR golden regression. Emits the worked corpus (cms22/cms69) from the
 * SAME source tree the CRL→CQL and CRL→FHIR goldens use
 * (src/tests/fixtures/corpus/<corpus>-split) and diffs every emitted FHIR
 * instance byte-for-byte against a committed golden under golden/<corpus>/.
 *
 * Serialization mirrors writeEmitResult exactly: <outputPath>/<id>.json with
 * `JSON.stringify(body, null, 2) + "\n"`, so the goldens equal what ships.
 *
 * Regenerate after an INTENTIONAL emit change:
 *   UPDATE_GOLDEN=1 npx jest src/cel/emitter/tests/emit-fhir-golden.test.ts
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const GOLDEN_ROOT = path.join(__dirname, "golden");
const UPDATE = process.env.UPDATE_GOLDEN === "1";

// Same source family as the CRL→CQL / CRL→FHIR goldens: cms22 and cms69.
const CORPORA: Record<string, string[]> = {
  cms22: ["cms22/cms22.cel", "cms22/cms22-strategy.cel"],
  cms69: ["cms69/cms69.cel", "cms69/cms69-strategy.cel"],
};

const ser = (body: unknown): string => JSON.stringify(body, null, 2) + "\n";

/** Emit every case's resources for a corpus, keyed by `<outputPath>/<id>.json`. */
function emitCorpus(celRelPaths: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const rel of celRelPaths) {
    const graph = resolveCelImports(path.join(REPO_ROOT, "src/tests/fixtures/corpus", rel));
    const r = emitCelToFhir(graph);
    const errs = r.diagnostics.filter((d) => d.severity === "error");
    if (errs.length) {
      throw new Error(`CEL→FHIR errors for ${rel}: ${JSON.stringify(errs)}`);
    }
    for (const c of r.emittedCases) {
      for (const res of c.resources) {
        out.set(`${res.outputPath}/${res.id}.json`, ser(res.body));
      }
    }
  }
  return out;
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

describe("CEL → FHIR golden regression (worked corpus)", () => {
  for (const [corpus, cels] of Object.entries(CORPORA)) {
    describe(corpus, () => {
      const emitted = emitCorpus(cels);
      const goldenDir = path.join(GOLDEN_ROOT, corpus);

      if (UPDATE) {
        it(`regenerates ${corpus} goldens`, () => {
          for (const [rel, content] of emitted) {
            const file = path.join(goldenDir, rel);
            mkdirSync(path.dirname(file), { recursive: true });
            writeFileSync(file, content);
          }
          expect(emitted.size).toBeGreaterThan(0);
        });
        return;
      }

      it("emits at least one FHIR resource", () => {
        expect(emitted.size).toBeGreaterThan(0);
      });

      for (const [rel, content] of emitted) {
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
        expect(listGolden(goldenDir)).toEqual([...emitted.keys()].sort());
      });
    });
  }
});
