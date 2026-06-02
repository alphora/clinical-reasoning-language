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
  it("registers all libraries in cms22-split (5 entries, leaves + shell)", () => {
    const projectRoot = path.join(FIXTURES, "cms22-split");
    const { registry, diagnostics } = buildRegistry(projectRoot);
    expect(registry.byNameLocal.has("CMS22")).toBe(true);
    expect(registry.byNameLocal.has("CMS22 Interface")).toBe(true);
    expect(registry.byNameLocal.has("CMS22 Inferred")).toBe(true);
    expect(registry.byNameLocal.has("CMS22 Asserted")).toBe(true);
    expect(registry.byNameLocal.has("CMS22 Terminology")).toBe(true);
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

  it("emits parse-failure warning for a broken local file but keeps going", () => {
    const projectRoot = path.join(FIXTURES, "source-path-parse-failure");
    const { registry, diagnostics } = buildRegistry(projectRoot);
    const parseFail = diagnostics.find((d) => d.kind === "parse-failure");
    expect(parseFail).toBeDefined();
    expect(parseFail?.severity).toBe("warning");
    expect(registry.byNameLocal.has("Good")).toBe(true);
  });
});
