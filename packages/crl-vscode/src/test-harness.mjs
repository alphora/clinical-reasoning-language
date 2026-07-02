// Shared test harness: the esbuild-bundle-a-.ts-to-CJS-then-require helper that ~18 `*.test.mjs` suites copied verbatim.
//
// MUST live in src/ (co-located with the suites): `load` resolves `tsFile` against THIS module's directory, which is src/,
// where every suite's target .ts also lives — so `load("foo.ts")` from any src/ suite lands on src/foo.ts. A suite passing
// a non-co-located path would break; none do. The output bundle is keyed by tsFile + pid; under the child-process test
// runner each suite is its own pid, so concurrent runs never collide on the temp file.
//
// Bespoke loaders that DON'T use this: `cockpitWebviewScript.test.mjs` (needs a vscode-stub esbuild PLUGIN + hardcodes its
// entry) and `test/oracle/*` (base dir is test/oracle/, and they alias vscode → a stub file). Those stay as-is.
import { build } from "esbuild";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** Bundle a co-located `src/<tsFile>` to CJS (esbuild) and `require` it — returns the module's exports. */
export async function load(tsFile) {
  const out = resolve(tmpdir(), `crl-${tsFile.replace(/\W/g, "_")}-${process.pid}.cjs`);
  await build({
    entryPoints: [resolve(here, tsFile)],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    outfile: out,
    logLevel: "silent",
  });
  return require(out);
}
