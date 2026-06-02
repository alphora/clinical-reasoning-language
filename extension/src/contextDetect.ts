/**
 * Pure helpers that classify the cursor's editing context from the line
 * prefix (text to the left of the cursor on the current line). Used by
 * `ConceptRefCompletionProvider` to filter quoted-ref suggestions by the
 * expected declaration kind, and to detect when the user is editing the
 * second segment of a qualified ref `"Lib"."<here>"`.
 *
 * Kept regex-only so it's testable as a `*.test.mjs` against the compiled
 * dist without any vscode bindings.
 */

export type ExpectedRefKind = "concept" | "terminology" | "decision" | "activity" | "any";

/**
 * Classify the line prefix to decide which declaration kinds should
 * appear in autocomplete for the quoted ref the user is currently
 * editing. Returns "any" when no kind constraint applies (e.g. cursor
 * inside a quoted string in narrative position with no preceding keyword).
 *
 * Trigger contexts:
 *   - `coded from "`                   → terminology
 *   - `defined as "`                   → concept (also after `(`, `sem-and`,
 *                                        `sem-or`, `sem-not`, `,`)
 *   - `when "`                         → concept
 *   - `recommend activity "`           → activity
 *   - `use decision "`                 → decision
 *   - `- with "` (inside an activity)  → terminology
 *   - inside `definition is …`         → concept (narrative + arg refs)
 *   - inside `"Lib".<here>"`           → outer-context-driven; caller
 *                                        passes outerKind through
 */
export function detectExpectedKind(linePrefix: string): ExpectedRefKind {
  // Strip the open quote at the end of the prefix so the keyword regex
  // can match the rest. The cursor sits at, or just after, the opening
  // quote of the ref being authored.
  const beforeQuote = stripTrailingOpenQuote(linePrefix);

  // `coded from` — terminology only. Also matches `coded from "Lib"."`.
  if (/\bcoded\s+from\s+(?:"[^"]*"\s*\.\s*)?$/.test(beforeQuote)) return "terminology";

  // `with` inside an activity body. `- with "T"` slot.
  if (/^\s*-\s*with\s+(?:"[^"]*"\s*\.\s*)?$/.test(beforeQuote)) return "terminology";

  // `recommend activity` — activity only.
  if (/\brecommend\s+activity\s+(?:"[^"]*"\s*\.\s*)?$/.test(beforeQuote)) return "activity";

  // `use decision` — decision only.
  if (/\buse\s+decision\s+(?:"[^"]*"\s*\.\s*)?$/.test(beforeQuote)) return "decision";

  // `when` (decision body) — concept.
  if (/\bwhen\s+(?:"[^"]*"\s*\.\s*)?$/.test(beforeQuote)) return "concept";

  // `defined as` — concept. Allow continuations after `(`, sem-* operators,
  // or commas (composition bodies can span lines).
  if (/\bdefined\s+as\s+(?:"[^"]*"\s*\.\s*)?$/.test(beforeQuote)) return "concept";
  if (/(?:\(|sem-and|sem-or|sem-not|,)\s*(?:"[^"]*"\s*\.\s*)?$/.test(beforeQuote)) return "concept";

  // `definition is …` narrative — every ref is a concept. The narrative
  // body wraps across lines; if the prefix mentions `definition is` OR
  // the ref appears mid-narrative without any other keyword classifier,
  // treat as concept.
  if (/\bdefinition\s+is\b/.test(beforeQuote)) return "concept";

  // Common narrative connectors (`during`, `before`, `after`, `as of`,
  // `at least`, `at most`, `on day of`, `on or before`) that immediately
  // precede a concept ref.
  if (/\b(?:during|before|after|as\s+of|on\s+day\s+of|on\s+or\s+before)\s+(?:"[^"]*"\s*\.\s*)?$/.test(beforeQuote)) {
    return "concept";
  }

  return "any";
}

/**
 * When the user is editing the SECOND segment of a qualified ref
 * (`"Lib"."<cursor>"` or `"Lib".<cursor>` before the second quote), return
 * the qualifier ("Lib"); otherwise null.
 *
 * Two detection cases:
 *   1. Cursor sits inside the second quote: prefix ends with `"<lib>"."`.
 *      The `"` trigger char fired completion at this position.
 *   2. Cursor sits right after the dot, before any second quote: prefix
 *      ends with `"<lib>".`. The `.` trigger char fired completion here.
 *      We surface qualified-ref completions immediately so the user sees
 *      Lib's declarations without having to type the second `"` first.
 */
export function detectQualifiedRefQualifier(linePrefix: string): string | null {
  // Case 1: inside the second quote.
  const m1 = /"([^"]+)"\s*\.\s*"$/.exec(linePrefix);
  if (m1) return m1[1];
  // Case 2: right after the dot, before the second quote.
  const m2 = /"([^"]+)"\s*\.\s*$/.exec(linePrefix);
  if (m2) return m2[1];
  return null;
}

/**
 * Heuristic: return true if the cursor (at the end of the prefix) is
 * inside an open double-quoted string on this line.
 *
 * Same logic as the existing `isInsideOpenQuote` in completion.ts; kept
 * here as a pure helper for testability + reuse by detectExpectedKind.
 */
export function isInsideOpenQuote(prefix: string): boolean {
  let count = 0;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] === "\\" && prefix[i + 1] === '"') {
      i++;
      continue;
    }
    if (prefix[i] === '"') count++;
  }
  return count % 2 === 1;
}

/**
 * Remove the trailing open `"` from a prefix so the keyword regexes can
 * match the keyword text directly. Idempotent if no trailing quote.
 */
function stripTrailingOpenQuote(prefix: string): string {
  if (prefix.endsWith('"')) return prefix.slice(0, -1);
  return prefix;
}
