// Provenance↔cockpit correspondence check (#170 todo 2). Builds the #170 minimal fixture decision D in lib L and
// asserts, through the REAL `validateProvenanceFiles(..., "final")` gate, that a cockpit-correspondence finding fires
// iff the cockpit would light rows off a case's run path (bleed) or miss rows on it (miss). The load-bearing case is
// `concept-bleed`: a Deny cluster citing a CONCEPT ref to a treatment that is a `when` in another cell — it PASSES a
// naive structural check but FAILS the real crlRevealMaps resolution (crlAnchorsForUnits), proving the gate runs the
// cockpit's OWN code, not a reimplementation.
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type {
  AnchorSourceMeta,
  CelNodeRef,
  Cluster,
  CrlNodeRef,
  ProvenanceArtifact,
} from "../artifact";
import { buildCockpitModel } from "../cockpitModel";
import { checkCockpitCorrespondence } from "../correspondenceCheck";
import { validateProvenanceFiles } from "../validateFiles";
import { ATTRIBUTION_KINDS, WAIVER_KINDS } from "../validators";

// ── the #170 minimal fixture: decision D in lib L ──────────────────────────────
//   decision "D": first:
//   - when "Drug Requested" then: first:
//     - when "Criterion Met" then recommend activity "L"."Approve".   // when[0]/when[0]/action[0]
//     - otherwise then recommend activity "L"."Deny".                 // when[0]/otherwise/action[0]
//     end.
//   - otherwise then recommend activity "L"."Deny".                   // otherwise/action[0]
const POLICY_CRL = `# L
library "L".
concept "Drug Requested":
- type is Condition.
- code is \`drug\`.
concept "Criterion Met":
- type is Condition.
- code is \`crit\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`a\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`d\`.
decision "D":
first:
- when "Drug Requested" then:
    first:
    - when "Criterion Met" then recommend activity "Approve".
    - otherwise then recommend activity "Deny".
    end.
- otherwise then recommend activity "Deny".`;

// CEL with three cases, each frozen (- id is) so they are revealable, and facts that walk a distinct path:
//   approve : Drug Requested ✓, Criterion Met ✓  → Approve (when[0]/when[0]/action[0])
//   inner   : Drug Requested ✓, Criterion Met ✗  → Deny    (when[0]/otherwise/action[0])
//   outer   : Drug Requested ✗                    → Deny    (otherwise/action[0])
const CEL = `# C
library "C".
covers "L".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fDrug":
- date is "2026-01-01".
- defined by "Drug Requested".
fact "fCrit":
- date is "2026-01-01".
- defined by "Criterion Met".
case "approve":
- id is "case-approve".
- subject is "Pat".
- fact is "fDrug".
- fact is "fCrit".
- result is "D" is "Approve".
case "inner":
- id is "case-inner".
- subject is "Pat".
- fact is "fDrug".
- result is "D" is "Deny".
case "outer":
- id is "case-outer".
- subject is "Pat".
- result is "D" is "Deny".`;

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

const ANCHOR_TEXT = "anchor.\n";

let root: string;
let celPath: string;
let crlPath: string;
let anchorPath: string;
beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "prov-corr-"));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "p", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/p" } }),
  );
  crlPath = path.join(root, "policy.crl");
  celPath = path.join(root, "f.cel");
  anchorPath = path.join(root, "anchor.txt");
  writeFileSync(crlPath, POLICY_CRL);
  writeFileSync(celPath, CEL);
  writeFileSync(anchorPath, ANCHOR_TEXT);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

// ── artifact builders ──────────────────────────────────────────────────────────
const decRef = (nodeId: string): CrlNodeRef => ({
  lib: "L",
  kind: "decision",
  name: "D",
  nodeId,
  nodeKind: "decision-node",
  ownership: "policy-owned",
  relation: "implements-criterion",
  status: "linked",
});
const conceptRef = (name: string): CrlNodeRef => ({
  lib: "L",
  kind: "concept",
  name,
  nodeKind: "leaf",
  ownership: "policy-owned",
  relation: "implements-criterion",
  status: "linked",
});
const activityRef = (name: string): CrlNodeRef => ({
  lib: "L",
  kind: "activity",
  name,
  nodeKind: "shared-reference",
  ownership: "shared-reference",
  relation: "recommends-disposition",
  status: "linked",
});
const celRef = (caseId: string): CelNodeRef => ({
  file: "f.cel",
  kind: "case",
  caseId,
  relation: "tests-branch",
  status: "linked",
});

const cluster = (id: string, crl: CrlNodeRef[], celIds: string[]): Cluster => ({
  id,
  label: id,
  items: [],
  crl,
  cel: celIds.map(celRef),
});

function writeArtifact(clusters: Cluster[]): string {
  const artifact: ProvenanceArtifact = {
    schemaVersion: "1.0",
    policyId: "L",
    policyVersion: "1",
    anchorSource: metaFor(ANCHOR_TEXT),
    items: [],
    ignoredRanges: [],
    clusters,
  };
  const p = path.join(root, `art-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(p, JSON.stringify(artifact));
  return p;
}

const corrKinds = (artPath: string, mode: "final" | "worklist" = "final"): string[] =>
  validateProvenanceFiles(artPath, celPath, anchorPath, mode).findings.map((f) => f.kind);

const corrFindings = (artPath: string, mode: "final" | "worklist" = "final") =>
  validateProvenanceFiles(artPath, celPath, anchorPath, mode).findings.filter(
    (f) => f.kind === "cockpit-correspondence",
  );

// The clean per-case path clusters (the run paths). Reused as the baseline that the FAIL fixtures perturb.
const approveOk = cluster(
  "approve",
  [decRef("when[0]"), decRef("when[0]/when[0]"), decRef("when[0]/when[0]/action[0]")],
  ["case-approve"],
);
const innerDenyOk = cluster(
  "inner",
  [decRef("when[0]"), decRef("when[0]/otherwise"), decRef("when[0]/otherwise/action[0]")],
  ["case-inner"],
);
const outerDenyOk = cluster("outer", [decRef("otherwise"), decRef("otherwise/action[0]")], [
  "case-outer",
]);

describe("checkCockpitCorrespondence — #170 fixture table (via the FINAL gate)", () => {
  it("approve-ok / inner-deny-ok / outer-deny-ok → no cockpit-correspondence finding (lit == path)", () => {
    const art = writeArtifact([approveOk, innerDenyOk, outerDenyOk]);
    expect(corrFindings(art)).toEqual([]);
  });

  it("missing-ancestor: drop when[0] from the inner-deny cluster → FAIL (miss when[0])", () => {
    const broken = cluster(
      "inner",
      [decRef("when[0]/otherwise"), decRef("when[0]/otherwise/action[0]")],
      ["case-inner"],
    );
    const art = writeArtifact([approveOk, broken, outerDenyOk]);
    const fs = corrFindings(art);
    expect(fs).toHaveLength(1);
    expect(fs[0].message).toContain('case "inner"');
    expect(fs[0].message).toContain("missing");
    expect(fs[0].message).toContain("when[0]");
    // the ref navigates to the missing row
    expect(fs[0].ref).toMatchObject({ lib: "L", kind: "decision", name: "D", nodeId: "when[0]" });
  });

  it("extra-sibling: add when[0]/when[0] to the inner-deny cluster → FAIL (bleed)", () => {
    const broken = cluster(
      "inner",
      [
        decRef("when[0]"),
        decRef("when[0]/when[0]"), // off the inner-deny path
        decRef("when[0]/otherwise"),
        decRef("when[0]/otherwise/action[0]"),
      ],
      ["case-inner"],
    );
    const art = writeArtifact([approveOk, broken, outerDenyOk]);
    const fs = corrFindings(art);
    expect(fs).toHaveLength(1);
    expect(fs[0].message).toContain("bleed");
    expect(fs[0].message).toContain("when[0]/when[0]");
  });

  it("shared-ref-bleed: a unit citing only the SHARED Deny activity (no branch context) bleeds via best-effort", () => {
    // `Deny` is recommended at BOTH when[0]/otherwise/action[0] AND otherwise/action[0] (a shared activity). A unit on
    // the outer-deny case citing ONLY the shared Deny activity has NO branch context → crlRevealMaps falls back to
    // best-effort and lights EVERY Deny action row, including the off-path inner one → bleed. (The real resolution's
    // documented tradeoff; a cluster citing decision-node refs instead would not bleed — the authoring fix.)
    const shared = cluster("outer-shared", [activityRef("Deny")], ["case-outer"]);
    const art = writeArtifact([approveOk, innerDenyOk, outerDenyOk, shared]);
    const fs = corrFindings(art);
    expect(fs).toHaveLength(1);
    expect(fs[0].message).toContain('case "outer"');
    expect(fs[0].message).toContain("bleed");
    // the off-path inner Deny action row leaks in (best-effort, no branch context to disambiguate)
    expect(fs[0].message).toContain("when[0]/otherwise/action[0]");
  });

  it("two-actions: a cluster on the outer-deny case citing two action rows → FAIL (one off-path bleeds)", () => {
    // A disposition cluster naming two action rows; on the outer-deny path the inner action is off-path → bleed.
    const broken = cluster(
      "outer",
      [decRef("when[0]/when[0]/action[0]"), decRef("otherwise/action[0]")],
      ["case-outer"],
    );
    const art = writeArtifact([approveOk, innerDenyOk, broken]);
    const fs = corrFindings(art);
    expect(fs).toHaveLength(1);
    expect(fs[0].message).toContain("bleed");
  });

  it("definition-exempt: a no-case, no-action coverage cluster (concept + nothing else) → no finding", () => {
    const exempt = cluster("def", [conceptRef("Criterion Met")], []);
    const art = writeArtifact([approveOk, innerDenyOk, outerDenyOk, exempt]);
    expect(corrFindings(art)).toEqual([]);
  });
});

describe("checkCockpitCorrespondence — concept-bleed (concept refs ARE followed, not just decision-node refs)", () => {
  // The outer-deny cluster ALSO cites the CONCEPT "Criterion Met" — a `when` at when[0]/when[0] in another cell. A
  // DECISION-NODE-ONLY structural check would PASS (the cited decision rows ARE the outer-deny path), but the gate
  // follows concept refs → lights when[0]/when[0] → bleed. NOTE (scope): this proves concept refs are FOLLOWED, not the
  // branch-SCOPING that crlAnchorsForUnits/rowNodeKeysForUnitWithConcepts adds (a naive keyToRowNodeKeys lookup would
  // catch this same case — the concept is a direct `when` refKey). The branch-scoping guarantee is pinned by the
  // rx501-147 shared-sub-concept test below, which fails under keyToRowNodeKeys but PASSES under the real resolution.
  it("a Deny cluster citing a concept that is a `when` elsewhere → FAIL under the real resolution", () => {
    const bleeder = cluster(
      "outer",
      [decRef("otherwise"), decRef("otherwise/action[0]"), conceptRef("Criterion Met")],
      ["case-outer"],
    );
    const art = writeArtifact([approveOk, innerDenyOk, bleeder]);
    const fs = corrFindings(art);
    expect(fs).toHaveLength(1);
    expect(fs[0].message).toContain('case "outer"');
    expect(fs[0].message).toContain("bleed");
    // the concept's `when` row leaks in — only the real resolution sees this
    expect(fs[0].message).toContain("when[0]/when[0]");
  });

  it("the SAME structural decision-node set without the concept ref → PASS (isolates the concept as the cause)", () => {
    const art = writeArtifact([approveOk, innerDenyOk, outerDenyOk]);
    expect(corrFindings(art)).toEqual([]);
  });
});

describe("validateProvenanceFiles — FINAL vs worklist + classification", () => {
  it("a mismatch artifact: final → cockpit-correspondence error + pass:false; worklist → no such finding", () => {
    const broken = cluster(
      "outer",
      [decRef("otherwise"), decRef("otherwise/action[0]"), conceptRef("Criterion Met")],
      ["case-outer"],
    );
    const art = writeArtifact([approveOk, innerDenyOk, broken]);

    const final = validateProvenanceFiles(art, celPath, anchorPath, "final");
    expect(final.findings.map((f) => f.kind)).toContain("cockpit-correspondence");
    expect(final.pass).toBe(false);

    const worklist = validateProvenanceFiles(art, celPath, anchorPath, "worklist");
    expect(worklist.findings.map((f) => f.kind)).not.toContain("cockpit-correspondence");
  });

  it("the finding is class integrity / severity error and is NOT counted in worklistCount", () => {
    const broken = cluster(
      "outer",
      [decRef("otherwise"), decRef("otherwise/action[0]"), conceptRef("Criterion Met")],
      ["case-outer"],
    );
    const art = writeArtifact([approveOk, innerDenyOk, broken]);
    const res = validateProvenanceFiles(art, celPath, anchorPath, "final");
    const f = res.findings.find((x) => x.kind === "cockpit-correspondence")!;
    expect(f).toBeDefined();
    expect(f.class).toBe("integrity");
    expect(f.severity).toBe("error");
    // not an attribution or waiver kind → neither bucket counts it
    expect(ATTRIBUTION_KINDS.has("cockpit-correspondence")).toBe(false);
    expect(WAIVER_KINDS.has("cockpit-correspondence")).toBe(false);
    // it raised errorCount and failed the gate, but did not touch worklistCount/waiverCount
    expect(res.errorCount).toBeGreaterThanOrEqual(1);
    const worklist = validateProvenanceFiles(art, celPath, anchorPath, "worklist");
    expect(worklist.worklistCount).toBe(res.worklistCount);
  });

  it("error count + pass are RECOMPUTED from the merged findings (the correspondence error is counted in errorCount)", () => {
    // RECOMPUTE proof: the merged errorCount includes the cockpit-correspondence error (it is severity "error"), and
    // pass is derived from the MERGED set (false), not the stale resolveProvenance result. Asserting the correspondence
    // error is a member of the error tally (rather than +1 vs a clean run, which coverage findings would confound).
    const broken = cluster(
      "outer-shared",
      [activityRef("Deny")],
      ["case-outer"],
    );
    const brokenArt = writeArtifact([approveOk, innerDenyOk, outerDenyOk, broken]);
    const dirty = validateProvenanceFiles(brokenArt, celPath, anchorPath, "final");
    const corrErrors = dirty.findings.filter(
      (f) => f.kind === "cockpit-correspondence" && f.severity === "error",
    ).length;
    const otherErrors = dirty.findings.filter(
      (f) => f.kind !== "cockpit-correspondence" && f.severity === "error",
    ).length;
    expect(corrErrors).toBe(1);
    expect(dirty.errorCount).toBe(otherErrors + corrErrors); // recomputed over the merged set
    expect(dirty.pass).toBe(false);
  });
});

describe("checkCockpitCorrespondence — unchecked reasons (a green gate must mean checked)", () => {
  it("tested-no-disposition: a case whose cluster reaches no produced action is reported, not silently skipped", () => {
    // The cockpit-correspondence check derives the path from the RUN (produced actions), not the cluster. Every case
    // here produces a disposition, so to exercise no-produced-action we rely on the unit checker below; here we assert
    // that the three clean cases are all CHECKED (none reported unchecked) — i.e. the gate did compare them.
    const model = buildCockpitModel(
      writeArtifact([approveOk, innerDenyOk, outerDenyOk]),
      celPath,
      anchorPath,
      "final",
    );
    const results = checkCockpitCorrespondence(model);
    // all clean → no results at all (mismatch xor unchecked are the only result kinds; clean pushes nothing)
    expect(results).toEqual([]);
    // every scenario produced an action (so none would be "no-produced-action")
    for (const sv of model.scenarios.scenarios) {
      const produced: string[] = [];
      const walk = (ns: typeof sv.tree): void => {
        for (const n of ns) {
          if (n.kind === "action" && n.action?.produced) produced.push(n.nodeId);
          if (n.children) walk(n.children);
        }
      };
      walk(sv.tree);
      expect(produced.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("unfrozen-case: a case with NO `- id is` is reported unchecked (unfrozen-case), never silently skipped", () => {
    // Author a CEL whose case lacks `- id is` → not in caseIdByName → unchecked unfrozen-case.
    const celNoId = CEL.replace('- id is "case-outer".\n', "");
    const p = path.join(root, "f-noid.cel");
    writeFileSync(p, celNoId);
    const model = buildCockpitModel(
      writeArtifact([approveOk, innerDenyOk, outerDenyOk]),
      p,
      anchorPath,
      "final",
    );
    const results = checkCockpitCorrespondence(model);
    const unchecked = results.filter((r) => r.kind === "unchecked");
    expect(unchecked.map((r) => (r.kind === "unchecked" ? r.reason : ""))).toContain(
      "unfrozen-case",
    );
  });

  it("render-failed: a FAILED scenario render (unresolved covers, empty scenarios[]) is reported, never green-passed", () => {
    // A .cel covering a non-existent library → renderScenario returns success:false with scenarios:[]. The check must
    // surface ONE render-failed result so FINAL cannot pass having verified nothing.
    const r4 = mkdtempSync(path.join(os.tmpdir(), "prov-render-"));
    writeFileSync(
      path.join(r4, "package.json"),
      JSON.stringify({ name: "p", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/p" } }),
    );
    writeFileSync(path.join(r4, "policy.crl"), POLICY_CRL);
    const celBad = path.join(r4, "f.cel");
    writeFileSync(
      celBad,
      `# C\nlibrary "C".\ncovers "DoesNotExist".\ncase "x":\n- id is "x".\n- subject is "Pat".`,
    );
    const anchor4 = path.join(r4, "anchor.txt");
    writeFileSync(anchor4, ANCHOR_TEXT);
    const artifact: ProvenanceArtifact = {
      schemaVersion: "1.0",
      policyId: "L",
      policyVersion: "1",
      anchorSource: metaFor(ANCHOR_TEXT),
      items: [],
      ignoredRanges: [],
      clusters: [],
    };
    const art4 = path.join(r4, "art.json");
    writeFileSync(art4, JSON.stringify(artifact));
    try {
      const model = buildCockpitModel(art4, celBad, anchor4, "final");
      expect(model.scenarios.success).toBe(false);
      const results = checkCockpitCorrespondence(model);
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ kind: "unchecked", reason: "render-failed" });

      // Through the FINAL gate it surfaces as a cockpit-correspondence error → pass:false (never a silent green).
      const res = validateProvenanceFiles(art4, celBad, anchor4, "final");
      const f = res.findings.find((x) => x.kind === "cockpit-correspondence")!;
      expect(f).toBeDefined();
      expect(f.severity).toBe("error");
      expect(f.message).toContain("scenario render failed");
      expect(res.pass).toBe(false);
    } finally {
      rmSync(r4, { recursive: true, force: true });
    }
  });

  it("case-name-collision: an unfrozen+frozen same-name pair is reported unchecked, not mis-joined", () => {
    // buildCaseIdByName only drops a name shared by ≥2 FROZEN cases; an unfrozen + frozen same-name pair survives there
    // and would mis-join. The in-render name multiset catches it → BOTH same-name scenarios are unchecked.
    const r5 = mkdtempSync(path.join(os.tmpdir(), "prov-collide-"));
    writeFileSync(
      path.join(r5, "package.json"),
      JSON.stringify({ name: "p", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/p" } }),
    );
    writeFileSync(path.join(r5, "policy.crl"), POLICY_CRL);
    const cel5 = path.join(r5, "f.cel");
    // two cases named "dup": one frozen, one not. (Both walk the outer-deny path; no facts.)
    writeFileSync(
      cel5,
      `# C\nlibrary "C".\ncovers "L".\nfact "Pat":\n- name is "Pat".\n- birth date is "1970-01-01".\n- defined by "Patient".\ncase "dup":\n- id is "case-dup".\n- subject is "Pat".\n- result is "D" is "Deny".\ncase "dup":\n- subject is "Pat".\n- result is "D" is "Deny".`,
    );
    const anchor5 = path.join(r5, "anchor.txt");
    writeFileSync(anchor5, ANCHOR_TEXT);
    const artifact: ProvenanceArtifact = {
      schemaVersion: "1.0",
      policyId: "L",
      policyVersion: "1",
      anchorSource: metaFor(ANCHOR_TEXT),
      items: [],
      ignoredRanges: [],
      clusters: [],
    };
    const art5 = path.join(r5, "art.json");
    writeFileSync(art5, JSON.stringify(artifact));
    try {
      const model = buildCockpitModel(art5, cel5, anchor5, "final");
      const results = checkCockpitCorrespondence(model);
      const dup = results.filter((r) => r.caseName === "dup");
      expect(dup.length).toBeGreaterThanOrEqual(1);
      for (const d of dup) {
        expect(d.kind).toBe("unchecked");
        if (d.kind === "unchecked") expect(d.reason).toBe("case-name-collision");
      }
    } finally {
      rmSync(r5, { recursive: true, force: true });
    }
  });
});

describe("checkCockpitCorrespondence — same-lib inlined `use decision` chain now RESOLVES (#175 todo-2)", () => {
  // WAS the EXPECTED-TO-GO-RED unmapped-runtime-node test. #175 (disc 151 Fork B) wired the chain-aware decomposer
  // `producedRuntimePathRefs` into the gate, so a same-library `use decision` the runtime VM INLINES under the caller is
  // RE-ROOTED into the sub-decision's STANDALONE rows — which the standalone structure index DOES carry (every decision
  // is inventoried standalone). So the chained case no longer defers to unmapped-runtime-node; it is COMPARED like any
  // other case: clean against a CORRECT cluster (the full decomposed path), mismatch against a WRONG one.
  //
  // `D.when[0] --use Sub--> Sub.otherwise/action[0]` (recommend Approve). The decomposed run path is:
  //   D#when[0] (the use-Sub boundary row, caller-local) + Sub#otherwise + Sub#otherwise/action[0] (re-rooted).
  const DELEG_CRL = `# L
library "L".
concept "Drug Requested":
- type is Condition.
- code is \`drug\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`a\`.
decision "Sub":
first:
- otherwise then recommend activity "Approve".
decision "D":
first:
- when "Drug Requested" then use decision "Sub".
- otherwise then use decision "Sub".`;
  const DELEG_CEL = `# C
library "C".
covers "L".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fDrug":
- date is "2026-01-01".
- defined by "Drug Requested".
case "deleg":
- id is "case-deleg".
- subject is "Pat".
- fact is "fDrug".
- result is "D" is "Approve".`;

  let r2: string;
  let cel2: string;
  let anchor2: string;
  beforeAll(() => {
    r2 = mkdtempSync(path.join(os.tmpdir(), "prov-deleg-"));
    writeFileSync(
      path.join(r2, "package.json"),
      JSON.stringify({ name: "p", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/p" } }),
    );
    writeFileSync(path.join(r2, "policy.crl"), DELEG_CRL);
    cel2 = path.join(r2, "f.cel");
    writeFileSync(cel2, DELEG_CEL);
    anchor2 = path.join(r2, "anchor.txt");
    writeFileSync(anchor2, ANCHOR_TEXT);
  });
  afterAll(() => rmSync(r2, { recursive: true, force: true }));

  const delegRef = (name: string, nodeId: string): CrlNodeRef => ({
    lib: "L",
    kind: "decision",
    name,
    nodeId,
    nodeKind: "decision-node",
    ownership: "policy-owned",
    relation: "implements-criterion",
    status: "linked",
  });
  const delegArtifact = (crl: CrlNodeRef[]): string => {
    const artifact: ProvenanceArtifact = {
      schemaVersion: "1.0",
      policyId: "L",
      policyVersion: "1",
      anchorSource: metaFor(ANCHOR_TEXT),
      items: [],
      ignoredRanges: [],
      clusters: [
        {
          id: "deleg",
          label: "deleg",
          items: [],
          crl,
          cel: [{ file: "f.cel", kind: "case", caseId: "case-deleg", relation: "tests-branch", status: "linked" }],
        },
      ],
    };
    const p = path.join(r2, `art-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(p, JSON.stringify(artifact));
    return p;
  };

  it("a CORRECT cluster (the full decomposed Main+Sub path) → CLEAN, no cockpit-correspondence finding", () => {
    // The cluster cites the re-rooted run path across BOTH decisions: D#when[0] (the criterion row) + D#when[0]/action[0]
    // (the use-Sub boundary's OWN action row, a real standalone row of the CALLING decision — disc 151 ref 2) + the
    // re-rooted Sub#otherwise + Sub#otherwise/action[0].
    const art = delegArtifact([
      delegRef("D", "when[0]"),
      delegRef("D", "when[0]/action[0]"),
      delegRef("Sub", "otherwise"),
      delegRef("Sub", "otherwise/action[0]"),
    ]);
    const fs = validateProvenanceFiles(art, cel2, anchor2, "final").findings.filter(
      (f) => f.kind === "cockpit-correspondence",
    );
    expect(fs).toEqual([]);
  });

  it("a WRONG cluster (only the caller's when[0], MISSING the Sub rows) → mismatch (miss), NOT unmapped", () => {
    // The same artifact the old baseline used (cluster onto only D#when[0]). It is no longer unchecked — the gate now
    // grounds the Sub rows, so the cluster genuinely UNDER-lights → a real `miss` finding the KE must fix.
    const art = delegArtifact([delegRef("D", "when[0]")]);
    const res = validateProvenanceFiles(art, cel2, anchor2, "final");
    const f = res.findings.find((x) => x.kind === "cockpit-correspondence")!;
    expect(f).toBeDefined();
    expect(f.message).toContain('case "deleg"');
    expect(f.message).toContain("missing");
    expect(f.message).toContain("otherwise/action[0]"); // the un-attributed Sub disposition row
    expect(f.message).not.toContain("unmapped-runtime-node"); // it RESOLVED — no longer a deferred join gap
  });
});

describe("checkCockpitCorrespondence — the honesty path (a GENUINE residual still → unmapped-runtime-node)", () => {
  // #175 preserves the unmapped-runtime-node honesty fallback (disc 151 ref 5): a produced run-path node that does NOT
  // ground to a standalone structure row (a grounded ref missing `idToKey`, or a decomposer `gaps` entry — the cross-lib
  // #172 frontier once it lands) is reported UNCHECKED, never a silent green and never a wrong-sub false mismatch.
  // Same-lib chains all ground (above), so to exercise the residual we inject a structurally-impossible produced node
  // whose nodeId names no structure row — the gate routes the case to unmapped-runtime-node citing the un-grounded id.
  it("a produced node with no standalone structure row → unchecked unmapped-runtime-node (the residual is surfaced)", () => {
    const model = buildCockpitModel(
      writeArtifact([approveOk, innerDenyOk, outerDenyOk]),
      celPath,
      anchorPath,
      "final",
    );
    // Deep-clone one scenario's tree and corrupt the produced node's id to one that has NO structure row → the gate's
    // idToKey join MISSES → unmapped-runtime-node (the honesty branch). Structurally impossible on a real VM; this is
    // the only way to reach the residual branch at the gate level for a same-lib policy (mirrors runPath.test.ts).
    const corrupt = JSON.parse(JSON.stringify(model.scenarios.scenarios)) as typeof model.scenarios.scenarios;
    let injected = false;
    const reroot = (ns: { kind: string; nodeId: string; action?: { produced?: boolean }; children?: unknown[] }[]): void => {
      for (const n of ns) {
        if (n.kind === "action" && n.action?.produced && !injected) {
          n.nodeId = "ZZZ/orphan/action[0]"; // no decisionSubNodeRef for this id → no idToKey row → residual
          injected = true;
        }
        if (n.children) reroot(n.children as typeof ns);
      }
    };
    for (const sv of corrupt) reroot(sv.tree as unknown as Parameters<typeof reroot>[0]);
    expect(injected).toBe(true);

    const corruptedModel = { ...model, scenarios: { ...model.scenarios, scenarios: corrupt } };
    const results = checkCockpitCorrespondence(corruptedModel);
    const unmapped = results.filter(
      (r) => r.kind === "unchecked" && r.reason === "unmapped-runtime-node",
    );
    // at least the case carrying the corrupted produced node is now unchecked, never silently green.
    expect(unmapped.length).toBeGreaterThanOrEqual(1);
    const cited = unmapped.flatMap((r) => (r.kind === "unchecked" ? r.details ?? [] : []));
    // the un-grounded id is surfaced, LIB-QUALIFIED (FIX 2): `L::D#ZZZ/orphan/action[0]`.
    expect(cited).toContain("L::D#ZZZ/orphan/action[0]");
  });

  it("FIX 3b (gate gaps): a produced node under an expanded boundary with absent target.name → gaps → unchecked", () => {
    const model = buildCockpitModel(
      writeArtifact([approveOk, innerDenyOk, outerDenyOk]),
      celPath,
      anchorPath,
      "final",
    );
    // Replace a produced node in place with an EXPANDED use-decision whose target.name is "" wrapping a recommend child
    // → the decomposer recurses an UNGROUNDED frame → the child's nodeId enters `gaps` → the gate routes to unmapped
    // (a DISTINCT honesty trigger from the idToKey-miss above: gaps non-empty short-circuits before the ref join).
    const corrupt = JSON.parse(JSON.stringify(model.scenarios.scenarios)) as typeof model.scenarios.scenarios;
    let injected = false;
    let gapId = "";
    const inject = (ns: { kind: string; nodeId: string; action?: Record<string, unknown>; children?: unknown[] }[]): void => {
      for (const n of ns) {
        if (n.kind === "action" && (n.action as { produced?: boolean })?.produced && !injected) {
          gapId = `${n.nodeId}/when[0]/action[0]`;
          n.action = { produced: false, actionKind: "use-decision", expanded: true, target: { name: "" } };
          n.children = [
            {
              kind: "when",
              nodeId: `${n.nodeId}/when[0]`,
              children: [
                { kind: "action", nodeId: gapId, action: { produced: true, actionKind: "recommend-activity" } },
              ],
            },
          ];
          injected = true;
        }
        if (n.children) inject(n.children as typeof ns);
      }
    };
    for (const sv of corrupt) inject(sv.tree as unknown as Parameters<typeof inject>[0]);
    expect(injected).toBe(true);

    const corruptedModel = { ...model, scenarios: { ...model.scenarios, scenarios: corrupt } };
    const results = checkCockpitCorrespondence(corruptedModel);
    const unmapped = results.filter(
      (r) => r.kind === "unchecked" && r.reason === "unmapped-runtime-node",
    );
    expect(unmapped.length).toBeGreaterThanOrEqual(1);
    // the RAW deep gap nodeId (un-rerootable) is surfaced — NOT a lib::decision form (it never grounded to a frame).
    const cited = unmapped.flatMap((r) => (r.kind === "unchecked" ? r.details ?? [] : []));
    expect(cited).toContain(gapId);
  });
});

describe("checkCockpitCorrespondence — rx501-147 shared sub-concept (the real-resolution BRANCH-SCOPING guarantee)", () => {
  // The load-bearing "uses the real resolution, not a naive keyToRowNodeKeys" test. "Shared Age" is `defined as` part
  // of BOTH "Crohns Indication" (when[0]) AND "UC Indication" (when[1]). A case walking the Crohns branch whose cluster
  // cites the Crohns path decision-nodes PLUS the shared sub-concept "Shared Age":
  //   - naive keyToRowNodeKeys: "Shared Age" containment → containers {Crohns,UC} → BOTH when[0] AND when[1] light →
  //     bleed (when[1] is off the Crohns path).
  //   - real crlAnchorsForUnits: the decision-node ref when[0] is a CONFIDENT branch context, so the ambiguous
  //     two-`when` containment of "Shared Age" is SCOPED OUT (when[1] dropped) → lit == path → PASS.
  // Asserted through validateProvenanceFiles(..., "final"), proving the gate's branch-scoping, not just ref-following.
  const SC_CRL = `# L2
library "L2".
concept "Shared Age":
- type is Condition.
- code is \`age\`.
concept "Crohns Marker":
- type is Condition.
- code is \`crohn\`.
concept "UC Marker":
- type is Condition.
- code is \`uc\`.
concept "Crohns Indication":
- defined as ( "Shared Age" sem-and "Crohns Marker" ).
concept "UC Indication":
- defined as ( "Shared Age" sem-and "UC Marker" ).
activity "Approve":
- request CPGCommunicationRequest.
- with \`a\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`d\`.
decision "D":
first:
- when "Crohns Indication" then recommend activity "Approve".
- when "UC Indication" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
  const SC_CEL = `# C
library "C".
covers "L2".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fAge":
- date is "2026-01-01".
- defined by "Shared Age".
fact "fCrohn":
- date is "2026-01-01".
- defined by "Crohns Marker".
case "crohns":
- id is "case-crohns".
- subject is "Pat".
- fact is "fAge".
- fact is "fCrohn".
- result is "D" is "Approve".`;

  let r2: string;
  let cel2: string;
  let anchor2: string;
  beforeAll(() => {
    r2 = mkdtempSync(path.join(os.tmpdir(), "prov-rx147-"));
    writeFileSync(
      path.join(r2, "package.json"),
      JSON.stringify({ name: "p", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/p" } }),
    );
    writeFileSync(path.join(r2, "policy.crl"), SC_CRL);
    cel2 = path.join(r2, "f.cel");
    writeFileSync(cel2, SC_CEL);
    anchor2 = path.join(r2, "anchor.txt");
    writeFileSync(anchor2, ANCHOR_TEXT);
  });
  afterAll(() => rmSync(r2, { recursive: true, force: true }));

  const scRef = (kind: string, name: string, nodeId?: string): CrlNodeRef => ({
    lib: "L2",
    kind,
    name,
    ...(nodeId !== undefined ? { nodeId } : {}),
    nodeKind: nodeId !== undefined ? "decision-node" : "leaf",
    ownership: "policy-owned",
    relation: "implements-criterion",
    status: "linked",
  });
  const scArtifact = (crl: CrlNodeRef[]): string => {
    const artifact: ProvenanceArtifact = {
      schemaVersion: "1.0",
      policyId: "L2",
      policyVersion: "1",
      anchorSource: metaFor(ANCHOR_TEXT),
      items: [],
      ignoredRanges: [],
      clusters: [
        {
          id: "crohns",
          label: "crohns",
          items: [],
          crl,
          cel: [
            { file: "f.cel", kind: "case", caseId: "case-crohns", relation: "tests-branch", status: "linked" },
          ],
        },
      ],
    };
    const p = path.join(r2, `art-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(p, JSON.stringify(artifact));
    return p;
  };

  it("Crohns-path decision-nodes + the shared sub-concept → PASS (branch-scoping drops the UC sibling)", () => {
    const art = scArtifact([
      scRef("decision", "D", "when[0]"),
      scRef("decision", "D", "when[0]/action[0]"),
      scRef("concept", "Shared Age"), // the bleed risk a naive keyToRowNodeKeys would NOT scope out
    ]);
    const fs = validateProvenanceFiles(art, cel2, anchor2, "final").findings.filter(
      (f) => f.kind === "cockpit-correspondence",
    );
    expect(fs).toEqual([]);
  });

  it("control: replacing the shared sub-concept with the SIBLING's direct when concept DOES bleed → FAIL", () => {
    // Citing "UC Indication" DIRECTLY (a confident usage on when[1]) is trusted over containment and is NOT scoped out
    // — so it lights the off-path when[1] → bleed. Confirms the PASS above is branch-scoping, not concept refs being
    // silently ignored.
    const art = scArtifact([
      scRef("decision", "D", "when[0]"),
      scRef("decision", "D", "when[0]/action[0]"),
      scRef("concept", "UC Indication"),
    ]);
    const fs = validateProvenanceFiles(art, cel2, anchor2, "final").findings.filter(
      (f) => f.kind === "cockpit-correspondence",
    );
    expect(fs).toHaveLength(1);
    expect(fs[0].message).toContain("bleed");
    expect(fs[0].message).toContain("when[1]");
  });
});

describe("checkCockpitCorrespondence — clean multi-produced (all: menu, union over two dispositions)", () => {
  // A top-level all: menu produces TWO actions (both whens satisfied) at when[0]/action[0] and when[1]/action[0]. The
  // cluster citing BOTH actions' ancestor chains → lit == the union of both run paths → NO finding. Proves the
  // union-over-produced-actions logic doesn't false-bleed/miss when 2 dispositions are legitimately produced.
  const ALL_CRL = `# L3
library "L3".
concept "Needs Imaging":
- type is Condition.
- code is \`img\`.
concept "Needs Labs":
- type is Condition.
- code is \`lab\`.
activity "Order Imaging":
- request CPGCommunicationRequest.
- with \`oi\`.
activity "Order Labs":
- request CPGCommunicationRequest.
- with \`ol\`.
decision "D":
all:
- when "Needs Imaging" then recommend activity "Order Imaging".
- when "Needs Labs" then recommend activity "Order Labs".`;
  const ALL_CEL = `# C
library "C".
covers "L3".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fImg":
- date is "2026-01-01".
- defined by "Needs Imaging".
fact "fLab":
- date is "2026-01-01".
- defined by "Needs Labs".
case "both":
- id is "case-both".
- subject is "Pat".
- fact is "fImg".
- fact is "fLab".
- result is "D" is "Order Imaging".`;

  it("two produced actions, the cluster citing both paths → NO cockpit-correspondence finding", () => {
    const r3 = mkdtempSync(path.join(os.tmpdir(), "prov-allmenu-"));
    writeFileSync(
      path.join(r3, "package.json"),
      JSON.stringify({ name: "p", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/p" } }),
    );
    writeFileSync(path.join(r3, "policy.crl"), ALL_CRL);
    const cel3 = path.join(r3, "f.cel");
    writeFileSync(cel3, ALL_CEL);
    const anchor3 = path.join(r3, "anchor.txt");
    writeFileSync(anchor3, ANCHOR_TEXT);

    const ref = (nodeId: string): CrlNodeRef => ({
      lib: "L3",
      kind: "decision",
      name: "D",
      nodeId,
      nodeKind: "decision-node",
      ownership: "policy-owned",
      relation: "implements-criterion",
      status: "linked",
    });
    const artifact: ProvenanceArtifact = {
      schemaVersion: "1.0",
      policyId: "L3",
      policyVersion: "1",
      anchorSource: metaFor(ANCHOR_TEXT),
      items: [],
      ignoredRanges: [],
      clusters: [
        {
          id: "both",
          label: "both",
          items: [],
          crl: [
            ref("when[0]"),
            ref("when[0]/action[0]"),
            ref("when[1]"),
            ref("when[1]/action[0]"),
          ],
          cel: [{ file: "f.cel", kind: "case", caseId: "case-both", relation: "tests-branch", status: "linked" }],
        },
      ],
    };
    const art3 = path.join(r3, "art.json");
    writeFileSync(art3, JSON.stringify(artifact));

    try {
      // sanity: the run actually produced TWO actions
      const model = buildCockpitModel(art3, cel3, anchor3, "final");
      const both = model.scenarios.scenarios.find((s) => s.case.name === "both")!;
      const produced: string[] = [];
      const walk = (ns: typeof both.tree): void => {
        for (const n of ns) {
          if (n.kind === "action" && n.action?.produced) produced.push(n.nodeId);
          if (n.children) walk(n.children);
        }
      };
      walk(both.tree);
      expect(produced.sort()).toEqual(["when[0]/action[0]", "when[1]/action[0]"]);

      const fs = validateProvenanceFiles(art3, cel3, anchor3, "final").findings.filter(
        (f) => f.kind === "cockpit-correspondence",
      );
      expect(fs).toEqual([]);
    } finally {
      rmSync(r3, { recursive: true, force: true });
    }
  });
});
