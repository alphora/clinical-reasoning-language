// #257 (age slice) T1 — the catalog-of-HOW behind a rep-level `value projection is` that
// recency-merges (2-rep, with a local `code is`) or, standalone (1-rep), DETERMINES a concept.
//
// This is the SINGLE source of truth both the author-time validator (`AgePredicateValidator`)
// and the emit lowering (`lowerLocalCodes`) consult, so "is this projection recency-mergeable?"
// cannot drift between validate and emit — the same lesson `sanctionedAgeTodayOp` already
// encodes for the retired `definition is age today` carve-out (see the #215 note atop
// `agePredicateValidator.ts`). It lives in `template-match` (the catalog layer) precisely so the
// validator can import it WITHOUT importing `cql-emitter` (validate must never depend on emit).
//
// A `RecencyProjectionOverride` is catalog DATA, not narrative matching: it names the built
// resource + value-element carrier, the datum `value type`, the recency-timestamp INVARIANT of
// the projection (NOT authored — bounded-language principle: no `recency is` keyword), and the
// CQL helper the emit renders. (The compute fn is NOT on the override — it is a per-unit HOW,
// `AgeAt` years / `AgeInMonths` months, carried on `AgeProjectionArgs.computeFn`, #257 T2.) T1
// ships EXACTLY ONE — age-today over `Patient.birthDate`, timestamp `Patient.meta.lastUpdated`.
// Age is ONE caller of the override mechanism, not a hardcoded `__bothRepMerge === "recency"`
// engine branch. The recency merge stays age-SHAPED in the CQL catalog
// (`CaseFeatureCommon.recencyAgeTruths` / `CRLCommon.AgeAt` / `CRLCommon.AgeInMonths`);
// this module is the compile-time TS seam that makes it a lookup, keeping the emitted CQL
// byte-identical to the retired carve-out.

import type { AgeComputeFn, AgeRecencyOp, Concept, NarrativeClause, Representation } from "../ast/types";
import { isAgeAtStartOfPrefix, isAgeTodayPrefix, sanctionedAgeTodayOp } from "./agePredicate";
import type { CanonicalArg } from "./canonicalTypes";
import { matchNarrative } from "./matcher";

/** A built recency/determination projection override. T1 ships one; the shape is deliberately
 *  descriptor-only so a future non-age projection registers its own entry rather than editing a
 *  generic engine. */
export interface RecencyProjectionOverride {
  /** Stable override id, carried on the synthetic twin so the emit looks the override up rather
   *  than re-sniffing the narrative. */
  readonly id: string;
  /** The posrep `type is` this override projects over. */
  readonly sourceType: string;
  /** The posrep `value element is` path (the projected datum). */
  readonly valueElementPath: string;
  /** The posrep `value type is` (the datum's shape). */
  readonly repValueType: string;
  /** The concept-level `value type` the projection RESULTS in (age today <cmp> N → boolean). The
   *  concept declaring an age projection must declare THIS as its value type, else the emit would
   *  produce a boolean truth-set under a mismatched concept contract. */
  readonly resultValueType: string;
  /** The recency-timestamp element — an INVARIANT of the built projection, not authored. The CQL
   *  helper reads it internally (documented here for the catalog boundary, not rendered by TS). */
  readonly recencyTimestamp: string;
  /** The CaseFeatureCommon helper the recency emit renders (`CFH.<helper>(newestLocal, computed)`). */
  readonly recencyHelper: string;
  // NOTE: the compute fn is NOT on the override — it is a per-UNIT HOW (`AgeAt` years /
  // `AgeInMonths` months, #257 T2), chosen by the matcher and carried on `AgeProjectionArgs.computeFn`
  // / the `__recencyComputeFn` twin marker, so a single override serves both units.
}

/** The sole T1 override: patient age-today over `Patient.birthDate`, recency timestamp
 *  `Patient.meta.lastUpdated`. */
export const AGE_TODAY_OVER_BIRTHDATE: RecencyProjectionOverride = {
  id: "age-today-over-patient-birthdate",
  sourceType: "Patient",
  valueElementPath: "Patient.birthDate",
  repValueType: "date",
  resultValueType: "boolean",
  recencyTimestamp: "Patient.meta.lastUpdated",
  recencyHelper: "recencyAgeTruths",
};

const OVERRIDES: readonly RecencyProjectionOverride[] = [AGE_TODAY_OVER_BIRTHDATE];

/** Look an override up by its stable id (the marker the synthetic twin carries). */
export function recencyOverrideById(id: string): RecencyProjectionOverride | undefined {
  return OVERRIDES.find((o) => o.id === id);
}

/** The sanctioned age-today comparator + compute fn + rendered threshold parsed from a projection. */
export interface AgeProjectionArgs {
  op: AgeRecencyOp;
  /** The no-arg compute fn the matcher chose from the threshold's unit (`AgeAt` years /
   *  `AgeInMonths` months, #257 T2) — READ OFF the matched call, never re-derived here, so the
   *  recency emit's fn cannot drift from the standalone lower's. */
  computeFn: AgeComputeFn;
  /** The threshold as a CQL quantity literal (e.g. `18 'years'` / `6 'months'`), rendered from the
   *  canonical arg. */
  threshold: string;
}

/**
 * Resolution of a posrep's `value projection` against the built override catalog. The lowering
 * ACTS on `match` (build the twin / determination) and rejects `wrong-carrier` /
 * `unsanctioned-age-attempt`; `not-age` keeps the existing representation behavior (a non-age
 * projection is out of scope for T1 — general posrep emit is #257).
 */
export type ProjectionResolution =
  | { kind: "match"; override: RecencyProjectionOverride; args: AgeProjectionArgs }
  | {
      kind: "wrong-carrier";
      override: RecencyProjectionOverride;
      args: AgeProjectionArgs;
      /** Human-readable carrier mismatches (type / value element / value type). */
      mismatches: string[];
    }
  | { kind: "unsanctioned-age-attempt" }
  /** An anchored `age at start of "<anchor>" …` projection — it references the anchor CONCEPT, so it
   *  is a concept-level `definition is` calculation, NOT a datum-local projection (A.5 rejects it at
   *  author time; the emit boundary must too, not silently stub). */
  | { kind: "anchored-in-projection" }
  | { kind: "not-age" };

function renderQuantityArg(arg: Extract<CanonicalArg, { type: "QuantityArg" }>): string {
  return arg.unit ? `${arg.value} '${arg.unit}'` : `${arg.value}`;
}

/**
 * Classify a posrep's `value projection` (T1: age-today only). Recognition is PROJECTION-driven —
 * keyed on the sanctioned age-today canonical family via the SHARED `sanctionedAgeTodayOp`
 * classifier (never a second narrative sniff) — then the carrier (`type`/`value element`/`value
 * type`) is checked against the override so a sanctioned age projection on the WRONG carrier gets
 * a distinct diagnostic from a projection that is not age at all.
 *
 * A projection that does not even LEAD with `age today` is `not-age` (e.g. `most recent`,
 * `convert to canonical units`, or the anchored `age at start of` which references a concept and
 * is a concept-level `definition is` job) — T1 leaves those to the existing representation lane.
 */
export function resolveRecencyProjection(rep: Representation): ProjectionResolution {
  const projection = rep.valueProjection;
  if (!projection) return { kind: "not-age" };
  const clause: NarrativeClause = projection.body;

  // An anchored `age at start of …` in a projection references a concept — it belongs in a
  // concept-level `definition is`, not a datum-local projection. Recognize it so the emit boundary
  // rejects it loudly (A.5 owns the author-time diagnostic).
  if (isAgeAtStartOfPrefix(clause)) return { kind: "anchored-in-projection" };
  // Only an `age today …` prefix is in T1's remit; every other projector is left alone.
  if (!isAgeTodayPrefix(clause)) return { kind: "not-age" };

  // It IS an age-today attempt — require a sanctioned comparator over a no-arg compute fn
  // (`AgeAt()` years / `AgeInMonths()` months) whose unit MATCHES the threshold (the SAME shared
  // gate the four age-today matchers and the validator use, so the forms are classified
  // identically). An unsanctioned comparator/unit — or an inconsistent fn/unit pair — is a LOUD
  // author error, never a silent stub. The compute fn is READ OFF the matched call (the matcher is
  // the sole choice point), never re-derived from the unit here.
  const matched = matchNarrative(clause);
  const sanctioned = sanctionedAgeTodayOp(matched);
  if (sanctioned === null) return { kind: "unsanctioned-age-attempt" };
  const qArg = matched.args[1];
  if (qArg.type !== "QuantityArg") return { kind: "unsanctioned-age-attempt" };
  const args: AgeProjectionArgs = {
    op: sanctioned.op,
    computeFn: sanctioned.computeFn,
    threshold: renderQuantityArg(qArg),
  };

  // Carrier check against the sole override. A sanctioned age-today projection on the wrong
  // resource / value element / value type is a recognized-but-misplaced projection — a distinct
  // diagnostic from "no projection" so migration errors do not misleadingly claim none exists.
  const override = AGE_TODAY_OVER_BIRTHDATE;
  const mismatches: string[] = [];
  if (rep.conceptType !== override.sourceType) {
    mismatches.push(`type is ${rep.conceptType ?? "(none)"} (expected ${override.sourceType})`);
  }
  if (rep.valueElement?.path !== override.valueElementPath) {
    mismatches.push(
      `value element is ${rep.valueElement?.path ?? "(none)"} (expected ${override.valueElementPath})`,
    );
  }
  // Require EXACTLY one value type equal to the carrier's — a posrep with `["date", …]` must not
  // resolve as a match on the strength of one entry (the general A.9 `multiple-value-types` catches
  // it at author time, but the emit boundary does not run the Validator).
  const repVts = rep.valueTypes ?? [];
  if (repVts.length !== 1 || repVts[0] !== override.repValueType) {
    mismatches.push(
      `value type is ${repVts.join("/") || "(none)"} (expected exactly ${override.repValueType})`,
    );
  }
  if (mismatches.length > 0) return { kind: "wrong-carrier", override, args, mismatches };
  return { kind: "match", override, args };
}

/**
 * The WHOLE-CONCEPT age classification — the single source of truth the author-time validator AND
 * both emit lowering lanes consult, so the concept-shape disposition lattice (not just the sanctioned
 * comparator set) cannot drift between validate and emit. Returns the valid form (`recency` /
 * `standalone`) or a typed, message-carrying error for every age-shaped mis-authoring; `not-age`
 * leaves the concept to the ordinary representation lane.
 *
 * The `hasCode`/`hasDefinition` branches align with which lowering function processes the concept:
 * `lowerLocalCodes` (code-bearing) acts on `recency` + its errors; `lowerStandaloneAgePosreps`
 * (no-code) acts on `standalone` + its errors. The validator reports EVERY error (code + no-code),
 * except the `anchored` one (A.5 / `value-projection-references-concept` owns that at author time).
 */
export type AgeConceptResolution =
  | { kind: "not-age" }
  | { kind: "recency"; override: RecencyProjectionOverride; args: AgeProjectionArgs }
  | { kind: "standalone"; override: RecencyProjectionOverride; args: AgeProjectionArgs }
  | { kind: "error"; errorKind: string; message: string; anchored?: boolean };

export function resolveAgeConcept(concept: Concept): AgeConceptResolution {
  const reps = concept.representations ?? [];
  const ageResults = reps
    .map((r) => resolveRecencyProjection(r))
    .filter((res) => res.kind !== "not-age");
  if (ageResults.length === 0) return { kind: "not-age" };
  if (ageResults.length > 1) {
    return err(
      "emit-mixed-code-and-definition",
      `Concept "${concept.name}" declares more than one age \`source representation\`. Patient age ` +
        `is a single Patient projection; declare exactly one.`,
    );
  }
  const res = ageResults[0];
  if (res.kind === "anchored-in-projection") {
    return err(
      "emit-age-projection-unsupported",
      `Concept "${concept.name}": \`value projection is age at start of …\` references the anchor ` +
        `concept, so it is a concept-level calculation, not a datum-local projection. Author it as ` +
        `a concept-level \`- definition is age at start of "<anchor>" <cmp> <n> years.\` (NOT inside ` +
        `a \`source representation\`).`,
      true,
    );
  }
  if (res.kind === "unsanctioned-age-attempt") {
    return err("emit-age-projection-unsupported", ageProjectionUnsupportedMessage(concept.name));
  }
  if (res.kind === "wrong-carrier") {
    return err("emit-age-projection-wrong-carrier", ageProjectionWrongCarrierMessage(concept.name, res.mismatches));
  }
  // res.kind === "match" — a recency-mergeable Patient age projection. Now the whole-concept shape.
  const override = res.override;
  const vts = concept.valueTypes ?? [];
  if (!(vts.length === 1 && vts[0] === override.resultValueType)) {
    return err(
      "emit-mixed-code-and-definition",
      `Concept "${concept.name}" declares an age \`value projection\` (which computes a ` +
        `${override.resultValueType}) but its \`value type is ${vts.join("/") || "(none)"}\`. A ` +
        `concept with a Patient age projection must declare \`- value type is ` +
        `${override.resultValueType}.\`.`,
    );
  }
  if (reps.length > 1) {
    return err(
      "emit-mixed-code-and-definition",
      `Concept "${concept.name}" carries a Patient age \`source representation\` AND another ` +
        `representation. Patient-age recency is a 2-representation form (a local \`code is\` override ` +
        `plus the Patient age projection); a third representation is out of scope this round (#257).`,
    );
  }
  const hasCode = concept.code !== undefined;
  const hasDef = concept.definition !== undefined;
  if (hasCode && hasDef) {
    return err(
      "emit-mixed-code-and-definition",
      `Concept "${concept.name}" carries a local \`code is\`, a top-level \`definition\`, AND a ` +
        `Patient age \`source representation\`. Author patient age as a \`code is\` local override ` +
        `PLUS the age \`source representation\` (no top-level \`definition\`).`,
    );
  }
  if (!hasCode && hasDef) {
    return err(
      "emit-mixed-code-and-definition",
      `Concept "${concept.name}" carries a top-level \`definition\` AND a Patient age \`source ` +
        `representation\`. A standalone patient-age determination is JUST the age \`source ` +
        `representation\` (no \`definition\`); with a local assertion, add a \`code is\` override ` +
        `(and remove the \`definition\`).`,
    );
  }
  if (hasCode) {
    if (concept.conceptType !== undefined && concept.conceptType !== "Observation") {
      return err(
        "emit-mixed-code-and-definition",
        `Concept "${concept.name}" is a patient-age recency both-representation (\`code is\` + an age ` +
          `\`source representation\`) but its \`type is ${concept.conceptType}\`. The local override's ` +
          `recency merge emits an Observation-boolean retrieve, so the concept's local \`type\` must ` +
          `be Observation — omit \`type is\` (the implicit-standard local Observation) or write ` +
          `\`- type is Observation.\`.`,
      );
    }
    return { kind: "recency", override, args: res.args };
  }
  return { kind: "standalone", override, args: res.args };
}

function err(errorKind: string, message: string, anchored = false): AgeConceptResolution {
  return { kind: "error", errorKind, message, anchored };
}

// ─── Shared diagnostics (one wording across lowering, the standalone pass, the validator,
//     and the emit-boundary retirement scan — so they cannot drift) ─────────────────────

/** The supported age-today projection shape, for an unsanctioned-attempt diagnostic. */
export function ageProjectionUnsupportedMessage(conceptName: string): string {
  return (
    `Concept "${conceptName}": the age \`source representation\`'s ` +
    `\`value projection is age today …\` is not a supported age predicate. Supported: ` +
    `\`age today <at least | at most | under | younger than> <n> <years|months>\` — a YEARS or ` +
    `MONTHS quantity. Use \`under\` (not \`less than\`); age is computed in whole years or whole ` +
    `months.`
  );
}

/** A sanctioned age-today projection sitting on the wrong carrier (resource / element / type). */
export function ageProjectionWrongCarrierMessage(conceptName: string, mismatches: string[]): string {
  const o = AGE_TODAY_OVER_BIRTHDATE;
  return (
    `Concept "${conceptName}": a \`value projection is age today …\` projects only over the ` +
    `Patient age carrier, but this representation does not match it (${mismatches.join("; ")}). ` +
    `Model patient age as \`- type is ${o.sourceType}.\`, \`- value element is ` +
    `${o.valueElementPath}.\`, \`- value type is ${o.repValueType}.\`, and the ` +
    `\`- value projection is age today ….\`.`
  );
}

/**
 * The retirement diagnostic for an authored `definition is age today …`. Shows BOTH replacement
 * variants — the local-override (2-rep recency) form and the standalone (posrep-only) form — so
 * neither a local-code author nor a standalone author is left guessing which to write.
 */
export function ageRetirementMessage(conceptName: string): string {
  const o = AGE_TODAY_OVER_BIRTHDATE;
  return (
    `Concept "${conceptName}": \`definition is age today …\` is RETIRED. Patient age is now ` +
    `modeled as a \`source representation\` over \`${o.valueElementPath}\` with a ` +
    `\`value projection\` (see the representation-reference exemplar). ` +
    `WITH a local override, keep \`- code is \`…\`.\` and add:  ` +
    `- source representation: - type is ${o.sourceType}. - value element is ` +
    `${o.valueElementPath}. - value type is ${o.repValueType}. - value projection is age today ` +
    `<at least|at most|under|younger than> <n> <years|months>.  ` +
    `For a STANDALONE determination (no local assertion), author that same \`source ` +
    `representation\` WITHOUT a \`code is\`. (The anchored \`age at start of "<anchor>" …\` ` +
    `stays a concept-level \`definition is\`.)`
  );
}

/**
 * True iff `concept` carries an AUTHORED (not synthesized-from-posrep) `definition is age
 * today …` — the retired carve-out. Shared by the author-time validator and the emit-boundary
 * retirement scan so they cannot drift. `age at start of …` (anchored, references a concept) is
 * NOT age-today and is NOT retired.
 */
export function isRetiredAgeTodayDefinition(concept: Concept): boolean {
  return (
    concept.__synthesizedFromPosrep !== true &&
    concept.definition?.type === "DefinitionIsDefinition" &&
    isAgeTodayPrefix(concept.definition.body)
  );
}
