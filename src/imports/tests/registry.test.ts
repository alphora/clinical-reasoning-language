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
    expect(registry.byName.has("CMS22")).toBe(true);
    expect(registry.byName.has("CMS22 Interface")).toBe(true);
    expect(registry.byName.has("CMS22 Inferred")).toBe(true);
    expect(registry.byName.has("CMS22 Asserted")).toBe(true);
    expect(registry.byName.has("CMS22 Terminology")).toBe(true);
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

  it("skips anonymous files silently (no library declaration = not registered)", () => {
    const projectRoot = path.join(FIXTURES, "anonymous-root");
    const { registry } = buildRegistry(projectRoot);
    // anonymous-root/root.crl has no `library` line; named.crl declares "Named"
    expect(registry.byName.has("Named")).toBe(true);
    expect(registry.byName.size).toBe(1);
  });

  it("emits parse-failure warning for a broken local file but keeps going", () => {
    const projectRoot = path.join(FIXTURES, "source-path-parse-failure");
    const { registry, diagnostics } = buildRegistry(projectRoot);
    const parseFail = diagnostics.find((d) => d.kind === "parse-failure");
    expect(parseFail).toBeDefined();
    expect(parseFail?.severity).toBe("warning");
    expect(registry.byName.has("Good")).toBe(true);
  });
});
