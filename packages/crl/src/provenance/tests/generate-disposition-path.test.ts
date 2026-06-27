/**
 * #174 — `clusterBy:"disposition-path"` scaffold generation. The load-bearing assertion is the ROUND TRIP: a
 * disposition-path scaffold is correspondence-correct BY CONSTRUCTION, so feeding it back into
 * `validateProvenanceFiles(..., "final")` yields ZERO cockpit-correspondence `mismatch` findings before any items are
 * attached — AND every case is CHECKABLE (no `unchecked` reason), so a vacuously-green all-unchecked fixture can't pass.
 *
 * The multi-branch fixture is the #170 correspondenceCheck fixture (decision D, three branches, three frozen cases each
 * walking a distinct path) so the round-trip is honest against the SAME gate #170 ships. A separate `all:` multi-produced
 * fixture exercises the union-over-two-ancestor-chains path. Plus: byte-determinism + the additive default.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { resolveCelImports } from "../../cel/imports";
import * as cre from "../../cre";
import type { AnchorSourceMeta, CrlNodeRef, ProvenanceArtifact } from "../artifact";
import { generateProvenanceScaffold } from "../generate";
import { generateProvenanceFiles } from "../generateFiles";
import { validateProvenanceFiles } from "../validateFiles";

const ANCHOR_META: AnchorSourceMeta = {
  path: "anchor.txt",
  derivedFrom: "x.docx",
  derivedFromHash: "sha256:0",
  canonicalizer: "crl-anchor-docx-text",
  canonicalizerVersion: "1.0.0",
  textHash: "sha256:0",
  offsetUnit: "utf8-byte",
  unicodeNormalization: "NFC",
  rangeConvention: "half-open",
};

// ── the #170 multi-branch fixture: decision D in lib L, three frozen cases on three distinct paths ──
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

const CEL = `# C
library "C".
covers "L".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fDrug":
- code is "http://example.org|drug".
- date is "2026-01-01".
- defined by "Drug Requested".
fact "fCrit":
- code is "http://example.org|crit".
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

const ANCHOR_TEXT = "anchor.\n";

interface Fixture {
  root: string;
  celPath: string;
  anchorPath: string;
}
function mkFixture(prefix: string, crl: string, cel: string): Fixture {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "p", version: "0.0.0", private: true }),
  );
  writeFileSync(path.join(root, "policy.crl"), crl);
  const celPath = path.join(root, "f.cel");
  writeFileSync(celPath, cel);
  const anchorPath = path.join(root, "anchor.txt");
  writeFileSync(anchorPath, ANCHOR_TEXT);
  return { root, celPath, anchorPath };
}

/** Generate a scaffold, write its artifact to a temp file, return both the in-memory artifact + its path. */
function genArtifact(
  fx: Fixture,
  clusterBy?: "decision" | "disposition-path",
): { artifact: ProvenanceArtifact; artifactPath: string } {
  const r = generateProvenanceFiles(fx.celPath, fx.anchorPath, {
    ...(clusterBy !== undefined ? { clusterBy } : {}),
  });
  const artifactPath = path.join(fx.root, `art-${clusterBy ?? "default"}.json`);
  writeFileSync(artifactPath, JSON.stringify(r.artifact, null, 2) + "\n");
  return { artifact: r.artifact, artifactPath };
}

describe("disposition-path generate → FINAL validate round-trip (multi-branch)", () => {
  let fx: Fixture;
  beforeAll(() => {
    fx = mkFixture("gen-dpp-", POLICY_CRL, CEL);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("the generated disposition-path scaffold passes the FINAL cockpit gate with ZERO mismatch + all cases CHECKABLE", () => {
    const { artifactPath } = genArtifact(fx, "disposition-path");
    const res = validateProvenanceFiles(artifactPath, fx.celPath, fx.anchorPath, "final");
    const corr = res.findings.filter((f) => f.kind === "cockpit-correspondence");

    // ZERO cockpit-correspondence findings at all — meaning neither a `mismatch` NOR an `unchecked`. An unchecked case
    // surfaces as a cockpit-correspondence finding too (message "...unchecked for case..."), so an empty corr[] proves
    // BOTH (a) no bleed/miss (mismatch) AND (b) every case was actually compared — a vacuously-green all-unchecked
    // fixture would have corr[] full of "unchecked" findings.
    expect(corr).toEqual([]);
  });

  it("one disposition cluster per distinct run path; decision-node refs ONLY (no concept refs) in them", () => {
    const { artifact } = genArtifact(fx, "disposition-path");
    // three distinct paths (approve / inner-deny / outer-deny) → three disposition clusters + 1 coverage cluster.
    const coverage = artifact.clusters.filter((c) => c.id.endsWith(":coverage"));
    const disposition = artifact.clusters.filter((c) => !c.id.endsWith(":coverage"));
    expect(coverage).toHaveLength(1);
    expect(disposition).toHaveLength(3);

    for (const c of disposition) {
      // decision-node refs ONLY — every crl ref carries a nodeId + kind "decision" (NO concept / activity refs).
      expect(c.crl.length).toBeGreaterThan(0);
      for (const ref of c.crl) {
        expect(ref.kind).toBe("decision");
        expect(ref.nodeId).toBeDefined();
        expect(ref.nodeKind).toBe("decision-node");
      }
      // each disposition cluster cites ≥1 frozen CEL case + items empty.
      expect(c.cel.length).toBeGreaterThanOrEqual(1);
      expect(c.items).toEqual([]);
    }
  });

  it("the coverage cluster holds all policy-owned leaves (concepts + activities), no cel, no items", () => {
    const { artifact } = genArtifact(fx, "disposition-path");
    const coverage = artifact.clusters.find((c) => c.id.endsWith(":coverage"))!;
    expect(coverage).toBeDefined();
    expect(coverage.cel).toEqual([]);
    expect(coverage.items).toEqual([]);

    // the policy-owned leaves: concepts Drug Requested + Criterion Met, activities Approve + Deny.
    const names = coverage.crl.map((r) => `${r.kind}:${r.name}`).sort();
    expect(names).toEqual([
      "activity:Approve",
      "activity:Deny",
      "concept:Criterion Met",
      "concept:Drug Requested",
    ]);
    // every coverage ref is a leaf with no nodeId (a decl-level leaf, not a decision sub-node).
    for (const ref of coverage.crl) {
      expect(ref.nodeKind).toBe("leaf");
      expect(ref.nodeId).toBeUndefined();
    }
  });

  it("items[] empty on every cluster (and the artifact-level items)", () => {
    const { artifact } = genArtifact(fx, "disposition-path");
    expect(artifact.items).toEqual([]);
    for (const c of artifact.clusters) expect(c.items).toEqual([]);
  });

  it("determinism: generating the scaffold twice is byte-identical JSON", () => {
    const a = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy: "disposition-path" });
    const b = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy: "disposition-path" });
    expect(JSON.stringify(a.artifact)).toBe(JSON.stringify(b.artifact));
  });

  it("additive default: clusterBy omitted ⇒ byte-identical to an explicit clusterBy:\"decision\" run", () => {
    const omitted = generateProvenanceFiles(fx.celPath, fx.anchorPath, {});
    const explicit = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy: "decision" });
    expect(JSON.stringify(omitted.artifact)).toBe(JSON.stringify(explicit.artifact));
    // and it is NOT the disposition-path output (sanity: the modes really differ).
    const dpp = generateProvenanceFiles(fx.celPath, fx.anchorPath, {
      clusterBy: "disposition-path",
    });
    expect(JSON.stringify(omitted.artifact)).not.toBe(JSON.stringify(dpp.artifact));
  });
});

// ── `all:` multi-produced fixture: two whens both satisfied → ONE cluster citing the UNION of both ancestor chains ──
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
- code is "http://example.org|img".
- date is "2026-01-01".
- defined by "Needs Imaging".
fact "fLab":
- code is "http://example.org|lab".
- date is "2026-01-01".
- defined by "Needs Labs".
case "both":
- id is "case-both".
- subject is "Pat".
- fact is "fImg".
- fact is "fLab".
- result is "D" is "Order Imaging".`;

describe("disposition-path generate (all: multi-produced) → union of both ancestor chains, clean round-trip", () => {
  let fx: Fixture;
  beforeAll(() => {
    fx = mkFixture("gen-dpp-all-", ALL_CRL, ALL_CEL);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("one disposition cluster citing BOTH produced actions' ancestor chains; round-trips with ZERO cockpit findings", () => {
    const { artifact, artifactPath } = genArtifact(fx, "disposition-path");
    const disposition = artifact.clusters.filter((c) => !c.id.endsWith(":coverage"));
    expect(disposition).toHaveLength(1);

    // the union of the two produced actions' chains: when[0], when[0]/action[0], when[1], when[1]/action[0].
    const nodeIds = disposition[0].crl.map((r) => r.nodeId).sort();
    expect(nodeIds).toEqual([
      "when[0]",
      "when[0]/action[0]",
      "when[1]",
      "when[1]/action[0]",
    ]);

    const res = validateProvenanceFiles(artifactPath, fx.celPath, fx.anchorPath, "final");
    expect(res.findings.filter((f) => f.kind === "cockpit-correspondence")).toEqual([]);
  });
});

// ── FIX 2 — the "never silently drop" contract: a skipped case must NOT kill the OTHER good cases ─────────────────
// A CEL with TWO good frozen cases (approve + outer-deny) PLUS one UNFROZEN case (no `- id is`) walking the inner-deny
// path. The two good cases must still produce disposition clusters; the unfrozen one surfaces ONE deferred diagnostic
// (reason unfrozen-case) and gets NO disposition cluster / phantom ref of its own.
const CEL_WITH_UNFROZEN = `# C
library "C".
covers "L".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fDrug":
- code is "http://example.org|drug".
- date is "2026-01-01".
- defined by "Drug Requested".
fact "fCrit":
- code is "http://example.org|crit".
- date is "2026-01-01".
- defined by "Criterion Met".
case "approve":
- id is "case-approve".
- subject is "Pat".
- fact is "fDrug".
- fact is "fCrit".
- result is "D" is "Approve".
case "inner unfrozen":
- subject is "Pat".
- fact is "fDrug".
- result is "D" is "Deny".
case "outer":
- id is "case-outer".
- subject is "Pat".
- result is "D" is "Deny".`;

describe("disposition-path — case-FIRST classification keeps the GOOD cases (FIX 2a)", () => {
  let fx: Fixture;
  beforeAll(() => {
    fx = mkFixture("gen-dpp-unfrozen-", POLICY_CRL, CEL_WITH_UNFROZEN);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("the two frozen cases STILL cluster; the unfrozen one is ONE deferred diagnostic, no phantom ref", () => {
    const r = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy: "disposition-path" });
    const disposition = r.artifact.clusters.filter((c) => !c.id.endsWith(":coverage"));
    // approve + outer-deny → two distinct paths → two disposition clusters (the unfrozen inner-deny is dropped).
    expect(disposition).toHaveLength(2);
    // exactly the two frozen caseIds are carried; the unfrozen case appears in NO cluster's cel.
    const carriedCaseIds = disposition.flatMap((c) => c.cel.map((x) => x.caseId)).sort();
    expect(carriedCaseIds).toEqual(["case-approve", "case-outer"]);

    // exactly ONE deferred-disposition-path diagnostic, reason unfrozen-case.
    const deferred = r.diagnostics.filter((d) => d.kind === "deferred-disposition-path");
    expect(deferred).toHaveLength(1);
    expect(deferred[0].reason).toBe("unfrozen-case");
    expect(deferred[0].message).toContain("inner unfrozen");
  });
});

describe("disposition-path — a failed render emits coverage-only + ONE render-failed diagnostic (FIX 2b)", () => {
  let fx: Fixture;
  let spy: jest.SpyInstance;
  beforeAll(() => {
    fx = mkFixture("gen-dpp-renderfail-", POLICY_CRL, CEL);
    // Force renderScenario to report a wholesale failure (the generator imports it from "../cre"; ts-jest compiles the
    // named import to a property access on the module object, so spying on the module is observed at the call site).
    spy = jest.spyOn(cre, "renderScenario").mockReturnValue({
      schemaVersion: 1,
      success: false,
      source: { celFilePath: fx.celPath },
      caseCount: 0,
      passCount: 0,
      failCount: 0,
      errorCount: 0,
      scenarios: [],
      errors: ["forced render failure"],
    });
  });
  afterAll(() => {
    spy.mockRestore();
    rmSync(fx.root, { recursive: true, force: true });
  });

  it("emits ONLY the coverage cluster + exactly one deferred-disposition-path (reason render-failed)", () => {
    const graph = resolveCelImports(fx.celPath);
    const r = generateProvenanceScaffold(graph, {
      policyId: "L",
      policyVersion: "1",
      anchorSource: ANCHOR_META,
      celFileName: "f.cel",
      clusterBy: "disposition-path",
    });
    // coverage-cluster ONLY (no disposition clusters).
    expect(r.artifact.clusters).toHaveLength(1);
    expect(r.artifact.clusters[0].id).toMatch(/:coverage$/);
    expect(r.artifact.clusters[0].cel).toEqual([]);

    const deferred = r.diagnostics.filter((d) => d.kind === "deferred-disposition-path");
    expect(deferred).toHaveLength(1);
    expect(deferred[0].reason).toBe("render-failed");
    expect(deferred[0].details).toEqual(["forced render failure"]);
    // the coverage cluster still carries the over-reach candidates (so the baseline isn't gutted by a render failure).
    expect(r.artifact.clusters[0].crl.length).toBeGreaterThan(0);
  });
});

// ── FIX 4 — over-reach baseline parity across modes, on a fixture WITH an UNTAKEN branch ──────────────────────────
// decision D has THREE when-arms but the single case only walks when[0] → when[1] + its action are UNTAKEN. The
// disposition cluster carries only the when[0] path; the coverage cluster must mop up the untaken when[1]/action sub-
// nodes (+ all leaves) so the over-reach baseline is byte-identical to per-decision mode.
const UNTAKEN_CRL = `# LU
library "LU".
concept "A":
- type is Condition.
- code is \`a\`.
concept "B":
- type is Condition.
- code is \`b\`.
concept "C":
- type is Condition.
- code is \`c\`.
activity "DoA":
- request CPGCommunicationRequest.
- with \`da\`.
activity "DoB":
- request CPGCommunicationRequest.
- with \`db\`.
activity "DoC":
- request CPGCommunicationRequest.
- with \`dc\`.
decision "D":
first:
- when "A" then recommend activity "DoA".
- when "B" then recommend activity "DoB".
- otherwise then recommend activity "DoC".`;
const UNTAKEN_CEL = `# C
library "C".
covers "LU".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fA":
- code is "http://example.org|a".
- date is "2026-01-01".
- defined by "A".
case "a-path":
- id is "case-a".
- subject is "Pat".
- fact is "fA".
- result is "D" is "DoA".`;

describe("disposition-path — over-reach baseline + relations match per-decision mode WITH an untaken branch (FIX 4/6)", () => {
  let fx: Fixture;
  beforeAll(() => {
    fx = mkFixture("gen-dpp-untaken-", UNTAKEN_CRL, UNTAKEN_CEL);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  const scaffold = (clusterBy: "decision" | "disposition-path") =>
    generateProvenanceScaffold(resolveCelImports(fx.celPath), {
      policyId: "LU",
      policyVersion: "1",
      anchorSource: ANCHOR_META,
      celFileName: "f.cel",
      clusterBy,
    });

  it("the over-reach-baseline nodeKey set is IDENTICAL across the two modes", () => {
    const byMode = (m: "decision" | "disposition-path") =>
      scaffold(m)
        .diagnostics.filter((d) => d.kind === "overreach-baseline")
        .map((d) => d.nodeKey)
        .sort();
    const decisionKeys = byMode("decision");
    const dppKeys = byMode("disposition-path");
    expect(dppKeys).toEqual(decisionKeys);
    // sanity: the untaken when[1] + its action ARE in the baseline (they'd be homeless without the coverage mop-up).
    expect(decisionKeys.some((k) => k!.includes("when[1]"))).toBe(true);
  });

  it("no UNTAKEN decision sub-node is homeless; the homeless set is IDENTICAL to per-decision mode", () => {
    // The coverage cluster must mop up every untaken-branch decision sub-node so it is NOT newly-homeless in dpp mode.
    // The ONLY legitimately-homeless candidates are unreachable policy-owned leaves (e.g. a declared-but-unused concept)
    // — and those are homeless in PER-DECISION mode too (neither mode homes an unreachable decl), so the homeless SET is
    // identical across modes. This is the precise FIX-4 guarantee (untaken sub-nodes covered, baseline unchanged).
    const homelessIn = (m: "decision" | "disposition-path"): string[] => {
      const s = scaffold(m);
      const citedKeys = new Set<string>();
      for (const c of s.artifact.clusters)
        for (const ref of c.crl)
          citedKeys.add(
            JSON.stringify([ref.lib, ref.kind, ref.name, ref.nodeId !== undefined ? ref.nodeId : null]),
          );
      return s.diagnostics
        .filter((d) => d.kind === "overreach-baseline")
        .map((d) => d.nodeKey!)
        .filter((k) => !citedKeys.has(k))
        .sort();
    };
    const dppHomeless = homelessIn("disposition-path");
    // identical homeless set across modes.
    expect(dppHomeless).toEqual(homelessIn("decision"));
    // and NONE of the dpp-homeless are decision SUB-NODES (they'd be the untaken-branch nodes the coverage must mop up);
    // every homeless key is a decl-level leaf (nodeId === null in the JSON tuple).
    for (const k of dppHomeless) {
      const tuple = JSON.parse(k) as [string, string, string, string | null];
      expect(tuple[3]).toBeNull(); // no decision sub-node (which would carry a non-null nodeId) is homeless
    }
  });

  it("the relation chosen for each shared crl ref MATCHES per-decision mode (FIX 6 — same spine source)", () => {
    // Build nodeKey → relation for both modes (union over all clusters); a key cited in BOTH modes must carry the same
    // relation, proving the coverage cluster's gating/spine relations agree with buildDecisionCluster's.
    const relMap = (m: "decision" | "disposition-path"): Map<string, string> => {
      const out = new Map<string, string>();
      for (const c of scaffold(m).artifact.clusters)
        for (const ref of c.crl) {
          const k = JSON.stringify([
            ref.lib,
            ref.kind,
            ref.name,
            ref.nodeId !== undefined ? ref.nodeId : null,
          ]);
          out.set(k, ref.relation);
        }
      return out;
    };
    const dec = relMap("decision");
    const dpp = relMap("disposition-path");
    for (const [k, rel] of dpp) {
      if (dec.has(k)) expect(rel).toBe(dec.get(k));
    }
    // and the two modes cite the SAME crl node set overall (a cover, just partitioned differently).
    expect([...dpp.keys()].sort()).toEqual([...dec.keys()].sort());
  });
});

// ── FIX 5 — the round-trip is a genuine BLEED CATCHER: a concept `defined as` part of TWO whens on TWO arms ──────
// "Shared Age" is `defined as` part of BOTH "Crohns Indication" (when[0]) AND "UC Indication" (when[1]). A leaked
// concept ref into a disposition cluster would (per #170's rx501-147) light BOTH when rows → bleed. The decision-node-
// ONLY clustering must NOT bleed: generate disposition-path → validate final → still 0 cockpit-correspondence.
const SHARED_CRL = `# L2
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
const SHARED_CEL = `# C
library "C".
covers "L2".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fAge":
- code is "http://example.org|age".
- date is "2026-01-01".
- defined by "Shared Age".
fact "fCrohn":
- code is "http://example.org|crohn".
- date is "2026-01-01".
- defined by "Crohns Marker".
case "crohns":
- id is "case-crohns".
- subject is "Pat".
- fact is "fAge".
- fact is "fCrohn".
- result is "D" is "Approve".`;

describe("disposition-path — round-trip catches a multi-when shared-concept bleed (FIX 5)", () => {
  let fx: Fixture;
  beforeAll(() => {
    fx = mkFixture("gen-dpp-shared-", SHARED_CRL, SHARED_CEL);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("the multi-cell shared concept is NOT in any disposition cluster, and the scaffold round-trips clean", () => {
    const { artifact, artifactPath } = genArtifact(fx, "disposition-path");
    const disposition = artifact.clusters.filter((c) => !c.id.endsWith(":coverage"));
    // one path (the crohns/when[0] arm) → one disposition cluster; decision-node refs only (no "Shared Age" concept ref).
    expect(disposition).toHaveLength(1);
    const conceptRefs = disposition[0].crl.filter((r: CrlNodeRef) => r.kind === "concept");
    expect(conceptRefs).toEqual([]);
    // crl is exactly the crohns-arm chain: when[0] + when[0]/action[0].
    expect(disposition[0].crl.map((r) => r.nodeId).sort()).toEqual(["when[0]", "when[0]/action[0]"]);

    // round-trip: 0 cockpit-correspondence findings (the shared sub-concept does NOT bleed when[1] in).
    const res = validateProvenanceFiles(artifactPath, fx.celPath, fx.anchorPath, "final");
    expect(res.findings.filter((f) => f.kind === "cockpit-correspondence")).toEqual([]);
  });
});
