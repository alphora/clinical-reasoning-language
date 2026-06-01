import * as path from "path";

import { scanSourcePaths } from "../registry";
import { walkIncludes } from "../resolver";
import { RegistryEntry } from "../types";
import { buildCRL } from "../../index";
import { readFileSync } from "fs";

const FIXTURES = path.resolve(__dirname, "fixtures");

function loadRoot(rootPath: string): RegistryEntry {
  const absolute = path.resolve(rootPath);
  const source = readFileSync(absolute, "utf-8");
  const parsed = buildCRL(source);
  if (!parsed.success || !parsed.result) {
    throw new Error("test setup: root parse failed " + absolute);
  }
  const ast = parsed.result;
  return {
    name: ast.library?.name ?? null,
    ...(ast.library?.version !== undefined
      ? { version: ast.library.version }
      : {}),
    filePath: absolute,
    ast,
    isRoot: true,
  };
}

describe("walkIncludes", () => {
  it("walks the cms22-split graph and returns leaves-first topo order", () => {
    const dir = path.join(FIXTURES, "cms22-split");
    const root = loadRoot(path.join(dir, "cms22.crl"));
    const { registry } = scanSourcePaths([{ path: dir, implicit: false }]);
    // Drop the root from the registry so the root entry is canonical.
    registry.byName.delete("CMS22");

    const { resolvedLibraries, diagnostics } = walkIncludes(root, registry);
    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    const names = resolvedLibraries.map((e) => e.name);
    expect(names).toEqual([
      "CMS22 Terminology",
      "CMS22 Asserted",
      "CMS22 Inferred",
      "CMS22 Interface",
      "CMS22", // root last
    ]);
    expect(resolvedLibraries[resolvedLibraries.length - 1].isRoot).toBe(true);
  });

  it("dedupes a diamond DAG so each library appears exactly once", () => {
    const dir = path.join(FIXTURES, "diamond-dag");
    const root = loadRoot(path.join(dir, "root.crl"));
    const { registry } = scanSourcePaths([{ path: dir, implicit: false }]);
    registry.byName.delete("Root");

    const { resolvedLibraries, diagnostics } = walkIncludes(root, registry);
    expect(diagnostics.filter((d) => d.kind === "cycle")).toHaveLength(0);

    // C should appear exactly once even though root reaches it via A and B.
    const cCount = resolvedLibraries.filter((e) => e.name === "C").length;
    expect(cCount).toBe(1);

    // Topo order — C before A and B; root last.
    const names = resolvedLibraries.map((e) => e.name);
    expect(names.indexOf("C")).toBeLessThan(names.indexOf("A"));
    expect(names.indexOf("C")).toBeLessThan(names.indexOf("B"));
    expect(names[names.length - 1]).toBe("Root");
  });

  it("detects A→B→A cycle", () => {
    const dir = path.join(FIXTURES, "cycle");
    const root = loadRoot(path.join(dir, "A.crl"));
    const { registry } = scanSourcePaths([{ path: dir, implicit: false }]);
    // Replace registry's "A" entry with the root entry so includes back to A
    // resolve to the canonical root (matches resolveImports() behavior).
    registry.byName.set("A", [root]);

    const { diagnostics } = walkIncludes(root, registry);
    const cycle = diagnostics.find((d) => d.kind === "cycle");
    expect(cycle).toBeDefined();
    if (cycle?.kind === "cycle") {
      // Path closure: starts and ends with the same file.
      expect(cycle.filePaths[0]).toBe(cycle.filePaths[cycle.filePaths.length - 1]);
      expect(cycle.filePaths.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("detects a self-include as a cycle", () => {
    const dir = path.join(FIXTURES, "self-include");
    const root = loadRoot(path.join(dir, "A.crl"));
    const { registry } = scanSourcePaths([{ path: dir, implicit: false }]);
    registry.byName.delete("A");

    // The root tries to include "A". Re-register A so the include resolves.
    // (resolveImports() handles this routing; for the unit test we simulate.)
    registry.byName.set("A", [root]);

    const { diagnostics } = walkIncludes(root, registry);
    const cycle = diagnostics.find((d) => d.kind === "cycle");
    expect(cycle).toBeDefined();
  });

  it("emits unresolved-include for missing library", () => {
    const dir = path.join(FIXTURES, "unresolved");
    const root = loadRoot(path.join(dir, "root.crl"));
    const { registry } = scanSourcePaths([{ path: dir, implicit: false }]);
    registry.byName.delete("Root");

    const { diagnostics } = walkIncludes(root, registry);
    const unresolved = diagnostics.find((d) => d.kind === "unresolved-include");
    expect(unresolved).toBeDefined();
    if (unresolved?.kind === "unresolved-include") {
      expect(unresolved.include.name).toBe("Missing");
    }
  });

  it("emits ambiguous-include when unversioned include matches multiple versions", () => {
    const dir = path.join(FIXTURES, "ambiguous");
    const root = loadRoot(path.join(dir, "root.crl"));
    const { registry } = scanSourcePaths([{ path: dir, implicit: false }]);
    registry.byName.delete("Root");

    const { diagnostics } = walkIncludes(root, registry);
    const amb = diagnostics.find((d) => d.kind === "ambiguous-include");
    expect(amb).toBeDefined();
    if (amb?.kind === "ambiguous-include") {
      expect(amb.candidates.length).toBe(2);
      expect(amb.candidates.map((c) => c.version).sort()).toEqual(["1.0.0", "2.0.0"]);
    }
  });

  it("resolves versioned include to exact-version match", () => {
    const dir = path.join(FIXTURES, "registry-duplicate");
    const root = loadRoot(path.join(dir, "root.crl"));
    const { registry } = scanSourcePaths([{ path: dir, implicit: false }]);
    registry.byName.delete("Root");
    // registry has 1 entry for Foo (the duplicate was rejected by the registry diag).
    const { resolvedLibraries } = walkIncludes(root, registry);
    expect(resolvedLibraries.find((e) => e.name === "Foo")).toBeDefined();
  });
});
