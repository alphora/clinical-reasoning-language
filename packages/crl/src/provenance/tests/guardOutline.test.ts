import { describe, expect, it } from "vitest";

import { buildCriterionTable } from "../../ast/criterionExpansion";
import { classifyCriterionRefs } from "../../ast/criterionClassify";
import { parseInput } from "../../ast/tests/parseInput";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import { leafEligibleConcepts } from "../../cql-emitter/lowerLocalCodes";
import { buildCrlConceptLayer } from "../crlConceptLayer";
import { buildDefExprIndex, type DefStructExpr, type ResolveDefExprEntry } from "../definedAsExpr";
import { branchConditionToDefStruct, buildGuardOutlines } from "../guardOutline";
import { collectLibs, decisionSubNodeRef, nodeKey } from "../indexer";
import { buildCrlStructure } from "../crlStructure";

/** A classified root graph from inline CRL + CEL (mirrors crlStructure.test's helper; runs `classifyCriterionRefs`
 *  so criterion atoms become `BranchConditionCriterionRef`, exactly as the real resolve pipeline does). */
function graphFrom(crlSrc: string, celSrc: string): ResolvedCelGraph {
  const classified = classifyCriterionRefs(parseInput(crlSrc));
  const built = buildCEL(celSrc);
  if (!built.success || !built.result) throw new Error("inline CEL build failed: " + JSON.stringify(built.errors));
  return {
    filePath: "inline.cel",
    cel: built.result,
    coversTarget: { name: classified.library.name, filePath: "inline.crl", ast: classified, isRoot: true, origin: "root" },
    crlRegistry: { byNameLocal: new Map(), byNamePackage: new Map() },
    celParseErrors: [],
    diagnostics: [],
  } as unknown as ResolvedCelGraph;
}

/** The real defExpr index for a graph (same inputs as cockpitModel). */
function defIndexOf(graph: ResolvedCelGraph) {
  const conceptLayer = buildCrlConceptLayer(graph);
  const { libs } = collectLibs(graph);
  const leafEligibleByLib = new Map<string, Set<string>>();
  for (const [lib, info] of libs) leafEligibleByLib.set(lib, leafEligibleConcepts(info.entry.ast));
  return buildDefExprIndex(libs, conceptLayer, leafEligibleByLib);
}

const CEL = `library "TC".
covers "T".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "c":
- subject is "Pat".
- result is "D" is "X".`;

// A criterion (`Elig` = `Inf and C`, where `Inf` is a `defined as` composite `A sem-or B`) plus a PLAIN compound
// guard (`A and C`, no criterion) — so the omit-non-criterion line is exercised in one fixture.
const CRL = `library "T".
concept "A":
- type is Observation.
- code is \`a\`.
concept "B":
- type is Observation.
- code is \`b\`.
concept "Inf":
- defined as ( "A" sem-or "B" ).
concept "C":
- type is Observation.
- code is \`c\`.
criterion "Elig":
- when ( "Inf" and "C" ).
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
decision "D":
first:
- when "Elig" then recommend activity "X".
- when ( "A" and "C" ) then recommend activity "X".
- otherwise then recommend activity "X".`;

describe("buildGuardOutlines — criterion-bearing when → guard outline (Flow pane, #224 ii.3 Todo 3)", () => {
  it("keys ONLY criterion-bearing whens, by the structure when-nodeKey (parity with buildCrlStructure)", () => {
    const graph = graphFrom(CRL, CEL);
    const outlines = buildGuardOutlines(graph, defIndexOf(graph));

    // Exactly the criterion when (when[0]); the plain compound guard when[1] and the otherwise are absent.
    const eligKey = nodeKey(decisionSubNodeRef("T", "D", "when[0]"));
    const compoundKey = nodeKey(decisionSubNodeRef("T", "D", "when[1]"));
    expect([...outlines.keys()]).toEqual([eligKey]);
    expect(outlines.has(compoundKey)).toBe(false);

    // Every key joins a real `when` node of the structure (the load-bearing cross-pane join).
    const structWhenKeys = new Set<string>();
    const walk = (ns: { nodeKey: string; kind: string; children: { nodeKey: string; kind: string; children: unknown[] }[] }[]): void => {
      for (const n of ns) {
        if (n.kind === "when") structWhenKeys.add(n.nodeKey);
        walk(n.children as never);
      }
    };
    walk(buildCrlStructure(graph) as never);
    for (const k of outlines.keys()) expect(structWhenKeys.has(k)).toBe(true);
  });

  it("renders the criterion body: `and(Inf{composite or(A,B)}, C)` — a `defined as` operand hangs its own composite", () => {
    const graph = graphFrom(CRL, CEL);
    const outline = buildGuardOutlines(graph, defIndexOf(graph)).get(nodeKey(decisionSubNodeRef("T", "D", "when[0]")))!;
    expect(outline.kind).toBe("and");
    if (outline.kind !== "and") throw new Error("unreachable");
    expect(outline.operands).toHaveLength(2);

    const [inf, c] = outline.operands;
    expect(inf.kind).toBe("leaf");
    if (inf.kind !== "leaf") throw new Error("unreachable");
    expect(inf.name).toBe("Inf");
    expect(inf.isInferred).toBe(true);
    expect(inf.composite?.kind).toBe("or");
    const orNode = inf.composite as Extract<DefStructExpr, { kind: "or" | "and" }>;
    expect(orNode.operands.map((o) => (o.kind === "leaf" ? o.name : o.kind))).toEqual(["A", "B"]);

    expect(c.kind).toBe("leaf");
    if (c.kind !== "leaf") throw new Error("unreachable");
    expect(c.name).toBe("C");
    expect(c.isSource).toBe(true);
    expect(c.composite).toBeUndefined(); // a plain `code is` guard atom is a bare leaf
  });

  it("envelope breach (cyclic criterion) → a `…` ELISION STUB, NOT omission — keeps the flow's precedence gate engaged", () => {
    // `when ( "A" and "C1" )` where C1 is cyclic: refKeysOf falls back to the INLINE refs `["A"]` (length 1). If
    // buildGuardOutlines OMITTED, guardOutline would be undefined and the flow would masquerade the box as concept A
    // (disc 318 review [important] 1). Recording a stub entry keeps `guardOutline` truthy so the flow suppresses the
    // concept identity. Host-safe: no unbounded walk (the converter is never called on the breaching guard).
    const cyc = `library "T".
concept "A":
- type is Observation.
- code is \`a\`.
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
criterion "C1":
- when "C2".
criterion "C2":
- when "C1".
decision "D":
first:
- when ( "A" and "C1" ) then recommend activity "X".
- otherwise then recommend activity "X".`;
    const graph = graphFrom(cyc, CEL);
    const outlines = buildGuardOutlines(graph, defIndexOf(graph));
    expect([...outlines.keys()]).toEqual([nodeKey(decisionSubNodeRef("T", "D", "when[0]"))]);
    expect(outlines.get(nodeKey(decisionSubNodeRef("T", "D", "when[0]")))).toEqual({ kind: "more", count: 0 });
  });
});

describe("branchConditionToDefStruct — the pure converter (render-time backstops)", () => {
  const stubResolve: ResolveDefExprEntry = () => undefined; // no concept layer → every ref degrades to an external stub

  it("maps and/or/not 1:1 and degrades an unresolved concept ref to an `external` stub", () => {
    const src = `library "T".
concept "A":
- type is Observation.
- code is \`a\`.
concept "B":
- type is Observation.
- code is \`b\`.
criterion "K":
- when ( "A" and not "B" ).`;
    const table = buildCriterionTable(classifyCriterionRefs(parseInput(src)).statements);
    const out = branchConditionToDefStruct(table.get("K")!.condition, table, stubResolve, "T");
    expect(out.kind).toBe("and");
    if (out.kind !== "and") throw new Error("unreachable");
    expect(out.operands[0]).toEqual({ kind: "external", name: "A", lib: "T" });
    expect(out.operands[1].kind).toBe("not");
    const notNode = out.operands[1] as Extract<DefStructExpr, { kind: "not" }>;
    expect(notNode.operand).toEqual({ kind: "external", name: "B", lib: "T" });
  });

  it("inlines a nested criterion body, and a criterion CYCLE terminates at an `external` stub (visiting guard)", () => {
    const src = `library "T".
criterion "C1":
- when "C2".
criterion "C2":
- when "C1".`;
    const table = buildCriterionTable(classifyCriterionRefs(parseInput(src)).statements);
    // C1 → C2 → (C1 already visiting) → external stub. Terminates; no unbounded walk.
    const out = branchConditionToDefStruct(table.get("C1")!.condition, table, stubResolve, "T");
    expect(out).toEqual({ kind: "external", name: "C2", lib: "T" });
  });

  it("caps operand WIDTH at DEF_EXPR_CAP with a `+N more` stub", () => {
    const wide = Array.from({ length: 13 }, (_, i) => `"A${i}"`).join(" and ");
    const src = `library "T".
${Array.from({ length: 13 }, (_, i) => `concept "A${i}":\n- type is Observation.\n- code is \`a${i}\`.`).join("\n")}
criterion "Wide":
- when ( ${wide} ).`;
    const table = buildCriterionTable(classifyCriterionRefs(parseInput(src)).statements);
    const out = branchConditionToDefStruct(table.get("Wide")!.condition, table, stubResolve, "T");
    expect(out.kind).toBe("and");
    if (out.kind !== "and") throw new Error("unreachable");
    expect(out.operands).toHaveLength(11); // 10 operands + a `more` stub (DEF_EXPR_CAP = 10)
    expect(out.operands[10]).toEqual({ kind: "more", count: 3 });
  });
});
