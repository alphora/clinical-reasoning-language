import {
  getRefName,
  getRefLibrary,
  type CRL,
  type Concept,
  type Decision,
  type Statement,
  type BranchBlock,
  type BranchCondition,
  type WhenBlockBody,
  type BlockBody,
  type ActionStatement,
  type CompositionExpression,
  type ReferenceName,
  type Location,
} from "../ast/types";
import { branchConditionRefs } from "../ast/branchCondition";
import { conceptValueTypes, type ConceptValueType } from "../grammar/conceptValueTypes";
import { lookupKnownLibrary, type LibraryScope, type SourceContext } from "../imports/scopes";
import { matchNarrative } from "../template-match";
import type { CanonicalArg, CanonicalPatternCall, ConceptRefArg } from "../template-match/canonicalTypes";
import {
  OPERAND_CONSTRAINTS,
  operandExpectation,
  type OperandConstraint,
} from "../template-match/operandConstraints";

import type {
  UseSiteOperandUntypedWarning,
  UseSiteTypeMismatchError,
  UseSiteTypeRule,
  ValidationError,
} from "./validator";

// concept-model redesign Todo 2, rule B — the use-site & result-shape TYPE layer.
//
// THE HEADLINE (do not violate): patterns are SEMANTIC — they carry NO return types
// (`feedback_patterns-are-semantic`, catalog v0.6/0.7, disc 016). Rule B is NOT "infer the
// pattern's return type and compare it to the declared value type" (the retired anti-pattern).
// It is two compatible checks:
//
//   1. OPERAND (input) constraints — a pattern meaningful only over a particular operand shape
//      checks its OPERAND's declared value type (`template-match/operandConstraints`). Time-
//      selection (`most recent X`) ⟹ X NOT a DERIVED boolean; value-comparison (`X at least Q`)
//      ⟹ X a Quantity. Neither reads a return type.
//   2. LANGUAGE-LEVEL shape rules — fixed by the model, not by a pattern's result:
//        - `defined as exists (…)` / top-level `sem-not` ⟹ boolean result (definitional).
//        - a `source representation` with NO `value projection is` ⟹ must carry its concept's
//          value type (the projection is the bridge when they differ).
//        - a decision `when` guard / criterion body / action guard consumes a boolean.
//
// Rule B DELIBERATELY does NOT infer a `definition is <pattern>` concept's result type from the
// pattern and check it against the declared `value type` — that resurrects the return-type-
// authoritative model. A `definition is` concept's value type stays AUTHOR-DECLARED.
//
// FIRES ONLY WHERE VALUE TYPES ARE DECLARED. Every check no-ops on an operand/concept whose value
// type is absent (231/547 concepts are untyped today; rule B lights up as Todo 4 migrates). At a
// type-demanding OPERAND position the absence surfaces as ONE `use-site-operand-untyped` WARNING;
// everywhere else absence is silent. Secondary-diagnostic suppression (disc 397 gpt56 #7): no type
// diagnostic when the target has 0 value types (warning only, at operand sites), >1 (rely on A.9),
// or resolves to nothing (rely on the reference diagnostic).

/** Source attribution for a diagnostic (multi-file mode). */
interface Attribution {
  libraryName?: string;
  filePath?: string;
}

/** One concept's declared value types + whether its value is computed by inference (derived). */
interface ConceptTypeInfo {
  // rule A.9 guarantees <=1 here, but 0 or >1 can occur — rule B suppresses on both (A.9 owns >1).
  valueTypes: ConceptValueType[];
  // TRUE iff the concept's value is computed by inference — a `defined as` (sem-* / exists) or a
  // `definition is` narrative. A `code is` / `source representation` / `coded from` assertion is NOT
  // derived. A DERIVED boolean has no event date, so it is not time-selectable (design refinement 1).
  // A concept that is BOTH coded AND derived counts as derived (operator ruling, disc 400): its
  // `most recent` would be ambiguous, so it is rejected — the author models the dated event instead.
  derived: boolean;
}

/** One library's declared concepts + parameters (name -> declared type token). */
interface LibraryTypes {
  concepts: Map<string, ConceptTypeInfo>;
  // A parameter's declared type is a definite `ConceptType | ConceptValueType` token — kept so an
  // operand over a parameter can be type-checked (a parameter is never "untyped").
  parameters: Map<string, string>;
}
// Keyed by `${origin}|${libraryName}` (multi-file) / `single|${name}` (single-file) — mirrors the
// scope layer's KNOWN_KEY (`imports/scopes.ts`), so a local `Foo` and a package `Foo` stay DISTINCT
// (else a same-name collision would cross-contaminate types and fire a false hard error).
type TypeIndex = Map<string, LibraryTypes>;

const idxKey = (origin: string, name: string): string => `${origin}|${name}`;

const VALUE_TYPES: ReadonlySet<string> = new Set(conceptValueTypes);

/** The scope/index context for resolving an operand ref within one owning library. */
interface ResolveCtx {
  ownLibrary: string;
  ownKey: string; // the TypeIndex key of the owning library (origin-qualified)
  scope: LibraryScope | undefined; // present in multi-file mode
  index: TypeIndex;
}

/** The outcome of resolving an operand ref to a declared value type. */
type OperandResolution =
  // `derived` = has NO event instance stream (a `defined as`/`definition is` inference, OR a runtime
  // PARAMETER scalar — see `origin`). `origin` distinguishes the two so a diagnostic can word itself
  // correctly (a parameter has no "underlying resource concept" to point at).
  | { status: "typed"; valueType: ConceptValueType; derived: boolean; origin: "concept" | "parameter" }
  | { status: "untyped" } // resolved to a concept declaring 0 value types
  | { status: "multiple" } // resolved to a concept declaring >1 (rule A.9 owns this)
  | { status: "unresolved" }; // not found / not visible / wrong kind (reference diagnostic owns this)

export class UseSiteTypeValidator {
  public validate(ast: CRL, sources?: SourceContext[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const index = buildTypeIndex(ast, sources);
    // Dedup identical `use-site-operand-untyped` warnings (same file / concept / operand / site).
    const warnedUntyped = new Set<string>();

    if (sources) {
      for (const { stmt, scope } of sources) {
        this.checkStatement(
          stmt,
          { ownLibrary: scope.currentLibrary, ownKey: idxKey(scope.origin, scope.currentLibrary), scope, index },
          { libraryName: scope.currentLibrary, filePath: scope.filePath },
          warnedUntyped,
          errors,
        );
      }
    } else {
      const ownLibrary = ast.library?.name ?? "";
      const ctx: ResolveCtx = { ownLibrary, ownKey: idxKey("single", ownLibrary), scope: undefined, index };
      for (const stmt of ast.statements) {
        this.checkStatement(stmt, ctx, {}, warnedUntyped, errors);
      }
    }
    return errors;
  }

  private checkStatement(
    stmt: Statement,
    ctx: ResolveCtx,
    attribution: Attribution,
    warnedUntyped: Set<string>,
    errors: ValidationError[],
  ): void {
    if (stmt.type === "Concept") {
      this.checkConcept(stmt, ctx, attribution, warnedUntyped, errors);
    } else if (stmt.type === "Decision") {
      this.checkDecision(stmt, ctx, attribution, errors);
    } else if (stmt.type === "Criterion") {
      // #224 ii — check a criterion body's guard literals ONCE at its declaration (NOT per
      // expansion site, else N uses -> N diagnostics; disc 397 gpt56 #8).
      this.checkGuardLiterals(stmt.condition, stmt.name, ctx, attribution, errors);
    }
  }

  // -------------------------------- concept ---------------------------------

  private checkConcept(
    concept: Concept,
    ctx: ResolveCtx,
    attribution: Attribution,
    warnedUntyped: Set<string>,
    errors: ValidationError[],
  ): void {
    const def = concept.definition;

    // 1. OPERAND constraints on a concept-level `definition is <narrative>`.
    if (def?.type === "DefinitionIsDefinition") {
      const call = matchNarrative(def.body);
      this.checkCall(call, concept.name, ctx, attribution, warnedUntyped, errors);
    }

    // 2. RESULT shape — `defined as exists` / top-level `sem-not` ⟹ boolean.
    if (def?.type === "DefinedAsDefinition") {
      const vts = concept.valueTypes ?? [];
      // Only a single declared value type is checkable (0 -> Todo 4 makes it required; >1 -> A.9).
      if (vts.length === 1 && vts[0] !== "boolean") {
        const body = def.body;
        if (body.type === "DefinedAsExists") {
          errors.push(
            resultMismatch("exists-result-nonboolean", concept.name, vts[0], body.location, attribution),
          );
        } else if (body.type === "DefinedAsComposition" && topLevelIsSemNot(body.expression)) {
          errors.push(
            resultMismatch("negation-result-nonboolean", concept.name, vts[0], body.location, attribution),
          );
        } else if (body.type === "DefinedAsComposition") {
          // 2b. COMPOSITION-OPERAND shape (category 2 — a language rule, NOT the pattern-operand
          // registry; `sem-*` live in `CompositionExpression`, not `matchNarrative`). A non-boolean
          // composition VALUE is a resource stream (the emitter's refinement shape); each leaf
          // operand must also be non-boolean — a boolean leaf can't be unioned / intersected into
          // the stream. This LIFTS the emitter's `bridgeOperand`
          // `/* FIXME: boolean operand in refinement composition */` to a pre-emit error, and is
          // STRONGER than the emitter for a cross-library leaf (which the emitter force-defaults to
          // "refinement" and never flags — the validator resolves its real type). ONE-directional:
          // reached only because the PARENT is non-boolean; a boolean parent + refinement leaf stays
          // legal (the exists-bridge existentializes it), so it is NOT checked here.
          this.checkCompositionLeaves(body.expression, concept.name, vts[0], ctx, attribution, errors);
        }
      }
    }

    // 2c. BARE-REF ALIAS value type (disc 404 Q4 + R2 Q3). `defined as "X"` is value-PRESERVING (the
    // concept's value IS X's), and the emitter's bare-ref path returns the raw ref with NO bridge in
    // either direction (unlike a composition leaf, where a refinement leaf under a boolean parent is
    // legally `exists`-bridged). A bare alias therefore CANNOT change the value type, so the concept's
    // must EQUAL the target's — full equality, not just boolean-ness (R2 Q3: a `Quantity` alias over a
    // `CodeableConcept` target would otherwise pass the `is Quantity` value-comparison check on a lie).
    if (def?.type === "DefinedAsDefinition" && def.body.type === "DefinedAsBareRef") {
      const vts = concept.valueTypes ?? [];
      if (vts.length === 1) {
        const ref = def.body.ref;
        const res = resolveOperand(getRefName(ref), getRefLibrary(ref) ?? undefined, ctx, false);
        if (res.status === "typed" && vts[0] !== res.valueType) {
          errors.push(
            bareRefAliasMismatch(concept.name, vts[0], res.valueType, getRefName(ref), def.body.location, attribution),
          );
        }
      }
    }

    // 3. No-projector posrep ⟹ concept value type.
    const conceptVts = concept.valueTypes ?? [];
    if (conceptVts.length === 1) {
      const conceptVt = conceptVts[0];
      for (const rep of concept.representations ?? []) {
        if (rep.valueProjection) continue; // the projection is the bridge — skip (Todo 3 types it)
        const repVts = rep.valueTypes ?? [];
        if (repVts.length !== 1) continue; // 0 -> A.1 incomplete; >1 -> A.9
        if (repVts[0] !== conceptVt) {
          errors.push(posrepMismatch(concept.name, conceptVt, repVts[0], rep.location, attribution));
        }
      }
    }
  }

  // Descend a NON-boolean concept's composition tree and flag every `boolean`-declared LEAF operand.
  // The parent's refinement shape threads unchanged to every leaf in the emitter (`sem-and`/`sem-or`
  // terms, a `sem-not` operand, a group), so a boolean leaf is rejected wherever it sits. This ENFORCES
  // THE SHAPE RULE ACROSS ALL LEAVES; it does not claim every leaf reaches the identical emitter path
  // — a positive-anchored `sem-and sem-not B` reaches `bridgeOperand`'s FIXME, whereas a no-base
  // negation (`sem-or sem-not B`, all-negative `sem-and`) reaches `emitNoBaseNegation`, which may
  // instead loud-refuse. Either way a boolean leaf is invalid, so the pre-emit check is sound (disc
  // 404 Q3). A parameter leaf is skipped (`allowParameter: false`): a composition composes concepts /
  // inferences, and a bare parameter is a reference-layer concern.
  private checkCompositionLeaves(
    expr: CompositionExpression,
    conceptName: string,
    conceptVt: ConceptValueType,
    ctx: ResolveCtx,
    attribution: Attribution,
    errors: ValidationError[],
  ): void {
    switch (expr.type) {
      case "CompositionRef": {
        const res = resolveOperand(getRefName(expr.ref), getRefLibrary(expr.ref) ?? undefined, ctx, false);
        if (res.status === "typed" && res.valueType === "boolean") {
          errors.push(
            compositionLeafMismatch(conceptName, conceptVt, getRefName(expr.ref), expr.location, attribution),
          );
        }
        return;
      }
      case "CompositionGroup":
      case "SemNotExpression":
        this.checkCompositionLeaves(expr.expression, conceptName, conceptVt, ctx, attribution, errors);
        return;
      case "SemAndExpression":
      case "SemOrExpression":
        for (const term of expr.terms) {
          this.checkCompositionLeaves(term, conceptName, conceptVt, ctx, attribution, errors);
        }
        return;
    }
  }

  // Recurse a canonical call: apply this pattern's operand constraints, then descend into every
  // nested call so its OWN operands are checked. A NestedPatternArg at a constrained position
  // no-ops the OUTER position — a nested call has no derivable type (patterns have no return types,
  // per the headline; typing it would be the return-type back door) — but its own operands ARE
  // checked here, so nothing is semantically dropped. The outer-position coverage gap is a KNOWN,
  // documented limitation (disc 397 [critical] #3): e.g. `most recent X active` (MostRecent(Active(X)))
  // does NOT check X against the time-selection constraint. A test pins that limitation.
  private checkCall(
    call: CanonicalPatternCall,
    conceptName: string,
    ctx: ResolveCtx,
    attribution: Attribution,
    warnedUntyped: Set<string>,
    errors: ValidationError[],
  ): void {
    if (!call.known) return; // soft-compile (unknown narrative) — no-op
    for (const constraint of OPERAND_CONSTRAINTS[call.pattern] ?? []) {
      const arg = call.args[constraint.position];
      if (arg) {
        this.applyShape(arg, constraint, call, conceptName, ctx, attribution, warnedUntyped, errors);
      }
    }
    for (const arg of call.args) {
      this.recurseNested(arg, conceptName, ctx, attribution, warnedUntyped, errors);
    }
  }

  // Descend into every nested pattern call anywhere in the arg tree (incl. inside disjunction /
  // conjunction groups), applying its OWN registry constraints.
  private recurseNested(
    arg: CanonicalArg,
    conceptName: string,
    ctx: ResolveCtx,
    attribution: Attribution,
    warnedUntyped: Set<string>,
    errors: ValidationError[],
  ): void {
    switch (arg.type) {
      case "NestedPatternArg":
        this.checkCall(arg.pattern, conceptName, ctx, attribution, warnedUntyped, errors);
        return;
      case "DisjunctionArg":
        for (const d of arg.disjuncts) {
          this.recurseNested(d, conceptName, ctx, attribution, warnedUntyped, errors);
        }
        return;
      case "ConjunctionArg":
        for (const c of arg.conjuncts) {
          this.recurseNested(c, conceptName, ctx, attribution, warnedUntyped, errors);
        }
        return;
      // ConceptRefArg / QuantityArg / EnumArg carry no nested call.
    }
  }

  // Apply one operand constraint to the arg at a constrained position. A concept ref is resolved
  // and checked; a nested call no-ops here (its own operands are checked via `recurseNested`). The
  // disjunction / conjunction legs are defensive: NO seeded pattern's constrained position (all
  // arg 0 — the selected/compared concept) can receive a group via the matcher, so they are
  // currently unreachable; they keep the check correct if a future pattern takes a group operand.
  private applyShape(
    arg: CanonicalArg,
    constraint: OperandConstraint,
    call: CanonicalPatternCall,
    conceptName: string,
    ctx: ResolveCtx,
    attribution: Attribution,
    warnedUntyped: Set<string>,
    errors: ValidationError[],
  ): void {
    switch (arg.type) {
      case "ConceptRefArg":
        this.checkConceptOperand(arg, constraint, call, conceptName, ctx, attribution, warnedUntyped, errors);
        return;
      case "DisjunctionArg":
        for (const d of arg.disjuncts) {
          this.applyShape(d, constraint, call, conceptName, ctx, attribution, warnedUntyped, errors);
        }
        return;
      case "ConjunctionArg":
        for (const c of arg.conjuncts) {
          this.applyShape(c, constraint, call, conceptName, ctx, attribution, warnedUntyped, errors);
        }
        return;
      // NestedPatternArg / QuantityArg / EnumArg: no-op here (see method + checkCall comments).
    }
  }

  private checkConceptOperand(
    arg: ConceptRefArg,
    constraint: OperandConstraint,
    call: CanonicalPatternCall,
    conceptName: string,
    ctx: ResolveCtx,
    attribution: Attribution,
    warnedUntyped: Set<string>,
    errors: ValidationError[],
  ): void {
    // A narrative operand slot legally resolves to a concept OR a parameter (NARRATIVE_REF_KINDS),
    // so parameters are allowed here (and are type-checkable — a parameter is never untyped).
    const res = resolveOperand(arg.value, arg.library, ctx, /*allowParameter*/ true);
    switch (res.status) {
      case "multiple":
      case "unresolved":
        return; // suppress — a multiple/unresolved operand is another diagnostic's job
      case "untyped": {
        // A `refinement`-family (refinement/anchor) position stays SILENT on an untyped operand —
        // these positions are ubiquitous (every `… performed` / `… during …` subject), and A.10
        // (`missing-value-type`) already ERRORS on the untyped operand, so a warning here would both
        // flood and double-report (disc 403 §8d). The rarer `time-selection` / `value-comparison`
        // positions keep the warning (a type-demanding site a migration hasn't reached yet).
        if (constraint.family === "refinement") return;
        const key = `${attribution.filePath ?? ""}${conceptName}${arg.value}${arg.location.start.line}:${arg.location.start.column}`;
        if (warnedUntyped.has(key)) return;
        warnedUntyped.add(key);
        errors.push(
          untypedWarning(conceptName, call.pattern, constraint, arg.value, arg.location, attribution),
        );
        return;
      }
      case "typed": {
        const ok = operandSatisfies(constraint, res.valueType, res.derived);
        if (!ok) {
          errors.push(
            operandMismatch(conceptName, call, constraint, arg.value, res.valueType, res.origin, arg.location, attribution),
          );
        }
        return;
      }
    }
  }

  // -------------------------------- decision --------------------------------

  private checkDecision(
    decision: Decision,
    ctx: ResolveCtx,
    attribution: Attribution,
    errors: ValidationError[],
  ): void {
    for (const branch of decision.body.statements) {
      this.checkBranch(branch, decision.name, ctx, attribution, errors);
    }
  }

  private checkBranch(
    branch: BranchBlock,
    decisionName: string,
    ctx: ResolveCtx,
    attribution: Attribution,
    errors: ValidationError[],
  ): void {
    if (branch.type === "WhenBlock") {
      this.checkGuardLiterals(branch.condition, decisionName, ctx, attribution, errors);
    }
    this.checkWhenBlockBody(branch.body, decisionName, ctx, attribution, errors);
  }

  private checkWhenBlockBody(
    body: WhenBlockBody,
    decisionName: string,
    ctx: ResolveCtx,
    attribution: Attribution,
    errors: ValidationError[],
  ): void {
    if (body.type === "BlockBody") {
      this.checkBlockBody(body, decisionName, ctx, attribution, errors);
    } else {
      this.checkActionStatement(body, decisionName, ctx, attribution, errors);
    }
  }

  private checkBlockBody(
    block: BlockBody,
    decisionName: string,
    ctx: ResolveCtx,
    attribution: Attribution,
    errors: ValidationError[],
  ): void {
    for (const stmt of block.statements) {
      if (stmt.type === "WhenBlock" || stmt.type === "OtherwiseBlock") {
        this.checkBranch(stmt, decisionName, ctx, attribution, errors);
      } else {
        this.checkActionStatement(stmt, decisionName, ctx, attribution, errors);
      }
    }
  }

  private checkActionStatement(
    stmt: ActionStatement,
    decisionName: string,
    ctx: ResolveCtx,
    attribution: Attribution,
    errors: ValidationError[],
  ): void {
    // A per-action guard (`unless` / `only when`) consumes a boolean, like a `when` guard.
    if (stmt.guard) {
      this.checkGuardLiteral(stmt.guard.conceptName, stmt.guard.location, decisionName, ctx, attribution, errors);
    }
  }

  // A guard condition's concept-ref literals must each resolve to a boolean-valued concept.
  // `branchConditionRefs` recurses into `not` operands and EXCLUDES `criterion` refs (checked
  // once at the criterion's own declaration).
  private checkGuardLiterals(
    condition: BranchCondition,
    ownerName: string,
    ctx: ResolveCtx,
    attribution: Attribution,
    errors: ValidationError[],
  ): void {
    for (const atom of branchConditionRefs(condition)) {
      this.checkGuardLiteral(atom.ref, atom.location, ownerName, ctx, attribution, errors);
    }
  }

  private checkGuardLiteral(
    ref: ReferenceName,
    location: Location,
    ownerName: string,
    ctx: ResolveCtx,
    attribution: Attribution,
    errors: ValidationError[],
  ): void {
    // A guard slot is CONCEPT-ONLY (`CONCEPT_REF_KINDS`) — a parameter here is a reference error the
    // resolver owns, so parameters are NOT resolved (`allowParameter: false`). Only a positively-
    // resolved, single-typed, non-boolean CONCEPT is a mismatch. Untyped guard concepts (the norm
    // today — presence determinations without an explicit `value type`) are silent, NOT warned:
    // guards are far too numerous to flag every untyped operand, and Todo 4 makes types required.
    const res = resolveOperand(getRefName(ref), getRefLibrary(ref) ?? undefined, ctx, /*allowParameter*/ false);
    if (res.status === "typed" && res.valueType !== "boolean") {
      errors.push(guardMismatch(ownerName, res.valueType, location, attribution));
    }
  }
}

// ------------------------------- resolution --------------------------------

/** Build the origin-keyed concept value-type + parameter-type index from the AST / sources. */
function buildTypeIndex(ast: CRL, sources?: SourceContext[]): TypeIndex {
  const index: TypeIndex = new Map();
  const lib = (key: string): LibraryTypes => {
    let rec = index.get(key);
    if (!rec) {
      rec = { concepts: new Map(), parameters: new Map() };
      index.set(key, rec);
    }
    return rec;
  };
  const add = (stmt: Statement, key: string): void => {
    if (stmt.type === "Concept" && stmt.name) {
      const derived =
        stmt.definition?.type === "DefinedAsDefinition" ||
        stmt.definition?.type === "DefinitionIsDefinition";
      lib(key).concepts.set(stmt.name, { valueTypes: stmt.valueTypes ?? [], derived });
    } else if (stmt.type === "Parameter" && stmt.name) {
      lib(key).parameters.set(stmt.name, stmt.parameterType);
    }
  };
  if (sources) {
    for (const { stmt, scope } of sources) add(stmt, idxKey(scope.origin, scope.currentLibrary));
  } else {
    const ownLibrary = ast.library?.name ?? "";
    for (const stmt of ast.statements) add(stmt, idxKey("single", ownLibrary));
  }
  return index;
}

/**
 * Resolve an operand reference to its declared value type, mirroring the ReferenceResolver's scope
 * semantics: bare / self-qualified resolve in the owning library; a foreign-qualified ref resolves
 * only when the scope legitimately makes the target visible (`lookupKnownLibrary` + explicit-include
 * gate). A ref that cannot be resolved conservatively — for any reason — returns `unresolved`
 * (silent), so rule B never invents a type it isn't sure of.
 *
 * KNOWN BOUND (disc 397 gpt56 #4): a package that `knownLibraries` can resolve but whose statements
 * are not in `sources` (not a scope owner) has no entry in the index — its concepts' value types are
 * not available, so a foreign ref to one returns `unresolved` and is NOT checked. This is a
 * deliberate blind spot, not a bug: `KnownLibraryEntry` carries only names, never value types.
 */
function resolveOperand(
  name: string,
  library: string | undefined,
  ctx: ResolveCtx,
  allowParameter: boolean,
): OperandResolution {
  const isSelf = library === undefined || library === ctx.ownLibrary;
  if (isSelf) {
    return classify(ctx.index.get(ctx.ownKey), name, allowParameter);
  }
  // Foreign-qualified ref. Resolve visibility exactly as ReferenceResolver does; if the target
  // library isn't legitimately visible (or its types aren't indexed), stay silent.
  if (!ctx.scope) return { status: "unresolved" }; // single-file: a foreign ref is a reference error
  const target = lookupKnownLibrary(ctx.scope, library);
  if (!target) return { status: "unresolved" };
  if (target.origin === "package" && !ctx.scope.explicitIncludes.has(library)) {
    return { status: "unresolved" };
  }
  if (!target.names.concepts.has(name)) return { status: "unresolved" };
  // A foreign ref is resolved as a CONCEPT only. A foreign-qualified *parameter* ref does resolve
  // in the ReferenceResolver (narrative slots accept parameter), so rule B conservatively SKIPS it
  // here rather than claiming it can't exist — any cross-library-parameter gap is the resolver's,
  // not rule B's (a foreign boolean parameter at a constrained site is left unchecked, safe-silent).
  return classify(ctx.index.get(idxKey(target.origin, target.libraryName)), name, /*allowParameter*/ false);
}

function classify(
  libTypes: LibraryTypes | undefined,
  name: string,
  allowParameter: boolean,
): OperandResolution {
  if (!libTypes) return { status: "unresolved" };
  // Concept FIRST — mirrors NARRATIVE_REF_KINDS = [concept, parameter] precedence (a name declared
  // as both resolves to the concept; ReferenceResolver does the same).
  const c = libTypes.concepts.get(name);
  if (c) {
    if (c.valueTypes.length === 0) return { status: "untyped" };
    if (c.valueTypes.length > 1) return { status: "multiple" };
    return { status: "typed", valueType: c.valueTypes[0], derived: c.derived, origin: "concept" };
  }
  if (allowParameter) {
    const pt = libTypes.parameters.get(name);
    if (pt !== undefined) {
      // A parameter typed as a VALUE type is checkable (a definite single type). A parameter is a
      // runtime SCALAR with NO event instances of its own, so for instance-stream constraints
      // (`not-derived boolean` — time-selection / refinement) it behaves like a derived, instance-less
      // value: mark `derived: true` so a boolean PARAMETER is rejected at a refinement / selection
      // position (`"Flag" performed`, `most recent "Flag"` — no stream to filter or select over; disc
      // 404 R2 Q5). This does NOT affect `is Quantity` (value-comparison ignores `derived`, so a
      // Quantity threshold parameter still validates). A parameter typed as a RESOURCE (`ConceptType`,
      // e.g. `Observation`) is not a value — can't value-check it, stay silent.
      if (VALUE_TYPES.has(pt))
        return { status: "typed", valueType: pt as ConceptValueType, derived: true, origin: "parameter" };
      return { status: "unresolved" };
    }
  }
  return { status: "unresolved" };
}

/** Whether a typed operand satisfies a constraint. `not-derived <T>` forbids a DERIVED T. */
function operandSatisfies(
  constraint: OperandConstraint,
  valueType: ConceptValueType,
  derived: boolean,
): boolean {
  if (constraint.shape.rel === "is") return valueType === constraint.shape.valueType;
  // `not-derived <T>`: a coded / sourced (asserted) concept of type T is validly selectable — its
  // instances carry event dates. A DERIVED T (`defined as` / `definition is` — a computed value with
  // no event date) is forbidden (design refinement 1). A concept that is BOTH coded AND derived is
  // treated as derived and REJECTED (operator ruling, disc 400): its `most recent` is ambiguous, so
  // the author models the underlying dated event and time-selects THAT instead.
  return !(valueType === constraint.shape.valueType && derived);
}

/** Unwrap composition groups, then test whether the top-level operator is `sem-not`. */
function topLevelIsSemNot(expr: CompositionExpression): boolean {
  let e = expr;
  while (e.type === "CompositionGroup") e = e.expression;
  return e.type === "SemNotExpression";
}

// ------------------------------- diagnostics -------------------------------

function base(attribution: Attribution): Pick<UseSiteTypeMismatchError, "libraryName" | "filePath"> {
  return {
    ...(attribution.libraryName ? { libraryName: attribution.libraryName } : {}),
    ...(attribution.filePath ? { filePath: attribution.filePath } : {}),
  };
}

function operandMismatch(
  conceptName: string,
  call: CanonicalPatternCall,
  constraint: OperandConstraint,
  operandName: string,
  actual: ConceptValueType,
  origin: "concept" | "parameter",
  location: Location,
  attribution: Attribution,
): UseSiteTypeMismatchError {
  const expected = operandExpectation(constraint);
  return {
    kind: "use-site-type-mismatch",
    // The `refinement` family is the refinement/anchor shape check — a distinct rule so a consumer
    // can find every hit without parsing message text (disc 403 [crit] #2 / §9). `time-selection` /
    // `value-comparison` stay `operand-shape`.
    rule: constraint.family === "refinement" ? "boolean-at-refinement-position" : "operand-shape",
    conceptName,
    pattern: call.pattern,
    argPosition: constraint.position,
    expected,
    actual,
    message:
      `Concept "${conceptName}": ${constraint.role} of \`${call.pattern}\` must be ${expected}, ` +
      `but its operand "${operandName}" declares type \`${actual}\`. ` + // "type" — operand may be a parameter (`param type is`)
      operandMismatchTail(constraint, operandName, origin),
    location: loc(location),
    severity: "error",
    ...base(attribution),
  };
}

/** The teaching tail of an operand-shape mismatch, specific to the constraint's diagnostic family. */
function operandMismatchTail(
  constraint: OperandConstraint,
  operandName: string,
  origin: "concept" | "parameter",
): string {
  const vt = constraint.shape.valueType;
  // A PARAMETER is a runtime scalar with no event instances (and no derivation / underlying resource
  // concept to point at), so the concept-oriented guidance below is false for it — word it for the
  // scalar instead (disc 404 R2 Q5 / R3 P1). Value-comparison is unaffected (a Quantity parameter is a
  // valid compared value; a mismatch there is a genuine wrong-type, handled by the shared branch).
  if (origin === "parameter" && constraint.family !== "value-comparison") {
    return (
      `A runtime parameter is a scalar with no event instances of its own, so it can't be ` +
      `${constraint.family === "time-selection" ? "selected over" : "filtered or anchored over"} — ` +
      `pass a concept with an instance stream here (a \`code is\` / \`source representation\` concept), ` +
      `not the parameter "${operandName}".`
    );
  }
  switch (constraint.family) {
    case "time-selection":
      return (
        `A time-selection pattern selects an instance by its event date, so a DERIVED ` +
        `\`${vt}\` (computed by \`defined as\` / \`definition is\`, with no ` +
        `event date of its own) can't be selected over — time-select the underlying dated event ` +
        `instead (the \`code is\` / \`source representation\` concept its value is built from).`
      );
    case "value-comparison":
      return `A value-comparison pattern compares a magnitude, so its operand must be \`${vt}\`-valued.`;
    case "refinement":
      // The redesign's shape split: a concept consumed at BOTH a refinement/anchor position AND a
      // boolean guard has NO single valid declaration (disc 403 [imp] #5). Point at the split
      // (`defined as exists`) rather than telling the author to flip the value type — flipping it to
      // non-boolean would only move the error to the guard site (the ping-pong the design forbids).
      // NOTE: `defined as exists` does not yet LOWER to CQL (tracked in #265 — lowering is coming;
      // see `definedAsExistsNotLowered`). The guidance is the correct MODEL fix; the emit path follows.
      return (
        `A refinement / anchor position filters or anchors over event INSTANCES, but a DERIVED ` +
        `\`${vt}\` (computed by \`defined as\` / \`definition is\`) has no instances of its own — ` +
        `refine the underlying resource concept its value is built from instead. If "${operandName}" ` +
        `is specifically needed as a \`boolean\` elsewhere (e.g. a decision guard), keep the resource ` +
        `concept here and derive a separate \`defined as exists ( … )\` boolean for the guard.`
      );
  }
}

function resultMismatch(
  rule: Extract<UseSiteTypeRule, "exists-result-nonboolean" | "negation-result-nonboolean">,
  conceptName: string,
  actual: ConceptValueType,
  location: Location,
  attribution: Attribution,
): UseSiteTypeMismatchError {
  const form = rule === "exists-result-nonboolean" ? "`defined as exists (…)`" : "a top-level `sem-not`";
  const why =
    rule === "exists-result-nonboolean"
      ? "existence is present-or-absent"
      : "closed-world negation is true-or-false";
  return {
    kind: "use-site-type-mismatch",
    rule,
    conceptName,
    expected: "boolean",
    actual,
    message:
      `Concept "${conceptName}": ${form} always produces a \`boolean\` (${why}), but the concept ` +
      `declares \`value type is ${actual}\`. Change the value type to \`boolean\`, or use a ` +
      `value-preserving derivation (\`sem-or\` / \`sem-and\` / a bare \`defined as\`) if you meant to ` +
      `keep the \`${actual}\` value.`,
    location: loc(location),
    severity: "error",
    ...base(attribution),
  };
}

function compositionLeafMismatch(
  conceptName: string,
  conceptVt: ConceptValueType,
  leafName: string,
  location: Location,
  attribution: Attribution,
): UseSiteTypeMismatchError {
  return {
    kind: "use-site-type-mismatch",
    rule: "boolean-in-refinement-composition",
    conceptName,
    // The check proves only `leaf === boolean` vs a non-boolean parent — NOT that the leaf is
    // type-compatible with `conceptVt` (a `dateTime` leaf under a `CodeableConcept` parent passes
    // here; broader value-type compatibility is out of scope). So `expected` states the shape demand,
    // not `conceptVt` (disc 404 Q7).
    expected: "not boolean",
    actual: "boolean",
    message:
      `Concept "${conceptName}": this \`defined as\` composition produces a \`${conceptVt}\` (a ` +
      `resource stream that is unioned / intersected / excepted), but its operand "${leafName}" ` +
      `declares \`value type is boolean\`. A boolean truth isn't a stream — it can't be combined into ` +
      `a non-boolean composition. Give "${leafName}" the resource value type it refines (so it ` +
      `contributes instances), or, if this composition is really a determination, declare the concept ` +
      `\`value type is boolean\` (then boolean operands compose, and a resource operand is bridged via ` +
      `\`exists\`).`,
    location: loc(location),
    severity: "error",
    ...base(attribution),
  };
}

function bareRefAliasMismatch(
  conceptName: string,
  conceptVt: ConceptValueType,
  targetVt: ConceptValueType,
  targetName: string,
  location: Location,
  attribution: Attribution,
): UseSiteTypeMismatchError {
  // `conceptVt !== targetVt` (the caller's guard). Tailor the fix to the case: a boolean parent over a
  // resource target wants `defined as exists`; a boolean target under a resource parent has the shapes
  // swapped; two differing non-boolean types is a plain value-type mismatch (no shape issue).
  let fix: string;
  if (conceptVt === "boolean") {
    fix =
      `To publish a \`boolean\` here, use \`defined as exists ( "${targetName}" )\` (existence of ` +
      `"${targetName}"), not a bare alias — a bare \`defined as\` copies "${targetName}"'s value unchanged, ` +
      `so it can't be a truth.`;
  } else if (targetVt === "boolean") {
    fix =
      `A boolean truth can't be read as a \`${conceptVt}\` value — reference a \`${conceptVt}\`-valued ` +
      `concept, or declare this concept \`value type is boolean\`.`;
  } else {
    fix =
      `Declare the same value type as "${targetName}" (\`${targetVt}\`), or reference a ` +
      `\`${conceptVt}\`-valued concept instead.`;
  }
  return {
    kind: "use-site-type-mismatch",
    rule: "bare-ref-value-type-mismatch",
    conceptName,
    expected: conceptVt,
    actual: targetVt,
    message:
      `Concept "${conceptName}": a bare \`defined as "${targetName}"\` is value-PRESERVING (its value IS ` +
      `"${targetName}"'s), and the emitter bridges it in neither direction — so the concept's value type ` +
      `must EQUAL the target's, but it declares \`value type is ${conceptVt}\` while "${targetName}" is ` +
      `\`${targetVt}\`. ${fix}`,
    location: loc(location),
    severity: "error",
    ...base(attribution),
  };
}

function posrepMismatch(
  conceptName: string,
  conceptVt: ConceptValueType,
  repVt: ConceptValueType,
  location: Location,
  attribution: Attribution,
): UseSiteTypeMismatchError {
  return {
    kind: "use-site-type-mismatch",
    rule: "posrep-value-type-mismatch",
    conceptName,
    expected: conceptVt,
    actual: repVt,
    message:
      `Concept "${conceptName}": a \`source representation\` with no \`value projection is\` declares ` +
      `\`value type is ${repVt}\`, but the concept's value type is \`${conceptVt}\`. A representation ` +
      `without a projection is read AS the concept's value, so the two must match — align the value ` +
      `types, or add a \`value projection is …\` to bridge the \`${repVt}\` datum to the \`${conceptVt}\` value.`,
    location: loc(location),
    severity: "error",
    ...base(attribution),
  };
}

function guardMismatch(
  ownerName: string,
  actual: ConceptValueType,
  location: Location,
  attribution: Attribution,
): UseSiteTypeMismatchError {
  return {
    kind: "use-site-type-mismatch",
    rule: "decision-guard-nonboolean",
    conceptName: ownerName,
    expected: "boolean",
    actual,
    message:
      `Decision/criterion "${ownerName}": a guard consumes a \`boolean\`, but its operand resolves to a ` +
      `concept declaring \`value type is ${actual}\`. A guard has no implicit truthiness — reference a ` +
      `boolean determination (e.g. a \`defined as exists\` concept, or a value comparison like ` +
      `\`… at least …\`), not the raw \`${actual}\` value.`,
    location: loc(location),
    severity: "error",
    ...base(attribution),
  };
}

function untypedWarning(
  conceptName: string,
  pattern: string,
  constraint: OperandConstraint,
  operandName: string,
  location: Location,
  attribution: Attribution,
): UseSiteOperandUntypedWarning {
  return {
    kind: "use-site-operand-untyped",
    conceptName,
    message:
      `Concept "${conceptName}": ${constraint.role} of \`${pattern}\` should be ` +
      `${operandExpectation(constraint)}, but its operand "${operandName}" declares no ` +
      `\`value type\`. This can't be checked until "${operandName}" declares one (a Todo-4 migration ` +
      `will make value types required).`,
    location: loc(location),
    severity: "warning",
    ...base(attribution),
  };
}

/** Narrow an AST `Location` to the plain start/end shape the diagnostic carries. */
function loc(location: Location): UseSiteTypeMismatchError["location"] {
  return {
    start: { line: location.start.line, column: location.start.column },
    end: { line: location.end.line, column: location.end.column },
  };
}
