// Unit tests for the headless navigation logic (#132 step 3c). The extension's golden oracle
// proves byte-for-byte behavior-preservation against the old providers over a REAL ProjectIndex
// (definition/references/documentSymbols/rename). These tests cover the two compute* fns that do
// NOT go through the position-resolver — computeDocumentLinks + computeWorkspaceSymbols — whose
// success paths the oracle's flat fixture doesn't reach, using a fake index with controllable data.
import {
  computeDocumentLinks,
  computeWorkspaceSymbols,
  computeDefinition,
  computeReferences,
  computeRename,
} from "../navigation";
import { canonicalize } from "../paths";
import type { ProjectIndex } from "../projectIndex";

const R = (sl: number, sc: number, el: number, ec: number) => ({
  startLine: sl,
  startCol: sc,
  endLine: el,
  endCol: ec,
});

const RNG = { startLine: 1, startCol: 9, endLine: 1, endCol: 12 };

describe("computeDocumentLinks (#132 step 3c)", () => {
  const rootPath = canonicalize("/proj/root.crl");
  const sibPath = "/proj/sib.crl";
  const source = ["# Root", 'library "Root".', 'include "Sib".', "", 'concept "X":'].join("\n");

  const mkIndex = (
    includes: { name: string; location: { start: { line: number } } }[],
    libs: { libraryName: string; filePath: string; nameRange: typeof RNG; range: typeof RNG }[],
  ) =>
    ({
      getGraph: () => ({
        resolvedLibraries: [{ filePath: rootPath, ast: { includes } }],
        localLibraries: [],
      }),
      getLibraries: () => libs,
    }) as unknown as ProjectIndex;

  it("produces a link for a resolved include, narrowed to the quoted name (off-by-one: 1-based→0-based)", () => {
    const idx = mkIndex(
      [{ name: "Sib", location: { start: { line: 3 } } }], // 1-based line 3 → 0-based line 2
      [{ libraryName: "Sib", filePath: sibPath, nameRange: RNG, range: RNG }],
    );
    expect(computeDocumentLinks("/proj/root.crl", source, idx)).toEqual([
      { range: { startLine: 2, startCol: 8, endLine: 2, endCol: 13 }, target: sibPath, tooltip: 'Open library "Sib"' },
    ]);
  });

  it("skips an include whose library is not resolved (absent from getLibraries)", () => {
    const idx = mkIndex([{ name: "Missing", location: { start: { line: 3 } } }], []);
    expect(computeDocumentLinks("/proj/root.crl", source, idx)).toEqual([]);
  });

  it("returns [] when there is no graph", () => {
    const idx = { getGraph: () => null } as unknown as ProjectIndex;
    expect(computeDocumentLinks("/proj/root.crl", source, idx)).toEqual([]);
  });

  it("tolerates an include line beyond the source (→ skipped, no throw)", () => {
    const idx = mkIndex(
      [{ name: "Sib", location: { start: { line: 999 } } }],
      [{ libraryName: "Sib", filePath: sibPath, nameRange: RNG, range: RNG }],
    );
    expect(computeDocumentLinks("/proj/root.crl", source, idx)).toEqual([]);
  });
});

describe("computeWorkspaceSymbols (#132 step 3c)", () => {
  const decls = [
    { name: "BMI", kind: "concept", libraryName: "Vitals", filePath: "/p/v.crl", nameRange: RNG },
    { name: "Sib Concept", kind: "concept", libraryName: "Sib", filePath: "/p/s.crl", nameRange: RNG },
  ];
  const idx = { getAllProjectDeclarations: () => decls } as unknown as ProjectIndex;

  it("empty roots → [] (no index call)", () => {
    expect(computeWorkspaceSymbols("BMI", [], idx)).toEqual([]);
  });

  it("filters by a case-insensitive substring query", () => {
    expect(computeWorkspaceSymbols("bmi", ["/p"], idx).map((s) => s.name)).toEqual(["BMI"]);
  });

  it("empty query returns all declarations", () => {
    expect(computeWorkspaceSymbols("", ["/p"], idx).map((s) => s.name)).toEqual(["BMI", "Sib Concept"]);
  });

  it("maps kind + containerName + location", () => {
    expect(computeWorkspaceSymbols("BMI", ["/p"], idx)[0]).toEqual({
      name: "BMI",
      kind: "variable",
      containerName: "Vitals",
      location: { filePath: "/p/v.crl", range: RNG },
    });
  });
});

// The flat oracle fixture can't resolve a sibling include, so it returns null/[] for the
// definition library/reference branches + cross-file rename. These fake-index tests drive
// findDeclarationAtPosition (which only reads getDeclarations/getLibraries/getReferences +
// inRange) to pin those branches precisely.
describe("computeDefinition / computeReferences / computeRename branches (#132 step 3c)", () => {
  const ROOT = canonicalize("/p/root.crl");
  const SIB = canonicalize("/p/sib.crl");
  const OTHER = canonicalize("/p/other.crl");

  it("definition: library branch → the library's location", () => {
    const lib = { libraryName: "Sib", filePath: ROOT, nameRange: R(0, 0, 0, 5), range: R(0, 0, 0, 5) };
    const idx = {
      getDeclarations: () => [],
      getLibraries: () => [lib],
      getReferences: () => [],
    } as unknown as ProjectIndex;
    expect(computeDefinition("/p/root.crl", { line: 0, character: 2 }, idx)).toEqual({
      filePath: ROOT,
      range: R(0, 0, 0, 5),
    });
  });

  it("definition: reference-name branch → the resolved declaration's location", () => {
    const ref = {
      filePath: ROOT,
      nameRange: R(0, 0, 0, 5),
      qualifierRange: null,
      targetLibrary: "Sib",
      targetName: "Sib Concept",
      targetKind: "concept",
    };
    const decl = { name: "Sib Concept", kind: "concept", libraryName: "Sib", filePath: SIB, nameRange: R(3, 8, 3, 21) };
    const idx = {
      getDeclarations: () => [],
      getLibraries: () => [],
      getReferences: () => [ref],
      findDeclarationByLibAndName: () => decl,
    } as unknown as ProjectIndex;
    expect(computeDefinition("/p/root.crl", { line: 0, character: 2 }, idx)).toEqual({
      filePath: SIB,
      range: R(3, 8, 3, 21),
    });
  });

  it("definition: reference-qualifier branch → the qualifier library's location", () => {
    const ref = {
      filePath: ROOT,
      nameRange: R(0, 10, 0, 20),
      qualifierRange: R(0, 0, 0, 5),
      targetLibrary: "Sib",
      targetName: "Sib Concept",
      targetKind: "concept",
    };
    const lib = { libraryName: "Sib", filePath: SIB, nameRange: R(1, 8, 1, 11), range: R(1, 0, 1, 15) };
    const idx = {
      getDeclarations: () => [],
      getLibraries: () => [lib], // filePath SIB ≠ ROOT → skipped by findDeclarationAtPosition's lib loop
      getReferences: () => [ref],
    } as unknown as ProjectIndex;
    expect(computeDefinition("/p/root.crl", { line: 0, character: 2 }, idx)).toEqual({
      filePath: SIB,
      range: R(1, 8, 1, 11),
    });
  });

  it("references: includeDeclaration puts the declaration first, then ref sites", () => {
    const ref = {
      filePath: ROOT,
      nameRange: R(0, 0, 0, 5),
      qualifierRange: null,
      targetLibrary: "Root",
      targetName: "BMI",
      targetKind: "concept",
    };
    const decl = { name: "BMI", kind: "concept", libraryName: "Root", filePath: ROOT, nameRange: R(7, 8, 7, 11) };
    const refSite = { filePath: OTHER, nameRange: R(2, 4, 2, 9) };
    const idx = {
      getDeclarations: () => [],
      getLibraries: () => [],
      getReferences: () => [ref],
      findDeclarationByLibAndName: () => decl,
      findRefsTo: () => [refSite],
    } as unknown as ProjectIndex;
    expect(computeReferences("/p/root.crl", { line: 0, character: 2 }, true, idx)).toEqual([
      { filePath: ROOT, range: R(7, 8, 7, 11) },
      { filePath: OTHER, range: R(2, 4, 2, 9) },
    ]);
  });

  describe("rename", () => {
    const declAtCursor = { name: "BMI", kind: "concept", libraryName: "Root", filePath: ROOT, nameRange: R(0, 0, 0, 5) };
    const refSite = { filePath: OTHER, nameRange: R(2, 4, 2, 9) };
    const mk = (extraDecls: unknown[] = []) =>
      ({
        getDeclarations: () => [declAtCursor, ...extraDecls],
        getLibraries: () => [],
        getReferences: () => [],
        findDeclarationByLibAndName: () => declAtCursor,
        findRefsTo: () => [refSite],
      }) as unknown as ProjectIndex;

    it("success: declaration edit FIRST, then ref-site edits (cross-file, in order)", () => {
      expect(computeRename("/p/root.crl", { line: 0, character: 2 }, "BMI2", mk())).toEqual([
        { filePath: ROOT, range: R(0, 0, 0, 5), newText: "BMI2" },
        { filePath: OTHER, range: R(2, 4, 2, 9), newText: "BMI2" },
      ]);
    });

    it("no-op (newName === current) → null", () => {
      expect(computeRename("/p/root.crl", { line: 0, character: 2 }, "BMI", mk())).toBeNull();
    });

    it("invalid name (contains a quote) → throws", () => {
      expect(() => computeRename("/p/root.crl", { line: 0, character: 2 }, 'Bad"Name', mk())).toThrow(
        "Invalid name: must not contain double quotes.",
      );
    });

    it("collision (same name+kind in the library) → throws the interpolated message", () => {
      const collide = { name: "BMI2", kind: "concept", libraryName: "Root", filePath: ROOT, nameRange: R(5, 0, 5, 4) };
      expect(() => computeRename("/p/root.crl", { line: 0, character: 2 }, "BMI2", mk([collide]))).toThrow(
        'Name "BMI2" already exists as a concept in library "Root".',
      );
    });

    it("unsupported target (library) → null", () => {
      const lib = { libraryName: "Root", filePath: ROOT, nameRange: R(0, 0, 0, 5), range: R(0, 0, 0, 5) };
      const idx = {
        getDeclarations: () => [],
        getLibraries: () => [lib],
        getReferences: () => [],
      } as unknown as ProjectIndex;
      expect(computeRename("/p/root.crl", { line: 0, character: 2 }, "X", idx)).toBeNull();
    });
  });
});
