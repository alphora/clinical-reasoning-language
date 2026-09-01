// #189 T1 — the per-resource emit registry (crl-emit panel R1 P2/P3/P4, R2 Q2).
//
// The single per-resource table the effective-representation descriptor (and, at the flip, both emit lanes)
// consult for a LOCAL concept's retrieve coding path + recency sort element. INERT in T1 — nothing in the
// production emit path reads it yet.
//
// SCOPE — CQL-READ spelling (the rows) + the JSON-WRITE name resolvers (T2). A row names the logical FHIR-model
// property the CQL lane reads (e.g. `effective`, sorted as `(effective as FHIR.dateTime).value`), NOT the
// serialized JSON write name (`effectiveDateTime`). Those differ on every choice element; conflating them is
// exactly the coherence failure the descriptor exists to prevent (panel R1 P2).
//
// A deliberate SUBSET (the proven local cells). An unlisted resource is a fail-closed `unsupported-resource`
// derivation error — NOT a silent default (panel R1 P4). No universal `.code` default: a strategy is declared
// per row (medication carries its coding on a choice element, not `.code`).
//
// T2 — the WRITE-name resolvers (`codingJsonName` / `valueJsonName` / `recencyStampJsonName`) DERIVE the
// serialized JSON name from a read row via one FHIR polymorphic-element spelling rule (`choiceElementJsonName`),
// rather than storing a second write table that could drift (design §4/§7/§10). REFACTOR:grounded — the CEL lane
// wires these across the #189 CEL-writer flip (T2–T4): T2 wired CODING placement (`resourceCodingPlacement`,
// consumed by `packages/crl/src/cel/emitter/emitFhir.ts`, SUPERSEDING the universal `resourceBody.code` write);
// the `applyDateField` stored date map and the type-switched value write are SUPERSEDED at T4 (SYMBOLS lead;
// line refs drift). BLAST RADIUS the flip inherits, not discovers: `applyDateField`'s map covers 15 resource
// types; a resource with NO registry row (MedicationStatement, DiagnosticReport, …) becomes a fail-closed
// `unsupported-resource` at the definition lane and a `.code`-fallback → T4 case-atomic at the CEL lane.
// Encounter, once among those, has a row (added T2) and is a CASE-FEATURE row as of 2026-08-30.
//
// SPELLING ≠ LEGALITY: a resolver spells a JSON name correctly for any variant; it does NOT assert the target
// element admits that variant. `conceptValueTypes` is CRL-wide (includes `date`/`Attachment`), but e.g.
// `Observation.value[x]` (R4) admits neither `valueDate` nor `valueAttachment`. Per-resource variant-set
// legality is the T3 model-info obligation (design §8 flip-blocker); T2 never certifies it.
//
// CONSUMPTION CONTRACT: the resolvers take `CodingStrategy`/`RecencyAccess`/strings — none takes a
// `resourceType`, so they CANNOT gate an unsupported resource. That is deliberate: descriptor resolution
// (`deriveEffectiveRepresentations`) is the single fail-closed chokepoint (design §5). Call these resolvers
// ONLY on fields of an already-derived descriptor — never on a hand-built `RecencyAccess` that would bypass the
// gate. FAIL-CLOSED ASYMMETRY (intentional): `recencyStampJsonName` guards a dotted/empty `sortExpr` because a
// REAL derived descriptor field is dotted (the uncoded age arm's `meta.lastUpdated`, `effectiveRepresentation.ts`),
// so a contract-abiding caller can legitimately reach the guard; `codingJsonName` has no fail-closed channel
// because no descriptor produces a dotted/empty coding field (every registry field is top-level; the uncoded
// arm carries no coding). Do not "fix" the asymmetry by adding a guard coding cannot need, nor copy coding's
// guardlessness to a resolver that does.

import { conceptValueTypes } from "../grammar/conceptValueTypes";

/** How a resource's retrieve code is carried, for the CQL retrieve `[<Resource>: <code>]`. No universal
 *  default — every supported resource declares its strategy explicitly (panel R1 P4). */
export type CodingStrategy =
  | { kind: "codeable-concept"; field: string } // a `CodeableConcept` at <field> (e.g. Observation.code)
  | { kind: "choice-codeable-concept"; field: string } // a choice element (e.g. MedicationRequest.medication)
  | { kind: "codeable-concept-array"; field: string }; // a `CodeableConcept[]` at <field> (e.g. Encounter.type)

/** A normalized recency sort-key access strategy (panel R2 Q2). `cast:"dateTime"` renders
 *  `(<sortExpr> as FHIR.dateTime).value` — a CHOICE element (`effective`/`performed`), null-sort-safe on the
 *  canonical lane ONLY because the CEL lane writes the dateTime variant (a cross-todo contract with T2).
 *  `cast:"none"` renders `<sortExpr>.value` — a plain `dateTime` element (`authoredOn`/`recordedDate`) or an
 *  `instant` (`meta.lastUpdated`), which MUST NOT be `as FHIR.dateTime` (a type mismatch; verified against the
 *  shipped golden `CaseFeatureCommon.cql:92`, `emitCQL.ts:1408-1409`). */
export type RecencyAccess = {
  /** Relative CQL read path off the retrieve alias (e.g. `effective`, `authoredOn`, `meta.lastUpdated`). */
  sortExpr: string;
  cast: "dateTime" | "none";
};

export interface ResourceEmitRow {
  coding: CodingStrategy;
  recency: RecencyAccess;
  /** Whether the resource is VALUELESS — a bare existence resource with no value element (Condition /
   *  Procedure / ServiceRequest / MedicationRequest), so `exists this` is existence over the natural
   *  resource. `false` for a value-bearing resource (Observation), whose boolean value element a value-reading
   *  reduction reads. Drives the descriptor's datum discrimination (design §2). */
  valueless: boolean;
  /** REFACTOR:grounded (#189 CEL-writer, design panel disc 486 — A′; REFRAMED by the operator 2026-08-30).
   *
   *  ⭐ **THE DEFAULT IS `true`. A CEL-WRITTEN RESOURCE *CAN* BE A CASE FEATURE — it just does not HAVE to be.**
   *  Absent a demonstrated blocker, a resource the CEL writer emits SHOULD be a case-feature datum. `false` is
   *  a statement about US, not about the resource: it records that some cell has not been established yet.
   *
   *  ⚠ This is NOT a taxonomy of "CEL-writer-only resources" versus "case-feature resources". Reading it that
   *  way is what kept Encounter excluded long after both mechanics it was assumed to lack had been shown to
   *  work — the flag was written during a period of getting the CEL lane to express what it needed, and the
   *  exclusion outlived its reason. If setting `true` produces no blocker, set it. If it later produces one,
   *  be equally willing to do whatever works.
   *
   *  `true` = the definition lane honors the row (`caseFeatureProfileShape` / descriptor derivation → an SD +
   *  `action.input`). `false` = a cell is unestablished, the definition lane's gate skips it, and flipping is
   *  a one-line change — never a category impossibility.
   *  SCOPE — this marker gates ONLY the DEFINITION lane (case-feature SD + `action.input` profiling via
   *  `caseFeatureProfileShape`, and the value-read model): those consumers honor a row only when `caseFeature`.
   *  It does NOT gate the CEL instance writer's coding-ELEMENT placement, which is RESOURCE-level (a fact emitting
   *  resource R places its coding on R's natural element regardless of role or `caseFeature`, via
   *  `resourceCodingPlacement`): an Encounter fact codes on `type[]` whether it is `coded from`, bare
   *  `defined by Encounter`, or (later) local. Role governs the code VALUE/system (derive-local vs authored, T3),
   *  not the coding element.
   *  ONE table, one row per resource, a marker instead of a second write table that could drift from the retrieve
   *  invariant (the anti-drift purpose of this file's T2 header). Every current row is a proven case-feature
   *  datum, so all are `true` — the marker is output-neutral until the flip adds a `false` row. */
  caseFeature: boolean;
}

/** The emit subset. Unlisted → fail-closed `unsupported-resource`. `codeable-concept-array` (Encounter.type)
 *  landed with the #189 CEL-writer flip (T2), on the Encounter row. */
export const RESOURCE_EMIT_REGISTRY: Readonly<Record<string, ResourceEmitRow>> = {
  Observation: {
    coding: { kind: "codeable-concept", field: "code" },
    recency: { sortExpr: "effective", cast: "dateTime" }, // effective[x] is a choice element
    valueless: false, // value-bearing (Observation.value)
    caseFeature: true,
  },
  Condition: {
    coding: { kind: "codeable-concept", field: "code" },
    recency: { sortExpr: "recordedDate", cast: "none" }, // recordedDate is a plain dateTime
    valueless: true,
    caseFeature: true,
  },
  Procedure: {
    coding: { kind: "codeable-concept", field: "code" },
    recency: { sortExpr: "performed", cast: "dateTime" }, // performed[x] is a choice element
    valueless: true,
    caseFeature: true,
  },
  ServiceRequest: {
    coding: { kind: "codeable-concept", field: "code" },
    recency: { sortExpr: "authoredOn", cast: "none" }, // authoredOn is a plain dateTime
    valueless: true,
    caseFeature: true,
  },
  MedicationRequest: {
    coding: { kind: "choice-codeable-concept", field: "medication" }, // medication[x] choice, NOT `.code`
    recency: { sortExpr: "authoredOn", cast: "none" },
    valueless: true,
    caseFeature: true,
  },
  // REFACTOR:grounded (#189 CEL-writer T2, disc 486 A′). A CEL-WRITER-ONLY row (`caseFeature: false`): the CEL
  // instance lane emits Encounters (ambient/QM-operand context, read by an external-lane `[Encounter: …]`
  // retrieve on `type`) AND the definition lane profiles them as case features.
  //
  // Coding is the `type[]` ARRAY (a visit code is `Encounter.type`, NOT `.code` — R4 Encounter has no `.code`),
  // and it is also the readable DATUM: what an Encounter asserts IS which visit it was.
  //
  // `recency` is the nested `period.start`. ⚠ Read the two lanes SEPARATELY — conflating them is what made
  // this row look impossible: the INSTANCE-WRITE lane cannot spell a flat JSON name for it (there is no
  // `period.startDateTime`), so `recencyStampJsonName` refuses it and `applyDateField` writes
  // `period: { start: iso }` instead; the CQL lane simply CONSTRUCTS the nesting
  // (`period: FHIR.Period { start: … }`) and sorts on `period.start.value`. Both measured.
  Encounter: {
    coding: { kind: "codeable-concept-array", field: "type" }, // Encounter.type[] — a visit code, NOT `.code`
    recency: { sortExpr: "period.start", cast: "none" }, // nested Period — CONSTRUCTED, see below
    valueless: true,
    // ⭐ FLIPPED to `true` (operator, 2026-08-30: "we should be able to create an Encounter CF"). This row
    // was CEL-writer-only on the stated grounds that "no case-feature has `type is Encounter`" — an
    // EMPIRICAL claim about the corpus, which the same comment called "the intended one-line reversibility,
    // NOT a category impossibility". It was a deferral, and deferral is a technique, not law.
    //
    // The two mechanics it was assumed to lack were MEASURED to work (design §12): the `type[]` ARRAY coding
    // round-trips as `type: { code }`, and the nested `period.start` recency CONSTRUCTS as
    // `period: FHIR.Period { start: … }` — and sorts on `period.start.value`.
    //
    // ⚠ The dotted path is still unspellable as a FLAT JSON name, so `recencyStampJsonName` rightly refuses
    // it. That is the instance-WRITE lane, a different question from constructing the nesting in CQL;
    // conflating the two is what made this row look categorically impossible.
    caseFeature: true,
  },
};

/** The registry row for a resource, or `undefined` when the resource is not in the T1 subset (caller fails
 *  closed with `unsupported-resource`). */
export function resourceEmitRow(resourceType: string): ResourceEmitRow | undefined {
  // own-property guard: `ConceptType` is `string` at the type level, so a name like `toString` must not resolve
  // to a prototype member and masquerade as a supported row.
  return Object.prototype.hasOwnProperty.call(RESOURCE_EMIT_REGISTRY, resourceType)
    ? RESOURCE_EMIT_REGISTRY[resourceType]
    : undefined;
}

// ── #189 remote-channel: required STRUCTURAL-element schema (homeostasis-core, #76 folded in — disc 492/493) ─
// #76's "a concept is an SD for CRL": a remote-channel resource must be COMPLETE + valid FHIR, not just coded.
// TWO senses of required (operator 2026-08-22), with TWO authorities so neither can drift from the other (panel
// disc 493, both arms):
//   - STRUCTURAL (1.a): FHIR-cardinality-required, CONCEPT-INDEPENDENT — every instance of the type needs it
//     regardless of which concept it backs (ServiceRequest `status`/`intent`/`subject`). Lives HERE.
//   - CONCEPT (1.b): the datum the concept's own READ PATH is load-bearing on — the retrieve coding element, or
//     the value element (ServiceRequest `code`; the Patient age posrep's `birthDate`). It is NOT stored here:
//     it is DERIVED from the effective-representation descriptor (`coding`/`valueElement`, via `codingJsonName`/
//     the value resolvers), the single authority for a concept's read spelling — duplicating it as a literal
//     string would drift from the descriptor and would spell choice elements wrong (`medication[x]`). Recency
//     stamps (`authoredOn`/`effective`) are READ but are NOT concept-required: absence is null-sort-safe (§3
//     closed-world), so a stamp-less remote fact still evaluates. NB `birthDate` is not FHIR-required either — a
//     birthDate-less Patient is legal (age → null → false); it is required to EXERCISE the age read in a remote
//     case, which the descriptor's uncoded arm already pins.
//
// So this table is STRUCTURAL-ONLY. Defaultability is DECOUPLED from requiredness (Fable disc 493): a structural
// element is satisfied by a `default` (administrative floor, overridable), by `wired` emit machinery (subject →
// the case Patient reference — NOT a string literal), or `authored` (FHIR-required AND clinical, no safe default;
// none in the Patient+SR subset, but the model admits it so a future Immunization.occurrence[x] has an honest cell).
//
// CONSUMER CONTRACT (per-consumer behavior differs — disc 493): the EMIT-DEFAULT floor (`applyStructuralDefaults`,
// CEL writer) applies a `default` fulfillment for any missing element of a SCHEMA'D resource and SKIPS an
// unschema'd one (no error — erroring would break every emitted Observation/Condition; an unschema'd resource's
// completeness is a separate, tracked gap). The `validate_crl` rule (step 2) + the case-feature SD `min=1`
// reflection (step 3) span ALL `caseFeature:true` rows, some of which have no structural schema yet — those
// consumers must EITHER fill the rows (small, known: Observation/Procedure→status, MedicationRequest→status/intent)
// OR gate to the schema'd subset; they must NOT fail closed on `undefined` for a proven case-feature row (that
// would regress it). SCOPE: every FACT-emitted resource type (the `RESOURCE_EMIT_REGISTRY` set) is now wired for
// R4 — Observation/Condition/Procedure/ServiceRequest/MedicationRequest/Encounter + Patient. ACTIVITY-OUTPUT
// resources (CommunicationRequest/Task via the CPG activity path, not `emitOneFact`) are NOT covered by this
// floor yet — a separate follow-up if they emit incomplete.

/** The value shape for an overridable `default` fulfillment, by the target element's FHIR type — a primitive
 *  `code` (`status`), a `Coding` (`Encounter.class`), or a `CodeableConcept` (`Condition.clinicalStatus`). The
 *  emitter writes the exact serialized shape (not a token/CEL literal — the axis gpt56 flagged, disc 493). */
export type DefaultValue =
  | { kind: "code"; code: string } // a primitive `code` element (Encounter/ServiceRequest.status, .intent)
  | { kind: "coding"; system: string; code: string; display?: string } // a `Coding` element (Encounter.class)
  | { kind: "codeable-concept"; system: string; code: string; display?: string } // a `CodeableConcept` (Condition.clinicalStatus/verificationStatus)
  // #189 base-QI-Core (disc 495) — a `CodeableConcept[]` element (`Observation.category` / `Condition.category`
  // are 1..*). Each concept writes ONE coding; the array carries ≥1 so a `min: 1..*` element is satisfied.
  | { kind: "codeable-concept-array"; concepts: ReadonlyArray<{ system: string; code: string; display?: string }> };

/** How a STRUCTURAL (FHIR-cardinality-required, concept-independent) element is satisfied when the source doesn't
 *  supply it. Requiredness and defaultability are independent — a FHIR-required element can be clinical and thus
 *  un-defaultable (`authored`), or satisfied by emit machinery rather than a value (`wired`). */
export type StructuralFulfillment =
  | { via: "default"; value: DefaultValue } // an overridable administrative floor (status=`active`, class=OBSENC)
  | { via: "wired"; binding: "case-subject" } // satisfied by emit machinery (subject → the case Patient reference)
  | { via: "authored" }; // FHIR-required AND clinical → must be authored, no safe default (none in Patient+SR yet)

/** One structural required element. `element` is the FHIR MODEL element name — a choice element keeps its `[x]`
 *  (none in the current non-choice subset); step 3 (SD) uses it as-is, step 6 (JSON write) derives the write name
 *  the same way the coding row does. Discriminated `fulfillment` makes the invariant compile-time (no `default?`
 *  that a `wired`/`authored` element could illegally carry). */
export interface StructuralRequiredElement {
  element: string;
  fulfillment: StructuralFulfillment;
}

/** The STRUCTURAL required-element schema per resourceType. Concept-required (1.b) is descriptor-derived, NOT
 *  here (see the section header). Patient + ServiceRequest only in this slice. `[]` = "known, no structural
 *  required elements" (Patient); an UNLISTED resource returns `undefined` (fail-closed — a caller must not treat
 *  absence as `[]`, which could ship an incomplete resource silently). */
export const REQUIRED_STRUCTURAL_ELEMENTS: Readonly<Record<string, readonly StructuralRequiredElement[]>> = {
  // Patient has NO FHIR-cardinality-required elements. Its concept-required `birthDate` (the age posrep datum) is
  // descriptor-derived, not listed here — so this is genuinely `[]`.
  Patient: [],
  // ServiceRequest (the request being authorized): `status`+`intent` are FHIR 1..1 with safe administrative
  // defaults; `subject` is 1..1 satisfied by the emit wiring (the case Patient reference), NOT a literal. `code`
  // (the requested item's identity) is the CONCEPT datum → descriptor-derived, not here.
  ServiceRequest: [
    { element: "status", fulfillment: { via: "default", value: { kind: "code", code: "active" } } },
    { element: "intent", fulfillment: { via: "default", value: { kind: "code", code: "order" } } },
    { element: "subject", fulfillment: { via: "wired", binding: "case-subject" } },
  ],
  // Encounter's required elements gate BOTH the emit floor and its case-feature SD (it became a case-feature
  // row 2026-08-30; the `EMIT-FLOOR-ONLY / never a case-feature datum` note here was that deferral). R4 `status`
  // (1..1) + `class` (1..1, a `Coding`) were emitted MISSING → invalid FHIR. `class` defaults to `OBSENC`
  // (observation encounter, v3-ActCode) per operator; `status` to `finished`.
  Encounter: [
    { element: "status", fulfillment: { via: "default", value: { kind: "code", code: "finished" } } },
    {
      element: "class",
      fulfillment: {
        via: "default",
        value: {
          kind: "coding",
          system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
          code: "OBSENC",
          display: "observation encounter",
        },
      },
    },
  ],
  // Observation (value-bearing case-feature): R4 `status` 1..1 (`code` is the concept datum). An asserted
  // analytical determination HOLDS at emit → `final` (was a hardcoded emitter special case; unified here so the
  // validate/SD steps see it too). `subject` is 0..1 (optional), so not required.
  // `category` 1..* is QI-Core Simple Observation (base preferred + us-core slice required); `survey` (an
  // assessed/derived-score category) is honest for an analytical determination and is a member of BOTH bindings
  // (disc 495 verification). NOT a retrieve key → safe administrative default.
  Observation: [
    { element: "status", fulfillment: { via: "default", value: { kind: "code", code: "final" } } },
    {
      element: "category",
      fulfillment: {
        via: "default",
        value: {
          kind: "codeable-concept-array",
          concepts: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "survey" }],
        },
      },
    },
  ],
  // Condition: `subject` (1..1) is emit-wired. `clinicalStatus`/`verificationStatus` are 0..1 in base R4 but
  // profile-required and expected downstream — defaulted (operator) to `active`/`confirmed` CodeableConcepts (an
  // asserted, confirmed current condition). `code` is the concept datum. (con-3 holds: verificationStatus is not
  // entered-in-error, so a present clinicalStatus is valid.)
  Condition: [
    { element: "subject", fulfillment: { via: "wired", binding: "case-subject" } },
    // `category` 1..* is QI-Core Condition (problems-health-concerns): the us-core slice is a REQUIRED binding
    // (`us-core-problem-or-health-concern`). `health-concern` — ⚠ from the US CORE CodeSystem, NOT THO — is the
    // honest asserted-determination member (disc 495 verification). NOT a retrieve key → safe administrative default.
    {
      element: "category",
      fulfillment: {
        via: "default",
        value: {
          kind: "codeable-concept-array",
          concepts: [{ system: "http://hl7.org/fhir/us/core/CodeSystem/condition-category", code: "health-concern" }],
        },
      },
    },
    {
      element: "clinicalStatus",
      fulfillment: {
        via: "default",
        value: {
          kind: "codeable-concept",
          system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
          code: "active",
          display: "Active",
        },
      },
    },
    {
      element: "verificationStatus",
      fulfillment: {
        via: "default",
        value: {
          kind: "codeable-concept",
          system: "http://terminology.hl7.org/CodeSystem/condition-verification",
          code: "confirmed",
          display: "Confirmed",
        },
      },
    },
  ],
  // Procedure: R4 `status` 1..1 + `subject` 1..1 (`code` is the concept datum). An asserted procedure that
  // occurred → `completed`.
  Procedure: [
    { element: "status", fulfillment: { via: "default", value: { kind: "code", code: "completed" } } },
    { element: "subject", fulfillment: { via: "wired", binding: "case-subject" } },
  ],
  // MedicationRequest: R4 `status`+`intent` 1..1 (like ServiceRequest) + `subject` 1..1 (`medication[x]` is the
  // concept datum, a choice element — descriptor-derived, not here).
  MedicationRequest: [
    { element: "status", fulfillment: { via: "default", value: { kind: "code", code: "active" } } },
    { element: "intent", fulfillment: { via: "default", value: { kind: "code", code: "order" } } },
    { element: "subject", fulfillment: { via: "wired", binding: "case-subject" } },
  ],
};

/** The structural required-element schema for a resource, or `undefined` when the resource has no schema in this
 *  slice (caller fails closed per the section header's consumer contract — must NOT treat absence as `[]`). */
export function requiredStructuralElements(
  resourceType: string,
): readonly StructuralRequiredElement[] | undefined {
  return Object.prototype.hasOwnProperty.call(REQUIRED_STRUCTURAL_ELEMENTS, resourceType)
    ? REQUIRED_STRUCTURAL_ELEMENTS[resourceType]
    : undefined;
}

/** The FHIR JSON value a `default` fulfillment writes verbatim into its element: a primitive `code` writes the
 *  bare string; a `Coding` writes `{system, code, display?}`; a `CodeableConcept` wraps that Coding in `{coding:
 *  [...]}`. */
export function defaultValueJson(value: DefaultValue): unknown {
  if (value.kind === "code") return value.code;
  if (value.kind === "codeable-concept-array") {
    // `CodeableConcept[]` (e.g. `Observation.category` / `Condition.category`, 1..*): each concept is ONE coding.
    return value.concepts.map((c) => ({
      coding: [{ system: c.system, code: c.code, ...(c.display !== undefined ? { display: c.display } : {}) }],
    }));
  }
  const coding = {
    system: value.system,
    code: value.code,
    ...(value.display !== undefined ? { display: value.display } : {}),
  };
  return value.kind === "coding" ? coding : { coding: [coding] };
}

// ── #189 base QI-Core (disc 495) — instance `meta.profile` stamping ──────────────────────────────────────
/** The base QI-Core profile canonical per fact-emitted resource type, stamped as instance `meta.profile`.
 *  UNVERSIONED (canonical URLs are version-stable; the pinned VERSION — QI-Core 7.0.2 / US Core 7.0.0 — is a
 *  build/validation concern, not the wire value; disc 495 Q3). Condition defaults to problems-health-concerns
 *  (an analytical determination is a health-concern, NOT an encounter-diagnosis — charter §2; the concept→profile
 *  selection is #296). Patient has no RESOURCE_EMIT_REGISTRY row (it is the case subject, not a case-feature
 *  datum) but IS stamped. Consumed by the CEL instance writer additively — never clobbers an existing (CPG) profile. */
export const QICORE_BASE_PROFILE: Readonly<Record<string, string>> = {
  Patient: "http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-patient",
  Observation: "http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-simple-observation",
  Condition: "http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-condition-problems-health-concerns",
  Procedure: "http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-procedure",
  ServiceRequest: "http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-servicerequest",
  MedicationRequest: "http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-medicationrequest",
  Encounter: "http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-encounter",
};

/** The base QI-Core profile canonical for a fact-emitted resource type, or `undefined` (a type with no base
 *  QI-Core mapping — e.g. an activity-output Task — stays unstamped). Own-property guarded (prototype-pollution). */
export function qicoreBaseProfile(resourceType: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(QICORE_BASE_PROFILE, resourceType)
    ? QICORE_BASE_PROFILE[resourceType]
    : undefined;
}

// ── T2: JSON-write-name resolvers ────────────────────────────────────────────────────────────────────────
// The serialized-JSON write names the CEL lane needs at the flip, DERIVED from the read row via the one FHIR
// polymorphic-element spelling rule. See the SCOPE / SPELLING≠LEGALITY / CONSUMPTION notes in the file header.

/** A resolved JSON write name, or a fail-closed diagnostic. `value-element-unmappable` = a value element T2
 *  cannot map (authored non-`value`, or an unknown value type — general element mapping is T3, design §8);
 *  `unsupported-recency-path` = a `sortExpr` that is not a top-level writable stamp (dotted/empty). */
export type JsonNameResult =
  | { jsonName: string }
  | { errorKind: "value-element-unmappable" | "unsupported-recency-path"; detail: string };

/** The FHIR spelling of a polymorphic (choice) element `<base>[x]` populated with variant `<variant>`:
 *  `<base><Variant>` with the variant's first char uppercased (a primitive like `boolean`/`dateTime` → capital;
 *  a complex type like `CodeableConcept` is already capital → no-op). NOT a legality claim — see the header. */
function choiceElementJsonName(base: string, variant: string): string {
  return base + variant.charAt(0).toUpperCase() + variant.slice(1);
}

/** The JSON write name for a resource's retrieve coding, derived from its read-side `CodingStrategy`. A plain
 *  `codeable-concept` writes its own element name (`code`); a `choice-codeable-concept` writes the CodeableConcept
 *  variant of its choice element (`medication` → `medicationCodeableConcept`). Total over the two strategy kinds. */
export function codingJsonName(strategy: CodingStrategy): string {
  switch (strategy.kind) {
    case "codeable-concept":
      return strategy.field;
    case "choice-codeable-concept":
      return choiceElementJsonName(strategy.field, "CodeableConcept");
    case "codeable-concept-array":
      return strategy.field; // a plain (repeating) element — its own name, e.g. `type` (Encounter.type[])
  }
}

/** REFACTOR:grounded (#189 P1). The CQL lane's coding-element resolver — the THIRD spelling of one registry
 *  field, kept here beside its siblings so the per-lane taxonomy has ONE home and cannot drift:
 *
 *    CQL literal / read : `medication: <CodeableConcept>`  ·  `(X.medication as FHIR.CodeableConcept)`   <- HERE
 *    JSON instance write: `"medicationCodeableConcept"`                                 <- `codingJsonName`
 *    SD element path    : the model path                                          <- `codingElementModelPath`
 *
 *  ⚠ A CQL resource literal names the CHOICE element itself, never the JSON variant spelling — reusing
 *  `codingJsonName` here emits `medicationCodeableConcept:` into CQL, which does not translate. (Verified in
 *  the CQL engine; caught by `recordConstructor`'s own test before it shipped.) */
export function codingCqlElement(strategy: CodingStrategy): { element: string; array: boolean } {
  return { element: strategy.field, array: strategy.kind === "codeable-concept-array" };
}

/**
 * ⭐⭐ REFACTOR:grounded (#189 boundary transform). RENDER THE IDENTITY CHECK — "is this record OUR case
 * feature?" — for a resource's coding strategy. `alias` is a bound record expression; `codeRef` is the
 * emitted CQL name of the concept's local `code` declaration.
 *
 * ⚠⚠ THIS EXISTS BECAUSE `codingCqlElement` CANNOT DO IT, and the difference is not cosmetic. That resolver
 * flattens `CodingStrategy` to `{ element, array }` — which collapses `codeable-concept` and
 * `choice-codeable-concept` into the same shape, and the CHOICE is exactly the cell that needs an `as` cast.
 * A caller reading `{ element: "medication", array: false }` would emit `X.medication ~ <code>` and be wrong.
 *
 * ⭐ EVERY SPELLING BELOW WAS EXECUTED on the cqf engine — `tmp/NOTES-kernel-spellings-executed.md`, one
 * external-coded and one local-coded record per cell. ⚠ I previously measured ONLY the `codeable-concept`
 * cell and generalised it into a universal `.code ~`; that is wrong for two of the five case-feature
 * resources, and it FAILS AT COMPILE TIME rather than silently ("Could not resolve call to operator
 * Equivalent with signature (list<FHIR.CodeableConcept>, System.Code)").
 *
 * ⚠ `~` IS CONTAINMENT, not set-equality — a record carrying the local code ALONGSIDE its original external
 * code passes, on both the scalar and array cells. That is what `patternCodeableConcept` requires, and it is
 * why the check is sound: the local codesystem is synthetic and ours, and BOTH axes (system and code)
 * discriminate.
 */
export function renderCodingIdentityCheck(strategy: CodingStrategy, alias: string, codeRef: string): string {
  switch (strategy.kind) {
    case "codeable-concept":
      return `${alias}.${strategy.field} ~ ${codeRef}`;
    case "choice-codeable-concept":
      // A choice element can hold a Reference instead (`medicationReference`); the cast yields null there,
      // and `null ~ code` is null — correctly NOT a match, never a crash.
      return `(${alias}.${strategy.field} as FHIR.CodeableConcept) ~ ${codeRef}`;
    case "codeable-concept-array":
      return `exists (${alias}.${strategy.field} CFC where CFC ~ ${codeRef})`;
  }
}

/** REFACTOR:grounded (#189 CEL-writer T2). The CEL instance lane's coding-PLACEMENT resolver: WHERE a resource's
 *  coding is written (the JSON name) and whether it is an ARRAY element — or `undefined` for a resource with no
 *  registry row (the CEL writer then keeps its pre-flip behavior / fails closed at T4). Coding placement is a
 *  RESOURCE-level fact (the registry's own authority), independent of local vs remote — so the CEL writer places
 *  an authored (remote) code, and at T3 a derived local code, on the natural element (Observation→`code`,
 *  MedicationRequest→`medicationCodeableConcept`, Encounter→`type[]`) instead of a universal `.code`. This is
 *  distinct from concept-descriptor resolution (the value / derive-local chokepoint through
 *  `deriveEffectiveRepresentations`, T3), which the descriptor deriver DEFERS for a remote-only concept. */
export function resourceCodingPlacement(
  resourceType: string,
): { jsonName: string; array: boolean } | undefined {
  const row = resourceEmitRow(resourceType);
  if (row === undefined) return undefined;
  return { jsonName: codingJsonName(row.coding), array: row.coding.kind === "codeable-concept-array" };
}

/** The JSON write name for a concept's datum value — the NAME axis of the design §4 value-population rule (the
 *  type-dependent payload encoding is the CEL-lane writer's job at the flip, T5/T6). Maps ONLY the standard
 *  `value[x]` carrier (`valueElement === "value"`) to `value<Type>`, a SPELLING (element legality is T3). Fails
 *  closed on an authored non-`value` element (the T1 boundary — general element mapping needs the model-info
 *  registry, design §8) or an unknown value type. Only ever called when a datum exists (a valueless concept
 *  writes no value at all — not this function's concern). */
export function valueJsonName(
  valueElement: string,
  datumValueType: string | undefined,
): JsonNameResult {
  if (valueElement !== "value") {
    return {
      errorKind: "value-element-unmappable",
      detail: `authored value element \`${valueElement}\` is not mappable in T2 (only the standard \`value[x]\` carrier; general element mapping is the T3 model-info registry, §8)`,
    };
  }
  if (datumValueType === undefined || !conceptValueTypes.includes(datumValueType)) {
    return {
      errorKind: "value-element-unmappable",
      detail: `value type \`${datumValueType ?? "(none)"}\` is not a known concept value type`,
    };
  }
  // A SPELLING only — whether `value[x]` on the target resource admits this variant (e.g. `valueDate` is illegal
  // on Observation.value[x] in R4) is the T3 model-info legality gate, not T2's to assert.
  return { jsonName: choiceElementJsonName("value", datumValueType) };
}

/** The JSON write name for a resource's recency date-stamp, derived from its read-side `RecencyAccess` so the
 *  written stamp is consistent with the read cast BY CONSTRUCTION (a `cast:"dateTime"` choice is populated with
 *  its `<base>DateTime` variant, which `(<base> as FHIR.dateTime).value` reads null-sort-safely). Rejects a
 *  DOTTED-or-EMPTY `sortExpr` FIRST, before either branch (it does NOT validate general FHIR element-name syntax
 *  — whitespace/bracket spellings are unreachable per the consumption contract, so unguarded by design):
 *  `meta.lastUpdated` (uncoded Patient — a server-assigned stamp the resource-writer never emits) and the
 *  Encounter row's `period.start` (nested Period; its recency-write lands at T4) are dotted paths, not top-level
 *  stamps; a naive `cast:"dateTime"` derivation would spell an invalid nested `period.startDateTime`. */
export function recencyStampJsonName(recency: RecencyAccess): JsonNameResult {
  const expr = recency.sortExpr;
  if (expr.length === 0 || expr.includes(".")) {
    return {
      errorKind: "unsupported-recency-path",
      detail: `a dotted or empty \`sortExpr\` (\`${expr}\`) is not a top-level writable stamp — recency-path writability is a SEPARATE later concern, NOT the T3a value-read model (current instances: Patient \`meta.lastUpdated\`, server-assigned/never written; the Encounter row's \`period.start\`, whose nested-Period recency-write lands at T4)`,
    };
  }
  switch (recency.cast) {
    case "none":
      return { jsonName: expr }; // a plain top-level dateTime element (`recordedDate`, `authoredOn`) writes as itself
    case "dateTime":
      return { jsonName: choiceElementJsonName(expr, "dateTime") }; // choice populated with the dateTime variant
  }
}

// ── #189 2d: case-feature StructureDefinition profile shape ───────────────────────────────────────────────
// The SD-DIFFERENTIAL model spelling — a THIRD spelling distinct from the CQL-read row (`effective`) and the
// JSON-write name (`effectiveDateTime`): an SD element `id`/`path` uses the FHIR MODEL name — a choice element
// keeps its `[x]` (`Observation.effective[x]`), a plain element is itself (`Condition.recordedDate`). Deriving
// the case-feature profile from the registry (not a second resource switch in `structureDefinition.ts`) keeps the
// per-resource knowledge in one place (panel disc 481). Consumes a resourceType + the concept's value datum;
// fail-closed `undefined` for an unlisted resource (the caller emits `unsupported-casefeature-resource`).

/** The SD-model element name for a resource's retrieve coding: a plain `CodeableConcept` is its own element
 *  (`code`); a choice element keeps its `[x]` (`medication[x]`). NOT the JSON write name (`medicationCodeableConcept`
 *  — that is `codingJsonName`), NOT the CQL read (`medication`). */
function codingElementModelPath(coding: CodingStrategy): string {
  switch (coding.kind) {
    case "codeable-concept":
    case "codeable-concept-array":
      return coding.field; // a plain element keeps its own name (`code`, `type`); array-ness is cardinality
    case "choice-codeable-concept":
      return `${coding.field}[x]`;
  }
}

/** The SD-model element name for a resource's recency stamp: a `cast:"dateTime"` sort is a choice element
 *  (`effective[x]`/`performed[x]`); a `cast:"none"` sort is a plain top-level element (`recordedDate`/`authoredOn`). */
function recencyElementModelPath(recency: RecencyAccess): string {
  return recency.cast === "dateTime" ? `${recency.sortExpr}[x]` : recency.sortExpr;
}

/** The differential shape a case-feature StructureDefinition needs for one resource — the natural-resource
 *  generalization of the old hardcoded Observation profile (#189 2d; charter §4 "case-features are ANY resource").
 *  `value` is present iff the concept READS a value (a value-reading reduction on a value-bearing resource); a
 *  valueless-existence concept (`exists this`, the common case) carries NO value element regardless of the
 *  resource's inherent value-bearing-ness. `subject` is the invariant patient-reference element — constant across
 *  every registry resource (Condition/Observation/Procedure/ServiceRequest/MedicationRequest all use `.subject`). */
export interface CaseFeatureProfileShape {
  resourceType: string;
  baseDefinition: string;
  codingElementPath: string;
  recencyElementPath: string;
  /** Always `subject` for the registry subset — pinned as an invariant, not a per-row field. */
  subjectElementPath: string;
  /** Present iff the concept reads a value (never for `exists this`). `elementPath` is the model `value[x]`
   *  carrier; `typeCode` is the concept's datum value type. */
  value?: { elementPath: string; typeCode: string };
}

/** Derive the case-feature SD profile shape for a resource, or `undefined` when the resource is not in the emit
 *  registry (caller fails closed with `unsupported-casefeature-resource`). `valueDatum` is the concept's read
 *  value (from the effective-representation descriptor) — omitted for a valueless-existence concept. Only the
 *  standard `value[x]` carrier is mapped (matching T2's `valueJsonName` boundary); a non-`value` carrier is the
 *  T3 model-info concern (design §8) and must be gated by the caller before calling this. */
export function caseFeatureProfileShape(
  resourceType: string,
  valueDatum?: { valueElement: string; datumValueType: string },
): CaseFeatureProfileShape | undefined {
  const row = resourceEmitRow(resourceType);
  if (row === undefined) return undefined;
  // A′ gate (#189 CEL-writer T2, disc 486): a row whose case-feature cells are not yet established profiles no
  // SD. ⚠ The gate is about what we have ESTABLISHED, not a category of resource — see `caseFeature`'s docstring.
  // No live row is `false` today (Encounter, the last one, flipped 2026-08-30).
  if (!row.caseFeature) return undefined;
  // ⭐ THE CASE-FEATURE SD DERIVES FROM QI-CORE (operator, 2026-08-30), not from base FHIR.
  //
  // This used to hardcode `http://hl7.org/fhir/StructureDefinition/<Resource>` while the CEL INSTANCE lane
  // stamped `qicoreBaseProfile(...)` on the records it writes (`cel/emitter/emitFhir.ts`). So a written
  // instance claimed QI-Core conformance against a case-feature SD derived from base FHIR — the two lanes
  // disagreeing about the base, which is the same class of lane-inconsistency the D6 parity invariant
  // exists to catch (it caught the `subject` half; this is the other half).
  //
  // ⭐ It also makes an obligation STRUCTURAL that was previously discovered by accident: QI-Core requires
  // `subject` on a Condition, so a case-feature record without one is non-conformant BY THE BASE. That was
  // found this morning by diffing the two lanes and fixed from `subjectElementPath`; deriving from QI-Core
  // is why it should never have needed finding.
  //
  // ⚠ FAILS CLOSED on an unmapped resource rather than falling back to base FHIR: a silent fallback would
  // reintroduce exactly the split this removes. Every `caseFeature: true` row is mapped today.
  const base = qicoreBaseProfile(resourceType);
  if (base === undefined) return undefined;
  return {
    resourceType,
    baseDefinition: base,
    codingElementPath: codingElementModelPath(row.coding),
    recencyElementPath: recencyElementModelPath(row.recency),
    subjectElementPath: "subject",
    ...(valueDatum !== undefined && valueDatum.valueElement === "value"
      ? { value: { elementPath: "value[x]", typeCode: valueDatum.datumValueType } }
      : {}),
  };
}
