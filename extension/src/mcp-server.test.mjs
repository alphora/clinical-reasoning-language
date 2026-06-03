// Integration test: spawn the BUILT dist/mcp-server.js as a real MCP stdio
// server and drive it with the SDK client. Run via `npm run test:mcp`
// (pretest:mcp compiles first). Exits non-zero on any assertion failure.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(here, "../dist/mcp-server.js");
const fixturePath = resolve(
  here,
  "../../src/tests/regression/testdata/clinical-reasoning-language-example.crl"
);
const BOM = String.fromCharCode(0xfeff);

const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath] });
const client = new Client({ name: "crl-test", version: "0.0.0" });

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

  await check("build_crl_ast via path → valid AST with expected structure", async () => {
    const r = await client.callTool({ name: "build_crl_ast", arguments: { path: fixturePath } });
    assert.ok(!r.isError, "should not be a tool error");
    const ast = JSON.parse(r.content[0].text);
    assert.equal(ast.success, true);
    assert.equal(ast.result.type, "CRL");
    assert.equal(ast.result.library?.name, "CMS69 BMI Screening GPG Strategy example");
    assert.equal(ast.result.statements[0].type, "Decision");
    assert.equal(ast.result.statements[0].name, "CMS69 BMI Screening Strategy");
  });

  await check("tokenize_crl via code → tokens", async () => {
    const code = readFileSync(fixturePath, "utf8");
    const r = await client.callTool({ name: "tokenize_crl", arguments: { code } });
    assert.ok(!r.isError);
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, true);
    assert.ok(Array.isArray(out.result) && out.result.length > 0);
  });

  await check("malformed CRL → success:false content, NOT a tool error", async () => {
    const r = await client.callTool({ name: "build_crl_ast", arguments: { code: "@@@ not valid" } });
    assert.ok(!r.isError, "malformed CRL is a normal result");
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, false);
    assert.ok(Array.isArray(out.errors) && out.errors.length > 0);
  });

  await check("both code+path → isError", async () => {
    const r = await client.callTool({ name: "tokenize_crl", arguments: { code: "x", path: "y" } });
    assert.equal(r.isError, true);
  });

  await check("neither code nor path → isError", async () => {
    const r = await client.callTool({ name: "tokenize_crl", arguments: {} });
    assert.equal(r.isError, true);
  });

  await check("nonexistent path → isError (not a crash)", async () => {
    const r = await client.callTool({ name: "build_crl_ast", arguments: { path: "/no/such/file.crl" } });
    assert.equal(r.isError, true);
  });

  await check("directory path → isError (not a crash)", async () => {
    const r = await client.callTool({ name: "build_crl_ast", arguments: { path: here } });
    assert.equal(r.isError, true);
  });

  await check("oversized inline code → isError", async () => {
    const r = await client.callTool({ name: "tokenize_crl", arguments: { code: "x".repeat(1_000_001) } });
    assert.equal(r.isError, true);
  });

  await check("empty code → success:false content, NOT a tool error", async () => {
    const r = await client.callTool({ name: "build_crl_ast", arguments: { code: "" } });
    assert.ok(!r.isError, "empty code is a degenerate document, not bad input");
    const out = JSON.parse(r.content[0].text);
    assert.equal(typeof out.success, "boolean");
  });

  await check("leading BOM is stripped → parses like the fixture", async () => {
    const code = BOM + readFileSync(fixturePath, "utf8");
    const r = await client.callTool({ name: "build_crl_ast", arguments: { code } });
    assert.ok(!r.isError);
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, true);
    assert.equal(out.result.library?.name, "CMS69 BMI Screening GPG Strategy example");
  });
} finally {
  await client.close();
}

console.log(failed ? "\ntest:mcp FAILED" : "\ntest:mcp passed");
process.exit(failed ? 1 : 0);
