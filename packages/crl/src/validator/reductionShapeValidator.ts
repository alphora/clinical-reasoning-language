import {
  getRefName,
  getRefLibrary,
  type CRL,
  type Concept,
  type ConceptDefinition,
  type ConceptShape,
  type Reduction,
  type ReferenceName,
  type Statement,
  type Location,
} from "../ast/types";
import { isPureQuestionConcept } from "../template-match/recencyValueConcept";
import { bmiRetirementReason } from "../template-match/bmiPublication";
import { isLocalBooleanPublication, publicationAdmissionReason } from "../emit/publicationProgram";

import type { SourceContext } from "../imports/scopes";

import type { ReductionShapeError, ReductionShapeRule, ValidationError } from "./validator";
import { assumedShapePreMigration } from "../grammar/conceptShapes";
import { matchNarrative } from "../template-match/matcher";
import { patternReturnShape } from "../template-match/patternCatalog";

// Mixed current-publication validation and retained legacy shape checks.
// Current publication admission runs first. Legacy fixtures do not define current authoring.
// Rules have their declared error/warning severity; the descriptions below are historical.
//
// Rules (historical taxonomy; see .vibe-tools/discussions/415 + the ReductionShapeRule doc in validator.ts):
//   recordset-operand-required        — a named `exists`/`count`/`most recent` operand X that is not
//                                       `shape is RecordSet` (structural reduction AND narrative `most recent "X"`)
//   reduction-result-nonboolean       — an exists/count reduction on a Scalar concept typed non-boolean
//   reduction-this-no-representation  — a `<reduction> this` on a concept with no representation
//   reduction-multi-rep               — a `most recent this` / `count this` with >1 representation
//   recordset-scalar-reduction        — a RecordSet concept carrying a reduction OR a narrative `most
//                                       recent "X"` selection (a set publishes records, not a value/record).
//                                       A bare `code is` on a RecordSet is NOT flagged — it is the canonical
//                                       base-record retrieve (North Star §3 / design §2 `(none) × RecordSet`).
//   record-shape-invariant            — a Record concept without a record-selecting `most recent`
//   no-bare-scalar-code               — a Scalar bare `code is` with no reduction (THE migration prompt)
//   non-scalar-missing-type           — a non-Scalar concept with no `type is` (record shape needs a resource)
//   shape-marker-not-emit-active      — an explicit non-Scalar `shape is` on a still-emitting concept
//                                       (TRANSIENT by construction — delete this rule + its tests at the
//                                       flip, when emit starts consulting `shape`; on the IMPL-3/flip checklist)
//   count-threshold-trivial           — a `count … at least N` with N < 1
//
// DEFERRED — NOT checked here, accounted for so nothing is SILENTLY dropped (panel R3 F3/F5/point-3):
//   - value-type-must-match-a-real-element + `most recent this` on a valueless rep (design §8): a
//     representation read as a value (bare read, or `most recent this`) whose `value type` names an
//     element the resource does not carry — e.g. `type is Condition. value type is Quantity. code is
//     `c`. definition is most recent this.` (Condition has no value to publish as Quantity). Needs the
//     FHIR model-info element registry that does not exist yet (a FLIP BLOCKER, design §10 /
//     representationShapeValidator.ts:47-51) — only AST-determinable checks land in this slice.
//   - Scalar + posrep-only + no definition (a bare sourced read; today emit manufactures an implicit
//     recency projection): D2 scopes this slice to LOCAL-only, so a purely-sourced Scalar read owes no
//     local reduction here — deferred with the descriptor step (~#257).
//   - `shape is RecordSet` + `definition is <scalar narrative>` + no rep (a record-set shape deriving a
//     scalar): only `shape-marker-not-emit-active` fires. If USED, IMPL 2b's both-directions result-type
//     compare catches it; if ORPHAN, nothing does (the emitter emits all declared objects, no
//     reachability filter) — named for the 2b plan.
//   - cross-library named operands (`recordset-operand-required` / Record type-agreement over a
//     foreign-qualified operand): self-scope-only for now (see `resolveConcept`).

/** Source attribution for a diagnostic (multi-file mode). */
interface Attribution {
  libraryName?: string;
  filePath?: string;
}

/** Origin-keyed concept index (mirrors `useSiteTypeValidator`'s TypeIndex keying) so a local
 * `Foo` and a package `Foo` stay distinct. Foreign-PACKAGE concepts NOT in `sources` are absent
 * (KnownLibraryEntry carries only names, not the full Concept) — a named operand into one resolves
 * to `undefined` and its shape check is skipped, conservatively (the same KNOWN BOUND rule B has). */
type ConceptIndex = Map<string, Map<string, Concept>>;

const key = (origin: string, name: string): string => `${origin}|${name}`;

/** The index context for resolving a named operand within one owning library (self-scope only —
 * see `resolveConcept`). */
interface ResolveCtx {
  ownLibrary: string;
  ownKey: string;
  index: ConceptIndex;
}

export class ReductionShapeValidator {
  public validate(ast: CRL, sources?: SourceContext[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const index = buildConceptIndex(ast, sources);

    if (sources) {
      for (const { stmt, scope } of sources) {
        if (stmt.type !== "Concept") continue;
        this.checkConcept(
          stmt,
          { ownLibrary: scope.currentLibrary, ownKey: key(scope.origin, scope.currentLibrary), index },
          { libraryName: scope.currentLibrary, filePath: scope.filePath },
          errors,
        );
      }
    } else {
      const ownLibrary = ast.library?.name ?? "";
      const ctx: ResolveCtx = { ownLibrary, ownKey: key("single", ownLibrary), index };
      for (const stmt of ast.statements) {
        if (stmt.type === "Concept") this.checkConcept(stmt, ctx, {}, errors);
      }
    }
    return errors;
  }

  private warn(
    rule: ReductionShapeRule,
    conceptName: string,
    message: string,
    location: Location,
    attribution: Attribution,
    errors: ValidationError[],
    // ⭐ Severity is per-RULE, and the split is "WIP" vs "FOREVER" (operator, 2026-08-28):
    //   warning — the rule describes work not yet built (emit does not consult `shape` yet;
    //             cross-representation dedup #257). Those finish before release, so they are not
    //             authoring defects and must not fail a build today.
    //   error   — the rule describes a permanent AUTHORING defect. `record-shape-invariant` is one:
    //             declaring `shape is Record` and not authoring a definition that yields one record is
    //             wrong now and wrong after every planned phase lands. Nothing on the roadmap makes it
    //             valid, so shipping it as a warning invites authors to ignore it forever.
    severity: "warning" | "error" = "warning",
  ): void {
    const e: ReductionShapeError = {
      kind: "reduction-shape",
      rule,
      conceptName,
      message,
      location: { start: { ...location.start }, end: { ...location.end } },
      severity,
      ...(attribution.libraryName ? { libraryName: attribution.libraryName } : {}),
      ...(attribution.filePath ? { filePath: attribution.filePath } : {}),
    };
    errors.push(e);
  }

  private checkConcept(
    concept: Concept,
    ctx: ResolveCtx,
    attribution: Attribution,
    errors: ValidationError[],
  ): void {
    // REFACTOR:grounded (#320, review 560): final publication selection has its own authored
    // clause. Admitted declarations owe no legacy definition; unsupported opt-ins never fall through.
    if (concept.valueDomain !== undefined && (concept.shapeReduction === undefined || concept.shape !== "Record" ||
        concept.conceptType !== "Observation" || concept.valueTypes.length !== 1 || concept.valueTypes[0] !== "CodeableConcept")) {
      this.warn("publication-value-domain-placement", concept.name,
        "An interpreted value domain is currently admitted only on an explicitly selected Record Observation<CodeableConcept> publication.",
        concept.valueDomain.location, attribution, errors, "error");
    }
    // REFACTOR:grounded (#320, plan595): retired BMI gets migration guidance even without shape reduction.
    const bmiRetirement = bmiRetirementReason(concept);
    if (bmiRetirement !== undefined) {
      this.warn("bmi-form-retired", concept.name, bmiRetirement, concept.location, attribution, errors, "error");
      return;
    }
    if (concept.shapeReduction !== undefined) {
      const reason = publicationAdmissionReason(concept);
      if (reason !== undefined) {
        this.warn("publication-unsupported-form", concept.name, `Concept "${concept.name}": ${reason}`,
          concept.shapeReduction.location, attribution, errors, "error");
      } else if (concept.shapeReduction.equalTime === "preferLocal" &&
          (concept.code === undefined || (concept.definition === undefined && concept.representations.length === 0))) {
        // An admitted definition or source can contribute nonlocal candidates. A local
        // preference is ineffective only without a local arm or with a local arm alone.
        this.warn("publication-local-tie-preference-no-op", concept.name,
          `Concept "${concept.name}": \`on equal time prefer local\` currently has no effect for this ${concept.code === undefined ? "publication without local candidates" : "local-only publication"} selected Record. Two local candidates at the same maximal time still cause an ambiguous-selection error. Equal-time candidates receive no automatic chronological or insertion-order precedence, and an answer does not automatically win.`,
          concept.shapeReduction.location, attribution, errors);
      }
      return;
    }
    // `shape` is REQUIRED on the AST — the builder normalizes an omitted `shape is` to "Scalar"
    // (ast/types.ts Concept.shape) — NO LONGER TRUE: an undeclared shape is `undefined`, and callers route
    // through `assumedShapePreMigration` until the corpus declares one (RETIRE:189-shape-declared).
    const shape: ConceptShape = assumedShapePreMigration(concept.shape);
    const def = concept.definition;
    const reduction: Reduction | undefined =
      def?.type === "ReductionDefinition" ? def.reduction : undefined;
    const hasCodeIs = concept.code !== undefined;
    const reps = concept.representations?.length ?? 0;
    // A `source representation` carrying a `value projection` (e.g. the Patient age-recency posrep) IS an
    // effective reduction — the projection computes the concept's value from the rep datum, synthesized at
    // emit (lowerLocalCodes recency merge). So it satisfies the "state the reduction" requirement and is
    // EXEMPT from `no-bare-scalar-code` below (else the kit's SANCTIONED age-recency pattern — `code is` +
    // age posrep, no `definition is` — would warn with a suggestion that BREAKS it; full-slice panel R4 Fable #1).
    const hasValueProjectionRep = concept.representations?.some((r) => r.valueProjection !== undefined) ?? false;
    // The count of a concept's OWN representation records: the local `code is` arm (if present) +
    // every `source representation` (posrep). Cross-rep dedup is deferred (#257), so >1 makes a
    // `this` reduction ambiguous today.
    const repCount = (hasCodeIs ? 1 : 0) + reps;
    const vts = concept.valueTypes ?? [];
    const vt = vts.length === 1 ? vts[0] : undefined;
    const loc = concept.location;
    // REFACTOR:grounded (#320, review 560 E5): expose the retained legacy absence difference
    // when an author starts using explicit Record publications in the same library.
    if (concept.shape === "Scalar" && vt === "boolean" && reduction?.kind === "mostRecent" &&
        reduction.target.type === "ThisRecords" &&
        [...(ctx.index.get(ctx.ownKey)?.values() ?? [])].some(isLocalBooleanPublication)) {
      this.warn("legacy-boolean-publication-absence", concept.name,
        `Concept "${concept.name}" uses legacy Scalar Boolean most-recent behavior: a missing selected value is emitted as false. This library also declares a selected Record publication, whose missing value remains null and pauses a required branch. Choose the intended absence behavior explicitly; the two forms are not equivalent.`,
        loc, attribution, errors);
    }

    // -- Reduction-operand & result checks (only when a reduction is present) -----------------
    if (reduction) {
      // recordset-operand-required — a named operand must be `shape is RecordSet` (the A.8
      // single-ref supersession's coherence check). `this` needs no operand check (its records
      // are the concept's own, checked by reduction-this-no-representation below).
      if (reduction.target.type === "ReductionConceptRef") {
        const operand = resolveConcept(
          getRefName(reduction.target.ref),
          getRefLibrary(reduction.target.ref) ?? undefined,
          ctx,
        );
        if (operand && assumedShapePreMigration(operand.shape) !== "RecordSet") {
          this.warn(
            "recordset-operand-required",
            concept.name,
            `Concept "${concept.name}": \`definition is ${verb(reduction)} "${getRefName(reduction.target.ref)}"\` ` +
              `reduces a SET of records, but its operand "${getRefName(reduction.target.ref)}" is ` +
              `\`shape is ${operand.shape}\`, not \`shape is RecordSet\`. A reduction's ` +
              `named operand must publish a record set — declare "${getRefName(reduction.target.ref)}" ` +
              `\`- shape is RecordSet.\`, or reduce \`this\` if the records are this concept's own.`,
            loc,
            attribution,
            errors,
          );
        }
      }

      // reduction-this-no-representation — a `this` reduction needs ≥1 of the concept's own records.
      if (reduction.target.type === "ThisRecords" && repCount === 0) {
        this.warn(
          "reduction-this-no-representation",
          concept.name,
          `Concept "${concept.name}": \`definition is ${verb(reduction)} this\` reduces THIS ` +
            `concept's own records, but it declares none (no \`code is\`, no \`source representation\`, ` +
            `and no earlier pipeline stage to hand one on). Add a representation, or reduce a named ` +
            `\`shape is RecordSet\` concept instead of \`this\`.`,
          loc,
          attribution,
          errors,
        );
      }

      // reduction-multi-rep — `most recent` / `count` over `this` with >1 representation is
      // ambiguous until cross-rep dedup (#257): each rep is a distinct record stream.
      if (
        reduction.target.type === "ThisRecords" &&
        (reduction.kind === "mostRecent" || reduction.kind === "count") &&
        repCount > 1
      ) {
        this.warn(
          "reduction-multi-rep",
          concept.name,
          `Concept "${concept.name}": \`definition is ${verb(reduction)} this\` reduces over ${repCount} ` +
            `representations (the local \`code is\` arm and/or \`source representation\`s), but ` +
            `cross-representation dedup is not yet available (#257) — the reduced record is ambiguous ` +
            `across the reps. Reduce a single representation (e.g. promote one to a named ` +
            `\`shape is RecordSet\` concept and reduce that), or wait for multi-rep dedup.`,
          loc,
          attribution,
          errors,
        );
      }

      // reduction-result-nonboolean — an exists/count reduction publishes a boolean; a Scalar
      // concept typing it otherwise contradicts the reduction.
      if (
        (reduction.kind === "exists" || reduction.kind === "count") &&
        shape === "Scalar" &&
        vt &&
        vt !== "boolean"
      ) {
        this.warn(
          "reduction-result-nonboolean",
          concept.name,
          `Concept "${concept.name}": \`definition is ${verb(reduction)} …\` produces a \`boolean\` ` +
            `(${reduction.kind === "exists" ? "presence is true-or-false" : "a threshold count is met-or-not"}), ` +
            `but the concept declares \`value type is ${vt}\`. Change the value type to \`boolean\`, or ` +
            `(if you meant to publish the record's value) use \`most recent this\`.`,
          loc,
          attribution,
          errors,
        );
      }

      // count-threshold-trivial — `count … at least N` with N < 1 is always true.
      if (reduction.kind === "count" && reduction.atLeast < 1) {
        this.warn(
          "count-threshold-trivial",
          concept.name,
          `Concept "${concept.name}": \`count … at least ${reduction.atLeast}\` is trivially true ` +
            `(every set has at least ${reduction.atLeast} members). Use \`at least 1\` for a ` +
            `presence threshold (or \`definition is exists …\`), or a threshold ≥ 1.`,
          loc,
          attribution,
          errors,
        );
      }
    }

    // -- Shape-invariant checks ---------------------------------------------------------------

    // recordset-scalar-reduction — a RecordSet publishes its records, not a reduced/selected value.
    // BOTH a structural reduction (`exists`/`count`/`most recent this`) AND a narrative `most recent
    // "X"` selection are rejected: a reduction produces a scalar, a selection ONE record — neither is a
    // set. (A local `code is` alone on a RecordSet is NOT flagged — it is the canonical base-record
    // RETRIEVE, North Star §3 / design §2 `(none) × RecordSet → RecordSet<R>`; the old
    // `recordset-bare-code-incoherent` rule wrongly applied Scalar "code is = existence" intuition and
    // false-flagged the charter's own worked example — deleted, panel R3 gpt56 #1.)
    if (shape === "RecordSet" && (reduction || narrativeIsMostRecentNamedOperand(def))) {
      const how = reduction
        ? `a \`definition is ${verb(reduction)} …\` reduction`
        : "a narrative `most recent …` selection";
      this.warn(
        "recordset-scalar-reduction",
        concept.name,
        `Concept "${concept.name}" is \`shape is RecordSet\` but carries ${how}. A RecordSet publishes ` +
          `its set of records; a reduction produces a single value and a selection a single record — ` +
          `neither is a set. Declare \`- shape is Scalar.\` (to reduce to a value) or \`- shape is ` +
          `Record.\` (to select one record), or drop the reduction/selection to publish the set.`,
        loc,
        attribution,
        errors,
      );
    }

    // recordset-operand-required (narrative `most recent "X"`) — the BASE cardinality invariant (design
    // §2 table: a named operand X must resolve to a RecordSet; NOT the deferred `type is R` agreement).
    // `most recent "X"` stays a narrative DefinitionIsDefinition (only `most recent this` folds), so the
    // structural check inside the `if (reduction)` block above never sees it; resolve its operand here.
    const narrativeOperand = narrativeMostRecentOperand(def);
    if (narrativeOperand) {
      const operand = resolveConcept(
        getRefName(narrativeOperand),
        getRefLibrary(narrativeOperand) ?? undefined,
        ctx,
      );
      if (operand && assumedShapePreMigration(operand.shape) !== "RecordSet") {
        this.warn(
          "recordset-operand-required",
          concept.name,
          `Concept "${concept.name}": \`definition is most recent "${getRefName(narrativeOperand)}"\` ` +
            `selects the most recent of a SET of records, but its operand ` +
            `"${getRefName(narrativeOperand)}" is \`shape is ${operand.shape}\`, not \`shape is ` +
            `RecordSet\`. A named selection operand must publish a record set — declare ` +
            `"${getRefName(narrativeOperand)}" \`- shape is RecordSet.\`, or select \`most recent this\` ` +
            `if the records are this concept's own.`,
          loc,
          attribution,
          errors,
        );
      }
    }

    // record-shape-invariant — a Record publishes ONE selected record, via a `most recent` selection.
    // Two spellings select: the folded `most recent this` reduction (target ThisRecords), and the
    // UN-folded narrative `most recent "X"` (kept a DefinitionIsDefinition to preserve its live
    // matcher/emit path — IMPL 1). A Record with neither does not select a record.
    //
    // DEFERRED BY CHOICE (not difficulty — panel R3 F2): the `type is R`-must-agree-with-the-selected-
    // `RecordSet<R>`-operand check the handoff sketched IS reachable. A `most recent this` reduction
    // always targets `this` (only that form folds), so there is no reduction-node operand to compare;
    // but the narrative `most recent "X"` carries its operand at `els[2]` as an NConceptRef, which
    // `resolveConcept` resolves to a Concept whose `.conceptType`/`.shape` the check could compare (a
    // narrative analog of `recordset-operand-required` + the Record type-agreement). Left for the flip
    // step so the slice stays a clean coherence layer; the reachable path is recorded here so it is
    // not re-derived from scratch.
    if (shape === "Record") {
      // ⭐ `- shape is Record.` is the CONTRACT (operator, 2026-08-28: *"shape is record is the contract.
      // It shouldn't magically do anything. The author establishes shape is record and then they must
      // author into that."*). This check asks whether the author DID author into it — i.e. whether the
      // definition yields ONE record/value.
      //
      // ⚠ It previously accepted ONLY a `most recent` selection, which is a BUG: a threshold and a
      // calculation each yield exactly one value too. `Obese`'s
      // `definition is "BMI" at least 30 'kg/m2'` IS the thing that makes it a record — and the
      // `Condition` source representation reduces by `exists(this)`, also one. Rejecting those forced the
      // author to spend the single definition slot on `most recent this`, EVICTING the derivation — and
      // the derivation is what links `Obese` → `BMI` → `Height`/`Weight` into one inference chain rather
      // than four unrelated questions. (Measured: authoring both is a hard "declares more than one
      // definition" error.)
      //
      // ⚠ What must still FAIL: a Record with NO definition, or one whose form yields a SET (a
      // list-returning catalog pattern, a `defined as` set composition). There the author declared the
      // contract and did not author into it. A local `code is` does NOT satisfy it on its own — that
      // would make the reduction appear from a declaration the author wrote for a different purpose,
      // which is the magic this rule exists to prevent.
      const selectsRecord =
        (reduction !== undefined && reduction.kind === "mostRecent") ||
        narrativeIsMostRecentNamedOperand(def) ||
        definitionYieldsSingleValue(def);
      if (!selectsRecord) {
        // ⭐ NAME THE ACTUAL CAUSE. The old single message always said "does not select a single record"
        // and advised `most recent this` — which is WRONG ADVICE for the commonest case: an UNMATCHED
        // NARRATIVE. There the definition is not a failed selection, it is text that resolves to no
        // catalog pattern at all, so nothing can be said about what it yields; and taking the advice
        // would evict the author's derivation from the single definition slot. Diagnose the cause the
        // author actually has.
        this.warn(
          "record-shape-invariant",
          concept.name,
          def === undefined
            ? `Concept "${concept.name}" declares \`- shape is Record.\` but has no definition, so nothing ` +
              `says which record it publishes. For current selected answers, use an explicit supported ` +
              `Record Observation publication and shape reduction. Preserve the intended producer; ` +
              `source or collection requirements may need a capability not yet supported.`
            : def.type === "DefinitionIsDefinition" && !isMatchedCatalogPattern(def)
              ? `Concept "${concept.name}" declares \`- shape is Record.\`, but its definition is ` +
                `UNMATCHED NARRATIVE — it resolves to no catalog pattern, so it cannot be shown to yield a ` +
                `single record. This is not a missing selection: adding \`most recent this\` would ` +
                `overwrite the definition you wrote (a concept has exactly one). Either express the ` +
                `derivation in a form the catalog matches, or add the missing pattern.`
              : `Concept "${concept.name}" declares \`- shape is Record.\`, but its definition yields a SET, ` +
                `not one record. Reduce it (a selection, threshold or calculation), or declare ` +
                `\`- shape is RecordSet.\` to publish the set.`,
          loc,
          attribution,
          errors,
          // FOREVER defect, not WIP: no planned phase makes an unfulfilled `shape is Record` contract
          // valid, so it is an ERROR. Contrast the two `shape`-migration warnings and the #257 dedup
          // warning beside it, which describe work that finishes before release.
          "error",
        );
      }
    }

    // -- Type & migration checks --------------------------------------------------------------

    // non-scalar-missing-type — a record shape needs its resource declared, UNLESS the concept has
    // NO own representation (no `code is`, no posrep) and derives entirely from other concepts: it
    // then inherits its resource from the derivation, not a `type is`. That covers a named-operand
    // reduction (`exists`/`count "X"`), the narrative `most recent "X"`, and a record-valued
    // `defined as` refinement over other concepts.
    const derivesFromOperand =
      repCount === 0 &&
      def !== undefined &&
      (def.type === "ReductionDefinition" ||
        def.type === "DefinitionIsDefinition" ||
        def.type === "DefinedAsDefinition");
    if (shape !== "Scalar" && !concept.conceptType && !derivesFromOperand) {
      this.warn(
        "non-scalar-missing-type",
        concept.name,
        `Concept "${concept.name}" is \`shape is ${shape}\` but declares no \`type is\`. A ` +
          `record-valued concept publishes records of a specific FHIR resource — declare ` +
          `\`- type is <Resource>.\` (e.g. Observation, Condition, MedicationRequest).`,
        loc,
        attribution,
        errors,
      );
    }

    // no-bare-scalar-code — THE migration prompt. A Scalar concept whose ONLY value source is a
    // bare local `code is` (no reduction, no derivation) publishes the raw local code as a boolean
    // existence — the redesign wants that stated as an explicit reduction. Fires CORPUS-WIDE (every
    // bare presence concept, incl. the non-Observation Condition/MedicationRequest/Device ones). We
    // scope it to a FREE definition slot (`def === undefined`): a `code is` + `defined as` both-rep
    // is a satisfying reduction (charter §3, `lowerLocalCodes.ts:497-507`) and exempt; a `code is` +
    // `definition is`/`coded from` MIXED form is out of emit scope already (the emit-mixed hard
    // error owns it) — not double-warned here, and its definition slot is taken so the reduction
    // action would not apply.
    //
    // ⭐ REFACTOR:grounded (#189 null/pause, panel disc 517) — a PURE QUESTION is EXEMPT, and this is the
    // exemption that matters most, because the warning's ADVICE is actively destructive for that shape.
    // A pure question (Scalar + local `code is` + `value type is boolean` + Observation, no derivation, no
    // representation) IS a bare scalar `code is` — it trips every clause of this rule. But it is not a
    // missing reduction: its `Observation.value[x]` IS the answer slot, and the reduction that reads it is
    // newest-answer (`answeredValue()`), supplied by the answer representation exactly as the patient-age
    // `value projection` posrep supplies its own (the sibling exemption above).
    // Following the suggested action here — "add `- definition is exists this.`" — converts a question
    // that PAUSES into a derivation that reads closed-world and can NEVER pause: a silent flip from
    // *ask the user* to *deny*, which is the exact defect class #189 removes. Charter §3 carries the
    // matching carve-out.
    if (
      shape === "Scalar" &&
      hasCodeIs &&
      def === undefined &&
      !hasValueProjectionRep &&
      !isPureQuestionConcept(concept)
    ) {
      this.warn(
        "no-bare-scalar-code",
        concept.name,
        `Concept "${concept.name}" uses a legacy Scalar local-code form. For a selected answer, ` +
          `author an explicit Record Observation publication with a supported value type and shape reduction. ` +
          `Choose a representation and producer that preserve the intended question; record presence is not ` +
          `a Boolean answer. Source or collection semantics may require a capability not yet supported.`,
        loc,
        attribution,
        errors,
      );
    }

    // shape-marker-not-emit-active — an explicit non-Scalar `shape is` on a concept that STILL has a
    // live emit path (i.e. NOT a pure reduction, which hits the emit sentinel). Emit does not yet
    // consult `shape`, so the concept emits as it does today; the flip will change it. An honest
    // preparatory warning — NOT the reduction sentinel (this concept has a valid current emit), NOT
    // silent (the invisible-shape bug A.10 exists to kill). Reductions are excluded (they already
    // fail loud at emit); the coherence warnings above fire independently where they apply.
    if (shape !== "Scalar" && !reduction) {
      this.warn(
        "shape-marker-not-emit-active",
        concept.name,
        `Concept "${concept.name}" declares \`- shape is ${shape}.\`, but emit does not yet consult ` +
          `\`shape\` — this concept emits today as it always has, and the flip (#189) will change its ` +
          `emit to honor the declared shape (a planned step-3 migration, not an error). The marker is ` +
          `recorded now so its coherence can be checked ahead of the flip.`,
        loc,
        attribution,
        errors,
      );
    }
  }
}

/**
 * Legacy non-publication narratives must match a real catalog pattern before
 * their return shape is inspected. Explicit publications have separate admission.
 * A soft-compile placeholder is not a known producer or a record-set result.
 */
function isMatchedCatalogPattern(def: ConceptDefinition | undefined): boolean {
  if (def?.type !== "DefinitionIsDefinition") return false;
  // `matchNarrative` carries the answer itself: its soft-compile fallback sets `known: false` and puts the
  // RAW narrative source in `pattern`. So "did it match?" is `.known` — never a null check on `.pattern`,
  // and no longer a proxy via `PATTERN_RETURN_SHAPE` membership (which would drift as the table changes).
  return matchNarrative(def.body).known === true;
}

function definitionYieldsSingleValue(def: ConceptDefinition | undefined): boolean {
  if (def === undefined) return false;
  if (def.type === "ReductionDefinition") {
    // `exists this` / `count this at least N` reduce a record set to ONE boolean.
    return def.reduction.kind === "exists" || def.reduction.kind === "count" || def.reduction.kind === "mostRecent";
  }
  if (def.type !== "DefinitionIsDefinition") return false;
  if (!isMatchedCatalogPattern(def)) return false; // unmatched narrative — nothing can be said about it
  const shape = patternReturnShape(matchNarrative(def.body).pattern);
  return shape === "instance" || shape === "boolean" || shape === "other";
}

/**
 * `most recent "X"` — the NAMED-operand selection, which is ONE operation over an argument and therefore
 * genuinely yields a single record.
 *
 * ⚠ This used to test only that the narrative BEGAN with the words "most recent", and it was OR'd into the
 * `shape is Record` single-yield gate — so any narrative starting with those two words satisfied the Record
 * contract without matching a catalog pattern at all, and the unmatched narrative underneath went
 * unreported. MEASURED: `definition is most recent flurble bloop of "A".` validated clean.
 *
 * The fix is not to infer what the author meant. `most recent <named concept>` is a recognised single
 * operation; anything else following "most recent" is ordinary narrative and must match a pattern like any
 * other, so it falls through to the unmatched-narrative diagnosis.
 *
 * ⚠ Note what this makes visible: `most recent <some calculation>` composes TWO operations with the second
 * written FIRST, against the left-to-right reading rule. The left-to-right spelling is
 * `<calculation>, then most recent this` — which additionally reduces over the concept's OWN records, so a
 * both-representation concept merges its arms instead of reducing only the calculation's output.
 */
function narrativeIsMostRecentNamedOperand(def: ConceptDefinition | undefined): boolean {
  if (def?.type !== "DefinitionIsDefinition") return false;
  const els = def.body.elements;
  return (
    els.length === 3 &&
    els[0].type === "NWord" &&
    els[0].value === "most" &&
    els[1].type === "NWord" &&
    els[1].value === "recent" &&
    els[2].type === "NConceptRef"
  );
}

/**
 * The NAMED operand of a narrative `most recent "X"` selection (its `els[2]` NConceptRef ref), or
 * undefined. `most recent this` folds to a Reduction and never lands here; `most recent "X"` stays a
 * DefinitionIsDefinition, so this is the only way to reach its operand for the base
 * `recordset-operand-required` cardinality check (design §2: a named operand must be a RecordSet).
 */
function narrativeMostRecentOperand(def: ConceptDefinition | undefined): ReferenceName | undefined {
  if (def?.type !== "DefinitionIsDefinition") return undefined;
  const els = def.body.elements;
  if (
    els.length >= 3 &&
    els[0].type === "NWord" &&
    els[0].value === "most" &&
    els[1].type === "NWord" &&
    els[1].value === "recent" &&
    els[2].type === "NConceptRef"
  ) {
    return els[2].value;
  }
  return undefined;
}

/** The author-facing verb for a reduction kind. */
function verb(r: Reduction): string {
  switch (r.kind) {
    case "exists":
      return "exists";
    case "mostRecent":
      return "most recent";
    case "count":
      return "count";
  }
}

/** Build the origin-keyed concept index from the AST / sources. */
function buildConceptIndex(ast: CRL, sources?: SourceContext[]): ConceptIndex {
  const index: ConceptIndex = new Map();
  const add = (stmt: Statement, k: string): void => {
    if (stmt.type === "Concept" && stmt.name) {
      let rec = index.get(k);
      if (!rec) {
        rec = new Map();
        index.set(k, rec);
      }
      rec.set(stmt.name, stmt);
    }
  };
  if (sources) {
    for (const { stmt, scope } of sources) add(stmt, key(scope.origin, scope.currentLibrary));
  } else {
    const ownLibrary = ast.library?.name ?? "";
    for (const stmt of ast.statements) add(stmt, key("single", ownLibrary));
  }
  return index;
}

/**
 * Resolve a named reduction operand to its declaring Concept. SELF-SCOPE ONLY: a bare or
 * self-qualified ref resolves in the owning library; a FOREIGN-qualified ref (`"OtherLib"."X"`) is
 * ALWAYS skipped (returns `undefined`), so the operand's shape check is conservatively dropped
 * rather than risk a false coherence warning. That is stricter than it needs to be — a foreign
 * concept declared in ANOTHER FILE OF THIS COMPILATION is already in the index under its
 * `origin|library` key, so an in-`sources` cross-library operand IS resolvable and is a cheap
 * follow-up (needs a scope alias→origin mapping); only a package library known solely via
 * `KnownLibraryEntry` (names, no shape) is genuinely unresolvable. Deferred: cross-library operand
 * resolution (self-scope covers every operand the corpus authors today).
 */
function resolveConcept(name: string, library: string | undefined, ctx: ResolveCtx): Concept | undefined {
  const isSelf = library === undefined || library === ctx.ownLibrary;
  if (isSelf) return ctx.index.get(ctx.ownKey)?.get(name);
  return undefined; // foreign-qualified: self-scope-only for now — skip (see docstring)
}
