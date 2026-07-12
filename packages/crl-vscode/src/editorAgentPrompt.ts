// #210 editor agent Todo C — the "add-flag skill": the CRL Assist system prompt, the per-turn app-state injection, and the
// `open_flag_drawer` tool spec. PURE (no vscode) so it's node-testable; agentChat.ts composes it with the live bridge state.
// Thin by design (A9/A11 of the plan): the KNOWLEDGE is the injected app-state + the tool schema; the heavier editor_kit /
// user-guide knowledge is Todo D. The agent PROPOSES (opens the drawer prefilled) — it never writes CRL.
import type { ToolSpec } from "./agentTypes";
import type { CockpitAppState } from "./cockpitAgentBridge";

export const OPEN_FLAG_DRAWER = "open_flag_drawer";

/** Fallback kinds for the tool schema when no cockpit is registered (so the schema is still meaningful). The bridge
 *  validates AUTHORITATIVELY against the live registry — this list is only the schema hint. */
export const DEFAULT_VALIDATION_KINDS = ["underspecified", "narrative-error", "intent-divergence", "context-conflict"];

const BASE_PROMPT =
  "You are CRL Assist, an assistant embedded in the CRL Medical Validation cockpit. You help a clinical validator review " +
  "Clinical Reasoning Language (CRL) decision logic against the source policy and raise review flags on the parts that need " +
  "attention.\n\n" +
  `You can OPEN A FLAG DRAWER prefilled for the validator by calling the ${OPEN_FLAG_DRAWER} tool — you never write CRL ` +
  "yourself. The drawer opens in the cockpit; the validator reviews, edits, and submits it.\n\n" +
  "Guidance:\n" +
  "- The FLAG ANCHOR in the [cockpit] block is the last flag-capable node the validator clicked in the tree. It may differ " +
  "from what they are currently looking at — if their request seems to reference a different node, say so and ask them to " +
  "click it.\n" +
  "- Capture JUST ENOUGH during the meeting: a one-line summary and, when it's clear, the concern kind. The validator " +
  "fleshes out the details later.\n" +
  "- Pick the flag target that matches the concern (a whole decision, a concept's every use, or one condition/recommendation).\n" +
  "- Be concise. After opening the drawer, tell the validator what you prefilled and ask them to review and submit.";

/** The compact app-state block injected into the system prompt each turn (A9). The chip mirrors the anchor visually. */
export function appStateBlock(state: CockpitAppState | undefined): string {
  if (!state) {
    return "\n\n[cockpit] No Medical Validation cockpit is open — ask the validator to open one (\"CRL: Show Medical Validation\") before flagging.";
  }
  if (!state.treePaneOpen) {
    return `\n\n[cockpit] Policy: ${state.policy ?? "(none)"}. The tree pane is closed — reopen it before a node can be perceived or flagged.`;
  }
  const lines = [`\n\n[cockpit] Policy: ${state.policy ?? "(none)"}.`];
  if (!state.anchorLabel || state.flagTargets.length === 0) {
    lines.push("Flag anchor: none yet — ask the validator to click a decision or condition in the tree.");
  } else {
    lines.push(`Flag anchor: ${state.anchorLabel}.`);
    lines.push(`Flag targets (pass a target_id to ${OPEN_FLAG_DRAWER}):`);
    for (const t of state.flagTargets) lines.push(`  - id="${t.id}" — ${t.shortLabel}`);
  }
  return lines.join("\n");
}

/** The full system prompt for a turn: the base skill + the live app-state block. */
export function buildSystemPrompt(state: CockpitAppState | undefined): string {
  return BASE_PROMPT + appStateBlock(state);
}

/** The `open_flag_drawer` tool spec. `validation_kind` is enumerated from the live registry (falling back to the constant). */
export function openFlagDrawerTool(validationKinds: string[]): ToolSpec {
  const kinds = validationKinds.length ? validationKinds : DEFAULT_VALIDATION_KINDS;
  return {
    name: OPEN_FLAG_DRAWER,
    description:
      "Open the review-flag drawer in the Medical Validation cockpit, prefilled for the validator to review and submit. " +
      "Pass the target_id of the node the validator is focused on (from the [cockpit] flag-targets list). You never write " +
      "CRL — the validator confirms and submits the drawer.",
    inputSchema: {
      type: "object",
      properties: {
        target_id: { type: "string", description: "The id of the flag target (from the [cockpit] flag-targets list)." },
        validation_kind: { type: "string", enum: kinds, description: "The kind of validation concern, when it is clear." },
        summary: { type: "string", description: "A one-line summary of the concern (becomes the issue title + the flag gist)." },
      },
      required: ["target_id"],
    },
  };
}
