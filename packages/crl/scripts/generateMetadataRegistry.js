// #154/#203: codegen the metadata registry as a TS constant so the Validator reads it COMPILE-TIME-inlined —
// no runtime `fs`/`require` of a JSON asset (which would be the #187 packaging hazard: `spec/` is outside `src/`
// and would either shift tsc's rootDir or ship a dangling require). Runs in `npm run generate` (prebuild).
const fs = require("fs");
const path = require("path");

const registryPath = path.join(__dirname, "../spec/metadata-registry.json");
const outDir = path.join(__dirname, "../src/meta/generated");
const outPath = path.join(outDir, "registry.generated.ts");

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
fs.mkdirSync(outDir, { recursive: true });

const banner =
  "// AUTO-GENERATED from spec/metadata-registry.json by scripts/generateMetadataRegistry.js — DO NOT EDIT.\n" +
  "// Regenerate with `npm run generate`. Compile-time-inlined so the Validator has zero runtime asset dependency.\n" +
  "/* eslint-disable */\n";

const body = `export const METADATA_REGISTRY = ${JSON.stringify(registry, null, 2)} as const;\n`;

fs.writeFileSync(outPath, banner + body);
console.log(`Generated ${path.relative(path.join(__dirname, ".."), outPath)} (registry v${registry.version}, ${registry.tags.length} tags)`);
