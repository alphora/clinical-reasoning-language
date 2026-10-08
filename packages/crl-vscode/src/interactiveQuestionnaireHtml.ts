import { pruneInteractiveResponse, questionnaireWithoutDefaults, retainInteractiveQuestionnaire } from "./interactiveQuestionnaireResponse";
import { installBooleanAnswerClearControls } from "./lformsBooleanControls";

// Self-contained browser function; passed explicit dependencies so the tested functions are the shipped ones.
export function installInteractiveQuestionnaire(prune: typeof pruneInteractiveResponse, withoutDefaults: typeof questionnaireWithoutDefaults,
  retain: typeof retainInteractiveQuestionnaire, inspect: (q: unknown) => string[], booleanControls: typeof installBooleanAnswerClearControls) {
  const w = globalThis as any, doc = w.document, api = w.acquireVsCodeApi();
  const select = doc.getElementById("codeset"), start = doc.getElementById("start"), next = doc.getElementById("continue");
  const reset = doc.getElementById("reset"), cancel = doc.getElementById("cancel"), status = doc.getElementById("status");
  const mount = doc.getElementById("form"), outcomes = doc.getElementById("outcomes");
  const results = doc.getElementById("results"), warnings = doc.getElementById("warnings"), warningList = doc.getElementById("warning-list");
  let definitionWarnings: string[] = [], evaluationWarnings: string[] = [];
  const showWarnings = () => {
    const messages = [...new Set([...definitionWarnings, ...evaluationWarnings])];
    warningList.replaceChildren();
    for (const message of messages) { const li = doc.createElement("li"); li.textContent = message; warningList.appendChild(li); }
    doc.getElementById("warning-summary").textContent = `Warnings (${messages.length})`;
    warnings.hidden = messages.length === 0;
  };
  let token = 0, render = 0, busy = false, ready = false, blocked = false, q: any, response: any, snapshot: any, subject: string;
  let transitioning = false, hasResult = false;
  let observing = false, editError = false;
  let dependencies: Record<string, string[]> = {};
  const send = (type: string, extra = {}) => api.postMessage({ type, token, ...extra });
  const controls = () => {
    start.disabled = busy || !select.value || hasResult; next.disabled = busy || !ready || !q || blocked || editError;
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
        const element = doc.getElementById(focus.id);
        const target = element?.matches('label') ? element.querySelector('input[type="radio"]') : element;
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
      const current = exported(), delta = prune(q, snapshot, current, retain, dependencies);
      const unsupported = inspect(delta.questionnaire);
      if (editError) status.textContent = blocked
        ? "This form cannot be submitted because the renderer does not support: " + unsupported.join("; ")
        : "Answers available. Continue to re-evaluate.";
      editError = false;
      if (!delta.changed) { controls(); return; }
      // Snapshot is only the current renderer value, never a branch history.
      response = delta.response;
      q = delta.questionnaire;
      blocked = unsupported.length > 0;
      snapshot = current;
      outcomes.replaceChildren();
      results.hidden = true; evaluationWarnings = []; showWarnings();
      status.textContent = "Answers changed. Continue to re-evaluate.";
      if (delta.pruned) {
        status.textContent = "Dependent questions and answers removed. Continue to re-evaluate.";
        const active = doc.activeElement;
        const id = active?.id || active?.closest('label')?.id;
        const focus = id && mount.contains(active) ? { id, start: active.selectionStart ?? null, end: active.selectionEnd ?? null, direction: active.selectionDirection } : undefined;
        void mountForm(true, focus);
      }
      if (blocked) status.textContent = "This form cannot be submitted because the renderer does not support: " + unsupported.join("; ");
      controls();
    } catch (e) { editError = true; error(e); controls(); }
  }
  // Native input/change handle other widgets. ng-zorro Booleans cancel those events;
  // the clear adapter explicitly observes clears, and onFormChange handles selections.
  mount.addEventListener("input", observe);
  mount.addEventListener("change", observe);
  booleanControls(mount, observe);
  next.addEventListener("click", () => {
    observe();
    if (!ready || busy || blocked || editError) return;
    try {
      const current = exported();
      // Keep the current pruned tree, including explicit clears omitted by LForms.
      response = { ...response, ...current, item: response?.item ?? current.item };
      busy = true; status.textContent = "Evaluating…"; controls(); send("continue", { questionnaire: q, response });
    } catch (e) { editError = true; error(e); controls(); }
  });
  start.addEventListener("click", () => { if (busy || hasResult) return; busy = true; status.textContent = "Evaluating…"; controls(); send("start"); });
  const clear = () => { ++render; ready = false; blocked = false; editError = false; hasResult = false; q = response = snapshot = undefined; mount.replaceChildren(); outcomes.replaceChildren(); results.hidden = true; evaluationWarnings = []; showWarnings(); controls(); };
  select.addEventListener("change", () => { if (transitioning) return; transitioning = true; clear(); busy = true; controls(); send("select", { id: select.value }); });
  reset.addEventListener("click", () => { if (transitioning) return; transitioning = true; clear(); busy = true; controls(); send("reset"); });
  cancel.addEventListener("click", () => { if (transitioning || !busy) return; transitioning = true; controls(); send("cancel"); });
  w.addEventListener("message", (event: any) => {
    const m = event.data;
    if (m.type === "initial") {
      dependencies = m.dependencies ?? {};
      definitionWarnings = m.warnings ?? []; warnings.open = false;
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
      busy = false; editError = false; hasResult = true; q = m.questionnaire; response = m.response; subject = m.subject;
      outcomes.replaceChildren();
      for (const activity of m.activities) { const p = doc.createElement("p"); p.textContent = activity; outcomes.appendChild(p); }
      results.hidden = m.activities.length === 0;
      status.textContent = m.activities.length
        ? q ? "Evaluation complete. You can change answers and re-evaluate." : "Evaluation complete. Select Reset to start again."
        : q ? "Answer the questions, then Continue." : "The engine returned no questionnaire or activities.";
      evaluationWarnings = m.warnings ?? []; showWarnings();
      blocked = !!m.unsupported?.length;
      if (blocked) status.textContent = "This form cannot be submitted because the renderer does not support: " + m.unsupported.join("; ");
      void mountForm(false);
    } else if (m.token === token && m.type === "error") {
      busy = false; status.textContent = m.message; controls();
    }
  });
  controls(); send("ready");
}

export function interactiveQuestionnaireHtml(nonce: string, cspSource: string, asset: (name: string) => string,
  inspect: (q: unknown) => string[] = () => []): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource}; style-src 'unsafe-inline' ${cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${asset("styles.css")}"><style>
body{padding:16px;color:var(--vscode-editor-foreground,#222);background:var(--vscode-editor-background,#fff);font:14px var(--vscode-font-family,Arial)}
nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap}button,select{padding:6px 10px;font:inherit}button{cursor:pointer}button:disabled{cursor:default}#status{line-height:1.5}#form[aria-busy=true]{opacity:.6}h1{font-size:18px}#results{margin-top:20px;padding:12px 16px;border:1px solid var(--vscode-panel-border,#777);border-radius:4px}#results h2{font-size:16px;margin:0 0 8px}#outcomes p{margin:6px 0;overflow-wrap:anywhere}#warnings{margin:12px 0}#warnings summary{cursor:pointer;color:var(--vscode-editorWarning-foreground,#c79420)}#warning-list{line-height:1.5;overflow-wrap:anywhere}
</style></head><body><h1>Interactive FHIR Questionnaire</h1><nav>
<label id="codeset-label" for="codeset">Initial state</label><select id="codeset"></select>
<button id="start">Start</button><button id="continue" disabled>Continue / Re-evaluate</button><button id="reset">Reset</button><button id="cancel" disabled>Cancel</button>
</nav><p id="status" role="status">Loading initial states…</p><details id="warnings" hidden><summary id="warning-summary">Warnings</summary><ul id="warning-list"></ul></details><div id="form"></div><section id="results" aria-labelledby="result-heading" aria-live="polite" hidden><h2 id="result-heading">Result</h2><div id="outcomes"></div></section>
<script nonce="${nonce}" src="${asset("zone.min.js")}"></script><script nonce="${nonce}" src="${asset("lhc-forms.js")}"></script><script nonce="${nonce}" src="${asset("lformsFHIR.min.js")}"></script>
<script nonce="${nonce}">(${installInteractiveQuestionnaire.toString()})(${pruneInteractiveResponse.toString()},${questionnaireWithoutDefaults.toString()},${retainInteractiveQuestionnaire.toString()},${inspect.toString()},${installBooleanAnswerClearControls.toString()});</script></body></html>`;
}
