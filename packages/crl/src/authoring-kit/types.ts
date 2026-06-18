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
  feedbackUrl: string;
  /** What this kit does NOT cover (descriptive boundary, not a roadmap of named future stages). */
  boundary: string[];
}
