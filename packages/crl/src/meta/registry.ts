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

export const REGISTRY_VERSION: string = METADATA_REGISTRY.version;
