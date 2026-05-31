/**
 * CRL → CQL emitter (v0.2).
 *
 * Walks a parsed CRL document and produces a CQL library targeting
 * `CRLPatterns.cql` (see cql/src/CRLPatterns.cql). The catalog is the source
 * of truth for narrative → canonical → CQL function name mapping; this
 * emitter consumes the canonical AST produced by `matchNarrative` from
 * `src/template-match`.
 *
 * v0.2 scope additions over v0.1:
 *   - Refinement-shape sem-and / sem-or / sem-not now emit `intersect` /
 *     `union` / `except` instead of `and` / `or` / `not` when the outer
 *     concept's declared shape is a refinement (valuetype != boolean).
 *     sem-not is hoisted out of sem-and into an `except` clause so that
 *     `A sem-and sem-not B` cleanly produces `A except B`.
 *   - Duplicate-identifier collision detection: when a CRL terminology and
 *     concept share a name (the corpus pattern for single-code "X" with an
 *     asserted "X" concept that codes from it), the terminology emission
 *     gets a " Code" / " ValueSet" suffix and the concept's reference is
 *     rewritten accordingly.
 *   - Stub-valueset detection: terminology declarations with an empty
 *     valueset URL are treated as runtime parameter stubs. The terminology
 *     is omitted, the corresponding concept is omitted, and a `parameter`
 *     declaration takes their place with a one-year default Interval.
 *     Downstream `"Measurement Period"` references resolve to the
 *     parameter.
 *
 * Out of scope for v0.2:
 *   - Value-bearing date concepts (`.authoredOn` / `.performed` extraction)
 *   - Disjunction / Conjunction args in narrative patterns
 *   - Nested pattern calls (e.g. `MostRecent(X, BeforeStartOf(...))`)
 *   - Refinement+boolean MIXED sem-* composition (would need cast wrappers)
 */

import { buildCRL } from "../index";
import { matchNarrative } from "../template-match";
import type {
  CanonicalArg,
  CanonicalPatternCall,
} from "../template-match/canonicalTypes";
import type {
  CRL,
  Concept,
  CompositionExpression,
  ConceptDefinition,
  CodedFromDefinition,
  InferredFromBareRef,
  InferredFromComposition,
  LogicIsDefinition,
  Terminology,
  TerminologyBodyLine,
} from "../ast/types";
import type { CRLError } from "../types/errors";

export interface EmitOptions {
  libraryName?: string;
  libraryVersion?: string;
  fhirHelpersVersion?: string;
  crlPatternsVersion?: string;
}

export interface EmitResult {
  success: boolean;
  result?: string;
  errors?: CRLError[];
}

/** Map a canonical pattern name to its `CRLPatterns.X` function name. */
const FUNCTION_NAME_OVERRIDES: Record<string, string> = {
  Last: "LastOf",
  First: "FirstOf",
};

function functionNameFor(canonical: string): string {
  return FUNCTION_NAME_OVERRIDES[canonical] ?? canonical;
}

function cqlString(s: string): string {
  return "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}

function cqlIdent(s: string): string {
  return '"' + s.replace(/"/g, '\\"') + '"';
}

function indent(text: string, level = 1): string {
  const pad = "  ".repeat(level);
  return text
    .split("\n")
    .map((l) => (l.length ? pad + l : l))
    .join("\n");
}

type CompositionShape = "boolean" | "refinement";

export function emitCQL(input: string, options: EmitOptions = {}): EmitResult {
  const parsed = buildCRL(input);
  if (!parsed.success || !parsed.result) {
    return { success: false, errors: parsed.errors };
  }
  try {
    const out = new Emitter(parsed.result, options).emit();
    return { success: true, result: out };
  } catch (e) {
    return {
      success: false,
      errors: [
        {
          type: "Exception",
          message: e instanceof Error ? e.message : String(e),
        },
      ],
    };
  }
}

class Emitter {
  private readonly ast: CRL;
  private readonly options: Required<EmitOptions>;
  /** Names declared as terminologies (separate set since a name can be BOTH a terminology and a concept in the corpus). */
  private readonly terminologyNames: Set<string> = new Set();
  /** Names declared as concepts. */
  private readonly conceptNames: Set<string> = new Set();
  /** Concept's declared FHIR resource type. */
  private readonly conceptType: Map<string, string | undefined> = new Map();
  /** Concept's declared first valuetype (or undefined). */
  private readonly conceptValuetype: Map<string, string | undefined> = new Map();
  /** Concept's body-definition kind — drives the shape-of-emit heuristic. */
  private readonly conceptBodyKind: Map<string, ConceptDefinition["type"]> = new Map();
  /** For inferred-from concepts, the body so we can recurse for shape. */
  private readonly conceptBody: Map<string, ConceptDefinition> = new Map();
  /** Terminology emit name (may differ from CRL name when disambiguated). */
  private readonly terminologyEmitName: Map<string, string> = new Map();
  /**
   * Names of CRL declarations to SKIP emitting because they're either stub
   * runtime parameters (empty-URL valuesets) or the matching concept that
   * just wraps such a stub. References to these names elsewhere in the
   * library will resolve to the emitted `parameter` declaration.
   */
  private readonly skipNames: Set<string> = new Set();
  /** Names of concept refs that emit as parameter references. */
  private readonly parameterNames: Set<string> = new Set();

  constructor(ast: CRL, options: EmitOptions) {
    this.ast = ast;
    this.options = {
      libraryName: options.libraryName ?? "GeneratedFromCRL",
      libraryVersion: options.libraryVersion ?? "0.1.0",
      fhirHelpersVersion: options.fhirHelpersVersion ?? "4.0.1",
      crlPatternsVersion: options.crlPatternsVersion ?? "0.1.0",
    };
    this.indexNames();
    this.detectStubsAndCollisions();
  }

  /** First pass: index every declaration name + kind. */
  private indexNames(): void {
    for (const stmt of this.ast.statements) {
      if (stmt.type === "Concept" && stmt.name) {
        this.conceptNames.add(stmt.name);
        this.conceptType.set(stmt.name, stmt.conceptType);
        this.conceptValuetype.set(stmt.name, stmt.valueTypes?.[0]);
        this.conceptBodyKind.set(stmt.name, stmt.definition.type);
        this.conceptBody.set(stmt.name, stmt.definition);
      } else if (stmt.type === "Terminology" && stmt.name) {
        this.terminologyNames.add(stmt.name);
      }
    }
  }

  /**
   * Second pass: detect stub valuesets, name collisions, and decide each
   * terminology's emit name + each concept's emit strategy.
   */
  private detectStubsAndCollisions(): void {
    for (const stmt of this.ast.statements) {
      if (stmt.type !== "Terminology" || !stmt.name) continue;
      const isStub = isStubTerminology(stmt);
      if (isStub) {
        // The terminology is a runtime-parameter stub. Find the concept that
        // codes from it (the user's "Measurement Period" style alias) and
        // mark both for parameter emission.
        const aliasConcept = this.findConceptCodingFrom(stmt.name);
        this.skipNames.add(stmt.name);
        if (aliasConcept) {
          this.skipNames.add(aliasConcept.name);
          this.parameterNames.add(aliasConcept.name);
          this.terminologyEmitName.set(stmt.name, aliasConcept.name);
        } else {
          this.parameterNames.add(stmt.name);
          this.terminologyEmitName.set(stmt.name, stmt.name);
        }
        continue;
      }
      // Non-stub terminologies: disambiguate name if it collides with a
      // concept of the same name.
      if (this.conceptNames.has(stmt.name)) {
        const suffix = hasOnlyValueset(stmt) ? " ValueSet" : " Code";
        this.terminologyEmitName.set(stmt.name, stmt.name + suffix);
      } else {
        this.terminologyEmitName.set(stmt.name, stmt.name);
      }
    }
  }

  private findConceptCodingFrom(terminologyName: string): Concept | undefined {
    for (const stmt of this.ast.statements) {
      if (stmt.type !== "Concept") continue;
      if (stmt.definition.type !== "CodedFromDefinition") continue;
      if (stmt.definition.terminologyName === terminologyName) return stmt;
    }
    return undefined;
  }

  emit(): string {
    const sections: string[] = [];
    sections.push(this.header());

    const terminologies = this.ast.statements
      .filter((s): s is Terminology => s.type === "Terminology")
      .filter((t) => !this.skipNames.has(t.name));
    if (terminologies.length > 0) {
      sections.push(this.emitTerminologies(terminologies));
    }

    const parameters = this.emitParameters();
    if (parameters) sections.push(parameters);

    sections.push("context Patient");

    const concepts = this.ast.statements
      .filter((s): s is Concept => s.type === "Concept" && !!s.name)
      .filter((c) => !this.skipNames.has(c.name));
    if (concepts.length > 0) {
      sections.push(this.emitConcepts(concepts));
    }
    return sections.join("\n\n") + "\n";
  }

  private header(): string {
    return [
      `library ${this.options.libraryName} version '${this.options.libraryVersion}'`,
      "",
      "using FHIR version '4.0.1'",
      "",
      `include FHIRHelpers version '${this.options.fhirHelpersVersion}' called FHIRHelpers`,
      `include CRLPatterns version '${this.options.crlPatternsVersion}' called CRLPatterns`,
    ].join("\n");
  }

  /**
   * Emit `parameter "X" Interval<DateTime> default Interval[...]` for every
   * stub-valueset-derived parameter. Returns empty string if none.
   */
  private emitParameters(): string {
    if (this.parameterNames.size === 0) return "";
    const lines: string[] = [];
    for (const name of this.parameterNames) {
      lines.push(
        `parameter ${cqlIdent(name)} Interval<DateTime>\n  default Interval[@2024-01-01T00:00:00.000Z, @2025-01-01T00:00:00.000Z)`
      );
    }
    return lines.join("\n");
  }

  private emitTerminologies(terms: Terminology[]): string {
    return terms.map((t) => this.emitOneTerminology(t)).join("\n");
  }

  private emitOneTerminology(t: Terminology): string {
    const emitName = this.terminologyEmitName.get(t.name) ?? t.name;
    return t.body
      .map((line) => this.emitTerminologyLine(emitName, line))
      .join("\n");
  }

  private emitTerminologyLine(emitName: string, line: TerminologyBodyLine): string {
    switch (line.type) {
      case "TerminologyValueset":
        return `valueset ${cqlIdent(emitName)}: ${cqlString(line.valuesetName)}`;
      case "TerminologySystem":
        return `codesystem ${cqlIdent(emitName + " System")}: ${cqlString(line.system)}`;
      case "TerminologyCode":
        return `code ${cqlIdent(emitName)}: ${cqlString(line.code)} from ${cqlIdent(emitName + " System")}`;
    }
  }

  private emitConcepts(concepts: Concept[]): string {
    return concepts.map((c) => this.emitConcept(c)).join("\n\n");
  }

  private emitConcept(c: Concept): string {
    const header = `define ${cqlIdent(c.name)}:`;
    const body = this.emitConceptBody(c, c.definition);
    return `${header}\n${indent(body, 1)}`;
  }

  private emitConceptBody(c: Concept, def: ConceptDefinition): string {
    switch (def.type) {
      case "CodedFromDefinition":
        return this.emitCodedFrom(c, def);
      case "InferredFromDefinition":
        return this.emitInferredFrom(c, def.body);
      case "LogicIsDefinition":
        return this.emitLogicIs(def);
    }
  }

  private emitCodedFrom(c: Concept, def: CodedFromDefinition): string {
    const resource = c.conceptType ?? "Observation";
    if (!this.terminologyNames.has(def.terminologyName)) {
      return `// FIXME: unresolved terminology ${cqlIdent(def.terminologyName)}\n[${resource}: ${cqlIdent(def.terminologyName)}]`;
    }
    const refName = this.terminologyEmitName.get(def.terminologyName) ?? def.terminologyName;
    return `[${resource}: ${cqlIdent(refName)}]`;
  }

  /**
   * Determine what value-shape a concept name actually EMITS to (not what
   * the CRL author declared as intent). The discriminator is the concept's
   * body kind:
   *   - `coded from`      → a `[Resource: "VS"]` retrieve, list-shaped
   *   - `logic is`        → a `CRLPatterns.<P>(…)` call. Most pattern
   *                         functions return `Boolean`. v0.2 assumes
   *                         boolean for all `logic is` concepts. Future
   *                         versions will consult the catalog for per-
   *                         pattern return types.
   *   - `inferred from <bare>`     → recurse to the referent
   *   - `inferred from <composition>` → recurse with the composition's
   *                         resolved shape
   * Returns `undefined` for names that don't resolve to a known concept or
   * terminology (the caller treats these as opaque refinements).
   */
  private shapeOfName(name: string, seen: Set<string> = new Set()): CompositionShape | undefined {
    if (seen.has(name)) return undefined; // break cycles defensively
    seen.add(name);
    if (!this.conceptNames.has(name)) {
      return this.terminologyNames.has(name) ? "refinement" : undefined;
    }
    const bodyKind = this.conceptBodyKind.get(name);
    if (bodyKind === "CodedFromDefinition") return "refinement";
    if (bodyKind === "LogicIsDefinition") return "boolean";
    if (bodyKind === "InferredFromDefinition") {
      const body = this.conceptBody.get(name);
      if (body && body.type === "InferredFromDefinition") {
        const inner = body.body;
        if (inner.type === "InferredFromBareRef") {
          return this.shapeOfName(inner.ref, seen);
        }
        // Composition — pick shape from its leaves.
        const leaves: string[] = [];
        collectRefs(inner.expression, leaves);
        let anyBool = false;
        let anyRefinement = false;
        for (const leaf of leaves) {
          const s = this.shapeOfName(leaf, seen);
          if (s === "boolean") anyBool = true;
          else if (s === "refinement") anyRefinement = true;
        }
        if (anyBool && !anyRefinement) return "boolean";
        return "refinement";
      }
    }
    return undefined;
  }

  /**
   * Determine the shape to use for a composition expression. Walks all leaf
   * CompositionRef nodes; if every leaf resolves to a known boolean concept,
   * the composition is boolean. Otherwise refinement. Mixed-shape composition
   * falls back to refinement (the user can wrap list-shaped subexpressions
   * with `exists` upstream if they want boolean).
   */
  private shapeForComposition(expr: CompositionExpression): CompositionShape {
    const leaves: string[] = [];
    collectRefs(expr, leaves);
    if (leaves.length === 0) return "refinement";
    let anyBoolean = false;
    let anyRefinement = false;
    for (const ref of leaves) {
      const s = this.shapeOfName(ref);
      if (s === "boolean") anyBoolean = true;
      else if (s === "refinement") anyRefinement = true;
    }
    if (anyBoolean && !anyRefinement) return "boolean";
    return "refinement";
  }

  private emitInferredFrom(
    c: Concept,
    body: InferredFromBareRef | InferredFromComposition
  ): string {
    if (body.type === "InferredFromBareRef") {
      return cqlIdent(body.ref);
    }
    const shape = this.shapeForComposition(body.expression);
    return this.emitComposition(body.expression, shape);
  }

  private emitComposition(
    expr: CompositionExpression,
    shape: CompositionShape
  ): string {
    switch (expr.type) {
      case "CompositionRef":
        return cqlIdent(expr.ref);
      case "CompositionGroup":
        return `(${this.emitComposition(expr.expression, shape)})`;
      case "SemNotExpression":
        // Standalone sem-not. For boolean: `not (X)`. For refinement: there's
        // no good standalone meaning ("exclude X from what?"); FIXME comment.
        if (shape === "boolean") {
          return `not (${this.emitComposition(expr.expression, shape)})`;
        }
        return `// FIXME: standalone sem-not in refinement context\n${this.emitComposition(expr.expression, shape)}`;
      case "SemAndExpression":
        return this.emitSemAnd(expr.terms, shape);
      case "SemOrExpression":
        return this.emitSemOr(expr.terms, shape);
    }
  }

  /**
   * sem-and. For booleans: join with `and`. For refinement: positive terms
   * `intersect`-joined, then any sem-not children become `except` clauses.
   */
  private emitSemAnd(terms: CompositionExpression[], shape: CompositionShape): string {
    if (shape === "boolean") {
      return terms
        .map((t) => this.emitComposition(t, shape))
        .join("\n  and ");
    }
    const positives: CompositionExpression[] = [];
    const negatives: CompositionExpression[] = [];
    for (const t of terms) {
      if (t.type === "SemNotExpression") negatives.push(t.expression);
      else positives.push(t);
    }
    const pos = positives.length
      ? positives.map((t) => this.emitComposition(t, shape)).join("\n  intersect ")
      : "{}";
    if (negatives.length === 0) return pos;
    const neg = negatives.map((t) => this.emitComposition(t, shape)).join("\n  except ");
    return `${pos}\n  except ${neg}`;
  }

  /** sem-or. Boolean: `or`. Refinement: `union`. */
  private emitSemOr(terms: CompositionExpression[], shape: CompositionShape): string {
    const op = shape === "boolean" ? "or" : "union";
    return terms
      .map((t) => this.emitComposition(t, shape))
      .join(`\n  ${op} `);
  }

  private emitLogicIs(def: LogicIsDefinition): string {
    const matched = matchNarrative(def.body);
    if (!matched.known) {
      const text = def.body.elements.map((el) => narrativeElementText(el)).join(" ");
      return `// FIXME: unmatched narrative pattern — ${text}\ntrue`;
    }
    return this.emitPatternCall(matched);
  }

  private emitPatternCall(call: CanonicalPatternCall): string {
    const fn = functionNameFor(call.pattern);
    const args = call.args.map((a) => this.emitArg(a)).join(", ");
    return `CRLPatterns.${fn}(${args})`;
  }

  private emitArg(arg: CanonicalArg): string {
    switch (arg.type) {
      case "ConceptRefArg":
        return cqlIdent(arg.value);
      case "QuantityArg":
        return arg.unit ? `${arg.value} ${cqlString(arg.unit)}` : `${arg.value}`;
      case "EnumArg":
        return cqlString(arg.value);
      case "DisjunctionArg":
        return `{ ${arg.disjuncts.map((d) => this.emitArg(d)).join(", ")} }`;
      case "ConjunctionArg":
        return `{ ${arg.conjuncts.map((c) => this.emitArg(c)).join(", ")} }`;
      case "NestedPatternArg":
        return this.emitPatternCall(arg.pattern);
    }
  }
}

/**
 * A terminology is a "stub" runtime-parameter alias if it declares a
 * valueset with an empty URL (the corpus pattern for `Measurement Period
 * (stub valueset)` and similar).
 */
/** Walk a composition expression and collect every CompositionRef name. */
function collectRefs(expr: CompositionExpression, out: string[]): void {
  switch (expr.type) {
    case "CompositionRef":
      out.push(expr.ref);
      return;
    case "SemNotExpression":
      collectRefs(expr.expression, out);
      return;
    case "SemAndExpression":
    case "SemOrExpression":
      for (const t of expr.terms) collectRefs(t, out);
      return;
    case "CompositionGroup":
      collectRefs(expr.expression, out);
      return;
  }
}

function isStubTerminology(t: Terminology): boolean {
  if (t.body.length !== 1) return false;
  const body = t.body[0];
  return body.type === "TerminologyValueset" && body.valuesetName === "";
}

function hasOnlyValueset(t: Terminology): boolean {
  return t.body.length === 1 && t.body[0].type === "TerminologyValueset";
}

function narrativeElementText(el: { type: string }): string {
  const anyEl = el as { type: string; value?: string | number; unit?: string };
  if (anyEl.type === "NWord") return String(anyEl.value ?? "");
  if (anyEl.type === "NConceptRef") return `"${anyEl.value ?? ""}"`;
  if (anyEl.type === "Quantity") return `${anyEl.value} '${anyEl.unit ?? ""}'`;
  return `<${anyEl.type}>`;
}
