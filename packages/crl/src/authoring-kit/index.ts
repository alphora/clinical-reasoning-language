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

import { DISPOSITION_CATEGORIES } from "../dispositions/categories";
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
  PA_DETERMINATION_REFERENCE_CEL,
  PA_DETERMINATION_REFERENCE_CRL,
  PATIENT_AGE_BOTH_REP_REFERENCE_CRL,
  SOURCE_DELEGATED_DECISION_REFERENCE_CEL,
  SOURCE_DELEGATED_DECISION_REFERENCE_CRL,
} from "./reference";
import type {
  AuthoringEdge,
  AuthoringKit,
  AuthoringStage,
  AuthoringUseCase,
  ConceptLayerEntry,
  DispositionModel,
  ForceModel,
  JudgeLens,
  KitExample,
  KitRule,
  ReferenceArtifact,
  TypeAllowlist,
  VerifyLoop,
} from "./types";

export type { AuthoringEdge, AuthoringKit, AuthoringStage, AuthoringUseCase, KitFacet } from "./types";

// "1.0" → "1.1": additive shape change — the `judgeLens` field (the waiver-adjudication rubric) joins the kit.
// "1.1" → "1.2": SHAPE change for the KE decision-composition teaching package (§0–§4) — four additions:
//   (1) `forceModel` (the §0 force levels — read first); (2) per-rule `clauses` (the machine-readable
//   default/invariant/validator-enforced force breakdown, each invariant clause carrying a RESOLVABLE `test`);
//   (3) a SECOND judge-lens family `judgeLens.composition` (the §2/§3 source-fidelity checks with no
//   mechanical home — invented-determination-boundary / hollowed-criteria / dropped-or-added-criterion); and
//   (4) `verifyLoop.methodologyRequirements` (the §4 durable per-policy checks an invariant `test` anchors to
//   via `verifyLoop:<id>`). All four ship together as the single 1.1→1.2 shape change.
// "1.2" → "1.3": CONTENT change — adds the tightly-scoped patient-age both-representation exception (the one
//   `definition is` carve-out). A both-rep concept `code is <age-code>` + `definition is age today at least <N>
//   years` recency-merges a local age Observation with the live age computed over `Patient.birthDate`; earned
//   because Patient.birthDate is a genuine clinical record that can COMPUTE the age. Adds the CONCEPT_LAYER_MODEL
//   both-rep entry, the `patient-age-both-rep` rule, the carve-out wording in concept-form / boundary, the
//   verifyLoop `doesNotProve` recency-execution note, and the `patient-age-both-rep-reference.crl` exemplar.
//   AGE ONLY — the SOLE sanctioned `definition is` exception; do NOT generalize.
// "1.3" → "1.4": SHAPE + CONTENT change — the `useCase` specialization axis (#191 lattice). Additions:
//   (1) `useCase` + `chain` on the payload (the resolved edge chain, name-order); (2) every `KitRule`,
//   `ReferenceArtifact`, and `verifyLoop.methodologyRequirement` carries an `edge` (`cpg` | `prior-auth`);
//   (3) an advisory `facets?` channel present only on the `prior-auth` chain (non-selector, home-TBD).
//   The PA/CPG-FUSED `dispositions` rule is UN-FUSED: its CPG-base prose stands alone (plain activity / no
//   invented verbs / no rationale-at-site / disposition-type-follows-act) and its PA `communicated-not-ordered`
//   invariant RELOCATES to the `prior-auth` `pa-disposition-set` rule (it is NOT a dup of that rule's
//   shared-lib-membership clause — the two anchor DIFFERENT verifyLoop checks). PA boundary items + PA reference
//   artifacts move to the `prior-auth` edge. BEHAVIOR CHANGE: `getAuthoringKit(stage)` with no `useCase` now
//   returns the neutral `cpg` base, NOT PA — pass `useCase:"prior-auth"` for the PA kit (fail-loud, never
//   silent-PA). TWO distinct contentHashes now (one per useCase); the PA seat re-syncs on the bump.
// "1.4" → "1.5": SHAPE + CONTENT change — the configurable-PA-leaves determination model (T3a). The prior-auth
//   `pa-disposition-set` rule is rewritten config-driven (determinations are configured `<category>.<key>` plain
//   activities; certify/not-certify/pended = PAS review-actions; membership/communicated-not-ordered/finality-by-mode
//   are always-on invariants that are ALSO validator-enforced when the project configures `crl.dispositions`). Two
//   new prior-auth rules (`configure-dispositions`, `disposition-mode`). The verifyLoop `shared-lib-membership` →
//   `configured-membership` and `no-pend` → `finality-by-mode`. The three advisory `facets` are RETIRED (they became
//   concrete rules); a new prior-auth `dispositionModel` field surfaces the framework categories + config contract.
//   T3b (same schemaVersion, hash re-pinned): migrated the PA reference artifacts to the config-driven model
//   (local `<category>.<key>` activities; removed the shared `medical-policy-determination.crl`, 12→11 artifacts).
// "1.5" → "1.6": CONTENT change (KE #203 Todo 6) — adds the `review-flags` authoring rule (cpg/process; teaches all
//   four tags customer-confirmable / internal-inconsistency / open-fork / fidelity-defect{direction}) + 3 cross-scope
//   examples (open-fork on a concept, fidelity-defect on a decision, gap-filed the not-a-flag contrast), the LEAN
//   form (gist + fields in the `.crl`; rich detail in a tracker
//   issue filed at creation, linked via the new optional `; ref`), and the `@gap-filed` (not-a-flag pointer)
//   contrast. NO payload-shape change. BOTH useCase hashes re-pin (schemaVersion is in the hashed base AND the
//   cpg-edge rule/examples inherit into the prior-auth chain). Registry companion: metadata-registry.json v0.3.1
//   adds the optional `ref` field to the four flag tags (so the taught `; ref` is registry-grounded).
// Sibling KE agents pin schemaVersion + contentHash and re-sync; the bump signals the new content.
const SCHEMA_VERSION = "1.6";
export const DEFAULT_STAGE: AuthoringStage = "local-decision-support";
export const STAGES: readonly AuthoringStage[] = [DEFAULT_STAGE];

/**
 * The selectable use cases (#191 lattice). Each resolves — BY NAME, never by index — to an ordered edge chain;
 * a `prior-auth` kit inherits all `cpg` content plus the PA narrowings. Measure is a RESERVED sibling edge:
 * documented here, deliberately NOT a shipped chain (so an unknown-useCase throw stays honest).
 */
export const DEFAULT_USE_CASE: AuthoringUseCase = "cpg";
export const USE_CASES: Record<AuthoringUseCase, { label: string; chain: readonly AuthoringEdge[] }> = {
  cpg: { label: "CPG — base framework (FHIR CPG IG; ≈ full CRL). A stub edge, fleshed out with the CPG build.", chain: ["cpg"] },
  "prior-auth": { label: "Prior authorization / medical policy — the coverage-determination narrowing.", chain: ["cpg", "prior-auth"] },
};
export const USE_CASE_NAMES: readonly AuthoringUseCase[] = ["cpg", "prior-auth"];

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
    meaning:
      "A predicate (most recent / count within / temporal / value). The INFERRED layer — computes over a source. (OUT except the patient-age both-rep carve-out — see below.)",
    scope: "out",
  },
  {
    form: "- code is `age-code`. + - definition is age today at least <N> years.",
    meaning:
      "PATIENT-AGE BOTH-REPRESENTATION recency merge — the ONE `definition is` exception (both arms on ONE concept). " +
      "`Patient.birthDate` is a genuine clinical record that can COMPUTE the age, which is what earns it. The Inferred " +
      "layer recency-merges the local age Observation (`Observation.issued`) against the live computed age " +
      "(`Patient.meta.lastUpdated`): NEWEST wins; indeterminate (`lastUpdated` absent) → session-fresh local-source " +
      "wins. AGE ONLY — do NOT generalize to other `definition is` predicates (see rule patient-age-both-rep).",
    scope: "in",
  },
];

const RULES: KitRule[] = [
  {
    id: "concept-form",
    edge: "cpg",
    category: "concept-model",
    rule: "Stage-1 leaf concepts carry `type is` + `code is` (local). A SINGLE criterion stated at a finer data-grain — multiple representations/components of ONE clinical fact — is normalized with `defined as` (INFERENCE) over named local leaves, drop-one-leaf testable (e.g. \"failed conservative therapy\" = failed drug OR physical therapy). The conjunction of DISTINCT criteria (a policy's \"ALL of the following are met\") is decision COMPOSITION and belongs in the decision TREE — each criterion a nested `when` node — NOT a `defined as` `Criteria Met` composite (see decision-composition). `defined as`/`sem-and`/`sem-or` NEVER joins distinct criteria. Still OUT this stage: `source representation`/`coded from` (external) and `definition is` predicates (count/temporal/value) — the SOLE exception: the patient-age both-rep `definition is age today at least <N> years` (see rule patient-age-both-rep). The boundary is the concept FORM, not the type vocabulary: any FHIR type may be a local `code is` concept. `meta is` is optional.",
    why: "Local-source pass proves decision authoring (incl. one-concept `defined as` inference) before external sources and predicate inference are added; conflating inference with decision composition hides criteria from the decision (#168).",
    ref: "concept-layer-model; src/tests/fixtures/representation/mammogram-and-bmi.crl",
    clauses: [
      {
        text: "A Stage-1 leaf concept carries `type is` + `code is` (local); `source representation`/`coded from` (external) and `definition is` predicates are OUT this stage (the SOLE exception: the patient-age both-rep `definition is age today at least <N> years` — see rule patient-age-both-rep).",
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
    id: "patient-age-both-rep",
    edge: "cpg",
    category: "concept-model",
    rule: "PATIENT AGE is the SOLE sanctioned `definition is` exception to Stage-1 'local `code is` only'. A both-representation age concept carries BOTH arms on ONE concept: `- code is `<age-code>`.` (the LOCAL age Observation) AND `- definition is age today at least <N> years.` (a live compute over `Patient.birthDate`). The Inferred layer RECENCY-MERGES the two: newest of the local age Observation (`Observation.issued`) vs `Patient.meta.lastUpdated` wins; indeterminate (`lastUpdated` absent) → the session-fresh local-source wins. Four constraints are engine-enforced (verified at `$r5.apply`, 6 cases incl. the indeterminate-recency cell): the concept is `type is Observation`; `value type is boolean`; the `at least <N>` unit MUST be `years` (`months`/`days` are a hard error — AgeAt() is in years); and the arm combination is semantic — `code is` + `definition is age…` = recency-merge, `code is` alone = local-only, `definition is` alone = compute-only. AGE-ONLY guardrail: this is the ONE `definition is` construct sanctioned this stage — do NOT generalize the carve-out to any other `definition is` predicate. The do-not-persist of a session-asserted age answer is a documentation marker (`@business-logic-deferred` in `meta is`) today; the persistence mechanism is #190 (deferred).",
    why: "`Patient.birthDate` is a real clinical record that can COMPUTE the age, so a both-rep age concept has two genuine sources for the same fact; the recency merge lets EITHER the local age assertion OR the live compute answer — newest wins — which is why age (and age alone) earns the `definition is` carve-out the rest of the stage defers.",
    ref: "#190; patient-age recency merge; disc 173",
    clauses: [
      {
        text: "The both-rep age concept is `type is Observation`.",
        force: "invariant",
        test: "verifyLoop:patient-age-both-rep",
      },
      {
        text: "The both-rep age concept is `value type is boolean`.",
        force: "invariant",
        test: "verifyLoop:patient-age-both-rep",
      },
      {
        text: "The `at least <N>` unit MUST be `years` — `months`/`days` are a hard error (AgeAt() is in years).",
        force: "invariant",
        test: "verifyLoop:patient-age-both-rep",
      },
      {
        text: "Arm semantics: `code is` + `definition is age…` = recency-merge; `code is` alone = local-only; `definition is` alone = compute-only.",
        force: "default",
      },
      {
        text: "AGE-ONLY guardrail: this is the SOLE sanctioned `definition is` exception this stage — do NOT generalize the carve-out to any other `definition is` predicate.",
        force: "invariant",
        test: "verifyLoop:patient-age-both-rep",
      },
    ],
  },
  {
    id: "interface-concept-naming",
    edge: "cpg",
    category: "concept-model",
    rule: "Name a concept a decision's `when` references (an INTERFACE concept — the case-feature the determination consumes) as an ASKABLE phrase: the FHIR emit forms the case-feature input PROMPT by appending '?' to the concept name (\"Patient Has Active Crohns Disease\" -> \"Patient Has Active Crohns Disease?\"), so a name that reads as a yes/no question yields a sensible DTR questionnaire prompt with no separate author field. SCOPE: the emit generates a case-feature StructureDefinition + a PlanDefinition `action.input` for a TOP-LAYER directly-asserted local concept only (a single `code is` LocalSource/boolean concept the `when` asserts directly). A `when` on a `defined as`/INFERRED condition does NOT yet generate the recursive leaf inputs — deferred (#180).",
    why: "The interface concept's NAME is the human prompt the DTR questionnaire renders; an askable name produces the prompt by emit convention (+'?') with no extra grammar. Top-layer-only is the current emit reality: a directly-asserted condition maps 1:1 to one case-feature input; an inferred condition needs a recursive input over its leaves (open design — #180).",
    ref: "#180; fhir-emitter case-feature + action.input",
  },
  {
    id: "decision-qualifiers",
    edge: "cpg",
    category: "decision-shape",
    rule: "A multi-branch decision must declare a qualifier: `first:` (ordered, first match wins — requires a trailing `otherwise`), `all:` (every matching branch fires), or `any:` (over actions only — offer alternatives). A `then:` body is closed by `end.`. A single-member block takes no qualifier.",
    ref: "docs/decision-shapes.md; validator rules qualifier-required / otherwise-required / any-over-branches / first-over-actions",
  },
  {
    id: "decision-composition",
    edge: "cpg",
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
    edge: "cpg",
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
    edge: "cpg",
    category: "guards",
    rule: "A menu item in an `any:`/`all:` action block may carry `unless \"C\"` (drop when C holds) or `only when \"C\"` (include only when C holds). Guards are legal ONLY on multi-action menu members — not on inline `when … then recommend`, not on `otherwise`, not on a single menu-less action. Keep at least one ALWAYS-offered (unguarded) item so a matched branch can never produce nothing.",
    ref: "docs/decision-shapes.md; validator rule guard-on-single-action",
  },
  {
    id: "dispositions",
    edge: "cpg",
    category: "dispositions",
    rule: "Model dispositions as plain `activity` declarations. CRL has no approve/deny/pend verbs — do not invent them. Do not author rationale at the decision/recommend site; the reason a branch fired IS its triggering `when` concept, which the emitter can surface (from the concept's `meta is`). DISPOSITION TYPE follows the ACT: a CDS recommendation to ORDER a service uses `request CPGServiceRequest` (see decision-reference); a disposition that is COMMUNICATED rather than ordered uses `request CPGCommunicationRequest`. The emitter derives the request type from the act — do not over-specify it.",
    why: "CRL is general (cognitive support, CDS, prior-auth, quality measures), not tied to any one disposition vocabulary; keep the core minimal. The disposition's request type follows what the ACT is — an ORDER vs a COMMUNICATION — which the emitter derives; inventing approve/deny/pend verbs bakes one domain's taxonomy into the language.",
    ref: "crl-not-a-pa-language",
    clauses: [
      {
        text: "Model dispositions as plain `activity` declarations; CRL has no approve/deny/pend verbs — do not invent them.",
        force: "default",
      },
      {
        text: "Do not author rationale at the decision/recommend site; the reason a branch fired IS its triggering `when` concept (the emitter surfaces it from the concept's `meta is`).",
        force: "default",
      },
    ],
  },
  {
    id: "pa-disposition-set",
    edge: "prior-auth",
    category: "dispositions",
    rule: "A PA / medical-policy coverage DETERMINATION is a CONFIGURED disposition (see `configure-dispositions`): a plain local `activity` named `\"<category>.<key>\"`, where the CATEGORY is a PAS review-action — `certify`, `not-certify`, or `pended` — and the KEY is a reason/flavor the deployment declares in `crl.dispositions` (e.g. two `not-certify` reasons — a medical-necessity vs an experimental/investigational/unproven — as distinct keyed leaves). The determination is constrained STRUCTURALLY (naming no deployment activities): (1) MEMBERSHIP — every recommended determination is a CONFIGURED `<category>.<key>` (or a bare single-option `<category>`); a determination not in the deployment's configured set is invalid. (2) COMMUNICATED, not ordered — a determination is `CPGCommunicationRequest`, never a `CPGServiceRequest` service order. (3) MUTUAL EXCLUSIVITY — each case fires EXACTLY ONE determination, spanning the DELEGATED CLOSURE (parent + any chained `use decision` sub together): no reachable path may emit two in a single run (author ordered precedence with `first:` + `otherwise`; do not place two determinations under one `all:`/`any:`; a branch that both delegates and `recommend`s is the case an in-tree-only check misses). (4) FINALITY BY MODE — `standalone` (our decision IS the whole adjudication) requires FINAL leaves (certify/not-certify); a non-final `pended` (PAS A4) leaf is legitimate only in `embedded` mode (our decision feeds a larger cross-company adjudication). WHICH keyed flavors exist, and their labels/codes, are the deployment's config; whether a policy uses the RIGHT flavor where it draws a distinction is a reviewer/Judge fidelity call this rule INSTRUCTS but does not mechanically enforce. (Membership + communicated-not-ordered + finality-by-mode are ALSO validator-enforced when the project configures `crl.dispositions.options` — see `configure-dispositions`; they remain always-on per-policy invariants for unconfigured content.)",
    why: "The universal kit is customer-agnostic — it serves every deployment's content project, not one denial taxonomy. The determination vocabulary is per-deployment CONFIG (the closed set), so the kit constrains SHAPE (a communicated, mutually-exclusive, mode-appropriate-finality determination drawn from the configured set) without hard-coding any activity set; a distinct further not-certify flavor is legitimate content, not a defect (#167). The structural invariants catch the modeling defects #134 targeted — a determination modeled as a service order, an unconfigured/ad-hoc determination, a contradictory double-determination across a parent+sub.",
    ref: "#134; #167; §4; crl.dispositions",
    clauses: [
      {
        text: "COMMUNICATED, not ordered: a coverage determination is `CPGCommunicationRequest`, never a `CPGServiceRequest` service order — modeling a determination as a service order is a clinical-safety error (#134). ALSO validator-enforced (`disposition-request-type`) when `crl.dispositions.options` is configured; always-on per-policy check otherwise.",
        force: "invariant",
        test: "verifyLoop:communicated-not-ordered",
      },
      {
        text: "MEMBERSHIP: every recommended determination is a CONFIGURED `<category>.<key>` disposition (or a bare single-option `<category>`) from the deployment's `crl.dispositions` set — never an unconfigured/ad-hoc determination. ALSO validator-enforced (`disposition-not-configured`) when configured; always-on per-policy check otherwise.",
        force: "invariant",
        test: "verifyLoop:configured-membership",
      },
      {
        text: "MUTUAL EXCLUSIVITY spans the DELEGATED CLOSURE: exactly one determination per run over parent + any chained sub together; no path may emit two (a branch that both delegates and `recommend`s is the case an in-tree-only check misses). Author ordered precedence with `first:` + `otherwise`.",
        force: "invariant",
        test: "verifyLoop:mutual-exclusivity-spans-closure",
      },
      {
        text: "FINALITY BY MODE: `standalone` requires FINAL determination leaves (certify/not-certify); a non-final `pended` (PAS A4) leaf is legitimate ONLY in `embedded` mode. ALSO validator-enforced (`disposition-non-final-leaf`) when configured; always-on per-policy check otherwise.",
        force: "invariant",
        test: "verifyLoop:finality-by-mode",
      },
      {
        text: "The categories are certify / not-certify / pended (PAS review-actions). A category may carry multiple keyed flavors (e.g. two `not-certify` reasons) — WHICH keys exist, and their labels/codes, are the deployment's config, not a defect (#167). Whether a policy picks the RIGHT flavor is a reviewer/Judge fidelity call.",
        force: "default",
      },
    ],
  },
  {
    id: "configure-dispositions",
    edge: "prior-auth",
    category: "dispositions",
    rule: "A medical-policy deployment MUST configure its disposition vocabulary in the content project's `package.json` under `crl.dispositions`: a `mode` (`standalone` | `embedded`) and `options` mapping each PAS category (`certify` / `not-certify` / `pended`) to keyed reasons/flavors — `{ label, narrative?, code? }`. The activity name a policy recommends is `\"<category>.<key>\"` (e.g. `recommend activity \"not-certify.EIU\"`), authored as a plain local `activity` block (`request CPGCommunicationRequest`); the `code` on an option is a PAS review-decision-reason code in full-PAS (Approve/Deny) intent, or the larger system's own code in embedded (Met/Unmet) intent. Once `options` is configured it is the CLOSED valid set: the validator rejects any recommended activity not in it, any determination not `CPGCommunicationRequest`, and (per `disposition-mode`) a non-final leaf under `standalone`. Default vocabulary (if unconfigured): `certify.Approve` / `not-certify.Deny`.",
    why: "The determination vocabulary is per-deployment (one payer per content project) — Approve/Deny for a standalone full-PA deployment, Met/Unmet for one that is part of a larger adjudication. Making it CONFIG (not hard-coded in the language or the kit) is what lets a deployment relabel or add a flavor without re-authoring policies, and keeps the universal kit customer-agnostic. This rule is GUIDANCE — the validator does NOT error on a MISSING config (an unconfigured project keeps today's behavior); it is the nudge to configure so the closed-set + request-type + finality checks turn on.",
    ref: "crl.dispositions; #134",
  },
  {
    id: "disposition-mode",
    edge: "prior-auth",
    category: "dispositions",
    rule: "`crl.dispositions.mode` is first-class and gates FINALITY only. `standalone` — our decision IS the whole coverage adjudication; every determination leaf must be FINAL (certify / not-certify). `embedded` — our decision is a SUB-determination feeding a larger cross-company adjudication; a non-final `pended` (PAS A4) leaf is legitimate (a refer-up / need-info contribution). In BOTH modes our decision still issues EXACTLY ONE determination per run (mutual-exclusivity is not relaxed by mode — do NOT read `embedded` as permission to emit two determinations across a parent + sub).",
    why: "The customer described two operating modes: Smile as the whole PA (Approve/Deny final) vs Smile as part of a larger system (Met/Unmet contributions that the larger tree finalizes). Only finality differs — a contribution may be non-final; it is still one contribution per run. Making mode explicit lets the same policy CRL run either way per deployment, and lets the validator enforce standalone-finality without guessing.",
    ref: "crl.dispositions.mode",
  },
  {
    id: "minimalism",
    edge: "cpg",
    category: "minimalism",
    rule: "Declare the MINIMAL set that captures the clinical intent and let the emitter do the heavy lifting. Do not over-specify properties the emitter can derive.",
    ref: "declarative-not-implementation",
  },
  {
    id: "cel-cases",
    edge: "cpg",
    category: "cel",
    rule: "Author a companion `.cel`: `covers \"<CRL library>\"`; a Patient subject `fact` (`- defined by \"Patient\".`); one clinical `fact` per case-feature linked to its concept via `- defined by \"<library>\".\"<concept>\".`; and one `case` per path with `- subject is …`, the relevant `- fact is …`, and a `- result is \"<decision>\" is \"<branch>\".` oracle. The CRE satisfies a concept iff a case fact is `defined by` it.",
    ref: "decision-reference.cel; src/cre/run.ts",
  },
  {
    id: "verify-loop",
    edge: "cpg",
    category: "process",
    rule: "Verify with the MCP tools in order: validate_crl(path) clean → validate_cel(path) clean → run_decision(path) with every case's `result is` passing. validate_cel and run_decision need FILES under a project root (a package.json) — they do not accept inline code.",
    ref: "verifyLoop",
  },
  {
    id: "review-flags",
    edge: "cpg",
    category: "process",
    rule:
      "When extraction hits a problem you cannot cleanly resolve — a source ambiguity, a source self-contradiction, an " +
      "unsettled modeling fork, or a place your encoding does not match the source — author a REVIEW FLAG rather than " +
      "silently choosing. A flag is a `- meta is `@<tag>: <one-line gist>; <fields>; status open`.` line on the object it " +
      "concerns, at the NARROWEST faithful scope: `concept`, `decision`, or `library`. The four tags, by what went wrong: " +
      "`@customer-confirmable` — an EXTERNAL-stakeholder ambiguity you resolved provisionally (carry the reading you took " +
      "as `; assumption <x>`); `@internal-inconsistency` — the SOURCE contradicts itself (source-vs-source); `@open-fork` " +
      "— an INTERNAL modeling fork you encoded one way but did not settle (`; chosen <branch>`, `; alternatives <…>`); " +
      "`@fidelity-defect` — a known encoding≠source defect, with a REQUIRED `; direction over-reach|criterion-drop` " +
      "(over-reach = you ADDED logic the source doesn't support; criterion-drop = you OMITTED a source-required criterion). " +
      "Keep the `.crl` flag LEAN — a one-line gist + those fields; the RICH detail (the source quote, the options, the " +
      "reasoning) goes in a tracker ISSUE you file AT THE SAME TIME, linked with an optional `; ref #<issue>`. Author flags " +
      "`status open`. An open flag blocks Medical Validation completion. Separately, `@gap-filed` is NOT a flag — it is a " +
      "durable POINTER to an already-filed gap/issue with a REQUIRED `; ref <issue>`; it ships fine and does not gate.",
    why:
      "A silent guess buries a narrative→CRL problem inside a green-looking artifact; a flag surfaces it and prevents " +
      "Medical Validation completion while open — the review signal is the point.",
    ref: "spec/metadata-model.md (Flags); MetaTagValidator (open-flag / meta-missing-field); spec/metadata-registry.json (flag tags + gap-filed).",
    clauses: [
      {
        text:
          "When you cannot cleanly resolve a source/encoding problem during extraction, author a flag at the narrowest " +
          "faithful scope rather than silently choosing; the `.crl` flag is LEAN (gist + fields + `status open`), the rich " +
          "detail in a tracker issue filed at creation and linked with `; ref`. (`; assumption`/`; chosen`/`; alternatives` " +
          "are the semantic fields to include when they apply — not validator-required.)",
        force: "default",
      },
      {
        text:
          "`@fidelity-defect` REQUIRES `; direction over-reach|criterion-drop`, and `@gap-filed` REQUIRES `; ref <issue>` — " +
          "a missing required field is a `meta-missing-field` validator error.",
        force: "validator-enforced",
      },
    ],
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
  {
    title: "Review flag: an @open-fork on the concept it concerns (LEAN — detail in the linked issue)",
    language: "crl",
    snippet:
      'concept "BMI Threshold":\n- type is Observation.\n- meta is `@open-fork: eligibility threshold encoded as BMI-40-only, but the source also allows 35-plus-comorbidity; chosen bmi-40-only; alternatives bmi-35-plus-comorbidity; status open; ref #207`.\n- code is `bmi-threshold`.',
    valid: true,
    note: "The `.crl` flag is a one-line gist + `; chosen`/`; alternatives` (semantic, optional) + `status open` + an optional `; ref` to the tracker issue holding the full reasoning. Concept meta sits between `type is` and `code is`. An open flag blocks Medical Validation completion.",
  },
  {
    title: "Review flag: an @fidelity-defect on a DECISION (required `; direction`)",
    language: "crl",
    snippet:
      'decision "Coverage Decision":\n- meta is `@fidelity-defect: the encoding reads an axillary-only finding the source does not require; direction over-reach; status open; ref #207`.\nfirst:\n- when "Indication Present" then recommend activity "Approve".\n- otherwise then recommend activity "Deny".',
    valid: true,
    note: "Flags attach at the narrowest faithful scope — here a DECISION (leading `- meta is` before `first:`). `@fidelity-defect` REQUIRES `; direction over-reach|criterion-drop` (omitting it is a meta-missing-field error).",
  },
  {
    title: "@gap-filed is NOT a flag — a pointer to a filed gap (required `; ref`), ships fine, does not gate",
    language: "crl",
    snippet:
      'concept "Renal Function":\n- type is Observation.\n- meta is `@gap-filed: eGFR unit normalization not yet expressible; ref #180`.\n- code is `renal-function`.',
    valid: true,
    note: "A durable pointer to already-tracked work — REQUIRED `; ref`, does not block mvComplete. Contrast with a review flag (gist + discriminator + `status open`, blocks while open).",
  },
  {
    title: "Review flag at LIBRARY scope: an @internal-inconsistency spanning the whole policy",
    language: "crl",
    snippet:
      '- meta is `@internal-inconsistency: the eligibility section requires prior imaging, but the exclusions section forbids it; status open; ref #207`.',
    valid: true,
    note: "Library-scope meta is a TRAILING `- meta is` on the library statement (here right after `library \"T\".`). Use library scope for a contradiction that isn't about one concept or decision. `@internal-inconsistency` = the SOURCE contradicts itself.",
  },
];

/** The verify-loop `note`, base (edge-invariant) segment. The PA closure paragraph is appended for prior-auth. */
const VERIFY_LOOP_NOTE_BASE =
  "validate_cel and run_decision require FILES under a project root (a package.json); they do not accept inline code. In a content project's artifact-package layout, author <artifact>.crl and <artifact>.cel under the artifact's package and pass absolute paths. " +
  "PROVENANCE / PROMOTION (beyond the run_decision proof): generate the scaffold with `generate_provenance` " +
  "clusterBy:\"disposition-path\" — it clusters per RUN PATH (decision-node refs only) so it is correspondence-correct " +
  "BY CONSTRUCTION, clearing the FINAL `validate_provenance` cockpit-correspondence gate AS GENERATED (before any " +
  "source attribution). The default clusterBy:\"decision\" is the per-decision concept-attribution VIEW (it cites " +
  "concept refs that fan out / over-light the gate) — inspect with it, do NOT promote with it. " +
  "PROOF STATUS IS ORTHOGONAL TO FAITHFULNESS (§4): faithfulness decides the model, provability decides whether run_decision can prove it yet. Encode the FAITHFUL model and DEFER the proof for any construct the kit `boundary` marks out-of-scope — never substitute a less-faithful provable model, and never assert a composite to fake green (K4). Read the live proof status from `conceptLayerModel` (scope in/out) and `boundary` (e.g. a `definition is` predicate is deferred; a `use decision` delegation — bare same-library OR qualified cross-library — is evaluated) — do not hardcode a snapshot. " +
  "DURABLE proof-methodology (independent of which constructs are evaluated): ASSERT THE PATH, not just the disposition. `result is` checks disposition MEMBERSHIP only — two paths ending in the same disposition (a sub-decision's `otherwise` Deny and a parent's `otherwise` Deny) are indistinguishable, so a case short-circuiting to the WRONG `otherwise` still 'passes'. Fall-through / chained proof cases must assert the path via the run trace (`viaWhen` / nodeId) or use DISTINCT disposition activities per path.";

/** The prior-auth-only closure paragraph appended to the verify-loop `note` (the coverage cardinality invariant). */
const VERIFY_LOOP_NOTE_PRIOR_AUTH =
  " MUTUAL-EXCLUSIVITY SPANS ALL EMISSION PATHS (coverage / PA — the consumer of this invariant). The 'exactly one determination per run' invariant is evaluated over EVERY emission path — the DELEGATED CLOSURE (parent + any chained `use decision` sub together) AND `all:`/`any:` sibling FAN-OUT — not in-tree branches or delegation alone: a branch that both delegates and `recommend`s, or two determinations placed under one `all:`, each emit two determinations an in-tree-only check misses. Note BOTH `first:` and `all:` are legal branch qualifiers (validator: `first:` or `all:` over when-branches; `any:` is over ACTIONS only) — a determination authored `all:` fans out multiple outcomes and so HITS this invariant; author a determination's precedence with `first:` + `otherwise` so exactly one fires.";

const VERIFY_LOOP_BASE: Omit<VerifyLoop, "note" | "methodologyRequirements"> = {
  steps: [
    "validate_crl(path) — clean (no errors)",
    "validate_cel(path) — clean (no errors)",
    "run_decision(path) — every case's `result is` passes (status: pass)",
  ],
  proves:
    "The decision SHAPE is valid and the branch/menu WIRING produces the asserted disposition for each case's facts.",
  doesNotProve:
    "That a concept's `code is` is the clinically correct code, or that the concept-to-intent mapping is right. The CRE (v1) is asserted-only and never evaluates `code is`: a concept is satisfied purely because a case fact is `defined by` it. A green run means the wiring is right, NOT that the encoding is clinically complete or correct. " +
    "For a PATIENT-AGE BOTH-REP concept specifically: run_decision proves the both-rep concept integrates into the decision SHAPE (a satisfied case flows to the right branch), NOT the recency EXECUTION — which representation (the local age Observation vs the age computed over `Patient.birthDate`) actually wins the merge. That recency arbitration (newest wins; indeterminate → session-fresh local-source wins) is verified at the engine level via `PlanDefinition/<id>/$r5.apply` (6 cases incl. the indeterminate-recency cell), not by the asserted-only run_decision.",
};

/** The methodology requirements, edge-tagged. Assembled by chain in buildBase; a prior-auth requirement is present exactly when its anchoring prior-auth clause is. */
const METHODOLOGY_REQUIREMENTS: VerifyLoop["methodologyRequirements"] = [
  {
    id: "assert-path",
    edge: "cpg",
    text: "§4-req1 — ASSERT THE PATH, not just the disposition: `result is` checks disposition membership only, so two paths ending in the same disposition (a sub's `otherwise` Deny vs a parent's `otherwise` Deny) are indistinguishable; a fall-through / chained proof case must assert the path via the run trace (`viaWhen`/nodeId) or use DISTINCT disposition activities per path.",
  },
  {
    id: "patient-age-both-rep",
    edge: "cpg",
    text: "PATIENT-AGE both-rep structural checks (the SOLE `definition is` carve-out): the both-rep age concept is `type is Observation` + `value type is boolean`; its `definition is age today at least <N> years` unit is `years` (months/days are a hard error); and the carve-out is NOT generalized to any other `definition is` predicate. The recency-merge EXECUTION (newest of `Observation.issued` vs `Patient.meta.lastUpdated` wins; indeterminate → session-fresh local-source wins) is engine-verified at `$r5.apply` (6 cases incl. the indeterminate-recency cell), not by asserted-only run_decision (#190; disc 173).",
  },
  {
    id: "mutual-exclusivity-spans-closure",
    edge: "prior-auth",
    text: "§4-req2 — the coverage 'exactly one determination per run' invariant is checked over ALL emission paths (the DELEGATED CLOSURE — parent + any chained `use decision` sub together — AND `all:`/`any:` sibling FAN-OUT): run_decision over the policy's cases must show no run producing >1 determination, INCLUDING a branch that both delegates and `recommend`s, or two determinations placed under one `all:`. (PA is a consumer of this coverage invariant.)",
  },
  {
    id: "communicated-not-ordered",
    edge: "prior-auth",
    text: "Every determination a PA/medical-policy decision recommends is `CPGCommunicationRequest` (communicated), never `CPGServiceRequest` (ordered) — inspect the recommended activities' request types per policy (#134). AUTO when the project configures `crl.dispositions.options` (validator `disposition-request-type`); a manual per-policy check otherwise.",
  },
  {
    id: "configured-membership",
    edge: "prior-auth",
    text: "Every recommended determination is a CONFIGURED `<category>.<key>` disposition (or a bare single-option `<category>`) from the deployment's `crl.dispositions` set — never an unconfigured/ad-hoc determination (#167). AUTO when configured (validator `disposition-not-configured`); a manual per-policy check otherwise.",
  },
  {
    id: "finality-by-mode",
    edge: "prior-auth",
    text: "FINALITY BY MODE: under `standalone` mode every determination leaf must be FINAL (certify/not-certify) — a non-final `pended` (PAS A4) leaf is legitimate ONLY under `embedded` mode. run_decision has no notion of mode/finality, so this is a MANUAL per-policy check UNLESS the project configures `crl.dispositions` (then the validator enforces it: `disposition-non-final-leaf`).",
  },
];

/**
 * The PA determination MODEL surfaced on the prior-auth edge (feature: configurable PA leaves) — customer-agnostic:
 * the framework category vocabulary + the `crl.dispositions` config contract. Replaces the retired advisory facets
 * (act-modality / determination-cardinality / outcome-finality), which became concrete rules (see pa-disposition-set,
 * configure-dispositions, disposition-mode). NOT a deployment's option labels — only the spec-anchored framework.
 */
const DISPOSITION_MODEL: DispositionModel = {
  activityNamePattern: '"<category>.<key>" — a plain local `activity` (the KEY elides for a single-option category)',
  localActivityRequired: true,
  categories: DISPOSITION_CATEGORIES.map((c) => ({
    name: c.name,
    reviewActionCode: c.reviewActionCode,
    finality: c.finality,
    meaning: c.meaning,
  })),
  config: {
    location: "the content project's package.json, under `crl.dispositions`",
    shape: "{ version, mode: standalone|embedded, options: { <category>: { <key>: { label, code? } } } }",
    modes: {
      standalone: "our decision IS the whole adjudication; determination leaves must be FINAL (certify/not-certify)",
      embedded: "our decision feeds a larger adjudication; a non-final (pended) leaf is legitimate; still ONE determination per run",
    },
    closedSet: "once `options` is configured it is the CLOSED valid set (validator-enforced); an unconfigured project keeps today's behavior (no enforcement)",
    optionCode: "an option's `code` is a PAS review-decision-reason code in full-PAS (Approve/Deny) intent, or the larger system's own code in embedded (Met/Unmet) intent",
  },
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

const BOUNDARY_ENTRIES: { text: string; edge: AuthoringEdge }[] = [
  {
    text: "`definition is` predicates (count / most-recent / temporal / value thresholds — compute over a source); the SOLE exception is the patient-age both-rep `definition is age today at least <N> years` recency merge (see rule patient-age-both-rep)",
    edge: "cpg",
  },
  {
    text: "external / value-set sources (`source representation` / `coded from`)",
    edge: "cpg",
  },
  {
    text: "PA Pended (X12 278 HCR01 A4) — an async/workflow disposition resolved OUTSIDE the per-policy clinical decision; not a determination leaf",
    edge: "prior-auth",
  },
  {
    text: "emit to FHIR / CQL",
    edge: "cpg",
  },
];

/**
 * The reference artifacts, edge-tagged (#191): the PA determination exemplars (criteria / pa-determination /
 * source-delegated / disposition-arbitration) ride the `prior-auth` edge because they ARE PA coverage-determination
 * content — they recommend configured `<category>.<key>` determinations (certify/not-certify/pended) and carry their
 * own local determination `activity` blocks (validated against `crl.dispositions`; the shared vendored library was
 * retired in the configurable-PA-leaves work). The `cpg` base keeps only the pure-CDS `decision-reference` (service
 * ORDERS) + the `patient-age` carve-out. (A cpg-general criteria/delegation exemplar is deferred to the CPG-edge
 * build; the `cpg` decision RULES still teach the composition surface.)
 *
 * KNOWN GAP (deferred to the CPG-edge build): a few `cpg` RULES point by name at exemplars that ride the
 * `prior-auth` edge — `decision-composition`/`concept-form` → `criteria-decision-reference` +
 * `disposition-arbitration-reference`, `chaining-necessity` → `source-delegated-decision-reference`. For a
 * `prior-auth` author these resolve (the artifacts are in their chain); for a PURE-`cpg` author they are dead
 * prose pointers (soft doc-refs only — NOT resolvable activity refs, so closure + the hash are unaffected). The
 * fix is to author cpg-general (plain-activity) versions of those exemplars when the CPG seat is built; until
 * then the sole real consumer is the PA seat (`prior-auth`), for whom the refs resolve.
 */
const REFERENCE_ARTIFACTS: ReferenceArtifact[] = [
  {
    name: "decision-reference.crl",
    language: "crl",
    edge: "cpg",
    purpose:
      "Canonical Stage-1 decision: first:/otherwise ordered precedence + a matched branch opening an `any:` menu with `unless`/`only when` guards and an always-offered item; local `code is` concepts; plain activity dispositions.",
    source: DECISION_REFERENCE_CRL,
  },
  {
    name: "decision-reference.cel",
    language: "cel",
    edge: "cpg",
    purpose:
      "Companion cases for decision-reference.crl: Patient subject, concept-linked facts, and one `result is` oracle per path (the unless drop, the only-when enable, ordered exclusion, a plain offer).",
    source: DECISION_REFERENCE_CEL,
  },
  {
    name: "criteria-decision-reference.crl",
    language: "crl",
    edge: "prior-auth",
    purpose:
      "The model for #168: a policy's DISTINCT criteria as nested `when` decision NODES (each criterion visible/auditable; nesting = AND), PLUS one genuine `defined as` INFERENCE (a single criterion satisfiable by either of two representations). `defined as` normalizes ONE concept; it never joins distinct criteria — that is the decision tree's job.",
    source: CRITERIA_DECISION_REFERENCE_CRL,
  },
  {
    name: "criteria-decision-reference.cel",
    language: "cel",
    edge: "prior-auth",
    purpose:
      "Companion cases exercising each decision NODE + the inference operand: criterion-1 node, the nested criterion-2 node (its `otherwise` → deny), the inference resolving on either representation (drug OR physical therapy → approve), and the top-level otherwise.",
    source: CRITERIA_DECISION_REFERENCE_CEL,
  },
  {
    name: "pa-determination-reference.crl",
    language: "crl",
    edge: "prior-auth",
    purpose:
      "Canonical PRIOR-AUTHORIZATION exemplar (#134) — distinct from the CDS decision-reference (which ORDERs a service). The payer COMMUNICATES the determination via configured `<category>.<key>` local activities (certify.Approve / not-certify.Deny), validated against crl.dispositions; Pended (A4) is a non-final leaf, legitimate only in embedded mode.",
    source: PA_DETERMINATION_REFERENCE_CRL,
  },
  {
    name: "pa-determination-reference.cel",
    language: "cel",
    edge: "prior-auth",
    purpose:
      "Companion cases for the PA exemplar: qualifying diagnosis → certify.Approve; otherwise → not-certify.Deny. The determination activities are local (config-driven, no shared library).",
    source: PA_DETERMINATION_REFERENCE_CEL,
  },
  {
    name: "source-delegated-decision-reference.crl",
    language: "crl",
    edge: "prior-auth",
    purpose:
      "Exemplar B — SOURCE-REQUIRED delegation (§2/§5-B): the source NAMES a separate determination, so the policy chains to it with a BARE same-library `use decision`. NOT DRY/reuse factoring — chaining is faithful only because the source draws the boundary. The bare same-library delegation IS evaluated (recursed; the sub determination bubbles up), so the oracle names the DELEGATED disposition, not the sub-decision name. One parent + one delegated sub.",
    source: SOURCE_DELEGATED_DECISION_REFERENCE_CRL,
  },
  {
    name: "source-delegated-decision-reference.cel",
    language: "cel",
    edge: "prior-auth",
    purpose:
      "Companion cases for exemplar B: the two delegated-path cases (continuation → the sub's Approve/Deny bubbles up) + the two parent-resolved cases. The kit's unit test asserts the continuation→Deny case's PATH goes through the delegated sub (not the parent `otherwise`) — §4-req1.",
    source: SOURCE_DELEGATED_DECISION_REFERENCE_CEL,
  },
  {
    name: "disposition-arbitration-reference.crl",
    language: "crl",
    edge: "prior-auth",
    purpose:
      "Exemplar C — DISPOSITION-ARBITRATION (§1-refinement / §5-C / §6). Applicability GATE: use ONLY when a plain nested tree duplicates shared criteria across MANY overlapping pathways with outcome precedence + fall-through; for a FEW pathways prefer the plain tree (do not over-copy the sem-not arbitration). The TEMPTING-but-DON'T-chain case: ONE determination (source draws no boundary), precedence computed in the inference layer via pairwise-disjoint `sem-not` FINAL-* concepts as flat `when` siblings, approve criteria re-exposed as visible nodes (#168-clean), NO `use decision`. Two denies use DISTINCT activities (Deny vs Deny EIU) so `result is` distinguishes them.",
    source: DISPOSITION_ARBITRATION_REFERENCE_CRL,
  },
  {
    name: "disposition-arbitration-reference.cel",
    language: "cel",
    edge: "prior-auth",
    purpose:
      "Companion cases for exemplar C (verified 6/6): each pathway alone (approve), BOTH load-bearing overlap cases (a both-indication patient who fails one pathway still approves via the other — no overlap-pop), within-indication failure (Deny), off-indication (Deny EIU).",
    source: DISPOSITION_ARBITRATION_REFERENCE_CEL,
  },
  {
    name: "patient-age-both-rep-reference.crl",
    language: "crl",
    edge: "cpg",
    purpose:
      "The patient-age BOTH-REPRESENTATION exemplar — the SOLE `definition is` exception to Stage-1 'local `code is` only' (see rule patient-age-both-rep). ONE concept carries BOTH arms: `code is` (the LOCAL age Observation) + `definition is age today at least <N> years` (a live compute over `Patient.birthDate`). The Inferred layer recency-merges them (newest of the local `Observation.issued` vs `Patient.meta.lastUpdated` wins; indeterminate → session-fresh local-source wins); `Patient.birthDate` being a genuine clinical record that COMPUTES the age is what earns the carve-out. Engine-verified at `$r5.apply` (6 cases incl. the indeterminate-recency cell); the recency EXECUTION is not something asserted-only run_decision proves, so no companion CEL. AGE ONLY — do NOT generalize.",
    source: PATIENT_AGE_BOTH_REP_REFERENCE_CRL,
  },
];

/**
 * Assemble the fully edge-FILTERED kit payload for a (stage, useCase). Filtering happens HERE, before the hash
 * is taken in getAuthoringKit — so each useCase yields a distinct, stable `contentHash` over its own content.
 * `useCase` resolves to an edge chain by NAME; a unit of content is included iff its `edge` is in the chain.
 */
function buildBase(stage: AuthoringStage, useCase: AuthoringUseCase): Omit<AuthoringKit, "contentHash"> {
  const chain = USE_CASES[useCase].chain;
  const inChain = (edge: AuthoringEdge): boolean => chain.includes(edge);
  const includesPriorAuth = inChain("prior-auth");

  const verifyLoop: VerifyLoop = {
    ...VERIFY_LOOP_BASE,
    note: VERIFY_LOOP_NOTE_BASE + (includesPriorAuth ? VERIFY_LOOP_NOTE_PRIOR_AUTH : ""),
    methodologyRequirements: METHODOLOGY_REQUIREMENTS.filter((m) => inChain(m.edge)),
  };

  const base: Omit<AuthoringKit, "contentHash"> = {
    schemaVersion: SCHEMA_VERSION,
    stage,
    useCase,
    chain: [...chain],
    summary: SUMMARY,
    forceModel: FORCE_MODEL,
    conceptLayerModel: CONCEPT_LAYER_MODEL,
    rules: RULES.filter((r) => inChain(r.edge)),
    typeAllowlist: TYPE_ALLOWLIST,
    referenceArtifacts: REFERENCE_ARTIFACTS.filter((a) => inChain(a.edge)),
    examples: EXAMPLES,
    verifyLoop,
    judgeLens: JUDGE_LENS,
    feedbackUrl: FEEDBACK_URL,
    boundary: BOUNDARY_ENTRIES.filter((b) => inChain(b.edge)).map((b) => b.text),
  };
  if (includesPriorAuth) {
    base.dispositionModel = DISPOSITION_MODEL;
  }
  return base;
}

function isStage(stage: string): stage is AuthoringStage {
  return (STAGES as readonly string[]).includes(stage);
}

function isUseCase(useCase: string): useCase is AuthoringUseCase {
  return (USE_CASE_NAMES as readonly string[]).includes(useCase);
}

/**
 * Assemble the authoring kit for a (stage, useCase). Throws on an unknown stage or useCase (the MCP tool catches
 * it and returns a tool error listing the valid values). An OMITTED `useCase` resolves to the neutral `cpg` base
 * — NOT PA. A PA author must pass `useCase:"prior-auth"` explicitly (fail-loud; never silent-PA). Omitted and
 * explicit `"cpg"` return the byte-identical payload and the same `contentHash` (the default-note is out-of-band,
 * in the MCP tool description — never a hashed payload delta).
 */
export function getAuthoringKit(
  stage: string = DEFAULT_STAGE,
  useCase: string = DEFAULT_USE_CASE,
): AuthoringKit {
  if (!isStage(stage)) {
    throw new Error(`Unknown authoring stage "${stage}". Valid stages: ${STAGES.join(", ")}.`);
  }
  if (!isUseCase(useCase)) {
    throw new Error(`Unknown authoring useCase "${useCase}". Valid useCases: ${USE_CASE_NAMES.join(", ")}.`);
  }
  const base = buildBase(stage, useCase);
  const contentHash = createHash("sha256").update(JSON.stringify(base)).digest("hex");
  return { ...base, contentHash };
}
