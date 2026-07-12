// #210 editor agent Todo A — callAnthropic (the effectful Messages POST). Tested via an INJECTED fetch (no network):
// success → concatenated text; the KEY regression = a leading `thinking` block is skipped, only `text` blocks concatenate;
// every failure mode → an AnthropicError the test command turns into a labelled notification.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { callAnthropic, AnthropicError, anthropicErrorLabel, parseSseFrames, streamAnthropic, toAnthropicMessages } = await load("anthropicClient.ts");

const enc = (s) => new TextEncoder().encode(s);
// A fake ReadableStream reader over a list of byte chunks. `abortAt` (index) aborts the controller INSIDE read() just
// before yielding that chunk — so a cancel lands between the loop's top-of-iteration abort check and the next read.
const makeReader = (chunks, { abortAt, controller } = {}) => {
  let i = 0;
  return {
    read: async () => {
      // At the abort index, tear down like real undici: abort the signal AND reject the in-flight read with an AbortError.
      if (abortAt !== undefined && i === abortAt && controller) {
        controller.abort();
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      }
      if (i >= chunks.length) return { done: true, value: undefined };
      return { done: false, value: chunks[i++] };
    },
    cancel: async () => {},
  };
};
// A fake fetch returning a streaming Response (ok, with a body.getReader). `onGetReader` lets a test assert read-order.
const streamFetch = (reader, { ok = true, status = 200 } = {}) => async () => ({ ok, status, body: { getReader: () => reader } });

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
  // a mid-stream `error` event (status 200) surfaces the errorType/message, not a bare "Anthropic 200"
  assert.equal(anthropicErrorLabel(new AnthropicError(200, "boom", "overloaded_error")), "overloaded_error");
  assert.equal(anthropicErrorLabel(new AnthropicError(200, "just a message")), "just a message");
  // a raw reader/other Error keeps its message (not a bare "error")
  assert.equal(anthropicErrorLabel(new Error("reader broke")), "reader broke");
  assert.equal(anthropicErrorLabel("nope"), "error");
});

// ── #210 Todo B: parseSseFrames (pure) ──
test("parseSseFrames: a frame split across two chunks — the trailing partial stays in `rest`, completes next call", () => {
  const first = parseSseFrames('event: a\ndata: {"n":1}\n\ndata: {"n"');
  assert.equal(first.events.length, 1);
  assert.equal(first.events[0].event, "a");
  assert.deepEqual(JSON.parse(first.events[0].data), { n: 1 });
  assert.equal(first.rest, 'data: {"n"'); // the incomplete second frame is held back
  const second = parseSseFrames(first.rest + ":2}\n\n");
  assert.equal(second.events.length, 1);
  assert.deepEqual(JSON.parse(second.events[0].data), { n: 2 });
  assert.equal(second.rest, "");
});

test("parseSseFrames: multiple `data:` lines join with a newline; the single leading space is stripped", () => {
  const { events } = parseSseFrames("data: line1\ndata: line2\n\n");
  assert.equal(events.length, 1);
  assert.equal(events[0].data, "line1\nline2");
});

test("parseSseFrames: a `:`-comment / heartbeat line is ignored (a comment-only frame emits NO event)", () => {
  const { events, rest } = parseSseFrames(":heartbeat\n\ndata: {\"ok\":true}\n\n");
  assert.equal(events.length, 1, "only the data frame surfaces — the comment frame is dropped");
  assert.deepEqual(JSON.parse(events[0].data), { ok: true });
  assert.equal(rest, "");
});

test("parseSseFrames: CRLF frame boundaries are normalized (Windows/proxy line endings)", () => {
  const { events } = parseSseFrames("data: {\"a\":1}\r\n\r\n");
  assert.equal(events.length, 1);
  assert.deepEqual(JSON.parse(events[0].data), { a: 1 });
});

// ── #210 Todo B: streamAnthropic (effectful, injected fetch + fake reader) ──
const textDelta = (t) => `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: t } })}\n\n`;
const thinkingDelta = (t) => `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "thinking_delta", thinking: t } })}\n\n`;

test("streamAnthropic: streams two text_deltas (a leading thinking_delta skipped), captures usage + stop_reason", async () => {
  const frames = [
    enc(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 11 } } })}\n\n`),
    enc(thinkingDelta("reasoning…")), // skipped — no visible text, never throws
    enc(textDelta("agent ")),
    enc(textDelta("online")),
    enc(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 4 } })}\n\n`),
    enc(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`),
  ];
  const seen = [];
  const r = await streamAnthropic(
    { apiKey: "k", model: "m", messages: [{ role: "user", content: "hi" }], maxTokens: 64, stream: true, fetchImpl: streamFetch(makeReader(frames)) },
    (t) => seen.push(t),
  );
  assert.deepEqual(seen, ["agent ", "online"], "only the text_deltas were emitted (thinking skipped)");
  assert.equal(r.text, "agent online");
  assert.equal(r.stopReason, "end_turn");
  assert.deepEqual(r.usage, { inputTokens: 11, outputTokens: 4 });
});

test("streamAnthropic: a multibyte UTF-8 char split across byte chunks is decoded intact (streaming TextDecoder)", async () => {
  // "é" = 0xC3 0xA9. Split a text_delta's bytes mid-character across two reader chunks.
  const frame = textDelta("café"); // café
  const bytes = enc(frame);
  const cut = bytes.indexOf(0xa9); // split BETWEEN the two bytes of é
  const chunks = [bytes.slice(0, cut), bytes.slice(cut), enc(`data: ${JSON.stringify({ type: "message_stop" })}\n\n`)];
  let text = "";
  const r = await streamAnthropic(
    { apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, stream: true, fetchImpl: streamFetch(makeReader(chunks)) },
    (t) => (text += t),
  );
  assert.equal(text, "café", "the split multibyte char is reassembled (not corrupted)");
  assert.equal(r.text, "café");
});

test("streamAnthropic: a non-2xx throws AnthropicError BEFORE the body is read (no getReader call)", async () => {
  let readerAsked = false;
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }),
    body: { getReader: () => { readerAsked = true; throw new Error("must not read the body on a non-2xx"); } },
  });
  await assert.rejects(
    () => streamAnthropic({ apiKey: "bad", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, stream: true, fetchImpl }, () => {}),
    (e) => e instanceof AnthropicError && e.status === 401 && e.errorType === "authentication_error",
  );
  assert.equal(readerAsked, false, "the SSE body was never read — the error came from the pre-stream !res.ok check");
});

test("streamAnthropic: a mid-stream `error` event throws AnthropicError(200, …)", async () => {
  const frames = [
    enc(textDelta("partial ")),
    enc(`event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "overloaded" } })}\n\n`),
  ];
  await assert.rejects(
    () => streamAnthropic({ apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, stream: true, fetchImpl: streamFetch(makeReader(frames)) }, () => {}),
    (e) => e instanceof AnthropicError && e.status === 200 && e.errorType === "overloaded_error" && /overloaded/.test(e.message),
  );
});

test("streamAnthropic: an abort mid-stream FINALIZES the partial (stopReason 'cancelled') — it does NOT throw", async () => {
  const controller = new AbortController();
  const frames = [enc(textDelta("hi")), enc(textDelta(" there"))];
  // abortAt:1 → the controller aborts inside read() just before the 2nd chunk, so the loop's top-of-iteration check finalizes.
  const reader = makeReader(frames, { abortAt: 1, controller });
  let text = "";
  const r = await streamAnthropic(
    { apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, stream: true, signal: controller.signal, fetchImpl: streamFetch(reader) },
    (t) => (text += t),
  );
  assert.equal(r.stopReason, "cancelled");
  assert.equal(r.text, "hi", "the partial text collected before the abort is returned");
  assert.equal(text, "hi");
});

test("streamAnthropic: an already-aborted signal finalizes immediately (empty partial, cancelled)", async () => {
  const controller = new AbortController();
  controller.abort();
  const r = await streamAnthropic(
    { apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, stream: true, signal: controller.signal, fetchImpl: streamFetch(makeReader([enc(textDelta("x"))])) },
    () => {},
  );
  assert.equal(r.stopReason, "cancelled");
  assert.equal(r.text, "");
});

test("streamAnthropic: a null body throws AnthropicError('no response body')", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, body: null });
  await assert.rejects(
    () => streamAnthropic({ apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, stream: true, fetchImpl }, () => {}),
    (e) => e instanceof AnthropicError && /no response body/.test(e.message),
  );
});

test("callAnthropic: still POSTs WITHOUT stream:true in the body (the shared core only sets it for streaming)", async () => {
  let body;
  const fetchImpl = async (_url, init) => { body = JSON.parse(init.body); return resp(true, 200, { content: [{ type: "text", text: "ok" }] }); };
  await callAnthropic({ apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, fetchImpl });
  assert.ok(!("stream" in body), "the non-streaming call never sets body.stream");
});

test("streamAnthropic: a cancel DURING the POST (fetch rejects) FINALIZES as cancelled — NOT a thrown error", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetchImpl = async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; };
  const r = await streamAnthropic(
    { apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, stream: true, signal: controller.signal, fetchImpl },
    () => {},
  );
  assert.equal(r.stopReason, "cancelled");
  assert.equal(r.text, "");
});

// ── #236 Todo B.1: onThinking bracketing (adaptive-thinking; display:omitted → no thinking text, STATE only) ──
const blockStart = (type) => `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", content_block: { type } })}\n\n`;
const messageStop = `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`;

test("streamAnthropic: onThinking start on a content_block_start(thinking), stop on the content_block_start(text) — brackets the reply", async () => {
  const frames = [
    enc(blockStart("thinking")),
    enc(thinkingDelta("reasoning…")), // skipped for text, but the block is open
    enc(blockStart("text")),
    enc(textDelta("hello")),
    enc(messageStop),
  ];
  const think = [];
  const seen = [];
  const r = await streamAnthropic(
    { apiKey: "k", model: "m", messages: [{ role: "user", content: "hi" }], maxTokens: 64, stream: true, fetchImpl: streamFetch(makeReader(frames)) },
    (t) => seen.push(t),
    (s) => think.push(s),
  );
  assert.deepEqual(think, ["start", "stop"], "one start (thinking block) + one stop (text block opened)");
  assert.deepEqual(seen, ["hello"], "only the text_delta is emitted (thinking text stays skipped)");
  assert.equal(r.text, "hello");
});

test("streamAnthropic: onThinking stop ALSO fires on the first text_delta when no content_block_start(text) preceded it", async () => {
  const frames = [enc(blockStart("thinking")), enc(textDelta("hi")), enc(messageStop)];
  const think = [];
  await streamAnthropic(
    { apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, stream: true, fetchImpl: streamFetch(makeReader(frames)) },
    () => {},
    (s) => think.push(s),
  );
  assert.deepEqual(think, ["start", "stop"], "the text_delta closes the still-open thinking block");
});

test("streamAnthropic: onThinking stop fires on message_stop if the thinking block never yielded text", async () => {
  const frames = [enc(blockStart("thinking")), enc(thinkingDelta("…")), enc(messageStop)];
  const think = [];
  const r = await streamAnthropic(
    { apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, stream: true, fetchImpl: streamFetch(makeReader(frames)) },
    () => {},
    (s) => think.push(s),
  );
  assert.deepEqual(think, ["start", "stop"], "message_stop closes an open thinking block");
  assert.equal(r.text, "");
});

test("streamAnthropic: onThinking is optional — a text-only stream with no callback never throws", async () => {
  const frames = [enc(textDelta("plain")), enc(messageStop)];
  const r = await streamAnthropic(
    { apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, stream: true, fetchImpl: streamFetch(makeReader(frames)) },
    () => {},
  );
  assert.equal(r.text, "plain");
});

test("streamAnthropic: a malformed COMPLETE data frame throws AnthropicError(200) — no silent truncation", async () => {
  const frames = [enc(textDelta("partial ")), enc("event: message_delta\ndata: {not valid json\n\n")];
  await assert.rejects(
    () => streamAnthropic({ apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, stream: true, fetchImpl: streamFetch(makeReader(frames)) }, () => {}),
    (e) => e instanceof AnthropicError && e.status === 200 && /malformed/.test(e.message),
  );
});

// ── #210 Todo C: tool-calling (streamed tool_use blocks, ordered content, conversion) ──
const toolBlockStart = (index, id, name) => `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index, content_block: { type: "tool_use", id, name } })}\n\n`;
const textBlockStartAt = (index) => `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index, content_block: { type: "text" } })}\n\n`;
const textDeltaAt = (index, t) => `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index, delta: { type: "text_delta", text: t } })}\n\n`;
const inputJsonDelta = (index, pj) => `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: pj } })}\n\n`;
const blockStop = (index) => `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index })}\n\n`;
const toolStopDelta = `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 7 } })}\n\n`;

test("streamAnthropic: a tool_use block accumulates input_json_delta, fires onToolUse ONCE at stop, surfaces stop_reason:tool_use", async () => {
  const frames = [
    enc(toolBlockStart(0, "tu_1", "open_flag_drawer")),
    enc(inputJsonDelta(0, '{"target_id":')),
    enc(inputJsonDelta(0, '"abc","summary":"BMI underspecified"}')),
    enc(blockStop(0)),
    enc(toolStopDelta),
    enc(messageStop),
  ];
  const tools = [];
  const r = await streamAnthropic(
    { apiKey: "k", model: "m", messages: [{ role: "user", content: "flag this" }], maxTokens: 64, stream: true, fetchImpl: streamFetch(makeReader(frames)) },
    () => {},
    undefined,
    (tu) => tools.push(tu),
  );
  assert.equal(tools.length, 1, "onToolUse fired exactly once");
  assert.deepEqual(tools[0], { id: "tu_1", name: "open_flag_drawer", input: { target_id: "abc", summary: "BMI underspecified" } });
  assert.equal(r.stopReason, "tool_use");
  assert.deepEqual(r.content, [{ type: "tool_use", id: "tu_1", name: "open_flag_drawer", input: { target_id: "abc", summary: "BMI underspecified" } }]);
  assert.equal(r.text, "", "a tool-only turn has no visible text");
});

test("streamAnthropic: mixed text + tool_use assembles content in WIRE order (text first, then the call)", async () => {
  const frames = [
    enc(textBlockStartAt(0)),
    enc(textDeltaAt(0, "I'll flag that. ")),
    enc(blockStop(0)),
    enc(toolBlockStart(1, "tu_9", "open_flag_drawer")),
    enc(inputJsonDelta(1, '{"target_id":"x"}')),
    enc(blockStop(1)),
    enc(toolStopDelta),
    enc(messageStop),
  ];
  const seen = [];
  const r = await streamAnthropic(
    { apiKey: "k", model: "m", messages: [{ role: "user", content: "flag" }], maxTokens: 64, stream: true, fetchImpl: streamFetch(makeReader(frames)) },
    (t) => seen.push(t),
  );
  assert.deepEqual(seen, ["I'll flag that. "]);
  assert.equal(r.text, "I'll flag that. ");
  assert.deepEqual(r.content, [
    { type: "text", text: "I'll flag that. " },
    { type: "tool_use", id: "tu_9", name: "open_flag_drawer", input: { target_id: "x" } },
  ]);
});

test("streamAnthropic: a tool_use with NO input_json_delta defaults its input to {} (never JSON.parse(''))", async () => {
  const frames = [enc(toolBlockStart(0, "tu_2", "list_stuff")), enc(blockStop(0)), enc(toolStopDelta), enc(messageStop)];
  const tools = [];
  const r = await streamAnthropic(
    { apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, stream: true, fetchImpl: streamFetch(makeReader(frames)) },
    () => {}, undefined, (tu) => tools.push(tu),
  );
  assert.deepEqual(tools[0].input, {}, "empty accumulator → {}");
  assert.deepEqual(r.content, [{ type: "tool_use", id: "tu_2", name: "list_stuff", input: {} }]);
});

test("streamAnthropic: malformed tool input JSON throws AnthropicError(200) — no dropping the call silently", async () => {
  const frames = [enc(toolBlockStart(0, "tu_3", "bad")), enc(inputJsonDelta(0, "{not json")), enc(blockStop(0))];
  await assert.rejects(
    () => streamAnthropic({ apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, stream: true, fetchImpl: streamFetch(makeReader(frames)) }, () => {}),
    (e) => e instanceof AnthropicError && e.status === 200 && /malformed.*tool input/i.test(e.message),
  );
});

test("streamAnthropic: a cancel BEFORE content_block_stop emits NO tool_use (no partial call) + finalizes cancelled", async () => {
  const controller = new AbortController();
  const frames = [enc(toolBlockStart(0, "tu_4", "x")), enc(inputJsonDelta(0, '{"a":1'))]; // never reaches content_block_stop
  const reader = makeReader(frames, { abortAt: 2, controller });
  const tools = [];
  const r = await streamAnthropic(
    { apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, stream: true, signal: controller.signal, fetchImpl: streamFetch(reader) },
    () => {}, undefined, (tu) => tools.push(tu),
  );
  assert.equal(tools.length, 0, "no fully-assembled tool call → onToolUse never fires");
  assert.equal(r.stopReason, "cancelled");
  assert.equal(r.content, undefined, "an unfinalized tool_use is excluded from content");
});

test("streamAnthropic + body: tools are mapped to the wire {name, description, input_schema}", async () => {
  let body;
  const fetchImpl = async (_url, init) => { body = JSON.parse(init.body); return { ok: true, status: 200, body: { getReader: () => makeReader([enc(messageStop)]) } }; };
  await streamAnthropic(
    { apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, stream: true, tools: [{ name: "t", description: "d", inputSchema: { type: "object" } }], fetchImpl },
    () => {},
  );
  assert.deepEqual(body.tools, [{ name: "t", description: "d", input_schema: { type: "object" } }]);
});

test("callAnthropic: parses tool_use blocks into ordered content (non-streaming)", async () => {
  const fetchImpl = async () => resp(true, 200, {
    content: [
      { type: "text", text: "flagging" },
      { type: "tool_use", id: "tu_5", name: "open_flag_drawer", input: { target_id: "z" } },
    ],
    stop_reason: "tool_use",
  });
  const r = await callAnthropic({ apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], maxTokens: 8, fetchImpl });
  assert.equal(r.text, "flagging");
  assert.deepEqual(r.content, [
    { type: "text", text: "flagging" },
    { type: "tool_use", id: "tu_5", name: "open_flag_drawer", input: { target_id: "z" } },
  ]);
});

test("toAnthropicMessages: a plain-string content passes through unchanged", () => {
  assert.deepEqual(toAnthropicMessages([{ role: "user", content: "hi" }]), [{ role: "user", content: "hi" }]);
});

test("toAnthropicMessages: assistant tool_use + user tool_result map to wire blocks; empty text dropped; is_error preserved", () => {
  const out = toAnthropicMessages([
    { role: "assistant", content: [{ type: "text", text: "" }, { type: "tool_use", id: "tu_1", name: "f", input: { a: 1 } }] },
    { role: "user", content: [{ type: "tool_result", toolUseId: "tu_1", content: "opened", isError: true }] },
  ]);
  assert.deepEqual(out, [
    { role: "assistant", content: [{ type: "tool_use", id: "tu_1", name: "f", input: { a: 1 } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", content: "opened", is_error: true }] },
  ]);
});

test("toAnthropicMessages: a non-error tool_result omits is_error entirely (not is_error:false)", () => {
  const [msg] = toAnthropicMessages([{ role: "user", content: [{ type: "tool_result", toolUseId: "t", content: "ok" }] }]);
  assert.deepEqual(msg.content, [{ type: "tool_result", tool_use_id: "t", content: "ok" }]);
});

console.log("anthropicClient.test: ok");
