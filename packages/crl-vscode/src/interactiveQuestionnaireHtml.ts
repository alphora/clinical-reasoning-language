import { pruneInteractiveResponse, questionnaireWithoutDefaults } from "./interactiveQuestionnaireResponse";

// Self-contained browser function; passed explicit dependencies so the tested functions are the shipped ones.
export function installInteractiveQuestionnaire(prune: typeof pruneInteractiveResponse, withoutDefaults: typeof questionnaireWithoutDefaults) {
  const w = globalThis as any, doc = w.document, api = w.acquireVsCodeApi();
  const select = doc.getElementById("codeset"), start = doc.getElementById("start"), next = doc.getElementById("continue");
  const reset = doc.getElementById("reset"), cancel = doc.getElementById("cancel"), status = doc.getElementById("status");
  const mount = doc.getElementById("form"), outcomes = doc.getElementById("outcomes");
  let token = 0, render = 0, busy = false, ready = false, blocked = false, q: any, response: any, snapshot: any, subject: string;
  let transitioning = false, hasResult = false;
  let observing = false;
  const send = (type: string, extra = {}) => api.postMessage({ type, token, ...extra });
  const controls = () => {
    start.disabled = busy || !select.value || hasResult; next.disabled = busy || !ready || !q || blocked;
    select.disabled = transitioning;
    reset.disabled = !select.value || transitioning; cancel.disabled = !busy || transitioning;
    mount.inert = busy || !ready;
    mount.setAttribute("aria-busy", String(busy || !ready));
  };
  const error = (e: any) => { status.textContent = `Could not update the questionnaire: ${e.message ?? e}`; };
  const exported = () => {
    const qr = w.LForms.Util.getFormFHIRData("QuestionnaireResponse", "R4", mount, { subject: { reference: subject } });
    if (!qr) throw new Error("LForms did not return a QuestionnaireResponse.");
    // LForms exports a fresh authored time. No custom clinical-resource or per-answer timestamp handling.
    return { ...response, ...qr, item: qr.item ?? [], questionnaire: q.url + (q.version ? "|" + q.version : ""), subject: { reference: subject }, status: "in-progress" };
  };
  const mountForm = async (suppressDefaults: boolean, focus?: { id: string; start: number | null; end: number | null; direction: string }) => {
    const mine = ++render;
    ready = false; observing = false; controls();
    mount.replaceChildren();
    if (!q) { controls(); return; }
    try {
      let form = w.LForms.Util.convertFHIRQuestionnaireToLForms(suppressDefaults ? withoutDefaults(q) : q, "R4");
      if (response) form = w.LForms.Util.mergeFHIRDataIntoLForms("QuestionnaireResponse", response, form, "R4");
      let timeout: any;
      try {
        await Promise.race([w.LForms.Util.addFormToPage(form, "form", { prepopulate: false }),
          new Promise((_, reject) => { timeout = w.setTimeout(() => reject(new Error("The form did not finish rendering. Reset to retry.")), 15000); })]);
      } finally { w.clearTimeout(timeout); }
      if (render !== mine) return;
      snapshot = exported();
      // Keep intentional empty items that the renderer omits in its export.
      response = { ...response, ...snapshot, item: response?.item ?? snapshot.item };
      ready = true; observing = true; controls();
      if (focus) {
        const target = doc.getElementById(focus.id);
        if (target && mount.contains(target)) {
          target.focus({ preventScroll: true });
          if (focus.start !== null && typeof target.setSelectionRange === "function")
            target.setSelectionRange(focus.start, focus.end, focus.direction);
        }
      }
      const element = mount.querySelector("wc-lhc-form");
      element?.addEventListener("onFormChange", observe);
    } catch (e) { if (render === mine) { ready = false; error(e); controls(); } }
  };
  function observe() {
    if (!observing || busy || !ready) return;
    try {
      const current = exported(), delta = prune(q, snapshot, current);
      if (!delta.changed) return;
      // Snapshot is only the current renderer value, never a branch history.
      response = delta.response;
      snapshot = current;
      outcomes.replaceChildren();
      status.textContent = "Answers changed. Continue to re-evaluate.";
      if (delta.pruned) {
        status.textContent = "Later answers cleared. Continue to re-evaluate.";
        const active = doc.activeElement;
        const focus = active?.id && mount.contains(active) ? { id: active.id, start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection } : undefined;
        void mountForm(true, focus);
      }
    } catch (e) { error(e); }
  }
  // Native events reach this listener after Angular's target listener. Do not rely on onFormChange's 360 ms debounce.
  mount.addEventListener("input", observe);
  mount.addEventListener("change", observe);
  next.addEventListener("click", () => {
    observe();
    if (!ready || busy || blocked) return;
    try {
      const current = exported();
      // Keep the current pruned tree, including explicit clears omitted by LForms.
      response = { ...response, ...current, item: response?.item ?? current.item };
      busy = true; status.textContent = "Evaluating…"; controls(); send("continue", { response });
    } catch (e) { error(e); }
  });
  start.addEventListener("click", () => { if (busy || hasResult) return; busy = true; status.textContent = "Evaluating…"; controls(); send("start"); });
  const clear = () => { ++render; ready = false; blocked = false; hasResult = false; q = response = snapshot = undefined; mount.replaceChildren(); outcomes.replaceChildren(); controls(); };
  select.addEventListener("change", () => { if (transitioning) return; transitioning = true; clear(); busy = true; controls(); send("select", { id: select.value }); });
  reset.addEventListener("click", () => { if (transitioning) return; transitioning = true; clear(); busy = true; controls(); send("reset"); });
  cancel.addEventListener("click", () => { if (transitioning || !busy) return; transitioning = true; controls(); send("cancel"); });
  w.addEventListener("message", (event: any) => {
    const m = event.data;
    if (m.type === "initial") {
      token = m.token; busy = false; transitioning = false; clear(); select.replaceChildren();
      for (const state of m.states) { const o = doc.createElement("option"); o.value = state.id; o.textContent = state.label; select.appendChild(o); }
      select.hidden = m.states.length < 2;
      doc.getElementById("codeset-label").hidden = m.states.length < 2;
      subject = m.subject;
      status.textContent = m.error || (m.states.length ? "Select Start to begin." : "No initial states found. Add tests/interactive-questionnaire/request-1/request-bundle.json to this policy.");
      controls();
    } else if (m.type === "cancelled") {
      token = m.token; busy = false; transitioning = false; if (m.id) select.value = m.id; status.textContent = m.message; controls();
    } else if (m.type === "reset") {
      token = m.token; busy = false; transitioning = false; subject = m.subject; clear();
      if (m.id) select.value = m.id;
      status.textContent = "Select Start to begin."; controls();
    } else if (m.token === token && m.type === "result") {
      busy = false; hasResult = true; q = m.questionnaire; response = m.response; subject = m.subject;
      outcomes.replaceChildren();
      for (const activity of m.activities) { const li = doc.createElement("li"); li.textContent = activity; outcomes.appendChild(li); }
      status.textContent = m.activities.length ? "Evaluation returned activities. You can change answers and re-evaluate." : q ? "Answer the questions, then Continue." : "The engine returned no questionnaire or activities.";
      if (m.diagnostics?.length) status.textContent += " " + m.diagnostics.join("; ");
      blocked = !!m.unsupported?.length;
      if (blocked) status.textContent = "This form cannot be submitted because the renderer does not support: " + m.unsupported.join("; ");
      void mountForm(false);
    } else if (m.token === token && m.type === "error") {
      busy = false; status.textContent = m.message; controls();
    }
  });
  controls(); send("ready");
}

export function interactiveQuestionnaireHtml(nonce: string, cspSource: string, asset: (name: string) => string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource}; style-src 'unsafe-inline' ${cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${asset("styles.css")}"><style>
body{padding:16px;color:var(--vscode-editor-foreground,#222);background:var(--vscode-editor-background,#fff);font:14px var(--vscode-font-family,Arial)}
nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap}button,select{padding:6px 10px;font:inherit}button{cursor:pointer}button:disabled{cursor:default}#status{line-height:1.5}#form[aria-busy=true]{opacity:.6}#outcomes{padding-left:22px}h1{font-size:18px}
</style></head><body><h1>Interactive FHIR Questionnaire</h1><nav>
<label id="codeset-label" for="codeset">Initial state</label><select id="codeset"></select>
<button id="start">Start</button><button id="continue" disabled>Continue / Re-evaluate</button><button id="reset">Reset</button><button id="cancel" disabled>Cancel</button>
</nav><p id="status" role="status">Loading initial states…</p><ul id="outcomes" aria-label="Resulting activities"></ul><div id="form"></div>
<script nonce="${nonce}" src="${asset("zone.min.js")}"></script><script nonce="${nonce}" src="${asset("lhc-forms.js")}"></script><script nonce="${nonce}" src="${asset("lformsFHIR.min.js")}"></script>
<script nonce="${nonce}">(${installInteractiveQuestionnaire.toString()})(${pruneInteractiveResponse.toString()},${questionnaireWithoutDefaults.toString()});</script></body></html>`;
}
