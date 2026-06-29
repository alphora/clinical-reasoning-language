import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";

import { buildRegistry, findProjectRoot } from "../registry";

const FIXTURES = path.resolve(__dirname, "fixtures");

describe("findProjectRoot", () => {
  it("finds the nearest package.json walking up from a file", () => {
    const fixturePath = path.join(FIXTURES, "cms22-split", "cms22.crl");
    const root = findProjectRoot(fixturePath);
    expect(root).toBe(path.join(FIXTURES, "cms22-split"));
  });

  it("returns the fixture dir (not the workspace root) — each fixture has its own package.json", () => {
    const fixturePath = path.join(FIXTURES, "diamond-dag", "root.crl");
    const root = findProjectRoot(fixturePath);
    expect(root).toBe(path.join(FIXTURES, "diamond-dag"));
  });
});

describe("buildRegistry", () => {
  it("registers all libraries in cms22-split (4 layers: interface, inferred, asserted, concepts)", () => {
    const projectRoot = path.join(FIXTURES, "cms22-split");
    const { registry, diagnostics } = buildRegistry(projectRoot);
    expect(registry.byNameLocal.has("CMS22")).toBe(true);
    expect(registry.byNameLocal.has("CMS22 Inferred")).toBe(true);
    expect(registry.byNameLocal.has("CMS22 Asserted")).toBe(true);
    expect(registry.byNameLocal.has("CMS22 Concepts")).toBe(true);
    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  it("emits registry-duplicate when two local files declare the same library name", () => {
    const projectRoot = path.join(FIXTURES, "registry-duplicate");
    const { diagnostics } = buildRegistry(projectRoot);
    const dup = diagnostics.find((d) => d.kind === "registry-duplicate");
    expect(dup).toBeDefined();
    if (dup?.kind === "registry-duplicate") {
      expect(dup.name).toBe("Foo");
      expect(dup.filePaths).toHaveLength(2);
    }
  });

  // Anonymous-mode is gone in v2.1.0 — every CRL file must declare a library.
  // The anonymous-root fixture is deleted; this test is preserved as a marker
  // of the removed behavior.
  it.skip("REMOVED v2.1.0: skips anonymous files silently", () => {
    // The anonymous-root fixture has been deleted along with this test's premise.
  });

  // T06 / #75: sub-package boundaries. A subdirectory carrying its own
  // package.json is its own CRL project — the parent's scan must skip it,
  // even when both declare overlapping library names.
  it("respects sub-package boundaries (#75): subdir with its own package.json is invisible to parent scan", () => {
    const root = mkdtempSync(path.join(tmpdir(), "crl-t06-"));
    try {
      writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "parent", version: "0.0.0" }));
      writeFileSync(
        path.join(root, "parent.crl"),
        '# Parent\nlibrary "Shared".\nconcept "P":\n- type is Observation.\n- value type is boolean.\n- defined as "P".\n',
      );

      const subDir = path.join(root, "sub");
      mkdirSync(subDir);
      writeFileSync(path.join(subDir, "package.json"), JSON.stringify({ name: "child", version: "0.0.0" }));
      // Sub-package declares the SAME library name. Pre-fix scanner would
      // sweep both files and emit registry-duplicate.
      writeFileSync(
        path.join(subDir, "child.crl"),
        '# Child\nlibrary "Shared".\nconcept "C":\n- type is Observation.\n- value type is boolean.\n- defined as "C".\n',
      );

      const { registry, diagnostics } = buildRegistry(root);
      // Parent owns the "Shared" library; sub-package's copy is invisible.
      expect(registry.byNameLocal.has("Shared")).toBe(true);
      const dup = diagnostics.find((d) => d.kind === "registry-duplicate");
      expect(dup).toBeUndefined();
      // The sub-package's parent.crl is NOT registered.
      const sharedEntry = registry.byNameLocal.get("Shared");
      expect(sharedEntry?.filePath).toBe(path.join(root, "parent.crl"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("emits parse-failure warning for a broken local file but keeps going", () => {
    const projectRoot = path.join(FIXTURES, "source-path-parse-failure");
    const { registry, diagnostics } = buildRegistry(projectRoot);
    const parseFail = diagnostics.find((d) => d.kind === "parse-failure");
    expect(parseFail).toBeDefined();
    expect(parseFail?.severity).toBe("warning");
    expect(registry.byNameLocal.has("Good")).toBe(true);
  });
});
