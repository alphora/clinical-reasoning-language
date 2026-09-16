/**
 * ⭐⭐ THE RESULTS MANIFEST — the per-run record of what an engine produced for each case, and the
 * authority a consumer binds to.
 *
 * ⚠ WHY A MANIFEST AND NOT A DIRECTORY LISTING. A directory can only say what files exist. It cannot
 * distinguish the three states a reader must tell apart: the engine legitimately produced no result for
 * this case, the run FAILED for this case, and the producer has never run at all. All three look like an
 * empty directory. Every eligible case therefore gets exactly one terminal state here.
 *
 * Results live under `tests/results/fhir/`, separate from the CEL emitter's
 * `tests/data/fhir/patient/`. An earlier design co-located them in the case compartment and needed an
 * id-level ownership marker to survive sharing a directory with CEL-emitted `QuestionnaireResponse`
 * facts; the separate tree removes that problem rather than guarding it.
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
   * input. Inspect against the case-specific native expectations: inputs elsewhere in the
   * definition closure do not prove this route should have returned a form.
   */
  | "no-questionnaire"
  /**
   * ⚠ `$populate` errored while the engine still returned output — overwhelmingly the known `repeats`
   * debt, which ANY re-answered question (`most recent this` recency arbitration) trips. Its own state
   * deliberately so the case remains distinguishable from other engine failures. Aggregate
   * unsuccessful counts include this state; inspect the per-case state and reason for the distinction.
   *
   * ⚠ THIS STATE ASSERTS NOTHING ABOUT THE DISPOSITION. An earlier version of this comment said "the
   * disposition was asserted CORRECT", which the implementation cannot support: V1 runs a baseline
   * `$apply` and does not compare the outcome to the `result is` oracle at all. Claiming verified
   * correctness that nothing measures is worse than claiming nothing.
   */
  | "populate-degraded"
  /** The engine run failed or its expected output was absent or unreadable. */
  | "failed"
  /** The case reached its wall timeout and owned-process cleanup was confirmed. */
  | "timeout"
  /** Queue stopped before this case could run. */
  | "not-run";

/** One generated file, identified well enough to verify rather than trust. */
export interface ProducerArtifact {
  /** FHIR resource id, as the ENGINE returned it. ⚠ NOT validated as producer-owned: results
   *  live in their own tree, so nothing else writes here and no ownership predicate is needed. */
  id: string;
  /** Path relative to the emit root. */
  path: string;
  /** sha256 of the bytes written, retained for inspection and verification. */
  sha256: string;
  resourceType: string;
}

export interface ProducerCaseEntry {
  // REFACTOR:grounded: distinguish same-named cases in independent CEL files.
  sourceFile?: string;
  caseId?: string;
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
  /** The queue/server must stop: owned-process cleanup could not be confirmed. */
  cleanupUncertain?: boolean;
  inputSha256?: string;
  /** Actual execution time; preserved when retry retains this result. */
  producedAt?: string;
  reused?: boolean;
}

export interface ProducerManifest {
  schemaVersion: 1;
  /** The selected case set: mv or regression. Entries retain their individual source files. */
  celLibrary: string;
  /** Which engine produced these — `prior-auth` (Questionnaire/QR), `measure` (MeasureReport), … */
  useCase: string;
  /** Timestamp of this production run; not a source-freshness guarantee. */
  generatedAt: string;
  /** ⚠ Records WHAT PRODUCED THIS, because a stale definition closure makes the CEL oracle and `$apply`
   *  evaluate different source versions and nothing else would reveal it. */
  provenance: {
    crlVersion: string;
    /** sha256 of the producer jar actually launched. */
    producerJarSha256?: string;
    /** Digest over the emitted definition closure (PD + Libraries + SDs + CodeSystems). */
    definitionClosureSha256?: string;
    /** CEL replay clock, separate from live JVM execution time. */
    inputClock?: string;
    runtimeSha256?: string;
  };
  cases: ProducerCaseEntry[];
}

/** The manifest filename for a CEL library, at the emit root. Deterministic so a reader can find it. */
export const suiteResultsManifestPath = (purpose: "mv" | "regression" = "mv"): string =>
  `tests/results/questionnaire-manifest-${purpose}.json`;

export const producerManifestName = (celLibrarySlug: string): string =>
  `questionnaire-manifest-${celLibrarySlug}.json`;

/**
 * Resolve the artifacts a consumer should bind for a case.
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
