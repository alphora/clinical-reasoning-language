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
 * Tools-authored composition reference (Stage-1 `defined as`, now in scope per
 * #126). Shows the shape: a coverage criterion modeled as a `defined as` boolean
 * composition over LOCAL `code is` leaves, used directly in a `first:`/`otherwise`
 * decision — and adversarially testable (drop one leaf → the composite fails →
 * deny). The kit's unit test materializes this and drives the real CRE over it.
 */
export const COMPOSITION_REFERENCE_CRL = `# Composition Reference — Coverage Criteria (Stage 1: defined as)
library "Coverage Criteria Reference".

/*
The coverage criterion is a LOCAL composition: two asserted \`code is\` leaves
combined by \`defined as ( ... sem-and ... )\`. run_decision (#126) evaluates the
composition, so the criterion is expressed at full granularity AND proven by
drop-one-leaf cases. The determination uses the SHARED "Medical Policy
Determination" library (Approve = CPGCommunicationRequest A1 / Deny = A3) —
imported, never re-authored, so there is no inline approve/deny to drift or go
asymmetric. (Qualified refs auto-resolve from the vendored sibling lib; no
\`include\` is needed — an \`include\` would fire \`redundant-local-include\`.)
*/

concept "Has Qualifying Diagnosis":
- type is Condition.
- code is \`qualifying-diagnosis\`.

concept "Failed Conservative Therapy":
- type is Observation.
- code is \`failed-conservative-therapy\`.

concept "Meets Coverage Criteria":
- defined as ( "Has Qualifying Diagnosis" sem-and "Failed Conservative Therapy" ).

decision "Coverage Determination":
first:
- when "Meets Coverage Criteria" then recommend activity "Medical Policy Determination"."Approve".
- otherwise then recommend activity "Medical Policy Determination"."Deny".
`;

export const COMPOSITION_REFERENCE_CEL = `# Composition Reference — Coverage Criteria — cases (Stage 1: defined as)
library "Coverage Criteria Reference Cases".
covers "Coverage Criteria Reference".

/*
Each criterion leaf is asserted as its own fact; the CRE evaluates the composite.
The drop-one case proves each leaf is necessary (a missing leaf fails the sem-and
→ deny).
*/

fact "Sample Patient":
- name is "Sample Patient".
- birth date is "1970-01-01".
- defined by "Patient".

fact "Diagnosis Finding":
- code is "http://example.org/local|qualifying-diagnosis".
- date is "2026-01-01".
- defined by "Coverage Criteria Reference"."Has Qualifying Diagnosis".

fact "Failed Therapy Finding":
- code is "http://example.org/local|failed-conservative-therapy".
- date is "2026-01-01".
- defined by "Coverage Criteria Reference"."Failed Conservative Therapy".

case "both criteria met -> approve":
- subject is "Sample Patient".
- fact is "Diagnosis Finding".
- fact is "Failed Therapy Finding".
- result is "Coverage Determination" is "Approve".

case "missing failed-therapy leaf -> deny (drop-one)":
- subject is "Sample Patient".
- fact is "Diagnosis Finding".
- result is "Coverage Determination" is "Deny".

case "missing diagnosis leaf -> deny (drop-one, other operand)":
- subject is "Sample Patient".
- fact is "Failed Therapy Finding".
- result is "Coverage Determination" is "Deny".

case "no criteria -> deny (otherwise)":
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
 * Determination" library (imported, not re-authored). Approve/Deny are the two
 * FINAL leaves; Pended (A4) is async/workflow, not a leaf. A single local criterion
 * keeps the focus on the determination pattern; compose multi-part criteria with
 * `defined as` (see composition-reference).
 */
export const PA_DETERMINATION_REFERENCE_CRL = `# PA Determination Reference — Coverage Determination (Stage 1 PA exemplar)
library "PA Determination Reference".

/*
The canonical PRIOR-AUTHORIZATION exemplar — distinct from the CDS decision-reference (which
ORDERs a service via CPGServiceRequest). Here the payer COMMUNICATES a coverage determination:
Approve (X12 HCR01 A1) / Deny (A3), via the SHARED "Medical Policy Determination" library
(imported, NOT re-authored per policy). Approve/Deny are the two FINAL leaves; Pended (A4) is an
async/workflow state, not a per-policy clinical leaf. A single local criterion is shown; compose
multi-part criteria with \`defined as\` (see composition-reference).
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
