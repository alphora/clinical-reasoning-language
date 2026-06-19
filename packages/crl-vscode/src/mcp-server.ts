// Thin entry for the VS Code extension's bundled MCP server (esbuilt → dist/mcp-server.js). All
// logic lives in the shared core factory (#132 step 4) so the extension and the `crl-mcp` CLI bin
// cannot drift (the drift shipped broken bundles in v2.4.0/4.1/4.2). The @modelcontextprotocol/sdk
// dependency is reached transitively through the factory and bundled here by esbuild.
import { main, selfTest } from "@smile-digital-health/crl/mcp";

if (process.argv.includes("--selftest")) {
  const fi = process.argv.indexOf("--file");
  process.exit(selfTest(fi !== -1 ? process.argv[fi + 1] : undefined));
} else {
  main().catch((e) => {
    console.error("crl mcp server failed to start:", e);
    process.exit(1);
  });
}
