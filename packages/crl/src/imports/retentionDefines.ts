// REFACTOR:grounded — compiler transport has owned public definitions in the
// same physical library the PlanDefinition binds. No authored AST is changed.
import type { PerLibraryEmit } from "./emit";
import type { PreparedPublicationContext } from "./preparePublicationContext";
import type { CRLError } from "../types/errors";
import { DefineLedger } from "../emit/booleanTotality";
import { publicationRetentionPlan } from "../emit/retentionPredicates";
import { cqlQuotedIdentifier } from "../cql-emitter/cqlStrings";

export function appendRetentionDefines(prepared: PreparedPublicationContext, manifest: PerLibraryEmit[]): CRLError[] {
  const errors: CRLError[] = [];
  for (const source of prepared.rawCqlClosure) {
    const predicates = source.ast.statements.flatMap(statement => statement.type === "Decision"
      ? publicationRetentionPlan(prepared.publications, source.filePath, source.ast, statement).flatMap(slot => [slot.reach, slot.presence]) : []);
    if (!predicates.length) continue;
    const entries = manifest.filter(entry => entry.filePath === source.filePath);
    const owner = entries.find(entry => entry.role === "interface") ?? entries.find(entry => entry.role === "root");
    if (!owner) {
      errors.push({ type: "Validation", kind: "retention-condition-owner-missing", message: `No emitted condition Library owns retention for "${source.name}".` });
      continue;
    }
    // Include every emitted declaration namespace, including function names. A user
    // spelling a generated name must fail rather than shadow an executable predicate.
    const declarations = new Set([...owner.cql.matchAll(/^\s*(?:define(?:\s+(?:public|private))?(?:\s+function)?|parameter|code|codesystem|valueset)\s+(?:"((?:\\.|[^"\\])*)"|([A-Za-z_]\w*))/gm)]
      .map(match => (match[1] ?? match[2]).replace(/\\(["\\])/g, "$1")));
    const generated = new Map<string, string>();
    const ledger = new DefineLedger();
    for (const { name, body } of predicates) {
      const previous = generated.get(name);
      if (previous === body) continue;
      if (previous !== undefined || declarations.has(name)) {
        errors.push({ type: "Validation", kind: "retention-condition-name-collision", message: `Generated retention condition "${name}" collides in Library "${owner.libraryName}".` });
        continue;
      }
      generated.set(name, body);
      ledger.appendDefine({ library: owner.libraryName, name, resultType: "Boolean",
        obligation: { kind: "requires-boundary", form: "compiler current-answer retention", cell: "transport reach/presence only" },
        discharge: { booleanEffect: "total", dischargedBy: "boundary-coalesce" }, origin: "plan-retention-condition",
        cql: `define ${cqlQuotedIdentifier(name)}:\n  ${body}`, obligationSource: "manufactured",
        result: { shape: "Scalar", valueType: "boolean" }, visibility: "public" });
    }
    owner.cql = owner.cql.trimEnd() + "\n\n" + ledger.render() + "\n";
    owner.ledgerEntries = [...owner.ledgerEntries ?? [], ...ledger.entries()];
  }
  return errors;
}
