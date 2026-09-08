import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { produceResults } from "../produce";
import { RESULTS_ROOT } from "../useCases";

const files = vi.hoisted(() => ({ roots: [] as string[], refuseRemoval: "" }));
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return {
    ...fs,
    mkdtempSync: (...args: Parameters<typeof fs.mkdtempSync>) => {
      const root = fs.mkdtempSync(...args);
      files.roots.push(String(root));
      return root;
    },
    rmSync: (...args: Parameters<typeof fs.rmSync>) => {
      if (String(args[0]) === files.refuseRemoval) throw new Error("simulated removal failure");
      return fs.rmSync(...args);
    },
  };
});

// Keep the producer's real manifest, scan, ownership and deletion sequence. Stub
// compilation/runtime prerequisites: these tests do not claim native execution.
vi.mock("../spawn", async (original) => ({
  ...await original<typeof import("../spawn")>(),
  verifyJar: () => ({ ok: true, hasLauncher: true, sha256: "test-sha" }),
  resolveJava: () => ({ ok: true, javaExe: "unused-java", major: 21 }),
}));
vi.mock("../driver", () => ({ driverReady: () => ({ ok: true }) }));
vi.mock("../../emit-two-lane", () => ({ emitCrlTwoLane: () => ({
  success: true, cqlLibraries: [], fhir: { resources: [{ resource: {
    resourceType: "PlanDefinition", id: "policy", type: { coding: [{ code: "workflow-definition" }] },
  } }] },
}) }));
vi.mock("../../cel/imports", () => ({ resolveCelImports: () => ({ cel: { statements: [] } }) }));
vi.mock("../../cel/emitter", () => ({ emitCelToFhir: () => ({}) }));
vi.mock("../caseInput", () => ({ buildProducerInputs: () => ({ inputs: [] }), casesMissingFromEmit: () => [] }));

let root: string;
const staleQ = `${RESULTS_ROOT}/patient/old/questionnaire/old.json`;
const staleQr = `${RESULTS_ROOT}/patient/old/questionnaireresponse/old.json`;
const foreign = `${RESULTS_ROOT}/patient/old/observation/keep.json`;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "crl-produce-cleanup-"));
  for (const relative of [staleQ, staleQr, foreign]) {
    const full = path.join(root, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, "{}\n");
  }
});
afterEach(() => {
  files.refuseRemoval = "";
  for (const directory of files.roots.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function produce(prune?: boolean) {
  const result = produceResults({
    celPath: path.join(root, "suite.cel"), crlPath: path.join(root, "policy.crl"),
    outRoot: root, useCase: "prior-auth", crlVersion: "test", jarPath: "unused.jar", prune,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  expect(JSON.parse(readFileSync(result.manifestPath, "utf8")).cases).toEqual([]);
  return result;
}

describe("producer cleanup after committing an empty manifest", () => {
  // @kit emitted-trees-are-ours:results-prune
  it("deletes superseded Q and QR by default and preserves unowned types", () => {
    const result = produce();
    expect(result.pruned).toEqual([staleQ, staleQr].sort());
    expect(result.orphaned).toEqual([foreign]);
    expect(existsSync(path.join(root, staleQ))).toBe(false);
    expect(existsSync(path.join(root, staleQr))).toBe(false);
    expect(existsSync(path.join(root, foreign))).toBe(true);
  });

  // @kit emitted-trees-are-ours:results-retain
  it("prune:false retains and reports superseded Q and QR", () => {
    const result = produce(false);
    expect(result.pruned).toEqual([]);
    expect(result.orphaned).toEqual([staleQ, staleQr, foreign].sort());
    for (const relative of [staleQ, staleQr, foreign]) expect(existsSync(path.join(root, relative))).toBe(true);
  });

  // @kit emitted-trees-are-ours:results-removal-failure
  it("reports a failed deletion as orphaned while deleting the other owned file", () => {
    files.refuseRemoval = path.join(root, staleQ);
    const result = produce();
    expect(result.pruned).toEqual([staleQr]);
    expect(result.orphaned).toEqual([foreign, staleQ].sort());
    expect(existsSync(path.join(root, staleQ))).toBe(true);
    expect(existsSync(path.join(root, staleQr))).toBe(false);
    expect(existsSync(path.join(root, foreign))).toBe(true);
  });
});
