// #210 editor agent Todo C — the pure agentic loop driver (runAgentTurn). Node-tested with a SCRIPTED fake provider + a
// fake tool registry (no vscode, no network). Covers the load-bearing invariants: staged-buffer commit, the tool-only
// assistant turn, 1:1 tool_result, cap-discard (no dangling tool_use), exec-gated cancel, and balanced/empty commit rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { runAgentTurn } = await load("agentToolLoop.ts");

// A scripted provider: returns responses[i] on the i-th `stream`, emitting text + tool_use deltas along the way. Records
// each request's `messages` so a test can assert the staged replay. `onEach(i)` runs after emitting, before returning.
const fakeProvider = (responses, onEach) => {
  const requests = [];
  let i = 0;
  return {
    id: "anthropic",
    requests,
    calls: () => i,
    async isAvailable() { return true; },
    async complete() { throw new Error("unused"); },
    async stream(req, onDelta) {
      requests.push(req.messages);
      const r = responses[i] ?? { text: "", stopReason: "end_turn" };
      for (const b of r.content ?? []) {
        if (b.type === "text") onDelta({ type: "text", text: b.text });
        else if (b.type === "tool_use") onDelta({ type: "tool_use", id: b.id, name: b.name, input: b.input });
      }
      onEach?.(i);
      i++;
      return r;
    },
  };
};
const registryOf = (impl) => ({ run: async (name, input) => impl(name, input) });
const noToken = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };
const mutableToken = () => { let c = false; return { get isCancellationRequested() { return c; }, onCancellationRequested: () => ({ dispose() {} }), cancel() { c = true; } }; };
const base = (over) => ({
  registry: registryOf(() => ({ content: "ok" })),
  baseMessages: [],
  userMessage: { role: "user", content: "hi" },
  system: "sys",
  tools: [{ name: "open_flag_drawer", description: "d", inputSchema: { type: "object" } }],
  maxTokens: 4096,
  maxRounds: 4,
  token: noToken,
  isSuperseded: () => false,
  onDelta: () => {},
  ...over,
});

test("runAgentTurn: a plain text reply (no tools) commits the balanced user/assistant pair", async () => {
  const provider = fakeProvider([{ text: "hello", content: [{ type: "text", text: "hello" }], stopReason: "end_turn" }]);
  const r = await runAgentTurn(base({ provider }));
  assert.equal(r.commit, true);
  assert.equal(r.text, "hello");
  assert.equal(r.stopReason, "end_turn");
  assert.deepEqual(r.messages, [
    { role: "user", content: "hi" },
    { role: "assistant", content: [{ type: "text", text: "hello" }] },
  ]);
});

test("runAgentTurn: one tool round then a final reply — commits [user, assistant+tool_use, user tool_result, assistant]", async () => {
  const provider = fakeProvider([
    { text: "flagging", content: [{ type: "text", text: "flagging" }, { type: "tool_use", id: "tu_1", name: "open_flag_drawer", input: { target_id: "x" } }], stopReason: "tool_use" },
    { text: "done — the drawer is open", content: [{ type: "text", text: "done — the drawer is open" }], stopReason: "end_turn" },
  ]);
  let ran;
  const registry = registryOf((name, input) => { ran = { name, input }; return { content: "drawer opened" }; });
  const r = await runAgentTurn(base({ provider, registry }));
  assert.deepEqual(ran, { name: "open_flag_drawer", input: { target_id: "x" } }, "the tool ran once with the model's input");
  assert.equal(r.commit, true);
  assert.equal(r.text, "done — the drawer is open");
  assert.deepEqual(r.messages, [
    { role: "user", content: "hi" },
    { role: "assistant", content: [{ type: "text", text: "flagging" }, { type: "tool_use", id: "tu_1", name: "open_flag_drawer", input: { target_id: "x" } }] },
    { role: "user", content: [{ type: "tool_result", toolUseId: "tu_1", content: "drawer opened", isError: undefined }] },
    { role: "assistant", content: [{ type: "text", text: "done — the drawer is open" }] },
  ]);
  // The 2nd model call must have seen the tool_result in its replayed context.
  assert.equal(provider.requests[1].length, 3, "round-2 request = user + assistant(tool_use) + user(tool_result)");
  assert.equal(provider.requests[1][2].content[0].type, "tool_result");
});

test("runAgentTurn: a TOOL-ONLY assistant turn (no text) is still committed (else the next request 400s)", async () => {
  const provider = fakeProvider([
    { text: "", content: [{ type: "tool_use", id: "tu_1", name: "open_flag_drawer", input: {} }], stopReason: "tool_use" },
    { text: "opened", content: [{ type: "text", text: "opened" }], stopReason: "end_turn" },
  ]);
  const r = await runAgentTurn(base({ provider }));
  assert.equal(r.commit, true);
  assert.equal(r.messages[1].role, "assistant");
  assert.deepEqual(r.messages[1].content, [{ type: "tool_use", id: "tu_1", name: "open_flag_drawer", input: {} }], "the tool-only assistant turn is preserved in model context");
});

test("runAgentTurn: the tool-round cap DISCARDS the whole staged loop (no dangling tool_use) — commit false", async () => {
  // Every response asks for a tool; with maxRounds=2 the 3rd request still wants tools → discard.
  const toolResp = { text: "", content: [{ type: "tool_use", id: "tu", name: "open_flag_drawer", input: {} }], stopReason: "tool_use" };
  const provider = fakeProvider([toolResp, toolResp, toolResp]);
  let runs = 0;
  const registry = registryOf(() => { runs++; return { content: "ok" }; });
  const r = await runAgentTurn(base({ provider, registry, maxRounds: 2 }));
  assert.equal(r.commit, false);
  assert.deepEqual(r.messages, []);
  assert.equal(r.stopReason, "tool_round_cap");
  assert.equal(runs, 2, "exactly maxRounds tool executions ran");
  assert.equal(provider.calls(), 3, "the model was called maxRounds+1 times (the last still wanted tools)");
});

test("runAgentTurn: a THROWING tool becomes an isError tool_result (1:1) and the model recovers", async () => {
  const provider = fakeProvider([
    { text: "", content: [{ type: "tool_use", id: "tu_1", name: "nope", input: {} }], stopReason: "tool_use" },
    { text: "sorry, that failed", content: [{ type: "text", text: "sorry, that failed" }], stopReason: "end_turn" },
  ]);
  const registry = registryOf(() => { throw new Error("boom"); });
  const r = await runAgentTurn(base({ provider, registry }));
  assert.equal(r.commit, true);
  const toolResultTurn = r.messages[2];
  assert.equal(toolResultTurn.role, "user");
  assert.equal(toolResultTurn.content[0].type, "tool_result");
  assert.equal(toolResultTurn.content[0].isError, true);
  assert.match(toolResultTurn.content[0].content, /nope.*failed.*boom/);
});

test("runAgentTurn: multiple tool_use blocks in one turn → exactly one tool_result each (1:1)", async () => {
  const provider = fakeProvider([
    { text: "", content: [
      { type: "tool_use", id: "a", name: "open_flag_drawer", input: { n: 1 } },
      { type: "tool_use", id: "b", name: "open_flag_drawer", input: { n: 2 } },
    ], stopReason: "tool_use" },
    { text: "both handled", content: [{ type: "text", text: "both handled" }], stopReason: "end_turn" },
  ]);
  const r = await runAgentTurn(base({ provider }));
  const results = r.messages[2].content;
  assert.equal(results.length, 2);
  assert.deepEqual(results.map((x) => x.toolUseId), ["a", "b"]);
});

test("runAgentTurn: a Stop AFTER the model asked for a tool but BEFORE execution does NOT run the tool (exec-gate) — discard", async () => {
  const token = mutableToken();
  // Cancel right after the model returns its tool_use, so the pre-execution gate trips.
  const provider = fakeProvider(
    [{ text: "", content: [{ type: "tool_use", id: "tu_1", name: "open_flag_drawer", input: {} }], stopReason: "tool_use" }],
    (i) => { if (i === 0) token.cancel(); },
  );
  let runs = 0;
  const registry = registryOf(() => { runs++; return { content: "ok" }; });
  const r = await runAgentTurn(base({ provider, registry, token }));
  assert.equal(runs, 0, "the side-effecting tool never ran for the abandoned turn");
  assert.equal(r.commit, false);
  assert.equal(r.stopReason, "cancelled");
});

test("runAgentTurn: a cancel WITH partial text commits a balanced text-only assistant turn (B/B.1 preserved)", async () => {
  const provider = fakeProvider([{ text: "partial…", content: [{ type: "text", text: "partial…" }], stopReason: "cancelled" }]);
  const r = await runAgentTurn(base({ provider }));
  assert.equal(r.commit, true);
  assert.equal(r.text, "partial…");
  assert.deepEqual(r.messages, [
    { role: "user", content: "hi" },
    { role: "assistant", content: [{ type: "text", text: "partial…" }] },
  ]);
});

test("runAgentTurn: a cancel with NO text discards (never an unbalanced user-only commit)", async () => {
  const provider = fakeProvider([{ text: "", stopReason: "cancelled" }]);
  const r = await runAgentTurn(base({ provider }));
  assert.equal(r.commit, false);
  assert.deepEqual(r.messages, []);
});

test("runAgentTurn: an EMPTY final assistant turn (max_tokens, no text) is NOT committed", async () => {
  const provider = fakeProvider([{ text: "", content: undefined, stopReason: "max_tokens" }]);
  const r = await runAgentTurn(base({ provider }));
  assert.equal(r.commit, false);
  assert.deepEqual(r.messages, []);
  assert.equal(r.stopReason, "max_tokens");
});

test("runAgentTurn: isSuperseded (Clear mid-turn) before the first model call discards immediately", async () => {
  const provider = fakeProvider([{ text: "hi", content: [{ type: "text", text: "hi" }], stopReason: "end_turn" }]);
  const r = await runAgentTurn(base({ provider, isSuperseded: () => true }));
  assert.equal(r.commit, false);
  assert.equal(provider.calls(), 0, "a superseded turn never calls the model");
});

test("runAgentTurn: a cancel BETWEEN tools in one round does not run the remaining tools (per-tool exec-gate B3)", async () => {
  const token = mutableToken();
  let runs = 0;
  // The first tool cancels the token as it runs; the loop's per-tool gate must then skip the second.
  const registry = registryOf(() => { runs++; token.cancel(); return { content: "ok" }; });
  const provider = fakeProvider([
    { text: "", content: [
      { type: "tool_use", id: "a", name: "open_flag_drawer", input: {} },
      { type: "tool_use", id: "b", name: "open_flag_drawer", input: {} },
    ], stopReason: "tool_use" },
  ]);
  const r = await runAgentTurn(base({ provider, registry, token }));
  assert.equal(runs, 1, "only the first tool ran; the second was gated by the mid-loop cancel check");
  assert.equal(r.commit, false);
  assert.equal(r.stopReason, "cancelled");
});

test("runAgentTurn: an EMPTY final turn AFTER a tool ran commits a BALANCED ack (the side effect isn't orphaned)", async () => {
  const provider = fakeProvider([
    { text: "", content: [{ type: "tool_use", id: "tu_1", name: "open_flag_drawer", input: {} }], stopReason: "tool_use" },
    { text: "", content: undefined, stopReason: "max_tokens" }, // empty final turn (thinking spent the budget)
  ]);
  const r = await runAgentTurn(base({ provider }));
  assert.equal(r.commit, true, "the executed tool exchange stays committable");
  assert.equal(r.messages.length, 4, "user, assistant(tool_use), user(tool_result), assistant(ack)");
  assert.equal(r.messages[3].role, "assistant");
  assert.deepEqual(r.messages[3].content, [{ type: "text", text: "(done)" }]);
});

console.log("agentToolLoop.test: ok");
