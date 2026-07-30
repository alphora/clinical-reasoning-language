/**
 * #224 ii.3 Todo 3 (MV Flow pane) — a `when` GUARD as a render outline.
 *
 * The Flow pane (crl-vscode/flowPaneHtml.ts) hangs a `defined as` composite's operator OUTLINE below its
 * `when` via `buildDefStruct` → a `DefStructExpr`. A `criterion` guard has no single concept, so the flow
 * dead-ends it (the body is never rendered). This module converts a SOURCE-side `when` guard `BranchCondition`
 * — following criterion refs INTO their bodies — into the SAME `DefStructExpr` the flow already renders, so a
 * criterion body becomes visible with ZERO new render type (`buildOutline` consumes it unchanged).
 *
 * #242 broadened the producer (`buildGuardOutlines`) from criterion-bearing guards ONLY to EVERY compound guard
 * (`and`/`or`/`not`) — a plain compound guard of bare refs used to render as one opaque node, hiding structure the
 * questionnaire pane already decomposes. Same converter, same render type; a criterion-free compound simply yields
 * an outline with no `criterion` nodes (purely visual — inert for the verdict/gate consumers).
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
import { createHash } from "node:crypto";

import { buildCriterionTable, expandedSize, type CriterionTable } from "../ast/criterionExpansion";
import { decisionSpine } from "../ast/decisionSpine";
import type { BranchCondition, BranchConditionCriterionRef, ReferenceName, WhenBlock } from "../ast/types";
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

/** #224 ii.3 Slice 2 / #233 Todo 2b: a `when` guard's render outline. The SOLE-criterion identity (the collapse +
 *  model-level-VERDICT unit when the guard's TOP expr is a single criterion ref) is DERIVED on demand via
 *  `topCriterion(expr)` — no longer a stored `soleCriterion` sidecar (retired disc 330: it was a second view of a fact
 *  `expr` already carries, and the model-level verdict/gate now source from the render-independent `buildCriterionIdentities`
 *  inventory, which covers compound-only + nested criteria too). Criteria are LIBRARY-LOCAL (operator-confirmed), so a
 *  criterion ref is always unqualified and its lib is the decision's lib. */
export interface GuardOutline {
  expr: DefStructExpr;
}

/** A stable, short content fingerprint of a rendered guard body — the verdict staleness key. `JSON.stringify` is
 *  deterministic given the builder's fixed field order (branchConditionToDefStruct / buildDefStruct), so the SAME body
 *  hashes identically every build and any structural change (a concept added, a composite edited, a cap tripped) flips it. */
const hashExpr = (e: DefStructExpr): string =>
  "sha256:" + createHash("sha256").update(JSON.stringify(e), "utf8").digest("hex").slice(0, 16);

/** Does the rendered body contain a `…`/`+N more` elision stub? A `more` node means content was dropped (breach or cap),
 *  so `bodyHash` is not a faithful fingerprint — see `CriterionIdentity.elided` + the criterion node's in-situ `elided`. */
const exprHasMore = (e: DefStructExpr): boolean => {
  switch (e.kind) {
    case "more":
      return true;
    case "and":
    case "or":
      return e.operands.some(exprHasMore);
    case "not":
      return exprHasMore(e.operand);
    case "criterion":
      // #233: a criterion boundary hides a `…` iff its own body outline dropped content (breach/cap at THIS position).
      return exprHasMore(e.operand);
    case "leaf":
      return e.composite !== undefined && exprHasMore(e.composite);
    case "external":
      return false;
  }
};

/** #233: the criterion identity key — `JSON.stringify([lib, name])`, COLLISION-PROOF (CRL library AND criterion
 *  names routinely contain spaces, e.g. "Generic Medical Policy", so ANY single-char delimiter collides:
 *  `("A B","C")` vs `("A","B C")`). Matches the repo convention (`criterionVerdictKey` in medicalValidationStore,
 *  `truthKey` in questionnaireModel) so Todo 2b keys IDENTICALLY. Exported for that reason — do not re-manufacture the
 *  encoding downstream. (A `JSON.stringify` of an array is not a template literal, so the Edit-tool NUL hazard is moot.) */
export const criterionKey = (lib: string, name: string): string => JSON.stringify([lib, name]);

/** Stable fingerprint for a criterion whose declaration is absent from the identity map (a genuinely MISSING /
 *  undefined criterion ref). A constant, so every missing ref shares one identity token — the name still survives. */
const MISSING_BODY_HASH = "sha256:missing";

/** The identity of a guard whose top-level `expr` IS a single criterion node (the sole-criterion case) — else
 *  `undefined`. `bodyHash` is the node's CANONICAL fingerprint (occurrence-independent, stamped from the identity
 *  map); `elided` is the in-situ render fact. At the guard ROOT the two AGREE BY CONSTRUCTION: `buildCriterionIdentities`
 *  computes each canonical body as the `.operand` of a synthetic ROOT reference routed through the IDENTICAL converter +
 *  breach pre-gate this sole render uses, so a sole node's `elided` equals its canonical `elided` (no hop off-by-one).
 *  Todo 2 uses this for root-absorption (the sole render stays byte-identical) and to retire `soleCriterion` host reads. */
export const topCriterion = (
  expr: DefStructExpr,
): { lib: string; name: string; bodyHash: string; elided?: true } | undefined =>
  expr.kind === "criterion"
    ? { lib: expr.lib, name: expr.name, bodyHash: expr.bodyHash, ...(expr.elided ? { elided: true as const } : {}) }
    : undefined;

/**
 * Convert a `when` guard `BranchCondition` into the shared `DefStructExpr` outline (the flow's `buildOutline`
 * consumes it unchanged). `and`/`or`/`not` map 1:1; a concept ref → a `leaf` (with its OWN `defined as` body
 * nested as `.composite`, exactly the single-concept flow path); a criterion ref → a first-class named `criterion`
 * BOUNDARY node WRAPPING its body (#233 — at EVERY reference position: sole, compound conjunct, nested), cycle- and
 * hop-guarded. A cross-library / unresolved concept degrades to an `external` stub; a missing / cyclic / hop-capped
 * criterion keeps its NAME as a `criterion` node with an `elided` `…` body — never an unbounded walk. `resolveDefExpr`
 * is the (lib,name) → `DefExprEntry` resolver over the concept layer (built by the caller from a `DefExprIndex`).
 *
 * `criterionIdentities` supplies each criterion node's CANONICAL `bodyHash` (from `buildCriterionIdentities`, keyed by
 * `criterionKey(lib,name)`) — occurrence-INDEPENDENT, so the SAME criterion referenced at two depths carries the same
 * identity. It is NOT `hashExpr(operand)`: the in-situ operand varies by position (hop budget), while identity must not.
 *
 * `maxHops` is the criterion-recursion budget (default `GUARD_MAX_CRITERION_HOPS`). The caller lowers it to `0` on a
 * host-safety BREACH (`expandedSize` non-"ok"): every criterion ref then degrades to a NAMED elided node with NO body
 * expansion, so a machine-generated fan-out/doubling guard (whose per-`and`/`or` width caps are defeated by GROUPING)
 * costs LINEAR in the authored guard AST instead of exploding through criterion recursion (F+F²+…+F^maxHops).
 */
export function branchConditionToDefStruct(
  cond: BranchCondition,
  criterionTable: CriterionTable,
  resolveDefExpr: ResolveDefExprEntry,
  decisionLib: string,
  criterionIdentities: ReadonlyMap<string, { bodyHash: string }>,
  maxHops: number = GUARD_MAX_CRITERION_HOPS,
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
        // Canonical (occurrence-independent) fingerprint from the identity map; a genuinely undefined criterion has
        // no map entry → a stable MISSING token (the node still keeps its name — #233).
        const bodyHash = criterionIdentities.get(criterionKey(decisionLib, name))?.bodyHash ?? MISSING_BODY_HASH;
        const crit = criterionTable.get(name);
        // #233: WRAP FIRST, then elide — a missing OR cyclic criterion keeps its NAME as a `criterion` node with a
        // `…` body (was: a name-erasing `external` stub). The `…` honestly signals "a criterion body is here but
        // can't be shown"; the boundary + name is the whole point of #233.
        if (!crit || visiting.has(name)) {
          return { kind: "criterion", name, lib: decisionLib, bodyHash, elided: true, operand: { kind: "more", count: 0 } };
        }
        // Hop cap (or a `maxHops: 0` breach budget) → wrap FIRST, THEN cap the body → a NAMED elided node
        // ("Substantial Co-Morbidity …", not bare "…"). At budget 0 the FIRST ref (hops 0) elides immediately.
        if (hops >= maxHops) {
          return { kind: "criterion", name, lib: decisionLib, bodyHash, elided: true, operand: { kind: "more", count: 0 } };
        }
        const operand = go(crit.condition, new Set(visiting).add(name), hops + 1);
        // `elided` is the IN-SITU render fact: this occurrence's body dropped content to a `…` (a nested breach/cap),
        // computed from the built operand (reusing `exprHasMore`). Identity elision is separate (the canonical map).
        return {
          kind: "criterion",
          name,
          lib: decisionLib,
          bodyHash,
          operand,
          ...(exprHasMore(operand) ? { elided: true as const } : {}),
        };
      }
    }
    // #242 exhaustiveness backstop: `buildGuardOutlines` now routes EVERY non-single-ref guard here (the closed-world
    // default flipped from skip→convert), so a future `BranchCondition` variant MUST fail at COMPILE time — not fall
    // through this switch returning `undefined` (→ `{expr: undefined}` crashing topCriterion/exprHasMore/the flow render;
    // `noImplicitReturns` is off, so only this `never` assertion catches it).
    return ((x: never) => x)(c);
  };

  return go(cond, new Set(), 0);
}

/**
 * Guard outlines for every COMPOUND (or criterion-bearing) `when` in the covered policy + registry libraries, keyed
 * by the `when`'s structure nodeKey (join key with the Flow pane's `when` nodes). Walks decisions EXACTLY as
 * `buildCrlStructure` does — default `collectLibs(graph)`, source-order `statements` filtered to decisions, the
 * same location-less decl/sub-node skips, the non-recursive `decisionSpine`, and the shared `decisionSubNodeRef`
 * key — so every entry joins a real flow node (a walk divergence would silently miss → the dead-end would
 * persist; a parity test pins it). #242: an outline is built for every guard that is NOT a single bare ref
 * (`and`/`or`/`not`, and a sole `criterion` ref); a single bare `BranchConditionRef` is OMITTED (its single-concept
 * rendering — branch B — is untouched). A criterion-free compound guard converts with NO criterion nodes, so the
 * downstream verdict/gate consumers (`criterionGateIdentities`, `topCriterion`) are inert for it — it is a purely
 * VISUAL decomposition (per-operand `leaf` rows + any `defined as` composite bodies).
 *
 * #233 BREACH-PRESERVING conversion: the former whole-guard `expandedSize` pre-gate collapsed a breaching/cyclic
 * guard to a single bare `{kind:"more"}`, ERASING every criterion NAME. What erased the names was NOT the gate — it
 * was the RESPONSE to it (collapse to a bare stub). So the O(table), saturating, non-materializing `expandedSize`
 * PRE-CHECK STAYS (its 1024-atom hard cap is the host-safety bound — the per-`and`/`or` width cap is defeated by
 * GROUPING, e.g. `and(g1..g10)` with `gi = and(10 refs)` is 100 refs all under the cap, and criterion recursion then
 * multiplies F+F²+…+F^hops → OOM on a machine-generated file). But on a breach the RESPONSE changes: convert with a
 * HOP BUDGET OF 0, so EVERY criterion ref becomes a NAMED elided node (name kept, `…` body, NO expansion) — cost linear
 * in the authored guard AST. The precedence gate stays engaged: a breaching guard still yields a truthy `guardOutline`
 * (a NAMED criterion node, not a bare `…`), so `refKeysOf` never masquerades the box.
 */
export function buildGuardOutlines(
  graph: ResolvedCelGraph,
  defExprIndex: DefExprIndex,
  // #233 Todo 2b (disc 330 nit): the caller (cockpitModel) builds the canonical inventory ONCE and threads the SAME map
  // in, so the criterion nodes' STAMPED `bodyHash` and the gate's inventory hash are structurally identical (one value),
  // not merely parallel-constructed — AND a second full expansion pass is dropped. Defaults to computing it (test/back-compat).
  criterionIdentities: Map<string, CriterionIdentity> = buildCriterionIdentities(graph, defExprIndex),
): Map<string, GuardOutline> {
  const out = new Map<string, GuardOutline>();
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
        // #242: build an outline for EVERY guard that is not a single bare ref. A single `BranchConditionRef` (Source
        // OR `defined as`) is skipped here and rendered by the flow's single-concept path (branch B, `refKeys===1`) —
        // byte-unchanged. Everything else — `and`/`or`/`not` (incl. a `not`-over-single-ref) AND a sole
        // `BranchConditionCriterionRef` — gets a decomposed outline. (Was: `!containsCriterionRef(cond)` — criterion
        // keyword only, which collapsed plain compound guards to one opaque node, hiding real decision structure.)
        if (cond.type === "BranchConditionRef") continue;
        const key = nodeKey(decisionSubNodeRef(lib, s.name, sn.nodeId));
        // Host safety: on a whole-guard envelope BREACH, convert at hop budget 0 (names survive, no DAG expansion).
        const maxHops = expandedSize(cond, criterionTable).status === "ok" ? undefined : 0;
        const expr = branchConditionToDefStruct(cond, criterionTable, resolveDefExpr, lib, criterionIdentities, maxHops);
        // #233 Todo 2b: `soleCriterion` retired — a guard whose top-level expr IS a criterion node is the sole case, DERIVED
        // by consumers via `topCriterion(expr)`. The outline stores only `expr` (the single source of the criterion facts).
        out.set(key, { expr });
      }
    }
  }
  return out;
}

/** A criterion's render-INDEPENDENT identity: its CANONICAL body fingerprint + whether that canonical expansion
 *  itself breached/elided. Keyed in the map by `criterionKey(lib,name)`. Todo 2b's `buildLiveCriterionIdentities`
 *  consumes THIS (the model-tree inventory) instead of walking rendered occurrences. */
export interface CriterionIdentity {
  lib: string;
  name: string;
  bodyHash: string;
  /** The CANONICAL expansion dropped content to a `…` — a criterion permanently un-passable ("can't attest what
   *  can't be rendered", disc 327 point 2). Occurrence-independent, unlike a node's in-situ `elided`. */
  elided: boolean;
}

/**
 * #233 CANONICAL criterion identities — one render-independent entry per DECLARED criterion in every covered lib.
 * Each entry's canonical body is the `.operand` of a SYNTHETIC ROOT reference to the criterion, routed through the
 * IDENTICAL converter + `expandedSize` breach pre-gate a sole `when C` render uses (`bodyHash = hashExpr(canonicalBody)`,
 * `elided = exprHasMore(canonicalBody)`). Going through a root ref (not the bare condition) matters: a root render wraps
 * at hop 0 and expands the body at hop 1, so expanding `crit.condition` directly would go ONE hop deeper than any render
 * can show — a chain hitting exactly the cap would read `elided:false` here while every render shows `…` (disc 327 Fix 3
 * off-by-one). Routing through the root ref makes identity elision === render elision BY CONSTRUCTION. Occurrence-
 * INDEPENDENT: keyed by (lib,name), computed once per declaration, so a stored verdict is keyed to the declaration.
 *
 * ORDERING (`bodyHash`-of-a-criterion-that-references-another-criterion): `branchConditionToDefStruct` and this function
 * are mutually dependent (the converter stamps a criterion node's `bodyHash` from this map; this map needs the converter
 * to expand bodies). Resolved WITHOUT a topological sort (disc 327 step 4): computing a canonical body here passes an
 * EMPTY identity map, so every NESTED criterion node's `bodyHash` falls back to the CONSTANT `MISSING_BODY_HASH`. The
 * nested criterion's OPERAND (its expanded body CONTENT) is still present, so a change to a referenced criterion's body
 * STILL flows into this hash via content; only the child's opaque hash TOKEN is blanked. That makes each criterion's
 * identity INDEPENDENT of child-hash fill-order (single pass, no cycle-graph topo sort; cycles already degrade to elided
 * stubs). Cost: a criterion node's stamped `bodyHash` (from the completed map, real child tokens) is not `hashExpr` of
 * its own operand once nested criteria are present — accepted: the map value is the identity token, never re-derived.
 */
export function buildCriterionIdentities(
  graph: ResolvedCelGraph,
  defExprIndex: DefExprIndex,
): Map<string, CriterionIdentity> {
  const out = new Map<string, CriterionIdentity>();
  const { libs, coversName } = collectLibs(graph);
  if (!coversName) return out; // no policy anchor → empty (mirrors buildGuardOutlines / buildCrlStructure)
  const resolveDefExpr: ResolveDefExprEntry = (lib, name) =>
    lib === undefined ? undefined : defExprIndex.get(nodeKey(conceptDeclRef(lib, name)));
  // Empty ⇒ every nested criterion ref falls back to MISSING_BODY_HASH (the blanking that makes identity
  // fill-order-independent — see ORDERING above). NOT reused across libs' bodies for anything but this blanking.
  const blankIdentities: ReadonlyMap<string, { bodyHash: string }> = new Map();
  for (const [lib, info] of libs) {
    const criterionTable = buildCriterionTable(info.entry.ast.statements);
    for (const [name, crit] of criterionTable) {
      // A synthetic ROOT reference to this criterion — the SAME shape a sole `when C` feeds the converter. `go` reads
      // only `getRefName(ref)` for a criterion ref, so the `location` is inert (carry `crit.location` for tidiness).
      const rootRef: BranchConditionCriterionRef = { type: "BranchConditionCriterionRef", ref: name, location: crit.location };
      // Same host-safety gate as buildGuardOutlines: on a breach, hop budget 0 → the root node's body is `…` (bounded).
      const maxHops = expandedSize(rootRef, criterionTable).status === "ok" ? undefined : 0;
      const node = branchConditionToDefStruct(rootRef, criterionTable, resolveDefExpr, lib, blankIdentities, maxHops);
      // `node` is always a `criterion` wrapper (the input is a criterion ref to a declared criterion). Its `.operand`
      // is the canonical body; `.elided` (== exprHasMore(operand)) is the canonical elision that a root render shows.
      const canonicalBody = node.kind === "criterion" ? node.operand : node;
      out.set(criterionKey(lib, name), { lib, name, bodyHash: hashExpr(canonicalBody), elided: exprHasMore(canonicalBody) });
    }
  }
  return out;
}

/** #233 Todo 2b — the GATE / verdict identity set: the criteria REACHABLE from the rendered guard outlines (each `.expr`
 *  IS the full model-tree, collapse-INDEPENDENT), mapped to their CANONICAL facts from `criterionIdentities`. A criterion
 *  DECLARED but never referenced by any decision guard is EXCLUDED — it renders nowhere, so gating it would livelock
 *  `mvComplete` with an un-findable entry (disc 330 [critical], both arms: reviewable ⇒ gated). Deduped by
 *  `criterionKey(lib,name)` (a criterion at several sites → ONE entry). Reachability stops where a breaching/hop-capped
 *  parent elides its body — that parent is itself gated + un-passable (an elided criterion), so the chain is blocked at the
 *  VISIBLE node and the unreachable descendant is correctly out. This is a MODEL-tree walk (not the collapse-filtered
 *  rendered occurrences — disc 327 pt 1): a criterion under a collapsed ancestor is still in the ancestor's `.expr`. */
export function criterionGateIdentities(
  guardOutlines: ReadonlyMap<string, GuardOutline>,
  criterionIdentities: ReadonlyMap<string, CriterionIdentity>,
): Map<string, CriterionIdentity> {
  const out = new Map<string, CriterionIdentity>();
  const walk = (e: DefStructExpr): void => {
    switch (e.kind) {
      case "criterion": {
        const key = criterionKey(e.lib, e.name);
        const id = criterionIdentities.get(key);
        if (id && !out.has(key)) out.set(key, id);
        walk(e.operand); // a criterion body may reference further (reachable) criteria
        return;
      }
      case "and":
      case "or":
        e.operands.forEach(walk);
        return;
      case "not":
        walk(e.operand);
        return;
      case "leaf":
        if (e.composite) walk(e.composite); // a `defined as` composite carries no criteria, but recurse for completeness
        return;
      case "external":
      case "more":
        return;
    }
  };
  for (const go of guardOutlines.values()) walk(go.expr);
  return out;
}
