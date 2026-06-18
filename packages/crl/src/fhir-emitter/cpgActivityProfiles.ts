/**
 * CRL → CPG IG ActivityDefinition profile mapping table.
 *
 * Each entry is **manually verified once** against the published
 * `StructureDefinition-cpg-<lowercase>activity.json` artifact at
 * https://build.fhir.org/ig/HL7/cqf-recommendations/ (verification log
 * in `docs/cpg-ig-alignment.md`). The verification is for the
 * ActivityDefinition-side profile facts (kind, intent, code, profile
 * canonical) — NOT for the per-row `dynamicValuePath` against the
 * TARGET Request profile's element schema. That continuous check is
 * deferred to Todo 4's validator probe (plan v2.1 disposition; gpt55
 * round-3 reaffirmed the deferral as acceptable but flagged the
 * code-comment vs plan-promise gap, which this comment closes).
 *
 * The CPG IG fixes the following per profile (all `1..1 MS`):
 *   - `kind` to a FHIR resource type
 *   - `intent` to "proposal" (uniform)
 *   - `code.coding[0]` patterned (NOT fixed) to a `cpg-activity-type-cs`
 *     code — emitters append, consumers may add more
 *   - `profile` (singular) to a target Request profile canonical
 *   - `doNotPerform` to required boolean
 *
 * See `docs/cpg-ig-alignment.md` for the canonical CRL↔CPG-IG reference
 * + the verification log.
 *
 * NOTE on `dynamicValuePath`: this is the FHIRPath the `with` terminology
 * lands at on the produced Request instance, NOT on the ActivityDefinition
 * itself. The CRL `with "Terminology".` clause is emitted as a
 * `dynamicValue` entry with this `path` + a CQL identifier expression
 * referencing the ValueSet by its local quoted name (declared in the
 * sibling FHIR Library; see `library.ts`).
 *
 * Null `dynamicValuePath` means the CRL `with` clause has no obvious
 * IG-conformant slot for this profile. Per plan v2.1 dispositions:
 *   - CPGCommunicationRequest: corpus has zero terminology-`with` cases;
 *     hypothetical case emits `unsupported-communication-with-terminology`.
 *   - CPGQuestionnaire: corpus modeling errors corrected in commit
 *     `8295898`; future authoring with this combination emits without
 *     dynamicValue + log.
 */

const CPG_BASE = "http://hl7.org/fhir/uv/cpg/StructureDefinition";
const ACTIVITY_TYPE_CS = "http://hl7.org/fhir/uv/cpg/CodeSystem/cpg-activity-type-cs";

export interface CpgActivityProfile {
  /** Canonical URL of the `cpg-<lowercase>activity` profile (the ActivityDefinition profile). */
  profileUrl: string;
  /** Fixed value of `ActivityDefinition.kind` — the FHIR resource type the activity instantiates. */
  kind: string;
  /** Fixed value of `ActivityDefinition.profile` (singular) — the target Request profile canonical. */
  targetProfile: string;
  /** Code value patterned on `ActivityDefinition.code.coding[0]` (the meta activity-type code). */
  activityTypeCode: string;
  /**
   * FHIRPath on the target Request resource where the `with` terminology
   * binds (carried via ActivityDefinition.dynamicValue.path). Null when
   * no IG-conformant slot exists for this profile — see module header.
   */
  dynamicValuePath: string | null;
}

/**
 * Activity-type CodeSystem canonical for the activity-type Coding emitted
 * on `ActivityDefinition.code.coding[0]`.
 */
export const CPG_ACTIVITY_TYPE_CODE_SYSTEM = ACTIVITY_TYPE_CS;

const TABLE: ReadonlyArray<readonly [string, CpgActivityProfile]> = [
  ["CPGServiceRequest", {
    profileUrl: `${CPG_BASE}/cpg-servicerequestactivity`,
    kind: "ServiceRequest",
    targetProfile: `${CPG_BASE}/cpg-servicerequest`,
    activityTypeCode: "order-service",
    dynamicValuePath: "code",
  }],
  ["CPGMedicationRequest", {
    profileUrl: `${CPG_BASE}/cpg-medicationrequestactivity`,
    kind: "MedicationRequest",
    targetProfile: `${CPG_BASE}/cpg-medicationrequest`,
    activityTypeCode: "order-medication",
    dynamicValuePath: "medicationCodeableConcept",
  }],
  ["CPGImmunizationRequest", {
    profileUrl: `${CPG_BASE}/cpg-immunizationactivity`,
    kind: "MedicationRequest",
    targetProfile: `${CPG_BASE}/cpg-immunizationrequest`,
    activityTypeCode: "recommend-immunization",
    dynamicValuePath: "medicationCodeableConcept",
  }],
  ["CPGCommunicationRequest", {
    profileUrl: `${CPG_BASE}/cpg-communicationactivity`,
    kind: "CommunicationRequest",
    targetProfile: `${CPG_BASE}/cpg-communicationrequest`,
    activityTypeCode: "send-message",
    // Plan v2.1 C2 — corpus has zero terminology-`with` cases for
    // CPGCommunicationRequest (only free-text); hypothetical terminology
    // case emits `unsupported-communication-with-terminology`.
    dynamicValuePath: null,
  }],
  ["CPGQuestionnaire", {
    profileUrl: `${CPG_BASE}/cpg-collectinformationactivity`,
    kind: "Task",
    targetProfile: `${CPG_BASE}/cpg-questionnairetask`,
    activityTypeCode: "collect-information",
    // Plan v2.1 C3 — corpus modeling errors corrected in commit `8295898`
    // (CPGQuestionnaire-with-VS → CPGServiceRequest or CPGRecordInference).
    // No remaining corpus cases; future authoring with this combination
    // emits without dynamicValue + log.
    dynamicValuePath: null,
  }],
  ["CPGEnrollment", {
    profileUrl: `${CPG_BASE}/cpg-enrollmentactivity`,
    kind: "Task",
    targetProfile: `${CPG_BASE}/cpg-enrollmenttask`,
    activityTypeCode: "enrollment",
    dynamicValuePath: "code",
  }],
  ["CPGProposeDiagnosis", {
    profileUrl: `${CPG_BASE}/cpg-proposediagnosisactivity`,
    kind: "Task",
    targetProfile: `${CPG_BASE}/cpg-proposediagnosistask`,
    activityTypeCode: "propose-diagnosis",
    dynamicValuePath: "code",
  }],
  ["CPGRecordDetectedIssue", {
    profileUrl: `${CPG_BASE}/cpg-recorddetectedissueactivity`,
    kind: "Task",
    targetProfile: `${CPG_BASE}/cpg-recorddetectedissuetask`,
    activityTypeCode: "record-detected-issue",
    dynamicValuePath: "code",
  }],
  ["CPGRecordInference", {
    profileUrl: `${CPG_BASE}/cpg-recordinferenceactivity`,
    kind: "Task",
    targetProfile: `${CPG_BASE}/cpg-recordinferencetask`,
    activityTypeCode: "record-inference",
    dynamicValuePath: "code",
  }],
  ["CPGReportFlag", {
    profileUrl: `${CPG_BASE}/cpg-reportflagactivity`,
    kind: "Task",
    targetProfile: `${CPG_BASE}/cpg-reportflagtask`,
    activityTypeCode: "report-flag",
    dynamicValuePath: "code",
  }],
  ["CPGGenerateReport", {
    profileUrl: `${CPG_BASE}/cpg-generatereportactivity`,
    kind: "Task",
    targetProfile: `${CPG_BASE}/cpg-generatereporttask`,
    activityTypeCode: "generate-report",
    dynamicValuePath: "code",
  }],
  ["CPGDispenseMedication", {
    profileUrl: `${CPG_BASE}/cpg-dispensemedicationactivity`,
    kind: "Task",
    targetProfile: `${CPG_BASE}/cpg-dispensemedicationtask`,
    activityTypeCode: "dispense-medication",
    dynamicValuePath: "code",
  }],
  ["CPGDocumentMedication", {
    profileUrl: `${CPG_BASE}/cpg-documentmedicationactivity`,
    kind: "Task",
    targetProfile: `${CPG_BASE}/cpg-documentmedicationtask`,
    activityTypeCode: "document-medication",
    dynamicValuePath: "code",
  }],
  ["CPGAdministerMedication", {
    profileUrl: `${CPG_BASE}/cpg-administermedicationactivity`,
    kind: "Task",
    targetProfile: `${CPG_BASE}/cpg-administermedicationtask`,
    activityTypeCode: "administer-medication",
    dynamicValuePath: "code",
  }],
];

const TABLE_MAP: ReadonlyMap<string, CpgActivityProfile> = new Map(TABLE);

/**
 * O(1) lookup by CRL `request CPG<Type>` token. Returns null for unknown
 * tokens (shouldn't happen given the grammar allowlist, but defensive).
 */
export function lookupCpgActivityProfile(crlToken: string): CpgActivityProfile | null {
  return TABLE_MAP.get(crlToken) ?? null;
}

/**
 * All known profiles (for iteration in tests + tooling). Stable order
 * matches the CRL grammar `activityTypes.json` order.
 */
export const ALL_CPG_ACTIVITY_PROFILES: ReadonlyArray<{
  token: string;
  profile: CpgActivityProfile;
}> = TABLE.map(([token, profile]) => ({ token, profile }));
