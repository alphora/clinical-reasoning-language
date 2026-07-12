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
const { flagTargetId, cockpitAgentBridge } = await loadBridge();

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

test("bridge.openFlagDrawer: no cockpit registered → an actionable reason (not ok)", () => {
  const r = cockpitAgentBridge.openFlagDrawer({ targetId: "x" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /not open/);
});

test("bridge: register delegates getAppState/getValidationKinds/openFlagDrawer; dispose clears them", () => {
  let fired = 0;
  cockpitAgentBridge.onDidChangeAppState(() => fired++);
  const disp = cockpitAgentBridge.register({
    getAppState: () => ({ policy: "p", anchorLabel: "n", flagTargets: [], treePaneOpen: true }),
    openFlagDrawer: () => ({ ok: true }),
    getValidationKinds: () => ["underspecified"],
  });
  assert.ok(fired >= 1, "register fires the change event (the chip refreshes)");
  assert.equal(cockpitAgentBridge.getAppState().policy, "p");
  assert.deepEqual(cockpitAgentBridge.getValidationKinds(), ["underspecified"]);
  assert.deepEqual(cockpitAgentBridge.openFlagDrawer({ targetId: "x" }), { ok: true });
  disp.dispose();
  assert.equal(cockpitAgentBridge.getAppState(), undefined, "dispose clears the hooks");
  assert.deepEqual(cockpitAgentBridge.getValidationKinds(), []);
});

console.log("cockpitAgentBridge.test: ok");
