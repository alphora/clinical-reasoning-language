// #189 T1 — the per-resource emit registry (crl-emit panel R1 P2/P3/P4, R2 Q2).
//
// The single per-resource table the effective-representation descriptor (and, at the flip, both emit lanes)
// consult for a LOCAL concept's retrieve coding path + recency sort element. INERT in T1 — nothing in the
// production emit path reads it yet.
//
// SCOPE — CQL-READ spelling ONLY. A row names the logical FHIR-model property the CQL lane reads (e.g.
// `effective`, sorted as `(effective as FHIR.dateTime).value`), NOT the serialized JSON write name
// (`effectiveDateTime`). Those differ on every choice element; conflating them is exactly the coherence
// failure the descriptor exists to prevent (panel R1 P2). T2 (resource-writer registry) EXTENDS each row with
// the write-side spellings; do not add them here.
//
// A deliberate SUBSET (the proven local cells). An unlisted resource is a fail-closed `unsupported-resource`
// derivation error — NOT a silent default (panel R1 P4). No universal `.code` default: a strategy is declared
// per row (medication carries its coding on a choice element, not `.code`).

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
}

/** The T1 subset (proven local cells). Unlisted → fail-closed `unsupported-resource`. `codeable-concept-array`
 *  (e.g. Encounter.type) is intentionally absent — no resource in this subset needs it (panel R2 nit). */
export const RESOURCE_EMIT_REGISTRY: Readonly<Record<string, ResourceEmitRow>> = {
  Observation: {
    coding: { kind: "codeable-concept", field: "code" },
    recency: { sortExpr: "effective", cast: "dateTime" }, // effective[x] is a choice element
    valueless: false, // value-bearing (Observation.value)
  },
  Condition: {
    coding: { kind: "codeable-concept", field: "code" },
    recency: { sortExpr: "recordedDate", cast: "none" }, // recordedDate is a plain dateTime
    valueless: true,
  },
  Procedure: {
    coding: { kind: "codeable-concept", field: "code" },
    recency: { sortExpr: "performed", cast: "dateTime" }, // performed[x] is a choice element
    valueless: true,
  },
  ServiceRequest: {
    coding: { kind: "codeable-concept", field: "code" },
    recency: { sortExpr: "authoredOn", cast: "none" }, // authoredOn is a plain dateTime
    valueless: true,
  },
  MedicationRequest: {
    coding: { kind: "choice-codeable-concept", field: "medication" }, // medication[x] choice, NOT `.code`
    recency: { sortExpr: "authoredOn", cast: "none" },
    valueless: true,
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
