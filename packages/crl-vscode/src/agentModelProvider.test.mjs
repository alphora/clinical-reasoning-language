// #210 editor agent Todo A — the PURE key-resolution bits of agentModelProvider.ts. `resolveAnthropicKey` (env wins, but
// only a non-blank env) + `anthropicKeySource`. agentModelProvider.ts imports `vscode` (unavailable under plain node), so —
// like cockpitWebviewScript.test.mjs — we import it directly and the crl-vscode project aliases `vscode` → the shared
// test stub. The module's top level is only imports + class/function definitions (no vscode access at import time).
import assert from "node:assert/strict";

import { resolveAnthropicKey, anthropicKeySource, DEFAULT_MAX_TOKENS, AnthropicProvider, VSCODE_LM_UNAVAILABLE, ANTHROPIC_UNAVAILABLE } from "./agentModelProvider.ts";

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

test("AnthropicProvider.complete: passing `tools` sends the wire tools + returns parsed tool_use content (Todo C)", async () => {
  let body;
  const fetchImpl = async (_url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "tool_use", id: "tu_1", name: "open_flag_drawer", input: { target_id: "x" } }], stop_reason: "tool_use" }) };
  };
  const p = new AnthropicProvider("m", secretsWith("k"), undefined, fetchImpl);
  const r = await p.complete({ messages: [{ role: "user", content: "hi" }], tools: [{ name: "open_flag_drawer", description: "d", inputSchema: { type: "object" } }] });
  assert.deepEqual(body.tools, [{ name: "open_flag_drawer", description: "d", input_schema: { type: "object" } }]);
  assert.equal(r.stopReason, "tool_use");
  assert.deepEqual(r.content, [{ type: "tool_use", id: "tu_1", name: "open_flag_drawer", input: { target_id: "x" } }]);
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

// ── #210 Todo B: AnthropicProvider.stream (injected fetch + fake SSE reader; no vscode token needed — a plain stub) ──
const enc = (s) => new TextEncoder().encode(s);
const textDelta = (t) => enc(`data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: t } })}\n\n`);
const blockStart = (type) => enc(`data: ${JSON.stringify({ type: "content_block_start", content_block: { type } })}\n\n`);
const stopFrame = enc(`data: ${JSON.stringify({ type: "message_stop" })}\n\n`);
const readerOf = (chunks) => { let i = 0; return { read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }), cancel: async () => {} }; };
const streamFetch = (chunks) => async () => ({ ok: true, status: 200, body: { getReader: () => readerOf(chunks) } });

test("AnthropicProvider.stream: emits tagged text deltas + resolves the full ModelResponse", async () => {
  const p = new AnthropicProvider("m", secretsWith("k"), undefined, streamFetch([textDelta("agent "), textDelta("online"), stopFrame]));
  const deltas = [];
  const r = await p.stream({ messages: [{ role: "user", content: "hi" }] }, (d) => deltas.push(d));
  assert.deepEqual(deltas, [{ type: "text", text: "agent " }, { type: "text", text: "online" }], "each delta is a tagged {type:'text'}");
  assert.equal(r.text, "agent online");
});

test("AnthropicProvider.stream: thinking deltas flow through as tagged {type:'thinking_start'/'thinking_stop'} StreamDeltas around the text (Todo B.1)", async () => {
  const p = new AnthropicProvider("m", secretsWith("k"), undefined, streamFetch([blockStart("thinking"), blockStart("text"), textDelta("hi"), stopFrame]));
  const deltas = [];
  const r = await p.stream({ messages: [{ role: "user", content: "hi" }] }, (d) => deltas.push(d));
  assert.deepEqual(deltas, [{ type: "thinking_start" }, { type: "thinking_stop" }, { type: "text", text: "hi" }], "start, then stop (text block opens), then the text delta");
  assert.equal(r.text, "hi");
});

test("AnthropicProvider.stream: an already-cancelled token FINALIZES the partial (stopReason 'cancelled'), never throws", async () => {
  // The token bridges to an AbortController; an already-cancelled token aborts before the read → streamAnthropic returns
  // the (empty) partial with stopReason 'cancelled' rather than throwing.
  const token = { isCancellationRequested: true, onCancellationRequested: () => ({ dispose() {} }) };
  const p = new AnthropicProvider("m", secretsWith("k"), undefined, streamFetch([textDelta("x"), stopFrame]));
  const r = await p.stream({ messages: [{ role: "user", content: "hi" }], token }, () => {});
  assert.equal(r.stopReason, "cancelled");
});

test("AnthropicProvider.stream: a streamed tool_use flows through as a tagged {type:'tool_use'} StreamDelta + content (Todo C)", async () => {
  const toolStart = enc(`data: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu_1", name: "open_flag_drawer" } })}\n\n`);
  const jsonDelta = enc(`data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"target_id":"x"}' } })}\n\n`);
  const blockStopF = enc(`data: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`);
  const toolStopF = enc(`data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "tool_use" } })}\n\n`);
  const p = new AnthropicProvider("m", secretsWith("k"), undefined, streamFetch([toolStart, jsonDelta, blockStopF, toolStopF, stopFrame]));
  const deltas = [];
  const r = await p.stream({ messages: [{ role: "user", content: "flag this" }], tools: [{ name: "open_flag_drawer", description: "d", inputSchema: {} }] }, (d) => deltas.push(d));
  assert.deepEqual(deltas, [{ type: "tool_use", id: "tu_1", name: "open_flag_drawer", input: { target_id: "x" } }]);
  assert.equal(r.stopReason, "tool_use");
  assert.deepEqual(r.content, [{ type: "tool_use", id: "tu_1", name: "open_flag_drawer", input: { target_id: "x" } }]);
});

test("AnthropicProvider.stream: no key → throws the actionable unavailable message", async () => {
  const p = new AnthropicProvider("m", secretsWith(undefined), undefined, streamFetch([stopFrame]));
  await assert.rejects(() => p.stream({ messages: [{ role: "user", content: "hi" }] }, () => {}), /Set Anthropic API Key/);
});

console.log("agentModelProvider.test: ok");
