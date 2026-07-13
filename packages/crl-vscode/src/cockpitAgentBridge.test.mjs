// #210 editor agent Todo C — the cockpit↔agent bridge: the DETERMINISTIC opaque target id (B5) + the register/getAppState/
// openFlagDrawer conduit. The module instantiates a `vscode.EventEmitter` at load, so — like agentModelProvider.test.mjs —
// we esbuild-bundle it with a `vscode` stub, here providing a MINIMAL EventEmitter.
import { build } from "esbuild";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const stubVscode = {
  name: "stub-vscode",
  setup(b) {
    b.onResolve({ filter: /^vscode$/ }, () => ({ path: "vscode", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents:
        "class EventEmitter{constructor(){this._l=[];}get event(){return (fn)=>{this._l.push(fn);return {dispose:()=>{this._l=this._l.filter(x=>x!==fn);}};};}fire(){for(const f of this._l.slice())f();}dispose(){this._l=[];}}" +
        "module.exports={EventEmitter};",
      loader: "js",
    }));
  },
};

async function loadBridge() {
  const out = resolve(tmpdir(), `crl-cockpit-bridge-${process.pid}.cjs`);
  await build({ entryPoints: [resolve(here, "cockpitAgentBridge.ts")], bundle: true, platform: "node", format: "cjs", target: "node18", outfile: out, logLevel: "silent", plugins: [stubVscode] });
  return require(out);
}
const { flagTargetId, caseTokenId, cockpitAgentBridge } = await loadBridge();

test("flagTargetId: deterministic — same identity → same OPAQUE id (idempotent re-mint on a chip refresh)", () => {
  const a = flagTargetId({ cel: "p.cel", kind: "decision", lib: "L", name: "D", key: "n~sig" });
  const b = flagTargetId({ cel: "p.cel", kind: "decision", lib: "L", name: "D", key: "n~sig" });
  assert.equal(a, b);
  assert.match(a, /^t[0-9a-z]+$/, "opaque, not a parseable kind:lib:name:key string");
});

test("flagTargetId: a different occurrence key → a different id (an occurrence-signature regen invalidates a stale id)", () => {
  assert.notEqual(
    flagTargetId({ cel: "p.cel", kind: "decision", lib: "L", name: "D", key: "n~sig1" }),
    flagTargetId({ cel: "p.cel", kind: "decision", lib: "L", name: "D", key: "n~sig2" }),
  );
});

test("flagTargetId: a different policy (cel) → a different id (no cross-policy collision)", () => {
  assert.notEqual(
    flagTargetId({ cel: "a.cel", kind: "concept", lib: "L", name: "N" }),
    flagTargetId({ cel: "b.cel", kind: "concept", lib: "L", name: "N" }),
  );
});

// #210 Todo D (disc 241) — caseTokenId (the opaque, cel-embedded review-case id for set_verdict).
test("caseTokenId: deterministic — same (cel, caseId) → same OPAQUE id, with a 'c' prefix (disjoint from a flag 't' id)", () => {
  const a = caseTokenId("p.cel", "case-1");
  assert.equal(a, caseTokenId("p.cel", "case-1"));
  assert.match(a, /^c[0-9a-z]+$/, "opaque; 'c' prefix keeps it disjoint from a flag target's 't' id");
});

test("caseTokenId: a different case OR a different policy (cel) → a different id (no cross-policy collision — C2)", () => {
  assert.notEqual(caseTokenId("p.cel", "case-1"), caseTokenId("p.cel", "case-2"));
  assert.notEqual(caseTokenId("a.cel", "case-1"), caseTokenId("b.cel", "case-1"));
});

const fakeToken = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };

test("bridge.beginFlagDrawer/submitFlag/setVerdict: no cockpit registered → an actionable reason (not ok)", async () => {
  const o = cockpitAgentBridge.beginFlagDrawer({ targetId: "x" }, fakeToken);
  assert.match(o.error, /not open/);
  const s = await cockpitAgentBridge.submitFlag({ targetId: "x" });
  assert.equal(s.ok, false);
  assert.match(s.reason, /not open/);
  const v = cockpitAgentBridge.setVerdict({ caseToken: "c1", verdict: "pass" });
  assert.equal(v.ok, false);
  assert.match(v.reason, /not open/);
});

test("bridge: register delegates getAppState/getValidationKinds/beginFlagDrawer/submitFlag; dispose clears them", async () => {
  let fired = 0;
  cockpitAgentBridge.onDidChangeAppState(() => fired++);
  const disp = cockpitAgentBridge.register({
    getAppState: () => ({ policy: "p", anchorLabel: "n", flagTargets: [], treePaneOpen: true, selectedCase: null }),
    beginFlagDrawer: (a) => ({ wait: Promise.resolve({ status: "cancelled", reason: "cancelled" }), purpose: `flag ${a.targetId}` }),
    submitFlag: async (a) => ({ ok: true, message: `filed on ${a.targetId}` }),
    setVerdict: (a) => ({ ok: true, message: `${a.caseToken} → ${a.verdict}` }),
    getValidationKinds: () => ["underspecified"],
  });
  assert.ok(fired >= 1, "register fires the change event (the chip refreshes)");
  assert.equal(cockpitAgentBridge.getAppState().policy, "p");
  assert.deepEqual(cockpitAgentBridge.getValidationKinds(), ["underspecified"]);
  assert.equal(cockpitAgentBridge.beginFlagDrawer({ targetId: "x" }, fakeToken).purpose, "flag x");
  assert.deepEqual(await cockpitAgentBridge.submitFlag({ targetId: "z" }), { ok: true, message: "filed on z" });
  assert.deepEqual(cockpitAgentBridge.setVerdict({ caseToken: "c9", verdict: "fail" }), { ok: true, message: "c9 → fail" });
  disp.dispose();
  assert.equal(cockpitAgentBridge.getAppState(), undefined, "dispose clears the hooks");
  assert.deepEqual(cockpitAgentBridge.getValidationKinds(), []);
  assert.equal(cockpitAgentBridge.setVerdict({ caseToken: "c9", verdict: "fail" }).ok, false, "setVerdict is not-ok once the hooks are cleared");
});

console.log("cockpitAgentBridge.test: ok");
