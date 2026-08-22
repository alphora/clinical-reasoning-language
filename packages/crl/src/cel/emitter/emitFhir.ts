import { conceptTypes, type ConceptType } from "../../grammar/conceptTypes";
import {
  isQualifiedRef,
  getRefName,
  getRefLibrary,
  type Statement,
  type Concept,
} from "../../ast/types";
import { hasLocalCode, hasSourceBinding } from "../../emit/conceptDatumSignals";
import { resourceCodingPlacement } from "../../emit/resourceEmitRegistry";
import { readCanonicalBase, readPolicyId } from "../../fhir-emitter/metadata";
import { createLocalDomainResolver } from "../../fhir-emitter/localDomain";
import { astHasConceptLocalCode } from "../../cql-emitter/lowerLocalCodes";
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
} from "../ast/types";

import type {
  EmitResult,
  EmitDiagnostic,
  EmittedCase,
  EmittedResource,
} from "./types";

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
import { rawSlug, slugify, uniqueCapSlug, localCodeSystemUrl } from "../../fhir-emitter/slug";
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

interface CodeParts {
  system?: string;
  code: string;
}

function parseCanonicalToken(raw: string): CodeParts {
  // Per pitch v4 critical decision #3: `<system>|<code>`. Tolerate bare codes.
  const pipe = raw.indexOf("|");
  if (pipe === -1) return { code: raw };
  return { system: raw.slice(0, pipe), code: raw.slice(pipe + 1) };
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

/** #189 CEL-writer T3b (disc 490). filePaths of every registry library that declares concept-level `code is`,
 *  computed at the RAW-AST boundary (the CEL registry is never lowered, so `astHasConceptLocalCode` is stable).
 *  Feeds the shared local-domain resolver's `localCodePaths`. Recomputed per local fact (pure/cheap; memoize per
 *  graph only if a large caseload shows it). */
function computeLocalCodePaths(registry: Registry): Set<string> {
  const out = new Set<string>();
  for (const e of registry.byNameLocal.values()) if (astHasConceptLocalCode(e.ast)) out.add(e.filePath);
  for (const e of registry.byNamePackage.values()) if (astHasConceptLocalCode(e.ast)) out.add(e.filePath);
  return out;
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

  // Empty concept code → derivation failure (disc 490 Fable #6: never emit `coding.code: ""`).
  const code = concept.code;
  if (typeof code !== "string" || code.trim() === "") {
    return mkErr(`local concept "${concept.name}" carries no \`code is\`; cannot derive a local coding`);
  }

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
    localCodePaths: computeLocalCodePaths(registry),
    policyId,
  });
  // Metadata-less fallback mirrors the CQL lowering: `ast.library.name`, NOT the nullable `RegistryEntry.name`
  // (disc 490 Fable #12).
  const domainId = resolver.domainIdFor(owningEntry) ?? owningEntry.ast.library.name;

  let system: string;
  try {
    system = localCodeSystemUrl(base, domainId);
  } catch (e) {
    return mkErr(`local CodeSystem url composition failed for "${concept.name}": ${(e as Error).message}`);
  }
  return { parts: { system, code } };
}

/** Read body fields from a fact into a flat lookup. */
function readFactBody(fact: CELFact): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const b of fact.body) {
    if (b.type === "CELNameField") out.name = b.value;
    else if (b.type === "CELBirthDateField") out.birthDate = b.value;
    else if (b.type === "CELCodeField") out.code = b.value;
    else if (b.type === "CELDateField") out.date = b.value;
    else if (b.type === "CELValueField") out.value = b.value;
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
  return uniqueCapSlug(`${rawSlug(ctx.libraryName)}-${rawSlug(ctx.c.name)}-${rawSlug(factName)}`);
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
  const out: Record<string, unknown> = {
    resourceType: "Patient",
    id,
  };
  if (typeof body.name === "string") {
    out.name = [{ text: body.name }];
  }
  if (typeof body.birthDate === "string") {
    out.birthDate = body.birthDate;
  }
  return {
    resourceType: "Patient",
    id,
    outputPath: `patient/${ctx.librarySlug}/${ctx.caseSlug}/Patient`,
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
  const resourceBody: Record<string, unknown> = {
    resourceType: fhirType,
    id,
    // T12 / #89: stamp the CPG instance profile canonical when known.
    ...(derived.profileUrl ? { meta: { profile: [derived.profileUrl] } } : {}),
  };

  // Subject reference.
  const subject = findSubject(ctx);
  if (subject && SUBJECT_RESOURCES.has(fhirType)) {
    resourceBody.subject = { reference: `Patient/${makePatientId(ctx, subject.name)}` };
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
  // #189 CEL-writer T3b (disc 490): a LOCAL-role fact DERIVES its `{system, code}` from the concept (byte-match
  // with the CQL retrieve BY CONSTRUCTION); remote/bare-type/activity keep T2's authored-code placement. The
  // loud floor: a local derivation failure or an authored-code §5 conflict SKIPS the fact (return undefined) —
  // never a coding-less or ambiguously-coded partial instance (which `$apply` drops silently → wrong PA
  // determination, the dme101-030 failure class). Full case-atomic discard/unwire is T3c.
  let coding: CodeParts | undefined;
  if (derived.role === "local") {
    if (typeof body.code === "string") {
      // §5 — the code must derive from the concept; never silently prefer authored vs derived.
      ctx.diagnostics.push({
        kind: "local-authored-code-conflict",
        severity: "error",
        message: `Fact "${factName}" is backed by a local concept but also carries an authored \`code is\` — the code must derive from the concept; remove the fact's code.`,
        caseSlug: ctx.caseSlug,
        factName,
        filePath: ctx.graph.filePath,
      });
      return undefined;
    }
    const local = deriveLocalCoding(ctx, derived, factName);
    if ("error" in local) {
      ctx.diagnostics.push(local.error);
      return undefined;
    }
    coding = local.parts;
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

  // Status — #189 CEL-writer T3 (REFACTOR:grounded vs CRL-NORTH-STAR §4 + FHIR R4/R5 Observation).
  // `Observation.status` is REQUIRED (cardinality 1..1); an Observation emitted without it is invalid FHIR
  // and the $apply engine drops it SILENTLY (→ the retrieve finds nothing → wrong PA determination). A local
  // `code is` determination is a reviewer-asserted analytical inference that HOLDS at emit time — its FHIR
  // status is `final`. This is unconditional for Observation (a valueless `exists this` determination still
  // needs it), so it sits OUTSIDE the value block below.
  if (fhirType === "Observation") {
    resourceBody.status = "final";
  }

  // Value (boolean, numeric, or string) — Observation primarily. #189 S1 — a boolean value lowers
  // to `Observation.valueBoolean` (a `value type is boolean` determination), the shape the local
  // `code is` truth-set retrieve consumes (`asTruths`: `value.value is true`).
  if (body.value !== undefined && fhirType === "Observation") {
    if (typeof body.value === "boolean") {
      resourceBody.valueBoolean = body.value;
    } else if (typeof body.value === "number") {
      resourceBody.valueQuantity = { value: body.value };
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

  ctx.emittedIds.set(factName, { id, resourceType: fhirType });

  return {
    resourceType: fhirType,
    id,
    outputPath: `patient/${ctx.librarySlug}/${ctx.caseSlug}/${fhirType}`,
    body: resourceBody,
  };
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

  // 1. Subject Patient.
  const subject = findSubject(ctx);
  if (subject) {
    const pat = emitSubjectPatient(ctx, subject);
    if (pat) {
      resources.push(pat);
      ctx.emittedIds.set(subject.name, { id: pat.id, resourceType: "Patient" });
    }
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
 * Emit FHIR JSON instance fixtures for every case in a CEL file. Per-case
 * atomic: if a case fails (precondition / unsupported-yet on a required fact)
 * it's skipped and a diagnostic is emitted; per-file partial.
 */
export function emitCelToFhir(graph: ResolvedCelGraph): EmitResult {
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

  // Walk cases.
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
      anchors: buildAnchors(c),
      emittedIds: new Map(),
      diagnostics: [],
    };

    const emitted = emitCase(ctx);
    if (emitted) {
      emittedCases.push(emitted);
    }
    diagnostics.push(...ctx.diagnostics);
  }

  return { emittedCases, diagnostics };
}
