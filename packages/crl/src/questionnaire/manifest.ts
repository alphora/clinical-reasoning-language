/**
 * ⭐⭐ THE PRODUCER MANIFEST — the ownership record for generated Questionnaire/QuestionnaireResponse
 * artifacts, and the ONLY thing a consumer may bind to.
 *
 * ⚠ WHY A MANIFEST AND NOT A GLOB. Two writers share `<compartment>/questionnaireresponse/`: the CEL
 * emitter (a fact whose `defined by` resolves to a QuestionnaireResponse — it is in `SUBJECT_RESOURCES`)
 * and this producer. A consumer that globs the directory and takes the first hit binds whichever file the
 * filesystem happened to return, which can be authored case data, a stale generation, or — in a
 * multi-root workspace where two checkouts share a compartment id — a file from the other checkout.
 * The manifest names the exact files, so binding is decided rather than discovered.
 *
 * ⚠ THIS IS NOT CEL EMIT. A Questionnaire is not a fact about a patient; it is what the engine ASKED
 * when `$apply` ran over the PlanDefinition. It has a different producer, different inputs and a
 * different lifecycle from case data, so it does not belong behind `emit_cel`.
 */

/**
 * A case's terminal state. EVERY eligible case gets exactly one, so "absent" is never a state a reader
 * has to interpret — the accounting invariant both review arms asked for.
 */
export type ProducerCaseState =
  /** A Questionnaire (and its QR) were produced and written. */
  | "generated"
  /**
   * `$apply` succeeded and legitimately offered no questionnaire — the path gathers no case-feature
   * input. SUCCESS, not failure. ⚠ Distinguished from a silent engine no-op by a static check: if the
   * covered closure HAS answerable concepts and this still comes back, it is a diagnostic.
   */
  | "no-questionnaire"
  /**
   * ⚠ The disposition was asserted CORRECT but `$populate` errored — overwhelmingly the known `repeats`
   * debt, which ANY re-answered question (`most recent this` recency arbitration) trips. This is its own
   * state deliberately: folding it into `failed` makes every recency case read as broken, KEs learn to
   * ignore the failure column, and that is how the one real failure ships unnoticed.
   */
  | "populate-degraded"
  /** The case ran and its outcome was wrong or absent. */
  | "failed"
  /** The batch JVM was killed on the whole-batch timeout while this case was running. */
  | "timeout"
  /**
   * ⚠ The batch died before reaching this case. A hung case cannot be interrupted inside a shared JVM —
   * process-tree kill is the only real enforcement and it takes the rest of the batch with it. Without
   * this state those cases are indistinguishable from "never eligible".
   */
  | "not-run";

/** One generated file, identified well enough to verify rather than trust. */
export interface ProducerArtifact {
  /** FHIR resource id. ALWAYS producer-owned (`isCelProducerOwnedId`). */
  id: string;
  /** Path relative to the emit root. */
  path: string;
  /** sha256 of the bytes written. The consumer re-verifies before binding. */
  sha256: string;
  resourceType: "Questionnaire" | "QuestionnaireResponse";
}

export interface ProducerCaseEntry {
  /** The authored case name — the join key back to CEL, never a slug (two names can slug alike). */
  caseName: string;
  /** From `EmittedCase.compartmentDir`; never composed by a reader. */
  compartmentDir: string;
  state: ProducerCaseState;
  /** Present iff `state === "generated"`. */
  artifacts?: ProducerArtifact[];
  /** The PlanDefinition applied, so a reader can tell which definition produced this. */
  planDefinition?: { url: string; version?: string };
  /** The `result is` oracle and what `$apply` actually produced. */
  expectedDisposition?: string;
  actualDisposition?: string;
  /** Why, for every non-`generated` state. Always present when the state is not `generated`. */
  reason?: string;
}

export interface ProducerManifest {
  schemaVersion: 1;
  /** The CEL library this manifest covers. One manifest PER CEL SOURCE — a single shared file at the
   *  emit root would lose the ownership records of every other CEL library writing there. */
  celLibrary: string;
  /** Absolute-free identity of the run's inputs, so a reader can tell stale from current. */
  generatedAt: string;
  /** ⚠ Records WHAT PRODUCED THIS, because a stale definition closure makes the CEL oracle and `$apply`
   *  evaluate different source versions and nothing else would reveal it. */
  provenance: {
    crlVersion: string;
    /** sha256 of the producer jar actually launched. */
    producerJarSha256?: string;
    /** Digest over the emitted definition closure (PD + Libraries + SDs + CodeSystems). */
    definitionClosureSha256?: string;
  };
  cases: ProducerCaseEntry[];
}

/** The manifest filename for a CEL library, at the emit root. Deterministic so a reader can find it. */
export const producerManifestName = (celLibrarySlug: string): string =>
  `questionnaire-manifest-${celLibrarySlug}.json`;

/**
 * Resolve the artifacts a consumer should bind for a case — the ONLY supported lookup.
 *
 * Returns undefined when the manifest has no entry for the compartment (never run, or the case was not
 * eligible) or when its state is not `generated`. ⚠ A non-`generated` state is NOT an error here: the
 * caller renders the state, so "no form because the policy asked nothing" stays distinguishable from
 * "no form because the producer failed" — which a glob could never express.
 */
export function resolveCaseArtifacts(
  manifest: ProducerManifest,
  compartmentDir: string,
): ProducerCaseEntry | undefined {
  const entry = manifest.cases.find((c) => c.compartmentDir === compartmentDir);
  return entry?.state === "generated" ? entry : undefined;
}

/** The state to report for a compartment, including "this producer has never seen it". */
export function caseState(
  manifest: ProducerManifest | undefined,
  compartmentDir: string,
): ProducerCaseState | "not-in-manifest" {
  if (!manifest) return "not-in-manifest";
  return manifest.cases.find((c) => c.compartmentDir === compartmentDir)?.state ?? "not-in-manifest";
}
