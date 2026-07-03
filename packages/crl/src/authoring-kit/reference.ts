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
DISPOSITION TYPE follows the ACT: an act that is COMMUNICATED rather than ordered
uses CPGCommunicationRequest instead — do NOT copy this order pattern where the act
is a communicated decision (see the dispositions rule).
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
and never join distinct criteria. The determination is a configured category.key
local activity (certify.Approve / not-certify.Deny), validated against crl.dispositions.
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
    - when "Failed Conservative Therapy" then recommend activity "certify.Approve".
    - otherwise then recommend activity "not-certify.Deny".
    end.
- otherwise then recommend activity "not-certify.Deny".
` + DETERMINATION_ACTIVITIES;

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
- result is "Coverage Determination" is "certify.Approve".

case "diagnosis + failed physical therapy -> approve (inference: either representation)":
- subject is "Sample Patient".
- fact is "Diagnosis Finding".
- fact is "Physical Therapy Failure".
- result is "Coverage Determination" is "certify.Approve".

case "diagnosis but no conservative-therapy failure -> deny (criterion-2 node otherwise)":
- subject is "Sample Patient".
- fact is "Diagnosis Finding".
- result is "Coverage Determination" is "not-certify.Deny".

case "no qualifying diagnosis -> deny (criterion-1 node otherwise)":
- subject is "Sample Patient".
- result is "Coverage Determination" is "not-certify.Deny".
`;


/**
 * Canonical PRIOR-AUTHORIZATION exemplar (#134) — distinct from the CDS
 * `decision-reference` (which ORDERs a service via `CPGServiceRequest`). Here the
 * payer COMMUNICATES a coverage determination via configured `<category>.<key>` local
 * activities (validated against `crl.dispositions`). This exemplar shows the
 * certify/not-certify baseline; a non-final `pended` leaf is legitimate only in embedded
 * mode. A single local criterion keeps the focus on the determination pattern; a real
 * policy authors its DISTINCT criteria as decision-tree nodes (see criteria-decision-reference).
 */
export const PA_DETERMINATION_REFERENCE_CRL = `# PA Determination Reference — Coverage Determination (Stage 1 PA exemplar)
library "PA Determination Reference".

/*
The canonical PRIOR-AUTHORIZATION exemplar — distinct from the CDS decision-reference (which
ORDERs a service via CPGServiceRequest). Here the payer COMMUNICATES a coverage determination:
certify (X12 HCR01 A1) / not-certify (A3), via configured \`<category>.<key>\` local activities
(validated against crl.dispositions — no shared library). This exemplar uses the certify/not-certify
baseline; a deployment configures further keyed flavors. A non-final pended (A4) leaf is legitimate
only in embedded mode. A single local criterion is shown; a real policy authors its DISTINCT
criteria as decision-tree nodes (see criteria-decision-reference).
*/

// (illustrative placeholder criterion — a real policy decomposes its stated criteria;
// here a single local leaf keeps the focus on the determination pattern)
concept "Has Qualifying Diagnosis":
- type is Condition.
- code is \`qualifying-diagnosis\`.

decision "Coverage Determination":
first:
- when "Has Qualifying Diagnosis" then recommend activity "certify.Approve".
- otherwise then recommend activity "not-certify.Deny".
` + DETERMINATION_ACTIVITIES;

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
- result is "Coverage Determination" is "certify.Approve".

case "no qualifying diagnosis -> deny (otherwise)":
- subject is "Sample Patient".
- result is "Coverage Determination" is "not-certify.Deny".
`;

/**
 * Worked exemplar B — SOURCE-REQUIRED delegation (kit teaching §2/§5-B). The source NAMES a separate
 * determination ("per the Continuation-of-Therapy protocol") → the policy CHAINS to it with a bare,
 * same-library `use decision`. This is NOT DRY/reuse factoring — chaining is faithful ONLY because the
 * source draws the determination boundary. The chained sub renders its OWN disposition (Approve/Deny
 * meaningful alone). One parent + one delegated sub.
 *
 * Proof note (§4): the bare same-library `use decision` IS evaluated by the CRE — it RECURSES the sub in
 * place and the sub's determination BUBBLES UP into `produced` (#166); the bare sub-NAME is never produced.
 * So the `result is` oracle names the DELEGATED disposition (Approve/Deny), not the sub-decision name. The
 * delegated-path cases assert the PATH via the run trace (the `when "Continuation Request"` action child is
 * the `use decision` node), not the disposition alone — a sub's `otherwise` Deny and the parent's `otherwise`
 * Deny are indistinguishable by membership (§4-req1).
 */
export const SOURCE_DELEGATED_DECISION_REFERENCE_CRL = `# Source-Delegated Decision Reference — source-required \`use decision\` delegation (Stage 1)
library "Source Delegated Decision Reference".

/*
Worked exemplar B: DO chain — because the SOURCE delegates. The policy narrative names a SEPARATE,
delegated determination ("for a continuation request, apply the Continuation-of-Therapy determination"),
so the encoding CHAINS to it with a BARE, same-library \`use decision\`. This is the ONLY faithful reason
to chain: the source draws the determination boundary.
It is NOT DRY/reuse/readability factoring (that INVENTS a boundary — see the chaining-necessity rule).

The delegated sub renders its OWN disposition (Approve/Deny, each meaningful standalone). The CRE evaluates
a bare same-library \`use decision\` by RECURSING the sub in place; its determination BUBBLES UP, so the
\`result is\` oracle names the DELEGATED disposition (Approve / Deny), not the sub-decision NAME. One parent
determination + one delegated sub.
*/

concept "Continuation Request":
- type is Condition.
- code is \`continuation-request\`.
concept "Demonstrated Response":
- type is Observation.
- code is \`demonstrated-response\`.
concept "Clinically Indicated":
- type is Condition.
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
- code is "http://example.org/local|continuation-request".
- date is "2026-01-01".
- defined by "Source Delegated Decision Reference"."Continuation Request".

fact "Demonstrated Response Finding":
- code is "http://example.org/local|demonstrated-response".
- date is "2026-01-01".
- defined by "Source Delegated Decision Reference"."Demonstrated Response".

fact "Clinically Indicated Finding":
- code is "http://example.org/local|clinically-indicated".
- date is "2026-01-01".
- defined by "Source Delegated Decision Reference"."Clinically Indicated".

case "continuation + demonstrated response -> approve via delegated sub":
- subject is "Sample Patient".
- fact is "Continuation Request Finding".
- fact is "Demonstrated Response Finding".
- result is "Coverage Determination" is "certify.Approve".

case "continuation, no response -> deny via delegated sub otherwise":
- subject is "Sample Patient".
- fact is "Continuation Request Finding".
- result is "Coverage Determination" is "not-certify.Deny".

case "clinically indicated (no continuation) -> approve in parent":
- subject is "Sample Patient".
- fact is "Clinically Indicated Finding".
- result is "Coverage Determination" is "certify.Approve".

case "neither -> deny in parent otherwise":
- subject is "Sample Patient".
- result is "Coverage Determination" is "not-certify.Deny".
`;

/**
 * Worked exemplar C — DISPOSITION-ARBITRATION (kit teaching §1-refinement / §5-C / §6). VERIFIED GREEN 6/6
 * including the two load-bearing overlap cases. The TEMPTING-but-DON'T-chain case: ONE determination with
 * MULTIPLE OVERLAPPING qualifying pathways + a PRECEDENCE among outcome categories + fall-through. A KE is
 * tempted to factor it into chained sub-decisions, but the source draws NO determination boundary → it is
 * ONE determination. The faithful, provable refinement (at scale): compute the precedence in the INFERENCE
 * layer — make the FINAL-* concepts pairwise-disjoint via \`sem-not\` complement-guards, carry them as flat
 * \`when\` siblings, and RE-EXPOSE the approve criteria as visible nodes (#168-clean). Uses only kit-in-scope
 * inference; NO \`use decision\`. The two denies use DISTINCT activities (not-certify.Deny vs not-certify.EIU) so \`result is\`
 * can distinguish them (§4-req1). Verbatim from the KE deliverable (green: validate_crl/validate_cel clean,
 * run_decision 6/6). NOTE: this is an AT-SCALE option — for a few pathways the plain nested tree is simpler.
 */
export const DISPOSITION_ARBITRATION_REFERENCE_CRL = `# Disposition-Arbitration Reference — overlapping qualifying pathways with outcome precedence (Stage 1)
library "Disposition Arbitration Reference".

/*
WORKED EXAMPLE for the kit. Source structure: ONE determination, with MULTIPLE OVERLAPPING qualifying
pathways, and a PRECEDENCE among outcome categories (Approve > within-indication Deny > off-indication
EIU), with fall-through. This is the DISPOSITION-ARBITRATION model.

WHEN this model is faithful: the source presents ONE determination whose outcome categories have a
precedence over an OVERLAPPING population. It is NOT the model when the source presents SEPARATE
sub-determinations that compose — that is \`use decision\` (a distinct primitive; provability is a
separate axis from faithfulness).

HOW it works: the precedence is computed in the INFERENCE layer. The FINAL-* concepts are made
pairwise-DISJOINT by \`sem-not\` complement-guards (Approve = no guard, highest; Deny carries ¬Approve;
EIU carries ¬Approve ∧ ¬Deny = the complement). Carried as the top-level \`when\` siblings, the
disjointness means flat siblings cannot mis-fire — no "overlap pop". The clinical CRITERIA stay
VISIBLE \`when\` nodes under the Approve branch (#168-clean: the cockpit shows which criterion drove the
approval); the inference layer only ARBITRATES which outcome category wins, it does not HIDE criteria.
Provable TODAY: \`defined as\`/\`sem-not\` is CRE-evaluated (#126); no \`use decision\` needed.

OVERLAP ORACLE (load-bearing): a patient who satisfies BOTH indications but fails ONE pathway's
criteria still APPROVES via the OTHER pathway — the failure does not pop to a deny.
*/

// ===== Clinical criteria (local case-features; visible decision nodes) =====
concept "Has Indication X":
- type is Condition.
- code is \`indication-x\`.
concept "Failed Standard Therapy":
- type is Observation.
- code is \`failed-standard-therapy\`.
concept "Has Indication Y":
- type is Condition.
- code is \`indication-y\`.
concept "Has Severe Markers":
- type is Observation.
- code is \`severe-markers\`.

// ===== Pathway gates (INFERENCE: each pathway's full conjunction -> one fact; arbitration inputs) =====
concept "Indication X Pathway Qualifies":
- defined as ( "Has Indication X" sem-and "Failed Standard Therapy" ).
concept "Indication Y Pathway Qualifies":
- defined as ( "Has Indication Y" sem-and "Has Severe Markers" ).
concept "Any Covered Indication":
- defined as ( "Has Indication X" sem-or "Has Indication Y" ).

// ===== Outcome arbitration (pairwise-DISJOINT via sem-not; precedence Approve > Deny > EIU) =====
concept "Final Approve":
- defined as ( "Indication X Pathway Qualifies" sem-or "Indication Y Pathway Qualifies" ).
concept "Final Deny":
- defined as ( "Any Covered Indication" sem-and sem-not "Final Approve" ).
concept "Final Experimental":
- defined as ( sem-not "Final Approve" sem-and sem-not "Final Deny" ).

// ===== Decision: flat FINAL-* siblings; APPROVE criteria re-exposed as visible nodes (#168-clean) =====
decision "Coverage Determination":
first:
- when "Final Approve" then:
  all:
  - when "Has Indication X" then:
    - when "Failed Standard Therapy" then recommend activity "certify.Approve".
    end.
  - when "Has Indication Y" then:
    - when "Has Severe Markers" then recommend activity "certify.Approve".
    end.
  end.
- when "Final Deny" then recommend activity "not-certify.Deny".
- when "Final Experimental" then recommend activity "not-certify.EIU".
- otherwise then recommend activity "not-certify.Deny".
` + DETERMINATION_ACTIVITIES_WITH_EIU;

export const DISPOSITION_ARBITRATION_REFERENCE_CEL = `# Disposition-Arbitration Reference — cases (Stage 1)
library "Disposition Arbitration Reference Cases".
covers "Disposition Arbitration Reference".

/*
Exercises the arbitration: each pathway alone (approve), BOTH overlap cases (a both-indication patient
who fails one pathway still approves via the other — the load-bearing "no overlap-pop" oracle),
within-indication failure (Deny), and off-indication (Deny EIU). The two overlap cases are what a flat
sibling tree WITHOUT the sem-not arbitration would get wrong (first-match would deny on the failed
pathway).
*/

fact "Sample Patient":
- name is "Sample Patient".
- birth date is "1970-01-01".
- defined by "Patient".

fact "Indication X Finding":
- code is "http://example.org/local|indication-x".
- date is "2026-01-01".
- defined by "Disposition Arbitration Reference"."Has Indication X".

fact "Failed Standard Therapy Finding":
- code is "http://example.org/local|failed-standard-therapy".
- date is "2026-01-01".
- defined by "Disposition Arbitration Reference"."Failed Standard Therapy".

fact "Indication Y Finding":
- code is "http://example.org/local|indication-y".
- date is "2026-01-01".
- defined by "Disposition Arbitration Reference"."Has Indication Y".

fact "Severe Markers Finding":
- code is "http://example.org/local|severe-markers".
- date is "2026-01-01".
- defined by "Disposition Arbitration Reference"."Has Severe Markers".

case "X pathway qualifies -> approve":
- subject is "Sample Patient".
- fact is "Indication X Finding".
- fact is "Failed Standard Therapy Finding".
- result is "Coverage Determination" is "certify.Approve".

case "Y pathway qualifies -> approve":
- subject is "Sample Patient".
- fact is "Indication Y Finding".
- fact is "Severe Markers Finding".
- result is "Coverage Determination" is "certify.Approve".

case "OVERLAP: both indications, X-pathway fails (no failed-standard) -> approve via Y":
- subject is "Sample Patient".
- fact is "Indication X Finding".
- fact is "Indication Y Finding".
- fact is "Severe Markers Finding".
- result is "Coverage Determination" is "certify.Approve".

case "OVERLAP: both indications, Y-pathway fails (no severe markers) -> approve via X":
- subject is "Sample Patient".
- fact is "Indication X Finding".
- fact is "Failed Standard Therapy Finding".
- fact is "Indication Y Finding".
- result is "Coverage Determination" is "certify.Approve".

case "within-indication: X present but pathway fails, no Y -> Deny":
- subject is "Sample Patient".
- fact is "Indication X Finding".
- result is "Coverage Determination" is "not-certify.Deny".

case "off-indication: neither indication -> Deny EIU":
- subject is "Sample Patient".
- result is "Coverage Determination" is "not-certify.EIU".
`;

export const PATIENT_AGE_BOTH_REP_REFERENCE_CRL = `# Patient-Age Both-Representation Reference — the SOLE \`definition is\` exception (Stage 1)
library "Patient Age Reference".

/*
Patient-age BOTH-REPRESENTATION exemplar — the ONE sanctioned \`definition is\`
exception to Stage-1 "local \`code is\` only". The concept carries BOTH a \`code is\`
LOCAL age Observation AND a \`definition is age today at least <N> years\` live
compute over \`Patient.birthDate\`. The Inferred layer RECENCY-MERGES them: newest
of the local age Observation (\`Observation.issued\`) vs \`Patient.meta.lastUpdated\`
wins; indeterminate (\`lastUpdated\` absent) -> the session-fresh local-source wins.
\`Patient.birthDate\` is a genuine clinical record that can COMPUTE the age, which is
what earns the carve-out. AGE ONLY — do NOT generalize to other \`definition is\`
predicates. The \`at least <N>\` unit MUST be \`years\` (AgeAt() is in years).
*/

concept "Age 18 Or Older":
- type is Observation.
- value type is boolean.
- meta is \`@business-logic-deferred: the human-assert answer Observation for this age criterion must NOT persist beyond the client session (mechanism deferred — #190); the recency lattice treats it as session-fresh\`.
- code is \`age-18-or-older\`.
- definition is age today at least 18 years.

decision "Adult Eligibility Determination":
first:
- when "Age 18 Or Older" then recommend activity "Approve".
- otherwise then recommend activity "Deny".

activity "Approve":
- request CPGCommunicationRequest.
- with \`Eligibility: APPROVE / adult.\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`Eligibility: DENY / not an adult.\`.
`;
