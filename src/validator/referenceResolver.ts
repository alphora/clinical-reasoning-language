import type {
  CRL,
  Concept,
  CompositionExpression,
  DefinedAsComposition,
  NarrativeClause,
  NarrativeElement,
  ArgValue,
  Location,
  ReferenceName,
} from "../ast/types";
import { getRefName, getRefLibrary, isQualifiedRef } from "../ast/types";
import type { LibraryScope, SourceContext } from "../imports/scopes";
import { lookupKnownLibrary } from "../imports/scopes";

import { ValidationError } from "./validator";

type RefKind = "concept" | "terminology";

/**
 * Resolves references in concept body slots:
 *   - `coded from "T"` — T must be a terminology
 *   - `defined as ...` — refs must be concepts (bare or composition)
 *   - `definition is <narrative>` — concept refs in narrative + in arg
 *     disjunction/conjunction
 *
 * Single-file mode (no `sources`): synthetic self-scope from `ast.library`.
 * Bare refs resolve against the AST's own declarations. Qualified refs
 * whose qualifier == `ast.library.name` are treated as bare; any other
 * qualifier emits `external-library-not-included`.
 *
 * Multi-file mode (with `sources`): each concept walked with its owning
 * scope. Bare refs resolve in `scope.localNames`. Qualified refs are
 * gated by `scope.knownLibraries` + `scope.explicitIncludes` per the
 * v2.1.0 lock 026 visibility rules.
 *
 * NOTE — v2.1.0 commit 2c: this validator does NOT yet walk non-concept-body
 * ref slots (WhenBlock.conceptName, UseDecision.decisionName,
 * RecommendActivity.activityName, ActivityWith.terminologyReference).
 * Those refs parse to ReferenceName but go un-validated until commit 2e
 * (or later). Known limitation; operator-approved.
 */
export class ReferenceResolver {
  validate(ast: CRL, sources?: SourceContext[]): ValidationError[] {
    if (sources) {
      return this.validateScoped(sources);
    }
    return this.validateSelfScope(ast);
  }

  // -------------------------- single-file path --------------------------

  private validateSelfScope(ast: CRL): ValidationError[] {
    const errors: ValidationError[] = [];
    const conceptNames = new Set<string>();
    const terminologyNames = new Set<string>();
    for (const statement of ast.statements) {
      if (statement.type === "Concept" && statement.name) {
        conceptNames.add(statement.name);
      } else if (statement.type === "Terminology" && statement.name) {
        terminologyNames.add(statement.name);
      }
    }

    // Empty-name self-scope (post-parse-error placeholder): skip qualified-ref
    // policing — the parse error is the real diagnostic, don't pile on.
    const selfLibrary = ast.library.name ?? "";
    const policeQualified = selfLibrary !== "";

    for (const statement of ast.statements) {
      if (statement.type !== "Concept") continue;
      this.walkConcept(
        statement,
        {
          parentName: statement.name,
          conceptNames,
          terminologyNames,
          selfLibrary,
          policeQualified,
          libraryName: undefined,
          filePath: undefined,
          scopeForQualified: undefined,
        },
        errors,
      );
    }

    return errors;
  }

  // --------------------------- multi-file path --------------------------

  private validateScoped(sources: SourceContext[]): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const { stmt, scope } of sources) {
      if (stmt.type !== "Concept") continue;
      this.walkConcept(
        stmt,
        {
          parentName: stmt.name,
          conceptNames: scope.localNames.concepts,
          terminologyNames: scope.localNames.terminologies,
          selfLibrary: scope.currentLibrary,
          policeQualified: true,
          libraryName: scope.currentLibrary,
          filePath: scope.filePath,
          scopeForQualified: scope,
        },
        errors,
      );
    }

    return errors;
  }

  // ------------------------ shared concept walk -------------------------

  private walkConcept(
    concept: Concept,
    ctx: WalkContext,
    errors: ValidationError[],
  ): void {
    switch (concept.definition.type) {
      case "CodedFromDefinition": {
        const termRef = concept.definition.terminologyName;
        this.checkRef(termRef, "terminology", concept.definition.location, ctx, errors);
        break;
      }
      case "DefinedAsDefinition": {
        const body = concept.definition.body;
        if (body.type === "DefinedAsBareRef") {
          this.checkRef(body.ref, "concept", body.location, ctx, errors);
        } else if (body.type === "DefinedAsComposition") {
          this.walkComposition(
            (body as DefinedAsComposition).expression,
            ctx,
            errors,
          );
        }
        break;
      }
      case "DefinitionIsDefinition":
        this.walkNarrative(concept.definition.body, ctx, errors);
        break;
    }
  }

  private walkComposition(
    expr: CompositionExpression,
    ctx: WalkContext,
    errors: ValidationError[],
  ): void {
    switch (expr.type) {
      case "SemOrExpression":
      case "SemAndExpression":
        for (const term of expr.terms) {
          this.walkComposition(term, ctx, errors);
        }
        return;
      case "SemNotExpression":
        this.walkComposition(expr.expression, ctx, errors);
        return;
      case "CompositionGroup":
        this.walkComposition(expr.expression, ctx, errors);
        return;
      case "CompositionRef":
        this.checkRef(expr.ref, "concept", expr.location, ctx, errors);
        return;
    }
  }

  private walkNarrative(
    clause: NarrativeClause,
    ctx: WalkContext,
    errors: ValidationError[],
  ): void {
    for (const el of clause.elements) {
      this.walkNarrativeElement(el, ctx, errors);
    }
  }

  private walkNarrativeElement(
    el: NarrativeElement,
    ctx: WalkContext,
    errors: ValidationError[],
  ): void {
    switch (el.type) {
      case "NConceptRef":
        this.checkRef(el.value, "concept", el.location, ctx, errors);
        return;
      case "NDisjunction":
        for (const av of el.disjuncts) {
          this.walkArgValue(av, ctx, errors);
        }
        return;
      case "NConjunction":
        for (const av of el.conjuncts) {
          this.walkArgValue(av, ctx, errors);
        }
        return;
      // NWord, Quantity — not refs
    }
  }

  private walkArgValue(
    av: ArgValue,
    ctx: WalkContext,
    errors: ValidationError[],
  ): void {
    switch (av.type) {
      case "NConceptRef":
        this.checkRef(av.value, "concept", av.location, ctx, errors);
        return;
      case "NDisjunction":
        for (const inner of av.disjuncts) {
          this.walkArgValue(inner, ctx, errors);
        }
        return;
      case "NConjunction":
        for (const inner of av.conjuncts) {
          this.walkArgValue(inner, ctx, errors);
        }
        return;
      // Quantity — not a ref
    }
  }

  // ---------------------------- ref check -------------------------------

  private checkRef(
    ref: ReferenceName,
    refKind: RefKind,
    location: Location,
    ctx: WalkContext,
    errors: ValidationError[],
  ): void {
    const refName = getRefName(ref);
    if (!refName) return;

    if (!isQualifiedRef(ref)) {
      // Bare ref: resolve in current library's local names.
      const found = refKind === "concept"
        ? ctx.conceptNames.has(refName)
        : ctx.terminologyNames.has(refName);
      if (!found) {
        errors.push(this.unresolvedRefError(refKind, refName, ctx, location));
      }
      return;
    }

    // Qualified ref `"Lib"."Name"`.
    const targetLib = getRefLibrary(ref) ?? "";
    if (targetLib === ctx.selfLibrary) {
      // Treat as bare in current library.
      const found = refKind === "concept"
        ? ctx.conceptNames.has(refName)
        : ctx.terminologyNames.has(refName);
      if (!found) {
        errors.push(this.unresolvedRefError(refKind, refName, ctx, location));
      }
      return;
    }

    if (!ctx.policeQualified) {
      // Self-scope mode with empty library name (parse-error placeholder).
      // Skip new diagnostic firing.
      return;
    }

    // Multi-file: resolve via the scope's known-libraries map.
    if (ctx.scopeForQualified) {
      const target = lookupKnownLibrary(ctx.scopeForQualified, targetLib);
      if (!target) {
        errors.push(externalLibraryNotIncluded(targetLib, ctx, location));
        return;
      }
      // Package-origin libraries require explicit include from the asking file.
      if (
        target.origin === "package" &&
        !ctx.scopeForQualified.explicitIncludes.has(targetLib)
      ) {
        errors.push(externalLibraryNotIncluded(targetLib, ctx, location));
        return;
      }
      const targetSet = refKind === "concept"
        ? target.names.concepts
        : target.names.terminologies;
      if (!targetSet.has(refName)) {
        errors.push(qualifiedRefUnresolved(targetLib, refName, ctx, location));
      }
      return;
    }

    // Single-file mode: any qualifier other than self is external.
    errors.push(externalLibraryNotIncluded(targetLib, ctx, location));
  }

  private unresolvedRefError(
    refKind: RefKind,
    refName: string,
    ctx: WalkContext,
    location: Location,
  ): ValidationError {
    const msg = refKind === "terminology"
      ? `Undeclared terminology "${refName}" in concept "${ctx.parentName}" (no terminology block declares this name)`
      : `Unresolved reference "${refName}" in concept "${ctx.parentName}" (no concept declared with this name)`;
    return {
      kind: "unresolved-reference",
      message: msg,
      location,
      severity: "error",
      ...(ctx.libraryName !== undefined ? { libraryName: ctx.libraryName } : {}),
      ...(ctx.filePath !== undefined ? { filePath: ctx.filePath } : {}),
    };
  }
}

interface WalkContext {
  parentName: string;
  conceptNames: Set<string>;
  terminologyNames: Set<string>;
  selfLibrary: string;
  // false only in single-file self-scope with empty library name; suppresses
  // qualified-ref diagnostic firing because the parse error is the real signal.
  policeQualified: boolean;
  libraryName: string | undefined;
  filePath: string | undefined;
  // Present only in multi-file mode; carries known-libraries + explicit
  // includes for the qualified-ref decision.
  scopeForQualified: LibraryScope | undefined;
}

function externalLibraryNotIncluded(
  targetLib: string,
  ctx: WalkContext,
  location: Location,
): ValidationError {
  return {
    kind: "external-library-not-included",
    message: `Qualified reference "${targetLib}"."..." references library "${targetLib}" which is not in scope (add \`include "${targetLib}".\` to this file)`,
    location,
    severity: "error",
    targetLibrary: targetLib,
    ...(ctx.libraryName !== undefined ? { libraryName: ctx.libraryName } : {}),
    ...(ctx.filePath !== undefined ? { filePath: ctx.filePath } : {}),
  };
}

function qualifiedRefUnresolved(
  targetLib: string,
  targetName: string,
  ctx: WalkContext,
  location: Location,
): ValidationError {
  return {
    kind: "qualified-ref-unresolved",
    message: `Qualified reference "${targetLib}"."${targetName}" — library "${targetLib}" has no declaration named "${targetName}" of the expected kind`,
    location,
    severity: "error",
    targetLibrary: targetLib,
    targetName,
    ...(ctx.libraryName !== undefined ? { libraryName: ctx.libraryName } : {}),
    ...(ctx.filePath !== undefined ? { filePath: ctx.filePath } : {}),
  };
}
