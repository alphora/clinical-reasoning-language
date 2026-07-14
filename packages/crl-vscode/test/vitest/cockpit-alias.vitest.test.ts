// #vitest-unification T1 — proof-of-life for the crl-vscode project. This is the deliverable that PROVES the shared `vscode`
// mock + vitest's native `.ts` transform: it imports `correspondenceCockpit` DIRECTLY (no esbuild-`load()` harness), which
// evaluates `vscode.ViewColumn.*` + `new vscode.EventEmitter()` at module load — so a successful import means the
// `resolve.alias` to test/oracle/vscode-stub.ts (now carrying ViewColumn + EventEmitter) works. It lives under test/vitest/
// (NOT src/*.test.mjs) so the legacy `run-tests.mjs` never picks it up. The FULL cockpit coverage stays in
// cockpitWebviewScript.test.mjs until T3 ports it; this is only the scaffolding proof.
import { EventEmitter } from "vscode"; // resolves to the stub via the crl-vscode project's resolve.alias
import { describe, expect, it } from "vitest";

import { COCKPIT_WEBVIEW_SCRIPT } from "../../src/correspondenceCockpit";

describe("T1: the shared `vscode` alias loads a runtime-vscode module under vitest", () => {
  it("imports correspondenceCockpit via the alias (needs vscode.ViewColumn + EventEmitter at load)", () => {
    // Reaching this line at all means the module loaded through the stubbed `vscode` — the whole point of T1's mock.
    // correspondenceCockpit imports cockpitAgentBridge (`new vscode.EventEmitter()` at module init) and reads
    // `vscode.ViewColumn.One..Six` (ORDERED_COLUMNS) at load, so a successful import exercises BOTH stubbed symbols.
    expect(typeof COCKPIT_WEBVIEW_SCRIPT).toBe("string");
    expect(COCKPIT_WEBVIEW_SCRIPT.length).toBeGreaterThan(100);
  });

  it("the stubbed vscode.EventEmitter is faithful: subscribe → fire delivers; dispose() stops delivery", () => {
    const em = new EventEmitter<number>();
    const seen: number[] = [];
    const sub = em.event((n) => seen.push(n));
    em.fire(1);
    sub.dispose(); // a faithful dispose removes THAT listener (a no-op dispose would leak it)
    em.fire(2); // not delivered — the listener is gone
    expect(seen).toEqual([1]);
  });
});
