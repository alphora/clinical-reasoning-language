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
  await check("MCP tools: 14 registered (…, validate_provenance, validate_provenance_worklist, generate_provenance)", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "authoring_kit",
      "build_crl_ast",
      "emit_cel",
      "emit_cql",
      "emit_crl",
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
    assert.equal(kit.schemaVersion, "1.5");
    assert.equal(kit.contentHash, "746b84a0a2f546f8081aab1173dfbaa4e4b81480b622f211585d6a6f9cd79924");
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
    assert.equal(kit.schemaVersion, "1.5");
    // Sibling KE (PA) agents pin BOTH schemaVersion + the prior-auth contentHash via MCP — pin it here too.
    assert.equal(kit.contentHash, "3dd25589a5467070182dd7f8d1fa8927e8a441a77fc2b920983b045775a3e744");
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
      const meta = {
        path: "anchor.txt", derivedFrom: "x.docx", derivedFromHash: "sha256:0",
        canonicalizer: "crl-anchor-docx-text", canonicalizerVersion: "1.0.0",
        textHash: "sha256:" + createHash("sha256").update(Buffer.from(anchorText, "utf8")).digest("hex"),
        offsetUnit: "utf8-byte", unicodeNormalization: "NFC", rangeConvention: "half-open",
      };
      const artifactPath = resolve(tmp, "artifact.json");
      writeFileSync(artifactPath, JSON.stringify({ schemaVersion: "1.0", policyId: "DME101.030", policyVersion: "1", anchorSource: meta, items: [], ignoredRanges: [], clusters: [] }));
      const r = await client.callTool({ name: "validate_provenance", arguments: { artifact: artifactPath, cel: dme101Cel, anchor: anchorPath } });
      assert.ok(!r.isError, "should not be a tool error");
      const out = JSON.parse(r.content[0].text);
      assert.equal(out.pass, false, "empty artifact must not pass");
      assert.ok(out.findings.some((f) => f.kind === "over-reach"), "expected over-reach findings");
      assert.ok(out.findings.some((f) => f.kind === "uncovered-span"), "expected the unacknowledged anchor text");

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
      assert.equal(out.artifact.schemaVersion, "1.0");
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
} finally {
  await client.close();
}

console.log(failed ? "\nrun-mcp-server.test FAILED" : "\nrun-mcp-server.test passed");
process.exit(failed ? 1 : 0);
