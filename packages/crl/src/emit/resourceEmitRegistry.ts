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
// rather than storing a second write table that could drift (design §4/§7/§10). INERT in T2 — nothing production
// calls them; the CEL lane wires them at the flip (T5/T6) and, in the same commit, SUPERSEDES + DELETES the
// parallel prior write authority in `packages/crl/src/cel/emitter/emitFhir.ts`: the `applyDateField` stored
// date map, the universal `resourceBody.code` write, and the type-switched value write (today at :355-371,
// :512-513, :519-527 respectively — SYMBOLS lead; the line refs are as-of and will drift). BLAST RADIUS the
// flip must inherit, not discover: `applyDateField`'s map covers 15 resource types while this registry has 5,
// so the deletion converts the other 10 (Encounter, MedicationStatement, DiagnosticReport, …) into
// descriptor-resolution `unsupported-resource` failures — the intended fail-closed behavior (design §5/§9), a
// stated consequence. Until the flip this is inert infrastructure ALONGSIDE the old authority.
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
  | { kind: "choice-codeable-concept"; field: string }; // a choice element (e.g. MedicationRequest.medication)

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
   *  IMPORTANT — row consultation is ROLE-gated, not resourceType-gated: a row governs a fact only when that
   *  fact's resolved role is a concept-datum role (local/remote). An ACTIVITY-role fact never reads its row even
   *  where one exists — ServiceRequest and MedicationRequest carry `caseFeature: true` rows AND are activity
   *  instance targets (`CPG_TO_FHIR`), and an activity instance carries no concept-datum coding. Keying row
   *  consultation off `resourceType` alone would miswrite those.
   *  ONE table, one row per resource, a marker instead of a second write table that could drift from the retrieve
   *  invariant (the anti-drift purpose of this file's T2 header). Every current row is a proven case-feature
   *  datum, so all are `true` — the marker is output-neutral until the flip adds a `false` row. */
  caseFeature: boolean;
}

/** The T1 subset (proven local cells). Unlisted → fail-closed `unsupported-resource`. `codeable-concept-array`
 *  (e.g. Encounter.type) is intentionally absent — no resource in this subset needs it (panel R2 nit). */
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
  }
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
 *  `meta.lastUpdated` (uncoded Patient — a server-assigned stamp the resource-writer never emits) and, later,
 *  design §2's Period recency (`period.start`) are dotted paths, not top-level stamps, until T3; a naive
 *  `cast:"dateTime"` derivation would spell an invalid nested `period.startDateTime`. */
export function recencyStampJsonName(recency: RecencyAccess): JsonNameResult {
  const expr = recency.sortExpr;
  if (expr.length === 0 || expr.includes(".")) {
    return {
      errorKind: "unsupported-recency-path",
      detail: `a dotted or empty \`sortExpr\` (\`${expr}\`) is not a top-level writable stamp — recency-path writability is a SEPARATE later concern, NOT the T3a value-read model (current instances: Patient \`meta.lastUpdated\`, server-assigned/never written; §2 Period recency \`period.start\`, out of the resource subset)`,
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
  return coding.kind === "codeable-concept" ? coding.field : `${coding.field}[x]`;
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
