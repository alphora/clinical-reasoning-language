/**
 * Canonical Stage-1 reference artifacts for the authoring kit.
 *
 * With ONE exception (below), these constants are the SINGLE SOURCE OF TRUTH for the
 * kit's worked examples. They are embedded as TS string constants (NOT `.crl`/`.cel`
 * files) because the npm package and the VSIX ship `dist/**` only — a source-tree
 * `.crl` would not be present at runtime for the MCP consumers. Each artifact carries a
 * `verification` tier, and the kit's unit test enforces each tier's in-repository FLOOR
 * (see the payload `verificationLegend`): EVERY artifact is built + validator-clean;
 * a `cre-run` `.crl`+`.cel` pair is ADDITIONALLY executed through the CRE (the engine
 * behind `run_decision`) every build. An `engine-run` artifact only RECORDS a
 * point-in-time external-harness `$r5.apply` claim over its construct — the kit suite
 * does NOT re-run that, so `engine-run` is not proven here, only the validate floor is.
 * So the embedded text is proven to (or, for engine-run, recorded at) its declared tier,
 * never over-claimed past it.
 * (THE EXCEPTION — `REPRESENTATION_REFERENCE_CRL`: the CANONICAL source is the
 * `tests/fixtures/representation/mammogram-and-bmi.crl` FILE — which is ALSO the rule-B
 * positive exemplar, so it must stay a file — and this const is its SHIPPED MIRROR, kept
 * identical by a CRLF-normalized text-equality test. Edit the fixture; the const follows.)
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
- value type is boolean.
- type is Observation.
- code is \`hard-exclusion\`.

concept "Qualifying Indication":
- value type is boolean.
- type is Observation.
- code is \`qualifying-indication\`.

concept "Contrast Allergy":
- value type is boolean.
- type is Observation.
- code is \`contrast-allergy\`.

concept "Complex Case":
- value type is boolean.
- type is Observation.
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
- date is "2026-01-01".
- value is true.
- defined by "Imaging Coverage Reference"."Qualifying Indication".

fact "Exclusion Finding":
- date is "2026-01-01".
- value is true.
- defined by "Imaging Coverage Reference"."Hard Exclusion".

fact "Contrast Allergy Finding":
- date is "2026-01-01".
- value is true.
- defined by "Imaging Coverage Reference"."Contrast Allergy".

fact "Complex Case Finding":
- date is "2026-01-01".
- value is true.
- defined by "Imaging Coverage Reference"."Complex Case".

// ⚠ NEGATIVE ANSWERS ARE NOT OPTIONAL under value-read semantics. A locally-coded boolean with a
// bare \`code is\` is a QUESTION: unanswered it is UNKNOWN, so the branch guarding on it can neither
// fire nor fall through and the decision PAUSES. Omitting "no hard exclusion" does not mean false; it
// means nobody has been asked. Every case below therefore answers each criterion on its path.

fact "No Hard Exclusion":
- date is "2026-01-01".
- value is false.
- defined by "Imaging Coverage Reference"."Hard Exclusion".

fact "No Contrast Allergy":
- date is "2026-01-01".
- value is false.
- defined by "Imaging Coverage Reference"."Contrast Allergy".

fact "Not A Complex Case":
- date is "2026-01-01".
- value is false.
- defined by "Imaging Coverage Reference"."Complex Case".

// ============ Cases ============

case "indication, no contraindication -> CT offered":
- description is \`Qualifying indication present, no contrast allergy and not a
  complex case: the menu offers MRI and CT; Refer To Specialist is guarded out.\`.
- subject is "Sample Patient".
- fact is "No Hard Exclusion".
- fact is "Indication Finding".
- fact is "No Contrast Allergy".
- fact is "Not A Complex Case".
- result is "Imaging Coverage" is "Order CT".

case "contrast allergy -> CT dropped, MRI still offered":
- description is \`Contrast allergy contraindicates CT (unless drops it); MRI is
  always offered, so the menu still produces MRI.\`.
- subject is "Sample Patient".
- fact is "No Hard Exclusion".
- fact is "Indication Finding".
- fact is "Contrast Allergy Finding".
- fact is "Not A Complex Case".
- result is "Imaging Coverage" is "Order MRI".

case "complex case -> specialist referral offered":
- description is \`A complex case enables the only-when-guarded specialist
  referral option.\`.
- subject is "Sample Patient".
- fact is "No Hard Exclusion".
- fact is "Indication Finding".
- fact is "No Contrast Allergy".
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
- value type is boolean.
- type is Observation.
- code is \`qualifying-diagnosis\`.

concept "Failed Drug Therapy":
- value type is boolean.
- type is Observation.
- code is \`failed-drug-therapy\`.
concept "Failed Physical Therapy":
- value type is boolean.
- type is Observation.
- code is \`failed-physical-therapy\`.
criterion "Failed Conservative Therapy":          // two DISTINCT criteria (SEPARATE events) -> decision-layer or-guard,
- when ( "Failed Drug Therapy" or "Failed Physical Therapy" ).  // NOT a \`defined as\` composite (not one fact recorded twice)

concept "Viral Load Below Threshold Lab Result":
- value type is boolean.
- type is Observation.
- code is \`viral-load-lab\`.
concept "Viral Suppression Charted By Clinician":
- value type is boolean.
- type is Observation.
- code is \`viral-suppression-charted\`.
concept "Viral Suppression Documented":           // ONE clinical state attested two ways (lab OR chart note) -> GENUINE
- value type is boolean.
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
- date is "2026-01-01".
- value is true.
- defined by "Coverage Criteria Reference"."Has Qualifying Diagnosis".

fact "No Qualifying Diagnosis":
- date is "2026-01-01".
- value is false.
- defined by "Coverage Criteria Reference"."Has Qualifying Diagnosis".

fact "Drug Therapy Failure":
- date is "2026-01-01".
- value is true.
- defined by "Coverage Criteria Reference"."Failed Drug Therapy".

fact "Physical Therapy Failure":
- date is "2026-01-01".
- value is true.
- defined by "Coverage Criteria Reference"."Failed Physical Therapy".

// #189 null/pause — "the patient did NOT fail therapy" is now something you STATE, not something you get by
// omitting the fact. Omission means UNKNOWN (nothing established it and nothing can compute it), which makes
// the gate pause and ask. An explicit \`value is false\` is the answer "no".
fact "No Drug Therapy Failure":
- date is "2026-01-01".
- value is false.
- defined by "Coverage Criteria Reference"."Failed Drug Therapy".

fact "No Physical Therapy Failure":
- date is "2026-01-01".
- value is false.
- defined by "Coverage Criteria Reference"."Failed Physical Therapy".

fact "Viral Load Lab Result":
- date is "2026-01-01".
- value is true.
- defined by "Coverage Criteria Reference"."Viral Load Below Threshold Lab Result".

fact "Viral Suppression Chart Note":
- date is "2026-01-01".
- value is true.
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
- fact is "No Drug Therapy Failure".
- fact is "No Physical Therapy Failure".
- result is "Coverage Determination" is "not-certify.Deny".

case "no qualifying diagnosis -> deny (criterion-1 node otherwise)":
- subject is "Sample Patient".
- fact is "No Qualifying Diagnosis".
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
- value type is boolean.
- type is Observation.
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
- value type is boolean.
- type is Observation.
- code is \`continuation-request\`.
concept "Demonstrated Response":
- value type is boolean.
- type is Observation.
- code is \`demonstrated-response\`.
concept "Clinically Indicated":
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
- value type is boolean.
- type is Observation.
- code is \`indication-x\`.
concept "Failed Standard Therapy":
- value type is boolean.
- type is Observation.
- code is \`failed-standard-therapy\`.
concept "Has Indication Y":
- value type is boolean.
- type is Observation.
- code is \`indication-y\`.
concept "Has Severe Markers":
- value type is boolean.
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
- result is "Coverage Determination" is "certify.Approve".

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
`;

export const PATIENT_AGE_BOTH_REP_REFERENCE_CRL = `# Patient-Age Both-Representation Reference — the local override + Patient age \`source representation\`
library "Patient Age Reference".

/*
Patient-age BOTH-REPRESENTATION exemplar. A concept carries BOTH a \`code is\`
LOCAL age Observation AND a Patient age \`source representation\` — a posrep over
\`Patient.birthDate\` whose \`value projection is age today <cmp> <N> years\` computes
the live age (#257: patient age migrated here from the retired \`definition is age today\` form,
which is now an author-time + emit error).
The Inferred layer RECENCY-MERGES the two: newest of the local age Observation
(\`Observation.effective\`) vs \`Patient.meta.lastUpdated\` wins; indeterminate
(\`lastUpdated\` absent) -> the session-fresh local-source wins. The recency timestamp is
an INVARIANT of the built Patient age projection, NOT authored (no \`recency is\` keyword).
AGE ONLY — the ONLY projection with a built emit-lowering is \`age today\`; an \`age today\`
projection with a bad comparator/unit/carrier is tool-rejected (any OTHER projection phrase
parses + validates but is runtime-deferred, OUT of scope by rule — not tool-rejected). This is a
2-representation concept in the MODEL sense — ONE authored \`source representation\` block PLUS
one local \`code is\` producer — NOT two \`source representation\` blocks (a second age posrep is
rejected). A STANDALONE age (no local override — see the \`representation-reference\` exemplar) is
just the \`source representation\` with no \`code is\`; the recency merge applies ONLY when the
local \`code is\` arm is present.

COMPARATORS + UNITS (#215, #257 T2): the comparator is a LOWER bound \`at least <N>\` (>=) or an
UPPER bound \`at most <N>\` (<=, inclusive) / \`under <N>\` / \`younger than <N>\` (<, exclusive), and
the unit is \`years\` OR \`months\` — \`days\`/\`weeks\` are a hard error. Years compute via \`AgeAt()\`
(whole years), months via \`AgeInMonths()\` (whole months); both truncate, so \`at most N\` ≡
\`under N+1\` in the chosen unit (a pediatric "under 21" gate is \`under 21\`, an infant "under 6
months" gate is \`under 6 months\`). The upper bounds are the engine-verified alternative to the
INCORRECT \`sem-not "Age N Or Older"\` complement. The exact closed-world cell: with NO usable
\`Patient.birthDate\` AND no local age assertion, the concept is FALSE (deny) — unlike \`sem-not\`,
MISSING evidence does not become TRUE (a session-fresh local TRUE assertion still wins via
recency; the recency arbitration is unit-independent).
*/

concept "Age 18 Or Older":
- value type is boolean.
- meta is \`@business-logic-deferred: the human-assert answer Observation for this age criterion must NOT persist beyond the client session (mechanism deferred — #190); the recency lattice treats it as session-fresh\`.
- type is Observation.
- code is \`age-18-or-older\`.
- source representation:
  - type is Patient.
  - value element is Patient.birthDate.
  - value type is date.
  - value projection is age today at least 18 years.

// UPPER bound (#215) — the pediatric "under 21" gate as ONE positive concept, NOT the
// wrong \`sem-not "Age 21 Or Older"\` complement. Unknown age recency-merges to FALSE (deny).
concept "Patient Under Twenty One Years":
- value type is boolean.
- meta is \`@business-logic-deferred: the human-assert answer Observation for this age criterion must NOT persist beyond the client session (mechanism deferred — #190); the recency lattice treats it as session-fresh\`.
- type is Observation.
- code is \`under-21\`.
- source representation:
  - type is Patient.
  - value element is Patient.birthDate.
  - value type is date.
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
`;

/**
 * The multi-representation exemplar (Mammogram multi-source + BMI cascade), shipped as the
 * `representation-reference.crl` artifact (`verification: "validate-only"`). Its CANONICAL source is the
 * `tests/fixtures/representation/mammogram-and-bmi.crl` FILE (ALSO the rule-B positive exemplar); this const is
 * the SHIPPED MIRROR, kept identical by a CRLF-normalized text-equality test (edit the fixture; the const follows). FORWARD-LOOKING capability preview: it exercises constructs that PARSE + VALIDATE but are MOSTLY
 * runtime-deferred (the general external posrep #257; `defined as exists` #270; `definition is`
 * selection/count/within) — EXCEPT the standalone patient-age `value projection` (the #257 age slice: T1
 * recency + T2 months), which is runtime-SHIPPED in production. NOT a Stage-1 authoring license (see the kit
 * `boundary`); the value-preserving `sem-or` union + the standalone age `value projection` are the pieces it
 * teaches (a MISSING worked `sem-or` regenerated the "defined-as is boolean" misconception).
 */
export const REPRESENTATION_REFERENCE_CRL = `# Representation-model reference — Mammogram (multi-source) + BMI (cascade)
// Canonical \`concept-layer-model\` exemplar (authoring-kit). The v3 concept model, reconciled
// with both KE teams. FORWARD-LOOKING capability preview: it exercises constructs that PARSE +
// VALIDATE but are mostly runtime-DEFERRED (the general external posrep #257; \`defined as exists\`
// #270; \`definition is\` selection/count/within) — EXCEPT the patient-age \`value projection\` (the
// #257 age slice: T1 recency + T2 months) which RUNS. Shipped as \`verification: validate-only\` —
// NOT a Stage-1 authoring license (see the kit \`boundary\`); the value-preserving \`sem-or\` union +
// the standalone age \`value projection\` are the pieces to learn.
// NOTE: when the concept-form addressability clause lands, this header's discipline duplicates it
// and this artifact is byte-pinned — reconcile the two then (cite the clause; #257).
//
// ── Addressability discipline (split on ADDRESSABILITY, not provenance alone) ──────────────
// A \`source representation\` is an alternative SHAPE of ONE datum — not independently nameable.
// A \`sem-or\` operand is a CONCEPT — independently assertable and referenceable. So you SPLIT a
// concept into named sub-concepts only when a downstream query needs to NAME a subset; you do
// NOT split merely because the data came from different systems.
//   • "Height" — ONE source rep, NO split. Nobody needs "height via value set X" as a separate
//     fact, so there is nothing to name; a lone posrep suffices.
//   • "Mammogram" — SPLIT into "Clinical Mammogram" (performed: ImagingStudy/DiagnosticReport)
//     and "Administrative Mammogram" (billed: Claim/EoB). "Most recent CLINICAL mammogram" is a
//     real query, so the clinical subset must be nameable — hence two assertable concepts,
//     value-preservingly unioned by \`sem-or\` into a dateTime "Mammogram".
// Author self-check (DELETE TEST): delete a split; if nothing downstream loses the ability to
// NAME something, it should not have been split. This keeps (C) from becoming a cargo-cult
// "always split by provenance".
//
// The union is a WORKED \`sem-or\` over two dateTime concepts — value-preserving, NOT boolean.
// (\`sem-or\`/\`sem-and\`/bare \`defined as\` preserve the operands' value type; only \`defined as
// exists\` / a top-level \`sem-not\` are boolean.) Time-selection (\`most recent "Mammogram"\`) is
// valid because "Mammogram" is an instance-bearing dateTime, not a derived boolean.
library "Representation Examples".

// ============ Terminologies (external systems / value sets) ============
terminology "Mammogram VS":
- valueset is \`http://example.org/screening/ValueSet/mammogram\`.
terminology "Mammogram DiagnosticReport VS":
- valueset is \`http://example.org/screening/ValueSet/mammogram-dr\`.
terminology "Mammogram Billing VS":
- valueset is \`http://example.org/screening/ValueSet/mammogram-billing\`.
terminology "Height VS":
- valueset is \`http://example.org/vitals/ValueSet/height\`.
terminology "Weight VS":
- valueset is \`http://example.org/vitals/ValueSet/weight\`.
terminology "Clinical BMI":
- valueset is \`http://example.org/vitals/ValueSet/bmi\`.

// ============ Mammogram — split by ADDRESSABILITY (clinical vs administrative), source-rep-only ============
// The performed study: ImagingStudy/DiagnosticReport prove the study HAPPENED. Serviced-not-created,
// effective-not-issued (\`.issued\` lags the study and would corrupt a recency window).
concept "Clinical Mammogram":
- value type is dateTime.
- source representation:
  - type is ImagingStudy.
  - coded from "Mammogram VS".
- source representation:
  - type is DiagnosticReport.
  - coded from "Mammogram DiagnosticReport VS".

// The billed study: Claim/EoB prove it was BILLED (deniable/reversible; no findings). A distinct
// grade of evidence — payers distinguish them. Its own billing VS (CPT/HCPCS, not clinical codes).
concept "Administrative Mammogram":
- value type is dateTime.
- source representation:
  - type is Claim.
  - coded from "Mammogram Billing VS".
- source representation:
  - type is ExplanationOfBenefit.
  - coded from "Mammogram Billing VS".

// ============ Mammogram — locally coded (\`code is\`) + value-preserving \`sem-or\` union ============
concept "Mammogram":
- value type is dateTime.
- type is Observation.
- code is \`mammogram\`.
- defined as ( "Clinical Mammogram" sem-or "Administrative Mammogram" ).

// Two natural user-assertion points (assert at any level, ADR 0001 §8):
//   - assert the EVENT ("Mammogram") → flows to most-recent, count, up-to-date;
//   - assert the BOOLEAN ("Up To Date On Mammography") → directly answers the screening question.
concept "Had Mammogram":
- value type is boolean.
- type is Observation.
- code is \`had-mammogram\`.
- defined as exists ("Mammogram").

concept "Most Recent Mammogram":
- value type is dateTime.
- definition is most recent "Mammogram".

concept "Mammograms In Last Six Months":
- value type is integer.
- definition is count of "Mammogram" within last 6 months.

concept "Up To Date On Mammography":
- value type is boolean.
- type is Observation.
- code is \`up-to-date-on-mammography\`.
- definition is "Most Recent Mammogram" within last 27 months.

// ============ BMI cascade — Height (no split) contrasts with Mammogram (split) ============
concept "Height":
- value type is Quantity.
- type is Observation.
- code is \`height\`.
- source representation:
  - type is Observation.
  - coded from "Height VS".

concept "Weight":
- value type is Quantity.
- type is Observation.
- code is \`weight\`.
- source representation:
  - type is Observation.
  - coded from "Weight VS".

concept "BMI":
- value type is Quantity.
- type is Observation.
- code is \`bmi\`.
- definition is body mass index of "Weight" and "Height".
- source representation:
  - type is Observation.
  - coded from "Clinical BMI".

concept "High BMI":
- value type is boolean.
- type is Observation.
- code is \`high-bmi\`.
- definition is "BMI" at least 30 'kg/m2'.

// ============ Patient age — the one sanctioned \`value projection\` posrep (standalone, months) ============
// A STANDALONE age determination: the Patient age \`source representation\` ALONE (no local \`code is\`),
// so the determination IS the live projection over \`Patient.birthDate\`. \`value projection\` is the
// rep-level COMPUTATION — the sole one with a built emit-lowering is \`age today\` (#257 T1; T2 added
// the \`months\` unit alongside \`years\`); an \`age today\` projection with a bad comparator/unit/carrier
// is tool-rejected (other projection phrases parse but are runtime-deferred, not rejected). Recency
// applies ONLY when a local \`code is\` override is also present (see the patient-age recency
// exemplar); this standalone form has none.
concept "Patient Under Six Months":
- value type is boolean.
- source representation:
  - type is Patient.
  - value projection is age today under 6 months.
`;
