// #212 step 4 — the CORE-owned review-flag VOCABULARY + a PURE flag-draft field validator. Flags left `.crl` (they now live as
// structured records under `.crl/flags/`), so their schema — the tags, field rules, aliases, categories, enums, and the human
// MV Type `displayName`s + `mv:*` labels — lives in this first-class core module. It is the SINGLE source of the flag vocabulary
// (AND the MV label set) for the MCP `create_flag`/`set_flag_status` tools, the cockpit drawer, the issue emit, and the
// content-repo label creation. The `.crl` meta-registry (`spec/metadata-registry.json`) stripped its flag entries in v0.3.4, so
// this module is now the sole home (the former 4a equivalence test is gone with them).
//
// PURE by construction: imports only the record model (`mvFlag`) — NEVER the barrel (`../index` would cycle: index → flagVocab
// → index) and never the `.crl` registry/parser.
//
// Two axes, kept orthogonal: `category` = step PROVENANCE (extraction = KE-authoring-time; validation = MV-review-time) — NOT
// "who" (the #210 cockpit agent files validation-category flags autonomously). `tag` = WHAT (the human MV Type, for the four
// `displayName`d validation tags; the AI's finer authoring vocabulary, for the extraction tags). The optional `kind` on
// validation-concern is AI-only finer metadata — descriptive, never gate/label-affecting.
import type { FlagStatus, MvFlagCategory } from "./mvFlag";

export type { FlagStatus } from "./mvFlag"; // re-home point: the flag surfaces import `FlagStatus` from the vocab (or the barrel)

/** A flag FIELD rule (required / enum). Structurally identical to the registry's `FieldRule` — the equivalence test asserts
 *  parity; after 4b this is the sole definition consumed by the cockpit drawer + the pure validator. */
export interface FieldRule {
  key: string;
  required: boolean;
  /** enum values, if the field is an enum; else undefined (free value). */
  values?: readonly string[];
}

/** A flag tag's authoring info (id + category + field rules) — the shape the cockpit drawer + `flagTags()` consume. A
 *  `displayName` marks a tag as a human MV "Type": it is the SINGLE source of the human string for the drawer choice, the
 *  issue-body Type line, and the GitHub-label description (so no surface hand-transcribes it). Tags WITHOUT a `displayName`
 *  (the extraction tags) are AI-authoring-only and never appear in the human drawer. */
export interface FlagTagInfo {
  id: string;
  category: MvFlagCategory;
  /** the human "Type" label; present ⇒ the tag is an MV-drawer Type (absent ⇒ AI-authoring-only, hidden from the drawer). */
  displayName?: string;
  fields: FieldRule[];
}

/** A GitHub label for an MV flag Type — created in each content repo (Todo 4) + attached to the issue at create time
 *  (Todo 3). `flagVocab` is the SINGLE source of truth for the MV label set; the content-repo labels are derived from it. */
export interface FlagLabel {
  /** the label name, e.g. `mv:crl-vs-narrative`. */
  name: string;
  /** 6 hex digits, no leading `#` (GitHub's label color format). */
  color: string;
  description: string;
}

/** A flag target for the create seam (the concept/decision/library the flag is about). Re-homed from `createFlag` (same name
 *  — renaming would be churn for no gain); the MCP tool + the seam signature reference it. */
export interface CreateFlagTarget {
  kind: "concept" | "decision" | "library";
  /** the concept/decision name, or (for kind "library") the library name. */
  name: string;
  /** the declaring library; when omitted, matches regardless (a CRL file declares exactly one library). Ignored for
   *  kind "library" (the library IS the target). */
  library?: string;
}

/** The author-supplied flag draft (tag + gist + extra fields + status) the create seam validates. Re-homed from `createFlag`. */
export interface CreateFlagInput {
  tag: string;
  gist: string;
  /** extra `; key value` fields (e.g. `direction`, `ref`, `assumption`, `key`); registry-required ones are enforced. */
  fields?: Record<string, string>;
  /** the `; status` value; defaults to `open`. */
  status?: string;
}

// ── the vocabulary (the sole home; the registry's flag entries were stripped in v0.3.4) ─────────────────────────────────────
const STATUS: FieldRule = { key: "status", required: false, values: ["open", "resolved"] };
const KEY: FieldRule = { key: "key", required: false };
const REF: FieldRule = { key: "ref", required: false };

/** The internal tag record. `fields` is authoring order (`status` first, then the tag's discriminators, then `ref`). */
interface FlagTagDef {
  id: string;
  aliases: readonly string[];
  category: MvFlagCategory;
  displayName?: string; // present ⇒ a human MV Type (shown in the drawer); absent ⇒ AI-authoring-only
  /** the GitHub label for this MV Type (present iff `displayName` is). `blurb` is the one-line gloss; the label DESCRIPTION is
   *  DERIVED as `${displayName} — ${blurb}`, so the human "CRL vs …" string lives in exactly one place (no drift). */
  label?: { name: string; color: string; blurb: string };
  fields: readonly FieldRule[];
}

const FLAG_TAGS: readonly FlagTagDef[] = [
  {
    id: "customer-confirmable",
    aliases: [],
    category: "extraction",
    fields: [STATUS, { key: "assumption", required: false }, KEY, REF],
  },
  {
    id: "internal-inconsistency",
    aliases: [],
    category: "extraction",
    fields: [STATUS, KEY, REF],
  },
  {
    id: "open-fork",
    aliases: [],
    category: "extraction",
    fields: [STATUS, { key: "chosen", required: false }, { key: "alternatives", required: false }, KEY, REF],
  },
  {
    id: "fidelity-defect",
    aliases: ["over-reach-to-fix", "criterion-drop-to-fix"],
    category: "extraction",
    fields: [STATUS, { key: "direction", required: true, values: ["over-reach", "criterion-drop"] }, KEY, REF],
  },
  // ── the human MV "Type" tags (validation category, `displayName` present → shown in the drawer). All four create a GitHub
  //    issue when a human (or the cockpit agent, for validation-concern) files them; each carries a colocated `mv:*` label.
  {
    id: "validation-concern",
    aliases: [],
    category: "validation",
    displayName: "CRL vs customer intent", // the narrative is right; the CRL isn't what the customer wanted
    label: { name: "mv:crl-vs-intent", color: "5319e7", blurb: "the narrative is right but the CRL isn't what the customer wanted" },
    // `kind` is retained for the AI (the cockpit agent may set a finer flavor); the human drawer HIDES it (Todo 2). NEVER
    // drives a label — the Type (tag) is the authoritative axis, so an agent-set kind can't mislabel the intent issue.
    fields: [STATUS, { key: "kind", required: false, values: ["underspecified", "narrative-error", "intent-divergence", "context-conflict"] }, REF],
  },
  {
    id: "narrative-defect", // NOT "narrative-error" — that name is a `kind` value (validation-concern), kept distinct on purpose
    aliases: [],
    category: "validation",
    displayName: "CRL vs narrative", // the CRL is faithful; the source policy narrative is wrong
    label: { name: "mv:crl-vs-narrative", color: "1d76db", blurb: "the CRL is faithful but the source policy narrative is wrong" },
    fields: [STATUS, REF],
  },
  {
    id: "tooling-bug",
    aliases: [],
    category: "validation",
    displayName: "Tooling bug", // a defect in the CRL tooling itself, hit while validating (anchors to the current node)
    label: { name: "mv:tooling-bug", color: "d73a4a", blurb: "a defect in the CRL tooling, seen while validating" },
    fields: [STATUS, REF],
  },
  {
    id: "other",
    aliases: [],
    category: "validation",
    displayName: "Other", // a concern that doesn't fit the first three — explained in the description
    label: { name: "mv:other", color: "6a737d", blurb: "a concern that doesn't fit the other types (see the issue body)" },
    fields: [STATUS, REF],
  },
];

/** Build the public `FlagLabel` for a tag def whose `label` is present — the description is DERIVED from `displayName` +
 *  `blurb` (single source; ≤100 chars — GitHub's label-description cap). Returns a FRESH object (no registry aliasing). */
function labelOfDef(t: FlagTagDef): FlagLabel | undefined {
  if (!t.label || t.displayName === undefined) return undefined;
  return { name: t.label.name, color: t.label.color, description: `${t.displayName} — ${t.label.blurb}` };
}

const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const t of FLAG_TAGS) {
  ALIAS_TO_CANONICAL.set(t.id, t.id);
  for (const a of t.aliases) ALIAS_TO_CANONICAL.set(a, t.id);
}
const BY_CANONICAL = new Map<string, FlagTagDef>(FLAG_TAGS.map((t) => [t.id, t]));

/** Resolve a raw flag tag id (canonical OR alias) to the canonical id, or undefined if it isn't a flag tag. */
export function canonicalFlagTag(rawTag: string): string | undefined {
  return ALIAS_TO_CANONICAL.get(rawTag);
}

/** Is `rawTag` a registered flag tag (canonical or alias)? */
export function isFlagTag(rawTag: string): boolean {
  return ALIAS_TO_CANONICAL.has(rawTag);
}

function defOf(rawTag: string): FlagTagDef | undefined {
  const canon = ALIAS_TO_CANONICAL.get(rawTag);
  return canon ? BY_CANONICAL.get(canon) : undefined;
}

/** The category (`extraction` | `validation`) for a flag tag (canonical or alias), else undefined. */
export function flagCategoryOf(rawTag: string): MvFlagCategory | undefined {
  return defOf(rawTag)?.category;
}

/** The human "Type" display name for a flag tag (canonical or alias), or undefined if the tag is AI-authoring-only (no
 *  `displayName`) or unknown. The single source of the human string for the drawer, the issue-body Type, + the label desc. */
export function flagDisplayNameOf(rawTag: string): string | undefined {
  return defOf(rawTag)?.displayName;
}

/** The GitHub label for a flag tag (canonical or alias), or undefined when the tag has no MV label (an extraction tag, or an
 *  unknown/stale tag). Callers MUST treat the lookup as PARTIAL — a missing label means "create the issue with no MV label +
 *  name the Type in the body", never an error (a stored tag is not enum-validated on load, so unknowns reach the emit path). */
export function flagLabelOf(rawTag: string): FlagLabel | undefined {
  const def = defOf(rawTag);
  return def ? labelOfDef(def) : undefined; // fresh object per call (labelOfDef) — the registry can't be mutated through it
}

/** Every MV label, for the content-repo label creation (Todo 4). The `flagVocab` set is authoritative; the repos derive from it. */
export function allFlagLabels(): FlagLabel[] {
  return FLAG_TAGS.map(labelOfDef).filter((l): l is FlagLabel => l !== undefined);
}

/** The field rules for a flag tag (canonical or alias), in registry order; empty for a non-flag tag. */
export function flagFieldRulesOf(rawTag: string): FieldRule[] {
  return defOf(rawTag)?.fields.map((f) => ({ ...f })) ?? [];
}

/** Every flag tag's authoring info (id + category + displayName + fields) — the cockpit drawer + `flagTags()` source. The
 *  drawer filters to the human MV Types via `displayName` presence (the extraction tags have none → never shown). */
export function flagTags(): FlagTagInfo[] {
  // OMIT `displayName` when absent (don't emit `displayName: undefined`) so `"displayName" in tag` / `Object.hasOwn` is a true
  // "is this an MV Type?" test, not just truthiness.
  return FLAG_TAGS.map((t) => ({
    id: t.id,
    category: t.category,
    ...(t.displayName !== undefined ? { displayName: t.displayName } : {}),
    fields: t.fields.map((f) => ({ ...f })),
  }));
}

// ── the pure field validator (ports createFlag steps 1–4, WITHOUT any `.crl` splicing) ──────────────────────────────────────
/** The chars a flag FIELD value must NOT contain — a backtick/newline would break the `…` body, a `;` would spoof a field
 *  delimiter. Re-homed from `createFlag` (same names); a surface's live input-validation shares the EXACT rule. */
export const FORBIDDEN_FLAG_CHARS = /[`\r\n;]/;
/** Does `v` contain a char that's illegal inside a flag FIELD value? */
export function hasForbiddenFlagChars(v: string): boolean {
  return FORBIDDEN_FLAG_CHARS.test(v);
}
/** The chars a flag GIST must NOT contain: a backtick or a `;`. NEWLINES ARE ALLOWED — the gist is a real multi-line
 *  description. Re-homed from `createFlag`. */
export const FORBIDDEN_GIST_CHARS = /[`;]/;
/** Does `v` contain a char that's illegal inside a flag gist? (backtick or `;` — newlines are fine). */
export function hasForbiddenGistChars(v: string): boolean {
  return FORBIDDEN_GIST_CHARS.test(v);
}

const BARE_IDENT = /^[a-z][a-z0-9-]*$/; // a field key is a bare lowercase identifier

export type FlagFieldsFailure = "unknown-tag" | "missing-field" | "invalid-value";

export type ValidateFlagFieldsResult =
  | { ok: true; canon: string; category: MvFlagCategory; gist: string; status: FlagStatus; fields: Record<string, string> }
  | { ok: false; reason: FlagFieldsFailure; message: string };

/** Validate an author's flag draft (tag known+canonical / gist required+sanitized / required fields present / every provided
 *  field bare-ident + sanitized + enum-checked / status enum) WITHOUT any source or `.crl` splicing. Returns the normalized
 *  pieces (canonical tag, its category, trimmed gist, status, cleaned fields — empty optionals dropped, `status` excluded) or
 *  a typed reason. Never throws. The seam layers on the source parse (`parse-failed`) + decl-exists (`decl-not-found`). */
export function validateFlagFields(input: CreateFlagInput): ValidateFlagFieldsResult {
  const def = defOf(input.tag);
  if (!def) return { ok: false, reason: "unknown-tag", message: `"${input.tag}" is not a registered flag tag` };
  const canon = def.id;

  const gist = (input.gist ?? "").trim(); // trims outer whitespace/newlines; INTERNAL newlines are kept (multi-line description)
  if (gist === "") return { ok: false, reason: "invalid-value", message: "a gist is required" };
  if (hasForbiddenGistChars(gist)) return { ok: false, reason: "invalid-value", message: "the gist must not contain a backtick or `;` (a `;` starts a field)" };

  const provided = input.fields ?? {};
  // `status` is set from the top-level `status` param, never from `fields` — reject a `fields.status` explicitly rather than
  // silently dropping it (a caller who put status there would otherwise get an unexpectedly-open flag).
  if (Object.prototype.hasOwnProperty.call(provided, "status")) {
    return { ok: false, reason: "invalid-value", message: "set the flag status via the top-level `status`, not `fields.status`" };
  }
  const ruleByKey = new Map(def.fields.map((r) => [r.key, r] as const));
  for (const rule of def.fields) {
    if (!rule.required) continue;
    const v = provided[rule.key] === undefined ? "" : String(provided[rule.key]).trim();
    if (v === "") return { ok: false, reason: "missing-field", message: `field "${rule.key}" is required for @${canon}` };
  }
  // Validate in a DETERMINISTIC order — registry-rule keys first, then any extra provided keys sorted alphabetically (ported
  // verbatim from createFlag) — so two callers with the same fields in a different object-key order get the SAME first-error
  // and the SAME stored-field set, independent of the producer's insertion order (gpt55 impl review).
  const orderedKeys = [
    ...def.fields.map((r) => r.key).filter((k) => k !== "status" && provided[k] !== undefined && String(provided[k]).trim() !== ""),
    ...Object.keys(provided)
      .filter((k) => k !== "status" && !ruleByKey.has(k))
      .sort(),
  ];
  const fields: Record<string, string> = {};
  for (const key of orderedKeys) {
    if (!BARE_IDENT.test(key)) return { ok: false, reason: "invalid-value", message: `field name "${key}" is not a bare identifier` };
    const val = String(provided[key] ?? "").trim();
    if (val === "") continue; // an empty optional field is dropped (matches createFlag's skip-empty)
    if (hasForbiddenFlagChars(val)) return { ok: false, reason: "invalid-value", message: `field "${key}" must not contain a backtick, newline, or ;` };
    const rule = ruleByKey.get(key);
    if (rule?.values && rule.values.length && !rule.values.includes(val)) {
      return { ok: false, reason: "invalid-value", message: `field "${key}" must be one of: ${rule.values.join(", ")}` };
    }
    fields[key] = val;
  }

  const status = (input.status ?? "open").trim() || "open";
  if (status !== "open" && status !== "resolved") return { ok: false, reason: "invalid-value", message: "status must be one of: open, resolved" };

  return { ok: true, canon, category: def.category, gist, status, fields };
}
