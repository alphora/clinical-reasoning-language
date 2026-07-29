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
 * DECISION TREE — each criterion is its own `when` node (nesting = AND), and
 * criteria offered as ALTERNATIVES ("Failed Conservative Therapy" = failed drug OR
 * failed physical therapy — two SEPARATE events, so DISTINCT criteria) are a named
 * `criterion` gated by an `or`-guard, NOT a `defined as` composite (they are not one
 * fact recorded twice). Its CONTRAST — "Viral Suppression Documented" (ONE clinical
 * state attested two ways: a lab result OR a chart note) — is GENUINE rung-1 `defined as`
 * inference, riding the tree as a single-concept `when` node; it is the kit's ONE
 * end-to-end `defined as` exemplar, proving the sanctioned rung-1 construct emits and
 * runs in artifact context (#234 follow-up). The kit's unit test materializes this and
 * drives the real CRE over it (criterion-1 node, the criterion `or`-guard resolving on
 * either distinct criterion, and the `defined as` node resolving on either record). #234.
 */
export const CRITERIA_DECISION_REFERENCE_CRL = `# Criteria Decision Reference — coverage criteria as DECISION NODES (Stage 1)
library "Coverage Criteria Reference".

/*
Decision composition (combining the policy's DISTINCT criteria -> a determination)
lives in the DECISION TREE: each criterion is its own \`when\` node (nesting = AND).
"Failed Conservative Therapy" (failed drug therapy OR failed physical therapy) is a
named \`criterion\` gated by an \`or\`-guard: failed drug therapy and failed physical
therapy are two SEPARATE events (each can occur independently, so both may be present
at once) — DISTINCT criteria the policy offers as alternatives, NOT one fact recorded
two ways, so they are joined structurally, never fused with \`defined as\`/\`sem-or\`.

"Viral Suppression Documented" is the CONTRAST: ONE clinical STATE — this member's
viral suppression at the determination point — attested two ways (a lab result OR a
clinician's chart note; the two records may coexist, they still attest the ONE state).
THAT is rung-1 inference, so it is a \`defined as ( ... sem-or ... )\` over the two
records and rides the tree as a single-concept \`when\` node. The tell: one-state-attested
-two-ways -> \`defined as\`; separate independently-occurring events -> distinct criteria
(#234). NOTE: the three criteria here (qualifying diagnosis, failed conservative therapy,
documented viral suppression) are combined for PEDAGOGICAL CONTRAST — a distinct-criteria
or-guard beside a genuine rung-1 \`defined as\` — NOT as a clinically coherent policy. The
determination is a configured category.key local activity (certify.Approve /
not-certify.Deny), validated against crl.dispositions.
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
criterion "Failed Conservative Therapy":          // two DISTINCT criteria (SEPARATE events) -> decision-layer or-guard,
- when ( "Failed Drug Therapy" or "Failed Physical Therapy" ).  // NOT a \`defined as\` composite (not one fact recorded twice)

concept "Viral Load Below Threshold Lab Result":
- type is Observation.
- code is \`viral-load-lab\`.
concept "Viral Suppression Charted By Clinician":
- type is Observation.
- code is \`viral-suppression-charted\`.
concept "Viral Suppression Documented":           // ONE clinical state attested two ways (lab OR chart note) -> GENUINE
- defined as ( "Viral Load Below Threshold Lab Result" sem-or "Viral Suppression Charted By Clinician" ).  // rung-1 \`defined as\`, NOT distinct criteria

decision "Coverage Determination":                 // criteria are nested \`when\` NODES (nesting = AND)
first:
- when "Has Qualifying Diagnosis" then:
    first:
    - when ( "Failed Conservative Therapy" ) then:
        first:
        - when "Viral Suppression Documented" then recommend activity "certify.Approve".
        - otherwise then recommend activity "not-certify.Deny".
        end.
    - otherwise then recommend activity "not-certify.Deny".
    end.
- otherwise then recommend activity "not-certify.Deny".
` + DETERMINATION_ACTIVITIES;

export const CRITERIA_DECISION_REFERENCE_CEL = `# Criteria Decision Reference — cases (Stage 1)
library "Coverage Criteria Reference Cases".
covers "Coverage Criteria Reference".

/*
Each case exercises a decision NODE: criterion-1 (\`when[0]\`), criterion-2
(\`when[0]/when[0]\` — the failed-conservative-therapy or-guard, a nested NODE, not a
composite), and criterion-3 (\`when[0]/when[0]/when[0]\` — the viral-suppression
\`defined as\` node). The two approve cases prove the criterion-2 guard resolves on
EITHER distinct criterion (failed drug OR failed physical therapy independently) AND
that the criterion-3 \`defined as\` resolves on EITHER record (lab OR chart note) of the
one occurrence; the no-viral-suppression case proves the \`defined as\` node denies when
neither record is present.
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

fact "Viral Load Lab Result":
- code is "http://example.org/local|viral-load-lab".
- date is "2026-01-01".
- defined by "Coverage Criteria Reference"."Viral Load Below Threshold Lab Result".

fact "Viral Suppression Chart Note":
- code is "http://example.org/local|viral-suppression-charted".
- date is "2026-01-01".
- defined by "Coverage Criteria Reference"."Viral Suppression Charted By Clinician".

case "diagnosis + failed drug therapy + viral suppression (lab record) -> approve":
- subject is "Sample Patient".
- fact is "Diagnosis Finding".
- fact is "Drug Therapy Failure".
- fact is "Viral Load Lab Result".
- result is "Coverage Determination" is "certify.Approve".

case "diagnosis + failed physical therapy + viral suppression (chart record) -> approve (guard-or + defined-as either record)":
- subject is "Sample Patient".
- fact is "Diagnosis Finding".
- fact is "Physical Therapy Failure".
- fact is "Viral Suppression Chart Note".
- result is "Coverage Determination" is "certify.Approve".

case "diagnosis + failed conservative therapy but no documented viral suppression -> deny (defined-as node otherwise)":
- subject is "Sample Patient".
- fact is "Diagnosis Finding".
- fact is "Drug Therapy Failure".
- result is "Coverage Determination" is "not-certify.Deny".

case "diagnosis + viral suppression but no conservative-therapy failure -> deny (criterion-2 node otherwise)":
- subject is "Sample Patient".
- fact is "Diagnosis Finding".
- fact is "Viral Load Lab Result".
- result is "Coverage Determination" is "not-certify.Deny".

case "no qualifying diagnosis -> deny (criterion-1 node otherwise)":
- subject is "Sample Patient".
- fact is "Drug Therapy Failure".
- fact is "Viral Load Lab Result".
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
 * Worked exemplar C — DISPOSITION-ARBITRATION (kit teaching §5-C / §6). VERIFIED GREEN 6/6 including the two
 * load-bearing overlap cases. The TEMPTING-but-DON'T-chain case: ONE determination with MULTIPLE OVERLAPPING
 * qualifying pathways + a PRECEDENCE among outcome categories + fall-through. A KE is tempted to factor it into
 * chained sub-decisions, but the source draws NO determination boundary → it is ONE determination. Faithful form
 * (CRL #224 — structure, not inference): each pathway a sibling \`when\` gated on its FULL conjunction as a
 * COMPOUND BRANCH GUARD, the Approve > Deny > EIU precedence carried by \`first:\` branch ORDER, the residual by
 * \`otherwise\` — every criterion a visible guard atom, partial matches fall through (no trap), NO \`use decision\`
 * and NO \`sem-not\` inference-layer arbitration. The two denies use DISTINCT activities (not-certify.Deny vs
 * not-certify.EIU) so \`result is\` can distinguish them (§4-req1). The frozen \`.cel\` truth function is UNCHANGED
 * from the pre-#224 \`sem-not\` form (run_decision 6/6); this artifact RE-GROUNDS that form to the decision layer —
 * the \`sem-not\` FINAL-* arbitration was the single-concept-\`when\`-era workaround the decision layer now subsumes.
 */
export const DISPOSITION_ARBITRATION_REFERENCE_CRL = `# Disposition-Arbitration Reference — overlapping qualifying pathways with outcome precedence (Stage 1)
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
fails one pathway still approves via the other — no "overlap pop". Every clinical criterion stays a
VISIBLE guard atom in the emitted PlanDefinition (each pathway's \`condition[]\` shows which criteria
drove it) — #168-clean by construction.

This REPLACES the pre-#224 form, which computed the precedence in the INFERENCE layer via
pairwise-disjoint \`sem-not\` FINAL-* concepts (Deny = ¬Approve, EIU = the complement) — an inference
workaround for the era when a \`when\` could take only a SINGLE concept, so a conjunction had to live in
\`defined as\` and disjointness had to be manufactured to keep flat siblings safe. The decision layer now
subsumes it: \`first:\` gives precedence, the compound guard gives the conjunction. The truth function is
UNCHANGED — the frozen cases below pass identically.

OVERLAP ORACLE (load-bearing): a patient who satisfies BOTH indications but fails ONE pathway's
criteria still APPROVES via the OTHER pathway — the failure does not pop to a deny. The oracle asserts
WHICH outcome wins (the EXACT disposition under \`first:\`), so a precedence inversion would FAIL it —
"a disposition fired" is not enough.
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

// ===== Decision: sibling compound-guard pathways; precedence = first: branch ORDER (CRL #224) =====
// Each pathway is gated on its FULL conjunction as a compound branch guard, so a PARTIAL match falls
// THROUGH to the next branch (no trap); the Approve > Deny > EIU precedence is the branch ORDER; every
// clinical criterion stays a VISIBLE guard atom in the emitted PlanDefinition (#168-clean by
// construction). No \`defined as\` composite and no \`sem-not\` arbitration — decision precedence lives
// in the decision layer.
decision "Coverage Determination":
first:
- when ( "Has Indication X" and "Failed Standard Therapy" ) then recommend activity "certify.Approve".
- when ( "Has Indication Y" and "Has Severe Markers" ) then recommend activity "certify.Approve".
- when ( "Has Indication X" or "Has Indication Y" ) then recommend activity "not-certify.Deny".
- otherwise then recommend activity "not-certify.EIU".
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
