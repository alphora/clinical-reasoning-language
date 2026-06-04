import * as path from "path";

import { resolveCelImports } from "../resolver";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

const CORPUS = {
  cms22: path.join(REPO_ROOT, "features/cql-pattern-mining/results/models/cms22-split/cms22.cel"),
  cms22Strategy: path.join(REPO_ROOT, "features/cql-pattern-mining/results/models/cms22-split/cms22-strategy.cel"),
  cms69: path.join(REPO_ROOT, "features/cql-pattern-mining/results/models/cms69-split/cms69.cel"),
  cms69Strategy: path.join(REPO_ROOT, "features/cql-pattern-mining/results/models/cms69-split/cms69-strategy.cel"),
  syntaxRef: path.join(REPO_ROOT, "docs/cel-syntax-reference.cel"),
};

describe("CEL Todo 3 — resolveCelImports against the worked corpus", () => {
  test("cms22.cel → covers resolves to CRL library CMS22 in cms22-split", () => {
    const g = resolveCelImports(CORPUS.cms22);
    expect(g.celParseErrors).toHaveLength(0);
    expect(g.cel?.covers?.name).toBe("CMS22");
    expect(g.projectRoot).toMatch(/cms22-split$/);
    expect(g.coversTarget).toBeDefined();
    expect(g.coversTarget?.name).toBe("CMS22");
    const errs = g.diagnostics.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
  });

  test("cms22-strategy.cel → covers resolves to CMS22 BP Control Cognitive Support Example (now in same split package)", () => {
    const g = resolveCelImports(CORPUS.cms22Strategy);
    expect(g.celParseErrors).toHaveLength(0);
    expect(g.coversTarget?.name).toBe("CMS22 BP Control Cognitive Support Example");
    const errs = g.diagnostics.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
  });

  test("cms69.cel → covers resolves to CMS69", () => {
    const g = resolveCelImports(CORPUS.cms69);
    expect(g.celParseErrors).toHaveLength(0);
    expect(g.coversTarget?.name).toBe("CMS69");
    const errs = g.diagnostics.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
  });

  test("cms69-strategy.cel → covers resolves to CMS69 BMI Screening GPG Strategy example", () => {
    const g = resolveCelImports(CORPUS.cms69Strategy);
    expect(g.celParseErrors).toHaveLength(0);
    expect(g.coversTarget?.name).toBe("CMS69 BMI Screening GPG Strategy example");
    const errs = g.diagnostics.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
  });

  test("syntax-ref → unresolved-covers diagnostic (placeholder Some Strategy Library)", () => {
    const g = resolveCelImports(CORPUS.syntaxRef);
    expect(g.celParseErrors).toHaveLength(0);
    expect(g.coversTarget).toBeUndefined();
    const unresolved = g.diagnostics.find((d) => d.kind === "unresolved-covers");
    expect(unresolved).toBeDefined();
    expect(unresolved?.kind === "unresolved-covers" ? unresolved.coversName : "").toBe("Some Strategy Library");
  });
});

describe("CEL Todo 3 — boundary diagnostics", () => {
  test("overlay shadows on-disk source", () => {
    // Overlay a synthetic .cel source that covers a library we know exists.
    const canonical = CORPUS.cms22;
    const overlay = new Map<string, string>([
      [require("path").resolve(canonical).replace(/\//g, require("path").sep), [
        "# Overlay",
        "library \"Overlayed\".",
        "covers \"CMS22\".",
        "fact \"X\":",
        "- name is \"X\".",
        "- defined by \"Patient\".",
      ].join("\n")],
    ]);
    const g = resolveCelImports(canonical, { overlays: overlay });
    expect(g.cel?.library.name).toBe("Overlayed");
    expect(g.coversTarget?.name).toBe("CMS22");
  });
});
