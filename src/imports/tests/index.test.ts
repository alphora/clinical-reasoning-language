import * as path from "path";

import { resolveImports } from "../index";

import "./registry.test";
import "./resolver.test";
import "./namespace.test";
import "./validate.test";
import "./emit.test";

const FIXTURES = path.resolve(__dirname, "fixtures");

describe("resolveImports (end-to-end)", () => {
  it("resolves the cms22-split graph and builds the combined namespace", () => {
    const root = path.join(FIXTURES, "cms22-split", "cms22.crl");
    const graph = resolveImports(root);
    const errs = graph.diagnostics.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
    expect(graph.resolvedLibraries.map((e) => e.name)).toEqual([
      "CMS22 Terminology",
      "CMS22 Asserted",
      "CMS22 Inferred",
      "CMS22 Interface",
      "CMS22",
    ]);
    expect(graph.namespace.concepts.has("Initial Population")).toBe(true);
    expect(graph.namespace.terminologies.has("Qualifying Encounters Valueset")).toBe(true);
  });

  it("exposes projectRoot in the resolved graph", () => {
    const root = path.join(FIXTURES, "cms22-split", "cms22.crl");
    const graph = resolveImports(root);
    expect(graph.projectRoot).toBe(path.join(FIXTURES, "cms22-split"));
  });

  it("returns a partial graph with parse-failure when the root fails to parse", () => {
    const root = path.join(FIXTURES, "source-path-parse-failure", "broken.crl");
    const graph = resolveImports(root);
    const parseFail = graph.diagnostics.find((d) => d.kind === "parse-failure");
    expect(parseFail).toBeDefined();
    expect(parseFail?.severity).toBe("error");
    expect(graph.resolvedLibraries).toHaveLength(0);
  });

  it("allows cross-kind same-name (concept BMI + terminology BMI) without conflict", () => {
    const root = path.join(FIXTURES, "cross-kind-same-name", "root.crl");
    const graph = resolveImports(root);
    const conflicts = graph.diagnostics.filter((d) => d.kind === "name-conflict");
    expect(conflicts).toHaveLength(0);
    expect(graph.namespace.concepts.has("BMI")).toBe(true);
    expect(graph.namespace.terminologies.has("BMI")).toBe(true);
  });

  it("supports an anonymous root with includes", () => {
    const root = path.join(FIXTURES, "anonymous-root", "root.crl");
    const graph = resolveImports(root);
    const errs = graph.diagnostics.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
    expect(graph.resolvedLibraries[graph.resolvedLibraries.length - 1].name).toBeNull();
    expect(graph.resolvedLibraries[graph.resolvedLibraries.length - 1].isRoot).toBe(true);
    expect(graph.namespace.terminologies.has("T")).toBe(true);
  });

  it("surfaces an unresolved-include when an include can't be found", () => {
    const root = path.join(FIXTURES, "unresolved", "root.crl");
    const graph = resolveImports(root);
    const unresolved = graph.diagnostics.find((d) => d.kind === "unresolved-include");
    expect(unresolved).toBeDefined();
  });

  it("surfaces a cycle diagnostic when A includes B and B includes A", () => {
    const root = path.join(FIXTURES, "cycle", "A.crl");
    const graph = resolveImports(root);
    const cycle = graph.diagnostics.find((d) => d.kind === "cycle");
    expect(cycle).toBeDefined();
  });

  it("surfaces a name-conflict when two included libraries declare the same concept", () => {
    const root = path.join(FIXTURES, "name-conflict", "root.crl");
    const graph = resolveImports(root);
    const conflict = graph.diagnostics.find((d) => d.kind === "name-conflict");
    expect(conflict).toBeDefined();
  });

  it("surfaces a registry-duplicate when two local files declare the same library name", () => {
    const root = path.join(FIXTURES, "registry-duplicate", "root.crl");
    const graph = resolveImports(root);
    const dup = graph.diagnostics.find((d) => d.kind === "registry-duplicate");
    expect(dup).toBeDefined();
  });

  it("surfaces a parse-failure warning when a local file is broken (resolution continues)", () => {
    const root = path.join(FIXTURES, "source-path-parse-failure", "root.crl");
    const graph = resolveImports(root);
    const parseFail = graph.diagnostics.find((d) => d.kind === "parse-failure");
    expect(parseFail).toBeDefined();
    expect(parseFail?.severity).toBe("warning");
    expect(graph.resolvedLibraries.find((e) => e.name === "Good")).toBeDefined();
  });
});
