/**
 * #250 F — the fail-closed loader for a provenance artifact's VERSIONED ENVELOPE (pin P6). Every disk read-site routes a
 * decoded JSON value through `parseProvenanceArtifact` BEFORE treating it as a {@link ProvenanceArtifact}, so an unknown
 * future `schemaVersion` is REJECTED (never reinterpreted as the current shape) and the version↔marker invariant is
 * enforced at the one place the whole pipeline depends on.
 *
 * The two `packages/crl` DISK read-sites — `resolveProvenance` (validate) and `generateProvenanceFiles`'s `--merge` read —
 * route their decoded JSON through this before treating it as a {@link ProvenanceArtifact}. (The crl-vscode discovery
 * reader `provenanceFindings.ts` deliberately does NOT: it is tolerant candidate-discovery that hands the PATH on to
 * `resolveProvenance`, which then fail-closes — a future-version artifact must stay discoverable so the cockpit can
 * surface the loader's error on open, and one bad candidate must not blank discovery of the rest. #250 C/D own that.)
 *
 * Scope is deliberately the ENVELOPE, not the full artifact graph: `schemaVersion` (known), `anchorSource` (present +
 * object), the container fields (`items`/`ignoredRanges`/`clusters` are arrays — so a TRUNCATED file yields a coded error,
 * not a raw downstream `TypeError`), and the version↔marker rule (1.0 omits the marker; 1.1 carries a valid
 * {@link DerivedFromContract}). It does NOT deep-validate item/cluster CONTENTS — that is the §9 validators' job on the
 * already-typed artifact. The tell CONSISTENCY check (`anchor-self` ⇒ `derivedFromHash === textHash`) is likewise NOT here:
 * a contradictory-but-parseable record must stay LOADABLE so tooling (the cockpit, E's post-write revalidate) can point at
 * what is wrong rather than refuse to open it — that check lands as a hard integrity finding in the C/D validators, not here.
 *
 * On success the loader returns the STRICT {@link LoadedProvenanceArtifact} view (1.0 ⇒ no marker, 1.1 ⇒ marker present):
 * it is assignable to the permissive {@link ProvenanceArtifact} (so no consumer/construction churn) but lets C/D/E narrow
 * on `schemaVersion` and makes "1.1 without marker" unrepresentable past the load boundary.
 *
 * Input is a DECODED value (`unknown`), not JSON text: the two read-sites already own their `JSON.parse` (whose syntax
 * errors flow through their existing throw contracts); this guards the shape a blind `as ProvenanceArtifact` never did.
 */
import type { AnchorMeta } from "./canonicalize";
import type { AnchorSourceMeta, DerivedFromContract, ProvenanceArtifact } from "./artifact";

/**
 * The `schemaVersion` strings the loader recognizes — an INDEPENDENT frozen literal, NOT derived from the writer constant
 * `PROVENANCE_SCHEMA_VERSION` (which producer A moves to "1.1"): deriving it would silently drop legacy "1.0" the moment
 * the writer flips. Adding a future version means editing THIS list. Frozen so a JS consumer can't mutate the loader's
 * acceptance policy at runtime. Anything not here FAILS CLOSED (P6).
 */
export const KNOWN_SCHEMA_VERSIONS: readonly string[] = Object.freeze(["1.0", "1.1"]);

/**
 * The strict, discriminated view of an artifact that PASSED the loader — the version↔marker invariant made structural at
 * the load boundary (1.0 forbids the marker; 1.1 requires a valid one). Assignable to {@link ProvenanceArtifact}, so it
 * flows into every existing consumer without churn; a future C/D/E can `switch (a.schemaVersion)` and get the marker typed.
 */
export type LoadedProvenanceArtifact =
  | (ProvenanceArtifact & {
      schemaVersion: "1.0";
      anchorSource: AnchorSourceMeta & { derivedFromContract?: never };
    })
  | (ProvenanceArtifact & {
      schemaVersion: "1.1";
      anchorSource: AnchorSourceMeta & { derivedFromContract: DerivedFromContract };
    });

/** The valid `derivedFromContract` marker values (runtime mirror of {@link DerivedFromContract}). */
const KNOWN_CONTRACTS: readonly DerivedFromContract[] = ["upstream-source", "anchor-self"];

/** Stable, catch-able reason a load failed — so a caller/test distinguishes "future version, upgrade tooling" from
 *  "corrupt 1.1 record" without parsing prose. */
export type ProvenanceParseErrorCode =
  | "not-an-object" // root is null / an array / a primitive
  | "missing-schema-version" // `schemaVersion` absent
  | "unsupported-schema-version" // present but not a KNOWN_SCHEMA_VERSIONS string (incl. the numeric `1`)
  | "malformed-anchor-source" // `anchorSource` absent or not an object
  | "malformed-envelope" // a container field (items / ignoredRanges / clusters) is absent or not an array (e.g. a truncated file)
  | "marker-required" // 1.1 without the `derivedFromContract` marker
  | "marker-forbidden" // 1.0 carrying a `derivedFromContract` marker
  | "invalid-marker-value"; // 1.1 with a `derivedFromContract` outside KNOWN_CONTRACTS

export type ProvenanceParseResult =
  | { ok: true; artifact: LoadedProvenanceArtifact }
  | { ok: false; code: ProvenanceParseErrorCode; message: string };

const fail = (code: ProvenanceParseErrorCode, message: string): ProvenanceParseResult => ({
  ok: false,
  code,
  message,
});

/** Render a received value compactly for an error message (so `1`, `"2.0"`, `null` all read clearly). */
function show(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === undefined) return "undefined";
  return String(value);
}

/**
 * Validate a decoded value as a versioned {@link ProvenanceArtifact} envelope. Returns the typed artifact on success, or a
 * coded failure — NEVER throws, so `parseProvenanceArtifact(null)` is `{ok:false,"not-an-object"}`, not a crash.
 */
export function parseProvenanceArtifact(raw: unknown): ProvenanceParseResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return fail("not-an-object", `provenance artifact must be a JSON object (got ${show(raw)}).`);
  }
  const obj = raw as Record<string, unknown>;

  const version = obj.schemaVersion;
  if (version === undefined) {
    return fail("missing-schema-version", "provenance artifact is missing `schemaVersion`.");
  }
  if (typeof version !== "string" || !KNOWN_SCHEMA_VERSIONS.includes(version)) {
    return fail(
      "unsupported-schema-version",
      `unsupported provenance schemaVersion ${show(version)} — this build recognizes ${KNOWN_SCHEMA_VERSIONS.map((v) => `"${v}"`).join(", ")}. Upgrade the tooling (a newer version is not read as the current shape).`,
    );
  }

  const anchorSource = obj.anchorSource;
  if (typeof anchorSource !== "object" || anchorSource === null || Array.isArray(anchorSource)) {
    return fail(
      "malformed-anchor-source",
      `provenance artifact \`anchorSource\` must be an object (got ${show(anchorSource)}).`,
    );
  }
  // Container fields must be arrays — a truncated/partial file surfaces as a coded error here rather than a raw
  // `TypeError` deeper in deriveCoverage/validateProvenance. Contents are NOT validated (that is the §9 validators' job).
  for (const field of ["items", "ignoredRanges", "clusters"] as const) {
    if (!Array.isArray(obj[field])) {
      return fail(
        "malformed-envelope",
        `provenance artifact \`${field}\` must be an array (got ${show(obj[field])}).`,
      );
    }
  }

  const marker = (anchorSource as Record<string, unknown>).derivedFromContract;

  // Version↔marker invariant: 1.0 forbids the marker; 1.1 requires a valid one.
  if (version === "1.0") {
    if (marker !== undefined) {
      return fail(
        "marker-forbidden",
        `schemaVersion "1.0" must NOT carry \`anchorSource.derivedFromContract\` (found ${show(marker)}); the marker was introduced in "1.1".`,
      );
    }
  } else {
    // version === "1.1"
    if (marker === undefined) {
      return fail(
        "marker-required",
        'schemaVersion "1.1" requires `anchorSource.derivedFromContract` ("upstream-source" | "anchor-self").',
      );
    }
    if (typeof marker !== "string" || !KNOWN_CONTRACTS.includes(marker as DerivedFromContract)) {
      return fail(
        "invalid-marker-value",
        `invalid \`anchorSource.derivedFromContract\` ${show(marker)} — expected ${KNOWN_CONTRACTS.map((c) => `"${c}"`).join(" | ")}.`,
      );
    }
  }

  return { ok: true, artifact: obj as unknown as LoadedProvenanceArtifact };
}

/**
 * #250 E — the fail-closed loader for a `<name>.anchormeta.json` SIDECAR. `parseProvenanceArtifact` cannot serve here: it
 * requires the artifact-only `schemaVersion`/`items`/`ignoredRanges`/`clusters` an {@link AnchorMeta} sidecar never carries.
 * The normalizer must not blind-cast a sidecar before rewriting it, so this guards the load-bearing shape: an object whose
 * `path`/`derivedFrom`/`derivedFromHash`/`textHash` are strings, `warnings` is an array, and — if present — `derivedFromContract`
 * is a known value. It does NOT validate the `sha256:` FORMAT of the hashes ({@link isWellFormedSha256} does that at the
 * point of use) nor the warning contents. The sidecar has NO schemaVersion — its legacy/new discriminant is marker PRESENCE
 * — so there is no version to fail closed on; the guard is purely structural. Returns the typed {@link AnchorMeta} on success.
 */
export type AnchorMetaParseErrorCode =
  | "not-an-object"
  | "missing-field" // a required string field (path / derivedFrom / derivedFromHash / textHash) is absent or not a string
  | "malformed-warnings" // `warnings` is absent or not an array
  | "invalid-marker-value"; // `derivedFromContract` present but outside KNOWN_CONTRACTS

export type AnchorMetaParseResult =
  | { ok: true; meta: AnchorMeta }
  | { ok: false; code: AnchorMetaParseErrorCode; message: string };

export function parseAnchorMeta(raw: unknown): AnchorMetaParseResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      code: "not-an-object",
      message: `sidecar must be a JSON object (got ${show(raw)}).`,
    };
  }
  const obj = raw as Record<string, unknown>;
  for (const field of ["path", "derivedFrom", "derivedFromHash", "textHash"] as const) {
    if (typeof obj[field] !== "string") {
      return {
        ok: false,
        code: "missing-field",
        message: `sidecar \`${field}\` must be a string (got ${show(obj[field])}).`,
      };
    }
  }
  if (!Array.isArray(obj.warnings)) {
    return {
      ok: false,
      code: "malformed-warnings",
      message: `sidecar \`warnings\` must be an array (got ${show(obj.warnings)}).`,
    };
  }
  const marker = obj.derivedFromContract;
  if (
    marker !== undefined &&
    (typeof marker !== "string" || !KNOWN_CONTRACTS.includes(marker as DerivedFromContract))
  ) {
    return {
      ok: false,
      code: "invalid-marker-value",
      message: `sidecar \`derivedFromContract\` ${show(marker)} — expected ${KNOWN_CONTRACTS.map((c) => `"${c}"`).join(" | ")}.`,
    };
  }
  return { ok: true, meta: obj as unknown as AnchorMeta };
}
