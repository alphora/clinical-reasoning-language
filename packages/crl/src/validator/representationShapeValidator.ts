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
// projectors (now their own `value projection is` term), and `defined as exists` all PARSE and
// BUILD but were unchecked.
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
//   A.5 value-projection-references-concept — a rep-level `value projection is` PROJECTOR
//                                        narrative referencing another concept (a projection is
//                                        datum-local; a concept-level calc uses `definition is`)
//   A.6 duplicate-representation-key    — two reps (local + posreps) share the structural key
//                                        `{type, value element, coding-source}` (refinement 4)
//   A.8 definition-is-exists-misuse    — a `definition is exists (...)` (existence is a
//                                        `defined as` operator, not `definition is`)
//   A.9 multiple-value-types           — >1 `value type` on one concept or posrep
//   A.10 missing-value-type            — a SCALAR concept (the default shape) declares NO `value type`.
//                                        Now an ERROR (the #257 migration is complete): a Scalar concept
//                                        has exactly one. SHAPE-CONDITIONAL — a `shape is Record | RecordSet`
//                                        concept MAY omit it (result type from `type is`); see the check below.
//
// NOT here (deliberate):
//   - `x + n ≥ 1` ("at least one producer", #202) is ALREADY enforced at build time
//     (ast/builder.ts — a concept with no code/posrep/defined-as/definition-is/coded-from is
//     an AstError). Todo 2 adds nothing there. (`value type`-REQUIRED is A.10 above — the #257
//     migration landed it as an error once the whole corpus + fixtures were typed.)
//   - "a local rep deviating from Observation must author an explicit value element" was
//     considered and DROPPED: 35 corpus `code is` concepts are non-Observation PRESENCE
//     determinations (Condition/MedicationRequest/Device) with no value path, so the rule is
//     incorrect. Distinguishing value-reading from presence needs the value-type/model-info
//     semantics that land with Todo 3 conformance.
//   - the concept-level `coded from` lane (a base `coded from` ALONGSIDE `code is`, still built
//     as a `CodedFromDefinition`) is a PRE-redesign asserted form the v3 composition has no slot
//     for. Todo 2 does NOT reason about it (A.3/A.6 ignore it); its migration into a
//     `source representation:` (or removal) is Todo 4 kit-migration work. No new content authors
//     it; the remaining fixture that does is pre-redesign (representation-edge-cases). The
//     mammogram-and-bmi exemplar has been migrated to model (C) — no base coded-from lane (disc 398).

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

    // A.10 — value type REQUIRED, now SHAPE-CONDITIONAL (#189 S1). A `value type` names a SCALAR
    // concept's single canonical result — the type its emit/consumption is checked against — so a
    // Scalar concept (the default) still MUST declare exactly one; a missing one is the
    // invisible-shape bug this redesign exists to kill, an ERROR. For a Record/RecordSet concept the
    // published value is a record (or set of records) whose resource is `type is`, NOT a scalar
    // result type, so a concept-level `value type` is OPTIONAL there (when present it names the
    // datum type and A.9's exactly-one still applies). The relaxation is `Concept.valueTypes` ONLY —
    // a `source representation` is still fully self-describing (A.1 requires its own value type).
    const shape = concept.shape ?? "Scalar";
    if (shape === "Scalar" && valueTypes.length === 0) {
      errors.push(
        this.err(
          "missing-value-type",
          concept.name,
          `Concept "${concept.name}" is Scalar (the default \`shape\`) but declares no ` +
            `\`value type\`. A Scalar concept has exactly one \`value type\` — its canonical result ` +
            `shape. Add \`- value type is <Type>.\` (CodeableConcept for a coded resource ` +
            `refinement, Quantity for a measurement, boolean for a determination, dateTime/integer/ ` +
            `etc. for a scalar), or declare \`- shape is Record.\` / \`- shape is RecordSet.\` if this ` +
            `concept publishes a record (or set of records) rather than a scalar value.`,
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

    // A.8 — a leading-`exists` `definition is` misuse (#189 narrowing + panel R3 F2). A BARE single-ref
    // `exists "X"` / `exists ("X")` now FOLDS to a structural `ReductionDefinition` in the builder
    // (Q1→A1) — the canonical named reduction, whose RecordSet-operand coherence is the reduction
    // validator's job — so it NEVER reaches here. What survives as a `DefinitionIsDefinition` leading
    // with `exists` is a MALFORMED reduction, in two shapes, both flagged:
    //   - a GROUP operand (`exists ("A" or "B")` → [NWord "exists", NDisjunction/NConjunction]): a
    //     reduction has ONE operand, so promote the group to its own concept first.
    //   - a single ref WITH A TAIL (`exists "X" today` / `exists "X" within last 2 years` → [NWord
    //     "exists", NConceptRef, …tail]): the bare form folded, so an NConceptRef reaching here means a
    //     trailing filter the reduction can't carry — fold it into the operand concept. (Restores the
    //     coverage the narrowing dropped; without this the tail'd form gets ZERO diagnostics and only
    //     fails at the emit matcher.)
    // An ordinary narrative that merely contains the word (`"Weight" exists today`) leads with the ref,
    // not `exists`, so it is not flagged. Message no longer steers to `defined as exists` (existence is
    // now a `definition is` reduction).
    if (concept.definition?.type === "DefinitionIsDefinition") {
      const els = concept.definition.body.elements;
      const second = els[1]?.type;
      const leadsWithExists = els.length >= 2 && els[0].type === "NWord" && els[0].value === "exists";
      if (leadsWithExists && (second === "NDisjunction" || second === "NConjunction")) {
        errors.push(
          this.err(
            "definition-is-exists-misuse",
            concept.name,
            `Concept "${concept.name}": \`definition is exists ( … or/and … )\` — a reduction has a ` +
              `SINGLE operand, so it cannot exist over a group — promote the group to its own concept ` +
              `(e.g. a \`defined as ( … sem-or … )\` concept) and then \`definition is exists "That ` +
              `Concept".\`.`,
            concept.definition.body.location,
            attribution,
          ),
        );
      } else if (
        leadsWithExists &&
        (second === "NConceptRef" ||
          (els[1].type === "NWord" && els[1].value === "this"))
      ) {
        // A bare `exists "X"` / `exists this` folds away (exactly 2 elements), so an unfolded `exists`
        // reaching here — a ref (`exists "X" today`) OR `this` (`exists this today`) — carries a trailing
        // filter the reduction can't hold (panel R3 gpt56 #4 added the `this` case).
        const operand = second === "NConceptRef" ? `"…"` : "this";
        errors.push(
          this.err(
            "definition-is-exists-misuse",
            concept.name,
            `Concept "${concept.name}": \`definition is exists ${operand} <filter>\` — an \`exists\` ` +
              `reduction takes a SINGLE bare operand (\`definition is exists "X".\` / \`exists this.\`); a ` +
              `trailing filter (\`… today\`, \`… within …\`) is not part of the reduction. Fold the filter ` +
              `into the operand concept (or a derived \`shape is RecordSet\` concept), then reduce that.`,
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

    // A.5 — a value projection references another concept. A `value projection is` PROJECTOR
    // projects THIS representation's OWN datum to the concept's value; operating over other
    // named declarations is exclusively the concept-level derived slot (`definition is`). A
    // narrative ref (`NConceptRef`) anywhere in the projection resolves to a concept OR a
    // parameter (referenceResolver narrative slots) — EITHER is illegal (a projection is
    // datum-local), so the message names both. (Since `value projection is` is its own keyword,
    // a MISPLACED concept-level `definition is` can no longer land here — that is a parse error —
    // so this rule's only job is the datum-local scope violation.)
    if (rep.valueProjection && narrativeHasConceptRef(rep.valueProjection.body.elements)) {
      errors.push(
        this.err(
          "value-projection-references-concept",
          concept.name,
          `Concept "${concept.name}": a \`value projection is …\` inside a ` +
            `\`source representation:\` references another concept or parameter, but a value ` +
            `projection computes over THIS representation's own datum only. If you meant a ` +
            `concept-level calculation over other concepts, use \`definition is …\` ABOVE the ` +
            `\`source representation:\` (concept-level clauses precede representations).`,
          rep.valueProjection.body.location,
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
