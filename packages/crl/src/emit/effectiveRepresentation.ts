// #189 T1 — the effective-representation descriptor + its pure deriver (design §4; crl-emit panel disc 423).
//
// The descriptor is the single structured source both emit lanes will (at the flip) read to derive a LOCAL
// concept's `{resourceType, coding, value, result type, recency}`. T1 is ADDITIVE and INERT: this module ships
// the types + a pure deriver + tests, wired into NEITHER lane (no production module outside `src/emit/` imports
// it). Arms: `local-exact` (a `code is` concept), `uncoded` (Patient/birthDate age posrep), and — as of #189 B1 —
// `source` (a `source representation:` posrep's coded external value-read; design §4/§6). The `source` arm is
// DESCRIBED but INERT: it is derived only as the SECOND arm of a both-rep (local `code is` + `source
// representation`) concept so the descriptor confronts §6 ("the descriptor list is all in-scope arms") rather than
// surfacing an opaque `deferredArms` stub; NO emit consumer reads it yet (the atomic flip F wires it), and a
// source-ONLY concept stays `status:"deferred"` (out of #189 scope past F — sourced-CEL is #257, design §10).
// Extending the union to `source` supersedes design §0/§4's "two arms only" (see the decision-log amendment).
//
// #189 B4 (disc 501): the CEL instance lane (`cel/emitter/emitFhir.ts`) is now the FIRST production consumer of
// `deriveEffectiveRepresentations` — it resolves a LOCAL fact's `local-exact` arm to write a CodeableConcept datum
// (`valueElement`/`datumValueType`) as `valueCodeableConcept` (the value/interface local-override arm, disc 496),
// rather than reading raw `concept.valueTypes` (which skips the coding-element-conflation guard). The `source` arm
// stays INERT (F/#257); only the `local-exact` value datum is read, and only for a `role: "local"` CC concept.

import type { Concept, Representation, ReferenceName } from "../ast/types";
import { hasLocalCode, hasSourceBinding } from "./conceptDatumSignals";
import { localCodeSystemUrl } from "../fhir-emitter/slug";
import { relativeElementPath } from "../fhir-model/elementPath";
import { valueReadElementsAdmitting, valueReadValueTypes } from "../fhir-model/fhirValueModel";
import type { ConceptValueType } from "../grammar/conceptValueTypes";
import type { ResultType } from "../grammar/resultType";
import { conceptResultType } from "../grammar/resultType";
import {
  resolveAgeConcept,
  AGE_TODAY_OVER_BIRTHDATE,
} from "../template-match/recencyProjectionOverride";
import { isPureQuestionConcept } from "../template-match/recencyValueConcept";

import { assumedShapePreMigration } from "../grammar/conceptShapes";
import {
  resourceEmitRow,
  type CodingStrategy,
  type RecencyAccess,
  type ResourceEmitRow,
} from "./resourceEmitRegistry";

// #189 Piece 1 — re-export `RecencyAccess` so the CQL emitter's recency-value merge can type its recency
// fragments WITHOUT importing `resourceEmitRegistry` directly (the architectural guard: the registry is reached
// ONLY via this module — `effectiveRepresentation.test.ts` enforces it).
export type { RecencyAccess } from "./resourceEmitRegistry";

/** The OWNING library's identity — resolved by the caller (the flip resolves which library a concept belongs to;
 *  T1 stays pure over resolved metadata, design §4 sibling-lib rule). All three fields are REQUIRED non-empty:
 *  `localDomainId` feeds `localCodeSystemUrl` (which would otherwise manufacture an `unnamed-local` slug) and
 *  `libraryName` names the owning library in a fail-closed diagnostic (panel R2). */
export type OwningLibraryMetadata = {
  libraryName: string;
  canonicalBase: string;
  localDomainId: string;
};

/** A concept's effective representation for the LOCAL emit path. `valueElement` is a RELATIVE read path
 *  (`value`, `birthDate`) — the resource lives in `resourceType`, so the CQL lane composes `<alias>.<valueElement>`
 *  without re-stripping a qualified prefix (panel R2 path convention). `valueElement`/`datumValueType` are BOTH
 *  absent for a valueless-existence local-exact arm AND for a record-shaped result (panel R2). */
export type EffectiveRepresentationDescriptor =
  | {
      arm: "local-exact";
      resourceType: string;
      coding: CodingStrategy;
      system: string;
      code: string;
      resultType: ResultType;
      recency: RecencyAccess;
      owningLibrary: OwningLibraryMetadata;
      valueElement?: string;
      datumValueType?: ConceptValueType;
    }
  | {
      arm: "uncoded";
      resourceType: "Patient";
      valueElement: string;
      datumValueType: ConceptValueType;
      resultType: ResultType;
      recency: RecencyAccess;
    }
  | {
      // #189 B1 — a `source representation:` posrep's coded external value-read (design §4/§6). The coding axis
      // (`coding` — the MEMBERSHIP retrieve element, e.g. `ServiceRequest.code`/`Observation.code`) is SEPARATE
      // from the datum axis (`valueElement` — the value READ, e.g. `Observation.value`); they coincide for
      // `ServiceRequest.code` but must not be conflated (disc 496). `terminologyRef` PRESERVES the `coded from`
      // reference's qualified identity (URL resolution + membership is B5). `resultType` is the CONCEPT's published
      // result (duplicated per arm like `local-exact`, so a both-rep's two arms cannot drift). INERT in B1 — no
      // emit consumer reads it (the flip F wires it).
      arm: "source";
      resourceType: string;
      coding: CodingStrategy;
      valueElement: string;
      datumValueType: ConceptValueType;
      terminologyRef: ReferenceName;
      resultType: ResultType;
      recency: RecencyAccess;
      owningLibrary: OwningLibraryMetadata;
    };

/** The reason a source arm was DEFERRED (not derived to a `source` descriptor): a genuine `DerivationErrorKind`,
 *  or `source-binding-unsupported` (a valid value read with NO `coded from` — `coded from` is optional, A.1, so
 *  its absence is a coding-axis deferral, NOT a value-path error), or `out-of-scope` (a projection/age source rep,
 *  or a concept-level `coded from` base with no posrep to derive). */
export type SourceDeferralReason = DerivationErrorKind | "source-binding-unsupported" | "out-of-scope";

/** An in-scope arm the deriver DID NOT derive to a descriptor, surfaced (with its TYPED reason) so the flip must
 *  confront design §6 (the descriptor list is "all in-scope arms") rather than silently narrowing a local+source
 *  concept to local-only. Post-B1 a SUPPORTED source arm becomes a `source` descriptor instead; this carries only
 *  the unsupported/out-of-scope reps. */
export type DeferredArm = { kind: "source"; reason: SourceDeferralReason; detail: string };

export type DerivationErrorKind =
  | "unsupported-resource"
  | "indeterminate-result-type"
  | "value-element-unmappable"
  // #189 §4.1 T1 extension — the three DISTINCT fail-closed diagnostics of a `most recent this` typed value
  // read (design §8 "value-type-must-match-a-real-element"): the element is unmodeled (fail closed), the
  // resource is modeled-valueless (∅, no value to read), or the declared value type is not admitted.
  | "value-read-unmodeled"
  | "value-read-valueless"
  | "value-type-not-admitted"
  // #189 B1 (disc 497) — a LOCAL value read whose element IS the resource's coding element returns the concept's
  // own identity code, not a datum (the disc-496 value-path conflation on the local arm).
  | "value-read-is-coding-element"
  | "unsupported-reduction-form"
  | "invalid-owning-library-metadata"
  | "malformed-representation";

/** A composable, case/fact-free fail-closed diagnostic (design §5). The deriver is a PURE CONCEPT function, so
 *  it carries concept + owning-library identity; the CEL lane (T6) wraps it with case/fact identity. */
export type DerivationError = {
  kind: DerivationErrorKind;
  concept: string;
  owningLibrary: string;
  resourceType?: string;
  field?:
    | "canonicalBase"
    | "localDomainId"
    | "libraryName"
    | "coding"
    | "recency"
    | "valueElement"
    | "resultType";
  detail: string;
};

/** Tri-state (panel R2 Q3): a `derived` concept publishes 0+ descriptors (empty = a legitimately
 *  instance-less pure-derived concept); `deferred` is a source-ONLY valid-but-out-of-#189-scope concept the CQL
 *  lane still emits but the CEL lane fails closed on at the flip; `error` is malformed/unmappable. `[]` is RESERVED
 *  for pure-derived — a source-ONLY concept is `deferred`, never `derived{[]}`.
 *
 *  #189 B1 CONTRACT CHANGE: `descriptors` now may contain a `source` arm ALONGSIDE `local-exact` (a both-rep
 *  concept → `[local-exact, source]`). Presence-in-`descriptors` therefore NO LONGER implies "emittable by the
 *  current emitter": the `source` arm is INERT until the flip F. Today's consumers stay correct only because they
 *  either enforce the single-descriptor invariant (`lowerLocalCodes` `most recent this`) or `.find` a specific arm
 *  (`caseFeatureRecord` finds `local-exact`, ignoring `source`). A FUTURE consumer that ITERATES `descriptors`
 *  assuming every entry is emittable is the next drift lane — gate on `arm` explicitly. */
export type DerivationOutcome =
  | {
      status: "derived";
      descriptors: EffectiveRepresentationDescriptor[];
      deferredArms?: DeferredArm[];
    }
  | { status: "deferred"; reason: "sourced" }
  | { status: "error"; error: DerivationError };

// The qualified→relative element-path strip is the lane-neutral `relativeElementPath` (shared with the flip's
// validate-lane consumer, which must not import emit). Aliased locally to keep the call sites below unchanged.
const relativePath = relativeElementPath;

/** The first empty owning-metadata field, or `null` if all three are present. */
function firstEmptyOwningField(
  m: OwningLibraryMetadata,
): "libraryName" | "canonicalBase" | "localDomainId" | null {
  if (!m.libraryName?.trim()) return "libraryName";
  if (!m.canonicalBase?.trim()) return "canonicalBase";
  if (!m.localDomainId?.trim()) return "localDomainId";
  return null;
}

/** The `uncoded` (Patient age) descriptor — every literal read off the override catalog, the declared single
 *  source of truth (never re-typed here). Recency is `meta.lastUpdated` read directly (`cast:"none"`) — an
 *  `instant`, NOT `as FHIR.dateTime`. */
function uncodedDescriptor(): EffectiveRepresentationDescriptor {
  const o = AGE_TODAY_OVER_BIRTHDATE;
  return {
    arm: "uncoded",
    resourceType: "Patient",
    valueElement: relativePath(o.valueElementPath, "Patient"), // "birthDate"
    datumValueType: o.repValueType as ConceptValueType, // "date"
    resultType: { shape: "Scalar", valueType: o.resultValueType as ConceptValueType }, // Scalar<boolean>
    recency: { sortExpr: relativePath(o.recencyTimestamp, "Patient"), cast: "none" }, // meta.lastUpdated (instant)
  };
}

/** The `local-exact` arm of a patient-age RECENCY concept: a boolean Observation whose reduction is supplied by
 *  the recency projection (NOT an `exists`/`most recent`/`count` — the cell the generic datum algorithm below
 *  doesn't enumerate, panel R2). Verified against the recency merge (`CaseFeatureCommon.cql:92-94`). */
function ageLocalExactDescriptor(
  concept: Concept,
  owningLibrary: OwningLibraryMetadata,
): EffectiveRepresentationDescriptor {
  const row = resourceEmitRow("Observation")!; // Observation is always in the registry
  return {
    arm: "local-exact",
    resourceType: "Observation",
    coding: row.coding,
    system: localCodeSystemUrl(owningLibrary.canonicalBase, owningLibrary.localDomainId),
    code: concept.code!, // resolveAgeConcept `recency` guarantees a local `code is`
    resultType: { shape: "Scalar", valueType: "boolean" as ConceptValueType },
    recency: row.recency, // { effective, dateTime }
    owningLibrary,
    valueElement: "value",
    datumValueType: "boolean" as ConceptValueType,
  };
}

type Datum = { valueElement?: string; datumValueType?: ConceptValueType };
type DatumResult = Datum | { errorKind: DerivationErrorKind; detail: string };

/** The datum (value element + datum type) of a NOT-AGE local-exact arm, keyed on shape × reduction (kind AND
 *  target) × resource-valuelessness × declared value type (design §2). Fails closed with a TYPED kind beyond the
 *  exact T1 cells — a returned descriptor never claims a value type its reduction cannot produce (no manufacturing),
 *  and never silently drops an authored value element (the general FHIR model-info element registry is deferred, §8). */
function computeLocalDatum(
  concept: Concept,
  resourceType: string,
  row: ResourceEmitRow,
): DatumResult {
  const reduction =
    concept.definition?.type === "ReductionDefinition" ? concept.definition.reduction : undefined;

  // Validate the (shape × reduction) cell FIRST — a returned descriptor's result type must not contradict its
  // reduction (charter §3 self-description; no manufacturing). Records then expose ONLY records (no datum).
  if (assumedShapePreMigration(concept.shape) === "RecordSet") {
    // A RecordSet publishes its record set; any reduction would collapse it to a scalar/record — incoherent.
    if (reduction) {
      return {
        errorKind: "unsupported-reduction-form",
        detail: `\`shape is RecordSet\` publishes its record set; a \`${reduction.kind}\` reduction would collapse it — incoherent`,
      };
    }
    return {};
  }
  if (assumedShapePreMigration(concept.shape) === "Record") {
    // A Record selects ONE local record via `most recent this`; any other form is incoherent for a local arm.
    if (!reduction || reduction.kind !== "mostRecent" || reduction.target.type !== "ThisRecords") {
      return {
        errorKind: "unsupported-reduction-form",
        detail: `\`shape is Record\` selects one local record via \`most recent this\` — this concept's reduction is not that cell`,
      };
    }
    return {}; // record selection reads no value — no datum
  }

  // Scalar.
  const boolean = concept.valueTypes.length === 1 && concept.valueTypes[0] === "boolean";
  const authored = concept.valueElement
    ? relativePath(concept.valueElement.path, resourceType)
    : undefined;

  // A local-exact datum reduces the concept's OWN records (`this`). A named-target reduction (`exists "X"` /
  // `count "X"`) reduces ANOTHER concept — deciding its local datum is a semantic call T1 does not make (panel).
  if (reduction && reduction.target.type !== "ThisRecords") {
    return {
      errorKind: "unsupported-reduction-form",
      detail: `a \`${reduction.kind} "…"\` reduction over a NAMED target does not reduce this concept's own local records — not a T1 local-exact cell`,
    };
  }

  switch (reduction?.kind) {
    case "exists":
    case "count": {
      // exists / count PRODUCE a boolean; a non-boolean declared value type is incoherent (no manufacturing).
      if (!boolean) {
        return {
          errorKind: "unsupported-reduction-form",
          detail: `\`${reduction!.kind} this\` produces a boolean, but the concept declares value type \`${concept.valueTypes.join("/") || "(none)"}\``,
        };
      }
      // `exists this` (presence) and `count this` (threshold) NEVER read a value — this is ORTHOGONAL to
      // whether the resource is value-bearing. `exists([Observation: code])` is pure presence: it is true
      // when a record exists REGARDLESS of that record's value (a present `value=false` Observation still
      // exists → true). There is no such thing as a "value-filtered exists". So neither reduction produces a
      // value datum, and an authored value element has nothing to bind to (never silently drop it, per this
      // module's stated invariant). Only a `most recent this` value read (below) reads a value.
      if (authored !== undefined) {
        return {
          errorKind: "value-element-unmappable",
          detail: `\`${reduction!.kind} this\` reads no value (${reduction!.kind === "exists" ? "presence" : "a threshold"} is orthogonal to the record's value); the authored value element \`${authored}\` cannot bind`,
        };
      }
      return {};
    }
    case "mostRecent": {
      // #189 §4.1 T1 EXTENSION — a `most recent this` publishes a TYPED value read; consult the FHIR
      // value-read model (T3a `valueReadValueTypes`) for the resource's element rather than assuming
      // Observation-boolean. The read path is the authored value element (relative) or the standard `value`
      // carrier. Three DISTINCT fail-closed diagnostics: the element is unmodeled (`undefined`), the resource
      // is modeled-valueless (`∅`), or the declared value type is not admitted by the element (design §8).
      const readPath = authored ?? "value";
      // #189 B1 (disc 497, Claude #1) — a LOCAL value read whose element IS the resource's coding element returns
      // the concept's OWN identity code, not a datum (the disc-496 value-path conflation on the local arm; the same
      // trap as `Observation.code` / `MedicationRequest.medication`). Reject it BEFORE consulting the value-read
      // model — which legitimately admits e.g. `ServiceRequest.code` as a read for the SOURCE arm (B1 modeled it),
      // so without this guard a `type is ServiceRequest` + `value element is ServiceRequest.code` local concept
      // would silently read its own coding as a value.
      if (readPath === row.coding.field) {
        return {
          errorKind: "value-read-is-coding-element",
          detail: `\`most recent this\` reads ${resourceType}.${readPath}, the resource's coding element — a local value read of it returns the concept's own identity code, not a datum`,
        };
      }
      const admitted = valueReadValueTypes(resourceType, readPath);
      if (admitted === undefined) {
        return {
          errorKind: "value-read-unmodeled",
          detail: `\`most recent this\` reads ${resourceType}.${readPath}, which is not a modeled value-read element (T3a, §8) — fail closed`,
        };
      }
      if (admitted.size === 0) {
        return {
          errorKind: "value-read-valueless",
          detail: `\`most recent this\` on ${resourceType} (a modeled-valueless resource) has no value element to read (§2)`,
        };
      }
      // Scalar concepts reach here only after `conceptResultType` validated exactly one value type.
      const declared = concept.valueTypes[0];
      if (!admitted.has(declared)) {
        return {
          errorKind: "value-type-not-admitted",
          detail: `\`most recent this\` on ${resourceType}.${readPath} admits {${[...admitted].join(", ")}}, but the concept declares value type \`${declared}\``,
        };
      }
      return { valueElement: readPath, datumValueType: declared };
    }
    default:
      // #189 Piece 1 — a `code is` + `defined as exists ("X")` BOOLEAN INTERFACE concept (charter §3
      // value/interface convention): its LOCAL arm is a boolean-valued Observation carrying its OWN identity
      // code, directly assertable via `value is true/false`. The interface fold's own-arm leg reads this
      // boolean value (value-filtered `exists`), so the local-exact datum is a `boolean` value at the standard
      // `value` carrier (or an authored value element). REFACTOR:grounded — re-derived from charter §3 (the
      // interface own arm is a genuine boolean Observation datum, NOT the deferred #257 both-rep value case).
      if (
        concept.definition?.type === "DefinedAsDefinition" &&
        concept.definition.body.type === "DefinedAsExists" &&
        boolean
      ) {
        const readPath = authored ?? "value";
        // The value carrier must not BE the coding element (same conflation guard as `most recent this`).
        if (readPath === row.coding.field) {
          return {
            errorKind: "value-read-is-coding-element",
            detail: `\`defined as exists\` interface reads ${resourceType}.${readPath}, the coding element — not a boolean value datum`,
          };
        }
        const admitted = valueReadValueTypes(resourceType, readPath);
        if (admitted === undefined) {
          return {
            errorKind: "value-read-unmodeled",
            detail: `\`defined as exists\` interface's boolean value read ${resourceType}.${readPath} is not modeled (T3a, §8)`,
          };
        }
        if (!admitted.has("boolean" as ConceptValueType)) {
          return {
            errorKind: "value-type-not-admitted",
            detail: `\`defined as exists\` interface needs a boolean value at ${resourceType}.${readPath}, which admits {${[...admitted].join(", ")}}`,
          };
        }
        return { valueElement: readPath, datumValueType: "boolean" as ConceptValueType };
      }
      // ⭐ #189 null/pause — a PURE QUESTION: `code is` + `value type is boolean` with NO definition (and no
      // source rep). NOTHING can compute it, so it is UNKNOWN until a human answers it — and it is the ONLY
      // shape a `when` guard may gate on, because only a stored boolean lets a user answer true / false /
      // leave-unanswered (design of record `tmp/DESIGN-apply-null-pause.md` §3.1).
      //
      // Its local record IS the answer slot: a boolean-valued Observation carrying its own identity code. So
      // it derives exactly the same boolean value datum as the `defined as exists` interface arm above — minus
      // the derivation. Without this cell the concept resolves `not-a-record`, NO case-feature
      // StructureDefinition is emitted, and the generated Questionnaire contains no question at all: the tree
      // pauses (or worse, denies) on something the user is never given a way to answer.
      //
      // REFACTOR:grounded — re-derived from the design of record §3.1/§3.5 and the reference IGs (all ten of
      // their case-feature SDs are Observation + fixed code + answerable `value[x]` boolean), NOT from the
      // adjacent deferred-cell comment.
      // The cell claims a concept ONLY when the resource can genuinely carry a stored boolean answer. If it
      // cannot (a valueless resource like Condition), FALL THROUGH to `unsupported-reduction-form` rather than
      // erroring here — for a valueless resource the right re-authoring is adding `definition is exists this`,
      // which KEEPS the natural resource, and `cql-to-crl-type-valuetype-rule.md:30` explicitly forbids
      // steering it to `Observation+boolean`. A "you need a boolean answer slot" diagnostic would push the
      // author the wrong way.
      //
      // ⚠ REFACTOR:grounded — the gate MUST be the SHARED `isPureQuestionConcept` predicate, never a locally
      // re-derived condition. A looser local test (e.g. `definition === undefined && boolean`, missing the
      // `representations` / `shape` checks) lets a `code is` + boolean + SOURCE-REP concept get an answerable
      // boolean SD here while its Interface read stays the presence collapse (`asTruths().satisfied()`, since
      // `__pureQuestion` is false) — an SD advertising an answer slot whose stated `false` reads back as TRUE.
      // The classifier and the emit cell must agree, or the artifact disagrees with itself.
      if (isPureQuestionConcept(concept)) {
        const readPath = authored ?? "value";
        if (readPath !== "value") {
          // The three-state read `answeredValue()` selects `O.value` (CaseFeatureCommon.cql). An authored
          // `value element is <other>` would put the SD's answer slot somewhere the read never looks: the
          // user answers one element and the guard reads another. Fail LOUD rather than emit an artifact
          // that disagrees with itself. (Threading the path into the read is the alternative; it needs a
          // path-parametric fluent function and no corpus shape asks for it yet.)
          return {
            errorKind: "value-element-unmappable",
            detail: `pure question reads its answer from \`${resourceType}.value[x]\` (the three-state \`answeredValue()\`), so \`value element is ${readPath}\` cannot carry it`,
          };
        }
        // Same conflation guard as the sibling arms: the answer carrier must not BE the coding element.
        const admitted =
          readPath === row.coding.field ? undefined : valueReadValueTypes(resourceType, readPath);
        if (admitted !== undefined && admitted.has("boolean" as ConceptValueType)) {
          return { valueElement: readPath, datumValueType: "boolean" as ConceptValueType };
        }
        // else: not an answerable question — fall through.
      }
      // `defined as` (non-exists) / `definition is <derivation>` — not a `this`-reduction. The local-exact datum
      // of a general both-representation / derived form is out of T1 scope (deferred, #257).
      return {
        errorKind: "unsupported-reduction-form",
        detail: `local Scalar concept's reduction is not \`exists this\` / \`most recent this\` / \`count this\` — not a T1 local-exact cell`,
      };
  }
}

/** The `local-exact` arm of a NOT-AGE concept, or a fail-closed error. */
function notAgeLocalExact(
  concept: Concept,
  owningLibrary: OwningLibraryMetadata,
):
  | { status: "derived"; descriptor: EffectiveRepresentationDescriptor }
  | { status: "error"; error: DerivationError } {
  const base = { concept: concept.name, owningLibrary: owningLibrary.libraryName };
  const resourceType = concept.conceptType ?? "Observation"; // implicit-standard local Observation (charter §3)
  // A′ gate (#189 CEL-writer T2): the descriptor deriver is a DEFINITION-lane consumer, so it honors only
  // case-feature rows. A CEL-writer-only row (`caseFeature: false`, e.g. Encounter) is NOT a case-feature datum —
  // it derives no descriptor, exactly as an unlisted resource does. (The CEL writer reaches Encounter via the
  // unrestricted `resourceCodingPlacement`, never this deriver.)
  const row = resourceEmitRow(resourceType);
  if (!row || !row.caseFeature) {
    return {
      status: "error",
      error: {
        ...base,
        kind: "unsupported-resource",
        resourceType,
        field: "coding",
        detail: row
          ? `resource type \`${resourceType}\` is a CEL-writer-only row (\`caseFeature: false\`) — not a case-feature datum; the definition lane derives no descriptor for it`
          : `resource type \`${resourceType}\` is not in the emit registry`,
      },
    };
  }
  const resultType = conceptResultType(assumedShapePreMigration(concept.shape), concept.valueTypes, resourceType); // DEFAULTED resource (panel R2)
  if (!resultType) {
    return {
      status: "error",
      error: {
        ...base,
        kind: "indeterminate-result-type",
        resourceType,
        field: "resultType",
        detail: `Scalar concept declares ${concept.valueTypes.length} value types (needs exactly 1)`,
      },
    };
  }
  const datum = computeLocalDatum(concept, resourceType, row);
  if ("errorKind" in datum) {
    return {
      status: "error",
      error: {
        ...base,
        kind: datum.errorKind,
        resourceType,
        ...(datum.errorKind === "value-element-unmappable" ||
        datum.errorKind === "value-read-unmodeled" ||
        datum.errorKind === "value-read-valueless" ||
        datum.errorKind === "value-type-not-admitted" ||
        datum.errorKind === "value-read-is-coding-element"
          ? { field: "valueElement" as const }
          : datum.errorKind === "indeterminate-result-type"
            ? { field: "resultType" as const }
            : {}),
        detail: datum.detail,
      },
    };
  }
  return {
    status: "derived",
    descriptor: {
      arm: "local-exact",
      resourceType,
      coding: row.coding,
      system: localCodeSystemUrl(owningLibrary.canonicalBase, owningLibrary.localDomainId),
      code: concept.code!, // this arm is only built when a `code is` is present
      resultType,
      recency: row.recency,
      owningLibrary,
      ...(datum.valueElement !== undefined ? { valueElement: datum.valueElement } : {}),
      ...(datum.datumValueType !== undefined ? { datumValueType: datum.datumValueType } : {}),
    },
  };
}

/** Derive ONE `source representation:` posrep's arm — a `source` descriptor (a coded external value-read) or a
 *  TYPED deferred arm. #189 B1: fail closed on every rep shape the coded-value-read arm does not cover, never
 *  silently dropping a rep (§6). Keeps the LOCAL and SOURCE value-reads INDEPENDENT (the source datum is the rep's
 *  own `value element is`, e.g. `ServiceRequest.code` — NOT re-derived from the local arm). */
function deriveOneSourceArm(
  concept: Concept,
  rep: Representation,
  owningLibMeta: OwningLibraryMetadata,
): { descriptor: EffectiveRepresentationDescriptor } | { deferred: DeferredArm } {
  const mk = (reason: SourceDeferralReason, detail: string): { deferred: DeferredArm } => ({
    deferred: { kind: "source", reason, detail },
  });
  // A projection source rep (patient-age `value projection`) is the age/recency lane (`uncoded`), not this
  // coded-value-read arm.
  if (rep.valueProjection) {
    return mk("out-of-scope", `source representation carries a \`value projection\` (age/recency lane), not a \`coded from\` value read`);
  }
  const resourceType = rep.conceptType;
  if (!resourceType) return mk("unsupported-resource", `source representation has no \`type is\` resource`);
  // Honor the same case-feature gate as the local arm (a `caseFeature: false` row, e.g. Encounter, has an
  // unproven value-read/recency cell — a B2/#257 decision, not silently admitted here).
  const row = resourceEmitRow(resourceType);
  if (!row || !row.caseFeature) {
    return mk(
      "unsupported-resource",
      row
        ? `source resource \`${resourceType}\` is a CEL-writer-only row (\`caseFeature: false\`) — its value-read/recency cell is not proven (a B2/#257 decision)`
        : `source resource \`${resourceType}\` is not in the emit registry`,
    );
  }
  // ⭐ THE SOURCE DATUM IS DERIVED FROM MODEL INFO, NOT AUTHORED (#189 P2).
  //
  // This arm used to require `rep.valueElement` and `rep.valueTypes` — Rule A.1's "a posrep must carry
  // `type` + `value element` + `value type`". That rule is RETIRED, and the GOAL is what retires it:
  // `fixtures/obesity/` declares FOUR source representations across three authoring options and NOT ONE
  // authors a `value element is` or a value type — every one is `type is` + `coded from` (+ an optional
  // `value projection is`). So a source arm that demands them can never resolve for the target, and the
  // merge gets one descriptor where it needs `[local-exact, source]`. (`GOAL > CHARTER > CODE`, charter
  // §0a; the charter's "a source representation is `type is` + optional `coded from`, NOTHING ELSE" agrees,
  // but the goal is the reason.)
  //
  // ⚠ The requirement PREDATED its own retirement and survived the sweep: `493e0825` (2026-08-23) wrote it;
  // `bd3b4668` (2026-08-28) retired it. Because the author can no longer supply the field, this arm was
  // DEAD BY CONSTRUCTION — it could only ever defer.
  //
  // Derived instead, exactly parallel to the local arm:
  //   · the READ PATH  — the resource's standard `value[x]` carrier (registry). A `valueless` row has no
  //     value to read: its truth is EXISTENCE, which is the projection arm, not this one.
  //   · the VALUE TYPE — the CONCEPT's, because a representation has none. A projection-free rep is read
  //     AS the concept value (charter §3), so they were required to agree anyway; deriving makes the
  //     agreement structural instead of a check that could fail.
  if (concept.valueTypes.length !== 1) {
    return mk("indeterminate-result-type", `concept declares ${concept.valueTypes.length} value types (needs exactly 1 for the source arm's datum)`);
  }
  const declared = concept.valueTypes[0];
  // ⭐ WHICH element carries the datum comes from the FHIR VALUE MODEL — the existing authority — by asking
  // which modeled element ADMITS the concept's declared value type.
  //
  // ⚠ NEVER GUESS A CARRIER (charter §3, RULED 2026-08-28): *"A resource whose canonical carrier has not
  // been ruled is UNMODELED — fail closed and say so."* Two earlier revisions of this line guessed and were
  // wrong in different ways: first `valueless ⇒ no datum` (which REGRESSED `dme101-030`'s `Covered Device`,
  // a real `ServiceRequest.code` value-read), then `valueless ⇒ the coding element` — which happens to land
  // on `ServiceRequest.code` but invents a carrier for every unruled resource, exactly what the charter
  // forbids.
  //
  // `FHIR_VALUE_READ_MODEL` already carries the three-way distinction this needs: a non-empty set = the
  // element exists and admits these types; ∅ = modeled and POSITIVELY valueless; absent = unmodeled, no
  // knowledge. So `Observation.value` admits Quantity, `ServiceRequest.code` admits CodeableConcept while
  // its `value` is ∅, `Patient.birthDate` admits date, and Condition admits NOTHING — correctly, because a
  // Condition's truth is EXISTENCE, not a value read.
  //
  // ⚠ AMBIGUITY FAILS CLOSED TOO. If two elements admitted the same type there would be no non-arbitrary
  // choice, and picking one would be guessing by another name.
  const admitting = valueReadElementsAdmitting(resourceType, declared);
  if (admitting.length === 0) {
    return mk(
      "value-read-unmodeled",
      `no modeled value-read element on \`${resourceType}\` admits \`${declared}\` — a carrier that has not been ruled is UNMODELED (charter §3); it is never guessed`,
    );
  }
  if (admitting.length > 1) {
    return mk(
      "value-read-unmodeled",
      `\`${resourceType}\` has ${admitting.length} modeled elements admitting \`${declared}\` (${admitting.join(", ")}) — no canonical carrier is ruled between them, and choosing one would be a guess`,
    );
  }
  const readPath = admitting[0];
  const admitted = valueReadValueTypes(resourceType, readPath);
  if (admitted === undefined) {
    return mk("value-read-unmodeled", `source value read ${resourceType}.${readPath} is not a modeled value-read element (§8)`);
  }
  if (admitted.size === 0) {
    return mk("value-read-valueless", `source value read ${resourceType}.${readPath} is a modeled-valueless element`);
  }
  if (!admitted.has(declared)) {
    return mk("value-type-not-admitted", `source value read ${resourceType}.${readPath} admits {${[...admitted].join(", ")}}, not \`${declared}\``);
  }
  // `coded from` is OPTIONAL on a rep (A.1); its ABSENCE is a coding-axis deferral, NOT a value-path error.
  if (rep.terminologyName === undefined) {
    return mk("source-binding-unsupported", `source representation on \`${resourceType}\` has no \`coded from\` — an uncoded source value read is out of B1 scope (the coding axis, §10)`);
  }
  const resultType = conceptResultType(assumedShapePreMigration(concept.shape), concept.valueTypes, resourceType);
  if (!resultType) {
    return mk("indeterminate-result-type", `concept declares ${concept.valueTypes.length} value types (needs exactly 1 for the source arm's result type)`);
  }
  return {
    descriptor: {
      arm: "source",
      resourceType,
      coding: row.coding, // membership coding axis — SEPARATE from `valueElement` (datum), even when they coincide
      valueElement: readPath,
      datumValueType: declared,
      terminologyRef: rep.terminologyName, // PRESERVE qualified identity (URL/membership = B5)
      resultType,
      recency: row.recency,
      owningLibrary: owningLibMeta,
    },
  };
}

/** Derive the SOURCE arm(s) of a both-rep concept — one per `source representation:` posrep in declaration order
 *  (§6 "all in-scope arms"). Returns derived `source` descriptors + typed deferred arms; the concept-level
 *  `CodedFromDefinition` is NOT a rep (handled by the caller). */
function deriveSourceArms(
  concept: Concept,
  owningLibMeta: OwningLibraryMetadata,
): { descriptors: EffectiveRepresentationDescriptor[]; deferred: DeferredArm[] } {
  const descriptors: EffectiveRepresentationDescriptor[] = [];
  const deferred: DeferredArm[] = [];
  for (const rep of concept.representations) {
    const d = deriveOneSourceArm(concept, rep, owningLibMeta);
    if ("descriptor" in d) descriptors.push(d.descriptor);
    else deferred.push(d.deferred);
  }
  return { descriptors, deferred };
}

/**
 * Derive a concept's effective LOCAL representation(s) — design §4. Pure over `(concept, owningLibMeta)`; the
 * caller resolves the OWNING library (design §4 sibling-lib rule). Per-representation (design §6): a patient-age
 * recency concept yields BOTH a `local-exact` (boolean Observation) and an `uncoded` arm; a normal local concept
 * yields one `local-exact`; a both-rep concept yields `[local-exact, source]`; a standalone age concept one
 * `uncoded`; a source-ONLY concept `status:"deferred"`.
 */
export function deriveEffectiveRepresentations(
  concept: Concept,
  owningLibMeta: OwningLibraryMetadata,
): DerivationOutcome {
  const owningLibrary = owningLibMeta.libraryName || "(unnamed)";

  // 1. Owning metadata must be fully present (fail-closed — no `unnamed-local` slug manufacture, panel R2).
  const emptyField = firstEmptyOwningField(owningLibMeta);
  if (emptyField) {
    return {
      status: "error",
      error: {
        kind: "invalid-owning-library-metadata",
        concept: concept.name,
        owningLibrary,
        field: emptyField,
        detail: `owning-library metadata field \`${emptyField}\` is empty`,
      },
    };
  }

  // 2. Age classification is the shared validate+emit authority (cannot drift from lowering).
  const age = resolveAgeConcept(concept);
  if (age.kind === "error") {
    return {
      status: "error",
      error: {
        kind: "malformed-representation",
        concept: concept.name,
        owningLibrary,
        detail: `${age.errorKind}: ${age.message}`,
      },
    };
  }
  if (age.kind === "recency" || age.kind === "standalone") {
    // Patient age is inherently a Scalar boolean. `resolveAgeConcept` checks the value type but NOT `shape` or a
    // deviating local `valueElement`, so guard both here rather than manufacturing a Scalar<boolean>/`value` datum
    // over a concept that declared otherwise (panel — no manufacturing).
    if (assumedShapePreMigration(concept.shape) !== "Scalar") {
      return {
        status: "error",
        error: {
          kind: "malformed-representation",
          concept: concept.name,
          owningLibrary,
          field: "resultType",
          detail: `a patient-age concept is Scalar, but it declares \`shape is ${concept.shape}\``,
        },
      };
    }
    if (concept.valueElement) {
      // recency: the local arm reads Observation.value; standalone: no local `code is`, so a concept-level value
      // element has nothing to bind to (A.3). Reject anything but a recency `value` — never silently drop it.
      const rel = relativePath(concept.valueElement.path, "Observation");
      if (age.kind !== "recency" || rel !== "value") {
        return {
          status: "error",
          error: {
            kind: "value-element-unmappable",
            concept: concept.name,
            owningLibrary,
            ...(age.kind === "recency" ? { resourceType: "Observation" as const } : {}),
            field: "valueElement",
            detail:
              age.kind === "recency"
                ? `the patient-age local arm reads Observation.value; an authored value element \`${concept.valueElement.path}\` is not supported (T1)`
                : `a standalone patient-age concept has no local \`code is\`; an authored value element \`${concept.valueElement.path}\` cannot bind`,
          },
        };
      }
    }
    const descriptors: EffectiveRepresentationDescriptor[] = [];
    if (age.kind === "recency") descriptors.push(ageLocalExactDescriptor(concept, owningLibMeta)); // [local-exact, ...
    descriptors.push(uncodedDescriptor()); // ..., uncoded]
    return { status: "derived", descriptors };
  }

  // 3. Not age. A concept-level `coded from` is an external read-only base (charter §3) — a source arm, deferred
  //    by D2 like a `source representation` block; it must NOT read as a pure-derived `derived{[]}` (panel).
  const hasCode = hasLocalCode(concept);
  const hasDeferredSource = hasSourceBinding(concept);
  if (hasCode) {
    const local = notAgeLocalExact(concept, owningLibMeta);
    if (local.status === "error") return local;
    // #189 B1 — DERIVE the source arm(s) so a both-rep concept's descriptor DESCRIBES `[local-exact, source]`
    // (§6 "all in-scope arms") rather than surfacing an opaque `deferredArms` stub. Each `source representation:`
    // posrep becomes a `source` descriptor or a typed deferred arm; a concept-level `CodedFromDefinition` (no
    // posrep) has nothing to derive → a typed deferred arm. INERT: no emit consumer reads the `source` arm (F wires
    // it); today's consumers stay correct via the single-descriptor invariant / `.find(local-exact)`.
    const { descriptors: sourceDescriptors, deferred } = deriveSourceArms(concept, owningLibMeta);
    const codedFromOnly =
      concept.definition?.type === "CodedFromDefinition" && concept.representations.length === 0;
    const deferredArms: DeferredArm[] = [
      ...deferred,
      ...(codedFromOnly
        ? [
            {
              kind: "source" as const,
              reason: "out-of-scope" as const,
              detail: `concept-level \`coded from\` base is a source arm deferred by D2 (no \`source representation\` posrep to derive)`,
            },
          ]
        : []),
    ];
    return {
      status: "derived",
      descriptors: [local.descriptor, ...sourceDescriptors],
      ...(deferredArms.length > 0 ? { deferredArms } : {}),
    };
  }
  if (hasDeferredSource) return { status: "deferred", reason: "sourced" }; // source-ONLY / coded-from — out of #189 scope (F/#257)
  return { status: "derived", descriptors: [] }; // pure derived (`defined as` / `definition is`) — no local instances
}
