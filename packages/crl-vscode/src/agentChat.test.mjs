// #210 editor agent Todo D (disc 241) — HOST-side guard locks for agentChat.ts. Like cockpitWebviewScript.test.mjs, this is a
// coarse-but-load-bearing SOURCE-GREP over the host closure (agentChat imports `vscode`, and the registry `run` routing +
// one-action arming live inside a closure the repo doesn't unit-test elsewhere). The impl review flagged the guard's arming
// semantics as "subtle + prone to silent rot" — these locks pin the invariants that matter for a durable verdict write.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(here, "agentChat.ts"), "utf8");

test("registry: set_verdict is routed FIRST — before the flag-only target_id requirement (it has no target_id)", () => {
  const verdictAt = SRC.indexOf("if (name === SET_VERDICT)");
  const targetIdAt = SRC.indexOf('recoverable("target_id is required');
  assert.ok(verdictAt > 0 && targetIdAt > 0, "both branches present");
  assert.ok(verdictAt < targetIdAt, "the set_verdict branch precedes the flag-only target_id check");
});

test("one-action guard: the verdict branch checks `acted` BEFORE arg validation (a 2nd call bounces with the generic copy, not a misleading arg error)", () => {
  const branch = SRC.slice(SRC.indexOf("if (name === SET_VERDICT)"), SRC.indexOf("cockpitAgentBridge.setVerdict"));
  const actedAt = branch.indexOf("if (acted) return alreadyActed");
  const argAt = branch.indexOf('recoverable("case_id is required'); // the actual arg check (not the comment mentioning it)
  assert.ok(actedAt >= 0 && argAt >= 0, "both the acted guard and the arg check are in the branch");
  assert.ok(actedAt < argAt, "the acted guard precedes arg validation");
});

test("one-action guard: verdict arms `acted` ONLY on a successful write; a failure returns recoverable (the model can retry)", () => {
  const branch = SRC.slice(SRC.indexOf("cockpitAgentBridge.setVerdict"), SRC.indexOf("cockpitAgentBridge.setVerdict") + 320);
  assert.match(branch, /if \(!res\.ok\) return recoverable\(res\.reason\)/, "a failed verdict is recoverable (no arm)");
  assert.match(branch, /acted = true;/, "a successful verdict arms the one-action guard");
});

test("one-action guard: it is action-GENERIC (verdict XOR flag) — the same `alreadyActed` bounces either kind, no flag-specific copy", () => {
  assert.match(SRC, /const alreadyActed = \{ content: "an action was already taken this turn/);
  assert.ok(!/a flag was already filed\/opened this turn/.test(SRC), "the old flag-specific refusal copy is gone");
});

test("tools: set_verdict is listed FIRST (the primary review action), then open before submit (no nudge to the durable submit)", () => {
  assert.match(SRC, /const tools = \[setVerdictTool\(\), openFlagDrawerTool\(kinds\), submitFlagTool\(kinds\)\]/);
});

test("render: the capability badges are computed from the LIVE app-state and posted each render", () => {
  assert.match(SRC, /capabilities: availableCapabilities\(cockpitAgentBridge\.getAppState\(\)\)/);
});

console.log("agentChat.test: ok");
