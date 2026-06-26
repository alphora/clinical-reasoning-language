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
  COMPOSITION_REFERENCE_CEL,
  COMPOSITION_REFERENCE_CRL,
  DECISION_REFERENCE_CEL,
  DECISION_REFERENCE_CRL,
  MEDICAL_POLICY_DETERMINATION_CRL,
  PA_DETERMINATION_REFERENCE_CEL,
  PA_DETERMINATION_REFERENCE_CRL,
} from "./reference";
import type {
  AuthoringKit,
  AuthoringStage,
  ConceptLayerEntry,
  JudgeLens,
  KitExample,
  KitRule,
  TypeAllowlist,
  VerifyLoop,
} from "./types";

export type { AuthoringKit, AuthoringStage } from "./types";

// "1.0" → "1.1": additive shape change — the `judgeLens` field (the waiver-adjudication rubric) joins the kit.
// Sibling KE agents pin schemaVersion + contentHash and re-sync; the bump signals the new field.
const SCHEMA_VERSION = "1.1";
export const DEFAULT_STAGE: AuthoringStage = "local-decision-support";
export const STAGES: readonly AuthoringStage[] = [DEFAULT_STAGE];

/** Where KE agents file gap-issues — the repo where the kit + tools are maintained. */
const FEEDBACK_URL = "https://github.com/alphora/clinical-reasoning-language/issues/new";

const SUMMARY =
  "Stage 1 — local-decision-support. Encode a clinical decision over LOCAL coded " +
  "case-features and prove it with CEL cases + the CRE oracle. Narrow (local `code is` " +
  "sources only) + shallow (asserted concepts + `defined as` boolean composition; no " +
  "`definition is` predicates or external sources).";

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
      "Boolean composition over other LOCAL concepts (the only added depth this stage; #126). run_decision evaluates it: sem-and = all, sem-or = any, sem-not = not (closed-world). Bare operands resolve within the defining library; cross-library operands must be qualified.",
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
    rule: "Stage-1 leaf concepts carry `type is` + `code is` (local). Multi-part criteria may be composed with `defined as` boolean composition over those local leaves (run_decision evaluates it) — PREFER decomposing a criterion into named leaves + a `defined as` composite so each part is adversarially testable (drop-one-leaf → the composite fails), rather than one opaque concept. Still OUT this stage: `source representation`/`coded from` (external) and `definition is` predicates (count/temporal/value). The boundary is the concept FORM, not the type vocabulary: any FHIR type may be a local `code is` concept. `meta is` is optional.",
    why: "Local-source pass proves decision authoring (incl. local composition) before external sources and predicate inference are added.",
    ref: "concept-layer-model; src/tests/fixtures/representation/mammogram-and-bmi.crl",
  },
  {
    id: "decision-qualifiers",
    category: "decision-shape",
    rule: "A multi-branch decision must declare a qualifier: `first:` (ordered, first match wins — requires a trailing `otherwise`), `all:` (every matching branch fires), or `any:` (over actions only — offer alternatives). A `then:` body is closed by `end.`. A single-member block takes no qualifier.",
    ref: "docs/decision-shapes.md; validator rules qualifier-required / otherwise-required / any-over-branches / first-over-actions",
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
    rule: "Model dispositions as plain `activity` declarations. CRL has no approve/deny/pend verbs — do not invent them. Do not author rationale at the decision/recommend site; the reason a branch fired IS its triggering `when` concept, which the emitter can surface (from the concept's `meta is`). DISPOSITION TYPE follows the ACT: a CDS recommendation to ORDER a service uses `request CPGServiceRequest` (see decision-reference). A PA / medical-policy coverage DETERMINATION is COMMUNICATED, never ordered — reference the SHARED, canonical `Medical Policy Determination` library's determination activities by qualified name (every deployment vendors this same library; its baseline membership is `\"Approve\"` = CPGCommunicationRequest / X12 A1 and `\"Deny\"` = A3, and a deployment's content project may add further FINAL flavors). All are `CPGCommunicationRequest`, never `CPGServiceRequest`, and never a per-policy re-authored determination (see pa-determination-reference).",
    why: "CRL is general (cognitive support, CDS, prior-auth, quality measures), not a PA-specific language; keep the core minimal. But a coverage determination is a communicated decision, not a service order — modeling it as CPGServiceRequest is a clinical-safety error (#134).",
    ref: "crl-not-a-pa-language; #134",
  },
  {
    id: "pa-disposition-set",
    category: "dispositions",
    rule: "For a medical-policy / PA coverage decision the disposition set is constrained STRUCTURALLY, naming no activities: (1) MEMBERSHIP — every activity the decision can `recommend` resolves to the shared, canonical `Medical Policy Determination` library (the one library every deployment vendors under that name; a qualified ref into it), never a per-policy re-authored determination and never `CPGServiceRequest`; a determination is COMMUNICATED (all `CPGCommunicationRequest`), not ordered. (2) MUTUAL EXCLUSIVITY — each case fires EXACTLY ONE determination: no reachable branch/action shape may emit more than one determination in a single run (author ordered precedence with `first:` + `otherwise`; do not place two determination recommendations under one `all:` / `any:`). (3) NO PEND — the canonical library holds only FINAL determinations (a deployment extends it only with further final flavors), so a determination cannot recommend a pend; Pended (X12 A4) is an async/workflow state resolved OUTSIDE the per-policy decision, not a determination leaf. WHICH activities the shared library offers and their certify/deny KINDS are content (governed in the deployment's content project); whether a policy uses the RIGHT flavor where it draws a distinction is a reviewer/Judge fidelity call this rule INSTRUCTS but does not mechanically enforce.",
    why: "The universal kit must be customer-agnostic — it serves every deployment's content project, not one denial taxonomy. The structural invariant (shared-library membership, one determination per case, no pend leaf) catches the real modeling defects #134 targeted — a determination modeled as a service order, a per-policy re-authored determination, a contradictory double-determination — WITHOUT hard-coding any activity set; a distinct third determination flavor is legitimate content, not a defect (#167).",
    ref: "#134; #167",
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
    title: "Decompose a multi-part criterion with `defined as` composition",
    language: "crl",
    snippet:
      'concept "Has Dx":\n- type is Condition.\n- code is `dx`.\nconcept "Failed Therapy":\n- type is Observation.\n- code is `failed-therapy`.\nconcept "Meets Criteria":\n- defined as ( "Has Dx" sem-and "Failed Therapy" ).',
    valid: true,
    note: "Each leaf is a local `code is` concept; the composite ANDs them. run_decision evaluates the composition, so a drop-one-leaf case proves each leaf necessary.",
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
    "validate_cel and run_decision require FILES under a project root (a package.json); they do not accept inline code. In a content project's artifact-package layout, author <artifact>.crl and <artifact>.cel under the artifact's package and pass absolute paths.",
};

/**
 * The judge-lens rubric — one rule per provenance WAIVER kind (validators.ts `WAIVER_KINDS`). `validate_provenance`
 * (FINAL mode) surfaces every escape hatch that suppresses a finding as a UNIFORM manual-review; the severity carries
 * no weighting by design (surface-then-adjudicate is auditable). This rubric carries the earned-ness weighting: the
 * axis to rank each waiver's scrutiny, how to judge earned vs rubber-stamped, and the checkpoints to walk.
 */
const JUDGE_LENS: JudgeLens = {
  summary:
    "In FINAL mode, validate_provenance surfaces every WAIVER — an escape hatch that suppresses a finding — as a " +
    "uniform manual-review for the Judge to adjudicate. Severity carries no weighting (surface-then-rubber-stamp is " +
    "auditable); this rubric does. For each waiver, rank scrutiny by its `weightedBy` axis, judge earned-ness with " +
    "`guidance`, and walk the `checkpoints`. The waiver's finding message names the concrete loci (cluster, blast " +
    "radius, span preview, dispositionClass).",
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
        name: "composition-reference.crl",
        language: "crl",
        purpose:
          "A coverage criterion modeled as a `defined as` boolean composition over local `code is` leaves, used in a first:/otherwise decision — the now-in-scope composition shape (#126).",
        source: COMPOSITION_REFERENCE_CRL,
      },
      {
        name: "composition-reference.cel",
        language: "cel",
        purpose:
          "Companion cases: both-criteria-met (composite satisfied → approve), two drop-one-leaf necessity proofs (each → deny), and otherwise.",
        source: COMPOSITION_REFERENCE_CEL,
      },
      {
        name: "medical-policy-determination.crl",
        language: "crl",
        purpose:
          "The SHARED, canonical PA determination library (#134) — communicated (CPGCommunicationRequest), never ordered, imported by every medical-policy artifact via qualified ref, never re-authored. Its baseline membership is Approve (X12 A1) + Deny (A3); a deployment's content project may add further FINAL flavors (e.g. a distinct deny reason). (No companion CEL — a shared activity lib has no decision to run.)",
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
