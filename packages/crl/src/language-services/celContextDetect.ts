// CEL completion context-detection (roadmap item #4). Classifies the completion slot from the line
// PREFIX (text before the cursor). CEL-specific — the CRL `detectExpectedKind` keys on CRL phrases.
// Slots re-derived from CELParser.g4 (design review round 1). Each pattern requires the prefix to end
// inside an OPEN quote (`"[^"]*$`), so the cursor is positioned in a quoted symbol slot.
export type CelSlot =
  | { kind: "library" } // covers "…" / include "…"
  | { kind: "fact" } // - subject is "…" / - encounter is "…" / - fact is "…"
  | { kind: "fhir-type" } // - defined by "…"  (bare → a FHIR resource type)
  | { kind: "concept-or-activity"; library: string } // - defined by "Lib"."…"  (qualified)
  | { kind: "leaf" } // - result is "…"  (a decision OR a boolean concept)
  | { kind: "result-arm"; leaf: string } // - result is "leaf" is "…"  (QUOTED → a decision branch)
  | { kind: "result-bool" }; // - result is "leaf" is <here>  (BARE → a concept's true/false)

export function detectCelSlot(linePrefix: string): CelSlot | null {
  // `result is "leaf" is "<here>"` — a QUOTED value is a decision branch (an arm). Check first.
  const arm = /^\s*-\s*result\s+is\s+"([^"]+)"\s+is\s+"[^"]*$/i.exec(linePrefix);
  if (arm) return { kind: "result-arm", leaf: arm[1] };
  // `result is "leaf" is <here>` — a BARE value (no quote) is a concept's true/false keyword
  // (CELParser.g4: resultValue : TRUE | FALSE | stringLiteral). Match the post-`is ` bare-word position.
  if (/^\s*-\s*result\s+is\s+"[^"]+"\s+is\s+[A-Za-z]*$/i.test(linePrefix)) return { kind: "result-bool" };
  if (/^\s*-\s*result\s+is\s+"[^"]*$/i.test(linePrefix)) return { kind: "leaf" };

  // `defined by "Lib"."<here>"` qualified — check before the bare slot.
  const qd = /^\s*-\s*defined\s+by\s+"([^"]+)"\s*\.\s*"[^"]*$/i.exec(linePrefix);
  if (qd) return { kind: "concept-or-activity", library: qd[1] };
  if (/^\s*-\s*defined\s+by\s+"[^"]*$/i.test(linePrefix)) return { kind: "fhir-type" };

  if (/^\s*-\s*(?:subject|encounter|fact)\s+is\s+"[^"]*$/i.test(linePrefix)) return { kind: "fact" };

  if (/^\s*(?:covers|include)\s+"[^"]*$/i.test(linePrefix)) return { kind: "library" };

  return null;
}
