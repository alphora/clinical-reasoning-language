// Regenerate the behavior-preservation goldens (#132 step 3). Same build+run pipeline as check.mjs, but WRITES each
// golden/<svc>.json instead of asserting against it. Run this — `npm run oracle:update` — after an INTENTIONAL change to a
// language-service surface (a new catalog pattern → a new completion, a hover-format tweak, etc.), then eyeball the git
// diff to confirm the drift is the change you meant. NEVER run it to make a red `check.mjs` green without reading the diff:
// the golden is the contract, so a blind refresh would launder a real regression into the baseline.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = resolve(here, "../.."); // packages/crl-vscode — the generators resolve the catalog md from cwd
const stub = resolve(here, "vscode-stub.ts");
const services = ["hover", "completion", "navigation", "diagnostics"];

for (const svc of services) {
  const bundle = resolve(here, `.gen/update-${svc}.cjs`);
  await build({
    entryPoints: [resolve(here, `generate-${svc}.ts`)],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    alias: { vscode: stub },
    outfile: bundle,
    logLevel: "silent",
  });
  const out = resolve(here, `.gen/${svc}.update.json`);
  execFileSync(process.execPath, [bundle], {
    cwd: pkgDir,
    env: { ...process.env, CRL_ORACLE_OUT: out },
    stdio: "pipe",
  });
  const fresh = readFileSync(out, "utf-8");
  const goldenPath = resolve(here, `golden/${svc}.json`);
  const prior = readFileSync(goldenPath, "utf-8");
  if (fresh === prior) {
    console.log(`oracle ${svc}: unchanged (${JSON.parse(fresh).length} cases).`);
  } else {
    writeFileSync(goldenPath, fresh);
    console.log(`oracle ${svc}: UPDATED golden/${svc}.json (${JSON.parse(fresh).length} cases) — review the git diff.`);
  }
}
