const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");
const { builtinModules } = require("module");

// The CRL public entry — the exact artifact the package `exports` "." key
// points at. We consume the PREBUILT dist; we do NOT build CRL from here.
// Building CRL needs the root ANTLR/Java toolchain, so it is a separate,
// explicitly-invoked prerequisite (`npm run build` at the repo root).
const crlEntry = path.resolve(__dirname, "../dist/index.js");

function assertCrlBuilt() {
  if (!fs.existsSync(crlEntry)) {
    throw new Error(
      `CRL package not built: ${crlEntry} is missing.\n` +
        "Run `npm run build` at the repo root first (needs the ANTLR/Java toolchain)."
    );
  }
}

const isBuiltin = (p) => builtinModules.includes(p.replace(/^node:/, ""));

// The CRL specifier (`@smile-digital-health/crl`) resolves through node_modules:
// the extension declares a real `file:..` dependency on core, which npm links as
// a junction (extension/node_modules/@smile-digital-health/crl -> repo root), so
// esbuild finds it via normal node resolution — no explicit alias needed. The
// `precompile` guard (scripts/check-core.cjs) + `assertCrlBuilt` verify the
// junction resolves and the built dist exists before bundling.

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

  // Pure node modules (fs/path/crypto). Bundled separately so the unit tests can
  // import them directly; the extension host imports the same source.
  for (const name of ["provision", "highlight", "catalog", "concepts", "contextDetect", "completionHelpers", "findDeclaration", "projectIndex"]) {
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
  // the completion + hover providers have an embedded, parseable list. The
  // parser is in src/catalog.ts and was just built into dist/catalog.js above.
  const catalogMod = require(path.resolve(__dirname, "dist/catalog.js"));
  const catalogMdPath = path.resolve(
    __dirname,
    "../src/cql-emitter/catalog/inference-pattern-catalog.md"
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

  console.log(
    "esbuild: built extension.js + mcp-server.js + provision.js + highlight.js + catalog.js + concepts.js + completionHelpers.js; " +
      `embedded ${patterns.length} catalog patterns; gates passed ` +
      `(externals: ${[...new Set(externalImports)].join(", ") || "none"}).`
  );
}

build().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
