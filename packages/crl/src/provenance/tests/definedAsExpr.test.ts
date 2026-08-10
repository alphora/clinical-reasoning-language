// Tests for buildDefExprIndex / collectDefExprLeafKeys (#187 Option-3, disc 199) — the per-concept `defined as`
// OPERATOR tree the MV Questionnaire renders. The LOAD-BEARING test is the drift sweep: the operator tree's
// pre-order leafEligible keys MUST equal codeIsLeavesPreorder of the SAME concept's ConceptShapeNode (== the
// emitter's $apply action.input) for EVERY concept — so the operator-preserving projection cannot drift from the
// flat one. Plus: operator structure (positional diamond, both-rep own-first, cross-lib stub), the cycle guard,
// and the fail-loud on a leaf-eligible location-less concept.
import { parseInput } from "../../ast/tests/parseInput";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import { leafEligibleConcepts } from "../../cql-emitter/lowerLocalCodes";
import type { RegistryEntry } from "../../imports/types";
import { buildConceptShapeIndex, codeIsLeavesPreorder } from "../conceptShape";
import { buildCrlConceptLayer, type CrlConceptNode } from "../crlConceptLayer";
import { buildDefExprIndex, collectDefExprLeafKeys, type DefExpr, type DefExprIndex } from "../definedAsExpr";
import { collectLibs, conceptDeclRef, nodeKey } from "../indexer";

// Every axis: pure leaves (A/B), a DIAMOND composite (Comp = A ∧ B ∧ A), a both-rep UNION (BothRep = code + defined as),
// a both-rep RECENCY (Age = code + definition is → NOT defined-as), a representation-bearing `code is` (Height: Source
// but NOT a lowered leaf), a pure sourced concept (Sourced), and a CROSS-LIB composite (CrossComp = A ∨ U."Q").
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
concept "NotComp":
- defined as ( sem-not ( "A" sem-or "B" ) ).
concept "Leaf3":
- type is Condition.
- code is \`l3\`.
concept "Mid3":
- defined as ( "Leaf3" ).
concept "Top3":
- defined as ( "Mid3" ).
concept "DirectNested":
- defined as ( "A" sem-and "Comp" ).
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
  return { name: parseInput(src).library.name, filePath, ast: parseInput(src), isRoot: origin === "root", origin };
}
function graphFrom(crlSrc: string, celSrc: string, extraLocal: RegistryEntry[] = []): ResolvedCelGraph {
  const built = buildCEL(celSrc);
  if (!built.success || !built.result) throw new Error("inline CEL build failed: " + JSON.stringify(built.errors));
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
const ck = (lib: string, name: string): string => nodeKey(conceptDeclRef(lib, name));
function eligibleFor(graph: ResolvedCelGraph): Map<string, Set<string>> {
  const { libs } = collectLibs(graph);
  const m = new Map<string, Set<string>>();
  for (const [lib, info] of libs) m.set(lib, leafEligibleConcepts(info.entry.ast));
  return m;
}

describe("buildDefExprIndex — the `defined as` operator tree (disc 199)", () => {
  const graph = graphFrom(P, CEL, [entry(U, "u.crl", "local")]);
  const conceptLayer = buildCrlConceptLayer(graph);
  const { libs } = collectLibs(graph);
  const eligible = eligibleFor(graph);
  const defIndex = buildDefExprIndex(libs, conceptLayer, eligible);
  const shapeIndex = buildConceptShapeIndex(libs, conceptLayer, eligible);
  const keyToName = new Map(conceptLayer.map((c) => [c.nodeKey, c.name]));
  const nameOfKeys = (keys: string[]): string[] => keys.map((k) => keyToName.get(k) ?? k);
  const get = (name: string) => defIndex.get(ck("P", name))!;
  const refName = (e: DefExpr): string => (e.kind === "ref" ? e.ref.name : `<${e.kind}>`);

  it("indexes every concept by nodeKey (same key set as the shape index)", () => {
    expect([...defIndex.keys()].sort()).toEqual([...shapeIndex.keys()].sort());
  });

  // ── THE load-bearing drift guard: operator-tree leaves == flat-shape leaves (SEQUENCE) for EVERY concept ──
  it("DRIFT GUARD: collectDefExprLeafKeys === codeIsLeavesPreorder for every concept (sequence, by KEY)", () => {
    for (const c of conceptLayer) {
      const viaOptree = collectDefExprLeafKeys(c.nodeKey, defIndex);
      const viaShape = codeIsLeavesPreorder(shapeIndex.get(c.nodeKey)!);
      // Assert on nodeKeys (the cross-pane join identity — a cross-lib same-NAME collision must not mask key drift);
      // surface names only when they differ, for a readable failure.
      if (JSON.stringify(viaOptree) !== JSON.stringify(viaShape)) {
        expect({ concept: c.name, optree: nameOfKeys(viaOptree) }).toEqual({ concept: c.name, shape: nameOfKeys(viaShape) });
      }
      expect(viaOptree).toEqual(viaShape);
    }
  });

  // Concept-model Todo 1 carve-out to the drift guard above: a `defined as exists` concept has NO DefExpr body
  // (so existence is not rendered as a bare-ref alias — gpt56 impl review #3), while `conceptShape` still flattens
  // the exists operand (the emitter-faithful side). The two projections therefore KNOWINGLY diverge for an exists
  // concept. This is INERT in increment 1 (an exists library's CQL lowering fails structurally, so `$apply` never
  // runs) and is CLOSED by Todo 3's explicit `exists` DefExpr kind. Asserted EXPECTED here so the gap is a visible
  // marker Todo 3 inherits, not a silently-false "MUST equal" the main sweep can't catch (its corpus has no exists).
  it("KNOWN DIVERGENCE (Todo 1): an exists concept has no DefExpr body while conceptShape flattens its operand", () => {
    const PE = `# PE
library "PE".
concept "Present":
- type is Condition.
- code is \`present\`.
concept "Has Present":
- defined as exists ( "Present" ).
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
decision "D":
first:
- when "Has Present" then recommend activity "X".
- otherwise then recommend activity "X".`;
    const PECEL = `# PEC
library "PEC".
covers "PE".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "c":
- subject is "Pat".
- result is "D" is "X".`;
    const g = graphFrom(PE, PECEL);
    const cl = buildCrlConceptLayer(g);
    const { libs: l } = collectLibs(g);
    const el = eligibleFor(g);
    const dIdx = buildDefExprIndex(l, cl, el);
    const sIdx = buildConceptShapeIndex(l, cl, el);
    const hp = ck("PE", "Has Present");
    // DefExpr: an exists concept gets NO body → no operator-tree leaves.
    expect(dIdx.get(hp)?.body).toBeUndefined();
    expect(collectDefExprLeafKeys(hp, dIdx)).toEqual([]);
    // conceptShape (emitter-faithful): flattens the exists operand → the leaf-eligible `Present` IS a leaf.
    expect(codeIsLeavesPreorder(sIdx.get(hp)!)).toEqual([ck("PE", "Present")]);
    // ⇒ the two projections KNOWINGLY diverge for exists (inert until Todo 3 restores lockstep).
  });

  it("a diamond composite keeps operands POSITIONAL in the structure but COLLAPSES the leaf sequence", () => {
    const comp = get("Comp");
    expect(comp.body?.kind).toBe("and");
    // A ∧ B ∧ A — the structure keeps BOTH A operands (positional), unlike the leaf collection.
    expect((comp.body as { operands: DefExpr[] }).operands.map(refName)).toEqual(["A", "B", "A"]);
    // The leaf sequence collapses the second A (visited memo), matching the emitter's diamond-collapsed action.input.
    expect(nameOfKeys(collectDefExprLeafKeys(ck("P", "Comp"), defIndex))).toEqual(["A", "B"]);
  });

  it("a both-rep UNION lists its OWN leaf FIRST, then its operands (own-key-first)", () => {
    const br = get("BothRep");
    expect(br.leafEligible).toBe(true); // its own `code is br` lowers
    expect(br.hasCodeIs).toBe(true);
    expect(br.body?.kind).toBe("or");
    expect(nameOfKeys(collectDefExprLeafKeys(ck("P", "BothRep"), defIndex))).toEqual(["BothRep", "A", "B"]);
  });

  it("a cross-library operand is a retained STUB (crossLib, no nodeKey, not a leaf, not recursed)", () => {
    const cc = get("CrossComp");
    const ops = (cc.body as { operands: DefExpr[] }).operands;
    expect(ops.map(refName)).toEqual(["A", "Q"]);
    const q = ops[1];
    expect(q.kind === "ref" && q.ref.crossLib).toBe(true);
    expect(q.kind === "ref" && q.ref.nodeKey).toBeUndefined();
    expect(q.kind === "ref" && q.ref.leafEligible).toBe(false);
    // Only the same-lib A contributes a leaf; the cross-lib Q is not recursed.
    expect(nameOfKeys(collectDefExprLeafKeys(ck("P", "CrossComp"), defIndex))).toEqual(["A"]);
  });

  it("sem-not wraps a composite: {not, {or,[A,B]}}; the operator is transparent to leaf ORDER", () => {
    const nc = get("NotComp");
    expect(nc.body?.kind).toBe("not");
    const inner = (nc.body as { operand: DefExpr }).operand;
    expect(inner.kind).toBe("or");
    expect((inner as { operands: DefExpr[] }).operands.map(refName)).toEqual(["A", "B"]);
    expect(nameOfKeys(collectDefExprLeafKeys(ck("P", "NotComp"), defIndex))).toEqual(["A", "B"]);
  });

  it("a deep chain (Top3 → Mid3 → Leaf3) recurses ref edges; an operand both direct AND nested collapses once", () => {
    expect(nameOfKeys(collectDefExprLeafKeys(ck("P", "Top3"), defIndex))).toEqual(["Leaf3"]);
    // DirectNested = A ∧ Comp, Comp = A ∧ B ∧ A — A is a direct operand AND nested in Comp; first-wins across the boundary.
    const dn = get("DirectNested");
    expect((dn.body as { operands: DefExpr[] }).operands.map(refName)).toEqual(["A", "Comp"]);
    expect(nameOfKeys(collectDefExprLeafKeys(ck("P", "DirectNested"), defIndex))).toEqual(["A", "B"]);
  });

  it("a `definition is` recency concept (Age) has NO body (not defined-as) but is its own leaf", () => {
    const age = get("Age");
    expect(age.body).toBeUndefined();
    expect(age.hasDefinedAs).toBe(false);
    expect(age.leafEligible).toBe(true);
    expect(nameOfKeys(collectDefExprLeafKeys(ck("P", "Age"), defIndex))).toEqual(["Age"]);
  });

  it("a representation-bearing `code is` (Height) is Source but NOT a leaf; a pure leaf (A) has no body", () => {
    expect(get("Height").hasCodeIs).toBe(true);
    expect(get("Height").leafEligible).toBe(false); // representation-bearing → not a lowered leaf
    expect(get("A").body).toBeUndefined();
    expect(get("A").leafEligible).toBe(true);
  });
});

describe("collectDefExprLeafKeys — cycle guard (a total function on a malformed graph)", () => {
  // A validated model can't contain a `defined as` cycle (cycleDetector rejects it, never demoted), so hand-build a
  // cyclic index to prove the traversal's `visiting` path-guard terminates rather than looping.
  it("A → B → A terminates and emits each reachable leaf once", () => {
    const kA = "kA";
    const kB = "kB";
    const kL = "kL"; // a leaf under B
    const index: DefExprIndex = new Map([
      [kA, { nodeKey: kA, lib: "L", name: "A", hasCodeIs: false, leafEligible: false, isInferred: true, hasDefinedAs: true,
             body: { kind: "ref", ref: { name: "B", lib: "L", crossLib: false, nodeKey: kB, leafEligible: false, hasDefinedAs: true } } }],
      [kB, { nodeKey: kB, lib: "L", name: "B", hasCodeIs: false, leafEligible: false, isInferred: true, hasDefinedAs: true,
             body: { kind: "or", operands: [
               { kind: "ref", ref: { name: "A", lib: "L", crossLib: false, nodeKey: kA, leafEligible: false, hasDefinedAs: true } }, // back-edge → cycle
               { kind: "ref", ref: { name: "Lf", lib: "L", crossLib: false, nodeKey: kL, leafEligible: true, hasDefinedAs: false } },
             ] } }],
      [kL, { nodeKey: kL, lib: "L", name: "Lf", hasCodeIs: true, leafEligible: true, isInferred: false, hasDefinedAs: false }],
    ]);
    expect(collectDefExprLeafKeys(kA, index)).toEqual([kL]); // A→B→(A cycle-stop, Lf leaf)
  });
});

describe("buildDefExprIndex — fail-loud on a leaf-eligible location-less concept", () => {
  // Simulate a location-less concept: keep it in the raw AST (so the walk reaches its ref) but DROP it from the
  // concept layer. A leaf-eligible one must THROW (silently omitting it would under-claim an emitted action.input).
  const graph = graphFrom(P, CEL, [entry(U, "u.crl", "local")]);
  const { libs } = collectLibs(graph);
  const full = buildCrlConceptLayer(graph);
  const eligible = eligibleFor(graph);

  it("dropping an ELIGIBLE leaf (A, referenced by Comp's `defined as`) → THROWS", () => {
    const filtered = full.filter((c) => !(c.lib === "P" && c.name === "A"));
    expect(() => buildDefExprIndex(libs, filtered, eligible)).toThrow(/leaf-eligible/);
  });

  it("dropping a NON-eligible intermediate (Mid3) → flattens THROUGH; drift with the shape STILL holds", () => {
    // The dangerous drift the operator tree must NOT introduce: Top3 → Mid3 → Leaf3 with Mid3 location-less. The
    // shape flattens Leaf3 up to Top3; the operator tree must inline Mid3's body so Leaf3 survives (not dropped).
    const filtered = full.filter((c) => !(c.lib === "P" && c.name === "Mid3"));
    const def = buildDefExprIndex(libs, filtered, eligible);
    const shape = buildConceptShapeIndex(libs, filtered, eligible);
    const kToN = new Map(filtered.map((c) => [c.nodeKey, c.name]));
    const nm = (ks: string[]): string[] => ks.map((k) => kToN.get(k) ?? k);
    const top3 = ck("P", "Top3");
    expect(nm(collectDefExprLeafKeys(top3, def))).toEqual(["Leaf3"]); // flattened through the omitted Mid3
    expect(collectDefExprLeafKeys(top3, def)).toEqual(codeIsLeavesPreorder(shape.get(top3)!)); // drift still holds
  });
});
