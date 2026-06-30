/**
 * Slug + name helpers for FHIR emit. Moved from src/cel/emitter/emitFhir.ts
 * (the regex is identical; the move makes the helper a shared CRL/CEL/FHIR
 * concern). Δ6 adds the 64-char truncation cap; Δ15 adds the PascalCase
 * computable-name helper.
 *
 * FHIR `id` regex: `[A-Za-z0-9-.]{1,64}` per
 * https://hl7.org/fhir/datatypes.html#id — slugify enforces both the
 * character set (lowercase ASCII + hyphen) and the length cap.
 *
 * FHIR `name` (computable) regex: `[A-Z]([A-Za-z0-9_]){0,254}` per
 * the base FHIR ValueSet `name` constraint. pascalCaseName produces a
 * leading-uppercase identifier up to 255 chars.
 */

const SLUG_MAX_LEN = 64;
const PASCAL_MAX_LEN = 255;

/**
 * Slugify a CRL name for a FHIR `id`. Lowercase → strip non-alphanumeric
 * (keep spaces + hyphens) → collapse whitespace to hyphens → collapse
 * runs of hyphens → strip leading/trailing hyphens → cap at 64 chars.
 * Returns `"unnamed"` for input that's empty after stripping (typically
 * non-ASCII-only names); the caller checks the fallback and emits a
 * `non-ascii-slug-fallback` warning.
 */
export function slugify(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/(^-|-$)/g, "") || "unnamed";
  return capSlug(slug);
}

/**
 * Round-2 review (gpt55 C1): cap any combined / composite slug to the
 * FHIR `id` 64-char limit. Callers that concatenate slugified parts
 * (e.g. `<librarySlug>-<terminologySlug>`) must pass the result through
 * here before using it as a FHIR `id`. Trims trailing hyphens after
 * truncation so the resulting id doesn't end with `-`.
 */
export function capSlug(slug: string): string {
  if (slug.length <= SLUG_MAX_LEN) return slug;
  return slug.slice(0, SLUG_MAX_LEN).replace(/-+$/, "");
}

/**
 * Cap a base slug + append a suffix so the combined result fits in
 * the FHIR id 64-char limit. Used by emit modules that suffix their
 * id (e.g. recommendation.ts: `<base>-recommendation`). Always trims
 * trailing hyphens from the truncated base to avoid `--` runs at the
 * base/suffix boundary.
 *
 * Per round-3 (Claude F1 + round-5 boundary verification): the base
 * is pre-capped to `SLUG_MAX_LEN - suffix.length` so cross-resource
 * boundary collisions (e.g. ActivityDef id vs Recommendation id at
 * the truncation boundary) cannot occur.
 */
export function capSlugForSuffix(base: string, suffix: string): string {
  const precapLen = SLUG_MAX_LEN - suffix.length;
  const trimmed = base.slice(0, precapLen).replace(/-+$/, "");
  return trimmed + suffix;
}

/**
 * Δ15 — PascalCase a name for the FHIR `name` (computable) field.
 * Lowercase → strip non-alphanumeric (keep spaces + hyphens + underscore)
 * → split on `[-_\s]+` → capitalize first letter per token → concat.
 * Cap at 255 chars.
 *
 * Round-2 review (gpt55 C2): FHIR `name` regex is
 * `[A-Z]([A-Za-z0-9_]){0,254}`. The leading character MUST be `[A-Z]`.
 * If the input begins with a digit (e.g. CRL library "123 Codes" →
 * "123Codes"), we prefix with `"X"` so the result conforms.
 *
 * Examples:
 *   "BP Codes"                    → "BpCodes"
 *   "cms22-asserted"              → "Cms22Asserted"
 *   "Has History Of"              → "HasHistoryOf"
 *   "123 codes"                   → "X123Codes"
 *   "" or pure non-ASCII          → "Unnamed"
 */
export function pascalCaseName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9\s_-]/g, "");
  const tokens = cleaned.split(/[-_\s]+/).filter(Boolean);
  if (tokens.length === 0) return "Unnamed";
  let pascal = tokens.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join("");
  if (!/^[A-Z]/.test(pascal)) pascal = "X" + pascal;
  return pascal.length > PASCAL_MAX_LEN ? pascal.slice(0, PASCAL_MAX_LEN) : pascal;
}

/**
 * R1 (foundation reshape) — the policy-id BASE for every emitted FHIR resource
 * id/url. The package.json `name` (the policy id, e.g. `rx501-145-medical-policy`)
 * is the SINGLE source of the resource-id base, replacing the human CRL
 * `library "…"` name slug. The per-resource SUFFIX (the declaration-name slug)
 * is unchanged — only the BASE switches.
 *
 * Returns `capSlug(slugify(name))`. `name` is hard-validated as non-empty +
 * slug-clean by `normalizePackageMetadata`, so on the emit path this is always a
 * well-formed, lossless slug; the slugify fallback (`"unnamed"`) is unreachable
 * there but kept for defensive callers.
 *
 * CONSEQUENCE (R1): because the id base is the policy id (package-WIDE), the
 * per-resource suffix (the declaration-name slug) is the ONLY thing that
 * distinguishes two resources of the same kind across the whole package. So
 * declaration names (decision / activity / recommendation / valueset / concept)
 * must be unique PACKAGE-WIDE for the emitted FHIR resources — two libraries in
 * one package both naming a decision "Approve" would collide on the canonical
 * url (Inv-1 catches it). The deliverable is one-library-per-policy, so this is
 * latent today; it bites only a multi-library package.
 */
export function policyIdBase(metadata: { name: string }): string {
  return capSlug(slugify(metadata.name));
}
