// Unit tests for the pure provisioning layer (no vscode), run against throwaway
// temp workspaces. Imports the BUILT bundle. Run via `npm run test:provision`.
import * as mod from "../dist/provision.js";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const target = mod.claudeCodeTarget ?? mod.default?.claudeCodeTarget;

let failed = false;
const check = (label, fn) => {
  let ws;
  try {
    ws = mkdtempSync(join(tmpdir(), "crl-prov-"));
    fn(ws);
    console.log(`  ok  ${label}`);
  } catch (e) {
    failed = true;
    console.error(`FAIL  ${label}\n      ${e.stack || e.message}`);
  } finally {
    if (ws) try { rmSync(ws, { recursive: true, force: true }); } catch {}
  }
};

// Context whose server path carries the ownership marker and actually exists
// (apply() pre-flights the bundle's existence).
function ctxFor(ws, version = "0.1.0") {
  const dir = join(ws, "ext", `smiledigitalhealth.crl-language-support-${version}`, "dist");
  mkdirSync(dir, { recursive: true });
  const serverScriptPath = join(dir, "mcp-server.js");
  writeFileSync(serverScriptPath, "// dummy", "utf8");
  return { workspaceRoot: ws, serverScriptPath, extensionVersion: version };
}
const mcp = (ws) => join(ws, ".mcp.json");
const md = (ws) => join(ws, "CLAUDE.md");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

check("apply on empty workspace creates .mcp.json + CLAUDE.md", (ws) => {
  const ctx = ctxFor(ws);
  const r = target.apply(ctx);
  assert.equal(r.mcp, "created");
  assert.equal(r.claudeMd, "created");
  const j = readJson(mcp(ws));
  assert.equal(j.mcpServers.crl.type, "stdio");
  assert.equal(j.mcpServers.crl.command, "node");
  assert.deepEqual(j.mcpServers.crl.args, [ctx.serverScriptPath]);
  assert.equal(j.mcpServers.crl.env, undefined); // never synthesized
  const text = readFileSync(md(ws), "utf8");
  assert.ok(text.includes('crl-tools-start version="0.1.0"'));
  assert.ok(text.includes("crl-tools-end"));
  assert.ok(text.includes("build_crl_ast"));
});

check("apply preserves a pre-existing llm-reviewers entry + sibling key", (ws) => {
  writeFileSync(mcp(ws), JSON.stringify({
    $note: "keep me",
    mcpServers: { "llm-reviewers": { type: "stdio", command: "node", args: ["/x/server.js"], env: { K: "v" } } },
  }, null, 2));
  const r = target.apply(ctxFor(ws));
  assert.equal(r.mcp, "updated");
  const j = readJson(mcp(ws));
  assert.equal(j.$note, "keep me");
  assert.equal(j.mcpServers["llm-reviewers"].args[0], "/x/server.js");
  assert.equal(j.mcpServers["llm-reviewers"].env.K, "v");
  assert.ok(j.mcpServers.crl);
});

check("apply preserves user CLAUDE.md content (append)", (ws) => {
  writeFileSync(md(ws), "# My project\n\nSome notes.\n");
  const r = target.apply(ctxFor(ws));
  assert.equal(r.claudeMd, "appended");
  const text = readFileSync(md(ws), "utf8");
  assert.ok(text.includes("# My project") && text.includes("Some notes."));
  assert.ok(text.includes("crl-tools-start"));
});

check("apply is idempotent", (ws) => {
  const ctx = ctxFor(ws);
  target.apply(ctx);
  const r2 = target.apply(ctx);
  assert.equal(r2.mcp, "unchanged");
  assert.equal(r2.claudeMd, "unchanged");
});

check("malformed .mcp.json → throws, file untouched", (ws) => {
  const bad = "{ not json";
  writeFileSync(mcp(ws), bad);
  assert.throws(() => target.apply(ctxFor(ws)), /not valid JSON/);
  assert.equal(readFileSync(mcp(ws), "utf8"), bad);
});

check("mcpServers not an object → throws", (ws) => {
  writeFileSync(mcp(ws), JSON.stringify({ mcpServers: [] }));
  assert.throws(() => target.apply(ctxFor(ws)), /not an object/);
});

check("version bump refreshes block; same version unchanged", (ws) => {
  target.apply(ctxFor(ws, "0.1.0"));
  assert.equal(target.apply(ctxFor(ws, "0.1.0")).claudeMd, "unchanged");
  assert.equal(target.apply(ctxFor(ws, "0.2.0")).claudeMd, "updated");
  const text = readFileSync(md(ws), "utf8");
  assert.ok(text.includes('version="0.2.0"') && !text.includes('version="0.1.0"'));
});

check("preserves user-pinned command + unknown field; forces args", (ws) => {
  const ctx = ctxFor(ws);
  writeFileSync(mcp(ws), JSON.stringify({
    mcpServers: { crl: { type: "stdio", command: "/usr/local/bin/node", args: ["/old.js"], cwd: "/x" } },
  }, null, 2));
  target.apply(ctx);
  const j = readJson(mcp(ws));
  assert.equal(j.mcpServers.crl.command, "/usr/local/bin/node");
  assert.equal(j.mcpServers.crl.cwd, "/x");
  assert.deepEqual(j.mcpServers.crl.args, [ctx.serverScriptPath]);
});

check("malformed CLAUDE.md markers → skipped + warning", (ws) => {
  writeFileSync(md(ws), '# x\n<!-- crl-tools-start version="0.1.0" -->\nno end\n');
  const r = target.apply(ctxFor(ws));
  assert.equal(r.claudeMd, "skipped");
  assert.ok(r.warnings.some((w) => /malformed/.test(w)));
});

check("stale server path is updated on apply", (ws) => {
  writeFileSync(mcp(ws), JSON.stringify({
    mcpServers: { crl: { type: "stdio", command: "node",
      args: [join(ws, "ext", "smiledigitalhealth.crl-language-support-0.0.9", "dist", "mcp-server.js")] } },
  }, null, 2));
  const ctx = ctxFor(ws, "0.1.0");
  assert.equal(target.apply(ctx).mcp, "updated");
  assert.deepEqual(readJson(mcp(ws)).mcpServers.crl.args, [ctx.serverScriptPath]);
});

check("remove deletes our crl + block, preserves llm-reviewers", (ws) => {
  const ctx = ctxFor(ws);
  target.apply(ctx);
  const j = readJson(mcp(ws));
  j.mcpServers["llm-reviewers"] = { type: "stdio", command: "node", args: ["/r/s.js"] };
  writeFileSync(mcp(ws), JSON.stringify(j, null, 2) + "\n");
  const r = target.remove(ctx);
  assert.equal(r.mcp, "removed");
  assert.equal(r.claudeMd, "removed");
  const j2 = readJson(mcp(ws));
  assert.ok(!j2.mcpServers.crl && j2.mcpServers["llm-reviewers"]);
  assert.ok(!readFileSync(md(ws), "utf8").includes("crl-tools-start"));
});

check("remove does NOT delete a non-managed crl entry", (ws) => {
  writeFileSync(mcp(ws), JSON.stringify({
    mcpServers: { crl: { type: "stdio", command: "node", args: ["/users/own/server.js"] } },
  }, null, 2));
  const r = target.remove(ctxFor(ws));
  assert.equal(r.mcp, "unchanged");
  assert.ok(r.warnings.some((w) => /not managed/.test(w)));
  assert.ok(readJson(mcp(ws)).mcpServers.crl);
});

check("non-object crl entry → throws (refuse to overwrite)", (ws) => {
  writeFileSync(mcp(ws), JSON.stringify({ mcpServers: { crl: "oops" } }));
  assert.throws(() => target.apply(ctxFor(ws)), /not an object/);
});

check("duplicate end marker → skipped + warning", (ws) => {
  writeFileSync(md(ws), '<!-- crl-tools-start version="0.1.0" -->\nx\n<!-- crl-tools-end -->\n<!-- crl-tools-end -->\n');
  const r = target.apply(ctxFor(ws));
  assert.equal(r.claudeMd, "skipped");
  assert.ok(r.warnings.some((w) => /malformed/.test(w)));
});

check("coexists with a vibe-tools orchestrator block (byte-preserved)", (ws) => {
  const vibe = "<!-- vibe-tools-orchestrator-start -->\nVIBE STUFF\n<!-- vibe-tools-orchestrator-end -->";
  writeFileSync(md(ws), "# Proj\n\n" + vibe + "\n");
  const r = target.apply(ctxFor(ws));
  assert.equal(r.claudeMd, "appended");
  const text = readFileSync(md(ws), "utf8");
  assert.ok(text.includes(vibe), "vibe-tools block must be preserved verbatim");
  assert.ok(text.includes("crl-tools-start"));
});

check("remove recognizes ownership with backslash paths", (ws) => {
  const args = ["C:\\ext\\smiledigitalhealth.crl-language-support-0.1.0\\dist\\mcp-server.js"];
  writeFileSync(mcp(ws), JSON.stringify({ mcpServers: { crl: { type: "stdio", command: "node", args } } }, null, 2));
  assert.equal(target.remove(ctxFor(ws)).mcp, "removed");
});

console.log(failed ? "\ntest:provision FAILED" : "\ntest:provision passed");
process.exit(failed ? 1 : 0);
