// Integration test: spawn the BUILT dist/mcp-server.js as a real MCP stdio
// server and drive it with the SDK client. Run via `npm run test:mcp`
// (the script compiles first). Every check shares ONE connected client
// (connected in beforeAll, closed in afterAll), so the checks are
// `test.sequential` — they must not interleave against the single client.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

// Minimal real `.docx` (a ZIP with one `word/document.xml`) — enough for the server's canonicalizer.
function crc32(buf) {
  let c = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function makeDocx(text) {
  const name = "word/document.xml";
  const xml =
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
  const data = Buffer.from(xml, "utf8");
  const comp = deflateRawSync(data);
  const crc = crc32(data);
  const nameB = Buffer.from(name, "utf8");
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8);
  lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(nameB.length, 26);
  const local = Buffer.concat([lh, nameB, comp]);
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10);
  ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24);
  ch.writeUInt16LE(nameB.length, 28); ch.writeUInt32LE(0, 42);
  const central = Buffer.concat([ch, nameB]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, eocd]);
}

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(here, "../dist/mcp-server.js");
const fixturePath = resolve(
  here,
  "../../crl/src/tests/regression/testdata/clinical-reasoning-language-example.crl"
);
const BOM = String.fromCharCode(0xfeff);

const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath] });
const client = new Client({ name: "crl-test", version: "0.0.0" });

// Explicit sequential (not relying on vitest's default in-file ordering): all checks drive the ONE shared client.
const check = test.sequential;

let connected = false;
beforeAll(async () => {
  await client.connect(transport);
  connected = true;
});
afterAll(async () => {
  // Only close if connect actually succeeded — an unconditional close on a never-connected client would throw in
  // afterAll and mask the real (connect) failure.
  if (connected) await client.close();
});

check("MCP tools: 19 registered (+ canonicalize_source; + #237/T3 check_fhir_ids)", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "authoring_kit",
      "build_crl_ast",
      "canonicalize_source",
      "check_fhir_ids",
      "create_flag",
      "emit_cel",
      "emit_cql",
      "emit_crl",
      "emit_crl_fhir",
      "generate_provenance",
      "normalize_provenance",
      "render_scenario",
      "run_decision",
      "set_flag_status",
      "tokenize_crl",
      "validate_cel",
      "validate_crl",
      "validate_provenance",
      "validate_provenance_worklist",
    ]);
  });

check("canonicalize_source: a missing `in` path → tool error (isError)", async () => {
  const r = await client.callTool({ name: "canonicalize_source", arguments: { in: "/no/such/file.docx" } });
  assert.ok(r.isError, "an unreadable `in` path is a tool error");
  assert.match(r.content[0].text, /not readable|is not a file/);
});

check("canonicalize_source: a real .docx → writes .txt + .anchormeta.json + returns textHash (round-trip through the BUILT server)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "canon-"));
  const docxPath = join(dir, "src.docx");
  writeFileSync(docxPath, makeDocx("Hello world"));
  const r = await client.callTool({ name: "canonicalize_source", arguments: { in: docxPath } });
  assert.ok(!r.isError, `not a tool error: ${r.content?.[0]?.text}`);
  const out = JSON.parse(r.content[0].text);
  assert.equal(out.success, true);
  const txtPath = join(dir, "src.txt");
  const metaPath = join(dir, "src.anchormeta.json");
  assert.equal(out.textPath, txtPath, "default .txt path derives from the input");
  assert.equal(out.metaPath, metaPath, "sidecar sits beside the .txt");
  assert.ok(existsSync(txtPath) && existsSync(metaPath), "wrote BOTH files");
  assert.equal(readFileSync(txtPath, "utf8"), "Hello world", "the canonical text");
  assert.match(out.textHash, /^sha256:[0-9a-f]{64}$/, "sha256 textHash");
  assert.equal(out.offsetUnit, "utf8-byte");
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  assert.equal(meta.textHash, out.textHash, "sidecar textHash == summary textHash");
});

check("authoring_kit (default = cpg base) → PA-free payload + embedded reference validates clean", async () => {
    const r = await client.callTool({ name: "authoring_kit", arguments: {} });
    assert.ok(!r.isError, "should not be a tool error");
    const kit = JSON.parse(r.content[0].text);
    assert.equal(kit.stage, "local-decision-support");
    assert.equal(kit.useCase, "cpg"); // omitted useCase → the neutral base, NOT PA (#191, fail-loud)
    assert.deepEqual(kit.chain, ["cpg"]);
    assert.match(kit.contentHash, /^[0-9a-f]{64}$/);
    // The bundled server ships the un-fused cpg base — the PA-FREE artifact set (pure-CDS decision + patient-age).
    assert.deepEqual(kit.referenceArtifacts.map((a) => a.name).sort(), [
      "decision-reference.cel",
      "decision-reference.crl",
      "patient-age-both-rep-reference.crl",
      "representation-reference.crl",
    ]);
    // No PA content leaked into the base bundle.
    assert.ok(!JSON.stringify(kit).match(/Medical Policy Determination|Pended|HCR01/), "cpg base must be PA-free");
    const crl = kit.referenceArtifacts.find((a) => a.name === "decision-reference.crl").source;
    const v = JSON.parse((await client.callTool({ name: "validate_crl", arguments: { code: crl } })).content[0].text);
    assert.equal(v.success, true, "embedded reference CRL must validate clean through the bundled server");
  });

check("authoring_kit useCase:'prior-auth' → the full inherited 11-artifact set + dispositionModel", async () => {
    const r = await client.callTool({ name: "authoring_kit", arguments: { useCase: "prior-auth" } });
    assert.ok(!r.isError, "should not be a tool error");
    const kit = JSON.parse(r.content[0].text);
    assert.equal(kit.useCase, "prior-auth");
    assert.deepEqual(kit.chain, ["cpg", "prior-auth"]);
    // Durable guard that the bundled server carries the full PA kit — the 11-artifact set (config-driven; the shared
    // medical-policy-determination.crl was removed — determinations are now local `<category>.<key>` activities).
    assert.deepEqual(kit.referenceArtifacts.map((a) => a.name).sort(), [
      "criteria-decision-reference.cel",
      "criteria-decision-reference.crl",
      "decision-reference.cel",
      "decision-reference.crl",
      "disposition-arbitration-reference.cel",
      "disposition-arbitration-reference.crl",
      "pa-determination-reference.cel",
      "pa-determination-reference.crl",
      "patient-age-both-rep-reference.crl",
      "representation-reference.crl",
      "source-delegated-decision-reference.cel",
      "source-delegated-decision-reference.crl",
    ]);
    assert.ok(!kit.referenceArtifacts.some((a) => a.name === "medical-policy-determination.crl"));
    assert.ok(!kit.facets, "advisory facets are retired");
    assert.ok(kit.dispositionModel && kit.dispositionModel.categories.length === 3, "prior-auth surfaces the dispositionModel (3 categories)");
  });

check("authoring_kit unknown stage → isError listing valid stages", async () => {
    const r = await client.callTool({ name: "authoring_kit", arguments: { stage: "emit" } });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /local-decision-support/);
  });

check("authoring_kit unknown useCase → isError listing valid useCases", async () => {
    const r = await client.callTool({ name: "authoring_kit", arguments: { useCase: "measure" } });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /Unknown authoring useCase|cpg|prior-auth/);
  });

check("run_decision via path → dme101-030.cel: 3 cases pass the result-is oracle", async () => {
    const dme101Cel = resolve(here, "../../crl/src/tests/fixtures/policies/dme101-030/dme101-030.cel");
    const r = await client.callTool({ name: "run_decision", arguments: { path: dme101Cel } });
    assert.ok(!r.isError, "should not be a tool error");
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, true);
    assert.equal(out.caseCount, 3);
    assert.equal(out.passCount, 3);
    assert.equal(out.errorCount, 0);
  });

check("run_decision without path → isError", async () => {
    const r = await client.callTool({ name: "run_decision", arguments: {} });
    assert.equal(r.isError, true);
  });

check("render_scenario via path → dme101-030.cel: view-model envelope through the bundled server", async () => {
    const dme101Cel = resolve(here, "../../crl/src/tests/fixtures/policies/dme101-030/dme101-030.cel");
    const r = await client.callTool({ name: "render_scenario", arguments: { path: dme101Cel } });
    assert.ok(!r.isError, "should not be a tool error");
    const out = JSON.parse(r.content[0].text);
    assert.equal(typeof out.schemaVersion, "number");
    assert.equal(out.success, true);
    assert.equal(out.caseCount, 3);
    assert.ok(out.scenarios[0].tree.every((n) => typeof n.nodeId === "string" && n.source?.range), "tree nodes carry nodeId + source");
  });

check("validate_cel via path → cms22.cel validates clean", async () => {
    const cms22Cel = resolve(here, "../../crl/src/tests/fixtures/corpus/cms22/cms22.cel");
    const r = await client.callTool({ name: "validate_cel", arguments: { path: cms22Cel } });
    assert.ok(!r.isError);
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, true, `cms22.cel should validate cleanly; errors: ${JSON.stringify(out.errors).slice(0, 200)}`);
    assert.equal(out.errors.length, 0);
  });

check("validate_cel without path → isError", async () => {
    const r = await client.callTool({ name: "validate_cel", arguments: {} });
    assert.equal(r.isError, true);
  });

check("build_crl_ast via path → valid AST with expected structure", async () => {
    const r = await client.callTool({ name: "build_crl_ast", arguments: { path: fixturePath } });
    assert.ok(!r.isError, "should not be a tool error");
    const ast = JSON.parse(r.content[0].text);
    assert.equal(ast.success, true);
    assert.equal(ast.result.type, "CRL");
    assert.equal(ast.result.library?.name, "CMS69 BMI Screening GPG Strategy example");
    assert.equal(ast.result.statements[0].type, "Decision");
    assert.equal(ast.result.statements[0].name, "CMS69 BMI Screening Strategy");
  });

check("tokenize_crl via code → tokens", async () => {
    const code = readFileSync(fixturePath, "utf8");
    const r = await client.callTool({ name: "tokenize_crl", arguments: { code } });
    assert.ok(!r.isError);
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, true);
    assert.ok(Array.isArray(out.result) && out.result.length > 0);
  });

check("malformed CRL → success:false content, NOT a tool error", async () => {
    const r = await client.callTool({ name: "build_crl_ast", arguments: { code: "@@@ not valid" } });
    assert.ok(!r.isError, "malformed CRL is a normal result");
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, false);
    assert.ok(Array.isArray(out.errors) && out.errors.length > 0);
  });

check("both code+path → isError", async () => {
    const r = await client.callTool({ name: "tokenize_crl", arguments: { code: "x", path: "y" } });
    assert.equal(r.isError, true);
  });

check("neither code nor path → isError", async () => {
    const r = await client.callTool({ name: "tokenize_crl", arguments: {} });
    assert.equal(r.isError, true);
  });

check("nonexistent path → isError (not a crash)", async () => {
    const r = await client.callTool({ name: "build_crl_ast", arguments: { path: "/no/such/file.crl" } });
    assert.equal(r.isError, true);
  });

check("directory path → isError (not a crash)", async () => {
    const r = await client.callTool({ name: "build_crl_ast", arguments: { path: here } });
    assert.equal(r.isError, true);
  });

check("oversized inline code → isError", async () => {
    const r = await client.callTool({ name: "tokenize_crl", arguments: { code: "x".repeat(1_000_001) } });
    assert.equal(r.isError, true);
  });

check("empty code → success:false content, NOT a tool error", async () => {
    const r = await client.callTool({ name: "build_crl_ast", arguments: { code: "" } });
    assert.ok(!r.isError, "empty code is a degenerate document, not bad input");
    const out = JSON.parse(r.content[0].text);
    assert.equal(typeof out.success, "boolean");
  });

check("leading BOM is stripped → parses like the fixture", async () => {
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

check("validate_crl via path → project mode resolves sibling libraries", async () => {
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
check("emit_crl_fhir via path → emits successfully + catalog Libraries resolve (bundle catalog-copy guard)", async () => {
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

  // emit_crl (two-lane) returns BOTH the CQL closure AND the FHIR resources in one
  // call, through the SAME shared emitCrlTwoLane the CLI uses. Exercised on the
  // patient-age BOTH-REPRESENTATION fixture — the case emit_cql "direct" mode
  // rejects — proving the layered lane lowers it and both lanes come back.
check("emit_crl via path → both-rep patient-age emits BOTH cql.libraries AND fhir resources", async () => {
    const patientAgeCrl = resolve(
      here,
      "../../crl/src/fhir-emitter/tests/fixtures/patient-age/src/crl/patient-age.crl"
    );
    const r = await client.callTool({
      name: "emit_crl",
      arguments: { path: patientAgeCrl, date: "2026-01-01T00:00:00.000Z" },
    });
    assert.ok(!r.isError, `emit_crl should not be a tool error: ${r.content?.[0]?.text?.slice(0, 300)}`);
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, true, `emit_crl should succeed; hardErrors: ${JSON.stringify(out.hardErrors).slice(0, 400)}`);
    // CQL lane: the closure the FHIR Libraries reference (with full source to write to disk).
    assert.ok(Array.isArray(out.cql?.libraries) && out.cql.libraries.length > 0, "cql.libraries must be non-empty");
    assert.ok(
      out.cql.libraries.every((l) => typeof l.outputFilename === "string" && typeof l.cql === "string"),
      "each cql library carries { outputFilename, cql }"
    );
    // FHIR lane: resources emitted alongside, in the same call.
    assert.ok(out.fhir?.resourceCount > 0, "fhir.resourceCount must be > 0");
    assert.equal(out.filenameCollisions.length, 0, "no CQL filename collisions");
  });

check("validate_crl via inline code → single-file mode (no cross-file context)", async () => {
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
  // --- #224 criterion + compound-guard: the BUNDLE must parse/validate the new
  // grammar (the previously-shipped bundle FAILS on `when (`). These inline-code
  // checks are the "don't release shit" functional gate before the KE handoff. ---
  const CRIT_VALID = [
    "# Criterion functional",
    'library "CritFn".',
    'concept "Has Qualifying Diagnosis":',
    "- type is Observation.",
    "- value type is boolean.",
    "- code is `dx`.",
    'concept "Failed Drug Therapy":',
    "- type is Observation.",
    "- value type is boolean.",
    "- code is `fdt`.",
    'concept "Failed Physical Therapy":',
    "- type is Observation.",
    "- value type is boolean.",
    "- code is `fpt`.",
    'concept "Failed Conservative Therapy":',
    "- value type is boolean.",
    '- defined as ( "Failed Drug Therapy" sem-or "Failed Physical Therapy" ).',
    'concept "Imaging Not Recent":',
    "- type is Observation.",
    "- value type is boolean.",
    "- code is `inr`.",
    'criterion "Meets Coverage Preconditions":',
    '- when ( "Has Qualifying Diagnosis" and "Failed Conservative Therapy" ).',
    'decision "Advanced Imaging Coverage":',
    "first:",
    '- when ( "Meets Coverage Preconditions" and "Imaging Not Recent" ) then recommend activity "Approve".',
    '- otherwise then recommend activity "Deny".',
    'activity "Approve":',
    "- request CPGServiceRequest.",
    "- with `ok`.",
    'activity "Deny":',
    "- request CPGCommunicationRequest.",
    "- with `no`.",
  ].join("\n");

check("#224 build_crl_ast (code) → the bundle parses `criterion` + compound `when (` guard", async () => {
    const r = await client.callTool({ name: "build_crl_ast", arguments: { code: CRIT_VALID } });
    assert.ok(!r.isError, "criterion doc is a normal result");
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, true, `bundle must parse criterion/compound grammar; errors: ${JSON.stringify(out.errors ?? []).slice(0, 300)}`);
    const kinds = out.result.statements.map((s) => s.type);
    assert.ok(kinds.includes("Criterion"), `expected a Criterion statement; got ${JSON.stringify(kinds)}`);
    assert.ok(kinds.includes("Decision"));
  });

check("#224 validate_crl (code) → a valid criterion doc validates clean through the bundle", async () => {
    const r = await client.callTool({ name: "validate_crl", arguments: { code: CRIT_VALID } });
    assert.ok(!r.isError);
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, true, `valid criterion doc should validate; errors: ${JSON.stringify(out.errors ?? []).slice(0, 300)}`);
  });

check("#224 validate_crl (code) → a mixed bare `and`/`or` guard is rejected (compound-guard builder is live)", async () => {
    const bad = CRIT_VALID.replace(
      '- when ( "Meets Coverage Preconditions" and "Imaging Not Recent" ) then recommend activity "Approve".',
      '- when "Meets Coverage Preconditions" or "Imaging Not Recent" and "Has Qualifying Diagnosis" then recommend activity "Approve".',
    );
    const r = await client.callTool({ name: "validate_crl", arguments: { code: bad } });
    assert.ok(!r.isError, "a mixed-bare guard is a normal (failing) result, not a tool error");
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, false);
    assert.ok(
      JSON.stringify(out.errors).match(/requires parentheses|parenthesize/i),
      `expected a mixed-guard parentheses diagnostic; got ${JSON.stringify(out.errors).slice(0, 300)}`,
    );
  });

check("#224 validate_crl (code) → a criterion name in a `defined as` slot → criterion-misuse", async () => {
    const misuse = [
      "# misuse",
      'library "Mis".',
      'concept "A":',
      "- type is Observation.",
      "- code is `a`.",
      'criterion "Gate":',
      '- when ( "A" ).',
      'concept "Bad":',
      '- defined as ( "Gate" sem-or "A" ).',
      'decision "D":',
      "first:",
      '- when "Bad" then recommend activity "Act".',
      '- otherwise then recommend activity "Act".',
      'activity "Act":',
      "- request CPGServiceRequest.",
      "- with `ok`.",
    ].join("\n");
    const r = await client.callTool({ name: "validate_crl", arguments: { code: misuse } });
    assert.ok(!r.isError);
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, false);
    assert.ok(
      out.errors.some((e) => e.kind === "criterion-misuse"),
      `expected a criterion-misuse error; got ${JSON.stringify(out.errors).slice(0, 300)}`,
    );
  });

  // --- Cross-server tool parity (drift guard) ---
  // The CLI server (src/cli/run-mcp-server.ts → dist) and this extension bundle
  // historically drift: a tool added to one but not the other ships a broken
  // VSIX. Spawn BOTH and assert identical tool NAME sets. Requires the root
  // package to be built (dist/cli/run-mcp-server.js present).
check("CLI and extension MCP servers expose the identical tool set (drift guard)", async () => {
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
