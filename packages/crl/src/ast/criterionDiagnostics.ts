// REFACTOR:grounded (#320, review 563): validator-free consumers share the foreign
// criterion refusal wording while retaining their own scope and source locations.
export function foreignCriterionMessage(refDisplay: string): string {
  return `Foreign-qualified criterion ${refDisplay} is unsupported; use a criterion declared in the current library.`;
}
