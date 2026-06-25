// Tests for buildConceptContainment (#166 Slice 2) — transitive closures of the concept definition graph, cycle-guarded
// + self-excluded + first-discovery order, in BOTH directions (containersOf = up/ancestors, containedBy = down/descendants).
import { buildConceptContainment } from "../conceptContainment";
import type { CrlConceptNode } from "../crlConceptLayer";

const node = (key: string, defs: string[] = []): CrlConceptNode => ({
  nodeKey: key,
  name: key,
  lib: "T",
  label: key,
  location: { filePath: "x", range: { startLine: 0, startCol: 0, endLine: 0, endCol: 0 } },
  hasLocalCode: false,
  hasRepresentations: false,
  definitionRefs: defs,
});

describe("buildConceptContainment (#166 Slice 2)", () => {
  it("transitive: A defined-as B, B defined-as C → containedBy(A)=[B,C], containersOf(C)=[B,A] (first-discovery order)", () => {
    const { containersOf, containedBy } = buildConceptContainment([node("A", ["B"]), node("B", ["C"]), node("C")]);
    expect(containedBy.get("A")).toEqual(["B", "C"]); // A's descendants (forward)
    expect(containersOf.get("C")).toEqual(["B", "A"]); // C's ancestors (reverse)
    expect(containedBy.get("C")).toEqual([]);
    expect(containersOf.get("A")).toEqual([]);
  });

  it("direction: containersOf walks UP (reverse of definitionRefs); containedBy walks DOWN", () => {
    const { containersOf, containedBy } = buildConceptContainment([node("A", ["B"]), node("B")]);
    expect(containersOf.get("B")).toEqual(["A"]); // A's definition reaches B → A contains B
    expect(containersOf.get("A")).toEqual([]); // nothing contains A
    expect(containedBy.get("A")).toEqual(["B"]);
    expect(containedBy.get("B")).toEqual([]);
  });

  it("self-loop (A defined-as A) → empty both (self-excluded)", () => {
    const { containersOf, containedBy } = buildConceptContainment([node("A", ["A"])]);
    expect(containedBy.get("A")).toEqual([]);
    expect(containersOf.get("A")).toEqual([]);
  });

  it("cycle (A↔B) terminates, self-excluded", () => {
    const { containersOf, containedBy } = buildConceptContainment([node("A", ["B"]), node("B", ["A"])]);
    expect(containedBy.get("A")).toEqual(["B"]);
    expect(containersOf.get("A")).toEqual(["B"]);
  });

  it("a diamond (A→B, A→C, B→D, C→D) dedupes D once", () => {
    const { containedBy } = buildConceptContainment([node("A", ["B", "C"]), node("B", ["D"]), node("C", ["D"]), node("D")]);
    expect(containedBy.get("A")).toEqual(["B", "C", "D"]); // D reached via both branches → once
  });
});
