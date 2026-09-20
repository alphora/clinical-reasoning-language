import { expect } from "vitest";
import type { emitCQLImports } from "../../imports/emit";

/** REFACTOR:grounded: tests follow the PlanDefinition binding into its actual CQL owner. */
export function planConditionBody(result: ReturnType<typeof emitCQLImports>, plan: { library: string[] }, expression: { language: string; expression: string; reference?: string }): string {
  expect(expression.language).toBe("text/cql-identifier");
  const owner = (expression.reference ?? plan.library[0]!).split("|")[0]!.split("/").pop();
  const entry = result.cqlByLibrary.find(l => l.libraryName === owner);
  expect(entry, `Missing bound CQL Library ${owner}`).toBeDefined();
  const definition = entry!.ledgerEntries?.find(d => d.name === expression.expression && d.visibility !== "impl");
  expect(definition, `Missing ${owner}.${expression.expression}`).toBeDefined();
  return definition!.cql.slice(definition!.cql.indexOf(":") + 1).trim();
}
