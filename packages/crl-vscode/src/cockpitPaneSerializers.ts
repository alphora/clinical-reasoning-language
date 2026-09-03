// Reclaim (and discard) cockpit/Medical-Validation webview panels that VS Code restores after a window reload.
//
// THE BUG THIS FIXES. Webview tabs outlive a window reload. An extension can only take ownership of a restored
// one by registering a WebviewPanelSerializer for its view type; without one the tab comes back carrying the
// TITLE and COLUMN it had when the window closed, and the extension has no `views` entry for it. That matters
// because `reconcilePaneOrder` disposes by iterating what it owns:
//
//     for (const pane of [...views.keys()]) if (!paneOrder.includes(pane)) views.get(pane)?.panel.dispose();
//
// A restored tab is invisible to that loop, so it can never be disposed however the setting changes. The
// symptom is a pane the user did not ask for, sitting in a column the panel wants for something else — e.g.
// paneOrder `[source, fhirQuestionnaire, tree]` presenting a stale "Medical Validation - CRL Questionnaire".
// It survives every settings edit and looks exactly like the setting being ignored, which is the one thing the
// settings-are-the-source-of-truth contract promises cannot happen.
//
// WHY DISCARD RATHER THAN ADOPT. Adopting a restored panel would mean rebuilding its shell HTML, message
// handlers, coordinator registration and render generation from a serialized blob — reconstructing state the
// panel itself no longer carries, since `retainContextWhenHidden` does not survive a reload either. The panel
// set is CHEAP and fully derived: `paneOrder` plus `paneVisibility` say exactly which panes should exist, and
// the panel opens them on demand. So the correct reclaim is to take ownership and immediately dispose, leaving
// settings authoritative on every start. A user who had the panel open re-opens it with one command.
//
// Registration must happen during `activate()`, before VS Code attempts restoration, and for EVERY pane view
// type — a view type with no serializer is exactly the ghost described above.
import * as vscode from "vscode";

import { ALL_PANES, cockpitViewType } from "./paneOrder";

/**
 * Register a disposing serializer for every cockpit pane view type. Returns nothing; the registrations are
 * pushed onto `context.subscriptions`.
 *
 * `onRestored` is called with each reclaimed pane — used only by tests and diagnostics; production passes
 * nothing.
 */
export function registerCockpitPaneSerializers(
  context: vscode.ExtensionContext,
  onRestored?: (pane: string) => void,
): void {
  for (const pane of ALL_PANES) {
    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer(cockpitViewType(pane), {
        // eslint-disable-next-line @typescript-eslint/require-await
        async deserializeWebviewPanel(panel: vscode.WebviewPanel): Promise<void> {
          onRestored?.(pane);
          // Take ownership, then drop it. The panel set is rebuilt from settings when the panel is next shown.
          panel.dispose();
        },
      }),
    );
  }
}
