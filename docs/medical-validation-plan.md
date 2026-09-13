# Medical Validation paths and separate regression suites

Status: remaining suite-isolation plan. **Suite selection, folder-based emission enforcement, and off-path-data diagnostics are unimplemented in 5.3.0.**
The shipped viewer is specified in [MV component view](mv-component-view.md).

## Shipped viewer

The current tree, pinned Question–Result view, attached question cards and separate
Result Questionnaire are documented in [MV component view](mv-component-view.md).
CRL Questionnaire and FHIR Questionnaire remain independently available panes.
The selected-route and deployed native views serve different purposes and may differ.
The former in-canvas detached questionnaire, its connector lines, and retirement
of the CRL Questionnaire are superseded designs, not release behavior.

## Planned suite behavior — not implemented in 5.3.0

The remaining sections describe future suite isolation. They are not instructions
to depend on current discovery or emission filtering. Until implementation, select
the actual CEL entry point and inspect returned manifests. Separate suite emission
must use isolated project/output roots because current producer-owned trees do not
protect sibling suites. Minimize clinician-facing case data while retaining required
negative prerequisites and independent engineering/native verification.

## Target layout and behavior

```text
src/cel/mv/          -> emit_cel     -> tests/data/fhir/
                    -> emit_results -> tests/results/fhir/
src/cel/regression/  -> automated regression harness only
```

Both suites use the same policy CRL. Normal emission and MV discovery use only
`mv/`. Regression cases remain valid CEL and run in automated tests. A regression
test requiring FHIR or $apply creates temporary inputs/results in its isolated
harness; it does not publish them to the policy's MV output directories.

The regression runner runs the MV suite plus additional regression cases, so MV
cases are not copied. Current CEL resolves `covers` to CRL but has no CEL-to-CEL
fact import. For now additional regression cases may repeat fact definitions.
Do not add case inheritance or a fact-sharing language feature to this change.

MV cases contain the necessary positive and negative answers, including earlier
false conditions needed to reach a later branch. Missing evidence is not No. Use
Patient/source values for calculations when appropriate rather than duplicate
local assertions. Retain distinct clinically meaningful alternatives within a
compound condition. Do not claim complete coverage merely because each activity
label appears once: different occurrences and routes can share a label.

Pause/resume and precedence/overlap controls belong in the regression suite for
this MV delivery. The viewer must still display a reached unknown correctly if a
case is incomplete. Do not manufacture a recommendation for such a case.

## Implementation sequence

### 1. Centralize CEL suite selection and output ownership

Introduce a shared project/suite resolver used by CLI, MCP and MV launch paths.
Normal project emission resolves MV entry points deterministically, validates the
complete MV case set, and writes it as one owned output set. Do not call today's
whole-tree replacement writer once per file: the last file would erase earlier
files. Resolve each CEL file's `covers` with the existing resolver; do not concatenate
CEL text or pretend CEL-to-CEL imports exist. Diagnose case/resource collisions
across the selected files before writing anything.

An MV file passed directly to normal emission selects its complete owning MV
suite, for both data and results. Use one suite-wide manifest/prune boundary for
each output tree. Stage the complete generation before promotion; if any input
validation or engine case fails, report that candidate's failures and preserve
the previous published output. Old output must not be displayed as current when
its input identity no longer matches. Test removal of one MV file and failure in
the second file, not just successful additions.

Cover direct-file invocations and active-editor shortcuts as well as folder
discovery. An explicit regression-file request to normal emission/MV must explain
the suite restriction without writing anything. Regression harnesses use the core
in-memory APIs and an isolated output root. Untyped old project layouts get a clear
migration diagnostic; do not silently classify old mixed CEL as MV.
The regression harness must require its temporary root explicitly and verify that
its resolved output is disjoint from the retained policy's generated trees; it
must never fall back to the project's normal output root.

Keep existing package-root detection, canonical settings and tests/data versus
tests/results separation. Validate input and output boundaries before replacing
generated output. Failed validation must preserve existing output. On success the
manifest and directory contents must agree, including removal of obsolete cases.

Starting points: `cel/emitter/writer.ts`, `cli/run-emitter.ts`, `mcp/server.ts`,
`cli/run-emit-results.ts`, `results/useCases.ts` and producer/manifest modules; extension `policyLaunchTarget.ts`
and `correspondenceCockpit.ts`. No CEL grammar change is needed just for folder roles.

Tests: multiple MV files, repeated fact names in independent libraries, duplicate
case/output identities, regression-only projects, explicit regression selection,
unclassified old files, failed validation, stale output removal, and identical
CLI/MCP suite selection. Automated acceptance runs both suites but checks that the
normal artifact contains only MV cases.

MV assembles the selected policy's MV cases using per-file CEL resolution and
evaluation, preserving the owning source file in every scenario/provenance join.
Share the policy tree, not a concatenated CEL AST or fact namespace. Extend the
case index/correspondence lookup to resolve exact file-and-case ownership and
diagnose ambiguous references. This includes `provenance/cockpitModel.ts` and
`provenance/correspondence.ts`, whose current single-file assumptions must change.
Update provenance generation, validation and FINAL correspondence entry points
together. Normal suite discovery, including `collectPolicyCels`, uses the shared
resolver. A regression-only or unclassified project explains what must be moved
to `mv/`; direct scratch CEL remains usable by evaluation/test APIs but is not an
implicit MV entry point.

Require unique CEL library names and frozen case IDs across the MV suite; fact
names remain local to each CEL file. Store the owning project-relative CEL path
with each manifest case and version the changed manifest schema. Use exact source
paths for provenance, accepting a basename only when unambiguous. Preserve existing
MV library, case and subject-fact names when their meaning is unchanged, avoiding
unnecessary compartment-ID churn. Do not silently carry medical approval forward
when a case's data or policy meaning changes.

Load native Q/QR through the selected policy's validated results manifest and
artifact root. Do not search the workspace for a matching compartment ID. Test
two artifacts and regression scratch outputs containing identical case IDs; the
selected policy must always supply both resources of the pair.

### 2. Re-author the two MV deliveries and regenerate provenance/results

For each retained policy delivery, inventory the authored decision paths
and assign each case to MV or regression. Keep separate CEL entry points, not a
hidden filter based on case names. Preserve useful engineering controls in
`regression/`; minimize MV facts and use clinician-readable case descriptions.
Build a coverage table against authored decisions/criteria and narrative intent,
independent of the evaluator's observed answer. Preserve required false prerequisites.

Update imports, workspace launch targets and provenance to the relocated cases.
Regenerate MV data and native Q/QR, and reconcile generated inventories. Preserve source narrative and unrelated operator edits. Verify retained generated inventories against their owning manifests before removing obsolete files.

MV completion/review progress uses the complete active MV suite, rather than the
currently opened CEL file. Preserve notes/verdict history for moved regression
cases in an explicitly archived historical set, excluded from current MV completion.
Record the migration map; do not silently delete reviews or erase unrelated stale
records. Cases whose meaning changes require review under the existing invalidation
rules. Test pre-existing sidecars, cases moved to regression, multiple MV files,
and renamed/removed cases.

Tests: all MV expected recommendations through CRE and real $apply; regression
controls in isolation, including the ephemeral QR pause/resume/clear sequence.
Check MV case picker and output manifests contain no regression cases. Both
questionnaire panes must use the newly generated cases, with valid source joins.

### 3. Viewer implementation

Superseded by [MV component view](mv-component-view.md). Use that document for
current behavior; suite-aware multi-file discovery remains work in sections 1–2.

### 4. Add MV-focused diagnostics and maintain the KE kit

Add a nonblocking diagnostic for unnecessary case evidence only when dependency
information can establish it. A fact absent from the highlighted positive path
is not sufficient: earlier false prerequisites, calculation inputs, selected
record candidates and compound-condition evidence may all matter. If evidence
cannot establish irrelevance, avoid a false warning. Apply this guidance to MV;
intentional richer regression cases must not be treated as bad authoring.

Bound the initial diagnostic to directly coded local Boolean question facts:
combine CEL fact-to-concept resolution, the authored CRL reference graph and the
CRE trace. Warn only when all references to that fact's concept are in skipped
questions and it is not an input to another concept, criterion, source pattern or
fact relationship. If any dependency cannot be resolved, issue no warning.
Keep runtime/source/selector cases outside this first diagnostic unless relevance
can be established. Owning tests include a simple unused later answer, a necessary
earlier No, an inferred dependency, unknown dependency and a regression control.

Update the canonical authoring kit, examples, migration guide, tool descriptions
and test-backed claims. Explain the two folders, normal emission, clinical path
coverage, minimal MV data, and separate engineering verification. Reuse tagged
owning-test examples. Correct the earlier guidance that deliberately rich controls
belong in the same MV set. Verify Markdown and MCP delivery and advance the kit's
audit only after the reviewed implementation is committed.

### 5. Verify the deliverable and hand it back for MV

Run affected tests/typechecks, then review substantive code before scoped commits.
Land suite enforcement with the migrations of affected repository consumers/tests
as one coherent change set; do not ship an intermediate version that rejects its
own supported fixtures. Low-level language fixtures can continue using in-memory
APIs. No temporary permissive fallback that emits unclassified mixed suites.
Use an isolated extension candidate containing the intended changes, excluding the
unrelated dirty `fhir-emitter/decision.ts` patch. Execute the retained policy deliveries
through the candidate's CLI/MCP and actual MV panes. Verify independent expected
recommendations, source highlights, case/path switching, questionnaire answers and
pin behavior. Inspect exact generated file inventories as well as manifests.

Provide the operator the two workspace/CEL entry-point links, migration steps and
verification evidence. Human medical approval remains theirs. A release follows
the separate release protocol after this implementation is validated; do not
substitute a release build for finishing the features.

## Verification limits and patch ownership

Historical development checks are recorded in the review discussions. They do not
establish the unimplemented suite contract above. Release verification is recorded
separately for the installed candidate.

Question wording changes are MV-scoped proposals. The owning KE pulls and reconciles
them in CRL scope, then validates and re-emits CQL/FHIR and results. See the current
[patch workflow](mv-presentation-patches.md).
