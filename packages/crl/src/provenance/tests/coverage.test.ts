import { writeFileSync, mkdtempSync, rmSync } from "fs";
import * as os from "os";
import * as path from "path";

import { resolveCelImports } from "../../cel/imports";
import { buildProvenanceIndex, type ProvenanceIndex } from "../indexer";
import { deriveCoverage } from "../coverage";
import type { ProvenanceArtifact, Item, Cluster, CrlNodeRef, IgnoredRange, AnchorSourceMeta } from "../artifact";

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

const SHARED_CRL = `# S
library "Shared Lib".
activity "SharedAct":
- request CPGCommunicationRequest.
- with \`s\`.`;

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

let idx: ProvenanceIndex;
let root: string;
beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "prov-cov-"));
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "p", version: "0.0.0", private: true, crl: { sharedLibraries: ["Shared Lib"] } }));
  writeFileSync(path.join(root, "policy.crl"), POLICY_CRL);
  writeFileSync(path.join(root, "shared.crl"), SHARED_CRL);
  const celPath = path.join(root, "f.cel");
  writeFileSync(celPath, CEL);
  idx = buildProvenanceIndex(resolveCelImports(celPath));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const STUB_META: AnchorSourceMeta = {
  path: "x.txt",
  derivedFrom: "x.docx",
  derivedFromHash: "sha256:0",
  canonicalizer: "crl-anchor-docx-text",
  canonicalizerVersion: "1.0.0",
  textHash: "sha256:0",
  offsetUnit: "utf8-byte",
  unicodeNormalization: "NFC",
  rangeConvention: "half-open",
};

function artifact(opts: { items?: Item[]; clusters?: Cluster[]; ignoredRanges?: IgnoredRange[] }): ProvenanceArtifact {
  return {
    schemaVersion: "1.0",
    policyId: "P",
    policyVersion: "1",
    anchorSource: STUB_META,
    items: opts.items ?? [],
    ignoredRanges: opts.ignoredRanges ?? [],
    clusters: opts.clusters ?? [],
  };
}

const crlRef = (name: string, kind: string, relation: CrlNodeRef["relation"], status: CrlNodeRef["status"], nodeId?: string): CrlNodeRef => ({
  lib: "Policy",
  kind,
  name,
  ...(nodeId !== undefined ? { nodeId } : {}),
  nodeKind: "leaf",
  ownership: "policy-owned",
  relation,
  status,
});

describe("deriveCoverage — sense 1 (Missed₁) §4", () => {
  it("a must-link-decision item linked (implements-criterion, linked) to a policy-owned leaf is implemented", () => {
    const items: Item[] = [{ id: "n1", origin: "source", text: "crit", role: "criterion", linkRequirement: "must-link-decision", sourceRefs: [{ start: 0, end: 4 }] }];
    const clusters: Cluster[] = [{ id: "c1", label: "x", items: ["n1"], crl: [crlRef("Crit", "concept", "implements-criterion", "linked")], cel: [] }];
    expect(deriveCoverage(artifact({ items, clusters }), idx, "crit").missedDecisions).toEqual([]);
  });

  it("a must-link-decision item with NO link → Missed₁; with only a PROVISIONAL link → still Missed₁", () => {
    const items: Item[] = [{ id: "n1", origin: "source", text: "crit", role: "criterion", linkRequirement: "must-link-decision", sourceRefs: [{ start: 0, end: 4 }] }];
    expect(deriveCoverage(artifact({ items }), idx, "crit").missedDecisions).toEqual(["n1"]);
    const prov: Cluster[] = [{ id: "c1", label: "x", items: ["n1"], crl: [crlRef("Crit", "concept", "implements-criterion", "provisional")], cel: [] }];
    expect(deriveCoverage(artifact({ items, clusters: prov }), idx, "crit").missedDecisions).toEqual(["n1"]);
  });

  it("wrong relation / SHARED node / cross-item do not satisfy decision-implementation", () => {
    const items: Item[] = [{ id: "n1", origin: "source", text: "crit", role: "criterion", linkRequirement: "must-link-decision", sourceRefs: [{ start: 0, end: 4 }] }];
    const wrongRel: Cluster[] = [{ id: "c1", label: "x", items: ["n1"], crl: [crlRef("Crit", "concept", "defines-concept", "linked")], cel: [] }];
    expect(deriveCoverage(artifact({ items, clusters: wrongRel }), idx, "crit").missedDecisions).toEqual(["n1"]);
    // a linked recommends-disposition ref to a SHARED-lib activity → ownership shared, not policy-owned → not implemented
    const sharedRef: CrlNodeRef = { lib: "Shared Lib", kind: "activity", name: "SharedAct", nodeKind: "shared-reference", ownership: "shared-reference", relation: "recommends-disposition", status: "linked" };
    const sharedCluster: Cluster[] = [{ id: "c1", label: "x", items: ["n1"], crl: [sharedRef], cel: [] }];
    expect(deriveCoverage(artifact({ items, clusters: sharedCluster }), idx, "crit").missedDecisions).toEqual(["n1"]);
    const crossItem: Cluster[] = [{ id: "c1", label: "x", items: ["other"], crl: [crlRef("Crit", "concept", "implements-criterion", "linked")], cel: [] }];
    expect(deriveCoverage(artifact({ items, clusters: crossItem }), idx, "crit").missedDecisions).toEqual(["n1"]);
  });

  it("a linked decision-relation ref not resolvable in the index → unresolvedLinkedRefs (not a silent Missed₁ only)", () => {
    const items: Item[] = [{ id: "n1", origin: "source", text: "crit", role: "criterion", linkRequirement: "must-link-decision", sourceRefs: [{ start: 0, end: 4 }] }];
    const clusters: Cluster[] = [{ id: "c1", label: "x", items: ["n1"], crl: [crlRef("Ghost", "concept", "implements-criterion", "linked")], cel: [] }];
    const r = deriveCoverage(artifact({ items, clusters }), idx, "crit");
    expect(r.unresolvedLinkedRefs.map((u) => u.ref.name)).toContain("Ghost");
    expect(r.missedDecisions).toEqual(["n1"]); // still missed, but the unresolved ref is surfaced too
    // broadened (v2): a linked decision-ref in a cluster with NO source item is STILL surfaced
    const authoredOnly: Cluster[] = [{ id: "cX", label: "x", items: [], crl: [crlRef("Ghost", "concept", "implements-criterion", "linked")], cel: [] }];
    expect(deriveCoverage(artifact({ clusters: authoredOnly }), idx, "").unresolvedLinkedRefs.map((u) => u.cluster)).toContain("cX");
  });
});

describe("deriveCoverage — sense 2 (Missed₂) §4", () => {
  const text = "Adults qualify. Noise here.";
  it("a non-whitespace uncovered span is Missed₂; covered by a sourceRef OR ignoredRange it is not; whitespace gaps drop", () => {
    const covered: Item[] = [{ id: "n1", origin: "source", text: "Adults qualify.", sourceRefs: [{ start: 0, end: 15 }] }];
    // "Adults qualify." = bytes 0..15; gap 15.." Noise here." (non-ws) → Missed₂
    const r = deriveCoverage(artifact({ items: covered }), idx, text);
    expect(r.uncoveredSpans.length).toBe(1);
    expect(r.uncoveredSpans[0].text).toBe(" Noise here.");
    // ignoredRange over the tail → fully covered
    const r2 = deriveCoverage(artifact({ items: covered, ignoredRanges: [{ start: 15, end: 27, reason: "noise" }] }), idx, text);
    expect(r2.uncoveredSpans).toEqual([]);
  });

  it("whitespace-only gaps are not Missed₂", () => {
    const t = "A B"; // cover "A"(0..1) and "B"(2..3); gap 1..2 = a space → dropped
    const items: Item[] = [
      { id: "a", origin: "source", text: "A", sourceRefs: [{ start: 0, end: 1 }] },
      { id: "b", origin: "source", text: "B", sourceRefs: [{ start: 2, end: 3 }] },
    ];
    expect(deriveCoverage(artifact({ items }), idx, t).uncoveredSpans).toEqual([]);
  });

  it("out-of-range / off-boundary offsets are surfaced (malformedRanges), not thrown — sourceRef AND ignoredRange", () => {
    const items: Item[] = [{ id: "n1", origin: "source", text: "x", sourceRefs: [{ start: 0, end: 9999 }] }];
    const r = deriveCoverage(artifact({ items }), idx, "café"); // 5 bytes; end 9999 out of range
    expect(r.malformedRanges.length).toBe(1);
    // mid-multibyte boundary: "café" é = bytes 3..4; end 4 splits é
    const r2 = deriveCoverage(artifact({ items: [{ id: "n2", origin: "source", text: "x", sourceRefs: [{ start: 0, end: 4 }] }] }), idx, "café");
    expect(r2.malformedRanges.some((m) => /boundary/.test(m.reason))).toBe(true);
    // a malformed IGNOREDRANGE is surfaced too (shared validation path)
    const r3 = deriveCoverage(artifact({ ignoredRanges: [{ start: 0, end: 9999, reason: "x" }] }), idx, "café");
    expect(r3.malformedRanges.some((m) => /ignoredRange/.test(m.reason))).toBe(true);
  });

  it("an uncovered span with a MULTIBYTE char renders correctly (byte arithmetic, not UTF-16) and never throws", () => {
    const t = "café data"; // 'é' = 2 bytes → byte length 10; "café" = bytes 0..5
    const items: Item[] = [{ id: "n1", origin: "source", text: "café", sourceRefs: [{ start: 0, end: 5 }] }];
    const r = deriveCoverage(artifact({ items }), idx, t);
    expect(r.uncoveredSpans).toEqual([{ start: 5, end: 10, text: " data" }]);
  });
});

describe("deriveCoverage — over-reach §4", () => {
  const names = (r: { overReach: { ref: { name: string; nodeId?: string } }[] }) => r.overReach.map((n) => n.ref.name + (n.ref.nodeId ? "#" + n.ref.nodeId : ""));

  it("policy-owned leaf in no cluster is over-reach; the bare whole-decision decl is NOT a candidate", () => {
    const or = names(deriveCoverage(artifact({}), idx, ""));
    expect(or).toContain("Crit"); // leaf, unclustered
    expect(or).toContain("Approve"); // leaf, unclustered
    expect(or).toContain("Dec#when[0]"); // a decision SUB-node candidate
    expect(or).not.toContain("Dec"); // the bare decl (no nodeId) is excluded
  });

  it("a linked cluster ref removes a node from over-reach; an authored `supports` suppresses; intentionally-unlinked suppresses", () => {
    const linked: Cluster[] = [{ id: "c1", label: "x", items: [], crl: [crlRef("Approve", "activity", "recommends-disposition", "linked")], cel: [] }];
    expect(names(deriveCoverage(artifact({ clusters: linked }), idx, ""))).not.toContain("Approve");

    const items: Item[] = [{ id: "auth", origin: "authored", text: "glue", authoredKind: "derived-glue", supports: { cluster: "c1", items: [] } }];
    const suppressed: Cluster[] = [{ id: "c1", label: "x", items: ["auth"], crl: [crlRef("Approve", "activity", "recommends-disposition", "provisional")], cel: [] }];
    expect(names(deriveCoverage(artifact({ items, clusters: suppressed }), idx, ""))).not.toContain("Approve");

    const intl: Cluster[] = [{ id: "c2", label: "x", items: [], crl: [crlRef("Approve", "activity", "recommends-disposition", "intentionally-unlinked")], cel: [] }];
    expect(names(deriveCoverage(artifact({ clusters: intl }), idx, ""))).not.toContain("Approve");
  });

  it("authored `supports` does NOT suppress when the authored item is not a MEMBER of the cluster (§2.3 triple)", () => {
    // authored item names cluster c1 in supports, but is NOT in c1.items → suppression must not fire → Approve stays over-reach
    const items: Item[] = [{ id: "auth", origin: "authored", text: "glue", authoredKind: "derived-glue", supports: { cluster: "c1", items: [] } }];
    const clusters: Cluster[] = [{ id: "c1", label: "x", items: [], crl: [crlRef("Approve", "activity", "recommends-disposition", "provisional")], cel: [] }];
    expect(names(deriveCoverage(artifact({ items, clusters }), idx, ""))).toContain("Approve");
  });
});
