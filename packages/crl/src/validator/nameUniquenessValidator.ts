import { CRL } from "../ast/types";
import type { SourceContext } from "../imports/scopes";

import { ValidationError } from "./validator";

type Kind = "Decision" | "Concept" | "Activity" | "Terminology" | "Parameter" | "Criterion";

// #224 ii: `Concept` and `Criterion` share ONE uniqueness bucket — a name is a
// concept XOR a criterion (guard resolution searches concepts∪criteria, so a name
// declared as both would be ambiguous). Every OTHER kind keeps its own bucket, so
// Decision "Foo" + Concept "Foo" still legally coexist (the pre-#224 per-kind rule).
type Bucket = "concept-or-criterion" | "Decision" | "Activity" | "Terminology" | "Parameter";

function bucketOf(kind: Kind): Bucket {
  return kind === "Concept" || kind === "Criterion" ? "concept-or-criterion" : kind;
}

const DUPLICATE_MESSAGES: Record<Kind, string> = {
  Decision: "Duplicate decision name",
  Concept: "Duplicate concept name",
  Activity: "Duplicate activity name",
  Terminology: "Duplicate terminology name",
  Parameter: "Duplicate parameter name",
  Criterion: "Duplicate criterion name",
};

const EMPTY_MESSAGES: Record<Kind, string> = {
  Decision: "Decision name cannot be empty",
  Concept: "Concept name cannot be empty",
  Activity: "Activity name cannot be empty",
  Terminology: "Terminology name cannot be empty",
  Parameter: "Parameter name cannot be empty",
  Criterion: "Criterion name cannot be empty",
};

// Human word for the cross-kind collision message. Only the concept/criterion pair
// can collide across kinds (they are the only shared bucket), so this only ever
// renders "concept" or "criterion".
const KIND_WORD: Record<Kind, string> = {
  Decision: "decision",
  Concept: "concept",
  Activity: "activity",
  Terminology: "terminology",
  Parameter: "parameter",
  Criterion: "criterion",
};

/**
 * Enforces name uniqueness within a library's own declarations.
 *
 * Single-file mode (no `sources`): treats the entire AST as one library;
 * a duplicate `(bucket, name)` anywhere in `ast.statements` fires.
 *
 * Multi-file mode (with `sources`): keys uniqueness per
 * `(scope.currentLibrary, bucket, name)` — same name across DIFFERENT
 * libraries is benign (v2.1.0 per-library scoping lock).
 *
 * #224 ii: `Concept` and `Criterion` share a bucket (see `bucketOf`), so a name
 * declared as both a concept and a criterion is a `duplicate-name` error, in either
 * declaration order — the guard-resolution namespace stays concept-XOR-criterion.
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
    // Per-bucket name → first-claiming kind, so a cross-kind (concept/criterion)
    // collision can name the prior kind in its message.
    const seen = new Map<Bucket, Map<string, Kind>>();

    for (const statement of ast.statements) {
      if (!isKind(statement.type)) continue;
      this.checkStatement(statement, statement.type, seen, errors, undefined, undefined);
    }

    return errors;
  }

  private validateScoped(sources: SourceContext[]): ValidationError[] {
    const errors: ValidationError[] = [];
    // Per-library seen maps — keyed by `${origin}|${libraryName}` so local
    // "Foo" and package "Foo" don't conflate into the same uniqueness bucket.
    const perLibrary = new Map<string, Map<Bucket, Map<string, Kind>>>();

    for (const { stmt, scope } of sources) {
      if (!isKind(stmt.type)) continue;
      const bucketKey = `${scope.origin}|${scope.currentLibrary}`;
      let seen = perLibrary.get(bucketKey);
      if (!seen) {
        seen = new Map<Bucket, Map<string, Kind>>();
        perLibrary.set(bucketKey, seen);
      }
      this.checkStatement(
        stmt,
        stmt.type,
        seen,
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
    seen: Map<Bucket, Map<string, Kind>>,
    errors: ValidationError[],
    libraryName: string | undefined,
    filePath: string | undefined,
  ): void {
    const attrib = {
      ...(libraryName !== undefined ? { libraryName } : {}),
      ...(filePath !== undefined ? { filePath } : {}),
    };
    if (!statement.name?.trim()) {
      errors.push({
        kind: "empty-name",
        message: EMPTY_MESSAGES[kind],
        location: statement.location,
        severity: "error",
        ...attrib,
      });
      return;
    }
    const bucket = bucketOf(kind);
    let names = seen.get(bucket);
    if (!names) {
      names = new Map<string, Kind>();
      seen.set(bucket, names);
    }
    const prior = names.get(statement.name);
    if (prior !== undefined) {
      // Same kind → the classic per-kind duplicate. Different kind (only possible
      // in the shared concept-or-criterion bucket) → a cross-kind collision that
      // names the kind that already claimed it.
      const message =
        prior === kind
          ? `${DUPLICATE_MESSAGES[kind]}: ${statement.name}`
          : `Name "${statement.name}" is already declared as a ${KIND_WORD[prior]}; a concept and a criterion cannot share a name`;
      errors.push({
        kind: "duplicate-name",
        message,
        location: statement.location,
        severity: "error",
        ...attrib,
      });
      return;
    }
    names.set(statement.name, kind);
  }
}

function isKind(t: string): t is Kind {
  return (
    t === "Decision" ||
    t === "Concept" ||
    t === "Activity" ||
    t === "Terminology" ||
    t === "Parameter" ||
    t === "Criterion"
  );
}
