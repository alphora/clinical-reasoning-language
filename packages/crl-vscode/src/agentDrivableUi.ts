// #210 editor agent — the "CRL Assist–ready UI" CONTRACT (disc 239). The FIRST-CLASS, reusable definition that makes a
// cockpit UI agent-drivable: the agent OPENS it prefilled + focused, the human COMPLETES it in the app, and it RESOLVES
// with an outcome that flows back to the agent as a tool result. Every cockpit UI built "CRL Assist–ready" implements this;
// the flag drawer is the reference implementation, and the host's blocking-elicitation machinery (agentChat.withElicitation)
// drives ANY implementer unchanged (Todo D's disambiguation quick-pick + future dialogs conform to the same interface).
//
// PURE (no `vscode`) so it's the shared vocabulary across the host + the cockpit + tests.
//
// INVARIANTS (documented here, enforced by the implementers):
//   - SINGLE ACTIVE ELICITATION. The host tracks one `eliciting` at a time + a one-action-per-turn guard; a UI must not
//     assume it can nest a second elicitation inside its own. (Re-entrancy is out of scope until a Todo-D consumer needs it.)
//   - SETTLE EXACTLY ONCE. `open`'s promise MUST settle on EVERY terminal path — the human completing or cancelling, the
//     turn's cancellation `token` firing (Stop/Clear), the UI being replaced/disposed, or a policy retarget/reset — so the
//     agent NEVER hangs. Implementers route every terminal through one idempotent settle choke-point.
//   - PURPLE AFFORDANCE. Agent-driven affordances (a focus ring, the chat's static banner) use the CRL Assist accent
//     (`--vscode-charts-purple`, with a theme fallback), NOT VS Code's native blue — so "the agent is asking" reads as a
//     distinct, on-brand signal.

/** A structural cancellation token (the shape of `vscode.CancellationToken`) — lets the pure contract + implementers accept
 *  one without importing `vscode`. Mirrors `agentTypes.CancelToken`; redeclared to keep this module dependency-free. */
export interface CancelToken {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): { dispose(): void };
}

/** What the agent asks a UI to elicit: the seed values it already has + which element to ring (in purple) + a short,
 *  purpose-specific line for the chat's static banner ("Fill out the description to flag BMI Qualifies"). `focus` is only a
 *  TIE-BREAKER — the UI authoritatively derives the ring from its own live field state (never rings a filled field). */
export interface ElicitationRequest<Prefill> {
  prefill: Prefill;
  /** A UI-defined element id (e.g. a field key, or "submit") — a HINT among equally-valid targets, not an override. */
  focus?: string;
  /** Model-authored, short (bounded by the tool schema) — rendered into the validator's own chat banner. */
  purpose: string;
}

/** Why a driven UI settled as cancelled — for logs/tests + the tool result (the agent collapses most to "cancelled"). */
export type ElicitationCancelReason =
  | "cancelled" // the human clicked Cancel
  | "stopped" // the turn's token fired (Stop/Clear) — the UI is left as-is (e.g. the drawer stays open to finish later)
  | "replaced" // a new elicitation superseded this one
  | "retarget" // the policy/mode changed underneath
  | "disposed"; // the UI (or its host pane) was torn down

/** How a driven UI settles — flows back to the agent as the tool_result. `completed` iff the human finished it in the app
 *  (e.g. filed the flag); `error` is either a synchronous guard failure (no UI shown — recoverable, the agent may retry) OR
 *  a shown UI that terminated with a filing/write failure (the agent surfaces the reason; either way it may retry). */
export type ElicitationOutcome<Result> =
  | { status: "completed"; result: Result }
  | { status: "cancelled"; reason: ElicitationCancelReason }
  | { status: "error"; reason: string };

/** A cockpit UI the CRL Assist agent can drive. The reference implementer is the flag drawer (`bridge.beginFlagDrawer`);
 *  the host's `withElicitation` drives any implementer. `open` returns a promise honoring the SETTLE-EXACTLY-ONCE invariant. */
export interface AgentDrivableUI<Prefill, Result> {
  open(req: ElicitationRequest<Prefill>, token: CancelToken): Promise<ElicitationOutcome<Result>>;
}

/** The host's view of an in-flight elicitation (drives the chat's static banner). `turnGen` is the owning turn's gen so a
 *  stale blocked turn resolving after a Clear + a new turn can't clear the NEW banner (ownership guard). */
export interface ActiveElicitation {
  turnGen: number;
  purpose: string;
}
