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

/** POST a single (non-streaming) request to `https://api.anthropic.com/v1/messages`; resolves to the concatenated text.
 *  Throws `AnthropicError` on any non-2xx (with the API `error.message` when the body is the documented error shape) or a
 *  transport failure (status 0). Never retries — a 4xx is caller-correctable (key/model/request), a 429/5xx is the caller's
 *  policy to re-issue. The response `content` is a HETEROGENEOUS block array; adaptive-thinking models emit a `thinking`
 *  block (no usable `.text`) alongside the `text` block, so we concatenate ONLY `type === "text"` blocks. */
export async function callAnthropic(args: CallAnthropicArgs): Promise<CallAnthropicResult> {
  const f = args.fetchImpl ?? fetch;
  const body: Record<string, unknown> = {
    model: args.model,
    max_tokens: args.maxTokens,
    messages: args.messages,
  };
  if (args.system !== undefined) body.system = args.system;

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

/** A short, human label for an Anthropic failure — for the test command's notification + output-channel detail. */
export function anthropicErrorLabel(e: unknown): string {
  if (e instanceof AnthropicError) {
    if (e.status === -1) return "cancelled";
    if (e.status === 0) return "offline";
    if (e.status === 401 || e.status === 403) return "invalid or unauthorized API key";
    if (e.status === 404) return "model not found (check crl.agent.anthropicModel)"; // a bad model id → 404, not 400
    if (e.status === 429) return "rate limited";
    if (e.status === 400) return "bad request (check the model + request)";
    if (e.status >= 500) return "Anthropic service error";
    return `Anthropic ${e.status}`;
  }
  return "error";
}
