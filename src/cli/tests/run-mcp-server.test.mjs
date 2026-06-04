// Integration test: spawn dist/cli/run-mcp-server.js as a real MCP stdio
// server and drive it with the SDK client. Mirrors extension/src/mcp-server.test.mjs
// but exercises the npm-package bin (`crl-mcp`) rather than the bundled
// extension copy. Run via `npm run test:mcp` (compiles first).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(here, "../../../dist/cli/run-mcp-server.js");
const cms22SplitInferred = resolve(
  here,
  "../../../features/cql-pattern-mining/results/models/cms22-split/cms22-inferred.crl"
);

const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath] });
const client = new Client({ name: "crl-mcp-test", version: "0.0.0" });

let failed = false;
const check = async (label, fn) => {
  try {
    await fn();
    console.log(`  ok  ${label}`);
  } catch (e) {
    failed = true;
    console.error(`FAIL  ${label}\n      ${e.message}`);
  }
};

await client.connect(transport);
try {
  await check("MCP tools: build_crl_ast, tokenize_crl, validate_crl, emit_cql", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["build_crl_ast", "emit_cql", "tokenize_crl", "validate_crl"]);
  });

  await check("validate_crl via path → project mode resolves sibling libraries (cross-file)", async () => {
    const r = await client.callTool({
      name: "validate_crl",
      arguments: { path: cms22SplitInferred },
    });
    assert.ok(!r.isError, "should not be a tool error");
    const out = JSON.parse(r.content[0].text);
    assert.equal(
      out.success,
      true,
      `cms22-inferred should validate cleanly in project mode; got errors: ${JSON.stringify(out.errors).slice(0, 200)}`
    );
  });

  await check("validate_crl via inline code → single-file mode flags cross-library refs", async () => {
    const { readFileSync } = await import("node:fs");
    const code = readFileSync(cms22SplitInferred, "utf8");
    const r = await client.callTool({ name: "validate_crl", arguments: { code } });
    assert.ok(!r.isError);
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, false, "inline-code mode cannot resolve cross-library refs");
    assert.ok(
      out.errors.some((e) => e.kind === "external-library-not-included"),
      "expected at least one external-library-not-included error in single-file mode"
    );
  });
} finally {
  await client.close();
}

console.log(failed ? "\nrun-mcp-server.test FAILED" : "\nrun-mcp-server.test passed");
process.exit(failed ? 1 : 0);
