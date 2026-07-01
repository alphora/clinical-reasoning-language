import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

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
export const STABLE_SERVER_ASSETS = [
  "mcp-server.js",
  "CRLCommon.cql",
  "CaseFeatureCommon.cql",
  "FHIRHelpers.cql",
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
    copyFileSync(join(bundledDir, asset), join(stableDir, asset));
  }
  return join(stableDir, "mcp-server.js");
}
