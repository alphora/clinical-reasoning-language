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
  const marker = "m.type==='fhirQuestionnaire'";
  const start = COCKPIT_WEBVIEW_SCRIPT.indexOf(marker);
  assert.ok(start > 0, "the fhirQuestionnaire branch is missing from the webview script");
  const next = COCKPIT_WEBVIEW_SCRIPT.indexOf("m.type===", start + marker.length);
  return COCKPIT_WEBVIEW_SCRIPT.slice(start, next > 0 ? next : undefined);
})();

describe("fhirQuestionnaire webview branch", () => {
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

  it("distinguishes NO CASE SELECTED from NO DATA FOUND", () => {
    // These are different states and were previously one message. "No data" is the normal state until the
    // producer (#277) exists, so conflating them would read as a bug in the pane rather than absent artifacts.
    assert.ok(branch.includes("if(!m.label)"), "no branch for the nothing-selected case");
    assert.match(branch, /Select a case to see its FHIR questionnaire\./);
    assert.ok(branch.includes("if(!m.q)"), "no branch for the absent-questionnaire case");
    assert.match(branch, /Could not find FHIR Questionnaire data for this case\./);
  });

  it("says WHERE it looked when no data was found", () => {
    // Without the path, "could not find" is unactionable — the whole point is that the reader can go check.
    assert.match(branch, /Looked for: '\+m\.lookedFor/);
  });

  it("shows the case header on both the success and failure paths", () => {
    // Mirrors the CRL Questionnaire pane's header so the two panes read as the same case side by side.
    const heads = branch.match(/head\('Case - '\+m\.label\)/g) ?? [];
    assert.ok(heads.length >= 2, `case header should appear on failure AND success paths, found ${heads.length}`);
  });

  it("wraps the mount so a throw cannot leave a silently blank pane", () => {
    assert.ok(branch.includes("catch(e)"), "mount is not wrapped");
    assert.ok(branch.includes("Could not render the questionnaire: "), "a throw produces no visible message");
  });
});
