#!/usr/bin/env node
// Thin entry for the `crl-mcp` bin. All logic lives in the shared core factory (#132 step 4) so
// the CLI and the VS Code extension cannot drift (the drift broke v2.4.0/4.1/4.2). Imports the
// factory module directly (intra-package relative path — not via the package `exports` subpath).
import { main, selfTest } from "../mcp/server";

if (process.argv.includes("--selftest")) {
  const fi = process.argv.indexOf("--file");
  process.exit(selfTest(fi !== -1 ? process.argv[fi + 1] : undefined));
} else {
  main().catch((e) => {
    console.error("crl mcp server failed to start:", e);
    process.exit(1);
  });
}
