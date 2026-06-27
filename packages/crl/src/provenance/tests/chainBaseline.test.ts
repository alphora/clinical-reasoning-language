/**
 * #175 todo-0 — the chain fixture PREMISE + the current-gate BASELINE.
 *
 * This pins the two facts disc 151 (Fork B) is built on:
 *   (1) the CRE inlines a same-lib `use decision` chain → the produced action's nodeId is the DEEP caller-local form;
 *   (2) through the CURRENT correspondence gate (standalone `idToKey`), the chained case routes to
 *       `unmapped-runtime-node` (the #170/#171 graceful deferral) — NOT clean, NOT mismatch.
 *
 * Both assertions are the verification gate the reviewers required BEFORE building the decomposer. The baseline (2) is
 * EXPECTED to flip to clean/mismatch when todo-2 wires `producedRuntimePathRefs` into correspondenceCheck.
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
import type { ProvenanceArtifact } from "../artifact";
import { collectProduced, type MinimalViewNode } from "../runPath";
import { validateProvenanceFiles } from "../validateFiles";

import {
  CHAIN_CRL,
  CHAIN_CEL,
  CHAIN_DEEP_NODEID,
  CHAIN_CASE_ID,
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

describe("#175 todo-0 — PREMISE: the chain inlines a deep caller-local produced nodeId", () => {
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

describe("#175 todo-0 — BASELINE (current gate): the chained case routes to unmapped-runtime-node", () => {
  let root: string;
  let celPath: string;
  let crlPath: string;
  let anchorPath: string;
  let artPath: string;

  beforeAll(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "prov-chain-"));
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "p", version: "0.0.0", private: true }),
    );
    crlPath = path.join(root, "chain.crl");
    celPath = path.join(root, "chain.cel");
    anchorPath = path.join(root, "anchor.txt");
    writeFileSync(crlPath, CHAIN_CRL);
    writeFileSync(celPath, CHAIN_CEL);
    writeFileSync(anchorPath, "anchor.\n");

    // A minimal valid artifact (no clusters). The gate iterates ALL scenarios; the frozen "deep" case (id case-deep)
    // is joined and run through the run-path → idToKey lookup, which is where the chained id misses.
    const artifact: ProvenanceArtifact = {
      schemaVersion: "1.0",
      policyId: "CHAIN",
      policyVersion: "1",
      anchorSource: {
        path: "anchor.txt",
        derivedFrom: "anchor.docx",
        derivedFromHash: "sha256:0",
        canonicalizer: "crl-anchor-docx-text",
        canonicalizerVersion: "1.0.0",
        textHash: "sha256:0",
        offsetUnit: "utf8-byte",
        unicodeNormalization: "NFC",
        rangeConvention: "half-open",
      },
      items: [],
      ignoredRanges: [],
      clusters: [],
    };
    artPath = path.join(root, "art.json");
    writeFileSync(artPath, JSON.stringify(artifact));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("EXPECTED to flip to clean/mismatch when todo-2 wires the decomposer — TODAY it is unmapped-runtime-node", () => {
    const findings = validateProvenanceFiles(artPath, celPath, anchorPath, "final").findings;
    const corr = findings.filter((f) => f.kind === "cockpit-correspondence");
    const deep = corr.find((f) => f.message.includes('case "deep"'));
    expect(deep).toBeDefined();
    // BASELINE: the gate cannot ground the deep inlined run-path id against the STANDALONE structure index → it defers
    // gracefully to unmapped-runtime-node (never a silent green, never a wrong-sub false mismatch).
    expect(deep!.message).toContain("unmapped-runtime-node");
    // and it cites the FULL deep delegated nodeId it couldn't ground (correspondenceFinding folds the unmapped
    // `details` into the message). A strong, exact assertion — not a substring that appears everywhere.
    expect(deep!.message).toContain(CHAIN_DEEP_NODEID);
    expect(CHAIN_CASE_ID).toBe("case-deep"); // the join is on this frozen id
  });
});
