/**
 * #224 ii.3 Todo 3 (MV Flow pane) — a `when` GUARD as a render outline.
 *
 * The Flow pane (crl-vscode/flowPaneHtml.ts) hangs a `defined as` composite's operator OUTLINE below its
 * `when` via `buildDefStruct` → a `DefStructExpr`. A `criterion` guard has no single concept, so the flow
 * dead-ends it (the body is never rendered). This module converts a SOURCE-side `when` guard `BranchCondition`
 * — following criterion refs INTO their bodies — into the SAME `DefStructExpr` the flow already renders, so a
 * criterion body becomes visible with ZERO new render type (`buildOutline` consumes it unchanged).
 *
 * Slice 1 = VISIBILITY: the criterion body renders expanded, INLINED (a nested criterion's body is spliced in
 * with no named sub-group — the questionnaire's first-class named `criterion` wrapper is Slice 2, which will
 * need its own type; do NOT read the "no DefStructExpr variant" choice here as settled beyond Slice 1).
 *
 * SAFETY (disc 318 [critical] 2): provenance runs on UNVALIDATED input, and a criterion DAG can double
 * (`C_k := C_{k-1} and C_{k-1}` → 2^k). `buildGuardOutlines` pre-gates each `when` on `expandedSize` exactly
 * as `branchConditionConceptRefsFollowingCriteria` does (branchCondition.ts) — a breaching/cyclic guard records
 * a `…` ELISION STUB (not an omission: omitting would re-open the masquerade, disc 318 review [important] 1),
 * so the host never walks an unbounded DAG. The converter additionally caps criterion-recursion HOPS + operand
 * WIDTH (mirroring `buildDefStruct`) as a render-time backstop.
 */
import { buildCriterionTable, containsCriterionRef, expandedSize, type CriterionTable } from "../ast/criterionExpansion";
import { decisionSpine } from "../ast/decisionSpine";
import type { BranchCondition, ReferenceName, WhenBlock } from "../ast/types";
import { getRefLibrary, getRefName, isQualifiedRef, normalizeLocalRef } from "../ast/types";
import type { ResolvedCelGraph } from "../cel/imports/types";

import {
  buildDefStruct,
  DEF_EXPR_CAP,
  DEF_MAX_EXPR_DEPTH,
  type DefExprIndex,
  type DefStructExpr,
  type ResolveDefExprEntry,
} from "./definedAsExpr";
import { collectLibs, conceptDeclRef, decisionSubNodeRef, lsLoc, nodeKey } from "./indexer";

/** Criterion-recursion HOP cap — the analog of `DEF_MAX_EXPR_DEPTH` for a criterion guard. A `visiting` cycle
 *  set stops only CYCLES; a shared/diamond criterion re-expands positionally at each reference (the doubling
 *  vector), so recursion is HOP-capped: at the cap a criterion ref degrades to a `…` `more` stub rather than
 *  recursing. The per-`when` `expandedSize` gate in `buildGuardOutlines` is the primary guard; this is defence
 *  in depth so the pure converter is bounded even if a caller skips the gate. */
const GUARD_MAX_CRITERION_HOPS = DEF_MAX_EXPR_DEPTH;

/**
 * Convert a `when` guard `BranchCondition` into the shared `DefStructExpr` outline (the flow's `buildOutline`
 * consumes it unchanged). `and`/`or`/`not` map 1:1; a concept ref → a `leaf` (with its OWN `defined as` body
 * nested as `.composite`, exactly the single-concept flow path); a criterion ref → its body, spliced inline
 * (cycle- and hop-guarded). A cross-library / unresolved concept, and a missing / cyclic / hop-capped criterion,
 * degrade to a stub (`external` / `more`) — never an unbounded walk. `resolveDefExpr` is the (lib,name) →
 * `DefExprEntry` resolver over the concept layer (built by the caller from a `DefExprIndex`).
 */
export function branchConditionToDefStruct(
  cond: BranchCondition,
  criterionTable: CriterionTable,
  resolveDefExpr: ResolveDefExprEntry,
  decisionLib: string,
): DefStructExpr {
  const leafOf = (ref: ReferenceName): DefStructExpr => {
    const normalized = normalizeLocalRef(ref, decisionLib);
    // Cross-library operand (still qualified after same-lib normalization) → an `external` stub (unsupported
    // v0, mirroring `buildDefStruct`'s cross-lib ref → external).
    if (isQualifiedRef(normalized)) {
      return { kind: "external", name: getRefName(normalized), lib: getRefLibrary(normalized) ?? decisionLib };
    }
    const name = getRefName(normalized);
    const entry = resolveDefExpr(decisionLib, name);
    // Unresolved (absent from the concept layer / location-less) → an `external` stub — unaddressable, not a
    // leaf (mirrors `buildDefStruct`'s location-less ref stub; keeps the flow's leaf-verdict join sound).
    if (!entry) return { kind: "external", name, lib: decisionLib };
    const leaf: Extract<DefStructExpr, { kind: "leaf" }> = {
      kind: "leaf",
      name: entry.name,
      lib: entry.lib,
      nodeKey: entry.nodeKey,
      isSource: entry.hasCodeIs,
      isInferred: entry.isInferred,
    };
    // A `defined as` concept leaf hangs its OWN operator body — byte-identical to the single-concept flow path
    // (`buildDefStruct(entry.body, …, {nodeKey}, 1)`), so a guard concept and a directly-gated concept render alike.
    if (entry.hasDefinedAs && entry.body) {
      leaf.composite = buildDefStruct(entry.body, resolveDefExpr, new Set([entry.nodeKey]), 1);
    }
    return leaf;
  };

  const go = (c: BranchCondition, visiting: ReadonlySet<string>, hops: number): DefStructExpr => {
    switch (c.type) {
      case "BranchConditionRef":
        return leafOf(c.ref);
      case "BranchConditionNot":
        return { kind: "not", operand: go(c.operand, visiting, hops) };
      case "BranchConditionAnd":
      case "BranchConditionOr": {
        const kind = c.type === "BranchConditionAnd" ? "and" : "or";
        const operands = c.operands.slice(0, DEF_EXPR_CAP).map((o) => go(o, visiting, hops));
        if (c.operands.length > DEF_EXPR_CAP) operands.push({ kind: "more", count: c.operands.length - DEF_EXPR_CAP });
        return { kind, operands };
      }
      case "BranchConditionCriterionRef": {
        const name = getRefName(c.ref);
        const crit = criterionTable.get(name);
        // Missing or cyclic → a benign `external` stub (bounded); never contribute an unbounded walk.
        if (!crit || visiting.has(name)) return { kind: "external", name, lib: decisionLib };
        // Hop cap → a `…` depth stub (mirrors `buildDefStruct`'s `DEF_MAX_EXPR_DEPTH` → `{kind:"more",count:0}`).
        if (hops >= GUARD_MAX_CRITERION_HOPS) return { kind: "more", count: 0 };
        return go(crit.condition, new Set(visiting).add(name), hops + 1);
      }
    }
  };

  return go(cond, new Set(), 0);
}

/**
 * Guard outlines for every criterion-bearing `when` in the covered policy + registry libraries, keyed by the
 * `when`'s structure nodeKey (join key with the Flow pane's `when` nodes). Walks decisions EXACTLY as
 * `buildCrlStructure` does — default `collectLibs(graph)`, source-order `statements` filtered to decisions, the
 * same location-less decl/sub-node skips, the non-recursive `decisionSpine`, and the shared `decisionSubNodeRef`
 * key — so every entry joins a real flow node (a walk divergence would silently miss → the dead-end would
 * persist; a parity test pins it). A criterion-free `when` is OMITTED (Slice 1 does not touch single-concept or
 * plain-compound-guard rendering). A guard whose expansion breaches the envelope is OMITTED (host safety).
 */
export function buildGuardOutlines(graph: ResolvedCelGraph, defExprIndex: DefExprIndex): Map<string, DefStructExpr> {
  const out = new Map<string, DefStructExpr>();
  const { libs, coversName } = collectLibs(graph);
  if (!coversName) return out; // no policy anchor → empty (mirrors buildCrlStructure)
  // Resolver over the PASSED index (not the host-side `buildDefExprResolver`), same key rule as the cockpit.
  const resolveDefExpr: ResolveDefExprEntry = (lib, name) =>
    lib === undefined ? undefined : defExprIndex.get(nodeKey(conceptDeclRef(lib, name)));

  for (const [lib, info] of libs) {
    const criterionTable = buildCriterionTable(info.entry.ast.statements);
    for (const s of info.entry.ast.statements) {
      if (s.type !== "Decision") continue;
      if (!lsLoc(info.entry.filePath, s.location)) continue; // mirror the indexer: skip a location-less decl
      for (const sn of decisionSpine(s)) {
        if (sn.kind !== "when") continue;
        if (!lsLoc(info.entry.filePath, sn.node.location)) continue; // mirror the per-sub-node skip
        const cond = (sn.node as WhenBlock).condition;
        if (!containsCriterionRef(cond)) continue; // Slice 1: only criterion-bearing whens
        const key = nodeKey(decisionSubNodeRef(lib, s.name, sn.nodeId));
        // Envelope gate (host safety): a breaching/cyclic table would let `branchConditionToDefStruct` walk an
        // unbounded DAG. On a breach we still record an ENTRY — a single `…` elision stub — NOT omit. Omitting
        // would leave `guardOutline` undefined while `refKeysOf` (crlStructure.ts) falls back to the guard's INLINE
        // refs; a `when ("A" and <breaching-criterion>)` then flattens to `refKeys=["A"]` and the flow would
        // masquerade the box as concept A (disc 318 review [important] 1). Recording the stub keeps the flow's
        // precedence gate engaged (`guardOutline` truthy ⇒ concept identity suppressed ⇒ neutral box), and the `…`
        // row honestly signals "a criterion body is here but was too complex to expand".
        if (expandedSize(cond, criterionTable).status !== "ok") {
          out.set(key, { kind: "more", count: 0 });
          continue;
        }
        out.set(key, branchConditionToDefStruct(cond, criterionTable, resolveDefExpr, lib));
      }
    }
  }
  return out;
}
