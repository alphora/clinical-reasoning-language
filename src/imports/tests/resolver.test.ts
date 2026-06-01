import { readFileSync } from "fs";
import * as path from "path";

import { buildCRL } from "../../index";
import { buildRegistry } from "../registry";
import { walkIncludes } from "../resolver";
import { RegistryEntry } from "../types";

const FIXTURES = path.resolve(__dirname, "fixtures");

function loadRoot(rootPath: string): RegistryEntry {
  const absolute = path.resolve(rootPath);
  const parsed = buildCRL(readFileSync(absolute, "utf-8"));
  if (!parsed.success || !parsed.result) {
    throw new Error("test setup: root parse failed " + absolute);
  }
  const ast = parsed.result;
  return {
    name: ast.library?.name ?? null,
    filePath: absolute,
    ast,
    isRoot: true,
    origin: "root",
  };
}

describe("walkIncludes", () => {
  it("walks the cms22-split graph leaves-first with root last", () => {
    const dir = path.join(FIXTURES, "cms22-split");
    const root = loadRoot(path.join(dir, "cms22.crl"));
    const { registry } = buildRegistry(dir);
    if (root.name) registry.byName.set(root.name, root); // route root by name

    const { resolvedLibraries, diagnostics } = walkIncludes(root, registry);
    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(resolvedLibraries.map((e) => e.name)).toEqual([
      "CMS22 Terminology",
      "CMS22 Asserted",
      "CMS22 Inferred",
      "CMS22 Interface",
      "CMS22",
    ]);
    expect(resolvedLibraries[resolvedLibraries.length - 1].isRoot).toBe(true);
  });

  it("deduplicates a diamond DAG", () => {
    const dir = path.join(FIXTURES, "diamond-dag");
    const root = loadRoot(path.join(dir, "root.crl"));
    const { registry } = buildRegistry(dir);
    if (root.name) registry.byName.set(root.name, root);

    const { resolvedLibraries } = walkIncludes(root, registry);
    const cCount = resolvedLibraries.filter((e) => e.name === "C").length;
    expect(cCount).toBe(1);
  });

  it("detects A→B→A cycle", () => {
    const dir = path.join(FIXTURES, "cycle");
    const root = loadRoot(path.join(dir, "A.crl"));
    const { registry } = buildRegistry(dir);
    if (root.name) registry.byName.set(root.name, root);

    const { diagnostics } = walkIncludes(root, registry);
    const cycle = diagnostics.find((d) => d.kind === "cycle");
    expect(cycle).toBeDefined();
  });

  it("detects a self-include as a cycle", () => {
    const dir = path.join(FIXTURES, "self-include");
    const root = loadRoot(path.join(dir, "A.crl"));
    const { registry } = buildRegistry(dir);
    if (root.name) registry.byName.set(root.name, root);

    const { diagnostics } = walkIncludes(root, registry);
    const cycle = diagnostics.find((d) => d.kind === "cycle");
    expect(cycle).toBeDefined();
  });

  it("emits unresolved-include when an include name has no matching library", () => {
    const dir = path.join(FIXTURES, "unresolved");
    const root = loadRoot(path.join(dir, "root.crl"));
    const { registry } = buildRegistry(dir);
    if (root.name) registry.byName.set(root.name, root);

    const { diagnostics } = walkIncludes(root, registry);
    const unresolved = diagnostics.find((d) => d.kind === "unresolved-include");
    expect(unresolved).toBeDefined();
    if (unresolved?.kind === "unresolved-include") {
      expect(unresolved.include.name).toBe("Missing");
    }
  });
});
