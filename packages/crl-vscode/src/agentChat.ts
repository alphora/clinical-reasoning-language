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
  resolveProvider,
  type ModelMessage,
  type ModelProvider,
} from "./agentModelProvider";
import { anthropicErrorLabel } from "./anthropicClient";
import { CHAT_BODY, CHAT_STYLE, CHAT_WEBVIEW_SCRIPT, renderChatThread, type ChatEntry } from "./chatPaneHtml";

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The Todo-B system prompt — generic (no tools, no app perception yet). Todo C replaces/extends this with the editor-kit. */
const SYSTEM_PROMPT =
  "You are the CRL editor assistant, helping the user reason about Clinical Reasoning Language (CRL) documents and their " +
  "clinical-decision content. Answer concisely and directly.";

const PLACEHOLDER = "Ask the CRL agent anything about Clinical Reasoning Language.";

/** Register the `crl.agentChat` webview-view PROVIDER + the `crl.agent.chat` reveal command. Wired in extension.ts next to
 *  the other agent commands. `retainContextWhenHidden` keeps the webview alive across hide/show (deltas still post to the
 *  hidden view); a full close/reopen re-resolves + rehydrates from the host-authoritative state. */
export function registerAgentChat(context: vscode.ExtensionContext): void {
  const chat = new AgentChat(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("crl.agentChat", chat, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    // Reveal/focus the view (VS Code auto-registers `<viewId>.focus` for a contributed view).
    vscode.commands.registerCommand("crl.agent.chat", () => vscode.commands.executeCommand("crl.agentChat.focus")),
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

  constructor(private readonly context: vscode.ExtensionContext) {}

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
    // Show the user turn immediately (UI); the model-context commit is DEFERRED until the stream succeeds (or is cancelled
    // with partial text) so a mid-stream failure leaves `messages` clean.
    this.transcript.push({ kind: "user", text });
    const userMsg: ModelMessage = { role: "user", content: text };
    this.partial = "";
    this.streaming = true;
    this.render(); // "working…" + the empty open assistant turn

    let res: Awaited<ReturnType<ModelProvider["stream"]>>;
    try {
      res = await provider.stream(
        { system: SYSTEM_PROMPT, messages: [...this.messages, userMsg], token },
        (d) => {
          // A Clear (or reset) mid-stream bumps `gen` — a queued delta arriving after that must NOT mutate/render the
          // cleared state (else e.g. a stale "thinking…" ticker gets restarted and the gen-guarded completion never clears it).
          if (myGen !== this.gen) return;
          if (d.type === "text") {
            this.partial += d.text;
            void this.view?.webview.postMessage({ type: "delta", text: d.text });
          } else if (d.type === "thinking_start") {
            // Open the indicator: the webview shows a live "thinking… Ns" ticker (partial is still "" here, so a full
            // re-render doesn't wipe any streamed text).
            this.thinking = true;
            this.thinkingSince = Date.now();
            this.render();
          } else if (d.type === "thinking_stop") {
            // Freeze the duration + collapse to "Thought for Ns": a full re-render now carries `thoughtMs` on the open turn.
            if (this.thinkingSince !== undefined) this.thoughtMs = Date.now() - this.thinkingSince;
            this.thinking = false;
            this.render();
          }
        },
      );
    } catch (e) {
      // A genuine failure. Keep the partial the user already watched stream in (as a stopped turn) + surface the error
      // inline (reusing Todo A's Anthropic label). `messages` stays untouched (the pair was never committed).
      const partial = this.partial;
      const thoughtMs = this.thoughtMs ?? (this.thinkingSince !== undefined ? Date.now() - this.thinkingSince : undefined);
      this.endStream();
      if (myGen !== this.gen) return; // a Clear superseded this turn — don't push into a cleared transcript
      if (partial) this.transcript.push({ kind: "assistant", text: partial, stopped: true, thoughtMs });
      const label = provider.id === "anthropic" ? anthropicErrorLabel(e) : messageOf(e);
      this.transcript.push({ kind: "error", text: `${provider.id}: ${label}` });
      this.render();
      return;
    }

    // Capture the thought duration before endStream resets it — incl. a cancel that landed WHILE thinking (thinking_stop
    // never fired), so a stopped-mid-thought turn still shows "Thought for Ns".
    const thoughtMs = this.thoughtMs ?? (this.thinkingSince !== undefined ? Date.now() - this.thinkingSince : undefined);
    this.endStream();
    if (myGen !== this.gen) return; // a Clear superseded this turn mid-stream — its result must not repopulate the cleared chat
    const finalText = res.text;
    if (res.stopReason === "cancelled") {
      // Stop → the stream RETURNS the partial (not an error). Finalize it as a stopped assistant turn (keep the partial
      // text). Commit the pair to model context only if it produced text — an empty cancelled turn commits nothing (so the
      // conversation stays alternating; no dangling user turn).
      this.transcript.push({ kind: "assistant", text: finalText || "(stopped)", stopped: true, thoughtMs });
      if (finalText) {
        this.messages.push(userMsg, { role: "assistant", content: finalText });
      }
    } else {
      // Commit ONLY a non-empty pair. An empty reply (e.g. max_tokens spent inside the thinking block → no text_delta) must
      // NOT enter `messages` — Anthropic rejects an empty-content assistant turn, so it would 400 EVERY later send until Clear.
      const shown = finalText || (res.stopReason === "max_tokens" ? "(no text — the model stopped at max_tokens)" : "(no response)");
      this.transcript.push({ kind: "assistant", text: shown, thoughtMs });
      if (finalText) this.messages.push(userMsg, { role: "assistant", content: finalText });
    }
    this.render();
  }

  /** Tear down the in-flight stream state (CTS + flags + partial + the thinking timer) — shared by every terminal path. */
  private endStream(): void {
    this.streaming = false;
    this.resolving = false;
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
