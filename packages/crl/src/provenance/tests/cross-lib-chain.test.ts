/**
 * #172 todo-3 (FULL) — the provenance/cockpit round-trip for a CROSS-LIBRARY chained `use decision`, now COMPLETE.
 *
 * Premise (disc 156 §"Provenance/cockpit index" + §todo-3, disc 157 FULL design): todo-2 (c327d44) makes the CRE
 * EVALUATE a cross-lib `use decision`; the structural surfaces recurse cross-lib with `target.libraryName` set; the
 * index inventories cross-lib decisions (`collectLibs` adds every registry lib); the #175 run-path decomposer carries
 * `lib` per frame; the gate (correspondenceCheck) grounds against the standalone structure index. todo-3 closes the
 * PROVENANCE/GENERATE side so a cross-lib policy round-trips CLEAN through the FINAL gate in BOTH modes.
 *
 * Topology (cross-lib, shared sub is a LOCAL sibling — the corpus shape per disc 156):
 *   Policy.D  --when Indic--> use decision "Shared"."Sub"   (a QUALIFIED cross-lib delegation)
 *   Shared.Sub  first: --when Crit--> recommend "Approve" ; --otherwise--> recommend "Deny"   (its OWN criterion)
 * The CEL covers Policy.D and QUALIFIES its fact (`defined by "Shared"."Crit"`) — contract A.
 *
 * THE FIX (disc 157): the generator's decision context is re-keyed by (lib, name) and POPULATED from the produced run
 * path (covered decisions ∪ every cross-lib sub the run reaches); `spineNodeForRef`'s `ref.lib === coveredLib` guard is
 * removed (it resolves the lib-qualified ctx); the default-mode cluster set is widened to (covered ∪ run-path-reached
 * cross-lib subs); the chained attach + cluster id use the TERMINAL's lib (`cluster:Shared:Sub`); the coverage cluster
 * ownership-filters the cross-lib spine push. RESULT: the cross-lib disposition-path scaffold round-trips with ZERO
 * cockpit-correspondence findings, and the default mode attributes `D is Approve` to `cluster:Shared:Sub`.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { resolveCelImports } from "../../cel/imports";
import { runCel } from "../../cre/run";
import { renderScenario } from "../../cre/viewModel";
import type { AnchorSourceMeta } from "../artifact";
import { buildCockpitModel } from "../cockpitModel";
import { deriveCoverage, isOverReach } from "../coverage";
import { generateProvenanceScaffold } from "../generate";
import { generateProvenanceFiles } from "../generateFiles";
import { buildProvenanceIndex, collectLibs, decisionSubNodeRef, nodeKey } from "../indexer";
import { buildCrlRevealMaps, crlAnchorsForUnits, unitsForCase } from "../revealMaps";
import { collectProduced, producedRuntimePathRefs, type MinimalViewNode } from "../runPath";
import { validateProvenanceFiles } from "../validateFiles";

// ── the cross-lib chained fixture (files, so resolveCelImports discovers Shared as a LOCAL sibling) ──
const POLICY_CRL = `# Policy
library "Policy".
concept "Indic":
- type is Condition.
- code is \`indic\`.
decision "D":
- when "Indic" then:
  - use decision "Shared"."Sub".
  end.`;

const SHARED_CRL = `# Shared
library "Shared".
concept "Crit":
- type is Condition.
- code is \`crit\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`a\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`d\`.
decision "Sub":
first:
- when "Crit" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;

// covers Policy.D; the fact QUALIFIES its criterion against Shared (`defined by "Shared"."Crit"`) — contract A.
const POLICY_CEL = `# PolicyCases
library "PolicyCases".
covers "Policy".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- date is "2026-01-01".
- defined by "Indic".
fact "fCrit":
- date is "2026-01-01".
- defined by "Shared"."Crit".
case "qualified crit -> shared sub approves":
- id is "case-approve".
- subject is "Pat".
- fact is "fIndic".
- fact is "fCrit".
- result is "D" is "Approve".`;

const META: AnchorSourceMeta = {
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
const ANCHOR_TEXT = "anchor.\n";

interface Fixture {
  root: string;
  celPath: string;
  anchorPath: string;
}
/** Write a multi-CRL project (policy + a sibling Shared lib) + the CEL + the anchor; return the paths. */
function mkCrossLibFixture(
  prefix: string,
  policyCrl: string,
  sharedCrl: string,
  cel: string,
): Fixture {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "p", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/p" } }),
  );
  writeFileSync(path.join(root, "policy.crl"), policyCrl);
  writeFileSync(path.join(root, "shared.crl"), sharedCrl); // a LOCAL sibling (no crl.sharedLibraries → policy-owned by default)
  const celPath = path.join(root, "policy.cel");
  writeFileSync(celPath, cel);
  const anchorPath = path.join(root, "anchor.txt");
  writeFileSync(anchorPath, ANCHOR_TEXT);
  return { root, celPath, anchorPath };
}

// ── 0) PREMISE: the cross-lib chain resolves end-to-end via the FILE pipeline (Shared discovered as a local sibling) ──
describe("#172 todo-3 — PREMISE: the file pipeline resolves the cross-lib chain (Shared is a local sibling)", () => {
  let fx: Fixture;
  beforeAll(() => {
    fx = mkCrossLibFixture("xlib-premise-", POLICY_CRL, SHARED_CRL, POLICY_CEL);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("resolveCelImports registers Shared in crlRegistry + collectLibs inventories it", () => {
    const graph = resolveCelImports(fx.celPath);
    expect(graph.coversTarget?.name).toBe("Policy");
    expect(graph.crlRegistry?.byNameLocal.has("Shared")).toBe(true);
    const { libs } = collectLibs(graph);
    expect(libs.has("Policy")).toBe(true);
    expect(libs.has("Shared")).toBe(true);
    // Shared is a local sibling, not declared shared → defaults to policy-owned (see test 4 for the ownership note).
    expect(libs.get("Shared")!.ownership).toBe("policy-owned");
  });

  it("runCel EVALUATES the cross-lib chain: Shared.Sub approves on the qualified Crit fact", () => {
    const r = runCel(resolveCelImports(fx.celPath));
    expect(r.runs).toHaveLength(1);
    expect(r.runs[0].status).toBe("pass");
    expect(r.runs[0].produced.map((p) => p.recommendation)).toEqual(["Approve"]);
  });

  it("the rendered VM re-roots the produced terminal into the SHARED frame (lib='Shared') via target.libraryName", () => {
    const rendered = renderScenario(resolveCelImports(fx.celPath));
    const sv = rendered.scenarios[0];
    const produced: MinimalViewNode[] = [];
    collectProduced(sv.tree as unknown as MinimalViewNode[], produced);
    expect(produced).toHaveLength(1);
    // decompose the deep inlined run path → ordered standalone refs, one per delegation frame.
    const paths = producedRuntimePathRefs(sv.tree as unknown as MinimalViewNode[], {
      lib: "Policy",
      decision: "D",
    });
    expect(paths).toHaveLength(1);
    expect(paths[0].gaps).toEqual([]); // fully grounded on a real VM
    // the refs SPAN both libs: D's delegation rows (lib Policy) + Sub's firing rows (lib Shared).
    const byLib = new Map<string, string[]>();
    for (const ref of paths[0].refs) {
      const arr = byLib.get(ref.lib) ?? [];
      arr.push(`${ref.decision}#${ref.nodeId}`);
      byLib.set(ref.lib, arr);
    }
    expect([...byLib.keys()].sort()).toEqual(["Policy", "Shared"]);
    // Policy's rows: the when[0] criterion + the use-decision boundary action it sits under.
    expect(byLib.get("Policy")!.sort()).toEqual(["D#when[0]", "D#when[0]/action[0]"]);
    // Shared's firing rows: the Sub when[0] criterion + the Approve recommend terminal.
    expect(byLib.get("Shared")!.sort()).toEqual(["Sub#when[0]", "Sub#when[0]/action[0]"]);
  });
});

// ── 1+2) THE GATE: a cross-lib disposition-path scaffold ROUND-TRIPS CLEAN (the todo-3 FULL fix) ──
//
// disc 157 closes the GAP: the generator's ctx is re-keyed by (lib, name) + populated from the run path, and
// `spineNodeForRef`'s cross-lib guard is removed. The disposition-path generator now CITES the decomposed cross-lib
// refs → a multi-LIBRARY disposition cluster (Policy.D's delegation rows + Shared.Sub's firing rows). The cockpit lights
// exactly those rows, the gate's `expected` grounds the same 4 rows → ZERO cockpit-correspondence findings (a clean
// round-trip, mirroring the SAME-LIB chain in chainBaseline.test.ts but spanning two libraries).
describe("#172 todo-3 — the gate: a cross-lib disposition-path scaffold round-trips CLEAN (the todo-3 FULL fix)", () => {
  let fx: Fixture;
  beforeAll(() => {
    fx = mkCrossLibFixture("xlib-gate-", POLICY_CRL, SHARED_CRL, POLICY_CEL);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  function genDispositionArtifact(): string {
    const r = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy: "disposition-path" });
    const p = path.join(fx.root, "art-dpp.json");
    writeFileSync(p, JSON.stringify(r.artifact, null, 2) + "\n");
    return p;
  }

  it("RESOLVED: the disposition-path GENERATOR cites the cross-lib refs → ONE multi-library disposition cluster, NO defer", () => {
    // spineNodeForRef now resolves the cross-lib firing rows from the LIB-QUALIFIED ctx (Shared.Sub's own spine), so the
    // case is COMPARABLE and gets a disposition cluster spanning BOTH libs — never the old unmapped-runtime-node defer.
    const r = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy: "disposition-path" });
    const disposition = r.artifact.clusters.filter((c) => !c.id.endsWith(":coverage"));
    expect(disposition).toHaveLength(1); // ONE disposition cluster — the cross-lib path now RESOLVES.
    // it cites the decomposed cross-lib run path: Policy.D delegation rows + Shared.Sub firing rows.
    const cited = disposition[0].crl.map((x) => `${x.lib}::${x.name}#${x.nodeId}`).sort();
    expect(cited).toEqual([
      "Policy::D#when[0]",
      "Policy::D#when[0]/action[0]",
      "Shared::Sub#when[0]",
      "Shared::Sub#when[0]/action[0]",
    ]);
    // the firing terminal (Shared.Sub recommend) carries `recommends-disposition` read off SHARED's OWN spine.
    const relOf = new Map(
      disposition[0].crl.map((x) => [`${x.lib}::${x.name}#${x.nodeId}`, x.relation]),
    );
    expect(relOf.get("Shared::Sub#when[0]/action[0]")).toBe("recommends-disposition");
    expect(relOf.get("Policy::D#when[0]/action[0]")).toBe("composes-criteria"); // the use-decision boundary
    // it cites the frozen case; NO deferred-disposition-path diagnostic for this case.
    expect(disposition[0].cel.map((x) => x.caseId)).toEqual(["case-approve"]);
    expect(r.diagnostics.filter((d) => d.kind === "deferred-disposition-path")).toEqual([]);
    // the coverage cluster is still emitted (the over-reach baseline survives).
    expect(r.artifact.clusters.some((c) => c.id.endsWith(":coverage"))).toBe(true);
  });

  it("RESOLVED: ZERO cockpit-CORRESPONDENCE findings (the clean round-trip — NOT a full-final pass)", () => {
    // The contract this pins is the #174 stance: ZERO cockpit-CORRESPONDENCE findings (the disposition cluster cites
    // exactly the case's decomposed run path → the cockpit lights exactly those rows → lit == expected, not unchecked).
    // It is NOT `pass === true`: a fresh scaffold still has provisional refs + over-reach (the KE's attribution worklist),
    // so other final-mode findings remain by design. We assert the correspondence channel specifically.
    const artPath = genDispositionArtifact();
    const findings = validateProvenanceFiles(artPath, fx.celPath, fx.anchorPath, "final").findings;
    const corr = findings.filter((f) => f.kind === "cockpit-correspondence");
    expect(corr).toEqual([]);
  });

  it("FIX 6 — DIRECT lit==expected pin: the cockpit lights EXACTLY the decomposed cross-lib run path", () => {
    // The round-trip above INFERS lit==expected (cluster cites refs + 0 findings). Pin it DIRECTLY: build the cockpit
    // model, resolve the LIT decision-row set the SAME way the gate does (crlAnchorsForUnits(unitsForCase(...)), dropping
    // concept + decision-root keys), and assert it EQUALS the decomposed run-path nodeKeys (Policy.D delegation + Shared.Sub
    // rows). This proves the cockpit reveal itself spans both libs, independent of the validator's bleed/miss arithmetic.
    const artPath = genDispositionArtifact();
    const model = buildCockpitModel(artPath, fx.celPath, fx.anchorPath, "final");
    const maps = buildCrlRevealMaps(model.correspondence, model.crlStructure, model.conceptLayer);
    const caseId = model.caseIdByName["qualified crit -> shared sub approves"];
    expect(caseId).toBe("case-approve");
    const lit = new Set(
      crlAnchorsForUnits(unitsForCase(caseId, maps), maps).filter((k) => {
        const m = maps.nodeByKey.get(k);
        return m !== undefined && m.kind !== "decision"; // drop concept (absent) + decision-root, as the gate does.
      }),
    );
    // expected = the decomposed cross-lib run path's standalone nodeKeys.
    const rendered = renderScenario(resolveCelImports(fx.celPath));
    const paths = producedRuntimePathRefs(
      rendered.scenarios[0].tree as unknown as MinimalViewNode[],
      {
        lib: "Policy",
        decision: "D",
      },
    );
    const expected = new Set(
      paths.flatMap((p) =>
        p.refs.map((r) => nodeKey(decisionSubNodeRef(r.lib, r.decision, r.nodeId))),
      ),
    );
    expect([...lit].sort()).toEqual([...expected].sort());
    // and the lit set genuinely spans BOTH libraries (not just the covered lib).
    const litLibs = new Set([...lit].map((k) => maps.nodeByKey.get(k)!.lib));
    expect([...litLibs].sort()).toEqual(["Policy", "Shared"]);
  });

  it("gate == generate: every cross-lib run-path ref HAS a standalone structure row the cluster cites (no skew)", () => {
    // The index/decomposer halves were always sound (the gate grounds against the standalone structure index, which
    // inventories Shared); todo-3 made the GENERATOR cite them too. Assert both: every grounded ref has a structure row,
    // AND the generated disposition cluster's cited keys EQUAL the decomposer's grounded keys (so no gate-vs-generate skew).
    const rendered = renderScenario(resolveCelImports(fx.celPath));
    const paths = producedRuntimePathRefs(
      rendered.scenarios[0].tree as unknown as MinimalViewNode[],
      {
        lib: "Policy",
        decision: "D",
      },
    );
    const index = buildProvenanceIndex(resolveCelImports(fx.celPath));
    const decomposedKeys = new Set<string>();
    for (const ref of paths.flatMap((p) => p.refs)) {
      const k = nodeKey(decisionSubNodeRef(ref.lib, ref.decision, ref.nodeId));
      expect(index.nodes.has(k)).toBe(true); // every grounded ref (Policy + Shared) HAS a structure row.
      decomposedKeys.add(k);
    }
    const r = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy: "disposition-path" });
    const cluster = r.artifact.clusters.filter((c) => !c.id.endsWith(":coverage"))[0];
    const citedKeys = new Set(
      cluster.crl.map((ref) =>
        nodeKey({
          lib: ref.lib,
          kind: ref.kind,
          name: ref.name,
          ...(ref.nodeId !== undefined ? { nodeId: ref.nodeId } : {}),
        }),
      ),
    );
    expect([...citedKeys].sort()).toEqual([...decomposedKeys].sort());
  });
});

// ── 3) THE DEFAULT MODE: the cross-lib disposition ATTACHES to cluster:Shared:Sub (the todo-3 FULL fix) ──
describe("#172 todo-3 — the DEFAULT (clusterBy:'decision') mode: the cross-lib disposition attaches to cluster:Shared:Sub", () => {
  let fx: Fixture;
  beforeAll(() => {
    fx = mkCrossLibFixture("xlib-default-", POLICY_CRL, SHARED_CRL, POLICY_CEL);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  const gen = () =>
    generateProvenanceScaffold(resolveCelImports(fx.celPath), {
      policyId: "Policy",
      policyVersion: "1",
      anchorSource: META,
      celFileName: "policy.cel",
    });
  const celOf = (r: ReturnType<typeof gen>, id: string) =>
    r.artifact.clusters.find((c) => c.id === id)?.cel ?? [];

  it("RESOLVED: `D is Approve` (Approve fires in Shared.Sub) attaches to cluster:Shared:Sub, NOT D, NO defer", () => {
    // The two halves of the fix:
    //  (1) the default-mode cluster set is widened to (covered ∪ run-path-reached cross-lib subs), so cluster:Shared:Sub
    //      EXISTS (built via buildDecisionCluster over Shared.Sub's OWN spine + lib).
    //  (2) the chained-attach resolves the cross-lib firing terminal via the lib-qualified ctx and attaches to
    //      clusterIdFor(terminal.lib)(terminal.decision) = cluster:Shared:Sub (the terminal.lib id — NOT cluster:Policy:Sub).
    const r = gen();
    const clusterIds = r.artifact.clusters.map((c) => c.id).sort();
    expect(clusterIds).toEqual(["cluster:Policy:D", "cluster:Shared:Sub"]); // the widened set incl. the cross-lib sub.
    // the case lands in cluster:Shared:Sub (where Approve fired), with tests-branch (Sub's when[0] arm).
    expect(celOf(r, "cluster:Shared:Sub").map((x) => `${x.caseId}:${x.relation}`)).toEqual([
      "case-approve:tests-branch",
    ]);
    // the covered decision D does NOT carry the case (no phantom leaf-name attach).
    expect(celOf(r, "cluster:Policy:D").some((x) => x.caseId === "case-approve")).toBe(false);
    // it is NOT a defer / mismatch anymore.
    expect(
      r.diagnostics.some(
        (d) => d.kind === "cel-result-run-mismatch" && d.caseId === "case-approve",
      ),
    ).toBe(false);
    expect(r.diagnostics.some((d) => d.kind === "unsupported-cel-result")).toBe(false);
    expect(r.diagnostics.some((d) => d.kind === "ambiguous-cel-branch")).toBe(false);
  });
});

// ── 4) OVER-REACH (the denominator): Shared sub-nodes' ownership + whether they pollute the over-reach baseline ──
describe("#172 todo-3 — over-reach denominator: Shared sub-nodes when Shared is a LOCAL sibling vs DECLARED shared", () => {
  // 4a — Shared a LOCAL sibling (the corpus default): NOT declared in crl.sharedLibraries → policy-owned. So its
  // determination sub-nodes ARE over-reach candidates (the design's "shared-reference, not a candidate" assumes a
  // DECLARED-shared/package lib; a local sibling is policy-owned by `collectLibs`). DOCUMENTED here, not a bug.
  let fxLocal: Fixture;
  beforeAll(() => {
    fxLocal = mkCrossLibFixture("xlib-or-local-", POLICY_CRL, SHARED_CRL, POLICY_CEL);
  });
  afterAll(() => rmSync(fxLocal.root, { recursive: true, force: true }));

  it("4a — a LOCAL-sibling Shared is POLICY-OWNED → its sub-nodes ARE over-reach candidates (isOverReach true on a bare scaffold)", () => {
    const graph = resolveCelImports(fxLocal.celPath);
    const index = buildProvenanceIndex(graph);
    // a bare structural scaffold (no items, no disposition cluster citing Sub's rows because it deferred).
    const r = generateProvenanceScaffold(graph, {
      policyId: "Policy",
      policyVersion: "1",
      anchorSource: META,
      celFileName: "policy.cel",
      clusterBy: "disposition-path",
    });
    const subWhen0 = index.nodes.get(nodeKey(decisionSubNodeRef("Shared", "Sub", "when[0]")));
    expect(subWhen0).toBeDefined();
    expect(subWhen0!.ownership).toBe("policy-owned");
    expect(subWhen0!.nodeKind).toBe("decision-node");
    const itemsById = new Map(r.artifact.items.map((it) => [it.id, it]));
    // policy-owned decision sub-node not in any counted cluster → it IS over-reach (the determination's own logic counts).
    // NOTE: the coverage cluster mops up untaken/deferred sub-nodes, so check isOverReach against the FRESH-scaffold
    // index node directly (the documented behavior: a local sibling's logic is in the over-reach denominator).
    const overReach = deriveCoverage(r.artifact, index, ANCHOR_TEXT).overReach.map((n) =>
      nodeKey(n.ref),
    );
    // the determination sub-nodes are HOMED by the coverage cluster (so not over-reach in dpp mode) — the point of 4a is
    // the OWNERSHIP (policy-owned), which is what would put them in the denominator absent a home. Assert ownership +
    // that isOverReach is purely a function of ownership+candidacy for an UNCITED node.
    expect(isOverReach(subWhen0!, { ...r.artifact, clusters: [] }, itemsById)).toBe(true);
    void overReach;
  });

  // 4b — Shared DECLARED shared (crl.sharedLibraries): the design's intended shape. Its sub-nodes are shared-reference →
  // isOverReach false → NOT over-reach candidates (the shared sub does NOT pollute the over-reach baseline). This is the
  // disc 156 §"Provenance/cockpit index" guarantee, and it holds.
  let fxShared: Fixture;
  beforeAll(() => {
    fxShared = mkCrossLibFixture("xlib-or-shared-", POLICY_CRL, SHARED_CRL, POLICY_CEL);
    // declare Shared as a shared library in the manifest.
    writeFileSync(
      path.join(fxShared.root, "package.json"),
      JSON.stringify({
        name: "p",
        version: "0.0.0",
        private: true,
        crl: { sharedLibraries: ["Shared"] },
      }),
    );
  });
  afterAll(() => rmSync(fxShared.root, { recursive: true, force: true }));

  it("4b — a DECLARED-shared Shared → sub-nodes are shared-reference → isOverReach false → NOT over-reach candidates", () => {
    const graph = resolveCelImports(fxShared.celPath);
    const index = buildProvenanceIndex(graph);
    const subWhen0 = index.nodes.get(nodeKey(decisionSubNodeRef("Shared", "Sub", "when[0]")));
    expect(subWhen0).toBeDefined();
    expect(subWhen0!.ownership).toBe("shared-reference");
    expect(subWhen0!.nodeKind).toBe("shared-reference");
    // shared-reference → isOverReach false even with NO cluster citing it (the shared sub never pollutes the denominator).
    const r = generateProvenanceScaffold(graph, {
      policyId: "Policy",
      policyVersion: "1",
      anchorSource: META,
      celFileName: "policy.cel",
      clusterBy: "disposition-path",
    });
    const itemsById = new Map(r.artifact.items.map((it) => [it.id, it]));
    expect(isOverReach(subWhen0!, { ...r.artifact, clusters: [] }, itemsById)).toBe(false);
    // and the over-reach report carries NO Shared sub-node (Shared is excluded from the baseline entirely).
    const overReach = deriveCoverage(r.artifact, index, ANCHOR_TEXT).overReach;
    expect(overReach.some((n) => n.ref.lib === "Shared")).toBe(false);
  });
});

// ── 5) HONESTY for cross-lib residuals: an UNRESOLVED cross-lib target still defers, never a false green ──
const UNRESOLVED_POLICY_CRL = `# Policy
library "Policy".
concept "Indic":
- type is Condition.
- code is \`indic\`.
decision "D":
- when "Indic" then:
  - use decision "Missing"."Sub".
  end.`;
const UNRESOLVED_CEL = `# PolicyCases
library "PolicyCases".
covers "Policy".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- date is "2026-01-01".
- defined by "Indic".
case "unresolved xlib target":
- id is "case-unresolved".
- subject is "Pat".
- fact is "fIndic".
- result is "D" is "Sub".`;

describe("#172 todo-3 — honesty: an UNRESOLVED cross-lib target defers (never a false green) through the FINAL gate", () => {
  let fx: Fixture;
  beforeAll(() => {
    // NO shared.crl written → "Missing"."Sub" cannot resolve.
    const root = mkdtempSync(path.join(os.tmpdir(), "xlib-unresolved-"));
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "p", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/p" } }),
    );
    writeFileSync(path.join(root, "policy.crl"), UNRESOLVED_POLICY_CRL);
    const celPath = path.join(root, "policy.cel");
    writeFileSync(celPath, UNRESOLVED_CEL);
    const anchorPath = path.join(root, "anchor.txt");
    writeFileSync(anchorPath, ANCHOR_TEXT);
    fx = { root, celPath, anchorPath };
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("the disposition-path scaffold defers the unresolved case (no disposition cluster) and the gate is not a false green", () => {
    const r = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy: "disposition-path" });
    const disposition = r.artifact.clusters.filter((c) => !c.id.endsWith(":coverage"));
    // the unresolved target produces no disposition → no produced action → deferred (no disposition cluster).
    expect(disposition).toEqual([]);
    const deferred = r.diagnostics.filter((d) => d.kind === "deferred-disposition-path");
    expect(deferred).toHaveLength(1);
    // no-produced-action (the unresolved use-decision never determined a recommendation) — an honest defer, not a green.
    expect(deferred[0].reason).toBe("no-produced-action");

    const artPath = path.join(fx.root, "art.json");
    writeFileSync(artPath, JSON.stringify(r.artifact, null, 2) + "\n");
    // The FINAL gate: the case has no produced action → unchecked (no-produced-action) → a cockpit-correspondence finding
    // (a green that means "checked nothing" is impossible — the unchecked case surfaces). NOT a false clean pass.
    const findings = validateProvenanceFiles(artPath, fx.celPath, fx.anchorPath, "final").findings;
    const corr = findings.filter((f) => f.kind === "cockpit-correspondence");
    expect(corr).toHaveLength(1);
    expect(corr[0].message).toMatch(/unchecked.*no-produced-action/);
  });
});

// ── 6) NAME-COLLISION boundary (documented restriction; the corpus has no collisions) ──
//
// `collectLibs`/`resolveRef`/`producedRuntimePathRefs` dedupe + resolve cross-lib refs by lib NAME, NOT (name, origin).
// So a LOCAL library and a PACKAGE library sharing the same name would COLLIDE — `collectLibs.addLib` keeps only the
// FIRST (local-first), and a qualified `use decision "Shared"."Sub"` ref binds by the name "Shared" with no origin
// discriminator. The provenance refs (`{lib, kind, name, nodeId}`) carry no origin, so two same-name libs are
// indistinguishable in the index. disc 156 §[boundary] (gpt55-8) accepts this as a DOCUMENTED RESTRICTION: the corpus
// has no name collisions (no package libs; shared libs are local siblings), so the local-first resolution is
// unambiguous. An origin-aware ref key is a deferred enhancement (#172 follow-on), not a todo-3 deliverable. We pin the
// local-first dedup behavior so a future origin-aware change is a deliberate, test-visible decision.
describe("#172 todo-3 — name-collision boundary: cross-lib refs bind by lib NAME (documented restriction)", () => {
  it("collectLibs dedupes by lib name (local-first), so a same-name package lib would be shadowed — pinned, not fixed", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "xlib-collision-"));
    try {
      writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({ name: "p", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/p" } }),
      );
      writeFileSync(path.join(root, "policy.crl"), POLICY_CRL);
      writeFileSync(path.join(root, "shared.crl"), SHARED_CRL);
      const celPath = path.join(root, "policy.cel");
      writeFileSync(celPath, POLICY_CEL);
      const graph = resolveCelImports(celPath);
      // simulate a name collision: a package-origin "Shared" entry alongside the local one (the corpus never has this).
      const localShared = graph.crlRegistry!.byNameLocal.get("Shared")!;
      graph.crlRegistry!.byNamePackage.set("Shared", { ...localShared, origin: "package" });
      const { libs } = collectLibs(graph);
      // exactly ONE "Shared" survives (the index has no origin discriminator) → local-first wins (addLib early-returns on
      // the second same-name entry). The package "Shared" is shadowed — the documented restriction.
      const shared = libs.get("Shared")!;
      expect(shared).toBeDefined();
      expect(shared.entry.origin).toBe("local"); // local-first; the package one is dropped, not merged
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
