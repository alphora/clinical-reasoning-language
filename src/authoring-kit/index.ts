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

import { DECISION_REFERENCE_CEL, DECISION_REFERENCE_CRL } from "./reference";
import type {
  AuthoringKit,
  AuthoringStage,
  ConceptLayerEntry,
  KitExample,
  KitRule,
  TypeAllowlist,
  VerifyLoop,
} from "./types";

export type { AuthoringKit, AuthoringStage } from "./types";

const SCHEMA_VERSION = "1.0";
export const DEFAULT_STAGE: AuthoringStage = "local-decision-support";
export const STAGES: readonly AuthoringStage[] = [DEFAULT_STAGE];

/** Where KE agents file gap-issues — the repo where the kit + tools are maintained. */
const FEEDBACK_URL = "https://github.com/alphora/clinical-reasoning-language/issues/new";

const SUMMARY =
  "Stage 1 — local-decision-support. Encode a clinical decision over LOCAL coded " +
  "case-features and prove it with CEL cases + the CRE oracle. Narrow (local `code is` " +
  "sources only) + shallow (asserted decision-supporting concepts only).";

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
    meaning: "Semantic composition of other concepts. The INFERRED layer.",
    scope: "out",
  },
  {
    form: "- definition is <predicate>.",
    meaning: "A predicate (most recent / count within / temporal). The INFERRED layer.",
    scope: "out",
  },
];

const RULES: KitRule[] = [
  {
    id: "concept-form",
    category: "concept-model",
    rule: "Stage-1 concepts carry `type is` + `code is` only. The stage boundary is the concept FORM — no `source representation`, no `defined as` / `definition is` — NOT the type vocabulary: any FHIR type may be a local `code is` concept. `meta is` is optional metadata and is allowed.",
    why: "Narrow + shallow first pass proves local-source decision authoring before inference/external sources are added.",
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
    rule: "Model dispositions as plain `activity` declarations (e.g. Approve / Deny / Order X). CRL has no approve/deny/pend verbs — do not invent them. Do not author rationale at the decision/recommend site; the reason a branch fired IS its triggering `when` concept, which the emitter can surface (from the concept's `meta is`). Activity-level `- because \`…\`.` exists but is optional and not needed in this stage.",
    why: "CRL is general (cognitive support, CDS, prior-auth, quality measures), not a PA-specific language; keep the core minimal.",
    ref: "crl-not-a-pa-language",
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
    note: "type is + code is only — the Stage-1 concept form.",
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
    "validate_cel and run_decision require FILES under a project root (a package.json); they do not accept inline code. In the crl-content layout, author <artifact>.crl and <artifact>.cel under the artifact's package and pass absolute paths.",
};

const BOUNDARY = [
  "concept inference (`defined as` / `definition is`)",
  "external / value-set sources (`source representation` / `coded from`)",
  "temporal & value-threshold predicates",
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
    ],
    examples: EXAMPLES,
    verifyLoop: VERIFY_LOOP,
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
