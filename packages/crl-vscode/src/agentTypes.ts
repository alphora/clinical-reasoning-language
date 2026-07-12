// #210 editor agent Todo C — the PURE (vscode-free) model-provider type surface + constants. Extracted from
// agentModelProvider.ts so the streaming client (anthropicClient.ts) and the tool-loop driver (agentToolLoop.ts) import the
// shared shapes WITHOUT pulling in `vscode`, and so the `.test.mjs` harness can load them directly. agentModelProvider.ts
// re-exports everything here and adds the two vscode-backed provider IMPLEMENTATIONS.

/** A structural cancellation token — the shape of `vscode.CancellationToken`, redeclared here so the pure driver + the
 *  provider request path can accept one without importing `vscode`. A real `vscode.CancellationToken` satisfies it
 *  structurally (it has `isCancellationRequested` + `onCancellationRequested → Disposable`); tests pass a hand-rolled fake. */
export interface CancelToken {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): { dispose(): void };
}

/** One heterogeneous content block. A plain-string `ModelMessage.content` stays the common (text-only) case; blocks appear
 *  only on tool rounds. Provider-neutral: the Anthropic client maps these to/from wire blocks; the vscode-lm provider maps
 *  them to/from `LanguageModel*Part`. `tool_result.content` is the flattened text the tool returned (`isError` marks a
 *  failed/rejected call the model should recover from). */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export interface ModelMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

/** A tool the model may call. `inputSchema` is a JSON Schema object (Anthropic `input_schema` / vscode-lm `inputSchema`). */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: object;
}

export interface ModelRequest {
  system?: string;
  messages: ModelMessage[];
  /** Output cap — honored by the `anthropic` backend; the `vscode-lm` backend uses the Copilot model's own default. */
  maxTokens?: number;
  /** Tools the model may call this request. Empty/undefined = a plain completion (no tool wire format sent). */
  tools?: ToolSpec[];
  token?: CancelToken;
}

export interface ModelResponse {
  text: string;
  /** The assistant turn's ordered content blocks (text + tool_use), assembled in WIRE order — the host/driver commits from
   *  THIS, never from `text` or callback side-effects. Undefined on a plain-text turn (callers fall back to `{text}`). */
  content?: ContentBlock[];
  stopReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

/** A streamed increment (tagged union). `tool_use` is emitted ONCE per call when its input is fully assembled (Anthropic:
 *  at the block's `content_block_stop`; vscode-lm: on each `LanguageModelToolCallPart`). The `thinking_*` pair brackets an
 *  Anthropic adaptive-thinking block (state only). */
export type StreamDelta =
  | { type: "text"; text: string }
  | { type: "thinking_start" }
  | { type: "thinking_stop" }
  | { type: "tool_use"; id: string; name: string; input: unknown };

export interface ModelProvider {
  readonly id: "vscode-lm" | "anthropic";
  isAvailable(): Promise<boolean>;
  complete(req: ModelRequest): Promise<ModelResponse>;
  /** Stream the reply, emitting each delta via `onDelta`, and resolve with the full `ModelResponse` (incl. `content` for
   *  replay). A CANCEL (`req.token`) FINALIZES the accumulated partial as `{ …, stopReason: "cancelled" }` — it does NOT
   *  throw; only a genuine failure throws. A non-empty `req.tools` sends the backend's tool wire format. */
  stream(req: ModelRequest, onDelta: (d: StreamDelta) => void): Promise<ModelResponse>;
}

/** The two provider-unavailable messages — plain text (shown in a notification, which does NOT render Markdown). */
export const VSCODE_LM_UNAVAILABLE =
  "No language model available — install the GitHub Copilot Chat extension, or set crl.agent.provider to 'anthropic'.";
export const ANTHROPIC_UNAVAILABLE = "No Anthropic API key — run 'CRL: Set Anthropic API Key' or set ANTHROPIC_API_KEY.";

/** Default per-request output cap for the Anthropic backend's connectivity proof (tiny). */
export const DEFAULT_MAX_TOKENS = 1024;
/** The chat/agent loop's output cap — tool rounds need headroom beyond the connectivity proof's 1024 (Todo C, A17). */
export const AGENT_MAX_TOKENS = 4096;
/** The tool-round cap: after this many assistant→tool→assistant cycles the driver discards the staged loop (Todo C, A4). */
export const MAX_TOOL_ROUNDS = 4;

/** SecretStorage key for the Anthropic API key (written by the `crl.agent.setAnthropicKey` command). */
export const ANTHROPIC_SECRET_KEY = "crl.agent.anthropicApiKey";
