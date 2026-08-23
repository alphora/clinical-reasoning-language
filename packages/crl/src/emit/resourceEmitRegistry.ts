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
// Encounter, once among those, now has a CEL-writer-only (`caseFeature: false`) row (added T2).
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
  /** REFACTOR:grounded (#189 CEL-writer, design panel disc 486 — A′). The row's CAPABILITY marker: which
   *  consumers may honor it. `true` = a case-feature datum resource PROVEN so far, honored by the definition lane
   *  (`caseFeatureProfileShape` / descriptor derivation, which profile an SD + `action.input`). `false` = a
   *  resource the CEL writer emits but no case-feature has YET been proven to read (e.g. Encounter as an
   *  ambient/QM-operand datum, added by the CEL-writer flip): the definition lane's case-feature gate skips it;
   *  flipping `false`→`true` later is the intended one-line reversibility, NOT a category impossibility.
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
 *  landed with the #189 CEL-writer flip (T2) — a CEL-writer-only (`caseFeature: false`) row. */
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
  // retrieve on `type`), but no case-feature has `type is Encounter`, so the definition lane's case-feature gate
  // skips this row. Coding is the `type[]` ARRAY (a visit code is `Encounter.type`, NOT `.code` — R4 Encounter
  // has no `.code`). `recency` is the nested `period.start`; nested-Period recency is CONSUMED at T4
  // (applyDateField-by-role) — it is NOT read by T2's coding path, and the T2 recency resolvers (which reject a
  // dotted path) are never reached for Encounter (caseFeature-gated off the definition lane).
  Encounter: {
    coding: { kind: "codeable-concept-array", field: "type" }, // Encounter.type[] — a visit code, NOT `.code`
    recency: { sortExpr: "period.start", cast: "none" }, // nested Period; consumed at T4, not by T2 coding
    valueless: true,
    caseFeature: false,
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
// would regress it). SCOPE now: Patient + ServiceRequest (remote channel) + Encounter (emit-floor-only; it was
// emitting invalid, missing status/class).

/** The value shape for an overridable `default` fulfillment — a primitive `code` element (`status`) or a `Coding`
 *  element (`Encounter.class`). The emitter writes this verbatim into the FHIR element, so it must be the exact
 *  serialized shape (not a token/CEL literal — the axis gpt56 flagged as ambiguous, disc 493). */
export type DefaultValue =
  | { kind: "code"; code: string } // a primitive `code` element (Encounter/ServiceRequest.status, .intent)
  | { kind: "coding"; system: string; code: string; display?: string }; // a `Coding` element (Encounter.class)

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
  // Encounter is EMIT-FLOOR-ONLY (`caseFeature: false` — the CEL writer emits it as ambient context, but it is
  // never a case-feature datum, so no SD; its required elements gate the emit floor, not the SD). R4 `status`
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

/** The FHIR JSON value a `default` fulfillment writes verbatim into its element: a primitive `code` element
 *  writes the bare code string; a `Coding` element writes a `{system, code, display?}` object. */
export function defaultValueJson(value: DefaultValue): unknown {
  return value.kind === "code"
    ? value.code
    : { system: value.system, code: value.code, ...(value.display !== undefined ? { display: value.display } : {}) };
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
  // A′ gate (#189 CEL-writer T2, disc 486): a CEL-writer-only row (`caseFeature: false`, e.g. Encounter) is never
  // a case-feature datum — the definition lane must NOT profile an SD for it, even though the CEL writer emits it.
  if (!row.caseFeature) return undefined;
  return {
    resourceType,
    baseDefinition: `http://hl7.org/fhir/StructureDefinition/${resourceType}`,
    codingElementPath: codingElementModelPath(row.coding),
    recencyElementPath: recencyElementModelPath(row.recency),
    subjectElementPath: "subject",
    ...(valueDatum !== undefined && valueDatum.valueElement === "value"
      ? { value: { elementPath: "value[x]", typeCode: valueDatum.datumValueType } }
      : {}),
  };
}
