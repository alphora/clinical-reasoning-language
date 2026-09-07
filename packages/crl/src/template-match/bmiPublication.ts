// REFACTOR:grounded (#320, plan595): BMI has one explicit candidate-production contract.
import type { Concept } from "../ast/types";
import { readPublicationBMI } from "../emit/publicationBMI";

/** Inspect narrative tokens, never text inside a quoted concept name or literal. */
function containsBMI(node: unknown): boolean {
  if (Array.isArray(node)) {
    if (
      node.some((_, i) =>
        ["body", "mass", "index"].every(
          (word, j) => node[i + j]?.type === "NWord" && node[i + j].value.toLowerCase() === word,
        ),
      )
    )
      return true;
    return node.some(containsBMI);
  }
  return node !== null && typeof node === "object" && Object.values(node).some(containsBMI);
}

export function bmiRetirementReason(concept: Readonly<Concept>): string | undefined {
  const projectionBMI = (concept.representations ?? []).some((r) => containsBMI(r.valueProjection));
  if (!containsBMI(concept.definition) && !projectionBMI) return undefined;
  if (
    !projectionBMI &&
    readPublicationBMI(concept) !== undefined &&
    concept.shape === "Record" &&
    concept.conceptType === "Observation" &&
    concept.valueTypes.length === 1 &&
    concept.valueTypes[0] === "Quantity" &&
    concept.shapeReduction !== undefined
  )
    return undefined;
  const problem =
    readPublicationBMI(concept) === undefined
      ? "legacy BMI authoring is retired"
      : "BMI publication is incomplete or unsupported";
  return `Concept "${concept.name}": ${problem}. Use \`shape is Record\`, \`type is Observation\`, \`value type is Quantity\`, \`definition is body mass index of "Weight" and "Height" using validity of "Weight"\`, and separate \`shape reduction is most recent\`. Both operands must be explicitly selected Quantity publications. Choose either operand as the validity anchor; no timestamp is invented. Keep a local \`code is\` only when an answer representation is intended. Migrate existing content when editing it; do not append \`then most recent this\` or use a prefix reduction.`;
}
