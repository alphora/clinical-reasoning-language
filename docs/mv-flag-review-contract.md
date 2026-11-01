# Flag questions and rerun change summaries

This is the source implementation contract. Released CRL 6.4.45 does not provide these additions. Pipeline producers must use a subsequently qualified release whose actual MCP schema and SDK exports include them; a package version string alone is not a capability check.

## Structured questions

`create_flag` accepts optional top-level plain-text `question`, `sourceReference`, and `sourceQuote`. Use the short `title` for the flag list/header, `question` for the succinct question to MV, the actual document/section/page in `sourceReference`, and the actual quotation in `sourceQuote`. Put interpretation, alternatives and consequences in supporting `description`. Missing source is disclosed in description; a quote is never invented. Multiple citations can be accurately labeled in these text fields.

The three fields are trimmed at their edges; blank values are omitted. Newlines, punctuation and quotation marks are preserved. Authoring rejects non-string values and misplaced `fields.question`, `fields.sourceReference`, or `fields.sourceQuote`. `fields.ref` keeps its existing issue-reference meaning. Existing flags remain readable and retain their ids, statuses, gist, descriptions and schema versions. There is no automatic extraction or migration of legacy descriptions. On disk, null optional context is treated as absent; nulling a previously authored field still conflicts with a retry carrying that content; other malformed non-string context uses the existing store-warning path.

Exact structured retries return the actual existing record with `deduped: true`. Different structured content contributes to generated creation keys. A matching stored key whose structured content differs returns `success: false`, `reason: "content-conflict"`, the existing `id` and full `flag` record, and an actionable message without changing that record. This includes a record externally edited after its creation. A structured regeneration matching an open legacy concern also returns this conflict instead of silently duplicating or upgrading it. Read and retain the existing record; report the proposed revision for its owner to review. There is currently no MCP amendment operation, so this is a disclosed limitation rather than a claimed update. Do not resolve an unanswered flag merely to recreate it with structured fields. The existing legacy question remains usable and answerable without upgrading it.

Legacy Description remains mutable detail outside retry identity: a retry with a different description returns the actual persisted record without overwriting it. Inspect the returned record; `create_flag` is not an amend operation. This behavior remains unchanged. Closed records retain the existing re-add behavior. The cockpit's explicit human Add flag action continues to create independent flags; it shares validation/building, not the MCP retry lookup.

Answer Flag copies a structured question, its source and supporting context into the new MV answer description. With none of the three structured fields, the exact legacy copy behavior is preserved. Answer records retain the captured full question revision and a separate host-owned `ke-content-revision` fingerprint that excludes status/timestamps/link bookkeeping and issue-reference metadata. MV displays when a linked answer concerns different current question content. Neither old records nor human review statuses are rewritten. Reserved correlation fields cannot be authored through create_flag.

## Artifact-local change summaries

SDK exports:

The same generated JSON Schema is also shipped as `dist/flag-change-summary.schema.json` in both the SDK and VSIX. Producers can validate against this file without assuming the Codespace separately installs the SDK. The build generates it from the runtime schema and copies that exact contract into the extension.

- `flagChangeSummarySchema` and `validateFlagChangeSummary(value)` for runtime validation.
- `flagChangeSummaryJsonSchema` for producer-side JSON Schema validation (draft 7).
- `FlagChangeSummary`, `FlagChangeItem`, and `FlagChangeEvidence` types.

The pipeline writes `src/medical-validation/change-summaries/<runId>.json` **before** the existing final candidate consultation, native inspection and frozen delivery manifest. The verified existing medical-validation scope already captures this path. It is run reporting, not an approval, a change in flag status, or an authorization to modify excluded concerns. Initial authoring without prior flag work does not fabricate a rerun summary.

Version 1 shape:

```typescript
{
  schemaVersion: 1,
  runId: string,       // 1–128 ASCII letters, digits, underscores or hyphens; exact filename match
  recordedAt: string, // UTC ISO timestamp of summary creation, e.g. 2026-11-01T12:00:00.000Z
  beforeCommit: string, // full lowercase Git SHA (40 or 64 hex digits)
  items: [{
    flagIds: string[], // originating selected flags; existing safe flag-id alphabet
    priorState: string,
    requestedChange: string,
    implementedChange: string, // OR notImplementedReason: string; exactly one
    affectedTargets: [{scope: "concept" | "decision" | "library", name: string,
      label: string, library?: string, entityId?: string, occurrenceKey?: string}],
    evidence: [{label: string, path: string, sha256: string}]
  }]
}
```

Items, flagIds and affectedTargets are nonempty; text must be nonblank. Evidence may be empty, without implying evidence exists. Every supplied evidence reference has a lowercase 64-hex SHA-256 and a forward-slash artifact-relative file path under `src/` or `tests/`. No absolute paths, URLs, traversal, backslashes, controls or tmp-only references. Prefer run-specific retained evidence files inside the delivered MV scope. References to mutable generated files become unavailable if later runs overwrite their bytes.

A file cannot embed the SHA of the commit that contains that file. The actual SaveCodify delivery SHA and final immutable evidence-ref binding stay in post-delivery run evidence. Never label planned evidence-ref publication as already complete.

The MV flag drawer shows matching summaries for every run, newest recordedAt first (runId breaks ties), with Before, Requested change, Change made/Not implemented, affected nodes and evidence buttons. The flag's own review status stays independent. Summary absence is normal; invalid, oversized, unreadable or unresolvable summaries produce informational notices and never hide flags or change completion gates. A bounded notice distinguishes folder-wide read problems from missing references in the selected flag's summaries. Parsed summaries are reused until a file event or policy change invalidates them; rapid summary events are coalesced. Summary JSON limits are 1 MiB per file, 16 MiB aggregate and 512 directory entries.

Evidence buttons contain only render-scoped opaque keys. At opening, the host rechecks selected artifact/flag, realpath containment, regular-file status and SHA-256 using streamed asynchronous reads, with a 64 MiB evidence limit. Missing, changed or oversized evidence is unavailable for that historical run. An existing dirty text buffer must be saved or reverted before opening verified evidence. File events, drawer refreshes and policy changes invalidate old keys. Verified files open through VS Code's default editor. No remote download, temporary evidence substitute or status mutation occurs.

The summary watcher is rooted at the existing src directory and uses a path-segment glob, which VS Code documents as recursive. User files.watcherExclude settings can suppress events. Explicitly opening/closing a flag or retargeting the policy invalidates the summary cache; installed-host watcher behavior remains part of UI qualification.
