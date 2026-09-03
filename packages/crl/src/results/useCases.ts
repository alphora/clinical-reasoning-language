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
 * The results ROOT for a use case, relative to the artifact root — the sibling of `tests/data`.
 *
 * `tests/results/<use-case>/`
 */
export const resultsRoot = (useCase: ResultUseCase): string => `tests/results/${useCase}`;

/**
 * A case's results directory. Keyed on the SAME `compartmentId` the CEL emitter uses for the case's
 * data, so the join between a case, its data and its results is one identity rather than three.
 *
 * `tests/results/<use-case>/<compartmentId>/<resourceType>/`
 *
 * ⚠ Pass the compartment id from `EmittedCase.compartmentDir` (strip the `patient/` prefix) or
 * `ScenarioViewModel.compartmentDir` — never recompose it. It is a capped slug of library + case +
 * subject plus a 12-hex hash; `0e7641da` moved that scheme once already and every consumer that had
 * hard-coded the old shape silently matched nothing for months.
 */
export const caseResultsDir = (useCase: ResultUseCase, compartmentId: string): string =>
  `${resultsRoot(useCase)}/${compartmentId}`;

/** Where one resource type's results land for a case. Lowercase, matching the CEL emitter's convention. */
export const caseResultsTypeDir = (
  useCase: ResultUseCase,
  compartmentId: string,
  resourceType: string,
): string => `${caseResultsDir(useCase, compartmentId)}/${resourceType.toLowerCase()}`;

/** Strip the `patient/` prefix the CEL emitter carries, yielding the bare compartment id. */
export const compartmentIdOf = (compartmentDir: string): string =>
  compartmentDir.replace(/^patient\//, "");
