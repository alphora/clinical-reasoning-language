// Tests for resolveDefinedByTarget (#156 C2c-2) — the shared `defined by` target resolver. A fact becomes a cockpit
// cross-pane reveal anchor ONLY when this returns a kind:"concept" target, so the bare/activity/unresolved cases (all
// → undefined or non-concept) are the load-bearing ones.
import type { ReferenceName, Statement } from "../../ast/types";
import type { RegistryEntry } from "../../imports/types";
import { resolveDefinedByTarget } from "../definedByResolve";
import type { ResolvedCelGraph } from "../imports/types";

const LOC = { line: 1, column: 1, offset: 0 } as never;
const qual = (libraryName: string, name: string): ReferenceName =>
  ({ type: "QualifiedReference", libraryName, name, location: LOC }) as ReferenceName;
const decl = (type: "Concept" | "Activity", name: string): Statement =>
  ({ type, name, location: LOC }) as unknown as Statement;

function graphWith(libName: string, stmts: Statement[]): ResolvedCelGraph {
  const entry = {
    name: libName,
    filePath: `${libName}.crl`,
    ast: { statements: stmts },
    isRoot: false,
    origin: "package",
  } as unknown as RegistryEntry;
  return {
    filePath: "x.cel",
    crlRegistry: { byNameLocal: new Map([[libName, entry]]), byNamePackage: new Map() },
    celParseErrors: [],
    diagnostics: [],
  } as unknown as ResolvedCelGraph;
}

describe("resolveDefinedByTarget (C2c-2)", () => {
  const graph = graphWith("Lib", [decl("Concept", "Diabetes"), decl("Activity", "Approve")]);

  it("a qualified ref to a Concept → {lib,name,kind:'concept'}", () => {
    expect(resolveDefinedByTarget(qual("Lib", "Diabetes"), graph)).toEqual({
      lib: "Lib",
      name: "Diabetes",
      kind: "concept",
    });
  });

  it("a qualified ref to an Activity → kind:'activity' (NOT a concept reveal anchor)", () => {
    expect(resolveDefinedByTarget(qual("Lib", "Approve"), graph)).toEqual({
      lib: "Lib",
      name: "Approve",
      kind: "activity",
    });
  });

  it("a BARE ref (FHIR type) → undefined (no concept/activity identity)", () => {
    expect(resolveDefinedByTarget("Condition" as ReferenceName, graph)).toBeUndefined();
  });

  it("cross-kind same-name: FIRST declaration wins (mirrors the validator) — activity-before-concept → activity", () => {
    // Documented limitation: a fact `defined by "Lib"."Z"` resolves to whichever of Concept/Activity is declared first.
    // If an Activity "Z" precedes a Concept "Z", the fact is treated as activity-target → NOT a concept reveal anchor,
    // even though `when "Lib"."Z"` keys to the concept. (Slot-aware resolution is out of scope for C2c-2.)
    const g = graphWith("Lib", [decl("Activity", "Z"), decl("Concept", "Z")]);
    expect(resolveDefinedByTarget(qual("Lib", "Z"), g)).toEqual({
      lib: "Lib",
      name: "Z",
      kind: "activity",
    });
  });

  it("a qualified ref to an unknown library → undefined", () => {
    expect(resolveDefinedByTarget(qual("Missing", "Diabetes"), graph)).toBeUndefined();
  });

  it("a qualified ref to a name with no Concept/Activity declaration → undefined", () => {
    expect(resolveDefinedByTarget(qual("Lib", "Nope"), graph)).toBeUndefined();
  });

  it("no crlRegistry (project closure unresolved) → undefined", () => {
    const bare = {
      filePath: "x.cel",
      celParseErrors: [],
      diagnostics: [],
    } as unknown as ResolvedCelGraph;
    expect(resolveDefinedByTarget(qual("Lib", "Diabetes"), bare)).toBeUndefined();
  });

  it("resolves against byNamePackage too (not only byNameLocal)", () => {
    const entry = {
      name: "Pkg",
      filePath: "Pkg.crl",
      ast: { statements: [decl("Concept", "Anemia")] },
      isRoot: false,
      origin: "package",
    } as unknown as RegistryEntry;
    const g = {
      filePath: "x.cel",
      crlRegistry: { byNameLocal: new Map(), byNamePackage: new Map([["Pkg", entry]]) },
      celParseErrors: [],
      diagnostics: [],
    } as unknown as ResolvedCelGraph;
    expect(resolveDefinedByTarget(qual("Pkg", "Anemia"), g)).toEqual({
      lib: "Pkg",
      name: "Anemia",
      kind: "concept",
    });
  });
});
