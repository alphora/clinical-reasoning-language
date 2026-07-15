import * as path from "path";

import { resolveCelImports } from "../resolver";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

const CORPUS = {
  cms22: path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms22/cms22.cel"),
  cms22Strategy: path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms22/cms22-strategy.cel"),
  cms69: path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms69/cms69.cel"),
  cms69Strategy: path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms69/cms69-strategy.cel"),
  syntaxRef: path.join(__dirname, "../../tests/fixtures/cel-syntax-reference.cel"),
};

describe("CEL Todo 3 — resolveCelImports against the worked corpus", () => {
  test("cms22.cel → covers resolves to CRL library cms22 in cms22", () => {
    const g = resolveCelImports(CORPUS.cms22);
    expect(g.celParseErrors).toHaveLength(0);
    expect(g.cel?.covers?.name).toBe("cms22");
    expect(g.projectRoot).toMatch(/cms22$/);
    expect(g.coversTarget).toBeDefined();
    expect(g.coversTarget?.name).toBe("cms22");
    const errs = g.diagnostics.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
  });

  test("cms22-strategy.cel → covers resolves to cms22-strategy (now in same split package)", () => {
    const g = resolveCelImports(CORPUS.cms22Strategy);
    expect(g.celParseErrors).toHaveLength(0);
    expect(g.coversTarget?.name).toBe("cms22-strategy");
    const errs = g.diagnostics.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
  });

  test("cms69.cel → covers resolves to cms69", () => {
    const g = resolveCelImports(CORPUS.cms69);
    expect(g.celParseErrors).toHaveLength(0);
    expect(g.coversTarget?.name).toBe("cms69");
    const errs = g.diagnostics.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
  });

  test("cms69-strategy.cel → covers resolves to cms69-strategy", () => {
    const g = resolveCelImports(CORPUS.cms69Strategy);
    expect(g.celParseErrors).toHaveLength(0);
    expect(g.coversTarget?.name).toBe("cms69-strategy");
    const errs = g.diagnostics.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
  });

  test("syntax-ref → unresolved-covers diagnostic (placeholder Some Strategy Library)", () => {
    const g = resolveCelImports(CORPUS.syntaxRef);
    expect(g.celParseErrors).toHaveLength(0);
    expect(g.coversTarget).toBeUndefined();
    const unresolved = g.diagnostics.find((d) => d.kind === "unresolved-covers");
    expect(unresolved).toBeDefined();
    expect(unresolved?.kind === "unresolved-covers" ? unresolved.coversName : "").toBe(
      "Some Strategy Library",
    );
  });
});

describe("CEL Todo 3 — boundary diagnostics", () => {
  test("overlay shadows on-disk source", () => {
    // Overlay a synthetic .cel source that covers a library we know exists.
    const canonical = CORPUS.cms22;
    const overlay = new Map<string, string>([
      [
        path.resolve(canonical).replace(/\//g, path.sep),
        [
          "# Overlay",
          'library "Overlayed".',
          'covers "cms22".',
          'fact "X":',
          '- name is "X".',
          '- defined by "Patient".',
        ].join("\n"),
      ],
    ]);
    const g = resolveCelImports(canonical, { overlays: overlay });
    expect(g.cel?.library.name).toBe("Overlayed");
    expect(g.coversTarget?.name).toBe("cms22");
  });
});
