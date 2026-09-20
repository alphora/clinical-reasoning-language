# Native apply sessions

`@smile-digital-health/crl/session` exports `applySession`, `buildSessionResponse`, and their TypeScript types. `crl-apply-session` runs the same operation from a JSON request file. The VSIX carries equivalent standalone CommonJS bundles in `dist/apply-session.js` and `dist/crl-apply-session.js`, with this guide beside them. These tools require Node and JRE 17 or newer; users do not compile Java or unpack the engine.

Each call performs one native R4 PlanDefinition `$r5.apply`. The caller supplies its current data explicitly. There is no hidden session, persistence service, inferred timestamp, or automatic reconciliation of previously extracted resources.

## Run one step

```sh
crl-apply-session --request step.json --out runs/step-1
# From an installed VSIX directory:
node dist/crl-apply-session.js --request step.json --out runs/step-1
```

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
