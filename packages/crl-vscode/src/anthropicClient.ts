// #210 editor agent Todo A — a pure, `vscode`-free POST to Anthropic's Messages API. Mirrors `githubIssue.ts`: one
// effectful helper, an injectable `fetchImpl` for node tests, a typed error class carrying the HTTP status (0 = transport),
// and an error-label helper. The AnthropicProvider (agentModelProvider.ts) is the only caller; keeping this module free of
// `vscode` lets it run under the `.test.mjs` harness (esbuild-bundle-then-require) with an injected fetch — no network.

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

/** One turn in the conversation. The Anthropic `system` prompt is a top-level field, NOT a message (see callAnthropic). */
export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CallAnthropicArgs {
  apiKey: string;
  model: string;
  /** Top-level system prompt; omitted from the body when undefined (the API rejects a `system: null`). */
  system?: string;
  messages: AnthropicMessage[];
  /** Required by the API — every request 400s without it. */
  maxTokens: number;
  /** injected for tests; defaults to the global `fetch` (present in the VS Code extension-host Node ≥18). */
  fetchImpl?: typeof fetch;
  /** wired from a CancellationToken by the provider — aborts the in-flight POST. */
  signal?: AbortSignal;
}

export interface CallAnthropicResult {
  text: string;
  stopReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
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

  // Concatenate ONLY text blocks. A naive `content.map(b => b.text)` corrupts output on adaptive-thinking models — a
  // `thinking` block has no `.text`, so it would splice `undefined` into the reply.
  let text = "";
  if (Array.isArray(parsed.content)) {
    for (const block of parsed.content) {
      if (block && typeof block === "object" && (block as { type?: unknown }).type === "text") {
        const t = (block as { text?: unknown }).text;
        if (typeof t === "string") text += t;
      }
    }
  }

  const inputTokens = parsed.usage?.input_tokens;
  const outputTokens = parsed.usage?.output_tokens;
  return {
    text,
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
 *  throws). */
export async function streamAnthropic(
  args: CallAnthropicArgs & { stream: true },
  onText: (t: string) => void,
): Promise<CallAnthropicResult> {
  let text = "";
  let stopReason: string | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  const result = (): CallAnthropicResult => ({ text, stopReason, usage: { inputTokens, outputTokens } });

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
      delta?: { type?: unknown; text?: unknown; stop_reason?: unknown };
      message?: { usage?: { input_tokens?: unknown } };
      usage?: { output_tokens?: unknown };
      error?: { type?: unknown; message?: unknown };
    };
    try {
      data = JSON.parse(ev.data);
    } catch {
      throw new AnthropicError(200, "malformed Anthropic stream event");
    }
    const t = data.type;
    if (t === "content_block_delta") {
      if (data.delta?.type === "text_delta" && typeof data.delta.text === "string") {
        onText(data.delta.text);
        text += data.delta.text;
      }
      // thinking_delta / signature_delta / any other block delta → skip (no visible text), never throw.
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
      return true;
    }
    // `ping` + `content_block_start`/`content_block_stop` + anything else → ignored.
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
