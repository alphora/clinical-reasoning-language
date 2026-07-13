// #210 editor agent Todo B / #236 Todo B.1 — the chat pane HOST ("CRL Assist"). A `WebviewViewProvider` (re-homed from the
// Todo-B `WebviewPanel` so the user can dock it in the Secondary Side Bar) driving a conversation on the Todo-A model
// provider WITH streaming. NO agent tools / app-state perception (that's Todo C) — plain chat. The conversation is
// HOST-AUTHORITATIVE: the host holds the model `messages` (only successful — or cancelled-with-partial — user/assistant
// PAIRS) plus a separate UI `transcript` (which also carries inline errors + status the model never sees) plus the in-flight
// `partial` (+ the adaptive-thinking timer, Todo B.1); the webview is a pure view that rehydrates from a `render` post. The
// view is revealed by `crl.agent.chat` (→ `crl.agentChat.focus`) and is NOT gated behind `crl.active` (chat has no
// app-state dependency). CRITICAL: a view dispose (a full close) must NOT cancel the in-flight stream — the host keeps
// accumulating and re-renders when `resolveWebviewView` fires again.
import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import {
  AGENT_MAX_TOKENS,
  MAX_TOOL_ROUNDS,
  resolveProvider,
  type ModelMessage,
  type StreamDelta,
} from "./agentModelProvider";
import { runAgentTurn, type ToolRegistry } from "./agentToolLoop";
import { cockpitAgentBridge } from "./cockpitAgentBridge";
import { appStateBlock, buildSystemPrompt, OPEN_FLAG_DRAWER, openFlagDrawerTool, SUBMIT_FLAG, submitFlagTool } from "./editorAgentPrompt";
import type { ActiveElicitation } from "./agentDrivableUi";
import { anthropicErrorLabel } from "./anthropicClient";
import { CHAT_BODY, CHAT_STYLE, CHAT_WEBVIEW_SCRIPT, renderChatThread, type ChatEntry } from "./chatPaneHtml";

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const PLACEHOLDER = "Ask the CRL agent anything about Clinical Reasoning Language.";

/** Register the `crl.agentChat` webview-view PROVIDER + the `crl.agent.chat` reveal command. Wired in extension.ts next to
 *  the other agent commands. `retainContextWhenHidden` keeps the webview alive across hide/show (deltas still post to the
 *  hidden view); a full close/reopen re-resolves + rehydrates from the host-authoritative state. */
export function registerAgentChat(context: vscode.ExtensionContext): void {
  const chat = new AgentChat(context);
  // An always-visible reopener: once "CRL Assist" is docked in a side bar, its icon lives in THAT bar's strip and vanishes
  // when the bar is hidden — so a status-bar item (the `$(coral)` brand glyph from the contributed icon font) gives a
  // one-click way to reveal it from anywhere. Also bound to Ctrl+Alt+A (see package.json keybindings).
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.name = "CRL Assist";
  statusItem.text = "$(coral) CRL Assist";
  statusItem.tooltip = "Open CRL Assist  (Ctrl+Alt+A)";
  statusItem.command = "crl.agent.chat";
  statusItem.show();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("crl.agentChat", chat, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    // Reveal/focus the view (VS Code auto-registers `<viewId>.focus` for a contributed view).
    vscode.commands.registerCommand("crl.agent.chat", () => vscode.commands.executeCommand("crl.agentChat.focus")),
    // #210 Todo C — the selected-item chip: refresh it whenever the cockpit's flag anchor / policy / tree-pane changes.
    cockpitAgentBridge.onDidChangeAppState(() => chat.refreshChip()),
    statusItem,
    { dispose: () => chat.dispose() },
  );
}

/** Owns the chat view + the host-authoritative conversation state. One view (the latest resolved ref), one in-flight stream
 *  at a time. */
class AgentChat implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  /** The model context — only successful (or cancelled-with-partial) user/assistant PAIRS. Errors/unavailability never enter. */
  private messages: ModelMessage[] = [];
  /** The UI transcript — user/assistant turns PLUS inline error/status the model never sees. Rendered to the webview. */
  private transcript: ChatEntry[] = [];
  /** The in-flight assistant reply's accumulated text (rendered as the OPEN turn while `streaming`). */
  private partial = "";
  private streaming = false;
  /** True while `resolveProvider` is in flight (before streaming) — drives a cancellable "connecting…" busy state so the
   *  UI isn't idle (Send disabled + Stop shown) during a slow resolution / first Copilot consent (gpt55 [important]). */
  private resolving = false;
  /** Adaptive-thinking indicator state (Todo B.1). `thinking` = a thinking block is currently open (show the live ticker);
   *  `thinkingSince` = its wall-clock start (drives the webview timer + the elapsed compute); `thoughtMs` = the finalized
   *  duration, carried onto the assistant `ChatEntry` as "Thought for Ns". All reset per turn in `endStream`. */
  private thinking = false;
  private thinkingSince: number | undefined;
  private thoughtMs: number | undefined;
  private cts: vscode.CancellationTokenSource | undefined;
  /** A Stop pressed DURING provider resolution (which takes no token) — checked immediately after `resolveProvider`. */
  private cancelledDuringResolve = false;
  /** Bumped per send AND on Clear — a turn whose `gen` no longer matches was superseded by a Clear (or reset) mid-stream,
   *  so its completion must NOT re-push into a cleared transcript/`messages` (gpt55 [critical]). */
  private gen = 0;
  /** The provider used by the last committed turn — a provider switch mid-conversation would replay THAT provider's tool
   *  ids into the new backend (which rejects them), so on a change we clear the model context (A11). */
  private lastProviderId: "vscode-lm" | "anthropic" | undefined;
  /** #210 (disc 239) — the in-flight BLOCKING elicitation (a driven app UI, e.g. the flag drawer). While set, the chat input
   *  shows a static purpose banner instead of the textarea. `turnGen` guards ownership so a stale turn can't clear a newer one. */
  private eliciting: ActiveElicitation | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  /** Drive an `AgentDrivableUI` request: show the static purpose banner (Send already disabled by the `busy` state), await
   *  the UI's resolution, and clear the banner — but ONLY if this turn still owns it (a Clear + a new turn must not wipe the
   *  new banner). Any tool that elicits via an app UI wraps its wait in this. */
  private async withElicitation<T>(turnGen: number, purpose: string, fn: () => Promise<T>): Promise<T> {
    this.eliciting = { turnGen, purpose };
    this.render();
    try {
      return await fn();
    } finally {
      if (this.eliciting?.turnGen === turnGen) {
        this.eliciting = undefined;
        this.render();
      }
    }
  }

  /** Re-render on a cockpit app-state change — updates the selected-item chip (does nothing while no view is resolved). */
  refreshChip(): void {
    this.render();
  }

  /** The chip = what the agent perceives right now: the flag anchor (concise `label` + a bulleted-path `title` for the hover),
   *  or a reason it can't perceive one. `undefined` hides the chip (no MV cockpit). */
  private chipInfo(): { label: string; title: string } | undefined {
    const s = cockpitAgentBridge.getAppState();
    if (!s) return undefined;
    if (!s.treePaneOpen) return { label: "no tree pane", title: "no tree pane" };
    if (!s.anchorLabel) return { label: "no node selected", title: "no node selected" };
    return { label: s.anchorLabel, title: s.anchorTitle ?? s.anchorLabel };
  }

  /** True when the committed model context carries tool_use/tool_result blocks — used to decide whether a provider switch
   *  must clear it (a plain-text-only history is provider-portable; tool ids are not). Checks block TYPES, not mere
   *  array-ness: the driver always stores assistant turns as a `ContentBlock[]`, so an array check alone would be
   *  unconditionally true and wipe even a pure-text conversation on every switch (A11). */
  private messagesHaveToolBlocks(): boolean {
    return this.messages.some(
      (m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_use" || b.type === "tool_result"),
    );
  }

  /** Resolve (or RE-resolve, on a close/reopen) the view: wire the webview, store the LATEST ref, and rehydrate the full
   *  transcript (+ any in-flight partial/thinking) from host state. A view dispose does NOT tear down the stream. */
  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = shellHtml();
    view.webview.onDidReceiveMessage((m) => this.onMessage(m));
    view.onDidDispose(() => {
      // A full close (retain=true means hide/show does NOT dispose) — just drop the ref so posts become no-ops. The host
      // keeps accumulating `partial`/`messages`/thinking and re-renders when `resolveWebviewView` fires again. Do NOT cancel
      // the in-flight stream here.
      if (this.view === view) this.view = undefined;
    });
    this.render(); // initial rehydrate (also re-sent on the webview's `chatReady`)
  }

  dispose(): void {
    // Extension teardown — here (unlike a view dispose) tearing the stream down is correct.
    this.cts?.cancel();
    this.cts?.dispose();
    this.cts = undefined;
  }

  /** Post the whole transcript (+ the in-flight open turn when streaming) to the webview. `statusOverride` shows a one-off
   *  status line (e.g. the concurrency rejection) without mutating the transcript. */
  private render(statusOverride?: string): void {
    if (!this.view) return;
    const entries: ChatEntry[] = [...this.transcript];
    if (this.streaming) entries.push({ kind: "assistant", text: this.partial, open: true, thoughtMs: this.thoughtMs });
    const html = renderChatThread(entries, { placeholder: PLACEHOLDER });
    // "working…" covers the vscode-lm latency + the post-thinking pre-first-text pause: shown from send until the first text
    // delta (the webview clears it on that delta; the host also clears it on finalize by re-rendering with streaming=false).
    // While a thinking block is open the webview shows its own live "thinking… Ns" ticker instead (driven by `thinking`).
    const status = statusOverride ?? (this.streaming && this.partial === "" && !this.thinking ? "working…" : "");
    void this.view.webview.postMessage({
      type: "render",
      html,
      // `busy` (streaming OR resolving) drives Send-disabled + Stop-shown, so Stop is available during resolution too.
      busy: this.streaming || this.resolving,
      status,
      thinking: this.thinking,
      thinkingSince: this.thinkingSince,
      // #210 Todo C — the selected-item chip (the flag anchor the agent perceives); undefined hides it (no MV cockpit).
      // `chip` = the concise label; `chipTitle` = the bulleted node-path hover.
      chip: this.chipInfo()?.label,
      chipTitle: this.chipInfo()?.title,
      // #210 (disc 239) — the static elicitation banner (a purpose line) replaces the input while an app UI is the open
      // request; undefined restores the textarea.
      eliciting: this.eliciting?.purpose,
    });
  }

  private onMessage(m: unknown): void {
    const msg = m as { type?: string; text?: string };
    if (msg.type === "chatReady") {
      this.render();
    } else if (msg.type === "chatSend") {
      void this.handleSend(typeof msg.text === "string" ? msg.text : "");
    } else if (msg.type === "chatStop") {
      // Cancel an active stream, OR flag a Stop pressed during resolution (no token to cancel yet).
      this.cancelledDuringResolve = true;
      this.cts?.cancel();
    } else if (msg.type === "chatClear") {
      // Supersede any in-flight turn: bump `gen` (its completion will no-op), cancel + tear down the stream, THEN clear.
      this.gen++;
      this.cts?.cancel();
      this.endStream();
      this.messages = [];
      this.transcript = [];
      this.render();
    }
  }

  private async handleSend(rawText: string): Promise<void> {
    const text = rawText.trim();
    if (!text) return;
    // Concurrency guard — the webview is untrusted, so reject a send during an active stream/resolution HOST-side (the UI
    // also disables Send). A one-off status line, not a transcript mutation.
    if (this.streaming || this.cts) {
      this.render("still responding — press Stop to cancel first");
      return;
    }
    const myGen = ++this.gen; // this turn's id — a Clear (or reset) mid-stream bumps `gen` and supersedes the completion below

    // Resolve the provider FIRST — an unavailable/failed turn must NOT pollute `messages` (no dangling user turn). Only on a
    // successful stream do the user+assistant pair get committed to model context (atomically, below).
    this.cts = new vscode.CancellationTokenSource();
    this.cancelledDuringResolve = false;
    const token = this.cts.token;

    this.resolving = true;
    this.render("connecting…"); // busy state — feedback + Stop available while resolveProvider (consent) is in flight

    let resolved: Awaited<ReturnType<typeof resolveProvider>>;
    try {
      resolved = await resolveProvider({ secrets: this.context.secrets });
    } catch (e) {
      this.endStream();
      // Superseded by a Clear, or cancelled during resolve → don't push the error into a cleared/abandoned transcript.
      if (myGen !== this.gen || token.isCancellationRequested) {
        this.render();
        return;
      }
      this.transcript.push({ kind: "error", text: `provider error — ${messageOf(e)}` });
      this.render();
      return;
    }
    this.resolving = false;

    // A Stop during resolution/consent (which takes no token) → drop silently; the user backed out before we started.
    if (this.cancelledDuringResolve || token.isCancellationRequested) {
      this.endStream();
      this.render();
      return;
    }

    if (resolved.unavailableReason) {
      this.endStream();
      this.transcript.push({ kind: "error", text: resolved.unavailableReason }); // inline, NOT in `messages`
      this.render();
      return;
    }

    const provider = resolved.provider;

    // A11 — a provider switch mid-conversation would replay THIS-provider tool ids into the OTHER backend (which rejects
    // them). If the committed context carries tool blocks, clear it (keep the UI transcript) + note it. A plain-text-only
    // history is provider-portable, so no clear is needed then.
    if (this.lastProviderId && this.lastProviderId !== provider.id && this.messagesHaveToolBlocks()) {
      this.messages = [];
      this.transcript.push({ kind: "status", text: `switched to the ${provider.id} provider — starting a fresh context` });
    }
    this.lastProviderId = provider.id;

    // Show the user turn immediately (UI); the model-context commit is DEFERRED until the driver returns a committable,
    // BALANCED turn so a mid-loop failure/cancel/cap leaves `messages` clean (the driver stages internally — A2).
    this.transcript.push({ kind: "user", text });
    this.partial = "";
    this.streaming = true;
    this.render(); // "working…" + the empty open assistant turn

    // The add-flag skill: the live app-state → system prompt + the flag tool; a per-turn registry (ONE successful action
    // per turn — A15). The registry NEVER writes CRL: it opens the cockpit drawer prefilled via the bridge.
    const system = buildSystemPrompt(cockpitAgentBridge.getAppState());
    const kinds = cockpitAgentBridge.getValidationKinds();
    // open (the default) is listed FIRST — some models weight earlier tools, and we don't want a nudge toward the durable
    // submit path (reviewers [nit], reinforcing the prompt's explicit-only submit).
    const tools = [openFlagDrawerTool(kinds), submitFlagTool(kinds)];
    let acted = false;
    // A recoverable error result carries the FRESH app-state (targets + their current ids) so the model can retry in the
    // same loop after a selection change — C has no separate read tool (A14).
    const recoverable = (reason: string) => ({ content: `${reason}\n${appStateBlock(cockpitAgentBridge.getAppState())}`, isError: true });
    const registry: ToolRegistry = {
      run: async (name, input) => {
        if (name !== OPEN_FLAG_DRAWER && name !== SUBMIT_FLAG) return { content: `unknown tool "${name}"`, isError: true };
        const a = (input ?? {}) as { target_id?: unknown; validation_kind?: unknown; summary?: unknown; description?: unknown };
        if (typeof a.target_id !== "string" || !a.target_id) return recoverable("target_id is required — use one from the flag-targets list.");
        // One flag action per turn — a second call (or a duplicate in one message) is refused (A15).
        if (acted) return { content: "a flag was already filed/opened this turn — finish that one first", isError: true };
        const args = {
          targetId: a.target_id,
          validationKind: typeof a.validation_kind === "string" ? a.validation_kind : undefined,
          summary: typeof a.summary === "string" ? a.summary : undefined,
          description: typeof a.description === "string" ? a.description : undefined,
        };
        if (name === SUBMIT_FLAG) {
          const res = await cockpitAgentBridge.submitFlag(args);
          if (!res.ok) {
            // If a GitHub issue was ALREADY created but the flag write then failed, do NOT let the model retry — a retry
            // would POST a duplicate issue. Arm `acted` + return a non-recoverable error (Claude [important]).
            if (res.issued) {
              acted = true;
              return { content: `${res.reason} — do NOT retry (the issue already exists; the validator must add the flag manually)`, isError: true };
            }
            return recoverable(res.reason);
          }
          acted = true;
          return { content: res.message }; // the human outcome (issue #N created / no issue: reason) — the agent relays it
        }
        // #210 (disc 239) — a BLOCKING elicitation: begin (sync guard). On an error, recoverable (no banner). On success,
        // arm `acted` (shown-once counts, even if the human later cancels) + await the drawer while the static banner shows;
        // map the outcome to the tool result the agent relays.
        const begin = cockpitAgentBridge.beginFlagDrawer(args, token);
        if ("error" in begin) return recoverable(begin.error);
        acted = true;
        const outcome = await this.withElicitation(myGen, begin.purpose, () => begin.wait);
        if (outcome.status === "completed") return { content: outcome.result.message };
        if (outcome.status === "error") return recoverable(outcome.reason);
        return { content: "The validator didn't complete the flag — the drawer is still open in the cockpit (or they cancelled)." };
      },
    };

    let result: Awaited<ReturnType<typeof runAgentTurn>>;
    try {
      result = await runAgentTurn({
        provider,
        registry,
        baseMessages: this.messages,
        userMessage: { role: "user", content: text },
        system,
        tools,
        maxTokens: AGENT_MAX_TOKENS,
        maxRounds: MAX_TOOL_ROUNDS,
        token,
        isSuperseded: () => myGen !== this.gen,
        onDelta: (d) => this.onDelta(myGen, d),
      });
    } catch (e) {
      // A genuine failure. Keep the partial the user already watched stream in (as a stopped turn) + surface the error
      // inline. `messages` stays untouched (the driver staged internally; nothing was committed).
      const partial = this.partial;
      const thoughtMs = this.thoughtMs ?? (this.thinkingSince !== undefined ? Date.now() - this.thinkingSince : undefined);
      // Ownership guard BEFORE endStream: a Clear superseded this turn (and already tore it down), so this stale continuation
      // must NOT run endStream — that would clobber the NEW turn's `cts` (killing its Stop) + `eliciting` banner (both reviewers).
      if (myGen !== this.gen) return;
      this.endStream();
      if (partial) this.transcript.push({ kind: "assistant", text: partial, stopped: true, thoughtMs });
      const label = provider.id === "anthropic" ? anthropicErrorLabel(e) : messageOf(e);
      this.transcript.push({ kind: "error", text: `${provider.id}: ${label}` });
      this.render();
      return;
    }

    // Capture the thought duration + the final streamed partial before endStream resets them.
    const thoughtMs = this.thoughtMs ?? (this.thinkingSince !== undefined ? Date.now() - this.thinkingSince : undefined);
    const finalPartial = this.partial;
    // Ownership guard BEFORE endStream: a Clear superseded this turn (and already tore it down) — a stale continuation running
    // endStream would clobber the NEW turn's `cts` (killing its Stop) + `eliciting` banner (both reviewers).
    if (myGen !== this.gen) return;
    this.endStream();

    if (result.stopReason === "cancelled") {
      // Stop → finalize the last streamed text as a stopped turn (any earlier rounds were already pushed on their tool_use).
      this.transcript.push({ kind: "assistant", text: finalPartial || result.text || "(stopped)", stopped: true, thoughtMs });
    } else if (result.commit) {
      this.transcript.push({ kind: "assistant", text: result.text || "(done)", thoughtMs });
    } else if (result.stopReason === "tool_round_cap") {
      this.transcript.push({ kind: "assistant", text: "(stopped — too many tool steps in one turn)", thoughtMs });
    } else {
      // An empty/uncommittable turn (e.g. max_tokens spent in the thinking block → no text). Shown but NOT committed.
      const shown = result.text || (result.stopReason === "max_tokens" ? "(no text — the model stopped at max_tokens)" : "(no response)");
      this.transcript.push({ kind: "assistant", text: shown, thoughtMs });
    }
    // Commit the driver's BALANCED staged turns to model context (only when committable — never a dangling tool_use — A2/A4).
    if (result.commit) this.messages.push(...result.messages);
    this.render();
  }

  /** The driver's per-delta callback (gen-guarded). Text streams into the open turn; a tool_use FINALIZES the current
   *  round's text as a transcript turn + a "opening the flag drawer…" status, then resets `partial` so the next round's
   *  text starts a fresh open turn (Todo C multi-round rendering). */
  private onDelta(myGen: number, d: StreamDelta): void {
    if (myGen !== this.gen) return; // superseded by a Clear — a queued delta must not mutate the cleared state
    if (d.type === "text") {
      this.partial += d.text;
      void this.view?.webview.postMessage({ type: "delta", text: d.text });
    } else if (d.type === "thinking_start") {
      this.thinking = true;
      this.thinkingSince = Date.now();
      this.render();
    } else if (d.type === "thinking_stop") {
      if (this.thinkingSince !== undefined) this.thoughtMs = Date.now() - this.thinkingSince;
      this.thinking = false;
      this.render();
    } else if (d.type === "tool_use") {
      if (this.partial) this.transcript.push({ kind: "assistant", text: this.partial, thoughtMs: this.thoughtMs });
      // Neutral phrasing keyed on the tool: the model REQUESTED the action (true regardless of whether it then executes or
      // is cancelled/fails — the drawer's appearance + the follow-up reply convey the outcome).
      this.transcript.push({ kind: "status", text: d.name === SUBMIT_FLAG ? "⚑ filing a flag…" : "⚑ opening the flag drawer…" });
      this.partial = "";
      this.thinking = false;
      this.thinkingSince = undefined;
      this.thoughtMs = undefined;
      this.render();
    }
  }

  /** Tear down the in-flight stream state (CTS + flags + partial + the thinking timer) — shared by every terminal path. */
  private endStream(): void {
    this.streaming = false;
    this.resolving = false;
    this.eliciting = undefined; // #210 (disc 239): any in-flight elicitation banner clears with the turn (Clear/error teardown)
    this.partial = "";
    this.thinking = false;
    this.thinkingSince = undefined;
    this.thoughtMs = undefined;
    this.cts?.dispose();
    this.cts = undefined;
  }
}

/** The nonce/CSP shell — mirrors the cockpit's `shellHtml`: a per-load script nonce + style nonce, a strict CSP, and the
 *  static `CHAT_BODY` + `CHAT_STYLE` + `CHAT_WEBVIEW_SCRIPT`. */
function shellHtml(): string {
  const nonce = randomBytes(16).toString("base64");
  const styleNonce = randomBytes(16).toString("base64");
  const csp = `default-src 'none'; style-src 'nonce-${styleNonce}'; script-src 'nonce-${nonce}';`;
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<style nonce="${styleNonce}">${CHAT_STYLE}</style></head><body>` +
    CHAT_BODY +
    `<script nonce="${nonce}">` +
    CHAT_WEBVIEW_SCRIPT +
    `</script></body></html>`
  );
}
