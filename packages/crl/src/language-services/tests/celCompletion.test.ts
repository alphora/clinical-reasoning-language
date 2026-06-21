// Unit tests for headless CEL completion (#4 slice 1): the slot detector + the compute fn over a fake
// index. The extension's golden oracle proves byte-for-byte adapter behavior; these cover the branches.
import { detectCelSlot } from "../celContextDetect";
import { computeCelCompletion, celDocContext, celDocContextFromSource, type CelDocContext } from "../celCompletion";
import type { IndexedDeclaration, IndexedLibrary, ProjectIndex } from "../projectIndex";
import { buildCEL } from "../../cel";

describe("detectCelSlot (#4)", () => {
  it("covers / include → library", () => {
    expect(detectCelSlot('covers "')).toEqual({ kind: "library" });
    expect(detectCelSlot('include "')).toEqual({ kind: "library" });
  });
  it("subject / encounter / fact is → fact", () => {
    for (const k of ["subject", "encounter", "fact"]) expect(detectCelSlot(`- ${k} is "`)).toEqual({ kind: "fact" });
  });
  it("defined by bare → fhir-type; qualified → concept-or-activity (captures the library)", () => {
    expect(detectCelSlot('- defined by "')).toEqual({ kind: "fhir-type" });
    expect(detectCelSlot('- defined by "Lib"."')).toEqual({ kind: "concept-or-activity", library: "Lib" });
  });
  it("result: leaf slot; quoted value → result-arm; bare value → result-bool", () => {
    expect(detectCelSlot('- result is "')).toEqual({ kind: "leaf" });
    expect(detectCelSlot('- result is "Coverage" is "')).toEqual({ kind: "result-arm", leaf: "Coverage" });
    expect(detectCelSlot('- result is "IsBool" is ')).toEqual({ kind: "result-bool" });
    expect(detectCelSlot('- result is "IsBool" is fa')).toEqual({ kind: "result-bool" }); // partial bare word
  });
  it("cross-resource operands → fact (both `- \"src\"` and after the relation)", () => {
    expect(detectCelSlot('- "')).toEqual({ kind: "fact" });
    expect(detectCelSlot('- "fA" based on "')).toEqual({ kind: "fact" });
  });
  it("literal / free-text slots → null (no completion)", () => {
    expect(detectCelSlot('- name is "')).toBeNull();
    expect(detectCelSlot('- code is "')).toBeNull();
    expect(detectCelSlot('- date is "')).toBeNull();
  });
  it("a closed quote (cursor past it) → null", () => {
    expect(detectCelSlot('- subject is "fA"')).toBeNull();
  });
});

const decls = [
  { name: "Coverage", kind: "decision", libraryName: "Lib", arms: ["Approve", "Deny"] },
  { name: "Nonunion", kind: "concept", libraryName: "Lib" },
  { name: "IsEligible", kind: "concept", libraryName: "Lib" },
  { name: "SomeActivity", kind: "activity", libraryName: "Lib" },
  { name: "Other", kind: "concept", libraryName: "OtherLib" },
] as unknown as IndexedDeclaration[];
const libs = [{ libraryName: "Lib" }, { libraryName: "OtherLib" }] as unknown as IndexedLibrary[];
const index = {
  getAllProjectDeclarations: () => decls,
  getAllProjectLibraries: () => libs,
} as unknown as ProjectIndex;
const doc: CelDocContext = { facts: ["fA", "fB"], coveredLib: "Lib" };
const TYPES = ["Condition", "Observation"];

describe("computeCelCompletion (#4)", () => {
  const labels = (prefix: string, d: CelDocContext = doc) =>
    computeCelCompletion(prefix, d, index, ["/proj"], TYPES).map((i) => i.label);

  it("fact slot → file-local facts", () => expect(labels('- subject is "')).toEqual(["fA", "fB"]));
  it("cross-resource operand slot → file-local facts", () => expect(labels('- "')).toEqual(["fA", "fB"]));
  it("fhir-type slot → conceptTypes", () => expect(labels('- defined by "')).toEqual(["Condition", "Observation"]));
  it("library slot → unique project libraries", () => expect(labels('covers "')).toEqual(["Lib", "OtherLib"]));
  it("qualified defined by → the library's concepts + activities", () =>
    expect(labels('- defined by "Lib"."')).toEqual(["IsEligible", "Nonunion", "SomeActivity"]));
  it("leaf slot → covered library's decisions + concepts", () =>
    expect(labels('- result is "')).toEqual(["Coverage", "IsEligible", "Nonunion"]));
  it("result-arm (quoted) for a decision → its arms", () =>
    expect(labels('- result is "Coverage" is "')).toEqual(["Approve", "Deny"]));
  it("result-arm (quoted) for a concept → [] (a quoted value is only valid for a decision branch)", () =>
    expect(labels('- result is "Nonunion" is "')).toEqual([]));
  it("result-bool (bare value) → true/false", () =>
    expect(labels('- result is "Nonunion" is ')).toEqual(["true", "false"]));
  it("result-arm: a local concept shadows a same-named package decision → [] (resolver precedence)", () => {
    const collide = [
      { name: "X", kind: "concept", libraryName: "Lib", origin: "local" },
      { name: "X", kind: "decision", libraryName: "Lib", origin: "package", arms: ["A", "B"] },
    ] as unknown as IndexedDeclaration[];
    const idx2 = {
      getAllProjectDeclarations: () => collide,
      getAllProjectLibraries: () => [],
    } as unknown as ProjectIndex;
    const out = computeCelCompletion('- result is "X" is "', { facts: [], coveredLib: "Lib" }, idx2, ["/p"], []);
    expect(out.map((i) => i.label)).toEqual([]);
  });
  it("non-slot → []", () => expect(labels('- name is "')).toEqual([]));
  it("leaf/result degrade to [] when covers is unresolved", () =>
    expect(labels('- result is "', { facts: [] })).toEqual([]));
  it("completion item carries kind + detail", () => {
    const items = computeCelCompletion('- subject is "', doc, index, ["/proj"], TYPES);
    expect(items[0]).toEqual({ label: "fA", kind: "variable", detail: "fact" });
  });
});

describe("celDocContext (#4)", () => {
  it("extracts file-local facts + the covered library from a parsed CEL", () => {
    const built = buildCEL(
      '# C\nlibrary "C".\ncovers "Lib".\nfact "fA":\n- defined by "Patient".\ncase "c1":\n- subject is "fA".\n- result is "D" is "Approve".',
    );
    expect(built.success).toBe(true);
    expect(celDocContext(built.result)).toEqual({ facts: ["fA"], coveredLib: "Lib" });
  });

  it("celDocContextFromSource tolerates a mid-edit unterminated quote (the trigger char just typed)", () => {
    // buildCEL would FAIL on this buffer (open quote on the last line); the regex extractor survives.
    const src = '# C\nlibrary "C".\ncovers "Lib".\nfact "fA":\n- defined by "Patient".\nfact "fB":\n- defined by "Patient".\ncase "c1":\n- subject is "';
    expect(celDocContextFromSource(src)).toEqual({ facts: ["fA", "fB"], coveredLib: "Lib" });
  });

  it("celDocContextFromSource ignores covers/fact inside block comments + backtick strings", () => {
    const src = [
      "# C",
      "/*",
      'covers "WrongFromComment".',
      'fact "ghostFromComment":',
      "*/",
      'covers "Right".',
      'case "c1":',
      "- description is `",
      'covers "WrongFromBacktick".',
      'fact "ghostFromBacktick":',
      "`.",
      'fact "realFact":',
      '- defined by "Patient".',
    ].join("\n");
    expect(celDocContextFromSource(src)).toEqual({ facts: ["realFact"], coveredLib: "Right" });
  });
});
