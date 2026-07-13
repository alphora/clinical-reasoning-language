// #210 editor agent Todo C — the "add-flag skill": the CRL Assist system prompt, the per-turn app-state injection, and the
// flag tool specs. PURE (no vscode) so it's node-testable; agentChat.ts composes it with the live bridge state. Thin by
// design (A9/A11 of the plan): the KNOWLEDGE is the injected app-state + the tool schema; the heavier editor_kit /
// user-guide knowledge is Todo D. The agent DEFAULTS to proposing (open the drawer prefilled for the validator to submit)
// and FILES on an explicit submit command (writes the flag + opens an issue) — either way it never hand-edits CRL text;
// the cockpit's flag machinery writes it.
import type { ToolSpec } from "./agentTypes";
import type { CockpitAppState } from "./cockpitAgentBridge";

export const OPEN_FLAG_DRAWER = "open_flag_drawer";
export const SUBMIT_FLAG = "submit_flag";

/** Fallback kinds for the tool schema when no cockpit is registered (so the schema is still meaningful). The bridge
 *  validates AUTHORITATIVELY against the live registry — this list is only the schema hint. */
export const DEFAULT_VALIDATION_KINDS = ["underspecified", "narrative-error", "intent-divergence", "context-conflict"];

const BASE_PROMPT =
  "You are CRL Assist, an assistant embedded in the CRL Medical Validation cockpit. You help a clinical validator review " +
  "Clinical Reasoning Language (CRL) decision logic against the source policy and raise review flags on the parts that need " +
  "attention.\n\n" +
  "You help the validator raise review flags (you never hand-edit CRL — the cockpit writes the flag). Two tools:\n" +
  `- ${OPEN_FLAG_DRAWER} is the DEFAULT: fill the flag drawer prefilled, then STOP and tell the validator to review and ` +
  "submit it themselves.\n" +
  `- ${SUBMIT_FLAG} fills AND submits — writes the flag into the .crl source and opens a GitHub issue. Use it ONLY when the ` +
  `validator EXPLICITLY tells you to submit/file (e.g. "flag this and submit", "file it"). If they didn't say to submit, ` +
  `use ${OPEN_FLAG_DRAWER} and let them submit.\n\n` +
  "Guidance:\n" +
  "- If the request is MISSING information you need (a clear one-line summary, the fuller description, or which target), ASK " +
  "the validator for it in chat first — then fill the flag.\n" +
  `- When you ${SUBMIT_FLAG}, state plainly what you're filing first (e.g. "Filing a flag on <target>: <summary>") — it ` +
  "writes source + opens an issue.\n" +
  "- The FLAG ANCHOR in the [cockpit] block is the last flag-capable node the validator clicked in the tree. It may differ " +
  "from what they are currently looking at — if their request seems to reference a different node, say so and ask them to " +
  "click it.\n" +
  "- `summary` is the one-line title; `description` is the fuller concern (the issue body). Fill `description` from what the " +
  "validator tells you. Add the concern `kind` when it's clear.\n" +
  "- Pick the flag target that matches the concern (a whole decision, a concept's every use, or one condition/recommendation).\n" +
  "- Be concise.";

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
    lines.push(`Flag targets (pass a target_id to ${OPEN_FLAG_DRAWER} / ${SUBMIT_FLAG}):`);
    for (const t of state.flagTargets) lines.push(`  - id="${t.id}" — ${t.label}`);
  }
  return lines.join("\n");
}

/** The full system prompt for a turn: the base skill + the live app-state block. */
export function buildSystemPrompt(state: CockpitAppState | undefined): string {
  return BASE_PROMPT + appStateBlock(state);
}

/** The shared property set for both flag tools. `validation_kind` is enumerated from the live registry (else the constant). */
function flagProps(validationKinds: string[]): Record<string, unknown> {
  const kinds = validationKinds.length ? validationKinds : DEFAULT_VALIDATION_KINDS;
  return {
    target_id: { type: "string", description: "The id of the flag target (from the [cockpit] flag-targets list)." },
    validation_kind: { type: "string", enum: kinds, description: "The kind of validation concern, when it is clear." },
    summary: { type: "string", description: "A one-line summary of the concern (becomes the issue title + the flag gist)." },
    description: { type: "string", description: "The fuller concern text (becomes the flag's GitHub issue body). Fill this from what the validator tells you." },
  };
}

/** The `open_flag_drawer` tool (the DEFAULT) — opens the drawer prefilled for the validator to review + submit themselves. */
export function openFlagDrawerTool(validationKinds: string[]): ToolSpec {
  return {
    name: OPEN_FLAG_DRAWER,
    description:
      "The DEFAULT flag action: open the review-flag drawer in the Medical Validation cockpit, prefilled, then let the " +
      "validator review and submit it. Fill summary/description/kind from what they told you. Pass the target_id from the " +
      "[cockpit] flag-targets list. Use this whenever the validator did NOT explicitly ask you to submit/file.",
    inputSchema: { type: "object", properties: flagProps(validationKinds), required: ["target_id"] },
  };
}

/** The `submit_flag` tool — fills AND submits: writes the flag into the .crl + opens a GitHub issue. Use ONLY on an explicit
 *  submit/file command. Requires a `summary` (the flag's gist / the issue title). Ask for any missing info first. */
export function submitFlagTool(validationKinds: string[]): ToolSpec {
  return {
    name: SUBMIT_FLAG,
    description:
      "File a review flag: write it into the .crl source AND open a GitHub issue, in one step. Use this ONLY when the " +
      `validator EXPLICITLY asked to submit/file (otherwise use ${OPEN_FLAG_DRAWER} and let them submit). Requires ` +
      "target_id + a one-line summary; include the description + kind when known. Ask for anything missing first, and state " +
      "what you're filing before you call this.",
    inputSchema: { type: "object", properties: flagProps(validationKinds), required: ["target_id", "summary"] },
  };
}
