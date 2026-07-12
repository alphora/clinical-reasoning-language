// #210 editor agent Todo A — the model-provider abstraction. Two backends behind one interface: `vscode-lm` (the user's
// Copilot Chat models, zero-setup) and `anthropic` (a raw POST via anthropicClient.ts, key from env or SecretStorage).
// This module imports `vscode`, but the KEY-RESOLUTION helpers (`resolveAnthropicKey`, `anthropicKeySource`) are pure +
// exported so they're node-testable — the same split as the cockpit's pure cores. Non-streaming: `complete` returns the
// whole reply (streaming lands with the chat pane, Todo B). `tools` is accepted but UNUSED here (future-proofing the seam
// so Todo C's tool-calling is additive, not a churn of every call site).
import * as vscode from "vscode";
import { callAnthropic, streamAnthropic, type AnthropicMessage } from "./anthropicClient";

export interface ModelMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ModelRequest {
  system?: string;
  messages: ModelMessage[];
  /** Output cap — honored by the `anthropic` backend; the `vscode-lm` backend uses the Copilot model's own default. */
  maxTokens?: number;
  /** Accepted but UNSUPPORTED in Todo A — the seam Todo C's tool-calling fills in. Passing a non-empty `tools` now
   *  throws (fail-fast) so a backend that hasn't implemented it can't silently degrade to a plain text completion. */
  tools?: unknown[];
  token?: vscode.CancellationToken;
}

/** The two provider-unavailable messages — plain text (shown in a notification, which does NOT render Markdown). */
export const VSCODE_LM_UNAVAILABLE = "No language model available — install the GitHub Copilot Chat extension, or set crl.agent.provider to 'anthropic'.";
export const ANTHROPIC_UNAVAILABLE = "No Anthropic API key — run 'CRL: Set Anthropic API Key' or set ANTHROPIC_API_KEY.";

export interface ModelResponse {
  text: string;
  stopReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

/** A streamed increment. TAGGED from day one (a discriminated union on `type`) so Todo C's tool-calling adds a
 *  `{ type: "tool_use"; … }` variant WITHOUT reshaping the `onDelta` callback or touching the host post loop. */
export type StreamDelta = { type: "text"; text: string };

export interface ModelProvider {
  readonly id: "vscode-lm" | "anthropic";
  isAvailable(): Promise<boolean>;
  complete(req: ModelRequest): Promise<ModelResponse>;
  /** Stream the reply, emitting each delta via `onDelta`, and resolve with the full `ModelResponse` (text + stopReason +
   *  usage). A CANCEL (`req.token`) FINALIZES the accumulated partial as `{ …, stopReason: "cancelled" }` — it does NOT
   *  throw; only a genuine failure throws. Mirrors `complete`'s fail-fast on a non-empty `req.tools`. */
  stream(req: ModelRequest, onDelta: (d: StreamDelta) => void): Promise<ModelResponse>;
}

/** Default per-request output cap for the Anthropic backend (the connectivity proof is tiny; the chat pane will raise it). */
export const DEFAULT_MAX_TOKENS = 1024;

/** SecretStorage key for the Anthropic API key (written by the `crl.agent.setAnthropicKey` command). */
export const ANTHROPIC_SECRET_KEY = "crl.agent.anthropicApiKey";

/** Pure key-resolution: env wins over SecretStorage, but ONLY a non-blank env value — an empty/whitespace `ANTHROPIC_API_KEY`
 *  must NOT win (that would send an empty key and 401 with the secret sitting right there). Trims both; blank → undefined. */
export function resolveAnthropicKey(envKey: string | undefined, secretKey: string | undefined): string | undefined {
  return envKey?.trim() || secretKey?.trim() || undefined;
}

/** Which source a resolved key came from — reported by the test command (the SOURCE, never the key itself). */
export function anthropicKeySource(
  envKey: string | undefined,
  secretKey: string | undefined,
): "environment" | "secret storage" | "none" {
  if (envKey?.trim()) return "environment";
  if (secretKey?.trim()) return "secret storage";
  return "none";
}

/** The Copilot-Chat backend. `isAvailable` = at least one chat model is contributed; consent fires on the first request. */
export class VsCodeLmProvider implements ModelProvider {
  readonly id = "vscode-lm" as const;

  async isAvailable(): Promise<boolean> {
    return (await vscode.lm.selectChatModels({ vendor: "copilot" })).length > 0;
  }

  /** `LanguageModelChatMessage` has no System role, so translate the system prompt into a leading User message. It's a
   *  deliberate lossy mapping — the model treats it as the opening user turn rather than an operator instruction. Shared
   *  by `complete` + `stream` so the two build an identical message list. */
  private toLmMessages(req: ModelRequest): vscode.LanguageModelChatMessage[] {
    const msgs: vscode.LanguageModelChatMessage[] = [];
    if (req.system !== undefined) msgs.push(vscode.LanguageModelChatMessage.User(req.system));
    for (const m of req.messages) {
      msgs.push(
        m.role === "assistant"
          ? vscode.LanguageModelChatMessage.Assistant(m.content)
          : vscode.LanguageModelChatMessage.User(m.content),
      );
    }
    return msgs;
  }

  /** Map a request failure to an actionable plain `Error` (shared by `complete` + `stream`). `isAvailable` (models present)
   *  ≠ usable: the first request can throw when the user declined consent, or the request was blocked / the model vanished.
   *  A non-`LanguageModelError` is returned as-is (rethrow the original). */
  private lmError(e: unknown): unknown {
    if (e instanceof vscode.LanguageModelError) {
      if (e.code === "NoPermissions") return new Error("you declined model access — re-run to grant it");
      if (e.code === "Blocked") return new Error("the language model blocked this request");
      if (e.code === "NotFound") return new Error("the selected language model is no longer available");
      return new Error(`language model error: ${e.message}`);
    }
    return e;
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    if (req.tools?.length) throw new Error("tool-calling is not supported yet (Todo C)"); // fail-fast, never silently drop tools
    const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
    const model = models[0];
    if (!model) {
      throw new Error(VSCODE_LM_UNAVAILABLE);
    }
    try {
      const resp = await model.sendRequest(this.toLmMessages(req), {}, req.token);
      let text = "";
      for await (const chunk of resp.text) text += chunk;
      return { text };
    } catch (e) {
      throw this.lmError(e);
    }
  }

  async stream(req: ModelRequest, onDelta: (d: StreamDelta) => void): Promise<ModelResponse> {
    if (req.tools?.length) throw new Error("tool-calling is not supported yet (Todo C)"); // fail-fast, never silently drop tools
    const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
    const model = models[0];
    if (!model) {
      throw new Error(VSCODE_LM_UNAVAILABLE);
    }
    let text = "";
    try {
      // `resp.text` is an async-iterable of chunks — emit each as a tagged text delta and accumulate.
      const resp = await model.sendRequest(this.toLmMessages(req), {}, req.token);
      for await (const chunk of resp.text) {
        onDelta({ type: "text", text: chunk });
        text += chunk;
      }
      return { text };
    } catch (e) {
      // CANCEL = FINALIZE: a Stop cancels the token, which rejects the iteration (a LanguageModelError / CancellationError).
      // Return the accumulated partial as `stopReason:"cancelled"` rather than surfacing a red error. A genuine failure
      // (no cancellation requested) rethrows with the shared mapping.
      if (req.token?.isCancellationRequested) return { text, stopReason: "cancelled" };
      throw this.lmError(e);
    }
  }
}

/** The Anthropic backend. Key = env `ANTHROPIC_API_KEY` (best-effort — GUI-launched VS Code may not inherit shell env)
 *  else SecretStorage. `isAvailable` = a key resolves. */
export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic" as const;

  constructor(
    private readonly model: string,
    private readonly secrets: vscode.SecretStorage,
    /** env `ANTHROPIC_API_KEY` snapshot; the caller guards `typeof process` (web host has none). */
    private readonly envKey: string | undefined,
    /** injected for tests (defaults to global fetch) so `complete` is unit-testable without a network. */
    private readonly fetchImpl?: typeof fetch,
  ) {}

  private async resolveKey(): Promise<string | undefined> {
    return resolveAnthropicKey(this.envKey, await this.secrets.get(ANTHROPIC_SECRET_KEY));
  }

  async isAvailable(): Promise<boolean> {
    return (await this.resolveKey()) !== undefined;
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    if (req.tools?.length) throw new Error("tool-calling is not supported yet (Todo C)"); // fail-fast, never silently drop tools
    const apiKey = await this.resolveKey();
    if (!apiKey) {
      throw new Error(ANTHROPIC_UNAVAILABLE);
    }
    // Bridge the CancellationToken to an AbortController so a cancel aborts the in-flight POST; dispose the listener.
    // An ALREADY-cancelled token aborts before the POST goes out.
    const controller = new AbortController();
    if (req.token?.isCancellationRequested) controller.abort();
    const sub = req.token?.onCancellationRequested(() => controller.abort());
    try {
      const r = await callAnthropic({
        apiKey,
        model: this.model,
        system: req.system,
        messages: req.messages as AnthropicMessage[],
        maxTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        signal: controller.signal,
        fetchImpl: this.fetchImpl,
      });
      return { text: r.text, stopReason: r.stopReason, usage: r.usage };
    } finally {
      sub?.dispose();
    }
  }

  async stream(req: ModelRequest, onDelta: (d: StreamDelta) => void): Promise<ModelResponse> {
    if (req.tools?.length) throw new Error("tool-calling is not supported yet (Todo C)"); // fail-fast, never silently drop tools
    const apiKey = await this.resolveKey();
    if (!apiKey) {
      throw new Error(ANTHROPIC_UNAVAILABLE);
    }
    // Same token→AbortController bridge as `complete` — a cancel aborts the in-flight stream; an ALREADY-cancelled token
    // aborts before the POST. `streamAnthropic` turns that abort into a finalized partial (`stopReason:"cancelled"`), so
    // the cancel contract is identical across both backends without a throw here.
    const controller = new AbortController();
    if (req.token?.isCancellationRequested) controller.abort();
    const sub = req.token?.onCancellationRequested(() => controller.abort());
    try {
      const r = await streamAnthropic(
        {
          apiKey,
          model: this.model,
          system: req.system,
          messages: req.messages as AnthropicMessage[],
          maxTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          signal: controller.signal,
          fetchImpl: this.fetchImpl,
          stream: true,
        },
        (t) => onDelta({ type: "text", text: t }),
      );
      return { text: r.text, stopReason: r.stopReason, usage: r.usage };
    } finally {
      sub?.dispose();
    }
  }
}

export interface ResolveProviderDeps {
  secrets: vscode.SecretStorage;
  /** injected for tests → the anthropic backend's fetch. */
  fetchImpl?: typeof fetch;
}

/** Pick the backend from `crl.agent.provider` (default `vscode-lm`), construct it, and check availability. There is NO
 *  auto-fallback between providers — switching from Copilot to Anthropic sends clinical context to Anthropic's API, so it's
 *  an explicit user choice, never silent. On unavailability returns an actionable `unavailableReason` for the command to
 *  surface (the provider is still returned so callers can read its `id`). */
export async function resolveProvider(
  deps: ResolveProviderDeps,
): Promise<{ provider: ModelProvider; unavailableReason?: string }> {
  const cfg = vscode.workspace.getConfiguration("crl");
  const choice = cfg.get<"vscode-lm" | "anthropic">("agent.provider", "vscode-lm");

  if (choice === "anthropic") {
    const model = cfg.get<string>("agent.anthropicModel", "claude-sonnet-5");
    // The web/remote-web host has no `process`; guard before reading env so we fail with a clear message, not a crash.
    const envKey = typeof process !== "undefined" ? process.env.ANTHROPIC_API_KEY : undefined;
    const provider = new AnthropicProvider(model, deps.secrets, envKey, deps.fetchImpl);
    if (!(await provider.isAvailable())) {
      return { provider, unavailableReason: ANTHROPIC_UNAVAILABLE };
    }
    return { provider };
  }

  const provider = new VsCodeLmProvider();
  if (!(await provider.isAvailable())) {
    return { provider, unavailableReason: VSCODE_LM_UNAVAILABLE };
  }
  return { provider };
}
