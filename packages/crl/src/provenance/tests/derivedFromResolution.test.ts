import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProvenanceArtifact } from "../artifact";
import { DERIVED_FROM_GATE_ENFORCED } from "../derivedFromPolicy";
import { derivedFromResolutionFindings, validateProvenanceFiles } from "../validateFiles";

const sha256 = (b: Buffer | string): string =>
  "sha256:" +
  createHash("sha256")
    .update(typeof b === "string" ? Buffer.from(b, "utf8") : b)
    .digest("hex");

const DF_SEV = DERIVED_FROM_GATE_ENFORCED ? "error" : "warning";

// #250 H — the enforcement PIN. The gate is now the terminal enforced state; DERIVED_FROM_GATE_ENFORCED is retained ONLY
// as the rollback lever (derivedFromPolicy.ts). If it is ever reverted to `false`, THIS fails loudly — the whole point of
// the pin is that the suite cannot go green with the gate silently un-flipped (disc 390, both design arms required it).
test("#250 H: the derivedFrom gate is ENFORCED (a revert to warn-only must fail here)", () => {
  expect(DERIVED_FROM_GATE_ENFORCED).toBe(true);
  expect(DF_SEV).toBe("error");
});

/** A minimal artifact — `derivedFromResolutionFindings` reads only `anchorSource.{derivedFrom, derivedFromHash}`. */
const artifactFor = (derivedFrom: unknown, derivedFromHash: unknown): ProvenanceArtifact =>
  ({ anchorSource: { derivedFrom, derivedFromHash } }) as unknown as ProvenanceArtifact;

/** Whether file symlinks can be created here (Windows needs Developer Mode / privilege; skip those two cases if not). */
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

describe("derivedFromResolutionFindings — #250 Todo C (fs resolve + hash)", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "crl-c-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // artifactPath is dir/art.json (need not exist — only its DIRNAME is the carrier base); the SOURCE is placed under dir.
  const findingsFor = (derivedFrom: unknown, hash: unknown, artRel = "art.json") =>
    derivedFromResolutionFindings(join(dir, artRel), artifactFor(derivedFrom, hash));
  const kindsFor = (derivedFrom: unknown, hash: unknown, artRel?: string) =>
    findingsFor(derivedFrom, hash, artRel).map((f) => f.kind);

  it("a resolvable source whose bytes hash to the recorded oracle → NO finding", () => {
    const bytes = Buffer.from("PK the source docx", "utf8");
    writeFileSync(join(dir, "x.docx"), bytes);
    expect(kindsFor("x.docx", sha256(bytes))).toEqual([]);
  });

  it("a resolvable source whose bytes DIFFER → derived-from-hash-mismatch (gated severity, integrity, LFS hint)", () => {
    writeFileSync(join(dir, "x.docx"), Buffer.from("actual bytes", "utf8"));
    const f = findingsFor("x.docx", sha256("what was recorded"));
    expect(f.map((x) => x.kind)).toEqual(["derived-from-hash-mismatch"]);
    expect(f[0].severity).toBe(DF_SEV);
    expect(f[0].class).toBe("integrity");
    expect(f[0].message).toMatch(/git-LFS/);
  });

  it("a source that does not exist → derived-from-unresolved", () => {
    expect(kindsFor("gone.docx", sha256("x"))).toEqual(["derived-from-unresolved"]);
  });

  it("a derivedFrom resolving to a DIRECTORY → derived-from-source-unreadable (not a masquerade as mismatch)", () => {
    mkdirSync(join(dir, "adir"));
    expect(kindsFor("adir", sha256("x"))).toEqual(["derived-from-source-unreadable"]);
  });

  it("resolves against the CARRIER dir (dirname(artifactPath)), incl. a `../` sibling source", () => {
    // artifact at dir/nested/art.json; source at dir/sib/x.docx via ../sib/x.docx
    const bytes = Buffer.from("sibling source", "utf8");
    mkdirSync(join(dir, "nested"));
    mkdirSync(join(dir, "sib"));
    writeFileSync(join(dir, "sib", "x.docx"), bytes);
    expect(kindsFor("../sib/x.docx", sha256(bytes), "nested/art.json")).toEqual([]);
    // and a nested subdir source relative to the carrier
    const b2 = Buffer.from("subdir source", "utf8");
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", "y.docx"), b2);
    expect(kindsFor("sub/y.docx", sha256(b2))).toEqual([]);
  });

  it("SKIPS (no fs finding) when B owns the path — an absolute/malformed derivedFrom", () => {
    // A source exists at that basename, but C must not run for a non-`ok` path (B's territory; cascade).
    writeFileSync(join(dir, "x.docx"), Buffer.from("bytes", "utf8"));
    expect(kindsFor("E:/x.docx", sha256("bytes"))).toEqual([]); // absolute
    expect(kindsFor("a\\b.docx", sha256("bytes"))).toEqual([]); // backslash-malformed
    expect(kindsFor("", sha256("bytes"))).toEqual([]); // blank-malformed
  });

  it("SKIPS (no fs finding) when the pure oracle-malformed check owns a bad oracle", () => {
    writeFileSync(join(dir, "x.docx"), Buffer.from("bytes", "utf8"));
    for (const badHash of ["sha256:0", "notahash", "", undefined]) {
      expect(kindsFor("x.docx", badHash)).toEqual([]);
    }
  });

  it("hashes RAW bytes — a source with NUL / invalid UTF-8 matches its raw sha256 (a utf8 re-encode would not)", () => {
    const raw = Buffer.from([0x50, 0x4b, 0x00, 0xff, 0xfe, 0x00, 0x80]); // NUL + invalid UTF-8 sequences
    writeFileSync(join(dir, "x.docx"), raw);
    expect(kindsFor("x.docx", sha256(raw))).toEqual([]);
    // guard the mirror bug directly: the utf8 decode+re-encode of these bytes has a DIFFERENT hash, so if the impl did that
    // it would spuriously not-mismatch against THAT hash — assert it DOES mismatch (i.e. we hashed the raw bytes, not utf8).
    expect(kindsFor("x.docx", sha256(raw.toString("utf8")))).toEqual([
      "derived-from-hash-mismatch",
    ]);
  });

  it("hashes the WHOLE file across chunk boundaries — distinguishing bytes past the 1 MiB window", () => {
    const big = Buffer.alloc((1 << 20) + 4096, 0x41); // > 1 MiB of 'A'
    big[(1 << 20) + 100] = 0x42; // a 'B' in the SECOND chunk
    writeFileSync(join(dir, "x.docx"), big);
    expect(kindsFor("x.docx", sha256(big))).toEqual([]);
    // a first-chunk-only hash would (wrongly) match sha256(first 1 MiB); assert we read PAST it → that hash mismatches.
    expect(kindsFor("x.docx", sha256(big.subarray(0, 1 << 20)))).toEqual([
      "derived-from-hash-mismatch",
    ]);
  });

  it.skipIf(!FSYM)("a symlink to a regular source is followed and hashed", () => {
    const bytes = Buffer.from("behind a symlink", "utf8");
    writeFileSync(join(dir, "real.docx"), bytes);
    symlinkSync(join(dir, "real.docx"), join(dir, "link.docx"), "file");
    expect(kindsFor("link.docx", sha256(bytes))).toEqual([]);
  });

  it.skipIf(!FSYM)("a DANGLING symlink → derived-from-unresolved", () => {
    symlinkSync(join(dir, "nonexistent.docx"), join(dir, "dangling.docx"), "file");
    expect(kindsFor("dangling.docx", sha256("x"))).toEqual(["derived-from-unresolved"]);
  });
});

// End-to-end through the FILE pipeline: proves a C finding SURVIVES the merge into resolveProvenance's findings and flows
// into the recomputed counts + pass (the unit tests above call derivedFromResolutionFindings directly, so a dropped merge or
// count-recompute would leave them green). Also the only e2e path that exercises C's fs half against a real resolvable source.
describe("Todo C end-to-end via validateProvenanceFiles", () => {
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

  it("a mismatching source surfaces derived-from-hash-mismatch through the pipeline; it counts as a (gated) warning + drives pass", () => {
    const dir = mkdtempSync(join(tmpdir(), "crl-c-e2e-"));
    try {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "p", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/p" } }),
      );
      writeFileSync(join(dir, "policy.crl"), POLICY_CRL);
      const celPath = join(dir, "f.cel");
      writeFileSync(celPath, CEL);
      const anchorText = "Approve when criteria are met.\n";
      const anchorPath = join(dir, "anchor.txt");
      writeFileSync(anchorPath, anchorText);
      writeFileSync(join(dir, "source.docx"), Buffer.from("the ACTUAL source bytes", "utf8"));
      const artifactPath = join(dir, "art.json");
      writeFileSync(
        artifactPath,
        JSON.stringify(
          {
            schemaVersion: "1.0",
            policyId: "P",
            policyVersion: "1",
            anchorSource: {
              path: "anchor.txt",
              derivedFrom: "source.docx",
              derivedFromHash: sha256("DIFFERENT bytes than the source"), // well-formed but ≠ the file → C fires
              textHash: sha256(anchorText), // matches → no incidental anchor-hash-drift
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
        const c = r.findings.find((f) => f.kind === "derived-from-hash-mismatch");
        expect(c, `${mode} mode should carry the fs finding`).toBeDefined();
        expect(c?.class).toBe("integrity");
        expect(c?.severity).toBe(DF_SEV); // gated, identical in both modes (integrity is never softened)
      }

      // In WORKLIST mode the coverage backlog softens to warning, so the ONLY thing that can be an error is the enforced C
      // finding → pass is false. This proves the merged finding reaches errorCount + pass. Asserted LITERAL (not
      // `!DERIVED_FROM_GATE_ENFORCED`): post-H the gate is enforced, so a literal makes a rollback to warn-only break here
      // loudly at the fs C layer (disc 390).
      const w = validateProvenanceFiles(artifactPath, celPath, anchorPath, "worklist");
      expect(w.warningCount).toBeGreaterThanOrEqual(1);
      expect(w.pass).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
