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

/** The review case currently selected in the cockpit (the `set_verdict` target). Tree-INDEPENDENT — a verdict works with just
 *  the worklist pane open. `token` is an OPAQUE, cel-embedded id (like `flagTargetId`) the agent passes back to `set_verdict`;
 *  the bridge re-resolves it against the LIVE reviewable set, so a selection that moved (or a cross-policy retarget) is
 *  rejected rather than writing the wrong case (disc 241 C2). Non-null ONLY for a live reviewable cel selection (disc 241 I1). */
export interface SelectedCaseView {
  token: string;
  /** The human case label ("Patient A — BMI 42"). */
  label: string;
  /** The current verdict, humanized ("To do" / "Pending" / "Pass" / "Fail"). */
  verdictLabel: string;
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
  /** The selected review case (the `set_verdict` target), or null when no live reviewable case is selected (disc 241). */
  selectedCase: SelectedCaseView | null;
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

/** #210 Todo D (disc 241) — the args the agent passes to `set_verdict`. `caseToken` is the OPAQUE cel-embedded id from the
 *  [cockpit] selected-case line (NOT a raw caseId — the cockpit re-resolves it against the live set); `verdict` is the raw
 *  state string ("pass"/"fail"/"pending"/"unreviewed"), validated by the cockpit against the known ReviewState set. */
export interface SetVerdictArgs {
  caseToken: string;
  verdict: string;
}
/** The result of a `set_verdict` — `ok` + a human outcome ("Patient A → Pass"), or an actionable reason (no case matches /
 *  bad verdict / save failed) the agent relays + can act on (recoverable). A pure synchronous write (no external I/O). */
export type SetVerdictResult = { ok: true; message: string } | { ok: false; reason: string };

/** #210 Todo D slice 2 — the READ-ONLY review context the "where do we stand" synthesis reasons over. Assembled by the
 *  cockpit from the policy under review; purpose-bound (no args — the agent can't point it elsewhere). Text is CAPPED at
 *  assembly (this whole object is COMMITTED to the model context + re-sent every following turn). */
export interface ReviewContextCase {
  label: string;
  /** the engine run status for the case (e.g. the scenario's disposition/status), or "" if unknown. */
  runStatus: string;
  /** the review verdict: "To do" | "Pending" | "Pass" | "Fail". */
  verdict: string;
}
export interface ReviewContextFlag {
  status: string; // "open" | "resolved" | …
  scope: string; // "concept" | "decision" | "library"
  target: string; // the concept/decision/library name
  concern: string; // the flag body/gist (the reviewer's note)
  /** the linked GitHub issue number, or null (no `; ref` / a non-numeric ref). */
  issue: number | null;
}
/** One flag-linked issue, best-effort. `title`/`body`/`state` present on `ok`; `reason` on failure ("issue not found" /
 *  "timed out" / "not signed in" / …). Issue text is UNTRUSTED third-party input (anyone can file an issue). */
export interface ReviewContextIssue {
  number: number;
  ok: boolean;
  title?: string;
  body?: string;
  state?: string;
  /** true when the ref pointed at a PR, not an issue (the GET returns PRs) — so the synthesis can say so. */
  isPullRequest?: boolean;
  reason?: string;
}
export interface ReviewContext {
  policy: string;
  sourceText: string;
  sourceTruncated: boolean;
  crlText: string;
  crlTruncated: boolean;
  /** per-file CRL read/parse failures (an unknown-source blocker — the synthesis must not invent a path around it). */
  crlErrors: string[];
  status: {
    progress: { total: number; passed: number; failed: number; pending: number; unreviewable: number; stale: number };
    mvComplete: boolean;
    cases: ReviewContextCase[];
    flags: ReviewContextFlag[];
    /** a source (an unparseable `.crl`, OR a corrupt `.crl/flags/` store record) left the flag set UNKNOWN (mvComplete stays open). */
    flagStateError: boolean;
    /** flags whose `; ref` was non-numeric (disc/spec/cross-repo) → not openable here (so the synthesis doesn't say "no issues"). */
    unresolvedRefs: number;
  };
  /** the deduped flag-linked issues, best-effort (UNTRUSTED text). */
  issues: ReviewContextIssue[];
  /** why issues are absent/partial ("workspace not trusted" / "not signed in" / "no GitHub origin"), or undefined. */
  issuesNote?: string;
}
/** `ok` + the context, or an actionable reason (no cockpit / no model / policy changed mid-read) the agent relays. */
export type ReviewContextResult = { ok: true; context: ReviewContext } | { ok: false; reason: string };

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
  /** #210 Todo D (disc 241) — set a case's review verdict. Re-resolves the opaque `caseToken` → the live caseId (rejects a
   *  moved selection / cross-policy retarget), then reuses the cockpit's guarded verdict persist path (`applyVerdict` — MV +
   *  sidecar guarded, memory-committed-only-after-disk, re-drives the worklist/tree/mvComplete chrome). Synchronous (no I/O). */
  setVerdict(args: SetVerdictArgs): SetVerdictResult;
  /** #210 Todo D slice 2 — assemble the READ-ONLY review context for the policy under review (CRL + source + status + the
   *  flag-linked GitHub issues). Purpose-bound (no args). Async (bundles a best-effort issue fetch under ONE captured cel);
   *  the `token` aborts a hung GET so it can't strand the agent turn. Hard `isTrusted` gate + silent GitHub auth inside. */
  readReviewContext(token: CancelToken): Promise<ReviewContextResult>;
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

/** #210 Todo D (disc 241) — a DETERMINISTIC opaque id for a review case, embedding the policy `cel` so a DIFFERENT policy
 *  hashes to a DIFFERENT token (a cross-policy retarget can't collide onto the same case — disc 241 C2). The bridge injects
 *  it into the [cockpit] block; the agent passes it to `set_verdict`; the cockpit re-resolves it by hashing each LIVE
 *  reviewable caseId under the CURRENT cel and matching — a moved selection / stale token simply finds no match. The "c"
 *  prefix keeps it disjoint from a flag target's "t" id. Same shape as `flagTargetId` (djb2). */
export function caseTokenId(cel: string | undefined, caseId: string): string {
  const s = `${cel ?? ""}|${caseId}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return "c" + h.toString(36);
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

  /** #210 Todo D (disc 241) — set a case's verdict via the cockpit's guarded persist path. Synchronous. `{ok:false}` when no
   *  cockpit is open OR the cockpit rejects (moved selection / bad verdict / save failure) — the tool surfaces it recoverably. */
  setVerdict(args: SetVerdictArgs): SetVerdictResult {
    if (!this.hooks) return { ok: false, reason: "the Medical Validation cockpit is not open — open it first" };
    return this.hooks.setVerdict(args);
  }

  /** #210 Todo D slice 2 — the read-only review context for the open policy (for the "where do we stand" synthesis). */
  async readReviewContext(token: CancelToken): Promise<ReviewContextResult> {
    if (!this.hooks) return { ok: false, reason: "the Medical Validation cockpit is not open — open it first" };
    return this.hooks.readReviewContext(token);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}

/** The process-wide singleton (the cockpit + the agent are both single-instance in a window). */
export const cockpitAgentBridge = new CockpitAgentBridge();
