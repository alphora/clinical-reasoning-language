// Unit tests for the pure stable-server staging layer (no vscode), run against
// throwaway temp dirs. Imports the BUILT bundle. Run via `npm run test:stable`.
//
// Guards the regression where the globalStorage stable copy shipped only
// mcp-server.js (not the catalog .cql), breaking emit_crl_fhir at runtime.
import * as mod from "../dist/stableServer.js";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const stageStableServer = mod.stageStableServer ?? mod.default?.stageStableServer;
const STABLE_SERVER_ASSETS = mod.STABLE_SERVER_ASSETS ?? mod.default?.STABLE_SERVER_ASSETS;
const distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

let failed = false;
const check = (label, fn) => {
  try {
    fn();
    console.log(`  ok  ${label}`);
  } catch (e) {
    failed = true;
    console.error(`FAIL  ${label}\n      ${e.stack || e.message}`);
  }
};

check("stages mcp-server.js + all catalog .cql into the stable dir, returns the server path", () => {
  const bundled = mkdtempSync(join(tmpdir(), "crl-bundled-"));
  const stable = mkdtempSync(join(tmpdir(), "crl-stable-"));
  try {
    for (const a of STABLE_SERVER_ASSETS) writeFileSync(join(bundled, a), `// ${a}`);
    const out = stageStableServer(bundled, stable);
    assert.equal(out, join(stable, "mcp-server.js"));
    for (const a of STABLE_SERVER_ASSETS) {
      assert.ok(existsSync(join(stable, a)), `stable dir is missing ${a}`);
    }
  } finally {
    rmSync(bundled, { recursive: true, force: true });
    rmSync(stable, { recursive: true, force: true });
  }
});

check("throws when a catalog .cql is absent from the bundle (caller then falls back to the bundled dir)", () => {
  const bundled = mkdtempSync(join(tmpdir(), "crl-bundled-"));
  const stable = mkdtempSync(join(tmpdir(), "crl-stable-"));
  try {
    writeFileSync(join(bundled, "mcp-server.js"), "// server"); // no .cql
    assert.throws(() => stageStableServer(bundled, stable));
  } finally {
    rmSync(bundled, { recursive: true, force: true });
    rmSync(stable, { recursive: true, force: true });
  }
});

// DRIFT GUARD: every catalog .cql esbuild copies next to the bundle (dist/) MUST
// be staged into globalStorage too — else emit fails from the stable copy. A new
// catalog .cql added to esbuild but not to STABLE_SERVER_ASSETS trips this.
check("STABLE_SERVER_ASSETS stages every catalog .cql esbuild ships to dist", () => {
  const shipped = readdirSync(distDir).filter((f) => f.endsWith(".cql"));
  assert.ok(shipped.length >= 3, `expected >= 3 catalog .cql in dist, found ${shipped.length}`);
  for (const cql of shipped) {
    assert.ok(
      STABLE_SERVER_ASSETS.includes(cql),
      `dist ships ${cql} but stableServer does not stage it into globalStorage`,
    );
  }
});

if (failed) {
  console.error("stableServer.test FAILED");
  process.exit(1);
}
console.log("stableServer.test passed");
