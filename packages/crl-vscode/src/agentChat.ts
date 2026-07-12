// #210 editor agent Todo B — the chat pane HOST. A single reusable `WebviewPanel` (create-or-reveal) driving a
// conversation on the Todo-A model provider WITH streaming. NO agent tools / app-state perception (that's Todo C) — plain
// chat. The conversation is HOST-AUTHORITATIVE: the host holds the model `messages` (only successful — or cancelled-with-
// partial — user/assistant PAIRS) plus a separate UI `transcript` (which also carries inline errors + status the model
// never sees) plus the in-flight `partial`; the webview is a pure view that rehydrates from a `render` post. The panel is
// opened by `crl.agent.chat` and is NOT gated behind `crl.active` (Todo B has no app-state dependency).
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

/** Register the `crl.agent.chat` command (open/reveal the chat pane). Wired in extension.ts next to the other agent commands. */
export function registerAgentChat(context: vscode.ExtensionContext): void {
  const chat = new AgentChat(context);
  context.subscriptions.push(
    vscode.commands.registerCommand("crl.agent.chat", () => chat.open()),
    { dispose: () => chat.dispose() },
  );
}

/** Owns the single chat panel + the host-authoritative conversation state. One panel, one in-flight stream at a time. */
class AgentChat {
  private panel: vscode.WebviewPanel | undefined;
  /** The model context — only successful (or cancelled-with-partial) user/assistant PAIRS. Errors/unavailability never enter. */
  private messages: ModelMessage[] = [];
  /** The UI transcript — user/assistant turns PLUS inline error/status the model never sees. Rendered to the webview. */
  private transcript: ChatEntry[] = [];
  /** The in-flight assistant reply's accumulated text (rendered as the OPEN turn while `streaming`). */
  private partial = "";
  private streaming = false;
  private cts: vscode.CancellationTokenSource | undefined;
  /** A Stop pressed DURING provider resolution (which takes no token) — checked immediately after `resolveProvider`. */
  private cancelledDuringResolve = false;
  /** Bumped per send AND on Clear — a turn whose `gen` no longer matches was superseded by a Clear (or reset) mid-stream,
   *  so its completion must NOT re-push into a cleared transcript/`messages` (gpt55 [critical]). */
  private gen = 0;

  constructor(private readonly context: vscode.ExtensionContext) {}

  open(): void {
    if (this.panel) {
      this.panel.reveal(this.panel.viewColumn ?? vscode.ViewColumn.Active);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "crl.agentChat",
      "CRL Agent Chat",
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.webview.html = shellHtml();
    panel.webview.onDidReceiveMessage((m) => this.onMessage(m));
    panel.onDidDispose(() => {
      // A dispose mid-stream cancels the in-flight request (the finalize-on-cancel path unwinds it harmlessly).
      this.cts?.cancel();
      this.cts?.dispose();
      this.cts = undefined;
      this.streaming = false;
      this.partial = "";
      this.panel = undefined;
    });
    this.panel = panel;
    this.render(); // initial rehydrate (also re-sent on the webview's `chatReady`)
  }

  dispose(): void {
    this.panel?.dispose();
  }

  /** Post the whole transcript (+ the in-flight open turn when streaming) to the webview. `statusOverride` shows a one-off
   *  status line (e.g. the concurrency rejection) without mutating the transcript. */
  private render(statusOverride?: string): void {
    if (!this.panel) return;
    const entries: ChatEntry[] = [...this.transcript];
    if (this.streaming) entries.push({ kind: "assistant", text: this.partial, open: true });
    const html = renderChatThread(entries, { placeholder: PLACEHOLDER });
    // "working…" covers the sonnet adaptive-thinking pause + vscode-lm latency: shown from send until the first text delta
    // (the webview clears it on that delta; the host also clears it on finalize by re-rendering with streaming=false).
    const status = statusOverride ?? (this.streaming && this.partial === "" ? "working…" : "");
    void this.panel.webview.postMessage({ type: "render", html, streaming: this.streaming, status });
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

    let resolved: Awaited<ReturnType<typeof resolveProvider>>;
    try {
      resolved = await resolveProvider({ secrets: this.context.secrets });
    } catch (e) {
      this.endStream();
      this.transcript.push({ kind: "error", text: `provider error — ${messageOf(e)}` });
      this.render();
      return;
    }

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
          if (d.type === "text") {
            this.partial += d.text;
            void this.panel?.webview.postMessage({ type: "delta", text: d.text });
          }
        },
      );
    } catch (e) {
      // A genuine failure. Keep the partial the user already watched stream in (as a stopped turn) + surface the error
      // inline (reusing Todo A's Anthropic label). `messages` stays untouched (the pair was never committed).
      const partial = this.partial;
      this.endStream();
      if (myGen !== this.gen) return; // a Clear superseded this turn — don't push into a cleared transcript
      if (partial) this.transcript.push({ kind: "assistant", text: partial, stopped: true });
      const label = provider.id === "anthropic" ? anthropicErrorLabel(e) : messageOf(e);
      this.transcript.push({ kind: "error", text: `${provider.id}: ${label}` });
      this.render();
      return;
    }

    this.endStream();
    if (myGen !== this.gen) return; // a Clear superseded this turn mid-stream — its result must not repopulate the cleared chat
    const finalText = res.text;
    if (res.stopReason === "cancelled") {
      // Stop → the stream RETURNS the partial (not an error). Finalize it as a stopped assistant turn (keep the partial
      // text). Commit the pair to model context only if it produced text — an empty cancelled turn commits nothing (so the
      // conversation stays alternating; no dangling user turn).
      this.transcript.push({ kind: "assistant", text: finalText || "(stopped)", stopped: true });
      if (finalText) {
        this.messages.push(userMsg, { role: "assistant", content: finalText });
      }
    } else {
      this.transcript.push({ kind: "assistant", text: finalText });
      this.messages.push(userMsg, { role: "assistant", content: finalText });
    }
    this.render();
  }

  /** Tear down the in-flight stream state (CTS + flags + partial) — shared by every terminal path. */
  private endStream(): void {
    this.streaming = false;
    this.partial = "";
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
