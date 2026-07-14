/**
 * The `authoring_kit` payload contract.
 *
 * This is the stable shape the sibling content-project KE agents bake against
 * (MCP is the contract — they have no filesystem access to this repo). Keep it
 * structured (objects, not prose blobs) so an agent can consume it without
 * string-parsing. `schemaVersion` is bumped when THIS shape changes;
 * `contentHash` changes whenever any content byte changes (the drift identity).
 */

/** Authoring slices. v1 ships exactly one; the param exists for forward-compat. */
export type AuthoringStage = "local-decision-support";

/**
 * A specialization EDGE — the tag on a unit of kit content (#191 lattice). `cpg` is the base framework
 * (≈ full CRL, the FHIR CPG IG); `prior-auth` is the PA/medical-policy narrowing that inherits down from it.
 * Enforcement inherits down the chain: a `prior-auth` kit carries all `cpg` content plus the `prior-auth`
 * narrowings. Measure is a RESERVED sibling edge (documented, not shipped) — do NOT read the two-value union
 * as the closed set of future edges.
 */
export type AuthoringEdge = "cpg" | "prior-auth";

/**
 * A selectable USE CASE — resolves (by NAME, never by index) to an ordered chain of edges. `cpg` → `["cpg"]`;
 * `prior-auth` → `["cpg", "prior-auth"]`. Consumers traverse the chain by name so inserting a reserved edge
 * later is a non-breaking length change.
 */
export type AuthoringUseCase = "cpg" | "prior-auth";

/**
 * An ADVISORY, above-edge coverage FACET (#191). A named dimension the PA edge surfaces but whose taxonomy
 * LEVEL is not yet frozen (pending the second domain edge). Explicitly a distinct channel from `rules`/`clauses`:
 * it carries NO resolvable `test` anchor and NO force — a consumer must NOT anchor selection or inheritance to it.
 */
export interface KitFacet {
  id: string;
  name: string;
  /** Reserved — the facet's home level is TBD until the second edge forces it. */
  status: "home-TBD";
  note: string;
}

/** One concept-body form and whether it is in scope for the stage. */
export interface ConceptLayerEntry {
  /** The CRL surface form, e.g. "- code is `code`.". */
  form: string;
  /** What it means / which source it queries / which layer it is. */
  meaning: string;
  /** Whether this form is in scope ("in") or deferred ("out") for the stage. */
  scope: "in" | "out";
}

/**
 * How hard a rule (or rule clause) binds — the FORCE mechanism (kit teaching §0). An agent that
 * mechanically enforces an authoring *preference* will revert a human KE's deliberate, faithful
 * refactor, destroying intent. Force tells the agent how hard to bind, at CLAUSE granularity.
 *
 *  - `validator-enforced` — the grammar/validator rejects it; the agent need not police, the tool does.
 *  - `invariant` — a FIDELITY-TO-SOURCE constraint (an ADD or a HOLLOW vs the policy narrative), always
 *    enforced on ANY author's output, human or agent. Every invariant carries a `test` that RESOLVES to a real
 *    check — a `judgeLens.composition:<check>` source-fidelity lens or a `verifyLoop:<id>` methodology
 *    requirement; a dangling anchor IS the K4 fake-green it forbids (the force-model test enforces resolution).
 *  - `default` — blank-slate generative guidance; a FAITHFUL override STANDS (the judge gate checks
 *    faithfulness-to-source, never conformance-to-this-default).
 */
export type ForceLevel = "validator-enforced" | "invariant" | "default";

/**
 * One machine-readable clause of a rule with its binding force (§0). A rule's `rule` prose is the human
 * summary; the `clauses` are the force breakdown a reviewing agent keys on. `test` is a RESOLVABLE anchor the
 * `invariant` clause names — REQUIRED when `force === "invariant"`: either a `judgeLens.composition:<check>`
 * (a §2/§3 source-fidelity judge call) or a `verifyLoop:<id>` (a §4 per-policy methodology requirement).
 * NEVER a dangling/invented ref (that IS the K4 fake-green §0 forbids; the force-model test enforces it resolves).
 */
export interface KitRuleClause {
  text: string;
  force: ForceLevel;
  /** A resolvable anchor: `judgeLens.composition:<check>` (source-fidelity lens) or `verifyLoop:<id>` (methodology). */
  test?: string;
}

/** One authoring rule, categorized and (where possible) anchored to a source of truth. */
export interface KitRule {
  id: string;
  category: "decision-shape" | "guards" | "concept-model" | "dispositions" | "minimalism" | "cel" | "process";
  /**
   * The specialization edge this rule belongs to (#191). EXPLICIT on every rule — a `prior-auth` rule is
   * assembled only into a chain that includes `prior-auth`; a `cpg` rule is in every chain. No implicit default
   * (an omitted edge would let a PA rule silently ship in the neutral base).
   */
  edge: AuthoringEdge;
  rule: string;
  why?: string;
  /** Doc path and/or validator rule-name this derives from (not a paraphrase to trust blindly). */
  ref?: string;
  /** The machine-readable force breakdown of `rule` — its default / invariant / validator-enforced clauses (§0). */
  clauses?: KitRuleClause[];
}

/**
 * The FORCE model (kit teaching §0): how an agent must apply the kit's rules. Carried as kit content so a
 * fresh-context agent reads the binding model from the kit itself, not from out-of-band prose.
 */
export interface ForceModel {
  summary: string;
  levels: { level: ForceLevel; meaning: string }[];
  governingPrinciple: string;
}

/** A small teaching snippet. `valid` distinguishes a do-case from an intentional don't-case. `text` = a non-CRL/CEL
 *  illustration (e.g. an MCP tool call) — the example harness only CRL-validates `crl` snippets, so `text` is descriptive. */
export interface KitExample {
  title: string;
  language: "crl" | "cel" | "text";
  snippet: string;
  /** true = author this (validates clean); false = an intentional don't-case the validator rejects. */
  valid: boolean;
  /** For valid:false, the decision-shape rule the validator is expected to raise. */
  expectRule?: string;
  note?: string;
}

/** A full reference artifact, embedded inline (the package ships dist/** only). */
export interface ReferenceArtifact {
  name: string;
  language: "crl" | "cel";
  /**
   * The specialization edge this artifact belongs to (#191), CLOSURE-CORRECT: an artifact's edge is ≥ the edge
   * of every artifact it references (an exemplar that recommends into the shared `Medical Policy Determination`
   * library rides `prior-auth` with that library, so a `cpg` kit never ships a determination ref it cannot resolve).
   */
  edge: AuthoringEdge;
  purpose: string;
  /** The complete artifact text. */
  source: string;
}

/** The grammar-legal type vocabularies plus a non-binding stage-recommended subset. */
export interface TypeAllowlist {
  conceptTypes: string[];
  conceptValueTypes: string[];
  activityTypes: string[];
  stageRecommended: { conceptTypes: string[]; activityTypes: string[] };
  note: string;
}

/** The verify loop — and, crucially, what a green run does and does NOT prove. */
export interface VerifyLoop {
  steps: string[];
  proves: string;
  doesNotProve: string;
  note: string;
  /**
   * Named, durable proof-methodology requirements applied per-policy in the verify loop (§4) — the resolvable
   * home an invariant clause's `test` anchors to via `verifyLoop:<id>` when the invariant is a structural /
   * methodology check the KE applies per policy (not a static kit test and not a source-fidelity judge call).
   * Pairs with the `judgeLens.composition:<check>` anchor for source-fidelity invariants; together they make
   * EVERY invariant clause's `test` resolve to a real check (the anti-fake-green guarantee).
   *
   * Each requirement carries an `edge` (#191): a `prior-auth` requirement is assembled only into a chain that
   * includes `prior-auth`, so it is present exactly when the `prior-auth` clause that anchors it is — the
   * per-useCase resolve check never dangles.
   */
  methodologyRequirements: { id: string; edge: AuthoringEdge; text: string }[];
}

/**
 * One per provenance WAIVER kind (validators.ts `WAIVER_KINDS`). The validator surfaces every waiver as a uniform
 * manual-review for the Judge; THIS rubric carries the earned-ness weighting the severity deliberately omits — the
 * weighting axis (`weightedBy`), the adjudication `guidance`, and the `checkpoints` to walk per waiver.
 */
export interface JudgeWaiverRule {
  kind: "waiver-authored" | "waiver-ignored-span" | "waiver-intentional-unlink" | "waiver-disposition-class";
  /** The signal that ranks this waiver's scrutiny (e.g. authoredKind, MN-keyword/clinical-language, dispositionClass). */
  weightedBy: string;
  /** How to judge whether the escape is EARNED vs a finding rubber-stamped away. */
  guidance: string;
  /** Concrete questions the Judge walks for this waiver (≥1). */
  checkpoints: string[];
}

/**
 * One composition-fidelity check (kit teaching §2/§3) — the SECOND judge-lens family beside `waivers`. These
 * are the real check for the source-fidelity invariants of decision composition and chaining that have NO
 * mechanical (validator) home: whether a `use decision` chain, a `defined as` composite, or a refactor
 * INVENTS / HOLLOWS / DROPS a determination boundary or criterion vs the source. A rule's `invariant` clause
 * with a source-fidelity force points its `test` at one of these via `judgeLens.composition:<check>`.
 */
export interface JudgeCompositionRule {
  /** The check name an invariant clause's `test` references (e.g. "invented-determination-boundary"). */
  check: string;
  /** The signal that ranks/decides this check (e.g. whether a SOURCE sentence names the chained sub-determination). */
  weightedBy: string;
  /** How to judge faithful vs unfaithful — the ADD / HOLLOW / DROP discrimination. */
  guidance: string;
  /** Concrete questions the reviewing agent walks for this check (≥1). */
  checkpoints: string[];
}

/**
 * The judge-lens: how to adjudicate the source-fidelity calls that severity deliberately omits. TWO families:
 *  - `waivers` — the FINAL-mode provenance waivers `validate_provenance` surfaces (one rule per WAIVER kind);
 *  - `composition` — the decision-composition / chaining source-fidelity checks (§2/§3) with no mechanical home.
 * Both carry the earned-ness/faithfulness weighting that the uniform severity (manual-review) does not.
 */
export interface JudgeLens {
  summary: string;
  waivers: JudgeWaiverRule[];
  composition: JudgeCompositionRule[];
}

export interface AuthoringKit {
  /** Contract-shape version; bump when this interface changes. */
  schemaVersion: string;
  /** sha256 of the rest of the payload — the unforgeable drift identity (distinct + stable per useCase). */
  contentHash: string;
  stage: AuthoringStage;
  /** The resolved use case this payload was assembled for (#191). Omitted `useCase` resolves to `cpg` (the base). */
  useCase: AuthoringUseCase;
  /** The resolved edge chain, name-order (`cpg` → `["cpg"]`; `prior-auth` → `["cpg", "prior-auth"]`). */
  chain: AuthoringEdge[];
  summary: string;
  /** How an agent must apply the rules — the FORCE levels (§0). Read first. */
  forceModel: ForceModel;
  conceptLayerModel: ConceptLayerEntry[];
  rules: KitRule[];
  typeAllowlist: TypeAllowlist;
  referenceArtifacts: ReferenceArtifact[];
  examples: KitExample[];
  verifyLoop: VerifyLoop;
  /**
   * The judge-lens rubric — TWO families: `waivers` (adjudicate the FINAL-mode provenance waivers,
   * validators.ts `WAIVER_KINDS`) and `composition` (the §2/§3 decision-composition source-fidelity checks an
   * invariant clause anchors its `test` to via `judgeLens.composition:<check>`).
   */
  judgeLens: JudgeLens;
  feedbackUrl: string;
  /** What this kit does NOT cover (descriptive boundary, not a roadmap of named future stages). */
  boundary: string[];
  /**
   * ADVISORY above-edge coverage facets (#191) — present only when the chain includes `prior-auth`. A distinct
   * channel from `rules`: no `test`, no force. Reserved dimensions whose taxonomy level is not frozen until the
   * second domain edge — do NOT anchor selection or inheritance to them. (Retired for the configurable-PA-leaves
   * work — the once-abstract facets became concrete rules; the field remains for a future genuine facet.)
   */
  facets?: KitFacet[];
  /**
   * The PA determination MODEL (feature: configurable PA leaves) — present only on the `prior-auth` chain,
   * customer-agnostic. Tells the KE the framework category vocabulary (certify/not-certify/pended = PAS
   * review-actions) + the `crl.dispositions` config SHAPE the deployment fills. NOT a deployment's option labels.
   */
  dispositionModel?: DispositionModel;
}

/** The PA determination model surfaced on the prior-auth kit edge — framework categories + the config contract. */
export interface DispositionModel {
  /** The determination-leaf naming convention (a plain local activity). */
  activityNamePattern: string;
  /** The local `activity` block is required (a determination may live in a separate library; config does not generate it). */
  localActivityRequired: boolean;
  /** The framework categories (spec-anchored PAS review-actions) — the deployment configures options UNDER these. */
  categories: { name: string; reviewActionCode: string; finality: "final" | "non-final"; meaning: string }[];
  /** The `crl.dispositions` config contract the deployment fills. */
  config: {
    location: string;
    shape: string;
    modes: { standalone: string; embedded: string };
    closedSet: string;
    optionCode: string;
  };
}
