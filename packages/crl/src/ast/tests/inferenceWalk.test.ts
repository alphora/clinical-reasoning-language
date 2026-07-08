import { describe, expect, it } from "@jest/globals";

import {
  flattenDefinedAsBody,
  walkInferenceOrder,
  type InferenceWalkHooks,
} from "../inferenceWalk";
import type {
  CompositionExpression,
  DefinedAsBareRef,
  DefinedAsComposition,
  Location,
  ReferenceName,
} from "../types";

/**
 * Unit tests for the neutral single-authority inference walk. The FHIR lane's behavioral contract is
 * covered by `fhir-emitter/tests/caseFeatureCollection.test.ts` (through the adapter); these cover the
 * walk's OWN surface — the pre-order/post-order hook sequence and the cross-lib observer — that the MV
 * concept-shape model (Todo 1b) builds a subtree on.
 */

const LOC: Location = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } };

const compRef = (name: string): CompositionExpression => ({
  type: "CompositionRef",
  ref: name,
  location: LOC,
});
const semOr = (...terms: CompositionExpression[]): CompositionExpression => ({
  type: "SemOrExpression",
  terms,
  location: LOC,
});
const semAnd = (...terms: CompositionExpression[]): CompositionExpression => ({
  type: "SemAndExpression",
  terms,
  location: LOC,
});
const semNot = (expression: CompositionExpression): CompositionExpression => ({
  type: "SemNotExpression",
  expression,
  location: LOC,
});
const group = (expression: CompositionExpression): CompositionExpression => ({
  type: "CompositionGroup",
  expression,
  location: LOC,
});
const composition = (expression: CompositionExpression): DefinedAsComposition => ({
  type: "DefinedAsComposition",
  expression,
  location: LOC,
});
const bare = (ref: ReferenceName): DefinedAsBareRef => ({
  type: "DefinedAsBareRef",
  ref,
  location: LOC,
});
const qual = (libraryName: string, name: string): ReferenceName => ({
  type: "QualifiedReference",
  libraryName,
  name,
  location: LOC,
});

const LIB = "Lib";

/** Build hooks over simple maps + record the enter/exit/crossLib events for assertion. */
function recordingHooks(
  codeByName: Record<string, string>,
  operandsByName: Record<string, ReferenceName[]>,
): { hooks: InferenceWalkHooks; events: string[] } {
  const events: string[] = [];
  const hooks: InferenceWalkHooks = {
    codeOf: (name) => codeByName[name],
    operandsOf: (name) => operandsByName[name] ?? [],
    onEnter: (name, code) => events.push(`enter:${name}:${code ?? "-"}`),
    onExit: (name, code) => events.push(`exit:${name}:${code ?? "-"}`),
    onCrossLib: (ref) => events.push(`xlib:${typeof ref === "string" ? ref : ref.name}`),
  };
  return { hooks, events };
}

describe("flattenDefinedAsBody", () => {
  it("bare ref → [ref]", () => {
    expect(flattenDefinedAsBody(bare("A"))).toEqual(["A"]);
  });

  it("flattens nested sem-or/sem-and/sem-not/group positionally, left-to-right", () => {
    // (A And (not B)) Or (C)  → [A, B, C] in written order; operators are transparent to leaf order.
    const body = composition(
      semOr(group(semAnd(compRef("A"), semNot(compRef("B")))), group(compRef("C"))),
    );
    expect(flattenDefinedAsBody(body)).toEqual(["A", "B", "C"]);
  });

  it("preserves duplicate refs (dedup is the walk's job, not the flattener's)", () => {
    expect(flattenDefinedAsBody(composition(semOr(compRef("A"), compRef("A"))))).toEqual([
      "A",
      "A",
    ]);
  });
});

describe("walkInferenceOrder", () => {
  it("pre-order enter (own code first) then post-order exit — nested (A And B) sem-or C", () => {
    const { hooks, events } = recordingHooks(
      { A: "a", B: "b", C: "c" },
      { Top: [/* A And B */ "A And B", "C"], "A And B": ["A", "B"] },
    );
    walkInferenceOrder("Top", LIB, hooks);
    expect(events).toEqual([
      "enter:Top:-",
      "enter:A And B:-",
      "enter:A:a",
      "exit:A:a",
      "enter:B:b",
      "exit:B:b",
      "exit:A And B:-",
      "enter:C:c",
      "exit:C:c",
      "exit:Top:-",
    ]);
  });

  it("both-rep root enters with its own code BEFORE its operands", () => {
    const { hooks, events } = recordingHooks(
      { C: "c", Estrogen: "e1", Estradiol: "e2" },
      { C: ["Estrogen", "Estradiol"] },
    );
    walkInferenceOrder("C", LIB, hooks);
    expect(events.filter((e) => e.startsWith("enter"))).toEqual([
      "enter:C:c",
      "enter:Estrogen:e1",
      "enter:Estradiol:e2",
    ]);
  });

  it("observes a cross-library operand via onCrossLib and does NOT recurse it", () => {
    const { hooks, events } = recordingHooks({ B: "b" }, { Top: [qual("OtherLib", "A"), "B"] });
    walkInferenceOrder("Top", LIB, hooks);
    expect(events).toEqual(["enter:Top:-", "xlib:A", "enter:B:b", "exit:B:b", "exit:Top:-"]);
  });

  it('normalizes a self-qualified operand (Lib."X" inside Lib) to bare and recurses it', () => {
    const { hooks, events } = recordingHooks({ X: "x" }, { Top: [qual(LIB, "X")] });
    walkInferenceOrder("Top", LIB, hooks);
    expect(events).toEqual(["enter:Top:-", "enter:X:x", "exit:X:x", "exit:Top:-"]);
  });

  it("a cross-library ROOT contributes nothing but is observed", () => {
    const { hooks, events } = recordingHooks({}, {});
    walkInferenceOrder(qual("OtherLib", "Top"), LIB, hooks);
    expect(events).toEqual(["xlib:Top"]);
  });

  it("2-cycle terminates and enters each name exactly once (A defined as B, B defined as A)", () => {
    const { hooks, events } = recordingHooks({}, { A: ["B"], B: ["A"] });
    walkInferenceOrder("A", LIB, hooks);
    expect(events).toEqual(["enter:A:-", "enter:B:-", "exit:B:-", "exit:A:-"]);
  });

  it("diamond enters the shared node once (Top = (A And B) sem-or A, A shared)", () => {
    const { hooks, events } = recordingHooks(
      { A: "a", B: "b" },
      { Top: ["A And B", "A"], "A And B": ["A", "B"] },
    );
    walkInferenceOrder("Top", LIB, hooks);
    // A is reached via `A And B` first; the later direct `A` operand is memoized out (entered once).
    expect(events.filter((e) => e.startsWith("enter"))).toEqual([
      "enter:Top:-",
      "enter:A And B:-",
      "enter:A:a",
      "enter:B:b",
    ]);
  });

  it("diamond — a shared INTERMEDIATE with its own child subtree is entered AND exited once; the second path is fully skipped", () => {
    const { hooks, events } = recordingHooks(
      { Leaf: "l" },
      { Top: ["P", "Q"], P: ["Shared"], Q: ["Shared"], Shared: ["Leaf"] },
    );
    walkInferenceOrder("Top", LIB, hooks);
    // Q's operand `Shared` is memoized out — no re-enter, and crucially NO second `exit:Shared` / `exit:Leaf`
    // (the invariant a stack-based 1b subtree build depends on).
    expect(events).toEqual([
      "enter:Top:-",
      "enter:P:-",
      "enter:Shared:-",
      "enter:Leaf:l",
      "exit:Leaf:l",
      "exit:Shared:-",
      "exit:P:-",
      "enter:Q:-",
      "exit:Q:-",
      "exit:Top:-",
    ]);
  });

  it("a root with no code and no operands → balanced enter/exit, nothing else", () => {
    const { hooks, events } = recordingHooks({}, {});
    walkInferenceOrder("Solo", LIB, hooks);
    expect(events).toEqual(["enter:Solo:-", "exit:Solo:-"]);
  });
});
