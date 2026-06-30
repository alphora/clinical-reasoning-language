import { describe, expect, it } from "@jest/globals";

import type {
  CompositionExpression,
  Concept,
  ConceptDefinition,
  Location,
  ReferenceName,
} from "../../ast/types";
import { collectCodeIsConceptsInInferenceOrder } from "../caseFeatureCollection";

/**
 * Unit tests for the recursive `code is` collection in INFERENCE ORDER — the core
 * of the truth-set case-feature FHIR lane.
 */

const LOC: Location = {
  start: { line: 1, column: 0 },
  end: { line: 1, column: 0 },
};

function bareRef(name: string): ReferenceName {
  return name;
}

function compRef(name: string): CompositionExpression {
  return { type: "CompositionRef", ref: name, location: LOC };
}

function semOr(...terms: CompositionExpression[]): CompositionExpression {
  return { type: "SemOrExpression", terms, location: LOC };
}

function semAnd(...terms: CompositionExpression[]): CompositionExpression {
  return { type: "SemAndExpression", terms, location: LOC };
}

/** A concept carrying a `defined as` composition body. */
function definedAs(name: string, expr: CompositionExpression): Concept {
  const definition: ConceptDefinition = {
    type: "DefinedAsDefinition",
    body: { type: "DefinedAsComposition", expression: expr, location: LOC },
    location: LOC,
  };
  return { type: "Concept", name, valueTypes: [], representations: [], definition, location: LOC };
}

/** A concept carrying a bare-ref `defined as` body. */
function definedAsBare(name: string, ref: string): Concept {
  const definition: ConceptDefinition = {
    type: "DefinedAsDefinition",
    body: { type: "DefinedAsBareRef", ref, location: LOC },
    location: LOC,
  };
  return { type: "Concept", name, valueTypes: [], representations: [], definition, location: LOC };
}

const LIB = "Lib";

describe("collectCodeIsConceptsInInferenceOrder", () => {
  it("V1 direct — a condition with its OWN code, no defined as → [self]", () => {
    const codeByConcept = new Map([["Qualifying Diagnosis", "qualifying-diagnosis"]]);
    const out = collectCodeIsConceptsInInferenceOrder(
      bareRef("Qualifying Diagnosis"),
      LIB,
      new Map(),
      codeByConcept,
    );
    expect(out).toEqual([{ name: "Qualifying Diagnosis", code: "qualifying-diagnosis" }]);
  });

  it("sem-and — `A And B` (no code) over two leaves → [A, B] left-to-right", () => {
    const definedAsByName = new Map([["A And B", definedAs("A And B", semAnd(compRef("A"), compRef("B")))]]);
    const codeByConcept = new Map([
      ["A", "a"],
      ["B", "b"],
    ]);
    const out = collectCodeIsConceptsInInferenceOrder(bareRef("A And B"), LIB, definedAsByName, codeByConcept);
    expect(out.map((c) => c.name)).toEqual(["A", "B"]);
  });

  it("nested — `Top` = (A And B) sem-or C; intermediates without code are walked through → [A, B, C]", () => {
    const definedAsByName = new Map([
      ["Top", definedAs("Top", semOr(compRef("A And B"), compRef("C")))],
      ["A And B", definedAs("A And B", semAnd(compRef("A"), compRef("B")))],
    ]);
    const codeByConcept = new Map([
      ["A", "a"],
      ["B", "b"],
      ["C", "c"],
    ]);
    const out = collectCodeIsConceptsInInferenceOrder(bareRef("Top"), LIB, definedAsByName, codeByConcept);
    expect(out.map((c) => c.name)).toEqual(["A", "B", "C"]);
  });

  it("both-rep — a condition with BOTH code is AND defined as → [self, then operands] (self FIRST)", () => {
    const bothRep = definedAs("C", semOr(compRef("Estrogen"), compRef("Estradiol")));
    const definedAsByName = new Map([["C", bothRep]]);
    const codeByConcept = new Map([
      ["C", "c"],
      ["Estrogen", "a"],
      ["Estradiol", "b"],
    ]);
    const out = collectCodeIsConceptsInInferenceOrder(bareRef("C"), LIB, definedAsByName, codeByConcept);
    expect(out.map((c) => c.name)).toEqual(["C", "Estrogen", "Estradiol"]);
  });

  it("dedup by name within a condition — a leaf referenced via two operands appears ONCE", () => {
    const definedAsByName = new Map([["Top", definedAs("Top", semOr(compRef("A"), compRef("A")))]]);
    const codeByConcept = new Map([["A", "a"]]);
    const out = collectCodeIsConceptsInInferenceOrder(bareRef("Top"), LIB, definedAsByName, codeByConcept);
    expect(out.map((c) => c.name)).toEqual(["A"]);
  });

  it("cycle guard — `A defined as B`, `B defined as A` terminates (no infinite recursion)", () => {
    const definedAsByName = new Map([
      ["A", definedAsBare("A", "B")],
      ["B", definedAsBare("B", "A")],
    ]);
    // Neither has a code → empty result, but crucially the call RETURNS.
    const out = collectCodeIsConceptsInInferenceOrder(bareRef("A"), LIB, definedAsByName, new Map());
    expect(out).toEqual([]);
  });

  it("self-recursive `A defined as A` with a code → [A] once (cycle guard + dedup)", () => {
    const definedAsByName = new Map([["A", definedAsBare("A", "A")]]);
    const out = collectCodeIsConceptsInInferenceOrder(
      bareRef("A"),
      LIB,
      definedAsByName,
      new Map([["A", "a"]]),
    );
    expect(out).toEqual([{ name: "A", code: "a" }]);
  });

  it("cross-library operand ref is SKIPPED (unsupported in v0)", () => {
    // `Top` (no code) = OtherLib."A" sem-or B. The foreign operand is skipped; the
    // same-library B is collected.
    const foreign: ReferenceName = { type: "QualifiedReference", libraryName: "OtherLib", name: "A", location: LOC };
    const definedAsByName = new Map([
      [
        "Top",
        definedAs("Top", semOr({ type: "CompositionRef", ref: foreign, location: LOC }, compRef("B"))),
      ],
    ]);
    const codeByConcept = new Map([
      ["A", "a"],
      ["B", "b"],
    ]);
    const out = collectCodeIsConceptsInInferenceOrder(bareRef("Top"), LIB, definedAsByName, codeByConcept);
    expect(out.map((c) => c.name)).toEqual(["B"]);
  });

  it("self-qualified condition ref (`Lib.\"C\"` inside Lib) is normalized and collected", () => {
    const selfQual: ReferenceName = { type: "QualifiedReference", libraryName: LIB, name: "C", location: LOC };
    const out = collectCodeIsConceptsInInferenceOrder(selfQual, LIB, new Map(), new Map([["C", "c"]]));
    expect(out).toEqual([{ name: "C", code: "c" }]);
  });
});
