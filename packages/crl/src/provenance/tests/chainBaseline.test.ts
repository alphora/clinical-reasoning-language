/**
 * #175 — the chain fixture PREMISE + (was todo-0 BASELINE, now todo-2) the RESOLVED chained case.
 *
 * PREMISE (unchanged): pins the two facts disc 151 (Fork B) is built on:
 *   (1) the CRE inlines a same-lib `use decision` chain → the produced action's nodeId is the DEEP caller-local form;
 *   (2) the deep nodeId is the full 8-segment / 3-boundary inlined form.
 *
 * RESOLVED (todo-2 — was the #175 unmapped baseline): now that `producedRuntimePathRefs` is wired into BOTH consumers
 * (the FINAL gate `correspondenceCheck.ts` AND the disposition-path generator `generate.ts`), the chained case no longer
 * routes to `unmapped-runtime-node`. The decomposer re-roots the deep inlined run-path into the ordered STANDALONE-local
 * refs — Main(otherwise, otherwise/action[0]) → Sub1(when[0], when[0]/action[0]) → Sub2(…) → Sub3(when[0],
 * when[0]/action[0]) — each of which grounds against the standalone structure index (every sub-decision is inventoried
 * standalone). So a disposition-path scaffold generated for the chain is correspondence-correct BY CONSTRUCTION and
 * round-trips through the FINAL gate with ZERO cockpit-correspondence findings, with the produced disposition attributed
 * ACROSS Main + the sub-decisions (the cluster cites the decomposed multi-decision refs).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { parseInput } from "../../ast/tests/parseInput";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import { renderScenario } from "../../cre/viewModel";
import { runCel } from "../../cre/run";
import type { RegistryEntry } from "../../imports/types";
import { decisionSubNodeRef, nodeKey } from "../indexer";
import { generateProvenanceFiles } from "../generateFiles";
import { collectProduced, producedRuntimePathRefs, type MinimalViewNode } from "../runPath";
import { validateProvenanceFiles } from "../validateFiles";

import {
  CHAIN_CRL,
  CHAIN_CEL,
  CHAIN_DEEP_NODEID,
  CHAIN_CASE_ID,
  CHAIN_ROOT,
} from "./fixtures/chainFixture";

function graphFrom(crlSrc: string, celSrc: string): ResolvedCelGraph {
  const crl = parseInput(crlSrc);
  const built = buildCEL(celSrc);
  if (!built.success || !built.result) {
    throw new Error("inline CEL build failed: " + JSON.stringify(built.errors));
  }
  const coversTarget: RegistryEntry = {
    name: crl.library.name,
    filePath: "inline.crl",
    ast: crl,
    isRoot: true,
    origin: "root",
  };
  return {
    filePath: "inline.cel",
    cel: built.result,
    coversTarget,
    celParseErrors: [],
    diagnostics: [],
  };
}

describe("#175 — PREMISE: the chain inlines a deep caller-local produced nodeId", () => {
  it("runCel walks Main→Sub1→Sub2→Sub3 and produces 'Final' at the deepest sub", () => {
    const r = runCel(graphFrom(CHAIN_CRL, CHAIN_CEL));
    const run = r.runs.find((x) => x.case === "deep")!;
    expect(run.status).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["Final"]);
  });

  it("the produced action's VM nodeId IS the deep inlined caller-local form (8 segments, 3 boundaries)", () => {
    const r = renderScenario(graphFrom(CHAIN_CRL, CHAIN_CEL));
    const sv = r.scenarios[0];
    const produced: MinimalViewNode[] = [];
    collectProduced(sv.tree as unknown as MinimalViewNode[], produced);
    expect(produced).toHaveLength(1);
    expect(produced[0].nodeId).toBe(CHAIN_DEEP_NODEID);
    // depth/shape: 8 `/`-segments = 3 use-decision boundaries (otherwise/action[0] ×1 + when[0]/action[0] ×2 inlined)
    // + the Main otherwise + each sub's when + the terminal recommend.
    expect(CHAIN_DEEP_NODEID.split("/")).toHaveLength(8);
  });
});

describe("#175 todo-2 — RESOLVED (was the unmapped baseline): the chained case round-trips clean", () => {
  let root: string;
  let celPath: string;
  let crlPath: string;
  let anchorPath: string;

  beforeAll(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "prov-chain-"));
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "p", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/p" } }),
    );
    crlPath = path.join(root, "chain.crl");
    celPath = path.join(root, "chain.cel");
    anchorPath = path.join(root, "anchor.txt");
    writeFileSync(crlPath, CHAIN_CRL);
    writeFileSync(celPath, CHAIN_CEL);
    writeFileSync(anchorPath, "anchor.\n");
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  /** Generate a disposition-path scaffold for the chain fixture → its artifact path. */
  function genDispositionArtifact(): string {
    const r = generateProvenanceFiles(celPath, anchorPath, { clusterBy: "disposition-path" });
    const p = path.join(root, "art-dpp.json");
    writeFileSync(p, JSON.stringify(r.artifact, null, 2) + "\n");
    return p;
  }

  it("a disposition-path scaffold for the chain round-trips with ZERO cockpit-correspondence findings", () => {
    // The decomposer grounds the deep inlined run-path → the disposition cluster is correspondence-correct BY
    // CONSTRUCTION → the FINAL gate sees lit == path → no bleed, no miss, AND not unchecked (a green that means CHECKED).
    const artPath = genDispositionArtifact();
    const findings = validateProvenanceFiles(artPath, celPath, anchorPath, "final").findings;
    const corr = findings.filter((f) => f.kind === "cockpit-correspondence");
    expect(corr).toEqual([]);
    // explicitly: NOT the #175 baseline anymore — no unmapped-runtime-node for the "deep" case.
    expect(corr.find((f) => f.message.includes('case "deep"'))).toBeUndefined();
    expect(CHAIN_CASE_ID).toBe("case-deep");
  });

  it("the produced disposition is attributed ACROSS Main + the sub-decisions (the cluster cites the decomposed refs)", () => {
    const r = generateProvenanceFiles(celPath, anchorPath, { clusterBy: "disposition-path" });
    const disposition = r.artifact.clusters.filter((c) => !c.id.endsWith(":coverage"));
    // ONE run path → ONE disposition cluster.
    expect(disposition).toHaveLength(1);
    const cluster = disposition[0];
    // every cited crl ref is a decision-node ref; the SET of (decision, nodeId) spans Main + Sub1 + Sub2 + Sub3.
    const cited = cluster.crl.map((ref) => `${ref.name}#${ref.nodeId}`).sort();
    expect(cited).toEqual(
      [
        "Main#otherwise",
        "Main#otherwise/action[0]",
        "Sub1#when[0]",
        "Sub1#when[0]/action[0]",
        "Sub2#when[0]",
        "Sub2#when[0]/action[0]",
        "Sub3#when[0]",
        "Sub3#when[0]/action[0]",
      ].sort(),
    );
    // it cites the frozen case + every crl ref is a decision-node ref (no concept/activity leak).
    expect(cluster.cel.map((x) => x.caseId)).toEqual([CHAIN_CASE_ID]);
    for (const ref of cluster.crl) {
      expect(ref.kind).toBe("decision");
      expect(ref.nodeKind).toBe("decision-node");
    }
  });

  it("FIX 4 — each ref's relation comes from its OWN decision's spine, not the covered decision's", () => {
    // The gate ignores relation, so a wrong relation would NOT be caught by the round-trip. Pin it explicitly. In the
    // chain: Main.otherwise/action[0] = use-Sub1, Sub1.when[0]/action[0] = use-Sub2, Sub2.when[0]/action[0] = use-Sub3
    // (all `composes-criteria` — a UseDecision boundary); Sub3.when[0]/action[0] = recommend Final (`recommends-
    // disposition`); every when/otherwise row = `implements-criterion`. Relations are read from each ref's OWN spine.
    const r = generateProvenanceFiles(celPath, anchorPath, { clusterBy: "disposition-path" });
    const cluster = r.artifact.clusters.filter((c) => !c.id.endsWith(":coverage"))[0];
    const relOf = new Map(cluster.crl.map((ref) => [`${ref.name}#${ref.nodeId}`, ref.relation]));
    expect(relOf.get("Sub3#when[0]/action[0]")).toBe("recommends-disposition"); // the terminal recommend
    expect(relOf.get("Main#otherwise/action[0]")).toBe("composes-criteria"); // use-Sub1 boundary
    expect(relOf.get("Sub1#when[0]/action[0]")).toBe("composes-criteria"); // use-Sub2 boundary
    expect(relOf.get("Sub2#when[0]/action[0]")).toBe("composes-criteria"); // use-Sub3 boundary
    expect(relOf.get("Main#otherwise")).toBe("implements-criterion");
    expect(relOf.get("Sub1#when[0]")).toBe("implements-criterion");
    expect(relOf.get("Sub2#when[0]")).toBe("implements-criterion");
    expect(relOf.get("Sub3#when[0]")).toBe("implements-criterion");
  });

  it("gate == generate: the disposition cluster's cited rows EQUAL the decomposer's grounded standalone rows", () => {
    // The shared-consistency requirement (disc 151 ref 3): the FINAL gate and the generator both derive the run path via
    // the ONE `producedRuntimePathRefs` primitive. Independently re-derive the decomposed refs off the rendered tree and
    // map each to its standalone nodeKey; assert it is the SAME set the generated disposition cluster cites — so a
    // generated disposition-path scaffold round-trips clean through the gate (no skew where the gate would still defer).
    const rendered = renderScenario(graphFrom(CHAIN_CRL, CHAIN_CEL));
    const paths = producedRuntimePathRefs(
      rendered.scenarios[0].tree as unknown as MinimalViewNode[],
      { lib: CHAIN_ROOT.lib, decision: CHAIN_ROOT.decision },
    );
    // the decomposer grounded everything (no residual gap on a real VM).
    expect(paths.flatMap((p) => p.gaps)).toEqual([]);
    const decomposedKeys = new Set(
      paths.flatMap((p) =>
        p.refs.map((ref) => nodeKey(decisionSubNodeRef(ref.lib, ref.decision, ref.nodeId))),
      ),
    );

    const r = generateProvenanceFiles(celPath, anchorPath, { clusterBy: "disposition-path" });
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
