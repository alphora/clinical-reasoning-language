// #210 editor agent Todo A — callAnthropic (the effectful Messages POST). Tested via an INJECTED fetch (no network):
// success → concatenated text; the KEY regression = a leading `thinking` block is skipped, only `text` blocks concatenate;
// every failure mode → an AnthropicError the test command turns into a labelled notification.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { callAnthropic, AnthropicError, anthropicErrorLabel } = await load("anthropicClient.ts");

// A minimal Response-ish stub for the injected fetch.
const resp = (ok, status, json) => ({
  ok,
  status,
  json: async () => (json instanceof Error ? (() => { throw json; })() : json),
});

test("callAnthropic: POSTs to the messages endpoint with key + version headers + body, returns the text", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return resp(true, 200, { content: [{ type: "text", text: "agent online" }], stop_reason: "end_turn", usage: { input_tokens: 12, output_tokens: 3 } });
  };
  const r = await callAnthropic({
    apiKey: "sk-xyz",
    model: "claude-sonnet-5",
    system: "You are a test.",
    messages: [{ role: "user", content: "hi" }],
    maxTokens: 64,
    fetchImpl,
  });
  assert.equal(r.text, "agent online");
  assert.equal(r.stopReason, "end_turn");
  assert.deepEqual(r.usage, { inputTokens: 12, outputTokens: 3 });
  assert.equal(seen.url, "https://api.anthropic.com/v1/messages");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers["x-api-key"], "sk-xyz");
  assert.equal(seen.init.headers["anthropic-version"], "2023-06-01");
  const body = JSON.parse(seen.init.body);
  assert.equal(body.model, "claude-sonnet-5");
  assert.equal(body.max_tokens, 64);
  assert.equal(body.system, "You are a test.");
  assert.deepEqual(body.messages, [{ role: "user", content: "hi" }]);
});

test("callAnthropic: omits `system` from the body when undefined (API rejects system:null)", async () => {
  let body;
  const fetchImpl = async (_url, init) => {
    body = JSON.parse(init.body);
    return resp(true, 200, { content: [{ type: "text", text: "ok" }] });
  };
  await callAnthropic({ apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, fetchImpl });
  assert.ok(!("system" in body));
});

test("callAnthropic: a leading `thinking` block is skipped — ONLY text blocks concatenate (the regression)", async () => {
  const fetchImpl = async () => resp(true, 200, {
    content: [
      { type: "thinking", thinking: "let me reason about this" },
      { type: "text", text: "agent " },
      { type: "text", text: "online" },
    ],
    stop_reason: "end_turn",
  });
  const r = await callAnthropic({ apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, fetchImpl });
  assert.equal(r.text, "agent online");
});

test("callAnthropic: a non-2xx with {error:{type,message}} throws AnthropicError carrying status + errorType", async () => {
  const fetchImpl = async () => resp(false, 401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
  await assert.rejects(
    () => callAnthropic({ apiKey: "bad", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, fetchImpl }),
    (e) => e instanceof AnthropicError && e.status === 401 && e.errorType === "authentication_error" && /invalid x-api-key/.test(e.message),
  );
});

test("callAnthropic: a non-JSON error body still throws with the status (no crash)", async () => {
  const fetchImpl = async () => resp(false, 500, new Error("not json"));
  await assert.rejects(
    () => callAnthropic({ apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, fetchImpl }),
    (e) => e instanceof AnthropicError && e.status === 500 && e.errorType === undefined,
  );
});

test("callAnthropic: a transport error becomes AnthropicError(status 0)", async () => {
  const fetchImpl = async () => { throw new Error("ECONNREFUSED"); };
  await assert.rejects(
    () => callAnthropic({ apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, fetchImpl }),
    (e) => e instanceof AnthropicError && e.status === 0,
  );
});

test("callAnthropic: a 2xx that isn't JSON throws AnthropicError with the status", async () => {
  const fetchImpl = async () => resp(true, 200, new Error("not json"));
  await assert.rejects(
    () => callAnthropic({ apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, fetchImpl }),
    (e) => e instanceof AnthropicError && e.status === 200,
  );
});

test("callAnthropic: an aborted request → AnthropicError(-1) → labelled 'cancelled', NOT 'offline'", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetchImpl = async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; };
  await assert.rejects(
    () => callAnthropic({ apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, fetchImpl, signal: controller.signal }),
    (e) => e instanceof AnthropicError && e.status === -1,
  );
});

test("anthropicErrorLabel: maps the common statuses (incl. 404=model-not-found, -1=cancelled) to a short label", () => {
  assert.equal(anthropicErrorLabel(new AnthropicError(-1, "x", "aborted")), "cancelled");
  assert.equal(anthropicErrorLabel(new AnthropicError(0, "x")), "offline");
  assert.equal(anthropicErrorLabel(new AnthropicError(401, "x")), "invalid or unauthorized API key");
  assert.equal(anthropicErrorLabel(new AnthropicError(403, "x")), "invalid or unauthorized API key");
  assert.equal(anthropicErrorLabel(new AnthropicError(404, "x")), "model not found (check crl.agent.anthropicModel)");
  assert.equal(anthropicErrorLabel(new AnthropicError(429, "x")), "rate limited");
  assert.equal(anthropicErrorLabel(new AnthropicError(400, "x")), "bad request (check the model + request)");
  assert.equal(anthropicErrorLabel(new AnthropicError(503, "x")), "Anthropic service error");
  assert.equal(anthropicErrorLabel(new AnthropicError(418, "x")), "Anthropic 418");
  assert.equal(anthropicErrorLabel(new Error("plain")), "error");
});

console.log("anthropicClient.test: ok");
