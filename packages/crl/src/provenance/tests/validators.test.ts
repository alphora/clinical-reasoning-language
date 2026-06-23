import { createHash } from "crypto";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import * as os from "os";
import * as path from "path";

import { resolveCelImports } from "../../cel/imports";
import type { ProvenanceArtifact, Item, Cluster, CrlNodeRef, AnchorSourceMeta } from "../artifact";
import { buildProvenanceIndex, type ProvenanceIndex } from "../indexer";
import { validateProvenance, isStrictAncestor, type ProvenanceFinding } from "../validators";

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
- otherwise then recommend activity "Approve".
decision "Dec2":
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

let idx: ProvenanceIndex;
let root: string;
beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "prov-val-"));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "p", version: "0.0.0", private: true }),
  );
  writeFileSync(path.join(root, "policy.crl"), POLICY_CRL);
  const celPath = path.join(root, "f.cel");
  writeFileSync(celPath, CEL);
  idx = buildProvenanceIndex(resolveCelImports(celPath));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const metaFor = (text: string): AnchorSourceMeta => ({
  path: "x.txt",
  derivedFrom: "x.docx",
  derivedFromHash: "sha256:0",
  canonicalizer: "crl-anchor-docx-text",
  canonicalizerVersion: "1.0.0",
  textHash: "sha256:" + createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex"),
  offsetUnit: "utf8-byte",
  unicodeNormalization: "NFC",
  rangeConvention: "half-open",
});

function art(
  opts: { items?: Item[]; clusters?: Cluster[]; anchorMeta?: AnchorSourceMeta },
  text = "",
): ProvenanceArtifact {
  return {
    schemaVersion: "1.0",
    policyId: "P",
    policyVersion: "1",
    anchorSource: opts.anchorMeta ?? metaFor(text),
    items: opts.items ?? [],
    ignoredRanges: [],
    clusters: opts.clusters ?? [],
  };
}
const run = (a: ProvenanceArtifact, text = ""): ProvenanceFinding[] =>
  validateProvenance(a, idx, text);
const kinds = (fs: ProvenanceFinding[]) => fs.map((f) => f.kind);

// good refs (stored kind/ownership agree with the index: Crit/Approve are policy-owned leaf)
const ref = (
  name: string,
  kind: string,
  relation: CrlNodeRef["relation"],
  status: CrlNodeRef["status"],
  nodeId?: string,
  nodeKind: CrlNodeRef["nodeKind"] = "leaf",
): CrlNodeRef => ({
  lib: "Policy",
  kind,
  name,
  ...(nodeId !== undefined ? { nodeId } : {}),
  nodeKind,
  ownership: "policy-owned",
  relation,
  status,
});

describe("validateProvenance — V1/V2 referential integrity + agreement", () => {
  it("unresolved CRL ref → unresolved-ref; stored nodeKind ≠ index → nodekind-mismatch", () => {
    const ghost: Cluster[] = [
      {
        id: "c1",
        label: "x",
        items: [],
        crl: [ref("Ghost", "concept", "implements-criterion", "linked")],
        cel: [],
      },
    ];
    expect(kinds(run(art({ clusters: ghost })))).toContain("unresolved-ref");
    const mism: Cluster[] = [
      {
        id: "c1",
        label: "x",
        items: [],
        crl: [ref("Crit", "concept", "implements-criterion", "linked", undefined, "composition")],
        cel: [],
      },
    ];
    expect(kinds(run(art({ clusters: mism })))).toContain("nodekind-mismatch");
  });
});

describe("validateProvenance — V3 hash drift", () => {
  it("wrong textHash → anchor-hash-drift; matching hash + item.text ≠ bytes → item-text-drift", () => {
    expect(
      kinds(
        run(art({ anchorMeta: { ...metaFor("abc"), textHash: "sha256:WRONG" } }, "abc")),
      ).filter((k) => k === "anchor-hash-drift").length,
    ).toBe(1);
    const items: Item[] = [
      { id: "n1", origin: "source", text: "WRONG TEXT", sourceRefs: [{ start: 0, end: 3 }] },
    ];
    expect(kinds(run(art({ items }, "abc"), "abc"))).toContain("item-text-drift");
    // matching text → no drift
    const ok: Item[] = [
      { id: "n1", origin: "source", text: "abc", sourceRefs: [{ start: 0, end: 3 }] },
    ];
    expect(kinds(run(art({ items: ok }, "abc"), "abc"))).not.toContain("item-text-drift");
  });
});

describe("validateProvenance — V5 linkRequirement", () => {
  it("must-link-decision unimplemented → missed-decision; intentionally-unlinked → illegal", () => {
    const items: Item[] = [
      {
        id: "n1",
        origin: "source",
        text: "x",
        role: "criterion",
        linkRequirement: "must-link-decision",
      },
    ];
    expect(kinds(run(art({ items })))).toContain("missed-decision");
    const clusters: Cluster[] = [
      {
        id: "c1",
        label: "x",
        items: ["n1"],
        crl: [ref("Crit", "concept", "implements-criterion", "intentionally-unlinked")],
        cel: [],
      },
    ];
    expect(kinds(run(art({ items, clusters })))).toContain("illegal-intentional-unlink");
  });
  it("non-decision item missing rationale/dispositionClass → errors", () => {
    const items: Item[] = [
      {
        id: "n1",
        origin: "source",
        text: "x",
        role: "applicability",
        linkRequirement: "rationale-only",
      },
    ];
    const k = kinds(run(art({ items })));
    expect(k).toContain("missing-rationale");
    expect(k).toContain("missing-disposition-class");
  });
});

describe("validateProvenance — V6 drivesDetermination ancestor", () => {
  const crit = (
    drives: {
      determination: string;
      polarity: "present-drives" | "absent-drives";
      expectedDisposition: string;
    }[],
  ): Item => ({
    id: "crit",
    origin: "source",
    text: "c",
    role: "criterion",
    linkRequirement: "must-link-decision",
    drivesDetermination: drives,
  });
  const det: Item = {
    id: "det",
    origin: "source",
    text: "d",
    role: "determination",
    linkRequirement: "must-link-decision",
  };

  it("criterion node ancestor of determination node → no violation", () => {
    const items = [
      crit([{ determination: "det", polarity: "present-drives", expectedDisposition: "deny" }]),
      det,
    ];
    const clusters: Cluster[] = [
      {
        id: "cc",
        label: "",
        items: ["crit"],
        crl: [ref("Dec", "decision", "implements-criterion", "linked", "when[0]", "decision-node")],
        cel: [],
      },
      {
        id: "cd",
        label: "",
        items: ["det"],
        crl: [
          ref(
            "Dec",
            "decision",
            "implements-determination",
            "linked",
            "when[0]/action[0]",
            "decision-node",
          ),
        ],
        cel: [],
      },
    ];
    expect(
      kinds(run(art({ items, clusters }))).filter((k) => k.startsWith("drives-determination")),
    ).toEqual([]);
  });
  it("determination NOT under the criterion node → violation", () => {
    const items = [
      crit([{ determination: "det", polarity: "present-drives", expectedDisposition: "deny" }]),
      det,
    ];
    const clusters: Cluster[] = [
      {
        id: "cc",
        label: "",
        items: ["crit"],
        crl: [ref("Dec", "decision", "implements-criterion", "linked", "when[0]", "decision-node")],
        cel: [],
      },
      {
        id: "cd",
        label: "",
        items: ["det"],
        crl: [
          ref(
            "Dec",
            "decision",
            "implements-determination",
            "linked",
            "otherwise/action[0]",
            "decision-node",
          ),
        ],
        cel: [],
      },
    ];
    expect(kinds(run(art({ items, clusters })))).toContain("drives-determination-violation");
  });
  it("endpoint without a nodeId → unverifiable (manual-review, not a crash)", () => {
    const items = [
      crit([{ determination: "det", polarity: "present-drives", expectedDisposition: "deny" }]),
      det,
    ];
    const clusters: Cluster[] = [
      {
        id: "cc",
        label: "",
        items: ["crit"],
        crl: [ref("Crit", "concept", "implements-criterion", "linked")],
        cel: [],
      },
    ];
    expect(kinds(run(art({ items, clusters })))).toContain("drives-determination-unverifiable");
  });
  it("edge target not a determination item → bad-target; drivesDetermination on non-criterion → bad-source", () => {
    const items = [
      crit([{ determination: "crit", polarity: "present-drives", expectedDisposition: "deny" }]),
    ]; // targets itself (a criterion)
    expect(kinds(run(art({ items })))).toContain("drives-determination-bad-target");
    const bad: Item[] = [
      {
        id: "a",
        origin: "source",
        text: "x",
        role: "administrative",
        drivesDetermination: [
          { determination: "b", polarity: "present-drives", expectedDisposition: "deny" },
        ],
      },
    ];
    const bk = kinds(run(art({ items: bad })));
    expect(bk).toContain("drives-determination-bad-source");
    expect(bk).not.toContain("drives-determination-bad-target"); // non-criterion source short-circuits (no per-edge pile-on)
  });

  it("existential pairing: one good pair among candidates passes; cross-decision pairs do NOT cross-satisfy", () => {
    const items = [
      crit([{ determination: "det", polarity: "present-drives", expectedDisposition: "deny" }]),
      det,
    ];
    // criterion linked in BOTH Dec and Dec2; determination only under Dec2 → the Dec2 pair satisfies → no violation
    const good: Cluster[] = [
      {
        id: "cc",
        label: "",
        items: ["crit"],
        crl: [
          ref("Dec", "decision", "implements-criterion", "linked", "when[0]", "decision-node"),
          ref("Dec2", "decision", "implements-criterion", "linked", "when[0]", "decision-node"),
        ],
        cel: [],
      },
      {
        id: "cd",
        label: "",
        items: ["det"],
        crl: [
          ref(
            "Dec2",
            "decision",
            "implements-determination",
            "linked",
            "when[0]/action[0]",
            "decision-node",
          ),
        ],
        cel: [],
      },
    ];
    expect(
      kinds(run(art({ items, clusters: good }))).filter((k) =>
        k.startsWith("drives-determination"),
      ),
    ).toEqual([]);
    // criterion only in Dec, determination only in Dec2 → no cross-satisfy → violation
    const cross: Cluster[] = [
      {
        id: "cc",
        label: "",
        items: ["crit"],
        crl: [ref("Dec", "decision", "implements-criterion", "linked", "when[0]", "decision-node")],
        cel: [],
      },
      {
        id: "cd",
        label: "",
        items: ["det"],
        crl: [
          ref(
            "Dec2",
            "decision",
            "implements-determination",
            "linked",
            "when[0]/action[0]",
            "decision-node",
          ),
        ],
        cel: [],
      },
    ];
    expect(kinds(run(art({ items, clusters: cross })))).toContain("drives-determination-violation");
  });

  it("a stale nodeId endpoint (not in the index) is treated as unverifiable, not a false pass", () => {
    const items = [
      crit([{ determination: "det", polarity: "present-drives", expectedDisposition: "deny" }]),
      det,
    ];
    const stale: Cluster[] = [
      {
        id: "cc",
        label: "",
        items: ["crit"],
        crl: [
          ref("Dec", "decision", "implements-criterion", "linked", "when[99]", "decision-node"),
        ],
        cel: [],
      },
      {
        id: "cd",
        label: "",
        items: ["det"],
        crl: [
          ref(
            "Dec",
            "decision",
            "implements-determination",
            "linked",
            "when[99]/action[0]",
            "decision-node",
          ),
        ],
        cel: [],
      },
    ];
    const k = kinds(run(art({ items, clusters: stale })));
    expect(k).toContain("drives-determination-unverifiable"); // stale endpoints excluded → unverifiable, NOT a false ancestor pass
    expect(k).not.toContain("drives-determination-violation");
  });

  it("malformed edge fields (bad polarity / empty expectedDisposition) → malformed-edge", () => {
    const items = [
      crit([
        {
          determination: "det",
          polarity: "sideways" as "present-drives",
          expectedDisposition: "deny",
        },
      ]),
      det,
    ];
    expect(kinds(run(art({ items })))).toContain("drives-determination-malformed-edge");
  });
});

describe("isStrictAncestor — segment-aware path containment", () => {
  it("strict + segment-boundary aware", () => {
    expect(isStrictAncestor("when[0]", "when[0]/action[0]")).toBe(true);
    expect(isStrictAncestor("when[0]", "when[0]")).toBe(false); // strict (not reflexive)
    expect(isStrictAncestor("when[1]", "when[12]")).toBe(false); // NOT a string-prefix match across a segment
    expect(isStrictAncestor("when[1]", "when[12]/action[0]")).toBe(false);
    expect(isStrictAncestor("when[0]/action[0]", "when[0]")).toBe(false); // descendant ≠ ancestor
  });
});

describe("validateProvenance — V7 authored discipline", () => {
  it("authored supports a missing cluster / not a member → malformed", () => {
    const a: Item[] = [
      {
        id: "auth",
        origin: "authored",
        text: "g",
        authoredKind: "derived-glue",
        supports: { cluster: "nope", items: [] },
      },
    ];
    expect(kinds(run(art({ items: a })))).toContain("authored-supports-malformed");
    const b: Item[] = [
      {
        id: "auth",
        origin: "authored",
        text: "g",
        authoredKind: "derived-glue",
        supports: { cluster: "c1", items: [] },
      },
    ];
    const c: Cluster[] = [{ id: "c1", label: "", items: [], crl: [], cel: [] }]; // auth NOT in c1.items
    expect(kinds(run(art({ items: b, clusters: c })))).toContain("authored-supports-malformed");
  });
});

describe("validateProvenance — V8 §9.1 MN-keyword (hard before soft)", () => {
  it("HARD keyword → manual-review; SOFT → warning; 'not covered' is HARD (not soft 'covered')", () => {
    const hard: Item[] = [
      {
        id: "n1",
        origin: "source",
        text: "This is not covered by the plan.",
        role: "applicability",
        linkRequirement: "rationale-only",
        rationale: "r",
        dispositionClass: "route-elsewhere",
      },
    ];
    const hf = run(art({ items: hard }));
    expect(kinds(hf)).toContain("mn-keyword-hard");
    expect(kinds(hf)).not.toContain("mn-keyword-soft"); // not double-reported as soft "covered"
    const soft: Item[] = [
      {
        id: "n2",
        origin: "source",
        text: "Subject to plan coverage.",
        role: "administrative",
        linkRequirement: "rationale-only",
        rationale: "r",
        dispositionClass: "no-operational-disposition",
      },
    ];
    expect(kinds(run(art({ items: soft })))).toContain("mn-keyword-soft");
    const contra: Item[] = [
      {
        id: "n3",
        origin: "source",
        text: "contraindicated in pregnancy",
        role: "applicability",
        linkRequirement: "rationale-only",
        rationale: "r",
        dispositionClass: "route-elsewhere",
      },
    ];
    expect(kinds(run(art({ items: contra })))).toContain("mn-keyword-hard");
  });

  it("more HARD forms: 'criteria are not met', 'denied', 'ineligible for coverage'; and no false-positive on 'uncovered'/'discovered'", () => {
    const mk = (id: string, text: string): Item => ({
      id,
      origin: "source",
      text,
      role: "applicability",
      linkRequirement: "rationale-only",
      rationale: "r",
      dispositionClass: "route-elsewhere",
    });
    expect(kinds(run(art({ items: [mk("a", "the criteria are not met here")] })))).toContain(
      "mn-keyword-hard",
    );
    expect(kinds(run(art({ items: [mk("b", "the request is denied")] })))).toContain(
      "mn-keyword-hard",
    );
    expect(kinds(run(art({ items: [mk("c", "members ineligible for coverage")] })))).toContain(
      "mn-keyword-hard",
    );
    // "uncovered"/"discovered" must NOT trip soft "covered" (word-boundary)
    const neg = kinds(run(art({ items: [mk("d", "an undiscovered uncovered region")] })));
    expect(neg).not.toContain("mn-keyword-hard");
    expect(neg).not.toContain("mn-keyword-soft");
  });
});

describe("validateProvenance — malformed offsets surface, never throw", () => {
  it("an out-of-range sourceRef → malformed-range finding (no exception)", () => {
    const items: Item[] = [
      { id: "n1", origin: "source", text: "x", sourceRefs: [{ start: 0, end: 9999 }] },
    ];
    let findings: ProvenanceFinding[] = [];
    expect(() => {
      findings = run(art({ items }, "café"), "café"); // 5 bytes; end 9999 out of range
    }).not.toThrow();
    expect(kinds(findings)).toContain("malformed-range");
  });
});

describe("validateProvenance — V9 §9.2 structural + over-reach", () => {
  it("applicability item linked to a decision-reached node → structural-mistag", () => {
    const items: Item[] = [
      {
        id: "n1",
        origin: "source",
        text: "x",
        role: "applicability",
        linkRequirement: "rationale-only",
        rationale: "r",
        dispositionClass: "route-elsewhere",
      },
    ];
    const clusters: Cluster[] = [
      {
        id: "c1",
        label: "",
        items: ["n1"],
        crl: [ref("Crit", "concept", "defines-concept", "provisional")],
        cel: [],
      },
    ];
    expect(kinds(run(art({ items, clusters })))).toContain("structural-mistag"); // Crit is decision-reached (when-condition)
  });
  it("a policy-owned leaf in no cluster → over-reach finding", () => {
    expect(kinds(run(art({})))).toContain("over-reach"); // Crit/Approve unclustered
  });
});
