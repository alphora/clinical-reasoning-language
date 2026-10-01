import type { Concept, NarrativeClause } from "../ast/types";

/** Exact selected-answer aggregate; reference roles share this recognizer. */
export function readAnyMembership(body: NarrativeClause) {
  const e = body.elements;
  const word = (i: number, value: string) => e[i]?.type === "NWord" && e[i].value.toLowerCase() === value;
  // REFACTOR:grounded — available values explicitly enumerate the current finite set.
  const availableValuesOnly = word(1, "available") && word(2, "value");
  if (!word(0, "any") || !word(availableValuesOnly ? 3 : 1, "of")) return undefined;
  const operands: Extract<(typeof e)[number], { type: "NConceptRef" }>[] = [];
  let i = availableValuesOnly ? 4 : 2;
  while (e[i]?.type === "NConceptRef") {
    operands.push(e[i] as (typeof operands)[number]);
    i++;
    if (!word(i, "and")) break;
    i++;
    if (e[i]?.type !== "NConceptRef") return undefined;
  }
  const terminology = e[i + 1], validity = e[i + 5];
  if (operands.length < 2 || !word(i, "in") || terminology?.type !== "NConceptRef" ||
      !word(i + 2, "using") || !word(i + 3, "validity") || !word(i + 4, "of") ||
      validity?.type !== "NConceptRef" || e.length !== i + 6) return undefined;
  return { operands, terminology, validity, availableValuesOnly, location: body.location };
}

export function readPublicationAnyMembership(concept: Readonly<Concept>) {
  return concept.definition?.type === "DefinitionIsDefinition" ? readAnyMembership(concept.definition.body) : undefined;
}
