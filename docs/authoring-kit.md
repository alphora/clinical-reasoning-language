# CRL authoring kit

The kit helps a KE create a comprehensive and correct computable representation
of L1 narrative, L2 semi-structured material, or both, using CRL and emitted
CQL/FHIR. A pre-existing L2 intermediate is not required. L2 organizes clinical
scenarios, decisions and actions to communicate between domain experts and knowledge
engineers; it differs from L1 narrative. L3 specifies precise computable knowledge;
L4 implements it for a particular setting. See [Boxwala et al. (2011)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3241169/).
Coverage of the source meaning and executable correctness are separate obligations.
A passing example does not certify medical fidelity.

There is one kit. Guidance states when it applies; agents do not have to classify
their project as CPG, PA or a quality measure before discovering it.

Call the MCP tool `authoring_kit`:

```json
{}
```

The default overview returns an introduction and complete index. Then retrieve
guidance by task, syntax or stable entry ID:

```json
{"view":"search","query":"dropdown with a none answer"}
```

```json
{"view":"entry","id":"rule:named-answer-options"}
```

Search returns at most eight discovery summaries, each at most 240 characters,
with total/truncated indicators. Read the entry before applying it: the entry
includes whole guidance, linked prerequisites, example configuration and proof
limits. Counterexamples are labeled. The index is never truncated.
Collection entries (all rules, short examples, or executable artifacts) return
their member IDs; retrieve a member for its complete prerequisite bundle. This
avoids repeating whole collections in a focused response. Applicability is visible
in both the index and search results before an agent chooses guidance.
An entry can belong to several topics while retaining one canonical ID and definition.

For a complete export:

```json
{"view":"full"}
```

Every view reports `view`, `complete`, `schemaVersion` and `fullContentHash`.
Only `full` is complete and carries `contentHash`. The hash identifies canonical
content and navigation, not the bytes of a search/overview response. The content
source lives in `packages/crl/src/authoring-kit/`; navigation is derived from it.
The delivery format can change when a better format serves the KE's task.

Kit `stage` and `useCase` selectors are removed. Authorization/coverage guidance
and its examples remain included. `emit_results.useCase` is a separate runtime
setting and has not changed.

`audit` records the last reviewed source revision, scope and content identity.
`contentMatchesAudit` compares content only: implementation changes can affect
evidence without changing kit bytes. It does not certify the current checkout.
The maintenance protocol is `.claude/skills/crl-kit-update/SKILL.md`; its Codex
entry point is `.agents/skills/crl-kit-update/SKILL.md`. The coverage ledger is
`packages/crl/src/authoring-kit/tests/coverage.md`.

For shareable files, build the core package, then run from `packages/crl`:

```text
node scripts/export-authoring-kit.mjs <output-directory>
```

This writes `authoring-kit.json` and a readable `authoring-kit.md` from the same
canonical content. Export refuses a stale audit stamp or content/hash mismatch
before writing files. It never stamps its own build. The audited Git revision
must be verified during maintenance; a matching content hash does not prove that
later implementation changes were reviewed. These standalone files do not update
an installed MCP server; the core/extension must be built and installed separately.
