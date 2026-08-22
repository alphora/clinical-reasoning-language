// #189 T1 — the effective-representation descriptor + its pure deriver (design §4; crl-emit panel disc 423).
//
// The descriptor is the single structured source both emit lanes will (at the flip) read to derive a LOCAL
// concept's `{resourceType, coding, value, result type, recency}`. T1 is ADDITIVE and INERT: this module ships
// the types + a pure deriver + tests, wired into NEITHER lane (no production module outside `src/emit/` imports
// it). Two arms per design §0: `local-exact` (a `code is` concept) and `uncoded` (Patient/birthDate age posrep);
// sourced/external arms are deferred (design §10).

import type { Concept } from "../ast/types";
import { hasLocalCode, hasSourceBinding } from "./conceptDatumSignals";
import { localCodeSystemUrl } from "../fhir-emitter/slug";
import { relativeElementPath } from "../fhir-model/elementPath";
import { valueReadValueTypes } from "../fhir-model/fhirValueModel";
import type { ConceptValueType } from "../grammar/conceptValueTypes";
import type { ResultType } from "../grammar/resultType";
import { conceptResultType } from "../grammar/resultType";
import {
  resolveAgeConcept,
  AGE_TODAY_OVER_BIRTHDATE,
} from "../template-match/recencyProjectionOverride";

import {
  resourceEmitRow,
  type CodingStrategy,
  type RecencyAccess,
  type ResourceEmitRow,
} from "./resourceEmitRegistry";

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
    };

/** An in-scope arm the deriver DID NOT emit, surfaced so the flip must confront design §6 (the descriptor list
 *  is "all in-scope arms", not "all arms") rather than silently narrowing a local+source concept to local-only. */
export type DeferredArm = { kind: "source"; detail: string };

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

/** Tri-state (panel R2 Q3): a `derived` concept publishes 0+ local descriptors (empty = a legitimately
 *  instance-less pure-derived concept); `deferred` is a valid-but-out-of-#189-scope concept the CQL lane still
 *  emits but the CEL lane fails closed on at the flip; `error` is malformed/unmappable. `[]` is RESERVED for
 *  pure-derived — a source-only concept is `deferred`, never `derived{[]}`. */
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
  if (concept.shape === "RecordSet") {
    // A RecordSet publishes its record set; any reduction would collapse it to a scalar/record — incoherent.
    if (reduction) {
      return {
        errorKind: "unsupported-reduction-form",
        detail: `\`shape is RecordSet\` publishes its record set; a \`${reduction.kind}\` reduction would collapse it — incoherent`,
      };
    }
    return {};
  }
  if (concept.shape === "Record") {
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
      // `defined as` / `definition is <derivation>` / bare `code is` — not a `this`-reduction. The local-exact
      // datum of a general both-representation / derived form is out of T1 scope (deferred, #257).
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
  const row = resourceEmitRow(resourceType);
  if (!row) {
    return {
      status: "error",
      error: {
        ...base,
        kind: "unsupported-resource",
        resourceType,
        field: "coding",
        detail: `resource type \`${resourceType}\` is not in the T1 emit registry`,
      },
    };
  }
  const resultType = conceptResultType(concept.shape, concept.valueTypes, resourceType); // DEFAULTED resource (panel R2)
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
        datum.errorKind === "value-type-not-admitted"
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

/**
 * Derive a concept's effective LOCAL representation(s) — design §4. Pure over `(concept, owningLibMeta)`; the
 * caller resolves the OWNING library (design §4 sibling-lib rule). Per-representation (design §6): a patient-age
 * recency concept yields BOTH a `local-exact` (boolean Observation) and an `uncoded` arm; a normal local concept
 * yields one `local-exact`; a standalone age concept one `uncoded`.
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
    if (concept.shape !== "Scalar") {
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
    return {
      status: "derived",
      descriptors: [local.descriptor],
      ...(hasDeferredSource
        ? {
            deferredArms: [
              {
                kind: "source" as const,
                detail: `external source binding(s) deferred (#189 D2 local scope)`,
              },
            ],
          }
        : {}),
    };
  }
  if (hasDeferredSource) return { status: "deferred", reason: "sourced" }; // source-only / coded-from — out of #189 scope
  return { status: "derived", descriptors: [] }; // pure derived (`defined as` / `definition is`) — no local instances
}
