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

## Independently observed runtime context (6.4.53)

The maintained caller verifies the installed MCP entrypoint, runtime files, driver and engine
against trusted released identities **before launch**, keeps that installation immutable for
the server lifetime, and connects one MCP Client. Before each new batch, call
`native_runtime_context` with a fresh `challenge` (1..256 characters), and the same optional
`jarPath`, `jarSha256`, `caseTimeoutMs` that the following `emit_results` will use.
Both tools require `CRL_ENABLE_RESULTS=1`. The probe may initialize/borrow a reusable JVM;
it runs no policy, writes no clinical output, and makes zero clinical evaluations. Do not
substitute a probe from a separate SDK process or a later batch result.

Inspect the **original MCP response** before dispatch: reject transport errors, MCP `isError`,
non-version1 `operation:native-runtime-context`, `ok:false`/`status:unavailable`, missing fields
or a different challenge. Available receipts include `producerVersion`, `observedAt`,
`processInstanceId`, `fingerprintSha256`, `runtimeSha256`, `executionSha256`, `execution`,
`startupFilesSha256`, `files`, `engineJarSha256`, `javaMajor`, `clinicalEvaluations:0`.
Errors carry `ok:false,status:unavailable,reason`; there is no evaluation or replay fallback.
SDK callers use `inspectNativeRuntime`, passing their actual package `crlVersion`; MCP supplies it.

Retain the original probe request/response/hash, independently verified launcher/install pins,
transport/process identity, ordering/times, batch request/response/index hash and comparisons.
Pass exactly these four independently obtained values to `emit_results.expectedRuntimeContext`:
`{processInstanceId, fingerprintSha256, runtimeSha256, executionSha256}`. The SDK producer and
regression producer accept the same option. A different process is refused at admission.
Fingerprint/settings or startup-file drift refuses before results replacement and each bound
clinical dispatch. Bound empty suites are refused without clearing prior results. Omitted
expected context preserves ordinary behavior; it is not independent runtime verification.
Retained retries keep existing fingerprints/zero-replay semantics. Old captures without the
independent prior context remain verification-unavailable.

The existing outer digest above is unchanged. `executionSha256 = digest(execution)` uses this
property order: `javaExe` (absolute selected launcher), `javaRealPath`, `javaSha256` (launcher
file bytes), `engineJarPath` (real path), `nativeMode`, `bounds`, `nodeExe`, `nodeVersion`.
Bounds retain `maxHeapMb,batchTimeoutMs,maxCapturedBytes` in that order. All returned execution
settings must match the batch, including timeout; worker count can differ without changing
this binding. `index.runtime` records the process binding and, for bound batches, these four
expected/verified values alongside its existing fields. Independently compare index runtime
and full raw outcomes with the retained receipt/oracles; no producer-made audit verdict.

`files` inventories every immediate `.js` file in the executing results-module directory
(SDK) or staged bundle directory (VSIX), plus `ApplyDriver.class`, `ApplyWorker.class`
and `windows-owned-process.ps1` in its driver directory, plus the actual `process.argv[1]`
entrypoint if present. Resolve the entrypoint absolutely, deduplicate path labels, sort
using JavaScript default string `.sort()`, and insert `[absolutePath,sha256(fileBytes)]`
pairs into an object in that order. `startupFilesSha256 = digest(thatObject)` at module
initialization. It is host-path-specific, not a portable release constant. Derive the known
inventory from independently verified installed archive contents/launch configuration;
never follow arbitrary returned paths as pin-verification authority. Startup read failure
is retained without breaking nonnative module/tool loading; probe and bound execution
remain unavailable for that process. Ordinary unbound native preparation keeps its
existing structured driver/engine diagnostics.

Both MCP calls resolve native bounds as `maxHeapMb:1024`, `batchTimeoutMs:600000`,
`maxCapturedBytes:1048576`, with optional `caseTimeoutMs` replacing only the timeout.
SDK explicit bounds use those same fields; serialize the bounds object in the documented
order regardless of the caller's object insertion order. Client transport timeout is separate.
The independent caller checks the returned settings against its intended selectors, not
merely the digest's self-consistency.

A startup file snapshot and checks for replacement/addition/removal detect accidental in-place
updates while the process is alive. Files currently on disk alone do not prove loaded code.
The trust boundary is the independently pinned, immutable installation and retained control
plane. These receipts are not cryptographic attestation of memory, Node/JVM shared libraries
or a hostile launcher. Raw environment values remain undisclosed.

## Canonical shared CQL bytes

CRLCommon, CaseFeatureCommon and FHIRHelpers are distributed and loaded as UTF-8 LF before
standalone output, inlining into execution Libraries, closure hashing or native evaluation.
Normal Git `eol=lf` delivery therefore keeps the exact qualified bytes. CRLCommon and
CaseFeatureCommon already have corresponding emitted Libraries; FHIRHelpers remains standalone
and engine-provided. Do not invent an extra Library for a byte comparison. Qualification checks
standalone, actual embedded bytes where present, consumed CQL and normal Git blob identity.
A post-evaluation CRLF/LF conversion or text-equivalence waiver does not repair earlier evidence.
No CQL semantics, clinical input or frozen expected outcome changes are implied.

## Storage protection

Evidence can contain patient information and source content. Choose a protected
scratch parent and retain/publish it according to the owning environment's rules;
it is separate from canonical clinical content and lifecycle approval. POSIX
creation uses directory mode 0700 and file mode 0600. Windows inherits parent
ACLs; these mode arguments do **not** prove owner-only Windows access. The caller
is responsible for an appropriately restricted Windows parent. No Windows ACL
verification is claimed by the producer.
