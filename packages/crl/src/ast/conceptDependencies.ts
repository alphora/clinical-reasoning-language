// #189 — THE CONCEPT DEPENDENCY EDGE. Which concepts does a concept's definition read?
//
// ── Why this exists ─────────────────────────────────────────────────────────────────────────────────────
//
// The goal's second acceptance item is that a user may ANSWER AT ANY LEVEL — assert obesity, or give a BMI,
// or give a height and a weight. The question set is therefore the DEPENDENCY WALK from a decision's guard:
// every locally-coded concept reachable through the definitions, because a local `code is` IS an answer slot
// (`project_questions-answers-guards-model`).
//
// ⚠ The walk existed but followed only `defined as` edges. MEASURED on the canonical target: starting at
// `Obese`, it reached ONE question where FOUR concepts carry codes — because the whole chain is
// `definition is`, and a narrative's operands were not an edge at all. Every option was affected; the
// questionnaire would have asked about obesity and offered no way to answer it with a height and a weight.
//
// ── What counts as an edge ──────────────────────────────────────────────────────────────────────────────
//
// Whatever the definition READS. Not "whatever it is a kind of" — the dependency is a fact about data flow,
// so a narrative's concept arguments count exactly as a composition's operands do. The four definition forms:
//
//   DefinedAsDefinition   the composition operands (unchanged; `flattenDefinedAsBody` remains the authority)
//   DefinitionIsDefinition  every `NConceptRef` in the narrative, including inside `and`/`or` argument groups
//   ReductionDefinition   a NAMED target (`most recent "Height Records"`); `this` reads the concept's OWN
//                         records, which is not a dependency on another concept
//   CodedFromDefinition   a terminology binding, not a concept edge
//
// ⚠ PURE: no library metadata, no resolution. A caller resolves the returned names in its own scope, so ONE
// edge function serves every consumer — the case-feature walk and the provenance concept-shape tree, which
// are contractually required to agree and previously agreed by re-implementation.
//
// ⚠ NOT total — it THROWS on one input, deliberately. A `defined as` boolean composition routes through
// `flattenDefinedAsBody` → `branchConditionConceptRefsStrict`, which throws on an unclassified CRITERION ref
// (`inferenceWalk.ts`): criterion refs are illegal at the `defined as` site, and swallowing one would turn an
// author error into a silently-missing dependency edge — the exact failure this module exists to fix. Callers
// share the case-feature walk's contract and let it propagate.
//   (This header previously claimed "no throwing". That was wrong when written — caught in the O2 plan
//    review, 2026-08-29 — and a caller that believed it would have been wrong about its own failure modes.)
//
// ⚠ EVERY union member is an EXPLICIT case, with no `default`. A `default: return []` is what made three of
// the four definition forms indistinguishable from "no dependencies" in the first place; a future member
// must break the BUILD here, not silently acquire an empty edge set.

import type {
  ArgValue,
  Concept,
  ConceptDefinition,
  NarrativeElement,
  ReferenceName,
} from "./types";
import { flattenDefinedAsBody } from "./inferenceWalk";

/** Every concept reference inside a narrative argument value, including nested `and`/`or` groups. */
function argValueRefs(av: ArgValue): ReferenceName[] {
  switch (av.type) {
    case "NConceptRef":
      return [av.value];
    case "NDisjunction":
      return av.disjuncts.flatMap(argValueRefs);
    case "NConjunction":
      return av.conjuncts.flatMap(argValueRefs);
    case "Quantity":
      return []; // a literal, not a reference
  }
}

/** Every concept reference in one narrative element. */
function narrativeElementRefs(el: NarrativeElement): ReferenceName[] {
  switch (el.type) {
    case "NConceptRef":
      return [el.value];
    case "NDisjunction":
      return el.disjuncts.flatMap(argValueRefs);
    case "NConjunction":
      return el.conjuncts.flatMap(argValueRefs);
    case "NWord":
    case "Quantity":
      return []; // not references
  }
}

/**
 * The concepts a DEFINITION reads, in source order. Pure, total, and duplicate-preserving — a caller that
 * needs uniqueness dedups in its own traversal (the case-feature walk already enters each name once).
 */
/**
 * ⭐⭐ #189 — THE DEPENDENCY EDGES OF A WHOLE CONCEPT, definition AND lowered producer stages.
 *
 * ⚠⚠ USE THIS, NOT `conceptRefsOfDefinition`, ANYWHERE THE WALK RUNS OVER A LOWERED AST.
 *
 * A both-representation merge twin's `definition` is a SYNTHETIC `most recent <self>` — the authored
 * pipeline does not survive lowering. So a concept whose real dependency is a PRODUCER stage
 * (`body mass index of "Weight" and "Height", then most recent this`) reports only its own name from the
 * definition, and its operands live on `__recencyProducerSpecs`.
 *
 * ⚠ MEASURED, and it was a REGRESSION the moment producers started lowering: the case-feature walk over the
 * lowered ast stopped at `Obese` because the `Obese -> BMI -> Weight/Height` edges were all producer edges.
 * Only 2 of 5 reachable concepts got a StructureDefinition, so a constructed candidate carried a
 * `meta.profile` canonical resolving to nothing. Nothing was wrong with `Weight`/`Height`; they were simply
 * unreachable through an edge that had become invisible.
 *
 * The rule this encodes: MOVING AN EDGE OFF `definition` DOES NOT MOVE IT OUT OF THE GRAPH. One dependency
 * graph, both storage locations.
 */
export function conceptRefsOfConcept(concept: Concept | undefined): ReferenceName[] {
  if (concept === undefined) return [];
  const refs = [...conceptRefsOfDefinition(concept.definition)];
  const specs = (concept.__recencyProducerSpecs ?? []) as readonly {
    call?: { args?: readonly unknown[] };
  }[];
  for (const spec of specs) {
    for (const arg of spec.call?.args ?? []) {
      const a = arg as { type?: string; value?: string; library?: string | null };
      // ⚠ A cross-library operand is REFUSED upstream (`emit/producerCandidate.ts`), so a spec that exists
      // carries same-library refs only. Push the bare name — the same form a `defined as` operand takes —
      // rather than inventing a qualified-reference node the walk's consumers would have to special-case.
      if (a?.type === "ConceptRefArg" && typeof a.value === "string" && !a.library) {
        refs.push(a.value as ReferenceName);
      }
    }
  }
  return refs;
}

export function conceptRefsOfDefinition(def: ConceptDefinition | undefined): ReferenceName[] {
  if (def === undefined) return [];
  switch (def.type) {
    case "DefinedAsDefinition":
      return flattenDefinedAsBody(def.body);
    case "DefinitionIsDefinition":
      return def.body.elements.flatMap(narrativeElementRefs);
    case "ReductionDefinition":
      // ⚠ `this` is NOT an edge. It reads the concept's OWN records, so following it would make every
      // `most recent this` concept its own dependency — and on the case-feature walk that is the difference
      // between "this concept is an answer slot" and "this concept depends on an answer slot".
      return def.reduction.target.type === "ReductionConceptRef" ? [def.reduction.target.ref] : [];
    case "CodedFromDefinition":
      return []; // a terminology binding, not a concept edge
  }
}

/** Convenience: the concepts a CONCEPT reads. */
export function conceptDependencies(concept: Concept): ReferenceName[] {
  return conceptRefsOfDefinition(concept.definition);
}
