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
 *     concept (or AST parameter) share a name, the terminology emission
 *     gets a " Code" / " ValueSet" suffix and the concept's reference is
 *     rewritten accordingly.
 *   - Runtime parameters: declared explicitly as `parameter "X": - param
 *     type is T.` (issue #59) and emit as native CQL `parameter "X" T`
 *     lines (Patient/Practitioner-typed parameters collapse to `context
 *     Patient` / `context Practitioner`).
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
  DefinedAsBareRef,
  DefinedAsComposition,
  DefinitionIsDefinition,
  Parameter,
  Terminology,
  TerminologyBodyLine,
} from "../ast/types";
import { getRefName, getRefLibrary, isQualifiedRef } from "../ast/types";
import type { ReferenceName } from "../ast/types";
import type { CRLError } from "../types/errors";

/**
 * v2.2 Todo 3 (issue #59) — classified per-parameter info indexed at emit time.
 * Discriminated union so context-only fields (`contextType`) and parameter-only
 * fields (`cqlType`) can't be confused at the call site.
 */
export type AstParameterInfo =
  | { kind: "context"; contextType: "Patient" | "Practitioner" }
  | { kind: "parameter"; cqlType: string };

export interface EmitOptions {
  libraryName?: string;
  // FHIRHelpers ships versioned with the FHIR spec (the R4 release pins
  // its own FHIRHelpers version), so the emitted CQL keeps its version
  // pin. CRLPatterns, in contrast, is our own library — npm packaging IS
  // its version system, so we emit it without a `version '...'` clause.
  fhirHelpersVersion?: string;
  /**
   * Other CRL libraries this emit should `include` natively (`include Foo`
   * in the CQL header). Populated by `emitCQLImports` per-library based on
   * cross-library qualified refs the AST contains. Caller-controlled — the
   * emitter does NOT scan the AST itself.
   */
  crossLibraryIncludes?: string[];
  /**
   * v2.2 Todo 3 (issue #59) — cross-library parameter metadata for resolving
   * qualified refs to AST parameters in other libraries. Keyed by library
   * name (matching the qualifier string used in `arg.library` of a
   * `ConceptRefArg`) → parameter name → info. Populated by `emitCQLImports`
   * after the per-library AST scan + same-name concept shadow rule applied.
   * Single-file `emitCQL` callers leave this undefined; only the bare/self
   * dispatch through `astParameters` is needed in that mode.
   *
   * NOTE — the plan (R4-Δ1) called for keying by resolved `LibraryScope`
   * identity to disambiguate local-vs-package same-name. The actual map is
   * keyed by library NAME string, which is safe TODAY because:
   *   - Packages are excluded from the emit closure (`emit.ts:287`), so no
   *     package parameters ever land in this map — the only entries are
   *     local-origin libraries.
   *   - Two locals sharing a name already fire `registry-duplicate` before
   *     emit reaches this code path.
   * If Todo 4+ extends the map to include package-origin entries (e.g. for
   * cross-package context-rewrite), reshape this to key by `filePath` /
   * scope-resolved identity per R4-Δ1.
   */
  crossLibraryParameters?: Map<string, Map<string, AstParameterInfo>>;
}

/**
 * Issue #79 — Unmatched narrative pattern bookkeeping. Each entry records a
 * `- definition is <narrative>` body that fell through the template matcher.
 * The emitted CQL still contains a sentinel call (see emitDefinitionIs) so
 * downstream CQL compile fails loudly even if the caller ignores this array;
 * `EmitResult.success` is forced to `false` whenever any entry is present.
 */
export interface UnmatchedNarrative {
  text: string;
  line?: number;
  column?: number;
}

export interface EmitResult {
  success: boolean;
  result?: string;
  errors?: CRLError[];
  /**
   * Issue #79 — populated when one or more `- definition is …` bodies failed
   * to match a catalog pattern. When non-empty, `success` is `false` AND the
   * emitted `result` is still populated (with a compile-failing sentinel call
   * in each unmatched spot) so callers can inspect the partial output. Absent
   * field — never an empty array — means every narrative matched.
   */
  unmatched?: UnmatchedNarrative[];
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

// CQL simple identifier: starts with letter or underscore, then word chars.
// Library identifiers that match this can be emitted unquoted, EXCEPT when
// the name happens to be a CQL reserved word — those must be quoted to
// avoid parse errors (e.g. a library named "Context" would otherwise emit
// `library Context` and break the translator).
const SIMPLE_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// CQL reserved words that would parse as keywords if emitted unquoted as
// a library/include identifier. Conservatively quote when matched. Not an
// exhaustive list of CQL keywords — covers the ones a clinical library
// is plausibly named after.
const CQL_RESERVED = new Set([
  "and", "as", "asc", "ascending", "case", "cast", "code", "codesystem",
  "concept", "context", "convert", "default", "define", "desc", "descending",
  "display", "div", "during", "else", "end", "ends", "except", "exists",
  "expand", "false", "from", "function", "if", "in", "include", "includes",
  "interval", "intersect", "is", "let", "library", "list", "maximum", "meets",
  "minimum", "mod", "not", "null", "occurs", "of", "on", "or", "overlaps",
  "parameter", "private", "properly", "public", "return", "same", "start",
  "starts", "sort", "then", "this", "to", "true", "tuple", "union", "using",
  "valueset", "version", "when", "where", "width", "with", "within", "without",
  "year", "years", "month", "months", "week", "weeks", "day", "days", "hour",
  "hours", "minute", "minutes", "second", "seconds", "millisecond", "milliseconds",
]);

function cqlLibIdent(s: string): string {
  if (!SIMPLE_IDENT_RE.test(s)) return cqlIdent(s);
  if (CQL_RESERVED.has(s.toLowerCase())) return cqlIdent(s);
  return s;
}

/**
 * Emit a qualified CQL reference `Lib."Name"` (or `"Lib Name"."Name"` when
 * the library name needs quoting). Used wherever a CRL ref carries an
 * explicit library qualifier that doesn't match the current emit's
 * `options.libraryName`.
 */
function cqlQualifiedRef(libraryName: string, name: string): string {
  return `${cqlLibIdent(libraryName)}.${cqlIdent(name)}`;
}

function indent(text: string, level = 1): string {
  const pad = "  ".repeat(level);
  return text
    .split("\n")
    .map((l) => (l.length ? pad + l : l))
    .join("\n");
}

type CompositionShape = "boolean" | "refinement";

// === Pattern return-shape classification ===
// CRLPatterns library (v0.2.0+) returns the primitive list-shaped form for
// filter patterns. The boolean realization is composed at the call site by
// wrapping with `exists(...)`. The author's `(type, valuetype)` declaration
// drives whether the emitter wraps (boolean consumer) or calls directly
// (refinement consumer). Per the principle [[patterns-are-semantic]] +
// [[defined-as-is-semantic-composition]] + catalog v0.6.0 "What not How".
//
// "list"     — function returns List<Resource>; emitter wraps with
//              `exists(...)` for boolean consumers.
// "boolean"  — function returns Boolean (inherently a predicate);
//              refinement consumers get a FIXME comment.
// "instance" — function returns Instance<Resource> (singleton — e.g.
//              MostRecent/Last/Earliest/First); for refinement consumers
//              the emitter lifts to a singleton-list via `{...}`.
// "other"    — function returns Period/Quantity/Interval/DateTime;
//              author's valuetype should match, emitter just calls.
type PatternReturnShape = "list" | "boolean" | "instance" | "other";

const PATTERN_RETURN_SHAPE: Record<string, PatternReturnShape> = {
  // List-returning filter patterns (primitive form per v0.2.0 refactor).
  Has: "list",
  HasHistoryOf: "list",
  CurrentlyTaking: "list",
  HasAdverseReactionTo: "list",
  AsOf: "list",
  Within: "list",
  ComponentOf: "list",
  NotDoneWithReason: "list",
  BaselineAndFollowUp: "list",
  WasOrdered: "list",
  Justified: "list",
  Active: "list",
  IsVerified: "list",
  DocumentedAs: "list",
  During: "list",
  Overlaps: "list",
  OnDayOfOrAfter: "list",
  OnOrBefore: "list",
  SameDay: "list",
  BetweenAnchors: "list",
  WasPerformed: "list",

  // Inherently-boolean patterns (no meaningful list realization).
  Without: "boolean",
  With: "boolean",
  AtLeastApart: "boolean",
  AtMostApart: "boolean",
  AtLeastN: "boolean",
  Consecutive: "boolean",
  High: "boolean",
  Low: "boolean",
  Normal: "boolean",
  Abnormal: "boolean",
  AtLeast: "boolean",
  AtMost: "boolean",
  Between: "boolean",
  Exceeds: "boolean",
  Below: "boolean",

  // Instance-returning selection patterns (singleton resource).
  MostRecent: "instance",
  Last: "instance",
  LastOf: "instance",
  Earliest: "instance",
  First: "instance",
  FirstOf: "instance",

  // Other-shape patterns (Period, Quantity, Interval).
  InpatientStay: "other",
  BeforeStartOf: "other",
  AfterStartOf: "other",
  BeforeEndOf: "other",
  AfterEndOf: "other",
  OnDayOf: "other",
  AgeAt: "other",
  Calculate: "other",
  Lowest: "other",
  Highest: "other",
};

/**
 * v2.2 Todo 3 — CRL parameter type → CQL parameter type token.
 *
 * Patient and Practitioner are handled separately (`emitContext`) — they do
 * NOT produce a `parameter` line. This map covers types that emit as
 * ordinary `parameter "X" Type` declarations.
 *
 *   - Period → Interval<DateTime>: matches the CRLPatterns timing-arg
 *     signatures (`During(period Interval<DateTime>)` etc.). A CRL author
 *     writing `param type is Period.` is asking for the CQL Interval the
 *     patterns expect — not the FHIR `Period` resource datatype.
 *   - Primitives: PascalCase token per CQL 1.5 grammar.
 *   - FHIR data + resource types: passthrough — unqualified type names
 *     resolve via the library's `using FHIR version '4.0.1'` declaration.
 */
const CRL_PARAMETER_TYPE_TO_CQL: Record<string, string> = {
  // Primitives → PascalCase CQL primitive
  boolean: "Boolean",
  integer: "Integer",
  string: "String",
  date: "Date",
  dateTime: "DateTime",
  time: "Time",
  decimal: "Decimal",
  // Special: Period collapses to Interval<DateTime>
  Period: "Interval<DateTime>",
};

function cqlTypeForParameter(crlType: string): string {
  return CRL_PARAMETER_TYPE_TO_CQL[crlType] ?? crlType;
}

/**
 * Classify a `Parameter` AST node as either a CQL `context` declaration
 * (Patient/Practitioner) or an ordinary `parameter` line.
 *
 * Per operator's rule: every Patient-typed parameter — regardless of its
 * declared name — collapses into `context Patient`. The literal parameter
 * name does NOT survive into emitted CQL; references to a Patient-typed
 * parameter rewrite to the bare `Patient` identifier.
 */
export function infoForParameterStatement(stmt: Parameter): AstParameterInfo {
  if (stmt.parameterType === "Patient") {
    return { kind: "context", contextType: "Patient" };
  }
  if ((stmt.parameterType as string) === "Practitioner") {
    // Practitioner widening DEFERRED in Todo 3 — `parameterTypes.json`
    // currently rejects this at parse time. The branch is future-proofing
    // so the emitter is correct the moment the lexer allowlist widens.
    return { kind: "context", contextType: "Practitioner" };
  }
  return { kind: "parameter", cqlType: cqlTypeForParameter(stmt.parameterType) };
}

export function emitCQLFromAST(ast: CRL, options: EmitOptions = {}): EmitResult {
  try {
    const emitter = new Emitter(ast, options);
    const out = emitter.emit();
    const unmatched = emitter.getUnmatched();
    if (unmatched.length > 0) {
      // Issue #79 — at least one `- definition is …` body fell through the
      // template matcher. The emitted `result` is still populated (with a
      // compile-failing sentinel call per unmatched spot) so callers can
      // inspect partial output, but `success` is forced to `false` and the
      // unmatched diagnostics are mirrored into `errors[]` as Validation
      // entries keyed by `kind: "emit-unmatched-narrative"`.
      const errors: CRLError[] = unmatched.map((u) => ({
        type: "Validation",
        kind: "emit-unmatched-narrative",
        line: u.line,
        column: u.column,
        message: `Unmatched narrative pattern: \`${u.text}\` (no catalog pattern matched). Emitted CQL contains a compile-failing CRLPatterns.UnmatchedNarrative(…) sentinel; downstream CQL translation will fail until the body is rewritten to a known canonical narrative.`,
      }));
      return { success: false, result: out, errors, unmatched };
    }
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

export function emitCQL(input: string, options: EmitOptions = {}): EmitResult {
  const parsed = buildCRL(input);
  if (!parsed.success || !parsed.result) {
    return { success: false, errors: parsed.errors };
  }
  return emitCQLFromAST(parsed.result, options);
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
  /** For defined-as concepts, the body so we can recurse for shape. */
  private readonly conceptBody: Map<string, ConceptDefinition> = new Map();
  /** Terminology emit name (may differ from CRL name when disambiguated). */
  private readonly terminologyEmitName: Map<string, string> = new Map();
  /**
   * Names of CRL declarations to SKIP emitting. Currently only collisions
   * fold into the emit pipeline through this set — kept as a Set rather
   * than an inline filter so future SKIP cases (cross-library shadowing,
   * deprecation markers) plug in here.
   */
  private readonly skipNames: Set<string> = new Set();
  /**
   * v2.2 Todo 3 (issue #59) — indexed AST `Parameter` declarations. Populated
   * by `indexNames`'s second pass; respects the same-name-concept shadow
   * rule (parameter skipped if a concept of the same name exists). Drives
   * both `emitContext` (Patient/Practitioner) and `emitParameters` (ordinary
   * parameter lines). See [[038-v2.2.0-parameters-todo3-emitter]] R3-Δ1.
   */
  private readonly astParameters: Map<string, AstParameterInfo> = new Map();
  /**
   * Issue #79 — narratives that fell through the template matcher during
   * `emitDefinitionIs`. Each entry's `text` is the joined narrative; the
   * location pins the source span. Surfaced via the `EmitResult.unmatched`
   * field and as `kind: "emit-unmatched-narrative"` validation errors in
   * `EmitResult.errors` (see `emitCQLFromAST`). The CQL string itself
   * contains a compile-failing sentinel call at each spot.
   */
  private readonly unmatchedNarratives: UnmatchedNarrative[] = [];

  constructor(ast: CRL, options: EmitOptions) {
    this.ast = ast;
    this.options = {
      libraryName: options.libraryName ?? ast.library.name,
      fhirHelpersVersion: options.fhirHelpersVersion ?? "4.0.1",
      crossLibraryIncludes: options.crossLibraryIncludes ?? [],
      crossLibraryParameters: options.crossLibraryParameters ?? new Map(),
    };
    this.indexNames();
    this.detectCollisions();
  }

  /**
   * First pass: index every declaration name + kind.
   *
   * Two-pass over `ast.statements`:
   *   - Pass A: Concept + Terminology. Populates `conceptNames` +
   *     `terminologyNames` so pass B can shadow-check.
   *   - Pass B: Parameter. Per R3-Δ1, an AST parameter whose name collides
   *     with a concept is NOT added to `astParameters` at all (the concept
   *     wins narrative-ref precedence; the parameter is silently shadowed).
   *
   * The single-pass form would depend on Concept-before-Parameter source
   * order, which the corpus follows but the grammar doesn't promise.
   */
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
    for (const stmt of this.ast.statements) {
      if (stmt.type !== "Parameter" || !stmt.name) continue;
      // Concept-first shadow: validator allows concept "X" + parameter "X"
      // to coexist; narrative-ref precedence resolves to the concept, so
      // the parameter is effectively unused in CQL. Skip it at index time
      // so `emitContext` and `emitParameters` never see the shadowed entry.
      if (this.conceptNames.has(stmt.name)) continue;
      this.astParameters.set(stmt.name, infoForParameterStatement(stmt));
    }
  }

  /**
   * Second pass: resolve terminology emit names — when a terminology name
   * collides with a concept OR an AST parameter of the same name (both
   * produce CQL top-level identifiers `define X` / `parameter X`), the
   * terminology gets the " ValueSet" / " Code" disambiguating suffix.
   */
  private detectCollisions(): void {
    for (const stmt of this.ast.statements) {
      if (stmt.type !== "Terminology" || !stmt.name) continue;
      if (this.conceptNames.has(stmt.name) || this.astParameters.has(stmt.name)) {
        const suffix = hasOnlyValueset(stmt) ? " ValueSet" : " Code";
        this.terminologyEmitName.set(stmt.name, stmt.name + suffix);
      } else {
        this.terminologyEmitName.set(stmt.name, stmt.name);
      }
    }
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

    sections.push(this.emitContext());

    const concepts = this.ast.statements
      .filter((s): s is Concept => s.type === "Concept" && !!s.name)
      .filter((c) => !this.skipNames.has(c.name));
    if (concepts.length > 0) {
      sections.push(this.emitConcepts(concepts));
    }
    return sections.join("\n\n") + "\n";
  }

  /** Issue #79 — unmatched narratives accumulated during this emit. */
  getUnmatched(): UnmatchedNarrative[] {
    return this.unmatchedNarratives;
  }

  private header(): string {
    const lines: string[] = [
      // CRL's library identity emits without a version (npm packaging
      // handles the package version). CRLPatterns is our own library —
      // also no version. `using FHIR version` is a semantic FHIR model
      // identifier (R4 vs R5 is a different shape) — kept. FHIRHelpers
      // ships versioned with the FHIR spec — version pin kept.
      `library ${cqlLibIdent(this.options.libraryName ?? "GeneratedFromCRL")}`,
      "",
      "using FHIR version '4.0.1'",
      "",
      `include FHIRHelpers version '${this.options.fhirHelpersVersion}' called FHIRHelpers`,
      "include CRLPatterns called CRLPatterns",
    ];
    // Cross-library includes for per-CRL emit: every other CRL library this
    // file qualified-refs gets its own `include` line. Simple include (no
    // `called` alias) so qualified refs can use the natural `Lib."X"` form.
    for (const otherLib of this.options.crossLibraryIncludes ?? []) {
      lines.push(`include ${cqlLibIdent(otherLib)}`);
    }
    return lines.join("\n");
  }

  /**
   * Decide if a ref's library qualifier should produce a cross-library
   * CQL emit. Returns null for self-refs (qualifier matches current
   * library) and bare refs. Returns the qualifier string for cross-lib refs.
   */
  private crossLibraryOf(ref: ReferenceName): string | null {
    if (!isQualifiedRef(ref)) return null;
    const lib = getRefLibrary(ref);
    if (lib === null) return null;
    if (lib === this.options.libraryName) return null;
    return lib;
  }

  /**
   * Emit `parameter "Name" Type` lines for each AST `Parameter` node with
   * `kind: "parameter"`. Patient/Practitioner-typed AST parameters land in
   * `emitContext` instead. No default clause — runtime callers supply
   * values explicitly. Returns empty string when no ordinary parameters
   * are declared.
   */
  private emitParameters(): string {
    const lines: string[] = [];
    for (const [name, info] of this.astParameters) {
      if (info.kind !== "parameter") continue;
      lines.push(`parameter ${cqlIdent(name)} ${info.cqlType}`);
    }
    if (lines.length === 0) return "";
    return lines.join("\n");
  }

  /**
   * Emit the CQL `context` line. Defaults to `context Patient`; promotes to
   * `context Practitioner` when any AST parameter declares `param type is
   * Practitioner.` (operator's rule: Practitioner takes precedence).
   *
   * When both Patient AND Practitioner-typed parameters coexist (currently
   * undetected by the validator), a `// FIXME` comment lands above the
   * chosen `context` line so the divergence is visible in the generated CQL.
   * A hardening validator diagnostic is tracked for a follow-up.
   */
  private emitContext(): string {
    let hasPatient = false;
    let hasPractitioner = false;
    for (const info of this.astParameters.values()) {
      if (info.kind !== "context") continue;
      if (info.contextType === "Patient") hasPatient = true;
      else if (info.contextType === "Practitioner") hasPractitioner = true;
    }
    const chosen = hasPractitioner ? "Practitioner" : "Patient";
    if (hasPatient && hasPractitioner) {
      return `// FIXME: multiple context-typed parameters declared; emitted as ${chosen}\ncontext ${chosen}`;
    }
    return `context ${chosen}`;
  }

  /**
   * Look up a `ConceptRefArg` (possibly qualified) against the parameter
   * indexes. Returns context-rewrite info when the ref resolves to a
   * `kind: "context"` AST parameter — bare local, qualified self-ref, or
   * qualified cross-library — so `emitArg` can emit the CQL context type
   * (`Patient` / `Practitioner`) in place of the literal name.
   *
   * Dispatch (per R4-Δ1):
   *   - Bare ref OR qualified self-ref → consult internal `astParameters`.
   *   - Foreign qualified ref → consult `EmitOptions.crossLibraryParameters`
   *     keyed by the qualifier string.
   */
  private lookupContextParameter(
    library: string | undefined,
    name: string,
  ): { contextType: "Patient" | "Practitioner" } | null {
    if (library === undefined || library === this.options.libraryName) {
      const info = this.astParameters.get(name);
      if (info && info.kind === "context") return { contextType: info.contextType };
      return null;
    }
    const targetMap = this.options.crossLibraryParameters.get(library);
    if (!targetMap) return null;
    const info = targetMap.get(name);
    if (info && info.kind === "context") return { contextType: info.contextType };
    return null;
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
      case "DefinedAsDefinition":
        return this.emitDefinedAs(c, def.body);
      case "DefinitionIsDefinition":
        return this.emitDefinitionIs(c, def);
    }
  }

  private emitCodedFrom(c: Concept, def: CodedFromDefinition): string {
    const resource = c.conceptType ?? "Observation";
    const crossLib = this.crossLibraryOf(def.terminologyName);
    const termName = getRefName(def.terminologyName);
    if (crossLib !== null) {
      // Cross-library terminology ref: emit `[Resource: Lib."Term"]`. No
      // collision suffix — the other library owns its terminology naming.
      return `[${resource}: ${cqlQualifiedRef(crossLib, termName)}]`;
    }
    if (!this.terminologyNames.has(termName)) {
      // v2.2 Todo 3 (issue #59) — if the unresolved name is shadowed by an
      // AST parameter, surface that in the FIXME so the author isn't sent
      // chasing a missing terminology that was actually a parameter ref in
      // the wrong slot.
      if (this.astParameters.has(termName)) {
        return `// FIXME: ${cqlIdent(termName)} is a parameter, not a terminology\n[${resource}: ${cqlIdent(termName)}]`;
      }
      return `// FIXME: unresolved terminology ${cqlIdent(termName)}\n[${resource}: ${cqlIdent(termName)}]`;
    }
    const refName = this.terminologyEmitName.get(termName) ?? termName;
    return `[${resource}: ${cqlIdent(refName)}]`;
  }

  /**
   * Determine the AUTHOR's declared shape for a concept — boolean vs
   * refinement. Per the principle [[defined-as-is-semantic-composition]],
   * the author declares `(type, valuetype)`; the emitter delivers that
   * shape. The body kind says WHAT operation; the declaration says WHAT
   * the operation produces. Catalog patterns have NO return types; they
   * are semantic expressions whose CQL realization shape is decided by
   * the author's declaration.
   *
   *   - `value type is boolean` → boolean (predicate)
   *   - otherwise              → refinement (list of declared `type`)
   *
   * For names that don't resolve to a known concept (e.g., raw
   * terminology refs that escape into the composition), we fall back to
   * refinement.
   */
  private declaredShape(name: string): CompositionShape {
    if (!this.conceptNames.has(name)) {
      // Unknown ref — treat as refinement (the safer default for downstream).
      return "refinement";
    }
    const valuetype = this.conceptValuetype.get(name);
    if (valuetype === "boolean") return "boolean";
    return "refinement";
  }

  private declaredShapeOfConcept(c: Concept): CompositionShape {
    if (c.valueTypes?.includes("boolean")) return "boolean";
    return "refinement";
  }

  /**
   * Determine the shape to use for a composition expression FROM ITS
   * PARENT's perspective. The parent concept's declared
   * `(type, valuetype)` is authoritative — operands of a composition
   * are bridged to match. This replaces the v0.2 leaf-walking heuristic
   * which contradicted the principle.
   */
  private shapeForComposition(parent: Concept, _expr: CompositionExpression): CompositionShape {
    return this.declaredShapeOfConcept(parent);
  }

  private emitDefinedAs(
    c: Concept,
    body: DefinedAsBareRef | DefinedAsComposition
  ): string {
    if (body.type === "DefinedAsBareRef") {
      const crossLib = this.crossLibraryOf(body.ref);
      const refName = getRefName(body.ref);
      if (crossLib !== null) {
        return cqlQualifiedRef(crossLib, refName);
      }
      return cqlIdent(refName);
    }
    const shape = this.shapeForComposition(c, body.expression);
    return this.emitComposition(body.expression, shape);
  }

  /**
   * Wrap an operand's emission to match the PARENT composition's declared
   * shape. The principle: each operand may have its own declared shape
   * (boolean or refinement); the emitter BRIDGES to deliver the parent's
   * shape. Bridging rules:
   *   - operand boolean, parent boolean: emit as-is
   *   - operand refinement, parent refinement: emit as-is
   *   - operand refinement, parent boolean: wrap with `exists (...)`
   *   - operand boolean, parent refinement: unrepresentable in general (a
   *     boolean isn't a list); emit FIXME + raw operand. This case is
   *     rare in the corpus.
   */
  private bridgeOperand(operandCql: string, operandShape: CompositionShape, parentShape: CompositionShape): string {
    if (operandShape === parentShape) return operandCql;
    if (parentShape === "boolean" && operandShape === "refinement") {
      return `exists (${operandCql})`;
    }
    // operandShape === 'boolean' && parentShape === 'refinement'
    return `/* FIXME: boolean operand in refinement composition */ ${operandCql}`;
  }

  private emitComposition(
    expr: CompositionExpression,
    shape: CompositionShape
  ): string {
    switch (expr.type) {
      case "CompositionRef": {
        const crossLib = this.crossLibraryOf(expr.ref);
        const refName = getRefName(expr.ref);
        if (crossLib !== null) {
          // Cross-library composition ref: emit `Lib."Name"`. Operand
          // shape is unknown without cross-library scope info; default to
          // "refinement" (the existing fallback for unknown names).
          return this.bridgeOperand(cqlQualifiedRef(crossLib, refName), "refinement", shape);
        }
        const operandShape = this.declaredShape(refName);
        return this.bridgeOperand(cqlIdent(refName), operandShape, shape);
      }
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

  private emitDefinitionIs(c: Concept, def: DefinitionIsDefinition): string {
    const matched = matchNarrative(def.body);
    if (!matched.known) {
      const text = def.body.elements.map((el) => narrativeElementText(el)).join(" ");
      this.unmatchedNarratives.push({
        text,
        line: def.body.location?.start.line,
        column: def.body.location?.start.column,
      });
      // Issue #79 — compile-failing sentinel. `CRLPatterns.UnmatchedNarrative`
      // is intentionally undefined in CRLPatterns.cql so a downstream CQL
      // compile fails loudly rather than silently shipping always-`true`. The
      // EmitResult.unmatched envelope field is the primary signal; this
      // sentinel is the operational safety net for callers that miss it.
      return `// FIXME: unmatched narrative pattern — ${text}\nCRLPatterns.UnmatchedNarrative(${cqlString(text)})`;
    }
    // Generics-by-composition: CRLPatterns functions return their PRIMITIVE
    // shape — list-shaped for filter patterns, boolean for inherently-boolean
    // patterns, other-shape for Period/Quantity/Instance/Interval patterns.
    // The author's declared `(type, valuetype)` says what the consumer wants;
    // the emitter composes via `exists(...)` wrapping when consumer asks for
    // boolean and pattern returns a list. Per [[patterns-are-semantic]].
    const call = this.emitPatternCall(matched);
    const declared = this.declaredShapeOfConcept(c);
    const patternShape: PatternReturnShape = PATTERN_RETURN_SHAPE[matched.pattern] ?? "list";

    if (declared === "boolean" && patternShape === "list") {
      return `exists ${call}`;
    }
    if (declared === "refinement" && patternShape === "boolean") {
      return `// FIXME: ${matched.pattern} is inherently boolean; refinement consumer cannot use it as a list\n${call}`;
    }
    if (declared === "refinement" && patternShape === "instance") {
      // Selection pattern returns a singleton resource; author declared
      // refinement (list). Lift to a singleton-list via CQL list literal.
      return `{ ${call} }`;
    }
    if (declared === "boolean" && patternShape === "instance") {
      return `exists { ${call} }`;
    }
    // All other combinations: declared matches pattern shape (or pattern is
    // "other"-shaped and the author chose a matching valuetype).
    return call;
  }

  private emitPatternCall(call: CanonicalPatternCall): string {
    // Synthetic patterns (not catalog entries — they represent CQL keyword
    // operators) emit as CQL syntax instead of CRLPatterns calls.
    if (call.pattern === "StartOf") {
      return `start of ${this.emitArg(call.args[0])}`;
    }
    if (call.pattern === "EndOf") {
      return `end of ${this.emitArg(call.args[0])}`;
    }
    const fn = functionNameFor(call.pattern);
    const args = call.args.map((a) => this.emitArg(a)).join(", ");
    return `CRLPatterns.${fn}(${args})`;
  }


  private emitArg(arg: CanonicalArg): string {
    switch (arg.type) {
      case "ConceptRefArg": {
        // v2.2 Todo 3 (issue #59) — Patient/Practitioner-typed AST
        // parameter refs rewrite to the bare CQL context type. Applies to
        // bare local, qualified self, AND qualified cross-library refs.
        // Per operator: "ALL concepts that reference that parameter should
        // use that Patient context (per the CQL spec)."
        const ctx = this.lookupContextParameter(arg.library, arg.value);
        if (ctx) return ctx.contextType;
        if (arg.library && arg.library !== this.options.libraryName) {
          return cqlQualifiedRef(arg.library, arg.value);
        }
        return cqlIdent(arg.value);
      }
      case "QuantityArg":
        return arg.unit ? `${arg.value} ${cqlString(arg.unit)}` : `${arg.value}`;
      case "EnumArg":
        return cqlString(arg.value);
      case "DisjunctionArg":
        // When all disjuncts are concept refs (each resolving to a
        // List<Resource>), emit with `union` so the result is a flattened
        // List<Resource>, not a List<List<Resource>>. For non-concept
        // disjuncts (quantities, enums), keep CQL list-literal form.
        if (arg.disjuncts.every((d) => d.type === "ConceptRefArg")) {
          return `(${arg.disjuncts.map((d) => this.emitArg(d)).join(" union ")})`;
        }
        return `{ ${arg.disjuncts.map((d) => this.emitArg(d)).join(", ")} }`;
      case "ConjunctionArg":
        // Mirror DisjunctionArg: for concept-ref conjuncts, use `intersect`
        // to produce a flattened List<Resource> instead of List<List>.
        if (arg.conjuncts.every((c) => c.type === "ConceptRefArg")) {
          return `(${arg.conjuncts.map((c) => this.emitArg(c)).join(" intersect ")})`;
        }
        return `{ ${arg.conjuncts.map((c) => this.emitArg(c)).join(", ")} }`;
      case "NestedPatternArg":
        return this.emitPatternCall(arg.pattern);
    }
  }
}

/** Walk a composition expression and collect every CompositionRef name. */
function collectRefs(expr: CompositionExpression, out: string[]): void {
  switch (expr.type) {
    case "CompositionRef":
      out.push(getRefName(expr.ref));
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
