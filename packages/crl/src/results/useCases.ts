/**
 * ⭐⭐ THE USE-CASE REGISTRY for emitted RESULTS.
 *
 * A "result" is what an ENGINE produced when it ran over the emitted definitions and a case's data —
 * `$apply`'s Questionnaire for prior auth, a MeasureReport for a measure. It is categorically not case
 * DATA: CEL emits the facts a case states, and owns `tests/data/fhir/patient/<compartmentId>/`. Results
 * have a different producer, different inputs and a different lifecycle, so they get their own tree.
 *
 * ⚠ THAT SEPARATION IS LILOAD-BEARING, not tidiness. An earlier design wrote generated
 * QuestionnaireResponses INTO the case compartment, where `QuestionnaireResponse` is already a legal CEL
 * emit target (`SUBJECT_RESOURCES`). Two writers in one directory forced an ownership marker, made
 * directory pruning destructive, and let a repo bundler feed a producer its own previous output. A
 * separate tree removes all three failure modes instead of guarding them.
 */

/** The use cases that produce results. Add one here and its directory follows. */
export const RESULT_USE_CASES = ["prior-auth", "measure"] as const;
export type ResultUseCase = (typeof RESULT_USE_CASES)[number];

export const isResultUseCase = (s: string): s is ResultUseCase =>
  (RESULT_USE_CASES as readonly string[]).includes(s);

/** The resource types each use case is allowed to emit. A producer emitting outside its set is a bug. */
export const USE_CASE_RESOURCE_TYPES: Readonly<Record<ResultUseCase, readonly string[]>> = {
  "prior-auth": ["Questionnaire", "QuestionnaireResponse"],
  measure: ["MeasureReport"],
};

/**
 * The results ROOT — the sibling of `tests/data`, laid out identically.
 *
 * `tests/results/fhir/`
 *
 * ⭐ NO USE-CASE SEGMENT, deliberately. The RESOURCE TYPE already discriminates: prior-auth tooling
 * reads `questionnaire/` and `questionnaireresponse/`, quality measures read the sibling
 * `measurereport/`. A `<use-case>/` segment would restate what the type dir says, and would split one
 * loadable repository into N — losing the property that makes matching the convention worth anything.
 *
 * The use case stays an ARGUMENT to the producer (it selects which engine runs) and a declaration of
 * which types that engine may emit. It is not part of the path.
 *
 * ⭐ THE `fhir/` AND `patient/` SEGMENTS ARE STRUCTURAL, NOT DECORATION. They mirror
 * `tests/data/fhir/patient/` because they carry the same two facts the cqf `IgConventions` loader reads:
 * `fhir/` is the LANE (the sibling of a `cql/` lane), and `patient/` is COMPARTMENT ISOLATION — resources
 * grouped by the patient compartment they belong to.
 *
 * ⚠ Dropping them would make this tree merely LOOK like a repository. Keeping them means a results tree
 * is itself loadable by the engine, so results can be fed back for re-verification rather than being a
 * write-only artifact. That is the whole reason to match the convention instead of inventing one.
 */
export const RESULTS_ROOT = "tests/results/fhir";
export const resultsRoot = (): string => RESULTS_ROOT;

/**
 * A case's results directory. Keyed on the SAME `compartmentId` the CEL emitter uses for the case's
 * data, so the join between a case, its data and its results is one identity rather than three.
 *
 * `tests/results/fhir/patient/<compartmentId>/<resourceType>/`
 *
 * ⚠ Pass the compartment id from `EmittedCase.compartmentDir` (strip the `patient/` prefix) or
 * `ScenarioViewModel.compartmentDir` — never recompose it. It is a capped slug of library + case +
 * subject plus a 12-hex hash; `0e7641da` moved that scheme once already and every consumer that had
 * hard-coded the old shape silently matched nothing for months.
 */
export const caseResultsDir = (compartmentId: string): string =>
  `${RESULTS_ROOT}/patient/${compartmentId}`;

/** Where one resource type's results land for a case. Lowercase, matching the CEL emitter's convention. */
export const caseResultsTypeDir = (compartmentId: string, resourceType: string): string =>
  `${caseResultsDir(compartmentId)}/${resourceType.toLowerCase()}`;

/** Strip the `patient/` prefix the CEL emitter carries, yielding the bare compartment id. */
export const compartmentIdOf = (compartmentDir: string): string =>
  compartmentDir.replace(/^patient\//, "");

/**
 * ⭐ THE GLOB a consumer uses to find a case's results, relative to an artifact root.
 *
 * ⚠ EXPORTED SO NO CONSUMER COMPOSES ONE. This is the same defect class that made the MV questionnaire
 * pane silently match nothing for months: the pane hard-coded a path, the emitter's layout moved, both
 * kept compiling, and nothing failed. A path spelled in two places is a path that will disagree in one.
 */
export const caseResultsGlob = (compartmentId: string): string =>
  `**/${caseResultsDir(compartmentId)}/{questionnaire,questionnaireresponse}/*.json`;
