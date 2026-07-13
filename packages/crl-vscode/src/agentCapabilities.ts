// #210 editor agent Todo D (disc 241, disc 239 peer contract) — the CAPABILITY REGISTRY: the pure, context-filtered "what can
// I do here" surface. A static list of descriptors, each declaring its CONTEXT filter (`isAvailable`) + how a badge click
// ACTIVATES it. The host renders the available badges in the composer + wires the clicks; the agent's tools do the actual
// work. PURE (type-only import, no `vscode`, no fetch) so it's node-testable — the drift-proof separation the KE work taught:
// discovery (this list) is decoupled from the actions (the agent's tools + the bridge). The `/` searchable palette is a later
// slice (deferred at 2 capabilities — disc 241 D6).
import type { CockpitAppState } from "./cockpitAgentBridge";

/** How a capability badge activates when clicked. `prompt` SENDS the text to the agent (a one-click intent — the agent routes
 *  it to a tool, e.g. opening the flag drawer). `fillInput` PREFILLS the composer and lets the validator complete it (used
 *  when the intent still needs a value the badge can't carry — e.g. the verdict — so a click doesn't force a clarify
 *  round-trip through the model). A future `command` kind (a direct host action, bypassing the model) is intentionally NOT
 *  added yet — no capability needs it at this slice. */
export type CapabilityActivation =
  | { kind: "prompt"; text: string }
  | { kind: "fillInput"; text: string };

/** A single agent capability descriptor. `isAvailable` is the CONTEXT filter (drives the badge set from the live app-state);
 *  `activation` yields the click behavior (a function of the state so it can embed the current case/target label). */
export interface AgentCapability {
  id: string;
  /** The badge text, e.g. "Flag this". */
  label: string;
  isAvailable(state: CockpitAppState | undefined): boolean;
  activation(state: CockpitAppState | undefined): CapabilityActivation;
}

/** A capability resolved against the current state — what the host posts to the webview (JSON-serializable). */
export interface ResolvedCapability {
  id: string;
  label: string;
  activation: CapabilityActivation;
}

export const AGENT_CAPABILITIES: AgentCapability[] = [
  {
    // Flag = `prompt`: a click opens the flag drawer (which IS the target-disambiguation + missing-field elicitation surface),
    // so sending "Flag this node." and letting the agent's flag tool route it is the right one-click intent (disc 241 D1/I7).
    id: "flag",
    label: "Flag this",
    isAvailable: (s) => (s?.flagTargets.length ?? 0) > 0,
    activation: () => ({ kind: "prompt", text: "Flag this node." }),
  },
  {
    // Verdict = `fillInput`: the intent needs a VALUE (pass/fail/pending) the badge can't carry, so a bare "Set verdict"
    // prompt would force a clarify round-trip through the model (2 model calls to do what a native quick-pick does in zero —
    // disc 241 I6). Prefilling "Set the verdict for <case> to " lets the validator type the word + send, so the agent calls
    // set_verdict with a STATED verdict (never guessing — disc 241 D3/I5).
    id: "verdict",
    label: "Set verdict",
    isAvailable: (s) => !!s?.selectedCase,
    activation: (s) => ({ kind: "fillInput", text: `Set the verdict for ${s?.selectedCase?.label ?? "the selected case"} to ` }),
  },
];

/** The capabilities available in the current context, resolved to their click behavior — the badge row the host renders. */
export function availableCapabilities(state: CockpitAppState | undefined): ResolvedCapability[] {
  return AGENT_CAPABILITIES.filter((c) => c.isAvailable(state)).map((c) => ({ id: c.id, label: c.label, activation: c.activation(state) }));
}
