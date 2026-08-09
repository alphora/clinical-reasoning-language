import {
  normalizeLocalRef,
  type CRL,
  type Concept,
  type Representation,
  type ValueElement,
  type NarrativeElement,
  type Location,
} from "../ast/types";
import type { SourceContext } from "../imports/scopes";

import type { RepresentationShapeError, RepresentationShapeRule, ValidationError } from "./validator";

// concept-model redesign Todo 2 — the STATIC "checked" layer for a concept's representations.
// Todo 1 shipped a PERMISSIVE grammar superset: posreps, `value element is`, rep-level
// `definition is` PROJECTORs, and `defined as exists` all PARSE and BUILD but were unchecked.
// This validator makes the malformed forms a TEACHING validate error. It does NOT do per-rep
// CEL conformance (the "does this rep's instance satisfy its retrieve" check) — that is the
// INDEPENDENT-evaluator work of Todo 3, which owns the fixture producer it cross-checks against.
//
// Rules (see tmp/representation-model.md §"Shape rules" + disc 395):
//   A.1 incomplete-representation      — a posrep must carry `type` + `value element` + `value
//                                        type` (a posrep is ALWAYS fully explicit; `coded from`
//                                        stays optional — refinement 4/5)
//   A.2 value-element-invalid          — a `value element` path is single-segment, or its
//                                        leading segment disagrees with the rep's `type`
//   A.3 value-element-without-code     — a concept-level (local-rep) `value element` with no
//                                        local `code is` (describes a non-existent local rep)
//   A.5 projector-misattachment        — a rep-level `definition is` PROJECTOR narrative
//                                        carrying a concept ref (a concept-level definition the
//                                        whitespace-insensitive grammar bound into the posrep)
//   A.6 duplicate-representation-key    — two reps (local + posreps) share the structural key
//                                        `{type, value element, coding-source}` (refinement 4)
//   A.8 definition-is-exists-misuse    — a `definition is exists (...)` (existence is a
//                                        `defined as` operator, not `definition is`)
//   A.9 multiple-value-types           — >1 `value type` on one concept or posrep
//
// NOT here (deliberate):
//   - `x + n ≥ 1` ("at least one producer", #202) is ALREADY enforced at build time
//     (ast/builder.ts — a concept with no code/posrep/defined-as/definition-is/coded-from is
//     an AstError). Todo 2 adds nothing there; `value type`-REQUIRED is Todo 4 (the migration).
//   - "a local rep deviating from Observation must author an explicit value element" was
//     considered and DROPPED: 35 corpus `code is` concepts are non-Observation PRESENCE
//     determinations (Condition/MedicationRequest/Device) with no value path, so the rule is
//     incorrect. Distinguishing value-reading from presence needs the value-type/model-info
//     semantics that land with Todo 3 conformance.
//   - the concept-level `coded from` lane (a base `coded from` ALONGSIDE `code is`, still built
//     as a `CodedFromDefinition`) is a PRE-redesign asserted form the v3 composition has no slot
//     for. Todo 2 does NOT reason about it (A.3/A.6 ignore it); its migration into a
//     `source representation:` (or removal) is Todo 4 kit-migration work. No new content authors
//     it; the two fixtures that do are pre-redesign (representation-edge-cases, mammogram-and-bmi).

/** Source attribution for a diagnostic (multi-file mode). */
interface Attribution {
  libraryName?: string;
  filePath?: string;
}

const IMPLICIT_LOCAL_TYPE = "Observation";
const IMPLICIT_LOCAL_ELEMENT = "Observation.value";

export class RepresentationShapeValidator {
  public validate(ast: CRL, sources?: SourceContext[]): ValidationError[] {
    const errors: ValidationError[] = [];
    if (sources) {
      // Multi-file mode: walk each statement with its owning scope so the diagnostic carries
      // libraryName/filePath (else an error in a sibling library squiggles the wrong file).
      for (const { stmt, scope } of sources) {
        if (stmt.type === "Concept") {
          this.checkConcept(
            stmt,
            { libraryName: scope.currentLibrary, filePath: scope.filePath },
            scope.currentLibrary,
            errors,
          );
        }
      }
    } else {
      // Single-file: the owning library (for self-qualified coded-from normalization in A.6)
      // is the lone `ast.library`; attribution stays empty (single-file diagnostics need no
      // libraryName, matching the other validators).
      const ownLibrary = ast.library?.name;
      for (const stmt of ast.statements) {
        if (stmt.type === "Concept") this.checkConcept(stmt, {}, ownLibrary, errors);
      }
    }
    return errors;
  }

  private err(
    rule: RepresentationShapeRule,
    conceptName: string,
    message: string,
    location: Location,
    attribution: Attribution,
  ): RepresentationShapeError {
    return {
      kind: "representation-shape",
      rule,
      conceptName,
      message,
      location,
      severity: "error",
      ...(attribution.libraryName ? { libraryName: attribution.libraryName } : {}),
      ...(attribution.filePath ? { filePath: attribution.filePath } : {}),
    };
  }

  private checkConcept(
    concept: Concept,
    attribution: Attribution,
    ownLibrary: string | undefined,
    errors: ValidationError[],
  ): void {
    // The builder always sets `valueTypes` + `representations` (arrays); guard `?? []` only
    // for hand-constructed partial-AST test inputs that omit them.
    const valueTypes = concept.valueTypes ?? [];
    const representations = concept.representations ?? [];

    // A.9 — >1 value type on the concept (the canonical result shape is singular).
    if (valueTypes.length > 1) {
      errors.push(
        this.err(
          "multiple-value-types",
          concept.name,
          `Concept "${concept.name}" declares ${valueTypes.length} value types ` +
            `(${valueTypes.join(", ")}). A concept has exactly one \`value type\` — its ` +
            `single canonical result shape. Keep one and remove the rest.`,
          concept.location,
          attribution,
        ),
      );
    }

    // A.3 — concept-level (local-rep) `value element` with no local `code is`. The concept-level
    // value element describes the LOCAL representation, which exists only when a `code is` is
    // present; without one it describes a representation that isn't there.
    if (concept.valueElement && concept.code === undefined) {
      errors.push(
        this.err(
          "value-element-without-code",
          concept.name,
          `Concept "${concept.name}" declares \`value element is ${concept.valueElement.path}\` ` +
            `but has no local \`code is\`. A concept-level value element describes the LOCAL ` +
            `representation, which only exists with a \`code is\`. Add a \`code is\`, or (if this ` +
            `is a computed/grouping concept) remove the value element and keep \`value type\` only.`,
          concept.valueElement.location,
          attribution,
        ),
      );
    }

    // A.2 — the concept-level value element's path shape, checked against the implicit-standard
    // local type (`Observation` unless the concept declares otherwise). `typeIsImplicit` lets the
    // diagnostic say "the implicit local type, Observation" so the author isn't left hunting for a
    // `type is` line they never wrote (refinement 7).
    if (concept.valueElement) {
      this.checkValueElementPath(
        concept.valueElement,
        concept.conceptType ?? IMPLICIT_LOCAL_TYPE,
        concept.conceptType === undefined,
        concept.name,
        attribution,
        errors,
      );
    }

    // A.8 — a leading-`exists` misuse. Existence is a `defined as` operator, not a `definition
    // is` calculation. The grammar discards the parentheses, so `exists ("X")` and `exists "X"`
    // both build as [NWord "exists", NConceptRef "X"], and `exists ("A" or "B")` as [NWord
    // "exists", NDisjunction] — the rule fires when a `definition is` narrative LEADS with the
    // word `exists` immediately followed by a ref or a parenthesized group. An ORDINARY narrative
    // that merely contains the word ("`"Weight" exists today`") leads with the ref, not `exists`,
    // so it is not flagged (see the negative test). NOTE: this is "leading exists + ref/group",
    // NOT a parens-precise match — the AST cannot distinguish `exists "X"` from `exists ("X")`.
    if (concept.definition?.type === "DefinitionIsDefinition") {
      const els = concept.definition.body.elements;
      const second = els[1]?.type;
      if (
        els.length >= 2 &&
        els[0].type === "NWord" &&
        els[0].value === "exists" &&
        (second === "NConceptRef" || second === "NDisjunction" || second === "NConjunction")
      ) {
        const grouped = second !== "NConceptRef";
        errors.push(
          this.err(
            "definition-is-exists-misuse",
            concept.name,
            `Concept "${concept.name}": \`definition is exists (...)\` — existence is an operator ` +
              `of \`defined as\`, not \`definition is\`. Use \`defined as exists ( "Concept" )\`` +
              (grouped
                ? ` over a SINGLE concept (promote the group first — e.g. a \`defined as ( … sem-or … )\` ` +
                  `concept — then \`defined as exists\` that).`
                : `.`),
            concept.definition.body.location,
            attribution,
          ),
        );
      }
    }

    // A.1 / A.2 / A.5 — per-posrep checks.
    for (const rep of representations) {
      this.checkPosrep(rep, concept, attribution, errors);
    }

    // A.6 — duplicate structural key across the local rep + every complete posrep.
    this.checkDuplicateKeys(concept, representations, ownLibrary, attribution, errors);
  }

  private checkPosrep(
    rep: Representation,
    concept: Concept,
    attribution: Attribution,
    errors: ValidationError[],
  ): void {
    const repValueTypes = rep.valueTypes ?? [];
    // A.9 — >1 value type on the posrep.
    if (repValueTypes.length > 1) {
      errors.push(
        this.err(
          "multiple-value-types",
          concept.name,
          `Concept "${concept.name}": a source representation declares ${repValueTypes.length} ` +
            `value types (${repValueTypes.join(", ")}). A representation has exactly one ` +
            `\`value type\`. Keep one and remove the rest.`,
          rep.location,
          attribution,
        ),
      );
    }

    // A.1 — posrep completeness. A source representation is ALWAYS fully explicit: `type` +
    // `value element` + `value type`. `coded from` stays optional (Patient/birthDate has none).
    const missing: string[] = [];
    if (!rep.conceptType) missing.push("type");
    if (!rep.valueElement) missing.push("value element");
    if (repValueTypes.length === 0) missing.push("value type");
    if (missing.length > 0) {
      errors.push(
        this.err(
          "incomplete-representation",
          concept.name,
          `Concept "${concept.name}": a source representation is missing ` +
            `${missing.map((m) => `\`${m}\``).join(" + ")}. A source representation is fully ` +
            `explicit — it must carry \`type is <Resource>.\`, ` +
            `\`value element is <Resource>.<path>.\`, and \`value type is <Type>.\` ` +
            `(\`coded from\` is optional). It does NOT inherit the concept's fields.`,
          rep.location,
          attribution,
        ),
      );
    }

    // A.2 — the posrep value element's path shape (checked against its own `type` when present;
    // a posrep never uses an implicit type — a missing type is A.1's job).
    if (rep.valueElement) {
      this.checkValueElementPath(
        rep.valueElement,
        rep.conceptType,
        false,
        concept.name,
        attribution,
        errors,
      );
    }

    // A.5 — projector misattachment. A rep-level `definition is` PROJECTOR projects THIS rep's
    // datum to the canonical shape; operating over other named declarations is exclusively the
    // concept-level derived slot. A narrative ref (`NConceptRef`) anywhere in the projector is a
    // concept-level `definition is` the whitespace-insensitive grammar bound into the posrep. The
    // ref resolves to a concept OR a parameter (referenceResolver narrative slots) — EITHER is a
    // misattachment (a projector is datum-local), so the message names both; scope-aware
    // concept-vs-parameter discrimination is not needed here to make the call.
    if (rep.projector && narrativeHasConceptRef(rep.projector.body.elements)) {
      errors.push(
        this.err(
          "projector-misattachment",
          concept.name,
          `Concept "${concept.name}": a source-representation projector (\`definition is …\` ` +
            `inside a \`source representation:\`) references another concept or parameter, but a ` +
            `projector computes over THIS representation's datum only. If this is a concept-level ` +
            `calculation, move the \`definition is …\` line ABOVE \`source representation:\` so it ` +
            `applies to the concept.`,
          rep.projector.body.location,
          attribution,
        ),
      );
    }
  }

  // A.2 — a value element path must be multi-segment (`Resource.path`) and its leading segment
  // must equal the rep's `type`. Deep FHIR model-info property existence (does `Observation.value`
  // exist on Observation) is Todo 3 conformance; this is the cheap static string check the
  // Todo-1 AST comment reserves `ValueElement.location` for.
  private checkValueElementPath(
    ve: ValueElement,
    repType: string | undefined,
    typeIsImplicit: boolean,
    conceptName: string,
    attribution: Attribution,
    errors: ValidationError[],
  ): void {
    if (!ve.path.includes(".")) {
      errors.push(
        this.err(
          "value-element-invalid",
          conceptName,
          `Concept "${conceptName}": value element \`${ve.path}\` is a single segment. A value ` +
            `element is a resource path — write \`<Resource>.<element>\` ` +
            `(e.g. \`Observation.value\`, \`Patient.birthDate\`).`,
          ve.location,
          attribution,
        ),
      );
      return; // root check is meaningless without a resource segment
    }
    const root = ve.path.slice(0, ve.path.indexOf("."));
    if (repType && root !== repType) {
      const typeDesc = typeIsImplicit ? `the implicit local type \`${repType}\`` : `type \`${repType}\``;
      errors.push(
        this.err(
          "value-element-invalid",
          conceptName,
          `Concept "${conceptName}": value element \`${ve.path}\` is not on ${typeDesc} ` +
            `(its path starts at \`${root}\`). The value element must be a path on the ` +
            `representation's own \`type\` — either fix the path root or ` +
            (typeIsImplicit ? `add a \`type is ${root}\`.` : `the \`type\`.`),
          ve.location,
          attribution,
        ),
      );
    }
  }

  // A.6 — reject two representations that share the structural key `{type, value element,
  // coding-source}` (refinement 4: coding-source = ∅ when uncoded; the projector is EXCLUDED
  // from the key). The local rep participates (keyed by its local code); a posrep too incomplete
  // to have a type + value element is skipped here (A.1 already flags it). A shared key means
  // "the same representation" — which also makes Todo 3's fact→rep bridge ambiguous.
  private checkDuplicateKeys(
    concept: Concept,
    representations: readonly Representation[],
    ownLibrary: string | undefined,
    attribution: Attribution,
    errors: ValidationError[],
  ): void {
    const seen = new Map<string, Location>();
    const consider = (key: string, loc: Location): void => {
      if (seen.has(key)) {
        errors.push(
          this.err(
            "duplicate-representation-key",
            concept.name,
            `Concept "${concept.name}": two representations share the structural key ` +
              `${key}. Representations are identified by \`{type, value element, coding-source}\` ` +
              `(the projector is not part of the key) — an equal key means the same ` +
              `representation. Merge them, or make the type / value element / coded-from differ.`,
            loc,
            attribution,
          ),
        );
      } else {
        seen.set(key, loc);
      }
    };

    // Local rep — present iff the concept has a `code is`. Keyed by its local code so it never
    // collides with an externally-coded posrep. The element is the explicit value element, else
    // the implicit `.value` ONLY when the type is the implicit-standard Observation; a deviating
    // type (e.g. a Condition presence concept, the A.4-drop population) keys with element `∅`
    // rather than a bogus `Observation.value` — this key becomes Todo 3's emit/fact-bridge
    // selector, where a wrong element would matter.
    if (concept.code !== undefined) {
      const type = concept.conceptType ?? IMPLICIT_LOCAL_TYPE;
      const element =
        concept.valueElement?.path ?? (type === IMPLICIT_LOCAL_TYPE ? IMPLICIT_LOCAL_ELEMENT : "∅");
      consider(structuralKey(type, element, `local:${concept.code}`), concept.location);
    }

    for (const rep of representations) {
      // Only complete-enough posreps have a key; incomplete ones are A.1's job.
      if (!rep.conceptType || !rep.valueElement) continue;
      // Normalize the coded-from ref so a self-qualified `"ThisLib"."VS"` keys identically to the
      // bare `"VS"` (they resolve to the same terminology) — else an equivalent duplicate is
      // missed. `∅` when uncoded (refinement 4).
      const codingSource = rep.terminologyName
        ? `vs:${refName(normalizeLocalRef(rep.terminologyName, ownLibrary ?? ""))}`
        : "∅";
      consider(structuralKey(rep.conceptType, rep.valueElement.path, codingSource), rep.location);
    }
  }
}

function structuralKey(type: string, element: string, codingSource: string): string {
  return `{type=${type}, value element=${element}, coding-source=${codingSource}}`;
}

function refName(ref: Representation["terminologyName"]): string {
  if (ref === undefined) return "";
  return typeof ref === "string" ? ref : `${ref.libraryName}.${ref.name}`;
}

// A.5 helper — is there an `NConceptRef` anywhere in a narrative element stream (including
// nested inside disjunction/conjunction argument groups)?
function narrativeHasConceptRef(elements: readonly NarrativeElement[]): boolean {
  for (const el of elements) {
    if (el.type === "NConceptRef") return true;
    if (el.type === "NDisjunction") {
      for (const d of el.disjuncts) if (argHasConceptRef(d)) return true;
    } else if (el.type === "NConjunction") {
      for (const c of el.conjuncts) if (argHasConceptRef(c)) return true;
    }
  }
  return false;
}

function argHasConceptRef(arg: { type: string; disjuncts?: unknown[]; conjuncts?: unknown[] }): boolean {
  if (arg.type === "NConceptRef") return true;
  if (arg.type === "NDisjunction" && Array.isArray(arg.disjuncts)) {
    return arg.disjuncts.some((d) => argHasConceptRef(d as { type: string }));
  }
  if (arg.type === "NConjunction" && Array.isArray(arg.conjuncts)) {
    return arg.conjuncts.some((c) => argHasConceptRef(c as { type: string }));
  }
  return false;
}
