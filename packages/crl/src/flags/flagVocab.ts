// #212 step 4 — the CORE-owned review-flag VOCABULARY + a PURE flag-draft field validator. Flags have left `.crl` (they now
// live as structured records under `.crl/flags/`), so their schema — the five tags, their field rules, aliases, categories,
// and enums — moves OUT of the `.crl` meta-registry (`spec/metadata-registry.json`) into this first-class core module. This is
// the SINGLE source of the flag vocabulary for BOTH the MCP `create_flag`/`set_flag_status` tools AND the cockpit drawer.
//
// PURE by construction: it imports only the record model (`mvFlag`) — NEVER the barrel (`../index` would form a cycle:
// index → flagVocab → index) and never the `.crl` registry/parser. The vocab data below is ported verbatim from the registry
// flag entries; the 4a equivalence test (`flagVocab.equivalence.test.ts`) asserts parity against the registry for as long as
// both exist, so a hand-transcription drop (a missing alias/enum/category) fails the build. After 4b strips the registry flag
// entries, this module is the sole home.
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

/** A flag tag's authoring info (id + category + field rules) — the shape the cockpit drawer + `flagTags()` consume. Mirrors
 *  the registry's `FlagTagInfo`. */
export interface FlagTagInfo {
  id: string;
  category: MvFlagCategory;
  fields: FieldRule[];
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

// ── the vocabulary (ported verbatim from spec/metadata-registry.json flag entries; equivalence-guarded) ─────────────────────
const STATUS: FieldRule = { key: "status", required: false, values: ["open", "resolved"] };
const KEY: FieldRule = { key: "key", required: false };
const REF: FieldRule = { key: "ref", required: false };

/** The internal tag record. `fields` is in the registry's `fieldRulesOf` order (extraFields insertion order, `system` excluded)
 *  so the equivalence test can compare field arrays positionally. */
interface FlagTagDef {
  id: string;
  aliases: readonly string[];
  category: MvFlagCategory;
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
  {
    id: "validation-concern",
    aliases: [],
    category: "validation",
    fields: [STATUS, { key: "kind", required: false, values: ["underspecified", "narrative-error", "intent-divergence", "context-conflict"] }, REF],
  },
];

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

/** The field rules for a flag tag (canonical or alias), in registry order; empty for a non-flag tag. */
export function flagFieldRulesOf(rawTag: string): FieldRule[] {
  return defOf(rawTag)?.fields.map((f) => ({ ...f })) ?? [];
}

/** Every flag tag's authoring info (id + category + fields) — the cockpit drawer + `flagTags()` source. */
export function flagTags(): FlagTagInfo[] {
  return FLAG_TAGS.map((t) => ({ id: t.id, category: t.category, fields: t.fields.map((f) => ({ ...f })) }));
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
