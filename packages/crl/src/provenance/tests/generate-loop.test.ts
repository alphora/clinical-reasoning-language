/**
 * Integration test — the provenance feedback LOOP end-to-end (corpus-style proof; a real crl-content corpus is not in
 * this repo). It exercises the four moving parts together:
 *   1. generate  → a Model-A scaffold (provisional refs, no items).
 *   2. validate  → the documented baseline { over-reach × K, uncovered-span × 1 } (the KE worklist).
 *   3. attribute → simulate the KE's hand-work: add a SOURCE item with a real sourceRef byte-range into the anchor +
 *                  link it into the cluster + flip the relevant CRL refs to status:"linked" + add ignoredRanges over
 *                  the rest of the anchor. Re-validate → the over-reach + uncovered findings SHRINK (the loop closes).
 *   4. merge     → re-generate a FRESH scaffold over the same graph, mergeScaffold(attributed, fresh). The attribution
 *                  (the source item + the linked refs) SURVIVES the merge; re-validating the merged artifact stays reduced.
 *
 * The fixture mirrors generate.test.ts (a covered "Policy" with a `defined as` composite criterion, a when-gated +
 * an otherwise recommend; a companion .cel with frozen cases) so the K=8 baseline is the same shape T1's tests pin.
 */
import { createHash } from "crypto";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import * as os from "os";
import * as path from "path";

import { resolveCelImports } from "../../cel/imports";
import type { AnchorSourceMeta, CrlNodeRef, Item, ProvenanceArtifact } from "../artifact";
import { deriveCoverage } from "../coverage";
import { generateProvenanceScaffold, mergeScaffold } from "../generate";
import { generateProvenanceFiles } from "../generateFiles";
import { buildProvenanceIndex, nodeKey, type ProvenanceIndex } from "../indexer";
import { validateProvenanceFiles } from "../validateFiles";
import { validateProvenance, type ProvenanceFinding } from "../validators";

// ── fixture (mirrors generate.test.ts) ────────────────────────────────────────
const POLICY_CRL = `# P
library "Policy".
concept "LeafA":
- type is Condition.
- code is \`a\`.
concept "LeafB":
- type is Condition.
- code is \`b\`.
concept "Crit":
- defined as ( "LeafA" sem-or "LeafB" ).
activity "Approve":
- request CPGCommunicationRequest.
- with \`ap\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`dn\`.
decision "Dec":
first:
- when "Crit" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;

const CEL = `# C
library "C".
covers "Policy".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "approve case":
- id is "case-approve".
- subject is "Pat".
- result is "Dec" is "Approve".
case "deny case":
- id is "case-deny".
- subject is "Pat".
- result is "Dec" is "Deny".`;

const ANCHOR = "Approve when criteria are met; otherwise deny.\n";
const TEXT_HASH =
  "sha256:" + createHash("sha256").update(Buffer.from(ANCHOR, "utf8")).digest("hex");
const ANCHOR_LEN = Buffer.byteLength(ANCHOR, "utf8");

const META: AnchorSourceMeta = {
  path: "anchor.txt",
  derivedFrom: "anchor.txt",
  derivedFromHash: TEXT_HASH,
  canonicalizer: "crl-anchor-docx-text",
  canonicalizerVersion: "1.0.0",
  textHash: TEXT_HASH,
  offsetUnit: "utf8-byte",
  unicodeNormalization: "NFC",
  rangeConvention: "half-open",
};

const OPTS = {
  policyId: "Policy",
  policyVersion: "1",
  anchorSource: META,
  celFileName: "f.cel",
};

const FROZEN = new Set(["case-approve", "case-deny"]);
const VALIDATE_OPTS = {
  celCaseIds: new Map([["f.cel", FROZEN]]),
  frozenCaseIds: new Map([["f.cel", FROZEN]]),
};

let idx: ProvenanceIndex;
let root: string;
let celPath: string;
beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "prov-gen-loop-"));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "p", version: "0.0.0", private: true }),
  );
  writeFileSync(path.join(root, "policy.crl"), POLICY_CRL);
  celPath = path.join(root, "f.cel");
  writeFileSync(celPath, CEL);
  idx = buildProvenanceIndex(resolveCelImports(celPath));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const gen = () => generateProvenanceScaffold(resolveCelImports(celPath), OPTS);
const validate = (a: ProvenanceArtifact): ProvenanceFinding[] =>
  validateProvenance(a, idx, ANCHOR, VALIDATE_OPTS);
const countKind = (findings: ProvenanceFinding[], kind: string): number =>
  findings.filter((f) => f.kind === kind).length;

// K = 2 leaf concepts (LeafA, LeafB) + 2 activities (Approve, Deny) + 4 decision sub-nodes (when[0], when[0]/action[0],
//     otherwise, otherwise/action[0]) — the same baseline T1 pins. The composite "Crit" is inference (over-reach-excluded).
const K = 8;

describe("provenance feedback loop — generate → validate baseline", () => {
  it("the generated scaffold validates to the documented baseline { over-reach × K, uncovered-span × 1 }", () => {
    const { artifact } = gen();
    const findings = validate(artifact);
    expect(countKind(findings, "over-reach")).toBe(K);
    expect(countKind(findings, "uncovered-span")).toBe(1);
    // the over-reach set equals coverage's over-reach set (the scaffold documents its own baseline).
    const coverage = deriveCoverage(artifact, idx, ANCHOR);
    expect(coverage.overReach.length).toBe(K);
  });
});

describe("provenance feedback loop — worklist mode softens a FRESH scaffold (no wall of red)", () => {
  it("worklist: the K over-reach + 1 uncovered-span re-grade to warnings → no error-severity findings (it would pass)", () => {
    const { artifact } = gen();
    const work = validateProvenance(artifact, idx, ANCHOR, { ...VALIDATE_OPTS, mode: "worklist" });

    // the attribution backlog (over-reach × K, uncovered-span × 1) is now "warning", not "error".
    const attribution = work.filter((f) => f.class === "attribution");
    expect(attribution.length).toBe(K + 1); // the 8 over-reach + the 1 uncovered-span
    expect(attribution.every((f) => f.severity === "warning")).toBe(true);

    // no error-severity findings → a fresh scaffold would pass in worklist mode.
    expect(work.filter((f) => f.severity === "error").length).toBe(0);
    // and the integrity findings are empty for a clean fresh scaffold.
    expect(work.filter((f) => f.class === "integrity").length).toBe(0);
  });

  it("final mode (baseline): the same K over-reach are errors — strict behavior unchanged", () => {
    const { artifact } = gen();
    const final = validateProvenance(artifact, idx, ANCHOR, { ...VALIDATE_OPTS, mode: "final" });
    const over = final.filter((f) => f.kind === "over-reach");
    expect(over.length).toBe(K);
    expect(over.every((f) => f.severity === "error" && f.class === "attribution")).toBe(true);
  });
});

/**
 * Simulate the KE's source-attribution on a generated scaffold (the human/agent step the scaffold deliberately leaves
 * empty). Returns a NEW artifact (the input is treated as immutable):
 *  - adds a SOURCE item with a sourceRef covering the LEADING half of the anchor + links it into the Dec cluster;
 *  - flips EVERY policy-owned leaf/decision-node ref in that cluster to status:"linked" (the attribution edge that
 *    escapes over-reach per §4);
 *  - adds an ignoredRange covering the REMAINDER of the anchor (page-chrome acknowledgement) so Missed₂ → 0.
 */
function attribute(scaffold: ProvenanceArtifact): ProvenanceArtifact {
  const splitAt = 20; // a UTF-8 boundary in the ASCII anchor (covers "Approve when criteri")
  const item: Item = {
    id: "src-1",
    origin: "source",
    text: "Approve when criteria are met",
    sourceRefs: [{ start: 0, end: splitAt }],
    role: "criterion",
    roleStatus: "provisional",
    linkRequirement: "must-link-decision",
  };
  const clusters = scaffold.clusters.map((c) => ({
    ...c,
    items: [...c.items, item.id],
    crl: c.crl.map((ref): CrlNodeRef => {
      const linkable =
        ref.ownership === "policy-owned" &&
        (ref.nodeKind === "leaf" || (ref.nodeKind === "decision-node" && ref.nodeId !== undefined));
      return linkable ? { ...ref, status: "linked" } : { ...ref };
    }),
  }));
  return {
    ...scaffold,
    items: [...scaffold.items, item],
    ignoredRanges: [{ start: splitAt, end: ANCHOR_LEN, reason: "page chrome" }],
    clusters,
  };
}

describe("provenance feedback loop — attribution reduces the smell", () => {
  it("after attribution the over-reach + uncovered findings SHRINK to zero", () => {
    const { artifact } = gen();
    const before = validate(artifact);
    expect(countKind(before, "over-reach")).toBe(K);
    expect(countKind(before, "uncovered-span")).toBe(1);

    const attributed = attribute(artifact);
    const after = validate(attributed);
    // the loop closes: linked policy-owned leaves/decision-nodes are no longer over-reach; the anchor is fully covered.
    expect(countKind(after, "over-reach")).toBeLessThan(K);
    expect(countKind(after, "over-reach")).toBe(0);
    expect(countKind(after, "uncovered-span")).toBe(0);

    // coverage agrees: no over-reach, no uncovered spans.
    const coverage = deriveCoverage(attributed, idx, ANCHOR);
    expect(coverage.overReach.length).toBe(0);
    expect(coverage.uncoveredSpans.length).toBe(0);
  });
});

describe("provenance feedback loop — merge preserves attribution", () => {
  it("mergeScaffold(attributed, fresh) keeps the source item + linked refs; the merged artifact stays reduced", () => {
    const { artifact } = gen();
    const attributed = attribute(artifact);

    // a brand-new scaffold over the SAME (unchanged) graph — every ref provisional, no items.
    const fresh = gen().artifact;
    const merged = mergeScaffold(attributed, fresh).artifact;

    // the KE-authored source item survives the merge.
    expect(merged.items.map((it) => it.id)).toContain("src-1");
    // its cluster link survives.
    const dec = merged.clusters.find((c) => c.id === "cluster:Policy:Dec")!;
    expect(dec.items).toContain("src-1");
    // the ignoredRanges (KE-authored layer) survive.
    expect(merged.ignoredRanges.length).toBe(1);
    // at least one linked policy-owned ref survives the merge (the attribution edge was not clobbered).
    const linkedSurvived = merged.clusters.some((c) =>
      c.crl.some((r) => r.status === "linked" && r.ownership === "policy-owned"),
    );
    expect(linkedSurvived).toBe(true);

    // re-validating the MERGED artifact is still reduced (the loop's gains are durable across a re-generation).
    const after = validate(merged);
    expect(countKind(after, "over-reach")).toBe(0);
    expect(countKind(after, "uncovered-span")).toBe(0);
  });

  it("every linked-CRL nodeKey the KE created is still present + linked after the merge (no silent drop)", () => {
    const { artifact } = gen();
    const attributed = attribute(artifact);
    const linkedBefore = new Set<string>();
    for (const c of attributed.clusters)
      for (const r of c.crl) if (r.status === "linked") linkedBefore.add(nodeKey(r));

    const merged = mergeScaffold(attributed, gen().artifact).artifact;
    const linkedAfter = new Set<string>();
    for (const c of merged.clusters)
      for (const r of c.crl) if (r.status === "linked") linkedAfter.add(nodeKey(r));

    for (const k of linkedBefore) expect(linkedAfter.has(k)).toBe(true);
  });
});

// ── fix 5b: PARTIAL attribution shrinks over-reach PROPORTIONALLY (not all-or-nothing) ──
describe("provenance feedback loop — partial attribution shrinks the smell proportionally", () => {
  it("linking SOME policy-owned refs leaves residual over-reach == the count of still-unlinked policy-owned leaf+sub-nodes", () => {
    const { artifact } = gen();

    // The over-reach candidates (policy-owned leaf / decision-node-with-nodeId) across the scaffold's clusters.
    const candidateKeys: string[] = [];
    for (const c of artifact.clusters)
      for (const r of c.crl)
        if (
          r.ownership === "policy-owned" &&
          (r.nodeKind === "leaf" || (r.nodeKind === "decision-node" && r.nodeId !== undefined))
        )
          candidateKeys.push(nodeKey(r));
    expect(candidateKeys.length).toBe(K); // sanity: the same K the baseline pins

    // Link only the FIRST half of the candidates (deterministic by the cluster's sorted crl order); leave the rest provisional.
    const linkCount = Math.floor(K / 2);
    const toLink = new Set(candidateKeys.slice(0, linkCount));
    const partial: ProvenanceArtifact = {
      ...artifact,
      clusters: artifact.clusters.map((c) => ({
        ...c,
        crl: c.crl.map(
          (r): CrlNodeRef => (toLink.has(nodeKey(r)) ? { ...r, status: "linked" } : { ...r }),
        ),
      })),
    };

    const after = validate(partial);
    const residual = countKind(after, "over-reach");
    // residual over-reach is strictly between 0 and K, and EQUALS the number of still-unlinked candidates.
    expect(residual).toBeGreaterThan(0);
    expect(residual).toBeLessThan(K);
    expect(residual).toBe(K - linkCount);

    // coverage agrees on the exact residual set (the unlinked candidates).
    const coverage = deriveCoverage(partial, idx, ANCHOR);
    expect(coverage.overReach.length).toBe(K - linkCount);
  });
});

// ── fix 5a: drive the actual file pipeline (generateProvenanceFiles) end-to-end ──
describe("generateProvenanceFiles — file pipeline end-to-end (anchorMetaFor + policyId derivation)", () => {
  it("generates from real .cel + anchor .txt files; the artifact validates to the baseline + textHash matches the anchor bytes", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "prov-gen-files-"));
    try {
      writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "p", version: "0.0.0", private: true }),
      );
      writeFileSync(path.join(dir, "policy.crl"), POLICY_CRL);
      const fCel = path.join(dir, "f.cel");
      writeFileSync(fCel, CEL);
      const anchorTxt = path.join(dir, "anchor.txt");
      writeFileSync(anchorTxt, ANCHOR);

      const r = generateProvenanceFiles(fCel, anchorTxt);
      // policyId derived from the covered library (NOT the cel basename); version defaults to "1".
      expect(r.policyId).toBe("Policy");
      expect(r.policyVersion).toBe("1");
      expect(r.merged).toBe(false);
      expect(r.mergeDiagnostics).toBeUndefined();

      // anchorMetaFor hashed the real anchor bytes.
      expect(r.artifact.anchorSource.textHash).toBe(TEXT_HASH);
      expect(r.artifact.anchorSource.path).toBe("anchor.txt");
      expect(r.artifact.anchorSource.offsetUnit).toBe("utf8-byte");

      // the artifact validates to the same documented baseline as the in-memory path.
      const findings = validate(r.artifact);
      expect(countKind(findings, "over-reach")).toBe(K);
      expect(countKind(findings, "uncovered-span")).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a CEL with no resolvable `covers` target THROWS (no silent empty artifact)", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "prov-gen-nocovers-"));
    try {
      writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "p", version: "0.0.0", private: true }),
      );
      // a CEL that covers a library which does not exist in the closure → coversName resolves to null.
      const noCel = path.join(dir, "no.cel");
      writeFileSync(
        noCel,
        `# C\nlibrary "C".\ncovers "DoesNotExist".\nfact "Pat":\n- name is "Pat".\n- birth date is "1970-01-01".\n- defined by "Patient".`,
      );
      const anchorTxt = path.join(dir, "anchor.txt");
      writeFileSync(anchorTxt, ANCHOR);

      expect(() => generateProvenanceFiles(noCel, anchorTxt)).toThrow(
        /no covered policy library resolved/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── validateProvenanceFiles: worklistCount + mode threading on the real file pipeline ──
describe("validateProvenanceFiles — worklist mode passes a fresh scaffold (worklistCount populated)", () => {
  it("a fresh scaffold: final → fails (errors); worklist → passes, worklistCount = K+1 (the attribution backlog)", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "prov-validate-files-"));
    try {
      writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "p", version: "0.0.0", private: true }),
      );
      writeFileSync(path.join(dir, "policy.crl"), POLICY_CRL);
      const fCel = path.join(dir, "f.cel");
      writeFileSync(fCel, CEL);
      const anchorTxt = path.join(dir, "anchor.txt");
      writeFileSync(anchorTxt, ANCHOR);

      const g = generateProvenanceFiles(fCel, anchorTxt);
      const artifactPath = path.join(dir, "artifact.json");
      writeFileSync(artifactPath, JSON.stringify(g.artifact));

      // final (default): the attribution backlog is error-severity → fails.
      const final = validateProvenanceFiles(artifactPath, fCel, anchorTxt);
      expect(final.pass).toBe(false);
      expect(final.errorCount).toBeGreaterThan(0);
      expect(final.worklistCount).toBe(K + 1); // K over-reach + 1 uncovered-span

      // a fresh scaffold (Model A: items:[], no ignored/disposition/unlink) has NO waivers → both counts zero (final mode).
      expect(final.waiverCount).toBe(0);
      expect(final.waiverScrutinizeCount).toBe(0);

      // worklist: the same backlog is warning-severity → passes; worklistCount unchanged (class is mode-independent).
      const work = validateProvenanceFiles(artifactPath, fCel, anchorTxt, "worklist");
      expect(work.pass).toBe(true);
      expect(work.errorCount).toBe(0);
      expect(work.worklistCount).toBe(K + 1);
      // worklist skips the waiver block entirely → both counts zero regardless of artifact content.
      expect(work.waiverCount).toBe(0);
      expect(work.waiverScrutinizeCount).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
