// #210 editor agent Todo A — the PURE key-resolution bits of agentModelProvider.ts. `resolveAnthropicKey` (env wins, but
// only a non-blank env) + `anthropicKeySource`. agentModelProvider.ts imports `vscode` (unavailable under plain node), so —
// like cockpitWebviewScript.test.mjs — we esbuild-bundle it with a tiny plugin resolving `vscode` to an EMPTY stub. The
// module's top level is only imports + class/function definitions (no vscode access at import time), so the stub suffices.
import { build } from "esbuild";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// esbuild plugin: resolve `vscode` to an empty CJS module (agentModelProvider never touches vscode at import time).
const stubVscode = {
  name: "stub-vscode",
  setup(b) {
    b.onResolve({ filter: /^vscode$/ }, () => ({ path: "vscode", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "module.exports = {};", loader: "js" }));
  },
};

async function loadProvider() {
  const out = resolve(tmpdir(), `crl-agent-model-provider-${process.pid}.cjs`);
  await build({
    entryPoints: [resolve(here, "agentModelProvider.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    outfile: out,
    logLevel: "silent",
    plugins: [stubVscode],
  });
  return require(out);
}

const { resolveAnthropicKey, anthropicKeySource, DEFAULT_MAX_TOKENS, AnthropicProvider, VSCODE_LM_UNAVAILABLE, ANTHROPIC_UNAVAILABLE } = await loadProvider();

const secretsWith = (val) => ({ get: async () => val, store: async () => {}, delete: async () => {} });
const okFetch = (json) => async () => ({ ok: true, status: 200, json: async () => json });

test("resolveAnthropicKey: a non-blank env key wins over the secret", () => {
  assert.equal(resolveAnthropicKey("env-key", "secret-key"), "env-key");
  assert.equal(resolveAnthropicKey("  env-key  ", "secret-key"), "env-key");
});

test("resolveAnthropicKey: an empty/whitespace env falls through to the secret (empty env must NOT win)", () => {
  assert.equal(resolveAnthropicKey("", "secret-key"), "secret-key");
  assert.equal(resolveAnthropicKey("   ", "secret-key"), "secret-key");
  assert.equal(resolveAnthropicKey(undefined, "secret-key"), "secret-key");
});

test("resolveAnthropicKey: the secret is used (trimmed) when there is no env", () => {
  assert.equal(resolveAnthropicKey(undefined, "  secret-key  "), "secret-key");
});

test("resolveAnthropicKey: both blank/undefined → undefined", () => {
  assert.equal(resolveAnthropicKey(undefined, undefined), undefined);
  assert.equal(resolveAnthropicKey("", ""), undefined);
  assert.equal(resolveAnthropicKey("  ", "  "), undefined);
});

test("anthropicKeySource: maps env / secret / none", () => {
  assert.equal(anthropicKeySource("env-key", "secret-key"), "environment");
  assert.equal(anthropicKeySource("env-key", undefined), "environment");
  assert.equal(anthropicKeySource("  ", "secret-key"), "secret storage");
  assert.equal(anthropicKeySource(undefined, "secret-key"), "secret storage");
  assert.equal(anthropicKeySource(undefined, undefined), "none");
  assert.equal(anthropicKeySource("", ""), "none");
});

test("DEFAULT_MAX_TOKENS is exported and positive", () => {
  assert.equal(DEFAULT_MAX_TOKENS, 1024);
});

test("AnthropicProvider.complete: returns the model text (env key, injected fetch — no network)", async () => {
  const p = new AnthropicProvider("claude-sonnet-5", secretsWith(undefined), "env-key", okFetch({ content: [{ type: "text", text: "agent online" }], stop_reason: "end_turn" }));
  assert.equal(await p.isAvailable(), true);
  const r = await p.complete({ system: "s", messages: [{ role: "user", content: "hi" }] });
  assert.equal(r.text, "agent online");
  assert.equal(r.stopReason, "end_turn");
});

test("AnthropicProvider.complete: a thinking-only response yields empty text (the false-pass the test command must catch)", async () => {
  const p = new AnthropicProvider("m", secretsWith("secret-key"), undefined, okFetch({ content: [{ type: "thinking", thinking: "…" }], stop_reason: "max_tokens" }));
  const r = await p.complete({ messages: [{ role: "user", content: "hi" }] });
  assert.equal(r.text, "");
  assert.equal(r.stopReason, "max_tokens");
});

test("AnthropicProvider.complete: passing `tools` fails fast (never a silent plain-text degrade)", async () => {
  const p = new AnthropicProvider("m", secretsWith("k"), undefined, okFetch({ content: [{ type: "text", text: "x" }] }));
  await assert.rejects(() => p.complete({ messages: [{ role: "user", content: "hi" }], tools: [{}] }), /tool-calling/);
});

test("AnthropicProvider: no key → not available; complete throws the actionable message", async () => {
  const p = new AnthropicProvider("m", secretsWith(undefined), undefined, okFetch({ content: [] }));
  assert.equal(await p.isAvailable(), false);
  await assert.rejects(() => p.complete({ messages: [{ role: "user", content: "hi" }] }), new RegExp("Set Anthropic API Key"));
});

test("the unavailable messages are plain text (no Markdown — notifications don't render it)", () => {
  for (const m of [VSCODE_LM_UNAVAILABLE, ANTHROPIC_UNAVAILABLE]) assert.ok(m && !m.includes("**"), `plain: ${m}`);
  assert.match(VSCODE_LM_UNAVAILABLE, /GitHub Copilot Chat/);
  assert.match(ANTHROPIC_UNAVAILABLE, /ANTHROPIC_API_KEY/);
});

console.log("agentModelProvider.test: ok");
