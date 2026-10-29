# Native apply sessions

`@smile-digital-health/crl/session` exports `applySession`, `buildSessionResponse`, and their TypeScript types. `crl-apply-session` runs the same operation from a JSON request file. The VSIX carries equivalent standalone CommonJS bundles in `dist/apply-session.js` and `dist/crl-apply-session.js`, with this guide beside them. These tools require Node and JRE 17 or newer; users do not compile Java or unpack the engine.

Each call performs one native R4 PlanDefinition `$r5.apply`. The caller supplies its current data explicitly. There is no hidden session, persistence service, inferred timestamp, or automatic reconciliation of previously extracted resources.

The process-default pool starts with one reusable JVM. Independent jobs can run on
multiple configured workers; each worker keeps its JVM warm across jobs. Each evaluation still constructs its own
repository, evaluation settings, terminology expansion caches and processor. Compiled library/model definitions may be reused only for identical current definition content; changing an embedded definition invalidates the retained generation. Clinical values and evaluated results are never retained between calls. External library-content URLs and ambiguous nested knowledge use fresh compilation. A reservation keeps
runtime fingerprinting and evaluation on the same runtime specification. Calls on one owner execute sequentially; cancelling queued work leaves active
siblings untouched.
An active timeout, cancellation or native failure retires the worker. The failed
request is not replayed; the next request can start a clean worker. Unconfirmed
cleanup blocks further launches until the tool process restarts. The worker has its
own temporary directory, independent of any request's evidence directory.

`shutdownNativeRuntime()` waits for prior accepted operations, retires all native
workers and releases heap reservations. Later calls can start fresh workers. Tool
exit also closes them; cleanup uncertainty rejects shutdown. `applySession` accepts `nativeMode: "isolated"` for differential qualification.
Normal use defaults to `"worker"`. Successful worker execution reports `runtime.workerPid`;
the PID is diagnostic metadata, not part of the compatibility fingerprint.

## Run one step

```sh
crl-apply-session --request step.json --out runs/step-1
# From an installed VSIX directory:
node dist/crl-apply-session.js --request step.json --out runs/step-1
```

## Keep one CLI process for repeated calls

Separate one-step CLI processes cannot share a JVM. A pipeline can instead start
`crl-apply-session --serve` (or `node dist/crl-apply-session.js --serve`) once and
write one NDJSON control envelope per line:

```json
{"request":"steps/step-1.json","out":"runs/step-1"}
{"request":"steps/step-2.json","out":"runs/step-2"}
```

Each line returns one ordinary session-result JSON line on stdout, including failures.
Controls are limited to 65,536 bytes while reading, including unterminated lines;
an oversized line is rejected and discarded through its next newline. Input is
consumed with backpressure at 64 outstanding controls. Loaded request/repository/data
files also share a 128 MiB byte allowance through result finalization; queued controls
hold paths rather than preloaded FHIR payloads.
The request files and evidence directories use the same one-step contract. Request/out
paths resolve from the CLI working directory; FHIR paths inside a request file resolve
from that file. Later lines continue after an ordinary failed request. End stdin to
shut down; SIGINT/SIGTERM cancel active work. The final CLI exit status remains nonzero
if a request failed. The native worker retains execution machinery, not patient state:
each request file must contain the complete intended inputs for that evaluation.

## Concurrent independent sessions

```js
const { createNativeWorkerPool, applySession } = require('@smile-digital-health/crl/session');
const pool = createNativeWorkerPool({ workerLimit: 4, maxHeapMb: 1024 });
try {
  await Promise.all(sessions.map(session => pool.runJob(async ({signal}) => {
    // The caller prepares each step from prior successful state and chooses a unique outDir.
    for (const step of session.steps) {
      const result = await applySession(step.request, {outDir: step.outDir, signal});
      if (!result.ok) throw new Error(result.error.message);
    }
  })));
} finally { await pool.shutdown(); }
```

`runJob` holds one owner through the callback and all accepted API operations, including
input discovery and evidence writes. `applySession` joins that ambient owner; it does
not queue a nested job. Await dependent steps in order and supply the complete current
state explicitly. Calls inherited from an already closed scope fail before writing.
Job cancellation composes with per-request cancellation. Callback JavaScript must
cooperate with its signal. Normal API admission/quarantine failures retain structured
`ok:false` results and available failed evidence.

`pool.setWorkerLimit(n)` increases admission or drains excess owners at job boundaries;
it resolves after removed JVMs are confirmed retired. Call it from outside pool jobs.
Recursive same-pool `runJob`, same-pool resizing and shutdown from an active job are
refused to prevent self-waits. `pool.status()` reports actual PIDs, runtime identities,
active/queued jobs, draining owners and heap reservations without launching Java.
`pool.shutdown({cancel:true})` cancels accepted work and closes that pool permanently;
default shutdown drains. Terminal CLI/producer shutdown still refuses new submissions.

For unscoped calls, `setNativeWorkerLimit(n)` and `nativeWorkerPoolStatus()` control and
inspect the process-default pool. `emit_results` accepts `workerLimit`; native
`crl-emit-results` and `crl-run-regression` accept `--workers N`. The limit persists
between invocations in that process, initially 1. One producer still coordinates the
whole suite. Independent cases use the shared queue and manifests retain input order;
`workerPool` reports workerLimit, actual workerPids, nativeCalls, peakActiveCases and
elapsedMs. Retained retry cases are not new native calls.

For independent CLI requests use `--serve --workers 4`. A line `{"workers":2}` adjusts
that same process and returns an ordered acknowledgment. All responses remain in input
order, including failures. Pipeline writes to obtain concurrency; wait for a result
before sending its dependent next step. The final exit status includes every failure.
These controls do not affect another process.

Worker limits are integers 1–32. Explicit pools declare a per-worker heap ceiling;
requests above it fail admission. Aggregate declared heap capacity across pools and
draining workers must fit half effective physical/constrained memory by default.
`CRL_NATIVE_HEAP_BUDGET_MB` selects a positive MiB budget within effective memory.
The exclusive legacy default limit1 keeps its prior caller-supplied heap behavior;
explicit pools and multi-worker capacity require aggregate admission. Heap limits do
not predict total RSS. Choose actual concurrency using measured workload and resources.
Warm idle JVMs retain reservations; shrink the pool, retire globally, or close it to
release capacity. There is no idle TTL. A cleanup-unconfirmed discovery, fingerprint
or evaluation quarantines future Java launches process-wide; restart the tool.

`nativeMode:"isolated"` retires the selected owner's JVM and starts a fresh process
charged to that owner's heap reservation. Other owners can continue. Use a dedicated
tool process for cold differential/timing qualification requiring resource isolation.

## Request files

The output directory must be new and its parent must exist. Previous runs are never overwritten. A request file can use paths relative to itself:

```json
{
  "schemaVersion": 1,
  "requestId": "request-1",
  "caseId": "example",
  "stepId": "answer-a",
  "planDefinitionId": "example-policy",
  "subjectReference": "Patient/example",
  "repositoryPath": "repository.json",
  "requestDataPath": "data.json"
}
```

Alternatively, `repositoryJson` and `requestDataJson` hold the raw JSON strings. The API accepts these string fields, not the CLI path fields. A repository Bundle supplies definitions and base data; a request-data Bundle supplies current session resources and any QuestionnaireResponse. Include exactly one matching returned Questionnaire in the repository when submitting its response. Canonical, version, subject, hierarchy, answer types and multiplicities are checked before execution. Duplicate question linkIds are refused; the tool does not hide or repair engine-generated duplicates.

The package's pinned engine is used by default. An explicitly selected candidate must supply both `engine.path` and `engine.sha256`; its identity is retained in the result. The CLI resolves that path relative to the request file. The API uses the supplied path relative to the current working directory.

```js
const { applySession } = require('@smile-digital-health/crl/session');
const result = await applySession({
  schemaVersion: 1, requestId: 'request-1', caseId: 'example', stepId: 'answer-a',
  planDefinitionId: 'example-policy', subjectReference: 'Patient/example',
  repositoryJson, requestDataJson
}, { outDir: 'runs/step-1', signal: controller.signal });
if (!result.ok) throw new Error(result.error.code + ': ' + result.error.message);
```

## Prepare an answer, change, or clear

`buildSessionResponse(questionnaireJson, responseJson, options)` edits an existing response. Each edit uses the exact JSON Pointer of the response item, including occurrence indices. Supply the SHA256 of the exact response bytes so a stale pointer cannot edit a different occurrence.

```js
const { createHash } = require('node:crypto');
const { buildSessionResponse } = require('@smile-digital-health/crl/session');
const edited = buildSessionResponse(questionnaireJson, responseJson, {
  expectedResponseSha256: createHash('sha256').update(responseJson).digest('hex'),
  authored: '2030-01-02T12:00:00Z', // the caller's actual answer time
  mode: 'edits-only',
  edits: [{ pointer: '/item/0', operation: 'set',
    answersJson: '[{"valueString":"Updated answer"}]' }]
});
```

To clear, use `{pointer:'/item/0', operation:'clear'}`. The item remains present without an answer. An empty string and Boolean false are values, not clears. Set/change uses native FHIR `answer.value[x]`, for example `valueBoolean`, `valueCoding`, `valueQuantity`, or `valueDateTime`. Raw answer-array JSON preserves long decimal tokens before Java parsing. Native serialization may normalize its output. DateTime values retain their supplied precision and offset; no date conversion is invented.

The required `mode` states what the request asserts:

- `edits-only` includes edited items and their necessary ancestors/bindings. Untouched answers are omitted, so extraction does not renew their timestamps. Retain earlier extracted resources explicitly in the next request if they should remain available.
- `full` preserves the response's supplied contents, including untouched answers. Resubmitting them asserts them at the supplied `authored` time; this can change recency and selection.

A populated answer is not automatically excluded in `full` mode. For example, echoing
a requested-service answer populated from a date-only `ServiceRequest.authoredOn`
creates a local Observation at the response's authored instant. Overlapping date
precision can then produce `publication-incomparable-validity`, even when the codings
agree. Use `edits-only` when intending to change only a later question, keeping the
source and successful earlier extracted answer resources in the request data.
The MV interactive client handles that bounded singleton session state; this
stateless API does not retain it for other callers.

Edits-only operations under repeating groups are refused because pruning array positions does not establish native extraction identity. Edits nested under another answer are also refused in this mode because carrying that answer would reassert it. Full mode preserves supplied repeat structure, but does not establish persistence/replacement identity. These are explicit limitations, not a claim of native repeated-resource reconciliation.

Replacing an answer array on a parent that already has answer child items is refused: the helper cannot infer which new answer owns those children. Edit the child directly in full mode or construct an explicitly reconciled complete response. An explicit parent clear removes its answers and their children.

The caller owns successful state. Keep the immutable base separate, identify the extracted resources actually being replaced, retain unrelated resources unchanged, and only adopt a new state after successful execution and domain checks. Do not merge resources by code alone or invent a universal latest-wins policy. An explicit clear can contribute a newer unknown-valued resource; it does not necessarily delete prior evidence or restore a calculated answer.

## Results and failures

The API returns a versioned `ok:true|false` result with correlation, runtime identity, elapsed/native timings, cleanup status, diagnostics, and artifact paths/byte lengths/SHA256 hashes. Native resources remain in raw files:

- `native-result.json`: complete returned Parameters, including all Q/QR resources.
- `native-data.json`: request Bundle after native extraction.
- `native-repository.json`: repository Bundle after execution.

The evidence directory also retains exact effective FHIR inputs, the effective request envelope, CLI original request, stdout/stderr, and `result.json`. Available bounded native files have a `jsonStatus` of `valid`, `invalid`, or `not-validated`; files from failed processes remain unvalidated. Failed runs retain available evidence; partial files are not successful state. `ok:true` means the operation completed without reported native errors, not that a medical-policy result was correct. Inspect the expected activities, answers and unknown behavior separately.

Error/fatal OperationOutcome, error-valued Parameters, native error logs, invalid JSON, process failure, timeout, cancellation, output overflow or unconfirmed cleanup cause failure. A Questionnaire returned beside an error does not turn failure into success. Warnings remain visible. The CLI prints the structured result and uses a nonzero exit code on failure, including SIGINT/SIGTERM after cleanup.

API `limits` can override positive bounded byte/time/heap budgets: combined input defaults to 32 MiB, each native file to 32 MiB, all native files to 96 MiB, each captured log stream to 1 MiB, native execution to 600 seconds, JVM heap to 1024 MiB. Java discovery and runtime fingerprint have separate bounded probes. Native file sizes are bounded before writing and before reading; input/envelope and logs have their separate limits. Cancel through `AbortSignal`; descendants belong to the invocation and cleanup is confirmed before reporting success.

The API snapshots request fields, limits and environment before awaiting Java. The original AbortSignal remains live. Session execution refuses nonempty Java/loader override environment variables (`JAVA_TOOL_OPTIONS`, `JDK_JAVA_OPTIONS`, `_JAVA_OPTIONS`, `CLASSPATH`, `LOADER_*`, `SPRING_*`, `LD_PRELOAD`, `DYLD_INSERT_LIBRARIES`) so they cannot override the explicit heap or loader contract. Discovery, fingerprint and execution use the same captured environment.
