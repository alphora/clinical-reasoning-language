import type { Concept } from "../ast/types";

// #189 — the datum-discrimination predicates: the SINGLE authority for "does this concept carry a local datum /
// an external source binding". Pure AST queries (no emit or descriptor machinery), factored OUT of
// `effectiveRepresentation.ts` so BOTH the descriptor deriver (definition lane) AND the CEL instance writer's role
// dispatch consume the identical rule — a parallel re-implementation would drift, the exact failure the A′ shape
// was adopted to prevent (panel disc 486/487). Living here (not in `effectiveRepresentation.ts`) lets the CEL lane
// use the shared rule WITHOUT importing the guarded deriver module before the flip actually resolves a descriptor
// (the premature-wiring boundary in `effectiveRepresentation.test.ts`); the CEL lane joins the deriver's
// import-allowlist only when todos 2/3 call `deriveEffectiveRepresentations` itself.

/** True when the concept carries a local `code is`. Follows the charter's SYNTACTIC rule "`code is` PRESENT ⇒
 *  locally assertable" (§3) — PRESENCE, not non-emptiness: an empty `code is \`\`.` is present-but-malformed and
 *  rejected by a dedicated diagnostic, never silently reclassified as source/derived. */
export function hasLocalCode(concept: Concept): boolean {
  return concept.code !== undefined;
}

/** True when the concept carries an external source binding — a top-level `coded from` (`CodedFromDefinition`) OR
 *  any `source representation:` posrep. Under #189 D2 the source ARM is deferred; when a local `code is` is also
 *  present (a bothrep, incl. patient-age) the LOCAL arm stays live and this only marks the source arm deferred. */
export function hasSourceBinding(concept: Concept): boolean {
  return concept.definition?.type === "CodedFromDefinition" || concept.representations.length > 0;
}
