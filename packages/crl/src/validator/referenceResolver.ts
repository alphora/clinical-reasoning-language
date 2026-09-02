import type {
  CRL,
  Statement,
  Concept,
  Criterion,
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
import { branchConditionRefs, branchConditionConceptRefsStrict } from "../ast/branchCondition";
import { narrativeReferenceRoles, spanKey } from "../template-match/referenceRoles";
import type { LibraryScope, SourceContext } from "../imports/scopes";
import { lookupKnownLibrary } from "../imports/scopes";

import { ValidationError } from "./validator";
import type { CriterionSlot } from "./validator";

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
/** Terminology-only slot — `coded from`, activity `with`, and a membership comparand. */
const TERMINOLOGY_REF_KINDS: AcceptableKinds = ["terminology"] as const;
/** Decision-only slot — `use decision`. */
const DECISION_REF_KINDS: AcceptableKinds = ["decision"] as const;
/** Activity-only slot — `recommend activity`. */
const ACTIVITY_REF_KINDS: AcceptableKinds = ["activity"] as const;

// #224 ii: the reference SLOT `checkRef` uses for the `criterion-misuse` diagnostic.
// `ConceptOnlySlot` = a slot where a criterion name is always a misuse (mirrors the
// error's `CriterionSlot` minus the output-only `qualified`). `when-guard` = a guard
// position where a bare/self-qualified local criterion is valid (and pre-classified),
// but a foreign library-qualified criterion is still a misuse. `null` = a non-concept
// slot (terminology/decision/activity) where no criterion check applies.
type ConceptOnlySlot = Exclude<CriterionSlot, "qualified">;
type ConceptSlotArg = ConceptOnlySlot | "when-guard" | null;

function isConceptOnlySlot(slot: ConceptSlotArg): slot is ConceptOnlySlot {
  return (
    slot === "defined-as" ||
    slot === "composition" ||
    slot === "narrative" ||
    slot === "reduction" ||
    slot === "action-guard"
  );
}

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
          parentName:
            statement.type === "Concept" ||
            statement.type === "Decision" ||
            statement.type === "Activity" ||
            statement.type === "Criterion"
              ? statement.name
              : "<unknown>",
          parentKind: parentKindOf(statement),
          localNames: names,
          criterionNames: names.criterion,
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
          parentName:
            stmt.type === "Concept" ||
            stmt.type === "Decision" ||
            stmt.type === "Activity" ||
            stmt.type === "Criterion"
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
          criterionNames: scope.localNames.criteria,
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
      case "Criterion":
        this.walkCriterion(stmt as Criterion, ctx, errors);
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
    // ⭐ `value from "VS"` is a TERMINOLOGY REFERENCE like any other, and it is walked HERE rather than in the
    // definition switch below because it is a concept FIELD, not a definition — a concept may carry one with
    // no definition at all (a pure coded question). Missing this walk would let a qualified answer set dangle:
    // it would validate, then fail to resolve at emit.
    if (concept.valueFrom) {
      this.checkRef(
        concept.valueFrom.terminologyName,
        TERMINOLOGY_REF_KINDS,
        concept.valueFrom.location,
        ctx,
        errors,
        null,
      );
    }
    const def = concept.definition;
    if (def) {
      switch (def.type) {
        case "CodedFromDefinition": {
          // Named coded-from resolves to a terminology; inline coding carries no ref.
          if (def.terminologyName) {
            this.checkRef(def.terminologyName, TERMINOLOGY_REF_KINDS, def.location, ctx, errors, null);
          }
          break;
        }
        case "DefinedAsDefinition": {
          const body = def.body;
          // Bare ref and `exists ("X")` both name a single concept whose reference must
          // resolve; only a composition has an expression to walk.
          if (body.type === "DefinedAsBareRef" || body.type === "DefinedAsExists") {
            this.checkRef(body.ref, CONCEPT_REF_KINDS, body.location, ctx, errors, "defined-as");
          } else if (body.type === "DefinedAsComposition") {
            this.walkComposition(
              (body as DefinedAsComposition).expression,
              ctx,
              errors,
            );
          } else if (body.type === "DefinedAsBooleanComposition") {
            // T1: resolve every operand ref of a boolean composition (else undefined-ref diagnostics
            // stay silent on its operands — this if/else has no exhaustiveness guard).
            for (const r of branchConditionConceptRefsStrict(body.expression, "defined-as boolean composition"))
              this.checkRef(r.ref, CONCEPT_REF_KINDS, r.location, ctx, errors, "defined-as");
          }
          break;
        }
        case "DefinitionIsDefinition":
          this.walkNarrative(def.body, ctx, errors);
          break;
        case "ReductionDefinition": {
          // #189: a NAMED reduction operand (`exists "X"`, `count "X" at least N`) is a concept
          // reference that must resolve — the same check the narrative forms got before they folded
          // to a structural node. `this` (ThisRecords) names the concept's own records, no ref.
          const target = def.reduction.target;
          if (target.type === "ReductionConceptRef") {
            this.checkRef(target.ref, CONCEPT_REF_KINDS, target.location, ctx, errors, "reduction");
          }
          break;
        }
      }
    }
    // possible representations (ADR 0001 §3): validate named coded-from refs;
    // inline codings carry no terminology reference. A rep's `value projection is` PROJECTOR is
    // a NEW reference-carrying surface — walk its narrative concept refs too, so a projection
    // that (mis)carries a concept ref surfaces unresolved refs LOUDLY instead of vanishing
    // from resolution (a well-formed datum-local projection carries none). Todo 2's
    // representation-shape validator rejects a projection holding a concept ref outright.
    for (const rep of concept.representations ?? []) {
      if (rep.terminologyName) {
        this.checkRef(rep.terminologyName, TERMINOLOGY_REF_KINDS, rep.location, ctx, errors, null);
      }
      if (rep.valueProjection) {
        this.walkNarrative(rep.valueProjection.body, ctx, errors);
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
        this.checkRef(expr.ref, CONCEPT_REF_KINDS, expr.location, ctx, errors, "composition");
        return;
    }
  }

  private walkNarrative(clause: NarrativeClause, ctx: WalkContext, errors: ValidationError[]): void {
    // ⭐⭐ A NARRATIVE REF'S NAMESPACE DEPENDS ON THE PATTERN IT LANDS IN.
    //
    // Every quoted name parses as an `NConceptRef` — the narrative parser cannot tell a concept from a
    // terminology, because a quoted name is a quoted name. Most patterns take only concepts, so checking every
    // ref against the CONCEPT namespace was right until `"X" in "VS"` arrived: its comparand is a value set,
    // and resolving it as a concept reports "no concept declared with this name" for a perfectly good
    // terminology.
    //
    // So MATCH FIRST, then route by the arg the matcher produced. ⚠ Routed by LOCATION, not by name: a
    // concept and a terminology may legally share a name, and a name-keyed lookup would send one ref to the
    // wrong namespace with no diagnostic. An unmatched narrative keeps the old behaviour exactly.
    // ⚠ ONE authority, and it RECURSES — see `narrativeReferenceRoles`. A shallow top-level scan shipped
    // here and missed the folded pipeline form (`"X" in "VS", then most recent this`), which is the
    // charter's own spelling: the matcher wraps the earlier call in a `NestedPatternArg`.
    const roles = narrativeReferenceRoles(clause);
    for (const el of clause.elements) {
      if (el.type === "NConceptRef" && roles.get(spanKey(el.location)) === "terminology") {
        this.checkRef(el.value, TERMINOLOGY_REF_KINDS, el.location, ctx, errors, null);
        continue;
      }
      this.walkNarrativeElement(el, ctx, errors);
    }
  }

  private walkNarrativeElement(el: NarrativeElement, ctx: WalkContext, errors: ValidationError[]): void {
    switch (el.type) {
      case "NConceptRef":
        this.checkRef(el.value, NARRATIVE_REF_KINDS, el.location, ctx, errors, "narrative");
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
        this.checkRef(av.value, NARRATIVE_REF_KINDS, av.location, ctx, errors, "narrative");
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
    // `when <expr>` carries a boolean guard over concept refs; `otherwise` has
    // no condition. Resolve EVERY operand, anchoring each error to the operand's
    // own location (not the whole `when` line).
    if (branch.type === "WhenBlock") {
      // `branchConditionRefs` recurses into `not` operands, so a negated concept
      // (`when not X`) is ref-checked here like any other atom (#224 iii.3 — negation
      // is now a first-class guard: parses, validates, and emits to FHIR).
      for (const atom of branchConditionRefs(branch.condition)) {
        this.checkRef(atom.ref, CONCEPT_REF_KINDS, atom.location, ctx, errors, "when-guard");
      }
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
      this.checkRef(action.activityName, ACTIVITY_REF_KINDS, action.location, ctx, errors, null);
    } else if (action.type === "UseDecision") {
      this.checkRef(action.decisionName, DECISION_REF_KINDS, action.location, ctx, errors, null);
    }
    // A per-action guard references a concept (same ref kinds as a `when`
    // condition); resolve it so an unknown guard concept is a reference error.
    // #224 ii: action guards are CONCEPT-ONLY in v0 — a criterion name here is a
    // targeted `criterion-misuse` (criteria are `when`-guard-only), not "unresolved".
    if (stmt.guard) {
      this.checkRef(stmt.guard.conceptName, CONCEPT_REF_KINDS, stmt.guard.location, ctx, errors, "action-guard");
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
        null,
      );
    }
  }

  // ------------------------ criterion body walk -------------------------

  // #224 ii: a `criterion` body is a `BranchCondition` (the same guard grammar as a
  // `when`). Resolve its CONCEPT-ref atoms so an undefined concept inside a criterion
  // declaration is diagnosed ONCE at the declaration (not per use site). Nested
  // criterion refs are NOT resolved here — `branchConditionRefs` skips them (they are
  // valid by classification-construction; their cycles are caught by CycleDetector).
  // The slot is `when-guard`: bare local criteria are valid here (and already
  // classified away), but a foreign library-qualified criterion ref is still a misuse.
  private walkCriterion(criterion: Criterion, ctx: WalkContext, errors: ValidationError[]): void {
    // `branchConditionRefs` recurses into `not` operands, so a negated concept in a
    // criterion body is ref-checked like any other atom (#224 iii.3 — a criterion body
    // inline-expands into its host guard and flows through the same NNF/DNF/emit path).
    for (const atom of branchConditionRefs(criterion.condition)) {
      this.checkRef(atom.ref, CONCEPT_REF_KINDS, atom.location, ctx, errors, "when-guard");
    }
  }

  // ---------------------------- ref check -------------------------------

  private checkRef(
    ref: ReferenceName,
    acceptableKinds: AcceptableKinds,
    location: Location,
    ctx: WalkContext,
    errors: ValidationError[],
    // #224 ii: the reference SLOT, for the `criterion-misuse` diagnostic. A
    // concept-ONLY slot (`defined-as`/`composition`/`narrative`/`action-guard`) turns
    // a criterion name into a targeted error instead of "unresolved concept".
    // `when-guard` = a guard position where a bare/self-qualified local criterion is
    // valid (already classified away), but a foreign qualified criterion is still a
    // misuse. `null` = a non-concept slot (terminology/decision/activity) — no
    // criterion check applies.
    slot: ConceptSlotArg,
  ): void {
    const refName = getRefName(ref);

    if (!isQualifiedRef(ref)) {
      // Bare ref: try each acceptable bucket in precedence order; succeed on first hit.
      for (const kind of acceptableKinds) {
        if (ctx.localNames[kind].has(refName)) return;
      }
      // A concept-only slot naming a LOCAL criterion → targeted misuse, not "unresolved".
      if (isConceptOnlySlot(slot) && ctx.criterionNames.has(refName)) {
        errors.push(criterionMisuse(refName, slot, ctx, location));
        return;
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
      // Self-qualified (`"Self"."X"`) is bare-equivalent — a local criterion here is
      // the same misuse as the bare spelling.
      if (isConceptOnlySlot(slot) && ctx.criterionNames.has(refName)) {
        errors.push(criterionMisuse(refName, slot, ctx, location));
        return;
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
      // The foreign library resolved but has no matching concept. If the name is a
      // CRITERION there, say so — criterion refs cannot be library-qualified in v0 —
      // instead of the misleading "library has no concept named X". Applies in any
      // concept-accepting slot (including a `when` guard).
      if (slot !== null && target.names.criteria.has(refName)) {
        errors.push(criterionMisuseQualified(targetLib, refName, ctx, location));
        return;
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
  // #224 ii: criteria are NOT a resolvable ref-kind (a criterion is not a valid
  // concept/etc. target), so this bucket is never consulted by the bare-ref
  // resolution loop — only by the `criterion-misuse` diagnostic, which turns a
  // criterion name in a concept-only slot into a targeted error.
  criterion: Set<string>;
}

function emptyBuckets(): NameBuckets {
  return {
    concept: new Set(),
    terminology: new Set(),
    decision: new Set(),
    activity: new Set(),
    parameter: new Set(),
    criterion: new Set(),
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
      case "Criterion":
        buckets.criterion.add(s.name);
        break;
    }
  }
  return buckets;
}

// The display label for the CONTAINER a ref sits in (for the unresolved-reference
// message). Mostly a `RefKind`, plus `"criterion"` — which is NOT a resolvable
// `RefKind` but still names its container ("in criterion \"X\"").
type ParentKindLabel = RefKind | "criterion" | "<other>";

function parentKindOf(stmt: Statement): ParentKindLabel {
  if (stmt.type === "Concept") return "concept";
  if (stmt.type === "Decision") return "decision";
  if (stmt.type === "Activity") return "activity";
  if (stmt.type === "Terminology") return "terminology";
  if (stmt.type === "Parameter") return "parameter";
  if (stmt.type === "Criterion") return "criterion";
  return "<other>";
}

interface WalkContext {
  parentName: string;
  parentKind: ParentKindLabel;
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
  // #224 ii: this library's `criterion` names — for the `criterion-misuse`
  // diagnostic (a criterion in a concept-only slot / self-qualified). Never used
  // for resolution (a criterion is not a valid ref target).
  criterionNames: Set<string>;
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

// #224 ii: human phrase for each concept-only slot in the `criterion-misuse` message.
const SLOT_PHRASE: Record<ConceptOnlySlot, string> = {
  "defined-as": "a `defined as` concept definition",
  composition: "a `defined as` concept composition",
  narrative: "a `definition is` narrative",
  reduction: "a `definition is` reduction operand (`exists` / `count` of a concept)",
  "action-guard": "an action guard (`unless` / `only when`)",
};

function criterionMisuse(
  name: string,
  slot: ConceptOnlySlot,
  ctx: WalkContext,
  location: Location,
): ValidationError {
  return {
    kind: "criterion-misuse",
    slot,
    message: `Criterion "${name}" cannot be used in ${SLOT_PHRASE[slot]} — criteria may only appear in a decision \`when\` guard or another criterion's body (v0)`,
    location,
    severity: "error",
    ...(ctx.libraryName !== undefined ? { libraryName: ctx.libraryName } : {}),
    ...(ctx.filePath !== undefined ? { filePath: ctx.filePath } : {}),
  };
}

function criterionMisuseQualified(
  targetLib: string,
  name: string,
  ctx: WalkContext,
  location: Location,
): ValidationError {
  return {
    kind: "criterion-misuse",
    slot: "qualified",
    message: `Criterion references cannot be library-qualified: "${targetLib}"."${name}" names a criterion in library "${targetLib}" (criteria are usable only in same-library \`when\` guards or criterion bodies in v0)`,
    location,
    severity: "error",
    ...(ctx.libraryName !== undefined ? { libraryName: ctx.libraryName } : {}),
    ...(ctx.filePath !== undefined ? { filePath: ctx.filePath } : {}),
  };
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
