import {
  getRefName,
  getRefLibrary,
  type CRL,
  type Concept,
  type ConceptDefinition,
  type ConceptShape,
  type Reduction,
  type Statement,
  type Location,
} from "../ast/types";
import type { SourceContext } from "../imports/scopes";

import type { ReductionShapeError, ReductionShapeRule, ValidationError } from "./validator";

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
//   recordset-operand-required        — a named reduction operand X that is not `shape is RecordSet`
//   reduction-result-nonboolean       — an exists/count reduction on a Scalar concept typed non-boolean
//   reduction-this-no-representation  — a `<reduction> this` on a concept with no representation
//   reduction-multi-rep               — a `most recent this` / `count this` with >1 representation
//   recordset-scalar-reduction        — a RecordSet concept carrying a reduction
//   recordset-bare-code-incoherent    — a RecordSet concept that is a bare `code is` (existence, not a set)
//   record-shape-invariant            — a Record concept without a record-selecting `most recent`
//                                       (or whose `type is R` disagrees with the RecordSet<R> operand)
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
  ): void {
    const e: ReductionShapeError = {
      kind: "reduction-shape",
      rule,
      conceptName,
      message,
      location: { start: { ...location.start }, end: { ...location.end } },
      severity: "warning",
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
    // (ast/types.ts Concept.shape), so no `?? "Scalar"` coalesce is needed anywhere here.
    const shape: ConceptShape = concept.shape;
    const def = concept.definition;
    const reduction: Reduction | undefined =
      def?.type === "ReductionDefinition" ? def.reduction : undefined;
    const hasCodeIs = concept.code !== undefined;
    const reps = concept.representations?.length ?? 0;
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
        if (operand && operand.shape !== "RecordSet") {
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

    // recordset-scalar-reduction — a RecordSet publishes its records, not a reduced value.
    if (shape === "RecordSet" && reduction) {
      this.warn(
        "recordset-scalar-reduction",
        concept.name,
        `Concept "${concept.name}" is \`shape is RecordSet\` but carries a \`definition is ` +
          `${verb(reduction)} …\` reduction. A RecordSet publishes its set of records; a reduction ` +
          `produces a single reduced value. Declare \`- shape is Scalar.\` (or \`Record\`) to reduce, ` +
          `or drop the reduction to publish the set.`,
        loc,
        attribution,
        errors,
      );
    }

    // recordset-bare-code-incoherent — a bare local `code is` is a boolean existence, not a record set.
    if (shape === "RecordSet" && hasCodeIs && reps === 0 && !reduction) {
      this.warn(
        "recordset-bare-code-incoherent",
        concept.name,
        `Concept "${concept.name}" is \`shape is RecordSet\` but its only representation is a bare ` +
          `local \`code is\` — that is a boolean EXISTENCE determination, not a set of records. A ` +
          `RecordSet needs a record-yielding representation (a \`source representation\` of a dated ` +
          `resource) or a record-set derivation. Declare \`- shape is Scalar.\` if this is a presence ` +
          `determination.`,
        loc,
        attribution,
        errors,
      );
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
      const selectsRecord =
        (reduction !== undefined && reduction.kind === "mostRecent") || narrativeLeadsWithMostRecent(def);
      if (!selectsRecord) {
        this.warn(
          "record-shape-invariant",
          concept.name,
          `Concept "${concept.name}" is \`shape is Record\` but does not select a single record. A ` +
            `Record publishes ONE selected record — declare \`- definition is most recent this.\` (or ` +
            `\`most recent "SomeRecordSet".\`) to select it, or change the shape (\`Scalar\` to reduce ` +
            `to a value, \`RecordSet\` to publish the set).`,
          loc,
          attribution,
          errors,
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
    if (shape === "Scalar" && hasCodeIs && def === undefined) {
      // The suggested reduction is conditioned on how many records the concept has: with a single
      // representation (`code is` only), a direct `exists this` / `most recent this`; with a `code is`
      // + posrep(s) (repCount > 1), a `most recent this` here would span every rep and immediately
      // trip `reduction-multi-rep`, so steer to promoting a single representation instead (F6).
      const action =
        repCount > 1
          ? `promote a single representation to a named \`- shape is RecordSet.\` concept and reduce ` +
            `THAT (a \`most recent this\` here would span ${repCount} representations — see ` +
            `reduction-multi-rep)`
          : vt === "boolean" || vt === undefined
            ? "add \`- definition is exists this.\` (a boolean presence determination)"
            : `add \`- definition is most recent this.\` (to publish the most recent record's \`${vt}\` value)`;
      this.warn(
        "no-bare-scalar-code",
        concept.name,
        `Concept "${concept.name}" is Scalar with a local \`code is\` but no reduction. A Scalar ` +
          `concept publishes a single reduced value; a bare \`code is\` publishes the raw local code ` +
          `as a boolean existence. State the reduction explicitly: ${action}. NOTE: authoring the ` +
          `reduction NOW will FAIL emit (\`emit-mixed-code-and-definition\` — a \`code is\` + reduction ` +
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
