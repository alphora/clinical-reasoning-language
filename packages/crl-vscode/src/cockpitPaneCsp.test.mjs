// Tests for the per-pane cockpit CSP seam.
//
// This exists because the `$apply` questionnaire pane will need ONE directive relaxed (style-src) while every
// other pane stays nonce-only. The seam was introduced ahead of that pane so the change lands in one reviewable
// place. Right now the function must be a NO-OP refactor: every pane still gets the historical policy, byte for
// byte. These tests pin that, and pin the invariants the relaxation must not breach when it arrives.
import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { cockpitPaneCsp } from "./correspondenceCockpit.ts";

// Must stay in lockstep with `Pane` in correspondenceEngine.ts — that union is not enumerable at runtime.
const PANES = ["source", "crl", "cel", "tree", "questionnaire", "worklist"];
const A = { nonce: "N", styleNonce: "S", cspSource: "vscode-webview://host" };

/** The policy as it stood before the seam was introduced (correspondenceCockpit.ts:4986). */
const HISTORICAL = "default-src 'none'; style-src 'nonce-S'; script-src 'nonce-N';";

describe("cockpitPaneCsp", () => {
  it("is a NO-OP refactor — every existing pane still gets the historical policy byte for byte", () => {
    for (const p of PANES) {
      assert.equal(cockpitPaneCsp(p, A), HISTORICAL, `${p} pane's CSP drifted from the pre-seam policy`);
    }
  });

  it("keeps script-src nonce-only for every pane", () => {
    // The vendored LForms bundles carry zero eval/new Function, so no pane has any business relaxing scripts.
    for (const p of PANES) {
      const csp = cockpitPaneCsp(p, A);
      assert.ok(csp.includes(`script-src 'nonce-${A.nonce}'`), `${p} changed script-src`);
      assert.ok(!csp.includes("unsafe-eval"), `${p} introduced unsafe-eval`);
    }
  });

  it("keeps default-src 'none' for every pane", () => {
    for (const p of PANES) assert.ok(cockpitPaneCsp(p, A).includes("default-src 'none'"), `${p} widened default-src`);
  });

  it("never emits a style nonce alongside 'unsafe-inline'", () => {
    // The trap the measurement round hit: a nonce present makes browsers IGNORE 'unsafe-inline', so a policy
    // carrying both is silently still nonce-only. Whichever pane relaxes styles must DROP the nonce.
    for (const p of PANES) {
      const csp = cockpitPaneCsp(p, A);
      const inline = csp.includes("'unsafe-inline'");
      const nonced = csp.includes(`nonce-${A.styleNonce}`);
      assert.ok(!(inline && nonced), `${p} has both a style nonce and 'unsafe-inline' — the latter is ignored`);
    }
  });

  it("is pure", () => {
    assert.equal(cockpitPaneCsp("source", A), cockpitPaneCsp("source", A));
  });
});
