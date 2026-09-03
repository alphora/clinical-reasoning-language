// A restored webview tab the extension does not own can never be disposed by reconcilePaneOrder (which iterates
// only `views`), so it outlives every settings edit and reads as paneOrder being ignored. The guarantee that
// prevents it is coverage: EVERY pane view type must have a serializer, registered during activate.
import assert from "node:assert/strict";
import { describe, it, vi } from "vitest";

vi.mock("vscode", () => {
  const registered = new Map();
  return {
    default: {},
    window: {
      registerWebviewPanelSerializer: (viewType, serializer) => {
        registered.set(viewType, serializer);
        return { dispose: () => registered.delete(viewType) };
      },
    },
    __registered: registered,
  };
});

const vscode = await import("vscode");
const { registerCockpitPaneSerializers } = await import("./cockpitPaneSerializers.ts");
const { ALL_PANES, cockpitViewType } = await import("./paneOrder.ts");

const ctx = () => ({ subscriptions: [] });

describe("registerCockpitPaneSerializers", () => {
  it("registers one serializer for EVERY pane view type", () => {
    // A pane missing here is a ghost tab waiting to happen, and it presents as a stale pane the user cannot
    // close by editing settings.
    const c = ctx();
    registerCockpitPaneSerializers(c);
    for (const pane of ALL_PANES) {
      assert.ok(vscode.__registered.has(cockpitViewType(pane)), `no serializer for pane '${pane}'`);
    }
    assert.equal(c.subscriptions.length, ALL_PANES.length, "every registration must be disposable with the extension");
  });

  it("DISPOSES the restored panel rather than adopting it", () => {
    // Settings are the source of truth for which panes exist. Adopting would resurrect a pane the current
    // paneOrder may not list, and its webview state does not survive a reload anyway.
    const c = ctx();
    const seen = [];
    registerCockpitPaneSerializers(c, (p) => seen.push(p));
    let disposed = false;
    const panel = { dispose: () => (disposed = true) };
    const s = vscode.__registered.get(cockpitViewType("fhirQuestionnaire"));
    return s.deserializeWebviewPanel(panel, undefined).then(() => {
      assert.equal(disposed, true, "the restored panel must be disposed");
      assert.deepEqual(seen, ["fhirQuestionnaire"]);
    });
  });

  it("covers the questionnaire panes specifically — the pair that produced the ghost", () => {
    registerCockpitPaneSerializers(ctx());
    assert.ok(vscode.__registered.has("crlCockpit.questionnaire"));
    assert.ok(vscode.__registered.has("crlCockpit.fhirQuestionnaire"));
  });
});

describe("pane list coherence", () => {
  it("ALL_PANES matches the engine's reveal fan-out set", async () => {
    // These lists are not compiler-checked against the `Pane` union and have already drifted once:
    // fhirQuestionnaire was absent from the engine's PANES, so that pane alone received no reveal effects and
    // never highlighted the selection. Nothing but this test couples them.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./correspondenceEngine.ts", import.meta.url), "utf8"),
    );
    const line = src.match(/^const PANES: Pane\[\] = (\[[^\]]*\]);/m);
    assert.ok(line, "could not find the engine's PANES declaration — update this test if it moved");
    const enginePanes = JSON.parse(line[1].replace(/'/g, '"'));
    assert.deepEqual([...enginePanes].sort(), [...ALL_PANES].sort(), "engine PANES has drifted from ALL_PANES");
  });
});
