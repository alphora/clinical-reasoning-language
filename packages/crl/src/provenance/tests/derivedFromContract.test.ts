import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveCelImports } from "../../cel/imports";
import type { AnchorSourceMeta, ProvenanceArtifact } from "../artifact";
import { DERIVED_FROM_GATE_ENFORCED, metaPathForAnchor } from "../derivedFromPolicy";
import { buildProvenanceIndex, type ProvenanceIndex } from "../indexer";
import { sidecarDisagreementFindings, validateProvenanceFiles } from "../validateFiles";
import { validateProvenance, type ProvenanceFinding } from "../validators";

const sha256 = (b: Buffer | string): string =>
  "sha256:" +
  createHash("sha256")
    .update(typeof b === "string" ? Buffer.from(b, "utf8") : b)
    .digest("hex");

const DF_SEV = DERIVED_FROM_GATE_ENFORCED ? "error" : "warning";
const HASH_A = sha256("upstream docx A"); // a well-formed upstream oracle
const HASH_B = sha256("upstream docx B"); // a DIFFERENT well-formed upstream oracle

// ─────────────────────────────────────────────────────────────────────────────
// D1 — the artifact-local contract-tell invariant (pure, via validateProvenance)
// ─────────────────────────────────────────────────────────────────────────────
const POLICY_CRL = `# P
library "Policy".
concept "Crit":
- type is Condition.
- code is \`c\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`a\`.
decision "Dec":
first:
- when "Crit" then recommend activity "Approve".
- otherwise then recommend activity "Approve".`;
const CEL = `# C
library "C".
covers "Policy".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "c":
- subject is "Pat".
- result is "Dec" is "Approve".`;

describe("validateProvenance — #250 Todo D1 (contract-tell invariant)", () => {
  let idx: ProvenanceIndex;
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "crl-d1-"));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "p", version: "0.0.0", private: true }),
    );
    writeFileSync(join(root, "policy.crl"), POLICY_CRL);
    const celPath = join(root, "f.cel");
    writeFileSync(celPath, CEL);
    idx = buildProvenanceIndex(resolveCelImports(celPath));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const ANCHOR = "Approve when criteria are met.\n";
  // A meta whose textHash matches ANCHOR (so anchor-hash-drift stays green), with caller-controlled marker + oracle.
  const metaFor = (over: Partial<AnchorSourceMeta>): AnchorSourceMeta =>
    ({
      path: "anchor.txt",
      derivedFrom: "source.docx",
      derivedFromHash: HASH_A,
      canonicalizer: "crl-anchor-docx-text",
      canonicalizerVersion: "1.0.0",
      textHash: sha256(ANCHOR),
      offsetUnit: "utf8-byte",
      unicodeNormalization: "NFC",
      rangeConvention: "half-open",
      ...over,
    }) as AnchorSourceMeta;
  const art = (over: Partial<AnchorSourceMeta>): ProvenanceArtifact =>
    ({
      schemaVersion: over.derivedFromContract ? "1.1" : "1.0",
      policyId: "P",
      policyVersion: "1",
      anchorSource: metaFor(over),
      items: [],
      ignoredRanges: [],
      clusters: [],
    }) as ProvenanceArtifact;
  const kinds = (over: Partial<AnchorSourceMeta>): string[] =>
    validateProvenance(art(over), idx, ANCHOR).map((f) => f.kind);
  const has = (over: Partial<AnchorSourceMeta>): boolean =>
    kinds(over).includes("derived-from-contract-mismatch");

  it("the crafted anchor-self forgery C alone misses → derived-from-contract-mismatch", () => {
    // marker claims anchor-self, but derivedFromHash (some other file's bytes) ≠ textHash → the anchor-self claim is a lie.
    // C would resolve+hash the named file green; only the tell invariant catches the contradiction.
    expect(has({ derivedFromContract: "anchor-self", derivedFromHash: HASH_A })).toBe(true);
  });

  it("marker upstream-source but derivedFromHash === textHash → fires (bidirectional)", () => {
    expect(has({ derivedFromContract: "upstream-source", derivedFromHash: sha256(ANCHOR) })).toBe(
      true,
    );
  });

  it("consistent anchor-self (derivedFromHash === textHash) → NO finding", () => {
    expect(has({ derivedFromContract: "anchor-self", derivedFromHash: sha256(ANCHOR) })).toBe(
      false,
    );
  });

  it("consistent upstream-source (derivedFromHash ≠ textHash) → NO finding", () => {
    expect(has({ derivedFromContract: "upstream-source", derivedFromHash: HASH_A })).toBe(false);
  });

  it("NO marker (legacy 1.0) → NO finding even when the tell would be upstream-source", () => {
    expect(has({ derivedFromContract: undefined, derivedFromHash: HASH_A })).toBe(false);
  });

  it("malformed derivedFromHash + marker present → D1 SKIPPED (oracle-malformed owns it)", () => {
    const k = kinds({ derivedFromContract: "anchor-self", derivedFromHash: "sha256:0" });
    expect(k).toContain("derived-from-oracle-malformed");
    expect(k).not.toContain("derived-from-contract-mismatch");
  });

  it("malformed textHash + anchor-self marker + well-formed oracle → D1 SKIPPED (drift owns textHash)", () => {
    const k = kinds({
      derivedFromContract: "anchor-self",
      derivedFromHash: HASH_A,
      textHash: "sha256:WRONG",
    });
    expect(k).toContain("anchor-hash-drift");
    expect(k).not.toContain("derived-from-contract-mismatch");
  });

  it("the fired finding is gated severity + class integrity", () => {
    const f = validateProvenance(
      art({ derivedFromContract: "anchor-self", derivedFromHash: HASH_A }),
      idx,
      ANCHOR,
    ).find((x) => x.kind === "derived-from-contract-mismatch");
    expect(f?.severity).toBe(DF_SEV);
    expect(f?.class).toBe("integrity");
    expect(f?.message).toMatch(/anchor-self/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D2 — the sidecar↔artifact record cross-check (fs, via sidecarDisagreementFindings)
// ─────────────────────────────────────────────────────────────────────────────
function fileSymlinkAvailable(): boolean {
  const d = mkdtempSync(join(tmpdir(), "crl-fsym-"));
  try {
    writeFileSync(join(d, "t"), "x");
    symlinkSync(join(d, "t"), join(d, "l"), "file");
    return true;
  } catch {
    return false;
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}
const FSYM = fileSymlinkAvailable();

describe("sidecarDisagreementFindings — #250 Todo D2 (record cross-check)", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "crl-d2-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const anchorPath = () => join(dir, "anchor.txt");
  const artPath = () => join(dir, "art.json");
  // D2 discovers the sidecar from the artifact's RECORDED anchor: resolve(dirname(artPath), anchorSource.path). With
  // path:"anchor.txt" and artPath dir/art.json that resolves to dir/anchor.txt — the same place writeSidecar writes.
  const artifactFor = (anchorSource: Partial<AnchorSourceMeta>): ProvenanceArtifact =>
    ({ anchorSource: { path: "anchor.txt", ...anchorSource } }) as unknown as ProvenanceArtifact;

  /** Write a valid `.anchormeta.json` beside the anchor, with field overrides. Defaults are a well-formed upstream sidecar. */
  const writeSidecar = (over: Record<string, unknown> = {}, raw?: string) => {
    const p = metaPathForAnchor(anchorPath());
    if (raw !== undefined) {
      writeFileSync(p, raw);
      return p;
    }
    writeFileSync(
      p,
      JSON.stringify({
        path: "anchor.txt",
        derivedFrom: "../src/source.docx", // a DIFFERENT carrier-relative path than the artifact records — on purpose
        derivedFromHash: HASH_A,
        textHash: sha256("the anchor text"),
        warnings: [],
        ...over,
      }),
    );
    return p;
  };
  const kindsFor = (anchorSource: Partial<AnchorSourceMeta>): string[] =>
    sidecarDisagreementFindings(artPath(), artifactFor(anchorSource)).map((f) => f.kind);

  const UPSTREAM = { derivedFromContract: "upstream-source" as const, derivedFromHash: HASH_A };

  it("upstream artifact + agreeing sidecar (SAME oracle, DIFFERENT recorded path) → NO finding (compares HASHES not paths)", () => {
    writeSidecar({ derivedFrom: "wildly/different/path.docx", derivedFromHash: HASH_A });
    expect(kindsFor(UPSTREAM)).toEqual([]);
  });

  it("upstream artifact + disagreeing sidecar oracle → derived-from-sidecar-disagreement", () => {
    writeSidecar({ derivedFromHash: HASH_B });
    expect(kindsFor(UPSTREAM)).toEqual(["derived-from-sidecar-disagreement"]);
  });

  it("no sidecar present → NO finding (Model-A / absence is legitimate)", () => {
    expect(kindsFor(UPSTREAM)).toEqual([]);
  });

  it("anchor-self artifact + a sidecar present → SKIPPED (cross-contract)", () => {
    writeSidecar({ derivedFromHash: HASH_B }); // would disagree IF it were compared
    expect(
      kindsFor({ derivedFromContract: "anchor-self", derivedFromHash: sha256("self") }),
    ).toEqual([]);
  });

  it("legacy 1.0 upstream artifact (no marker; tell → upstream) + agreeing sidecar → NO finding; disagreeing → disagreement", () => {
    // marker ?? tell: dfHash ≠ textHash → tell is upstream-source, so D2 runs WITHOUT a marker.
    const legacy = { derivedFromHash: HASH_A, textHash: sha256("anchor") };
    writeSidecar({ derivedFromHash: HASH_A });
    expect(kindsFor(legacy)).toEqual([]);
    writeSidecar({ derivedFromHash: HASH_B });
    expect(kindsFor(legacy)).toEqual(["derived-from-sidecar-disagreement"]);
  });

  it("legacy 1.0 artifact with malformed textHash → SKIPPED, no false disagreement (drift owns it)", () => {
    // The regression the design review flagged: without the both-hashes guard, tell would mechanically be upstream-source
    // and a real anchor-self artifact's oracle would falsely 'disagree' with the sidecar. Guarded → [].
    writeSidecar({ derivedFromHash: HASH_B });
    expect(kindsFor({ derivedFromHash: HASH_A, textHash: "sha256:WRONG" })).toEqual([]);
  });

  it("artifact malformed oracle → SKIPPED (oracle-malformed owns it)", () => {
    writeSidecar({ derivedFromHash: HASH_B });
    expect(
      kindsFor({ derivedFromContract: "upstream-source", derivedFromHash: "sha256:0" }),
    ).toEqual([]);
  });

  it("sidecar with invalid JSON → derived-from-sidecar-malformed", () => {
    writeSidecar({}, "{ not json");
    expect(kindsFor(UPSTREAM)).toEqual(["derived-from-sidecar-malformed"]);
  });

  it("sidecar with a shape parseAnchorMeta rejects → derived-from-sidecar-malformed", () => {
    writeSidecar({}, JSON.stringify({ path: "anchor.txt", warnings: [] })); // missing derivedFrom/hashes
    expect(kindsFor(UPSTREAM)).toEqual(["derived-from-sidecar-malformed"]);
  });

  it("sidecar with a malformed derivedFromHash oracle → derived-from-sidecar-malformed (NOT disagreement)", () => {
    writeSidecar({ derivedFromHash: "sha256:0" });
    expect(kindsFor(UPSTREAM)).toEqual(["derived-from-sidecar-malformed"]);
  });

  it("sidecar recording a non-upstream-source contract → derived-from-sidecar-malformed (upstream by construction)", () => {
    writeSidecar({ derivedFromContract: "anchor-self" });
    expect(kindsFor(UPSTREAM)).toEqual(["derived-from-sidecar-malformed"]);
  });

  it("sidecar with derivedFromHash === textHash (anchor-self tell, no marker) → derived-from-sidecar-malformed", () => {
    const h = sha256("both");
    writeSidecar({ derivedFromHash: h, textHash: h });
    expect(kindsFor(UPSTREAM)).toEqual(["derived-from-sidecar-malformed"]);
  });

  it("sidecar with a FORGED upstream-source marker but an anchor-self tell → derived-from-sidecar-malformed (marker can't launder)", () => {
    const h = sha256("both");
    writeSidecar({ derivedFromContract: "upstream-source", derivedFromHash: h, textHash: h });
    expect(kindsFor(UPSTREAM)).toEqual(["derived-from-sidecar-malformed"]);
  });

  it("sidecar with a malformed textHash (no marker) → derived-from-sidecar-malformed (own contract unconfirmable)", () => {
    writeSidecar({ textHash: "sha256:WRONG" });
    expect(kindsFor(UPSTREAM)).toEqual(["derived-from-sidecar-malformed"]);
  });

  it("sidecar with an upstream-source marker but a malformed textHash → derived-from-sidecar-malformed (marker insufficient)", () => {
    writeSidecar({ derivedFromContract: "upstream-source", textHash: "sha256:WRONG" });
    expect(kindsFor(UPSTREAM)).toEqual(["derived-from-sidecar-malformed"]);
  });

  it("sidecar path is a DIRECTORY → derived-from-sidecar-unreadable", () => {
    mkdirSync(metaPathForAnchor(anchorPath()));
    expect(kindsFor(UPSTREAM)).toEqual(["derived-from-sidecar-unreadable"]);
  });

  it("an OVERSIZED sidecar (> 1 MB cap) → derived-from-sidecar-unreadable (bounded read, not slurped)", () => {
    writeSidecar({}, "x".repeat(1_000_001));
    expect(kindsFor(UPSTREAM)).toEqual(["derived-from-sidecar-unreadable"]);
  });

  it.skipIf(!FSYM)(
    "a DANGLING sidecar symlink → derived-from-sidecar-unreadable (not treated as absent)",
    () => {
      symlinkSync(join(dir, "gone.json"), metaPathForAnchor(anchorPath()), "file");
      expect(kindsFor(UPSTREAM)).toEqual(["derived-from-sidecar-unreadable"]);
    },
  );

  it("a disagreement finding is gated severity + class integrity", () => {
    writeSidecar({ derivedFromHash: HASH_B });
    const f = sidecarDisagreementFindings(artPath(), artifactFor(UPSTREAM))[0];
    expect(f.severity).toBe(DF_SEV);
    expect(f.class).toBe("integrity");
    expect(f.message).toContain(HASH_B);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D2 end-to-end through validateProvenanceFiles — proves the finding SURVIVES the
// resolveProvenance merge into r.findings + the recomputed counts/pass (the direct
// tests above call the helper, so a dropped merge would leave them green).
// ─────────────────────────────────────────────────────────────────────────────
describe("Todo D2 end-to-end via validateProvenanceFiles", () => {
  const POLICY = `# P
library "Policy".
concept "Crit":
- type is Condition.
- code is \`c\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`a\`.
decision "Dec":
first:
- when "Crit" then recommend activity "Approve".
- otherwise then recommend activity "Approve".`;
  const CELE2E = `# C
library "C".
covers "Policy".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "c":
- subject is "Pat".
- result is "Dec" is "Approve".`;

  it("a disagreeing sidecar surfaces derived-from-sidecar-disagreement through the pipeline + drives pass", () => {
    const dir = mkdtempSync(join(tmpdir(), "crl-d2-e2e-"));
    try {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "p", version: "0.0.0", private: true }),
      );
      writeFileSync(join(dir, "policy.crl"), POLICY);
      const celPath = join(dir, "f.cel");
      writeFileSync(celPath, CELE2E);
      const anchorText = "Approve when criteria are met.\n";
      const anchorPath = join(dir, "anchor.txt");
      writeFileSync(anchorPath, anchorText);
      // A REAL upstream source so the artifact's own C trail passes — only the SIDECAR disagrees.
      const srcBytes = Buffer.from("the ACTUAL upstream source bytes", "utf8");
      writeFileSync(join(dir, "source.docx"), srcBytes);
      // The sidecar records a DIFFERENT oracle → D2 disagreement.
      writeFileSync(
        metaPathForAnchor(anchorPath),
        JSON.stringify({
          path: "anchor.txt",
          derivedFrom: "source.docx",
          derivedFromHash: sha256("a STALE oracle the sidecar still holds"),
          textHash: sha256(anchorText),
          warnings: [],
          derivedFromContract: "upstream-source",
        }),
      );
      const artifactPath = join(dir, "art.json");
      writeFileSync(
        artifactPath,
        JSON.stringify(
          {
            schemaVersion: "1.1",
            policyId: "P",
            policyVersion: "1",
            anchorSource: {
              path: "anchor.txt",
              derivedFrom: "source.docx",
              derivedFromContract: "upstream-source",
              derivedFromHash: sha256(srcBytes), // matches the real file → C passes
              textHash: sha256(anchorText), // matches → no anchor-hash-drift
              canonicalizer: "crl-anchor-docx-text",
              canonicalizerVersion: "1.0.0",
              offsetUnit: "utf8-byte",
              unicodeNormalization: "NFC",
              rangeConvention: "half-open",
            },
            items: [],
            ignoredRanges: [],
            clusters: [],
          },
          null,
          2,
        ) + "\n",
      );

      for (const mode of ["worklist", "final"] as const) {
        const r = validateProvenanceFiles(artifactPath, celPath, anchorPath, mode);
        const d = r.findings.find((f) => f.kind === "derived-from-sidecar-disagreement");
        expect(d, `${mode} mode should carry the D2 finding`).toBeDefined();
        expect(d?.class).toBe("integrity");
        expect(d?.severity).toBe(DF_SEV);
      }

      // In WORKLIST mode the coverage backlog softens to warning, so the ONLY possible error is the gated D2 finding →
      // pass is exactly the inverse of the gate flag (pins the H flip).
      const w = validateProvenanceFiles(artifactPath, celPath, anchorPath, "worklist");
      expect(w.warningCount).toBeGreaterThanOrEqual(1);
      expect(w.pass).toBe(!DERIVED_FROM_GATE_ENFORCED);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("discovery follows the ARTIFACT's recorded anchor, not a relocated byte-identical caller anchorPath", () => {
    // The impl-review hardening: validate is handed a byte-identical anchor copy in dir/copy (V3 drift passes) that has NO
    // sidecar. D2 must still find + flag the DISAGREEING sidecar beside the artifact's recorded anchor (dir/anchor.txt).
    // If discovery tracked the caller anchorPath it would find no sidecar in dir/copy and (wrongly) report clean.
    const dir = mkdtempSync(join(tmpdir(), "crl-d2-reloc-"));
    try {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "p", version: "0.0.0", private: true }),
      );
      writeFileSync(join(dir, "policy.crl"), POLICY);
      const celPath = join(dir, "f.cel");
      writeFileSync(celPath, CELE2E);
      const anchorText = "Approve when criteria are met.\n";
      writeFileSync(join(dir, "anchor.txt"), anchorText); // the artifact's RECORDED anchor
      mkdirSync(join(dir, "copy"));
      const relocated = join(dir, "copy", "anchor.txt"); // a byte-identical copy the caller points at — NO sidecar beside it
      writeFileSync(relocated, anchorText);
      const srcBytes = Buffer.from("the ACTUAL upstream source bytes", "utf8");
      writeFileSync(join(dir, "source.docx"), srcBytes);
      // The DISAGREEING sidecar lives beside the RECORDED anchor only.
      writeFileSync(
        metaPathForAnchor(join(dir, "anchor.txt")),
        JSON.stringify({
          path: "anchor.txt",
          derivedFrom: "source.docx",
          derivedFromHash: sha256("a STALE oracle the sidecar still holds"),
          textHash: sha256(anchorText),
          warnings: [],
          derivedFromContract: "upstream-source",
        }),
      );
      const artifactPath = join(dir, "art.json");
      writeFileSync(
        artifactPath,
        JSON.stringify({
          schemaVersion: "1.1",
          policyId: "P",
          policyVersion: "1",
          anchorSource: {
            path: "anchor.txt",
            derivedFrom: "source.docx",
            derivedFromContract: "upstream-source",
            derivedFromHash: sha256(srcBytes),
            textHash: sha256(anchorText),
            canonicalizer: "crl-anchor-docx-text",
            canonicalizerVersion: "1.0.0",
            offsetUnit: "utf8-byte",
            unicodeNormalization: "NFC",
            rangeConvention: "half-open",
          },
          items: [],
          ignoredRanges: [],
          clusters: [],
        }),
      );

      const r = validateProvenanceFiles(artifactPath, celPath, relocated, "final");
      expect(
        r.findings.find((f) => f.kind === "derived-from-sidecar-disagreement"),
        "D2 must check the recorded anchor's sidecar, not the relocated copy's absent one",
      ).toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
