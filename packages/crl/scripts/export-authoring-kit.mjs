import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

// Explicit destination: no default write into the user's profile or Temp.
if (process.argv.length !== 3) throw new Error("Usage: node scripts/export-authoring-kit.mjs <output-directory>");
const require = createRequire(import.meta.url);
const { getAuthoringKit } = require("../dist/authoring-kit/index.js");
const { exportAuthoringKit } = require("../dist/authoring-kit/export.js");
const kit = getAuthoringKit();
const output = exportAuthoringKit(kit); // Validate before creating any output.
const directory = resolve(process.argv[2]);
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, "authoring-kit.json"), output.json);
writeFileSync(resolve(directory, "authoring-kit.md"), output.markdown);
console.log(JSON.stringify({ directory, schemaVersion: kit.schemaVersion, contentHash: kit.contentHash, auditedRevision: kit.audit.auditedRevision }));
