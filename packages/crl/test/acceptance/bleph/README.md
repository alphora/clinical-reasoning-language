# Bleph native acceptance fixture

This is a migration acceptance snapshot for #320, not an authoritative CRL authoring example. Customer delivery is the priority; existing syntax and comments may be superseded by the language redesign. The suite measures the actual FHIR R4, backported R5 `$apply` result. A CRE prediction never substitutes for native evidence.

## Run

From the repository root, with dependencies installed and Java 17 or newer:

```sh
npm run test:native:checks
npm run test:native:bleph -- --engine-jar /path/to/cqf-fhir-cr-cli-4.7.0.jar --out /existing/parent/new-run
```

In PowerShell use `npm.cmd` for argument forwarding. The acceptance command's `pretest:native:bleph` hook builds the core before execution; do not invoke `run.cjs` directly as a source acceptance gate. Checker tests require built core driver helpers. Java or jar absence is an error, never a skipped pass. No download or installation occurs. The jar must match `ENGINE_JAR_SOURCE` in `src/results/spawn.ts`: CQFramework4.7.0, SHA256 `10e6ae4e0846671bdfb8005fd577e9c195c7e9896bbd21342002eecd055e6ae0`.

The output parent must exist and the final directory must be new and outside source/fixture directories. Outputs include the exact repository inputs, emitted definitions/CQL, process logs, Parameters, per-case checks, toolchain/fixture/dist/harness hashes, and a completeness summary. They are never overwritten or automatically deleted. Choose a drive with adequate space. `--java PATH` selects a runtime; `--workers 1..4` defaults to2. Each JVM has a768MiB heap,2 active processors,120-second process timeout, and32MiB maximum per output stream. JVM timezone is UTC, locale en-US, and file/stdout/stderr encoding UTF-8, explicitly passed and recorded. Timeout, cancellation and output overflow are infrastructure failures, not clinical outcomes. Overflow retains a bounded log tail and can never pass. Tree termination must finish before a worker is reused; inability to confirm termination aborts the queue. A missing parent PID alone does not prove descendants are gone. All worker failures are retained in occurrence order so cancellation cannot hide the initiating failure.

This repository-only runner deliberately uses asynchronous isolated children rather than the interactive producer's single-flight UI lifecycle. Two workers cap Java heaps at1536MiB in aggregate, plus native/JVM/Node overhead. Four needs substantially more memory. This is an explicit test setting, not a change to production concurrency. The pinned unextracted jar and shipped `ApplyDriver.class` replace the former scratch Java/extracted-classpath harness. The current run re-establishes the measured contract under this configuration; it does not claim byte-for-byte equivalence of every old Parameters field or repository side effect.

## Independent clinical expectations and fixed transport bindings

| Suite | Cases | Pause | Met | Unmet |
|---|---:|---:|---:|---:|
| preserved |47|38|2|7|
| completed |47|0|29|18|
| supplemental |3|1|1|1|

Verification on2026-09-07:97/97 native passes and97/97 independent matching CRE predictions, including39 pauses,32 Met and26 Unmet. The public command built the core and ran the original pinned engine with explicit JVM encoding/locale settings. Final checker replay over all97 captured results also passed. All30 checker/lifecycle controls pass, including in an isolated copy with built core but no pre-existing ignored directories. Native evidence is in `tmp/576-native-final`; final replay and808 unchanged dist-file hashes are in `tmp/576-final-r4-integrity.json`. Local review history is in discussions575/576. The last CLI/output-order and test-setup refinements were separately checked after launch; the run manifest preserves its actual startup hashes rather than claiming those later changes ran retroactively.

These are97 distinct `(suite, case)` inputs, not97 distinct decision paths. There are six activity routes and two request-unknown frontiers. Many preserved cases pause at the same frontier; their different downstream data does not mean those downstream decisions were exercised. Historical case titles ending in `-> Met` remain source identities; the CEL result assertion and frozen expectation are the current oracle.

The original CEL and original CRL closure are committed verbatim under `provenance/*.txt`. They are not discovered as executable CRL/CEL. Active copies share one migrated CRL closure. `sha256.json` pins all executable input bytes, original snapshots, expectations and transport contract; `.gitattributes` preserves their line endings. A changed hash requires a reviewed fixture change, never a runtime update of the oracle.

This is deliberately a Bleph-specific acceptance suite, not a generic400-policy framework. Its fixed case count and two admitted request-pause frontiers prevent silently dropping cases or claiming unsupported pause coverage. `expected.steps` preserves the independent derivation for readers; native assertions use the frozen outcome, final route/null witnesses and explicitly documented question-presence rules, not a claim to compare every native evaluation step. Another policy or a new pause frontier requires its own reviewed contract.

`expected-frozen.json` was derived before native/CRE execution from original authored input literals, narrative category meaning, operator unknown semantics and the explicitly retained decision order. It contains original assertions for comparison, selected answer inputs, and independently expected outcomes. `supplemental-frozen.json` adds explicitly authored recency controls. Neither file is regenerated by the runner.

The intended rule is three-valued: false determines conjunction, true determines disjunction, otherwise an unknown operand remains unknown. Evaluate request-any → cosmetic → both-requested → the corresponding qualification/documentation guard → activity. Pause before an unknown reached guard, even if speculative later branches could reach the same disposition. **No non-request concept is null in these97 inputs; unknown-guard behavior below the request gate is unmeasured.** Completion supplies an explicit false for each missing request determination; absence itself does not imply false. Supplemental controls cover local false winning an equal-time tie, newer ServiceRequest winning over older local false, and newest valueless local evidence leaving the request unanswered.

Question presence is a measured transport compatibility contract, separate from the independent clinical outcome: B/P are present; cosmetic only when either request is true; qualification inputs in the entered non-cosmetic arm; individual-documentation inputs only when both requests are true in that arm. The checker demands exactly present/answered, present/unanswered, or absent for every binding. An absent question never verifies its stored input value. The measured set is consistent with the engine gathering considered actions' inputs, including alternatives after a null condition; it must not be inferred from CQL short-circuit evaluation alone. This suite does not prove that causal mechanism or Questionnaire nesting/enableWhen behavior.

At the both-requested null frontier, the engine can return later qualification inputs while a request determination is still missing. Recording that set does not endorse it as the desired user experience: limiting visible questions to the needed input remains an integration acceptance gap. The existing operator goal remains in force; no new ruling is required to retain that gap. All six activity routes, both dispositions, both null frontiers and the per-suite outcome counts above are explicitly checked at fixture load.

`contract.json` freezes mechanical FHIR bindings (definition URLs, value element types, coding systems, recommendation wrappers and action-route titles). These identities and title composition were observed in previously measured artifacts and cross-checked against the authored concept/decision mapping. They are an implementation compatibility contract, not an independently derived clinical oracle. Likewise `emitted-inputs.json` freezes the prior accepted CEL-emitted resource bytes; it detects unintended changes to what the engine receives. Intended identity or data-format migrations require an explicit review of these files.

## What a pass requires

All97 inputs must be present exactly once, and every fixture file except the documented non-inputs must be hash-listed. Every case uses a fresh repository/process with its exact emitted resources loaded once. Source validation and emission must succeed. Native process success, parseable complete Parameters, no OperationOutcome or logged engine error, exact activity route → recommendation wrapper → activity linkage and content, subject and Q/QR-version association, question status/required/options, and typed answers are checked independently of CRE. Activity notes are checked against their literal authored text, including Unicode.

Pause additionally requires no activity or resource-bearing route, named unanswered request inputs, the measured question set, and the expected native null-condition warnings. CQFramework logs the expression that returned null; this is useful native location evidence even though Parameters has no `paused` field. `contract.json` freezes the two request expression/complement pairs for this pinned engine. These fixed activity cases have no such warnings. This is not a language rule that forbids an activity whenever any concept is unknown: an off-path missing concept need not produce an evaluated null-condition warning. Other policies or frontiers require their own witness contract. A future engine/logging change must be reviewed; it cannot silently remove the witness.

Activity assertions cover identity, subject, status, prohibition, payload, reason code and profile, rather than every possible FHIR element. They do not seal unlisted extensions or fields. Object property order is irrelevant. Emitted data bytes are pinned; emitted definitions and CQL are preserved with executable hashes and tested behavior, not compared to a frozen whole-bundle hash. The manifest's invocation text describes the inspected shipped driver; its recorded class hash and actual per-case arguments identify what ran.

Run outputs inside the workspace are admitted only under `tmp/`; outputs outside the workspace are also permitted. Tests use an owned directory under ignored `tmp/`, avoiding the system drive. Final comparisons sort by suite and case; per-case `process.json` retains duration for comparison with the fixed timeout.

The final summary separately reports `nativeAccepted`, `creAccepted`, their pass counts, infrastructure failures and native acceptance mismatches. `accepted` is the paired verdict and requires both plus complete coverage. CRE exceptions, malformed results and missing predictions remain failures in their own column and do not prevent valid emitted inputs from reaching native execution. `sourceDirty` is surfaced in the summary: working-tree development runs are supported because code must be tested before commit. A green development run is not evidence of review, release or installation.

## Limits

This suite is direct-data acceptance. It does not certify QuestionnaireResponse edit/resubmit, `$extract`, persisted/session merging, repository side effects, client rendering, Patient age projection, requested-code value override, arbitrary action guards, installed VSIX/npm artifacts, or all of #320. Patient is the subject here. Request concepts are Boolean determinations, not editable requested-code values. No fixture run alone establishes release readiness or full narrative coverage. Those remaining integration and packaged-artifact gates are separate.
