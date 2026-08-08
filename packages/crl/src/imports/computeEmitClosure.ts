/**
 * Shared closure-expansion machinery for CRL emit lanes.
 *
 * The CRL emit pipeline (whether to CQL or to FHIR Definition resources)
 * needs to walk a closure of libraries starting from `graph.resolvedLibraries`
 * and ADDITIONALLY pull in local-origin sibling libraries that are
 * transitively referenced via qualified refs from any already-included
 * library. Under v2.1.0 lock 026, locals auto-resolve without an explicit
 * `include`, so they belong in the emit closure even when not walked.
 *
 * `expandClosureViaRefs` parameterizes the per-entry ref-extraction
 * callback. Two collectors live alongside:
 *
 *   - `collectCqlEmitRefs` — Concept body refs + source-level `include`
 *     lines + Decision refs (when/then condition concepts, recommend-activity,
 *     use-decision — #196, so cross-lib `recommend`/`use decision` pull the
 *     target into the CQL closure without a redundant `include`). Used by the
 *     CQL emit lane (`imports/emit.ts`).
 *   - `collectFhirDefEmitRefs` — strict SUPERSET: everything the CQL collector
 *     walks + Activity refs (with-terminology). Used by the FHIR-def closure
 *     orchestrator (Todo 4 of #73).
 *
 * Both collectors receive the entry's `LibraryScope` so they can resolve
 * qualified library names via `lookupKnownLibrary` — preserves the
 * local-vs-package precedence semantics from scope resolution.
 */

import type {
  Activity,
  CompositionExpression,
  Concept,
  Decision,
  DefinedAsComposition,
  NarrativeClause,
  NarrativeElement,
  ArgValue,
  ReferenceName,
  BranchBlock,
} from "../ast/types";
import { getRefLibrary, isQualifiedRef } from "../ast/types";
import { branchConditionConceptRefsExpanded } from "../ast/branchCondition";
import { buildCriterionTable, type CriterionTable } from "../ast/criterionExpansion";

import { buildLibraryScopes, lookupKnownLibrary } from "./scopes";
import type { LibraryScope } from "./scopes";
import type { RegistryEntry, ResolvedGraph } from "./types";

export type EmitClosureRefCollector = (
  entry: RegistryEntry,
  scope: LibraryScope,
) => Set<string>;

/**
 * Compute the emit closure for an import graph + a collector that names
 * which cross-library refs each entry needs.
 *
 * Algorithm (mirrors prior private logic in `imports/emit.ts`):
 *
 *   1. Seed the closure with `graph.resolvedLibraries`.
 *   2. While the queue is non-empty, pop an entry, look up its scope, ask
 *      the collector for cross-library qualified-ref names.
 *   3. For each name, resolve to a target entry via `lookupKnownLibrary`.
 *      Skip package-origin targets (packages stay outside the emit set;
 *      they must already be in `resolvedLibraries` via explicit include).
 *      Add local-origin targets to the closure + enqueue.
 *
 * Returns the closure in include-walked order (root last; siblings
 * appended after the entry that pulled them in).
 */
export function expandClosureViaRefs(
  graph: ResolvedGraph,
  collectRefs: EmitClosureRefCollector,
): RegistryEntry[] {
  const registry = graph.registry ?? { byNameLocal: new Map(), byNamePackage: new Map() };
  const scopes = buildLibraryScopes(graph.resolvedLibraries, graph.localLibraries, registry);

  const emitClosure: RegistryEntry[] = [];
  const emitClosurePaths = new Set<string>();
  const visited = new Set<string>();
  const queue: RegistryEntry[] = [...graph.resolvedLibraries];

  for (const e of queue) {
    if (!emitClosurePaths.has(e.filePath)) {
      emitClosurePaths.add(e.filePath);
      emitClosure.push(e);
    }
  }

  while (queue.length > 0) {
    const entry = queue.shift()!;
    if (visited.has(entry.filePath)) continue;
    visited.add(entry.filePath);
    const scope = scopes.get(entry.filePath);
    if (!scope) continue;

    const crossLibs = collectRefs(entry, scope);
    for (const libName of crossLibs) {
      const target = lookupKnownLibrary(scope, libName);
      if (!target) continue; // unknown — already diagnosed elsewhere
      if (target.origin === "package") continue; // packages stay outside the emit set
      if (emitClosurePaths.has(target.filePath)) continue;
      const siblingEntry =
        graph.localLibraries.find((e) => e.filePath === target.filePath) ??
        graph.resolvedLibraries.find((e) => e.filePath === target.filePath);
      if (!siblingEntry) continue;
      emitClosurePaths.add(siblingEntry.filePath);
      emitClosure.push(siblingEntry);
      queue.push(siblingEntry);
    }
  }

  return emitClosure;
}

/**
 * CQL INCLUDE collector — the libraries the entry's emitted CQL literally `include`s in its header:
 *   - (1) source-level `include`s,
 *   - (2) qualified Concept-DEFINITION refs (`coded from` / `defined as` / `definition is` — a concept
 *     definition ref lowers to a CQL call INTO the other library, so its CQL header must `include` that library).
 *
 * ⚠ It deliberately does NOT walk Decision-body refs. A cross-library `recommend activity` / `use decision`
 * resolves at the FHIR PlanDefinition level (a policy-id-scoped canonical URL), NOT via a CQL call — so the
 * referrer's CQL must NOT `include` the target. Walking them here emitted a DANGLING `include Shared` in the
 * referrer whenever the target auto-splits and its source-name CQL library dissolves into layers (there is no
 * `Shared.cql`). Those targets still enter the emit CLOSURE via `collectCqlEmitRefs` (so their own CQL is emitted
 * for their FHIR Library) — closure membership and per-library `include`s are DIFFERENT concerns.
 *
 * ⚠ It ALSO deliberately does NOT walk `concept.representations[].terminologyName` (possible-representation
 * groupings). EMPIRICALLY (verified 2026-07-04): a representation-only / `code is`+representation concept lowers
 * to a `// TODO: representations-only concept` placeholder in the emitted CQL — the representation's terminology
 * is NEVER referenced in the CQL body. Walking it here emitted a DANGLING `include <Other>` (and, when `<Other>`
 * auto-splits, an include with no matching `.cql`) for a ref the CQL never uses. Representation refs still enter
 * the emit CLOSURE via `collectCqlEmitRefs` (their FHIR Library / terminology may be a depends-on) — again,
 * closure membership ≠ per-library `include`s.
 *
 * The same exclusion covers a representation's `definition is` PROJECTOR: a projector's
 * narrative refs are deliberately NOT walked here for the same reason (reps don't emit their
 * own CQL body in increment 1). A well-formed datum-level projector carries no concept refs
 * anyway; a misattached one is surfaced by referenceResolver/cycleDetector and rejected by
 * Todo 2, so nothing is silently dropped from the emit that would otherwise be reachable.
 */
export function collectCqlIncludeRefs(entry: RegistryEntry, _scope: LibraryScope): Set<string> {
  const refs = new Set<string>();
  const selfName = entry.name;
  const addIfCross = (lib: string | null): void => {
    if (lib === null || lib === "") return;
    if (lib === selfName) return;
    refs.add(lib);
  };
  // (1) source-level includes.
  for (const inc of entry.ast.includes) {
    addIfCross(inc.name);
  }
  // (2) concept-DEFINITION refs (CQL-level). Representations are NOT walked here (see doc above).
  const visit = (ref: ReferenceName): void => {
    if (!isQualifiedRef(ref)) return;
    addIfCross(getRefLibrary(ref));
  };
  for (const stmt of entry.ast.statements) {
    if (stmt.type === "Concept") {
      visitConceptDefinitionRefs(stmt as Concept, visit);
    }
  }
  return refs;
}

/**
 * CQL emit-CLOSURE collector — which libraries must have their CQL EMITTED. A superset of
 * `collectCqlIncludeRefs`: it ADDS
 *   - qualified Decision-body refs (`recommend activity` / `use decision` / `when`-concept / guards, recursive
 *     over nested branches), and
 *   - qualified Concept-REPRESENTATION refs (`source representation … coded from "Other"."VS"`).
 *
 * #196 — a cross-library `recommend activity "Shared"."Deny"` (or `use decision`) resolves at the FHIR level, but
 * the target's OWN CQL must still be emitted because its FHIR Library's `content` url points at it (Inv 4). So
 * the target enters the CQL emit CLOSURE here — WITHOUT the referrer needing an explicit `include "Shared"`
 * (which the language's `redundant-local-include` warning tells authors to delete), and WITHOUT the referrer
 * emitting a `include` for it (see `collectCqlIncludeRefs`).
 *
 * Representation refs live HERE (closure), not in `collectCqlIncludeRefs` (per-library includes): they do NOT
 * lower to a CQL call (a representation-only concept emits a TODO placeholder), so the referrer must NOT `include`
 * the target — but the target's terminology may still be a FHIR depends-on, so it stays in the emit closure.
 * Keeping them here holds the closure BYTE-IDENTICAL to the pre-fix behavior (when they lived in the include set).
 *
 * IDEMPOTENCE — for content that already `include`s its cross-lib targets, they are in the set via (1), so the
 * decision/representation walks are Set no-ops → zero closure change.
 */
export function collectCqlEmitRefs(entry: RegistryEntry, scope: LibraryScope): Set<string> {
  const refs = collectCqlIncludeRefs(entry, scope);
  const selfName = entry.name;
  const addIfCross = (lib: string | null): void => {
    if (lib === null || lib === "") return;
    if (lib === selfName) return;
    refs.add(lib);
  };
  const visit = (ref: ReferenceName): void => {
    if (!isQualifiedRef(ref)) return;
    addIfCross(getRefLibrary(ref));
  };
  // #224 ii.1c — a decision guard may reference a `criterion`; the closure must see the
  // EXPANDED guard (a concept referenced only inside a criterion body is otherwise invisible
  // to closure — disc 300). Build the entry's criterion table once and thread it in.
  const criterionTable = buildCriterionTable(entry.ast.statements);
  for (const stmt of entry.ast.statements) {
    if (stmt.type === "Decision") {
      visitDecisionRefs(stmt as Decision, visit, criterionTable);
    } else if (stmt.type === "Concept") {
      // Representation terminology refs: closure-only (see doc above / `collectCqlIncludeRefs`).
      visitConceptRepresentationRefs(stmt as Concept, visit);
    }
  }
  return refs;
}

/**
 * FHIR-def emit collector — STRICT SUPERSET of `collectCqlEmitRefs`.
 *
 * `collectCqlEmitRefs` already covers includes + Concept refs + Decision refs
 * (#196). This adds ONLY the remaining FHIR-def-specific walk:
 *   - Activity body refs: `ActivityWith.terminologyReference` (qualified).
 *
 * Same self-exclusion rule (refs to the entry's own library are dropped).
 */
export function collectFhirDefEmitRefs(entry: RegistryEntry, scope: LibraryScope): Set<string> {
  const refs = collectCqlEmitRefs(entry, scope);
  const selfName = entry.name;
  const addIfCross = (lib: string | null): void => {
    if (lib === null || lib === "") return;
    if (lib === selfName) return;
    refs.add(lib);
  };
  const visit = (ref: ReferenceName): void => {
    if (!isQualifiedRef(ref)) return;
    addIfCross(getRefLibrary(ref));
  };

  for (const stmt of entry.ast.statements) {
    if (stmt.type === "Activity") {
      visitActivityRefs(stmt as Activity, visit);
    }
  }

  return refs;
}

/** Convenience: full CQL emit closure with the standard CQL collector. */
export function computeCqlEmitClosure(graph: ResolvedGraph): RegistryEntry[] {
  return expandClosureViaRefs(graph, collectCqlEmitRefs);
}

/** Convenience: full FHIR-def emit closure with the strict-superset FHIR-def collector. */
export function computeFhirEmitClosure(graph: ResolvedGraph): RegistryEntry[] {
  return expandClosureViaRefs(graph, collectFhirDefEmitRefs);
}

/* ─── ref-walker helpers (Concept / Decision / Activity) ─────────── */

/**
 * Concept-DEFINITION refs ONLY (`coded from` / `defined as` / `definition is`). These lower to CQL calls, so
 * they belong in BOTH the per-library `include` set and the closure. Representations are walked SEPARATELY by
 * `visitConceptRepresentationRefs` — they do NOT lower to CQL, so they are closure-only.
 */
function visitConceptDefinitionRefs(concept: Concept, visit: (ref: ReferenceName) => void): void {
  const def = concept.definition;
  if (!def) return;
  switch (def.type) {
    case "CodedFromDefinition":
      if (def.terminologyName) visit(def.terminologyName);
      break;
    case "DefinedAsDefinition": {
      const body = def.body;
      // Bare ref and `exists ("X")` both pull their referenced concept into the emit
      // closure; only a composition carries an expression to descend.
      if (body.type === "DefinedAsBareRef" || body.type === "DefinedAsExists") {
        visit(body.ref);
      } else if (body.type === "DefinedAsComposition") {
        visitComposition((body as DefinedAsComposition).expression, visit);
      }
      break;
    }
    case "DefinitionIsDefinition":
      visitNarrative(def.body, visit);
      break;
  }
}

/**
 * Concept-REPRESENTATION refs ONLY (`source representation … coded from`). Closure-only: they do NOT lower to a
 * CQL call (a representation-only concept emits a `// TODO: representations-only` placeholder), so they must NOT
 * drive a per-library `include`, but the target terminology may be a FHIR depends-on.
 */
function visitConceptRepresentationRefs(concept: Concept, visit: (ref: ReferenceName) => void): void {
  for (const rep of concept.representations ?? []) {
    if (rep.terminologyName) visit(rep.terminologyName);
  }
}

function visitComposition(expr: CompositionExpression, visit: (ref: ReferenceName) => void): void {
  switch (expr.type) {
    case "SemOrExpression":
    case "SemAndExpression":
      for (const t of expr.terms) visitComposition(t, visit);
      return;
    case "SemNotExpression":
      visitComposition(expr.expression, visit);
      return;
    case "CompositionGroup":
      visitComposition(expr.expression, visit);
      return;
    case "CompositionRef":
      visit(expr.ref);
      return;
  }
}

function visitNarrative(clause: NarrativeClause, visit: (ref: ReferenceName) => void): void {
  for (const el of clause.elements) visitNarrativeElement(el, visit);
}

function visitNarrativeElement(el: NarrativeElement, visit: (ref: ReferenceName) => void): void {
  switch (el.type) {
    case "NConceptRef":
      visit(el.value);
      return;
    case "NDisjunction":
      for (const av of el.disjuncts) visitArgValue(av, visit);
      return;
    case "NConjunction":
      for (const av of el.conjuncts) visitArgValue(av, visit);
      return;
  }
}

function visitArgValue(av: ArgValue, visit: (ref: ReferenceName) => void): void {
  switch (av.type) {
    case "NConceptRef":
      visit(av.value);
      return;
    case "NDisjunction":
      for (const inner of av.disjuncts) visitArgValue(inner, visit);
      return;
    case "NConjunction":
      for (const inner of av.conjuncts) visitArgValue(inner, visit);
      return;
  }
}

function visitDecisionRefs(
  decision: Decision,
  visit: (ref: ReferenceName) => void,
  criterionTable: CriterionTable,
): void {
  function visitBranch(branch: BranchBlock): void {
    // `when` carries a boolean guard over concept refs (any of which may be a criterion ref
    // to expand); `otherwise` carries none. A guard that breaches the GLOBAL envelope is
    // SKIPPED here. This closure feeds BOTH emit lanes (collectCqlEmitRefs + the FHIR
    // superset), so the skip is justified lane-accurately, NOT by decision.ts (which never
    // runs on a standalone CQL emit): on the CQL lane the SAME overflow is a hard error at
    // the `emitCQLImports` boundary (`decisionGuardOverflows`), so an incomplete closure
    // never ships; on the FHIR lane the decision action is suppressed. Either way the
    // under-included refs belong to output that isn't emitted — a benign under-inclusion.
    if (branch.type === "WhenBlock")
      for (const atom of branchConditionConceptRefsExpanded(branch.condition, criterionTable, "emit closure").refs)
        visit(atom.ref);
    const body = branch.body;
    if (body.type === "ActionStatement") {
      const action = body.action;
      if (action.type === "RecommendActivity") visit(action.activityName);
      else visit(action.decisionName);
      if (body.guard) visit(body.guard.conceptName);
      return;
    }
    for (const stmt of body.statements) {
      if (stmt.type === "WhenBlock" || stmt.type === "OtherwiseBlock") visitBranch(stmt);
      else {
        const action = stmt.action;
        if (action.type === "RecommendActivity") visit(action.activityName);
        else visit(action.decisionName);
        if (stmt.guard) visit(stmt.guard.conceptName);
      }
    }
  }
  for (const branch of decision.body.statements) visitBranch(branch);
}

function visitActivityRefs(activity: Activity, visit: (ref: ReferenceName) => void): void {
  const wc = activity.body.withClause;
  if (wc?.terminologyReference !== undefined) visit(wc.terminologyReference);
}

// #201 — visit ONLY the `use decision` refs of a decision (the `decisionName` of a
// non-`RecommendActivity` action), so callers can build the use-decision edge set.
function visitUseDecisionRefs(decision: Decision, visit: (ref: ReferenceName) => void): void {
  function visitBranch(branch: BranchBlock): void {
    const body = branch.body;
    if (body.type === "ActionStatement") {
      if (body.action.type !== "RecommendActivity") visit(body.action.decisionName);
      return;
    }
    for (const stmt of body.statements) {
      if (stmt.type === "WhenBlock" || stmt.type === "OtherwiseBlock") visitBranch(stmt);
      else if (stmt.action.type !== "RecommendActivity") visit(stmt.action.decisionName);
    }
  }
  for (const branch of decision.body.statements) visitBranch(branch);
}

/**
 * #201 — the set of library qualifiers a library's decisions `use decision` INTO
 * (cross-library delegation targets). Used to find the closure's GRAPH-ROOT decision
 * library (a decision library that is never a `use decision` target — zero incoming
 * edges): the shared activities-only determination library rebinds onto that root's
 * Interface, regardless of which/how many sub-decisions recommend its activities.
 */
export function usedDecisionLibraries(ast: { statements: ReadonlyArray<{ type: string }> }): Set<string> {
  const libs = new Set<string>();
  for (const stmt of ast.statements) {
    if (stmt.type !== "Decision") continue;
    visitUseDecisionRefs(stmt as Decision, (ref) => {
      const lib = getRefLibrary(ref);
      if (lib !== null) libs.add(lib);
    });
  }
  return libs;
}
