/**
 * v2.2 Todo 4 (issue #59) — pure helpers consumed by `completion.ts`'s
 * providers. Lives in its own module because `completion.ts` imports
 * `vscode`, which cannot be loaded under plain Node; isolating these
 * makes them unit-testable via `completion.test.mjs` against
 * `dist/completionHelpers.js`.
 *
 * Symmetric to the `contextDetect.ts` testability pattern.
 */

/** True when `prefix` ends inside a `- type is <here>` slot (concept resource type). */
export function isTypeCompletionPrefix(prefix: string): boolean {
  return /^\s*-\s*type\s+is\s+\S*$/i.test(prefix);
}

/** True when `prefix` ends inside a `- value type is <here>` slot (concept value type). */
export function isValuetypeCompletionPrefix(prefix: string): boolean {
  return /^\s*-\s*value type\s+is\s+\S*$/i.test(prefix);
}

/** True when `prefix` ends inside a `- param type is <here>` slot (parameter type). */
export function isParamTypeCompletionPrefix(prefix: string): boolean {
  return /^\s*-\s*param\s+type\s+is\s+\S*$/i.test(prefix);
}

/**
 * True when the cursor is anywhere inside a `- type is`, `- value type is`,
 * or `- param type is` slot. These slots expect UNQUOTED identifier tokens
 * (e.g. `Observation`, `boolean`, `Patient`) — not quoted refs. Used by
 * `ConceptRefCompletionProvider` to suppress concept/terminology/decision/
 * activity/parameter suggestions when the user types `"` in one of these
 * slots (which would otherwise leak a bogus suggestion list).
 *
 * More permissive than the three slot-completion predicates above — those
 * require the cursor to sit right after the keyword with no quote
 * intervening. This one just needs the LINE to start with one of the
 * unquoted slots; the caller separately checks that the cursor is inside
 * an open quote.
 */
export function isUnquotedTypeSlotPrefix(prefix: string): boolean {
  return /^\s*-\s*(value type|param\s+type|type)\s+is\b/i.test(prefix);
}

/**
 * Concept-first precedence for the concept/parameter same-name pair. When
 * `concept "X"` AND `parameter "X"` coexist in the same library + origin
 * scope, the validator + ProjectIndex resolve narrative refs to the
 * concept first. Completion mirrors that: drop the parameter entry from
 * the suggestion list so the user doesn't see both labels.
 *
 * Other same-name pairs (terminology vs concept, etc.) pass through
 * untouched — those are different slots and showing both is correct.
 *
 * Used by both the indexed (parser-backed) and orphan-file paths so their
 * behavior stays consistent.
 *
 * Origin participates in the key alongside library name so a local "Foo"
 * and a package "Foo" stay separate — matching ProjectIndex's
 * `resolveTargetKind` precedence semantics.
 */
export function applyNarrativePrecedence<
  T extends {
    name: string;
    kind: string;
    libraryName?: string | undefined;
    origin?: string | undefined;
  },
>(decls: T[]): T[] {
  const conceptKeys = new Set<string>();
  for (const d of decls) {
    if (d.kind !== "concept") continue;
    conceptKeys.add(precedenceKey(d));
  }
  return decls.filter((d) => {
    if (d.kind !== "parameter") return true;
    return !conceptKeys.has(precedenceKey(d));
  });
}

function precedenceKey(d: {
  name: string;
  libraryName?: string | undefined;
  origin?: string | undefined;
}): string {
  return `${d.origin ?? ""}|${d.libraryName ?? ""}|${d.name}`;
}

/**
 * Single-result name lookup with concept-first precedence for the
 * concept/parameter pair. Returns the matching concept if any exists; else
 * the matching parameter; else any other matching declaration (terminology,
 * decision, activity, etc.) so non-narrative slots keep their hover. Used
 * by both the orphan-file scanner path (`concepts.ts → findNarrativeDeclaration`)
 * and the parser-backed `ProjectIndex` path (`hover.ts → findIndexedNarrative`).
 *
 * Pure function — testable directly via `completion.test.mjs` against
 * `dist/completionHelpers.js`.
 */
export function findByConceptFirstPrecedence<
  T extends { name: string; kind: string },
>(decls: T[], matches: (d: T) => boolean): T | undefined {
  let parameterMatch: T | undefined;
  let otherMatch: T | undefined;
  for (const d of decls) {
    if (!matches(d)) continue;
    if (d.kind === "concept") return d;
    if (d.kind === "parameter") {
      if (!parameterMatch) parameterMatch = d;
      continue;
    }
    if (!otherMatch) otherMatch = d;
  }
  return parameterMatch ?? otherMatch;
}
