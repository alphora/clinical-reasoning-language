/**
 * Canonical Stage-1 reference artifacts for the authoring kit.
 *
 * These are the SINGLE SOURCE OF TRUTH for the kit's worked example. They are
 * embedded as TS string constants (NOT `.crl`/`.cel` files) because the npm
 * package and the VSIX ship `dist/**` only — a source-tree `.crl` would not be
 * present at runtime for the MCP consumers. The kit's unit test materializes
 * these to a temp project and runs the REAL validate/CRE path over them, so the
 * embedded text is proven, not asserted.
 *
 * `decision-reference.crl` exercises the full Stage-1 decision surface:
 *  - `first:` ordered precedence with a required `otherwise`,
 *  - a matched branch opening an `any:` menu of alternatives,
 *  - per-action guards `unless` / `only when`,
 *  - at least one ALWAYS-offered menu item (so a matched branch can never
 *    produce nothing — see docs/decision-shapes.md),
 *  - local case-feature concepts (`type is` + `code is` only),
 *  - plain `activity` dispositions (CRL has no approve/deny verbs).
 */
export const DECISION_REFERENCE_CRL = `# Decision Reference — Imaging Coverage (Stage 1 authoring exemplar)
library "Imaging Coverage Reference".

/*
Canonical Stage-1 (local-decision-support) exemplar. Every concept is a LOCAL
case-feature: \`type is\` + \`code is\` only — no \`source representation\` and no
\`definition is\` / \`defined as\` (those are later stages). Dispositions are plain
\`activity\` declarations; CRL has no approve/deny/pend verbs. The decision shows
the full shape: \`first:\` ordered precedence with a required \`otherwise\`, and a
matched branch opening an \`any:\` menu with per-action guards. "Order MRI" is
always offered, so a matched branch can never produce nothing.

SIGNPOST — this is a CDS exemplar: "Order MRI"/"Order CT" are CPGServiceRequest
service ORDERS, correct here because CDS recommends the clinician ORDER a service.
A PA / medical-policy DETERMINATION is different: it COMMUNICATES Approve/Deny via
the shared "Medical Policy Determination" library — do NOT copy this order pattern
into coverage content; see pa-determination-reference.
*/

// ============ Concepts (local case-features: type is + code is only) ============

concept "Hard Exclusion":
- type is Condition.
- code is \`hard-exclusion\`.

concept "Qualifying Indication":
- type is Condition.
- code is \`qualifying-indication\`.

concept "Contrast Allergy":
- type is AllergyIntolerance.
- code is \`contrast-allergy\`.

concept "Complex Case":
- type is Condition.
- code is \`complex-case\`.

// ============ Decision ============

decision "Imaging Coverage":
first:
- when "Hard Exclusion" then recommend activity "Deny".
- when "Qualifying Indication" then:
  any:
  - recommend activity "Order MRI".
  - recommend activity "Order CT" unless "Contrast Allergy".
  - recommend activity "Refer To Specialist" only when "Complex Case".
  end.
- otherwise then recommend activity "Deny".

// ============ Activities (plain dispositions; shareable) ============

activity "Order MRI":
- request CPGServiceRequest.
- with \`Order MRI of the affected region.\`.

activity "Order CT":
- request CPGServiceRequest.
- with \`Order CT of the affected region.\`.

activity "Refer To Specialist":
- request CPGCommunicationRequest.
- with \`Refer to the appropriate specialist.\`.

activity "Deny":
- request CPGCommunicationRequest.
- with \`Imaging is not covered for this presentation.\`.
`;

/**
 * Companion CEL for `decision-reference.crl`. Shows the CEL shapes a Stage-1
 * author needs for `run_decision`: a Patient subject fact, clinical facts linked
 * to concepts via `defined by` (qualified by the covered library name), and one
 * `result is "<decision>" is "<branch>"` oracle per case. Each case exercises a
 * distinct path: the `unless` drop, the `only when` enable, ordered exclusion,
 * and a plain menu offer.
 */
export const DECISION_REFERENCE_CEL = `# Decision Reference — Imaging Coverage — cases (Stage 1 CEL exemplar)
library "Imaging Coverage Reference Cases".
covers "Imaging Coverage Reference".

/*
Companion CEL for decision-reference.crl. \`covers\` names the CRL LIBRARY; the
\`result is\` oracle names the DECISION. Each clinical fact is linked to a concept
via \`defined by "<library>"."<concept>"\`. The CRE checks each case's produced
recommendations against its \`result is\` (membership: the asserted branch must be
among the produced recommendations).
*/

// ============ Patient ============

fact "Sample Patient":
- name is "Sample Patient".
- birth date is "1970-01-01".
- defined by "Patient".

// ============ Clinical facts (each linked to a concept) ============

fact "Indication Finding":
- code is "http://example.org/local|qualifying-indication".
- date is "2026-01-01".
- defined by "Imaging Coverage Reference"."Qualifying Indication".

fact "Exclusion Finding":
- code is "http://example.org/local|hard-exclusion".
- date is "2026-01-01".
- defined by "Imaging Coverage Reference"."Hard Exclusion".

fact "Contrast Allergy Finding":
- code is "http://example.org/local|contrast-allergy".
- date is "2026-01-01".
- defined by "Imaging Coverage Reference"."Contrast Allergy".

fact "Complex Case Finding":
- code is "http://example.org/local|complex-case".
- date is "2026-01-01".
- defined by "Imaging Coverage Reference"."Complex Case".

// ============ Cases ============

case "indication, no contraindication -> CT offered":
- description is \`Qualifying indication present, no contrast allergy and not a
  complex case: the menu offers MRI and CT; Refer To Specialist is guarded out.\`.
- subject is "Sample Patient".
- fact is "Indication Finding".
- result is "Imaging Coverage" is "Order CT".

case "contrast allergy -> CT dropped, MRI still offered":
- description is \`Contrast allergy contraindicates CT (unless drops it); MRI is
  always offered, so the menu still produces MRI.\`.
- subject is "Sample Patient".
- fact is "Indication Finding".
- fact is "Contrast Allergy Finding".
- result is "Imaging Coverage" is "Order MRI".

case "complex case -> specialist referral offered":
- description is \`A complex case enables the only-when-guarded specialist
  referral option.\`.
- subject is "Sample Patient".
- fact is "Indication Finding".
- fact is "Complex Case Finding".
- result is "Imaging Coverage" is "Refer To Specialist".

case "hard exclusion -> denied":
- description is \`A hard exclusion matches the first branch; by ordered
  precedence the decision denies regardless of indication.\`.
- subject is "Sample Patient".
- fact is "Indication Finding".
- fact is "Exclusion Finding".
- result is "Imaging Coverage" is "Deny".
`;

/**
 * Tools-authored criteria-decision reference (Stage 1). The CENTERPIECE for #168:
 * decision composition (combining the policy's DISTINCT criteria) lives in the
 * DECISION TREE — each criterion is its own nested `when` node (nesting = AND) —
 * while `defined as` is INFERENCE that normalizes the sub-representations of ONE
 * criterion into one fact. The kit's unit test materializes this and drives the
 * real CRE over it (criterion-1 node, criterion-2 node, and the inference operand).
 */
export const CRITERIA_DECISION_REFERENCE_CRL = `# Criteria Decision Reference — coverage criteria as DECISION NODES (Stage 1)
library "Coverage Criteria Reference".

/*
Decision composition (combining the policy's DISTINCT criteria -> a determination)
lives in the DECISION TREE: each criterion is its own \`when\` node (nesting = AND).
\`defined as\` is INFERENCE: it normalizes the sub-representations of ONE criterion
into ONE clinical fact (here, "failed conservative therapy" = failed drug OR
physical therapy). sem-and/or are SEMANTIC/inference operators, NOT composition,
and never join distinct criteria. The determination uses the SHARED "Medical Policy
Determination" library (imported, never re-authored).
*/

concept "Has Qualifying Diagnosis":
- type is Condition.
- code is \`qualifying-diagnosis\`.

concept "Failed Drug Therapy":
- type is Observation.
- code is \`failed-drug-therapy\`.
concept "Failed Physical Therapy":
- type is Observation.
- code is \`failed-physical-therapy\`.
concept "Failed Conservative Therapy":            // INFERENCE: one criterion, two representations
- defined as ( "Failed Drug Therapy" sem-or "Failed Physical Therapy" ).

decision "Coverage Determination":                 // criteria are nested \`when\` NODES
first:
- when "Has Qualifying Diagnosis" then:
    first:
    - when "Failed Conservative Therapy" then recommend activity "Medical Policy Determination"."Approve".
    - otherwise then recommend activity "Medical Policy Determination"."Deny".
    end.
- otherwise then recommend activity "Medical Policy Determination"."Deny".
`;

export const CRITERIA_DECISION_REFERENCE_CEL = `# Criteria Decision Reference — cases (Stage 1)
library "Coverage Criteria Reference Cases".
covers "Coverage Criteria Reference".

/*
Each case exercises a decision NODE or the inference operand: criterion-1 (\`when[0]\`),
criterion-2 (\`when[0]/when[0]\` — a nested NODE, not a composite), and the
\`defined as\` inference (failed drug OR physical therapy -> one "Failed Conservative
Therapy" fact). The two approve cases prove the inference resolves on either operand.
*/

fact "Sample Patient":
- name is "Sample Patient".
- birth date is "1970-01-01".
- defined by "Patient".

fact "Diagnosis Finding":
- code is "http://example.org/local|qualifying-diagnosis".
- date is "2026-01-01".
- defined by "Coverage Criteria Reference"."Has Qualifying Diagnosis".

fact "Drug Therapy Failure":
- code is "http://example.org/local|failed-drug-therapy".
- date is "2026-01-01".
- defined by "Coverage Criteria Reference"."Failed Drug Therapy".

fact "Physical Therapy Failure":
- code is "http://example.org/local|failed-physical-therapy".
- date is "2026-01-01".
- defined by "Coverage Criteria Reference"."Failed Physical Therapy".

case "diagnosis + failed drug therapy -> approve":
- subject is "Sample Patient".
- fact is "Diagnosis Finding".
- fact is "Drug Therapy Failure".
- result is "Coverage Determination" is "Approve".

case "diagnosis + failed physical therapy -> approve (inference: either representation)":
- subject is "Sample Patient".
- fact is "Diagnosis Finding".
- fact is "Physical Therapy Failure".
- result is "Coverage Determination" is "Approve".

case "diagnosis but no conservative-therapy failure -> deny (criterion-2 node otherwise)":
- subject is "Sample Patient".
- fact is "Diagnosis Finding".
- result is "Coverage Determination" is "Deny".

case "no qualifying diagnosis -> deny (criterion-1 node otherwise)":
- subject is "Sample Patient".
- result is "Coverage Determination" is "Deny".
`;

/**
 * Shared PA determination activities (#134). The CANONICAL, reusable
 * prior-authorization Approve/Deny — `CPGCommunicationRequest` carrying the X12 278
 * HCR01 outcome (Approve = A1 Certified / Deny = A3 Not Certified). A PA
 * determination is COMMUNICATED, never ORDERed (never `CPGServiceRequest`). Pended
 * (A4) is an async/workflow state, not a per-policy clinical leaf. Imported by every
 * medical-policy artifact via qualified ref (`"Medical Policy Determination"."Approve"`),
 * never re-authored — so the determination can't drift or go asymmetric per policy.
 */
export const MEDICAL_POLICY_DETERMINATION_CRL = `# Medical Policy Determination — shared PA determination activities (CANONICAL)
library "Medical Policy Determination".

/*
The SHARED, reusable prior-authorization DETERMINATION activities for every medical-policy
coverage decision. Per Da Vinci PAS (a PA response is a ClaimResponse) and X12 278 HCR01
"review action code": Approve = A1 (Certified in total); Deny = A3 (Not Certified). Both are
COMMUNICATED determinations (CPGCommunicationRequest) — the payer communicates a decision; it
NEVER orders the service (never CPGServiceRequest). Pended (A4) is a NON-FINAL asynchronous
workflow state (more time/info needed; requester polls for the eventual A1/A3) — NOT a
per-policy clinical determination leaf; handled at the workflow layer, not here.

The \`with\` text states ONLY the neutral X12 outcome (Certified / Not Certified). The REASON a
determination fired is the triggering \`when\` concept in the policy, NOT baked in here — so this
Deny is reusable by a medical-necessity denial AND an eligibility/business denial alike.

Reuse: a policy references these by qualified name —
  recommend activity "Medical Policy Determination"."Approve" / ."Deny".
At Stage 1 the X12 outcome is carried in the \`with\` narrative; a coded HCR01 value-set binding
is a later-stage (external-terminology) concern, out of scope for local-decision-support.
*/

activity "Approve":
- request CPGCommunicationRequest.
- with \`Coverage determination: APPROVE / Certified in total (X12 278 HCR01 A1). A communicated prior-authorization coverage determination certifying the requested service; NOT a service order.\`.

activity "Deny":
- request CPGCommunicationRequest.
- with \`Coverage determination: DENY / Not Certified (X12 278 HCR01 A3). A communicated prior-authorization coverage determination denying certification of the requested service; NOT a service order.\`.
`;

/**
 * Canonical PRIOR-AUTHORIZATION exemplar (#134) — distinct from the CDS
 * `decision-reference` (which ORDERs a service via `CPGServiceRequest`). Here the
 * payer COMMUNICATES a coverage determination via the SHARED "Medical Policy
 * Determination" library (imported, not re-authored). This exemplar shows the
 * Approve/Deny baseline; Pended (A4) is async/workflow, not a leaf. A single local
 * criterion keeps the focus on the determination pattern; a real policy authors its
 * DISTINCT criteria as decision-tree nodes (see criteria-decision-reference).
 */
export const PA_DETERMINATION_REFERENCE_CRL = `# PA Determination Reference — Coverage Determination (Stage 1 PA exemplar)
library "PA Determination Reference".

/*
The canonical PRIOR-AUTHORIZATION exemplar — distinct from the CDS decision-reference (which
ORDERs a service via CPGServiceRequest). Here the payer COMMUNICATES a coverage determination:
Approve (X12 HCR01 A1) / Deny (A3), via the SHARED "Medical Policy Determination" library
(imported, NOT re-authored per policy). This exemplar uses the Approve/Deny baseline; a deployment's
shared lib may offer further FINAL flavors. Pended (A4) is an async/workflow state, not a per-policy
clinical leaf. A single local criterion is shown; a real policy authors its DISTINCT
criteria as decision-tree nodes (see criteria-decision-reference).
*/

// (illustrative placeholder criterion — a real policy decomposes its stated criteria;
// here a single local leaf keeps the focus on the determination pattern)
concept "Has Qualifying Diagnosis":
- type is Condition.
- code is \`qualifying-diagnosis\`.

decision "Coverage Determination":
first:
- when "Has Qualifying Diagnosis" then recommend activity "Medical Policy Determination"."Approve".
- otherwise then recommend activity "Medical Policy Determination"."Deny".
`;

export const PA_DETERMINATION_REFERENCE_CEL = `# PA Determination Reference — cases (Stage 1 PA exemplar)
library "PA Determination Reference Cases".
covers "PA Determination Reference".

fact "Sample Patient":
- name is "Sample Patient".
- birth date is "1970-01-01".
- defined by "Patient".

fact "Diagnosis Finding":
- code is "http://example.org/local|qualifying-diagnosis".
- date is "2026-01-01".
- defined by "PA Determination Reference"."Has Qualifying Diagnosis".

case "qualifying diagnosis -> approve":
- subject is "Sample Patient".
- fact is "Diagnosis Finding".
- result is "Coverage Determination" is "Approve".

case "no qualifying diagnosis -> deny (otherwise)":
- subject is "Sample Patient".
- result is "Coverage Determination" is "Deny".
`;
