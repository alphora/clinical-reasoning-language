// #210 editor agent Todo B — the chat pane's PURE view layer (no `vscode`, no fetch): the CSS, the thread renderer, the
// static body markup, and the webview SCRIPT string. Mirrors the cockpit's `shellHtml`/`COCKPIT_WEBVIEW_SCRIPT` split — the
// host (agentChat.ts) wraps `CHAT_BODY` + `CHAT_STYLE` + `CHAT_WEBVIEW_SCRIPT` in a nonce/CSP shell and drives it. The
// conversation is HOST-AUTHORITATIVE: the host holds `messages` + the in-flight partial and posts a `render` with the whole
// thread's HTML (rehydrate); the webview is a pure view. Streaming deltas append to the OPEN assistant turn via a text node's
// `appendData` — NEVER innerHTML with model text (immune to a tag/entity split across deltas). All host-rendered text
// (user, assistant, error, status) is escaped here before it reaches the DOM as HTML.

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** One entry in the UI transcript. `assistant.open` = the in-flight turn (gets a `data-chat-text` node for delta append);
 *  `assistant.stopped` = a cancelled reply (keeps its partial text, labelled). `error`/`status` are UI-only (never enter the
 *  model `messages`). */
export type ChatEntry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; open?: boolean; stopped?: boolean }
  | { kind: "error"; text: string }
  | { kind: "status"; text: string };

export interface RenderChatOpts {
  /** Shown (escaped) when the transcript is empty — the pane's resting hint. */
  placeholder?: string;
}

/** Render the whole thread to HTML (pure; every text value escaped). The host posts this as `render.html`; the webview sets
 *  `#chat-thread` innerHTML to it. The OPEN assistant turn carries `data-chat-open` + a `data-chat-text` holder so the delta
 *  handler can append into it. Newlines render via CSS `white-space: pre-wrap` (NOT `\n`→`<br>`). */
export function renderChatThread(messages: ChatEntry[], opts: RenderChatOpts = {}): string {
  if (messages.length === 0) {
    return opts.placeholder ? `<div class="chat-empty">${escapeHtml(opts.placeholder)}</div>` : "";
  }
  const parts: string[] = [];
  for (const m of messages) {
    if (m.kind === "user") {
      parts.push(`<div class="chat-msg chat-user"><span class="chat-role">You</span><div class="chat-body">${escapeHtml(m.text)}</div></div>`);
    } else if (m.kind === "assistant") {
      const openAttr = m.open ? " data-chat-open" : "";
      const stopped = m.stopped ? `<span class="chat-stopped">(stopped)</span>` : "";
      // The `data-chat-text` holder is where streaming deltas append; render it for every assistant turn so a finalized
      // turn keeps the same shape as the open one it replaces.
      parts.push(
        `<div class="chat-msg chat-assistant"${openAttr}><span class="chat-role">Agent</span>` +
          `<div class="chat-body"><span data-chat-text>${escapeHtml(m.text)}</span>${stopped}</div></div>`,
      );
    } else if (m.kind === "error") {
      parts.push(`<div class="chat-msg chat-error">${escapeHtml(m.text)}</div>`);
    } else {
      parts.push(`<div class="chat-msg chat-status">${escapeHtml(m.text)}</div>`);
    }
  }
  return parts.join("");
}

/** The static body markup: the scrollable thread + the input bar (textarea + Send/Stop/Clear + a status line). Static so a
 *  `render` (which only swaps `#chat-thread`) never wipes a half-typed prompt. */
export const CHAT_BODY =
  `<div id="chat-thread" class="chat-thread"></div>` +
  `<div class="chat-inputbar">` +
  `<div class="chat-status" data-chat-status></div>` +
  `<textarea data-chat-input class="chat-input" rows="3" placeholder="Ask the CRL agent… (Enter to send, Shift+Enter for a newline)"></textarea>` +
  `<div class="chat-actions">` +
  `<button type="button" data-chat-send class="chat-send">Send</button>` +
  `<button type="button" data-chat-stop class="chat-stop" hidden>Stop</button>` +
  `<button type="button" data-chat-clear class="chat-clear">Clear</button>` +
  `</div></div>`;

/** The chat pane CSS — VS Code theme tokens throughout, `white-space: pre-wrap` on the bodies so model newlines render. */
export const CHAT_STYLE = `body{font:13px var(--vscode-editor-font-family,monospace);color:var(--vscode-foreground);margin:0;height:100vh;display:flex;flex-direction:column}
.chat-thread{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:10px}
.chat-empty{opacity:.6;font-style:italic;margin:auto;text-align:center}
.chat-msg{max-width:100%;border-radius:4px;padding:6px 8px}
.chat-role{display:block;font-size:.8em;opacity:.6;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}
.chat-body{white-space:pre-wrap;word-break:break-word}
.chat-user{background:var(--vscode-editor-inactiveSelectionBackground,rgba(100,170,255,.12));align-self:flex-end}
.chat-assistant{background:var(--vscode-editorWidget-background,rgba(128,128,128,.08));align-self:flex-start}
.chat-error{color:var(--vscode-editorError-foreground,#f14c4c);border:1px solid var(--vscode-editorError-foreground,#f14c4c);background:var(--vscode-inputValidation-errorBackground,rgba(255,80,80,.08));align-self:stretch;white-space:pre-wrap;word-break:break-word}
.chat-status{opacity:.7;font-style:italic;align-self:center;font-size:.9em}
.chat-stopped{opacity:.6;font-style:italic;margin-left:6px;font-size:.85em}
.chat-inputbar{display:flex;flex-direction:column;gap:6px;padding:8px;border-top:1px solid var(--vscode-panel-border,#454545);background:var(--vscode-editor-background)}
.chat-inputbar .chat-status{align-self:flex-start;min-height:1em}
.chat-input{width:100%;box-sizing:border-box;resize:vertical;min-height:44px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,#3c3c3c);font-family:inherit;font-size:inherit;padding:4px 6px}
.chat-actions{display:flex;gap:6px;justify-content:flex-end}
.chat-actions button{cursor:pointer;border:none;border-radius:2px;padding:3px 12px;font:inherit}
.chat-send{background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff)}
.chat-send:disabled{opacity:.5;cursor:default}
.chat-stop{background:var(--vscode-button-secondaryBackground,#3a3d41);color:var(--vscode-button-secondaryForeground,#fff)}
.chat-clear{background:none;color:var(--vscode-foreground);opacity:.7}
.chat-clear:hover{opacity:1}`;

/** The webview SCRIPT BODY — extracted as a pure, nonce-free string so the message protocol is string-testable (mirrors
 *  `COCKPIT_WEBVIEW_SCRIPT`). The host wraps it in `<script nonce=…>`. Behaviors: on `render` REHYDRATE the whole thread from
 *  host state (host is authoritative) + toggle Send/Stop + set the status line; on `delta` append text to the OPEN assistant
 *  turn's `data-chat-text` node via `appendData` (a text node — never innerHTML with model text) + clear the status line;
 *  Enter sends / Shift+Enter newlines; Send is a no-op while disabled (streaming); Stop→`chatStop`, Clear→`chatClear`,
 *  Send→`chatSend{text}`. On load it posts `chatReady` so the host sends the initial render. */
export const CHAT_WEBVIEW_SCRIPT =
  `const v=acquireVsCodeApi();` +
  `const thread=document.getElementById('chat-thread');` +
  `const input=document.querySelector('[data-chat-input]');` +
  `const sendBtn=document.querySelector('[data-chat-send]');` +
  `const stopBtn=document.querySelector('[data-chat-stop]');` +
  `const clearBtn=document.querySelector('[data-chat-clear]');` +
  `const statusEl=document.querySelector('[data-chat-status]');` +
  `const scrollBottom=()=>{thread.scrollTop=thread.scrollHeight;};` +
  `window.addEventListener('message',(e)=>{const m=e.data;` +
  // REHYDRATE: the host is authoritative — replace the whole thread + drive the controls from the render's flags.
  `if(m.type==='render'){thread.innerHTML=m.html;statusEl.textContent=m.status||'';const s=!!m.streaming;sendBtn.disabled=s;stopBtn.hidden=!s;scrollBottom();}` +
  // DELTA: append to the OPEN assistant turn's text node — appendData on a text node, NEVER innerHTML (immune to a tag/entity
  // split across deltas). First delta clears the "working…" status line.
  `else if(m.type==='delta'){const turn=thread.querySelector('[data-chat-open]');if(turn){const hold=turn.querySelector('[data-chat-text]')||turn;let tn=hold.firstChild;if(!tn||tn.nodeType!==3){tn=document.createTextNode('');hold.appendChild(tn);}tn.appendData(m.text);statusEl.textContent='';scrollBottom();}}` +
  `});` +
  // Send: guarded on the disabled (streaming) state HOST-side too, but block here for a snappy UI; drop an all-whitespace draft.
  `const send=()=>{if(sendBtn.disabled)return;const t=input.value;if(!t.trim())return;v.postMessage({type:'chatSend',text:t});input.value='';};` +
  `sendBtn.addEventListener('click',send);` +
  `stopBtn.addEventListener('click',()=>v.postMessage({type:'chatStop'}));` +
  `clearBtn.addEventListener('click',()=>v.postMessage({type:'chatClear'}));` +
  // Enter sends; Shift+Enter inserts a newline (default textarea behavior — don't preventDefault).
  `input.addEventListener('keydown',(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});` +
  // Ask the host for the initial render (rehydrate on (re)open — the host holds the conversation).
  `v.postMessage({type:'chatReady'});`;
