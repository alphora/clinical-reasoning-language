/**
 * The `authoring_kit` payload contract.
 *
 * This is the stable shape the sibling content-project KE agents bake against
 * (MCP is the contract — they have no filesystem access to this repo). Keep it
 * structured (objects, not prose blobs) so an agent can consume it without
 * string-parsing. `schemaVersion` advances on any kit CONTENT release (not only
 * shape changes) — it is the version the KE seats' Step-0 re-sync keys off, and it
 * is hashed into `contentHash`; the change class is recorded in the version history
 * (index.ts). `contentHash` changes whenever any content byte changes (the drift identity).
 */

/** One concept-body form and whether it is in scope in these introductory examples. */
export interface ConceptLayerEntry {
  /** The CRL surface form, e.g. "- code is `code`.". */
  form: string;
  /** What it means / which source it queries / which layer it is. */
  meaning: string;
  /** Whether this form is in scope ("in") or deferred ("out") in these introductory examples. */
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
  category:
    | "decision-shape"
    | "guards"
    | "concept-model"
    | "dispositions"
    | "minimalism"
    | "cel"
    | "process";
  /** When this guidance applies; no content is filtered out. */
  applicability: string;
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
  id: string;
  title: string;
  language: "crl" | "cel" | "text";
  snippet: string;
  /**
   * true  = author this — shape-clean (any residual errors are only `unresolved-reference` for undeclared external decls).
   * false = a don't-case. TWO kinds (see the examples harness):
   *   - WITH `expectRule` → MECHANICALLY invalid: the validator raises that decision-shape rule.
   *   - WITHOUT `expectRule` → a JUDGE-lens violation that is VALIDATOR-CLEAN (e.g. the `hollowed-criteria` vacuity
   *     trap): it shape-validates cleanly and its only errors are `unresolved-reference`. The grammar cannot see the
   *     defect — which is the whole reason the judge lens + UNIT ANCHORING exist (#234).
   */
  valid: boolean;
  /** For a MECHANICALLY-invalid valid:false case, the decision-shape rule the validator is expected to raise.
   *  OMIT for a judge-lens-only violation (validator-clean). */
  expectRule?: string;
  note?: string;
}

/** Independent proof methods; a reference may carry more than one. The payload legend states limits.
 * cre-run: this exact CRL/CEL pair runs in the kit suite; asserted activity membership or whole-decision pause prediction.
 * fhir-emit: this exact CRL emits the expected definition resources in the kit suite
 * (case-feature SDs for decision examples, ValueSet for the terminology module).
 * engine-run: historical, point-in-time construct proof by an external engine harness.
 * validate-only: this artifact is built and validated, without an execution claim.
 */
export type VerificationTier = "cre-run" | "fhir-emit" | "engine-run" | "validate-only";

/** A full reference artifact, embedded inline (the package ships dist/** only). */
export interface ReferenceArtifact {
  name: string;
  language: "crl" | "cel";
  /** When this guidance applies; no content is filtered out. */
  applicability: string;
  /** The nonempty set of independent proof methods for this artifact (see the payload `verificationLegend` for full semantics). */
  verification: [VerificationTier, ...VerificationTier[]];
  purpose: string;
  /** The complete artifact text. */
  source: string;
  requires: ArtifactRequirements;
}

/** One entry of the payload verification legend — the in-payload meaning of a `VerificationTier` (TS docstrings don't ship over MCP). */
export interface VerificationLegendEntry {
  tier: VerificationTier;
  /** What this tier's proof establishes. */
  means: string;
  /** What it explicitly does NOT prove (so a consumer never over-reads the tier). */
  doesNotProve: string;
}

/** The grammar-legal type vocabularies plus a non-binding recommended subset. */
export interface TypeAllowlist {
  conceptTypes: string[];
  conceptValueTypes: string[];
  activityTypes: string[];
  recommended: { conceptTypes: string[]; activityTypes: string[] };
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
   */
  methodologyRequirements: { id: string; applicability: string; text: string }[];
}

/**
 * One per provenance WAIVER kind (validators.ts `WAIVER_KINDS`). The validator surfaces every waiver as a uniform
 * manual-review for the Judge; THIS rubric carries the earned-ness weighting the severity deliberately omits — the
 * weighting axis (`weightedBy`), the adjudication `guidance`, and the `checkpoints` to walk per waiver.
 */
export interface JudgeWaiverRule {
  kind:
    | "waiver-authored"
    | "waiver-ignored-span"
    | "waiver-intentional-unlink"
    | "waiver-disposition-class";
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
  introduction: { goal: string; reading: string; navigation: string; auditMeaning: string };
  /** Kit version; advances on any content release (the KE seats re-sync off it), hashed into contentHash. */
  schemaVersion: string;
  /** sha256 of canonical content including navigation, excluding this field and audit metadata. */
  contentHash: string;
  summary: string;
  /** How an agent must apply the rules — the FORCE levels (§0). Read first. */
  forceModel: ForceModel;
  conceptLayerModel: ConceptLayerEntry[];
  rules: KitRule[];
  typeAllowlist: TypeAllowlist;
  referenceArtifacts: ReferenceArtifact[];
  /**
   * The in-payload legend for `ReferenceArtifact.verification` — one entry per tier a shipped artifact uses. It is
   * HASHED payload (not a TS docstring) because the remote-MCP KE consumer receives the exported kit; without it
   * `verification: "validate-only"` is an opaque string. Distinguishes the PROOF axis (is it runtime-proven?) from
   * the AUTHORING-SCOPE axis (`boundary`/`conceptLayerModel` scope) — the two are orthogonal.
   */
  verificationLegend: VerificationLegendEntry[];
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
   * The PA determination MODEL (feature: configurable PA leaves) — for authorization/coverage determinations,
   * customer-agnostic. Tells the KE the framework category vocabulary (certify/not-certify/pended = PAS
   * review-actions) + the `crl.dispositions` config SHAPE the deployment fills. NOT a deployment's option labels.
   */
  dispositionModel: DispositionModel;
  navigation: KitIndexEntry[];
  audit: KitAudit & { contentMatchesAudit: boolean };
}

/** The PA determination model for authorization/coverage determinations — framework categories + the config contract. */
export interface DispositionModel {
  /** The determination-leaf naming convention (a plain local activity). */
  activityNamePattern: string;
  /** The local `activity` block is required (a determination may live in a separate library; config does not generate it). */
  localActivityRequired: boolean;
  /** The framework categories (spec-anchored PAS review-actions) — the deployment configures options UNDER these. */
  categories: {
    name: string;
    reviewActionCode: string;
    finality: "final" | "non-final";
    meaning: string;
  }[];
  /** The `crl.dispositions` config contract the deployment fills. */
  config: {
    location: string;
    shape: string;
    modes: { standalone: string; embedded: string };
    closedSet: string;
    optionCode: string;
  };
}

/** Repository audit identity; equality of content does not establish repository audit currency. */
export interface KitAudit {
  auditedRevision: string;
  auditedSchemaVersion: string;
  auditedContentHash: string;
  scope: string;
  evidence: string;
}

export interface ArtifactRequirements {
  artifacts: string[];
  /** The tested crl object in package.json. Synthetic values are example context. */
  crl: Record<string, unknown>;
}

export type KitTopic = "orientation" | "concepts" | "answers" | "questions" | "decisions" |
  "dispositions" | "terminology" | "libraries" | "testing" | "review" | "limitations";

export interface KitIndexEntry {
  id: string;
  title: string;
  topics: KitTopic[];
  applicability: string;
  status: "current" | "counterexample" | "limitation";
  aliases: string[];
  requires: string[];
  /** Collection navigation, not duplicate content/prerequisites. Retrieve members individually. */
  members?: string[];
}

export interface KitQuery {
  view?: "overview" | "search" | "entry" | "full";
  /** Markdown exports the complete kit with its audit metadata; JSON supports every view. */
  format?: "json" | "markdown";
  query?: string;
  id?: string;
}
