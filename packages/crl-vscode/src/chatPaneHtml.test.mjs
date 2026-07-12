// #210 editor agent Todo B — chatPaneHtml (pure): renderChatThread structure + escaping, the static CHAT_BODY controls, and
// the CHAT_WEBVIEW_SCRIPT message protocol (Enter vs Shift+Enter, Send-disabled-while-streaming, Stop/Clear posts, the
// XSS-safe delta append via a text node's appendData — never innerHTML). vscode-free, so the shared harness `load` suffices.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { renderChatThread, CHAT_BODY, CHAT_STYLE, CHAT_WEBVIEW_SCRIPT } = await load("chatPaneHtml.ts");

test("renderChatThread: empty transcript renders the placeholder (escaped)", () => {
  assert.match(renderChatThread([], { placeholder: "Ask <me>" }), /class="chat-empty">Ask &lt;me&gt;</);
  assert.equal(renderChatThread([]), "", "no placeholder → empty string");
});

test("renderChatThread: a user + assistant turn render their roles + escaped bodies", () => {
  const h = renderChatThread([
    { kind: "user", text: "hi" },
    { kind: "assistant", text: "hello" },
  ]);
  assert.match(h, /class="chat-msg chat-user"><span class="chat-role">You<\/span><div class="chat-body">hi</);
  assert.match(h, /class="chat-msg chat-assistant"><span class="chat-role">Agent</);
  assert.match(h, /<span data-chat-text>hello<\/span>/);
});

test("renderChatThread: ALL text is HTML-escaped (user, assistant, error) — no raw markup reaches the DOM", () => {
  const evil = '<img src=x onerror=alert(1)>&"\'';
  const h = renderChatThread([
    { kind: "user", text: evil },
    { kind: "assistant", text: evil },
    { kind: "error", text: evil },
  ]);
  assert.ok(!h.includes("<img"), "the raw <img is never emitted");
  assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;&amp;&quot;&#39;/);
  // the escaped form appears once per turn (user, assistant, error)
  assert.equal((h.match(/&lt;img/g) || []).length, 3);
});

test("renderChatThread: the OPEN assistant turn carries data-chat-open + a data-chat-text holder (the delta target)", () => {
  const h = renderChatThread([{ kind: "assistant", text: "part", open: true }]);
  assert.match(h, /class="chat-msg chat-assistant" data-chat-open>/);
  assert.match(h, /<span data-chat-text>part<\/span>/);
});

test("renderChatThread: a stopped assistant turn keeps its partial text + a (stopped) label", () => {
  const h = renderChatThread([{ kind: "assistant", text: "half a", stopped: true }]);
  assert.match(h, /<span data-chat-text>half a<\/span><span class="chat-stopped">\(stopped\)<\/span>/);
});

test("renderChatThread: newlines are preserved via CSS (pre-wrap) — NOT converted to <br>", () => {
  const h = renderChatThread([{ kind: "assistant", text: "a\nb" }]);
  assert.ok(!h.includes("<br"), "no <br> injected");
  assert.match(h, /a\nb/, "the literal newline survives (rendered by white-space:pre-wrap)");
  assert.match(CHAT_STYLE, /\.chat-body\{white-space:pre-wrap/);
});

test("CHAT_BODY: the thread + input controls exist with their data-hooks", () => {
  assert.match(CHAT_BODY, /id="chat-thread"/);
  assert.match(CHAT_BODY, /<textarea data-chat-input/);
  assert.match(CHAT_BODY, /data-chat-send/);
  assert.match(CHAT_BODY, /data-chat-stop[^>]*hidden/, "Stop starts hidden (shown only while streaming)");
  assert.match(CHAT_BODY, /data-chat-clear/);
  assert.match(CHAT_BODY, /data-chat-status/);
});

// ── CHAT_WEBVIEW_SCRIPT: the message protocol (string-level, like COCKPIT_WEBVIEW_SCRIPT) ──
const S = CHAT_WEBVIEW_SCRIPT;

test("SCRIPT: a `render` REHYDRATES the whole thread (innerHTML), sets the status line + toggles Send/Stop", () => {
  assert.match(S, /if\(m\.type==='render'\)\{thread\.innerHTML=m\.html;/);
  assert.match(S, /statusEl\.textContent=m\.status\|\|''/);
  assert.match(S, /sendBtn\.disabled=s;stopBtn\.hidden=!s/);
});

test("SCRIPT: a `delta` appends to the OPEN assistant turn via a text node's appendData — NEVER innerHTML with model text", () => {
  const deltaBody = S.slice(S.indexOf("m.type==='delta'"), S.indexOf("m.type==='delta'") + 320);
  assert.match(deltaBody, /querySelector\('\[data-chat-open\]'\)/, "targets the open turn");
  assert.match(deltaBody, /appendData\(m\.text\)/, "appends via a text node's appendData");
  assert.ok(!/innerHTML=.*m\.text/.test(deltaBody), "the delta handler NEVER assigns model text to innerHTML");
  assert.match(deltaBody, /createTextNode/, "creates a text node when the holder has none yet");
});

test("SCRIPT: Enter sends, Shift+Enter does NOT (newline); the keydown guards on shiftKey", () => {
  assert.match(S, /if\(e\.key==='Enter'&&!e\.shiftKey\)\{e\.preventDefault\(\);send\(\)/);
});

test("SCRIPT: Send is a no-op while disabled (streaming) and drops an all-whitespace draft", () => {
  assert.match(S, /const send=\(\)=>\{if\(sendBtn\.disabled\)return;const t=input\.value;if\(!t\.trim\(\)\)return;v\.postMessage\(\{type:'chatSend',text:t\}\);input\.value=''/);
});

test("SCRIPT: Stop posts chatStop, Clear posts chatClear, and it requests the initial render on load (chatReady)", () => {
  assert.match(S, /stopBtn\.addEventListener\('click',\(\)=>v\.postMessage\(\{type:'chatStop'\}\)\)/);
  assert.match(S, /clearBtn\.addEventListener\('click',\(\)=>v\.postMessage\(\{type:'chatClear'\}\)\)/);
  assert.match(S, /v\.postMessage\(\{type:'chatReady'\}\)/);
});

console.log("chatPaneHtml.test: ok");
