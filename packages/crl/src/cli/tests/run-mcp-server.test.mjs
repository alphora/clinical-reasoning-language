// Integration test: spawn dist/cli/run-mcp-server.js as a real MCP stdio
// server and drive it with the SDK client. Mirrors extension/src/mcp-server.test.mjs
// but exercises the npm-package bin (`crl-mcp`) rather than the bundled
// extension copy. Run via `npm run test:mcp` (compiles first).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";

// #212/#230 — the flag tools write the `medical-validation/flags/` STORE, located from a `.crl` path via the enclosing policy
// `src/` (an ancestor `src/` with a `provenance/` child). Build a minimal on-disk policy so `path` resolves + the store lands.
const CONCEPT_CRL = 'library "L".\nconcept "C":\n- type is Observation.\n- code is `c`.';
function mkPolicy(crlText = CONCEPT_CRL) {
  const root = mkdtempSync(join(tmpdir(), "crlmcp-"));
  mkdirSync(join(root, "src", "provenance"), { recursive: true });
  mkdirSync(join(root, "src", "crl"), { recursive: true });
  const crlPath = join(root, "src", "crl", "L.crl");
  writeFileSync(crlPath, crlText, "utf8");
  return { root, crlPath, storeDir: join(root, "src", "medical-validation", "flags") };
}
const storeFlags = (storeDir) => {
  try {
    return readdirSync(storeDir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(storeDir, f), "utf8")));
  } catch {
    return [];
  }
};

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(here, "../../../dist/cli/run-mcp-server.js");
const cms22Inferred = resolve(
  here,
  "../../../src/tests/fixtures/corpus/cms22/cms22-inferred.crl"
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
  await check("MCP tools: 18 registered (+ #205 write-half create_flag / set_flag_status; + #17 canonicalize_source; + #250 E normalize_provenance)", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "authoring_kit",
      "build_crl_ast",
      "canonicalize_source",
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

  await check("create_flag → writes a concept flag store record (MvFlag shape: tag/anchor.scope/status; NO source)", async () => {
    const { root, crlPath, storeDir } = mkPolicy();
    const r = await client.callTool({ name: "create_flag", arguments: { path: crlPath, kind: "concept", name: "C", tag: "validation-concern", gist: "looks off for the customer" } });
    assert.ok(!r.isError, "not a tool error");
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, true);
    assert.equal(out.source, undefined, "no rewritten source — the tool writes the store");
    assert.equal(out.flag.tag, "validation-concern"); // MvFlag.tag (was FlagInstance.canonicalTag)
    assert.equal(out.flag.anchor.scope, "concept"); // MvFlag.anchor.scope (was FlagInstance.scope)
    assert.equal(out.flag.status, "open");
    const onDisk = storeFlags(storeDir);
    assert.equal(onDisk.length, 1, "one <id>.json written under medical-validation/flags/");
    assert.equal(onDisk[0].id, out.flag.id);
    assert.ok(!existsSync(join(root, ".crl")), "#230: the new writer creates NO `.crl/` dir at the artifact root (regression lock)");
  });

  await check("create_flag → #230 REFUSES while a legacy `.crl/flags/` store still has records (migration guard, split-brain prevention)", async () => {
    const { root, crlPath } = mkPolicy();
    const legacyDir = join(root, ".crl", "flags"); // the OLD, untracked location
    mkdirSync(legacyDir, { recursive: true });
    const legacyRec = { schemaVersion: 1, id: "legacy1", category: "validation", tag: "validation-concern", gist: "stranded", status: "open", fields: {}, anchor: { scope: "concept", name: "C", label: "C" }, createdAt: "2026-07-13T00:00:00.000Z" };
    writeFileSync(join(legacyDir, "legacy1.json"), JSON.stringify(legacyRec), "utf8");
    const r = await client.callTool({ name: "create_flag", arguments: { path: crlPath, kind: "concept", name: "C", tag: "validation-concern", gist: "new one" } });
    assert.ok(!r.isError, "a domain result, not a tool error");
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, false);
    assert.equal(out.reason, "legacy-flag-store-present");
    assert.equal(storeFlags(join(root, "src", "medical-validation", "flags")).length, 0, "nothing written to the new store while the legacy store blocks");
  });

  await check("set_flag_status → #230 REFUSES while a legacy `.crl/flags/` store still has records (same guard as create_flag)", async () => {
    const { root, crlPath } = mkPolicy();
    const legacyDir = join(root, ".crl", "flags");
    mkdirSync(legacyDir, { recursive: true });
    const legacyRec = { schemaVersion: 1, id: "legacy2", category: "validation", tag: "validation-concern", gist: "stranded", status: "open", fields: {}, anchor: { scope: "concept", name: "C", label: "C" }, createdAt: "2026-07-13T00:00:00.000Z" };
    writeFileSync(join(legacyDir, "legacy2.json"), JSON.stringify(legacyRec), "utf8");
    const r = await client.callTool({ name: "set_flag_status", arguments: { path: crlPath, scope: "concept", name: "C", tag: "validation-concern", status: "resolved" } });
    assert.ok(!r.isError, "a domain result, not a tool error");
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, false);
    assert.equal(out.reason, "legacy-flag-store-present");
  });

  await check("create_flag → inline `code` is rejected (a store can't be located without a path)", async () => {
    const r = await client.callTool({ name: "create_flag", arguments: { code: CONCEPT_CRL, kind: "concept", name: "C", tag: "validation-concern", gist: "x" } });
    assert.ok(r.isError, "code-only → tool error (Decision B)");
    assert.match(r.content[0].text, /can't locate a flag store|pass `path`/);
  });

  await check("create_flag → the returned flag.fields carries registry fields", async () => {
    const { crlPath } = mkPolicy();
    const r = await client.callTool({ name: "create_flag", arguments: { path: crlPath, kind: "concept", name: "C", tag: "fidelity-defect", gist: "over-reach", fields: { direction: "over-reach" } } });
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, true);
    assert.equal(out.flag.fields.direction, "over-reach");
  });

  await check("create_flag → library scope writes a library-anchored record", async () => {
    const { crlPath } = mkPolicy();
    const r = await client.callTool({ name: "create_flag", arguments: { path: crlPath, kind: "library", name: "L", tag: "internal-inconsistency", gist: "sections contradict" } });
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, true);
    assert.equal(out.flag.anchor.scope, "library");
  });

  await check("create_flag → a missing required field is a typed domain result (not a tool error), no file written", async () => {
    const { crlPath, storeDir } = mkPolicy();
    const r = await client.callTool({ name: "create_flag", arguments: { path: crlPath, kind: "concept", name: "C", tag: "fidelity-defect", gist: "over-reach" } });
    assert.ok(!r.isError, "domain failures are content, not tool errors");
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, false);
    assert.equal(out.reason, "missing-field");
    assert.equal(storeFlags(storeDir).length, 0, "no record written on validation failure");
  });

  await check("create_flag → a retry with the same content is IDEMPOTENT (deduped, not a second record)", async () => {
    const { crlPath, storeDir } = mkPolicy();
    const args = { path: crlPath, kind: "concept", name: "C", tag: "validation-concern", gist: "same finding" };
    const a = JSON.parse((await client.callTool({ name: "create_flag", arguments: args })).content[0].text);
    const b = JSON.parse((await client.callTool({ name: "create_flag", arguments: args })).content[0].text);
    assert.equal(b.success, true);
    assert.equal(b.deduped, true, "the retry returns the existing record");
    assert.equal(b.flag.id, a.flag.id);
    assert.equal(storeFlags(storeDir).length, 1, "still one record");
  });

  await check("set_flag_status → flips a store record open→resolved by selector (via path)", async () => {
    const { crlPath, storeDir } = mkPolicy();
    await client.callTool({ name: "create_flag", arguments: { path: crlPath, kind: "concept", name: "C", tag: "open-fork", gist: "unsure" } });
    const r = await client.callTool({ name: "set_flag_status", arguments: { path: crlPath, scope: "concept", name: "C", tag: "open-fork", status: "resolved" } });
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, true);
    assert.equal(out.changed, true);
    assert.equal(out.flag.status, "resolved");
    assert.equal(storeFlags(storeDir)[0].status, "resolved", "the on-disk record flipped");
  });

  await check("set_flag_status → not-found for a flag that isn't in the store", async () => {
    const { crlPath } = mkPolicy();
    const out = JSON.parse((await client.callTool({ name: "set_flag_status", arguments: { path: crlPath, scope: "concept", name: "C", tag: "open-fork", status: "resolved" } })).content[0].text);
    assert.equal(out.success, false);
    assert.equal(out.reason, "not-found");
  });

  await check("set_flag_status → already at status → changed:false (no write)", async () => {
    const { crlPath } = mkPolicy();
    await client.callTool({ name: "create_flag", arguments: { path: crlPath, kind: "concept", name: "C", tag: "validation-concern", gist: "x" } });
    const out = JSON.parse((await client.callTool({ name: "set_flag_status", arguments: { path: crlPath, scope: "concept", name: "C", tag: "validation-concern", status: "open" } })).content[0].text);
    assert.equal(out.success, true);
    assert.equal(out.changed, false);
  });

  await check("set_flag_status → resolves a flag by a tag ALIAS (over-reach-to-fix → fidelity-defect)", async () => {
    const { crlPath } = mkPolicy();
    await client.callTool({ name: "create_flag", arguments: { path: crlPath, kind: "concept", name: "C", tag: "fidelity-defect", gist: "over", fields: { direction: "over-reach" } } });
    const out = JSON.parse((await client.callTool({ name: "set_flag_status", arguments: { path: crlPath, scope: "concept", name: "C", tag: "over-reach-to-fix", status: "resolved" } })).content[0].text);
    assert.equal(out.success, true, "the alias canonicalizes to fidelity-defect");
    assert.equal(out.changed, true);
  });

  await check("set_flag_status → two same-tag flags → ambiguous + candidates; `id` disambiguates", async () => {
    const { crlPath } = mkPolicy();
    // two distinct fidelity-defect flags on C (different direction → different dedupKey → both created)
    await client.callTool({ name: "create_flag", arguments: { path: crlPath, kind: "concept", name: "C", tag: "fidelity-defect", gist: "g", fields: { direction: "over-reach" } } });
    await client.callTool({ name: "create_flag", arguments: { path: crlPath, kind: "concept", name: "C", tag: "fidelity-defect", gist: "g", fields: { direction: "criterion-drop" } } });
    const amb = JSON.parse((await client.callTool({ name: "set_flag_status", arguments: { path: crlPath, scope: "concept", name: "C", tag: "fidelity-defect", status: "resolved" } })).content[0].text);
    assert.equal(amb.success, false);
    assert.equal(amb.reason, "ambiguous");
    assert.equal(amb.candidates.length, 2);
    const one = JSON.parse((await client.callTool({ name: "set_flag_status", arguments: { path: crlPath, scope: "concept", name: "C", tag: "fidelity-defect", id: amb.candidates[0].id, status: "resolved" } })).content[0].text);
    assert.equal(one.success, true);
    assert.equal(one.changed, true);
    assert.equal(one.flag.id, amb.candidates[0].id);
  });

  await check("create_flag → a multi-line gist is accepted (the validator allows newlines)", async () => {
    const { crlPath } = mkPolicy();
    const out = JSON.parse((await client.callTool({ name: "create_flag", arguments: { path: crlPath, kind: "concept", name: "C", tag: "validation-concern", gist: "line one\nline two" } })).content[0].text);
    assert.equal(out.success, true);
    assert.match(out.flag.gist, /line one\nline two/);
  });

  await check("authoring_kit (default = cpg base) → PA-free local-decision-support payload", async () => {
    const r = await client.callTool({ name: "authoring_kit", arguments: {} });
    assert.ok(!r.isError, "should not be a tool error");
    const kit = JSON.parse(r.content[0].text);
    assert.equal(kit.stage, "local-decision-support");
    assert.equal(kit.useCase, "cpg"); // omitted useCase → the neutral base, NOT PA (#191)
    assert.deepEqual(kit.chain, ["cpg"]);
    assert.equal(typeof kit.schemaVersion, "string");
    assert.match(kit.contentHash, /^[0-9a-f]{64}$/);
    assert.ok(Array.isArray(kit.rules) && kit.rules.length > 0);
    assert.ok(Array.isArray(kit.typeAllowlist.conceptTypes) && kit.typeAllowlist.conceptTypes.includes("Condition"));
    // The un-fused cpg base carries only the PA-FREE artifacts (pure-CDS decision + patient-age).
    const refNames = kit.referenceArtifacts.map((a) => a.name).sort();
    assert.deepEqual(refNames, [
      "decision-reference.cel",
      "decision-reference.crl",
      "patient-age-both-rep-reference.crl",
    ]);
    assert.ok(!JSON.stringify(kit).match(/Medical Policy Determination|Pended|HCR01/), "cpg base must be PA-free");
    assert.ok(kit.verifyLoop.doesNotProve.length > 0, "verifyLoop must state what a green run does NOT prove");
    // 1.4: the `useCase` specialization axis (#191). Pin the SCHEMA + the cpg-base hash — a bundle drift is caught here too.
    assert.equal(kit.schemaVersion, "1.15"); // …/#212 4c flags→store (1.10) … / #215 (1.13) / #230 flags→medical-validation store (1.14) / #250 derivedFrom gate teaching (1.15)
    assert.equal(kit.contentHash, "ab98184979e6483a33dd8fb610a1cd106dd03fd89d8f2b86f3eae8fd6b14d83c");
    assert.ok(Array.isArray(kit.forceModel.levels) && kit.forceModel.levels.length === 3, "forceModel must carry the 3 force levels");
    assert.ok(Array.isArray(kit.judgeLens.composition) && kit.judgeLens.composition.length > 0, "judgeLens.composition must be present");
    // `defined as` inference is in-scope this stage (#126, #168); predicates/external out.
    const scopeOf = (frag) => kit.conceptLayerModel.find((e) => e.form.includes(frag))?.scope;
    assert.equal(scopeOf("defined as"), "in");
    assert.equal(scopeOf("definition is"), "out");
  });

  await check("authoring_kit useCase:'prior-auth' → the full inherited PA kit + pinned hash", async () => {
    const r = await client.callTool({ name: "authoring_kit", arguments: { useCase: "prior-auth" } });
    assert.ok(!r.isError, "should not be a tool error");
    const kit = JSON.parse(r.content[0].text);
    assert.equal(kit.useCase, "prior-auth");
    assert.deepEqual(kit.chain, ["cpg", "prior-auth"]);
    assert.equal(kit.schemaVersion, "1.15");
    // Sibling KE (PA) agents pin BOTH schemaVersion + the prior-auth contentHash via MCP — pin it here too.
    assert.equal(kit.contentHash, "2dcc5468eac3ecbe64b0b2a4cf1aabb9d194b375d912f3839c882f1630354f57");
    const refNames = kit.referenceArtifacts.map((a) => a.name).sort();
    assert.equal(refNames.length, 11); // shared medical-policy-determination.crl removed (config-driven local activities)
    assert.ok(!refNames.includes("medical-policy-determination.crl"));
    assert.ok(!kit.facets, "advisory facets are retired");
    assert.ok(kit.dispositionModel && kit.dispositionModel.categories.length === 3, "prior-auth surfaces the dispositionModel (3 categories)");
  });

  await check("authoring_kit embedded decision-reference.crl validates clean via validate_crl", async () => {
    const kit = JSON.parse((await client.callTool({ name: "authoring_kit", arguments: {} })).content[0].text);
    const crl = kit.referenceArtifacts.find((a) => a.name === "decision-reference.crl").source;
    const r = await client.callTool({ name: "validate_crl", arguments: { code: crl } });
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, true, `embedded reference CRL must validate clean; errors: ${JSON.stringify(out.errors ?? []).slice(0, 200)}`);
  });

  await check("emit_cql via inline code → runs without a tool error (the kit's decision-reference.crl)", async () => {
    const kit = JSON.parse((await client.callTool({ name: "authoring_kit", arguments: {} })).content[0].text);
    const crl = kit.referenceArtifacts.find((a) => a.name === "decision-reference.crl").source;
    const r = await client.callTool({ name: "emit_cql", arguments: { code: crl } });
    assert.ok(!r.isError, `emit_cql should not be a tool error; got ${r.content?.[0]?.text?.slice(0, 200)}`);
    assert.ok((r.content?.[0]?.text?.length ?? 0) > 0, "emit_cql should return content");
  });

  await check("emit_cql with neither code nor path → isError", async () => {
    const r = await client.callTool({ name: "emit_cql", arguments: {} });
    assert.equal(r.isError, true);
  });

  await check("emit_crl_fhir without path → isError", async () => {
    const r = await client.callTool({ name: "emit_crl_fhir", arguments: {} });
    assert.equal(r.isError, true);
  });

  await check("authoring_kit with unknown stage → isError listing valid stages", async () => {
    const r = await client.callTool({ name: "authoring_kit", arguments: { stage: "emit" } });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /local-decision-support/);
  });

  await check("run_decision via path → dme101-030.cel: 3 cases pass the result-is oracle", async () => {
    const dme101Cel = resolve(here, "../../../src/tests/fixtures/policies/dme101-030/dme101-030.cel");
    const r = await client.callTool({ name: "run_decision", arguments: { path: dme101Cel } });
    assert.ok(!r.isError, "should not be a tool error");
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.success, true);
    assert.equal(out.caseCount, 3);
    assert.equal(out.passCount, 3);
    assert.equal(out.failCount, 0);
    assert.equal(out.errorCount, 0);
    assert.ok(Array.isArray(out.runs));
    assert.ok(Array.isArray(out.importDiagnostics));
  });

  await check("run_decision with case filter → runs only the named case", async () => {
    const dme101Cel = resolve(here, "../../../src/tests/fixtures/policies/dme101-030/dme101-030.cel");
    const all = JSON.parse(
      (await client.callTool({ name: "run_decision", arguments: { path: dme101Cel } })).content[0].text,
    );
    const one = all.runs[0].case;
    const r = await client.callTool({ name: "run_decision", arguments: { path: dme101Cel, case: one } });
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.caseCount, 1);
    assert.equal(out.runs[0].case, one);
  });

  await check("run_decision without path → isError", async () => {
    const r = await client.callTool({ name: "run_decision", arguments: {} });
    assert.equal(r.isError, true);
  });

  await check("run_decision with nonexistent path → isError", async () => {
    const r = await client.callTool({ name: "run_decision", arguments: { path: "/nonexistent/never.cel" } });
    assert.equal(r.isError, true);
  });

  await check("render_scenario via path → dme101-030.cel: view-model envelope (schemaVersion + tree)", async () => {
    const dme101Cel = resolve(here, "../../../src/tests/fixtures/policies/dme101-030/dme101-030.cel");
    const r = await client.callTool({ name: "render_scenario", arguments: { path: dme101Cel } });
    assert.ok(!r.isError, "should not be a tool error");
    const out = JSON.parse(r.content[0].text);
    assert.equal(typeof out.schemaVersion, "number");
    assert.equal(out.success, true);
    assert.equal(out.caseCount, 3);
    assert.ok(Array.isArray(out.scenarios) && out.scenarios.length === 3);
    const sc = out.scenarios[0];
    assert.ok(Array.isArray(sc.tree), "each scenario carries a decision tree");
    assert.ok(sc.tree.every((n) => typeof n.nodeId === "string" && n.source && n.source.range), "tree nodes carry nodeId + source");
  });

  await check("render_scenario with case filter → one scenario", async () => {
    const dme101Cel = resolve(here, "../../../src/tests/fixtures/policies/dme101-030/dme101-030.cel");
    const all = JSON.parse((await client.callTool({ name: "render_scenario", arguments: { path: dme101Cel } })).content[0].text);
    const one = all.scenarios[0].case.name;
    const r = await client.callTool({ name: "render_scenario", arguments: { path: dme101Cel, case: one } });
    const out = JSON.parse(r.content[0].text);
    assert.equal(out.caseCount, 1);
    assert.equal(out.scenarios[0].case.name, one);
  });

  await check("render_scenario without path → isError", async () => {
    const r = await client.callTool({ name: "render_scenario", arguments: {} });
    assert.equal(r.isError, true);
  });

  await check("emit_cel via path → cms22.cel returns summary envelope with cases", async () => {
    const cms22Cel = resolve(here, "../../../src/tests/fixtures/corpus/cms22/cms22.cel");
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
    const cms22Cel = resolve(here, "../../../src/tests/fixtures/corpus/cms22/cms22.cel");
    const r = await client.callTool({
      name: "emit_cel",
      arguments: { path: cms22Cel, includeResources: true },
    });
    assert.ok(!r.isError);
    const out = JSON.parse(r.content[0].text);
    assert.ok(Array.isArray(out.emittedCases), "includeResources:true should expose emittedCases array");
  });

  await check("emit_cel with out (absolute) → writes the FHIR tree + returns an absolute `written` manifest", async () => {
    const { mkdtempSync, rmSync, existsSync } = await import("node:fs");
    const os = await import("node:os");
    const cms22Cel = resolve(here, "../../../src/tests/fixtures/corpus/cms22/cms22.cel");
    const outDir = mkdtempSync(resolve(os.tmpdir(), "mcp-emitcel-out-"));
    try {
      const r = await client.callTool({ name: "emit_cel", arguments: { path: cms22Cel, out: outDir } });
      assert.ok(!r.isError, "should not be a tool error");
      const out = JSON.parse(r.content[0].text);
      assert.equal(out.success, true);
      assert.ok(Array.isArray(out.written), "written[] present when out is set");
      assert.equal(out.written.length, out.resourceCount, "one written path per emitted resource");
      assert.ok(out.written.every((p) => resolve(p) === p), "written paths are absolute");
      assert.ok(out.written.every((p) => existsSync(p)), "every written path exists on disk");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  await check("emit_cel with a RELATIVE out → isError (server CWD is not the workspace)", async () => {
    const cms22Cel = resolve(here, "../../../src/tests/fixtures/corpus/cms22/cms22.cel");
    const r = await client.callTool({ name: "emit_cel", arguments: { path: cms22Cel, out: "relative/out" } });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /ABSOLUTE/);
  });

  await check("emit_cel WITHOUT out → no `written` field (byte-identical to today's summary)", async () => {
    const cms22Cel = resolve(here, "../../../src/tests/fixtures/corpus/cms22/cms22.cel");
    const out = JSON.parse((await client.callTool({ name: "emit_cel", arguments: { path: cms22Cel } })).content[0].text);
    assert.equal("written" in out, false, "no out → no written key at all (not null)");
  });

  await check("emit_crl with out (absolute) → writes both lanes, omits CQL bodies, returns { cql, fhir } manifest", async () => {
    const { mkdtempSync, rmSync, existsSync } = await import("node:fs");
    const os = await import("node:os");
    const cms22Crl = resolve(here, "../../../src/tests/fixtures/corpus/cms22/cms22.crl");
    const outDir = mkdtempSync(resolve(os.tmpdir(), "mcp-emitcrl-out-"));
    try {
      const r = await client.callTool({ name: "emit_crl", arguments: { path: cms22Crl, out: outDir } });
      assert.ok(!r.isError, `should not be a tool error; got ${r.content?.[0]?.text?.slice(0, 200)}`);
      const out = JSON.parse(r.content[0].text);
      assert.equal(out.success, true);
      assert.ok(out.written && Array.isArray(out.written.cql) && Array.isArray(out.written.fhir), "written.{cql,fhir} arrays");
      assert.ok(out.written.cql.length > 0 && out.written.fhir.length > 0, "both lanes wrote at least one file");
      assert.ok([...out.written.cql, ...out.written.fhir].every((p) => existsSync(p)), "every written path exists");
      // Body suppression: with out set, cql.libraries carries filenames only, NOT the full source.
      assert.ok(out.cql.libraries.every((l) => l.cql === undefined), "cql bodies omitted when out is set");
      assert.ok(out.cql.libraries.every((l) => typeof l.outputFilename === "string"), "outputFilename retained");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  await check("emit_crl with a RELATIVE out → isError", async () => {
    const cms22Crl = resolve(here, "../../../src/tests/fixtures/corpus/cms22/cms22.crl");
    const r = await client.callTool({ name: "emit_crl", arguments: { path: cms22Crl, out: "relative/out" } });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /ABSOLUTE/);
  });

  await check("emit_crl WITHOUT out → full cql.libraries bodies retained, no `written` field", async () => {
    const cms22Crl = resolve(here, "../../../src/tests/fixtures/corpus/cms22/cms22.crl");
    const out = JSON.parse((await client.callTool({ name: "emit_crl", arguments: { path: cms22Crl } })).content[0].text);
    assert.equal("written" in out, false, "no out → no written key");
    assert.ok(out.cql.libraries.every((l) => typeof l.cql === "string"), "no out → full CQL sources present");
  });

  await check("emit_crl with out on a hard-error .crl → written:null, nothing written, CQL bodies RETAINED", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } = await import("node:fs");
    const os = await import("node:os");
    const root = mkdtempSync(resolve(os.tmpdir(), "mcp-crl-gatefail-"));
    try {
      writeFileSync(resolve(root, "package.json"), JSON.stringify({ name: "x", version: "1.0.0" }));
      const crlPath = resolve(root, "bad.crl");
      writeFileSync(crlPath, "this is not valid CRL syntax @@@ {{{"); // parse failure → cql lane !success
      const outDir = resolve(root, "gen");
      const out = JSON.parse((await client.callTool({ name: "emit_crl", arguments: { path: crlPath, out: outDir } })).content[0].text);
      assert.equal(out.success, false, "a parse-failing .crl does not succeed");
      assert.equal(out.written, null, "gate blocked → written:null (the two.cql.success term)");
      assert.equal(existsSync(resolve(outDir, "cql")), false, "nothing written: no <out>/cql");
      assert.equal(existsSync(resolve(outDir, "fhir")), false, "nothing written: no <out>/fhir");
      // On gate-fail the successfully-emitted bodies are NOT withheld (they aren't on disk).
      assert.ok(out.cql.libraries.every((l) => "cql" in l), "gate-fail retains cql bodies, does not suppress");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  await check("emit_cel with out on an error-diagnostic .cel → written:null, nothing written", async () => {
    const { mkdtempSync, writeFileSync, rmSync, existsSync } = await import("node:fs");
    const os = await import("node:os");
    const root = mkdtempSync(resolve(os.tmpdir(), "mcp-cel-gatefail-"));
    try {
      writeFileSync(resolve(root, "package.json"), JSON.stringify({ name: "x", version: "1.0.0" }));
      const celPath = resolve(root, "bad.cel");
      writeFileSync(celPath, "this is not valid CEL @@@ {{{"); // precondition-failed (error severity)
      const outDir = resolve(root, "gen");
      const out = JSON.parse((await client.callTool({ name: "emit_cel", arguments: { path: celPath, out: outDir } })).content[0].text);
      assert.equal(out.success, false, "an error-diagnostic .cel does not succeed");
      assert.equal(out.written, null, "gate blocked → written:null");
      assert.equal(existsSync(outDir), false, "nothing written: <out> not created");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  await check("emit_cel / emit_crl with a whitespace-only out → isError (validateOutDir)", async () => {
    const cms22Cel = resolve(here, "../../../src/tests/fixtures/corpus/cms22/cms22.cel");
    const cms22Crl = resolve(here, "../../../src/tests/fixtures/corpus/cms22/cms22.crl");
    const a = await client.callTool({ name: "emit_cel", arguments: { path: cms22Cel, out: "   " } });
    assert.equal(a.isError, true);
    const b = await client.callTool({ name: "emit_crl", arguments: { path: cms22Crl, out: "   " } });
    assert.equal(b.isError, true);
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
    const cms22Cel = resolve(here, "../../../src/tests/fixtures/corpus/cms22/cms22.cel");
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
      arguments: { path: cms22Inferred },
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

  await check("validate_provenance with nonexistent artifact → isError", async () => {
    const dme101Cel = resolve(here, "../../../src/tests/fixtures/policies/dme101-030/dme101-030.cel");
    const r = await client.callTool({
      name: "validate_provenance",
      arguments: { artifact: resolve(here, "no-such-artifact.json"), cel: dme101Cel, anchor: dme101Cel },
    });
    assert.equal(r.isError, true);
  });

  await check("validate_provenance via paths → dme101-030: empty artifact yields findings (over-reach + unacknowledged)", async () => {
    const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
    const { createHash } = await import("node:crypto");
    const os = await import("node:os");
    const dme101Cel = resolve(here, "../../../src/tests/fixtures/policies/dme101-030/dme101-030.cel");
    const tmp = mkdtempSync(resolve(os.tmpdir(), "mcp-prov-"));
    try {
      const anchorText = "Some policy narrative text.";
      const anchorPath = resolve(tmp, "anchor.txt");
      writeFileSync(anchorPath, anchorText);
      // #250 H: a well-formed Model-A anchor-self record (schemaVersion 1.1 + marker) — the CURRENT producer shape.
      // derivedFrom points at the anchor this test writes and derivedFromHash === textHash (the anchor-self tell), so the
      // NOW-ENFORCED derivedFrom gate emits ZERO derived-from findings; the only residue is the attribution backlog this
      // case is about. (Pre-H this stub carried a filler `derivedFrom:"x.docx"` + `sha256:0` oracle, which the flip would
      // turn into hard errors and break the worklist-pass assertion below — see disc 390.)
      const textHash = "sha256:" + createHash("sha256").update(Buffer.from(anchorText, "utf8")).digest("hex");
      const meta = {
        path: "anchor.txt", derivedFrom: "anchor.txt", derivedFromHash: textHash, derivedFromContract: "anchor-self",
        canonicalizer: "crl-anchor-docx-text", canonicalizerVersion: "1.0.0",
        textHash,
        offsetUnit: "utf8-byte", unicodeNormalization: "NFC", rangeConvention: "half-open",
      };
      const artifactPath = resolve(tmp, "artifact.json");
      writeFileSync(artifactPath, JSON.stringify({ schemaVersion: "1.1", policyId: "DME101.030", policyVersion: "1", anchorSource: meta, items: [], ignoredRanges: [], clusters: [] }));
      const r = await client.callTool({ name: "validate_provenance", arguments: { artifact: artifactPath, cel: dme101Cel, anchor: anchorPath } });
      assert.ok(!r.isError, "should not be a tool error");
      const out = JSON.parse(r.content[0].text);
      assert.equal(out.pass, false, "empty artifact must not pass");
      assert.ok(out.findings.some((f) => f.kind === "over-reach"), "expected over-reach findings");
      assert.ok(out.findings.some((f) => f.kind === "uncovered-span"), "expected the unacknowledged anchor text");
      assert.ok(out.findings.every((f) => !f.kind.startsWith("derived-from")), "#250 H: a well-formed anchor-self record emits no derived-from findings (final mode)");

      // validate_provenance_worklist (in-progress) on the SAME fresh scaffold: the attribution backlog re-grades to
      // "warning" → pass true, while validate_provenance (final) above reported errors. Integrity findings still surface.
      const w = await client.callTool({ name: "validate_provenance_worklist", arguments: { artifact: artifactPath, cel: dme101Cel, anchor: anchorPath } });
      assert.ok(!w.isError, "worklist should not be a tool error");
      const wout = JSON.parse(w.content[0].text);
      assert.equal(wout.pass, true, "worklist mode: a fresh scaffold's attribution backlog is non-blocking → passes");
      assert.equal(wout.errorCount, 0, "worklist mode: no error-severity findings on a fresh scaffold");
      assert.ok(wout.worklistCount > 0, "worklist mode: the attribution backlog is counted");
      assert.ok(wout.findings.every((f) => f.class !== "attribution" || f.severity === "warning"), "attribution findings graded warning in worklist");
      assert.match(wout.remaining, /remaining work/, "worklist envelope carries the remaining-work note");
      assert.ok(wout.findings.every((f) => !f.kind.startsWith("derived-from")), "#250 H: no derived-from findings on the anchor-self scaffold (worklist mode) — the gate is enforced but this record is clean");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  await check("generate_provenance with nonexistent anchor → isError", async () => {
    const dme101Cel = resolve(here, "../../../src/tests/fixtures/policies/dme101-030/dme101-030.cel");
    const r = await client.callTool({
      name: "generate_provenance",
      arguments: { cel: dme101Cel, anchor: resolve(here, "no-such-anchor.txt") },
    });
    assert.equal(r.isError, true);
  });

  await check("generate_provenance via paths → dme101-030: SUMMARY envelope (counts, no artifact by default)", async () => {
    const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
    const os = await import("node:os");
    const dme101Cel = resolve(here, "../../../src/tests/fixtures/policies/dme101-030/dme101-030.cel");
    const tmp = mkdtempSync(resolve(os.tmpdir(), "mcp-gen-"));
    try {
      const anchorPath = resolve(tmp, "anchor.txt");
      writeFileSync(anchorPath, "Some policy narrative text.\n");
      const r = await client.callTool({ name: "generate_provenance", arguments: { cel: dme101Cel, anchor: anchorPath } });
      assert.ok(!r.isError, "should not be a tool error");
      const out = JSON.parse(r.content[0].text);
      assert.equal(out.success, true);
      assert.equal(typeof out.policyId, "string");
      assert.equal(out.policyVersion, "1");
      assert.ok(out.clusterCount > 0, "expected at least one cluster");
      assert.equal(typeof out.diagnosticCountsByKind, "object", "summary carries diagnostic counts by kind");
      assert.ok(Object.keys(out.diagnosticCountsByKind).length > 0, "expected worklist diagnostics");
      assert.equal(out.merged, false);
      assert.equal(out.artifact, undefined, "summary envelope must NOT include the full artifact by default");
      assert.equal(out.mergeDiagnosticCountsByKind, undefined, "no merge channel without existingArtifact");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  await check("generate_provenance with includeArtifact:true → full artifact included (Model A: no items)", async () => {
    const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
    const os = await import("node:os");
    const dme101Cel = resolve(here, "../../../src/tests/fixtures/policies/dme101-030/dme101-030.cel");
    const tmp = mkdtempSync(resolve(os.tmpdir(), "mcp-gen-full-"));
    try {
      const anchorPath = resolve(tmp, "anchor.txt");
      writeFileSync(anchorPath, "Some policy narrative text.\n");
      const r = await client.callTool({ name: "generate_provenance", arguments: { cel: dme101Cel, anchor: anchorPath, includeArtifact: true } });
      assert.ok(!r.isError, "should not be a tool error");
      const out = JSON.parse(r.content[0].text);
      assert.equal(out.artifact.schemaVersion, "1.1"); // #250 A: generate now stamps the marker-bearing envelope
      assert.equal(out.artifact.anchorSource.derivedFromContract, "anchor-self", "#250 A: Model-A marker");
      assert.equal(out.artifact.anchorSource.derivedFrom, "anchor.txt", "#250 A: carrier-relative (colocated)");
      assert.ok(
        Array.isArray(out.advisories) && out.advisories.length > 0,
        "#250 A: inline generate advises the derivedFrom is anchor-dir-relative (persist elsewhere → normalize)",
      );
      assert.equal(out.artifact.items.length, 0, "Model A: scaffold emits no items");
      assert.ok(out.artifact.clusters.length > 0, "expected at least one cluster");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  await check("generate_provenance with existingArtifact → merge channel + pre-merge baseline note", async () => {
    const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
    const os = await import("node:os");
    const dme101Cel = resolve(here, "../../../src/tests/fixtures/policies/dme101-030/dme101-030.cel");
    const tmp = mkdtempSync(resolve(os.tmpdir(), "mcp-gen-merge-"));
    try {
      const anchorPath = resolve(tmp, "anchor.txt");
      writeFileSync(anchorPath, "Some policy narrative text.\n");
      // First generate a fresh scaffold WITH the full artifact, persist it, then re-generate merging onto it.
      const first = JSON.parse(
        (await client.callTool({ name: "generate_provenance", arguments: { cel: dme101Cel, anchor: anchorPath, includeArtifact: true } })).content[0].text,
      );
      const existingPath = resolve(tmp, "existing.json");
      writeFileSync(existingPath, JSON.stringify(first.artifact));
      const r = await client.callTool({
        name: "generate_provenance",
        arguments: { cel: dme101Cel, anchor: anchorPath, existingArtifact: existingPath },
      });
      assert.ok(!r.isError, "should not be a tool error");
      const out = JSON.parse(r.content[0].text);
      assert.equal(out.success, true);
      assert.equal(out.merged, true);
      assert.equal(typeof out.mergeDiagnosticCountsByKind, "object", "merge channel counts must be present when merging");
      assert.match(out.note, /pre-merge baseline/, "merged summary must carry the pre-merge baseline note");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  await check("canonicalize_source with a non-.docx input → DOMAIN success:false envelope (NOT isError), writes nothing", async () => {
    const { writeFileSync, mkdtempSync, rmSync, existsSync } = await import("node:fs");
    const os = await import("node:os");
    const tmp = mkdtempSync(resolve(os.tmpdir(), "mcp-canon-"));
    try {
      const inPath = resolve(tmp, "bad.docx");
      writeFileSync(inPath, "not a zip"); // fail-closed canonicalization (not a valid .docx/ZIP)
      const r = await client.callTool({ name: "canonicalize_source", arguments: { in: inPath } });
      // A fail-closed canonicalization is a DOMAIN result, not a tool error (mirrors validate_* success:false).
      assert.ok(!r.isError, "a fail-closed canonicalization must NOT be an isError envelope");
      const out = JSON.parse(r.content[0].text);
      assert.equal(out.success, false, "domain envelope reports success:false");
      assert.ok(out.error && typeof out.error.kind === "string", "the structured canonicalize error is surfaced");
      assert.ok(!existsSync(resolve(tmp, "bad.txt")), "no .txt written on a fail-closed canonicalization");
      assert.ok(!existsSync(resolve(tmp, "bad.anchormeta.json")), "no sidecar written");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  await check("canonicalize_source operational failure → isError envelope (a .txt input self-overwrites → stage paths)", async () => {
    const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
    const os = await import("node:os");
    const tmp = mkdtempSync(resolve(os.tmpdir(), "mcp-canon-paths-"));
    try {
      // A `.txt` input: the default text-output derivation collides with the input → the path guard rejects it BEFORE
      // any content is read as a .docx. This exercises the OPERATIONAL (isError) MCP mapping without a valid .docx buffer.
      const inPath = resolve(tmp, "already.txt");
      writeFileSync(inPath, "plain text, not a docx");
      const r = await client.callTool({ name: "canonicalize_source", arguments: { in: inPath } });
      assert.equal(r.isError, true, "an operational (paths) failure must be an isError envelope");
      assert.match(r.content[0].text, /failed \[paths\]/, "the envelope names the paths stage");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  await check("normalize_provenance → repairs a dead anchor-self derivedFrom (1.0 → 1.1 + marker), success:true fullyNormalized", async () => {
    const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
    const os = await import("node:os");
    const { createHash } = await import("node:crypto");
    const tmp = mkdtempSync(resolve(os.tmpdir(), "mcp-norm-"));
    try {
      const anchor = Buffer.from("canonical anchor text\n", "utf8");
      writeFileSync(resolve(tmp, "anchor.txt"), anchor);
      const textHash = "sha256:" + createHash("sha256").update(anchor).digest("hex");
      const artPath = resolve(tmp, "art.json");
      const anchorSource = { path: "anchor.txt", derivedFrom: "/gone/worktree/anchor.txt", derivedFromHash: textHash, textHash, canonicalizer: "crl-anchor-docx-text", canonicalizerVersion: "1.0.0", offsetUnit: "utf8-byte", unicodeNormalization: "NFC", rangeConvention: "half-open" };
      writeFileSync(artPath, JSON.stringify({ schemaVersion: "1.0", policyId: "P", policyVersion: "1", anchorSource, items: [], ignoredRanges: [], clusters: [] }, null, 2) + "\n");
      const r = await client.callTool({ name: "normalize_provenance", arguments: { artifact: artPath } });
      assert.ok(!r.isError, "a domain result (repair succeeded), not a tool error");
      const out = JSON.parse(r.content[0].text);
      assert.equal(out.success, true);
      assert.equal(out.fullyNormalized, true, "normalization is complete (validation still required to clear the gate)");
      const onDisk = JSON.parse(readFileSync(artPath, "utf8"));
      assert.equal(onDisk.schemaVersion, "1.1");
      assert.equal(onDisk.anchorSource.derivedFrom, "anchor.txt");
      assert.equal(onDisk.anchorSource.derivedFromContract, "anchor-self");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  await check("normalize_provenance → a dead upstream path is WORKLISTED (fullyNormalized:false), byte-untouched", async () => {
    const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
    const os = await import("node:os");
    const { createHash } = await import("node:crypto");
    const tmp = mkdtempSync(resolve(os.tmpdir(), "mcp-norm-wl-"));
    try {
      const docxHash = "sha256:" + createHash("sha256").update(Buffer.from("docx", "utf8")).digest("hex");
      const textHash = "sha256:" + createHash("sha256").update(Buffer.from("text", "utf8")).digest("hex");
      const sidePath = resolve(tmp, "anchor.anchormeta.json");
      const body = JSON.stringify({ path: "anchor.txt", derivedFrom: "/gone/source.docx", derivedFromHash: docxHash, textHash, canonicalizer: "crl-anchor-docx-text", canonicalizerVersion: "1.0.0", offsetUnit: "utf8-byte", unicodeNormalization: "NFC", rangeConvention: "half-open", warnings: [] }, null, 2) + "\n";
      writeFileSync(sidePath, body);
      const r = await client.callTool({ name: "normalize_provenance", arguments: { sidecar: sidePath } });
      assert.ok(!r.isError, "a worklist is a domain outcome, not a tool error");
      const out = JSON.parse(r.content[0].text);
      assert.equal(out.fullyNormalized, false);
      assert.equal(out.worklist[0].reason, "dead-path-needs-discovery");
      assert.equal(readFileSync(sidePath, "utf8"), body, "left byte-untouched");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  await check("normalize_provenance → searchRoot relocates a DEAD upstream path by hash (E2), rewrites carrier-relative", async () => {
    const { writeFileSync, mkdirSync, mkdtempSync, rmSync } = await import("node:fs");
    const os = await import("node:os");
    const { createHash } = await import("node:crypto");
    const tmp = mkdtempSync(resolve(os.tmpdir(), "mcp-norm-disc-"));
    try {
      const docx = Buffer.from("PK the lost upstream docx", "utf8");
      const docxHash = "sha256:" + createHash("sha256").update(docx).digest("hex");
      const textHash = "sha256:" + createHash("sha256").update(Buffer.from("text", "utf8")).digest("hex");
      mkdirSync(resolve(tmp, "found"), { recursive: true });
      writeFileSync(resolve(tmp, "found", "source.docx"), docx); // the source, relocated
      const sidePath = resolve(tmp, "anchor.anchormeta.json");
      writeFileSync(sidePath, JSON.stringify({ path: "anchor.txt", derivedFrom: "/gone/worktree/source.docx", derivedFromHash: docxHash, textHash, canonicalizer: "crl-anchor-docx-text", canonicalizerVersion: "1.0.0", offsetUnit: "utf8-byte", unicodeNormalization: "NFC", rangeConvention: "half-open", warnings: [] }, null, 2) + "\n");
      const r = await client.callTool({ name: "normalize_provenance", arguments: { sidecar: sidePath, searchRoot: tmp } });
      assert.ok(!r.isError, "a domain result (relocated), not a tool error");
      const out = JSON.parse(r.content[0].text);
      assert.equal(out.fullyNormalized, true, "the dead path was relocated + normalized");
      const onDisk = JSON.parse(readFileSync(sidePath, "utf8"));
      assert.equal(onDisk.derivedFrom, "found/source.docx", "rewritten carrier-relative POSIX to the discovered file");
      assert.equal(onDisk.derivedFromContract, "upstream-source");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  await check("crl-normalize-provenance CLI → exit codes 0 (normalized) / 2 (residue) / 1 (bad args)", async () => {
    const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
    const os = await import("node:os");
    const { createHash } = await import("node:crypto");
    const { execFileSync } = await import("node:child_process");
    const cliPath = resolve(here, "../../../dist/cli/run-normalize-provenance.js");
    // Runs the built CLI; returns its exit code (execFileSync throws on non-zero, carrying `.status`).
    const runCli = (args) => {
      try {
        execFileSync(process.execPath, [cliPath, ...args], { stdio: "pipe" });
        return 0;
      } catch (e) {
        return e.status;
      }
    };
    const tmp = mkdtempSync(resolve(os.tmpdir(), "cli-norm-"));
    try {
      const anchor = Buffer.from("anchor\n", "utf8");
      writeFileSync(resolve(tmp, "anchor.txt"), anchor);
      const textHash = "sha256:" + createHash("sha256").update(anchor).digest("hex");
      const src = { path: "anchor.txt", derivedFrom: "/gone/anchor.txt", derivedFromHash: textHash, textHash, canonicalizer: "crl-anchor-docx-text", canonicalizerVersion: "1.0.0", offsetUnit: "utf8-byte", unicodeNormalization: "NFC", rangeConvention: "half-open" };
      const artPath = resolve(tmp, "art.json");
      writeFileSync(artPath, JSON.stringify({ schemaVersion: "1.0", policyId: "P", policyVersion: "1", anchorSource: src, items: [], ignoredRanges: [], clusters: [] }, null, 2) + "\n");
      assert.equal(runCli(["--artifact", artPath]), 0, "closed-form repair → exit 0");

      // Residue: a sidecar with a dead upstream path is worklisted → exit 2 (even in --dry-run).
      const dBytes = Buffer.from("d", "utf8");
      const docxHash = "sha256:" + createHash("sha256").update(dBytes).digest("hex");
      const sidePath = resolve(tmp, "s.anchormeta.json");
      writeFileSync(sidePath, JSON.stringify({ path: "a.txt", derivedFrom: "/gone/s.docx", derivedFromHash: docxHash, textHash: "sha256:" + createHash("sha256").update(Buffer.from("t", "utf8")).digest("hex"), canonicalizer: "c", canonicalizerVersion: "1", offsetUnit: "utf8-byte", unicodeNormalization: "NFC", rangeConvention: "half-open", warnings: [] }, null, 2) + "\n");
      assert.equal(runCli(["--sidecar", sidePath, "--dry-run"]), 2, "worklist residue → exit 2");

      // E2: with the source placed under --search-root, the same dead path is relocated → exit 0.
      writeFileSync(resolve(tmp, "s.docx"), dBytes); // basename "s.docx" matches derivedFrom "/gone/s.docx"
      assert.equal(runCli(["--sidecar", sidePath, "--search-root", tmp]), 0, "dead path relocated under --search-root → exit 0");

      assert.equal(runCli([]), 1, "no carrier arg → exit 1");
      assert.equal(runCli(["--sidecar", sidePath, "--anchor", resolve(tmp, "anchor.txt")]), 1, "--anchor with --sidecar → exit 1");
      assert.equal(runCli(["--sidecar", sidePath, "--search-root"]), 1, "--search-root without a value → exit 1");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
} finally {
  await client.close();
}

console.log(failed ? "\nrun-mcp-server.test FAILED" : "\nrun-mcp-server.test passed");
process.exit(failed ? 1 : 0);
