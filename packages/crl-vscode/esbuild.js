const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");
const { builtinModules } = require("module");

// CRL core is resolved via node (the npm workspace link), not a hardcoded path,
// so the extension build is independent of the on-disk layout. We consume the
// PREBUILT dist; building core (ANTLR/Java) is a separate prerequisite
// (`npm run build -w @smile-digital-health/crl`).
function assertCrlBuilt() {
  let entry;
  try {
    entry = require.resolve("@smile-digital-health/crl");
  } catch {
    throw new Error("CRL core not linked: run `npm install` at the repo root (workspaces).");
  }
  if (!fs.existsSync(entry)) {
    throw new Error(
      `CRL core not built: ${entry} is missing.\n` +
        "Run `npm run build -w @smile-digital-health/crl` first (needs the ANTLR/Java toolchain)."
    );
  }
  // #132 step 1: the host bundle pulls language-services from core via the subpath —
  // verify it resolves + is built (a stale core build may have dist/index.js but not this).
  let lsEntry;
  try {
    lsEntry = require.resolve("@smile-digital-health/crl/language-services");
  } catch {
    throw new Error("@smile-digital-health/crl/language-services unresolvable: rebuild core (`npm run build -w @smile-digital-health/crl`).");
  }
  if (!fs.existsSync(lsEntry)) {
    throw new Error(`CRL language-services not built: ${lsEntry} is missing — run \`npm run build -w @smile-digital-health/crl\`.`);
  }
  // #132 step 4: the bundled MCP server (mcp-server.ts) pulls the shared factory via the subpath —
  // verify it resolves + is built (a stale core may have dist/index.js but not dist/mcp).
  let mcpEntry;
  try {
    mcpEntry = require.resolve("@smile-digital-health/crl/mcp");
  } catch {
    throw new Error("@smile-digital-health/crl/mcp unresolvable: rebuild core (`npm run build -w @smile-digital-health/crl`).");
  }
  if (!fs.existsSync(mcpEntry)) {
    throw new Error(`CRL mcp factory not built: ${mcpEntry} is missing — run \`npm run build -w @smile-digital-health/crl\`.`);
  }
}

const isBuiltin = (p) => builtinModules.includes(p.replace(/^node:/, ""));

// The CRL specifier (`@smile-digital-health/crl`) resolves through node_modules:
// the extension declares a real workspace dependency on core (packages/crl),
// which npm links into node_modules, so esbuild finds it via normal node
// resolution — no explicit alias needed. The `precompile` guard
// (scripts/check-core.cjs) + `assertCrlBuilt` verify the link resolves and the
// built dist exists before bundling.

async function build() {
  assertCrlBuilt();

  // Extension-host bundle. `vscode` is provided by the runtime, never bundled.
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, "src/extension.ts")],
    outfile: path.resolve(__dirname, "dist/extension.js"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    external: ["vscode"],
    sourcemap: true,
  });

  // Standalone MCP server bundle. Launched by the MCP host (Claude Code) via
  // VS Code's embedded Node — must NOT import `vscode` and must inline all deps.
  // minify is disabled deliberately: it aids debugging and avoids any risk to
  // antlr4ts's large inline serialized-ATN string literal.
  const result = await esbuild.build({
    entryPoints: [path.resolve(__dirname, "src/mcp-server.ts")],
    outfile: path.resolve(__dirname, "dist/mcp-server.js"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    minify: false,
    sourcemap: true,
    metafile: true,
  });

  // Gate 1: heavy/unused deps must not leak into the server bundle. Covers the
  // CRL CLI/transformer deps (fsh-sushi/prompts/cpx) AND the MCP SDK's HTTP/OAuth
  // transports (express/hono/jose/eventsource/cors), which a stdio server must
  // tree-shake away — locking that in as a regression guard, not a one-time check.
  const leaked = Object.keys(result.metafile.inputs)
    .map((p) => p.replace(/\\/g, "/"))
    .filter((p) =>
      /(^|\/)node_modules\/(fsh-sushi|prompts|cpx|express|hono|jose|eventsource|cors)\//.test(p)
    );
  if (leaked.length) {
    throw new Error(`Forbidden deps leaked into mcp-server bundle:\n${leaked.join("\n")}`);
  }

  // Gate 2: a standalone bundle must leave only Node builtins as external
  // imports (esbuild records every unbundled import in the output metafile —
  // more robust than scanning the emitted text for require() calls).
  const serverKey = Object.keys(result.metafile.outputs).find((k) =>
    k.endsWith("mcp-server.js")
  );
  const externalImports = (result.metafile.outputs[serverKey].imports || [])
    .filter((i) => i.external)
    .map((i) => i.path);
  const nonBuiltin = externalImports.filter((p) => !isBuiltin(p));
  if (nonBuiltin.length) {
    throw new Error(
      `mcp-server bundle has non-builtin external imports: ${[...new Set(nonBuiltin)].join(", ")}`
    );
  }

  // provision + stableServer + policyLaunchTarget: pure node modules bundled separately so their unit
  // tests can import them directly. (The language-services modules — concepts,
  // completionHelpers, contextDetect, findDeclaration, projectIndex, highlight, and
  // as of #132 step 3 the catalog — live in core; their tests import them from
  // @smile-digital-health/crl/language-services.)
  for (const name of ["provision", "stableServer", "policyLaunchTarget"]) {
    await esbuild.build({
      entryPoints: [path.resolve(__dirname, `src/${name}.ts`)],
      outfile: path.resolve(__dirname, `dist/${name}.js`),
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node18",
      sourcemap: true,
    });
  }

  // Generate dist/catalog.json from the inference-pattern catalog markdown so
  // the completion + hover providers have an embedded, parseable list. The parser
  // moved to core in #132 step 3 — consume it via the package subpath (resolved +
  // existence-checked by assertCrlBuilt above). The catalog md still lives in core src
  // (a pre-existing cross-package read; relocating the generation into core's build is a
  // deferred follow-up).
  const catalogMod = require("@smile-digital-health/crl/language-services");
  if (typeof catalogMod.parseCatalog !== "function") {
    throw new Error(
      "@smile-digital-health/crl/language-services has no parseCatalog — rebuild core " +
        "(`npm run build -w @smile-digital-health/crl`)."
    );
  }
  const catalogMdPath = path.resolve(
    __dirname,
    "../crl/src/cql-emitter/catalog/inference-pattern-catalog.md"
  );
  if (!fs.existsSync(catalogMdPath)) {
    throw new Error(`Catalog markdown not found at ${catalogMdPath}`);
  }
  const catalogMd = fs.readFileSync(catalogMdPath, "utf-8");
  const patterns = catalogMod.parseCatalog(catalogMd);
  if (!patterns.length) {
    throw new Error("Catalog parse produced 0 patterns — check the catalog markdown's reference table headers");
  }
  fs.writeFileSync(
    path.resolve(__dirname, "dist/catalog.json"),
    JSON.stringify(patterns, null, 2)
  );

  // #187: the bundled MCP server (dist/mcp-server.js) reaches core's catalog
  // loader (loadCatalog.ts, inlined by esbuild) which reads the three shared
  // catalog `.cql` via readFileSync(join(__dirname, name)). In the bundle
  // `__dirname` is THIS dist/ dir — with no catalog siblings — so `emit_cql` /
  // `emit_crl_fhir` would ENOENT. Copy the three `.cql` NEXT TO the bundle so the
  // loader's `join(__dirname, name)` candidate resolves (mirrors the plain-dist
  // copy-catalog.mjs step). Source them from core's BUILT dist (assertCrlBuilt
  // guarantees core is built + copy-catalog ran); fail loud if any is missing.
  const CATALOG_CQL = ["CRLCommon.cql", "CaseFeatureCommon.cql", "FHIRHelpers.cql"];
  const coreCatalogDist = path.resolve(
    __dirname,
    "../crl/dist/cql-emitter/catalog"
  );
  for (const name of CATALOG_CQL) {
    const src = path.join(coreCatalogDist, name);
    if (!fs.existsSync(src)) {
      throw new Error(
        `Catalog CQL ${name} missing at ${src} — core's copy-catalog build step did not run. ` +
          "Rebuild core (`npm run build -w @smile-digital-health/crl`), which runs `tsc && node scripts/copy-catalog.mjs`."
      );
    }
    fs.copyFileSync(src, path.resolve(__dirname, "dist", name));
  }

  console.log(
    "esbuild: built extension.js + mcp-server.js + provision.js; " +
      `embedded ${patterns.length} catalog patterns; copied ${CATALOG_CQL.length} catalog .cql next to the bundle; ` +
      `gates passed (externals: ${[...new Set(externalImports)].join(", ") || "none"}).`
  );
}

build().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
