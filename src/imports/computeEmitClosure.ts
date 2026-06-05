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
 *     lines. Used by the CQL emit lane (`imports/emit.ts`).
 *   - `collectFhirDefEmitRefs` — strict SUPERSET: Concept refs + includes
 *     + Decision refs (when/then condition concepts, recommend-activity,
 *     use-decision) + Activity refs (with-terminology). Used by the
 *     FHIR-def closure orchestrator (Todo 4 of #73).
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
  WhenBlock,
} from "../ast/types";
import { getRefLibrary, isQualifiedRef } from "../ast/types";

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

/** CQL emit collector — preserves the pre-factor behavior of `imports/emit.ts`. */
export function collectCqlEmitRefs(entry: RegistryEntry, _scope: LibraryScope): Set<string> {
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
  // (2) concept-body refs.
  const visit = (ref: ReferenceName): void => {
    if (!isQualifiedRef(ref)) return;
    addIfCross(getRefLibrary(ref));
  };
  for (const stmt of entry.ast.statements) {
    if (stmt.type === "Concept") {
      visitConceptRefs(stmt as Concept, visit);
    }
  }
  return refs;
}

/**
 * FHIR-def emit collector — STRICT SUPERSET of `collectCqlEmitRefs`.
 *
 * Adds:
 *   - Decision body refs: every `WhenBlock.conceptName` (qualified),
 *     `RecommendActivity.activityName` (qualified),
 *     `UseDecision.decisionName` (qualified). Recursive over nested
 *     `BlockBody`.
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
    if (stmt.type === "Decision") {
      visitDecisionRefs(stmt as Decision, visit);
    } else if (stmt.type === "Activity") {
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

function visitConceptRefs(concept: Concept, visit: (ref: ReferenceName) => void): void {
  switch (concept.definition.type) {
    case "CodedFromDefinition":
      visit(concept.definition.terminologyName);
      return;
    case "DefinedAsDefinition": {
      const body = concept.definition.body;
      if (body.type === "DefinedAsBareRef") {
        visit(body.ref);
      } else if (body.type === "DefinedAsComposition") {
        visitComposition((body as DefinedAsComposition).expression, visit);
      }
      return;
    }
    case "DefinitionIsDefinition":
      visitNarrative(concept.definition.body, visit);
      return;
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

function visitDecisionRefs(decision: Decision, visit: (ref: ReferenceName) => void): void {
  function visitWhenBlock(wb: WhenBlock): void {
    visit(wb.conceptName);
    const body = wb.body;
    if (body.type === "ActionStatement") {
      const action = body.action;
      if (action.type === "RecommendActivity") visit(action.activityName);
      else visit(action.decisionName);
      return;
    }
    for (const stmt of body.statements) {
      if (stmt.type === "WhenBlock") visitWhenBlock(stmt);
      else {
        const action = stmt.action;
        if (action.type === "RecommendActivity") visit(action.activityName);
        else visit(action.decisionName);
      }
    }
  }
  for (const wb of decision.body.statements) visitWhenBlock(wb);
}

function visitActivityRefs(activity: Activity, visit: (ref: ReferenceName) => void): void {
  const wc = activity.body.withClause;
  if (wc?.terminologyReference !== undefined) visit(wc.terminologyReference);
}
