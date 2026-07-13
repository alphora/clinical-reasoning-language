// #210 editor agent Todo C — the SEAM between the Medical-Validation cockpit (a 3463-line closure that exposes no host
// object) and the CRL Assist agent. A module-level singleton the cockpit POPULATES on registration and CLEARS on dispose;
// the agent's app-state tool + the chat pane's selected-item chip read it. It carries a live-derived app-state snapshot
// (never cached — the cockpit's `getAppState` reads its own live closures at call time) + a push event so the chip refreshes
// (A16), and the ONE flag-drawer action seam (`openFlagDrawer`) with a tree-pane guard (A6). Target ids are DETERMINISTIC
// (a stable hash of the target identity — A13/B5), so a re-mint on any chip refresh is idempotent and an id survives until
// the target itself genuinely changes.
import * as vscode from "vscode";
import type { CancelToken, ElicitationOutcome } from "./agentDrivableUi";

/** A flaggable target the agent can name, as surfaced to the model (opaque `id` + human labels — never the raw identity). */
export interface FlagTargetView {
  id: string;
  /** The full label incl. an occurrence signature (the drawer hover title). */
  label: string;
  /** The short human header ("this condition" / the concept / the decision). */
  shortLabel: string;
}

/** The cockpit app-state the agent perceives. `undefined` (from `getAppState`) means no MV cockpit is open. */
export interface CockpitAppState {
  /** The open policy (a `.cel` basename), or undefined. */
  policy: string | undefined;
  /** The concise chip label of the current FLAG ANCHOR ("condition (BMI Qualifies)"), or null if none/stale. */
  anchorLabel: string | null;
  /** The chip HOVER: the full node path as a bulleted vertical list (each signature segment on its own line). */
  anchorTitle: string | null;
  /** The flag targets the anchor offers (a `when` offers the concept + this condition; a decision root just the decision). */
  flagTargets: FlagTargetView[];
  /** False when the MV tree pane is hidden/closed — then no node can be perceived or flagged (surfaced honestly, A6/B7). */
  treePaneOpen: boolean;
}

export interface OpenFlagDrawerArgs {
  targetId: string;
  /** A `validation-concern` `kind` — validated against the registry enum by the cockpit before prefilling. */
  validationKind?: string;
  summary?: string;
  /** The fuller concern text → the flag's GitHub issue body (the drawer's Description field). */
  description?: string;
}
/** The result of an AGENT submit (#210 Todo C) — `ok` = the flag was written; `message` is the human-readable outcome
 *  (issue created / no issue + reason) the agent reports back in chat. On failure, `issued` = a GitHub issue was ALREADY
 *  created before the write failed, so the caller must NOT retry (a retry would POST a duplicate issue). */
export type SubmitFlagResult = { ok: true; message: string } | { ok: false; reason: string; issued?: boolean };

/** The `completed` payload of a driven flag drawer — the human filed it; `message` is the outcome the agent relays. */
export interface FlagDrawerResult {
  message: string;
}
/** The BLOCKING elicitation (disc 239): the agent opens the drawer prefilled; the human completes/cancels it; it settles
 *  with an `ElicitationOutcome`. TWO-PHASE — a SYNC guard returns `{error}` immediately (no UI/banner) OR a successful open
 *  returns `{wait, purpose}` — the promise the host awaits + the COCKPIT-DERIVED banner line (the host doesn't guess it; the
 *  cockpit knows what field is empty + the target). The agent supplies NO focus/purpose — the drawer auto-derives both. */
export type BeginFlagDrawer =
  | { error: string }
  | { wait: Promise<ElicitationOutcome<FlagDrawerResult>>; purpose: string };

/** What the cockpit implements + hands to the bridge. Both read the cockpit's LIVE closures at call time. */
export interface CockpitAgentHooks {
  getAppState(): CockpitAppState | undefined;
  /** Open the flag drawer as a BLOCKING elicitation — the resolver is installed here (ONLY here, not on the human right-click
   *  or the autonomous submit). Settles on every terminal path (Insert-filed / Cancel / token / retarget / dispose / replace). */
  beginFlagDrawer(args: OpenFlagDrawerArgs, token: CancelToken): BeginFlagDrawer;
  /** Fill AND submit the flag autonomously — writes it into the .crl + opens a GitHub issue (reuses the human Insert path).
   *  Settles any pending elicitation `{replaced}` first (it shares the singleton drawer). */
  submitFlag(args: OpenFlagDrawerArgs): Promise<SubmitFlagResult>;
  /** The registry's `validation-concern` `kind` enum values (source of truth) — for the tool schema + the prompt hint. */
  getValidationKinds(): string[];
}

/** A DETERMINISTIC opaque id for a flag target — a stable djb2 hash of its identity `{cel, kind, lib, name, key}`. Same
 *  target ⇒ same id across re-mints (idempotent chip refreshes, B5); the id changes only when the target genuinely changes
 *  (e.g. an occurrence signature regenerates on rebuild), which correctly invalidates a stale id → the tool re-resolves and
 *  returns a fresh snapshot. Opaque (not the parseable `kind:lib:name:key` string that would collide with CRL grammar). */
export function flagTargetId(parts: { cel: string | undefined; kind: string; lib: string; name: string; key?: string }): string {
  const s = `${parts.cel ?? ""}|${parts.kind}|${parts.lib}|${parts.name}|${parts.key ?? ""}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return "t" + h.toString(36);
}

class CockpitAgentBridge {
  private hooks: CockpitAgentHooks | undefined;
  private readonly emitter = new vscode.EventEmitter<void>();
  /** Fires whenever the app-state may have changed (selection/anchor, policy, mode, tree-pane, or a cockpit close). */
  readonly onDidChangeAppState = this.emitter.event;

  /** The cockpit registers its live hooks; the returned Disposable clears them (and fires, so the chip drops to "no
   *  cockpit"). Registering supersedes any prior registration. */
  register(hooks: CockpitAgentHooks): vscode.Disposable {
    this.hooks = hooks;
    this.emitter.fire();
    return {
      dispose: () => {
        if (this.hooks === hooks) {
          this.hooks = undefined;
          this.emitter.fire();
        }
      },
    };
  }

  /** The cockpit calls this after any change that affects the app-state (anchor set, policy/mode switch, tree-pane change). */
  notifyChanged(): void {
    this.emitter.fire();
  }

  /** The current app-state, or undefined when no MV cockpit is open. Live-derived by the cockpit hook (never cached). */
  getAppState(): CockpitAppState | undefined {
    return this.hooks?.getAppState();
  }

  /** The `validation-concern` kind enum (from the live registry), or [] when no cockpit is registered. */
  getValidationKinds(): string[] {
    return this.hooks?.getValidationKinds() ?? [];
  }

  /** Open the flag drawer as a BLOCKING elicitation (disc 239). Two-phase: `{error}` synchronously when it can't open (no
   *  cockpit / no tree pane / stale target / bad kind — the tool turns it into a recoverable isError, no banner shown), else
   *  `{wait}` — the promise the host awaits (showing the static banner) until the human resolves the drawer. */
  beginFlagDrawer(args: OpenFlagDrawerArgs, token: CancelToken): BeginFlagDrawer {
    if (!this.hooks) return { error: "the Medical Validation cockpit is not open — open it first" };
    return this.hooks.beginFlagDrawer(args, token);
  }

  /** Fill AND submit the flag — writes the flag into the .crl + opens a GitHub issue. Used ONLY on an explicit submit/file
   *  command (`openFlagDrawer` is the default). Returns the human outcome for the agent to relay, or an actionable reason. */
  async submitFlag(args: OpenFlagDrawerArgs): Promise<SubmitFlagResult> {
    if (!this.hooks) return { ok: false, reason: "the Medical Validation cockpit is not open — open it first" };
    return this.hooks.submitFlag(args);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}

/** The process-wide singleton (the cockpit + the agent are both single-instance in a window). */
export const cockpitAgentBridge = new CockpitAgentBridge();
