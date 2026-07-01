// #187 — copy the shared catalog CQL assets into dist so the published package
// ships them. `tsc` compiles .ts only; the emitter's catalog loader
// (src/cql-emitter/catalog/loadCatalog.ts) reads these `.cql` at runtime via
// `readFileSync(join(__dirname, "<name>.cql"))`, which resolves to
// dist/cql-emitter/catalog/ in the built package. `package.json` `files`
// includes the dist `.cql` glob so they are packed.
//
// Single-threaded, sequential copy (E: Dev Drive I/O safety — no parallel
// heavy writes).
import { copyFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "src", "cql-emitter", "catalog");
const dstDir = join(here, "..", "dist", "cql-emitter", "catalog");

// The EXACT set the emitter ships into every policy. Assert each is present and
// fail loud on any miss — a partial copy would ENOENT at emit time (or ship a
// stale/renamed asset) rather than here at build time.
const EXPECTED = ["CRLCommon.cql", "CaseFeatureCommon.cql", "FHIRHelpers.cql"];

mkdirSync(dstDir, { recursive: true });

const missing = EXPECTED.filter((f) => !existsSync(join(srcDir, f)));
if (missing.length > 0) {
  process.stderr.write(
    `copy-catalog: missing expected catalog .cql under ${srcDir}: ${missing.join(", ")}. ` +
      `The emitter always ships CRLCommon/CaseFeatureCommon/FHIRHelpers — a rename or ` +
      `deletion must update both the catalog dir and loadCatalog.ts.\n`,
  );
  process.exit(1);
}

for (const f of EXPECTED) {
  copyFileSync(join(srcDir, f), join(dstDir, f));
  process.stdout.write(`copied catalog ${f} -> dist/cql-emitter/catalog/${f}\n`);
}
