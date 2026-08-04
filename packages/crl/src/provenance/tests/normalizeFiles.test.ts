import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { isWellFormedSha256, metaPathForAnchor } from "../derivedFromPolicy";
import { parseAnchorMeta, parseProvenanceArtifact } from "../loadArtifact";
import { normalizeProvenanceFiles } from "../normalizeFiles";

const sha256 = (b: Buffer | string): string =>
  "sha256:" +
  createHash("sha256")
    .update(typeof b === "string" ? Buffer.from(b, "utf8") : b)
    .digest("hex");

const readJson = (p: string): Record<string, unknown> => JSON.parse(readFileSync(p, "utf8"));

/** A minimal loader-valid provenance artifact (only the fields the loader + the normalizer read matter). */
function artifactJson(
  anchorSource: Record<string, unknown>,
  schemaVersion = "1.0",
): Record<string, unknown> {
  return {
    schemaVersion,
    policyId: "P",
    policyVersion: "1",
    anchorSource,
    items: [],
    ignoredRanges: [],
    clusters: [],
  };
}

/** A minimal loader-valid `.anchormeta.json` sidecar record. */
function sidecarJson(over: Record<string, unknown>): Record<string, unknown> {
  return {
    path: "anchor.txt",
    canonicalizer: "crl-anchor-docx-text",
    canonicalizerVersion: "1.0.0",
    offsetUnit: "utf8-byte",
    unicodeNormalization: "NFC",
    rangeConvention: "half-open",
    warnings: [],
    ...over,
  };
}

describe("isWellFormedSha256", () => {
  it("accepts the canonicalizer's shape, rejects everything else", () => {
    expect(isWellFormedSha256("sha256:" + "a".repeat(64))).toBe(true);
    expect(isWellFormedSha256("sha256:" + "A".repeat(64))).toBe(false); // uppercase
    expect(isWellFormedSha256("sha256:" + "a".repeat(63))).toBe(false); // truncated
    expect(isWellFormedSha256("a".repeat(64))).toBe(false); // no prefix
    expect(isWellFormedSha256(undefined)).toBe(false);
    expect(isWellFormedSha256(123)).toBe(false);
  });
});

describe("parseAnchorMeta (fail-closed sidecar loader)", () => {
  it("loads a well-formed sidecar (with and without a marker)", () => {
    const base = sidecarJson({
      derivedFrom: "x.docx",
      derivedFromHash: sha256("d"),
      textHash: sha256("t"),
    });
    expect(parseAnchorMeta(base).ok).toBe(true);
    expect(parseAnchorMeta({ ...base, derivedFromContract: "upstream-source" }).ok).toBe(true);
  });
  it("rejects a non-object, a missing string field, a bad warnings, a bad marker", () => {
    expect(parseAnchorMeta(null)).toMatchObject({ ok: false, code: "not-an-object" });
    expect(parseAnchorMeta([])).toMatchObject({ ok: false, code: "not-an-object" });
    const good = sidecarJson({
      derivedFrom: "x.docx",
      derivedFromHash: sha256("d"),
      textHash: sha256("t"),
    });
    expect(parseAnchorMeta({ ...good, derivedFrom: 3 })).toMatchObject({
      ok: false,
      code: "missing-field",
    });
    expect(parseAnchorMeta({ ...good, warnings: "no" })).toMatchObject({
      ok: false,
      code: "malformed-warnings",
    });
    expect(parseAnchorMeta({ ...good, derivedFromContract: "nope" })).toMatchObject({
      ok: false,
      code: "invalid-marker-value",
    });
  });
});

describe("normalizeProvenanceFiles — input surface", () => {
  it("requires exactly one of artifactPath / sidecarPath", () => {
    expect(normalizeProvenanceFiles({})).toMatchObject({ ok: false, stage: "input" });
    expect(normalizeProvenanceFiles({ artifactPath: "a", sidecarPath: "b" })).toMatchObject({
      ok: false,
      stage: "input",
    });
  });
  it("returns a load error for an unloadable artifact", () => {
    const dir = mkdtempSync(join(tmpdir(), "crl-norm-"));
    try {
      const p = join(dir, "art.json");
      writeFileSync(p, "{ not json");
      expect(normalizeProvenanceFiles({ artifactPath: p })).toMatchObject({
        ok: false,
        stage: "load",
      });
      writeFileSync(
        p,
        JSON.stringify({
          schemaVersion: "9.9",
          anchorSource: {},
          items: [],
          ignoredRanges: [],
          clusters: [],
        }),
      );
      expect(normalizeProvenanceFiles({ artifactPath: p })).toMatchObject({
        ok: false,
        stage: "load",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("normalizeProvenanceFiles — artifact (anchor-self)", () => {
  let dir: string;
  let anchorText: Buffer;
  let textHash: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "crl-norm-"));
    anchorText = Buffer.from("the canonical anchor text\n", "utf8");
    writeFileSync(join(dir, "anchor.txt"), anchorText);
    textHash = sha256(anchorText);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const writeArtifact = (
    derivedFrom: string,
    schemaVersion = "1.0",
    extra: Record<string, unknown> = {},
  ): string => {
    const p = join(dir, "art.json");
    writeFileSync(
      p,
      JSON.stringify(
        artifactJson(
          { path: "anchor.txt", derivedFrom, derivedFromHash: textHash, textHash, ...extra },
          schemaVersion,
        ),
        null,
        2,
      ) + "\n",
    );
    return p;
  };

  it("repairs a DEAD absolute derivedFrom via the sibling anchor (closed-form), stamps 1.1 + anchor-self", () => {
    const p = writeArtifact("/gone/worktree/anchor.txt");
    const r = normalizeProvenanceFiles({ artifactPath: p });
    expect(r).toMatchObject({ ok: true, fullyNormalized: true });
    if (!r.ok) throw new Error("unreachable");
    expect(r.carriers).toEqual([{ path: p, kind: "artifact", changed: true, wrote: true }]);
    const out = readJson(p);
    expect(out.schemaVersion).toBe("1.1");
    expect((out.anchorSource as Record<string, unknown>).derivedFrom).toBe("anchor.txt");
    expect((out.anchorSource as Record<string, unknown>).derivedFromContract).toBe("anchor-self");
    expect(parseProvenanceArtifact(out).ok).toBe(true); // post-write loader-valid
  });

  it("rewrites an absolute-but-RESOLVING derivedFrom to carrier-relative (verified in place)", () => {
    const p = writeArtifact(resolve(dir, "anchor.txt"));
    const r = normalizeProvenanceFiles({ artifactPath: p });
    expect(r).toMatchObject({ ok: true, fullyNormalized: true });
    expect((readJson(p).anchorSource as Record<string, unknown>).derivedFrom).toBe("anchor.txt");
  });

  it("normalize-everything: an already-ok 1.0 record still gets the marker + version bump (path unchanged)", () => {
    const p = writeArtifact("anchor.txt", "1.0");
    const r = normalizeProvenanceFiles({ artifactPath: p });
    expect(r).toMatchObject({ ok: true, fullyNormalized: true });
    if (!r.ok) throw new Error("unreachable");
    expect(r.carriers[0]).toMatchObject({ changed: true, wrote: true });
    const out = readJson(p);
    expect(out.schemaVersion).toBe("1.1");
    expect((out.anchorSource as Record<string, unknown>).derivedFromContract).toBe("anchor-self");
    expect((out.anchorSource as Record<string, unknown>).derivedFrom).toBe("anchor.txt");
  });

  it("is idempotent — a second run is a byte-untouched no-op", () => {
    const p = writeArtifact("anchor.txt", "1.0");
    normalizeProvenanceFiles({ artifactPath: p });
    const after1 = readFileSync(p, "utf8");
    const r2 = normalizeProvenanceFiles({ artifactPath: p });
    expect(r2).toMatchObject({ ok: true, fullyNormalized: true });
    if (!r2.ok) throw new Error("unreachable");
    expect(r2.carriers[0]).toMatchObject({ changed: false, wrote: false });
    expect(readFileSync(p, "utf8")).toBe(after1);
  });

  it("--dry-run plans the change but writes nothing, and reports readiness", () => {
    const p = writeArtifact("/gone/worktree/anchor.txt");
    const before = readFileSync(p, "utf8");
    const r = normalizeProvenanceFiles({ artifactPath: p, dryRun: true });
    expect(r).toMatchObject({ ok: true, fullyNormalized: true, dryRun: true });
    if (!r.ok) throw new Error("unreachable");
    expect(r.carriers[0]).toMatchObject({ changed: true, wrote: false });
    expect(readFileSync(p, "utf8")).toBe(before); // untouched
  });

  it("--anchor override locates the anchor when the sibling name differs", () => {
    writeFileSync(join(dir, "renamed.txt"), anchorText);
    const p = writeArtifact("/gone/anchor.txt", "1.0", { path: "anchor.txt" });
    const r = normalizeProvenanceFiles({ artifactPath: p, anchorPath: join(dir, "renamed.txt") });
    expect(r).toMatchObject({ ok: true, fullyNormalized: true });
    expect((readJson(p).anchorSource as Record<string, unknown>).derivedFrom).toBe("renamed.txt");
  });

  it("worklists anchor-not-found when no anchor can be located/verified (byte-untouched)", () => {
    const p = writeArtifact("/gone/anchor.txt", "1.0", { path: "missing.txt" });
    const before = readFileSync(p, "utf8");
    const r = normalizeProvenanceFiles({ artifactPath: p });
    expect(r).toMatchObject({ ok: true, fullyNormalized: false });
    if (!r.ok) throw new Error("unreachable");
    expect(r.worklist[0]).toMatchObject({ reason: "anchor-not-found", kind: "artifact" });
    expect(r.carriers[0]).toMatchObject({ changed: false, wrote: false });
    expect(readFileSync(p, "utf8")).toBe(before);
  });

  it("worklists no-oracle for a malformed derivedFromHash", () => {
    const p = writeArtifact("anchor.txt", "1.0", { derivedFromHash: "sha256:notahash" });
    const r = normalizeProvenanceFiles({ artifactPath: p });
    expect(r).toMatchObject({ ok: true, fullyNormalized: false });
    if (!r.ok) throw new Error("unreachable");
    expect(r.worklist[0]).toMatchObject({ reason: "no-oracle" });
  });

  it("worklists marker-tell-disagreement for a 1.1 record whose marker contradicts the tell", () => {
    // 1.1 + marker present loads; derivedFromHash === textHash ⇒ tell anchor-self, but the marker says upstream-source.
    const p = writeArtifact("anchor.txt", "1.1", { derivedFromContract: "upstream-source" });
    const r = normalizeProvenanceFiles({ artifactPath: p });
    expect(r).toMatchObject({ ok: true, fullyNormalized: false });
    if (!r.ok) throw new Error("unreachable");
    expect(r.worklist[0]).toMatchObject({ reason: "marker-tell-disagreement" });
  });

  it("repairs a LEXICALLY-OK-but-WRONG-CARRIER anchor-self path (keyed on verification, not lexical class)", () => {
    // "sub/anchor.txt" is lexically ok (relative POSIX) but resolves against the carrier to a nonexistent file → NOT
    // verified-as-is → closed-form repair to the verified sibling anchor. This is exactly A's dest-less MCP output.
    const p = writeArtifact("sub/anchor.txt", "1.0");
    const r = normalizeProvenanceFiles({ artifactPath: p });
    expect(r).toMatchObject({ ok: true, fullyNormalized: true });
    expect((readJson(p).anchorSource as Record<string, unknown>).derivedFrom).toBe("anchor.txt");
  });

  it("operational load error when anchorSource.path is not a string (never throws past the contract)", () => {
    const p = writeArtifact("anchor.txt", "1.0", { path: 123 });
    const r = normalizeProvenanceFiles({ artifactPath: p });
    expect(r).toMatchObject({ ok: false, stage: "load" });
  });

  it("operational load error when the discovered sidecar path is a DIRECTORY (not silently skipped)", () => {
    const p = writeArtifact("anchor.txt", "1.0");
    mkdirSync(join(dir, "anchor.anchormeta.json")); // a directory where the sidecar would be
    const r = normalizeProvenanceFiles({ artifactPath: p });
    expect(r).toMatchObject({ ok: false, stage: "load" });
    if (r.ok) throw new Error("unreachable");
    expect(r.message).toMatch(/not a regular file/);
  });
});

describe("normalizeProvenanceFiles — sidecar (upstream-source)", () => {
  let dir: string;
  let docxHash: string;
  let textHash: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "crl-norm-"));
    const docx = Buffer.from("PK fake docx bytes", "utf8");
    writeFileSync(join(dir, "source.docx"), docx);
    docxHash = sha256(docx);
    textHash = sha256("the canonical text");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const writeSidecar = (over: Record<string, unknown>): string => {
    const p = join(dir, "anchor.anchormeta.json");
    writeFileSync(
      p,
      JSON.stringify(sidecarJson({ derivedFromHash: docxHash, textHash, ...over }), null, 2) + "\n",
    );
    return p;
  };

  it("repairs an absolute-but-resolving .docx derivedFrom, stamps upstream-source by construction", () => {
    const p = writeSidecar({ derivedFrom: resolve(dir, "source.docx") });
    const r = normalizeProvenanceFiles({ sidecarPath: p });
    expect(r).toMatchObject({ ok: true, fullyNormalized: true });
    if (!r.ok) throw new Error("unreachable");
    expect(r.carriers).toEqual([{ path: p, kind: "sidecar", changed: true, wrote: true }]);
    const out = readJson(p);
    expect(out.derivedFrom).toBe("source.docx");
    expect(out.derivedFromContract).toBe("upstream-source");
    expect(parseAnchorMeta(out).ok).toBe(true);
  });

  it("worklists dead-path-needs-discovery for an upstream path that resolves nowhere", () => {
    const p = writeSidecar({ derivedFrom: "/gone/source.docx" });
    const before = readFileSync(p, "utf8");
    const r = normalizeProvenanceFiles({ sidecarPath: p });
    expect(r).toMatchObject({ ok: true, fullyNormalized: false });
    if (!r.ok) throw new Error("unreachable");
    expect(r.worklist[0]).toMatchObject({ reason: "dead-path-needs-discovery", kind: "sidecar" });
    expect(readFileSync(p, "utf8")).toBe(before);
  });

  it("worklists hash-mismatch when the path resolves but the bytes differ (never re-points)", () => {
    const p = writeSidecar({
      derivedFrom: resolve(dir, "source.docx"),
      derivedFromHash: sha256("some other content"),
    });
    const r = normalizeProvenanceFiles({ sidecarPath: p });
    expect(r).toMatchObject({ ok: true, fullyNormalized: false });
    if (!r.ok) throw new Error("unreachable");
    expect(r.worklist[0]).toMatchObject({ reason: "hash-mismatch" });
  });

  it("worklists sidecar-hash-equals-text for an unmarked sidecar whose derivedFromHash === textHash", () => {
    const p = writeSidecar({ derivedFrom: resolve(dir, "source.docx"), derivedFromHash: textHash });
    const r = normalizeProvenanceFiles({ sidecarPath: p });
    expect(r).toMatchObject({ ok: true, fullyNormalized: false });
    if (!r.ok) throw new Error("unreachable");
    expect(r.worklist[0]).toMatchObject({ reason: "sidecar-hash-equals-text" });
  });

  it("worklists a sidecar that ALREADY CLAIMS anchor-self with equal hashes (marker does not bypass the by-construction rule)", () => {
    // The guard must fire regardless of an existing (hand-edited/foreign) marker — the marker+tell agree here, which is
    // exactly the case that slipped through when the check lived only in the marker-absent branch.
    const p = writeSidecar({
      derivedFrom: resolve(dir, "source.docx"),
      derivedFromHash: textHash,
      derivedFromContract: "anchor-self",
    });
    const r = normalizeProvenanceFiles({ sidecarPath: p });
    expect(r).toMatchObject({ ok: true, fullyNormalized: false });
    if (!r.ok) throw new Error("unreachable");
    expect(r.worklist[0]).toMatchObject({ reason: "sidecar-hash-equals-text" });
  });

  it("worklists marker-tell-disagreement for a sidecar recording a non-upstream-source marker", () => {
    // derivedFromHash ≠ textHash (tell upstream-source), but the sidecar wrongly claims anchor-self → adjudicate, don't overwrite.
    const p = writeSidecar({
      derivedFrom: resolve(dir, "source.docx"),
      derivedFromContract: "anchor-self",
    });
    const r = normalizeProvenanceFiles({ sidecarPath: p });
    expect(r).toMatchObject({ ok: true, fullyNormalized: false });
    if (!r.ok) throw new Error("unreachable");
    expect(r.worklist[0]).toMatchObject({ reason: "marker-tell-disagreement" });
  });
});

describe("normalizeProvenanceFiles — artifact + discovered sidecar together", () => {
  it("normalizes both the artifact (anchor-self) and its sidecar (upstream-source) beside the anchor", () => {
    const dir = mkdtempSync(join(tmpdir(), "crl-norm-"));
    try {
      const anchor = Buffer.from("anchor text\n", "utf8");
      const docx = Buffer.from("fake docx", "utf8");
      writeFileSync(join(dir, "anchor.txt"), anchor);
      writeFileSync(join(dir, "source.docx"), docx);
      const textHash = sha256(anchor);
      const docxHash = sha256(docx);

      const artPath = join(dir, "art.json");
      writeFileSync(
        artPath,
        JSON.stringify(
          artifactJson({
            path: "anchor.txt",
            derivedFrom: "/gone/anchor.txt",
            derivedFromHash: textHash,
            textHash,
          }),
          null,
          2,
        ) + "\n",
      );
      const sidePath = metaPathForAnchor(join(dir, "anchor.txt")); // anchor.anchormeta.json
      writeFileSync(
        sidePath,
        JSON.stringify(
          sidecarJson({
            derivedFrom: resolve(dir, "source.docx"),
            derivedFromHash: docxHash,
            textHash,
          }),
          null,
          2,
        ) + "\n",
      );

      const r = normalizeProvenanceFiles({ artifactPath: artPath });
      expect(r).toMatchObject({ ok: true, fullyNormalized: true });
      if (!r.ok) throw new Error("unreachable");
      expect(r.carriers.map((c) => c.kind)).toEqual(["artifact", "sidecar"]);
      expect((readJson(artPath).anchorSource as Record<string, unknown>).derivedFrom).toBe(
        "anchor.txt",
      );
      expect(readJson(sidePath).derivedFrom).toBe("source.docx");
      expect(readJson(sidePath).derivedFromContract).toBe("upstream-source");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("normalizeProvenanceFiles — E2 discovery (--search-root)", () => {
  let dir: string;
  let docx: Buffer;
  let docxHash: string;
  let textHash: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "crl-norm-"));
    docx = Buffer.from("PK the lost upstream docx", "utf8");
    docxHash = sha256(docx);
    textHash = sha256("the canonical text");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // A sidecar whose derivedFrom is a DEAD absolute path (resolves nowhere) — the E1 dead-path-needs-discovery case.
  const writeDeadSidecar = (over: Record<string, unknown> = {}): string => {
    const p = join(dir, "anchor.anchormeta.json");
    writeFileSync(
      p,
      JSON.stringify(
        sidecarJson({
          derivedFrom: "/gone/worktree/source.docx",
          derivedFromHash: docxHash,
          textHash,
          ...over,
        }),
        null,
        2,
      ) + "\n",
    );
    return p;
  };

  it("relocates a DEAD upstream path under --search-root and rewrites it carrier-relative", () => {
    const p = writeDeadSidecar();
    mkdirSync(join(dir, "found"), { recursive: true });
    writeFileSync(join(dir, "found", "source.docx"), docx); // the source, moved here
    const r = normalizeProvenanceFiles({ sidecarPath: p, searchRoot: dir });
    expect(r).toMatchObject({ ok: true, fullyNormalized: true });
    if (!r.ok) throw new Error("unreachable");
    expect(r.carriers[0]).toMatchObject({ changed: true, wrote: true });
    const out = readJson(p);
    expect(out.derivedFrom).toBe("found/source.docx"); // carrier-relative POSIX to the discovered location
    expect(out.derivedFromContract).toBe("upstream-source");
    expect(parseAnchorMeta(out).ok).toBe(true);
  });

  it("--dry-run + --search-root reports the relocate as ready but writes nothing", () => {
    const p = writeDeadSidecar();
    mkdirSync(join(dir, "found"), { recursive: true });
    writeFileSync(join(dir, "found", "source.docx"), docx);
    const before = readFileSync(p, "utf8");
    const r = normalizeProvenanceFiles({ sidecarPath: p, searchRoot: dir, dryRun: true });
    expect(r).toMatchObject({ ok: true, fullyNormalized: true, dryRun: true });
    if (!r.ok) throw new Error("unreachable");
    expect(r.carriers[0]).toMatchObject({ changed: true, wrote: false });
    expect(readFileSync(p, "utf8")).toBe(before);
  });

  it("keeps dead-path-needs-discovery (byte-untouched) when the source is NOT under the search root", () => {
    const p = writeDeadSidecar();
    const empty = mkdtempSync(join(tmpdir(), "crl-empty-"));
    try {
      const before = readFileSync(p, "utf8");
      const r = normalizeProvenanceFiles({ sidecarPath: p, searchRoot: empty });
      expect(r).toMatchObject({ ok: true, fullyNormalized: false });
      if (!r.ok) throw new Error("unreachable");
      expect(r.worklist[0]).toMatchObject({ reason: "dead-path-needs-discovery", kind: "sidecar" });
      expect(readFileSync(p, "utf8")).toBe(before);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("worklists AMBIGUOUS (byte-untouched) when >1 copy hashes to the oracle under the root", () => {
    const p = writeDeadSidecar();
    mkdirSync(join(dir, "a"), { recursive: true });
    mkdirSync(join(dir, "b"), { recursive: true });
    writeFileSync(join(dir, "a", "source.docx"), docx);
    writeFileSync(join(dir, "b", "source.docx"), docx);
    const before = readFileSync(p, "utf8");
    const r = normalizeProvenanceFiles({ sidecarPath: p, searchRoot: dir });
    expect(r).toMatchObject({ ok: true, fullyNormalized: false });
    if (!r.ok) throw new Error("unreachable");
    expect(r.worklist[0]).toMatchObject({ reason: "ambiguous", kind: "sidecar" });
    expect(readFileSync(p, "utf8")).toBe(before);
  });

  it("returns an input error for a --search-root that is not a directory", () => {
    const p = writeDeadSidecar();
    expect(
      normalizeProvenanceFiles({ sidecarPath: p, searchRoot: join(dir, "nope") }),
    ).toMatchObject({
      ok: false,
      stage: "input",
    });
    expect(normalizeProvenanceFiles({ sidecarPath: p, searchRoot: p })).toMatchObject({
      ok: false,
      stage: "input",
    }); // a file, not a dir
  });

  it("normalizes a RESOLVABLE path directly even with --search-root present (a non-dead record is closed-form)", () => {
    // The source resolves in place → closed-form; --search-root is present but the record isn't dead. (This asserts the
    // OUTCOME — a resolvable record is normalized in place — not that the walk was skipped; the gating is unit-covered by
    // the plan-then-discover structure, where only dead-path plans carry a discoveryTarget.)
    const p = join(dir, "anchor.anchormeta.json");
    writeFileSync(join(dir, "source.docx"), docx);
    writeFileSync(
      p,
      JSON.stringify(
        sidecarJson({
          derivedFrom: resolve(dir, "source.docx"),
          derivedFromHash: docxHash,
          textHash,
        }),
        null,
        2,
      ) + "\n",
    );
    const r = normalizeProvenanceFiles({ sidecarPath: p, searchRoot: dir });
    expect(r).toMatchObject({ ok: true, fullyNormalized: true });
    expect(readJson(p).derivedFrom).toBe("source.docx");
  });

  it("worklists BUDGET-EXHAUSTED (byte-untouched) when the default-budget scan can't complete (source below maxDepth)", () => {
    // The normalizer uses the frozen DEFAULT_DISCOVERY_BUDGET (maxDepth 64); a source 65 dirs deep trips it, so enumeration
    // never completes → budget-exhausted, exercising applyDiscovery's budget-exhausted branch + reason wiring end-to-end.
    const p = writeDeadSidecar();
    const deep = join(dir, Array(65).fill("d").join("/"));
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(deep, "source.docx"), docx);
    const before = readFileSync(p, "utf8");
    const r = normalizeProvenanceFiles({ sidecarPath: p, searchRoot: dir });
    expect(r).toMatchObject({ ok: true, fullyNormalized: false });
    if (!r.ok) throw new Error("unreachable");
    expect(r.worklist[0]).toMatchObject({ reason: "budget-exhausted", kind: "sidecar" });
    expect(readFileSync(p, "utf8")).toBe(before);
  });
});

describe("normalizeProvenanceFiles — plan-phase load ordering (E2 restructure)", () => {
  // DELIBERATE divergence from E1: planning now loads BOTH carriers before any write (Phase 1), so an unparseable sidecar
  // fails the whole run byte-untouched rather than leaving a half-migrated pair (E1 wrote the artifact, THEN hit the sidecar
  // and reported the artifact as "already normalized this run"). All-or-nothing is the better contract; this pins it.
  it("an unparseable sidecar blocks the artifact write entirely (artifact left byte-untouched)", () => {
    const dir = mkdtempSync(join(tmpdir(), "crl-norm-"));
    try {
      const anchor = Buffer.from("anchor text\n", "utf8");
      writeFileSync(join(dir, "anchor.txt"), anchor);
      const textHash = sha256(anchor);
      const artPath = join(dir, "art.json");
      writeFileSync(
        artPath,
        JSON.stringify(
          artifactJson({
            path: "anchor.txt",
            derivedFrom: "/gone/anchor.txt", // repairable closed-form, WOULD migrate if the sidecar were fine
            derivedFromHash: textHash,
            textHash,
          }),
          null,
          2,
        ) + "\n",
      );
      writeFileSync(metaPathForAnchor(join(dir, "anchor.txt")), "{ not json"); // corrupt sidecar beside the anchor
      const before = readFileSync(artPath, "utf8");
      const r = normalizeProvenanceFiles({ artifactPath: artPath });
      expect(r).toMatchObject({ ok: false, stage: "load" });
      expect(readFileSync(artPath, "utf8")).toBe(before); // NOT migrated — the pair is all-or-nothing
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
