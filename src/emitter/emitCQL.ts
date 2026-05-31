/**
 * CRL → CQL emitter (v0.1).
 *
 * Walks a parsed CRL document and produces a CQL library targeting
 * `CRLPatterns.cql` (see cql/src/CRLPatterns.cql). The catalog is the source
 * of truth for narrative → canonical → CQL function name mapping; this
 * emitter consumes the canonical AST produced by `matchNarrative` from
 * `src/template-match`.
 *
 * v0.1 scope:
 *   - Library header (library declaration, using, include FHIRHelpers,
 *     include CRLPatterns)
 *   - Terminology declarations → CQL `valueset` / `codesystem` / `code`
 *     statements (concrete URLs preserved; empty URLs flagged in comments)
 *   - Asserted concepts (`coded from`) → CQL retrieve expressions like
 *     `[Observation: "Some Valueset"]`
 *   - Logic-is concepts → `define` calling `CRLPatterns.<Name>(args)` for
 *     known catalog patterns; emits a comment for unknown narratives
 *   - Inferred-from bare-ref → `define "X": "Other Concept"` pass-through
 *   - Inferred-from composition (sem-and/or/not) → CQL `and`/`or`/`not`
 *     when the result is boolean; documented as a v0.1 simplification
 *     (refinement-shape compositions get a FIXME comment)
 *
 * Out of scope for v0.1 (queued for v0.2+):
 *   - Multi-arg narrative patterns with complex argument structures
 *   - Value-bearing date concepts (`.authoredOn` / `.performed` extraction)
 *   - Disjunction / Conjunction arg types in narrative
 *   - Nested pattern calls (e.g. `MostRecent(X, BeforeStartOf(...))`)
 *   - The `Has` overloads' polymorphism (currently emits `CRLPatterns.Has(X)`
 *     and lets CQL resolve the right overload)
 *   - Parameter declarations (Measurement Period stub still hand-modeled)
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
  Statement,
  Terminology,
  TerminologyBodyLine,
} from "../ast/types";
import type { CRLError } from "../types/errors";

export interface EmitOptions {
  /** Library name to declare. Defaults to "GeneratedFromCRL". */
  libraryName?: string;
  /** Library version. Defaults to "0.1.0". */
  libraryVersion?: string;
  /** FHIRHelpers version. Defaults to "4.0.1". */
  fhirHelpersVersion?: string;
  /** CRLPatterns version. Defaults to "0.1.0". */
  crlPatternsVersion?: string;
}

export interface EmitResult {
  success: boolean;
  result?: string;
  errors?: CRLError[];
}

/**
 * Map a canonical pattern name to its `CRLPatterns.X` function name. For
 * most patterns, this is identity. The only exceptions are `Last` and
 * `First`, where the library uses `LastOf` / `FirstOf` to avoid shadowing
 * the CQL built-ins.
 */
const FUNCTION_NAME_OVERRIDES: Record<string, string> = {
  Last: "LastOf",
  First: "FirstOf",
};

function functionNameFor(canonical: string): string {
  return FUNCTION_NAME_OVERRIDES[canonical] ?? canonical;
}

/**
 * Quote a CQL string literal, escaping embedded quotes. CQL uses single
 * quotes for string literals.
 */
function cqlString(s: string): string {
  return "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}

/**
 * Quote a CQL identifier. Always double-quoted; embedded `"` is escaped.
 */
function cqlIdent(s: string): string {
  return '"' + s.replace(/"/g, '\\"') + '"';
}

/**
 * Indent every line of `text` by `level` two-space units.
 */
function indent(text: string, level = 1): string {
  const pad = "  ".repeat(level);
  return text
    .split("\n")
    .map((l) => (l.length ? pad + l : l))
    .join("\n");
}

/** Main entry point. Parses CRL and emits a complete CQL library. */
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
  /** name → declaration kind. Used to dispatch concept-ref emission. */
  private readonly nameKind: Map<string, "concept" | "terminology"> = new Map();
  /** Concept's declared FHIR resource type (from `type is X.`). */
  private readonly conceptType: Map<string, string | undefined> = new Map();

  constructor(ast: CRL, options: EmitOptions) {
    this.ast = ast;
    this.options = {
      libraryName: options.libraryName ?? "GeneratedFromCRL",
      libraryVersion: options.libraryVersion ?? "0.1.0",
      fhirHelpersVersion: options.fhirHelpersVersion ?? "4.0.1",
      crlPatternsVersion: options.crlPatternsVersion ?? "0.1.0",
    };
    // First pass — index every declaration by name so concept refs in bodies
    // can resolve their kind and type at emit time.
    for (const stmt of ast.statements) {
      if (stmt.type === "Concept" && stmt.name) {
        this.nameKind.set(stmt.name, "concept");
        this.conceptType.set(stmt.name, stmt.conceptType);
      } else if (stmt.type === "Terminology" && stmt.name) {
        this.nameKind.set(stmt.name, "terminology");
      }
    }
  }

  emit(): string {
    const sections: string[] = [];
    sections.push(this.header());

    const terminologies = this.ast.statements.filter(
      (s): s is Terminology => s.type === "Terminology"
    );
    if (terminologies.length > 0) {
      sections.push(this.emitTerminologies(terminologies));
    }
    sections.push("context Patient");

    const concepts = this.ast.statements.filter(
      (s): s is Concept => s.type === "Concept" && !!s.name
    );
    if (concepts.length > 0) {
      sections.push(this.emitConcepts(concepts));
    }
    return sections.join("\n\n") + "\n";
  }

  private header(): string {
    const lines: string[] = [];
    lines.push(`library ${this.options.libraryName} version '${this.options.libraryVersion}'`);
    lines.push("");
    lines.push("using FHIR version '4.0.1'");
    lines.push("");
    lines.push(`include FHIRHelpers version '${this.options.fhirHelpersVersion}' called FHIRHelpers`);
    lines.push(`include CRLPatterns version '${this.options.crlPatternsVersion}' called CRLPatterns`);
    return lines.join("\n");
  }

  private emitTerminologies(terms: Terminology[]): string {
    return terms.map((t) => this.emitOneTerminology(t)).join("\n");
  }

  private emitOneTerminology(t: Terminology): string {
    const lines: string[] = [];
    // Group body lines by kind. A single CRL terminology can declare
    // valueset, system, code in any combination — emit each as the
    // appropriate CQL declaration.
    for (const line of t.body) {
      lines.push(this.emitTerminologyLine(t.name, line));
    }
    return lines.join("\n");
  }

  private emitTerminologyLine(name: string, line: TerminologyBodyLine): string {
    switch (line.type) {
      case "TerminologyValueset": {
        const url = line.valuesetName;
        if (!url) {
          return `// FIXME: valueset ${cqlIdent(name)} has no URL declared in CRL`;
        }
        return `valueset ${cqlIdent(name)}: ${cqlString(url)}`;
      }
      case "TerminologySystem":
        // CRL terminology with system+code emits as a `code` statement; the
        // system+code body lines come as a pair, but we only have one line
        // here. Emit the codesystem here; the matching code statement is
        // emitted in TerminologyCode.
        return `codesystem ${cqlIdent(name + " System")}: ${cqlString(line.system)}`;
      case "TerminologyCode":
        return `code ${cqlIdent(name)}: ${cqlString(line.code)} from ${cqlIdent(name + " System")}`;
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
        return this.emitInferredFrom(def.body);
      case "LogicIsDefinition":
        return this.emitLogicIs(def);
    }
  }

  private emitCodedFrom(c: Concept, def: CodedFromDefinition): string {
    const resource = c.conceptType ?? "Observation";
    const termKind = this.nameKind.get(def.terminologyName);
    if (termKind !== "terminology") {
      return `// FIXME: unresolved terminology ${cqlIdent(def.terminologyName)}\n[${resource}: ${cqlIdent(def.terminologyName)}]`;
    }
    return `[${resource}: ${cqlIdent(def.terminologyName)}]`;
  }

  private emitInferredFrom(body: InferredFromBareRef | InferredFromComposition): string {
    if (body.type === "InferredFromBareRef") {
      return cqlIdent(body.ref);
    }
    return this.emitComposition(body.expression);
  }

  private emitComposition(expr: CompositionExpression): string {
    switch (expr.type) {
      case "CompositionRef":
        return cqlIdent(expr.ref);
      case "SemNotExpression":
        return `not (${this.emitComposition(expr.expression)})`;
      case "SemAndExpression":
        return expr.terms.map((t) => this.emitComposition(t)).join("\n  and ");
      case "SemOrExpression":
        return expr.terms.map((t) => this.emitComposition(t)).join("\n  or ");
      case "CompositionGroup":
        return `(${this.emitComposition(expr.expression)})`;
    }
  }

  private emitLogicIs(def: LogicIsDefinition): string {
    const matched = matchNarrative(def.body);
    if (!matched.known) {
      // Soft compile: emit a placeholder with the narrative as a comment.
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
        return arg.unit
          ? `${arg.value} ${cqlString(arg.unit)}`
          : `${arg.value}`;
      case "EnumArg":
        return cqlString(arg.value);
      case "DisjunctionArg":
        // CQL: `(A or B or C)` is a comparison-of-equals shape; for a
        // catalog `Disjunction<T>` we emit a list of the arg values that
        // the receiving function can `in` against. v0.1 emits as a list
        // literal; future versions will pick the right shape per pattern.
        return `{ ${arg.disjuncts.map((d) => this.emitArg(d)).join(", ")} }`;
      case "ConjunctionArg":
        return `{ ${arg.conjuncts.map((c) => this.emitArg(c)).join(", ")} }`;
      case "NestedPatternArg":
        return this.emitPatternCall(arg.pattern);
    }
  }
}

/**
 * Render a narrative-element node as text for diagnostic / soft-compile
 * comments. Not used for actual code paths — those go through the
 * template-match pipeline.
 */
function narrativeElementText(el: { type: string }): string {
  const anyEl = el as { type: string; value?: string | number; unit?: string };
  if (anyEl.type === "NWord") return String(anyEl.value ?? "");
  if (anyEl.type === "NConceptRef") return `"${anyEl.value ?? ""}"`;
  if (anyEl.type === "Quantity") return `${anyEl.value} '${anyEl.unit ?? ""}'`;
  return `<${anyEl.type}>`;
}
