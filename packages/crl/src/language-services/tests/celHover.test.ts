// Unit tests for headless CEL hover (#4 slice 2): resolve the quoted token under the cursor per slot.
import { computeCelHover, celHoverContext, type CelHoverContext } from "../celHover";
import type { IndexedDeclaration, ProjectIndex } from "../projectIndex";
import { buildCEL } from "../../cel";

const decls = [
  { name: "Coverage", kind: "decision", libraryName: "Lib", origin: "local", filePath: "/p/lib.crl", line: 10, arms: ["Approve", "Deny"] },
  { name: "Nonunion", kind: "concept", libraryName: "Lib", origin: "local", type: "Condition", filePath: "/p/lib.crl", line: 2 },
  { name: "Approve", kind: "activity", libraryName: "Lib", origin: "local", filePath: "/p/lib.crl", line: 5 },
] as unknown as IndexedDeclaration[];
const index = { getAllProjectDeclarations: () => decls } as unknown as ProjectIndex;
const ctx: CelHoverContext = { coveredLib: "Lib", facts: [{ name: "fA", conceptRef: "Patient" }] };

// Hover with the cursor just inside the opening quote of `tokenQuoted` (e.g. '"fA"') on the line.
const md = (line: string, tokenQuoted: string, c: CelHoverContext = ctx) => {
  const col = line.indexOf(tokenQuoted) + 1;
  return computeCelHover(line, { line: 0, character: col }, c, index, ["/p"])?.markdown ?? null;
};

describe("computeCelHover (#4)", () => {
  it("fact ref → the fact + its defined-by", () =>
    expect(md('- subject is "fA".', '"fA"')).toBe("**fA** — fact\n\nDefined by `Patient`."));
  it("result leaf → the covered library's decision declaration", () =>
    expect(md('- result is "Coverage".', '"Coverage"')).toBe(
      "**Coverage** — decision\n\nLibrary: `Lib`\n\nDeclared at `/p/lib.crl`:11.",
    ));
  it("qualified defined-by → the library's concept declaration (cursor on the concept)", () =>
    expect(md('- defined by "Lib"."Nonunion".', '"Nonunion"')).toBe(
      "**Nonunion** — concept\n\nLibrary: `Lib`\n\nType: `Condition`\n\nDeclared at `/p/lib.crl`:3.",
    ));
  it("result arm → the targeted activity declaration", () =>
    expect(md('- result is "Coverage" is "Approve".', '"Approve"')).toBe(
      "**Approve** — activity\n\nLibrary: `Lib`\n\nDeclared at `/p/lib.crl`:6.",
    ));
  it("bare defined-by → a FHIR resource type label", () =>
    expect(md('- defined by "Patient".', '"Patient"')).toBe("**Patient** — FHIR resource type"));
  it("the QUALIFIER of a qualified defined-by → a library label (not a FHIR type)", () =>
    expect(md('- defined by "Lib"."Nonunion".', '"Lib"')).toBe("**Lib** — CRL library"));
  it("covers → a library label", () => expect(md('covers "Lib".', '"Lib"')).toBe("**Lib** — CRL library"));
  it("unknown fact / unresolved symbol → null", () => {
    expect(md('- subject is "ghost".', '"ghost"')).toBeNull();
    expect(md('- result is "Missing".', '"Missing"')).toBeNull();
  });
  it("cursor off any quoted token → null", () =>
    expect(computeCelHover('- subject is "fA".', { line: 0, character: 2 }, ctx, index, ["/p"])).toBeNull());
  it("leaf/result hover with no covered library → null", () =>
    expect(computeCelHover('- result is "Coverage".', { line: 0, character: 14 }, { facts: [] }, index, ["/p"])).toBeNull());
  it("cross-resource `based on` tokens are not yet a hover slot (deferred) → null", () =>
    expect(md('- "fA" based on "fB".', '"fA"')).toBeNull());
});

describe("celHoverContext (#4)", () => {
  it("extracts facts with their defined-by + the covered library", () => {
    const built = buildCEL(
      '# C\nlibrary "C".\ncovers "Lib".\nfact "fA":\n- defined by "Patient".\nfact "fB":\n- defined by "Lib"."Nonunion".\ncase "c1":\n- subject is "fA".\n- result is "D" is "A".',
    );
    expect(built.success).toBe(true);
    expect(celHoverContext(built.result)).toEqual({
      coveredLib: "Lib",
      facts: [
        { name: "fA", conceptRef: "Patient" },
        { name: "fB", conceptRef: "Lib.Nonunion" }, // qualifier retained
      ],
    });
  });
});
