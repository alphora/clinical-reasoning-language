import { buildCombinedNamespace } from "../namespace";
import { RegistryEntry } from "../types";
import { CRL, Concept, Terminology } from "../../ast/types";

const dummyLoc = {
  start: { line: 1, column: 0 },
  end: { line: 1, column: 0 },
};

function makeConcept(name: string): Concept {
  return {
    type: "Concept",
    name,
    valueTypes: [],
    metaLines: [],
    definition: {
      type: "CodedFromDefinition",
      terminologyName: "X",
      location: dummyLoc,
    },
    location: dummyLoc,
  } as unknown as Concept;
}

function makeTerminology(name: string): Terminology {
  return {
    type: "Terminology",
    name,
    body: [],
    location: dummyLoc,
  };
}

function makeLibrary(name: string, filePath: string, statements: CRL["statements"]): RegistryEntry {
  const ast: CRL = {
    type: "CRL",
    includes: [],
    statements,
    location: dummyLoc,
  };
  return { name, filePath, ast, isRoot: false, origin: "local" };
}

describe("buildCombinedNamespace", () => {
  it("registers concepts, terminologies, decisions, activities into separate maps", () => {
    const lib = makeLibrary("LibA", "/lib-a.crl", [
      makeConcept("C1"),
      makeTerminology("T1"),
    ]);
    const { namespace, diagnostics } = buildCombinedNamespace([lib]);
    expect(namespace.concepts.has("C1")).toBe(true);
    expect(namespace.terminologies.has("T1")).toBe(true);
    expect(diagnostics).toHaveLength(0);
  });

  // #224 ii: a `criterion` is NOT a NodeKind — it must be SKIPPED here, not pushed
  // through `mapForKind` (which returns undefined → a `map.get` crash on EVERY
  // multi-file flow via resolveImports). Regression test for that crash.
  it("SKIPS a `criterion` statement without crashing (no cross-library namespace entry)", () => {
    const criterion = {
      type: "Criterion",
      name: "Eligible",
      condition: { type: "BranchConditionRef", ref: "C1", location: dummyLoc },
      location: dummyLoc,
    } as unknown as CRL["statements"][number];
    const lib = makeLibrary("LibA", "/lib-a.crl", [makeConcept("C1"), criterion]);
    expect(() => buildCombinedNamespace([lib])).not.toThrow();
    const { namespace } = buildCombinedNamespace([lib]);
    expect(namespace.concepts.has("C1")).toBe(true); // the concept still registers
  });

  it("allows the same name across different kinds (cross-kind is legal)", () => {
    const libA = makeLibrary("LibA", "/lib-a.crl", [makeConcept("BMI")]);
    const libB = makeLibrary("LibB", "/lib-b.crl", [makeTerminology("BMI")]);
    const { namespace, diagnostics } = buildCombinedNamespace([libA, libB]);
    expect(namespace.concepts.has("BMI")).toBe(true);
    expect(namespace.terminologies.has("BMI")).toBe(true);
    expect(diagnostics).toHaveLength(0);
  });

  it("v2.1.0: cross-library same-name is benign (no name-conflict fires)", () => {
    // Under per-library scoping + per-CRL emit, two libraries declaring the
    // same concept name is legal — each library has its own scope and its
    // own emitted CQL namespace. The legacy flat `Namespace` view still
    // first-wins-dedups for any consumer reading it, but no diagnostic
    // fires.
    const libA = makeLibrary("LibA", "/lib-a.crl", [makeConcept("X")]);
    const libB = makeLibrary("LibB", "/lib-b.crl", [makeConcept("X")]);
    const { namespace, diagnostics } = buildCombinedNamespace([libA, libB]);
    const conflict = diagnostics.find((d) => d.kind === "name-conflict");
    expect(conflict).toBeUndefined();
    // First registration still wins in the flat view (leaves-win).
    expect(namespace.concepts.get("X")?.libraryName).toBe("LibA");
  });

  it("first-wins (leaves-win) is the topo-order semantic", () => {
    // Topo order is leaves-first, root-last. Earlier in the array = deeper leaf.
    const leaf = makeLibrary("Leaf", "/leaf.crl", [makeConcept("Shared")]);
    const root = makeLibrary("Root", "/root.crl", [makeConcept("Shared")]);
    const { namespace } = buildCombinedNamespace([leaf, root]);
    // Leaf wins.
    expect(namespace.concepts.get("Shared")?.libraryName).toBe("Leaf");
  });
});
