import { conceptTypes, type ConceptType } from "../../grammar/conceptTypes";
import {
  isQualifiedRef,
  getRefName,
  getRefLibrary,
  type Statement,
  type Concept,
} from "../../ast/types";
import {
  hasLocalCode,
  hasSourceBinding,
  isResourcelessDerived,
} from "../../emit/conceptDatumSignals";
import {
  resourceCodingPlacement,
  requiredStructuralElements,
  defaultValueJson,
  qicoreBaseProfile,
  valueJsonName,
} from "../../emit/resourceEmitRegistry";
import {
  deriveEffectiveRepresentations,
  type OwningLibraryMetadata,
} from "../../emit/effectiveRepresentation";
import { readCanonicalBase, readPolicyId } from "../../fhir-emitter/metadata";
import { createLocalDomainResolver, deriveLocalConceptCoding } from "../../fhir-emitter/localDomain";
import {
  parseCanonicalToken,
  classifyCanonicalToken,
  type CodeParts,
} from "../canonicalToken";
import { localCodePathsOf } from "../localMembership";
import { buildDefinedByCandidates } from "../definedByResolve";
import { isValueReadingBooleanConcept } from "../../template-match/recencyValueConcept";
import type { Registry, RegistryEntry } from "../../imports/types";
import type { ResolvedCelGraph } from "../imports/types";
import type {
  CELFact,
  CELCase,
  CELDefinedByField,
  CELFactBody,
  CELCaseBody,
  CELFactRefField,
  CELAnchorField,
  CELAnchorExpr,
  CELDurationOffset,
  CELAtClause,
  CELCrossResourceField,
  CrossResourceRelation,
  CELValueField,
} from "../ast/types";

import type {
  EmitResult,
  EmitDiagnostic,
  EmittedCase,
  EmittedResource,
  EmitCelOptions,
} from "./types";

/** Cap for the CEL FHIR id composite, comfortably under the 64-char FHIR id ceiling. */
const CEL_ID_BASE_MAX = 56;

const CONCEPT_TYPE_SET: Set<string> = new Set<string>(conceptTypes as readonly ConceptType[]);

/** REFACTOR:grounded (#189 CEL-writer, design panel disc 486 + impl round disc 487). A CEL fact's RESOLVED
 *  SEMANTIC ROLE — the axis the CEL instance writer dispatches on (NOT the raw resourceType). It determines HOW
 *  coding is produced:
 *   - "local"    : the backing concept carries a local `code is`. Its LOCAL arm is LIVE → coding is DERIVED from
 *                  the concept (local domain code + `<canonicalBase>/CodeSystem/<domain>-local`, design §4
 *                  derive-local). A concept that ALSO carries a `coded from`/`source representation` (a bothrep,
 *                  INCLUDING patient-age's Patient projection) is STILL "local" here: the source arm is DEFERRED
 *                  (#189 D2), never a reason to fail — the local arm emits. This mirrors the descriptor deriver,
 *                  which returns a live `derived[local-exact, …]` for exactly these (effectiveRepresentation.ts).
 *   - "remote"   : source-ONLY — a `coded from` / `source representation` with NO local `code is`. Basic emit
 *                  places the AUTHORED external code on the natural element WHEN one exists; an UNCODED posrep
 *                  (Patient/birthDate, no `coded from`) has no authored code — todo 2 splits coded-vs-uncoded or
 *                  fails closed. The full sourced model (external-VS validation, selective-rep) is #257-deferred.
 *   - "activity" : an Activity-derived OUTPUT instance (Task/CommunicationRequest/… via CPG_TO_FHIR) — category 3;
 *                  its own dating/coding rules, no concept-datum coding.
 *   - "bare-type": a bare `defined by <FhirType>` ref with no backing concept — an OPEN cell (todo 4: sniff/reject).
 *   - "derived"  : a concept with NO datum (no `code is`, no source binding; a pure `defined as`/code-less
 *                  reduction boolean) — ephemeral, not directly assertable as a CEL fact; the writer fails closed
 *                  (case-atomic, todo 4).
 *  ONE authority: the datum signals come from the SHARED `hasLocalCode`/`hasSourceBinding` predicates the
 *  descriptor deriver uses, so this cannot drift from the definition lane. INERT in todo 1 (computed + returned,
 *  consumed by NO write path yet). Todos 2/3 dispatch the write on this role AND resolve the effective-
 *  representation descriptor from the carried `Concept` + owning library (the single authority; the role tag is
 *  the dispatch discriminant, the descriptor is the payload). */
export type FactRole = "local" | "remote" | "activity" | "bare-type" | "derived";

/** Classify a resolved backing concept's representation role for the CEL writer (see `FactRole`). A local
 *  `code is` WINS (its local arm is live; any source arm is #189-D2-deferred, not fail-closed) — so a bothrep and
 *  patient-age both classify "local". Source-only (`coded from`/posrep, no code) → "remote". Neither datum →
 *  "derived" (ephemeral). Uses the SHARED datum predicates so it never drifts from the descriptor deriver. */
export function classifyConceptRole(c: Concept): FactRole {
  if (hasLocalCode(c)) return "local";
  if (hasSourceBinding(c)) return "remote";
  return "derived";
}

/**
 * Activity (CPG profile) → FHIR resource type mapping (per pitch v4 critical
 * decision #2 bounded MVP). Every entry in `activityTypes.json` maps somewhere.
 */
// CRL `request CPG<Type>` token → FHIR resource kind (the `kind` value
// on the emitted ActivityDefinition / the type of resource the activity
// instantiates when applied). Tokens align with the CPG IG Request
// column (https://build.fhir.org/ig/HL7/cqf-recommendations/profiles.html#activity-profiles)
// with the `Task` suffix consistently dropped — see grammar rename
// commit aligning to that convention.
//
// `kind` values verified against each cpg-XXX-activity profile FSH
// in HL7/cqf-recommendations:
//   * cpg-servicerequestactivity      kind = #ServiceRequest
//   * cpg-medicationrequestactivity   kind = #MedicationRequest
//   * cpg-immunizationactivity        kind = #MedicationRequest  (NOT ImmunizationRequest — IG models immunization recommendation as MedicationRequest)
//   * cpg-communicationactivity       kind = #CommunicationRequest
//   * cpg-collectinformationactivity  kind = #Task
//   * cpg-enrollmentactivity          kind = #Task
//   * cpg-proposediagnosisactivity    kind = #Task
//   * cpg-recorddetectedissueactivity kind = #Task
//   * cpg-recordinferenceactivity     kind = #Task
//   * cpg-reportflagactivity          kind = #Task
//   * cpg-generatereportactivity      kind = #Task
//   * cpg-dispensemedicationactivity  kind = #Task
//   * cpg-documentmedicationactivity  kind = #Task
//   * cpg-administermedicationactivity kind = #Task
const CPG_TO_FHIR: Record<string, string> = {
  CPGServiceRequest: "ServiceRequest",
  CPGMedicationRequest: "MedicationRequest",
  // T12 / #88: was "MedicationRequest" — not the right R4 type for an
  // immunization. R4 doesn't have an ImmunizationRequest resource;
  // ImmunizationRecommendation is the planning/request-shaped R4 type.
  CPGImmunizationRequest: "ImmunizationRecommendation",
  CPGCommunicationRequest: "CommunicationRequest",
  CPGQuestionnaire: "Task",
  CPGEnrollment: "Task",
  CPGProposeDiagnosis: "Task",
  CPGRecordDetectedIssue: "Task",
  CPGRecordInference: "Task",
  CPGReportFlag: "Task",
  CPGGenerateReport: "Task",
  CPGDispenseMedication: "Task",
  CPGDocumentMedication: "Task",
  CPGAdministerMedication: "Task",
};

// Slugify moved to `src/fhir-emitter/slug.ts` so CRL and CEL emitters
// share one helper. v2.3.0-FHIR-Todo-1 also added a 64-char truncation
// cap matching the FHIR `id` regex — CEL slugify wasn't hitting the cap
// in the corpus, but inheriting the cap is correct.
import { rawSlug, slugify, uniqueCapSlug } from "../../fhir-emitter/slug";
import { lookupCpgActivityProfile } from "../../fhir-emitter/cpgActivityProfiles";

interface DerivedType {
  fhirType: string;
  /** Source kind from the resolved CRL declaration; `undefined` for bare refs. */
  kind?: "Concept" | "Activity";
  /**
   * CPG-IG instance profile canonical (e.g. cpg-servicerequest). Present only
   * for Activity-kind derivations where the CPG activityType has a known
   * targetProfile (see fhir-emitter/cpgActivityProfiles.ts). Stamped onto
   * emitted instances as meta.profile per T12 / #89.
   */
  profileUrl?: string;
  /**
   * T12 / #87: the Activity declared `request do not perform <Type>`. The
   * emitted instance gets `doNotPerform: true` (for resources that support
   * it) so the prohibition propagates from the definition to every
   * instance — pre-fix the flag only fired when the CEL fact itself
   * carried `with absent intent`, inverting the clinical meaning of
   * contraindication scenarios.
   */
  definitionalDoNotPerform?: boolean;
  /** REFACTOR:grounded (#189 CEL-writer, disc 486/487). The fact's resolved semantic role — the CEL writer's
   *  dispatch axis. REQUIRED: every successful `deriveFhirType` return sets it (the early `undefined` returns
   *  never construct a `DerivedType`), so an absent role would be an impossible state. INERT in todo 1 (consumed
   *  by no write path yet). */
  role: FactRole;
  /** REFACTOR:grounded (#189 CEL-writer, disc 487 — panel: role alone is an insufficient payload). The resolved
   *  backing `Concept`, present ONLY for a `role: "local" | "remote" | "derived"` (concept-backed) derivation;
   *  absent for `activity` / `bare-type`. Carried so todos 2/3 resolve the effective-representation descriptor
   *  (derive-local `{system, code}`, value legality) from the SINGLE authority at the write site, rather than
   *  routing from a bare `{fhirType, role}` tag. INERT in todo 1. */
  concept?: Concept;
  /** REFACTOR:grounded (#189 CEL-writer, disc 487). The owning library NAME of `concept` — the identity todos 2/3
   *  pair with the project canonicalBase to compose the local CodeSystem URL (derive-local). Present iff `concept`
   *  is. INERT in todo 1. */
  owningLibrary?: string;
  /** REFACTOR:grounded (#189 CEL-writer T3b, disc 490). The RESOLVED owning `RegistryEntry` of `concept` — the
   *  derive-local identity keyed on `filePath` (name ALONE collides local-vs-package; disc 490 gpt56 #6). Carries
   *  the raw `ast.library.name` fallback used when the project has no policy id. Present iff `concept` is. */
  owningEntry?: RegistryEntry;
}

/** #189 (a) (disc 510) — resolve a `defined by` field to its backing `Concept` AST node, REGARDLESS of whether a
 *  FHIR type is derivable (`deriveFhirType` returns undefined for an untyped concept; this does not). Used to detect
 *  a RESOURCELESS DERIVED target BEFORE type derivation, so the loud `cannot-directly-assert-derived-concept` reject
 *  intercepts BOTH the untyped composite (which would otherwise mis-warn `unsupported-yet`) and the typed composite
 *  (which would otherwise FABRICATE a resource — a §4 violation). Binds the name through the SHARED
 *  `buildDefinedByCandidates` (first-write-wins across Concept+Activity — the SAME resolution the validator and
 *  `deriveFhirType` use), then narrows to Concept: a name a preceding Activity already claims resolves to that
 *  Activity in all three lanes, so the reject never fires on it (panel disc 511 — a hand-rolled Concept-only scan
 *  would bind cross-kind name collisions differently and reject a fact the validator passed). Returns undefined for
 *  a bare-type ref, an Activity-bound name, or an unresolved ref (none is a resourceless-derived concept). */
function resolveDefinedByConcept(
  field: CELDefinedByField,
  graph: ResolvedCelGraph,
): Concept | undefined {
  const ref = field.ref;
  if (!isQualifiedRef(ref)) return undefined;
  const libName = getRefLibrary(ref);
  const declName = getRefName(ref);
  const reg = graph.crlRegistry;
  if (!reg || libName === null) return undefined;
  const lib = reg.byNameLocal.get(libName) ?? reg.byNamePackage.get(libName);
  if (!lib) return undefined;
  const target = buildDefinedByCandidates(lib.ast.statements).get(declName);
  return target?.type === "Concept" ? target : undefined;
}

/**
 * Derive the FHIR resource type for a fact's `defined by` field.
 * Returns `undefined` when the ref doesn't resolve to a bare FHIR type
 * (caller emits `unsupported-yet`).
 */
function deriveFhirType(
  field: CELDefinedByField,
  graph: ResolvedCelGraph,
): DerivedType | undefined {
  const ref = field.ref;

  if (!isQualifiedRef(ref)) {
    const name = getRefName(ref);
    if (CONCEPT_TYPE_SET.has(name)) return { fhirType: name, role: "bare-type" };
    return undefined;
  }

  const libName = getRefLibrary(ref);
  const declName = getRefName(ref);
  const reg = graph.crlRegistry;
  if (!reg || libName === null) return undefined;
  const lib = reg.byNameLocal.get(libName) ?? reg.byNamePackage.get(libName);
  if (!lib) return undefined;

  // Candidate set: Concept + Activity (matches validator Step 2).
  let target: Statement | undefined;
  for (const s of lib.ast.statements) {
    if ((s.type === "Concept" || s.type === "Activity") && s.name === declName) {
      target = s;
      break;
    }
  }
  if (!target) return undefined;

  if (target.type === "Concept") {
    const c = target.conceptType;
    if (c && CONCEPT_TYPE_SET.has(c)) {
      return {
        fhirType: c,
        kind: "Concept",
        role: classifyConceptRole(target),
        concept: target,
        owningLibrary: libName,
        owningEntry: lib,
      };
    }
    return undefined;
  }

  if (target.type === "Activity") {
    const activityType = target.body.request.activityType;
    const fhir = CPG_TO_FHIR[activityType];
    if (!fhir) return undefined;
    // T12 / #89: also pull the CPG instance profile canonical so the emitter
    // can stamp meta.profile on the emitted resource.
    const cpgProfile = lookupCpgActivityProfile(activityType);
    return {
      fhirType: fhir,
      kind: "Activity",
      role: "activity",
      ...(cpgProfile ? { profileUrl: cpgProfile.targetProfile } : {}),
      ...(target.body.request.doNotPerform === true ? { definitionalDoNotPerform: true } : {}),
    };
  }

  return undefined;
}

interface AnchorMap {
  ambient?: Date;
  named: Map<string, Date>;
}

function dateOnly(d: Date): string {
  // Format YYYY-MM-DD (ISO date, no time).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIsoDate(s: string): Date {
  // The grammar guarantees YYYY-MM-DD; construct UTC-midnight Date.
  const [y, m, d] = s.split("-").map((p) => parseInt(p, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

function applyOffset(base: Date, offset: CELDurationOffset): Date {
  const sign = offset.sign === "+" ? 1 : -1;
  const v = offset.value * sign;
  const d = new Date(base.getTime());
  const unit = offset.unit;
  if (unit === "day" || unit === "days") {
    d.setUTCDate(d.getUTCDate() + v);
  } else if (unit === "week" || unit === "weeks") {
    d.setUTCDate(d.getUTCDate() + v * 7);
  } else if (unit === "month" || unit === "months") {
    d.setUTCMonth(d.getUTCMonth() + v);
  } else if (unit === "year" || unit === "years") {
    d.setUTCFullYear(d.getUTCFullYear() + v);
  } else if (unit === "hour" || unit === "hours") {
    d.setUTCHours(d.getUTCHours() + v);
  } else if (unit === "minute" || unit === "minutes") {
    d.setUTCMinutes(d.getUTCMinutes() + v);
  } else if (unit === "second" || unit === "seconds") {
    d.setUTCSeconds(d.getUTCSeconds() + v);
  }
  return d;
}

function resolveAnchorExpr(expr: CELAnchorExpr): Date {
  if (expr.type === "CELFixedDateAnchor") {
    return parseIsoDate(expr.date);
  }
  // CELNowAnchor
  const now = new Date();
  if (expr.offset) return applyOffset(now, expr.offset);
  return now;
}

function buildAnchors(c: CELCase): AnchorMap {
  const out: AnchorMap = { named: new Map() };
  for (const b of c.body) {
    if (b.type === "CELAnchorField") {
      const d = resolveAnchorExpr(b.expr);
      if (b.name === undefined) out.ambient = d;
      else out.named.set(b.name, d);
    }
  }
  return out;
}

/** Resolve an at-clause to an ISO date string, given the case's anchor map. */
function resolveAtClause(at: CELAtClause, anchors: AnchorMap): string | undefined {
  if (at.type === "CELAtAbsoluteDate") return at.date;
  if (at.type === "CELAtAnchor") {
    const base = anchors.ambient;
    if (!base) return undefined;
    const d = at.offset ? applyOffset(base, at.offset) : base;
    return dateOnly(d);
  }
  if (at.type === "CELAtNamedAnchor") {
    const base = anchors.named.get(at.anchorName);
    if (!base) return undefined;
    const d = at.offset ? applyOffset(base, at.offset) : base;
    return dateOnly(d);
  }
  return undefined;
}

// REFACTOR:grounded (#189 B4, disc 501 — both crl-emit arms #4). The CHECKED token parser for a CodeableConcept
// `value is` DATUM. Unlike `parseCanonicalToken` (which tolerates a pipe-less/bare code — historical for the
// identity `code is`), a DATUM must carry `<system>|<code>` in full: a system-less Coding can never match the B5
// membership read (`coded from "VS"` filters on system+code), so a malformed token fails CLOSED here rather than
// emitting a value B5 cannot validate. Requires exactly one pipe with non-empty system and code.
function parseCheckedCanonicalToken(raw: string): { parts: CodeParts } | { error: string } {
  const segs = raw.split("|");
  if (segs.length !== 2) {
    return { error: `a CodeableConcept \`value is\` requires exactly \`<system>|<code>\` (got \`${raw}\`)` };
  }
  const [system, code] = segs;
  if (system.trim() === "" || code.trim() === "") {
    return { error: `a CodeableConcept \`value is\` requires a non-empty system and code (got \`${raw}\`)` };
  }
  return { parts: { system, code } };
}

function codeableConceptFromParts(cp: CodeParts): Record<string, unknown> {
  return {
    coding: [
      {
        ...(cp.system !== undefined ? { system: cp.system } : {}),
        code: cp.code,
      },
    ],
  };
}

function codeableConcept(raw: string): Record<string, unknown> {
  return codeableConceptFromParts(parseCanonicalToken(raw));
}

/** REFACTOR:grounded (#189 B4, disc 501 #1). Resolve a local fact's `OwningLibraryMetadata` — the
 *  `{libraryName, canonicalBase, localDomainId}` triple the effective-representation descriptor deriver consumes —
 *  via the SAME project resolution `deriveLocalCoding` uses. Extracted so the coding-write path and the B4
 *  value-write path share ONE owning-identity computation (no second-authority drift; disc 501 #1). Fail-closed on
 *  a missing base / covers closure / registry — the loud floor "never a silent partial." */
function localOwningMeta(
  ctx: EmitContext,
  derived: DerivedType,
  factName: string,
): { meta: OwningLibraryMetadata } | { error: EmitDiagnostic } {
  const graph = ctx.graph;
  const mkErr = (message: string): { error: EmitDiagnostic } => ({
    error: {
      kind: "local-coding-derivation-failed",
      severity: "error",
      message,
      caseSlug: ctx.caseSlug,
      factName,
      filePath: graph.filePath,
    },
  });

  const concept = derived.concept;
  const owningEntry = derived.owningEntry;
  if (!concept || !owningEntry) return mkErr(`local fact "${factName}" has no resolved concept/owning library`);

  // canonicalBase — ONE consuming-project value (disc 490 D1). Missing base → hard failure (charter forbids a
  // urn/manufactured fallback). NOTE: a file-level precondition gated on ≥1 local fact (disc 490 D3 REFINE) is
  // a T3c ergonomic follow-up; the write-site guard here is the loud floor that satisfies "never silent partial."
  const base = graph.projectRoot ? readCanonicalBase(graph.projectRoot) : undefined;
  if (!base) {
    return mkErr(`project has no \`crl.canonicalBase\`; cannot compose the local CodeSystem url for "${concept.name}"`);
  }

  // The include-walked covers closure (primary seed). Absent → no covers target → fail loudly (disc 490
  // [critical]: NO sole-primary fallback — it would over-disambiguate included code-bearing libraries).
  const seed = graph.resolvedLibraryPaths;
  if (!seed) return mkErr(`no resolved covers closure; cannot resolve the local domain for "${concept.name}"`);
  const registry = graph.crlRegistry;
  if (!registry) return mkErr(`no CRL registry; cannot resolve the local domain for "${concept.name}"`);

  const policyId = graph.projectRoot ? readPolicyId(graph.projectRoot) : undefined;
  const resolver = createLocalDomainResolver({
    primarySeedPaths: seed,
    localCodePaths: localCodePathsOf(registry),
    policyId,
  });
  // Metadata-less fallback mirrors the CQL lowering: `ast.library.name`, NOT the nullable `RegistryEntry.name`
  // (disc 490 Fable #12).
  const domainId = resolver.domainIdFor(owningEntry) ?? owningEntry.ast.library.name;

  return {
    meta: {
      libraryName: derived.owningLibrary ?? owningEntry.ast.library.name,
      canonicalBase: base,
      localDomainId: domainId,
    },
  };
}

/** #189 CEL-writer T3b (disc 490). DERIVE a local `code is` fact's `{system, code}` from the concept via the
 *  SAME project resolution the CQL definition lane uses, so the instance coding byte-matches the retrieve's
 *  CodeSystem BY CONSTRUCTION. Returns the parts, or a case-atomic error (the fact is then SKIPPED — never
 *  emitted coding-less, which `$apply` drops silently). Scope of the by-construction guarantee (disc 490):
 *  covers-target ≡ the project emit entry, and only the shapes `lowerLocalCodes` actually lowers (a `code is`
 *  bothrep-with-`source representation` is preserved-but-not-lowered on the shipped CQL lane — its round-trip is
 *  UNVERIFIED against the definition lane here; dme101-030 is pure-local so unaffected). */
function deriveLocalCoding(
  ctx: EmitContext,
  derived: DerivedType,
  factName: string,
): { parts: CodeParts } | { error: EmitDiagnostic } {
  const graph = ctx.graph;
  const mkErr = (message: string): { error: EmitDiagnostic } => ({
    error: {
      kind: "local-coding-derivation-failed",
      severity: "error",
      message,
      caseSlug: ctx.caseSlug,
      factName,
      filePath: graph.filePath,
    },
  });

  const concept = derived.concept;
  const owningEntry = derived.owningEntry;
  if (!concept || !owningEntry) return mkErr(`local fact "${factName}" has no resolved concept/owning library`);

  // Empty concept code → derivation failure (disc 490 Fable #6: never emit `coding.code: ""`). Checked BEFORE the
  // owning-metadata resolution to preserve the pre-B4 error priority (code-absent reported ahead of base-absent).
  if (typeof concept.code !== "string" || concept.code.trim() === "") {
    return mkErr(`local concept "${concept.name}" carries no \`code is\`; cannot derive a local coding`);
  }

  const meta = localOwningMeta(ctx, derived, factName);
  if ("error" in meta) return meta;

  // #189 Piece 2 (disc 508 — D1): the ONE local-concept coding derivation, shared with the CRE membership index so
  // the instance coding and the tree-lane set are identical by construction.
  const derivedCoding = deriveLocalConceptCoding({
    conceptName: concept.name,
    conceptCode: concept.code,
    base: meta.meta.canonicalBase,
    domainId: meta.meta.localDomainId,
  });
  if ("error" in derivedCoding) return mkErr(derivedCoding.error);
  return { parts: { system: derivedCoding.coding.system, code: derivedCoding.coding.code } };
}

/** REFACTOR:grounded (#189 B4, disc 501 — both crl-emit arms). Write a LOCAL fact's CodeableConcept DATUM to the
 *  resource's value element — the value/interface convention's local-override arm (disc 496: an Observation whose
 *  `code` is the concept IDENTITY and whose `value` is the case-specific device CodeableConcept). The datum SHAPE
 *  is resolved from the effective-representation descriptor (the SINGLE authority both lanes read — design §4 /
 *  disc 501 #1), NEVER raw `concept.valueTypes` (which skips the value-path-is-coding-element guard and would
 *  diverge the CEL lane from the CQL lane at F). Returns:
 *   - "written"        — the resource carries a `value<CC>` datum.
 *   - "error"          — a diagnostic was pushed; the caller SKIPS the fact (never a wrong/partial datum). Full
 *                        case-atomic discard (zero resources) is F/T3c (disc 501 gpt56 #5); the loud diagnostic +
 *                        skip here meets the "never silently drop" bar. Fires for ZERO corpus facts.
 *   - "not-applicable" — this fact's local datum is NOT a CodeableConcept (a boolean/Quantity value, a valueless
 *                        concept, a coding-element conflation, a deferred/errored derivation): the caller falls
 *                        through to the legacy value switch, byte-unchanged. Only the CC cell is B4's; routing
 *                        EVERY value type through the descriptor is the F correctness slice (disc 501 #7).
 *  Caller-gated to `role === "local"` (remote = sourced-CEL, D2-deferred to F/#257; derived = ephemeral, charter
 *  §4), so a remote/bare/activity value never reaches the descriptor here (disc 501 gpt56 #3 / Claude #2). */
function writeCodedLocalValue(
  ctx: EmitContext,
  derived: DerivedType,
  factName: string,
  rawValue: unknown,
  resourceBody: Record<string, unknown>,
): "written" | "error" | "not-applicable" {
  const concept = derived.concept;
  if (!concept) return "not-applicable";

  const meta = localOwningMeta(ctx, derived, factName);
  // Unresolvable owning identity — we cannot yet know if this datum is a CodeableConcept (that lives in the
  // descriptor we can't compute). The coding path's own loud failure covers a local fact that can't resolve;
  // don't double-report. Fall through to the legacy switch.
  if ("error" in meta) return "not-applicable";

  const outcome = deriveEffectiveRepresentations(concept, meta.meta);
  const localArm =
    outcome.status === "derived" ? outcome.descriptors.find((d) => d.arm === "local-exact") : undefined;
  // Only the CodeableConcept local datum is B4's. Every other shape is NOT-APPLICABLE → the legacy switch handles
  // it byte-unchanged (the inertness contract: the existing numeric `value is` facts derive a Quantity/integer
  // datum → land here → fall through, verified by the full-corpus diff).
  if (!localArm || localArm.arm !== "local-exact" || localArm.datumValueType !== "CodeableConcept") {
    return "not-applicable";
  }

  // From here B4 OWNS the write: a CodeableConcept-declared local datum MUST emit a CodeableConcept value, never
  // fall through to a manufactured shape (disc 501 gpt56 #2 / Claude #3).
  const mkErr = (message: string): "error" => {
    ctx.diagnostics.push({
      kind: "local-coded-value-invalid",
      severity: "error",
      message,
      caseSlug: ctx.caseSlug,
      factName,
      filePath: ctx.graph.filePath,
    });
    return "error";
  };

  if (!localArm.valueElement) {
    return mkErr(
      `local concept "${concept.name}" declares a CodeableConcept value type but its representation reads no value element; cannot place the authored \`value is\``,
    );
  }
  if (typeof rawValue !== "string") {
    return mkErr(
      `local concept "${concept.name}" declares a CodeableConcept value type, so its \`value is\` must be a \`<system>|<code>\` token, not ${typeof rawValue === "number" ? "a number" : "a boolean"}`,
    );
  }
  const parsed = parseCheckedCanonicalToken(rawValue);
  if ("error" in parsed) return mkErr(`fact "${factName}": ${parsed.error}`);
  const jn = valueJsonName(localArm.valueElement, "CodeableConcept");
  if ("errorKind" in jn) return mkErr(`fact "${factName}": ${jn.detail}`);

  resourceBody[jn.jsonName] = codeableConceptFromParts(parsed.parts);
  return "written";
}

/** Read body fields from a fact into a flat lookup. */
function readFactBody(fact: CELFact): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const b of fact.body) {
    if (b.type === "CELNameField") out.name = b.value;
    else if (b.type === "CELBirthDateField") out.birthDate = b.value;
    else if (b.type === "CELCodeField") out.code = b.value;
    else if (b.type === "CELDateField") out.date = b.value;
    // ⚠ THE UNIT TRAVELS WITH THE VALUE. Dropping it here is silent: this lookup is a `Record<string, …>`
    // index signature, so a consumer reading `body.unit` type-checks fine and simply gets `undefined` —
    // which is exactly how the writer emitted a dimensionless Quantity while the validator was demanding a
    // unit. (Both panel arms predicted this class when they asked for a discriminated `CELValue` union
    // instead of an optional field; it then happened here, silently, with `tsc` green. Disc 529 §5.)
    else if (b.type === "CELValueField") {
      out.value = b.value;
      if (b.unit !== undefined) out.unit = b.unit;
    }
    else if (b.type === "CELStageField") out.stage = b.value;
    // CELDefinedByField intentionally not flattened — caller has the field.
  }
  return out;
}

const STAGE_TO_INTENT: Record<string, string> = {
  proposed: "proposal",
  ordered: "order",
};

interface EmitContext {
  graph: ResolvedCelGraph;
  /** Map of fact name → fact declaration for the file. */
  facts: Map<string, CELFact>;
  /** The case being emitted. */
  c: CELCase;
  caseSlug: string;
  librarySlug: string;
  /**
   * #237/T1 — the RAW (un-slugified) library name, for the collision-safe FHIR id
   * composite. `librarySlug`/`caseSlug` stay for `outputPath` (file grouping), but
   * the FHIR id composes from the uncapped raw parts so `uniqueCapSlug`'s hash sees
   * the full discriminating tail. `c.name` already carries the raw case name.
   */
  libraryName: string;
  /**
   * #189 — the subject Patient's id, i.e. the KALM compartment directory every resource in this case sits under
   * (`patient/<patientCompartmentId>/<type>/...`). Set once in `emitCase` after the (required) subject resolves;
   * "" before that.
   */
  patientCompartmentId: string;
  anchors: AnchorMap;
  /** Maps fact-name → emitted resource id (within this case), for cross-resource references. */
  emittedIds: Map<string, { id: string; resourceType: string }>;
  diagnostics: EmitDiagnostic[];
}

// #237/T1 — the CEL FHIR resource id. Was `${librarySlug}-${caseSlug}-${slugify(fact)}`
// with NO composite cap (the #237 defect: ids ran 76–125 chars). Now the SAME
// collision-safe `uniqueCapSlug` the CRL/FHIR lane uses, over the component-wise
// `rawSlug` composite of the raw library/case/fact names — one id formatter across
// both lanes, ids always ≤64.
function makeResourceId(ctx: EmitContext, factName: string): string {
  return uniqueCapSlug(
    `${rawSlug(ctx.libraryName)}-${rawSlug(ctx.c.name)}-${rawSlug(factName)}`,
    CEL_ID_BASE_MAX,
  );
}

// T12 / #91: per-case namespace prefix so subject Patient ids don't collide
// when multiple cases share the same subject fact and resources merge into
// a single Bundle. Previously `slugify(factName)` only; now matches the
// `<librarySlug>-<caseSlug>-<factSlug>` shape every other emitted resource
// already uses.
function makePatientId(ctx: EmitContext, factName: string): string {
  // #237/T1 — the Patient id uses the SAME derivation as every other resource id
  // (T12/#91 made them share the `<library>-<case>-<fact>` shape); delegate so there
  // is one id formatter, not a mirror that can drift.
  return makeResourceId(ctx, factName);
}

/** Emit the subject Patient resource. */
function emitSubjectPatient(ctx: EmitContext, patientFact: CELFact): EmittedResource | undefined {
  const body = readFactBody(patientFact);
  const id = makePatientId(ctx, patientFact.name);
  const patientProfile = qicoreBaseProfile("Patient");
  const out: Record<string, unknown> = {
    resourceType: "Patient",
    id,
    ...(patientProfile ? { meta: { profile: [patientProfile] } } : {}),
  };
  // #189 base QI-Core (disc 495): QI-Core Patient requires `identifier` 1..* and `name` 1..*. The case Patient is
  // SYNTHETIC test data (an identity the case author invented — not a real member, not clinical data), so the
  // emitter completes these administrative fields. The identifier lives in a DEDICATED synthetic namespace
  // (`<canonicalBase>/identifier/cel-test-patient`), NOT the bare canonicalBase (which is the CodeSystem/SD
  // namespace — conflating them would make a fixture identifier look like a real member-id namespace). `name`
  // falls back to a VISIBLY-synthetic text when the fact carries none. (us-core-6 family/given is only a WARNING,
  // so text-only satisfies validation — disc 495 invariant sweep.)
  const base = ctx.graph.projectRoot ? readCanonicalBase(ctx.graph.projectRoot) : undefined;
  if (base) {
    out.identifier = [{ system: `${base}/identifier/cel-test-patient`, value: id }];
  }
  out.name = typeof body.name === "string" ? [{ text: body.name }] : [{ text: `Synthetic Patient ${id}` }];
  if (typeof body.birthDate === "string") {
    out.birthDate = body.birthDate;
  }
  return {
    resourceType: "Patient",
    id,
    outputPath: `patient/${ctx.patientCompartmentId}/patient`,
    body: out,
  };
}

/** Slot a date-or-period field onto an emitted resource based on FHIR type. */
function applyDateField(body: Record<string, unknown>, fhirType: string, isoDate: string): void {
  // Pitch v4 v1: pick the most obvious date field per resource type.
  const map: Record<string, string> = {
    Observation: "effectiveDateTime",
    Encounter: "period",
    Condition: "recordedDate",
    Procedure: "performedDateTime",
    MedicationRequest: "authoredOn",
    MedicationStatement: "effectiveDateTime",
    MedicationDispense: "whenHandedOver",
    MedicationAdministration: "effectiveDateTime",
    ServiceRequest: "authoredOn",
    Task: "authoredOn",
    DiagnosticReport: "effectiveDateTime",
    CommunicationRequest: "authoredOn",
    EpisodeOfCare: "period",
    DetectedIssue: "identifiedDateTime",
    Flag: "period",
  };
  const field = map[fhirType];
  if (!field) return;
  if (field === "period") {
    body[field] = { start: isoDate };
  } else {
    body[field] = isoDate;
  }
}

const SUBJECT_RESOURCES: ReadonlySet<string> = new Set([
  "Observation",
  "Encounter",
  "Condition",
  "Procedure",
  "MedicationRequest",
  "MedicationStatement",
  "MedicationDispense",
  "MedicationAdministration",
  "ServiceRequest",
  "Task",
  "DiagnosticReport",
  "CommunicationRequest",
  "EpisodeOfCare",
  "DetectedIssue",
  "AllergyIntolerance",
  "Goal",
  "QuestionnaireResponse",
  "NutritionIntake",
  "NutritionOrder",
  "Immunization",
  "ClinicalImpression",
  "FamilyMemberHistory",
  "RiskAssessment",
  "Communication",
  "Flag",
]);

const ENCOUNTER_RESOURCES: ReadonlySet<string> = new Set([
  "Observation",
  "Condition",
  "Procedure",
  "MedicationRequest",
  "MedicationStatement",
  "MedicationAdministration",
  "ServiceRequest",
  "Task",
  "DiagnosticReport",
  "CommunicationRequest",
  "Communication",
  "DetectedIssue",
]);

/** Resolve the case's subject fact (the Patient). */
function findSubject(ctx: EmitContext): CELFact | undefined {
  for (const b of ctx.c.body) {
    if (b.type === "CELSubjectField") return ctx.facts.get(b.factName);
  }
  return undefined;
}

function findEncounter(ctx: EmitContext): CELFact | undefined {
  for (const b of ctx.c.body) {
    if (b.type === "CELEncounterField") return ctx.facts.get(b.factName);
  }
  return undefined;
}

interface EmitOneArgs {
  ctx: EmitContext;
  factName: string;
  factRefField?: CELFactRefField;
}

function emitOneFact(args: EmitOneArgs): EmittedResource | undefined {
  const { ctx, factName, factRefField } = args;
  const fact = ctx.facts.get(factName);
  if (!fact) return undefined;

  const definedBy = fact.body.find(
    (b): b is CELDefinedByField => b.type === "CELDefinedByField",
  );
  if (!definedBy) {
    ctx.diagnostics.push({
      kind: "unsupported-yet",
      severity: "warning",
      message: `Fact "${factName}" has no defined-by field; skipping`,
      caseSlug: ctx.caseSlug,
      factName,
      filePath: ctx.graph.filePath,
    });
    return undefined;
  }
  // #189 (a) (disc 510) — resolve the target concept BEFORE type derivation. A RESOURCELESS DERIVED concept (no
  // `code is`, no source binding) has no FHIR resource, so it cannot be directly asserted. Reject loud + skip, both
  // cells: an UNTYPED composite (deriveFhirType would mis-warn `unsupported-yet`) AND a TYPED composite
  // (deriveFhirType would SUCCEED and fabricate a resource for an ephemeral concept — a §4 violation). The validator
  // is the primary gate; this backstops emission for a caller that skips it.
  const targetConcept = resolveDefinedByConcept(definedBy, ctx.graph);
  if (targetConcept && isResourcelessDerived(targetConcept)) {
    ctx.diagnostics.push({
      kind: "cannot-directly-assert-derived-concept",
      severity: "error",
      message: `Fact "${factName}" is \`defined by\` concept "${targetConcept.name}", which is read-only — it has no representation (no \`code is\` and no source binding) and no FHIR resource, so it cannot be directly asserted. Assert its operands instead, or give it a \`code is\` + \`type is\`.`,
      caseSlug: ctx.caseSlug,
      factName,
      filePath: ctx.graph.filePath,
    });
    return undefined;
  }
  // #189 Piece 3 (Option C, disc 512/513) — a VALUE-READING boolean concept (member-existence interface) asserted
  // directly MUST carry an explicit boolean `value is`; its determination IS its value. Author-time gate mirroring the
  // validator (shared kind name — all three lanes one voice) + the derived-concept backstop above, so a caller that
  // skips validation (e.g. projectless `emit_cel`) still sees it. Skip the fact: a valueless value-reading Observation
  // reads false in `$apply` regardless, so the verdict (Deny) is unchanged and both lanes still agree — the CRE reads
  // it false too (+ a diagnostic). Classification uses the SHARED predicate over the concept's own-library siblings.
  if (targetConcept) {
    const libName = getRefLibrary(definedBy.ref);
    const reg = ctx.graph.crlRegistry;
    const lib = reg ? (reg.byNameLocal.get(libName ?? "") ?? reg.byNamePackage.get(libName ?? "")) : undefined;
    const siblings = lib ? lib.ast.statements.filter((s): s is Concept => s.type === "Concept") : [];
    if (isValueReadingBooleanConcept(targetConcept, siblings)) {
      const vf = fact.body.find((b): b is CELValueField => b.type === "CELValueField");
      if (!vf || typeof vf.value !== "boolean") {
        ctx.diagnostics.push({
          kind: "value-reading-assertion-needs-boolean",
          severity: "error",
          message: `Fact "${factName}" directly asserts value-reading boolean concept "${targetConcept.name}", whose determination is read from its value — state it explicitly: \`value is true\` or \`value is false\` (a bare/non-boolean assertion emits a valueless record read as false).`,
          caseSlug: ctx.caseSlug,
          factName,
          filePath: ctx.graph.filePath,
        });
        return undefined;
      }
    }
  }

  const derived = deriveFhirType(definedBy, ctx.graph);
  if (!derived) {
    ctx.diagnostics.push({
      kind: "unsupported-yet",
      severity: "warning",
      message: `Fact "${factName}" defined-by could not derive a FHIR resource type`,
      caseSlug: ctx.caseSlug,
      factName,
      filePath: ctx.graph.filePath,
    });
    return undefined;
  }

  const fhirType = derived.fhirType;
  if (fhirType === "Patient") {
    // The patient is emitted once via the subject; reusing the same fact as a
    // case-body `fact is "<Patient>"` reference doesn't re-emit.
    return undefined;
  }

  const body = readFactBody(fact);
  const id = makeResourceId(ctx, factName);
  // #189 base QI-Core (disc 495) + T12/#89: stamp `meta.profile` ADDITIVELY — any CPG instance profile (activity
  // output) AND the base QI-Core profile for the resource type; an activity-output resource conforms to both. CPG
  // first (more specific), then the base QI-Core canonical. A type with no QI-Core mapping stays unstamped.
  const profiles = [derived.profileUrl, qicoreBaseProfile(fhirType)].filter(
    (p): p is string => typeof p === "string",
  );
  const resourceBody: Record<string, unknown> = {
    resourceType: fhirType,
    id,
    ...(profiles.length ? { meta: { profile: profiles } } : {}),
  };

  // Subject reference.
  const subject = findSubject(ctx);
  if (subject && SUBJECT_RESOURCES.has(fhirType)) {
    resourceBody.subject = { reference: `Patient/${makePatientId(ctx, subject.name)}` };
  }

  // #189 base QI-Core (disc 495): QI-Core MedicationRequest requires `requester` when intent is an order-type
  // (us-core-21), and the floor defaults intent=order. For SYNTHETIC test data the requester is the case subject
  // (a valid requester reference type) — administrative scaffolding, not a clinical claim. (Procedure `performed`
  // — us-core-7, required when status=completed — is already satisfied for a dated fact by `applyDateField`.)
  if (fhirType === "MedicationRequest" && subject) {
    resourceBody.requester = { reference: `Patient/${makePatientId(ctx, subject.name)}` };
  }

  // Encounter reference (case-level ambient; cross-resource `during encounter` may override later).
  const encFact = findEncounter(ctx);
  if (encFact && ENCOUNTER_RESOURCES.has(fhirType)) {
    const encDerived = deriveFhirType(
      encFact.body.find((b): b is CELDefinedByField => b.type === "CELDefinedByField")!,
      ctx.graph,
    );
    if (encDerived?.fhirType === "Encounter") {
      resourceBody.encounter = { reference: `Encounter/${makeResourceId(ctx, encFact.name)}` };
    }
  }

  // Code — #189 CEL-writer T2: registry-driven coding PLACEMENT on the resource's natural element. Placement is a
  // RESOURCE-level fact (the registry row), NOT role-gated: a fact carrying a code places it on that resource's
  // natural element regardless of role — Observation/Condition/ServiceRequest → `code`, MedicationRequest →
  // `medicationCodeableConcept`, Encounter → `type[]` (killing the universal `.code` that was invalid for
  // non-`.code` resources). This applies equally to a `coded from` (remote) fact, a bare `defined by <Type>`
  // fact, and — at T3 — a local fact (whose `{system, code}` is DERIVED from the concept rather than authored on
  // the fact). A resource with NO registry row (an activity-only resource like Task/CommunicationRequest, or any
  // unlisted type) keeps the pre-flip `.code` write — category-3 activity coding + unlisted fail-closed are T4.
  // (Role governs the code VALUE/system — derive-local vs authored, T3 — not the coding element, which is T2.)
  // #189 Piece 2 (disc 508): a LOCAL-role fact's code is its MEMBERSHIP/DATA INPUT (charter §3/§4 — "a CEL fact
  // carries a code … checked, explicitly, against the concept's set"). A BARE local fact defaults to the concept's
  // own `{system, code}` (`deriveLocalCoding` — the degenerate case, a member by construction, byte-matching the
  // CQL retrieve). An AUTHORED local code is routed to the resource coding AS AUTHORED, exactly like the remote
  // branch — `$apply`'s system-qualified retrieve then computes membership: a matching code populates the concept,
  // a different one does not (closed-world → the concept's `exists` is false), and BOTH lanes agree by construction.
  // The loud floor stays: a bare-path derivation failure, or a MALFORMED authored token, SKIPS the fact (never a
  // `coding.code:""` partial `$apply` drops silently). A well-formed authored NON-member is NOT skipped — it is the
  // legitimate wrong-code datum (the CEL validator flags it with `fact-code-not-in-local-set`). (This flip replaces
  // T3b's `local-authored-code-conflict`, whose reject contradicted the membership model.)
  let coding: CodeParts | undefined;
  if (derived.role === "local" && typeof body.code !== "string") {
    // Bare local fact → derive the concept's own coding (degenerate membership).
    const local = deriveLocalCoding(ctx, derived, factName);
    if ("error" in local) {
      ctx.diagnostics.push(local.error);
      return undefined;
    }
    coding = local.parts;
  } else if (derived.role === "local" && typeof body.code === "string") {
    // Authored local code = data input. Malformed → error + skip; well-formed → route as authored (membership is
    // computed downstream by the retrieve / the CRE, not here).
    const cls = classifyCanonicalToken(body.code);
    if (cls.kind === "malformed") {
      ctx.diagnostics.push({
        kind: "local-authored-code-malformed",
        severity: "error",
        message: `Fact "${factName}" (local concept "${derived.concept?.name ?? "?"}") authors a malformed \`code is\` token: ${cls.reason}.`,
        caseSlug: ctx.caseSlug,
        factName,
        filePath: ctx.graph.filePath,
      });
      return undefined;
    }
    coding = cls.parts;
  } else if (typeof body.code === "string") {
    coding = parseCanonicalToken(body.code);
  }
  if (coding) {
    const cc = codeableConceptFromParts(coding);
    const placement = resourceCodingPlacement(fhirType);
    if (placement) {
      resourceBody[placement.jsonName] = placement.array ? [cc] : cc;
    } else {
      resourceBody.code = cc;
    }
  }

  // Status — #189 homeostasis-core (disc 493): `Observation.status` (REQUIRED 1..1; an Observation emitted
  // without it is invalid FHIR and `$apply` drops it SILENTLY → wrong PA determination) is now the registry
  // structural default `final` (an asserted analytical determination HOLDS at emit), applied by
  // `applyStructuralDefaults` below — unified with every other resource's required-element floor rather than a
  // per-resource hardcode.

  // Value — #189 B4 (disc 501): a LOCAL fact's CodeableConcept datum (the value/interface local-override arm,
  // disc 496) is resolved from the effective-representation descriptor and written to the resource's value[x].
  // Gated to `role === "local"` (remote = sourced-CEL D2-deferred to F/#257; derived = ephemeral). Fires for ZERO
  // corpus facts (no `.cel` authors a CodeableConcept `value is`), so this path is emit-byte-inert.
  let codedValueWritten = false;
  if (body.value !== undefined && derived.role === "local") {
    const written = writeCodedLocalValue(ctx, derived, factName, body.value, resourceBody);
    if (written === "error") return undefined; // diagnostic pushed; skip the fact (never a partial/wrong datum)
    codedValueWritten = written === "written";
  }

  // Value (boolean, numeric, or string) — Observation primarily. #189 S1 — a boolean value lowers to
  // `Observation.valueBoolean` (the shape the local `code is` truth-set retrieve consumes). REFACTOR:suspect
  // (#189 B4, disc 501 Claude #7): this whole switch is the old-world value writer — it mis-spells non-Observation
  // value carriers (silent drop), non-Quantity numbers (`integer`→`valueQuantity`), and non-string temporals
  // (`date`/`dateTime`/`time`→`valueString`). Routing ALL value writes through the descriptor + `valueJsonName` is
  // the F correctness slice (design §10 obligation); B4 adds only the descriptor-gated CodeableConcept path above
  // and leaves this switch byte-identical.
  if (!codedValueWritten && body.value !== undefined && fhirType === "Observation") {
    if (typeof body.value === "boolean") {
      resourceBody.valueBoolean = body.value;
    } else if (typeof body.value === "number") {
      // ⭐⭐ A QUANTITY CARRIES ITS UNIT, and a unitless one is DIMENSIONLESS, not undecided.
      // `FHIRHelpers.ToQuantity` coalesces `Coalesce(code, unit, '1')`, so `{value: 118}` becomes
      // `System.Quantity{unit:'1'}` and is NULL against every real unit — measured on the cqf engine, and
      // shipped in seven goldens before the validator required a unit. Writing the unit here is what makes
      // that requirement mean anything; without it the validator demands a unit and the writer throws it
      // away, which LOOKS fixed and is not.
      //
      // ⚠ SHAPE MATCHED TO THE CONSTRUCTOR LANE ON PURPOSE. `fhirQuantityFromSystemQuantity` builds
      // `{value, unit}` from a CQL System.Quantity, and FHIRHelpers accepts a null `system` — so both lanes
      // evaluate identically. Emitting `system`/`code` HERE ONLY would make a CEL-written record and a
      // producer-constructed one differ in shape while agreeing in value: the cross-lane drift this refactor
      // exists to remove. If the payload gains `system`+`code`, BOTH lanes gain it together (disc 529 §3).
      resourceBody.valueQuantity =
        body.unit !== undefined ? { value: body.value, unit: body.unit } : { value: body.value };
    } else {
      resourceBody.valueString = String(body.value);
    }
  }

  // Stage → intent for Request-shaped resources.
  if (typeof body.stage === "string") {
    const intent = STAGE_TO_INTENT[body.stage] ?? body.stage;
    if (
      fhirType === "ServiceRequest" ||
      fhirType === "MedicationRequest" ||
      fhirType === "ImmunizationRequest" ||
      fhirType === "CommunicationRequest" ||
      fhirType === "Task"
    ) {
      resourceBody.intent = intent;
    }
  }

  // T12 / #87: definitional `do not perform` from the Activity declaration
  // takes precedence — applies even when the CEL fact carries no intent
  // modifier.
  if (derived.definitionalDoNotPerform === true) {
    if (
      fhirType === "ServiceRequest" ||
      fhirType === "MedicationRequest" ||
      fhirType === "Task"
    ) {
      resourceBody.doNotPerform = true;
    } else {
      resourceBody.status = "entered-in-error";
    }
  }
  // #189 Piece 2 (disc 508 D5(3)) backstop: an intent modifier on a LOCAL determination fact inverts its clinical
  // meaning, but its resource is retrieved by CODE (which still matches) → `$apply` would read the concept PRESENT,
  // the opposite of the intent. Reject + skip (never emit a self-contradicting membership resource) until negation
  // semantics land (#257). Intent on an activity/recommendation fact is legitimate — this is gated to role local.
  if (derived.role === "local" && factRefField?.intent !== undefined) {
    ctx.diagnostics.push({
      kind: "intent-modifier-on-local-fact",
      severity: "error",
      message: `Fact "${factName}" (local concept "${derived.concept?.name ?? "?"}") is referenced with an "${factRefField.intent}" intent modifier — a negated/absent local determination would still match its code-based retrieve and read PRESENT (the opposite). Rejected (negation semantics = #257).`,
      caseSlug: ctx.caseSlug,
      factName,
      filePath: ctx.graph.filePath,
    });
    return undefined;
  }
  // Status / intent modifiers (fact-level — combine with or override the
  // definitional flag above).
  if (factRefField?.intent === "absent") {
    if (
      fhirType === "ServiceRequest" ||
      fhirType === "MedicationRequest" ||
      fhirType === "Task"
    ) {
      resourceBody.doNotPerform = true;
    } else {
      // Best-effort: most resources have a `status` field. Mark as entered-in-error.
      resourceBody.status = "entered-in-error";
    }
  } else if (factRefField?.intent === "negative") {
    resourceBody.status = "stopped";
  }

  // Date.
  let isoDate: string | undefined;
  if (factRefField?.at) {
    isoDate = resolveAtClause(factRefField.at, ctx.anchors);
  }
  if (!isoDate && typeof body.date === "string") {
    isoDate = body.date;
  }
  if (isoDate) {
    applyDateField(resourceBody, fhirType, isoDate);
  }

  // Because text → note (Annotation array).
  if (factRefField?.because) {
    resourceBody.note = [{ text: factRefField.because }];
  }

  // Date defaults from the fact body — when the case body doesn't pin via `at`/`on`.
  // (Already covered above via body.date fallback.)

  // #189 homeostasis-core (disc 493): apply the registry's STRUCTURAL-default floor — a FHIR-required,
  // concept-independent element (Encounter `status`/`class`, ServiceRequest `status`/`intent`) gets its
  // overridable default when the source didn't supply it, so the emitted resource is valid FHIR. Author-set and
  // already-wired (`subject`) values are preserved (only MISSING elements are filled).
  applyStructuralDefaults(resourceBody, fhirType);

  ctx.emittedIds.set(factName, { id, resourceType: fhirType });

  return {
    resourceType: fhirType,
    id,
    // #189 (disc 492): KALM Patient-compartment — dir = the subject Patient's prefixed id, type lowercased.
    outputPath: `patient/${ctx.patientCompartmentId}/${fhirType.toLowerCase()}`,
    body: resourceBody,
  };
}

/** #189 homeostasis-core (disc 493): the registry-driven structural-default floor. For a SCHEMA'D resource,
 *  writes the `default` fulfillment of every required element the body is missing (`status`, `class`, `intent`);
 *  `wired` (subject) is already set upstream and `authored` is the author's job, so both are skipped here. An
 *  UNSCHEMA'D resource is left untouched (no error — its completeness is a separate, tracked gap). */
function applyStructuralDefaults(resourceBody: Record<string, unknown>, fhirType: string): void {
  const schema = requiredStructuralElements(fhirType);
  if (schema === undefined) return;
  for (const el of schema) {
    if (el.fulfillment.via === "default" && resourceBody[el.element] === undefined) {
      resourceBody[el.element] = defaultValueJson(el.fulfillment.value);
    }
  }
}

const CROSS_RESOURCE_FIELD: Record<CrossResourceRelation, string> = {
  "based-on": "basedOn",
  "part-of": "partOf",
  "during-encounter": "encounter",
  "requested-by": "requester",
  "performed-by": "performer",
  "not-done-because": "statusReason",
};

function applyCrossResource(
  resources: EmittedResource[],
  wiring: CELCrossResourceField,
  emittedIds: Map<string, { id: string; resourceType: string }>,
): void {
  const src = emittedIds.get(wiring.sourceName);
  const tgt = emittedIds.get(wiring.targetName);
  if (!src || !tgt) return;
  const srcRes = resources.find((r) => r.id === src.id);
  if (!srcRes) return;
  const field = CROSS_RESOURCE_FIELD[wiring.relation];
  if (field === "statusReason") {
    // statusReason is a CodeableConcept, not a Reference — best-effort: stash a coding.text.
    srcRes.body[field] = { text: `Not done because: ${wiring.targetName}` };
    return;
  }
  const ref = { reference: `${tgt.resourceType}/${tgt.id}` };
  // Reference-array fields (basedOn, partOf) vs single-Reference (encounter, requester, performer).
  if (field === "basedOn" || field === "partOf") {
    const existing = Array.isArray(srcRes.body[field]) ? (srcRes.body[field] as unknown[]) : [];
    existing.push(ref);
    srcRes.body[field] = existing;
  } else {
    srcRes.body[field] = ref;
  }
}

/** Emit all resources for a single CELCase. Returns an EmittedCase or undefined when skipped. */
function emitCase(ctx: EmitContext): EmittedCase | undefined {
  const resources: EmittedResource[] = [];

  // 1. Subject Patient — REQUIRED (disc 492): the KALM compartment directory is the subject Patient's id, so a
  //    case with no resolved subject has no compartment. Per source-atomic gating the WHOLE case is skipped
  //    (loud), never emitted into an invented directory.
  const subject = findSubject(ctx);
  if (!subject) {
    ctx.diagnostics.push({
      kind: "missing-subject",
      severity: "error",
      message: `Case "${ctx.c.name}" has no resolved subject Patient; skipped (no Patient compartment to place its resources under).`,
      caseSlug: ctx.caseSlug,
      filePath: ctx.graph.filePath,
    });
    return undefined;
  }
  // The compartment id = the subject Patient's id; compute BEFORE emitting any resource so every resource's
  // outputPath points at the one compartment.
  ctx.patientCompartmentId = makeResourceId(ctx, subject.name);
  const pat = emitSubjectPatient(ctx, subject);
  if (pat) {
    resources.push(pat);
    ctx.emittedIds.set(subject.name, { id: pat.id, resourceType: "Patient" });
  }

  // 2. Encounter (case-level ambient).
  const encFact = findEncounter(ctx);
  if (encFact) {
    const emitted = emitOneFact({ ctx, factName: encFact.name });
    if (emitted) resources.push(emitted);
  }

  // 3. Walk fact-is references in case body.
  for (const cb of ctx.c.body) {
    if (cb.type === "CELFactRefField") {
      const emitted = emitOneFact({ ctx, factName: cb.factName, factRefField: cb });
      if (emitted) resources.push(emitted);
    }
  }

  // 4. Apply cross-resource wiring.
  for (const cb of ctx.c.body) {
    if (cb.type === "CELCrossResourceField") {
      applyCrossResource(resources, cb, ctx.emittedIds);
    }
  }

  // 5. Note result-is lines as deferred.
  for (const cb of ctx.c.body) {
    if (cb.type === "CELResultField") {
      ctx.diagnostics.push({
        kind: "result-deferred",
        severity: "warning",
        message: `result is "${cb.leafName}" parsed; FHIR emit deferred (see #70/metric).`,
        caseSlug: ctx.caseSlug,
        filePath: ctx.graph.filePath,
        location: cb.location,
      });
    }
  }

  if (resources.length === 0) return undefined;
  return {
    caseSlug: ctx.caseSlug,
    librarySlug: ctx.librarySlug,
    resources,
  };
}

/**
 * Emit FHIR JSON instance fixtures for every case in a CEL file. Source-atomic per case: if a case fails
 * (precondition / missing subject / unsupported-yet / id collision) it is skipped with a diagnostic; the rest
 * proceed. Each emitted resource lands in the KALM Patient compartment `patient/<patientId>/<type>/…`. A fact
 * emits its code-determined resource — its representation arm is decided by the fact's code, not a channel.
 */
export function emitCelToFhir(graph: ResolvedCelGraph, _opts?: EmitCelOptions): EmitResult {
  const diagnostics: EmitDiagnostic[] = [];
  const emittedCases: EmittedCase[] = [];

  const cel = graph.cel;
  if (!cel) {
    diagnostics.push({
      kind: "precondition-failed",
      severity: "error",
      message: "No parsed CEL AST",
      filePath: graph.filePath,
    });
    return { emittedCases, diagnostics };
  }

  // Surface resolver-side blockers as precondition-failed.
  const blockingDiag = graph.diagnostics.find(
    (d) =>
      d.kind === "project-root-not-found" ||
      d.kind === "unresolved-covers" ||
      d.kind === "covers-missing-but-cases-present",
  );
  if (blockingDiag) {
    diagnostics.push({
      kind: "precondition-failed",
      severity: "error",
      message: `Resolver blocker: ${blockingDiag.kind}`,
      filePath: graph.filePath,
    });
    return { emittedCases, diagnostics };
  }

  const librarySlug = slugify(cel.library.name);

  // Build fact map.
  const facts = new Map<string, CELFact>();
  for (const s of cel.statements) {
    if (s.type === "CELFact") facts.set(s.name, s);
  }

  // #189 — id-collision backstop: the CEL lane has no closure invariant, so track every written relative path
  // `<outputPath>/<id>.json` across the whole emit and refuse a duplicate (which would silently overwrite on disk /
  // collapse a golden Map) BEFORE keeping the offending case.
  const writtenPaths = new Set<string>();

  for (const s of cel.statements) {
    if (s.type !== "CELCase") continue;
    const c = s;
    const ctx: EmitContext = {
      graph,
      facts,
      c,
      caseSlug: slugify(c.name),
      librarySlug,
      libraryName: cel.library.name,
      patientCompartmentId: "",
      anchors: buildAnchors(c),
      emittedIds: new Map(),
      diagnostics: [],
    };

    const emitted = emitCase(ctx);
    diagnostics.push(...ctx.diagnostics);
    if (!emitted) continue;

    // Check the case's resource paths for collisions before keeping it (source-atomic: reject the whole case).
    const keys = emitted.resources.map((r) => `${r.outputPath}/${r.id}.json`);
    const collision =
      keys.find((k) => writtenPaths.has(k)) ?? keys.find((k, i) => keys.indexOf(k) !== i);
    if (collision) {
      diagnostics.push({
        kind: "id-collision",
        severity: "error",
        message: `Case "${c.name}" produces a duplicate output path "${collision}"; skipped to avoid a silent overwrite.`,
        caseSlug: ctx.caseSlug,
        filePath: graph.filePath,
      });
      continue;
    }
    for (const k of keys) writtenPaths.add(k);
    emittedCases.push(emitted);
  }

  return { emittedCases, diagnostics };
}
