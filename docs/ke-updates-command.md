# Knowledge Engineer app and KE Updates command

<!-- REFACTOR:grounded (MV/KE): programmatic content update contract, no MV status writes. -->
The CRL extension provides a Knowledge Engineer app for pending Q/A edits. Launch `crl.knowledgeEngineering.show` with one file URI pointing to an artifact or one of its entity folders. A managed project resolves to the shallowest artifact package beneath its `artifacts/` folder, including an entity folder not yet created. A supplied invalid target reports an error; it does not open another artifact. The command palette uses the active file or an artifact picker.

Select pending Question Edit and Answer CRUD requests, inspect their original request baseline and requested state, then Preview and Run. Preview shows current versus final CRL/CEL source, definition paths, deleted selections and static output folders refreshed during Run. It generates no native static outputs. Run requires an unchanged fresh preview of the same selection and source inputs. Closing the app leaves an active operation running; reopening the same artifact observes its operation and result. Ordinary findings remain a separate human worklist.

The app uses the versioned `crl.keUpdates` backend below. CRL saves content to disk without observing KELP locks or invoking its lifecycle commands. KELP handles lock, commit, push and unlock externally. Local application and MV approval are separate outcomes. Neither app nor backend writes `src/medical-validation`, `src/provenance` or `.kelp`, or marks an MV flag Fixed.

Input schema version 1:

```ts
interface KeUpdateInput {
  schemaVersion: 1;
  operation: 'discover' | 'preview' | 'apply' | 'recover';
  artifactRoot: string; // owning artifact package folder, absolute filesystem path
  requests?: {id: string; revision: string}[];
}
```

`discover` is read-only. Its result includes `ok`, `schemaVersion`, `artifactRoot`, `hasCrl`, `hasFhir`, `hasCql`, `pendingFindings`, `requests`, `requiredScopes` and `recoveryRequired`. `hasCrl` means authored `.crl` files exist in `src/crl`; it does not mean KELP's reserved original-document source entity exists. Output booleans mean files exist and do not assert freshness. Ordinary pending findings contain `{id, category, gist}` and require human work. Automatically applicable `requests` contain `{id, revision, gist, editRequest}` for pending Question Edit and Answer CRUD flags. Treat IDs and revisions as opaque; use the current values returned by discovery.

`preview` and `apply` require a nonempty, distinct selected-request list. They independently resolve owning source and compare authored content against the request's baseline and desired state. Divergent content or an obsolete selection requires reconciliation and a fresh discovery. Imported or externally owned targets cannot be written. Preview compiles a temporary candidate and returns final CRL/CEL `changes`, `changedPaths`, `clearedCases`, `requiredScopes`, an ephemeral `basis` hash of source inputs and definition publication units, and `refreshedFolders`. It writes no artifact files. Static native generation happens during apply; its eventual paths are distinguished from the source/definition changes already known at Preview.

`requiredScopes` is a `string[]`: `['crl', 'cql', 'fhir', 'cel', 'tests']`. These logical scope names describe the fixed write folders `src/crl`, `src/cql`, `src/fhir`, `src/cel` and `tests`. KELP maps its external lifecycle to actual configured entities. CRL has no lock-dependent gate. The backend requires an artifact root; the app launcher normalizes an entity folder to that root. Apply writes changed owning source and complete generated definitions/static forms, and clears saved selections of deleted answers. It leaves clinical expectations unchanged and reports the affected `{file, caseName, factName}` cases for review. Native generation must finish with no failed or degraded cases before publication; successful generation does not establish the expected clinical outcome.

Successful application returns:

```json
{
  "ok": true,
  "schemaVersion": 1,
  "state": "changed",
  "requiredScopes": ["crl", "cql", "fhir", "cel", "tests"],
  "changedPaths": ["src/crl/policy.crl", "src/cql", "src/fhir", "tests/results"],
  "clearedCases": []
}
```

Paths are relative to the artifact. An unchanged repeat with current source, definitions and static forms returns `state: 'no-op'` and empty paths. It does not run an authoring agent or change the still-pending MV flag. Current ordinary native forms that lack authored question help are enriched without another native run. Changed forms and their manifest hashes stay consistent.

Failures return `{ok: false, schemaVersion: 1, error: string}`. Application does not claim a Git commit or push. If publication is interrupted, discovery reports `recoveryRequired`; preview and apply refuse until the user invokes `recover`. Recovery uses the existing local file journal to roll back incomplete publication, returns `state: 'recovered'` and affected paths, and preserves conflicting external edits instead of overwriting them. Journals are isolated by artifact in extension storage. Completed local application is not rolled back by recover.

For card integration, configure Open to invoke `crl.knowledgeEngineering.show` with the existing one-entity-folder URI launch shape. CRL owns the Preview/Run screen; KELP owns the card lifecycle and team visibility. Programmatic callers of `crl.keUpdates` must supply the owning artifact root. Report completion out of band. MV members inspect actual authored versus requested content, manually mark Fixed and then Approved in their existing Q/A UI. No CRL receipt or additional status handshake is needed.

For search, MV means both FHIR and CQL exist; KE means KELP's original-document source exists and neither output exists. KELP supplies original-source presence from its own inventory; do not substitute CRL's `hasCrl`. KE Updates means pending explicit Q/A edit requests exist and may overlap MV. Ordinary findings remain a separate human worklist and are not automatically applicable. Neither automatically generated QA diagnostics nor freshness are represented by these presence checks. Unknown/error discovery must stay distinguishable from an empty worklist.

Discovery can inspect a complete read-only materialized artifact snapshot with the same relative paths. It reads the flag store and checks file presence; it needs no native runtime or CEL execution. This host command does not accept remote Git refs. A partial remote snapshot must not be treated as proof that missing folders have no content. Remote search inventory and project-graph validation belong to KELP; filtering must not switch the user's checkout.

The staged [synthetic fixture](fixtures/ke-updates.json) contains a `files` map to materialize beneath a neutral content-project root, with `kelp.project.json` and an artifact at `artifacts/neutral-fixture`. Its CRL/CEL/configuration/flag bytes come from the actual owning `fixture()` function in `keQaApply.test.mjs` and the shared pure `qaFlagEditingFixture.mjs`, not a simpler substitute. Replace the `artifactRoot` placeholder with the materialized absolute folder. The file includes actual discovery, selected request IDs/revisions and a real compiled preview. Establish KELP produced upstream baselines separately before lifecycle qualification. The graph was supplied by KELP against its v0.10.1 parser; its needs/producer choices are illustrative, not a clinical graph or team access policy. Reserved source/package/publish entities are supplied by KELP and are not declared in the fixture graph. A configured entity with a different key may own `tests`; a nested QA folder alone does not cover the entire write set, and overlapping entities must not be added.

Real registered-command tests verify updates and interruption recovery; native scenarios verify question/answer/static changes, deleted selections, repeat no-op and unchanged MV/provenance bytes. Rendered LForms checks verify the edited question, selected answer display, visible authored help and unchanged coding export. These are source-built checks, not installed-extension or customer medical approval. The installed 6.4.38 release does not contain this command or workflow; a separately qualified release is required for deployment.
