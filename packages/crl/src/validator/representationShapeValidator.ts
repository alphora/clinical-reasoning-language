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
import { matchNarrative } from "../template-match/matcher";
import { isProjectionOnly, patternProjection } from "../template-match/patternCatalog";
import { hasCodedRetrieve } from "../fhir-model/caseFeatureResources";

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
//   A.8 definition-is-exists-misuse    — a MALFORMED leading-`exists` `definition is` (a GROUP operand
//                                        or a tail'd single ref). A BARE `exists "X"` now FOLDS to a
//                                        `ReductionDefinition` (the narrowing), so only these residual
//                                        malformed shapes are flagged here (see the detail at A.8 below).
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

    // concept-boolean-composition T2 (design §6) — a `defined as ( … and / or / not … )` boolean composition is
    // PURE-DERIVED: it cannot ALSO carry a local `code is` or a `source representation`. The both-rep fold
    // (`code is` + a derived body) is #257-deferred and its machinery was built for sem-compositions; the boolean
    // family has no both-rep story yet. A REPRESENTATION-SOURCE coherence defect (fires even with no value type
    // declared), so it lives here as a non-demotable `representation-shape` rule — NOT a use-site TYPE mismatch
    // (disc 457, both crl-emit arms; placement settled on the mechanical fact that `representation-shape` is
    // non-demotable while `reduction-shape` is warning-only).
    if (
      concept.definition?.type === "DefinedAsDefinition" &&
      concept.definition.body.type === "DefinedAsBooleanComposition" &&
      (concept.code !== undefined || representations.length > 0)
    ) {
      const sources = [
        concept.code !== undefined ? "a local `code is`" : undefined,
        representations.length > 0 ? "a `source representation`" : undefined,
      ].filter((s): s is string => s !== undefined);
      errors.push(
        this.err(
          "boolean-composition-not-pure-derived",
          concept.name,
          `Concept "${concept.name}": a \`defined as ( … and / or / not … )\` boolean composition is a ` +
            `PURE-DERIVED determination — it cannot also carry ${sources.join(" and ")} (a boolean ` +
            `determination has no both-representation fold yet; that lands with #257). Remove the local source, ` +
            `or model the asserted fact as a separate concept the composition references.`,
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

    // ⭐⭐ A LOCAL `code is` MUST DECLARE ITS `type is`. There is NO implicit default.
    //
    // ⚠ There used to be one: a type-less local code meant `Observation`/`Observation.value`. It was a
    // keystroke saving, and it made the retrieve resource INVISIBLE — nothing on the page said what the
    // record is stored as. Three lanes applied the default and a fourth refused it, so the same artifact
    // was well-formed to the validator and unemittable to the emitter. CRL optimizes WRITTEN == EXECUTED:
    // a value the author never wrote, decided differently by different lanes, is the exact intent-versus-
    // execution gap the language exists to close.
    if (concept.code !== undefined && concept.code !== "" && concept.conceptType === undefined) {
      errors.push(
        this.err(
          "local-code-missing-type",
          concept.name,
          `Concept "${concept.name}" has a local \`code is\` but no \`type is\`. A locally coded concept is ` +
            `ANSWERABLE — someone can assert it — so the record must be storable, and storing it needs a ` +
            `resource type. Declare it (e.g. \`- type is Observation.\`); there is no implicit default.`,
          concept.location,
          attribution,
        ),
      );
    }

    // A.2 — the concept-level value element's path shape, checked against the concept's DECLARED local type.
    if (concept.valueElement && concept.conceptType !== undefined) {
      this.checkValueElementPath(
        concept.valueElement,
        concept.conceptType,
        false,
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
    // A.11 (definition half) — a PROJECTION-ONLY pattern in a concept-level `definition is`. One global
    // pattern registry serves definitions, projections AND pipeline stages, so registering a rep-local
    // projector silently makes `definition is matches this.` "known" (MEASURED). There is no representation
    // for it to be local to there, so it means nothing; reject it at author time naming the fix rather than
    // letting it soft-compile into emit.
    if (concept.definition?.type === "DefinitionIsDefinition") {
      const matched = matchNarrative(concept.definition.body);
      if (isProjectionOnly(matched.pattern)) {
        errors.push(
          this.err(
            "projection-only-pattern-misplaced",
            concept.name,
            `Concept "${concept.name}": \`${matched.pattern.toLowerCase()} this\` is a REP-LOCAL projection ` +
              `— it reads ONE \`source representation:\`'s own datum, and a concept-level \`definition is\` ` +
              `has no representation to be local to. Move it under the representation as ` +
              `\`- value projection is ${matched.pattern.toLowerCase()} this.\`.`,
            concept.definition.body.location,
            attribution,
          ),
        );
      }
    }

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

    // A.1 — posrep completeness, ARITY-AWARE (#189, 2026-08-28).
    //
    // ⭐ A source representation is `type is` + the arguments ITS PROJECTION declares (charter §3). It is NOT
    // "always fully explicit": a VALUE-BLIND projection reads no element, so demanding one asks the author to
    // describe something nothing consumes — and worse, to state something FALSE. To satisfy the old rule for
    // `value projection is exists this.` over a Condition the author had to write
    // `- value element is Condition.code.` + `- value type is boolean.`, asserting that `Condition.code`
    // yields a boolean. It yields a CodeableConcept, and existence reads neither.
    //
    // ⚠ The rule is CORRECT for a value-READING projection and for a bare read: patient age genuinely reads
    // `Patient.birthDate`, and dropping the element there would lose real information. Hence the split rather
    // than a deletion.
    //
    // ⚠ An UNMATCHED projection narrative is NOT treated as value-blind — fail closed. Nothing can be said
    // about a narrative that resolves to no pattern, so it still owes the explicit elements; otherwise free
    // text would silently buy an exemption.
    // ⭐ With the CANONICAL CARRIERS ruled (charter §3: Observation → `Observation.value`, Condition → `onset`),
    // a bare value READ needs no declared element either — the projection, or the read itself, uses the
    // resource's canonical carrier. So the author never names an element and can never name a WRONG one.
    // A.1 reduces to: `type is` is required. (`coded from` is required iff the resource has a code-based
    // retrieve — model info, NOT an authoring rule; that check is the next slice and is deliberately not
    // faked here.)
    //
    // ⚠ `value element` / `value type` on a representation are RETIRED, not merely optional. They remain
    // ACCEPTED so the un-migrated corpus keeps validating; the grammar drops them with the corpus migration.
    // Do not re-add a requirement for them — requiring an element the projection already knows is what forced
    // authors to state something false (`value element is Condition.code.` + `value type is boolean.` on an
    // existence rep, asserting that element yields a boolean; it yields a CodeableConcept).
    const missing: string[] = [];
    if (!rep.conceptType) missing.push("type");
    if (missing.length > 0) {
      errors.push(
        this.err(
          "incomplete-representation",
          concept.name,
          // ⚠ This message used to instruct the author to add `value element is` + `value type` — the
          // RETIRED Rule A.1. The check above had already been narrowed to `type is`, so the diagnostic was
          // teaching a construct the compiler no longer wants, in the one place an author is guaranteed to
          // read it. The datum element and its value type are DERIVED (model info + the concept).
          `Concept "${concept.name}": a source representation is missing ` +
            `${missing.map((m) => `\`${m}\``).join(" + ")}. A source representation carries ` +
            `\`type is <Resource>.\` and, when the resource has a coded retrieve, ` +
            `\`coded from "<Value Set>".\` — and nothing else. It does NOT inherit the concept's fields, ` +
            `and it does NOT declare a value element or a value type: which element carries the datum is ` +
            `model info, and its type is the concept's.`,
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
    // A.11 — a PROJECTION-ONLY pattern folded into a pipeline. `matchNarrative`'s pipeline fold prepends the
    // previous stage as the next stage's first argument, so `… , then matches this` hands a pattern whose own
    // contract is zero-operand a stage to read. MEASURED: `Matches` arrives with `args.length === 1`. Gate on
    // the SHARED `patternScope` descriptor, never on a local re-derivation, so validate and lower cannot drift.
    if (rep.valueProjection) {
      const projected = matchNarrative(rep.valueProjection.body);
      const scope = patternProjection(projected.pattern);
      // A.11 (terminology half) — a projection with NO set to test against.
      //
      // ⚠⚠ THE PATTERN DOES NOT DECIDE THIS ALONE, and an earlier version that thought it did REJECTED A
      // LEGAL FORM: `Exists` was marked "always requires terminology", so `- type is Patient.` +
      // `- value projection is exists this.` errored. The charter decides `coded from` by MODEL INFO — it is
      // required exactly when the resource has a CODE-BASED RETRIEVE, and Patient has none (you retrieve the
      // patient, never patients-with-code-X). So `always` is asked of the pattern, `when-coded-retrieve` is
      // asked of the RESOURCE.
      const resourceHasCodedRetrieve =
        rep.conceptType !== undefined && hasCodedRetrieve(rep.conceptType);
      const needsTerminology =
        scope?.terminology === "always" ||
        (scope?.terminology === "when-coded-retrieve" && resourceHasCodedRetrieve);
      if (needsTerminology && rep.terminologyName === undefined) {
        errors.push(
          this.err(
            "projection-only-pattern-misplaced",
            concept.name,
            `Concept "${concept.name}": \`${projected.pattern.toLowerCase()} this\` tests this ` +
              `representation's records against a value set, but the representation declares no ` +
              `\`coded from\`. Add \`- coded from "<value set>".\` — the set is what the projection asks ` +
              `about, so without it the projection has nothing to mean.`,
            rep.valueProjection.body.location,
            attribution,
          ),
        );
      }
      // ⚠ THE ARITY CHECK THAT USED TO LIVE HERE IS GONE, and its removal is a fix rather than a loss. It
      // caught "a projection-only pattern used as a pipeline stage" INDIRECTLY, by noticing that the fold had
      // injected an operand into a zero-operand contract. That proxy could only ever see a LATER stage —
      // stage 1 receives no injected operand, so `matches this, then most recent this` sailed through it
      // (MEASURED: validated completely clean). `pipelineStageValidator` now checks EVERY stage's pattern
      // directly, which is where the stages actually are; checking it in both places would double-report.
    }

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
    // collides with an externally-coded posrep. This key becomes the emit/fact-bridge selector, so a
    // wrong element would matter.
    //
    // ⚠ NO IMPLICIT ELEMENT. This used to substitute `Observation.value` when the author wrote no
    // `value element is` and the type happened to be Observation — the same invisible default as the
    // implicit `type is`, one field over. An unwritten element keys as `∅`: absent, not assumed.
    //
    // The `(untyped)` label is not a default either — `local-code-missing-type` already rejects a
    // `code is` with no `type is`, so this only keeps the key well-formed for a concept that is
    // being reported anyway.
    if (concept.code !== undefined) {
      const type = concept.conceptType ?? "(untyped)";
      const element = concept.valueElement?.path ?? "∅";
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

/** True iff this representation carries a projection that reads NO value element.
 *
 *  ⭐ The arity question A.1 asks: does the projection need a `value element` (+ its type) supplied?
 *  `exists this` does not — existence is over the records matching `type is` (+ `coded from`), never over a
 *  value. `age today …` DOES (it reads `Patient.birthDate`), so it is not value-blind and A.1 still applies.
 *
 *  ⚠ FAIL CLOSED on an unmatched narrative (`known === false`): a projection that resolves to no pattern
 *  cannot be shown to be value-blind, so it does not earn the exemption. Otherwise arbitrary free text would
 *  buy its way out of the completeness rule. */
function valueBlindProjection(rep: Representation): boolean {
  const proj = rep.valueProjection;
  if (proj === undefined) return false; // no projection = a bare value READ; it needs the element
  const match = matchNarrative(proj.body);
  if (match.known !== true) return false; // unmatched — nothing can be claimed about its arity
  return VALUE_BLIND_PROJECTIONS.has(match.pattern);
}

/** Projections that read no value element. Kept as an explicit allowlist rather than inferred, so adding a
 *  projector is a deliberate decision about its arity rather than an accident of its return shape. */
const VALUE_BLIND_PROJECTIONS = new Set<string>(["Exists"]);
