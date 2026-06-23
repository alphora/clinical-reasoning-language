import { createHash } from "crypto";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import * as os from "os";
import * as path from "path";

import type {
  AnchorSourceMeta,
  CelNodeRef,
  Cluster,
  CrlNodeRef,
  IgnoredRange,
  Item,
  ProvenanceArtifact,
} from "../artifact";
import { buildCorrespondenceModel, type CorrespondenceModel } from "../correspondence";

// ── synthetic policy (mirrors provenance/tests/coverage.test.ts) ──────────────
const POLICY_CRL = `# P
library "Policy".
concept "Crit":
- type is Condition.
- code is \`c\`.
concept "Orphan":
- type is Condition.
- code is \`o\`.
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
case "approve case":
- id is "case-approve".
- subject is "Pat".
- result is "Dec" is "Approve".`;

// "—" is a 3-byte em-dash (U+2014); "coverage applies" sits AFTER it → multi-byte offset.
const ANCHOR = "Patient has a documented fracture nonunion — coverage applies.\n";
const bspan = (sub: string) => {
  const ci = ANCHOR.indexOf(sub);
  const start = Buffer.byteLength(ANCHOR.slice(0, ci), "utf8");
  return { start, end: start + Buffer.byteLength(sub, "utf8") };
};
const DASH_BYTE = Buffer.byteLength(ANCHOR.slice(0, ANCHOR.indexOf("—")), "utf8");
const MALFORMED = { start: DASH_BYTE + 1, end: DASH_BYTE + 2 }; // mid em-dash → non-boundary
const TEXT_HASH =
  "sha256:" + createHash("sha256").update(Buffer.from(ANCHOR, "utf8")).digest("hex");

const meta = (textHash: string): AnchorSourceMeta => ({
  path: "anchor.txt",
  derivedFrom: "x.docx",
  derivedFromHash: "sha256:0",
  canonicalizer: "crl-anchor-docx-text",
  canonicalizerVersion: "1.0.0",
  textHash,
  offsetUnit: "utf8-byte",
  unicodeNormalization: "NFC",
  rangeConvention: "half-open",
});

const crlRef = (name: string, relation: CrlNodeRef["relation"]): CrlNodeRef => ({
  lib: "Policy",
  kind: "concept",
  name,
  nodeKind: "leaf",
  ownership: "policy-owned",
  relation,
  status: "linked",
});
const celRef = (caseId: string): CelNodeRef => ({
  file: "f.cel",
  kind: "case",
  caseId,
  relation: "tests-branch",
  status: "linked",
});
const admin = (id: string, text: string, refs: { start: number; end: number }[]): Item => ({
  id,
  origin: "source",
  text,
  role: "administrative",
  roleStatus: "reconciled",
  linkRequirement: "rationale-only",
  rationale: "non-criterial",
  dispositionClass: "no-operational-disposition",
  sourceRefs: refs,
});

function buildArtifact(textHash: string): ProvenanceArtifact {
  const items: Item[] = [
    {
      id: "i1",
      origin: "source",
      text: "documented fracture nonunion",
      role: "criterion",
      roleStatus: "reconciled",
      linkRequirement: "must-link-decision",
      sourceRefs: [bspan("documented fracture nonunion")],
    },
    admin("i2", "coverage applies", [bspan("coverage applies")]),
    admin("i3", "malformed-span item", [MALFORMED]),
    // text deliberately ≠ the anchor bytes at its sourceRef → item-text-drift
    { ...admin("i4", "TEXT THAT DOES NOT MATCH", [bspan("nonunion")]) },
    // an applicability item linked into a decision cluster → §9.2 structural-mistag
    {
      id: "i5",
      origin: "source",
      text: "applies to Illinois members",
      role: "applicability",
      roleStatus: "provisional",
      linkRequirement: "may-link-concept",
      rationale: "eligibility scope",
      dispositionClass: "presumed-scope",
      sourceRefs: [bspan("Patient")],
    },
  ];
  const clusters: Cluster[] = [
    {
      id: "cl1",
      label: "covered",
      items: ["i1"],
      crl: [crlRef("Crit", "implements-criterion")],
      cel: [celRef("case-approve")],
    },
    // repeated item + repeated node + an unresolved (nonexistent/unfrozen) CEL ref
    {
      id: "cl2",
      label: "repeat",
      items: ["i1"],
      crl: [crlRef("Crit", "implements-criterion")],
      cel: [celRef("nonexistent")],
    },
    // source-only cluster: a multi-byte span + a malformed span (no decision link → no structural-mistag)
    { id: "cl3", label: "source", items: ["i2", "i3"], crl: [], cel: [] },
    // CEL-target SPECIFICITY: one resolved + one unresolved case in the same cluster → finding targets only the unresolved one
    {
      id: "cl4",
      label: "mixed-cel",
      items: ["i1"],
      crl: [crlRef("Crit", "implements-criterion")],
      cel: [celRef("case-approve"), celRef("nonexistent2")],
    },
    { id: "cl5", label: "drift", items: ["i4"], crl: [], cel: [] },
    // applicability item linked to the decision-reached Crit → structural-mistag
    {
      id: "cl6",
      label: "mistag",
      items: ["i5"],
      crl: [crlRef("Crit", "implements-criterion")],
      cel: [],
    },
  ];
  const ignoredRanges: IgnoredRange[] = [{ ...bspan("Patient"), reason: "subject heading" }];
  return {
    schemaVersion: "1.0",
    policyId: "P",
    policyVersion: "1",
    anchorSource: meta(textHash),
    items,
    ignoredRanges,
    clusters,
  };
}

let root: string;
let model: CorrespondenceModel;
let celPath: string;
let anchorPath: string;

const writeArtifact = (a: ProvenanceArtifact): string => {
  const p = path.join(root, `artifact-${a.anchorSource.textHash.slice(-6)}.json`);
  writeFileSync(p, JSON.stringify(a));
  return p;
};

beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "prov-corr-"));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "p", version: "0.0.0", private: true }),
  );
  writeFileSync(path.join(root, "policy.crl"), POLICY_CRL);
  celPath = path.join(root, "f.cel");
  writeFileSync(celPath, CEL);
  anchorPath = path.join(root, "anchor.txt");
  writeFileSync(anchorPath, ANCHOR);
  model = buildCorrespondenceModel(writeArtifact(buildArtifact(TEXT_HASH)), celPath, anchorPath);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const unit = (id: string) => model.units.find((u) => u.id === id)!;

describe("buildCorrespondenceModel — units + resolution", () => {
  it("builds one unit per cluster with policy identity", () => {
    expect(model.policyId).toBe("P");
    expect(model.units.map((u) => u.id).sort()).toEqual(["cl1", "cl2", "cl3", "cl4", "cl5", "cl6"]);
    expect(model.anchor.text).toBe(ANCHOR);
  });

  it("resolves a CRL node to a location + stable nodeKey, repeated across units (COVER)", () => {
    const a = unit("cl1").crl[0];
    const b = unit("cl2").crl[0];
    expect(a.unresolved).toBeUndefined();
    expect(a.location).toBeDefined();
    expect(a.nodeKey).toBe(b.nodeKey); // same Crit node across two units — repetition detectable via the stable key
    expect(a.authoringRef?.relation).toBe("implements-criterion"); // rich cluster ref retained
    expect(typeof a.decisionReached).toBe("boolean");
  });

  it("resolves a source span to a display range + exact text", () => {
    const sp = unit("cl1").source.find((s) => s.itemId === "i1")!;
    expect(sp.text).toBe("documented fracture nonunion");
    expect(sp.displayRange).toBeDefined();
    expect(sp.unresolved).toBeUndefined();
  });

  it("handles a multi-byte (post-em-dash) span and a MALFORMED span without crashing", () => {
    const multi = unit("cl3").source.find((s) => s.itemId === "i2")!;
    expect(multi.text).toBe("coverage applies"); // offset past the 3-byte em-dash resolved correctly
    const bad = unit("cl3").source.find((s) => s.itemId === "i3")!;
    expect(bad.unresolved).toBeDefined(); // malformed → unresolved, model still built
    expect(bad.displayRange).toBeUndefined();
  });

  it("carries full non-spatial item context", () => {
    const it = unit("cl3").items.find((i) => i.id === "i2")!;
    expect(it.role).toBe("administrative");
    expect(it.rationale).toBe("non-criterial");
    expect(it.dispositionClass).toBe("no-operational-disposition");
  });

  it("resolves CEL against FROZEN ids; an unfrozen/nonexistent ref is unresolved", () => {
    const ok = unit("cl1").cel[0];
    expect(ok.explicitCaseId).toBe(true);
    expect(ok.location).toBeDefined();
    expect(ok.file).toBe(celPath); // normalized to abs
    const bad = unit("cl2").cel[0];
    expect(bad.explicitCaseId).toBe(false);
    expect(bad.unresolved).toBeDefined();
  });
});

describe("buildCorrespondenceModel — over-reach, ignored, rollup", () => {
  it("surfaces CRL over-reach (the unclustered Orphan leaf) as ProvNodeRef nodes", () => {
    expect(model.overReachNodes.length).toBeGreaterThan(0);
    const o = model.overReachNodes.find((n) => n.ref.name === "Orphan")!;
    expect(o).toBeDefined();
    expect(o.authoringRef).toBeUndefined(); // an over-reach node has no authoring cluster ref
    expect(o.nodeKey).toContain("Orphan");
  });

  it("carries author-declared ignored ranges with display ranges", () => {
    expect(model.ignoredSourceRanges).toHaveLength(1);
    expect(model.ignoredSourceRanges[0].reason).toBe("subject heading");
    expect(model.ignoredSourceRanges[0].displayRange).toBeDefined();
  });

  it("rollup: defined coverage denominator + symmetric kind counts", () => {
    expect(model.rollup.mustLinkDecisionsTotal).toBe(1); // i1
    expect(model.rollup.mustLinkDecisionsImplemented).toBe(1); // covered via cl1
    expect(model.rollup.pass).toBe(model.rollup.errorCount === 0);
    expect(Object.values(model.rollup.findingCountsByKind).reduce((a, b) => a + b, 0)).toBe(
      model.findings.length,
    );
  });
});

describe("buildCorrespondenceModel — finding targets", () => {
  const findBy = (kind: string) => model.findings.filter((f) => f.finding.kind === kind);

  it("an unresolved CEL ref yields a cel-unresolved finding with a specific cel target", () => {
    const f = findBy("cel-unresolved")[0];
    expect(f).toBeDefined();
    const cel = f.targets.find((t) => t.pane === "cel");
    expect(cel).toBeDefined();
    expect(cel!.resolution).toBe("unresolved");
  });

  it("over-reach finding carries a crl target", () => {
    const f = findBy("over-reach")[0];
    expect(f).toBeDefined();
    expect(f.targets.some((t) => t.pane === "crl")).toBe(true);
  });

  it("a cluster with a resolved AND an unresolved CEL ref targets ONLY the unresolved case", () => {
    const f = findBy("cel-unresolved").find((x) => x.finding.cluster === "cl4")!;
    expect(f).toBeDefined();
    const cel = f.targets.filter((t) => t.pane === "cel");
    expect(cel).toHaveLength(1); // not both cl4 cases — only "nonexistent2"
    expect(cel[0].resolution).toBe("unresolved");
  });

  it("an unfrozen/nonexistent ref also yields a provenance-references-unfrozen-case finding with a cel target", () => {
    const f = findBy("provenance-references-unfrozen-case")[0];
    expect(f).toBeDefined();
    expect(f.targets.some((t) => t.pane === "cel" && t.resolution === "unresolved")).toBe(true);
  });

  it("item-text-drift (item text ≠ anchor bytes) carries a source target on its item", () => {
    const f = findBy("item-text-drift").find((x) => x.finding.itemId === "i4")!;
    expect(f).toBeDefined();
    expect(f.targets.some((t) => t.pane === "source" && t.itemId === "i4")).toBe(true);
  });

  it("structural-mistag (applicability item linked into a decision cluster) is surfaced with a target", () => {
    const f = findBy("structural-mistag").find((x) => x.finding.itemId === "i5")!;
    expect(f).toBeDefined();
    expect(f.targets.length).toBeGreaterThan(0);
  });

  it("every finding has at least one target (locus-less findings never vanish)", () => {
    for (const f of model.findings) expect(f.targets.length).toBeGreaterThan(0);
  });

  it("a stale anchor hash → anchor-hash-drift attached to a pane:'anchor' target", () => {
    const drifted = buildCorrespondenceModel(
      writeArtifact(buildArtifact("sha256:deadbeef")),
      celPath,
      anchorPath,
    );
    const f = drifted.findings.find((x) => x.finding.kind === "anchor-hash-drift")!;
    expect(f).toBeDefined();
    expect(f.targets.some((t) => t.pane === "anchor")).toBe(true);
  });
});

describe("buildCorrespondenceModel — degenerate input", () => {
  it("a CEL parse failure still renders artifact units + surfaces a cel-parse diagnostic", () => {
    const badCel = path.join(root, "broken.cel");
    writeFileSync(badCel, "this is not valid CEL @@@");
    const m = buildCorrespondenceModel(writeArtifact(buildArtifact(TEXT_HASH)), badCel, anchorPath);
    expect(m.units.length).toBe(6); // artifact still renders (source + CRL marks)
    expect(m.units.flatMap((u) => u.cel).every((c) => c.unresolved)).toBe(true); // CEL marks unresolved
    expect(m.diagnostics.some((d) => d.source === "cel-parse")).toBe(true);
  });

  it("throws on unreadable input (mirrors validateProvenanceFiles)", () => {
    expect(() =>
      buildCorrespondenceModel(path.join(root, "nope.json"), celPath, anchorPath),
    ).toThrow();
  });
});
