import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// Staging the MCP server into the version-independent globalStorage dir (see
// extension.ts `resolveStableMcpServerScript`). This module is vscode-FREE so it
// is unit-testable against temp dirs.
//
// CRITICAL (regression #190-adjacent): the emitter reads the shared catalog
// `.cql` at RUNTIME via `join(__dirname, name)` (crl `loadCatalog.ts`). Because
// `.mcp.json` points at the STABLE COPY (not `dist/`), `__dirname` is the stable
// dir — so the `.cql` MUST be copied here too, not just next to `dist/mcp-server.js`
// (which is where esbuild puts them). Without this, `emit_crl_fhir` fails with
// "Catalog CQL … not found" pointing at globalStorage.
//
// Keep the `.cql` list in sync with crl `loadCatalog.ts` (the catalog set) and
// crl-vscode `esbuild.js` (`CATALOG_CQL`); the drift-guard in
// `stableServer.test.mjs` asserts it against `loadCatalogLibraries()`.
//
// ⚠ ENTRIES MAY CARRY A RELATIVE SUBDIRECTORY, and `driver/ApplyDriver.class` does. `emit_results`
// resolves the driver as `join(__dirname, "driver", "ApplyDriver.class")`, and when `.mcp.json` points
// at the stable copy `__dirname` is the stable dir — so staging the class FLAT would leave the tool
// looking in a `driver/` subdir that does not exist. Same failure as the `.cql` above, one level down.
export const STABLE_SERVER_ASSETS = [
  "mcp-server.js",
  "CRLCommon.cql",
  "CaseFeatureCommon.cql",
  "FHIRHelpers.cql",
  join("driver", "ApplyDriver.class"),
] as const;

/**
 * Copy the MCP server bundle AND its runtime catalog siblings from the bundled
 * `dist` dir into the version-independent stable dir. Returns the stable server
 * path. Throws if any asset is missing from `bundledDir` — the caller then falls
 * back to running from `bundledDir` directly, where the `.cql` are already
 * esbuild-copied siblings, so the server still resolves the catalog.
 */
export function stageStableServer(bundledDir: string, stableDir: string): string {
  mkdirSync(stableDir, { recursive: true });
  for (const asset of STABLE_SERVER_ASSETS) {
    const dst = join(stableDir, asset);
    mkdirSync(dirname(dst), { recursive: true }); // an asset may sit in a subdir (the driver does)
    copyFileSync(join(bundledDir, asset), dst);
  }
  return join(stableDir, "mcp-server.js");
}
