// String tests for the $apply-questionnaire branch of COCKPIT_WEBVIEW_SCRIPT.
//
// The script is extracted as a pure string precisely so its channel invariants can be pinned without a webview.
// The invariants here are the ones whose violation is SILENT — a blank pane with no error, which is the failure
// mode this whole feature has hit repeatedly (missing Zone.js, unnonced <link>, scripts via innerHTML).
import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { COCKPIT_WEBVIEW_SCRIPT } from "./correspondenceCockpit.ts";

/**
 * The branch body, isolated from the rest of the handler chain.
 *
 * Sliced to the NEXT `m.type===` test rather than by a fixed length: a fixed window runs into neighbouring
 * handlers, and since those legitimately assign `m.html`, the data-only assertion below would read their code
 * and fail on it. (It did.)
 */
const branch = (() => {
  const marker = "m.type==='applyQuestionnaire'";
  const start = COCKPIT_WEBVIEW_SCRIPT.indexOf(marker);
  assert.ok(start > 0, "the applyQuestionnaire branch is missing from the webview script");
  const next = COCKPIT_WEBVIEW_SCRIPT.indexOf("m.type===", start + marker.length);
  return COCKPIT_WEBVIEW_SCRIPT.slice(start, next > 0 ? next : undefined);
})();

describe("applyQuestionnaire webview branch", () => {
  it("is DATA-ONLY — it never assigns m.html anywhere", () => {
    // A fragment carrying <script> would be inert (innerHTML does not execute scripts) and re-rendering would
    // tear down the mounted form. The whole design turns on this pane not receiving html.
    assert.ok(!/innerHTML\s*=\s*m\.html/.test(branch), "branch assigns m.html — it must be data-only");
    assert.ok(!branch.includes("m.html"), "branch references m.html at all");
  });

  it("guards remount on the render identity", () => {
    // Every cockpit re-render (rebuild/applyShowKeys/renderEmpty) reaches every pane. Without this guard an
    // unrelated render would remount a 1.85 MB Angular app and discard in-progress answers.
    assert.match(branch, /m\.key===window\.__aqKey\)return/);
  });

  it("fails LOUDLY when the runtime is missing, rather than painting nothing", () => {
    assert.ok(branch.includes("typeof LForms==='undefined'"), "no guard for a missing LForms runtime");
    assert.ok(branch.includes("The LForms runtime did not load."), "missing runtime produces no visible message");
  });

  it("detects the silent no-paint case", () => {
    // addFormToPage can resolve without painting when the item tree is unrecognised; Angular Elements also
    // upgrades asynchronously, so a single-frame check would report a false zero.
    assert.match(branch, /getBoundingClientRect\(\)\.height>0/);
    assert.ok(branch.includes("The questionnaire did not render."), "no message for the empty-mount case");
  });

  it("renders a placeholder when no case is focused", () => {
    assert.ok(branch.includes("if(!m.q)"), "no branch for the absent-questionnaire case");
    assert.match(branch, /Select a case to see its \$apply questionnaire\./);
  });

  it("wraps the mount so a throw cannot leave a silently blank pane", () => {
    assert.ok(branch.includes("catch(e)"), "mount is not wrapped");
    assert.ok(branch.includes("Could not render the questionnaire: "), "a throw produces no visible message");
  });
});
