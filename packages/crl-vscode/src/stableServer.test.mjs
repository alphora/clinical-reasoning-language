// Unit tests for the pure stable-server staging layer (no vscode), run against
// throwaway temp dirs. Imports the BUILT bundle. Run via `npm run test:stable`.
//
// Guards the regression where the globalStorage stable copy shipped only
// mcp-server.js (not the catalog .cql), breaking emit_crl_fhir at runtime.
import * as mod from "../dist/stableServer.js";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const stageStableServer = mod.stageStableServer ?? mod.default?.stageStableServer;
const STABLE_SERVER_ASSETS = mod.STABLE_SERVER_ASSETS ?? mod.default?.STABLE_SERVER_ASSETS;
const distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

const check = test;

check("stages mcp-server.js + all catalog .cql into the stable dir, returns the server path", () => {
  const bundled = mkdtempSync(join(tmpdir(), "crl-bundled-"));
  const stable = mkdtempSync(join(tmpdir(), "crl-stable-"));
  try {
    // An asset may sit in a subdirectory (driver/ApplyDriver.class), so the fixture must create it
    // the way esbuild does — a flat fixture would pass while the real staging failed.
    for (const a of STABLE_SERVER_ASSETS) {
      mkdirSync(dirname(join(bundled, a)), { recursive: true });
      writeFileSync(join(bundled, a), `// ${a}`);
    }
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

// DRIFT GUARD: the same rule one directory down. `emit_results` resolves the compiled driver as
// join(__dirname, "driver", "ApplyDriver.class"), and when .mcp.json points at the STABLE copy that
// __dirname is globalStorage — so a driver shipped to dist/ but not staged leaves the tool looking in
// a directory that does not exist. 4.114.0 shipped emit_results with the driver in NEITHER the vsix nor
// the npm tarball; this is the assertion that would have caught it.
check("STABLE_SERVER_ASSETS stages every driver asset esbuild ships to dist/driver", () => {
  const driverDist = join(distDir, "driver");
  assert.ok(existsSync(driverDist), "esbuild did not copy the compiled driver into dist/driver — run `npm run compile`");
  const shipped = readdirSync(driverDist);
  assert.ok(shipped.length > 0, "dist/driver is empty");
  for (const f of shipped) {
    assert.ok(
      STABLE_SERVER_ASSETS.includes(join("driver", f)),
      `dist ships driver/${f} but stableServer does not stage it into globalStorage`,
    );
  }
});
