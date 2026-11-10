# Native batch evidence

CRL 6.4.52 adds this opt-in producer feature; it is absent from 6.4.51. It preserves evidence
from the native calls already made by a batch; it never calls `$apply` again to
obtain evidence and does not modify policy logic or certify clinical outcomes.

Pass `evidenceRoot` to `produceResults`, `produceRegressionResults`, or MCP
`emit_results`. The CLI equivalents are `crl-emit-results --evidence-root <dir>`
and `crl-run-regression --native --evidence-root <dir>`. The directory must be a
new absolute path outside both the source project and generated-output tree.
Existing evidence is never overwritten. Ordinary calls without this option keep
their existing result shape, worker pool, output limits and clinical outputs.

The result adds `evidence: {indexPath, sha256?, complete, errors}`. The SHA-256
identifies the exact current index bytes. Missing hashes or `complete:false`
cannot support an evidence-complete audit. The CLI exits 2 and MCP sets `isError`
for incomplete requested evidence, even if clinical `failed` is zero. The
clinical manifest and its per-case states remain independent and unchanged.
Evidence-write failure after dispatch never makes a successful clinical case
failed, removes its Q/QR, retires its worker, or causes evaluation to repeat.

## Index and bindings

`batch-evidence.json`, schemaVersion 1 / operation `emit_results`, contains the
contract exported by the SDK as `batchEvidenceJsonSchema` (source:
`packages/crl/src/results/batch-evidence.schema.json`):

- A unique `batchId`, producer version, selected suite/useCase, replay inputClock,
  actual definitionClosureSha256, runtimeSha256, PlanDefinition id and runtime
  identities. Runtime files are hashed from the executing producer/driver, not
  merely copied from a package label. No whole environment or credentials are saved.
- Shared `definitions.json`, `cql.json` and `source-hashes.json` descriptors. Source
  hashes identify the selected CEL files and root CRL file. They do not claim to
  inventory every original imported source. The complete consumed definition/CQL
  closure is separately preserved and bound by its digest. Recompute that digest
  as SHA256(JSON.stringify({defs, cql: Object.entries(cql).sort(([a],[b]) =>
  a.localeCompare(b))})), using the preserved definitions order and CQL strings.
- One `cases[]` row for every selected case, in selection order, including reused,
  failed, cancelled and not-run cases. `captureId` is unique even when case names
  collide. Identity includes sourceFile/caseId/caseName/compartmentDir and the
  producer's `inputSha256`, SHA256(JSON.stringify({input, planDefinitionId})).
- Per-case files under `cases/<captureId>/`: `input.json`, exact `repository.json`,
  `request.json`, raw `stdout.bin`/`stderr.bin`, optional original
  `request-control.bin`, and derived `parameters.json`. Every descriptor gives
  relative `path`, actual byte count and SHA-256 of written bytes.

The repository is the *execution* Bundle, with CQL inlined and that case's data.
It is not the original source package. The native batch invocation passes
`dataBundle:null`; the case data are in this repository. `request.json` is an
invocation descriptor with the actual arguments/bounds/mode/subject and reserved worker
PID when known (`reservedWorkerPid`, advisory until dispatch), not a fabricated applySession request. The optional transport
control uses `worker-mailbox-utf8` or `windows-supervisor-base64-json`, explicitly
identified by `requestControlFormat`. `parameters.json` is a parsed/reserialized
derivative of stdout; the raw carrier remains authoritative. Inspect its full
Tasks, multiplicity, Q/QR and OperationOutcomes against independent expectations.
The producer does not generate an audit verdict from its own observations.

`native` records request timing, status, failure and cleanup confirmation.
`statusKind:worker-request` is a reused worker's per-request status, not a JVM
process exit. `worker-exit` records a worker process exit without an acknowledged
request; `unavailable` means no trustworthy status was obtained. `native.workerPid`
is the actual dispatch PID from the owner, including replacement workers.
Isolated mode uses `process-exit`. `outputOrigin:worker-job-files`
means native per-job file bytes. `owned-process-transport` means original owned
process transport bytes; on Windows, stderr may include supervisor protocol.
Host/protocol exception diagnostics are separate, never relabeled native stderr.

Each stream identifies observed byte count (or null), retained portion
`all|prefix|tail|missing`, and completeness. Failure, overflow, unreadable files,
unconfirmed completion and cleanup remain distinguishable. An available prefix
or tail is useful failure evidence but never a complete native result.

## Bounds, interruption and retries

The existing native `maxCapturedBytes` bound is unchanged (default 1 MiB per
stream). Capture does not silently increase it. An output-limit result is not
promoted to a complete response. Each evidence artifact is limited to 64 MiB;
the whole batch is limited to 512 MiB, including retained partial writes and atomic index staging. Storage
exhaustion is an explicit evidence-only failure, not an invitation to replay.
Definitions/CQL are shared once; each actual execution repository is retained.

The initial/ongoing index is `state:running, complete:false`. A finished batch
is complete only when all selected rows have complete capture and the shared
bindings are present. Interruption leaves a visibly incomplete inventory.
Failed native results may still have complete raw evidence; this does not make
the evaluation successful. Timeout, cancellation and uncertain cleanup do not
claim complete request evidence. Capture errors are bounded and reported.

Existing `retryFailed` semantics remain. Compatible successful rows are retained
without evaluation and marked `captureState:unavailable` in the new capture.
V1 does not implicitly import a prior capture into a new batch. Original evidence
can be verified separately at its original index. A missing/corrupt historical
capture cannot be reconstructed from Q/QR or upgraded by relabeling it; evidence-
required consumers must refuse certification, rather than rerunning for capture.

Consumers verify schema, state, exact selected-case inventory, every file's
containment/size/hash, matching input/definition/runtime context, request status
and full raw outcomes. A matching filename, case name, form or summary is not
proof. Do not trust expected dispositions as observations.

## Runtime digest verification

The producer retains its existing retry fingerprints. `digest(value)` means
SHA-256 of the UTF-8 bytes of `JSON.stringify(value)`, without pretty printing,
canonical key reordering or a trailing newline. Property insertion order matters.
The outer binding is:

```js
runtimeSha256 = digest({
  runtime: runtime.fingerprintSha256,
  crlVersion: index.producerVersion,
  jar: runtime.engineJarSha256
});
```

The nested `fingerprintSha256` is calculated by `runtimeFingerprint.ts` as
`digest({fields, environment, code, shipped})`, in that property order:

- `fields`: the nine **base64-encoded strings**, in order, from the original
  `CRL_RUNTIME_INFO:` line: `java.version`, `java.runtime.version`, `java.vendor`,
  `java.vm.name`, `ZoneId.systemDefault().getId()`,
  `TimeZone.getDefault().getID()`, then the language tags of the default,
  DISPLAY and FORMAT locales. Do not decode/re-encode or normalize them.
- `environment`: an object built from actual environment entries whose keys
  match `/^(JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|_JAVA_OPTIONS|CLASSPATH|TZ|LANG|LC_.*|LOADER_.*|SPRING_.*)$/i`,
  sorted using JavaScript `key.localeCompare(otherKey)`. Keys, casing and values
  remain exactly as observed; absent variables are omitted.
- `code`: `[basename, sha256(fileBytes)]` pairs for all `.js` files immediately
  inside the executing runtime module's `__dirname`, sorted by basename using
  JavaScript's default `.sort()`. In an extension this is the staged bundle
  directory; in the SDK it is the results-module directory.
- `shipped`: `[basename, sha256(fileBytes)]` pairs in this exact order:
  `ApplyDriver.class`, `ApplyWorker.class`, `windows-owned-process.ps1`.

Those nested arrays use basenames, not absolute paths. Environment **values**
such as classpaths or JVM options can contain machine paths and are not
normalized. `runtime.files` uses absolute paths as labels for the additional
observed file-hash inventory; it is not the nested fingerprint's preimage.

The index intentionally does not disclose environment values, which may contain
credentials, or the complete runtime-info preimage. Therefore an independent
reader can recompute the **outer** digest from the index, but cannot reconstruct
the nested digest from this index alone. Verify that nested value against an
independently supplied execution-context fingerprint, or recompute it where the
original launcher output and environment are available. If that trusted context
is required and unavailable, report runtime-context verification unavailable;
a self-consistent outer digest does not establish an independently trusted
runtime. This limitation does not justify another clinical evaluation.

## Storage protection

Evidence can contain patient information and source content. Choose a protected
scratch parent and retain/publish it according to the owning environment's rules;
it is separate from canonical clinical content and lifecycle approval. POSIX
creation uses directory mode 0700 and file mode 0600. Windows inherits parent
ACLs; these mode arguments do **not** prove owner-only Windows access. The caller
is responsible for an appropriately restricted Windows parent. No Windows ACL
verification is claimed by the producer.
