import { createHash } from "crypto";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import * as os from "os";
import * as path from "path";

import { resolveCelImports } from "../../cel/imports";
import type {
  ProvenanceArtifact,
  Item,
  Cluster,
  CrlNodeRef,
  CelNodeRef,
  AnchorSourceMeta,
} from "../artifact";
import { buildProvenanceIndex, type ProvenanceIndex } from "../indexer";
import {
  validateProvenance,
  isStrictAncestor,
  ATTRIBUTION_KINDS,
  WAIVER_KINDS,
  type ProvenanceFinding,
} from "../validators";

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
        crl: [ref("Crit", "concept", "implements-criterion", "linked", undefined, "inference")],
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

describe("validateProvenance — §7 freeze check (provenance-mandatory caseId)", () => {
  const cel = (caseId: string): CelNodeRef => ({
    file: "f.cel",
    kind: "case",
    caseId,
    relation: "tests-branch",
    status: "linked",
  });
  const frozen = new Map([["f.cel", new Set(["crohns-adult"])]]);
  it("CEL ref to a case lacking an explicit/frozen id → provenance-references-unfrozen-case; a frozen id → none", () => {
    const unfrozen: Cluster[] = [{ id: "c1", label: "", items: [], crl: [], cel: [cel("k2")] }];
    expect(
      validateProvenance(art({ clusters: unfrozen }), idx, "", { frozenCaseIds: frozen }).map(
        (f) => f.kind,
      ),
    ).toContain("provenance-references-unfrozen-case");
    const ok: Cluster[] = [{ id: "c1", label: "", items: [], crl: [], cel: [cel("crohns-adult")] }];
    expect(
      validateProvenance(art({ clusters: ok }), idx, "", { frozenCaseIds: frozen }).map(
        (f) => f.kind,
      ),
    ).not.toContain("provenance-references-unfrozen-case");
  });
  it("without frozenCaseIds the freeze check is skipped", () => {
    const unfrozen: Cluster[] = [{ id: "c1", label: "", items: [], crl: [], cel: [cel("k2")] }];
    expect(run(art({ clusters: unfrozen })).map((f) => f.kind)).not.toContain(
      "provenance-references-unfrozen-case",
    );
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

describe("validateProvenance — finding.class + worklist mode (in-progress vs final grading)", () => {
  // ATTRIBUTION_KINDS is the coverage-backlog set — the only kinds softened in worklist mode.
  it("ATTRIBUTION_KINDS membership is exactly the three coverage-backlog kinds", () => {
    expect([...ATTRIBUTION_KINDS].sort()).toEqual(
      ["missed-decision", "over-reach", "uncovered-span"].sort(),
    );
  });

  it("every finding carries `class`, derived from kind (mode-independent)", () => {
    const findings = run(art({})); // a bare artifact → over-reach (attribution) findings at minimum
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.class).toBe(ATTRIBUTION_KINDS.has(f.kind) ? "attribution" : "integrity");
    }
  });

  // A fixture that produces BOTH an attribution finding (over-reach: Crit/Approve unclustered) AND an integrity finding
  // (nodekind-mismatch: stored "inference" ≠ index "leaf" on a clustered Crit ref).
  const mismCluster: Cluster[] = [
    {
      id: "c1",
      label: "x",
      items: [],
      crl: [ref("Crit", "concept", "implements-criterion", "linked", undefined, "inference")],
      cel: [],
    },
  ];

  it("worklist mode re-grades the 3 attribution kinds error→warning; integrity stays error in BOTH modes", () => {
    const a = art({ clusters: mismCluster });
    const final = validateProvenance(a, idx, "", { mode: "final" });
    const work = validateProvenance(a, idx, "", { mode: "worklist" });

    // over-reach (attribution): error in final, warning in worklist.
    const finalOver = final.filter((f) => f.kind === "over-reach");
    const workOver = work.filter((f) => f.kind === "over-reach");
    expect(finalOver.length).toBeGreaterThan(0);
    expect(finalOver.every((f) => f.severity === "error")).toBe(true);
    expect(workOver.length).toBe(finalOver.length);
    expect(workOver.every((f) => f.severity === "warning" && f.class === "attribution")).toBe(true);

    // nodekind-mismatch (integrity): error in BOTH modes — never softened.
    const finalMism = final.find((f) => f.kind === "nodekind-mismatch")!;
    const workMism = work.find((f) => f.kind === "nodekind-mismatch")!;
    expect(finalMism.severity).toBe("error");
    expect(finalMism.class).toBe("integrity");
    expect(workMism.severity).toBe("error"); // anchor-hash-drift / nodekind-mismatch unchanged in worklist
    expect(workMism.class).toBe("integrity");
  });

  it("anchor-hash-drift (integrity) stays error in worklist mode", () => {
    const a = art({ anchorMeta: { ...metaFor("abc"), textHash: "sha256:WRONG" } }, "abc");
    const work = validateProvenance(a, idx, "abc", { mode: "worklist" });
    const drift = work.find((f) => f.kind === "anchor-hash-drift")!;
    expect(drift.severity).toBe("error");
    expect(drift.class).toBe("integrity");
  });

  it("missed-decision (attribution) re-grades to warning in worklist; error in final", () => {
    const items: Item[] = [
      {
        id: "n1",
        origin: "source",
        text: "x",
        role: "criterion",
        linkRequirement: "must-link-decision",
      },
    ];
    const a = art({ items });
    const final = validateProvenance(a, idx, "", { mode: "final" }).find(
      (f) => f.kind === "missed-decision",
    )!;
    const work = validateProvenance(a, idx, "", { mode: "worklist" }).find(
      (f) => f.kind === "missed-decision",
    )!;
    expect(final.severity).toBe("error");
    expect(work.severity).toBe("warning");
    expect(work.class).toBe("attribution");
  });

  it("default mode is final (no opts.mode) — strict behavior preserved", () => {
    const over = run(art({})).find((f) => f.kind === "over-reach")!;
    expect(over.severity).toBe("error"); // default-final preserved for all current callers
  });
});

describe("validateProvenance — judge-lens WAIVERS (FINAL mode only)", () => {
  const final = (a: ProvenanceArtifact, text = ""): ProvenanceFinding[] =>
    validateProvenance(a, idx, text, { mode: "final" });
  const work = (a: ProvenanceArtifact, text = ""): ProvenanceFinding[] =>
    validateProvenance(a, idx, text, { mode: "worklist" });

  // An authored item (cluster member) supporting a cluster that holds an over-reach CANDIDATE (Crit leaf, provisional →
  // only escape is this support) → waiver-authored, blast radius = Crit.
  const authoredArt = (): ProvenanceArtifact => {
    const items: Item[] = [
      {
        id: "auth",
        origin: "authored",
        text: "glue",
        authoredKind: "clinical-assumption",
        supports: { cluster: "c1", items: [] },
      },
    ];
    const clusters: Cluster[] = [
      {
        id: "c1",
        label: "",
        items: ["auth"],
        crl: [ref("Crit", "concept", "implements-criterion", "provisional")],
        cel: [],
      },
    ];
    return art({ items, clusters });
  };

  // An ignoredRange suppressing a span — with + without MN-hard language. The anchor text is the two phrases joined; the
  // ignoredRange covers the MN phrase so its preview carries MN language.
  const ANCHOR = "Page 12 footer text. not medically necessary here.";
  const ignoredArt = (start: number, end: number): ProvenanceArtifact => ({
    schemaVersion: "1.0",
    policyId: "P",
    policyVersion: "1",
    anchorSource: metaFor(ANCHOR),
    items: [],
    ignoredRanges: [{ start, end, reason: "chrome" }],
    clusters: [],
  });
  const MN_START = ANCHOR.indexOf("not medically necessary");
  const MN_END = ANCHOR.length;
  const CHROME_END = ANCHOR.indexOf(".") + 1;

  // A LEGAL intentionally-unlinked ref naming an over-reach candidate (Crit), in a cluster with NO must-link item →
  // not illegal-intentional-unlink → waiver-intentional-unlink.
  const legalUnlinkArt = (): ProvenanceArtifact => {
    const clusters: Cluster[] = [
      {
        id: "c1",
        label: "",
        items: [],
        crl: [ref("Crit", "concept", "implements-criterion", "intentionally-unlinked")],
        cel: [],
      },
    ];
    return art({ clusters });
  };

  // A source item carrying a presumed-scope dispositionClass ("not my decision") → waiver-disposition-class.
  const dispositionArt = (): ProvenanceArtifact => {
    const items: Item[] = [
      {
        id: "n1",
        origin: "source",
        text: "out of scope clause",
        role: "applicability",
        linkRequirement: "rationale-only",
        rationale: "r",
        dispositionClass: "presumed-scope",
      },
    ];
    return art({ items });
  };

  it("(a) ALL 4 waiver kinds emit in FINAL mode at severity manual-review, class integrity", () => {
    const sets: [string, ProvenanceFinding[]][] = [
      ["waiver-authored", final(authoredArt())],
      ["waiver-ignored-span", final(ignoredArt(0, CHROME_END), ANCHOR)],
      ["waiver-intentional-unlink", final(legalUnlinkArt())],
      ["waiver-disposition-class", final(dispositionArt())],
    ];
    for (const [kind, fs] of sets) {
      const w = fs.filter((f) => f.kind === kind);
      expect(w.length).toBeGreaterThan(0);
      for (const f of w) {
        expect(f.severity).toBe("manual-review");
        expect(f.class).toBe("integrity");
      }
    }
  });

  it("(b) NONE of the waiver kinds emit in WORKLIST mode", () => {
    const arts = [authoredArt(), ignoredArt(0, CHROME_END), legalUnlinkArt(), dispositionArt()];
    const texts = ["", ANCHOR, "", ""];
    for (let i = 0; i < arts.length; i++) {
      const ws = work(arts[i], texts[i]).filter((f) => WAIVER_KINDS.has(f.kind));
      expect(ws).toEqual([]);
    }
  });

  it("(c) a fresh scaffold (items:[], no ignored/unlink/disposition) emits ZERO waiver findings in both modes", () => {
    const scaffold = art({});
    expect(final(scaffold).filter((f) => WAIVER_KINDS.has(f.kind))).toEqual([]);
    expect(work(scaffold).filter((f) => WAIVER_KINDS.has(f.kind))).toEqual([]);
  });

  it("(d) ATTRIBUTION_KINDS is unchanged (exactly over-reach/uncovered-span/missed-decision)", () => {
    expect([...ATTRIBUTION_KINDS].sort()).toEqual(
      ["missed-decision", "over-reach", "uncovered-span"].sort(),
    );
  });

  it("(e) WAIVER_KINDS is exactly the 4 waiver kinds, disjoint from ATTRIBUTION_KINDS", () => {
    expect([...WAIVER_KINDS].sort()).toEqual(
      [
        "waiver-authored",
        "waiver-disposition-class",
        "waiver-ignored-span",
        "waiver-intentional-unlink",
      ].sort(),
    );
    for (const k of WAIVER_KINDS) expect(ATTRIBUTION_KINDS.has(k)).toBe(false);
  });

  it("(f) pass stays true with only waivers, but manual-review count > 0", () => {
    // Fully cover the policy nodes (Crit + Approve linked) so there is NO over-reach error, plus a presumed-scope item
    // whose ONLY surfaced finding is the disposition-class waiver. With zero error-severity findings, pass holds and the
    // waiver rides the manual-review tally. (mirrors validateFiles' pass = errorCount===0; the waiver does not fail.)
    const items: Item[] = [
      {
        id: "n1",
        origin: "source",
        text: "out of scope clause",
        role: "applicability",
        linkRequirement: "rationale-only",
        rationale: "r",
        dispositionClass: "presumed-scope",
      },
    ];
    // Link every over-reach CANDIDATE the index exposes (Crit + Approve leaves; the Dec/Dec2 decision sub-nodes) so no
    // over-reach error fires — leaving the disposition-class waiver as the only non-routine finding.
    const linkCandidates: CrlNodeRef[] = [
      ref("Crit", "concept", "implements-criterion", "linked"),
      ref("Approve", "activity", "recommends-disposition", "linked"),
    ];
    for (const dec of ["Dec", "Dec2"]) {
      for (const nodeId of ["when[0]", "when[0]/action[0]", "otherwise", "otherwise/action[0]"]) {
        linkCandidates.push(
          ref(dec, "decision", "implements-determination", "linked", nodeId, "decision-node"),
        );
      }
    }
    const clusters: Cluster[] = [
      { id: "c1", label: "", items: [], crl: linkCandidates, cel: [] },
    ];
    const fs = final(art({ items, clusters }));
    expect(fs.some((f) => f.severity === "error")).toBe(false); // no over-reach (all candidates covered) → pass holds
    const manualReview = fs.filter((f) => f.severity === "manual-review");
    expect(manualReview.length).toBeGreaterThan(0);
    expect(manualReview.some((f) => f.kind === "waiver-disposition-class")).toBe(true);
  });

  it("(g) waiver-authored names the suppressed node(s) in its message (blast radius)", () => {
    const w = final(authoredArt()).find((f) => f.kind === "waiver-authored")!;
    expect(w).toBeDefined();
    expect(w.message).toMatch(/"Crit"/);
    expect(w.cluster).toBe("c1");
    // clinical-assumption → highest-scrutiny note
    expect(w.message).toMatch(/HIGHEST-SCRUTINY/);
  });

  it("waiver-authored is NOT emitted for an authored support over a cluster with no over-reach candidate (linked ref)", () => {
    // Crit linked in the cluster escapes over-reach on its own → the support suppresses nothing → no waiver.
    const items: Item[] = [
      {
        id: "auth",
        origin: "authored",
        text: "g",
        authoredKind: "derived-glue",
        supports: { cluster: "c1", items: [] },
      },
    ];
    const clusters: Cluster[] = [
      {
        id: "c1",
        label: "",
        items: ["auth"],
        crl: [ref("Crit", "concept", "implements-criterion", "linked")],
        cel: [],
      },
    ];
    expect(kinds(final(art({ items, clusters })))).not.toContain("waiver-authored");
  });

  it("(h) waiver-ignored-span with MN language carries the MN note; chrome-only does not", () => {
    const mn = final(ignoredArt(MN_START, MN_END), ANCHOR).find(
      (f) => f.kind === "waiver-ignored-span",
    )!;
    expect(mn).toBeDefined();
    expect(mn.message).toMatch(/medical-necessity language/);
    expect(mn.message).toMatch(/not medically necessary/); // the preview text
    const chrome = final(ignoredArt(0, CHROME_END), ANCHOR).find(
      (f) => f.kind === "waiver-ignored-span",
    )!;
    expect(chrome).toBeDefined();
    expect(chrome.message).not.toMatch(/medical-necessity language/);
  });

  it("(i) waiver-ignored-span is SKIPPED entirely under anchor-hash-drift (stale offsets)", () => {
    const a: ProvenanceArtifact = {
      schemaVersion: "1.0",
      policyId: "P",
      policyVersion: "1",
      anchorSource: { ...metaFor(ANCHOR), textHash: "sha256:WRONG" },
      items: [],
      ignoredRanges: [{ start: MN_START, end: MN_END, reason: "chrome" }],
      clusters: [],
    };
    const fs = final(a, ANCHOR);
    expect(kinds(fs)).toContain("anchor-hash-drift");
    expect(kinds(fs)).not.toContain("waiver-ignored-span");
  });

  it("(j) waiver-intentional-unlink does NOT stack on illegal-intentional-unlink (must-link case → only the error)", () => {
    // A must-link-decision item with an intentionally-unlinked decision ref → illegal-intentional-unlink (V5 error);
    // the waiver must NOT also fire on the same ref.
    const items: Item[] = [
      {
        id: "n1",
        origin: "source",
        text: "x",
        role: "criterion",
        linkRequirement: "must-link-decision",
      },
    ];
    const clusters: Cluster[] = [
      {
        id: "c1",
        label: "x",
        items: ["n1"],
        crl: [ref("Crit", "concept", "implements-criterion", "intentionally-unlinked")],
        cel: [],
      },
    ];
    const k = kinds(final(art({ items, clusters })));
    expect(k).toContain("illegal-intentional-unlink");
    expect(k).not.toContain("waiver-intentional-unlink");
  });

  it("waiver-intentional-unlink fires for a LEGAL unlink naming an over-reach candidate; says over-reach not Missed₁", () => {
    const w = final(legalUnlinkArt()).find((f) => f.kind === "waiver-intentional-unlink")!;
    expect(w).toBeDefined();
    expect(w.ref?.name).toBe("Crit");
    expect(w.message).toMatch(/over-reach escape/);
    expect(w.message).toMatch(/NOT a Missed₁/);
  });

  it("waiver-ignored-span is NOT emitted for a malformed/zero-length ignored range (it suppresses nothing)", () => {
    // out-of-range end → coverage flags malformed-range and the range covers nothing → no suppression claim.
    const oor = final(ignoredArt(0, 9999), ANCHOR);
    expect(kinds(oor)).toContain("malformed-range");
    expect(kinds(oor)).not.toContain("waiver-ignored-span");
    // zero-length → covers nothing → no waiver either.
    expect(kinds(final(ignoredArt(5, 5), ANCHOR))).not.toContain("waiver-ignored-span");
  });

  it("a LEGAL intentional-unlink waiver is NOT hidden by an ILLEGAL unlink of the same node in another cluster", () => {
    // cluster cA: a must-link item intentionally-unlinks Crit → illegal-intentional-unlink (V5 error). cluster cB: NO
    // must-link item, the same Crit intentionally-unlinked → a LEGAL waiver. Keying the dedup by node ALONE would wrongly
    // suppress cB's legal waiver; keying by cluster+node keeps it.
    const items: Item[] = [
      { id: "n1", origin: "source", text: "x", role: "criterion", linkRequirement: "must-link-decision" },
    ];
    const unlinked = (id: string, owns: string[]): Cluster => ({
      id,
      label: "",
      items: owns,
      crl: [ref("Crit", "concept", "implements-criterion", "intentionally-unlinked")],
      cel: [],
    });
    const fs = final(art({ items, clusters: [unlinked("cA", ["n1"]), unlinked("cB", [])] }));
    expect(kinds(fs)).toContain("illegal-intentional-unlink");
    const waivers = fs.filter((f) => f.kind === "waiver-intentional-unlink");
    expect(waivers.length).toBe(1); // only cB's legal unlink, NOT cA's illegal one
    expect(waivers[0].cluster).toBe("cB");
  });

  it("(k) waiver-disposition-class fires on a presumed-scope item with the 'not my decision' framing", () => {
    const w = final(dispositionArt()).find((f) => f.kind === "waiver-disposition-class")!;
    expect(w).toBeDefined();
    expect(w.itemId).toBe("n1");
    expect(w.message).toMatch(/presumed-scope/);
    expect(w.message).toMatch(/out-of-decision-scope/);
  });

  it("waiver-disposition-class also fires for no-operational-disposition, marked routine", () => {
    const items: Item[] = [
      {
        id: "n2",
        origin: "source",
        text: "admin note",
        role: "administrative",
        linkRequirement: "rationale-only",
        rationale: "r",
        dispositionClass: "no-operational-disposition",
      },
    ];
    const w = final(art({ items })).find((f) => f.kind === "waiver-disposition-class")!;
    expect(w).toBeDefined();
    expect(w.message).toMatch(/routine admin\/definition/);
  });

  it("waiver-authored does NOT stack on a V7 authored-supports-malformed error for the same item", () => {
    // authored item supports a cluster it is NOT a member of → V7 error; the waiver must not also fire.
    const items: Item[] = [
      {
        id: "auth",
        origin: "authored",
        text: "g",
        authoredKind: "derived-glue",
        supports: { cluster: "c1", items: [] },
      },
    ];
    const clusters: Cluster[] = [
      {
        id: "c1",
        label: "",
        items: [], // auth NOT a member → V7-malformed
        crl: [ref("Crit", "concept", "implements-criterion", "provisional")],
        cel: [],
      },
    ];
    const k = kinds(final(art({ items, clusters })));
    expect(k).toContain("authored-supports-malformed");
    expect(k).not.toContain("waiver-authored");
  });

  it("each waiver carries a scrutiny flag: scrutinize for the ones a Judge must adjudicate, routine for rubber-stamps", () => {
    const scrutinyOf = (fs: ProvenanceFinding[], kind: string): string | undefined =>
      fs.find((f) => f.kind === kind)?.scrutiny;
    // authored clinical-assumption / MN-flagged ignored span / any intentional-unlink / "not my decision" disposition → scrutinize
    expect(scrutinyOf(final(authoredArt()), "waiver-authored")).toBe("scrutinize");
    expect(scrutinyOf(final(ignoredArt(MN_START, MN_END), ANCHOR), "waiver-ignored-span")).toBe(
      "scrutinize",
    );
    expect(scrutinyOf(final(legalUnlinkArt()), "waiver-intentional-unlink")).toBe("scrutinize");
    expect(scrutinyOf(final(dispositionArt()), "waiver-disposition-class")).toBe("scrutinize");
    // chrome ignored span / no-operational disposition / implementation-artifact authored escape → routine
    expect(scrutinyOf(final(ignoredArt(0, CHROME_END), ANCHOR), "waiver-ignored-span")).toBe(
      "routine",
    );
    const routineDisp: Item[] = [
      {
        id: "n2",
        origin: "source",
        text: "admin",
        role: "administrative",
        linkRequirement: "rationale-only",
        rationale: "r",
        dispositionClass: "no-operational-disposition",
      },
    ];
    expect(scrutinyOf(final(art({ items: routineDisp })), "waiver-disposition-class")).toBe(
      "routine",
    );
    const routineAuth = art({
      items: [
        {
          id: "auth",
          origin: "authored",
          text: "glue",
          authoredKind: "implementation-artifact",
          supports: { cluster: "c1", items: [] },
        },
      ],
      clusters: [
        {
          id: "c1",
          label: "",
          items: ["auth"],
          crl: [ref("Crit", "concept", "implements-criterion", "provisional")],
          cel: [],
        },
      ],
    });
    expect(scrutinyOf(final(routineAuth), "waiver-authored")).toBe("routine");
  });

  it("a no-operational disposition that ALSO trips V8 mn-keyword is scrutinize, not routine (the laundering smell)", () => {
    // admin item with hard MN language → mn-keyword-hard (V8) AND a no-operational disposition waiver; the MN co-fire
    // must bump scrutiny to "scrutinize" so the message ("strengthens the concern") and the field agree.
    const items: Item[] = [
      {
        id: "n_mn",
        origin: "source",
        text: "This is not covered by the plan.",
        role: "administrative",
        linkRequirement: "rationale-only",
        rationale: "r",
        dispositionClass: "no-operational-disposition",
      },
    ];
    const fs = final(art({ items }));
    expect(kinds(fs)).toContain("mn-keyword-hard");
    const w = fs.find((f) => f.kind === "waiver-disposition-class")!;
    expect(w.scrutiny).toBe("scrutinize");
    expect(w.message).toMatch(/strengthens the concern/);
  });

  it("INVARIANT: every waiver carries a scrutiny flag; no non-waiver does", () => {
    // exercise an artifact with all 4 waiver kinds + non-waiver findings, and assert the contract holds across the stream.
    const arts = [authoredArt(), ignoredArt(MN_START, MN_END), legalUnlinkArt(), dispositionArt(), art({})];
    for (const a of arts) {
      for (const f of final(a, ANCHOR)) {
        if (WAIVER_KINDS.has(f.kind)) expect(f.scrutiny).toBeDefined();
        else expect(f.scrutiny).toBeUndefined();
      }
    }
  });

  it("the scrutinize/routine buckets partition the waivers (mirrors validateProvenanceFiles' waiverScrutinizeCount)", () => {
    // one artifact with a mix: a clinical-assumption authored escape (scrutinize) + a no-operational disposition (routine)
    // + a chrome ignored span (routine) + an MN-language ignored span (scrutinize). The counts must partition cleanly.
    const a: ProvenanceArtifact = {
      schemaVersion: "1.0",
      policyId: "P",
      policyVersion: "1",
      anchorSource: metaFor(ANCHOR),
      items: [
        {
          id: "auth",
          origin: "authored",
          text: "glue",
          authoredKind: "clinical-assumption",
          supports: { cluster: "c1", items: [] },
        },
        {
          id: "n2",
          origin: "source",
          text: "admin",
          role: "administrative",
          linkRequirement: "rationale-only",
          rationale: "r",
          dispositionClass: "no-operational-disposition",
        },
      ],
      ignoredRanges: [
        { start: 0, end: CHROME_END, reason: "chrome" },
        { start: MN_START, end: MN_END, reason: "table label" },
      ],
      clusters: [
        {
          id: "c1",
          label: "",
          items: ["auth"],
          crl: [ref("Crit", "concept", "implements-criterion", "provisional")],
          cel: [],
        },
      ],
    };
    const waivers = final(a, ANCHOR).filter((f) => WAIVER_KINDS.has(f.kind));
    const scrutinize = waivers.filter((f) => f.scrutiny === "scrutinize").length;
    const routine = waivers.filter((f) => f.scrutiny === "routine").length;
    expect(waivers.length).toBe(4); // authored + 2 ignored-span + disposition
    expect(scrutinize).toBe(2); // clinical-assumption authored + MN ignored span
    expect(routine).toBe(2); // chrome ignored span + no-operational disposition
    expect(scrutinize + routine).toBe(waivers.length); // every waiver classified (no gaps)
  });
});
