/**
 * Shared `defined by` target resolution (used by the CEL validator AND the scenario view-model).
 *
 * A CEL fact's `defined by` ref is one of: a BARE name — a FHIR type (a member of `conceptTypes`), which has
 * no concept/activity declaration identity; or a QUALIFIED `"Lib"."Decl"` — which resolves against the project
 * closure to a Concept OR an Activity (the `buildDefinedByCandidates` candidate set). Correspondence (C2c-2)
 * only treats CONCEPT targets as cross-pane reveal anchors — an activity target or a bare FHIR type is not a
 * concept, so resolving the KIND here is what keeps the cockpit from manufacturing a bogus concept nodeKey.
 */
import type { Statement, ReferenceName } from "../ast/types";
import { getRefLibrary, getRefName, isQualifiedRef } from "../ast/types";

import type { ResolvedCelGraph } from "./imports/types";

/** Concept + Activity declarations, keyed by name (first-write wins on a cross-kind name collision — mirrors
 *  the validator's lookup so both surfaces agree on which declaration a name binds to). */
export function buildDefinedByCandidates(stmts: Statement[]): Map<string, Statement> {
  const out = new Map<string, Statement>();
  for (const s of stmts) {
    if ((s.type === "Concept" || s.type === "Activity") && !out.has(s.name)) out.set(s.name, s);
  }
  return out;
}

export interface DefinedByTarget {
  /** The qualifier library name (always non-null here — the resolver returns undefined when the qualifier is absent). */
  lib: string;
  /** The declaration name. */
  name: string;
  kind: "concept" | "activity";
}

/**
 * Resolve a `defined by` ref to its declared Concept/Activity target, or `undefined` when it has no such
 * identity: a bare ref (FHIR type), an unresolved library, or a name with no Concept/Activity declaration.
 * Never throws — an unresolved ref is simply not a reveal target.
 */
export function resolveDefinedByTarget(
  ref: ReferenceName,
  graph: ResolvedCelGraph,
): DefinedByTarget | undefined {
  if (!isQualifiedRef(ref)) return undefined; // bare = FHIR type → no concept/activity identity
  const lib = getRefLibrary(ref);
  if (lib == null) return undefined;
  const reg = graph.crlRegistry;
  if (!reg) return undefined; // resolver flagged (no project closure)
  const entry = reg.byNameLocal.get(lib) ?? reg.byNamePackage.get(lib);
  if (!entry) return undefined;
  const name = getRefName(ref);
  const target = buildDefinedByCandidates(entry.ast.statements).get(name);
  if (!target) return undefined;
  return { lib, name, kind: target.type === "Activity" ? "activity" : "concept" };
}
