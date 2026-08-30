// #189 O2 — CAN THIS CONCEPT'S VALUE BE *UNANSWERED*?
//
// ── Why this exists ─────────────────────────────────────────────────────────────────────────────────────
//
// Charter §4 draws one line and the emitter did not: *"a nullable boolean derivation OVER EVIDENCE is
// totalized (`Coalesce(<predicate>, false)`) at its own boundary. Absent evidence is `false`, because a
// retrieval always computes. ⚠ A derivation over a QUESTION is NOT closed-world: it inherits the question's
// unknown … **What determines the arm is what it reads, never that it is a derivation.**"*
//
// So a comparator's boundary is CORRECT over evidence and a pause-killer over a question, and the emitter
// needs to tell them apart. That is this predicate.
//
// ── What makes a concept answerable ─────────────────────────────────────────────────────────────────────
//
// A local `code is`, and nothing else — a local code IS the answer slot (`project_questions-answers-guards-model`).
// The root is DELIBERATELY BROAD: a concept that ALSO carries a derivation and a `source representation` is
// still answerable, because the arms OR together — a computing arm can SETTLE the value when it fires, but
// when every arm is silent the answer slot is still open, so the value is still null.
//
// ⚠ The breadth is also the SAFE direction, and that asymmetry is the argument (both review arms, round 1):
//   · over-broad ⇒ we drop a `Coalesce` that was doing nothing (the operand was never null) — no behaviour change;
//   · under-broad ⇒ an unanswered question becomes a stated `false` and the tree DENIES instead of pausing.
// The acceptance criterion is that a Deny requires an ESTABLISHED false (asserted, recorded, OR computed —
// charter "VOCABULARY"); absence is never established. So ties go to breadth.
//
// ⚠ NOT `isPureQuestionConcept`. That is the ONE-ARM detector (a bare `code is` with nothing that could
// compute it) and is explicitly NOT the test for "can this pause" — the goal's own `BMI` carries a code AND a
// derivation AND a posrep, and charter §4 names it as the example that must stay UNKNOWN.
//
// ── Why it runs PRE-LOWERING ────────────────────────────────────────────────────────────────────────────
//
// ⚠ `lowerLocalCodes` rewrites a local `code is` into a synthetic terminology + `CodedFromDefinition`, so by
// emit time a question is STRUCTURALLY a retrieve — MEASURED, the two cases emit byte-identical defines
// (`tmp/nullprobe/analysis/comparatorBoundary-out.txt`). The distinction only exists on the AUTHORED AST, so
// this must be computed there and carried, exactly as `classifyBooleanTotality` already is.

import type { Concept } from "./types";
import { conceptRefsOfDefinition } from "./conceptDependencies";
import { getRefLibrary, getRefName } from "./types";

/**
 * Does `name` — or anything it transitively READS — carry a local `code is`?
 *
 * `conceptByName` is the caller's own same-library scope. Cycle-guarded, so a self- or mutually-recursive
 * definition terminates (and contributes nothing rather than looping).
 *
 * ⚠ CROSS-LIBRARY REFS ARE NOT FOLLOWED, and are treated as NOT question-bearing. That is the conservative
 * direction for the corpus (a foreign operand is overwhelmingly evidence — cms22's comparator chain reads
 * `"cms22-ExternalPrimitives"."…"` retrieves) and it keeps every existing golden's boundary intact. It is
 * ALSO the unsafe direction in principle: a foreign ANSWERABLE concept would keep a boundary it should not
 * have. Closing that needs the cross-library capability index, and is tracked with O-UNIFIED — it is a
 * KNOWN limit, not an oversight.
 */
export function readsAQuestion(
  name: string,
  conceptByName: ReadonlyMap<string, Concept>,
  visiting: ReadonlySet<string> = new Set(),
): boolean {
  if (visiting.has(name)) return false; // cycle — this path contributes nothing
  const c = conceptByName.get(name);
  if (c === undefined) return false; // unresolved / foreign — see the cross-library note above
  if (c.code !== undefined) return true; // ⭐ a local `code is` IS the answer slot
  const next = new Set(visiting).add(name);
  return conceptRefsOfDefinition(c.definition).some((ref) => {
    if (getRefLibrary(ref) !== null) return false; // cross-library — not followed
    return readsAQuestion(getRefName(ref), conceptByName, next);
  });
}

/**
 * The same question asked of a whole library once: the set of concept names whose value can be UNANSWERED.
 * Built PRE-LOWERING and carried, because lowering erases the local `code is` that defines the property.
 */
export function questionReachableNames(concepts: readonly Concept[]): ReadonlySet<string> {
  const byName = new Map<string, Concept>();
  for (const c of concepts) byName.set(c.name, c);
  const out = new Set<string>();
  for (const c of concepts) if (readsAQuestion(c.name, byName)) out.add(c.name);
  return out;
}
