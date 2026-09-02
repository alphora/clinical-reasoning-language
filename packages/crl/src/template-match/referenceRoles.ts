import type { CanonicalArg, CanonicalPatternCall } from "./canonicalTypes";
import type { Location, NarrativeClause } from "../ast/types";
import { matchNarrative } from "./matcher";

/**
 * ⭐⭐ WHICH NAMESPACE EACH QUOTED NAME IN A NARRATIVE BELONGS TO.
 *
 * Every quoted name parses as an `NConceptRef` — the narrative parser cannot tell a concept from a
 * terminology, because a quoted name is a quoted name. For every pattern but one that is harmless, since the
 * operands ARE concepts. `Membership` (`"X" in "VS"`) is the exception: its comparand is a value set.
 *
 * Getting it wrong is not cosmetic. The reference resolver reports a perfectly good terminology as an
 * unresolved concept; the layered emitter leaves it BARE, and the emitted library then fails to TRANSLATE
 * with "Could not resolve identifier" while emit reports success — MEASURED on the `$apply` harness.
 *
 * ⚠⚠ IT MUST RECURSE, and a shallow version shipped and was caught by review. `matchNarrative` FOLDS a
 * pipeline by wrapping the earlier call in a `NestedPatternArg`, so
 *
 *     definition is "X" in "VS", then most recent this
 *
 * matches as `MostRecent(NestedPatternArg(Membership(ConceptRefArg, TerminologyRefArg)))` — and a scan of the
 * TOP-LEVEL args alone never sees the terminology. That is the charter's own spelling of this form, so the
 * shallow reading was broken for the shape most authors will write.
 *
 * ⚠ Keyed by SPAN, not by name: a concept and a terminology may legally share a name (the layered emitter
 * keeps SEPARATE name→layer maps for exactly that reason), so a name-keyed map would misroute silently.
 *
 * ⚠ ONE AUTHORITY, two consumers (`validator/referenceResolver`, `cql-emitter/layeredEmit`). They had a
 * local copy each, and the duplication is precisely what let the nested-argument omission exist in both.
 */
export type RefRole = "concept" | "terminology";

/** A location made comparable — two refs are the SAME ref iff they occupy the same span. */
export function spanKey(l: Location): string {
  return `${l.start.line}:${l.start.column}-${l.end.line}:${l.end.column}`;
}

function walkArg(arg: CanonicalArg, out: Map<string, RefRole>): void {
  switch (arg.type) {
    case "TerminologyRefArg":
      out.set(spanKey(arg.location), "terminology");
      return;
    case "ConceptRefArg":
      out.set(spanKey(arg.location), "concept");
      return;
    // ⚠ The three RECURSIVE shapes. A pipeline folds into `NestedPatternArg`; `defined as`-style operand
    // groups fold into the other two. Any of them can carry a terminology operand at any depth.
    case "NestedPatternArg":
      walkCall(arg.pattern, out);
      return;
    case "DisjunctionArg":
      for (const d of arg.disjuncts) walkArg(d, out);
      return;
    case "ConjunctionArg":
      for (const c of arg.conjuncts) walkArg(c, out);
      return;
    // QuantityArg / EnumArg carry no reference.
    default:
      return;
  }
}

function walkCall(call: CanonicalPatternCall, out: Map<string, RefRole>): void {
  for (const arg of call.args) walkArg(arg, out);
}

/**
 * The namespace of every quoted name the matcher could place, keyed by span.
 *
 * ⚠ An UNMATCHED narrative returns an EMPTY map, and both consumers then fall back to their existing
 * concept/parameter behaviour unchanged. A pattern the catalog does not know must not have its refs
 * silently reclassified.
 */
export function narrativeReferenceRoles(body: NarrativeClause): ReadonlyMap<string, RefRole> {
  const out = new Map<string, RefRole>();
  const matched = matchNarrative(body);
  if (matched?.known !== true) return out;
  walkCall(matched, out);
  return out;
}
