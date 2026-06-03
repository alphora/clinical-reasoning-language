import type {
  CRL,
  Statement,
  Concept,
  Decision,
  Activity,
  WhenBlock,
  WhenBlockBody,
  BlockBody,
  ActionStatement,
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

type RefKind = "concept" | "terminology" | "decision" | "activity";

// Map RefKind (singular) to the plural keys used by `LibraryScopeNames`
// in `src/imports/scopes.ts`. The scope shape uses plural for historical
// reasons; the validator uses singular to match the RefKind discriminator.
const REF_KIND_TO_PLURAL = {
  concept: "concepts",
  terminology: "terminologies",
  decision: "decisions",
  activity: "activities",
} as const;

/**
 * Resolves references across every ref slot in the AST:
 *   - concept body:
 *       `coded from "T"`               (T is a terminology)
 *       `defined as "X"` / composition (X is a concept)
 *       `definition is <narrative>`     (concept refs in narrative)
 *   - decision body (recursive through nested WhenBlock + BlockBody):
 *       `when "C"`                     (C is a concept)
 *       `recommend activity "A"`       (A is an activity)
 *       `use decision "D"`             (D is a decision)
 *   - activity body:
 *       `with "T"`                     (T is a terminology, when slot used)
 *
 * Empty refs (`when "" then ...`) are treated as the documented sentinel
 * and skipped without firing a diagnostic.
 *
 * Single-file mode (no `sources`): synthetic self-scope from `ast.library`.
 * Bare refs resolve against the AST's own declarations. Qualified refs
 * whose qualifier == `ast.library.name` are treated as bare; any other
 * qualifier emits `external-library-not-included` (operator-approved
 * extension squiggles until Chunk B).
 *
 * Multi-file mode (with `sources`): each statement walked with its owning
 * scope. Bare refs resolve in `scope.localNames[kind]`. Qualified refs
 * are gated by `scope.knownLibraries` + `scope.explicitIncludes` per the
 * v2.1.0 lock 026 visibility rules.
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
    const names = collectNames(ast.statements);

    // Empty-name self-scope (post-parse-error placeholder): skip qualified-ref
    // policing — the parse error is the real diagnostic, don't pile on.
    const selfLibrary = ast.library.name ?? "";
    const policeQualified = selfLibrary !== "";

    for (const statement of ast.statements) {
      this.walkStatement(
        statement,
        {
          parentName: statement.type === "Concept" || statement.type === "Decision" || statement.type === "Activity"
            ? statement.name
            : "<unknown>",
          parentKind: parentKindOf(statement),
          localNames: names,
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
      // Scope's localNames already pre-populated with per-library decls
      // (concepts + terminologies + decisions + activities) by buildLibraryScopes.
      this.walkStatement(
        stmt,
        {
          parentName: stmt.type === "Concept" || stmt.type === "Decision" || stmt.type === "Activity"
            ? stmt.name
            : "<unknown>",
          parentKind: parentKindOf(stmt),
          localNames: {
            concept: scope.localNames.concepts,
            terminology: scope.localNames.terminologies,
            decision: scope.localNames.decisions,
            activity: scope.localNames.activities,
          },
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

  // -------------------------- top-level dispatch ------------------------

  private walkStatement(stmt: Statement, ctx: WalkContext, errors: ValidationError[]): void {
    switch (stmt.type) {
      case "Concept":
        this.walkConcept(stmt as Concept, ctx, errors);
        return;
      case "Decision":
        this.walkDecision(stmt as Decision, ctx, errors);
        return;
      case "Activity":
        this.walkActivity(stmt as Activity, ctx, errors);
        return;
      case "Terminology":
        // Terminology bodies don't carry refs (just valueset URLs + codes).
        return;
      case "Parameter":
        // v2.2 issue #59: parameter bodies declare a single type
        // token; no narrative refs to walk. Resolution of refs TO
        // parameters lands in Todo 2.
        return;
    }
  }

  // ------------------------ concept body walk ---------------------------

  private walkConcept(concept: Concept, ctx: WalkContext, errors: ValidationError[]): void {
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

  private walkComposition(expr: CompositionExpression, ctx: WalkContext, errors: ValidationError[]): void {
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

  private walkNarrative(clause: NarrativeClause, ctx: WalkContext, errors: ValidationError[]): void {
    for (const el of clause.elements) {
      this.walkNarrativeElement(el, ctx, errors);
    }
  }

  private walkNarrativeElement(el: NarrativeElement, ctx: WalkContext, errors: ValidationError[]): void {
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

  private walkArgValue(av: ArgValue, ctx: WalkContext, errors: ValidationError[]): void {
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

  // ------------------------ decision body walk --------------------------

  private walkDecision(decision: Decision, ctx: WalkContext, errors: ValidationError[]): void {
    for (const wb of decision.body.statements) {
      this.walkWhenBlock(wb, ctx, errors);
    }
  }

  private walkWhenBlock(wb: WhenBlock, ctx: WalkContext, errors: ValidationError[]): void {
    // `when "Concept"` — the conceptName ref. Empty name is the documented
    // sentinel for "always" (per USER_GUIDE); checkRef skips empty refs.
    this.checkRef(wb.conceptName, "concept", wb.location, ctx, errors);
    this.walkWhenBlockBody(wb.body, ctx, errors);
  }

  private walkWhenBlockBody(body: WhenBlockBody, ctx: WalkContext, errors: ValidationError[]): void {
    if (body.type === "BlockBody") {
      this.walkBlockBody(body, ctx, errors);
    } else {
      // ActionStatement
      this.walkActionStatement(body as ActionStatement, ctx, errors);
    }
  }

  private walkBlockBody(block: BlockBody, ctx: WalkContext, errors: ValidationError[]): void {
    for (const stmt of block.statements) {
      if (stmt.type === "WhenBlock") {
        this.walkWhenBlock(stmt, ctx, errors);
      } else {
        // ActionStatement
        this.walkActionStatement(stmt, ctx, errors);
      }
    }
  }

  private walkActionStatement(stmt: ActionStatement, ctx: WalkContext, errors: ValidationError[]): void {
    const action = stmt.action;
    if (action.type === "RecommendActivity") {
      this.checkRef(action.activityName, "activity", action.location, ctx, errors);
    } else if (action.type === "UseDecision") {
      this.checkRef(action.decisionName, "decision", action.location, ctx, errors);
    }
  }

  // ------------------------ activity body walk --------------------------

  private walkActivity(activity: Activity, ctx: WalkContext, errors: ValidationError[]): void {
    const withClause = activity.body.withClause;
    if (withClause && withClause.terminologyReference !== undefined) {
      this.checkRef(
        withClause.terminologyReference,
        "terminology",
        withClause.location,
        ctx,
        errors,
      );
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
    if (!refName) return; // empty sentinel — `when ""` etc. — skip silently

    if (!isQualifiedRef(ref)) {
      // Bare ref: resolve in current library's local names for the
      // expected kind.
      if (!ctx.localNames[refKind].has(refName)) {
        errors.push(this.unresolvedRefError(refKind, refName, ctx, location));
      }
      return;
    }

    // Qualified ref `"Lib"."Name"`.
    const targetLib = getRefLibrary(ref) ?? "";
    if (targetLib === ctx.selfLibrary) {
      if (!ctx.localNames[refKind].has(refName)) {
        errors.push(this.unresolvedRefError(refKind, refName, ctx, location));
      }
      return;
    }

    if (!ctx.policeQualified) {
      // Self-scope mode with empty library name (parse-error placeholder).
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
      const targetSet = target.names[REF_KIND_TO_PLURAL[refKind]];
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
    const msg = unresolvedMessage(refKind, refName, ctx);
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

interface NameBuckets {
  concept: Set<string>;
  terminology: Set<string>;
  decision: Set<string>;
  activity: Set<string>;
}

function emptyBuckets(): NameBuckets {
  return {
    concept: new Set(),
    terminology: new Set(),
    decision: new Set(),
    activity: new Set(),
  };
}

function collectNames(statements: Statement[]): NameBuckets {
  const buckets = emptyBuckets();
  for (const s of statements) {
    if (!s.name) continue;
    switch (s.type) {
      case "Concept":
        buckets.concept.add(s.name);
        break;
      case "Terminology":
        buckets.terminology.add(s.name);
        break;
      case "Decision":
        buckets.decision.add(s.name);
        break;
      case "Activity":
        buckets.activity.add(s.name);
        break;
      case "Parameter":
        // v2.2 issue #59: parameter name collection lands in Todo 2
        // alongside the RefKind/NameBuckets widening.
        break;
    }
  }
  return buckets;
}

function parentKindOf(stmt: Statement): RefKind | "<other>" {
  if (stmt.type === "Concept") return "concept";
  if (stmt.type === "Decision") return "decision";
  if (stmt.type === "Activity") return "activity";
  if (stmt.type === "Terminology") return "terminology";
  return "<other>";
}

interface WalkContext {
  parentName: string;
  parentKind: RefKind | "<other>";
  // Per-kind name sets for bare-ref lookup. In single-file mode this is
  // derived from the AST's own statements; in multi-file mode it comes
  // from `scope.localNames` (mapped to per-kind sets).
  localNames: {
    concept: Set<string>;
    terminology: Set<string>;
    decision: Set<string>;
    activity: Set<string>;
  };
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

function unresolvedMessage(refKind: RefKind, refName: string, ctx: WalkContext): string {
  const parent = ctx.parentName;
  const parentLabel = ctx.parentKind === "<other>" ? "statement" : ctx.parentKind;
  switch (refKind) {
    case "terminology":
      return `Undeclared terminology "${refName}" in ${parentLabel} "${parent}" (no terminology block declares this name)`;
    case "concept":
      return `Unresolved reference "${refName}" in ${parentLabel} "${parent}" (no concept declared with this name)`;
    case "decision":
      return `Unresolved reference "${refName}" in ${parentLabel} "${parent}" (no decision declared with this name)`;
    case "activity":
      return `Unresolved reference "${refName}" in ${parentLabel} "${parent}" (no activity declared with this name)`;
  }
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
