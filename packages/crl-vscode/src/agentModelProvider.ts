// #210 editor agent Todo A/C — the model-provider abstraction. Two backends behind one interface: `vscode-lm` (the user's
// Copilot Chat models, zero-setup) and `anthropic` (a raw POST via anthropicClient.ts, key from env or SecretStorage). The
// shared TYPE surface lives in the pure `agentTypes.ts` (so the streaming client + the loop driver import it without
// `vscode`); this module re-exports it and adds the two vscode-backed IMPLEMENTATIONS. Todo C: both backends implement
// tool-calling — Anthropic via the wire `tools`/`tool_use`; vscode-lm via `LanguageModelChatTool` + the `.stream` parts,
// SYNTHESIZING `stopReason:"tool_use"` when any tool-call part is seen (the LM API has no stop-reason), and gracefully
// degrading to plain chat on a non-tool Copilot model (no capability probe — Todo C, R1).
import * as vscode from "vscode";
import { callAnthropic, streamAnthropic, toAnthropicMessages } from "./anthropicClient";
import {
  ANTHROPIC_SECRET_KEY,
  ANTHROPIC_UNAVAILABLE,
  DEFAULT_MAX_TOKENS,
  VSCODE_LM_UNAVAILABLE,
  type ContentBlock,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type StreamDelta,
  type ToolSpec,
} from "./agentTypes";

// Re-export the shared type surface + constants so existing importers (agentChat.ts, agentCommands.ts) keep importing from
// here. `export *` carries the types AND the value constants (VSCODE_LM_UNAVAILABLE, DEFAULT_MAX_TOKENS, …).
export * from "./agentTypes";

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

/** The Copilot-Chat backend. `isAvailable` = at least one chat model is contributed; consent fires on the first request.
 *  Tool-calling: pass `tools` + `toolMode:Auto`, read `.stream` parts, and synthesize the tool-use stop. */
export class VsCodeLmProvider implements ModelProvider {
  readonly id = "vscode-lm" as const;

  async isAvailable(): Promise<boolean> {
    return (await vscode.lm.selectChatModels({ vendor: "copilot" })).length > 0;
  }

  /** Map our messages to `LanguageModelChatMessage[]`. `LanguageModelChatMessage` has no System role, so the system prompt
   *  becomes a leading User message (deliberate lossy mapping). A `ContentBlock[]` content replays tool exchanges: an
   *  assistant turn carries text + `LanguageModelToolCallPart`; a user turn carries text + `LanguageModelToolResultPart`. */
  private toLmMessages(req: ModelRequest): vscode.LanguageModelChatMessage[] {
    const msgs: vscode.LanguageModelChatMessage[] = [];
    if (req.system !== undefined) msgs.push(vscode.LanguageModelChatMessage.User(req.system));
    for (const m of req.messages) {
      if (typeof m.content === "string") {
        msgs.push(
          m.role === "assistant"
            ? vscode.LanguageModelChatMessage.Assistant(m.content)
            : vscode.LanguageModelChatMessage.User(m.content),
        );
        continue;
      }
      if (m.role === "assistant") {
        const parts: (vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart)[] = [];
        for (const b of m.content) {
          if (b.type === "text") {
            if (b.text) parts.push(new vscode.LanguageModelTextPart(b.text));
          } else if (b.type === "tool_use") {
            parts.push(new vscode.LanguageModelToolCallPart(b.id, b.name, (b.input ?? {}) as object));
          }
        }
        msgs.push(vscode.LanguageModelChatMessage.Assistant(parts));
      } else {
        const parts: (vscode.LanguageModelTextPart | vscode.LanguageModelToolResultPart)[] = [];
        for (const b of m.content) {
          if (b.type === "text") {
            if (b.text) parts.push(new vscode.LanguageModelTextPart(b.text));
          } else if (b.type === "tool_result") {
            parts.push(new vscode.LanguageModelToolResultPart(b.toolUseId, [new vscode.LanguageModelTextPart(b.content)]));
          }
        }
        msgs.push(vscode.LanguageModelChatMessage.User(parts));
      }
    }
    return msgs;
  }

  private toLmTools(tools: ToolSpec[]): vscode.LanguageModelChatTool[] {
    return tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
  }

  /** Map a request failure to an actionable plain `Error`. `isAvailable` (models present) ≠ usable: the first request can
   *  throw when the user declined consent, or the request was blocked / the model vanished. A non-`LanguageModelError` is
   *  rethrown as-is. */
  private lmError(e: unknown): unknown {
    if (e instanceof vscode.LanguageModelError) {
      if (e.code === "NoPermissions") return new Error("you declined model access — re-run to grant it");
      if (e.code === "Blocked") return new Error("the language model blocked this request");
      if (e.code === "NotFound") return new Error("the selected language model is no longer available");
      return new Error(`language model error: ${e.message}`);
    }
    return e;
  }

  /** Shared request path for `complete` (onDelta undefined) + `stream`. Iterates the `.stream` parts (text + tool-call),
   *  builds the ordered `content` (coalescing consecutive text), and — the LM API has NO stop reason — sets
   *  `stopReason:"tool_use"` iff any tool-call part arrived (so the loop driver continues). A non-tool model simply yields
   *  text and no tool-call parts → `stopReason` undefined → the loop ends (graceful degrade). */
  private async run(req: ModelRequest, onDelta?: (d: StreamDelta) => void): Promise<ModelResponse> {
    const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
    const model = models[0];
    if (!model) throw new Error(VSCODE_LM_UNAVAILABLE);
    const options: vscode.LanguageModelChatRequestOptions = {};
    if (req.tools?.length) {
      options.tools = this.toLmTools(req.tools);
      options.toolMode = vscode.LanguageModelChatToolMode.Auto;
    }
    let text = "";
    let sawToolCall = false;
    const content: ContentBlock[] = [];
    const pushText = (s: string): void => {
      const last = content[content.length - 1];
      if (last && last.type === "text") last.text += s;
      else content.push({ type: "text", text: s });
    };
    try {
      const resp = await model.sendRequest(
        this.toLmMessages(req),
        options,
        req.token as vscode.CancellationToken | undefined,
      );
      for await (const part of resp.stream) {
        if (part instanceof vscode.LanguageModelTextPart) {
          onDelta?.({ type: "text", text: part.value });
          text += part.value;
          pushText(part.value);
        } else if (part instanceof vscode.LanguageModelToolCallPart) {
          sawToolCall = true;
          const input = part.input ?? {};
          content.push({ type: "tool_use", id: part.callId, name: part.name, input });
          onDelta?.({ type: "tool_use", id: part.callId, name: part.name, input });
        }
        // Other parts (data / future) → ignore.
      }
      return { text, content: content.length ? content : undefined, stopReason: sawToolCall ? "tool_use" : undefined };
    } catch (e) {
      // CANCEL = FINALIZE: a Stop cancels the token, which rejects the iteration. Return the accumulated partial as
      // `stopReason:"cancelled"` (never a red error). A genuine failure (no cancellation) rethrows with the shared mapping.
      if (req.token?.isCancellationRequested) {
        return { text, content: content.length ? content : undefined, stopReason: "cancelled" };
      }
      throw this.lmError(e);
    }
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    return this.run(req);
  }

  async stream(req: ModelRequest, onDelta: (d: StreamDelta) => void): Promise<ModelResponse> {
    return this.run(req, onDelta);
  }
}

/** The Anthropic backend. Key = env `ANTHROPIC_API_KEY` (best-effort — GUI-launched VS Code may not inherit shell env)
 *  else SecretStorage. `isAvailable` = a key resolves. Tool-calling is native (the wire `tools`/`tool_use`). */
export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic" as const;

  constructor(
    private readonly model: string,
    private readonly secrets: vscode.SecretStorage,
    /** env `ANTHROPIC_API_KEY` snapshot; the caller guards `typeof process` (web host has none). */
    private readonly envKey: string | undefined,
    /** injected for tests (defaults to global fetch) so the backend is unit-testable without a network. */
    private readonly fetchImpl?: typeof fetch,
  ) {}

  private async resolveKey(): Promise<string | undefined> {
    return resolveAnthropicKey(this.envKey, await this.secrets.get(ANTHROPIC_SECRET_KEY));
  }

  async isAvailable(): Promise<boolean> {
    return (await this.resolveKey()) !== undefined;
  }

  /** Bridge the CancellationToken to an AbortController so a cancel aborts the in-flight POST; dispose the listener. An
   *  ALREADY-cancelled token aborts before the POST goes out. Shared by `complete` + `stream`. */
  private abortFor(req: ModelRequest): { controller: AbortController; sub?: { dispose(): void } } {
    const controller = new AbortController();
    if (req.token?.isCancellationRequested) controller.abort();
    const sub = req.token?.onCancellationRequested(() => controller.abort());
    return { controller, sub };
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const apiKey = await this.resolveKey();
    if (!apiKey) throw new Error(ANTHROPIC_UNAVAILABLE);
    const { controller, sub } = this.abortFor(req);
    try {
      const r = await callAnthropic({
        apiKey,
        model: this.model,
        system: req.system,
        messages: toAnthropicMessages(req.messages),
        maxTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        tools: req.tools,
        signal: controller.signal,
        fetchImpl: this.fetchImpl,
      });
      return { text: r.text, content: r.content, stopReason: r.stopReason, usage: r.usage };
    } finally {
      sub?.dispose();
    }
  }

  async stream(req: ModelRequest, onDelta: (d: StreamDelta) => void): Promise<ModelResponse> {
    const apiKey = await this.resolveKey();
    if (!apiKey) throw new Error(ANTHROPIC_UNAVAILABLE);
    // `streamAnthropic` turns an abort into a finalized partial (`stopReason:"cancelled"`), so the cancel contract is
    // identical across both backends without a throw here.
    const { controller, sub } = this.abortFor(req);
    try {
      const r = await streamAnthropic(
        {
          apiKey,
          model: this.model,
          system: req.system,
          messages: toAnthropicMessages(req.messages),
          maxTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          tools: req.tools,
          signal: controller.signal,
          fetchImpl: this.fetchImpl,
          stream: true,
        },
        (t) => onDelta({ type: "text", text: t }),
        // Forward the adaptive-thinking STATE as tagged deltas — the host times the "thinking… → Thought for Ns" indicator.
        (state) => onDelta({ type: state === "start" ? "thinking_start" : "thinking_stop" }),
        // Forward a fully-assembled tool call as a tool_use delta (Todo C).
        (tu) => onDelta({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input }),
      );
      return { text: r.text, content: r.content, stopReason: r.stopReason, usage: r.usage };
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
