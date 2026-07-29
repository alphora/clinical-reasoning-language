import { describe, expect, it } from "vitest";

import { buildCriterionTable } from "../../ast/criterionExpansion";
import { classifyCriterionRefs } from "../../ast/criterionClassify";
import { parseInput } from "../../ast/tests/parseInput";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import { leafEligibleConcepts } from "../../cql-emitter/lowerLocalCodes";
import { buildCrlConceptLayer } from "../crlConceptLayer";
import { buildDefExprIndex, DEF_MAX_EXPR_DEPTH, type DefStructExpr, type ResolveDefExprEntry } from "../definedAsExpr";
import { branchConditionToDefStruct, buildCriterionIdentities, buildGuardOutlines, criterionGateIdentities, criterionKey, topCriterion } from "../guardOutline";
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

    // The single-criterion-ref when's identity + body fingerprint (the collapse/verdict unit) is DERIVED via topCriterion.
    const sole = topCriterion(outlines.get(eligKey)!.expr)!;
    expect(sole.lib).toBe("T");
    expect(sole.name).toBe("Elig");
    expect(sole.bodyHash).toMatch(/^sha256:[0-9a-f]{16}$/);

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

  it("#233: a SOLE criterion `when` wraps its body in a named `criterion` node whose operand is `and(Inf{composite or(A,B)}, C)`", () => {
    const graph = graphFrom(CRL, CEL);
    const expr = buildGuardOutlines(graph, defIndexOf(graph)).get(nodeKey(decisionSubNodeRef("T", "D", "when[0]")))!.expr;
    // #233: the top-level expr is now a CRITERION BOUNDARY node (name preserved), not the inlined `and`.
    expect(expr.kind).toBe("criterion");
    if (expr.kind !== "criterion") throw new Error("unreachable");
    expect(expr.name).toBe("Elig");
    expect(expr.lib).toBe("T");
    expect(expr.bodyHash).toMatch(/^sha256:[0-9a-f]{16}$/);
    expect(expr.elided).toBeUndefined(); // a fully-rendered body is not elided

    const outline = expr.operand; // the criterion's body outline hangs BELOW the boundary
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

  it("#233: a cyclic criterion in a COMPOUND guard yields a NAMED elided `criterion` node (NOT a bare `more` that erases the name)", () => {
    // `when ( "A" and "C1" )` where C1 is cyclic. Pre-#233 the whole guard collapsed to `{kind:"more"}`, erasing
    // the criterion NAME. #233 preserves the boundary: the criterion keeps its name with a `…` body. The precedence
    // gate stays engaged the same way — `guardOutline` is truthy (a criterion node), so `refKeysOf` never
    // masquerades the box as concept A. Host-safe: the per-criterion hop/cycle caps bound the walk (no whole-guard gate).
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
    const rec = outlines.get(nodeKey(decisionSubNodeRef("T", "D", "when[0]")))!;
    // Compound guard (`A and C1`) → no sole criterion (top-level is `and`, not a single criterion node).
    expect(topCriterion(rec.expr)).toBeUndefined();
    expect(rec.expr.kind).toBe("and");
    if (rec.expr.kind !== "and") throw new Error("unreachable");
    const [a, c1] = rec.expr.operands;
    expect(a.kind).toBe("leaf"); // A resolves to a concept leaf
    expect(a.kind === "leaf" && a.name).toBe("A");
    // The criterion boundary SURVIVES the cycle with its name — the whole point of #233 (NOT a bare `more`).
    expect(c1.kind).toBe("criterion");
    if (c1.kind !== "criterion") throw new Error("unreachable");
    expect(c1.name).toBe("C1");
    expect(c1.elided).toBe(true);
  });

  it("#233: a SINGLE cyclic criterion → a NAMED `criterion` expr + derived sole identity (topCriterion) with `elided:true`", () => {
    const cyc = `library "T".
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
criterion "C1":
- when "C2".
criterion "C2":
- when "C1".
decision "D":
first:
- when "C1" then recommend activity "X".
- otherwise then recommend activity "X".`;
    const graph = graphFrom(cyc, CEL);
    const rec = buildGuardOutlines(graph, defIndexOf(graph)).get(nodeKey(decisionSubNodeRef("T", "D", "when[0]")))!;
    // #233: the sole criterion keeps its NAME (was a bare `{kind:"more"}`); the sole identity is DERIVED via topCriterion.
    expect(rec.expr.kind).toBe("criterion");
    if (rec.expr.kind !== "criterion") throw new Error("unreachable");
    expect(rec.expr.name).toBe("C1");
    expect(rec.expr.elided).toBe(true);
    expect(topCriterion(rec.expr)).toMatchObject({ lib: "T", name: "C1", elided: true });
    expect(topCriterion(rec.expr)!.bodyHash).toMatch(/^sha256:[0-9a-f]{16}$/);
  });

  it("#233: a COMPOUND `when (A and CritC)` yields an `and` with a NAMED `criterion` node (name preserved, body hung below)", () => {
    const src = `library "T".
concept "A":
- type is Observation.
- code is \`a\`.
concept "Cc":
- type is Observation.
- code is \`c\`.
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
criterion "CritC":
- when "Cc".
decision "D":
first:
- when ( "A" and "CritC" ) then recommend activity "X".
- otherwise then recommend activity "X".`;
    const graph = graphFrom(src, CEL);
    const rec = buildGuardOutlines(graph, defIndexOf(graph)).get(nodeKey(decisionSubNodeRef("T", "D", "when[0]")))!;
    expect(topCriterion(rec.expr)).toBeUndefined(); // compound guard → no top-level sole criterion
    expect(rec.expr.kind).toBe("and");
    if (rec.expr.kind !== "and") throw new Error("unreachable");
    const [a, crit] = rec.expr.operands;
    expect(a.kind === "leaf" && a.name).toBe("A"); // the plain conjunct stays a concept leaf
    expect(crit.kind).toBe("criterion"); // the criterion conjunct is a first-class boundary (#233)
    if (crit.kind !== "criterion") throw new Error("unreachable");
    expect(crit.name).toBe("CritC");
    expect(crit.elided).toBeUndefined();
    expect(crit.operand.kind).toBe("leaf"); // CritC's body (`Cc`) hangs below the boundary
    expect(crit.operand.kind === "leaf" && crit.operand.name).toBe("Cc");
  });

  it("#233: a nested criterion (criterion whose body references another criterion) yields NESTED `criterion` nodes", () => {
    const src = `library "T".
concept "Leaf1":
- type is Observation.
- code is \`l1\`.
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
criterion "Inner":
- when "Leaf1".
criterion "Outer":
- when "Inner".
decision "D":
first:
- when "Outer" then recommend activity "X".
- otherwise then recommend activity "X".`;
    const graph = graphFrom(src, CEL);
    const expr = buildGuardOutlines(graph, defIndexOf(graph)).get(nodeKey(decisionSubNodeRef("T", "D", "when[0]")))!.expr;
    expect(expr.kind).toBe("criterion");
    if (expr.kind !== "criterion") throw new Error("unreachable");
    expect(expr.name).toBe("Outer");
    // Outer's body is a NESTED criterion boundary for Inner (not inlined) — #233 preserves the boundary at every hop.
    expect(expr.operand.kind).toBe("criterion");
    if (expr.operand.kind !== "criterion") throw new Error("unreachable");
    expect(expr.operand.name).toBe("Inner");
    expect(expr.operand.operand.kind).toBe("leaf"); // Inner's body is the concept Leaf1
    expect(expr.operand.operand.kind === "leaf" && expr.operand.operand.name).toBe("Leaf1");
  });

  it("#233: buildCriterionIdentities — one CANONICAL entry per declared criterion, hash INDEPENDENT of reference position", () => {
    // "Shared" is referenced at depth 0 (`when "Shared"`) AND depth 1 (nested in "Wrapper": `when "Wrapper"` →
    // `when "Shared"`). Its canonical identity must be the SAME at both positions.
    const src = `library "T".
concept "L":
- type is Observation.
- code is \`l\`.
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
criterion "Shared":
- when "L".
criterion "Wrapper":
- when "Shared".
decision "D":
first:
- when "Shared" then recommend activity "X".
- when "Wrapper" then recommend activity "X".
- otherwise then recommend activity "X".`;
    const graph = graphFrom(src, CEL);
    const defIndex = defIndexOf(graph);
    const identities = buildCriterionIdentities(graph, defIndex);
    // Exactly one canonical entry per DECLARED criterion (keyed collision-proof by `JSON.stringify([lib,name])`).
    expect([...identities.keys()].sort()).toEqual([JSON.stringify(["T", "Shared"]), JSON.stringify(["T", "Wrapper"])]);
    const sharedId = identities.get(JSON.stringify(["T", "Shared"]))!;
    expect(sharedId).toMatchObject({ lib: "T", name: "Shared", elided: false });
    expect(sharedId.bodyHash).toMatch(/^sha256:[0-9a-f]{16}$/);

    const outlines = buildGuardOutlines(graph, defIndex);
    // Depth 0: `when "Shared"` → a criterion node whose canonical bodyHash == the map's identity.
    const soleExpr = outlines.get(nodeKey(decisionSubNodeRef("T", "D", "when[0]")))!.expr;
    expect(soleExpr.kind === "criterion" && soleExpr.bodyHash).toBe(sharedId.bodyHash);
    // Depth 1: `when "Wrapper"` → Wrapper node whose OPERAND is the nested "Shared" node — SAME canonical bodyHash.
    const wrapExpr = outlines.get(nodeKey(decisionSubNodeRef("T", "D", "when[1]")))!.expr;
    if (wrapExpr.kind !== "criterion" || wrapExpr.operand.kind !== "criterion") throw new Error("unreachable");
    expect(wrapExpr.operand.name).toBe("Shared");
    expect(wrapExpr.operand.bodyHash).toBe(sharedId.bodyHash); // position-INDEPENDENT identity
  });

  it("#233 host safety (Fix 1): a WIDE-FAN criterion that DEFEATS the width cap by grouping breaches → NAMED elided nodes, terminates fast", () => {
    // Ck references C(k-1) 20 TIMES via two groups of 10 (`(x…10) and (x…10)`) — 20 > DEF_EXPR_CAP(10), so the per-
    // `and`/`or` width cap alone does NOT bound it. Fan-out 20 per hop ⇒ atoms 20^k: C1=20, C2=400, C3=8000 > 1024
    // atom cap ⇒ breach. Without the expandedSize pre-gate + hop-budget-0 response, a root render of `when C3` would
    // materialize ~20^4 nodes (hop cap 4). WITH it, C3 elides immediately. The test COMPLETING is the boundedness proof.
    const group10 = (ref: string): string => `( ${Array.from({ length: 10 }, () => `"${ref}"`).join(" and ")} )`;
    const wideBody = (prev: string): string => `( ${group10(prev)} and ${group10(prev)} )`; // 20 refs, width-cap-defeating
    let crl = `library "T".\nconcept "L0":\n- type is Observation.\n- code is \`l0\`.\nactivity "X":\n- request CPGCommunicationRequest.\n- with \`x\`.\n`;
    for (let k = 1; k <= 3; k++) crl += `criterion "C${k}":\n- when ${wideBody(`C${k - 1}`).replace(/"C0"/g, '"L0"')}.\n`;
    crl += `decision "D":\nfirst:\n- when "C3" then recommend activity "X".\n- otherwise then recommend activity "X".`;
    const graph = graphFrom(crl, CEL);
    const defIndex = defIndexOf(graph);
    const identities = buildCriterionIdentities(graph, defIndex); // over C1..C3 — must terminate (no DAG blowup)
    const rec = buildGuardOutlines(graph, defIndex).get(nodeKey(decisionSubNodeRef("T", "D", "when[0]")))!;
    // `when C3` breached → a NAMED elided criterion node with NO body expansion (hop budget 0), not a bare `more`.
    expect(rec.expr.kind).toBe("criterion");
    if (rec.expr.kind !== "criterion") throw new Error("unreachable");
    expect(rec.expr.name).toBe("C3");
    expect(rec.expr.elided).toBe(true);
    expect(rec.expr.operand).toEqual({ kind: "more", count: 0 }); // body NOT expanded (linear cost, not 20^4)
    // The breaching criterion's canonical identity is also `elided` (permanently un-passable, disc 327 point 2).
    expect(identities.get(JSON.stringify(["T", "C3"]))!.elided).toBe(true);
  });

  it("#233 canonical hop (Fix 3): a chain of exactly the hop cap has the SAME `elided` in the identity map as in its rendered sole node", () => {
    // Chain C1→C2→C3→C4→C5→L. A ROOT render of `when C1` wraps C1 at hop 0 then expands the body at hop 1, so the
    // 5th criterion (C5) sits at hop `DEF_MAX_EXPR_DEPTH` and ELIDES. Expanding `crit.condition` directly (the OLD
    // off-by-one) would reach one criterion DEEPER and read `elided:false` — a durable verdict against a body the
    // reviewer saw truncated. Identity now routes through a synthetic ROOT ref, so the two agree BY CONSTRUCTION.
    expect(DEF_MAX_EXPR_DEPTH).toBe(4); // the chain length below is tuned to this cap
    const crl = `library "T".
concept "L":
- type is Observation.
- code is \`l\`.
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
criterion "C1":
- when "C2".
criterion "C2":
- when "C3".
criterion "C3":
- when "C4".
criterion "C4":
- when "C5".
criterion "C5":
- when "L".
decision "D":
first:
- when "C1" then recommend activity "X".
- otherwise then recommend activity "X".`;
    const graph = graphFrom(crl, CEL);
    const defIndex = defIndexOf(graph);
    const identities = buildCriterionIdentities(graph, defIndex);
    const soleNode = buildGuardOutlines(graph, defIndex).get(nodeKey(decisionSubNodeRef("T", "D", "when[0]")))!.expr;
    expect(soleNode.kind).toBe("criterion");
    if (soleNode.kind !== "criterion") throw new Error("unreachable");
    // The rendered sole node elides at the hop boundary …
    expect(soleNode.elided).toBe(true);
    // … and the canonical identity agrees EXACTLY (Fix 3 — no off-by-one). A false here means a durable verdict could
    // be stored against a body every render shows truncated.
    expect(identities.get(JSON.stringify(["T", "C1"]))!.elided).toBe(soleNode.elided ?? false);
    expect(identities.get(JSON.stringify(["T", "C1"]))!.elided).toBe(true);
  });

  it("#233 identity sensitivity (Fix 4a): a NESTED criterion body change flips the referencing criterion's hash; unrelated + reorder do NOT", () => {
    // Outer → Inner → (L1 | L2). Two graphs differ ONLY in Inner's body. Outer's canonical body embeds Inner's OPERAND
    // (the blank-nested-token rule blanks Inner's hash TOKEN but keeps its expanded CONTENT), so the change is detected.
    const mk = (innerRef: string, unrelatedRef: string, order: "inner-first" | "outer-first"): string => {
      const decls = `concept "L1":\n- type is Observation.\n- code is \`l1\`.\nconcept "L2":\n- type is Observation.\n- code is \`l2\`.\nactivity "X":\n- request CPGCommunicationRequest.\n- with \`x\`.\n`;
      const inner = `criterion "Inner":\n- when "${innerRef}".\n`;
      const outer = `criterion "Outer":\n- when "Inner".\n`;
      const unrelated = `criterion "Unrelated":\n- when "${unrelatedRef}".\n`;
      const crits = order === "inner-first" ? inner + outer + unrelated : outer + unrelated + inner;
      return `library "T".\n${decls}${crits}decision "D":\nfirst:\n- when "Outer" then recommend activity "X".\n- otherwise then recommend activity "X".`;
    };
    const idOf = (crl: string) => {
      const g = graphFrom(crl, CEL);
      return buildCriterionIdentities(g, defIndexOf(g));
    };
    const kOuter = JSON.stringify(["T", "Outer"]);
    const kInner = JSON.stringify(["T", "Inner"]);

    const base = idOf(mk("L1", "L1", "inner-first"));
    const innerChanged = idOf(mk("L2", "L1", "inner-first")); // ONLY Inner's body differs (L1 → L2)
    const unrelatedChanged = idOf(mk("L1", "L2", "inner-first")); // ONLY Unrelated's body differs
    const reordered = idOf(mk("L1", "L1", "outer-first")); // identical semantics, different statement order

    // (1) A change to the NESTED criterion (Inner) flips BOTH Inner's own hash AND the referencing Outer's hash.
    expect(innerChanged.get(kInner)!.bodyHash).not.toBe(base.get(kInner)!.bodyHash);
    expect(innerChanged.get(kOuter)!.bodyHash).not.toBe(base.get(kOuter)!.bodyHash);
    // (2) An UNRELATED criterion change flips NEITHER Inner nor Outer.
    expect(unrelatedChanged.get(kInner)!.bodyHash).toBe(base.get(kInner)!.bodyHash);
    expect(unrelatedChanged.get(kOuter)!.bodyHash).toBe(base.get(kOuter)!.bodyHash);
    // (3) Declaration-order independence — the same document reordered yields identical hashes.
    expect(reordered.get(kInner)!.bodyHash).toBe(base.get(kInner)!.bodyHash);
    expect(reordered.get(kOuter)!.bodyHash).toBe(base.get(kOuter)!.bodyHash);
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
    const out = branchConditionToDefStruct(table.get("K")!.condition, table, stubResolve, "T", new Map());
    expect(out.kind).toBe("and");
    if (out.kind !== "and") throw new Error("unreachable");
    expect(out.operands[0]).toEqual({ kind: "external", name: "A", lib: "T" });
    expect(out.operands[1].kind).toBe("not");
    const notNode = out.operands[1] as Extract<DefStructExpr, { kind: "not" }>;
    expect(notNode.operand).toEqual({ kind: "external", name: "B", lib: "T" });
  });

  it("#233: wraps a nested criterion in a `criterion` node; a criterion CYCLE terminates at a NAMED elided node (visiting guard)", () => {
    const src = `library "T".
criterion "C1":
- when "C2".
criterion "C2":
- when "C1".`;
    const table = buildCriterionTable(classifyCriterionRefs(parseInput(src)).statements);
    // C1 → C2 → C1 → (C2 already visiting) → a NAMED elided criterion node (not an `external` stub). Terminates.
    const out = branchConditionToDefStruct(table.get("C1")!.condition, table, stubResolve, "T", new Map());
    // Top wrapper for C2 (C1's body is a bare ref to C2).
    expect(out.kind).toBe("criterion");
    if (out.kind !== "criterion") throw new Error("unreachable");
    expect(out.name).toBe("C2");
    expect(out.bodyHash).toBe("sha256:missing"); // empty identity map → the stable MISSING token
    // C2's body wraps C1 …
    expect(out.operand.kind).toBe("criterion");
    if (out.operand.kind !== "criterion") throw new Error("unreachable");
    expect(out.operand.name).toBe("C1");
    // … whose body re-enters C2, now on the `visiting` path → a NAMED elided criterion node (name kept, `…` body).
    expect(out.operand.operand.kind).toBe("criterion");
    if (out.operand.operand.kind !== "criterion") throw new Error("unreachable");
    expect(out.operand.operand.name).toBe("C2");
    expect(out.operand.operand.elided).toBe(true);
    expect(out.operand.operand.operand).toEqual({ kind: "more", count: 0 });
  });

  it("caps operand WIDTH at DEF_EXPR_CAP with a `+N more` stub", () => {
    const wide = Array.from({ length: 13 }, (_, i) => `"A${i}"`).join(" and ");
    const src = `library "T".
${Array.from({ length: 13 }, (_, i) => `concept "A${i}":\n- type is Observation.\n- code is \`a${i}\`.`).join("\n")}
criterion "Wide":
- when ( ${wide} ).`;
    const table = buildCriterionTable(classifyCriterionRefs(parseInput(src)).statements);
    const out = branchConditionToDefStruct(table.get("Wide")!.condition, table, stubResolve, "T", new Map());
    expect(out.kind).toBe("and");
    if (out.kind !== "and") throw new Error("unreachable");
    expect(out.operands).toHaveLength(11); // 10 operands + a `more` stub (DEF_EXPR_CAP = 10)
    expect(out.operands[10]).toEqual({ kind: "more", count: 3 });
  });

  it("#233 Todo 2b GATE: criterionGateIdentities = criteria REACHABLE from guards ONLY — a declared-but-unused criterion is EXCLUDED (no livelock, disc 330)", () => {
    const src = `library "T".
concept "A":
- type is Observation.
- code is \`a\`.
concept "B":
- type is Observation.
- code is \`b\`.
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
criterion "Used":
- when "A".
criterion "Orphan":
- when "B".
decision "D":
first:
- when "Used" then recommend activity "X".
- otherwise then recommend activity "X".`;
    const graph = graphFrom(src, CEL);
    const defIndex = defIndexOf(graph);
    const identities = buildCriterionIdentities(graph, defIndex);
    // The CANONICAL inventory stamps EVERY declared criterion — both Used and Orphan.
    expect([...identities.keys()].sort()).toEqual([criterionKey("T", "Orphan"), criterionKey("T", "Used")].sort());
    const gate = criterionGateIdentities(buildGuardOutlines(graph, defIndex, identities), identities);
    // The GATE set has ONLY "Used" (in a decision guard). "Orphan" (declared, never referenced) renders nowhere → EXCLUDED,
    // so it can never livelock `mvComplete` with an un-findable entry.
    expect([...gate.keys()]).toEqual([criterionKey("T", "Used")]);
    expect(gate.get(criterionKey("T", "Used"))).toMatchObject({ lib: "T", name: "Used", elided: false });
  });

  it("#233 Todo 2b GATE: a criterion reachable ONLY through another criterion's body IS gated; a criterion at multiple sites is deduped", () => {
    const src = `library "T".
concept "A":
- type is Observation.
- code is \`a\`.
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
criterion "Inner":
- when "A".
criterion "Outer":
- when "Inner".
decision "D":
first:
- when ( "Outer" and "Inner" ) then recommend activity "X".
- otherwise then recommend activity "X".`;
    const graph = graphFrom(src, CEL);
    const defIndex = defIndexOf(graph);
    const identities = buildCriterionIdentities(graph, defIndex);
    const gate = criterionGateIdentities(buildGuardOutlines(graph, defIndex, identities), identities);
    // Inner is reachable BOTH directly (a conjunct) AND nested inside Outer's body → gated ONCE; Outer gated too.
    expect([...gate.keys()].sort()).toEqual([criterionKey("T", "Inner"), criterionKey("T", "Outer")].sort());
  });
});
