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

import { createHash } from "node:crypto";

const SLUG_MAX_LEN = 64;
const PASCAL_MAX_LEN = 255;

/**
 * The deterministic disambiguator width for `uniqueCapSlug`. 12 lowercase hex
 * chars of sha256 = 48 bits. The in-repo precedent for the "over-length segment
 * → deterministic hex slice" idiom (provenance/generate.ts `sha256…slice(0,16)`,
 * provenance/correspondence.ts `sha1…slice(0,10)`) uses WIDER slices; we pick 12
 * — wider than strictly needed for a handful of case-features per policy, but
 * these ids are a PUBLISHED canonical surface, so the extra margin is cheap
 * insurance and the closure-collision invariants remain a backstop regardless.
 */
const UNIQUE_HASH_LEN = 12;

/**
 * Slugify a CRL name for a FHIR `id`. Lowercase → strip non-alphanumeric
 * (keep spaces + hyphens) → collapse whitespace to hyphens → collapse
 * runs of hyphens → strip leading/trailing hyphens → cap at 64 chars.
 * Returns `"unnamed"` for input that's empty after stripping (typically
 * non-ASCII-only names); the caller checks the fallback and emits a
 * `non-ascii-slug-fallback` warning.
 */
export function slugify(name: string): string {
  return capSlug(rawSlug(name));
}

/**
 * The UNCAPPED slug — the same character normalization `slugify` applies, but
 * WITHOUT the 64-char `capSlug` truncation. F6: `normalizePackageMetadata` uses
 * the uncapped length to reject an over-long policy-id `name`, because the CQL
 * lane names layer libraries from the raw (uncapped) `metadata.name` while the
 * FHIR lane caps `policyIdBase` to 64 — a >64 slug would make `idSuffixFor`'s
 * prefix-strip miss and the emitted ids / `library[]` drift between the lanes.
 */
export function rawSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/(^-|-$)/g, "") || "unnamed"
  );
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
 * TRUNCATION-collision-safe cap for a composite FHIR `id` slug. Distinct inputs
 * that share a long common prefix would, under the bare `capSlug` truncation,
 * collapse to the SAME 64-char id (and — because callers reuse the id for the
 * canonical `url` — the same url), which the closure invariants then have to
 * atomically refuse. This helper instead preserves uniqueness by reserving a
 * deterministic hash suffix when (and only when) truncation would occur.
 *
 * INPUT CONTRACT (load-bearing — design review gpt55 G1/G2, Claude C4): `raw`
 * MUST be an UNCAPPED `rawSlug` of the FULL composite, e.g.
 * `rawSlug(`${policyIdBase}-${conceptName}`)`. Do NOT pass a value already
 * through `capSlug`/`slugify` — the discriminating tail would already be gone
 * before we hash, defeating the whole point.
 *
 * - `raw.length <= 64` → returned UNCHANGED (no churn for any id that already
 *   fits; the 3 currently-clean deliverable policies keep byte-identical ids).
 * - `raw.length > 64`  → `<stem>-<h>` where `<h>` is the first 12 hex chars of
 *   sha256 over the FULL `raw` string (NOT the truncated stem — so two names
 *   differing only past the cap still hash differently), and `<stem>` is `raw`
 *   capped to `64 - 12 - 1 = 51` chars with leading/trailing hyphens trimmed. The
 *   result is always `<= 64` and matches the FHIR id regex `[A-Za-z0-9-.]{1,64}`.
 *
 * Under the input contract above the result is byte-for-byte the composite for
 * `<= 64` inputs and a clean `<stem>-<hash>` otherwise. The function is ALSO
 * self-defensive for a mis-fed input: it trims leading hyphens on the stem and
 * falls back to the bare `<hash>` when the 51-char prefix is all-hyphen, so it
 * can never emit a leading-hyphen id, a `--` run, or an empty id even if a future
 * caller violates the "pass a rawSlug" contract.
 *
 * Order-independent: the hash is over the NAME's normalized bytes, never a
 * position/index, so adding, removing, or reordering sibling concepts never
 * perturbs another's id — these published canonical ids are stable across emits
 * and platforms (`rawSlug`'s `toLowerCase` is locale-independent per ECMAScript).
 *
 * NOT addressed (left to the closure invariants by design): lossy-NORMALIZATION
 * collisions where two DISTINCT names already collapse to the same `raw` slug at
 * <= 64 chars — e.g. `"A/B"` vs `"AB"`, or two all-non-ASCII names both becoming
 * `"unnamed"`. Those never reach the `> 64` branch, so the hash can't separate
 * them; the `closure-resource-*-collision` backstop catches them instead.
 */
export function uniqueCapSlug(raw: string): string {
  if (raw.length <= SLUG_MAX_LEN) return raw;
  const hash = createHash("sha256").update(raw, "utf8").digest("hex").slice(0, UNIQUE_HASH_LEN);
  const stem = raw.slice(0, SLUG_MAX_LEN - UNIQUE_HASH_LEN - 1).replace(/^-+|-+$/g, "");
  return stem ? `${stem}-${hash}` : hash;
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
  const pascal = pascalCaseNameUncapped(name);
  return pascal.length > PASCAL_MAX_LEN ? pascal.slice(0, PASCAL_MAX_LEN) : pascal;
}

/**
 * The UNCAPPED PascalCase normalization — strip→split→uppercase-first-per-token
 * →leading-`[A-Z]` logic, WITHOUT the 255-char cap. `pascalCaseName` = this capped
 * to 255. `pascalCaseNameForId` hashes THIS (uncapped) form so two inputs that
 * differ only PAST char 255 still separate (the pre-hardening bug hashed the
 * already-255-capped `pascalCaseName`, so such inputs produced the same pascal →
 * same stem → same hash → collision).
 *
 * PRESERVES each token's internal casing — it uppercases only the FIRST character
 * and keeps the rest verbatim, so a token that is ALREADY PascalCase stays intact:
 * `LocalSource` → `LocalSource` (NOT `Localsource`), `RecordConcepts`,
 * `Interface`, an abbreviation like `BP` → `BP`. (A leading `.toLowerCase()` used
 * to flatten these — #186 layer tokens LocalSource/LocalConcepts/RecordSource/
 * RecordConcepts came out `Localsource`/…). In real emit `pascalCaseName` only ever
 * receives a lowercased `slugify` output EXCEPT the layered `S` input
 * (`layerLibraryName`'s raw `<policyId>-<Layer>`), so this preservation changes
 * ONLY the layer identifiers, nothing else.
 */
export function pascalCaseNameUncapped(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9\s_-]/g, "");
  const tokens = cleaned.split(/[-_\s]+/).filter(Boolean);
  if (tokens.length === 0) return "Unnamed";
  let pascal = tokens.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join("");
  if (!/^[A-Z]/.test(pascal)) pascal = "X" + pascal;
  return pascal;
}

/**
 * #186 — cap-safe, hyphen-free PascalCase identifier for a LAYERED CQL/FHIR
 * Library. This is the single `S` used EVERYWHERE the engine correlates a
 * layered library: the CQL `library` header, every `include`, every qualified
 * ref, the FHIR `Library` id + canonical url-tail + `name`, and every
 * reference-to-a-library (`PlanDefinition.library`, `relatedArtifact[depends-on]`,
 * `featureExpression.reference`). cqf `RepositoryFhirLibrarySourceProvider`
 * resolves `include`/url-tail against `Library.name`, whose FHIR regex
 * `[A-Z]([A-Za-z0-9_]){0,254}` FORBIDS hyphens — so the one identifier must be a
 * hyphen-free PascalCase form (`pascalCaseName` shape), NOT the lowercase-hyphen
 * `capSlug` form.
 *
 * S is the hyphen-free PascalCase form (`pascalCaseName` shape), capped to the
 * FHIR `id` 64-char limit in a TRUNCATION-collision-safe way — the PascalCase
 * analogue of `uniqueCapSlug` (which lowercases/hyphenates and cannot be reused
 * here). It works on the UNCAPPED PascalCase (`pascalCaseNameUncapped`):
 *   - length <= 64 → returned UNCHANGED (no churn for the deliverable's short
 *     ids). This equals `pascalCaseName(raw)` for any input whose pascal is <=64
 *     (both are the uncapped pascal in that range).
 *   - length  > 64 → `<stem><hash>`: `<hash>` is the first `UNIQUE_HASH_LEN` hex
 *     chars of sha256 over the FULL UNCAPPED pascal (NOT `pascalCaseName`, which
 *     is 255-capped — hashing that would collide two inputs differing only past
 *     char 255); `<stem>` is the uncapped pascal sliced to `64 - UNIQUE_HASH_LEN`.
 *
 * SEPARATOR — the disambiguator is a BARE hex slice with NO separator
 * (`<stem><hash>`). The FHIR `id` charset is `[A-Za-z0-9-.]` and the (hyphen-free)
 * FHIR `name` charset is `[A-Za-z0-9_]`; the ONLY chars legal in both are
 * `[A-Za-z0-9.]`. A bare alphanumeric hex slice is legal in both, so `id == name
 * == url-tail` stays ONE identical string on the overflow branch. (`uniqueCapSlug`
 * uses a `-` separator, legal in an `id` but NOT a hyphen-free `name`, so it
 * cannot be reused.) The no-separator join means the hash abuts the stem's last
 * char — a marginally wider collision class than `uniqueCapSlug`'s separated form,
 * but hex is `[0-9a-f]` while a PascalCase stem's boundary chars are alphanumeric,
 * and the closure-level `applyUrlUniquenessInvariant` (Inv 0) is the atomic
 * backstop for any residual same-id collision regardless.
 */
export function pascalCaseNameForId(raw: string): string {
  const pascal = pascalCaseNameUncapped(raw);
  if (pascal.length <= SLUG_MAX_LEN) return pascal;
  // Hash the FULL uncapped pascal so inputs differing only past the cap (incl.
  // past char 255, which `pascalCaseName` would have collapsed) still separate.
  const hash = createHash("sha256").update(pascal, "utf8").digest("hex").slice(0, UNIQUE_HASH_LEN);
  // Cap the stem to leave room for the bare hex disambiguator (no separator —
  // see the SEPARATOR note: keeps the result legal as BOTH a FHIR id and name).
  const stem = pascal.slice(0, SLUG_MAX_LEN - UNIQUE_HASH_LEN);
  return `${stem}${hash}`;
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
