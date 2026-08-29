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

import type { SourceContext } from "../imports/scopes";

import type { ReductionShapeError, ReductionShapeRule, ValidationError } from "./validator";
import { assumedShapePreMigration } from "../grammar/conceptShapes";
import { matchNarrative } from "../template-match/matcher";
import { PATTERN_RETURN_SHAPE } from "../cql-emitter/patternReturnShape";

// #189 grammar+validation slice — the reduction/shape COHERENCE layer. IMPL 1 shipped the
// PERMISSIVE grammar+AST (the `- shape is …` clause, the `Reduction` discriminated union, the
// dedicated `count … at least N` production). This validator makes the INCOHERENT combinations a
// TEACHING WARNING: it validates ONE VERSION AHEAD of the emit flip (design §9 step 1), so every
// finding here is an intrinsic `severity: "warning"` — `isValid` stays true. Emit is unchanged
// until the flip; a reduction still fails LOUD at emit (`reductionNotEmittable` / the
// `emit-reduction-not-active` sentinel), and a `shape is` marker is not yet consulted by emit.
//
// The load-bearing model (docs/CRL-NORTH-STAR.md): a concept is self-describing. Its declared
// `shape` decides whether a reduction is owed — Scalar ⇒ publishes ONE reduced value (a reduction
// is owed); Record ⇒ ONE selected record; RecordSet ⇒ the set of records. A reduction reduces a
// RECORD SET (the concept's own representation records `this`, or a NAMED `shape is RecordSet`
// concept) down to a scalar (`exists`/`count` ⇒ boolean) or a record (`most recent`).
//
// Rules (all WARNINGS; see .vibe-tools/discussions/415 + the ReductionShapeRule doc in validator.ts):
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
            `concept's own representation records, but it declares none (no \`code is\`, no ` +
            `\`source representation\`). Add a representation, or reduce a named \`shape is RecordSet\` ` +
            `concept instead of \`this\`.`,
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
    if (shape === "RecordSet" && (reduction || narrativeLeadsWithMostRecent(def))) {
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
        narrativeLeadsWithMostRecent(def) ||
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
              `says WHICH record it publishes. \`shape is Record\` is a contract; author into it — a ` +
              `selection (\`- definition is most recent this.\`), a threshold, or a calculation. Or ` +
              `change the shape (\`Scalar\` to publish a reduced value, \`RecordSet\` to publish the set).`
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
      // The suggested reduction is conditioned on value type FIRST, then representation count. A boolean
      // presence determination is `exists this` — valid over MULTIPLE representations too (design §6: the
      // union of each rep's existence, dedup-immune), so repCount is irrelevant there (panel R3 gpt56 #2).
      // A value-reading `most recent this` is the multi-rep-ambiguous one: with a `code is` + posrep(s)
      // (repCount > 1) it would span every rep and trip `reduction-multi-rep`, so steer to promoting a
      // single representation to a named RecordSet instead (F6).
      const action =
        vt === "boolean" || vt === undefined
          ? "add \`- definition is exists this.\` (a boolean presence determination — valid over " +
            "multiple representations too)"
          : repCount > 1
            ? `promote a single representation to a named \`- shape is RecordSet.\` concept and reduce ` +
              `THAT (a \`most recent this\` here would span ${repCount} representations — see ` +
              `reduction-multi-rep)`
            : `add \`- definition is most recent this.\` (to publish the most recent record's \`${vt}\` value)`;
      this.warn(
        "no-bare-scalar-code",
        concept.name,
        `Concept "${concept.name}" is Scalar with a local \`code is\` but no reduction. A Scalar ` +
          `concept publishes a single reduced value; a bare \`code is\` publishes the raw local code ` +
          `as a boolean existence. State the reduction explicitly: ${action}. NOTE: authoring the ` +
          `reduction NOW will FAIL emit (\`emit-reduction-not-active\` — a \`code is\` + reduction ` +
          `is not yet emittable) until the flip version; make the change when the flip lands, or behind ` +
          `it. (Validate-only migration prompt — this concept's current emit is unchanged in N.)`,
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
 * Does a concept definition lead with a narrative `most recent …` selection? Detects the UN-folded
 * `most recent "X"` form (which stays a DefinitionIsDefinition — only `most recent this` folds to a
 * Reduction, IMPL 1), so a `shape is Record` selecting from a named RecordSet is not false-flagged as
 * "does not select a record." Structural (leading `[NWord "most", NWord "recent"]`) — it does not
 * reach into the catalog matcher (which owns whether the tail resolves to a real record set).
 */
/**
 * True iff `def` is a definition whose RESULT is a single value/record rather than a set.
 *
 * ⭐ This is what "authoring into the `shape is Record` contract" means for the non-selection forms:
 * a threshold (`"BMI" at least 30 'kg/m2'`), a calculation (`body mass index of "Weight" and "Height"`)
 * and an existence reduction each produce exactly ONE value. Only a set-producing form leaves the
 * contract unmet.
 *
 * Keyed off the SHARED catalog return-shape table so this cannot drift from the emitter's own view:
 * `list` is the only set-producing shape; `instance` / `boolean` / `other` are single.
 * A narrative whose pattern does not resolve is treated as NOT single — fail-closed, so an unknown
 * form gets the author-time prompt rather than silent acceptance.
 */
/**
 * True iff `def` is a narrative that resolves to a REAL catalog pattern.
 *
 * ⚠ `matchNarrative` does NOT return `undefined` for text it cannot match — it hands back the raw
 * narrative source as the `pattern` name. So "did it match?" is "is the returned name a key of the
 * shared return-shape table?", never a null check. Getting that wrong sent an unmatched calculation
 * (`body mass index of "Weight" and "Height"`) down the "yields a SET" branch and printed the wrong
 * cause at the author.
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
  const shape = PATTERN_RETURN_SHAPE[matchNarrative(def.body).pattern];
  return shape === "instance" || shape === "boolean" || shape === "other";
}

function narrativeLeadsWithMostRecent(def: ConceptDefinition | undefined): boolean {
  if (def?.type !== "DefinitionIsDefinition") return false;
  const els = def.body.elements;
  return (
    els.length >= 2 &&
    els[0].type === "NWord" &&
    els[0].value === "most" &&
    els[1].type === "NWord" &&
    els[1].value === "recent"
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
