// #189 P1 — RECORD CONSTRUCTION capability + signature, derived from the resource registry.
//
// REFACTOR:grounded (#189 P1) — re-derived from `docs/CRL-NORTH-STAR.md` and the P1 design of record
// (`tmp/DESIGN-P1-case-feature-construction.md`), NOT from any existing emitter behaviour. Nothing
// constructs a record today, so there was no current behaviour to anchor on.
//
// WHY THIS EXISTS. A concept can be determined three ways at once — ASSERTED (a local `code is` answer),
// RECORDED (a `source representation`), DERIVED (a calculation). The merge picks between them by recency,
// so every arm must carry a timestamp; a computed value has no record to carry one. The operator settled
// the shape (2026-08-30): a computed value CONSTRUCTS A RECORD of the concept's declared `type is`. Then
// all arms are records, and the merge is one selection over one homogeneous space.
//
// ⭐ CONSTRUCTION IS ORTHOGONAL TO `shape is` (design D0). `shape is` decides what the LAST STAGE
// PUBLISHES — `RecordSet` the space, `Record` one member, `Scalar` a reduced value — and never whether a
// derived arm constructs. A `Scalar` concept still HAS records (the charter states both types in one
// breath: "the representation datum is a `Condition` record …; the published result is `Scalar<Boolean>`
// produced by `exists`"). `RecordSet` constructs too — `policy-recordset.crl`'s own comment requires its
// records to be "the UNION of the computed values …, the recorded ones, and the answered ones".
//
// ⚠ THE VALUE MODE IS DERIVED, NEVER CHOSEN BY A CALLER (panel round 2). It falls out of the registry's
// `valueless` flag: a value-bearing resource carries the computed value in `value[x]`, a valueless one
// carries its truth by EXISTENCE. There is deliberately no existence-mode constructor for a value-bearing
// resource — charter §4 is explicit that a value-bearing Observation's boolean "legitimately lives in
// `Observation.value`", so constructing a presence-only Observation would discard a slot the resource has.
//
// ⚠ CAPABILITY IS DERIVED, NOT "THE REGISTRY HAS A ROW" (design D3a). `StructuralFulfillment` has three
// variants with DIFFERENT semantics — `default` renders as a literal, `wired` needs a runtime binding the
// emitter supplies, `authored` has no constructor value at all. An `authored` requirement must FAIL
// construction loudly rather than silently omit a required element.
//
// ⚠ VALUELESS RESOURCES CANNOT CARRY A COMPUTED `false` (design D0b; charter §4). Condition / Procedure /
// ServiceRequest / MedicationRequest have no value element, and the charter forbids fabricating one. Their
// truth is EXISTENCE, so a valueless-typed derivation constructs a record for `true` and contributes NO
// candidate for `false` or null — mirroring the posrep, whose truth is also carried by existence.
// ⭐ The consequence is load-bearing and easy to miss: for a valueless-typed concept there is NO
// computed-false route to a Deny. The only route is a stated local `false` on a value-bearing arm.
//
// WHAT WAS EXECUTED, precisely (design §8 — narrowed after round 2 flagged this header as overclaiming):
// an Observation literal carrying a `Quantity`, a Condition existence literal, a heterogeneous
// `List<FHIR.Resource>` bound to `derivedFrom`, a `System.String` assigned into `meta.profile`,
// `MedicationRequest.medication[x]`, null parameters, and a context-derived subject reference.
// NOT probed: a `codeable-concept-array` coding (`Encounter.type[]`) — which is moot here, because
// Encounter is REFUSED below — and value variants other than `Quantity`.

import { conceptValueTypes } from "../grammar/conceptValueTypes";
import {
  resourceEmitRow,
  requiredStructuralElements,
  codingCqlElement,
  type RecencyAccess,
  type ResourceEmitRow,
  type StructuralRequiredElement,
} from "./resourceEmitRegistry";

/** ⚠ RE-EXPORTED so the RENDERER need not import the registry at all.
 *
 * `resourceEmitRegistry` has a sanctioned-importer boundary (`effectiveRepresentation.test.ts`) guarding
 * against premature wiring, and the renderer is not a lane site — its contract is with
 * `ConstructorSignature`, which already carries every registry fact it may use. Re-exporting the two
 * types that contract exposes keeps the boundary intact AND makes the layering physical: the renderer
 * CANNOT reach registry data, so it cannot re-query what `resolveConstructor` already validated. */
export type { DefaultValue, StructuralRequiredElement } from "./resourceEmitRegistry";

/** A runtime value the EMITTER must supply to a constructor — the registry's `wired` fulfillments. Today
 *  the only one is the case Patient reference; the union exists so a new binding is a compile error at
 *  every consumer rather than a silently-unfilled required element. */
export type ConstructorBinding = "case-subject";

/** Why a resource cannot be constructed at all. Each is a REFUSAL, never a partial or best-effort emit
 *  (charter §4 — fail loud, never fabricate). Reasons are DISTINCT per cause: a caller routing
 *  diagnostics must never have to parse `detail` to tell two causes apart. */
export type ConstructorImpossibility =
  // No `RESOURCE_EMIT_REGISTRY` row. Fail-closed: absence is "unknown", never "no requirements".
  | { reason: "unsupported-resource"; detail: string }
  // A row exists but no `REQUIRED_STRUCTURAL_ELEMENTS` entry does. Distinct from the above so a caller can
  // tell "unknown resource" from "known resource, unknown obligations".
  | { reason: "no-structural-schema"; detail: string }
  // ⭐ The row is CEL-writer-only (`caseFeature: false`, e.g. Encounter). The definition lane must not
  // profile an SD for it, so a constructed record would have no case-feature profile to instantiate.
  | { reason: "not-a-case-feature-datum"; detail: string }
  // The recency stamp is a DOTTED path (`period.start`), which is not a top-level writable element.
  | { reason: "recency-not-constructible"; detail: string }
  // The concept's value type is not a known CRL value type at all.
  | { reason: "value-type-unmappable"; detail: string }
  // ⚠ The value type is a known CRL type but is NOT certified legal on this resource's `value[x]`.
  | { reason: "value-variant-uncertified"; detail: string }
  // A required element is `via: "authored"` — FHIR-required AND clinical, so no safe constructor value.
  | { reason: "authored-requirement"; detail: string };

/** What the emitter owes before it can render a constructor.
 *  - `constructible`    — every required element renders from a literal default. Nothing owed.
 *  - `requires-context` — some required element is `wired`; the emitter MUST supply `bindings`. */
export type ConstructorCapability =
  | { kind: "constructible" }
  | { kind: "requires-context"; bindings: readonly ConstructorBinding[] }
  | ({ kind: "impossible" } & ConstructorImpossibility);

/** How the constructed record carries its truth. DERIVED from `valueless`, never passed in. */
export type ValueMode = "value" | "existence";

/**
 * ⚠ The value variants CERTIFIED legal on a resource's `value[x]`, per resource.
 *
 * The registry's own header draws this line and assigns the general case elsewhere: *"SPELLING ≠ LEGALITY
 * … `conceptValueTypes` is CRL-wide (includes `date`/`Attachment`), but e.g. `Observation.value[x]` (R4)
 * admits neither `valueDate` nor `valueAttachment`. Per-resource variant-set legality is the T3 model-info
 * obligation."* Gating only on `conceptValueTypes` therefore reported `constructible` for shapes the
 * translator rejects, which is precisely the deferred-to-a-translator-error failure design D1 forbids.
 *
 * This is a LOCAL FAIL-CLOSED FLOOR, not a second model-info registry: only value-bearing rows need one,
 * and Observation is the only value-bearing row. **T3's model-info registry SUPERSEDES this** — delete it
 * then, do not grow it. Source: FHIR R4 `Observation.value[x]`.
 */
const CERTIFIED_VALUE_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  Observation: [
    "Quantity",
    "CodeableConcept",
    "string",
    "boolean",
    "integer",
    "Range",
    "Ratio",
    "SampledData",
    "time",
    "dateTime",
    "Period",
  ],
};

/** ⭐ The reserved prefix for every generated constructor.
 *
 * ⚠ A collision IS REACHABLE — this was VERIFIED by parsing `concept "CRLConstructObservationQuantity"`,
 * which builds cleanly and keeps that name (CRL concept names are quoted strings, so no lexical rule
 * excludes the prefix). An earlier version of this comment claimed the opposite; that claim was false and
 * would have led whoever wires the renderer to skip the check. **`isConstructorName` is LOAD-BEARING and
 * the renderer must run it against every authored define name before emitting** (design D1: detect before
 * emission, never rely on a translator error). */
export const CONSTRUCTOR_NAME_PREFIX = "CRLConstruct";

/** A System→FHIR conversion the RENDERER must apply at a parameter's landing site. CQL will not do it
 *  implicitly, and a missing conversion surfaces only at `$apply` (design D3c). */
export type ParamConversion =
  // `System.DateTime` → the recency element. `wrap` is the FHIR type to construct.
  | { wrap: "FHIR.dateTime" }
  // `System.String` → a `canonical` inside `meta.profile`'s list.
  | { wrap: "FHIR.canonical" };

export interface ConstructorParam {
  name: string;
  /** The CQL type as written in the emitted signature (e.g. `FHIR.Quantity`, `System.DateTime`). */
  cqlType: string;
  /** The conversion the renderer must apply at the landing site, if any. Absent = already FHIR-typed. */
  conversion?: ParamConversion;
}

/** Everything the CQL renderer needs for ONE constructor. Pure data — this module decides SHAPE, the
 *  renderer decides TEXT, so the shape is testable without string-matching emitted CQL. */
export interface ConstructorSignature {
  functionName: string;
  resourceType: string;
  valueMode: ValueMode;
  params: readonly ConstructorParam[];
  /** The parameter the null-guard tests. For `value` mode a null value yields NO candidate; for
   *  `existence` mode anything but `true` yields no candidate (D0b). */
  guardParam: string;
  /** The FHIR element the computed value lands on — absent in `existence` mode. */
  valueElement?: string;
  /** Where the concept's coding goes. NOT a universal `.code`: the registry declares
   *  `Observation.code`, `MedicationRequest.medication[x]`, `Encounter.type[]` (design D3b). */
  codingElement: { element: string; array: boolean };
  /** The recency stamp's element AND cast — the cast is what tells the renderer whether the element is a
   *  choice needing `FHIR.dateTime` (`effective`/`performed`) or a plain one (`recordedDate`). Carried
   *  WHOLE; an earlier version kept only `sortExpr` and silently dropped the distinction. */
  recency: RecencyAccess;
  /** Where the evidence list lands, when the resource has somewhere to put it (`derivedFrom` on a
   *  value-bearing Observation). ⚠ `undefined` means the resource has NO evidence element — R4 Condition /
   *  Procedure / ServiceRequest / MedicationRequest have no `derivedFrom`. The `evidence` parameter is
   *  still passed, because the record ID is derived from it (see `idStrategy`); it simply is not written
   *  onto the record. */
  evidenceElement?: string;
  /** ⭐ THE RECORD'S IDENTITY IS ITS CONTENT (operator, 2026-08-30) — "the key being the thing … if they
   *  have the same key it's OK because they are the same thing". Two candidates with equal content ARE
   *  one candidate, so collision is CORRECT rather than a bug, and cross-arm dedup falls out for free.
   *
   *  ⚠ The key is therefore NOT carried in `Resource.id`, and that is MEASURED, not preferred:
   *    · this CQL engine has NO hash function (`Hash`/`Digest`/`SHA`/`Md5`/`HashCode` all unresolvable),
   *      so a content key cannot be COMPRESSED;
   *    · uncompressed it does not fit — a realistic key measured 70 chars, 77 with UUID evidence ids,
   *      against FHIR's 64-char limit, and a timestamp contains `:` which FHIR ids disallow.
   *  An id that is neither unique nor content-derived would be WORSE than none: it looks authoritative
   *  and collides silently. So no `id` is emitted, and dedup compares these fields directly.
   *
   *  ⚠ NOT a `provenance` field: two arms whose content is identical publish the same value, so the
   *  ASSERTED > DERIVED > RECORDED tie-break (design §5c) is indifferent between them. Arm identity stays
   *  POSITIONAL (design D9). */
  contentKey: readonly string[];
  /** What the emitter must bind (empty unless the capability was `requires-context`). */
  bindings: readonly ConstructorBinding[];
  /** ⚠ The required structural elements, CARRIED rather than re-queried (panel round 2). The renderer
   *  must fill exactly the set `resolveConstructor` validated — re-querying lets the two drift, and the
   *  `authored` refusal above is only meaningful if the renderer sees the same list it was checked
   *  against. Every entry here is `default` or `wired`; `authored` cannot reach a resolved signature. */
  requiredElements: readonly StructuralRequiredElement[];
}

/** One entry point. A refusal cannot be dropped by calling a different helper, and the diagnostic travels
 *  with it — an exhaustive `switch` on `kind` cannot ignore `impossible` without an explicit branch. */
export type ConstructorResolution =
  | { kind: "resolved"; signature: ConstructorSignature }
  | ({ kind: "impossible" } & ConstructorImpossibility);

/** The `wired` bindings a resource's required elements demand, in registry order. */
function bindingsOf(required: readonly StructuralRequiredElement[]): ConstructorBinding[] {
  const out: ConstructorBinding[] = [];
  for (const r of required) {
    if (r.fulfillment.via === "wired" && !out.includes(r.fulfillment.binding)) out.push(r.fulfillment.binding);
  }
  return out;
}

/**
 * The capability derivation, over EXPLICIT inputs rather than a registry lookup.
 *
 * ⚠ Split out so the refusal branches are TESTABLE. The `authored-requirement` branch is unreachable from
 * the live registry (no row uses `via: "authored"` today), and a refusal whose diagnostic has never once
 * executed is asserted, not tested — so a test injects a synthetic `authored` requirement here.
 */
export function capabilityFromRow(
  resourceType: string,
  row: ResourceEmitRow,
  required: readonly StructuralRequiredElement[],
  valueType?: string,
): ConstructorCapability {
  // ⭐ A CEL-writer-only row is not a case-feature datum, so the definition lane refuses to profile an SD
  // for it (`caseFeatureProfileShape` returns undefined). Constructing a record whose profile cannot exist
  // is incoherent, so refuse here rather than emitting one and discovering it downstream.
  if (!row.caseFeature) {
    return {
      kind: "impossible",
      reason: "not-a-case-feature-datum",
      detail:
        `\`${resourceType}\` is a CEL-writer-only row (\`caseFeature: false\`) — the definition lane emits ` +
        `no case-feature SD for it, so a constructed record would have no profile to instantiate.`,
    };
  }

  // ⚠ An EMPTY recency path is unconstructible — there is no element to stamp.
  //
  // ⚠⚠ A DOTTED path is NOT. An earlier revision refused those too, reasoning from
  // `recencyStampJsonName`'s dotted-path rejection — but that guard is about SPELLING A FLAT JSON NAME
  // (`period.startDateTime` is unspellable), which is the instance-WRITE lane. A CQL literal CONSTRUCTS the
  // nesting instead: `period: FHIR.Period { start: FHIR.dateTime { value: recorded } }`. MEASURED — it
  // builds, reads back, and SORTS on `period.start.value` (design §12).
  //
  // Conflating the two lanes is what made `Encounter` look categorically unconstructible when it is not.
  if (row.recency.sortExpr.length === 0) {
    return {
      kind: "impossible",
      reason: "recency-not-constructible",
      detail: `\`${resourceType}\` has an empty recency path — a constructed record has no element to carry its propagated timestamp`,
    };
  }

  if (!row.valueless) {
    if (valueType === undefined || !conceptValueTypes.includes(valueType)) {
      return {
        kind: "impossible",
        reason: "value-type-unmappable",
        detail: `value type \`${valueType ?? "(none)"}\` is not a known concept value type`,
      };
    }
    const certified = CERTIFIED_VALUE_VARIANTS[resourceType];
    if (certified === undefined || !certified.includes(valueType)) {
      return {
        kind: "impossible",
        reason: "value-variant-uncertified",
        detail:
          `\`${resourceType}.value[x]\` is not certified to admit \`${valueType}\`. Membership in ` +
          `\`conceptValueTypes\` is a SPELLING, not legality (registry header); per-resource variant ` +
          `legality is the T3 model-info obligation. Refusing rather than emitting CQL that will not translate.`,
      };
    }
  }

  const authored = required.find((r) => r.fulfillment.via === "authored");
  if (authored !== undefined) {
    return {
      kind: "impossible",
      reason: "authored-requirement",
      detail:
        `\`${resourceType}.${authored.element}\` is FHIR-required AND clinical (\`via: "authored"\`), so a ` +
        `constructor has no safe value for it. Refusing rather than omitting a required element.`,
    };
  }

  const bindings = bindingsOf(required);
  return bindings.length === 0 ? { kind: "constructible" } : { kind: "requires-context", bindings };
}

/** The registry-bound capability query. `valueMode` is NOT a parameter — it derives from `row.valueless`. */
export function constructorCapability(resourceType: string, valueType?: string): ConstructorCapability {
  const row = resourceEmitRow(resourceType);
  if (row === undefined) {
    return {
      kind: "impossible",
      reason: "unsupported-resource",
      detail: `\`${resourceType}\` has no \`RESOURCE_EMIT_REGISTRY\` row, so its required elements are unknown`,
    };
  }
  const required = requiredStructuralElements(resourceType);
  if (required === undefined) {
    return {
      kind: "impossible",
      reason: "no-structural-schema",
      detail: `\`${resourceType}\` has no \`REQUIRED_STRUCTURAL_ELEMENTS\` entry (absence is NOT \`[]\`)`,
    };
  }
  return capabilityFromRow(resourceType, row, required, valueType);
}

/** The FHIR type name for a concept value type, as written in an emitted CQL signature. Every concept
 *  value type IS a FHIR type of the same name (`Quantity` → `FHIR.Quantity`, `boolean` → `FHIR.boolean`),
 *  so this is a spelling, not a mapping table that could drift. */
function fhirValueCqlType(valueType: string): string {
  return `FHIR.${valueType}`;
}

/** ⭐ The constructor's name. Deterministic in (resourceType, valueMode, valueType) so the SAME shape
 *  dedups to ONE function per library (design D1) and two emitter runs agree byte-for-byte. */
export function constructorFunctionName(
  resourceType: string,
  valueMode: ValueMode,
  valueType?: string,
): string {
  // ⚠ Capitalize the value type: CRL primitive value types are lowercase (`boolean`, `integer`), which
  // rendered `CRLConstructObservationboolean`. Emitted CQL is what goldens pin and reviewers read (design
  // D1), so the seam is worth removing; the name stays deterministic either way.
  const suffix =
    valueMode === "existence"
      ? "Existence"
      : valueType === undefined
        ? ""
        : valueType[0].toUpperCase() + valueType.slice(1);
  return `${CONSTRUCTOR_NAME_PREFIX}${resourceType}${suffix}`;
}

/** Whether `name` is in the reserved constructor namespace — the emitter's pre-emission collision check.
 *  ⚠ Load-bearing: the collision is reachable (see `CONSTRUCTOR_NAME_PREFIX`). */
export function isConstructorName(name: string): boolean {
  return name.startsWith(CONSTRUCTOR_NAME_PREFIX);
}

/**
 * Resolve the constructor for `resourceType`, or refuse with a reason.
 *
 * ⚠ ONE entry point (panel round 2). The previous split — a capability query plus a signature builder that
 * returned `undefined` — let a caller take the second helper alone and drop the refusal with a bare
 * `if (sig)`, silently emitting a concept with a missing arm. That is the exact failure this design
 * forbids, so the refusal now travels inside the result.
 */
export function resolveConstructor(resourceType: string, valueType?: string): ConstructorResolution {
  const cap = constructorCapability(resourceType, valueType);
  if (cap.kind === "impossible") return cap;

  // Both are guaranteed by `cap` not being `impossible`; the emit boundary does not assume its own
  // preconditions.
  const row = resourceEmitRow(resourceType);
  const required = requiredStructuralElements(resourceType);
  if (row === undefined || required === undefined) {
    return { kind: "impossible", reason: "unsupported-resource", detail: `\`${resourceType}\` vanished` };
  }

  const valueMode: ValueMode = row.valueless ? "existence" : "value";
  // Every constructor needs the case subject (see the `subject` parameter below), whether or not the
  // resource's FHIR cardinality makes it structurally required.
  const bindings: readonly ConstructorBinding[] = ["case-subject"];

  // ⭐ No `slug` parameter. An earlier revision added one so a SHARED constructor could build a
  // per-concept id (design D1 dedups one function across concepts, so it cannot know its caller). Content
  // addressing removes the need: `code` is already in the content, and `emit-duplicate-local-code` makes
  // one code identify one concept within a library — and construction is library-local (design D2).
  const params: ConstructorParam[] = [{ name: "code", cqlType: "FHIR.CodeableConcept" }];
  if (valueMode === "value") {
    params.push({ name: "value", cqlType: fhirValueCqlType(valueType as string) });
  } else {
    // The guard for an existence record is the COMPUTED BOOLEAN, not a value: only `true` yields a record.
    params.push({ name: "established", cqlType: "System.Boolean" });
  }
  // §5b — PROPAGATED, never invented. There is deliberately no `Now()` fallback and no evaluation-time
  // parameter anywhere in this contract: a stale calculation stamped `Now()` would beat a fresh assertion
  // in the recency merge. The absence IS the rule.
  params.push({
    name: "recorded",
    cqlType: "System.DateTime",
    conversion: { wrap: "FHIR.dateTime" },
  });
  // ⭐ ALWAYS a subject — not gated on the registry's `wired` list.
  //
  // MEASURED (design §11): the registry marks `Observation.subject` 0..1, so it is not a STRUCTURAL
  // requirement and the wired list omits it — yet the CEL writer emits `subject` on every Observation, and
  // `caseFeatureProfileShape` carries `subjectElementPath: "subject"` for EVERY resource. The case-feature
  // contract is stricter than FHIR cardinality, and a constructed record with no subject is unattributable
  // to a patient. Gating on `wired` produced exactly that for Observation.
  params.push({ name: "subject", cqlType: "FHIR.Reference" });
  params.push({
    name: "profile",
    cqlType: "System.String",
    conversion: { wrap: "FHIR.canonical" },
  });
  // Evidence: bound to `derivedFrom` where the resource has one (design D5) — deterministic references,
  // unlike a contained Provenance stamped `Now()`. Always passed: identity is content-derived from it.
  //
  // ⚠ `List<FHIR.Reference>`, NOT `List<FHIR.Resource>` — MEASURED. A reference needs its `ResourceType/id`
  // prefix, and inside the constructor the list is heterogeneous, so building one there would need a
  // runtime type-dispatch chain — the exact construct that silently returned null in the design's §8
  // probe. The CALLER knows each evidence operand's resource type at EMIT time, so it builds the
  // references. Same reasoning that chose generation over a hand-maintained dispatch in D1.
  params.push({ name: "evidence", cqlType: "List<FHIR.Reference>" });

  return {
    kind: "resolved",
    signature: {
      functionName: constructorFunctionName(resourceType, valueMode, valueType),
      resourceType,
      valueMode,
      params,
      guardParam: valueMode === "value" ? "value" : "established",
      valueElement: valueMode === "value" ? "value" : undefined,
      codingElement: codingCqlElement(row.coding),
      recency: row.recency,
      // R4: only Observation among the registry's rows has `derivedFrom`.
      evidenceElement: valueMode === "value" ? "derivedFrom" : undefined,
      contentKey: [
        "code",
        valueMode === "value" ? "value" : "established",
        "recorded",
        "evidence",
      ],
      bindings,
      requiredElements: required,
    },
  };
}
