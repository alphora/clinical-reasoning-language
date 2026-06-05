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
  await check("MCP tools: 7 registered (tokenize_crl, build_crl_ast, validate_crl, validate_cel, emit_cql, emit_crl_fhir, emit_cel)", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "build_crl_ast",
      "emit_cel",
      "emit_cql",
      "emit_crl_fhir",
      "tokenize_crl",
      "validate_cel",
      "validate_crl",
    ]);
  });

  await check("emit_cel via path → cms22.cel returns summary envelope with cases", async () => {
    const cms22Cel = resolve(here, "../../../features/cql-pattern-mining/results/models/cms22-split/cms22.cel");
    const r = await client.callTool({ name: "emit_cel", arguments: { path: cms22Cel } });
    assert.ok(!r.isError, "should not be a tool error");
    const out = JSON.parse(r.content[0].text);
    assert.equal(typeof out.success, "boolean");
    assert.equal(typeof out.caseCount, "number");
    assert.equal(typeof out.resourceCount, "number");
    assert.ok(Array.isArray(out.caseManifest));
    assert.ok(Array.isArray(out.resourceManifest));
    assert.ok(Array.isArray(out.diagnostics));
    assert.equal(out.emittedCases, undefined, "summary envelope must NOT include full cases by default");
  });

  await check("emit_cel with includeResources:true → full emittedCases included", async () => {
    const cms22Cel = resolve(here, "../../../features/cql-pattern-mining/results/models/cms22-split/cms22.cel");
    const r = await client.callTool({
      name: "emit_cel",
      arguments: { path: cms22Cel, includeResources: true },
    });
    assert.ok(!r.isError);
    const out = JSON.parse(r.content[0].text);
    assert.ok(Array.isArray(out.emittedCases), "includeResources:true should expose emittedCases array");
  });

  await check("emit_cel without path → isError", async () => {
    const r = await client.callTool({ name: "emit_cel", arguments: {} });
    assert.equal(r.isError, true);
  });

  await check("emit_cel with nonexistent path → isError", async () => {
    const r = await client.callTool({ name: "emit_cel", arguments: { path: "/nonexistent/never-going-to-exist.cel" } });
    assert.equal(r.isError, true);
  });

  await check("validate_cel via path → 4 CMS corpus files validate clean", async () => {
    const cms22Cel = resolve(here, "../../../features/cql-pattern-mining/results/models/cms22-split/cms22.cel");
    const r = await client.callTool({ name: "validate_cel", arguments: { path: cms22Cel } });
    assert.ok(!r.isError, "should not be a tool error");
    const out = JSON.parse(r.content[0].text);
    assert.equal(
      out.success,
      true,
      `cms22.cel should validate cleanly; got errors: ${JSON.stringify(out.errors).slice(0, 200)}`
    );
    assert.equal(out.errors.length, 0);
    assert.equal(out.warnings.length, 0);
  });

  await check("validate_cel without path → isError", async () => {
    const r = await client.callTool({ name: "validate_cel", arguments: {} });
    assert.equal(r.isError, true);
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
