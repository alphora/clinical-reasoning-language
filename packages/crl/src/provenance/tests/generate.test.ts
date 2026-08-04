import { createHash } from "crypto";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import * as os from "os";
import * as path from "path";

import { resolveCelImports } from "../../cel/imports";
import type { AnchorSourceMeta } from "../artifact";
import { deriveCoverage } from "../coverage";
import { generateProvenanceScaffold } from "../generate";
import { buildProvenanceIndex, nodeKey, type ProvenanceIndex } from "../indexer";
import { parseProvenanceArtifact } from "../loadArtifact";
import { validateProvenance } from "../validators";

// ── fixture: a covered policy with a `defined as` composite criterion over two leaves, a when-gated recommend +
//    an otherwise recommend; a companion .cel with FROZEN cases covering tests-branch / tests-otherwise / a boolean
//    concept assertion, plus one UN-frozen case. ────────────────────────────────────────────────────────────────
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
- result is "Dec" is "Deny".
case "leaf case":
- id is "case-leaf".
- subject is "Pat".
- result is "LeafA" is true.
case "unfrozen case":
- subject is "Pat".
- result is "Dec" is "Approve".`;

const ANCHOR = "Approve when criteria are met; otherwise deny.\n";
const TEXT_HASH =
  "sha256:" + createHash("sha256").update(Buffer.from(ANCHOR, "utf8")).digest("hex");

const META: AnchorSourceMeta = {
  path: "anchor.txt",
  derivedFrom: "x.docx",
  // WELL-FORMED (64 hex) but deliberately ≠ TEXT_HASH: keeps the tell inferring `upstream-source` (the markerless-input test)
  // while no longer tripping #250 Todo C's `derived-from-oracle-malformed` in the coverage-baseline multiset.
  derivedFromHash: "sha256:" + "a".repeat(64),
  canonicalizer: "crl-anchor-docx-text",
  canonicalizerVersion: "1.0.0",
  // the real hash of ANCHOR, so the asserted finding multiset is exactly { over-reach × K, uncovered-span × 1 } with
  // no incidental anchor-hash-drift (the scaffold itself never sets textHash — opts.anchorSource is the caller's).
  textHash: TEXT_HASH,
  offsetUnit: "utf8-byte",
  unicodeNormalization: "NFC",
  rangeConvention: "half-open",
};

const OPTS = {
  policyId: "P",
  policyVersion: "1",
  anchorSource: META,
  celFileName: "f.cel",
};

let idx: ProvenanceIndex;
let root: string;
let celPath: string;
beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "prov-gen-"));
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

describe("generateProvenanceScaffold — Model A artifact shape", () => {
  it("emits NO items at the artifact level or in any cluster (the source-attribution layer is the KE's)", () => {
    const { artifact } = gen();
    expect(artifact.items).toEqual([]);
    expect(artifact.clusters.length).toBeGreaterThan(0);
    for (const c of artifact.clusters) expect(c.items).toEqual([]);
    expect(artifact.ignoredRanges).toEqual([]);
    expect(artifact.policyId).toBe("P");
    expect(artifact.schemaVersion).toBe("1.1"); // #250 A flipped the writer to the marker-bearing envelope
  });

  it("#250 A/F: a markerless anchorSource input still yields a LOADER-VALID 1.1 (ensureAnchorMarker stamps the tell)", () => {
    // META (the fixture) carries NO derivedFromContract and a derivedFromHash ≠ textHash → the tell infers
    // upstream-source; the scaffold must never emit a "1.1" record parseProvenanceArtifact would reject (marker-required).
    const { artifact } = gen();
    expect(artifact.anchorSource.derivedFromContract).toBe("upstream-source");
    expect(parseProvenanceArtifact(artifact).ok).toBe(true);
  });

  it("one cluster per covered decision, clean ids, NO drivesDetermination edges in the artifact", () => {
    const { artifact } = gen();
    expect(artifact.clusters.map((c) => c.id)).toEqual(["cluster:Policy:Dec"]);
    expect(artifact.clusters[0].label).toBe("Dec");
    // Model A carries no edges: there is no item layer, so no item.drivesDetermination anywhere.
    expect(artifact.items).toEqual([]);
  });
});

describe("generateProvenanceScaffold — refs pass V1/V2; coverage baseline is { over-reach × K, uncovered-span × 1 }", () => {
  it("every CrlNodeRef's nodeKind/ownership equal the index's (so V1/V2 are clean)", () => {
    const { artifact } = gen();
    for (const c of artifact.clusters) {
      for (const ref of c.crl) {
        expect(ref.nodeKind).toBe(idx.nodeKindOf(ref));
        expect(ref.ownership).toBe(idx.ownershipOf(ref));
        expect(ref.status).toBe("provisional");
      }
    }
  });

  it("the validator finding multiset is EXACTLY { over-reach × K, uncovered-span × 1 } with no mismatch/unresolved/freeze findings", () => {
    const { artifact, diagnostics } = gen();
    // K = policy-owned leaf concepts (LeafA, LeafB) + activities (Approve, Deny) + decision sub-nodes (when[0],
    //     when[0]/action[0], otherwise, otherwise/action[0]) = 2 + 2 + 4 = 8.
    const K = 8;

    // celCaseIds / frozenCaseIds wired so the freeze + cel-resolution legs are ACTUALLY exercised (and must stay clean).
    const frozen = new Set(["case-approve", "case-deny", "case-leaf"]);
    // every emitted cel ref must address a FROZEN case (the scaffold never emits a ref to an un-frozen case).
    for (const c of artifact.clusters)
      for (const r of c.cel) expect(frozen.has(r.caseId)).toBe(true);
    const findings = validateProvenance(artifact, idx, ANCHOR, {
      celCaseIds: new Map([["f.cel", frozen]]),
      frozenCaseIds: new Map([["f.cel", frozen]]),
    });
    const byKind = new Map<string, number>();
    for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);

    expect(byKind.get("over-reach")).toBe(K);
    expect(byKind.get("uncovered-span")).toBe(1);
    // nothing else — the scaffold must not be born with structural defects.
    for (const bad of [
      "nodekind-mismatch",
      "ownership-mismatch",
      "unresolved-ref",
      "cel-unresolved",
      "provenance-references-unfrozen-case",
    ]) {
      expect(byKind.get(bad) ?? 0).toBe(0);
    }
    expect([...byKind.keys()].sort()).toEqual(["over-reach", "uncovered-span"]);

    // the over-reach nodeKey set EQUALS the overreach-baseline diagnostic set.
    const coverage = deriveCoverage(artifact, idx, ANCHOR);
    const coverageKeys = coverage.overReach.map((n) => nodeKey(n.ref)).sort();
    const baselineKeys = diagnostics
      .filter((d) => d.kind === "overreach-baseline")
      .map((d) => d.nodeKey!)
      .sort();
    expect(baselineKeys).toEqual(coverageKeys);
    expect(baselineKeys.length).toBe(K);
  });

  it("every policy-owned leaf + decision sub-node appears in some cluster.crl (K == the closure-clustered node count)", () => {
    const { artifact } = gen();
    const clustered = new Set<string>();
    for (const c of artifact.clusters) for (const ref of c.crl) clustered.add(nodeKey(ref));
    // every node coverage would flag as over-reach is nonetheless physically present in a cluster (provisional, so still
    // over-reach) — i.e. the baseline is documented, not the result of an un-clustered leaf.
    const coverage = deriveCoverage(artifact, idx, ANCHOR);
    for (const n of coverage.overReach) expect(clustered.has(nodeKey(n.ref))).toBe(true);
    expect(coverage.overReach.length).toBe(8);
  });
});

describe("generateProvenanceScaffold — CEL relation derivation", () => {
  const celRefs = () => gen().artifact.clusters[0].cel;

  it("a tests-branch case → tests-branch; a tests-otherwise case → tests-otherwise; a boolean concept → asserts-fact", () => {
    const cel = celRefs();
    const approve = cel.find((r) => r.caseId === "case-approve")!;
    const deny = cel.find((r) => r.caseId === "case-deny")!;
    const leaf = cel.find((r) => r.caseId === "case-leaf")!;
    expect(approve.relation).toBe("tests-branch"); // Approve is the when[0]/action[0] arm
    expect(deny.relation).toBe("tests-otherwise"); // Deny is the otherwise/action[0] arm
    expect(leaf.relation).toBe("asserts-fact"); // LeafA is a boolean concept result reached by Dec
    for (const r of cel) expect(r.status).toBe("provisional");
  });

  it("the UN-frozen case emits NO cel ref but DOES emit an unfrozen-case diagnostic", () => {
    const { artifact, diagnostics } = gen();
    // the only frozen cases are case-approve / case-deny / case-leaf — the unfrozen case must not appear.
    const ids = artifact.clusters.flatMap((c) => c.cel.map((r) => r.caseId));
    expect(ids.sort()).toEqual(["case-approve", "case-deny", "case-leaf"]);
    expect(diagnostics.some((d) => d.kind === "unfrozen-case")).toBe(true);
  });
});

describe("generateProvenanceScaffold — diagnostics", () => {
  it("drives-determination-hints: when[0]→when[0]/action[0] is present-drives; when[0]→otherwise/action[0] is absent-drives", () => {
    const { diagnostics } = gen();
    const hints = diagnostics.filter((d) => d.kind === "drives-determination-hint");
    // present-drives: when[0] (ancestor) gates its own recommend. absent-drives: the otherwise recommend fires on the
    // ABSENCE of the sibling when[0] (a sibling-absence hint, since the when is not an ancestor of the otherwise arm).
    expect(hints.length).toBe(2);
    const present = hints.filter((h) => h.polarity === "present-drives");
    const absent = hints.filter((h) => h.polarity === "absent-drives");
    expect(present.length).toBe(1);
    expect(absent.length).toBe(1);
    for (const h of hints) {
      expect(h.criterionNodeKey).toBeDefined();
      expect(h.determinationNodeKey).toBeDefined();
    }
  });

  it("attribution-needed covers each criterion when + each recommend determination", () => {
    const { diagnostics } = gen();
    const attr = diagnostics.filter((d) => d.kind === "attribution-needed");
    const nodeIds = attr.map((d) => d.nodeId).sort();
    // when[0] (the criterion) + when[0]/action[0] + otherwise/action[0] (the two recommend determinations).
    expect(nodeIds).toEqual(["otherwise/action[0]", "when[0]", "when[0]/action[0]"]);
  });
});

describe("generateProvenanceScaffold — determinism", () => {
  it("two runs on the same graph produce identical JSON for both the artifact and the diagnostics", () => {
    const a = generateProvenanceScaffold(resolveCelImports(celPath), OPTS);
    const b = generateProvenanceScaffold(resolveCelImports(celPath), OPTS);
    expect(JSON.stringify(a.artifact)).toBe(JSON.stringify(b.artifact));
    expect(JSON.stringify(a.diagnostics)).toBe(JSON.stringify(b.diagnostics));
  });
});
