import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
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
  cms22: path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms22/cms22.crl"),
  cms69: path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms69/cms69.crl"),
  // The cognitive-support STRATEGY libraries are separate top-level entrypoints
  // (a decision-lane facet), NOT in the measure roots' import closure — so the
  // `cms22`/`cms69` goldens above never emit their concept CQL. Pin them here so
  // the #189 boolean-composition migration of their guard concepts (cms69-strategy
  // inc-4, cms22-strategy inc-6) has a durable emit oracle, not just a one-off
  // review diff (disc 471 nit / disc 473 gpt56 [important]).
  "cms22-strategy": path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms22/cms22-strategy.crl"),
  "cms69-strategy": path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms69/cms69-strategy.crl"),
  // Slice 2 (layeredEmit): a single multi-layer CRL library that auto-splits
  // into `Layered Basic Concepts` / `Layered Basic Asserted` /
  // `Layered Basic Inferences`. Lives under the test dir (not the corpus tree)
  // since it's a standalone single-file fixture with no imports.
  "layered-basic": path.join(__dirname, "fixtures", "layered-basic", "layered-basic.crl"),
  // Slice 3 (lowerLocalCodes): a single multi-layer CRL library whose leaves
  // carry `code is` local source codes. The lowering pass synthesizes a local
  // codesystem (URN) + per-concept code into the Concepts layer and a retrieve
  // into the Asserted layer; a `defined as` concept lands in the Inferences layer.
  // Exercises the full code-is fan-out + cross-layer re-qualification.
  "code-is-basic": path.join(__dirname, "fixtures", "code-is-basic", "code-is-basic.crl"),
  // Slice 4c (always-extract-Concepts PARTIAL split) — a single library
  // carrying a `decision` (which disqualifies the FULL 3-way layered auto-split)
  // PLUS two `code is`-only concepts. The decision keeps the library OFF the full
  // split, but the concept-level `code is` triggers the PARTIAL split: the
  // terminology/codes move to a sibling `Code Is Decision Concepts` library, and
  // the retrieves/context stay in the ROOT library `Code Is Decision` (which keeps
  // the source name so PlanDef `library[]` refs resolve). With codes now alone in
  // the Concepts library, detectCollisions sees no same-library collision → the
  // ` Code` suffix DROPS (bare `code "<Concept>"`), and the root retrieves
  // cross-qualify to `[<Resource>: "Code Is Decision Concepts"."<Concept>"]`.
  "code-is-decision": path.join(
    REPO_ROOT,
    "src/imports/tests/fixtures/code-is-decision/root.crl",
  ),
  // #232 — `sem-not` lowering in the code-is truth-set lane. Exercises every
  // no-base position (standalone, `sem-or` term, all-negative `sem-and`) →
  // `({ true } except (X))`, the positive-anchored `except` regression, and the
  // grouped-negative byte-stability (`A sem-and (sem-not B)` ≡ `A except B`).
  "semnot-232": path.join(__dirname, "fixtures", "semnot-232", "semnot-232.crl"),
  // #232 — the real-artifact shape: an under-21 gate `sem-not` over the patient-
  // age both-representation (recency) twin. Guards that the operand-flavor
  // classifier recognises the recency truth-set (lowers) rather than loud-refusing.
  "semnot-age-232": path.join(__dirname, "fixtures", "semnot-age-232", "semnot-age-232.crl"),
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
            // Bootstrap a NEW corpus's golden dir — without this, the first
            // `UPDATE_GOLDEN=1` run for a corpus whose `golden/<corpus>/` dir
            // doesn't yet exist throws ENOENT (which is why early slices had to
            // hand-create the dir). `recursive` makes it a no-op when present.
            mkdirSync(path.dirname(goldenPath), { recursive: true });
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
