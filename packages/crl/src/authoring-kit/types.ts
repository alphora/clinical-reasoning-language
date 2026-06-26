/**
 * The `authoring_kit` payload contract.
 *
 * This is the stable shape the sibling `crl-content` KE agents bake against
 * (MCP is the contract — they have no filesystem access to this repo). Keep it
 * structured (objects, not prose blobs) so an agent can consume it without
 * string-parsing. `schemaVersion` is bumped when THIS shape changes;
 * `contentHash` changes whenever any content byte changes (the drift identity).
 */

/** Authoring slices. v1 ships exactly one; the param exists for forward-compat. */
export type AuthoringStage = "local-decision-support";

/** One concept-body form and whether it is in scope for the stage. */
export interface ConceptLayerEntry {
  /** The CRL surface form, e.g. "- code is `code`.". */
  form: string;
  /** What it means / which source it queries / which layer it is. */
  meaning: string;
  /** Whether this form is in scope ("in") or deferred ("out") for the stage. */
  scope: "in" | "out";
}

/** One authoring rule, categorized and (where possible) anchored to a source of truth. */
export interface KitRule {
  id: string;
  category: "decision-shape" | "guards" | "concept-model" | "dispositions" | "minimalism" | "cel" | "process";
  rule: string;
  why?: string;
  /** Doc path and/or validator rule-name this derives from (not a paraphrase to trust blindly). */
  ref?: string;
}

/** A small teaching snippet. `valid` distinguishes a do-case from an intentional don't-case. */
export interface KitExample {
  title: string;
  language: "crl" | "cel";
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
 * The judge-lens: how to adjudicate the FINAL-mode waivers `validate_provenance` surfaces (one rule per WAIVER kind).
 * Severity is uniform manual-review by design — surface-then-adjudicate is auditable — so the earned-ness weighting
 * lives HERE (+ in each finding's message), never in the severity.
 */
export interface JudgeLens {
  summary: string;
  waivers: JudgeWaiverRule[];
}

export interface AuthoringKit {
  /** Contract-shape version; bump when this interface changes. */
  schemaVersion: string;
  /** sha256 of the rest of the payload — the unforgeable drift identity. */
  contentHash: string;
  stage: AuthoringStage;
  summary: string;
  conceptLayerModel: ConceptLayerEntry[];
  rules: KitRule[];
  typeAllowlist: TypeAllowlist;
  referenceArtifacts: ReferenceArtifact[];
  examples: KitExample[];
  verifyLoop: VerifyLoop;
  /** The judge-lens rubric for adjudicating the FINAL-mode provenance waivers (validators.ts `WAIVER_KINDS`). */
  judgeLens: JudgeLens;
  feedbackUrl: string;
  /** What this kit does NOT cover (descriptive boundary, not a roadmap of named future stages). */
  boundary: string[];
}
