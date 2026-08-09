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
  operandShapeDescription,
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

/** One concept's declared value types + whether it has a retrievable instance stream. */
interface ConceptTypeInfo {
  // rule A.9 guarantees <=1 here, but 0 or >1 can occur — rule B suppresses on both (A.9 owns >1).
  valueTypes: ConceptValueType[];
  // A local `code is` OR a `source representation` gives the concept instances to select over
  // (an instance stream). A purely `defined as` / `definition is`-derived concept has none — that
  // is what makes a DERIVED boolean not most-recent-able (design refinement 1).
  hasStream: boolean;
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
  | { status: "typed"; valueType: ConceptValueType; hasStream: boolean }
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
        const key = `${attribution.filePath ?? ""}${conceptName}${arg.value}${arg.location.start.line}:${arg.location.start.column}`;
        if (warnedUntyped.has(key)) return;
        warnedUntyped.add(key);
        errors.push(
          untypedWarning(conceptName, call.pattern, constraint, arg.value, arg.location, attribution),
        );
        return;
      }
      case "typed": {
        const ok = operandSatisfies(constraint, res.valueType, res.hasStream);
        if (!ok) {
          errors.push(
            operandMismatch(conceptName, call, constraint, arg.value, res.valueType, arg.location, attribution),
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
      const hasStream = stmt.code !== undefined || (stmt.representations ?? []).length > 0;
      lib(key).concepts.set(stmt.name, { valueTypes: stmt.valueTypes ?? [], hasStream });
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
    return { status: "typed", valueType: c.valueTypes[0], hasStream: c.hasStream };
  }
  if (allowParameter) {
    const pt = libTypes.parameters.get(name);
    if (pt !== undefined) {
      // A parameter typed as a VALUE type is checkable (a definite single type; a parameter is a
      // runtime scalar with no instance stream). A parameter typed as a RESOURCE (`ConceptType`,
      // e.g. `Observation`) is not a value — can't value-check it, stay silent.
      if (VALUE_TYPES.has(pt)) return { status: "typed", valueType: pt as ConceptValueType, hasStream: false };
      return { status: "unresolved" };
    }
  }
  return { status: "unresolved" };
}

/** Whether a typed operand satisfies a constraint. `not-derived <T>` forbids only a stream-less T. */
function operandSatisfies(
  constraint: OperandConstraint,
  valueType: ConceptValueType,
  hasStream: boolean,
): boolean {
  if (constraint.shape.rel === "is") return valueType === constraint.shape.valueType;
  // `not-derived <T>`: a coded / posrep concept of type T HAS an instance stream and is validly
  // selectable (design refinement 1: "not a DERIVED boolean; a boolean is a single computed fact
  // with no instance stream"). Only a stream-less derived T is forbidden. NOTE: a concept with a
  // `code is` AND a `defined as` boolean has a stream (its coded assertions) and is treated as
  // selectable — a deliberate reading of "derived" as "stream-less", flagged for design confirm.
  return !(valueType === constraint.shape.valueType && !hasStream);
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
  location: Location,
  attribution: Attribution,
): UseSiteTypeMismatchError {
  const expected = operandShapeDescription(constraint.shape);
  return {
    kind: "use-site-type-mismatch",
    rule: "operand-shape",
    conceptName,
    pattern: call.pattern,
    argPosition: constraint.position,
    expected,
    actual,
    message:
      `Concept "${conceptName}": ${constraint.role} of \`${call.pattern}\` must be ${expected}, ` +
      `but its operand "${operandName}" declares type \`${actual}\`. ` + // "type" — operand may be a parameter (`param type is`)
      (constraint.shape.rel === "not-derived"
        ? `A time-selection pattern selects an instance by timestamp, so a DERIVED \`${constraint.shape.valueType}\` ` +
          `(a computed fact with no instance stream) can't be selected over — point it at an ` +
          `instance-bearing concept (one with a \`code is\` or a \`source representation\`).`
        : `A value-comparison pattern compares a magnitude, so its operand must be \`${constraint.shape.valueType}\`-valued.`),
    location: loc(location),
    severity: "error",
    ...base(attribution),
  };
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
      `${operandShapeDescription(constraint.shape)}, but its operand "${operandName}" declares no ` +
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
