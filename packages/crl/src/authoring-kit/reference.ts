/**
 * Current worked publication examples. Each source is consumed by the kit and
 * its validation/emission/CRE tests. Verification stamps name independent evidence;
 * CRE predictions and construct-level engine history are not whole-artifact $apply proof.
 */

/**
 * The local DETERMINATION ACTIVITIES appended to each PA reference artifact (configurable-PA-leaves). A
 * determination is a plain LOCAL `activity` named `<category>.<key>` — certify/not-certify/pended are PAS
 * review-actions — validated against the deployment's `crl.dispositions` config (NOT a shared vendored library,
 * which the model retired: a determination may live in a separate library, so config can't generate it). Every
 * determination is COMMUNICATED (`CPGCommunicationRequest`), never ordered. `certify.Approve` + `not-certify.Deny`
 * are the baseline; `not-certify.EIU` is a second not-certify flavor (experimental/investigational/unproven) that
 * shares the A3 outcome but communicates a distinct reason.
 */
const DETERMINATION_ACTIVITIES = `

// ===== Determination activities (local; validated against crl.dispositions) =====

activity "certify.Approve":
- request CPGCommunicationRequest.
- with \`Certified in total (X12 278 HCR01 A1) — a communicated coverage determination, not a service order.\`.

activity "not-certify.Deny":
- request CPGCommunicationRequest.
- with \`Not certified (X12 278 HCR01 A3) — a communicated coverage determination, not a service order.\`.
`;

const DETERMINATION_ACTIVITIES_WITH_EIU =
  DETERMINATION_ACTIVITIES +
  `
activity "not-certify.EIU":
- request CPGCommunicationRequest.
- with \`Not certified — experimental/investigational/unproven (X12 278 HCR01 A3); a denial reason distinct from a medical-necessity not-certify (both are X12 A3), not a service order.\`.
`;

/**
 * Canonical PRIOR-AUTHORIZATION exemplar (#134) — a coverage communication rather than a service order. Here the
 * payer COMMUNICATES a coverage determination via configured `<category>.<key>` local
 * activities (validated against `crl.dispositions`). This exemplar shows the
 * certify/not-certify baseline; a non-final `pended` leaf is legitimate only in embedded
 * mode. A single local criterion keeps the focus on the determination pattern; a real
 * policy authors its DISTINCT criteria as decision-tree nodes (see the decision-composition rule).
 */
export const PA_DETERMINATION_REFERENCE_CRL =
  `# PA Determination Reference — Coverage Determination (Stage 1 PA exemplar)
library "PA Determination Reference".

/*
The canonical PRIOR-AUTHORIZATION exemplar — a coverage communication rather than a service order. Here the payer COMMUNICATES a coverage determination:
certify (X12 HCR01 A1) / not-certify (A3), via configured \`<category>.<key>\` local activities
(validated against crl.dispositions — no shared library). This exemplar uses the certify/not-certify
baseline; a deployment configures further keyed flavors. A non-final pended (A4) leaf is legitimate
only in embedded mode. A single local criterion is shown; a real policy authors its DISTINCT
criteria as decision-tree nodes (see the decision-composition rule).
*/

// (illustrative placeholder criterion — a real policy decomposes its stated criteria;
// here a single local leaf keeps the focus on the determination pattern)
concept "Has Qualifying Diagnosis":
- shape is Record.
- shape reduction is most recent.
- value type is boolean.
- type is Observation.
- code is \`qualifying-diagnosis\`.

decision "Coverage Determination":
first:
- when "Has Qualifying Diagnosis" then recommend activity "certify.Approve".
- otherwise then recommend activity "not-certify.Deny".

presentation for "Has Qualifying Diagnosis":
- question text is "Is a qualifying diagnosis documented?".
` + DETERMINATION_ACTIVITIES;

export const PA_DETERMINATION_REFERENCE_CEL = `# PA Determination Reference — cases (Stage 1 PA exemplar)
library "PA Determination Reference Cases".
covers "PA Determination Reference".

fact "Sample Patient":
- name is "Sample Patient".
- birth date is "1970-01-01".
- defined by "Patient".

fact "Diagnosis Finding":
- date is "2026-01-01".
- value is true.
- defined by "PA Determination Reference"."Has Qualifying Diagnosis".

fact "No Qualifying Diagnosis":
- date is "2026-01-01".
- value is false.
- defined by "PA Determination Reference"."Has Qualifying Diagnosis".

case "qualifying diagnosis -> approve":
- subject is "Sample Patient".
- fact is "Diagnosis Finding".
- result is "Coverage Determination" is "certify.Approve".

// ⚠ An UNANSWERED criterion is UNKNOWN, not false: the tree PAUSES rather than falling through.
// A case that means "not met" must ANSWER it.
case "no qualifying diagnosis -> deny (otherwise)":
- subject is "Sample Patient".
- fact is "No Qualifying Diagnosis".
- result is "Coverage Determination" is "not-certify.Deny".

case "missing required answer -> pause":
- subject is "Sample Patient".
- result is "Coverage Determination" is pause.
`;

/**
 * Worked exemplar B — SOURCE-REQUIRED delegation (kit teaching §2/§5-B). The source NAMES a separate
 * determination ("per the Continuation-of-Therapy protocol") → the policy CHAINS to it with a bare,
 * same-library `use decision`. Source delegation is this example's reason for chaining;
 * genuine shared-determination reuse is another legitimate reason. The chained sub renders its OWN disposition (Approve/Deny
 * meaningful alone). One parent + one delegated sub.
 *
 * Proof note (§4): the bare same-library `use decision` IS evaluated by the CRE — it RECURSES the sub in
 * place and the sub's determination BUBBLES UP into `produced` (#166); the bare sub-NAME is never produced.
 * So the `result is` oracle names the DELEGATED disposition (Approve/Deny), not the sub-decision name. The
 * delegated-path cases assert the PATH via the run trace (the `when "Continuation Request"` action child is
 * the `use decision` node), not the disposition alone — a sub's `otherwise` Deny and the parent's `otherwise`
 * Deny are indistinguishable by membership (§4-req1).
 */
export const SOURCE_DELEGATED_DECISION_REFERENCE_CRL =
  `# Source-Delegated Decision Reference — source-required \`use decision\` delegation (Stage 1)
library "Source Delegated Decision Reference".

/*
Worked exemplar B: DO chain — because the SOURCE delegates. The policy narrative names a SEPARATE,
delegated determination ("for a continuation request, apply the Continuation-of-Therapy determination"),
so the encoding CHAINS to it with a BARE, same-library \`use decision\`. This example chains because
the source draws the determination boundary. Genuine shared-determination reuse is also valid;
do not fabricate a shared determination from merely similar independent criteria.

The delegated sub renders its OWN disposition (Approve/Deny, each meaningful standalone). The CRE evaluates
a bare same-library \`use decision\` by RECURSING the sub in place; its determination BUBBLES UP, so the
\`result is\` oracle names the DELEGATED disposition (Approve / Deny), not the sub-decision NAME. One parent
determination + one delegated sub.
*/

concept "Continuation Request":
- shape is Record.
- shape reduction is most recent.
- value type is boolean.
- type is Observation.
- code is \`continuation-request\`.
concept "Demonstrated Response":
- shape is Record.
- shape reduction is most recent.
- value type is boolean.
- type is Observation.
- code is \`demonstrated-response\`.
concept "Clinically Indicated":
- shape is Record.
- shape reduction is most recent.
- value type is boolean.
- type is Observation.
- code is \`clinically-indicated\`.

decision "Coverage Determination":
first:
- when "Continuation Request" then use decision "Continuation of Therapy Determination".
- when "Clinically Indicated" then recommend activity "certify.Approve".
- otherwise then recommend activity "not-certify.Deny".

decision "Continuation of Therapy Determination":
first:
- when "Demonstrated Response" then recommend activity "certify.Approve".
- otherwise then recommend activity "not-certify.Deny".

presentation for "Continuation Request":
- question text is "Is this a continuation request?".

presentation for "Demonstrated Response":
- question text is "Has a response to treatment been demonstrated?".

presentation for "Clinically Indicated":
- question text is "Is the requested treatment clinically indicated?".
` + DETERMINATION_ACTIVITIES;

export const SOURCE_DELEGATED_DECISION_REFERENCE_CEL = `# Source-Delegated Decision Reference — cases (Stage 1)
library "Source Delegated Decision Reference Cases".
covers "Source Delegated Decision Reference".

/*
Cases for exemplar B. The first two route through the DELEGATED sub ("Continuation of Therapy
Determination"): its determination bubbles up so the oracle names Approve/Deny (the delegated disposition),
not the sub-decision name. The last two resolve in the PARENT. (Per §4-req1 the kit's unit test asserts the
continuation→Deny case's PATH goes through the delegated sub, not the parent \`otherwise\`.)
*/

fact "Sample Patient":
- name is "Sample Patient".
- birth date is "1970-01-01".
- defined by "Patient".

fact "Continuation Request Finding":
- date is "2026-01-01".
- value is true.
- defined by "Source Delegated Decision Reference"."Continuation Request".

// #189 null/pause — the NEGATIVE is now STATED, not implied by omission. Omission means UNKNOWN
// (nothing established it, nothing can compute it) and makes the gate pause and ask.
fact "No Demonstrated Response":
- date is "2026-01-01".
- value is false.
- defined by "Source Delegated Decision Reference"."Demonstrated Response".

fact "Demonstrated Response Finding":
- date is "2026-01-01".
- value is true.
- defined by "Source Delegated Decision Reference"."Demonstrated Response".

fact "Clinically Indicated Finding":
- date is "2026-01-01".
- value is true.
- defined by "Source Delegated Decision Reference"."Clinically Indicated".

fact "No Continuation Request":
- date is "2026-01-01".
- value is false.
- defined by "Source Delegated Decision Reference"."Continuation Request".

fact "Not Clinically Indicated":
- date is "2026-01-01".
- value is false.
- defined by "Source Delegated Decision Reference"."Clinically Indicated".

case "continuation + demonstrated response -> approve via delegated sub":
- subject is "Sample Patient".
- fact is "Continuation Request Finding".
- fact is "Demonstrated Response Finding".
- result is "Coverage Determination" is "certify.Approve".

case "continuation, no response -> deny via delegated sub otherwise":
- subject is "Sample Patient".
- fact is "Continuation Request Finding".
- fact is "No Demonstrated Response".
- result is "Coverage Determination" is "not-certify.Deny".

case "clinically indicated (no continuation) -> approve in parent":
- subject is "Sample Patient".
- fact is "No Continuation Request".
- fact is "Clinically Indicated Finding".
- result is "Coverage Determination" is "certify.Approve".

case "neither -> deny in parent otherwise":
- subject is "Sample Patient".
- fact is "No Continuation Request".
- fact is "Not Clinically Indicated".
- result is "Coverage Determination" is "not-certify.Deny".

case "missing required answer -> pause":
- subject is "Sample Patient".
- fact is "Continuation Request Finding".
- result is "Coverage Determination" is pause.
`;

/** One determination, overlapping pathways, explicit outcome precedence. */
export const DISPOSITION_ARBITRATION_REFERENCE_CRL =
  `# Disposition-Arbitration Reference — overlapping qualifying pathways with outcome precedence (Stage 1)
library "Disposition Arbitration Reference".

/*
WORKED EXAMPLE for the kit. Source structure: ONE determination, with MULTIPLE OVERLAPPING qualifying
pathways, and a PRECEDENCE among outcome categories (Approve > within-indication Deny > off-indication
EIU), with fall-through. This is the DISPOSITION-ARBITRATION model.

WHEN this model is faithful: the source presents ONE determination whose outcome categories have a
precedence over an OVERLAPPING population. It is NOT the model when the source presents SEPARATE
sub-determinations that compose — that is \`use decision\` (a distinct primitive).

HOW it works (CRL #224 — structure, not inference): each qualifying pathway is a sibling \`when\` branch
gated on its FULL conjunction as a COMPOUND BRANCH GUARD (\`when ( c1 and c2 )\`). The precedence is the
\`first:\` BRANCH ORDER — Approve pathways first, then the covered-but-unqualified Deny, then the residual
off-indication EIU (\`otherwise\`). The full-conjunction guard is what makes a PARTIAL pathway match fall
THROUGH to the next branch rather than being trapped, so a patient who satisfies BOTH indications but
fails one pathway still approves via the other — no "overlap pop". Publication guards emit a whole Boolean applicability expression and dependency input metadata.
The authored criteria remain operands of that expression; they are not separate condition entries.
False guards fall through; decisive unknown guards pause before a leaf.

OVERLAP ORACLE (load-bearing): a patient who satisfies BOTH indications but fails ONE pathway's
criteria still APPROVES via the OTHER pathway — the failure does not pop to a deny. The oracle asserts
WHICH outcome wins (the EXACT disposition under \`first:\`), so a precedence inversion would FAIL it —
"a disposition fired" is not enough.
*/

// ===== Clinical criteria (local case-features; visible decision nodes) =====
concept "Has Indication X":
- shape is Record.
- shape reduction is most recent.
- value type is boolean.
- type is Observation.
- code is \`indication-x\`.
concept "Failed Standard Therapy":
- shape is Record.
- shape reduction is most recent.
- value type is boolean.
- type is Observation.
- code is \`failed-standard-therapy\`.
concept "Has Indication Y":
- shape is Record.
- shape reduction is most recent.
- value type is boolean.
- type is Observation.
- code is \`indication-y\`.
concept "Has Severe Markers":
- shape is Record.
- shape reduction is most recent.
- value type is boolean.
- type is Observation.
- code is \`severe-markers\`.

// ===== Decision: sibling compound-guard pathways; precedence = first: branch ORDER (CRL #224) =====
// Each full conjunction determines whether its pathway applies.
// first: gives precedence; unknown does not become false.
decision "Coverage Determination":
first:
- when ( "Has Indication X" and "Failed Standard Therapy" ) then recommend activity "certify.Approve".
- when ( "Has Indication Y" and "Has Severe Markers" ) then recommend activity "certify.Approve".
- when ( "Has Indication X" or "Has Indication Y" ) then recommend activity "not-certify.Deny".
- otherwise then recommend activity "not-certify.EIU".

presentation for "Has Indication X":
- question text is "Is indication X documented?".

presentation for "Failed Standard Therapy":
- question text is "Has standard therapy failed?".

presentation for "Has Indication Y":
- question text is "Is indication Y documented?".

presentation for "Has Severe Markers":
- question text is "Are severe markers documented?".
` + DETERMINATION_ACTIVITIES_WITH_EIU;

export const DISPOSITION_ARBITRATION_REFERENCE_CEL = `# Disposition-Arbitration Reference — cases (Stage 1)
library "Disposition Arbitration Reference Cases".
covers "Disposition Arbitration Reference".

/*
Exercises the arbitration: each pathway alone (approve), BOTH overlap cases (a both-indication patient
who fails one pathway still approves via the other — the load-bearing "no overlap-pop" oracle),
within-indication failure (Deny), and off-indication (Deny EIU). The two overlap cases are what a sibling
tree gated on PARTIAL conditions (bare indications, not each pathway's FULL conjunction) would get wrong —
first-match would strand the patient on the failed pathway; the full-conjunction compound guards make the
partial match fall THROUGH (the OR-of-pathways trap rule).
*/

fact "Sample Patient":
- name is "Sample Patient".
- birth date is "1970-01-01".
- defined by "Patient".

fact "Indication X Finding":
- date is "2026-01-01".
- value is true.
- defined by "Disposition Arbitration Reference"."Has Indication X".

// #189 null/pause — the NEGATIVE is now STATED, not implied by omission. Omission means UNKNOWN
// (nothing established it, nothing can compute it) and makes the gate pause and ask.
fact "No Failed Standard Therapy":
- date is "2026-01-01".
- value is false.
- defined by "Disposition Arbitration Reference"."Failed Standard Therapy".

fact "Failed Standard Therapy Finding":
- date is "2026-01-01".
- value is true.
- defined by "Disposition Arbitration Reference"."Failed Standard Therapy".

fact "Indication Y Finding":
- date is "2026-01-01".
- value is true.
- defined by "Disposition Arbitration Reference"."Has Indication Y".

fact "No Indication X":
- date is "2026-01-01".
- value is false.
- defined by "Disposition Arbitration Reference"."Has Indication X".

fact "No Indication Y":
- date is "2026-01-01".
- value is false.
- defined by "Disposition Arbitration Reference"."Has Indication Y".

fact "Severe Markers Finding":
- date is "2026-01-01".
- value is true.
- defined by "Disposition Arbitration Reference"."Has Severe Markers".

fact "No Severe Markers":
- date is "2026-01-01".
- value is false.
- defined by "Disposition Arbitration Reference"."Has Severe Markers".

case "X pathway qualifies -> approve":
- subject is "Sample Patient".
- fact is "Indication X Finding".
- fact is "Failed Standard Therapy Finding".
- result is "Coverage Determination" is "certify.Approve".

case "Y pathway qualifies -> approve":
- subject is "Sample Patient".
- fact is "No Indication X".
- fact is "Indication Y Finding".
- fact is "Severe Markers Finding".
- result is "Coverage Determination" is "certify.Approve".

case "OVERLAP: both indications, X-pathway fails (no failed-standard) -> approve via Y":
- subject is "Sample Patient".
- fact is "Indication X Finding".
- fact is "Indication Y Finding".
- fact is "Severe Markers Finding".
- fact is "No Failed Standard Therapy".
- result is "Coverage Determination" is "certify.Approve".

case "OVERLAP: both indications, Y-pathway fails (no severe markers) -> approve via X":
- subject is "Sample Patient".
- fact is "Indication X Finding".
- fact is "Failed Standard Therapy Finding".
- fact is "Indication Y Finding".
- fact is "No Severe Markers".
- result is "Coverage Determination" is "certify.Approve".

case "Y indicated without severe markers -> Deny":
- subject is "Sample Patient".
- fact is "No Indication X".
- fact is "Indication Y Finding".
- fact is "No Severe Markers".
- result is "Coverage Determination" is "not-certify.Deny".

case "within-indication: X present but pathway fails, no Y -> Deny":
- subject is "Sample Patient".
- fact is "Indication X Finding".
- fact is "No Failed Standard Therapy".
- fact is "No Indication Y".
- result is "Coverage Determination" is "not-certify.Deny".

case "off-indication: neither indication -> Deny EIU":
- subject is "Sample Patient".
- fact is "No Indication X".
- fact is "No Indication Y".
- result is "Coverage Determination" is "not-certify.EIU".

case "missing required answer -> pause":
- subject is "Sample Patient".
- result is "Coverage Determination" is pause.
`;

export const PATIENT_AGE_BOTH_REP_REFERENCE_CRL = `# Patient-Age Both-Representation Reference — the local override + Patient age \`source representation\`
library "Patient Age Reference".

/*
REFACTOR:grounded (#320, plan583): synthetic age eligibility with explicit Record publication.
The following behavior describes the age pattern's contract. Separate native probes cover
the redesigned publication (review584); they do not certify this exact artifact.
This exact example is validated and emitted here; its full Q/QR session is not executed by the kit suite.
The age pattern recalculates each day; same-day assertions can override. Missing age remains
unknown until a calculation or answer determines it. Persisted calculations retain their method,
and cannot suppress a fresh calculation. CEL and extracted answers carry asserted method.
*/

concept "Age 18 Or Older":
- shape is Record.
- value type is boolean.
- type is Observation.
- code is \`age-18-or-older\`.
- shape reduction is most recent.
- source representation:
  - type is Patient.
  - value projection is age today at least 18 years.

// The upper-bound predicate also preserves unknown input.
concept "Patient Under Twenty One Years":
- shape is Record.
- value type is boolean.
- type is Observation.
- code is \`under-21\`.
- shape reduction is most recent.
- source representation:
  - type is Patient.
  - value projection is age today under 21 years.

decision "Adult Eligibility Determination":
first:
- when "Age 18 Or Older" then recommend activity "Approve".
- otherwise then recommend activity "Deny".

decision "Pediatric Eligibility Determination":
first:
- when "Patient Under Twenty One Years" then recommend activity "Approve".
- otherwise then recommend activity "Deny".

// Neutral disposition text — the SAME two activities serve BOTH decisions, so the payload
// must not name a specific population (a pediatric approval must not read "adult").
activity "Approve":
- request CPGCommunicationRequest.
- with \`Eligibility: APPROVE — age criterion met.\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`Eligibility: DENY — age criterion not met.\`.

presentation for "Age 18 Or Older":
- question text is "Is the patient at least 18 years old?".

presentation for "Patient Under Twenty One Years":
- question text is "Is the patient younger than 21 years?".
`;

export const PUBLICATION_REFERENCE_CRL = `# Selected publication reference — BMI cascade and uncoded age
library "Publication Examples".

// Synthetic finite codes. Validate and emit this exact example; native execution
// of related producer fixtures does not establish this entire artifact or a Q/QR session.
// Codes intentionally keep local answers available, including for computed BMI and High BMI.
// Presentations are omitted: emission warns and adds no authored question-text or description extension.
// See concept-presentation for the tested engine's concept-name fallback.
// See bmi-publication: full Q/QR resubmission for coded BMI remains open because untouched defaults
// can become new assertions. This example does not certify that session behavior.
terminology "Height VS":
- system is \`http://example.org/synthetic-measurements\`.
- code is \`height\`.
terminology "Weight VS":
- system is \`http://example.org/synthetic-measurements\`.
- code is \`weight\`.
terminology "Clinical BMI":
- system is \`http://example.org/synthetic-measurements\`.
- code is \`bmi\`.

concept "Height":
- shape is Record.
- shape reduction is most recent.
- value type is Quantity.
- type is Observation.
- code is \`height\`.
- source representation:
  - type is Observation.
  - coded from "Height VS".

concept "Weight":
- shape is Record.
- shape reduction is most recent.
- value type is Quantity.
- type is Observation.
- code is \`weight\`.
- source representation:
  - type is Observation.
  - coded from "Weight VS".

concept "BMI":
- shape is Record.
- shape reduction is most recent.
- value type is Quantity.
- type is Observation.
- code is \`bmi\`.
- definition is body mass index of "Weight" and "Height" using validity of "Weight".
- source representation:
  - type is Observation.
  - coded from "Clinical BMI".

concept "High BMI":
- shape is Record.
- shape reduction is most recent.
- value type is boolean.
- type is Observation.
- code is \`high-bmi\`.
- definition is "BMI" at least 30 'kg/m2'.

// ============ Patient age projection (standalone, months) ============
// REFACTOR:grounded (#320, plan585): this calculation has no local answer code.
// Age today supports years/months and rejects unsupported comparators, units and carriers.
// Rep-local exists this projections are also implemented; arbitrary projection phrases need
// their own execution proof. Missing birthDate remains unknown; this concept has no answer slot.
concept "Patient Under Six Months":
- shape is Record.
- type is Observation.
- value type is boolean.
- shape reduction is most recent.
- source representation:
  - type is Patient.
  - value projection is age today under 6 months.

// Synthetic consumers keep the publication dependencies in the emitted closure.
// These illustrate threshold evaluation, not clinical recommendations.
decision "BMI Threshold Demonstration":
first:
- when "High BMI" then recommend activity "Threshold Met".
- otherwise then recommend activity "Threshold Not Met".

decision "Infant Age Demonstration":
first:
- when "Patient Under Six Months" then recommend activity "Threshold Met".
- otherwise then recommend activity "Threshold Not Met".

activity "Threshold Met":
- request CPGCommunicationRequest.
- with \`Synthetic demonstration: threshold met.\`.

activity "Threshold Not Met":
- request CPGCommunicationRequest.
- with \`Synthetic demonstration: threshold not met.\`.
`;
