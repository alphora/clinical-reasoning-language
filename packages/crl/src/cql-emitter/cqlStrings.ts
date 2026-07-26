/**
 * CQL single-quoted string-literal escaping — the ONE place both emit lanes escape CQL string content, so they
 * can never drift again (the FHIR lane's inline `dynamicValue` CQL in `fhir-emitter/activity.ts`, and the CQL
 * library emitter's literals in `cql-emitter/emitCQL.ts`). A control char in an author-supplied label / narrative /
 * terminology display must NOT land raw inside the literal.
 *
 * Backslash is escaped FIRST (so the sequences the later passes introduce aren't themselves doubled), then the
 * single quote and the C0 whitespace controls that CQL's string-escape grammar defines (`\n \r \t \f`). This is a
 * leaf module (no emitter imports) so either lane can depend on it without a cycle.
 */
export function escapeCqlString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\f/g, "\\f");
}

/** A complete CQL single-quoted string literal for `s` (e.g. `Deny` → `'Deny'`). */
export function cqlStringLiteral(s: string): string {
  return `'${escapeCqlString(s)}'`;
}

/**
 * A CQL quoted (delimited) identifier for `s` (e.g. `Patient Has Diabetes` →
 * `"Patient Has Diabetes"`). Delimited identifiers escape `\` first (so later
 * passes aren't re-doubled) then the `"` delimiter, mirroring the string-literal
 * escape grammar with a `"` fence. The ONE place both emit lanes quote an
 * identifier — the CQL library emitter (`emitCQL.ts`) and the FHIR lane's inline
 * `text/cql-expression` (a negated action/branch guard, `not "<name>"`, #224 iii)
 * — so they can never drift. Leaf module (no emitter imports).
 */
export function cqlQuotedIdentifier(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
