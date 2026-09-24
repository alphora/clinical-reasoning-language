# Bleph native acceptance fixture

For interactive Medical Validation, open [the Bleph MV workspace](../../../../../examples/bleph-medical-validation/medical-validation.code-workspace). This folder contains the frozen native regression inputs; it is not an MV workspace. The repository's **Run Bleph Medical Validation (isolated)** debugger configuration opens the MV example.

This is a migration acceptance snapshot for #320, not an authoritative CRL authoring example. Customer delivery is the priority; existing syntax and comments may be superseded by the language redesign. The suite measures the actual FHIR R4, backported R5 `$apply` result. A CRE prediction never substitutes for native evidence.

## Run

From the repository root, with dependencies installed and Java 17 or newer:

```sh
npm run test:native:checks
npm run test:native:bleph -- --engine-jar /path/to/cqf-fhir-cr-cli-definition-dcac972f.jar --out /existing/parent/new-run
```

In PowerShell use `npm.cmd` for argument forwarding. The acceptance command's `pretest:native:bleph` hook builds the core before execution; do not invoke `run.cjs` directly as a source acceptance gate. Checker tests require built core driver helpers. Java or jar absence is an error, never a skipped pass. No download or installation occurs. The jar must match `ENGINE_JAR_SOURCE` in `src/results/spawn.ts`: CRL-maintained build `cqf-definition-dcac972f`, SHA256 `fea41d5f6cc669b119b0666460855dc188c3a28f316c495b4c8ff0760d6f180f`. Source/build provenance is in [cli-build.json](../../../../../patches/cqframework/cli-build.json). Historical original-engine measurements below identify what ran at that time, not the current engine selection.

The output parent must exist and the final directory must be new and outside source/fixture directories. Outputs include exact inputs, emitted definitions/CQL, process logs, Parameters, per-case checks, toolchain/fixture/dist/harness hashes, and a completeness summary. Choose a drive with adequate space. `--java PATH` selects a runtime; `--workers 1..4` defaults to2. `--batch-size 1..32` defaults to8 cases per JVM; `--batch-size 1` starts a separate JVM for each case. `--order reverse` reverses the full case order for isolation checks; default is `forward`. Every mode runs all116 cases.

Each JVM has a768MiB heap and2 active processors. Each case has a120-second timeout and32MiB maximum per output stream. A batched JVM invokes the unchanged shipped ApplyDriver for each case, constructing a fresh parsed bundle, repository and processor while reusing loaded classes and the cached FHIR context. The test-only wrapper has committed, hash-checked Java17 classes; running acceptance still needs only a JRE. Maintainers rebuild it with `node packages/crl/scripts/native-acceptance/build-batch.cjs /path/to/javac`; compilation needs no engine extraction or download. Explicit wrapper lifecycle checks use `node --test packages/crl/scripts/native-acceptance/batch-java.test.cjs` and require a JDK (`ACCEPTANCE_JAVA` / `ACCEPTANCE_JAVAC` select executables). The ordinary checker command remains Java-free after the core build.

JVM timezone is UTC, locale en-US, and file/stdout/stderr encoding UTF-8, explicitly passed and recorded. Batched cases have separate routed logs, duration markers, results and comparisons; each command identifies its batch and exact driver arguments. Batch startup/inter-case logs and process metadata are retained and checked for engine errors. A timeout, overflow, nonzero batch exit or missing completion evidence invalidates the entire assigned batch, including earlier cases. No automatic retry hides it. Java halts a timed-out/overflowing batch; the parent also enforces a30-second startup allowance plus the sum of case timeouts. Overflow retains a bounded prefix for case files and a bounded tail for outer process streams. Cancellation and outer timeout terminate the process tree before reusing a worker; inability to confirm termination aborts the queue. A missing parent PID alone does not prove descendants are gone. Worker exceptions are retained in occurrence order so cancellation cannot hide the initiating failure.

This repository-only runner deliberately uses asynchronous isolated children rather than the interactive producer's single-flight UI lifecycle. Two workers cap Java heaps at1536MiB in aggregate, plus native/JVM/Node overhead. Four needs substantially more memory. This is an explicit test setting, not a change to production concurrency. The pinned unextracted jar and shipped `ApplyDriver.class` replace the former scratch Java/extracted-classpath harness. The current run re-establishes the measured contract under this configuration; it does not claim byte-for-byte equivalence of every old Parameters field or repository side effect.

## Independent clinical expectations and fixed transport bindings

| Suite | Cases | Pause | Met | Unmet |
|---|---:|---:|---:|---:|
| preserved |47|38|2|7|
| completed |47|0|29|18|
| supplemental |3|1|1|1|
| unknowns |19|10|5|4|

Verification on2026-09-07: both the forward and reverse batched runs pass116/116 native checks and116/116 independent CRE predictions, including49 pauses,37 Met and30 Unmet. Every recorded native verdict matches the accepted cold baseline. The public command built the core and used the original pinned engine and unchanged shipped driver; all808 dist hashes match. Four-worker forward native execution took8m03s, compared with20m02s cold at the same concurrency (about2.5x faster). Reverse execution used the default2 workers and also passed; its timing overlapped a separate isolation probe and is not a clean concurrency comparison. Eight additional calls with reused patient/Observation IDs and conflicting or missing data all passed, including returning to a pause after prior determinate outcomes. All50 checker/lifecycle controls pass (46 ordinary checks,4 explicit JDK integration checks). Evidence: `tmp/579-forward`, `tmp/580-reverse`, `tmp/580-equivalence.json`, and `tmp/580-isolation`; local reviews/dispositions are in discussions579/580. Native review converged; external coverage was unavailable. Each run retains its actual startup hashes. A subsequent progress-message formatting fix has separate regression and native verification recorded in discussion580.

The suite contains116 distinct `(suite, case)` inputs, not116 distinct decision paths. There are six activity routes and five null frontiers. Many preserved cases pause at the same frontier; their different downstream data does not mean those downstream decisions were exercised. Historical case titles ending in `-> Met` remain source identities; the CEL result assertion and frozen expectation are the current oracle.

The original CEL and original CRL closure are committed verbatim under `provenance/*.txt`. They are not discovered as executable CRL/CEL. Active copies share one migrated CRL closure. `sha256.json` pins all executable input bytes, original snapshots, expectations and transport contract; `.gitattributes` preserves their line endings. A changed hash requires a reviewed fixture change, never a runtime update of the oracle.

This is a Bleph-specific acceptance suite. Fixed case counts, disposition counts and the five admitted pause frontiers guard coverage. `expected.steps` in the older cases preserves derivation for readers; native assertions use the frozen outcome, final route/null witnesses and documented question-presence contracts. They do not compare every native evaluation step. Another policy or a new pause frontier requires its own reviewed contract.

`expected-frozen.json` was derived before native/CRE execution from original authored input literals, narrative category meaning, operator unknown semantics and the explicitly retained decision order. It contains original assertions for comparison, selected answer inputs, and independently expected outcomes. `supplemental-frozen.json` adds explicitly authored recency controls. Neither file is regenerated by the runner.

The intended rule is three-valued: false determines conjunction, true determines disjunction, otherwise an unknown operand remains unknown. Evaluate request-any → cosmetic → both-requested → the corresponding qualification/documentation guard → activity. Pause before an unknown reached guard, even if speculative later branches could reach the same disposition. Completion supplies an explicit false for each missing request determination; absence itself does not imply false. Supplemental controls cover local false winning an equal-time tie, newer ServiceRequest winning over older local false, and newest valueless local evidence leaving the request unanswered.

`unknowns-frozen.json` adds missing cosmetic purpose, indication, complaint, both individual-documentation answers, both demonstration answers, and both conformance answers. Each needed-unknown case names its unanswered input and a repair case that differs only by that input's value. Case-specific resource identities may differ. Complete photo/visual-field controls, a single-procedure indication pair, explicit negatives, true-OR and false-AND controls distinguish missing needed input from irrelevant unknowns. These expectations were fixed from the authored decision order and operator truth-table semantics before native execution. They cover these specific input combinations, not every possible missing-input combination.

Question presence is checked against the reached authored branch: B/P at the root; cosmetic when
either request is true; qualification inputs after cosmetic=false and both request statuses are known; individual documentation when
both requests are true in that branch. The needed unknown stops progression before a leaf. The
nineteen explicit missing-input cases have pinned question sets; the request and cosmetic frontier
sets exclude later qualification inputs. All six activity routes, both dispositions, five pause
frontiers and per-suite counts are checked at fixture load.

A pause requires the independently expected frontier, its named unanswered inputs, the exact returned
question set, no activity/recommendation route, and no engine/OperationOutcome errors. The pinned `dcac972f`
engine DOES emit null-warning strings, but logs the expression OBJECT, so they cannot be matched against
`pauseNullExpressions` (see the known-red note below). Those logs are not required positive evidence; the
check that compares them is currently unsatisfiable rather than informative.
These checks establish observable behavior, not an internal engine execution trace.

## What a pass requires

All116 inputs must be present exactly once, and every fixture file except the documented non-inputs must be hash-listed. Every case uses a fresh repository and processor with its exact emitted resources loaded once. Source validation and emission must succeed. Native process success, parseable complete Parameters, no OperationOutcome or logged engine error, exact activity route → recommendation wrapper → activity linkage and content, subject and Q/QR-version association, question status/required/options, and typed answers are checked independently of CRE. Activity notes are checked against their literal authored text, including Unicode.

Pause requires the independently authored frontier, named unanswered inputs, the exact question set and no activity/resource-bearing route. Fixture loading additionally checks the frontier against authored request/cosmetic/both-requested/qualification order, so relabeling a frontier fails independently of runtime logs. Legacy null warnings, if emitted, must match the declared expressions; against the pinned engine this
comparison cannot pass (see the known-red note below). This reviewed change uses structured output and subsequent repair transitions as positive evidence, not an engine trace of its internal program counter.

Activity assertions cover identity, subject, status, prohibition, payload, reason code and profile, rather than every possible FHIR element. They do not seal unlisted extensions or fields. Object property order is irrelevant. Emitted data bytes are pinned; emitted definitions and CQL are preserved with executable hashes and tested behavior, not compared to a frozen whole-bundle hash. The manifest's invocation text describes the inspected shipped driver; its recorded class hash and actual per-case arguments identify what ran.

Run outputs inside the workspace are admitted only under `tmp/`; outputs outside the workspace are also permitted. Tests use an owned directory under ignored `tmp/`, avoiding the system drive. Final comparisons sort by suite and case. In cold mode, per-case `process.json` measures process duration; in batch mode it measures that invocation inside the JVM. Batch `process.json` records whole-process duration, and the summary records native and total runner wall time. These timings are deliberately distinguished.

The final summary separately reports `nativeAccepted`, `creAccepted`, their pass counts, infrastructure failures and native acceptance mismatches. `accepted` is the paired verdict and requires both plus complete coverage. CRE exceptions, malformed results and missing predictions remain failures in their own column and do not prevent valid emitted inputs from reaching native execution. `sourceDirty` is surfaced in the summary: working-tree development runs are supported because code must be tested before commit. A green development run is not evidence of review, release or installation.

## Session verification

The current supported session adapter is documented in
[apply-session.md](../../../docs/apply-session.md). Supply the matching returned
Questionnaire by canonical along with the QuestionnaireResponse. The caller owns
explicit session data and answer/change/clear state; do not suppress native errors
or rely on QR-only extraction instructions from an older engine.

The `test:native:bleph-session` QR-only helper is historical qualification for the
4.7-derived engine shipped in earlier builds. It is not qualified for the current
upstream definition-based population engine. Its exact 3 → 11 → 11 → 3 group counts,
QR.item extraction bindings and missing-Questionnaire diagnostic exception must not
be carried into the current acceptance contract. Use the packaged adapter's native
session checks for current-engine qualification; see the release integration record.

## Direct-data suite limits

This suite is direct-data acceptance. It does not certify QuestionnaireResponse edit/resubmit, `$extract`, persisted/session merging, repository side effects, client rendering, Patient age projection, requested-code value override, arbitrary action guards, installed VSIX/npm artifacts, or all of #320. Patient is the subject here. Request concepts are Boolean determinations, not editable requested-code values. No fixture run alone establishes release readiness or full narrative coverage. Those remaining integration and packaged-artifact gates are separate.

## Historical release verification and shared helper

Release 4.122.0 recorded 116 native/116 CRE cases and four QR-only session stages
against its own 4.7-derived runtime. That evidence belongs to that engine; it does
not qualify a later engine selected by the current `cli-build.json`.

The `session.cjs` and `bmi-session.cjs` test helpers preserve their historical
request contracts. The old development overlays and their manifests are retained
as source evidence, not as current engine installation instructions. Current
runtime adoption uses the unmodified upstream engine with no overlay.

## KNOWN RED — `pauseNullExpressions` vs the pinned engine (measured 2026-09-24, CRL 6.4.9)

Measured, twice, 116 cases each: `{"cases":116,"nativePassed":67,"crePassed":116,"nativeAcceptanceFailures":49,"infrastructureFailures":0}`.
All 49 failures are the single error `Unexpected legacy null-condition warnings`, in preserved(38) / unknowns(10) /
supplemental(1); `completed` passes 47/47.

Cause. `check.cjs` scrapes `/Condition expression (.+) returned null/` from engine stderr and compares the captures to
`contract.pauseNullExpressions`, which holds CQL expression TEXT pinned on 2026-09-08 (`9100b742`). The engine adopted on
2026-09-21 (`ef474dc6`, build `dcac972f`) logs the CqfExpression OBJECT instead:

    Condition expression 'org.opencds.cqf.fhir.utility.CqfExpression@14db6db6' returned null

That is Java's default `Object.toString()`. Distinct captures in one run included `@14db6db6`, `@18970f8a`, `@19f89ead`,
`@21c565af`, `@266ff25d`, `@2d627573` — identity hashes, different every run. So the comparison can never match, and
repinning would produce a fixture that passes once and never again.

Not caused by 6.4.9. Establishing that, the same 116 cases were run against the released 6.4.8 emitter with this same
corrected contract: byte-identical counts, 67 passed / 49 failed.

Why this was invisible until now: `contract.json` also pinned a stale `planId`, so the harness aborted at fixture load
long before reaching these cases. Fixing that pin (6.4.9) is what exposed this one.

That planId staleness has the same shape and is worth stating, because it is the reason this file needs a note at all.
This suite was CORRECT when added on 2026-09-07 (`6805ff44`) and passed 116/116 that day: `decisionId` then had no root
branch, so every decision got `<pkg>-<slug>-<hash>` and `mcpm-bleph-blepharoplasty-and-blepharoptosis-repair-67a3764d4a7e`
was the genuine emitted id. `2f42c13d` (2026-09-18, "canonical policy entry points") added `isRoot ? policyIdBase(metadata)`
so a policy's entry point carries the exact package identity. It swept the eleven golden PlanDefinitions that `npm test`
reads and did not touch this fixture — because nothing automated reads this fixture. `npm test` does not run it, no CI
workflow references it, and it needs a 218 MB engine jar and minutes of JVM time, so it is pinned like a golden but swept
like documentation. Both breaks reached a release for that one reason.

The real fix is upstream — render the expression at the log site, or give `CqfExpression` a meaningful `toString()`. Until
then this check is unsatisfiable. Do NOT repin it to observed hashes. Deferred deliberately by the operator rather than
weakening a pause-verification assertion inside a release.
