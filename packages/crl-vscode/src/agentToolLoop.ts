// #210 editor agent Todo C — the PURE (vscode-free) agentic tool loop. Extracted from the chat host so it is node-testable
// with a fake provider + a fake registry (the host, agentChat.ts, becomes a thin adapter). The loop is HOST-AUTHORITATIVE
// with a STAGING buffer (A2): every request is `[...baseMessages, ...staged]`; `staged` is DRIVER-LOCAL and returned only
// on success — so a failure/cancel/cap never leaks intermediate turns into the host's `messages` (nothing to discard).
//
// Invariants:
//  - The returned `messages` are ALWAYS balanced (they end in an assistant turn) OR `commit` is false with `messages: []`.
//    Never a dangling `tool_use` (would 400 the next request) and never a trailing user tool_result with no reply.
//  - Exactly one `tool_result` per `tool_use` the model emits, even when a tool throws (→ an `isError` result) — A8.
//  - Cancel/supersede is checked before each model call AND immediately before executing a tool (tools have side effects) — B3.
//  - On the tool-round cap the WHOLE staged loop is discarded (commit:false) — A4 (no dangling tool_use).
import type { CancelToken, ContentBlock, ModelMessage, ModelProvider, StreamDelta, ToolSpec } from "./agentTypes";

/** The tool executor the host supplies. `run` NEVER throws for a known-but-failing tool (it returns `isError`); a thrown
 *  error is still caught by the loop and turned into an `isError` result, so the 1:1 result invariant always holds. */
export interface ToolRegistry {
  run(name: string, input: unknown): Promise<{ content: string; isError?: boolean }>;
}

export interface RunAgentTurnOpts {
  provider: ModelProvider;
  registry: ToolRegistry;
  /** The prior committed model context (the host's `messages`) — NOT mutated. */
  baseMessages: ModelMessage[];
  /** The new user turn that opens this turn (its text, or a block array). Staged first. */
  userMessage: ModelMessage;
  system?: string;
  tools: ToolSpec[];
  maxTokens: number;
  maxRounds: number;
  /** In-flight cancellation transport, forwarded into each `provider.stream` request (aborts a live stream) — B4. */
  token: CancelToken;
  /** A Clear/reset gen-guard: true once this turn is superseded. Checked between rounds + before tool execution — B3. */
  isSuperseded: () => boolean;
  onDelta: (d: StreamDelta) => void;
}

export interface AgentTurnResult {
  /** The balanced turns to append to the host's `messages` — ONLY when `commit`. Empty when `!commit`. */
  messages: ModelMessage[];
  /** The final visible assistant text (for the transcript's finalized turn). */
  text: string;
  /** `completed` | `cancelled` | `tool_round_cap` | the provider stop reason (`max_tokens`, `end_turn`, …). */
  stopReason: string;
  /** Whether `messages` should merge into the host's model context. False ⇒ discard (unbalanced/empty/cancelled/cap). */
  commit: boolean;
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Run one user turn to completion, driving the model↔tool loop. Emits text + tool_use deltas via `onDelta` as they stream. */
export async function runAgentTurn(opts: RunAgentTurnOpts): Promise<AgentTurnResult> {
  const { provider, registry, baseMessages, userMessage, system, tools, maxTokens, maxRounds, token, isSuperseded, onDelta } = opts;
  const staged: ModelMessage[] = [userMessage];
  const cancelled = (): boolean => token.isCancellationRequested || isSuperseded();
  const discard = (stopReason: string): AgentTurnResult => ({ messages: [], text: "", stopReason, commit: false });

  let toolRounds = 0;
  let lastText = "";
  for (;;) {
    if (cancelled()) return discard("cancelled");

    const res = await provider.stream(
      { system, messages: [...baseMessages, ...staged], tools: tools.length ? tools : undefined, maxTokens, token },
      onDelta,
    );
    lastText = res.text;

    // CANCEL = FINALIZE. Preserve the B/B.1 "keep the partial text" behavior, but never commit an unbalanced sequence:
    // if there's partial text, append it as a text-only assistant turn (balanced) and commit; otherwise discard the loop
    // (a cancel with no text can't end in an assistant turn) — B4.
    if (res.stopReason === "cancelled") {
      if (res.text) {
        staged.push({ role: "assistant", content: [{ type: "text", text: res.text }] });
        return { messages: staged, text: res.text, stopReason: "cancelled", commit: true };
      }
      return discard("cancelled");
    }

    const toolUses = (res.content ?? []).filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");

    // DONE — the model did not ask for a tool (or emitted none). Finalize the assistant turn from the structured content
    // (never `res.text` alone — A3).
    if (res.stopReason !== "tool_use" || toolUses.length === 0) {
      const assistantContent: ContentBlock[] = res.content ?? (res.text ? [{ type: "text", text: res.text }] : []);
      if (assistantContent.length === 0) {
        // An EMPTY final turn (no text, no tools — e.g. max_tokens spent in a thinking block). If tool rounds already ran
        // (a side effect like opening the drawer happened), close with a minimal assistant ack so that executed exchange
        // stays committable + BALANCED — a bare discard would orphan the tool call from the model context. With no prior
        // tool rounds there's nothing worth committing → discard (matches B's empty-reply invariant).
        if (staged.length > 1) {
          staged.push({ role: "assistant", content: [{ type: "text", text: "(done)" }] });
          return { messages: staged, text: "", stopReason: res.stopReason ?? "completed", commit: true };
        }
        return discard(res.stopReason ?? "completed");
      }
      staged.push({ role: "assistant", content: assistantContent });
      return { messages: staged, text: res.text, stopReason: res.stopReason ?? "completed", commit: true };
    }

    // TOOL ROUND. Cap FIRST: if the model still wants tools after `maxRounds` executed rounds, discard the whole loop so no
    // dangling `tool_use` reaches the next request — A4.
    if (toolRounds >= maxRounds) return { messages: [], text: "", stopReason: "tool_round_cap", commit: false };
    // Gate EXECUTION on cancel/supersede — a Stop/Clear after the model emitted a tool_use but before we run it must NOT
    // fire the (side-effecting) tool for an abandoned turn — B3.
    if (cancelled()) return discard("cancelled");

    // Stage the assistant turn (its text + tool_use blocks, in wire order), then execute each tool → one tool_result each.
    staged.push({ role: "assistant", content: res.content ?? [] });
    const results: ContentBlock[] = [];
    for (const tu of toolUses) {
      // Re-check before EACH side-effecting call — a Stop/Clear between tools must not fire the remaining ones (B3). The
      // already-staged assistant turn is dropped with the loop (discard returns messages:[]), so nothing unbalanced commits.
      if (cancelled()) return discard("cancelled");
      let out: { content: string; isError?: boolean };
      try {
        out = await registry.run(tu.name, tu.input);
      } catch (e) {
        out = { content: `tool "${tu.name}" failed: ${messageOf(e)}`, isError: true };
      }
      results.push({ type: "tool_result", toolUseId: tu.id, content: out.content, isError: out.isError });
    }
    staged.push({ role: "user", content: results });
    toolRounds++;
  }
}
