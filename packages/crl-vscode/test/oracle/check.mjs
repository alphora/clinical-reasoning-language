// Behavior-preservation gate (#132 step 3). Re-runs each golden-oracle generator headless
// (esbuild aliases `vscode` → the stub) into a temp file and asserts it still equals the
// committed golden. Wired into `npm test` so the OLD-vs-NEW byte-identical proof captured
// during each service extraction becomes a DURABLE regression guard — covering both the core
// compute* fns AND the toVscode converters (which otherwise have no automated test, since
// they import `vscode` and only run under the esbuild alias). Add a service's name here when
// its generate-<svc>.ts + golden/<svc>.json land.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = resolve(here, "../.."); // packages/crl-vscode — the generators resolve the catalog md from cwd
const stub = resolve(here, "vscode-stub.ts");
const services = ["hover", "completion", "navigation"];

for (const svc of services) {
  const bundle = resolve(here, `.gen/check-${svc}.cjs`);
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
  const out = resolve(here, `.gen/${svc}.check.json`);
  execFileSync(process.execPath, [bundle], {
    cwd: pkgDir,
    env: { ...process.env, CRL_ORACLE_OUT: out },
    stdio: "pipe",
  });
  const fresh = readFileSync(out, "utf-8");
  const golden = readFileSync(resolve(here, `golden/${svc}.json`), "utf-8");
  assert.equal(
    fresh,
    golden,
    `oracle ${svc}: regenerated output drifted from golden/${svc}.json — behavior preservation broken; re-verify the ${svc} extraction.`,
  );
  console.log(`oracle ${svc}: ${JSON.parse(fresh).length} cases match golden/${svc}.json.`);
}
