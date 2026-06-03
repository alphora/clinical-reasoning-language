import { CRL } from "../ast/types";
import type { SourceContext } from "../imports/scopes";

import { ValidationError } from "./validator";

type Kind = "Decision" | "Concept" | "Activity" | "Terminology" | "Parameter";

const DUPLICATE_MESSAGES: Record<Kind, string> = {
  Decision: "Duplicate decision name",
  Concept: "Duplicate concept name",
  Activity: "Duplicate activity name",
  Terminology: "Duplicate terminology name",
  Parameter: "Duplicate parameter name",
};

const EMPTY_MESSAGES: Record<Kind, string> = {
  Decision: "Decision name cannot be empty",
  Concept: "Concept name cannot be empty",
  Activity: "Activity name cannot be empty",
  Terminology: "Terminology name cannot be empty",
  Parameter: "Parameter name cannot be empty",
};

/**
 * Enforces name uniqueness within a library's own declarations.
 *
 * Single-file mode (no `sources`): treats the entire AST as one library;
 * a duplicate `(kind, name)` anywhere in `ast.statements` fires.
 *
 * Multi-file mode (with `sources`): keys uniqueness per
 * `(scope.currentLibrary, kind, name)` — same name across DIFFERENT
 * libraries is benign (v2.1.0 per-library scoping lock).
 */
export class NameUniquenessValidator {
  validate(ast: CRL, sources?: SourceContext[]): ValidationError[] {
    if (sources) {
      return this.validateScoped(sources);
    }
    return this.validateFlat(ast);
  }

  private validateFlat(ast: CRL): ValidationError[] {
    const errors: ValidationError[] = [];
    const seen: Record<Kind, Set<string>> = {
      Decision: new Set(),
      Concept: new Set(),
      Activity: new Set(),
      Terminology: new Set(),
      Parameter: new Set(),
    };

    for (const statement of ast.statements) {
      if (!isKind(statement.type)) continue;
      const kind = statement.type;
      this.checkStatement(statement, kind, seen[kind], errors, undefined, undefined);
    }

    return errors;
  }

  private validateScoped(sources: SourceContext[]): ValidationError[] {
    const errors: ValidationError[] = [];
    // Per-library seen sets — keyed by `${origin}|${libraryName}` so local
    // "Foo" and package "Foo" don't conflate into the same uniqueness bucket.
    const perLibrary = new Map<string, Record<Kind, Set<string>>>();

    for (const { stmt, scope } of sources) {
      if (!isKind(stmt.type)) continue;
      const kind = stmt.type;
      const bucketKey = `${scope.origin}|${scope.currentLibrary}`;
      let buckets = perLibrary.get(bucketKey);
      if (!buckets) {
        buckets = {
          Decision: new Set(),
          Concept: new Set(),
          Activity: new Set(),
          Terminology: new Set(),
          Parameter: new Set(),
        };
        perLibrary.set(bucketKey, buckets);
      }
      this.checkStatement(
        stmt,
        kind,
        buckets[kind],
        errors,
        scope.currentLibrary,
        scope.filePath,
      );
    }

    return errors;
  }

  private checkStatement(
    statement: { name: string; location: { start: { line: number; column: number }; end: { line: number; column: number } } },
    kind: Kind,
    seen: Set<string>,
    errors: ValidationError[],
    libraryName: string | undefined,
    filePath: string | undefined,
  ): void {
    if (!statement.name?.trim()) {
      errors.push({
        kind: "empty-name",
        message: EMPTY_MESSAGES[kind],
        location: statement.location,
        severity: "error",
        ...(libraryName !== undefined ? { libraryName } : {}),
        ...(filePath !== undefined ? { filePath } : {}),
      });
      return;
    }
    if (seen.has(statement.name)) {
      errors.push({
        kind: "duplicate-name",
        message: `${DUPLICATE_MESSAGES[kind]}: ${statement.name}`,
        location: statement.location,
        severity: "error",
        ...(libraryName !== undefined ? { libraryName } : {}),
        ...(filePath !== undefined ? { filePath } : {}),
      });
      return;
    }
    seen.add(statement.name);
  }
}

function isKind(t: string): t is Kind {
  return t === "Decision" || t === "Concept" || t === "Activity" || t === "Terminology" || t === "Parameter";
}
