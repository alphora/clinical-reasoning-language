// Unit tests for the pure provisioning layer (no vscode), run against throwaway
// temp workspaces. Imports the BUILT bundle. Run via `npm run test:provision`.
import * as mod from "../dist/provision.js";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const target = mod.claudeCodeTarget ?? mod.default?.claudeCodeTarget;

// Fixture-wrapping check: each test gets its own throwaway temp workspace (passed to `fn`), cleaned in `finally`.
const check = (label, fn) =>
  test(label, () => {
    const ws = mkdtempSync(join(tmpdir(), "crl-prov-"));
    try {
      fn(ws);
    } finally {
      try {
        rmSync(ws, { recursive: true, force: true });
      } catch {}
    }
  });

// Context whose server path carries the ownership marker and actually exists
// (apply() pre-flights the bundle's existence).
function ctxFor(ws, version = "0.1.0") {
  const dir = join(ws, "ext", `smiledigitalhealth.crl-language-support-${version}`, "dist");
  mkdirSync(dir, { recursive: true });
  const serverScriptPath = join(dir, "mcp-server.js");
  writeFileSync(serverScriptPath, "// dummy", "utf8");
  // enableResults defaults OFF here, matching the setting default; tests that care pass it explicitly.
  return { workspaceRoot: ws, serverScriptPath, enableResults: false }; // version param still shapes the server DIR path (ownership marker), not the CLAUDE.md block
}
const mcp = (ws) => join(ws, ".mcp.json");
const md = (ws) => join(ws, "CLAUDE.md");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

// ── consent-based provisioning: the pure decision layer (disc 369) ──────────────────────────────────────────────────
const { resolveAutoProvisionMode, decideProvisioning, isProvisionedByPath } = mod;

test("resolveAutoProvisionMode: boolean back-compat + enum passthrough + safe default", () => {
  assert.equal(resolveAutoProvisionMode(true), "always"); // old default → preserves observed silent-provision behavior
  assert.equal(resolveAutoProvisionMode(false), "never");
  assert.equal(resolveAutoProvisionMode("prompt"), "prompt");
  assert.equal(resolveAutoProvisionMode("always"), "always");
  assert.equal(resolveAutoProvisionMode("never"), "never");
  assert.equal(resolveAutoProvisionMode(undefined), "prompt"); // unset → the new default
  assert.equal(resolveAutoProvisionMode("garbage"), "prompt");
  assert.equal(resolveAutoProvisionMode(0), "prompt");
});

test("decideProvisioning: a per-workspace decision WINS over mode; mode governs only undecided workspaces", () => {
  for (const m of ["prompt", "always", "never"]) {
    // "never" beats every mode (incl. "always" — a crl.remove can't be silently undone)
    assert.equal(decideProvisioning(m, "never", false), "skip", `never/${m}`);
    assert.equal(decideProvisioning(m, "never", true), "skip", `never/${m}/prov`);
    // "installed" keeps refreshing under every mode (incl. "never")
    assert.equal(decideProvisioning(m, "installed", false), "silent", `installed/${m}`);
  }
  // undecided: mode drives it
  assert.equal(decideProvisioning("never", undefined, false), "skip");
  assert.equal(decideProvisioning("never", undefined, true), "skip"); // never doesn't refresh even an existing entry
  assert.equal(decideProvisioning("always", undefined, false), "silent");
  // undecided + prompt: alreadyProvisioned (this machine) → silent migration-refresh; else → defer to the relevance check
  assert.equal(decideProvisioning("prompt", undefined, true), "silent");
  assert.equal(decideProvisioning("prompt", undefined, false), "check-relevance");
});

check("isProvisionedByPath: true ONLY for our owned entry at THIS machine's path (foreign clone / non-owned / malformed → false)", (ws) => {
  const ours = join(ws, "gs", "smiledigitalhealth.crl-language-support", "mcp-server.js"); // this machine's staged path (carries the marker)
  const foreign = join(ws, "other", "smiledigitalhealth.crl-language-support", "mcp-server.js"); // a teammate's committed path (owned, different location)
  // absent .mcp.json
  assert.equal(isProvisionedByPath(ws, ours), false);
  // our owned entry at our path → true; but the SAME file checked against a foreign expected path → false (the clone case)
  writeFileSync(mcp(ws), JSON.stringify({ mcpServers: { crl: { type: "stdio", command: "node", args: [ours] } } }));
  assert.equal(isProvisionedByPath(ws, ours), true);
  assert.equal(isProvisionedByPath(ws, foreign), false); // fresh clone: entry points at author's path, not ours → offer, don't silent-write
  // a NON-owned `crl` server (user's own, no ownership marker) → false even if the path matches
  const userOwn = join(ws, "my", "crl-server.js");
  writeFileSync(mcp(ws), JSON.stringify({ mcpServers: { crl: { type: "stdio", command: "node", args: [userOwn] } } }));
  assert.equal(isProvisionedByPath(ws, userOwn), false);
  // malformed .mcp.json → false (never crashes; the apply path surfaces the refuse-to-touch on opt-in)
  writeFileSync(mcp(ws), "{ not json");
  assert.equal(isProvisionedByPath(ws, ours), false);
});

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
  assert.ok(text.includes("<!-- crl-tools-start -->")); // disc 371: versionless marker (no per-version churn)
  assert.ok(!/crl-tools-start version=/.test(text)); // never stamps a version
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

check("CLAUDE.md block is content-idempotent — a version bump does NOT rewrite it (disc 371, no git churn)", (ws) => {
  target.apply(ctxFor(ws, "0.1.0"));
  // a different extension version re-applying → still "unchanged" (the block carries no version, and its body is identical)
  assert.equal(target.apply(ctxFor(ws, "0.2.0")).claudeMd, "unchanged");
  assert.equal(target.apply(ctxFor(ws, "9.9.9")).claudeMd, "unchanged");
});

check("a LEGACY versioned marker migrates to the versionless form ONCE, then is stable", (ws) => {
  // simulate a CLAUDE.md written by an old version (versioned marker)
  writeFileSync(md(ws), '# proj\n\n<!-- crl-tools-start version="4.100.0" -->\nold body\n<!-- crl-tools-end -->\n');
  const r1 = target.apply(ctxFor(ws));
  assert.equal(r1.claudeMd, "updated"); // one-time rewrite to the versionless, current-body block
  const text = readFileSync(md(ws), "utf8");
  assert.ok(text.includes("<!-- crl-tools-start -->") && !/crl-tools-start version=/.test(text));
  assert.ok(text.includes("# proj")); // surrounding content preserved
  assert.equal(target.apply(ctxFor(ws)).claudeMd, "unchanged"); // stable thereafter
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

// ── the emit_results opt-in, carried as .mcp.json env (not the user's environment) ────────────────────
// Reported by the IEHP KE: `setx` + "restart the client" cannot be followed reliably — a process launched
// from a window predating the setx never inherits it, and the same failure exists on macOS (launchd) and
// Linux (session env). `.mcp.json` env is handed straight to the spawned process, so there is no chain.
const { mergeEnableResultsEnv, ENABLE_RESULTS_ENV } = mod;

test("mergeEnableResultsEnv: sets the flag when enabled, and drops the whole block when disabled", () => {
  assert.deepEqual(mergeEnableResultsEnv(undefined, true), { [ENABLE_RESULTS_ENV]: "1" });
  // Not `{}`: an emptied env block would leave a permanent diff against the user's original file.
  assert.equal(mergeEnableResultsEnv(undefined, false), undefined);
  assert.equal(mergeEnableResultsEnv({ [ENABLE_RESULTS_ENV]: "1" }, false), undefined);
});

test("mergeEnableResultsEnv: NEVER eats a user's own env keys — on or off", () => {
  assert.deepEqual(mergeEnableResultsEnv({ MY_VAR: "x" }, true), { MY_VAR: "x", [ENABLE_RESULTS_ENV]: "1" });
  // Turning the setting off removes OURS and leaves THEIRS. We own exactly one name in this block.
  assert.deepEqual(mergeEnableResultsEnv({ MY_VAR: "x", [ENABLE_RESULTS_ENV]: "1" }, false), { MY_VAR: "x" });
});

test("mergeEnableResultsEnv: a non-object env is left exactly as found", () => {
  // Same refuse-to-clobber posture as the server entry itself: a file we do not understand is not ours
  // to rewrite, and replacing it could silently discard configuration.
  assert.equal(mergeEnableResultsEnv("weird", true), "weird");
});

check("apply writes CRL_ENABLE_RESULTS=1 into the crl server env when enabled", (ws) => {
  const ctx = { ...ctxFor(ws), enableResults: true };
  target.apply(ctx);
  const j = readJson(mcp(ws));
  assert.deepEqual(j.mcpServers.crl.env, { [ENABLE_RESULTS_ENV]: "1" });
});

check("apply writes NO env when disabled — default off, and the key is absent, not empty", (ws) => {
  target.apply(ctxFor(ws));
  const j = readJson(mcp(ws));
  assert.equal("env" in j.mcpServers.crl, false);
});

check("toggling the setting off removes our key and preserves a user-added sibling", (ws) => {
  target.apply({ ...ctxFor(ws), enableResults: true });
  // The user then adds their own variable to OUR server block.
  const withUser = readJson(mcp(ws));
  withUser.mcpServers.crl.env.USER_SET = "keep-me";
  writeFileSync(mcp(ws), JSON.stringify(withUser, null, 2), "utf8");

  target.apply({ ...ctxFor(ws), enableResults: false });
  const j = readJson(mcp(ws));
  assert.deepEqual(j.mcpServers.crl.env, { USER_SET: "keep-me" });
});
