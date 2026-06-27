// #171 — provenance addressing of DELEGATED `use decision` sub-nodes (Design (c): no inlining).
//
// A `use decision "SubDec"` must NOT inline SubDec's sub-nodes under the delegating parent's address. Each decision's
// sub-nodes are inventoried ONCE, standalone (`SubDec/when[0]`). PHASE 2b reachability recurses a POLICY-OWNED delegated
// target and marks its STANDALONE sub-nodes decision-reached — so the canonical `SubDec/when[0]` ref is addressable +
// reached, and the over-reach denominator counts it once (no double-counted twin).
//
// SCOPE NOTE: this pins the PROVENANCE side only. The per-node runtime→provenance HIGHLIGHT ("which delegated criterion
// failed") is DEFERRED — no runtime-VM-node → provenance-ref join exists today (the runtime view-model INLINES a delegated
// sub-node under the caller `PolicyDec/.../when[0]`, whereas provenance addresses it standalone `SubDec/when[0]`).
//
// Also pins the cross-lib gate: it is OWNERSHIP-based — a POLICY-OWNED delegated target (bare same-lib OR a qualified
// policy-owned sibling) recurses; a SHARED-reference target is a deferred LEAF (its sub-nodes are NOT decision-reached,
// over-reach-excluded by ownership). Qualified cross-library EVALUATION stays deferred to #172 — independent of this.
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import * as os from "os";
import * as path from "path";

import { resolveCelImports } from "../../cel/imports";
import type {
  ProvenanceArtifact,
  Item,
  Cluster,
  CrlNodeRef,
  AnchorSourceMeta,
} from "../artifact";
import { deriveCoverage } from "../coverage";
import { buildProvenanceIndex, nodeKey, type ProvenanceIndex, type ProvNodeRef } from "../indexer";

// ── fixtures ──────────────────────────────────────────────────────────────────

const CEL = `# C
library "C".
covers "Policy".
fact "Pat":
- name is "Pat".
- defined by "Patient".
case "c":
- subject is "Pat".
- result is "PolicyDec" is "Act".`;

/** Build the index over a single-file policy + the standard CEL. Extra libs (cross-lib test) go in `extra`. */
function withIndex(
  policyCrl: string,
  fn: (idx: ProvenanceIndex) => void,
  extra?: { files?: { name: string; content: string }[]; shared?: string[]; cel?: string },
): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "prov-deleg-"));
  try {
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "p",
        version: "0.0.0",
        private: true,
        ...(extra?.shared ? { crl: { sharedLibraries: extra.shared } } : {}),
      }),
    );
    writeFileSync(path.join(root, "policy.crl"), policyCrl);
    for (const f of extra?.files ?? []) writeFileSync(path.join(root, f.name), f.content);
    const celPath = path.join(root, "f.cel");
    writeFileSync(celPath, extra?.cel ?? CEL);
    fn(buildProvenanceIndex(resolveCelImports(celPath)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const dref = (name: string, nodeId?: string): ProvNodeRef => ({
  lib: "Policy",
  kind: "decision",
  name,
  ...(nodeId !== undefined ? { nodeId } : {}),
});

/** 1 iff the CANONICAL standalone key for this decision/nodeId is inventoried, else 0 (the inlined-twin guard is `keysFor`,
 *  which scans ALL keys; this only checks the one canonical key). */
function nodeCount(idx: ProvenanceIndex, name: string, nodeId?: string): number {
  const k = nodeKey(dref(name, nodeId));
  return idx.nodes.has(k) ? 1 : 0;
}

/** All inventory keys mentioning a decision name + a nodeId substring — guards against an INLINED twin (`PolicyDec/.../when[0]`). */
function keysFor(idx: ProvenanceIndex, name: string): string[] {
  return [...idx.nodes.keys()].filter((key) => key.includes(`"${name}"`));
}

const reachedBy = (idx: ProvenanceIndex, ref: ProvNodeRef): string[] => {
  const ri = idx.decisionReachability.get(nodeKey(ref));
  return ri ? [...ri.reachedBy] : [];
};
const hasDecision = (reach: string[], name: string): boolean =>
  reach.includes(nodeKey(dref(name)));

// One caller: PolicyDec delegates to SubDec; SubDec has a `when "C"`.
const ONE_CALLER = `# P
library "Policy".
concept "C":
- type is Condition.
- code is \`c\`.
activity "Act":
- request CPGCommunicationRequest.
- with \`a\`.
decision "SubDec":
first:
- when "C" then recommend activity "Act".
decision "PolicyDec":
first:
- when "C" then use decision "SubDec".`;

// ── §1 + §2(a) one caller ───────────────────────────────────────────────────

describe("#171 — same-lib delegation marks the STANDALONE sub-node reached (no inline twin)", () => {
  it("isDecisionReached(SubDec/when[0]) is true via delegation; reachedBy includes PolicyDec", () => {
    withIndex(ONE_CALLER, (idx) => {
      expect(idx.isDecisionReached(dref("SubDec", "when[0]"))).toBe(true);
      expect(hasDecision(reachedBy(idx, dref("SubDec", "when[0]")), "PolicyDec")).toBe(true);
    });
  });

  it("SubDec sub-node appears EXACTLY ONCE; no inlined PolicyDec/.../when[0] twin", () => {
    withIndex(ONE_CALLER, (idx) => {
      expect(nodeCount(idx, "SubDec", "when[0]")).toBe(1);
      // The delegating action exists under PolicyDec, but NO SubDec branch is inlined under it.
      const polKeys = keysFor(idx, "PolicyDec");
      expect(polKeys.some((k) => k.includes('"PolicyDec"') && k.includes("action[0]/when"))).toBe(false);
      // The only when[0] under SubDec is the standalone one.
      const subWhenKeys = keysFor(idx, "SubDec").filter((k) => k.includes('"when[0]"'));
      expect(subWhenKeys).toEqual([nodeKey(dref("SubDec", "when[0]"))]);
    });
  });
});

// ── §2(b) two callers both delegate to SubDec ────────────────────────────────

describe("#171 — two callers delegating to one SubDec", () => {
  const TWO_CALLERS = `# P
library "Policy".
concept "C":
- type is Condition.
- code is \`c\`.
activity "Act":
- request CPGCommunicationRequest.
- with \`a\`.
decision "SubDec":
first:
- when "C" then recommend activity "Act".
decision "PolicyDec":
first:
- when "C" then use decision "SubDec".
decision "PolicyDec2":
first:
- when "C" then use decision "SubDec".`;

  it("SubDec/when[0] still inventoried exactly once; reachedBy includes BOTH callers", () => {
    withIndex(TWO_CALLERS, (idx) => {
      expect(nodeCount(idx, "SubDec", "when[0]")).toBe(1);
      const rb = reachedBy(idx, dref("SubDec", "when[0]"));
      expect(hasDecision(rb, "PolicyDec")).toBe(true);
      expect(hasDecision(rb, "PolicyDec2")).toBe(true);
    });
  });
});

// ── §2(c) DIAMOND: D→A, D→B, A→C, B→C ────────────────────────────────────────

describe("#171 — diamond delegation (D→A, D→B, A→C, B→C)", () => {
  const DIAMOND = `# P
library "Policy".
concept "X":
- type is Condition.
- code is \`x\`.
activity "Act":
- request CPGCommunicationRequest.
- with \`a\`.
decision "C":
first:
- when "X" then recommend activity "Act".
decision "A":
first:
- when "X" then use decision "C".
decision "B":
first:
- when "X" then use decision "C".
decision "PolicyDec":
first:
- when "X" then use decision "A".
- when "X" then use decision "B".`;

  it("C/when[0] inventoried exactly once (no twins from the two paths); reached", () => {
    withIndex(DIAMOND, (idx) => {
      expect(nodeCount(idx, "C", "when[0]")).toBe(1);
      // No inlined C-branch under A or B (no `action[0]/when` keys under either).
      for (const owner of ["A", "B", "PolicyDec"]) {
        expect(keysFor(idx, owner).some((k) => k.includes("/when["))).toBe(false);
      }
      expect(idx.isDecisionReached(dref("C", "when[0]"))).toBe(true);
      const rb = reachedBy(idx, dref("C", "when[0]"));
      // Per-seed cycle reset: C is reached under A's seed, B's seed, AND PolicyDec's seed.
      for (const d of ["A", "B", "PolicyDec"]) expect(hasDecision(rb, d)).toBe(true);
    });
  });
});

// ── §3 SubDec ALSO a top-level covered decision ──────────────────────────────

describe("#171 — SubDec is also a top-level covered decision", () => {
  // Same as ONE_CALLER (the seed loop walks EVERY covered decision, so SubDec is itself a seed).
  it("denominator contains SubDec/when[0] once; reachedBy contains both PolicyDec and SubDec", () => {
    withIndex(ONE_CALLER, (idx) => {
      expect(nodeCount(idx, "SubDec", "when[0]")).toBe(1);
      const rb = reachedBy(idx, dref("SubDec", "when[0]"));
      expect(hasDecision(rb, "PolicyDec")).toBe(true);
      expect(hasDecision(rb, "SubDec")).toBe(true); // its own seed (spine-member)
    });
  });
});

// ── §4 over-reach: an unlinked SubDec/when[0] is over-reach exactly once; §5 suppression on the canonical ref ──

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

function artifact(opts: { items?: Item[]; clusters?: Cluster[] }): ProvenanceArtifact {
  return {
    schemaVersion: "1.0",
    policyId: "P",
    policyVersion: "1",
    anchorSource: STUB_META,
    items: opts.items ?? [],
    ignoredRanges: [],
    clusters: opts.clusters ?? [],
  };
}

const subWhenRef = (status: CrlNodeRef["status"]): CrlNodeRef => ({
  lib: "Policy",
  kind: "decision",
  name: "SubDec",
  nodeId: "when[0]",
  nodeKind: "decision-node",
  ownership: "policy-owned",
  relation: "implements-criterion",
  status,
});

describe("#171 — over-reach on the canonical standalone delegated sub-node", () => {
  const orNames = (r: { overReach: { ref: { name: string; nodeId?: string } }[] }) =>
    r.overReach.map((n) => n.ref.name + (n.ref.nodeId ? "#" + n.ref.nodeId : ""));

  it("an UNLINKED SubDec/when[0] appears in overReach EXACTLY once", () => {
    withIndex(ONE_CALLER, (idx) => {
      const or = orNames(deriveCoverage(artifact({}), idx, ""));
      expect(or.filter((n) => n === "SubDec#when[0]")).toEqual(["SubDec#when[0]"]); // present, once
    });
  });

  it("§4 suppression still works on the canonical ref: linked / intentionally-unlinked / authored-support escape", () => {
    withIndex(ONE_CALLER, (idx) => {
      // (a) linked
      const linked: Cluster[] = [
        { id: "c1", label: "x", items: [], crl: [subWhenRef("linked")], cel: [] },
      ];
      expect(orNames(deriveCoverage(artifact({ clusters: linked }), idx, ""))).not.toContain(
        "SubDec#when[0]",
      );
      // (c) intentionally-unlinked
      const intl: Cluster[] = [
        { id: "c2", label: "x", items: [], crl: [subWhenRef("intentionally-unlinked")], cel: [] },
      ];
      expect(orNames(deriveCoverage(artifact({ clusters: intl }), idx, ""))).not.toContain(
        "SubDec#when[0]",
      );
      // (b) authored-support escape (a provisional ref + an authored member supporting the cluster)
      const items: Item[] = [
        {
          id: "auth",
          origin: "authored",
          text: "glue",
          authoredKind: "derived-glue",
          supports: { cluster: "c3", items: [] },
        },
      ];
      const supported: Cluster[] = [
        { id: "c3", label: "x", items: ["auth"], crl: [subWhenRef("provisional")], cel: [] },
      ];
      expect(
        orNames(deriveCoverage(artifact({ items, clusters: supported }), idx, "")),
      ).not.toContain("SubDec#when[0]");
    });
  });
});

// ── §6 OWNERSHIP gate: policy-owned target (bare OR qualified-sibling) recurses; shared target is a deferred leaf ──

describe("#171 — cross-lib use-decision is gated on OWNERSHIP, not authored syntax", () => {
  // A qualified `use decision "<Lib>"."Sub"`; <Lib> is either policy-owned (local, not shared) or shared-reference.
  const POLICY = (lib: string) => `# P
library "Policy".
concept "C":
- type is Condition.
- code is \`c\`.
decision "PolicyDec":
first:
- when "C" then use decision "${lib}"."Sub".`;
  const SUBLIB = (name: string) => `# ${name}
library "${name}".
concept "OC":
- type is Condition.
- code is \`oc\`.
activity "OAct":
- request CPGCommunicationRequest.
- with \`oa\`.
decision "Sub":
first:
- when "OC" then recommend activity "OAct".`;

  it("(a) qualified target in a POLICY-OWNED sibling lib → Sub's sub-nodes ARE reached, NOT over-reach when linked", () => {
    withIndex(
      POLICY("Sibling"), // "Sibling" is local + NOT in sharedLibraries → policy-owned
      (idx) => {
        const subWhen: ProvNodeRef = { lib: "Sibling", kind: "decision", name: "Sub", nodeId: "when[0]" };
        expect(idx.ownershipOf({ lib: "Sibling", kind: "decision", name: "Sub" })).toBe("policy-owned");
        expect(idx.isDecisionReached(subWhen)).toBe(true); // policy-owned sibling → recursed
        // and NOT over-reach if linked: a policy-owned sub-node reached via a qualified sibling delegation is a real candidate.
        const linked: Cluster[] = [
          {
            id: "c1",
            label: "x",
            items: [],
            crl: [
              {
                lib: "Sibling",
                kind: "decision",
                name: "Sub",
                nodeId: "when[0]",
                nodeKind: "decision-node",
                ownership: "policy-owned",
                relation: "implements-criterion",
                status: "linked",
              },
            ],
            cel: [],
          },
        ];
        const or = deriveCoverage(artifact({ clusters: linked }), idx, "").overReach.map((n) =>
          nodeKey(n.ref),
        );
        expect(or).not.toContain(nodeKey(subWhen));
      },
      { files: [{ name: "sibling.crl", content: SUBLIB("Sibling") }] }, // NO shared → Sibling is policy-owned
    );
  });

  it("(b) qualified target in a SHARED lib → Sub's sub-nodes NOT reached; decl edge IS recorded (use-decision relation)", () => {
    withIndex(
      POLICY("Shared"),
      (idx) => {
        const subWhen: ProvNodeRef = { lib: "Shared", kind: "decision", name: "Sub", nodeId: "when[0]" };
        const subDecl: ProvNodeRef = { lib: "Shared", kind: "decision", name: "Sub" };
        expect(idx.ownershipOf(subDecl)).toBe("shared-reference");
        expect(idx.isDecisionReached(subWhen)).toBe(false); // shared → deferred leaf, NOT recursed
        // The use-decision EDGE to the decl IS recorded (decl reached at the leaf/use-decision relation, sub-nodes NOT).
        expect(idx.isDecisionReached(subDecl)).toBe(true);
        const edges = idx.decisionReachability.get(nodeKey(subDecl))!.edges;
        expect(edges.some((e) => e.relation === "use-decision")).toBe(true);
        // shared-reference ownership → over-reach-excluded regardless (its sub-node isn't even a candidate).
        const or = deriveCoverage(artifact({}), idx, "").overReach.map((n) => nodeKey(n.ref));
        expect(or).not.toContain(nodeKey(subWhen));
      },
      { files: [{ name: "shared.crl", content: SUBLIB("Shared") }], shared: ["Shared"] },
    );
  });

  it("(contrast) a BARE same-lib target DOES mark its sub-node decision-reached", () => {
    withIndex(ONE_CALLER, (idx) => {
      expect(idx.isDecisionReached(dref("SubDec", "when[0]"))).toBe(true);
    });
  });
});

// ── §7 (DELTA 5) cycle termination: self-delegation + mutual delegation must not hang ──

describe("#171 — delegation cycles terminate (seenDecisions guard)", () => {
  it("self-delegation D → D: terminates, sub-nodes inventoried once + reached", () => {
    const SELF = `# P
library "Policy".
concept "C":
- type is Condition.
- code is \`c\`.
activity "Act":
- request CPGCommunicationRequest.
- with \`a\`.
decision "D":
first:
- when "C" then recommend activity "Act".
- otherwise then use decision "D".`;
    withIndex(SELF, (idx) => {
      expect(nodeCount(idx, "D", "when[0]")).toBe(1);
      expect(idx.isDecisionReached(dref("D", "when[0]"))).toBe(true);
    });
  });

  it("mutual delegation A → B → A: terminates, sub-nodes inventoried once + reached", () => {
    const MUTUAL = `# P
library "Policy".
concept "C":
- type is Condition.
- code is \`c\`.
activity "Act":
- request CPGCommunicationRequest.
- with \`a\`.
decision "A":
first:
- when "C" then recommend activity "Act".
- otherwise then use decision "B".
decision "B":
first:
- when "C" then recommend activity "Act".
- otherwise then use decision "A".
decision "PolicyDec":
first:
- when "C" then use decision "A".`;
    withIndex(MUTUAL, (idx) => {
      expect(nodeCount(idx, "A", "when[0]")).toBe(1);
      expect(nodeCount(idx, "B", "when[0]")).toBe(1);
      expect(idx.isDecisionReached(dref("A", "when[0]"))).toBe(true);
      expect(idx.isDecisionReached(dref("B", "when[0]"))).toBe(true);
    });
  });
});

// ── §8 (DELTA 6) over-reach on a delegated RECOMMEND-activity LEAF sub-node (denominator-kind coverage) ──

describe("#171 — a delegated recommend-leaf sub-node is over-reach exactly once when unlinked", () => {
  // SubDec's `when[0]/action[0]` is a recommend-activity action node (a decision-node sub-node), reached via delegation.
  it("SubDec/when[0]/action[0] (a recommend leaf) appears in overReach exactly once", () => {
    withIndex(ONE_CALLER, (idx) => {
      const ref = dref("SubDec", "when[0]/action[0]");
      expect(idx.nodeKindOf(ref)).toBe("decision-node");
      const or = deriveCoverage(artifact({}), idx, "").overReach.map(
        (n) => n.ref.name + (n.ref.nodeId ? "#" + n.ref.nodeId : ""),
      );
      expect(or.filter((n) => n === "SubDec#when[0]/action[0]")).toEqual(["SubDec#when[0]/action[0]"]);
    });
  });
});
