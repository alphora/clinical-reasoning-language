// REFACTOR:grounded - portable current-answer state without historical client reconstruction.
/** In-memory provenance only; never serialize a custom FHIR extension or trust an id.
 * Authored clinical guards still require owned, named CQL definitions. */
const generated = new WeakMap<object, { text: string; owner: string; names: readonly string[] }>();
export function generatedRetentionExpression(expression: string, owner: string, names: readonly string[] = []): Record<string, unknown> {
  const result = { language: "text/cql", expression };
  generated.set(result, { text: expression, owner, names: [...names] });
  return result;
}
export function retentionExpressionProvenance(expression: object) { return generated.get(expression); }
