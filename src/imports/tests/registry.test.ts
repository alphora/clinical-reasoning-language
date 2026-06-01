import * as path from "path";

import { scanSourcePaths } from "../registry";

const FIXTURES = path.resolve(__dirname, "fixtures");

describe("scanSourcePaths", () => {
  it("registers named libraries from a directory", () => {
    const dir = path.join(FIXTURES, "cms22-split");
    const { registry, diagnostics } = scanSourcePaths([
      { path: dir, implicit: false },
    ]);

    // 5 named libraries in cms22-split.
    const total = [...registry.byName.values()].reduce(
      (sum, arr) => sum + arr.length,
      0,
    );
    expect(total).toBe(5);
    expect(registry.byName.has("CMS22")).toBe(true);
    expect(registry.byName.has("CMS22 Interface")).toBe(true);
    expect(registry.byName.has("CMS22 Terminology")).toBe(true);
    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  it("skips anonymous files silently", () => {
    const dir = path.join(FIXTURES, "anonymous-root");
    const { registry } = scanSourcePaths([{ path: dir, implicit: false }]);
    // Only "Named" is registered; root.crl (anonymous) is skipped.
    expect(registry.byName.has("Named")).toBe(true);
    expect([...registry.byName.values()].flat()).toHaveLength(1);
  });

  it("emits a registry-duplicate diagnostic for two files with same (name, version)", () => {
    const dir = path.join(FIXTURES, "registry-duplicate");
    const { diagnostics } = scanSourcePaths([{ path: dir, implicit: false }]);
    const dup = diagnostics.find((d) => d.kind === "registry-duplicate");
    expect(dup).toBeDefined();
    expect(dup?.severity).toBe("error");
    if (dup?.kind === "registry-duplicate") {
      expect(dup.name).toBe("Foo");
      expect(dup.version).toBe("1.0.0");
      expect(dup.filePaths).toHaveLength(2);
    }
  });

  it("emits a parse-failure warning for broken files in the search path", () => {
    const dir = path.join(FIXTURES, "source-path-parse-failure");
    const { registry, diagnostics } = scanSourcePaths([
      { path: dir, implicit: false },
    ]);
    const parseFail = diagnostics.find((d) => d.kind === "parse-failure");
    expect(parseFail).toBeDefined();
    expect(parseFail?.severity).toBe("warning");
    // The "Good" library still registers despite the broken sibling.
    expect(registry.byName.has("Good")).toBe(true);
  });

  it("throws on explicit missing source path", () => {
    expect(() =>
      scanSourcePaths([
        { path: path.join(FIXTURES, "does-not-exist"), implicit: false },
      ]),
    ).toThrow(/Source path does not exist/);
  });

  it("tolerates implicit missing source path silently", () => {
    const result = scanSourcePaths([
      { path: path.join(FIXTURES, "does-not-exist"), implicit: true },
    ]);
    expect(result.registry.byName.size).toBe(0);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("dedupes source paths after canonicalization", () => {
    const dir = path.join(FIXTURES, "cms22-split");
    const { registry, diagnostics } = scanSourcePaths([
      { path: dir, implicit: false },
      { path: dir, implicit: false }, // same path twice
    ]);
    // No registry-duplicate diagnostics from passing the same dir twice.
    expect(diagnostics.filter((d) => d.kind === "registry-duplicate")).toHaveLength(0);
    expect([...registry.byName.values()].flat()).toHaveLength(5);
  });
});
