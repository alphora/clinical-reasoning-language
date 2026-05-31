import { readFileSync } from "fs";
import { join } from "path";

import { emitCQL } from "../emitter";

const pathArgIndex = process.argv.indexOf("--path");
const filePath =
  (pathArgIndex !== -1 && process.argv[pathArgIndex + 1]) ||
  join(__dirname, "../examples/crl/who/smart-example-immz/IMMZ_All_Decisions.crl");

const libArg = process.argv.indexOf("--library-name");
const libraryName = libArg !== -1 ? process.argv[libArg + 1] : undefined;

const input = readFileSync(filePath, "utf-8");
const result = emitCQL(input, libraryName ? { libraryName } : {});

if (!result.success) {
  process.stderr.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(1);
}
process.stdout.write(result.result ?? "");
