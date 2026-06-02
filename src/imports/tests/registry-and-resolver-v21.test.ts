import * as path from "path";

import { resolveImports } from "../index";
import { buildRegistry } from "../registry";

const FIXTURES = path.resolve(__dirname, "fixtures");

describe("v2.1.0 registry split + resolver localLibraries", () => {
  describe("unrelated-local-sibling", () => {
    it("surfaces the non-walked sibling in localLibraries (not resolvedLibraries)", () => {
      const root = path.join(FIXTURES, "unrelated-local-sibling", "root.crl");
      const graph = resolveImports(root);
      const errs = graph.diagnostics.filter((d) => d.severity === "error");
      expect(errs).toHaveLength(0);

      // resolvedLibraries: include-walked closure from root → root only.
      expect(graph.resolvedLibraries.map((e) => e.name)).toEqual(["Root"]);

      // localLibraries: the unrelated sibling, byNameLocal minus walked.
      expect(graph.localLibraries.map((e) => e.name)).toEqual(["Sibling"]);
    });
  });

  describe("local-package-same-name", () => {
    it("populates both byNameLocal and byNamePackage without registry-duplicate", () => {
      const dir = path.join(FIXTURES, "local-package-same-name");
      const { registry, diagnostics } = buildRegistry(dir);
      expect(registry.byNameLocal.has("Foo")).toBe(true);
      expect(registry.byNamePackage.has("Foo")).toBe(true);
      const dup = diagnostics.find((d) => d.kind === "registry-duplicate");
      expect(dup).toBeUndefined();
    });

    it("include lookup picks the package version when root explicitly includes Foo", () => {
      const root = path.join(FIXTURES, "local-package-same-name", "root.crl");
      const graph = resolveImports(root);
      const errs = graph.diagnostics.filter((d) => d.severity === "error");
      expect(errs).toHaveLength(0);

      // resolvedLibraries should have Foo from node_modules/foo/foo.crl
      // (the package version), NOT from local-foo.crl.
      const fooEntry = graph.resolvedLibraries.find((e) => e.name === "Foo");
      expect(fooEntry).toBeDefined();
      expect(fooEntry?.origin).toBe("package");
      expect(fooEntry?.filePath).toContain("node_modules");

      // The local Foo is still known — it'll appear in localLibraries.
      const localFoo = graph.localLibraries.find((e) => e.name === "Foo");
      expect(localFoo).toBeDefined();
      expect(localFoo?.origin).toBe("local");

      // Namespace assertion: package's terminology is in the flat namespace,
      // local's is not (because `buildCombinedNamespace` reads only
      // `resolvedLibraries`, which contains the package version). Catches
      // accidental inclusion of `localLibraries` into the namespace build.
      expect(graph.namespace.terminologies.has("Foo Pkg T")).toBe(true);
      expect(graph.namespace.terminologies.has("Foo Local T")).toBe(false);
    });
  });

  describe("package-include-local-no-fallback", () => {
    it("a package's include does NOT silently fall back to a consumer-local library of the same name", () => {
      const root = path.join(FIXTURES, "package-include-local-no-fallback", "root.crl");
      const graph = resolveImports(root);
      const unresolved = graph.diagnostics.filter((d) => d.kind === "unresolved-include");
      // BadPkg's `include "ProjectOnly"` must fail to resolve — packages
      // cannot depend on consumer-local libraries per 026.
      expect(unresolved.length).toBeGreaterThan(0);
      const fromBadPkg = unresolved.find(
        (d) => d.kind === "unresolved-include" && d.from.libraryName === "BadPkg",
      );
      expect(fromBadPkg).toBeDefined();
    });
  });

  describe("root-name-collision", () => {
    it("preserves registry-duplicate when root's library name collides with a sibling at a different path", () => {
      const root = path.join(FIXTURES, "root-name-collision", "root.crl");
      const graph = resolveImports(root);
      const dup = graph.diagnostics.find((d) => d.kind === "registry-duplicate");
      expect(dup).toBeDefined();
      if (dup?.kind === "registry-duplicate") {
        expect(dup.name).toBe("Shared");
        expect(dup.filePaths).toHaveLength(2);
      }
    });
  });
});
