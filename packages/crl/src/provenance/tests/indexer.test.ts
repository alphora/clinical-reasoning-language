import { writeFileSync, mkdtempSync, rmSync } from "fs";
import * as os from "os";
import * as path from "path";

import { resolveCelImports } from "../../cel/imports";
import { buildProvenanceIndex, type ProvenanceIndex, type ProvNodeRef } from "../indexer";

const POLICY_CRL = `# P
library "Policy".
concept "InWhen":
- type is Condition.
- code is \`iw\`.
concept "Composed":
- type is Condition.
- defined as ("OperA" sem-or "OperB").
concept "OperA":
- type is Condition.
- code is \`oa\`.
concept "OperB":
- type is Condition.
- code is \`ob\`.
concept "GuardC":
- type is Condition.
- code is \`g\`.
concept "Unref":
- type is Condition.
- code is \`u\`.
concept "Dual":
- type is Condition.
- code is \`dual\`.
concept "NarrTarget":
- type is Condition.
- code is \`nt\`.
concept "Narr":
- type is Condition.
- definition is "NarrTarget" present.
terminology "Term":
- valueset is \`http://x/vs\`.
terminology "CodedTerm":
- valueset is \`http://x/ct\`.
concept "CodedConcept":
- type is Condition.
- coded from "CodedTerm".
activity "LocalAct":
- request CPGCommunicationRequest.
- with \`la\`.
activity "Dual":
- request CPGCommunicationRequest.
- with "Term".
decision "SubDec":
first:
- when "OperA" then recommend activity "LocalAct".
- otherwise then recommend activity "LocalAct".
decision "PolicyDec":
first:
- when "InWhen" then recommend activity "Shared Lib"."SharedAct".
- when "Composed" then:
  any:
  - recommend activity "LocalAct" unless "GuardC".
  - use decision "SubDec".
  end.
- when "Dual" then recommend activity "Dual".
- when "Narr" then recommend activity "LocalAct".
- when "CodedConcept" then recommend activity "LocalAct".
- otherwise then recommend activity "LocalAct".`;

const SHARED_CRL = `# S
library "Shared Lib".
activity "SharedAct":
- request CPGCommunicationRequest.
- with \`sa\`.`;

const CEL = `# C
library "C".
covers "Policy".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "c":
- subject is "Pat".
- result is "PolicyDec" is "LocalAct".`;

function withIndex(crlShared: boolean, fn: (idx: ProvenanceIndex) => void): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "prov-idx-"));
  try {
    const pkg = {
      name: "p",
      version: "0.0.0",
      private: true,
      crl: crlShared ? { sharedLibraries: ["Shared Lib"] } : {},
    };
    writeFileSync(path.join(root, "package.json"), JSON.stringify(pkg));
    writeFileSync(path.join(root, "policy.crl"), POLICY_CRL);
    writeFileSync(path.join(root, "shared.crl"), SHARED_CRL);
    const celPath = path.join(root, "f.cel");
    writeFileSync(celPath, CEL);
    fn(buildProvenanceIndex(resolveCelImports(celPath)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const c = (name: string): ProvNodeRef => ({ lib: "Policy", kind: "concept", name });
const reached = (idx: ProvenanceIndex, ref: ProvNodeRef): boolean => idx.isDecisionReached(ref);

describe("buildProvenanceIndex — inventory + nodeKind + ownership (§5)", () => {
  it("inventories declarations with intrinsic nodeKind", () => {
    withIndex(true, (idx) => {
      expect(idx.nodeKindOf(c("Composed"))).toBe("inference"); // defined as
      expect(idx.nodeKindOf(c("OperA"))).toBe("leaf"); // code is
      expect(idx.nodeKindOf({ lib: "Policy", kind: "activity", name: "LocalAct" })).toBe("leaf");
      expect(idx.nodeKindOf({ lib: "Policy", kind: "decision", name: "PolicyDec" })).toBe(
        "decision-node",
      );
    });
  });

  it("ownership: policy lib → policy-owned; manifest-declared shared lib → shared-reference (nodeKind overridden)", () => {
    withIndex(true, (idx) => {
      expect(idx.ownershipOf(c("InWhen"))).toBe("policy-owned");
      const shared: ProvNodeRef = { lib: "Shared Lib", kind: "activity", name: "SharedAct" };
      expect(idx.ownershipOf(shared)).toBe("shared-reference");
      expect(idx.nodeKindOf(shared)).toBe("shared-reference"); // override beats intrinsic "leaf"
    });
  });

  it("materializes decision sub-nodes into the inventory (the over-reach denominator)", () => {
    withIndex(true, (idx) => {
      const sub: ProvNodeRef = {
        lib: "Policy",
        kind: "decision",
        name: "PolicyDec",
        nodeId: "when[0]/action[0]",
      };
      expect(idx.nodeKindOf(sub)).toBe("decision-node");
      const loc = idx.resolveCrlNodeRef(sub);
      expect("filePath" in loc && loc.filePath.endsWith("policy.crl")).toBe(true);
    });
  });

  it("an undeclared local lib → diagnostic + defaults policy-owned", () => {
    withIndex(false, (idx) => {
      expect(idx.diagnostics.some((d) => d.kind === "undeclared-library-ownership")).toBe(true);
      expect(idx.ownershipOf({ lib: "Shared Lib", kind: "activity", name: "SharedAct" })).toBe(
        "policy-owned",
      );
    });
  });
});

describe("buildProvenanceIndex — static reachability (§5)", () => {
  it("reaches when / guard / recommend / use-decision targets", () => {
    withIndex(true, (idx) => {
      expect(reached(idx, c("InWhen"))).toBe(true); // when-condition
      expect(reached(idx, c("GuardC"))).toBe(true); // guard
      expect(reached(idx, { lib: "Policy", kind: "activity", name: "LocalAct" })).toBe(true); // recommend
      expect(reached(idx, { lib: "Shared Lib", kind: "activity", name: "SharedAct" })).toBe(true); // qualified recommend
      expect(reached(idx, { lib: "Policy", kind: "decision", name: "SubDec" })).toBe(true); // use-decision
    });
  });

  it("transitively reaches `defined as` inference operands", () => {
    withIndex(true, (idx) => {
      expect(reached(idx, c("Composed"))).toBe(true);
      expect(reached(idx, c("OperA"))).toBe(true); // operand of Composed (also a when in SubDec)
      expect(reached(idx, c("OperB"))).toBe(true); // operand of Composed only
      const edges = idx.decisionReachability.get(
        JSON.stringify(["Policy", "concept", "OperB", null]),
      )!.edges;
      expect(edges.some((e) => e.relation === "inference-operand")).toBe(true);
    });
  });

  it("reachedBy is complete across seeds — a concept shared by two top-level decisions accrues BOTH", () => {
    withIndex(true, (idx) => {
      // OperA is reached from PolicyDec (Composed's operand + via SubDec use-decision) AND is SubDec's own when-concept;
      // both PolicyDec and SubDec are top-level (seed) decisions, so per-seed cycle-guard reset must record both.
      const info = idx.decisionReachability.get(
        JSON.stringify(["Policy", "concept", "OperA", null]),
      )!;
      expect(info.reachedBy.has(JSON.stringify(["Policy", "decision", "PolicyDec", null]))).toBe(
        true,
      );
      expect(info.reachedBy.has(JSON.stringify(["Policy", "decision", "SubDec", null]))).toBe(true);
    });
  });

  it("does NOT reach an unreferenced concept (static, not runtime — but truly unused stays out)", () => {
    withIndex(true, (idx) => {
      expect(reached(idx, c("Unref"))).toBe(false);
    });
  });

  it('cross-kind same-name: `when "Dual"` resolves the CONCEPT, `recommend "Dual"` resolves the ACTIVITY', () => {
    withIndex(true, (idx) => {
      expect(idx.nodeKindOf(c("Dual"))).toBe("leaf"); // concept Dual inventoried
      expect(idx.nodeKindOf({ lib: "Policy", kind: "activity", name: "Dual" })).toBe("leaf"); // activity Dual inventoried
      expect(reached(idx, c("Dual"))).toBe(true); // when-condition → concept
      expect(reached(idx, { lib: "Policy", kind: "activity", name: "Dual" })).toBe(true); // recommend → activity
    });
  });

  it("reaches a `definition is` narrative concept ref + a reached activity's `with` terminology", () => {
    withIndex(true, (idx) => {
      expect(reached(idx, c("NarrTarget"))).toBe(true); // via Narr's definition-is narrative
      expect(reached(idx, { lib: "Policy", kind: "terminology", name: "Term" })).toBe(true); // via Dual activity withClause
    });
  });

  it("a reached concept's `coded from` terminology is NOT walked (spec §5: terminology-reachability is activity-scoped)", () => {
    withIndex(true, (idx) => {
      expect(reached(idx, c("CodedConcept"))).toBe(true); // the concept IS reached (when-condition)
      expect(reached(idx, { lib: "Policy", kind: "terminology", name: "CodedTerm" })).toBe(false); // its terminology is NOT
    });
  });

  it("a reached decision's sub-nodes are themselves decision-reached (spine-member, for §9.2)", () => {
    withIndex(true, (idx) => {
      const d = (nodeId?: string): ProvNodeRef => ({
        lib: "Policy",
        kind: "decision",
        name: "PolicyDec",
        nodeId,
      });
      expect(reached(idx, d())).toBe(true); // the decision decl
      expect(reached(idx, d("when[0]"))).toBe(true); // a branch sub-node
      expect(reached(idx, d("when[0]/action[0]"))).toBe(true); // an action sub-node
    });
  });
});

describe("buildProvenanceIndex — degenerate input", () => {
  it("no resolved coversTarget → empty index + no-policy-anchor diagnostic (never throws)", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "prov-idx-deg-"));
    try {
      writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({ name: "p", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/p" } }),
      );
      const celPath = path.join(root, "f.cel");
      writeFileSync(
        celPath,
        '# C\nlibrary "C".\ncovers "Does Not Exist".\nfact "P":\n- name is "p".\n- defined by "Patient".\ncase "c":\n- subject is "P".',
      );
      const idx = buildProvenanceIndex(resolveCelImports(celPath));
      expect(idx.nodes.size).toBe(0);
      expect(idx.diagnostics.some((dg) => dg.kind === "no-policy-anchor")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a bad nodeId → unresolved", () => {
    withIndex(true, (idx) => {
      const miss = idx.resolveCrlNodeRef({
        lib: "Policy",
        kind: "decision",
        name: "PolicyDec",
        nodeId: "when[99]",
      });
      expect("unresolved" in miss && miss.unresolved).toBe(true);
    });
  });

  function withRawPkg(pkgRaw: string, fn: (kinds: string[]) => void): void {
    const root = mkdtempSync(path.join(os.tmpdir(), "prov-idx-pkg-"));
    try {
      writeFileSync(path.join(root, "package.json"), pkgRaw);
      writeFileSync(path.join(root, "policy.crl"), POLICY_CRL);
      writeFileSync(path.join(root, "shared.crl"), SHARED_CRL);
      const celPath = path.join(root, "f.cel");
      writeFileSync(celPath, CEL);
      fn(buildProvenanceIndex(resolveCelImports(celPath)).diagnostics.map((d) => d.kind));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it("malformed package.json JSON → manifest-unreadable", () => {
    withRawPkg('{ "name": "p", this is not json', (kinds) =>
      expect(kinds).toContain("manifest-unreadable"),
    );
  });
  it("crl.sharedLibraries not a string[] → shared-libraries-not-array", () => {
    withRawPkg(
      JSON.stringify({
        name: "p",
        version: "0.0.0",
        private: true,
        crl: { sharedLibraries: "Shared Lib" },
      }),
      (kinds) => expect(kinds).toContain("shared-libraries-not-array"),
    );
  });
});

describe("buildProvenanceIndex — resolveCrlNodeRef", () => {
  it("resolves a declaration; unresolved on a miss", () => {
    withIndex(true, (idx) => {
      const loc = idx.resolveCrlNodeRef(c("InWhen"));
      expect("filePath" in loc && loc.filePath.endsWith("policy.crl")).toBe(true);
      const miss = idx.resolveCrlNodeRef(c("Nope"));
      expect("unresolved" in miss && miss.unresolved).toBe(true);
    });
  });
});
