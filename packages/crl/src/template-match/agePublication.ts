// REFACTOR:grounded (#320, plan585): age-today has one explicit publication contract.
import type { Concept } from "../ast/types";
import { isAgeAtStartOfPrefix, isAgeTodayPrefix } from "./agePredicate";
import { readAgeProjection } from "../emit/publicationAge";

export type AgeConceptResolution = { kind: "not-age" } | { kind: "publication" } |
  { kind: "error"; errorKind: string; message: string; anchored?: boolean };
export function ageRetirementMessage(name: string): string {
  return `Concept "${name}": legacy age-today authoring is retired. Use \`shape is Record\`, \`type is Observation\`, \`value type is boolean\`, \`shape reduction is most recent\`, and one \`source representation\` with \`type is Patient\` and \`value projection is age today <at least|at most|under|younger than> <n> <years|months>\`. Keep a local \`code is\` only when an answer representation is intended; omit it for a read-only calculation. Do not declare a value element or value type on the Patient representation. Missing Patient.birthDate remains unknown. Anchored \`age at start of\` is a separate pattern.`;
}
export function isRetiredAgeTodayDefinition(c: Concept): boolean {
  return c.definition?.type === "DefinitionIsDefinition" && isAgeTodayPrefix(c.definition.body);
}
export function resolveAgeConcept(c: Concept): AgeConceptResolution {
  const error = (errorKind: string, message: string, anchored = false): AgeConceptResolution => ({ kind: "error", errorKind, message, anchored });
  // Public AST emit entry points must not reinterpret a previously lowered age twin as another family.
  if ((c as unknown as { __bothRepMerge?: string }).__bothRepMerge === "recency") return error("emit-age-form-retired", ageRetirementMessage(c.name));
  if (isRetiredAgeTodayDefinition(c)) return error("emit-age-definition-retired", ageRetirementMessage(c.name));
  const reps = c.representations ?? [];
  const ages = reps.filter(r => r.valueProjection && (isAgeTodayPrefix(r.valueProjection.body) || isAgeAtStartOfPrefix(r.valueProjection.body)));
  if (!ages.length) return { kind: "not-age" };
  if (ages.some(r => isAgeAtStartOfPrefix(r.valueProjection!.body))) return error("emit-age-projection-unsupported", `Concept "${c.name}": anchored age references a concept and belongs in a concept-level definition, not a source projection.`, true);
  if (ages.some(r => r.conceptType !== "Patient")) return error("emit-age-projection-wrong-carrier", `Concept "${c.name}": age today projects Patient.birthDate. Declare \`type is Patient\` on its source representation.`);
  if (ages.some(r => !readAgeProjection(r))) return error("emit-age-projection-unsupported", `Concept "${c.name}": unsupported age projection. ${ageRetirementMessage(c.name)}`);
  if (c.shape !== "Record" || c.conceptType !== "Observation" || !c.shapeReduction) return error("emit-age-form-retired", ageRetirementMessage(c.name));
  if (reps.length !== 1 || c.definition || c.valueTypes.length !== 1 || c.valueTypes[0] !== "boolean") return error("emit-age-projection-unsupported", `Concept "${c.name}": age publication requires exactly one Patient projection, one boolean value type and no top-level definition. ${ageRetirementMessage(c.name)}`);
  return { kind: "publication" };
}
