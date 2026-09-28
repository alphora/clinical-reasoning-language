import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const harness = vi.hoisted(() => ({ panels: [], sessions: [] }));
vi.mock("vscode", () => ({
  ViewColumn: { Beside: 2 },
  Uri: { joinPath: (...p) => p.map(x => x.fsPath ?? x).join("/") },
  window: { tabGroups: { all: [] }, createWebviewPanel: () => {
    const panel = { messages: [], reveal: vi.fn(),
      webview: { cspSource: "local:", asWebviewUri: x => x, postMessage(m) { panel.messages.push(m); }, onDidReceiveMessage(f) { panel.receive = f; return { dispose() {} }; } },
      onDidDispose(f) { panel.closed = f; }, dispose() { panel.disposed = true; panel.closed?.(); },
    }; harness.panels.push(panel); return panel;
  } },
}));
vi.mock("./interactiveQuestionnaire", () => ({
  prepareInteractivePolicy: () => ({ planId: "p", definitions: {}, warnings: [], initialStates: [1, 2].map(n => ({ id: String(n), label: `Codeset ${n}`, subject: `Patient/p${n}`, bundle: {} })) }),
  nativeInteractiveRunner: () => {},
  InteractiveSession: class {
    result; cancel = vi.fn(); reset = vi.fn();
    constructor() { harness.sessions.push(this); }
    evaluate = vi.fn(() => new Promise((resolve, reject) => { this.resolve = r => { this.result = r; resolve(r); }; this.reject = reject; }));
  },
}));
import { createInteractiveQuestionnairePanel } from "./interactiveQuestionnairePanel.ts";

describe("interactive panel ownership", () => {
  const context = () => ({ extensionPath: resolve("packages/crl-vscode"), extensionUri: { fsPath: resolve("packages/crl-vscode") }, subscriptions: [] });
  const init = async () => {
    // Existing standalone module exists after the test project's mandatory build.
    createRequire(import.meta.url)(resolve("packages/crl-vscode/dist/apply-session.js"));
    const controller = createInteractiveQuestionnairePanel(context()); controller.open("policy-a.cel");
    const panel = harness.panels.at(-1); await panel.receive({ type: "ready" });
    return { controller, panel, session: harness.sessions.at(-1), token: panel.messages.at(-1).token };
  };
  it("selects one state, guards duplicate Continue, and ignores stale results after switching", async () => {
    const { panel, session, token } = await init();
    expect(panel.messages.at(-1).states).toHaveLength(2);
    const work = panel.receive({ type: "start", token });
    await panel.receive({ type: "start", token }); expect(session.evaluate).toHaveBeenCalledTimes(1);
    await panel.receive({ type: "select", token, id: "2" });
    await panel.receive({ type: "select", token, id: "1" });
    const reset = panel.messages.at(-1); expect(reset.type).toBe("reset"); expect(reset.subject).toBe("Patient/p2");
    expect(reset.id).toBe("2");
    session.resolve({ questionnaire: { url: "old" }, activities: ["stale"] }); await work;
    expect(panel.messages.at(-1)).toBe(reset);
    await panel.receive({ type: "continue", token, response: { resourceType: "QuestionnaireResponse" } });
    expect(session.evaluate).toHaveBeenCalledTimes(1);
  });
  it("cancels on close or policy change and does not close a replacement panel", async () => {
    const { controller, panel, session } = await init();
    controller.policyChanged("policy-b.cel"); expect(panel.disposed).toBe(true); expect(session.cancel).toHaveBeenCalled();
    controller.open("policy-b.cel"); const replacement = harness.panels.at(-1); panel.closed();
    expect(replacement.disposed).toBeUndefined(); controller.close(); expect(replacement.disposed).toBe(true);
  });
  it("errors preserve the current browser form and cancellation advances the token", async () => {
    const { panel, session, token } = await init();
    const work = panel.receive({ type: "start", token }); session.reject(Error("engine failure")); await work;
    expect(panel.messages.at(-1)).toMatchObject({ type: "error", token, message: "Error: engine failure" });
    await panel.receive({ type: "cancel", token }); expect(session.cancel).toHaveBeenCalled();
    expect(panel.messages.at(-1).type).toBe("cancelled"); expect(panel.messages.at(-1).token).not.toBe(token);
  });
  it("Start is ignored once a form exists; Continue remains usable", async () => {
    const { panel, session, token } = await init();
    const first = panel.receive({ type: "start", token });
    session.resolve({ questionnaire: { url: "q" }, response: {}, activities: [] }); await first;
    await panel.receive({ type: "start", token }); expect(session.evaluate).toHaveBeenCalledTimes(1);
    const next = panel.receive({ type: "continue", token, response: { resourceType: "QuestionnaireResponse" } });
    expect(session.evaluate).toHaveBeenCalledTimes(2); session.reject(Error("failure")); await next;
    expect(panel.messages.at(-1).type).toBe("error");
  });
});
