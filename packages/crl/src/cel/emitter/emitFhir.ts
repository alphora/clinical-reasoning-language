import { conceptTypes, type ConceptType } from "../../grammar/conceptTypes";
import { isQualifiedRef, getRefName, getRefLibrary, type Statement } from "../../ast/types";
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
    if (CONCEPT_TYPE_SET.has(name)) return { fhirType: name };
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
    if (c && CONCEPT_TYPE_SET.has(c)) return { fhirType: c, kind: "Concept" };
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

function codeableConcept(raw: string): Record<string, unknown> {
  const cp = parseCanonicalToken(raw);
  return {
    coding: [
      {
        ...(cp.system !== undefined ? { system: cp.system } : {}),
        code: cp.code,
      },
    ],
  };
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

  // Code.
  if (typeof body.code === "string") {
    resourceBody.code = codeableConcept(body.code);
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
