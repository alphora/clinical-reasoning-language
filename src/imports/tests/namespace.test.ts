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

  it("allows the same name across different kinds (cross-kind is legal)", () => {
    const libA = makeLibrary("LibA", "/lib-a.crl", [makeConcept("BMI")]);
    const libB = makeLibrary("LibB", "/lib-b.crl", [makeTerminology("BMI")]);
    const { namespace, diagnostics } = buildCombinedNamespace([libA, libB]);
    expect(namespace.concepts.has("BMI")).toBe(true);
    expect(namespace.terminologies.has("BMI")).toBe(true);
    expect(diagnostics).toHaveLength(0);
  });

  it("emits name-conflict when two libraries declare the same concept name", () => {
    const libA = makeLibrary("LibA", "/lib-a.crl", [makeConcept("X")]);
    const libB = makeLibrary("LibB", "/lib-b.crl", [makeConcept("X")]);
    const { namespace, diagnostics } = buildCombinedNamespace([libA, libB]);
    const conflict = diagnostics.find((d) => d.kind === "name-conflict");
    expect(conflict).toBeDefined();
    if (conflict?.kind === "name-conflict") {
      expect(conflict.name).toBe("X");
      expect(conflict.nodeKind).toBe("Concept");
      expect(conflict.sources).toHaveLength(2);
    }
    // First registration (leaves-win) survives.
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
