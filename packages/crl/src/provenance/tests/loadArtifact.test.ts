// #250 F — fail-closed loader for the versioned provenance envelope. Covers the version↔marker invariant, unknown/numeric
// versions (P6 fail-closed), root-shape guards (parse(null) must not crash), and success identity.
import { describe, it, expect } from "vitest";

import { PROVENANCE_SCHEMA_VERSION, PROVENANCE_LATEST_SCHEMA_VERSION } from "../artifact";
import { parseProvenanceArtifact, KNOWN_SCHEMA_VERSIONS } from "../loadArtifact";

/** A structurally-complete anchorSource; the loader only reads `derivedFromContract` off it, but keep it realistic. */
const anchor = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  path: "policy.txt",
  derivedFrom: "policy.txt",
  derivedFromHash: "sha256:aa",
  textHash: "sha256:aa",
  canonicalizer: "crl-anchor-docx-text",
  canonicalizerVersion: "1.0.0",
  offsetUnit: "utf8-byte",
  unicodeNormalization: "NFC",
  rangeConvention: "half-open",
  ...extra,
});

const artifact = (
  schemaVersion: unknown,
  anchorSource: unknown = anchor(),
): Record<string, unknown> => ({
  schemaVersion,
  policyId: "P",
  policyVersion: "1",
  anchorSource,
  items: [],
  ignoredRanges: [],
  clusters: [],
});

describe("#250 F — parseProvenanceArtifact", () => {
  it("constants: writer stamps 1.0, loader knows 1.0 + 1.1", () => {
    expect(PROVENANCE_SCHEMA_VERSION).toBe("1.0");
    expect(PROVENANCE_LATEST_SCHEMA_VERSION).toBe("1.1");
    expect(KNOWN_SCHEMA_VERSIONS).toEqual(["1.0", "1.1"]);
  });

  it("accepts a 1.0 record with NO marker", () => {
    const r = parseProvenanceArtifact(artifact("1.0"));
    expect(r.ok).toBe(true);
  });

  it("accepts a 1.1 record marked upstream-source", () => {
    const r = parseProvenanceArtifact(
      artifact("1.1", anchor({ derivedFromContract: "upstream-source" })),
    );
    expect(r.ok).toBe(true);
  });

  it("accepts a 1.1 record marked anchor-self", () => {
    const r = parseProvenanceArtifact(
      artifact("1.1", anchor({ derivedFromContract: "anchor-self" })),
    );
    expect(r.ok).toBe(true);
  });

  it("returns the SAME object it was handed on success (no copy)", () => {
    const input = artifact("1.0");
    const r = parseProvenanceArtifact(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.artifact).toBe(input);
  });

  // ── version↔marker invariant ──
  it("rejects a 1.0 record CARRYING a marker (marker-forbidden)", () => {
    const r = parseProvenanceArtifact(
      artifact("1.0", anchor({ derivedFromContract: "upstream-source" })),
    );
    expect(r).toMatchObject({ ok: false, code: "marker-forbidden" });
  });

  it("rejects a 1.1 record WITHOUT a marker (marker-required) — the merge landmine", () => {
    const r = parseProvenanceArtifact(artifact("1.1"));
    expect(r).toMatchObject({ ok: false, code: "marker-required" });
  });

  it("rejects a 1.1 record with an UNKNOWN marker value (invalid-marker-value)", () => {
    const r = parseProvenanceArtifact(
      artifact("1.1", anchor({ derivedFromContract: "docx-canonicalize" })),
    );
    expect(r).toMatchObject({ ok: false, code: "invalid-marker-value" });
  });

  it("rejects a non-string marker on 1.1 (invalid-marker-value)", () => {
    const r = parseProvenanceArtifact(artifact("1.1", anchor({ derivedFromContract: 7 })));
    expect(r).toMatchObject({ ok: false, code: "invalid-marker-value" });
  });

  // ── version fail-closed (P6) ──
  it("rejects the NUMERIC schemaVersion 1 (unsupported-schema-version)", () => {
    const r = parseProvenanceArtifact(artifact(1));
    expect(r).toMatchObject({ ok: false, code: "unsupported-schema-version" });
    if (!r.ok) expect(r.message).toContain("1");
  });

  it("rejects an unknown FUTURE version 2.0 fail-closed (not read as current)", () => {
    const r = parseProvenanceArtifact(artifact("2.0"));
    expect(r).toMatchObject({ ok: false, code: "unsupported-schema-version" });
    if (!r.ok) expect(r.message).toContain('"2.0"');
  });

  it("rejects an absent schemaVersion (missing-schema-version)", () => {
    const bad = artifact("1.0");
    delete bad.schemaVersion;
    const r = parseProvenanceArtifact(bad);
    expect(r).toMatchObject({ ok: false, code: "missing-schema-version" });
  });

  // ── root + anchorSource shape guards (never throw) ──
  it.each([
    ["null", null],
    ["an array", []],
    ["a string", "nope"],
    ["a number", 42],
    ["undefined", undefined],
  ])("rejects a root that is %s (not-an-object), without throwing", (_label, root) => {
    const r = parseProvenanceArtifact(root);
    expect(r).toMatchObject({ ok: false, code: "not-an-object" });
  });

  it("rejects an ABSENT anchorSource (malformed-anchor-source)", () => {
    const r = parseProvenanceArtifact({
      schemaVersion: "1.0",
      policyId: "P",
      policyVersion: "1",
      items: [],
      ignoredRanges: [],
      clusters: [],
    });
    expect(r).toMatchObject({ ok: false, code: "malformed-anchor-source" });
  });

  it.each([
    ["null", null],
    ["an array", []],
    ["a primitive", "x"],
  ])("rejects anchorSource that is %s (malformed-anchor-source)", (_label, as) => {
    const r = parseProvenanceArtifact(artifact("1.0", as));
    expect(r).toMatchObject({ ok: false, code: "malformed-anchor-source" });
  });

  // Container-field guards: a truncated/partial file must surface as a coded error, not a raw TypeError downstream.
  it.each(["items", "ignoredRanges", "clusters"])(
    "rejects an ABSENT container field %s (malformed-envelope)",
    (field) => {
      const bad = artifact("1.0");
      delete bad[field];
      const r = parseProvenanceArtifact(bad);
      expect(r).toMatchObject({ ok: false, code: "malformed-envelope" });
    },
  );

  it("rejects a NON-array container field (malformed-envelope)", () => {
    const bad = artifact("1.0");
    bad.clusters = { not: "an array" };
    const r = parseProvenanceArtifact(bad);
    expect(r).toMatchObject({ ok: false, code: "malformed-envelope" });
  });
});
