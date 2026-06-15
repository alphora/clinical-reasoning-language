import type {
  CRL,
  Statement,
  Concept,
  Decision,
  Activity,
  BranchBlock,
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

type RefKind = "concept" | "terminology" | "decision" | "activity" | "parameter";

/**
 * v2.2 issue #59 — acceptable-kinds set for a ref slot. First element is
 * the precedence-winner / fallback. Non-empty by construction.
 */
type AcceptableKinds = readonly [RefKind, ...RefKind[]];

/** Concept-accepting slot — also accepts parameter for narrative refs. */
const NARRATIVE_REF_KINDS: AcceptableKinds = ["concept", "parameter"] as const;
/** Concept-only slot — `defined as` bare ref, composition refs, `when "C"`. */
const CONCEPT_REF_KINDS: AcceptableKinds = ["concept"] as const;
/** Terminology-only slot — `coded from`, activity `with`. */
const TERMINOLOGY_REF_KINDS: AcceptableKinds = ["terminology"] as const;
/** Decision-only slot — `use decision`. */
const DECISION_REF_KINDS: AcceptableKinds = ["decision"] as const;
/** Activity-only slot — `recommend activity`. */
const ACTIVITY_REF_KINDS: AcceptableKinds = ["activity"] as const;

// Map RefKind (singular) to the plural keys used by `LibraryScopeNames`
// in `src/imports/scopes.ts`. The scope shape uses plural for historical
// reasons; the validator uses singular to match the RefKind discriminator.
const REF_KIND_TO_PLURAL = {
  concept: "concepts",
  terminology: "terminologies",
  decision: "decisions",
  activity: "activities",
  parameter: "parameters",
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
 * Empty refs (`""`) fire a normal unresolved-reference diagnostic. The former
 * `when ""` "always" sentinel is gone — `otherwise` is now the structural
 * catch-all (see docs/decision-shapes.md), so an empty ref is just a typo.
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
      // v2.2 issue #59: parameter bodies declare a single type token,
      // no narrative refs to walk. Short-circuit BEFORE WalkContext
      // construction (round-2 catch — context was being built then
      // thrown away).
      if (statement.type === "Parameter") continue;
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
      if (stmt.type === "Parameter") continue;
      // Scope's localNames already pre-populated with per-library decls
      // by buildLibraryScopes — including parameters as of v2.2.
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
            parameter: scope.localNames.parameters,
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
        // token; no narrative refs to walk. Short-circuit also lives
        // in validateSelfScope/validateScoped to avoid wasted
        // WalkContext construction (round-2 catch).
        return;
    }
  }

  // ------------------------ concept body walk ---------------------------

  private walkConcept(concept: Concept, ctx: WalkContext, errors: ValidationError[]): void {
    const def = concept.definition;
    if (def) {
      switch (def.type) {
        case "CodedFromDefinition": {
          // Named coded-from resolves to a terminology; inline coding carries no ref.
          if (def.terminologyName) {
            this.checkRef(def.terminologyName, TERMINOLOGY_REF_KINDS, def.location, ctx, errors);
          }
          break;
        }
        case "DefinedAsDefinition": {
          const body = def.body;
          if (body.type === "DefinedAsBareRef") {
            this.checkRef(body.ref, CONCEPT_REF_KINDS, body.location, ctx, errors);
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
          this.walkNarrative(def.body, ctx, errors);
          break;
      }
    }
    // possible representations (ADR 0001 §3): validate named coded-from refs;
    // inline codings carry no terminology reference.
    for (const rep of concept.representations ?? []) {
      if (rep.terminologyName) {
        this.checkRef(rep.terminologyName, TERMINOLOGY_REF_KINDS, rep.location, ctx, errors);
      }
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
        this.checkRef(expr.ref, CONCEPT_REF_KINDS, expr.location, ctx, errors);
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
        this.checkRef(el.value, NARRATIVE_REF_KINDS, el.location, ctx, errors);
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
        this.checkRef(av.value, NARRATIVE_REF_KINDS, av.location, ctx, errors);
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
    for (const branch of decision.body.statements) {
      this.walkBranch(branch, ctx, errors);
    }
  }

  private walkBranch(branch: BranchBlock, ctx: WalkContext, errors: ValidationError[]): void {
    // `when "Concept"` carries a concept ref; `otherwise` carries no condition.
    if (branch.type === "WhenBlock") {
      this.checkRef(branch.conceptName, CONCEPT_REF_KINDS, branch.location, ctx, errors);
    }
    this.walkWhenBlockBody(branch.body, ctx, errors);
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
      if (stmt.type === "WhenBlock" || stmt.type === "OtherwiseBlock") {
        this.walkBranch(stmt, ctx, errors);
      } else {
        // ActionStatement
        this.walkActionStatement(stmt, ctx, errors);
      }
    }
  }

  private walkActionStatement(stmt: ActionStatement, ctx: WalkContext, errors: ValidationError[]): void {
    const action = stmt.action;
    if (action.type === "RecommendActivity") {
      this.checkRef(action.activityName, ACTIVITY_REF_KINDS, action.location, ctx, errors);
    } else if (action.type === "UseDecision") {
      this.checkRef(action.decisionName, DECISION_REF_KINDS, action.location, ctx, errors);
    }
  }

  // ------------------------ activity body walk --------------------------

  private walkActivity(activity: Activity, ctx: WalkContext, errors: ValidationError[]): void {
    const withClause = activity.body.withClause;
    if (withClause && withClause.terminologyReference !== undefined) {
      this.checkRef(
        withClause.terminologyReference,
        TERMINOLOGY_REF_KINDS,
        withClause.location,
        ctx,
        errors,
      );
    }
  }

  // ---------------------------- ref check -------------------------------

  private checkRef(
    ref: ReferenceName,
    acceptableKinds: AcceptableKinds,
    location: Location,
    ctx: WalkContext,
    errors: ValidationError[],
  ): void {
    const refName = getRefName(ref);

    if (!isQualifiedRef(ref)) {
      // Bare ref: try each acceptable bucket in precedence order; succeed on first hit.
      for (const kind of acceptableKinds) {
        if (ctx.localNames[kind].has(refName)) return;
      }
      errors.push(this.unresolvedRefError(acceptableKinds, refName, ctx, location));
      return;
    }

    // Qualified ref `"Lib"."Name"`.
    const targetLib = getRefLibrary(ref) ?? "";
    if (targetLib === ctx.selfLibrary) {
      for (const kind of acceptableKinds) {
        if (ctx.localNames[kind].has(refName)) return;
      }
      errors.push(this.unresolvedRefError(acceptableKinds, refName, ctx, location));
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
      for (const kind of acceptableKinds) {
        const targetSet = target.names[REF_KIND_TO_PLURAL[kind]];
        if (targetSet.has(refName)) return;
      }
      errors.push(qualifiedRefUnresolved(targetLib, refName, acceptableKinds, ctx, location));
      return;
    }

    // Single-file mode: any qualifier other than self is external.
    errors.push(externalLibraryNotIncluded(targetLib, ctx, location));
  }

  private unresolvedRefError(
    acceptableKinds: AcceptableKinds,
    refName: string,
    ctx: WalkContext,
    location: Location,
  ): ValidationError {
    const msg = unresolvedMessage(acceptableKinds, refName, ctx);
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
  parameter: Set<string>;
}

function emptyBuckets(): NameBuckets {
  return {
    concept: new Set(),
    terminology: new Set(),
    decision: new Set(),
    activity: new Set(),
    parameter: new Set(),
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
        buckets.parameter.add(s.name);
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
  if (stmt.type === "Parameter") return "parameter";
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
    parameter: Set<string>;
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

/**
 * Render the trailing parenthetical from the acceptable-kinds set. For
 * pure-terminology slots the existing "no terminology block declares
 * this name" wording is preserved (round-2 catch: factored template
 * would have flattened this to "no terminology declared with this
 * name", a user-visible diagnostic change).
 */
function unresolvedMessage(acceptableKinds: AcceptableKinds, refName: string, ctx: WalkContext): string {
  const parent = ctx.parentName;
  const parentLabel = ctx.parentKind === "<other>" ? "statement" : ctx.parentKind;

  // Preserve the special terminology wording when the slot is terminology-only.
  if (acceptableKinds.length === 1 && acceptableKinds[0] === "terminology") {
    return `Undeclared terminology "${refName}" in ${parentLabel} "${parent}" (no terminology block declares this name)`;
  }

  // "no concept declared", "no concept or parameter declared", etc.
  const list = acceptableKinds.length === 1
    ? acceptableKinds[0]
    : acceptableKinds.slice(0, -1).join(", ") + " or " + acceptableKinds[acceptableKinds.length - 1];
  return `Unresolved reference "${refName}" in ${parentLabel} "${parent}" (no ${list} declared with this name)`;
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
  acceptableKinds: AcceptableKinds,
  ctx: WalkContext,
  location: Location,
): ValidationError {
  const list = acceptableKinds.length === 1
    ? acceptableKinds[0]
    : acceptableKinds.slice(0, -1).join(", ") + " or " + acceptableKinds[acceptableKinds.length - 1];
  return {
    kind: "qualified-ref-unresolved",
    message: `Qualified reference "${targetLib}"."${targetName}" — library "${targetLib}" has no ${list} declaration named "${targetName}"`,
    location,
    severity: "error",
    targetLibrary: targetLib,
    targetName,
    ...(ctx.libraryName !== undefined ? { libraryName: ctx.libraryName } : {}),
    ...(ctx.filePath !== undefined ? { filePath: ctx.filePath } : {}),
  };
}
