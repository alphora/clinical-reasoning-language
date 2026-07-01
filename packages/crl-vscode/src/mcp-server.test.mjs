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
  "../../crl/src/tests/regression/testdata/clinical-reasoning-language-example.crl"
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
  await check("MCP tools: 13 registered (…, generate_provenance, validate_provenance, validate_provenance_worklist)", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "authoring_kit",
      "build_crl_ast",
      "emit_cel",
      "emit_cql",
      "emit_crl_fhir",
      "generate_provenance",
      "render_scenario",
      "run_decision",
      "tokenize_crl",
      "validate_cel",
      "validate_crl",
      "validate_provenance",
      "validate_provenance_worklist",
    ]);
  });

  await check("authoring_kit (default stage) → payload + embedded reference validates clean", async () => {
    const r = await client.callTool({ name: "authoring_kit", arguments: {} });
    assert.ok(!r.isError, "should not be a tool error");
    const kit = JSON.parse(r.content[0].text);
    assert.equal(kit.stage, "local-decision-support");
    assert.match(kit.contentHash, /^[0-9a-f]{64}$/);
    // Durable guard that the bundled server carries the full kit (not just a grep) — the 11-artifact set
    // (A criteria-decision + decision + shared determination lib + PA + B source-delegated + C disposition-arbitration).
    assert.deepEqual(kit.referenceArtifacts.map((a) => a.name).sort(), [
      "criteria-decision-reference.cel",
      "criteria-decision-reference.crl",
      "decision-reference.cel",
      "decision-reference.crl",
      "disposition-arbitration-reference.cel",
      "disposition-arbitration-reference.crl",
      "medical-policy-determination.crl",
      "pa-determination-reference.cel",
      "pa-determination-reference.crl",
      "source-delegated-decision-reference.cel",
      "source-delegated-decision-reference.crl",
    ]);
    const crl = kit.referenceArtifacts.find((a) => a.name === "decision-reference.crl").source;
    const v = JSON.parse((await client.callTool({ name: "validate_crl", arguments: { code: crl } })).content[0].text);
    assert.equal(v.success, true, "embedded reference CRL must validate clean through the bundled server");
  });

  await check("authoring_kit unknown stage → isError listing valid stages", async () => {
    const r = await client.callTool({ name: "authoring_kit", arguments: { stage: "emit" } });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /local-decision-support/);
  });

  await check("run_decision via path → dme101-030.cel: 3 cases pass the result-is oracle", async () => {
    const dme101Cel = resolve(here, "../../crl/src/tests/fixtures/policies/dme101-030/dme101-030.cel");
    const r = await client.callTool({ name: "run_decision", arguments: { path: dme101Cel } });
    assert.ok(!r.isError, "should not be a tool error");
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, true);
    assert.equal(out.caseCount, 3);
    assert.equal(out.passCount, 3);
    assert.equal(out.errorCount, 0);
  });

  await check("run_decision without path → isError", async () => {
    const r = await client.callTool({ name: "run_decision", arguments: {} });
    assert.equal(r.isError, true);
  });

  await check("render_scenario via path → dme101-030.cel: view-model envelope through the bundled server", async () => {
    const dme101Cel = resolve(here, "../../crl/src/tests/fixtures/policies/dme101-030/dme101-030.cel");
    const r = await client.callTool({ name: "render_scenario", arguments: { path: dme101Cel } });
    assert.ok(!r.isError, "should not be a tool error");
    const out = JSON.parse(r.content[0].text);
    assert.equal(typeof out.schemaVersion, "number");
    assert.equal(out.success, true);
    assert.equal(out.caseCount, 3);
    assert.ok(out.scenarios[0].tree.every((n) => typeof n.nodeId === "string" && n.source?.range), "tree nodes carry nodeId + source");
  });

  await check("validate_cel via path → cms22.cel validates clean", async () => {
    const cms22Cel = resolve(here, "../../crl/src/tests/fixtures/corpus/cms22/cms22.cel");
    const r = await client.callTool({ name: "validate_cel", arguments: { path: cms22Cel } });
    assert.ok(!r.isError);
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, true, `cms22.cel should validate cleanly; errors: ${JSON.stringify(out.errors).slice(0, 200)}`);
    assert.equal(out.errors.length, 0);
  });

  await check("validate_cel without path → isError", async () => {
    const r = await client.callTool({ name: "validate_cel", arguments: {} });
    assert.equal(r.isError, true);
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

  // --- Cross-file validation (issue #66) ---
  //
  // The cms22 corpus has sibling libraries that reference each other via
  // qualified refs. Single-file validation can't see across files and would
  // flag every cross-library ref as missing-include; project-mode validation
  // resolves them through the resolved-imports graph.
  const cms22Inferred = resolve(
    here,
    "../../crl/src/tests/fixtures/corpus/cms22/cms22-inferred.crl"
  );

  await check("validate_crl via path → project mode resolves sibling libraries", async () => {
    const r = await client.callTool({
      name: "validate_crl",
      arguments: { path: cms22Inferred },
    });
    assert.ok(!r.isError, "should not be a tool error");
    const out = JSON.parse(r.content[0].text);
    assert.equal(
      out.success,
      true,
      `cms22-inferred should validate cleanly in project mode; got errors: ${JSON.stringify(out.errors).slice(0, 200)}`
    );
    assert.equal(out.errors.length, 0);
  });

  // --- #187: catalog CQL must be resolvable in the BUNDLED server ---
  //
  // emit_crl_fhir routes through emitFhirDefFromPath → emitCQLImports +
  // emitFhirDefClosure, which read the three shared catalog `.cql`
  // (CRLCommon/CaseFeatureCommon/FHIRHelpers) via core's loadCatalog. In the
  // esbuild bundle `__dirname` is crl-vscode/dist with no catalog siblings, so
  // without the esbuild catalog-copy step this would ENOENT. Registration-only
  // tests miss it — this INVOKES the tool through the built bundle end-to-end and
  // asserts success + the two emitted catalog Libraries are present.
  await check("emit_crl_fhir via path → emits successfully + catalog Libraries resolve (bundle catalog-copy guard)", async () => {
    const semandCrl = resolve(
      here,
      "../../crl/src/fhir-emitter/tests/golden/example-semand/src/crl/example-semand.crl"
    );
    const r = await client.callTool({
      name: "emit_crl_fhir",
      arguments: { path: semandCrl, date: "2026-01-01T00:00:00.000Z" },
    });
    assert.ok(!r.isError, `emit_crl_fhir should not be a tool error: ${r.content?.[0]?.text?.slice(0, 300)}`);
    const out = JSON.parse(r.content[0].text);
    assert.equal(
      out.success,
      true,
      `example-semand should emit cleanly; errors: ${JSON.stringify(out.errors).slice(0, 400)}`
    );
    // The two always-emitted catalog Libraries prove loadCatalog read the .cql
    // through the bundle (an ENOENT would have flipped success to false with an
    // Exception error before any Library was produced).
    const libNames = out.resourceManifest
      .filter((m) => m.resourceType === "Library")
      .map((m) => m.id);
    assert.ok(libNames.includes("CRLCommon"), `expected CRLCommon Library; got ${JSON.stringify(libNames)}`);
    assert.ok(
      libNames.includes("CaseFeatureCommon"),
      `expected CaseFeatureCommon Library; got ${JSON.stringify(libNames)}`
    );
  });

  await check("validate_crl via inline code → single-file mode (no cross-file context)", async () => {
    // A file that uses qualified refs into a sibling library will be flagged
    // when validated as inline code — there's no project context to resolve
    // against. This is the documented inline-code behavior.
    const code = readFileSync(cms22Inferred, "utf8");
    const r = await client.callTool({ name: "validate_crl", arguments: { code } });
    assert.ok(!r.isError);
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, false, "inline-code mode cannot resolve cross-library refs");
    assert.ok(
      out.errors.some((e) => e.kind === "external-library-not-included"),
      "expected at least one external-library-not-included error in single-file mode"
    );
  });
  // --- Cross-server tool parity (drift guard) ---
  // The CLI server (src/cli/run-mcp-server.ts → dist) and this extension bundle
  // historically drift: a tool added to one but not the other ships a broken
  // VSIX. Spawn BOTH and assert identical tool NAME sets. Requires the root
  // package to be built (dist/cli/run-mcp-server.js present).
  await check("CLI and extension MCP servers expose the identical tool set (drift guard)", async () => {
    const cliServerPath = resolve(here, "../../crl/dist/cli/run-mcp-server.js");
    const cliTransport = new StdioClientTransport({ command: process.execPath, args: [cliServerPath] });
    const cliClient = new Client({ name: "crl-cli-parity", version: "0.0.0" });
    await cliClient.connect(cliTransport);
    try {
      const extNames = (await client.listTools()).tools.map((t) => t.name).sort();
      const cliNames = (await cliClient.listTools()).tools.map((t) => t.name).sort();
      assert.deepEqual(
        extNames,
        cliNames,
        `tool sets diverge — extension: ${JSON.stringify(extNames)} vs CLI: ${JSON.stringify(cliNames)}`,
      );
    } finally {
      await cliClient.close();
    }
  });
} finally {
  await client.close();
}

console.log(failed ? "\ntest:mcp FAILED" : "\ntest:mcp passed");
process.exit(failed ? 1 : 0);
