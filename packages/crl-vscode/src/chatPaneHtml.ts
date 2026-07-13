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
 *  `assistant.stopped` = a cancelled reply (keeps its partial text, labelled); `assistant.thoughtMs` = how long the model's
 *  adaptive-thinking block ran (Todo B.1) → a muted "Thought for Ns" line above the reply. `error`/`status` are UI-only
 *  (never enter the model `messages`). */
export type ChatEntry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; open?: boolean; stopped?: boolean; thoughtMs?: number }
  | { kind: "error"; text: string }
  | { kind: "status"; text: string };

/** "Thought for Ns" — whole seconds, floored at 1s so a sub-second block never reads "0s". */
const thoughtSeconds = (ms: number): number => Math.max(1, Math.floor(ms / 1000)); // FLOOR to match the live ticker (no +1 jump on collapse)

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
      // A muted "Thought for Ns" line above the reply (the duration is a number, so no escaping needed). Rendered whenever
      // the turn carries a `thoughtMs` — during streaming (once thinking stops) and on the finalized turn alike.
      const thought = typeof m.thoughtMs === "number" ? `<div class="chat-thought">Thought for ${thoughtSeconds(m.thoughtMs)}s</div>` : "";
      // The `data-chat-text` holder is where streaming deltas append; render it for every assistant turn so a finalized
      // turn keeps the same shape as the open one it replaces.
      parts.push(
        `<div class="chat-msg chat-assistant"${openAttr}><span class="chat-role">Agent</span>` +
          `<div class="chat-body">${thought}<span data-chat-text>${escapeHtml(m.text)}</span>${stopped}</div></div>`,
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
  // A subtle status line ABOVE the box (working… / thinking…) — collapses to zero height when empty, so it never leaves a
  // permanent empty band.
  `<div class="chat-status" data-chat-status></div>` +
  // ONE unified input box (like a modern chat composer): the textarea on top, a single compact toolbar row underneath (the
  // context chip on the left, the actions on the right), all inside one rounded, focus-ringed container.
  `<div class="chat-box" data-chat-box>` +
  `<textarea data-chat-input class="chat-input" rows="2" placeholder="Ask the CRL agent…  (Enter to send · Shift+Enter for a newline)"></textarea>` +
  // #210 (disc 239) — the static elicitation banner replaces the textarea (in place) while an app UI is the agent's open
  // request. A LABEL only (the `busy` state disables Send). Purple-tinted — the CRL Assist "the agent is asking" cue.
  `<div class="chat-eliciting" data-chat-eliciting hidden></div>` +
  `<div class="chat-toolbar">` +
  // #210 Todo C — the context chip (the cockpit item the agent perceives), on the LEFT; NEUTRAL, not flag-branded.
  `<span class="chat-chip" data-chat-chip hidden></span>` +
  `<span class="chat-tools">` +
  `<button type="button" data-chat-clear class="chat-clear" title="Clear the conversation">Clear</button>` +
  `<button type="button" data-chat-stop class="chat-stop" hidden title="Stop">Stop</button>` +
  `<button type="button" data-chat-send class="chat-send" title="Send  (Enter)" aria-label="Send">↑</button>` +
  `</span>` +
  `</div></div></div>`;

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
.chat-thought{opacity:.6;font-style:italic;font-size:.85em;margin-bottom:3px}
.chat-inputbar{display:flex;flex-direction:column;gap:4px;padding:8px;border-top:1px solid var(--vscode-panel-border,#454545);background:var(--vscode-editor-background)}
/* status: a subtle line ABOVE the box; EMPTY → zero height (no permanent middle band). */
.chat-status{opacity:.7;font-style:italic;font-size:.85em;align-self:flex-start;min-height:0;padding:0 2px}
/* the ONE unified input box: textarea + toolbar in a single rounded, focus-ringed container (no more stacked bands). */
.chat-box{display:flex;flex-direction:column;gap:5px;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,#3c3c3c);border-radius:8px;padding:6px 8px}
.chat-box:focus-within{border-color:var(--vscode-charts-purple,#c586c0);box-shadow:0 0 0 1px var(--vscode-charts-purple,#c586c0)}
.chat-input{width:100%;box-sizing:border-box;resize:none;min-height:34px;max-height:180px;background:transparent;color:var(--vscode-input-foreground);border:none;outline:none;font-family:inherit;font-size:inherit;padding:0}
/* #210 (disc 239) — the static elicitation banner replaces the textarea IN the box (the box supplies the frame). */
.chat-eliciting{min-height:34px;display:flex;align-items:center;font-style:italic;color:var(--vscode-charts-purple,#c586c0)}
/* the single compact toolbar row inside the box: the context chip on the left, the actions on the right. */
.chat-toolbar{display:flex;align-items:center;gap:6px}
.chat-tools{display:flex;align-items:center;gap:6px;margin-left:auto}
/* the context chip — a neutral badge showing the cockpit item the agent perceives. */
.chat-chip{max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82em;padding:1px 8px;border-radius:10px;background:var(--vscode-badge-background,rgba(120,120,120,.25));color:var(--vscode-badge-foreground,var(--vscode-foreground))}
.chat-tools button{cursor:pointer;border:none;border-radius:4px;font:inherit}
/* Send is a compact purple arrow — DARK glyph on the light purple (mirrors .crl-layer-inferred). */
.chat-send{background:var(--vscode-charts-purple,#c586c0);color:var(--vscode-editor-background,#1e1e1e);font-weight:600;width:26px;height:22px;padding:0;display:inline-flex;align-items:center;justify-content:center;font-size:1.05em}
.chat-send:focus-visible{outline:1px solid var(--vscode-charts-purple,#c586c0);outline-offset:1px}
.chat-send:disabled{opacity:.45;cursor:default}
.chat-stop{background:var(--vscode-button-secondaryBackground,#3a3d41);color:var(--vscode-button-secondaryForeground,#fff);padding:2px 8px}
.chat-clear{background:none;color:var(--vscode-foreground);opacity:.6;font-size:.9em;padding:2px 6px}
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
  `const chipEl=document.querySelector('[data-chat-chip]');` +
  `const elicitEl=document.querySelector('[data-chat-eliciting]');` +
  `const scrollBottom=()=>{thread.scrollTop=thread.scrollHeight;};` +
  // THINKING indicator: a live "thinking… Ns" ticker driven off the host-supplied start time (wall-clock ms; same machine as
  // the host, so no skew). setInterval on a render with `thinking:true`; cleared on `thinking:false`, on the first delta, and
  // never leaks (clearThink before each (re)start). Timer text via textContent — never innerHTML.
  `let thinkTimer=null;` +
  `const clearThink=()=>{if(thinkTimer){clearInterval(thinkTimer);thinkTimer=null;}};` +
  `const showThinking=(since)=>{const tick=()=>{const s=Math.max(0,Math.floor((Date.now()-since)/1000));statusEl.textContent='thinking… '+s+'s';};clearThink();tick();thinkTimer=setInterval(tick,1000);};` +
  `window.addEventListener('message',(e)=>{const m=e.data;` +
  // REHYDRATE: the host is authoritative — replace the whole thread + drive the controls from the render's flags. When
  // `thinking` is set, run the live ticker (a rehydration mid-thinking resumes it from `thinkingSince`); otherwise show the
  // plain status line.
  `if(m.type==='render'){thread.innerHTML=m.html;const s=!!m.busy;sendBtn.disabled=s;stopBtn.hidden=!s;if(m.chip){chipEl.textContent=m.chip;chipEl.title=m.chipTitle||m.chip;chipEl.hidden=false;}else{chipEl.hidden=true;}` +
  // Elicitation: swap the textarea for the static purpose banner (keep the textarea NODE — just hide it — so its refs survive).
  `if(m.eliciting){elicitEl.textContent=m.eliciting;elicitEl.hidden=false;input.hidden=true;}else{elicitEl.hidden=true;input.hidden=false;}if(m.thinking){showThinking(m.thinkingSince||Date.now());}else{clearThink();statusEl.textContent=m.status||'';}scrollBottom();}` +
  // DELTA: append to the OPEN assistant turn's text node — appendData on a text node, NEVER innerHTML (immune to a tag/entity
  // split across deltas). First delta clears the thinking ticker + the "working…" status line.
  `else if(m.type==='delta'){const turn=thread.querySelector('[data-chat-open]');if(turn){const hold=turn.querySelector('[data-chat-text]')||turn;let tn=hold.firstChild;if(!tn||tn.nodeType!==3){tn=document.createTextNode('');hold.appendChild(tn);}tn.appendData(m.text);clearThink();statusEl.textContent='';scrollBottom();}}` +
  `});` +
  // Auto-grow the single-line composer with content (capped by the CSS max-height, then it scrolls) — the modern composer feel.
  `const grow=()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,180)+'px';};` +
  `input.addEventListener('input',grow);` +
  // Send: guarded on the disabled (streaming) state HOST-side too, but block here for a snappy UI; drop an all-whitespace draft.
  `const send=()=>{if(sendBtn.disabled)return;const t=input.value;if(!t.trim())return;v.postMessage({type:'chatSend',text:t});input.value='';grow();};` +
  `sendBtn.addEventListener('click',send);` +
  `stopBtn.addEventListener('click',()=>v.postMessage({type:'chatStop'}));` +
  `clearBtn.addEventListener('click',()=>v.postMessage({type:'chatClear'}));` +
  // Enter sends; Shift+Enter inserts a newline (default textarea behavior — don't preventDefault).
  `input.addEventListener('keydown',(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});` +
  // Ask the host for the initial render (rehydrate on (re)open — the host holds the conversation).
  `v.postMessage({type:'chatReady'});`;
