// #210 editor agent Todo A/C — a pure, `vscode`-free POST to Anthropic's Messages API. Mirrors `githubIssue.ts`: one
// effectful helper, an injectable `fetchImpl` for node tests, a typed error class carrying the HTTP status (0 = transport),
// and an error-label helper. The AnthropicProvider (agentModelProvider.ts) is the only caller; keeping this module free of
// `vscode` lets it run under the `.test.mjs` harness (esbuild-bundle-then-require) with an injected fetch — no network.
// Todo C adds tool-calling: `tools` in the body, streamed `tool_use` blocks (per-index `input_json_delta` accumulation),
// an ordered `content: ContentBlock[]` for replay, and the explicit `ContentBlock → Anthropic wire` conversion (A9/A10/A12).
import type { ContentBlock, ToolSpec } from "./agentTypes";

/** An Anthropic Messages API failure carrying the HTTP status (0 = network/transport error) and the API `error.type`
 *  (e.g. `authentication_error`, `rate_limit_error`) when the body parsed as the documented `{type:"error", error}` shape. */
export class AnthropicError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errorType?: string,
  ) {
    super(message);
    this.name = "AnthropicError";
  }
}

/** A heterogeneous Anthropic wire content block (Todo C). Assistant turns carry `text` + `tool_use`; user turns carry
 *  `text` + `tool_result`. `tool_result.content` is sent as a plain string (the API accepts string or block-array). */
export type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

/** One turn in the conversation. The Anthropic `system` prompt is a top-level field, NOT a message (see callAnthropic).
 *  `content` is a plain string (text-only, the common case) OR a wire block array (tool rounds). */
export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicBlock[];
}

export interface CallAnthropicArgs {
  apiKey: string;
  model: string;
  /** Top-level system prompt; omitted from the body when undefined (the API rejects a `system: null`). */
  system?: string;
  messages: AnthropicMessage[];
  /** Required by the API — every request 400s without it. */
  maxTokens: number;
  /** Tools the model may call this request (Todo C). Mapped to the wire `{name, description, input_schema}`; omitted from
   *  the body when empty (a plain completion sends no `tools`). */
  tools?: ToolSpec[];
  /** injected for tests; defaults to the global `fetch` (present in the VS Code extension-host Node ≥18). */
  fetchImpl?: typeof fetch;
  /** wired from a CancellationToken by the provider — aborts the in-flight POST. */
  signal?: AbortSignal;
}

export interface CallAnthropicResult {
  text: string;
  /** The assistant turn's ordered content blocks (text + tool_use), in wire order — for replay (Todo C, A3/A10). */
  content?: ContentBlock[];
  stopReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

/** Convert provider-neutral `ModelMessage.content` (string | ContentBlock[]) to the Anthropic wire shape (A12 — replaces
 *  the old unsafe `as AnthropicMessage[]` cast). A plain string passes through; a block array maps text/tool_use/tool_result
 *  1:1, preserving order. Empty text blocks are dropped (the API rejects an empty-content turn / empty text block). */
export function toAnthropicMessages(
  messages: { role: "user" | "assistant"; content: string | ContentBlock[] }[],
): AnthropicMessage[] {
  return messages.map((m) => {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    const blocks: AnthropicBlock[] = [];
    for (const b of m.content) {
      if (b.type === "text") {
        if (b.text) blocks.push({ type: "text", text: b.text }); // drop empty text (API rejects it)
      } else if (b.type === "tool_use") {
        blocks.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
      } else {
        blocks.push({ type: "tool_result", tool_use_id: b.toolUseId, content: b.content, ...(b.isError ? { is_error: true } : {}) });
      }
    }
    return { role: m.role, content: blocks };
  });
}

/** The shared Anthropic Messages POST — URL, headers, body assembly (incl. `system`-omit + `max_tokens` + an optional
 *  `stream:true`), the cancel→`AnthropicError(-1)` mapping, AND the CRITICAL `!res.ok` non-2xx JSON error parse. Both
 *  `callAnthropic` (stream=false) and `streamAnthropic` (stream=true) go through it so the request shape + error handling
 *  can't drift. Resolves to a guaranteed-`ok` Response; the caller reads the body (JSON for non-streaming, the SSE
 *  ReadableStream for streaming). NOTE: the commonest failures (401/429/400/529) return a non-2xx JSON error body, NOT an
 *  SSE stream — parsing that as frames would find no deltas and silently produce an empty reply, so the `!res.ok` check
 *  MUST happen here, before any body read. */
async function postAnthropicMessages(args: CallAnthropicArgs, stream: boolean): Promise<Awaited<ReturnType<typeof fetch>>> {
  const f = args.fetchImpl ?? fetch;
  const body: Record<string, unknown> = {
    model: args.model,
    max_tokens: args.maxTokens,
    messages: args.messages,
  };
  if (args.system !== undefined) body.system = args.system;
  // Map the provider-neutral ToolSpec → the Anthropic wire (`input_schema`). Omit `tools` entirely for a plain completion.
  if (args.tools?.length) body.tools = args.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  if (stream) body.stream = true;

  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await f("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: args.signal,
    });
  } catch (e) {
    // A cancel (AbortController.abort) rejects `fetch` here too — distinguish it from a real network failure so it isn't
    // mislabelled "offline". Status -1 = cancelled.
    if (args.signal?.aborted || (e instanceof Error && e.name === "AbortError")) {
      throw new AnthropicError(-1, "request cancelled", "aborted");
    }
    throw new AnthropicError(0, `network error: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!res.ok) {
    let message = `Anthropic ${res.status}`;
    let errorType: string | undefined;
    try {
      const j = (await res.json()) as { type?: unknown; error?: { type?: unknown; message?: unknown } };
      if (j && typeof j.error?.message === "string" && j.error.message) message = j.error.message;
      if (j && typeof j.error?.type === "string") errorType = j.error.type;
    } catch {
      /* non-JSON error body — status alone */
    }
    throw new AnthropicError(res.status, message, errorType);
  }

  return res;
}

/** POST a single (non-streaming) request to `https://api.anthropic.com/v1/messages`; resolves to the concatenated text.
 *  Throws `AnthropicError` on any non-2xx (with the API `error.message` when the body is the documented error shape) or a
 *  transport failure (status 0). Never retries — a 4xx is caller-correctable (key/model/request), a 429/5xx is the caller's
 *  policy to re-issue. The response `content` is a HETEROGENEOUS block array; adaptive-thinking models emit a `thinking`
 *  block (no usable `.text`) alongside the `text` block, so we concatenate ONLY `type === "text"` blocks. */
export async function callAnthropic(args: CallAnthropicArgs): Promise<CallAnthropicResult> {
  const res = await postAnthropicMessages(args, false);

  let parsed: {
    content?: unknown;
    stop_reason?: unknown;
    usage?: { input_tokens?: unknown; output_tokens?: unknown };
  };
  try {
    parsed = (await res.json()) as typeof parsed;
  } catch {
    throw new AnthropicError(res.status, "Anthropic response was not JSON");
  }

  // Walk the HETEROGENEOUS block array in order: concatenate `text` blocks into the reply, and collect `text`+`tool_use`
  // blocks into the ordered `content` for replay (Todo C). A `thinking` block has no `.text` and is skipped for both — a
  // naive `content.map(b => b.text)` would splice `undefined` into the reply.
  let text = "";
  const content: ContentBlock[] = [];
  if (Array.isArray(parsed.content)) {
    for (const block of parsed.content) {
      if (!block || typeof block !== "object") continue;
      const bt = (block as { type?: unknown }).type;
      if (bt === "text") {
        const t = (block as { text?: unknown }).text;
        if (typeof t === "string") {
          text += t;
          if (t) content.push({ type: "text", text: t });
        }
      } else if (bt === "tool_use") {
        const tu = block as { id?: unknown; name?: unknown; input?: unknown };
        if (typeof tu.id === "string" && typeof tu.name === "string") {
          content.push({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input ?? {} });
        }
      }
    }
  }

  const inputTokens = parsed.usage?.input_tokens;
  const outputTokens = parsed.usage?.output_tokens;
  return {
    text,
    content: content.length ? content : undefined,
    stopReason: typeof parsed.stop_reason === "string" ? parsed.stop_reason : undefined,
    usage: {
      inputTokens: typeof inputTokens === "number" ? inputTokens : undefined,
      outputTokens: typeof outputTokens === "number" ? outputTokens : undefined,
    },
  };
}

/** One decoded SSE event: the optional `event:` name + the joined `data:` payload. */
export interface SseEvent {
  event?: string;
  data: string;
}

/** Split an SSE text buffer into complete events at blank-line frame boundaries, keeping a trailing PARTIAL frame in
 *  `rest` for the next chunk to prepend. Pure + Node-testable (no fetch/vscode). Rules per the SSE grammar: frames are
 *  separated by a blank line (CRLF or LF — normalized here); within a frame a `:`-leading line is a comment/heartbeat and
 *  is ignored; a `data:` line's value has one leading space stripped; MULTIPLE `data:` lines join with `\n`. A frame with
 *  no `data:` line (a bare comment/heartbeat or an `event:`-only frame) emits NO event. The caller re-invokes with
 *  `rest + nextChunk`, so re-normalizing `\r\n` on every call is safe (a `\r` stranded at a chunk boundary rejoins its
 *  `\n`). */
export function parseSseFrames(text: string): { events: SseEvent[]; rest: string } {
  const normalized = text.replace(/\r\n/g, "\n");
  const frames = normalized.split("\n\n");
  const rest = frames.pop() ?? ""; // the trailing (possibly empty) partial frame — never yet terminated by a blank line
  const events: SseEvent[] = [];
  for (const frame of frames) {
    if (!frame) continue; // an empty frame (consecutive blank lines) carries nothing
    let event: string | undefined;
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line === "" || line.startsWith(":")) continue; // blank or a `:`-comment/heartbeat line
      const idx = line.indexOf(":");
      const field = idx === -1 ? line : line.slice(0, idx);
      let value = idx === -1 ? "" : line.slice(idx + 1);
      if (value.startsWith(" ")) value = value.slice(1); // the SSE single-leading-space rule
      if (field === "event") event = value;
      else if (field === "data") dataLines.push(value);
    }
    if (dataLines.length === 0) continue; // no payload → not an event we surface
    events.push({ event, data: dataLines.join("\n") });
  }
  return { events, rest };
}

/** POST a STREAMING request and emit each text delta via `onText` as it arrives, resolving with the full `CallAnthropicResult`
 *  (text + stop_reason + usage) — the streaming twin of `callAnthropic`. Reads the SSE body via `res.body.getReader()` + a
 *  streaming `TextDecoder` (so a multibyte char split across chunks isn't corrupted), splits frames with `parseSseFrames`,
 *  and per the Messages stream protocol: `content_block_delta`→`text_delta` is content (accumulated + emitted); a
 *  `thinking_delta`/`signature_delta`/`ping`/other non-text event is SKIPPED (never throws); `message_start` carries
 *  `usage.input_tokens`; `message_delta` carries `stop_reason` + `usage.output_tokens`; an `error` EVENT (a 200 that then
 *  streams a failure) throws `AnthropicError(200,…)`; `message_stop` ends it. A `!res.ok` throws (via the shared
 *  `postAnthropicMessages`) BEFORE the body is read. CANCEL = FINALIZE, not error: if the token-bridged signal aborts
 *  during the read, STOP and RETURN the accumulated result with `stopReason:"cancelled"` (a genuine reader error still
 *  throws). `onThinking` (optional) brackets an adaptive-thinking block: `"start"` on a `content_block_start` of
 *  `type:"thinking"`, `"stop"` on the arrival of the first text (a `content_block_start` of `type:"text"` OR the first
 *  `text_delta`), and — if thinking is still open — on `message_stop`. The thinking TEXT stays skipped (`display:"omitted"`
 *  sends none); only the STATE is surfaced so the caller can time it. */
export async function streamAnthropic(
  args: CallAnthropicArgs & { stream: true },
  onText: (t: string) => void,
  onThinking?: (state: "start" | "stop") => void,
  /** Todo C — invoked ONCE per tool call when its input is fully assembled (at the block's `content_block_stop`). A cancel
   *  before the stop never fires this (no partial tool_use). The provider maps it to a `{type:"tool_use"}` StreamDelta. */
  onToolUse?: (block: { id: string; name: string; input: unknown }) => void,
): Promise<CallAnthropicResult> {
  let text = "";
  let stopReason: string | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let thinking = false; // an adaptive-thinking block is open (start emitted, stop not yet)
  // Per-index block accumulators (Todo C). `text` blocks accumulate `.text`; `tool_use` blocks accumulate `.json`
  // (`input_json_delta.partial_json`) and set `.input` at `content_block_stop`. `content` is assembled in index order,
  // including a `tool_use` block ONLY once finalized (`.input` set) — so a cancel mid-accumulation drops the partial call.
  interface BlockAcc { type: "text" | "tool_use" | "thinking" | "other"; id?: string; name?: string; text: string; json: string; input?: unknown; hasInput: boolean; }
  const blocks = new Map<number, BlockAcc>();
  const buildContent = (): ContentBlock[] | undefined => {
    const out: ContentBlock[] = [];
    for (const idx of [...blocks.keys()].sort((a, b) => a - b)) {
      const b = blocks.get(idx)!;
      if (b.type === "text") {
        if (b.text) out.push({ type: "text", text: b.text });
      } else if (b.type === "tool_use" && b.hasInput && b.id && b.name) {
        out.push({ type: "tool_use", id: b.id, name: b.name, input: b.input ?? {} });
      }
    }
    return out.length ? out : undefined;
  };
  const result = (): CallAnthropicResult => ({ text, content: buildContent(), stopReason, usage: { inputTokens, outputTokens } });

  // A cancel DURING the POST (before the body) also rejects — `postAnthropicMessages` maps it to `AnthropicError(-1)`.
  // Finalize (empty) as cancelled here too, so a Stop before the first byte is never surfaced as a red error (gpt55 [critical]).
  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await postAnthropicMessages(args, true);
  } catch (e) {
    if (e instanceof AnthropicError && e.status === -1) {
      stopReason = "cancelled";
      return result();
    }
    throw e;
  }
  if (res.body == null) throw new AnthropicError(res.status, "no response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Process one decoded SSE event; returns true to STOP (`message_stop`). Throws on an `error` event or a malformed frame
  // (parseSseFrames only emits COMPLETE frames, so malformed JSON here is genuine corruption — surface it, don't silently
  // truncate the reply — gpt55 [important]).
  const handle = (ev: SseEvent): boolean => {
    let data: {
      type?: unknown;
      index?: unknown;
      delta?: { type?: unknown; text?: unknown; partial_json?: unknown; stop_reason?: unknown };
      content_block?: { type?: unknown; id?: unknown; name?: unknown };
      message?: { usage?: { input_tokens?: unknown } };
      usage?: { output_tokens?: unknown };
      error?: { type?: unknown; message?: unknown };
    };
    try {
      data = JSON.parse(ev.data);
    } catch {
      throw new AnthropicError(200, "malformed Anthropic stream event");
    }
    // Close an open thinking block the moment text arrives (belt-and-suspenders: the `content_block_start(text)` normally
    // fires first, but a `text_delta` with no preceding text-block-start still collapses the indicator).
    const endThinking = (): void => {
      if (thinking) {
        thinking = false;
        onThinking?.("stop");
      }
    };
    const idx = typeof data.index === "number" ? data.index : undefined;
    const t = data.type;
    if (t === "content_block_delta") {
      if (data.delta?.type === "text_delta" && typeof data.delta.text === "string") {
        endThinking();
        onText(data.delta.text);
        text += data.delta.text;
        if (idx !== undefined) { const b = blocks.get(idx); if (b) b.text += data.delta.text; }
      } else if (data.delta?.type === "input_json_delta" && typeof data.delta.partial_json === "string") {
        // Accumulate the tool-call input JSON fragments for this block; parsed at `content_block_stop` (Todo C, A9).
        if (idx !== undefined) { const b = blocks.get(idx); if (b) b.json += data.delta.partial_json; }
      }
      // thinking_delta / signature_delta / any other block delta → skip (no visible text), never throw.
    } else if (t === "content_block_start") {
      // Register the block by index. A `thinking` block opens the indicator; a `text`/`tool_use` block closes any open one.
      const bt = data.content_block?.type;
      const cbId = typeof data.content_block?.id === "string" ? data.content_block.id : undefined;
      const cbName = typeof data.content_block?.name === "string" ? data.content_block.name : undefined;
      const type = bt === "text" ? "text" : bt === "tool_use" ? "tool_use" : bt === "thinking" ? "thinking" : "other";
      if (idx !== undefined) blocks.set(idx, { type, id: cbId, name: cbName, text: "", json: "", hasInput: false });
      if (bt === "thinking") {
        if (!thinking) {
          thinking = true;
          onThinking?.("start");
        }
      } else if (bt === "text" || bt === "tool_use") {
        endThinking();
      }
    } else if (t === "content_block_stop") {
      // Finalize the block. A `tool_use` block parses its accumulated JSON (empty → `{}`, never `JSON.parse("")`); malformed
      // JSON is genuine corruption → throw (there's no valid tool to answer). Emit the tool_use ONCE, here (Todo C, A9/A10).
      if (idx !== undefined) {
        const b = blocks.get(idx);
        if (b && b.type === "tool_use" && !b.hasInput) {
          let input: unknown;
          try {
            input = JSON.parse(b.json.trim() || "{}");
          } catch {
            throw new AnthropicError(200, "malformed Anthropic tool input");
          }
          b.input = input;
          b.hasInput = true;
          if (b.id && b.name) onToolUse?.({ id: b.id, name: b.name, input });
        }
      }
    } else if (t === "message_start") {
      const it = data.message?.usage?.input_tokens;
      if (typeof it === "number") inputTokens = it;
    } else if (t === "message_delta") {
      if (typeof data.delta?.stop_reason === "string") stopReason = data.delta.stop_reason;
      const ot = data.usage?.output_tokens;
      if (typeof ot === "number") outputTokens = ot;
    } else if (t === "error") {
      const msg = typeof data.error?.message === "string" && data.error.message ? data.error.message : "Anthropic stream error";
      const et = typeof data.error?.type === "string" ? data.error.type : undefined;
      throw new AnthropicError(200, msg, et);
    } else if (t === "message_stop") {
      endThinking(); // a thinking-only reply (no text) still closes the indicator before we finalize
      return true;
    }
    // `ping` + anything else → ignored.
    return false;
  };

  let finished = false;
  while (!finished) {
    // A cancel between reads → finalize the partial (don't throw). Also covers an already-aborted signal before read 1.
    if (args.signal?.aborted) {
      stopReason = "cancelled";
      try {
        await reader.cancel();
      } catch {
        /* best-effort — the fetch abort already tore the stream down */
      }
      return result();
    }

    let chunk: Awaited<ReturnType<typeof reader.read>>;
    try {
      chunk = await reader.read();
    } catch (e) {
      // The abort rejects the in-flight read too — that's a cancel (finalize), not an error. A genuine reader error rethrows.
      if (args.signal?.aborted || (e instanceof Error && e.name === "AbortError")) {
        stopReason = "cancelled";
        return result();
      }
      throw e;
    }
    if (chunk.done) {
      // Flush the streaming decoder + process any final frame not blank-line-terminated (belt-and-suspenders — Anthropic
      // normally ends with `\n\n` + `message_stop` before `done`; a truncated final newline would otherwise drop it).
      buffer += decoder.decode();
      if (buffer.trim()) for (const ev of parseSseFrames(buffer.endsWith("\n\n") ? buffer : `${buffer}\n\n`).events) if (handle(ev)) break;
      break;
    }

    buffer += decoder.decode(chunk.value, { stream: true });
    const { events, rest } = parseSseFrames(buffer);
    buffer = rest;
    for (const ev of events) {
      if (handle(ev)) {
        finished = true;
        break;
      }
    }
  }

  return result();
}

/** A short, human label for an Anthropic failure — for the test command's notification + output-channel detail. */
export function anthropicErrorLabel(e: unknown): string {
  if (e instanceof AnthropicError) {
    if (e.status === -1) return "cancelled";
    if (e.status === 0) return "offline";
    if (e.status === 401 || e.status === 403) return "invalid or unauthorized API key";
    if (e.status === 404) return "model not found (check crl.agent.anthropicModel)"; // a bad model id → 404, not 400
    if (e.status === 429) return "rate limited";
    if (e.status === 400) return "bad request (check the model + request)";
    if (e.status === 200) return e.errorType || e.message || "stream error"; // a mid-stream `error` event — surface the reason
    if (e.status >= 500) return "Anthropic service error";
    return `Anthropic ${e.status}`;
  }
  return e instanceof Error ? e.message : "error"; // a raw reader/other error keeps its message, not a bare "error"
}
