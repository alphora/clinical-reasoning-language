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

// REFACTOR:grounded: an explicitly empty MV suite needs no engine.
let root: string;
const staleQ = `${RESULTS_ROOT}/patient/old/questionnaire/old.json`;
const staleQr = `${RESULTS_ROOT}/patient/old/questionnaireresponse/old.json`;
const foreign = `${RESULTS_ROOT}/patient/old/observation/keep.json`;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "crl-produce-cleanup-"));
  mkdirSync(path.join(root, "src/cel/mv"), { recursive: true });
  mkdirSync(path.join(root, "src/crl"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "cleanup", version: "1.0.0" }));
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

async function produce(prune?: boolean) {
  const result = await produceResults({
    celPath: root, crlPath: path.join(root, "policy.crl"),
    outRoot: root, useCase: "prior-auth", crlVersion: "test", jarPath: "unused.jar", prune,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  expect(JSON.parse(readFileSync(result.manifestPath, "utf8")).cases).toEqual([]);
  return result;
}

describe("complete result replacement", () => {
  // @kit emitted-trees-are-ours:results-prune
  it("replaces all generated files even for an empty suite", async () => {
    writeFileSync(path.join(root,"tests/results/custom.txt"),"custom");
    writeFileSync(path.join(root,"tests/results/questionnaire-manifest-old.json"),"{}");
    const result = await produce();
    expect(result.orphaned).toEqual([]);
    for(const relative of [staleQ,staleQr,foreign,"tests/results/custom.txt","tests/results/questionnaire-manifest-old.json"]) expect(existsSync(path.join(root,relative))).toBe(false);
    expect(existsSync(path.join(root,"src/crl"))).toBe(true);
  });

  // @kit emitted-trees-are-ours:results-retain
  it("refuses the obsolete preservation option before changing output", async () => {
    const result=await produceResults({celPath:root,crlPath:path.join(root,"policy.crl"),outRoot:root,useCase:"prior-auth",crlVersion:"test",prune:false});
    expect(result).toMatchObject({ok:false,reason:expect.stringContaining("no longer supported")});
    for(const relative of [staleQ,staleQr,foreign]) expect(existsSync(path.join(root,relative))).toBe(true);
  });

  // @kit emitted-trees-are-ours:results-removal-failure
  it("fails visibly when the output directory cannot be replaced", async () => {
    files.refuseRemoval=path.join(root,"tests/results");
    const result=await produceResults({celPath:root,crlPath:path.join(root,"policy.crl"),outRoot:root,useCase:"prior-auth",crlVersion:"test"});
    expect(result).toMatchObject({ok:false,reason:expect.stringContaining("simulated removal failure")});
    expect(existsSync(path.join(root,staleQr))).toBe(true);
  });
});
