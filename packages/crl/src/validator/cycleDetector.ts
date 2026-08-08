import type {
  CRL,
  Concept,
  Criterion,
  Decision,
  BranchBlock,
  BranchCondition,
  WhenBlockBody,
  BlockBody,
  ActionStatement,
  CompositionExpression,
  DefinedAsComposition,
  NarrativeClause,
  NarrativeElement,
  ArgValue,
  Location,
} from "../ast/types";
import { getRefName, getRefLibrary, isQualifiedRef } from "../ast/types";
import type { LibraryScope, SourceContext } from "../imports/scopes";
import { lookupKnownLibrary } from "../imports/scopes";

import { ValidationError } from "./validator";

/**
 * Detects cycles in BOTH concept-reference and decision-delegation graphs
 * over a CRL document (or a multi-file SourceContext).
 *
 * Concept graph: `concept "A" defined as "B"` adds edge A→B; `definition is
 * has "B"` likewise. Emits `kind: "reference-cycle"`.
 *
 * Decision graph (T02 / #96): `decision "D" - when … then use decision "E"`
 * adds edge D→E. Emits `kind: "decision-delegation-cycle"`. Decision walk
 * mirrors `referenceResolver.ts:walkDecision/walkWhenBlock/walkWhenBlockBody/
 * walkBlockBody/walkActionStatement`.
 *
 * Single-file mode (no `sources`): bare-name adjacency keyed by the
 * declared `library "X".`'s X (passed to flat collectors as
 * `currentLibName`). A qualified ref `"Other"."Y"` whose qualifier is NOT
 * the current library's name is IGNORED — ReferenceResolver fires
 * `external-library-not-included` for that case; treating the qualifier as
 * a same-namespace lookup would false-positive-cycle when a local `"Y"`
 * exists. Qualified self-ref `"Self"."Y"` (qualifier === currentLibName)
 * collapses to bare `"Y"`.
 *
 * Multi-file mode (with `sources`): adjacency keyed by
 * `${origin}|${currentLibrary}|${refName}`. Bare refs in library L create
 * an edge to `L|refName`; qualified refs `"Other"."X"` are resolved via
 * `lookupKnownLibrary` to their actual origin (local vs. package) and
 * keyed accordingly.
 *
 * Algorithm: standard WHITE/GRAY/BLACK DFS. Back edge to GRAY = cycle; the
 * cycle path is canonicalized (rotated lowest-key-first) before dedupe.
 *
 * Soft mode: cycles are structural defects; both `reference-cycle` and
 * `decision-delegation-cycle` are NEVER demoted by `SOFT_DEMOTABLE_KINDS`.
 *
 * Note on dual cycle-detection: the FHIR emitter's
 * `closureOrchestrator.ts:classifyClosureDecisions` independently emits
 * `kind: "circular-decision-reference"` at emit time. That kind is in
 * `CRLError.kind` (fhir-emitter side), NOT in `ValidationErrorKind`. The
 * two paths have different message shapes; callers filtering by kind may
 * need to handle both. See `.vibe-tools/discussions/074-...` for rationale.
 *
 * Known limitation: multi-file node keys use `|` as delimiter, so a
 * library name containing `|` (e.g. `"A|B"`) can collide with a
 * different (library, name) pair (e.g. lib `"A"` + name `"B|<something>"`).
 * QUOTED_STRING grammar permits `|`. Operator + corpus authors don't use
 * `|` in names; deferred to a follow-up that aligns with the orchestrator's
 * tuple-key approach (`closureOrchestrator.ts:qualifiedKey`).
 */
export class CycleDetector {
  validate(ast: CRL, sources?: SourceContext[]): ValidationError[] {
    const conceptErrors = sources
      ? this.validateConceptCyclesScoped(sources)
      : this.validateConceptCyclesFlat(ast);
    const decisionErrors = sources
      ? this.validateDecisionCyclesScoped(sources)
      : this.validateDecisionCyclesFlat(ast);
    const criterionErrors = sources
      ? this.validateCriterionCyclesScoped(sources)
      : this.validateCriterionCyclesFlat(ast);
    return [...conceptErrors, ...decisionErrors, ...criterionErrors];
  }

  // ─────────────────────── CONCEPT — single-file ───────────────────────

  private validateConceptCyclesFlat(ast: CRL): ValidationError[] {
    const currentLibName = ast.library?.name ?? "";
    const adjacency = new Map<string, Set<string>>();
    const locations = new Map<string, Location>();

    for (const statement of ast.statements) {
      if (statement.type !== "Concept" || !statement.name) continue;
      const concept = statement as Concept;
      locations.set(concept.name, concept.location);
      const refs = new Set<string>();
      this.collectConceptRefs(concept, refs, undefined, currentLibName);
      adjacency.set(concept.name, refs);
    }

    return this.runDfs(
      adjacency,
      locations,
      undefined,
      "reference-cycle",
      "Reference cycle detected",
      (display) => display.map((n) => `"${n}"`).join(" → "),
    );
  }

  // ─────────────────────── CONCEPT — multi-file ────────────────────────

  private validateConceptCyclesScoped(sources: SourceContext[]): ValidationError[] {
    const adjacency = new Map<string, Set<string>>();
    const locations = new Map<string, Location>();
    const sourcesByNode = new Map<string, { libraryName: string; filePath: string }>();

    for (const { stmt, scope } of sources) {
      if (stmt.type !== "Concept" || !stmt.name) continue;
      const concept = stmt as Concept;
      const key = nodeKey(scope.origin, scope.currentLibrary, concept.name);
      locations.set(key, concept.location);
      sourcesByNode.set(key, {
        libraryName: scope.currentLibrary,
        filePath: scope.filePath,
      });
      const refs = new Set<string>();
      this.collectConceptRefs(concept, refs, scope, scope.currentLibrary);
      adjacency.set(key, refs);
    }

    return this.runDfs(
      adjacency,
      locations,
      sourcesByNode,
      "reference-cycle",
      "Reference cycle detected",
      (display) => formatScopedPath(display),
    );
  }

  // ─────────────────────── DECISION — single-file ──────────────────────

  private validateDecisionCyclesFlat(ast: CRL): ValidationError[] {
    const currentLibName = ast.library?.name ?? "";
    const adjacency = new Map<string, Set<string>>();
    const locations = new Map<string, Location>();

    for (const statement of ast.statements) {
      if (statement.type !== "Decision" || !statement.name) continue;
      const decision = statement as Decision;
      locations.set(decision.name, decision.location);
      const refs = new Set<string>();
      this.collectDecisionRefs(decision, refs, undefined, currentLibName);
      adjacency.set(decision.name, refs);
    }

    return this.runDfs(
      adjacency,
      locations,
      undefined,
      "decision-delegation-cycle",
      "Decision delegation cycle detected",
      (display) => display.map((n) => `"${n}"`).join(" → "),
    );
  }

  // ─────────────────────── DECISION — multi-file ───────────────────────

  private validateDecisionCyclesScoped(sources: SourceContext[]): ValidationError[] {
    const adjacency = new Map<string, Set<string>>();
    const locations = new Map<string, Location>();
    const sourcesByNode = new Map<string, { libraryName: string; filePath: string }>();

    for (const { stmt, scope } of sources) {
      if (stmt.type !== "Decision" || !stmt.name) continue;
      const decision = stmt as Decision;
      const key = nodeKey(scope.origin, scope.currentLibrary, decision.name);
      locations.set(key, decision.location);
      sourcesByNode.set(key, {
        libraryName: scope.currentLibrary,
        filePath: scope.filePath,
      });
      const refs = new Set<string>();
      this.collectDecisionRefs(decision, refs, scope, scope.currentLibrary);
      adjacency.set(key, refs);
    }

    return this.runDfs(
      adjacency,
      locations,
      sourcesByNode,
      "decision-delegation-cycle",
      "Decision delegation cycle detected",
      (display) => formatScopedPath(display),
    );
  }

  // ─────────────────────── CRITERION — single-file ─────────────────────
  // #224 ii: a `criterion` body is a `BranchCondition`; a
  // `BranchConditionCriterionRef` leaf inside it is an edge to another criterion.
  // Cross-library criterion refs are out of scope in v0 (classification only marks
  // bare / self-qualified refs), so the graph is always same-library — no scope
  // resolution needed, unlike concept/decision refs.

  private validateCriterionCyclesFlat(ast: CRL): ValidationError[] {
    const adjacency = new Map<string, Set<string>>();
    const locations = new Map<string, Location>();

    for (const statement of ast.statements) {
      if (statement.type !== "Criterion" || !statement.name) continue;
      const criterion = statement as Criterion;
      locations.set(criterion.name, criterion.location);
      const refs = new Set<string>();
      collectCriterionRefs(criterion.condition, refs);
      adjacency.set(criterion.name, refs);
    }

    return this.runDfs(
      adjacency,
      locations,
      undefined,
      "criterion-cycle",
      "Criterion cycle detected",
      (display) => display.map((n) => `"${n}"`).join(" → "),
    );
  }

  // ─────────────────────── CRITERION — multi-file ──────────────────────

  private validateCriterionCyclesScoped(sources: SourceContext[]): ValidationError[] {
    const adjacency = new Map<string, Set<string>>();
    const locations = new Map<string, Location>();
    const sourcesByNode = new Map<string, { libraryName: string; filePath: string }>();

    for (const { stmt, scope } of sources) {
      if (stmt.type !== "Criterion" || !stmt.name) continue;
      const criterion = stmt as Criterion;
      const key = nodeKey(scope.origin, scope.currentLibrary, criterion.name);
      locations.set(key, criterion.location);
      sourcesByNode.set(key, {
        libraryName: scope.currentLibrary,
        filePath: scope.filePath,
      });
      // Criterion refs are same-library-only (classification never marks a foreign
      // ref), so every edge stays within this library's `(origin, library)` key.
      const names = new Set<string>();
      collectCriterionRefs(criterion.condition, names);
      const refs = new Set<string>();
      for (const n of names) refs.add(nodeKey(scope.origin, scope.currentLibrary, n));
      adjacency.set(key, refs);
    }

    return this.runDfs(
      adjacency,
      locations,
      sourcesByNode,
      "criterion-cycle",
      "Criterion cycle detected",
      (display) => formatScopedPath(display),
    );
  }

  // ─────────────────────── shared DFS routine ──────────────────────────

  private runDfs(
    adjacency: Map<string, Set<string>>,
    locations: Map<string, Location>,
    sourcesByNode: Map<string, { libraryName: string; filePath: string }> | undefined,
    kind: "reference-cycle" | "decision-delegation-cycle" | "criterion-cycle",
    messagePrefix: string,
    formatDisplay: (path: string[]) => string,
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const cyclesReported = new Set<string>();

    const dfs = (node: string, path: string[]): void => {
      color.set(node, GRAY);
      path.push(node);

      const neighbors = adjacency.get(node) ?? new Set<string>();
      for (const neighbor of neighbors) {
        if (!adjacency.has(neighbor)) continue;

        const c = color.get(neighbor) ?? WHITE;
        if (c === WHITE) {
          dfs(neighbor, path);
        } else if (c === GRAY) {
          const idx = path.indexOf(neighbor);
          if (idx >= 0) {
            const cycle = path.slice(idx);
            cycle.push(neighbor);
            const cycleKey = this.canonicalizeCycle(cycle);
            if (!cyclesReported.has(cycleKey)) {
              cyclesReported.add(cycleKey);
              const sourceMeta = sourcesByNode?.get(node);
              errors.push({
                kind,
                message: `${messagePrefix}: ${formatDisplay(cycle)}`,
                location: locations.get(node) ?? {
                  start: { line: 1, column: 1 },
                  end: { line: 1, column: 1 },
                },
                severity: "error",
                ...(sourceMeta ? { libraryName: sourceMeta.libraryName, filePath: sourceMeta.filePath } : {}),
              });
            }
          }
        }
      }

      color.set(node, BLACK);
      path.pop();
    };

    for (const node of adjacency.keys()) {
      if ((color.get(node) ?? WHITE) === WHITE) {
        dfs(node, []);
      }
    }

    return errors;
  }

  // ─────────────────────── CONCEPT ref collection ──────────────────────

  private collectConceptRefs(
    concept: Concept,
    refs: Set<string>,
    scope: LibraryScope | undefined,
    currentLibName: string,
  ): void {
    // A rep's `definition is` PROJECTOR can carry concept refs (in the misattachment case),
    // so — unlike a rep's terminology-only refs — it CAN add cycle edges. Collect them so a
    // cycle THROUGH a projector is detected (a well-formed datum-level projector carries none).
    for (const rep of concept.representations ?? []) {
      if (rep.projector) {
        this.collectFromNarrative(rep.projector.body, refs, scope, currentLibName);
      }
    }
    // Reps otherwise reference terminologies (not concepts), so they add no cycle edges.
    if (!concept.definition) return;
    switch (concept.definition.type) {
      case "CodedFromDefinition":
        return;
      case "DefinedAsDefinition": {
        const body = concept.definition.body;
        // Bare ref and `exists ("X")` both add a single dependency edge to the referenced
        // concept — needed so a cycle THROUGH an `exists` is detected; only a composition
        // fans out to multiple edges.
        if (body.type === "DefinedAsBareRef" || body.type === "DefinedAsExists") {
          this.addEdge(body.ref, refs, scope, currentLibName);
        } else if (body.type === "DefinedAsComposition") {
          this.collectFromComposition(
            (body as DefinedAsComposition).expression,
            refs,
            scope,
            currentLibName,
          );
        }
        return;
      }
      case "DefinitionIsDefinition":
        this.collectFromNarrative(concept.definition.body, refs, scope, currentLibName);
        return;
    }
  }

  private collectFromComposition(
    expr: CompositionExpression,
    refs: Set<string>,
    scope: LibraryScope | undefined,
    currentLibName: string,
  ): void {
    switch (expr.type) {
      case "SemOrExpression":
      case "SemAndExpression":
        for (const term of expr.terms) {
          this.collectFromComposition(term, refs, scope, currentLibName);
        }
        return;
      case "SemNotExpression":
        this.collectFromComposition(expr.expression, refs, scope, currentLibName);
        return;
      case "CompositionGroup":
        this.collectFromComposition(expr.expression, refs, scope, currentLibName);
        return;
      case "CompositionRef":
        this.addEdge(expr.ref, refs, scope, currentLibName);
        return;
    }
  }

  private collectFromNarrative(
    clause: NarrativeClause,
    refs: Set<string>,
    scope: LibraryScope | undefined,
    currentLibName: string,
  ): void {
    for (const el of clause.elements) {
      this.collectFromNarrativeElement(el, refs, scope, currentLibName);
    }
  }

  private collectFromNarrativeElement(
    el: NarrativeElement,
    refs: Set<string>,
    scope: LibraryScope | undefined,
    currentLibName: string,
  ): void {
    switch (el.type) {
      case "NConceptRef":
        this.addEdge(el.value, refs, scope, currentLibName);
        return;
      case "NDisjunction":
        for (const av of el.disjuncts) {
          this.collectFromArgValue(av, refs, scope, currentLibName);
        }
        return;
      case "NConjunction":
        for (const av of el.conjuncts) {
          this.collectFromArgValue(av, refs, scope, currentLibName);
        }
        return;
    }
  }

  private collectFromArgValue(
    av: ArgValue,
    refs: Set<string>,
    scope: LibraryScope | undefined,
    currentLibName: string,
  ): void {
    switch (av.type) {
      case "NConceptRef":
        this.addEdge(av.value, refs, scope, currentLibName);
        return;
      case "NDisjunction":
        for (const inner of av.disjuncts) {
          this.collectFromArgValue(inner, refs, scope, currentLibName);
        }
        return;
      case "NConjunction":
        for (const inner of av.conjuncts) {
          this.collectFromArgValue(inner, refs, scope, currentLibName);
        }
        return;
    }
  }

  // ─────────────────────── DECISION ref collection ─────────────────────
  // Mirrors src/validator/referenceResolver.ts:283-323 — walkDecision /
  // walkWhenBlock / walkWhenBlockBody / walkBlockBody / walkActionStatement.

  private collectDecisionRefs(
    decision: Decision,
    refs: Set<string>,
    scope: LibraryScope | undefined,
    currentLibName: string,
  ): void {
    for (const branch of decision.body.statements) {
      this.walkDecisionBranch(branch, refs, scope, currentLibName);
    }
  }

  private walkDecisionBranch(
    branch: BranchBlock,
    refs: Set<string>,
    scope: LibraryScope | undefined,
    currentLibName: string,
  ): void {
    // A `when`'s `condition` is a boolean over CONCEPT refs, not decision refs,
    // so it contributes no decision-cycle edges (decision cycles follow
    // `use decision` only); `otherwise` carries no condition. Either way, walk
    // the body for nested UseDecisions — a `use decision` reached only through
    // `otherwise` is still a delegation edge. (Criterion-referencing-criterion
    // cycles arrive with slice ii, in different code.)
    this.walkDecisionWhenBlockBody(branch.body, refs, scope, currentLibName);
  }

  private walkDecisionWhenBlockBody(
    body: WhenBlockBody,
    refs: Set<string>,
    scope: LibraryScope | undefined,
    currentLibName: string,
  ): void {
    if (body.type === "BlockBody") {
      this.walkDecisionBlockBody(body, refs, scope, currentLibName);
    } else {
      this.walkDecisionActionStatement(body as ActionStatement, refs, scope, currentLibName);
    }
  }

  private walkDecisionBlockBody(
    block: BlockBody,
    refs: Set<string>,
    scope: LibraryScope | undefined,
    currentLibName: string,
  ): void {
    for (const stmt of block.statements) {
      if (stmt.type === "WhenBlock" || stmt.type === "OtherwiseBlock") {
        this.walkDecisionBranch(stmt, refs, scope, currentLibName);
      } else {
        this.walkDecisionActionStatement(stmt, refs, scope, currentLibName);
      }
    }
  }

  private walkDecisionActionStatement(
    stmt: ActionStatement,
    refs: Set<string>,
    scope: LibraryScope | undefined,
    currentLibName: string,
  ): void {
    const action = stmt.action;
    if (action.type === "UseDecision") {
      this.addEdge(action.decisionName, refs, scope, currentLibName);
    }
    // RecommendActivity: not a decision edge.
  }

  // ─────────────────────── edge resolution ─────────────────────────────

  /**
   * Single-file mode: foreign-qualified refs (qualifier !== currentLibName)
   * are IGNORED. ReferenceResolver fires external-library-not-included for
   * those; treating them as bare same-namespace lookups would
   * false-positive-cycle when a local target of the same name exists.
   * Qualified self-ref `"<currentLibName>"."X"` collapses to bare `"X"`.
   *
   * Multi-file mode: qualified refs resolve via `lookupKnownLibrary` to the
   * actual origin (local vs. package). No `explicitIncludes` visibility
   * gate — ReferenceResolver handles visibility; CycleDetector adds all
   * edges (orthogonal concerns). Package-origin refs that aren't visible
   * to the asker still won't close a cycle because the package's nodes
   * are keyed under their own origin/library and have their own
   * adjacency; if there's no edge back, no cycle.
   */
  private addEdge(
    ref: import("../ast/types").ReferenceName,
    refs: Set<string>,
    scope: LibraryScope | undefined,
    currentLibName: string,
  ): void {
    const refName = getRefName(ref);
    if (!refName) return;

    if (scope === undefined) {
      // Single-file mode.
      if (isQualifiedRef(ref)) {
        const qual = getRefLibrary(ref);
        if (!qual) return;
        if (qual !== currentLibName) return; // foreign-qualified — skip
      }
      refs.add(refName);
      return;
    }

    // Multi-file mode.
    if (isQualifiedRef(ref)) {
      const qual = getRefLibrary(ref);
      if (!qual) return;
      if (qual === scope.currentLibrary) {
        refs.add(nodeKey(scope.origin, qual, refName));
        return;
      }
      const target = lookupKnownLibrary(scope, qual);
      if (!target) return; // unknown lib — ReferenceResolver flags
      refs.add(nodeKey(target.origin, target.libraryName, refName));
      return;
    }
    refs.add(nodeKey(scope.origin, scope.currentLibrary, refName));
  }

  private canonicalizeCycle(cycle: string[]): string {
    if (cycle.length === 0) return "";
    const nodes = cycle.slice(0, -1);
    let min = 0;
    for (let i = 1; i < nodes.length; i++) {
      if (nodes[i] < nodes[min]) min = i;
    }
    const rotated = [...nodes.slice(min), ...nodes.slice(0, min)];
    return rotated.join("→");
  }
}

function nodeKey(origin: "local" | "package" | "root", libraryName: string, name: string): string {
  return `${origin}|${libraryName}|${name}`;
}

// #224 ii: collect the criterion-ref leaf NAMES in a criterion body (the criterion→
// criterion edges). Concept-ref leaves (`BranchConditionRef`) are NOT edges — they
// resolve via concept resolution, not criterion expansion. `getRefName` on the
// (bare / self-qualified) criterion ref yields the target criterion's local name.
function collectCriterionRefs(cond: BranchCondition, out: Set<string>): void {
  switch (cond.type) {
    case "BranchConditionRef":
      return;
    case "BranchConditionCriterionRef": {
      const name = getRefName(cond.ref);
      if (name) out.add(name);
      return;
    }
    case "BranchConditionNot":
      // #224 iii.2: a criterion edge under a negation (`not "SomeCriterion"`) is still an
      // edge for cycle detection — recurse the operand.
      collectCriterionRefs(cond.operand, out);
      return;
    case "BranchConditionAnd":
    case "BranchConditionOr":
      for (const o of cond.operands) collectCriterionRefs(o, out);
      return;
  }
}

function formatScopedPath(display: string[]): string {
  return display
    .map((k) => {
      const parts = k.split("|");
      if (parts.length === 3) return `"${parts[1]}"."${parts[2]}"`;
      return `"${k}"`;
    })
    .join(" → ");
}
