// Tests for buildConceptShapeIndex (#187 Todo 1b) — the per-concept `defined as` shape subtree the Medical-Validation
// panes consume. Covers: the subtree shape (diamond first-wins, both-rep own-code-first, definition-is no-children),
// the hasCodeIs-vs-leafEligible split (representation-bearing `code is`), and — the load-bearing GATE — that a `when`'s
// `codeIsLeavesPreorder` equals the emitter's own `collectCaseFeatures` action.input for EVERY decision `when`.
import { parseInput } from "../../ast/tests/parseInput";
import type { Decision } from "../../ast/types";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import { leafEligibleConcepts, lowerLocalCodes } from "../../cql-emitter/lowerLocalCodes";
import { collectCaseFeatures } from "../../fhir-emitter/closureOrchestrator";
import type { RegistryEntry } from "../../imports/types";
import {
  buildConceptShapeIndex,
  codeIsLeavesPreorder,
  type ConceptShapeNode,
} from "../conceptShape";
import { buildCrlConceptLayer, type CrlConceptNode } from "../crlConceptLayer";
import { collectLibs, conceptDeclRef, nodeKey, type LibInfo } from "../indexer";

// A policy exercising every shape axis: pure leaves (A/B), a diamond composite (Comp = A ∧ B ∧ A), a both-rep
// UNION (BothRep = code + defined as), a both-rep RECENCY (Age = code + definition is age), a representation-bearing
// `code is` (Height: Source but NOT a lowered leaf), and a pure sourced concept (Sourced).
const P = `# P
library "P".
terminology "Height VS":
- valueset is \`urn:height\`.
terminology "Some VS":
- valueset is \`urn:some\`.
concept "A":
- type is Condition.
- code is \`a\`.
concept "B":
- type is Condition.
- code is \`b\`.
concept "Comp":
- defined as ( "A" sem-and "B" sem-and "A" ).
concept "BothRep":
- type is Observation.
- code is \`br\`.
- defined as ( "A" sem-or "B" ).
concept "Age":
- value type is boolean.
- code is \`age\`.
- source representation:
  - type is Patient.
  - value element is Patient.birthDate.
  - value type is date.
  - value projection is age today at least 18 years.
concept "Height":
- type is Observation.
- value type is Quantity.
- code is \`h\`.
- source representation:
- coded from "Height VS".
concept "Sourced":
- coded from "Some VS".
concept "CrossComp":
- defined as ( "A" sem-or "U"."Q" ).
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
decision "D":
first:
- when "Comp" then recommend activity "X".
- when "BothRep" then recommend activity "X".
- when "Age" then recommend activity "X".
- when "CrossComp" then recommend activity "X".
- otherwise then recommend activity "X".`;

// A sibling library the covered policy references cross-lib (`"U"."Q"`) — its concept Q is a `code is` leaf in ITS
// own library, but a CROSS-library operand, so it must be OMITTED from a P-side subtree (emitter-faithful, v0).
const U = `# U
library "U".
concept "Q":
- type is Condition.
- code is \`q\`.`;

const CEL = `# PC
library "PC".
covers "P".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "c":
- subject is "Pat".
- result is "D" is "X".`;

function entry(src: string, filePath: string, origin: "root" | "local"): RegistryEntry {
  return {
    name: parseInput(src).library.name,
    filePath,
    ast: parseInput(src),
    isRoot: origin === "root",
    origin,
  };
}
function graphFrom(
  crlSrc: string,
  celSrc: string,
  extraLocal: RegistryEntry[] = [],
): ResolvedCelGraph {
  const built = buildCEL(celSrc);
  if (!built.success || !built.result)
    throw new Error("inline CEL build failed: " + JSON.stringify(built.errors));
  const byNameLocal = new Map<string, RegistryEntry>();
  for (const e of extraLocal) byNameLocal.set(e.name, e);
  return {
    filePath: "inline.cel",
    cel: built.result,
    coversTarget: entry(crlSrc, "inline.crl", "root"),
    crlRegistry: { byNameLocal, byNamePackage: new Map() },
    celParseErrors: [],
    diagnostics: [],
  } as ResolvedCelGraph;
}

/** Build the shape index the way the cockpit does: leafEligibleByLib for EVERY library, then the pure builder. */
function shapeIndexFor(
  graph: ResolvedCelGraph,
  conceptLayer: CrlConceptNode[],
): ReturnType<typeof buildConceptShapeIndex> {
  const { libs } = collectLibs(graph);
  const leafEligibleByLib = new Map<string, Set<string>>();
  for (const [lib, info] of libs) leafEligibleByLib.set(lib, leafEligibleConcepts(info.entry.ast));
  return buildConceptShapeIndex(libs, conceptLayer, leafEligibleByLib);
}

const ck = (lib: string, name: string): string => nodeKey(conceptDeclRef(lib, name));

describe("buildConceptShapeIndex — per-concept shape subtree (#187 Todo 1b)", () => {
  const graph = graphFrom(P, CEL, [entry(U, "u.crl", "local")]);
  const conceptLayer = buildCrlConceptLayer(graph);
  const keyToName = new Map(conceptLayer.map((c) => [c.nodeKey, c.name]));
  const shape = shapeIndexFor(graph, conceptLayer);
  const get = (name: string): ConceptShapeNode => shape.get(ck("P", name))!;
  const childNames = (n: ConceptShapeNode): string[] =>
    n.children.map((c) => keyToName.get(c.nodeKey)!);
  const leafNames = (n: ConceptShapeNode): string[] =>
    codeIsLeavesPreorder(n).map((k) => keyToName.get(k)!);

  it("indexes every concept by nodeKey (across the policy + registry libs)", () => {
    expect([...shape.keys()].sort()).toEqual(
      [
        ...["A", "B", "Comp", "BothRep", "Age", "Height", "Sourced", "CrossComp"].map((n) =>
          ck("P", n),
        ),
        ck("U", "Q"),
      ].sort(),
    );
  });

  it("a pure `code is` leaf: leafEligible, hasCodeIs, no children", () => {
    const a = get("A");
    expect({
      hasCodeIs: a.hasCodeIs,
      leafEligible: a.leafEligible,
      hasDefinedAs: a.hasDefinedAs,
      isInferred: a.isInferred,
    }).toEqual({
      hasCodeIs: true,
      leafEligible: true,
      hasDefinedAs: false,
      isInferred: false,
    });
    expect(a.children).toEqual([]);
    expect(leafNames(a)).toEqual(["A"]);
  });

  it("diamond composite (Comp = A ∧ B ∧ A): A is entered ONCE (first-wins) → children [A, B]", () => {
    const comp = get("Comp");
    expect({
      hasCodeIs: comp.hasCodeIs,
      leafEligible: comp.leafEligible,
      hasDefinedAs: comp.hasDefinedAs,
      isInferred: comp.isInferred,
    }).toEqual({
      hasCodeIs: false,
      leafEligible: false,
      hasDefinedAs: true,
      isInferred: true,
    });
    expect(childNames(comp)).toEqual(["A", "B"]);
    expect(leafNames(comp)).toEqual(["A", "B"]);
  });

  it("both-rep UNION (code is + defined as): leafEligible AND expandable; own code FIRST in the projection", () => {
    const br = get("BothRep");
    expect({
      hasCodeIs: br.hasCodeIs,
      leafEligible: br.leafEligible,
      hasDefinedAs: br.hasDefinedAs,
    }).toEqual({
      hasCodeIs: true,
      leafEligible: true,
      hasDefinedAs: true,
    });
    expect(childNames(br)).toEqual(["A", "B"]);
    expect(leafNames(br)).toEqual(["BothRep", "A", "B"]); // self-first, then operands
  });

  it("both-rep RECENCY (code is + definition is age): leafEligible + inferred, but NO children (definition-is, not defined-as)", () => {
    const age = get("Age");
    expect({
      hasCodeIs: age.hasCodeIs,
      leafEligible: age.leafEligible,
      hasDefinedAs: age.hasDefinedAs,
      isInferred: age.isInferred,
    }).toEqual({
      hasCodeIs: true,
      leafEligible: true,
      hasDefinedAs: false, // it is `definition is`, not `defined as`
      isInferred: true,
    });
    expect(age.children).toEqual([]);
    expect(leafNames(age)).toEqual(["Age"]);
  });

  it("representation-bearing `code is` (Height): hasCodeIs TRUE but leafEligible FALSE (Source display, not an emitted leaf)", () => {
    const h = get("Height");
    expect(h.hasCodeIs).toBe(true);
    expect(h.leafEligible).toBe(false);
    expect(leafNames(h)).toEqual([]); // excluded from the action.input projection — matches the emitter's skip
  });

  it("a pure `coded from` concept: not code-is, not a leaf, not inferred", () => {
    const s = get("Sourced");
    expect({
      hasCodeIs: s.hasCodeIs,
      leafEligible: s.leafEligible,
      isInferred: s.isInferred,
    }).toEqual({
      hasCodeIs: false,
      leafEligible: false,
      isInferred: false,
    });
  });

  it("cross-library operand (CrossComp = A ∨ U.Q): the foreign U.Q is OMITTED → children [A] only (emitter-faithful)", () => {
    const cc = get("CrossComp");
    expect(childNames(cc)).toEqual(["A"]); // U.Q is a leaf in ITS lib but a cross-lib operand here → dropped
    expect(leafNames(cc)).toEqual(["A"]);
  });

  it("GATE: for every decision `when`, codeIsLeavesPreorder == the emitter's collectCaseFeatures action.input", () => {
    const policyAst = graph.coversTarget!.ast;
    const lowered = lowerLocalCodes(policyAst);
    const decisions = policyAst.statements.filter((s): s is Decision => s.type === "Decision");
    const cf = collectCaseFeatures(lowered, decisions, policyAst.library.name);

    expect(cf.inputsByCondition.size).toBeGreaterThan(0); // guard: the gate actually ran over some whens
    for (const [condName, inputs] of cf.inputsByCondition) {
      const node = shape.get(ck("P", condName));
      expect(node).toBeDefined();
      expect(leafNames(node!)).toEqual(inputs.map((c) => c.name));
    }
  });
});

describe("buildConceptShapeIndex — boundaries", () => {
  it("empty concept layer (no policy anchor) → empty index", () => {
    expect(buildConceptShapeIndex(new Map(), [], new Map()).size).toBe(0);
  });

  it("duplicate concept names in one library → first-wins (one subtree per nodeKey)", () => {
    const ast = parseInput(
      `# Dup
library "Dup".
concept "X":
- type is Condition.
- code is \`x\`.
concept "X":
- type is Observation.
- defined as ( "X" ).`,
    );
    const libs = new Map<string, LibInfo>([
      [
        "Dup",
        {
          entry: { name: "Dup", filePath: "d.crl", ast, isRoot: true, origin: "root" },
        } as unknown as LibInfo,
      ],
    ]);
    const key = ck("Dup", "X");
    // Two layer nodes share the nodeKey (dup names collapse); the FIRST (the `code is` leaf) must win.
    const layer = [
      {
        nodeKey: key,
        name: "X",
        lib: "Dup",
        label: 'concept "X"',
        location: {} as never,
        valueTypes: [],
        hasLocalCode: true,
        hasRepresentations: false,
        definitionRefs: [],
      },
      {
        nodeKey: key,
        name: "X",
        lib: "Dup",
        label: 'concept "X"',
        location: {} as never,
        valueTypes: [],
        hasLocalCode: false,
        hasRepresentations: false,
        definitionKind: "defined-as",
        definitionRefs: [],
      },
    ] as CrlConceptNode[];
    const idx = buildConceptShapeIndex(libs, layer, new Map([["Dup", new Set(["X"])]]));
    expect(idx.size).toBe(1);
    expect(idx.get(key)!.hasCodeIs).toBe(true); // the first decl (code-is), not the second (defined-as)
    expect(idx.get(key)!.children).toEqual([]);
  });
});

// Simulate a location-less concept — present in the raw AST (so the walk reaches it) but ABSENT from the concept
// layer (which drops `!location`) — by FILTERING it out of the layer while keeping the full ASTs in `libs`.
describe("buildConceptShapeIndex — omitted (location-less) concept simulation", () => {
  const E = `# E
library "E".
concept "A":
- type is Condition.
- code is \`a\`.
concept "L2":
- type is Condition.
- code is \`l2\`.
concept "Mid":
- defined as ( "A" ).
concept "TopMid":
- defined as ( "Mid" ).
concept "TopL2":
- defined as ( "L2" ).
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
decision "D":
first:
- when "TopMid" then recommend activity "X".
- otherwise then recommend activity "X".`;
  const ECEL = `# EC
library "EC".
covers "E".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "c":
- subject is "Pat".
- result is "D" is "X".`;
  const graph = graphFrom(E, ECEL);
  const { libs } = collectLibs(graph);
  const full = buildCrlConceptLayer(graph);
  const eligible = new Map([["E", leafEligibleConcepts(graph.coversTarget!.ast)]]);
  const kToN = new Map(full.map((c) => [c.nodeKey, c.name]));

  it("omitted NON-eligible intermediate (Mid) → its child flattens up to the nearest real ancestor", () => {
    const filtered = full.filter((c) => c.name !== "Mid"); // Mid dropped (as if location-less)
    const idx = buildConceptShapeIndex(libs, filtered, eligible);
    const topMid = idx.get(ck("E", "TopMid"))!;
    expect(topMid.children.map((c) => kToN.get(c.nodeKey)!)).toEqual(["A"]); // Mid flattened through
    expect(codeIsLeavesPreorder(topMid).map((k) => kToN.get(k)!)).toEqual(["A"]);
  });

  it("omitted ELIGIBLE leaf (L2) → THROWS (silently dropping it would under-claim an emitted action.input)", () => {
    const filtered = full.filter((c) => c.name !== "L2"); // L2 is `code is` → leaf-eligible; dropping it is the drift risk
    expect(() => buildConceptShapeIndex(libs, filtered, eligible)).toThrow(/leaf-eligible/);
  });
});
