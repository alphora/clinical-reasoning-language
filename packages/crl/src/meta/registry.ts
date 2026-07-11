// #154/#203: a typed accessor over the compile-time-inlined registry constant (`registry.generated.ts`, codegen'd
// from spec/metadata-registry.json). One source of truth for the tag vocabulary, `flag` predicate, categories,
// field rules (required / enum), cardinality, and aliases — consumed by `parseMetaTag`, the `MetaTagValidator`,
// and `collectFlags`. No runtime asset dependency (the JSON is inlined at codegen).
import { METADATA_REGISTRY } from "./generated/registry.generated";

// The generated constant is `as const`, so each tag narrows to a distinct literal type and the union doesn't
// uniformly expose the OPTIONAL registry properties (`flag`, `category`, `extraFields`, …). View it through a
// permissive structural type for uniform optional access.
interface RawTag {
  id: string;
  aliases?: readonly string[];
  flag?: boolean;
  category?: string;
  valueShape?: string;
  cardinality?: string;
  extraFields?: Record<string, { type?: string; required?: boolean; values?: readonly string[] }>;
  emit?: {
    cql?: boolean;
    fhir?: boolean;
    condition?: string;
    /** statuses that SUPPRESS emit (e.g. `["resolved"]`) — the emitter is data-driven off this (never a hardcoded string). */
    suppressWhenStatus?: readonly string[];
    /** the emit lanes this tag's CQL comment actually reaches (e.g. `["concept"]` — decision/library have no CQL comment lane yet). */
    cqlScopes?: readonly string[];
  };
}

/** A field rule for a tag, merged from the tag's own `extraFields` AND (for ExternalReference-shaped tags) the
 *  shared `valueTypes.ExternalReference.fields`. `system` is registry-derived, never author-typed, so it's excluded. */
export interface FieldRule {
  key: string;
  required: boolean;
  /** enum values, if the field is an enum; else undefined (free value). */
  values?: readonly string[];
}

const TAGS: readonly RawTag[] = METADATA_REGISTRY.tags as readonly RawTag[];

/** tag id (or alias) → the canonical tag id. */
const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const t of TAGS) {
  ALIAS_TO_CANONICAL.set(t.id, t.id);
  for (const a of t.aliases ?? []) ALIAS_TO_CANONICAL.set(a, t.id);
}

const BY_CANONICAL = new Map<string, RawTag>(TAGS.map((t) => [t.id, t]));

/** Resolve a raw tag id (canonical OR alias) to the canonical id, or undefined if unknown. */
export function canonicalTag(rawTag: string): string | undefined {
  return ALIAS_TO_CANONICAL.get(rawTag);
}

/** Is `rawTag` a KNOWN registered tag (canonical or alias)? */
export function isKnownTag(rawTag: string): boolean {
  return ALIAS_TO_CANONICAL.has(rawTag);
}

function defOf(rawTag: string): RawTag | undefined {
  const canon = ALIAS_TO_CANONICAL.get(rawTag);
  return canon ? BY_CANONICAL.get(canon) : undefined;
}

/** Is `rawTag` a FLAG (`flag: true` in the registry — gates mvComplete while open)? */
export function isFlag(rawTag: string): boolean {
  return defOf(rawTag)?.flag === true;
}

/** The flag category (`extraction` | `validation`) for a flag tag, else undefined. */
export function flagCategory(rawTag: string): string | undefined {
  return defOf(rawTag)?.category;
}

/** Cardinality string (e.g. "0..1", "0..n") for a tag, defaulting to "0..n". */
export function cardinalityOf(rawTag: string): string {
  return defOf(rawTag)?.cardinality ?? "0..n";
}

const EXTERNAL_REF_FIELDS = METADATA_REGISTRY.valueTypes.ExternalReference.fields;

/** The field rules for a tag — its own `extraFields` MERGED with `valueTypes.ExternalReference.fields` when the
 *  tag's `valueShape` is `ExternalReference`. `system` (registry-derived) is excluded. */
export function fieldRulesOf(rawTag: string): FieldRule[] {
  const d = defOf(rawTag);
  if (!d) return [];
  const rules: FieldRule[] = [];
  const add = (key: string, spec: { type?: string; required?: boolean; values?: readonly string[] }): void => {
    if (key === "system") return; // derived from the tag, not author-typed
    rules.push({ key, required: spec.required === true, values: spec.type === "enum" ? spec.values : undefined });
  };
  if (d.extraFields) for (const [k, v] of Object.entries(d.extraFields)) add(k, v);
  if (d.valueShape === "ExternalReference") for (const [k, v] of Object.entries(EXTERNAL_REF_FIELDS)) add(k, v as { type?: string; required?: boolean; values?: readonly string[] });
  return rules;
}

// #203 Todo 5: status-aware CQL emit. `emitsToCql` = the tag renders into a CQL block comment (registry `emit.cql`,
// alias-canonical). `suppressStatusesOf` = the statuses that SUPPRESS that emit (registry `emit.suppressWhenStatus`),
// consumed data-drivenly by the emitter — a line emits iff `emitsToCql(tag) ∧ !suppressStatusesOf(tag).includes(status)`.
// `emitCqlTags` derives the old `EMIT_CQL_COMMENT_TAGS` set from the registry (no hand-maintained mirror).

/** Does `rawTag` (canonical or alias) render into a CQL block comment? (registry `emit.cql === true`). */
export function emitsToCql(rawTag: string): boolean {
  return defOf(rawTag)?.emit?.cql === true;
}

/** The statuses that SUPPRESS this tag's CQL emit (e.g. `["resolved"]`); empty when the tag is not status-gated. */
export function suppressStatusesOf(rawTag: string): readonly string[] {
  return defOf(rawTag)?.emit?.suppressWhenStatus ?? [];
}

/** The set of CANONICAL tag ids with `emit.cql === true` — the registry-derived successor of the old hand-maintained
 *  `EMIT_CQL_COMMENT_TAGS` mirror. */
export function emitCqlTags(): Set<string> {
  return new Set(TAGS.filter((t) => t.emit?.cql === true).map((t) => t.id));
}

/** One flag tag's authoring info for the create-flag pick (#203 Todo 4b Slice B). `fields` are the tag's rules from
 *  `fieldRulesOf` (required/enum) so the create UI prompts them registry-driven — never hardcoded per tag. */
export interface FlagTagInfo {
  id: string;
  category?: string;
  fields: FieldRule[];
}

/** Every `flag:true` tag, in registry order, with its category + field rules. The create-flag tag-pick enumerates these
 *  (rather than hardcoding the five in the cockpit) so a new flag tag appears automatically. */
export function flagTags(): FlagTagInfo[] {
  return TAGS.filter((t) => t.flag === true).map((t) => ({ id: t.id, category: t.category, fields: fieldRulesOf(t.id) }));
}

export const REGISTRY_VERSION: string = METADATA_REGISTRY.version;
