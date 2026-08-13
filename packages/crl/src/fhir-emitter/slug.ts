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
      // A dot is a SEPARATOR, not noise: a dotted name (e.g. a `<category>.<key>`
      // PA determination activity `certify.Approve`) must slug to `certify-approve`,
      // NOT the token-fusing `certifyapprove` a bare strip would produce.
      .replace(/\./g, " ")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/(^-|-$)/g, "") || "unnamed"
  );
}

/**
 * Round-2 review (gpt55 C1): cap a slug to the FHIR `id` 64-char limit.
 *
 * #237/T1 — this is now MODULE-PRIVATE: it is a lossy truncation with no collision
 * disambiguation, so it is NOT an id-formatter. It survives only as the length-cap
 * inside `slugify`/`policyIdBase` (whose public contracts document a 64-cap for
 * display / name / path uses). Every FHIR `id` composite goes through the
 * collision-safe `uniqueCapSlug` / `uniqueCapSlugForSuffix` instead. Trims trailing
 * hyphens after truncation so the result doesn't end with `-`.
 */
function capSlug(slug: string): string {
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
 * #237/T1 — the TRUNCATION-collision-safe cap for a composite FHIR `id` that must
 * keep a STABLE, RECOGNIZABLE suffix (`<base>-recommendation`, `<domain>-local`).
 * The suffix-preserving analogue of `uniqueCapSlug`: the disambiguating hash goes
 * BEFORE the suffix so the suffix survives verbatim on the overflow branch, which
 * keeps a FHIR `id` byte-equal to its canonical `url`-tail (the url ends in the
 * uncapped suffix). Replaces the lossy `capSlugForSuffix` (deleted with the rest of
 * the bare-truncation id paths).
 *
 * INPUT CONTRACT (mirrors `uniqueCapSlug`): `baseRaw` MUST be an UNCAPPED `rawSlug`
 * (or a composite of `rawSlug` parts) — do NOT pre-`capSlug`/`slugify` it, or the
 * discriminating tail is gone before the hash sees it. `suffix` is appended verbatim
 * and is expected to be a fixed constant (`-recommendation`, `-local`).
 *
 * - `baseRaw + suffix` fits in 64 → returned UNCHANGED (byte-identical to the old
 *   `capSlugForSuffix` for any id that already fit; no golden churn at <= 64).
 * - overflow → `<stem>-<hash><suffix>` where `<hash>` is the first `UNIQUE_HASH_LEN`
 *   hex of sha256 over the FULL `baseRaw` (two bases differing only past the stem
 *   still separate), and `<stem>` is `baseRaw` capped to
 *   `64 - UNIQUE_HASH_LEN - 1 - suffix.length`. Result matches `[A-Za-z0-9-.]{1,64}`.
 *
 * SUFFIX PRECONDITION (guarded): `suffix` must be a legal FHIR-id-charset string of
 * length <= `SLUG_MAX_LEN - UNIQUE_HASH_LEN` (52), so the result is provably <= 64
 * on EVERY branch (including the empty-stem `<hash><suffix>` degrade). The `<= 64`
 * guarantee holds only under this precondition; a violating `suffix` is a programmer
 * error and THROWS rather than emitting an over-long/illegal id. Live callers pass
 * fixed constants (`-local`, `-recommendation`) well within the bound.
 *
 * Self-defensive like `uniqueCapSlug`: trims leading/trailing hyphens on the stem
 * and falls back to `<hash><suffix>` when the stem trims empty, so it can never emit
 * a leading-`-` or a `--` run.
 */
export function uniqueCapSlugForSuffix(baseRaw: string, suffix: string): string {
  const maxSuffix = SLUG_MAX_LEN - UNIQUE_HASH_LEN;
  if (suffix.length > maxSuffix || !/^[a-z0-9.-]*$/.test(suffix)) {
    throw new Error(
      `uniqueCapSlugForSuffix: suffix must be FHIR-id-charset and <= ${maxSuffix} chars ` +
        `to guarantee a <= 64 id (got ${JSON.stringify(suffix)})`,
    );
  }
  const full = `${baseRaw}${suffix}`;
  if (full.length <= SLUG_MAX_LEN) return full;
  const hash = createHash("sha256").update(baseRaw, "utf8").digest("hex").slice(0, UNIQUE_HASH_LEN);
  const stemBudget = SLUG_MAX_LEN - UNIQUE_HASH_LEN - 1 - suffix.length;
  if (stemBudget <= 0) return `${hash}${suffix}`;
  const stem = baseRaw.slice(0, stemBudget).replace(/^-+|-+$/g, "");
  return stem ? `${stem}-${hash}${suffix}` : `${hash}${suffix}`;
}

/** The stable `-local` suffix on every local-domain CodeSystem id / url-tail. */
export const LOCAL_CODESYSTEM_SUFFIX = "-local";

/**
 * #237/T1 — the SINGLE local-domain CodeSystem identity, shared by BOTH lanes so the
 * FHIR CodeSystem `id`, its canonical `url`-tail, the CQL `codesystem '<url>'` tail,
 * and every `coding.system` tail are BYTE-EQUAL at all lengths. `localDomainId` is
 * the per-library domain base (`localDomainIdFor` output — the policy id, or
 * `<policyId>-<rawSlug(libraryName)>` for a sibling). The `-local` suffix is
 * preserved on the overflow branch via `uniqueCapSlugForSuffix`.
 */
export function localCodeSystemSlug(localDomainId: string): string {
  return uniqueCapSlugForSuffix(rawSlug(localDomainId), LOCAL_CODESYSTEM_SUFFIX);
}

/**
 * Deterministic local-domain codesystem URL for a library — the single implicit
 * local domain shared by every `code is` code in the library. Slug = lowercase,
 * non-alphanumeric → hyphen, collapse/trim hyphens; empty (e.g. a pure non-ASCII
 * library name) falls back to `unnamed` so the URL is always well-formed.
 *
 * The local codesystem URL is published UNDER `crl.canonicalBase`
 * (`<base>/CodeSystem/<slug>-local`) for FHIR closure integrity + publishability;
 * the case-feature profile fixes a code from this system. **#271 — canonicalBase is
 * REQUIRED; there is NO urn fallback.** Passing an empty/undefined base is a
 * caller-invariant violation (throws): the callers that lower local codes validate
 * `crl.canonicalBase` first (`lowerLocalCodes` for the CQL lane, the FHIR-metadata
 * loader for the FHIR lane) and hard-error with `missing-canonical-url-base` when it
 * is absent — mirroring each other so the CQL and FHIR local-codesystem identities
 * stay byte-equal. BOTH lanes call THIS helper.
 *
 * R1 — `localDomainId` is the slug SOURCE: the FHIR/imports lanes pass the POLICY
 * ID (`metadata.name`) so the local-domain url shares the policy-id base with
 * every other emitted FHIR resource id; direct callers without metadata pass the
 * source LIBRARY NAME. The function just slugs whatever it is given — the CALLER
 * decides which identity is authoritative for the domain.
 *
 * #189 T1 — relocated here from `cql-emitter/lowerLocalCodes` (beside its only dep
 * `localCodeSystemSlug`) so the emit representation-descriptor and BOTH lanes can
 * import the local-domain identity from this leaf util without a `cql-emitter ↔
 * emit` cycle.
 */
export function localCodeSystemUrl(
  canonicalBase: string | undefined,
  localDomainId: string,
): string {
  // #237/T1 (scope B) — the url-tail is the SAME collision-safe identity the FHIR
  // `CodeSystem.id` uses (`localCodeSystemSlug`, which returns the full `<…>-local`
  // tail), so id, url-tail, `codesystem '<url>'`, and every `coding.system` are
  // byte-equal at ALL lengths — including the >64 case the old uncapped `localSlug`
  // left divergent, and dotted domains where `rawSlug` (dot→hyphen) now matches the
  // id instead of the old `localSlug` (dot-stripping) mismatch.
  const tail = localCodeSystemSlug(localDomainId);
  // #271 — REQUIRED, no urn fallback. Normalize a trailing slash so the url is
  // stable regardless of whether the caller's canonicalBase ends in `/`.
  const base = canonicalBase?.trim().replace(/\/+$/, "") ?? "";
  if (!base) {
    throw new Error(
      "localCodeSystemUrl requires a non-empty canonicalBase (#271: no urn fallback). " +
        "Validate crl.canonicalBase before lowering local codes.",
    );
  }
  return `${base}/CodeSystem/${tail}`;
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
  const cleaned = name.replace(/[^a-zA-Z0-9\s_.-]/g, "");
  const tokens = cleaned.split(/[-_.\s]+/).filter(Boolean);
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

/**
 * #198 — Option B per-library local-domain / layered-identity BASE.
 *
 * The local CodeSystem url (`<policyId>-local`) AND the base/layered Library
 * identity are BOTH keyed on the policy id, so two `code is` libraries under one
 * policy id would mint the SAME CodeSystem url + Library identity → a canonical-url
 * collision the closure invariants must refuse. Option B disambiguates ONLY the
 * SIBLING libraries (those pulled into the emit closure via cross-lib refs), leaving
 * the PRIMARY (closure-seed / `--path` root) library on the clean `<policyId>` base
 * so every existing single-`code is`-library golden stays byte-identical.
 *
 * Returns the per-library base used as `localDomainId` (both lanes):
 *   - primary (seed) → the bare policy id, UNCHANGED.
 *   - sibling        → `<policyId>-<slugify(libraryName)>` (e.g. `repro-198-repro-sub`).
 *
 * This is the SINGLE lever both emit lanes thread: the CQL lane feeds it to
 * `lowerLocalCodes` (the `codesystem '<url>'` decl) AND as the split plan's policy
 * id (→ every layered `<policyId>-<Layer>` Library identity `S`); the FHIR lane
 * feeds it to `emitLocalCodeSystem` (CodeSystem id/url), the case-feature
 * `patternCodeableConcept.coding.system`, and — via the manifest layer names — the
 * base/layered Library id/url/name. Because BOTH lanes compute it from the same
 * (policyId, libraryName, isPrimary) triple, every reference site byte-agrees.
 */
export function localDomainIdFor(
  policyId: string,
  libraryName: string,
  isPrimary: boolean,
): string {
  // #237/T1 (scope B) — the sibling suffix uses the UNCAPPED `rawSlug`, not the
  // 64-capping `slugify`: `localDomainId` is fed to the collision-safe
  // `localCodeSystemSlug`, so a sibling library whose name exceeds 64 chars must
  // keep its discriminating tail here (a `slugify` cap would lose it BEFORE the
  // hash). Primary keeps the bare policy id (validated lossless <= 64).
  return isPrimary ? policyId : `${policyId}-${rawSlug(libraryName)}`;
}
