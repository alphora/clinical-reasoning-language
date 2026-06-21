// Unit tests for headless CEL navigation (#4 slice 3): go-to-definition + file-local fact references.
import { computeCelDefinition, computeCelReferences, celNavContext, type CelNavContext } from "../celNavigation";
import type { IndexedDeclaration, IndexedLibrary, ProjectIndex } from "../projectIndex";
import { buildCEL } from "../../cel";

const R = (sl: number, sc: number, ec: number) => ({ startLine: sl, startCol: sc, endLine: sl, endCol: ec });
const decls = [
  { name: "Coverage", kind: "decision", libraryName: "Lib", origin: "local", filePath: "/p/lib.crl", nameRange: R(10, 9, 17) },
  { name: "Nonunion", kind: "concept", libraryName: "Lib", origin: "local", filePath: "/p/lib.crl", nameRange: R(2, 8, 16) },
  { name: "Approve", kind: "activity", libraryName: "Lib", origin: "local", filePath: "/p/lib.crl", nameRange: R(5, 9, 16) },
] as unknown as IndexedDeclaration[];
const libs = [{ libraryName: "Lib", filePath: "/p/lib.crl", nameRange: R(1, 8, 11) }] as unknown as IndexedLibrary[];
const index = { getAllProjectDeclarations: () => decls, getAllProjectLibraries: () => libs } as unknown as ProjectIndex;
const ctx: CelNavContext = { coveredLib: "Lib", factDecls: [{ name: "fA", range: R(3, 0, 9) }] };
const CEL = "/p/cases.cel";

const def = (line: string, tokenQuoted: string, c: CelNavContext = ctx) =>
  computeCelDefinition(line, { line: 0, character: line.indexOf(tokenQuoted) + 1 }, CEL, c, index, ["/p"]);

describe("computeCelDefinition (#4)", () => {
  it("fact ref → the file-local fact declaration", () =>
    expect(def('- subject is "fA".', '"fA"')).toEqual({ filePath: CEL, range: R(3, 0, 9) }));
  it("result leaf → the covered library's decision (nameRange)", () =>
    expect(def('- result is "Coverage".', '"Coverage"')).toEqual({ filePath: "/p/lib.crl", range: R(10, 9, 17) }));
  it("qualified defined-by → the concept (nameRange)", () =>
    expect(def('- defined by "Lib"."Nonunion".', '"Nonunion"')).toEqual({ filePath: "/p/lib.crl", range: R(2, 8, 16) }));
  it("result arm → the activity (nameRange)", () =>
    expect(def('- result is "Coverage" is "Approve".', '"Approve"')).toEqual({ filePath: "/p/lib.crl", range: R(5, 9, 16) }));
  it("covers → the library (nameRange)", () =>
    expect(def('covers "Lib".', '"Lib"')).toEqual({ filePath: "/p/lib.crl", range: R(1, 8, 11) }));
  it("the qualifier of a qualified defined-by → the library", () =>
    expect(def('- defined by "Lib"."Nonunion".', '"Lib"')).toEqual({ filePath: "/p/lib.crl", range: R(1, 8, 11) }));
  it("bare defined-by (a FHIR type) → null", () => expect(def('- defined by "Patient".', '"Patient"')).toBeNull());
  it("cross-resource operand → the file-local fact declaration", () =>
    expect(def('- "fA" based on "fB".', '"fA"')).toEqual({ filePath: CEL, range: R(3, 0, 9) }));
  it("unresolved ref → null", () => expect(def('- result is "Missing".', '"Missing"')).toBeNull());
  it("leaf with no covered library → null", () =>
    expect(computeCelDefinition('- result is "Coverage".', { line: 0, character: 14 }, CEL, { factDecls: [] }, index, ["/p"])).toBeNull());
});

describe("computeCelReferences (#4)", () => {
  const SRC = [
    "# C", // 0
    'library "C".', // 1
    'covers "Lib".', // 2
    'fact "fA":', // 3  ← decl
    '- defined by "Patient".', // 4
    'case "c1":', // 5
    '- subject is "fA".', // 6  ← use
    '- "fA" based on "fB".', // 7  ← cross-resource use (fA = 1st operand)
    'case "c2":', // 8
    '- subject is "fB".', // 9  (fB)
    '- fact is "fA".', // 10  ← use
  ].join("\n");

  it("a fact use → its decl + every file-local use (incl. cross-resource)", () => {
    const refs = computeCelReferences('- subject is "fA".', { line: 0, character: 15 }, SRC, CEL);
    expect(refs.map((r) => r.range.startLine).sort((a, b) => a - b)).toEqual([3, 6, 7, 10]);
    expect(refs.every((r) => r.filePath === CEL)).toBe(true);
  });
  it("the fact decl line → the same occurrences", () => {
    const refs = computeCelReferences('fact "fA":', { line: 0, character: 6 }, SRC, CEL);
    expect(refs.map((r) => r.range.startLine).sort((a, b) => a - b)).toEqual([3, 6, 7, 10]);
  });
  it("a cross-resource operand → all occurrences of that fact", () => {
    const refs = computeCelReferences('- "fA" based on "fB".', { line: 0, character: 4 }, SRC, CEL);
    expect(refs.map((r) => r.range.startLine).sort((a, b) => a - b)).toEqual([3, 6, 7, 10]);
  });
  it("cursor not on a fact token → []", () =>
    expect(computeCelReferences('- result is "X".', { line: 0, character: 14 }, SRC, CEL)).toEqual([]));

  it("a named anchor colliding with a fact name is NOT mis-reported as a fact reference", () => {
    const src = [
      "# C", // 0
      'library "C".', // 1
      'covers "Lib".', // 2
      'fact "admission":', // 3  ← real fact decl
      '- defined by "Encounter".', // 4
      'fact "Reading":', // 5
      '- defined by "Observation".', // 6
      'case "c1":', // 7
      '- anchor "admission" is now.', // 8  ← named-anchor decl (NOT a fact-bearing line)
      '- fact is "Reading" at "admission".', // 9  ← "admission" is the ANCHOR, not a fact
      '- subject is "admission".', // 10 ← a real fact use
    ].join("\n");
    const refs = computeCelReferences('fact "admission":', { line: 0, character: 6 }, src, CEL);
    expect(refs.map((r) => r.range.startLine).sort((a, b) => a - b)).toEqual([3, 10]); // anchor uses (8,9) excluded
  });
});

describe("celNavContext (#4)", () => {
  it("extracts fact declarations (name + range) + the covered library", () => {
    const built = buildCEL('# C\nlibrary "C".\ncovers "Lib".\nfact "fA":\n- defined by "Patient".\ncase "c1":\n- subject is "fA".\n- result is "D" is "A".');
    expect(built.success).toBe(true);
    const c = celNavContext(built.result);
    expect(c.coveredLib).toBe("Lib");
    expect(c.factDecls.map((f) => f.name)).toEqual(["fA"]);
    expect(c.factDecls[0].range.startLine).toBe(3); // `fact "fA":` on 0-based line 3
  });
});
