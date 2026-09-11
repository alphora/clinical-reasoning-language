# Medical Validation paths and separate regression suites

Status: implementation plan, 2026-09-11. The operator authorized implementation;
publication is a later gate. Existing partial viewer changes are not a delivered build.

## Outcome

Medical Validation presents the policy's distinct question paths with the answers
needed to demonstrate each path and its recommendation. A clinician must not need
an explanation of an engineering test to understand a case. Regression controls
exercise the same CRL separately and do not appear in normal emitted content or MV.

The operator can open RX501.117 or Bleph, select a leaf and a path, and see the
selected tree route, its question cards and source text. The deployed FHIR Q/QR view
shows the complete unmodified $apply result for the associated case. These views
serve different purposes and may legitimately differ. Switching selections
refreshes those panes. A leaf pin controls tree focus independently of selection.


## Pinned question cards

Pinning establishes the inspected route. Walk its nodes to construct read-only
question cards with authored presentation text and CEL-evaluated values. Do not
construct a whole-case questionnaire and subsequently filter its questions.
Cards normally attach above their owning condition nodes. A layout toggle moves
those same cards into a vertical column above the branch, within the same canvas,
retaining connector lines to their owning nodes. The toggle changes layout only.
Unpin removes cards and restores the full tree. Pin snapshots survive ordinary
selection changes with their case/route identified, and clear on model rebuild.

The standalone CRL Questionnaire pane is retired from launch, settings and saved
pane restoration. The optional deployed FHIR Questionnaire remains available and
shows the unmodified full case result from $apply. Different contents are expected
because the two views serve different purposes. No native output is trimmed.
## Agreed layout and behavior

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

For RX501.117 and the retained Bleph example, inventory the authored decision paths
and assign each case to MV or regression. Keep separate CEL entry points, not a
hidden filter based on case names. Preserve useful engineering controls in
`regression/`; minimize MV facts and use clinician-readable case descriptions.
Build a coverage table against authored decisions/criteria and narrative intent,
independent of the evaluator's observed answer. Preserve required false prerequisites.

Update imports, workspace launch targets and provenance to the relocated cases.
Regenerate MV data and native Q/QR, and reconcile generated inventories. The 41
obsolete HCSC generated files previously blocked from removal remain an explicit
cleanup item; do not claim a clean delivered inventory until verified. Preserve
source narrative and unrelated operator edits. Remove only task-owned temporary
customer copies after retained artifacts and verification are complete.
The exact obsolete-file inventory is `tmp/mv-install-minimal-hcsc.json` (`removes`).

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

### 3. Finish the questionnaire and tree presentation

Complete and review the partial source edits already present:

- Show the selected case's reached questions; omit skipped conditions even when
  extra case data supplies their answers. Reached unknown questions stay visible.
  Known calculated values are not mislabeled as explicit user answers. Preserve
  every operand inside a retained compound explanation; do not simplify its logic
  by deleting unknown operands. Verify reference-only criteria deliberately.
  Preserve explanations for false calculated conditions as well as true/unknown.
  A selected route scopes the MV questions and pin. Parallel execution may remain
  in the unmodified deployed view. Selecting a route never changes answers or
  evaluation; if the case does not reach the requested route, expose that mismatch.
- Render one condition with Yes/No successors rather than an independent
  `otherwise` condition box. Preserve fallback source/review identities on its
  connector. Respect `first`, `all` and `any`, nested blocks, delegated decisions,
  and multiple occurrences of the same activity.
  For `first`, No advances to the next condition, and the last No reaches the
  fallback. Without a fallback it produces no invented leaf. Preserve parallel
  `all`/`any` evaluation and action-guard explanations; an action guard is not
  silently redrawn as a first-block fallback.
- Show green/red halos for evaluated true/false conditions, with a distinct unknown
  indication. A supplied value alone is not proof that a condition was evaluated.
  Keep path selection and medical-review verdict styling distinguishable.
- Make solid and dashed connectors consistently thicker and visible in light and
  dark themes. Verify readability at practical zoom levels.
- Offer a pin on the selected path's leaf. Clicking the pin focuses/unfocuses the
  tree; ordinary selection does not unpin it. Pin the selected route, retaining its
  required earlier false conditions. Keep necessary decision roots,
  reached delegation connectors and explanations visible. Preserve the snapshot
  across selections and harmless re-renders; clear it on a semantic model rebuild. Provide a
  visible pinned-state/unpin affordance, keyboard operation and an explanation if
  a cross-pane selection points outside the pinned tree.

Use the stable structural node key for the pinned leaf occurrence, not its label
or generated SVG ID. The value-provenance wording above means avoid claiming an
answer was explicitly supplied when the viewer only knows its evaluated value;
it does not add an unsupported asserted-versus-calculated badge to native QR.

Execution is the authority for the blue tree path, case/path lookup, questionnaire
membership and pinning. Authored provenance is only the source correspondence
dependency. Incorrect or absent source mappings must not add or remove executed
nodes, questions or selectable cases. Missing or malformed provenance must produce
a source-pane diagnostic without preventing CRL/CEL model construction. Verify
actual launch with absent and malformed provenance, not only helper calls with
empty maps. Existing correspondence-driven tree lookup and the all-pane discovery
gate still need replacement; the questionnaire filtering change alone does not
satisfy this requirement.

Tests: true/false/unknown routes, skipped answers, criterion explanations, nested
and delegated graphs, duplicate leaf labels, pin persistence/unpin, stale render
messages, source refresh and keyboard interaction. Actual installed extension
checks follow unit tests; source changes alone do not update the user's viewer.

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
unrelated dirty `fhir-emitter/decision.ts` patch. Execute both real policy deliveries
through the candidate's CLI/MCP and actual MV panes. Verify independent expected
recommendations, source highlights, case/path switching, questionnaire answers and
pin behavior. Inspect exact generated file inventories as well as manifests.

Provide the operator the two workspace/CEL entry-point links, migration steps and
verification evidence. Human medical approval remains theirs. A release follows
the separate release protocol after this implementation is validated; do not
substitute a release build for finishing the features.

## Current evidence and limits

The integrated viewer slice passes 385 targeted viewer checks (plus three existing
expected failures) and 157 core publication/presentation checks. In the isolated
development extension, RX501.117 verified five selected-route cards, both layouts,
MV-only patch saving with unchanged CRL hashes, persistent pinning across re-render
and case changes, and current-case colors after unpinning. Removing source
provenance preserves tree/cards and reports unavailable source correspondence.
Bleph verified eighteen route cards, including four coded supporting answers and
their authored presentation text. Uncoded definition helpers expose supporting
values; helpers with representation projectors are not expanded through that
bounded display traversal.

These are source and development-host results, not an installed release or human
Medical Validation. The preceding released-5.2.0 native checks covered 23 HCSC and
69 Bleph cases; no new full native run is claimed for this viewer slice. Suite-aware
routing and final installed delivery remain governed by the rest of this design.

Each implementation stage gets its detailed plan/code review and readable review
records. The native/external reviewers advise; operator intent above governs.

## Presentation patch ownership

Card text and descriptions can be edited as MV-scoped proposals. Save never modifies CRL directly. The owning KE pulls the proposal, applies it in CRL scope, and re-emits CQL/FHIR and results. See [the patch workflow](mv-presentation-patches.md). This supersedes the earlier direct-edit suggestion.
