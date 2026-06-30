import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import * as path from "path";

import { emitCQLImports } from "../../imports/emit";

/**
 * CQL emit golden regression. Emits the worked corpus (cms22/cms69) end-to-end
 * via `emitCQLImports` and compares each emitted library's CQL byte-for-byte
 * (line-ending–normalized) against a checked-in golden under `golden/<corpus>/`.
 *
 * This complements the assertion-style tests (emitCQL-parameters,
 * unmatched-narrative) with a full-output guard: any unintended change to the
 * emitted CQL — header, include set, define bodies, ordering, whitespace — is
 * caught here, not just the fragments the regex tests happen to probe.
 *
 * Regenerate after an INTENTIONAL emit change:
 *   UPDATE_GOLDEN=1 npx jest src/cql-emitter/tests/emit-golden.test.ts
 * Then review the golden diff as part of the change.
 *
 * Fixtures are tracked under src/tests/fixtures/corpus (NOT the gitignored
 * features/ tree) so a fresh clone can run this.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const GOLDEN_ROOT = path.join(__dirname, "golden");
const UPDATE = process.env.UPDATE_GOLDEN === "1";

const CORPORA: Record<string, string> = {
  cms22: path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms22-split/cms22.crl"),
  cms69: path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms69-split/cms69.crl"),
  // Slice 2 (layeredEmit): a single multi-layer CRL library that auto-splits
  // into `Layered Basic Concepts` / `Layered Basic Asserted` /
  // `Layered Basic Inferred`. Lives under the test dir (not the corpus tree)
  // since it's a standalone single-file fixture with no imports.
  "layered-basic": path.join(__dirname, "fixtures", "layered-basic.crl"),
  // Slice 3 (lowerLocalCodes): a single multi-layer CRL library whose leaves
  // carry `code is` local source codes. The lowering pass synthesizes a local
  // codesystem (URN) + per-concept code into the Concepts layer and a retrieve
  // into the Asserted layer; a `defined as` concept lands in the Inferred layer.
  // Exercises the full code-is fan-out + cross-layer re-qualification.
  "code-is-basic": path.join(__dirname, "fixtures", "code-is-basic", "code-is-basic.crl"),
};

const norm = (s: string): string => s.replace(/\r\n/g, "\n");

describe("CQL emit golden regression (worked corpus)", () => {
  for (const [corpus, root] of Object.entries(CORPORA)) {
    describe(corpus, () => {
      const result = emitCQLImports(root);
      const goldenDir = path.join(GOLDEN_ROOT, corpus);

      it("emits the full library closure without errors", () => {
        if (!result.success) {
          throw new Error(
            `emitCQLImports failed for ${corpus}: ${JSON.stringify(result.errors)}`,
          );
        }
        expect(result.success).toBe(true);
        expect(result.cqlByLibrary.length).toBeGreaterThan(0);
      });

      // Per-library byte-for-byte comparison against the checked-in golden.
      for (const entry of result.cqlByLibrary) {
        it(`${entry.libraryName} matches golden ${entry.outputFilename}`, () => {
          const goldenPath = path.join(goldenDir, entry.outputFilename);
          const emitted = norm(entry.cql);
          if (UPDATE) {
            writeFileSync(goldenPath, emitted);
            return;
          }
          if (!existsSync(goldenPath)) {
            throw new Error(
              `Missing golden ${path.relative(REPO_ROOT, goldenPath)}. ` +
                `Run UPDATE_GOLDEN=1 npx jest src/cql-emitter/tests/emit-golden.test.ts to create it.`,
            );
          }
          expect(emitted).toBe(norm(readFileSync(goldenPath, "utf-8")));
        });
      }

      // Guard against golden/emit set drift: the golden dir must contain
      // exactly the libraries we emit (no stale or missing files).
      it("golden file set matches the emitted library set", () => {
        if (UPDATE) return;
        const emittedFiles = result.cqlByLibrary.map((e) => e.outputFilename).sort();
        const goldenFiles = existsSync(goldenDir)
          ? readdirSync(goldenDir).filter((f) => f.endsWith(".cql")).sort()
          : [];
        expect(goldenFiles).toEqual(emittedFiles);
      });
    });
  }
});
