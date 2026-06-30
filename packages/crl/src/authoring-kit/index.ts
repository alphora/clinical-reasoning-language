/**
 * `authoring_kit` — the self-contained authoring knowledge a fresh-context KE
 * agent needs to encode one Stage-1 (local-decision-support) artifact, served
 * over MCP (no filesystem access to this repo required).
 *
 * Design (see .vibe-tools/discussions/084): the type vocabularies are imported
 * from the generated grammar wrappers (source of truth — they can't drift); the
 * prose rules are anchored to docs/validator rule-names; every example and the
 * reference artifacts are validated by the unit test (no unverified CRL ships);
 * `contentHash` is derived so the kit's identity can't lie.
 */
import { createHash } from "node:crypto";

import { activityTypes } from "../grammar/activityTypes";
import { conceptTypes } from "../grammar/conceptTypes";
import { conceptValueTypes } from "../grammar/conceptValueTypes";

import {
  CRITERIA_DECISION_REFERENCE_CEL,
  CRITERIA_DECISION_REFERENCE_CRL,
  DECISION_REFERENCE_CEL,
  DECISION_REFERENCE_CRL,
  DISPOSITION_ARBITRATION_REFERENCE_CEL,
  DISPOSITION_ARBITRATION_REFERENCE_CRL,
  MEDICAL_POLICY_DETERMINATION_CRL,
  PA_DETERMINATION_REFERENCE_CEL,
  PA_DETERMINATION_REFERENCE_CRL,
  SOURCE_DELEGATED_DECISION_REFERENCE_CEL,
  SOURCE_DELEGATED_DECISION_REFERENCE_CRL,
} from "./reference";
import type {
  AuthoringKit,
  AuthoringStage,
  ConceptLayerEntry,
  ForceModel,
  JudgeLens,
  KitExample,
  KitRule,
  TypeAllowlist,
  VerifyLoop,
} from "./types";

export type { AuthoringKit, AuthoringStage } from "./types";

// "1.0" → "1.1": additive shape change — the `judgeLens` field (the waiver-adjudication rubric) joins the kit.
// "1.1" → "1.2": SHAPE change for the KE decision-composition teaching package (§0–§4) — four additions:
//   (1) `forceModel` (the §0 force levels — read first); (2) per-rule `clauses` (the machine-readable
//   default/invariant/validator-enforced force breakdown, each invariant clause carrying a RESOLVABLE `test`);
//   (3) a SECOND judge-lens family `judgeLens.composition` (the §2/§3 source-fidelity checks with no
//   mechanical home — invented-determination-boundary / hollowed-criteria / dropped-or-added-criterion); and
//   (4) `verifyLoop.methodologyRequirements` (the §4 durable per-policy checks an invariant `test` anchors to
//   via `verifyLoop:<id>`). All four ship together as the single 1.1→1.2 shape change.
// Sibling KE agents pin schemaVersion + contentHash and re-sync; the bump signals the new shape.
const SCHEMA_VERSION = "1.2";
export const DEFAULT_STAGE: AuthoringStage = "local-decision-support";
export const STAGES: readonly AuthoringStage[] = [DEFAULT_STAGE];

/** Where KE agents file gap-issues — the repo where the kit + tools are maintained. */
const FEEDBACK_URL = "https://github.com/alphora/clinical-reasoning-language/issues/new";

const SUMMARY =
  "Stage 1 — local-decision-support. Encode a clinical decision over LOCAL coded " +
  "case-features and prove it with CEL cases + the CRE oracle. Narrow (local `code is` " +
  "sources only) + shallow (asserted concepts + `defined as` inference over one concept's " +
  "representations; no " +
  "`definition is` predicates or external sources).";

/**
 * The FORCE model — kit teaching §0. How an agent must APPLY the rules. Read first. Every rule carries a
 * force at CLAUSE granularity because an agent that mechanically enforces an authoring PREFERENCE will revert
 * a human KE's deliberate, faithful refactor — destroying intent.
 */
const FORCE_MODEL: ForceModel = {
  summary:
    "A rule whose force VARIES by clause carries explicit `clauses` (a single rule may carry both a default and " +
    "an invariant clause — do not collapse them); a rule without `clauses` is uniformly its stated force (the " +
    "validator-enforced grammar/mechanics rules). The force tells the agent how hard to bind. It exists so an " +
    "agent that mechanically enforces an authoring PREFERENCE does not revert a human KE's deliberate, " +
    "faithful refactor. The force is operator-governed content, not agent-editable.",
  levels: [
    {
      level: "validator-enforced",
      meaning:
        "The grammar/validator rejects it (e.g. qualifier-required, guard-on-single-action). The agent need " +
        "not police; the tool does.",
    },
    {
      level: "invariant",
      meaning:
        "A FIDELITY-TO-SOURCE constraint (an ADD or a HOLLOW vs the policy narrative). Always enforced, on ANY " +
        "author's output, human or agent. Every invariant carries a `test` that RESOLVES to a real check — never " +
        '"looks wrong," and never a dangling/typo\'d anchor (a `test` pointing at nothing IS the K4 fake-green ' +
        "this guards against; the force-model test asserts every invariant's `test` resolves). The anchor names " +
        "the adjudication MODE: a `judgeLens.composition:<check>` (a §2/§3 source-fidelity judge call with no " +
        "mechanical home), or a `verifyLoop:<id>` methodology requirement (a structural check the KE applies per policy, §4).",
    },
    {
      level: "default",
      meaning:
        "Blank-slate generative guidance. A FAITHFUL override STANDS. The review/judge gate checks " +
        "faithfulness-to-source, NEVER conformance-to-this-default; so a faithful structure is never reverted " +
        "toward the default, and the agent need not know whether a human or an agent authored it.",
    },
  ],
  governingPrinciple:
    "Do not prefer the agent's default over a faithful human structure; do not prefer the human's structure " +
    "over the source. A human refactor is protected ONLY when faithful — an unfaithful one (invents a " +
    "determination boundary, hides distinct criteria, drops a criterion, fakes green) is flagged even if " +
    "deliberate. Authoring agents editing an existing artifact must NOT re-normalize faithful surrounding " +
    "structure to their defaults.",
};

const CONCEPT_LAYER_MODEL: ConceptLayerEntry[] = [
  {
    form: "- code is `local-code`.",
    meaning: "Query to the LOCAL source using local domain codes. The asserted layer. The ONLY concept form in this stage.",
    scope: "in",
  },
  {
    form: '- source representation: - coded from "Value Set".',
    meaning: "Query to an EXTERNAL source / value set (standardized codes). Asserted, external.",
    scope: "out",
  },
  {
    form: "- defined as ( ... sem-and / sem-or / sem-not ... ).",
    meaning:
      "INFERENCE / semantic normalization: combines the sub-representations or data-components of ONE concept into ONE clinical fact (the only added depth this stage; #126). It is NOT decision composition and NEVER combines distinct decision criteria — that is the decision tree's job (#168). run_decision evaluates it: sem-and = all, sem-or = any, sem-not = not (closed-world). Bare operands resolve within the defining library; cross-library operands must be qualified.",
    scope: "in",
  },
  {
    form: "- definition is <predicate>.",
    meaning: "A predicate (most recent / count within / temporal / value). The INFERRED layer — computes over a source.",
    scope: "out",
  },
];

const RULES: KitRule[] = [
  {
    id: "concept-form",
    category: "concept-model",
    rule: "Stage-1 leaf concepts carry `type is` + `code is` (local). A SINGLE criterion stated at a finer data-grain — multiple representations/components of ONE clinical fact — is normalized with `defined as` (INFERENCE) over named local leaves, drop-one-leaf testable (e.g. \"failed conservative therapy\" = failed drug OR physical therapy). The conjunction of DISTINCT criteria (a policy's \"ALL of the following are met\") is decision COMPOSITION and belongs in the decision TREE — each criterion a nested `when` node — NOT a `defined as` `Criteria Met` composite (see decision-composition). `defined as`/`sem-and`/`sem-or` NEVER joins distinct criteria. Still OUT this stage: `source representation`/`coded from` (external) and `definition is` predicates (count/temporal/value). The boundary is the concept FORM, not the type vocabulary: any FHIR type may be a local `code is` concept. `meta is` is optional.",
    why: "Local-source pass proves decision authoring (incl. one-concept `defined as` inference) before external sources and predicate inference are added; conflating inference with decision composition hides criteria from the decision (#168).",
    ref: "concept-layer-model; src/tests/fixtures/representation/mammogram-and-bmi.crl",
    clauses: [
      {
        text: "A Stage-1 leaf concept carries `type is` + `code is` (local); `source representation`/`coded from` (external) and `definition is` predicates are OUT this stage.",
        force: "default",
      },
      {
        text: "`defined as` is INFERENCE over the sub-representations/components of ONE concept (the §1 rung-1 unit). It NEVER joins a policy's DISTINCT criteria AS THE DECISION'S AUDIT SURFACE — combining distinct criteria is decision composition (the tree's job, §1 rung-2); collapsing them into a `defined as` composite gated as the SOLE branch (hiding which failed) is the #168 hollowing (see decision-composition). EXCEPTION — the disposition-arbitration refinement (§1, at scale) MAY compute pathway / FINAL-* ARBITRATION inputs in the inference layer over criteria, PROVIDED those criteria are RE-EXPOSED as visible `when` nodes so the audit surface is preserved (#168-clean; see disposition-arbitration-reference). The violation is HIDING criteria as the sole gate, not using inference to arbitrate outcome precedence.",
        force: "invariant",
        test: "judgeLens.composition:hollowed-criteria",
      },
    ],
  },
  {
    id: "interface-concept-naming",
    category: "concept-model",
    rule: "Name a concept a decision's `when` references (an INTERFACE concept — the case-feature the determination consumes) as an ASKABLE phrase: the FHIR emit forms the case-feature input PROMPT by appending '?' to the concept name (\"Patient Has Active Crohns Disease\" -> \"Patient Has Active Crohns Disease?\"), so a name that reads as a yes/no question yields a sensible DTR questionnaire prompt with no separate author field. SCOPE: the emit generates a case-feature StructureDefinition + a PlanDefinition `action.input` for a TOP-LAYER directly-asserted local concept only (a single `code is` LocalSource/boolean concept the `when` asserts directly). A `when` on a `defined as`/INFERRED condition does NOT yet generate the recursive leaf inputs — deferred (#180).",
    why: "The interface concept's NAME is the human prompt the DTR questionnaire renders; an askable name produces the prompt by emit convention (+'?') with no extra grammar. Top-layer-only is the current emit reality: a directly-asserted condition maps 1:1 to one case-feature input; an inferred condition needs a recursive input over its leaves (open design — #180).",
    ref: "#180; fhir-emitter case-feature + action.input",
  },
  {
    id: "decision-qualifiers",
    category: "decision-shape",
    rule: "A multi-branch decision must declare a qualifier: `first:` (ordered, first match wins — requires a trailing `otherwise`), `all:` (every matching branch fires), or `any:` (over actions only — offer alternatives). A `then:` body is closed by `end.`. A single-member block takes no qualifier.",
    ref: "docs/decision-shapes.md; validator rules qualifier-required / otherwise-required / any-over-branches / first-over-actions",
  },
  {
    id: "decision-composition",
    category: "decision-shape",
    rule: "The COMPOSITION LADDER (§1) — the primitive is decided by the UNIT you are combining: (rung 1) sub-representations of ONE criterion → `defined as` INFERENCE (sem-and/or/not, closed-world; see concept-form); (rung 2) DISTINCT criteria of ONE determination → the decision TREE (nested `when` = AND; sibling `when` under `first:`, each recommending the same disposition with `otherwise`, = OR; `otherwise` = NOT; `first:` = precedence); (rung 3) SEPARATE determinations the SOURCE delegates, OR a GENUINELY-SHARED determination reused across policies/pathways → chained `use decision` (see chaining-necessity — source-delegation OR genuine reuse, NOT fabricated coupling). The tree already expresses AND/OR/NOT, so \"I have boolean logic\" is NOT a chaining signal — almost all of it stays in ONE tree. (`any:` is over ACTIONS only — alternatives WITHIN one matched branch — NEVER an OR over `when` branches; see decision-qualifiers.) A `when` takes a SINGLE concept by design. Putting a policy's distinct-criteria conjunction in a `defined as` \"Criteria Met\" composite gated as the sole branch HIDES which criterion failed (#168) — author each criterion as its own (nested or sibling) `when` node (see criteria-decision-reference). The REVERSE — exposing ONE criterion's sub-representations AS `when` nodes (§3) — makes the audit surface MORE visible and is presumed-faithful: do NOT revert it. AT SCALE, when one determination has many OVERLAPPING pathways with outcome precedence + fall-through, the plain nested tree duplicates shared criteria; the disposition-arbitration refinement (compute precedence in the inference layer via pairwise-disjoint `sem-not` FINAL-* concepts carried as flat `when` siblings, approve criteria re-exposed as visible nodes — #168-clean, NO `use decision`) is an option (see disposition-arbitration-reference) — but for a FEW pathways the plain tree is simpler and equally faithful.",
    why: "The decision tree is the audit surface — a reviewer/cockpit must see WHICH criterion failed. `defined as`/sem-* is INFERENCE (one concept), not decision composition (the tree's job); conflating them hides criteria and was the #168 black-box failure (a fresh agent copied a `Criteria Met` composite → a decision with zero criterion nodes). The asymmetry (§3): hollowing distinct criteria INTO a composite is the violation; exposing one criterion's representations OUT to nodes is faithful.",
    ref: "docs/decision-shapes.md; criteria-decision-reference; disposition-arbitration-reference; chaining-necessity; #168",
    clauses: [
      {
        text: "Combine by the UNIT (§1 ladder): one criterion's representations → `defined as`; distinct criteria of one determination → the tree; separate source-delegated OR genuinely-shared/reused determinations → `use decision`. Boolean complexity alone is NOT a chaining signal.",
        force: "default",
      },
      {
        text: "Collapsing a policy's DISTINCT criteria into a `defined as` composite gated as the SOLE branch HIDES which criterion failed (#168) — author each as its own `when` node. Flag and revert even against a human.",
        force: "invariant",
        test: "judgeLens.composition:hollowed-criteria",
      },
      {
        text: "Exposing ONE criterion's sub-representations as `when` nodes (§3, inference→decision) is presumed-faithful — it makes the audit surface more visible. Do NOT revert it (caveat: flag only if it mis-casts what the source states as ONE criterion into several independent presented criteria).",
        force: "default",
      },
      {
        text: "The disposition-arbitration refinement (sem-not FINAL-* arbitration, flat siblings, approve criteria re-exposed) is an AT-SCALE option for many overlapping pathways with precedence + fall-through; for a few pathways the plain nested tree is simpler and equally faithful.",
        force: "default",
      },
    ],
  },
  {
    id: "chaining-necessity",
    category: "decision-shape",
    rule: "The chaining overlay (§2) — a `use decision` (bare same-library `use decision \"Sub\"`, or a QUALIFIED cross-library chain, #172) is the right primitive for TWO overlapping reasons: (a) the SOURCE delegates a SEPARATE determination BY NAME (\"covered if the member meets the Eligibility Policy,\" \"per the Step-Therapy Protocol\"); and/or (b) REUSE of a GENUINELY SHARED determination — one determination that multiple policies or pathways genuinely reference, factored into a shared decision/library and chained. The SUR mandate-determination is exactly (b): one shared determination chained cross-library, which IS reuse. Reuse is a FIRST-CLASS reason to chain, not merely tolerated taste. One policy's own internal AND/OR/NOT logic still stays in ONE tree, however complex — the tree already expresses boolean composition, so \"I have boolean logic\" is not a chaining signal (see decision-composition). THE LINE IS NOT reuse-vs-no-reuse; it is GENUINELY-SHARED vs FABRICATED-SHARED: factor + reuse + chain a determination that is genuinely ONE shared thing; do NOT fabricate a shared sub-decision across INDEPENDENT policies whose criteria merely look alike — those are two sources that may diverge, so duplicate them inline (factoring lookalikes invents a false coupling that changes one when you change the other). (See source-delegated-decision-reference and disposition-arbitration-reference.)",
    why: "Two failure modes, opposite directions. (1) FABRICATING a determination boundary the structure does not genuinely share — casting one policy's internal pathways as separate sub-determinations, or coupling two independent lookalike policies — INVENTS structure the sources do not support and can change the disposition/provenance surface. (2) DUPLICATING a genuinely-shared determination instead of reusing it (a misapplied no-DRY instinct) loses the single source of truth the share represents (e.g. SUR's mandate determination). The boundary is a fact about what is genuinely shared — not an authoring convenience in either direction.",
    ref: "§2; source-delegated-decision-reference; disposition-arbitration-reference; #172",
    clauses: [
      {
        text: "Chain a `use decision` for EITHER source-delegation (the source names/delegates a separate determination) OR reuse of a GENUINELY shared determination (one determination multiple policies/pathways genuinely reference — incl. cross-library, #172). Reuse is a legitimate first-class driver, not merely tolerated taste. One policy's own internal boolean logic still stays in ONE tree.",
        force: "default",
      },
      {
        text: "Do not FABRICATE a determination boundary the structure does not genuinely share: casting one policy's internal pathways as separate chained sub-determinations the source never delegates AND that are not a genuinely-shared determination — an ADD that changes the disposition/provenance surface — is unfaithful; flag it even if a human did it deliberately. (A behavior-identical internal helper that does NOT change the surface is taste — leave it.)",
        force: "invariant",
        test: "judgeLens.composition:invented-determination-boundary",
      },
      {
        text: "Cross-policy: distinguish GENUINELY-SHARED from FABRICATED-SHARED. A determination multiple policies genuinely reference (one shared thing) → FACTOR into a shared decision/library and chain it (reuse, incl. cross-library) — correct. Two INDEPENDENT policies whose criteria merely coincide → DUPLICATE inline (two sources that may diverge); do NOT factor lookalikes into one shared sub-decision — that invents a false coupling.",
        force: "invariant",
        test: "judgeLens.composition:invented-determination-boundary",
      },
    ],
  },
  {
    id: "guards",
    category: "guards",
    rule: "A menu item in an `any:`/`all:` action block may carry `unless \"C\"` (drop when C holds) or `only when \"C\"` (include only when C holds). Guards are legal ONLY on multi-action menu members — not on inline `when … then recommend`, not on `otherwise`, not on a single menu-less action. Keep at least one ALWAYS-offered (unguarded) item so a matched branch can never produce nothing.",
    ref: "docs/decision-shapes.md; validator rule guard-on-single-action",
  },
  {
    id: "dispositions",
    category: "dispositions",
    rule: "Model dispositions as plain `activity` declarations. CRL has no approve/deny/pend verbs — do not invent them. Do not author rationale at the decision/recommend site; the reason a branch fired IS its triggering `when` concept, which the emitter can surface (from the concept's `meta is`). DISPOSITION TYPE follows the ACT: a CDS recommendation to ORDER a service uses `request CPGServiceRequest` (see decision-reference). A PA / medical-policy coverage DETERMINATION is COMMUNICATED, never ordered — reference the SHARED, canonical `Medical Policy Determination` library's determination activities by qualified name (every deployment vendors this same library; the determination is two KINDS — a CERTIFY (`\"Approve\"` = CPGCommunicationRequest / X12 A1) and a NOT-CERTIFY (X12 A3) — and the not-certify kind may take further FINAL activity FLAVORS for distinct reasons, e.g. `\"Deny\"` and `\"Deny EIU\"`; see pa-disposition-set). All are `CPGCommunicationRequest`, never `CPGServiceRequest`, and never a per-policy re-authored determination (see pa-determination-reference).",
    why: "CRL is general (cognitive support, CDS, prior-auth, quality measures), not a PA-specific language; keep the core minimal. But a coverage determination is a communicated decision, not a service order — modeling it as CPGServiceRequest is a clinical-safety error (#134).",
    ref: "crl-not-a-pa-language; #134",
    clauses: [
      {
        text: "Model dispositions as plain `activity` declarations; CRL has no approve/deny/pend verbs — do not invent them.",
        force: "default",
      },
      {
        text: "Do not author rationale at the decision/recommend site; the reason a branch fired IS its triggering `when` concept (the emitter surfaces it from the concept's `meta is`).",
        force: "default",
      },
      {
        text: "A PA / medical-policy coverage DETERMINATION is COMMUNICATED, never ordered — it resolves to the shared `Medical Policy Determination` library (all `CPGCommunicationRequest`, never `CPGServiceRequest`, never a per-policy re-authored determination). Modeling it as a service order is a clinical-safety error (#134).",
        force: "invariant",
        test: "verifyLoop:communicated-not-ordered",
      },
    ],
  },
  {
    id: "pa-disposition-set",
    category: "dispositions",
    rule: "For a medical-policy / PA coverage decision the disposition set is constrained STRUCTURALLY, naming no activities: (1) MEMBERSHIP — the determination is exactly TWO KINDS of outcome (a CERTIFY kind and a NOT-CERTIFY kind), NOT two activities. The not-certify kind may take multiple ACTIVITY FLAVORS that share one X12 A3 outcome but communicate a DISTINCT reason (e.g. a medical-necessity not-certify vs an experimental/investigational/unproven not-certify). Every activity the decision can `recommend` resolves to the shared, canonical `Medical Policy Determination` library (the one library every deployment vendors under that name; a qualified ref into it), never a per-policy re-authored determination and never `CPGServiceRequest`; a determination is COMMUNICATED (all `CPGCommunicationRequest`), not ordered. (2) MUTUAL EXCLUSIVITY — each case fires EXACTLY ONE determination, and the invariant spans the DELEGATED CLOSURE (parent + any chained `use decision` sub TOGETHER, not in-tree branches alone): no reachable path across the closure may emit more than one determination in a single run (author ordered precedence with `first:` + `otherwise`; do not place two determination recommendations under one `all:` / `any:`; a branch that both delegates and `recommend`s emits two determinations a in-tree-only check misses). (3) NO PEND — the canonical library holds only FINAL determinations (a deployment extends it only with further final flavors), so a determination cannot recommend a pend; Pended (X12 A4) is an async/workflow state resolved OUTSIDE the per-policy decision, not a determination leaf. WHICH activity flavors the shared library offers, and their certify/not-certify KINDS, are content (governed in the deployment's content project); whether a policy uses the RIGHT flavor where it draws a distinction is a reviewer/Judge fidelity call this rule INSTRUCTS but does not mechanically enforce.",
    why: "The universal kit must be customer-agnostic — it serves every deployment's content project, not one denial taxonomy. The structural invariant (shared-library membership, one determination per case ACROSS the delegated closure, no pend leaf) catches the real modeling defects #134 targeted — a determination modeled as a service order, a per-policy re-authored determination, a contradictory double-determination across a parent+sub — WITHOUT hard-coding any activity set; a distinct further not-certify flavor is legitimate content, not a defect (#167).",
    ref: "#134; #167; §4",
    clauses: [
      {
        text: "MEMBERSHIP: every recommended determination resolves to the shared `Medical Policy Determination` library (a qualified ref), all `CPGCommunicationRequest`, never `CPGServiceRequest`, never a per-policy re-authored determination.",
        force: "invariant",
        test: "verifyLoop:shared-lib-membership",
      },
      {
        text: "MUTUAL EXCLUSIVITY spans the DELEGATED CLOSURE: exactly one determination per run over parent + any chained sub together; no path may emit two (a branch that both delegates and `recommend`s is the case an in-tree-only check misses). Author ordered precedence with `first:` + `otherwise`.",
        force: "invariant",
        test: "verifyLoop:mutual-exclusivity-spans-closure",
      },
      {
        text: "NO PEND leaf: the canonical library holds only FINAL determinations; Pended (X12 A4) is an async/workflow state resolved outside the per-policy decision, not a determination leaf.",
        force: "invariant",
        test: "verifyLoop:no-pend",
      },
      {
        text: "The two KINDS are certify / not-certify; the not-certify kind may carry multiple activity flavors (sharing X12 A3) for distinct reasons — WHICH flavors exist is content, not defect (#167). Whether a policy picks the RIGHT flavor is a reviewer/Judge fidelity call.",
        force: "default",
      },
    ],
  },
  {
    id: "minimalism",
    category: "minimalism",
    rule: "Declare the MINIMAL set that captures the clinical intent and let the emitter do the heavy lifting. Do not over-specify properties the emitter can derive.",
    ref: "declarative-not-implementation",
  },
  {
    id: "cel-cases",
    category: "cel",
    rule: "Author a companion `.cel`: `covers \"<CRL library>\"`; a Patient subject `fact` (`- defined by \"Patient\".`); one clinical `fact` per case-feature linked to its concept via `- defined by \"<library>\".\"<concept>\".`; and one `case` per path with `- subject is …`, the relevant `- fact is …`, and a `- result is \"<decision>\" is \"<branch>\".` oracle. The CRE satisfies a concept iff a case fact is `defined by` it.",
    ref: "decision-reference.cel; src/cre/run.ts",
  },
  {
    id: "verify-loop",
    category: "process",
    rule: "Verify with the MCP tools in order: validate_crl(path) clean → validate_cel(path) clean → run_decision(path) with every case's `result is` passing. validate_cel and run_decision need FILES under a project root (a package.json) — they do not accept inline code.",
    ref: "verifyLoop",
  },
];

const STAGE_RECOMMENDED_CONCEPT_TYPES = [
  "Condition",
  "Observation",
  "Procedure",
  "MedicationRequest",
  "MedicationStatement",
  "AllergyIntolerance",
  "Device",
  "DiagnosticReport",
  "Encounter",
];

const STAGE_RECOMMENDED_ACTIVITY_TYPES = [
  "CPGCommunicationRequest",
  "CPGServiceRequest",
  "CPGMedicationRequest",
  "CPGProposeDiagnosis",
  "CPGRecordDetectedIssue",
];

const TYPE_ALLOWLIST: TypeAllowlist = {
  conceptTypes: [...conceptTypes],
  conceptValueTypes: [...conceptValueTypes],
  activityTypes: [...activityTypes],
  stageRecommended: {
    conceptTypes: STAGE_RECOMMENDED_CONCEPT_TYPES,
    activityTypes: STAGE_RECOMMENDED_ACTIVITY_TYPES,
  },
  note:
    "conceptTypes / conceptValueTypes / activityTypes are the full grammar-legal " +
    "vocabularies (source of truth: the CRL grammar). `stageRecommended` is a " +
    "non-binding subset most common for local decision-support; any listed type is legal.",
};

const EXAMPLES: KitExample[] = [
  {
    title: "Local case-feature concept (asserted, in scope)",
    language: "crl",
    snippet: 'concept "Documented Nonunion":\n- type is Condition.\n- code is `documented-nonunion`.',
    valid: true,
    note: "type is + code is only — the Stage-1 leaf concept form.",
  },
  {
    title: "`defined as` is INFERENCE — normalize ONE criterion's representations",
    language: "crl",
    snippet:
      'concept "Failed Drug Therapy":\n- type is Observation.\n- code is `failed-drug`.\nconcept "Failed Physical Therapy":\n- type is Observation.\n- code is `failed-pt`.\nconcept "Failed Conservative Therapy":\n- defined as ( "Failed Drug Therapy" sem-or "Failed Physical Therapy" ).',
    valid: true,
    note: "ONE criterion satisfiable by either representation → one fact (drop-one testable). `defined as`/`sem-*` normalizes one concept; it NEVER joins DISTINCT criteria — combining the policy's distinct criteria is the decision tree's job (nested `when` nodes; see decision-composition + criteria-decision-reference). #168.",
  },
  {
    title: "Matched branch with a guarded `any:` menu",
    language: "crl",
    snippet:
      'decision "Coverage":\nfirst:\n- when "Indication" then:\n  any:\n  - recommend activity "Order MRI".\n  - recommend activity "Order CT" unless "Contrast Allergy".\n  end.\n- otherwise then recommend activity "Deny".',
    valid: true,
    note: "Order MRI is always offered; CT is dropped when contraindicated.",
  },
  {
    title: "DON'T: a guard on a single menu-less action",
    language: "crl",
    snippet: 'decision "D":\n- when "A" then:\n  - recommend activity "X" unless "C".\n  end.',
    valid: false,
    expectRule: "guard-on-single-action",
    note: "Guards are only meaningful inside a multi-action menu. Put X in an `any:`/`all:` block, or gate the whole branch with a `when`.",
  },
  {
    title: "DON'T: `any:` over when-branches",
    language: "crl",
    snippet: 'decision "D":\nany:\n- when "A" then recommend activity "X".\n- when "B" then recommend activity "Y".',
    valid: false,
    expectRule: "any-over-branches",
    note: "Nondeterministic over branches. Compose conditions with `sem-or` into one concept, or use `first:`/`all:`.",
  },
];

const VERIFY_LOOP: VerifyLoop = {
  steps: [
    "validate_crl(path) — clean (no errors)",
    "validate_cel(path) — clean (no errors)",
    "run_decision(path) — every case's `result is` passes (status: pass)",
  ],
  proves:
    "The decision SHAPE is valid and the branch/menu WIRING produces the asserted disposition for each case's facts.",
  doesNotProve:
    "That a concept's `code is` is the clinically correct code, or that the concept-to-intent mapping is right. The CRE (v1) is asserted-only and never evaluates `code is`: a concept is satisfied purely because a case fact is `defined by` it. A green run means the wiring is right, NOT that the encoding is clinically complete or correct.",
  note:
    "validate_cel and run_decision require FILES under a project root (a package.json); they do not accept inline code. In a content project's artifact-package layout, author <artifact>.crl and <artifact>.cel under the artifact's package and pass absolute paths. " +
    "PROVENANCE / PROMOTION (beyond the run_decision proof): generate the scaffold with `generate_provenance` " +
    "clusterBy:\"disposition-path\" — it clusters per RUN PATH (decision-node refs only) so it is correspondence-correct " +
    "BY CONSTRUCTION, clearing the FINAL `validate_provenance` cockpit-correspondence gate AS GENERATED (before any " +
    "source attribution). The default clusterBy:\"decision\" is the per-decision concept-attribution VIEW (it cites " +
    "concept refs that fan out / over-light the gate) — inspect with it, do NOT promote with it. " +
    "PROOF STATUS IS ORTHOGONAL TO FAITHFULNESS (§4): faithfulness decides the model, provability decides whether run_decision can prove it yet. Encode the FAITHFUL model and DEFER the proof for any construct the kit `boundary` marks out-of-scope — never substitute a less-faithful provable model, and never assert a composite to fake green (K4). Read the live proof status from `conceptLayerModel` (scope in/out) and `boundary` (e.g. a `definition is` predicate is deferred; a `use decision` delegation — bare same-library OR qualified cross-library — is evaluated) — do not hardcode a snapshot. " +
    "Two DURABLE proof-methodology requirements (independent of which constructs are evaluated): " +
    "(1) ASSERT THE PATH, not just the disposition. `result is` checks disposition MEMBERSHIP only — two paths ending in the same disposition (a sub-decision's `otherwise` Deny and a parent's `otherwise` Deny) are indistinguishable, so a case short-circuiting to the WRONG `otherwise` still 'passes'. Fall-through / chained proof cases must assert the path via the run trace (`viaWhen` / nodeId) or use DISTINCT disposition activities per path. " +
    "(2) MUTUAL-EXCLUSIVITY SPANS THE DELEGATED CLOSURE. The PA disposition-set 'exactly one determination per run' invariant is evaluated over parent + sub TOGETHER, not in-tree branches alone — a branch that both delegates and `recommend`s emits two determinations an in-tree-only check misses.",
  methodologyRequirements: [
    {
      id: "assert-path",
      text: "§4-req1 — ASSERT THE PATH, not just the disposition: `result is` checks disposition membership only, so two paths ending in the same disposition (a sub's `otherwise` Deny vs a parent's `otherwise` Deny) are indistinguishable; a fall-through / chained proof case must assert the path via the run trace (`viaWhen`/nodeId) or use DISTINCT disposition activities per path.",
    },
    {
      id: "mutual-exclusivity-spans-closure",
      text: "§4-req2 — the PA 'exactly one determination per run' invariant is checked over the DELEGATED CLOSURE (parent + any chained `use decision` sub together): run_decision over the policy's cases must show no run producing >1 determination, INCLUDING a branch that both delegates and `recommend`s.",
    },
    {
      id: "communicated-not-ordered",
      text: "Every determination a PA/medical-policy decision recommends is `CPGCommunicationRequest` (communicated), never `CPGServiceRequest` (ordered) — inspect the recommended activities' request types per policy (#134).",
    },
    {
      id: "shared-lib-membership",
      text: "Every recommended determination resolves (a qualified ref) to the shared `Medical Policy Determination` library, never a per-policy re-authored determination — check each recommend target's library per policy (#167).",
    },
    {
      id: "no-pend",
      text: "No determination leaf is a pend: the canonical library holds only FINAL determinations; Pended (X12 A4) is an async/workflow state outside the per-policy decision — check no recommend target is a pend per policy (#167).",
    },
  ],
};

/**
 * The judge-lens rubric — TWO families, each carrying the source-fidelity weighting the uniform severity omits.
 * (1) `waivers` — one rule per provenance WAIVER kind (validators.ts `WAIVER_KINDS`): `validate_provenance`
 *     (FINAL mode) surfaces every escape hatch that suppresses a finding as a UNIFORM manual-review; this rubric
 *     carries the earned-ness weighting (axis, earned-vs-rubber-stamped guidance, checkpoints).
 * (2) `composition` — the decision-composition / chaining source-fidelity checks (§2/§3) with no mechanical home:
 *     the invented-determination-boundary / hollowed-criteria / dropped-or-added-criterion checks that a rule's
 *     `invariant` clause anchors its `test` to via `judgeLens.composition:<check>`.
 */
const JUDGE_LENS: JudgeLens = {
  summary:
    "Two judge-lens families carry the source-fidelity weighting the uniform severity deliberately omits. " +
    "(1) `waivers` — in FINAL mode validate_provenance surfaces every WAIVER (an escape hatch that suppresses a " +
    "finding) as a uniform manual-review; for each, rank scrutiny by its `weightedBy` axis, judge earned-ness " +
    "with `guidance`, and walk the `checkpoints` (the message names the loci — cluster, blast radius, span " +
    "preview, dispositionClass). (2) `composition` — the decision-composition / chaining source-fidelity checks " +
    "(§2/§3) that have NO mechanical (validator) home: whether a `use decision` chain, a `defined as` composite, " +
    "or a refactor INVENTS / HOLLOWS / DROPS a determination boundary or criterion vs the source. A rule's " +
    "invariant clause with a source-fidelity force points its `test` at a composition check via " +
    "`judgeLens.composition:<check>`. A FAITHFUL human refactor STANDS; an unfaithful one is flagged even if deliberate.",
  composition: [
    {
      check: "invented-determination-boundary",
      weightedBy:
        "whether a SOURCE sentence names/delegates the sub-determination a `use decision` chains to.",
      guidance:
        "A `use decision` is faithful ONLY if the source presents a SEPARATE / delegated determination by name " +
        "(another policy/protocol/shared sub-determination). Chaining for DRY / reuse / readability, or to factor " +
        "one policy's internal pathways, INVENTS a boundary the source does not draw (an ADD; it changes the " +
        "disposition/provenance surface). Cross-policy apparent reuse must be DUPLICATED, not factored.",
      checkpoints: [
        "Does a specific source sentence name/delegate the chained sub-determination?",
        "Does the sub render its OWN disposition (Approve/Deny meaningful alone), vs a true/false condition that should stay a `when`?",
        "Is this cross-policy reuse that should be duplicated (two sources), not factored (a false coupling)?",
      ],
    },
    {
      check: "hollowed-criteria",
      weightedBy:
        "whether the `defined as` operands are the source's DISTINCT criteria vs sub-representations of ONE criterion.",
      guidance:
        "Collapsing DISTINCT criteria into a `defined as` composite gated as the SOLE branch is a #168 violation " +
        "(it hides which criterion failed). The REVERSE — exposing one criterion's sub-representations as `when` " +
        "nodes — is presumed-faithful: do NOT revert it.",
      checkpoints: [
        "Are the operands distinct criteria the source lists, or representations of one criterion?",
        "Is the composite gated as the SOLE branch (the black-box shape)?",
        "Does the cockpit still show which criterion failed?",
      ],
    },
    {
      check: "dropped-or-added-criterion",
      weightedBy: "presence/absence of each source criterion in the encoding.",
      guidance:
        "The encoding must neither DROP a source criterion (HOLLOW) nor ADD a criterion / boundary the source " +
        "does not state. A FAITHFUL human refactor STANDS; an unfaithful one (invents / hollows / drops) is " +
        "flagged even if deliberate.",
      checkpoints: [
        "Is every source criterion a visible node/operand?",
        "Is any criterion or determination boundary present that the source does not state?",
      ],
    },
  ],
  waivers: [
    {
      kind: "waiver-authored",
      weightedBy:
        "authoredKind — clinical-assumption / derived-glue (clinical logic with NO source span) = highest scrutiny; " +
        "implementation-artifact / modeling-rationale = routine (rubber-stamp).",
      guidance:
        "An authored item with `supports` suppresses the over-reach of every candidate CRL node in its cluster (the " +
        "BLAST RADIUS named in the message). Earned when the suppressed logic is genuine glue/implementation the source " +
        "implies; suspect when it invents a clinical decision the narrative never states.",
      checkpoints: [
        "Read the blast radius: is each suppressed node really implied by this cluster's source, or invented?",
        "Is the authoredKind honest — is a `clinical-assumption` truly assumption, not a dodged criterion?",
        "Would removing this authored support re-expose a real over-reach the KE should have linked instead?",
      ],
    },
    {
      kind: "waiver-ignored-span",
      weightedBy:
        "MN-keyword / clinical language in the span preview — a ⚠ MN-hard match means the ignored text likely IS a " +
        "coverage criterion (scrutinize hard); plain chrome (page numbers, headers) is routine.",
      guidance:
        "An ignoredRange suppresses an uncovered-span (Missed₂) — the span is deliberately not modeled. Earned for " +
        "true page chrome / boilerplate; a dodged coverage criterion is the failure mode this waiver exists to catch.",
      checkpoints: [
        "Read the span text preview: is it genuinely non-clinical chrome, or a criterion ignored away?",
        "If the message flags MN language, treat the ignore as suspect until proven boilerplate.",
        "Does the `reason` actually justify the omission, or is it a placeholder?",
      ],
    },
    {
      kind: "waiver-intentional-unlink",
      weightedBy:
        "the node's decision relation + the cluster's source context — an intentionally-unlinked decision-sub-node in a " +
        "clinically-loaded cluster is more suspect than one in a clearly out-of-scope branch.",
      guidance:
        "A LEGAL intentionally-unlinked ref (not a must-link-decision item's decision ref — that is the illegal-" +
        "intentional-unlink ERROR) suppresses an over-reach candidate. This is an OVER-REACH escape, NOT a Missed₁ gap. " +
        "Earned when the node truly is out of scope for this policy; suspect when it silences logic the policy needs.",
      checkpoints: [
        "Confirm the omission is deliberate and the node is genuinely out of this policy's decision scope.",
        "Check the cluster's source context — does the narrative actually exclude this node, or is it being dodged?",
      ],
    },
    {
      kind: "waiver-disposition-class",
      weightedBy:
        "dispositionClass — route-elsewhere / presumed-scope / pend assert 'not my decision' (scrutinize, esp. " +
        "presumed-scope on clinical language); no-operational-disposition is routine admin/definition.",
      guidance:
        "A source item tagged non-decision-role + dispositionClass acknowledges a span out of decision scope — the " +
        "laundering route a genuine criterion can take to evade missed-decision / V9 / over-reach. Earned for true " +
        "applicability/admin spans; a presumed-scope on a clinical criterion is the failure mode. If V8 mn-keyword also " +
        "fired on the item, the coverage language strengthens the concern.",
      checkpoints: [
        "Is the span genuinely out-of-decision-scope, or a criterion acknowledged away under a disposition tag?",
        "Be especially suspicious of presumed-scope / route-elsewhere on clinically-loaded text.",
        "If mn-keyword also fired here, reconcile the role before accepting the waiver.",
      ],
    },
  ],
};

const BOUNDARY = [
  "`definition is` predicates (count / most-recent / temporal / value thresholds — compute over a source)",
  "external / value-set sources (`source representation` / `coded from`)",
  "PA Pended (X12 278 HCR01 A4) — an async/workflow disposition resolved OUTSIDE the per-policy clinical decision; not a determination leaf",
  "coded HCR01 outcome value-set binding for PA determinations — Stage 1 carries the A1/A3 outcome in the `with` narrative; coding it is a later external-terminology stage",
  "emit to FHIR / CQL",
];

function buildBase(stage: AuthoringStage): Omit<AuthoringKit, "contentHash"> {
  return {
    schemaVersion: SCHEMA_VERSION,
    stage,
    summary: SUMMARY,
    forceModel: FORCE_MODEL,
    conceptLayerModel: CONCEPT_LAYER_MODEL,
    rules: RULES,
    typeAllowlist: TYPE_ALLOWLIST,
    referenceArtifacts: [
      {
        name: "decision-reference.crl",
        language: "crl",
        purpose:
          "Canonical Stage-1 decision: first:/otherwise ordered precedence + a matched branch opening an `any:` menu with `unless`/`only when` guards and an always-offered item; local `code is` concepts; plain activity dispositions.",
        source: DECISION_REFERENCE_CRL,
      },
      {
        name: "decision-reference.cel",
        language: "cel",
        purpose:
          "Companion cases for decision-reference.crl: Patient subject, concept-linked facts, and one `result is` oracle per path (the unless drop, the only-when enable, ordered exclusion, a plain offer).",
        source: DECISION_REFERENCE_CEL,
      },
      {
        name: "criteria-decision-reference.crl",
        language: "crl",
        purpose:
          "The model for #168: a policy's DISTINCT criteria as nested `when` decision NODES (each criterion visible/auditable; nesting = AND), PLUS one genuine `defined as` INFERENCE (a single criterion satisfiable by either of two representations). `defined as` normalizes ONE concept; it never joins distinct criteria — that is the decision tree's job.",
        source: CRITERIA_DECISION_REFERENCE_CRL,
      },
      {
        name: "criteria-decision-reference.cel",
        language: "cel",
        purpose:
          "Companion cases exercising each decision NODE + the inference operand: criterion-1 node, the nested criterion-2 node (its `otherwise` → deny), the inference resolving on either representation (drug OR physical therapy → approve), and the top-level otherwise.",
        source: CRITERIA_DECISION_REFERENCE_CEL,
      },
      {
        name: "medical-policy-determination.crl",
        language: "crl",
        purpose:
          "The SHARED, canonical PA determination library (#134) — communicated (CPGCommunicationRequest), never ordered, imported by every medical-policy artifact via qualified ref, never re-authored. Two KINDS of outcome (certify / not-certify); the not-certify kind takes activity FLAVORS sharing one X12 A3 outcome — here Approve (A1), Deny (A3 medical-necessity), and Deny EIU (A3 experimental/investigational/unproven, a distinct reason); a deployment's content project may add further FINAL flavors. (No companion CEL — a shared activity lib has no decision to run.)",
        source: MEDICAL_POLICY_DETERMINATION_CRL,
      },
      {
        name: "pa-determination-reference.crl",
        language: "crl",
        purpose:
          "Canonical PRIOR-AUTHORIZATION exemplar (#134) — distinct from the CDS decision-reference (which ORDERs a service). The payer COMMUNICATES the determination via the shared library (this exemplar shows the Approve/Deny baseline; a deployment may add further final flavors); Pended (A4) is async/workflow, never a determination leaf.",
        source: PA_DETERMINATION_REFERENCE_CRL,
      },
      {
        name: "pa-determination-reference.cel",
        language: "cel",
        purpose:
          "Companion cases for the PA exemplar: qualifying diagnosis → approve; otherwise → deny. Resolves the shared determination activities via the vendored-sibling library (no `include`).",
        source: PA_DETERMINATION_REFERENCE_CEL,
      },
      {
        name: "source-delegated-decision-reference.crl",
        language: "crl",
        purpose:
          "Exemplar B — SOURCE-REQUIRED delegation (§2/§5-B): the source NAMES a separate determination, so the policy chains to it with a BARE same-library `use decision`. NOT DRY/reuse factoring — chaining is faithful only because the source draws the boundary. The bare same-library delegation IS evaluated (recursed; the sub determination bubbles up), so the oracle names the DELEGATED disposition, not the sub-decision name. One parent + one delegated sub.",
        source: SOURCE_DELEGATED_DECISION_REFERENCE_CRL,
      },
      {
        name: "source-delegated-decision-reference.cel",
        language: "cel",
        purpose:
          "Companion cases for exemplar B: the two delegated-path cases (continuation → the sub's Approve/Deny bubbles up) + the two parent-resolved cases. The kit's unit test asserts the continuation→Deny case's PATH goes through the delegated sub (not the parent `otherwise`) — §4-req1.",
        source: SOURCE_DELEGATED_DECISION_REFERENCE_CEL,
      },
      {
        name: "disposition-arbitration-reference.crl",
        language: "crl",
        purpose:
          "Exemplar C — DISPOSITION-ARBITRATION (§1-refinement / §5-C / §6). Applicability GATE: use ONLY when a plain nested tree duplicates shared criteria across MANY overlapping pathways with outcome precedence + fall-through; for a FEW pathways prefer the plain tree (do not over-copy the sem-not arbitration). The TEMPTING-but-DON'T-chain case: ONE determination (source draws no boundary), precedence computed in the inference layer via pairwise-disjoint `sem-not` FINAL-* concepts as flat `when` siblings, approve criteria re-exposed as visible nodes (#168-clean), NO `use decision`. Two denies use DISTINCT activities (Deny vs Deny EIU) so `result is` distinguishes them.",
        source: DISPOSITION_ARBITRATION_REFERENCE_CRL,
      },
      {
        name: "disposition-arbitration-reference.cel",
        language: "cel",
        purpose:
          "Companion cases for exemplar C (verified 6/6): each pathway alone (approve), BOTH load-bearing overlap cases (a both-indication patient who fails one pathway still approves via the other — no overlap-pop), within-indication failure (Deny), off-indication (Deny EIU).",
        source: DISPOSITION_ARBITRATION_REFERENCE_CEL,
      },
    ],
    examples: EXAMPLES,
    verifyLoop: VERIFY_LOOP,
    judgeLens: JUDGE_LENS,
    feedbackUrl: FEEDBACK_URL,
    boundary: BOUNDARY,
  };
}

function isStage(stage: string): stage is AuthoringStage {
  return (STAGES as readonly string[]).includes(stage);
}

/**
 * Assemble the authoring kit for a stage. Throws on an unknown stage (the MCP
 * tool catches it and returns a tool error listing the valid stages).
 */
export function getAuthoringKit(stage: string = DEFAULT_STAGE): AuthoringKit {
  if (!isStage(stage)) {
    throw new Error(`Unknown authoring stage "${stage}". Valid stages: ${STAGES.join(", ")}.`);
  }
  const base = buildBase(stage);
  const contentHash = createHash("sha256").update(JSON.stringify(base)).digest("hex");
  return { ...base, contentHash };
}
