# Local build integration

Audited September 20, 2026. Public baseline: `v6.3.0` at
`46102010de434b9e89c02159c4c796c813bf80c2`.
Qualified local candidate: **6.4.2**, commit
`710fe11be29a4dfb09cfcb62cfd2b88dd5ff6f02`.
This record describes local integration, not public publication.

| Local build/work | Retained behavior | Integrated revision |
|---|---|---|
| 6.3.1, superseded by 6.3.2 | Preferred flag `title`, compatible `gist`, separate description, unchanged stored schema | `1e16e14f14aef1c95b3fb70ba62070e15b56ff61` |
| 6.3.2 | Corrected kit 2.10 audit and synchronized installable versions | `c3ff590bb4eb56308e6f76e8ef5b1e7a3f68a845` |
| 6.4.0 | Shared presentation wording preview/apply/revert, editor undo and stale-edit handling; kit 2.11 | `bc847098d58b0af1e7642718fc2e9562a353bc20` |
| 6.4.1 | Source-only age binding; Condition coding URI; embedded native error classification; qualified FHIRHelpers with automatic adapter registration; identifier-only PlanDefinition expressions; kit 2.12 | `5574fc1d349e06f52b593ddb14e2cbc4e36878f3` |
| FHIR packaging | Existing definitions packaged into FHIR NPM manifest, ImplementationGuide, index and portable archive; API, CLI and MCP | Original `1fefb03f2ee418edb4021aec5ff2fa2beac95875`, integrated in `a9c841c416078343b369752cc99ca66e53292e44` |
| 6.4.2 | Selected coded Observation sources, local/source arbitration using existing semantics; packaging guidance; audited kit 2.13 | Content `a9c841c416078343b369752cc99ca66e53292e44`, audit `08dacb0f`, delivery `710fe11b` |

The 6.3.2, 6.4.0 and 6.4.1 heads are ancestors of the candidate. No paths
were deleted between any of those heads and the candidate. All previous kit rule
IDs remain. Flag implementation and drawer files are unchanged from 6.3.2;
shared editing implementation files are unchanged from 6.4.0. The packaging
implementation, CLI, shared MCP smoke fixture and documentation match the original
packaging commit, ignoring platform line endings. Existing package tests gained
kit ownership tags; package dependency and entry-point changes are integrated.

Actual installed npm MCP inventories retain all 20 tools from 6.3.2 and all
23 tools from 6.4.0/6.4.1; 6.4.2 exposes 24, including `package_fhir`.
An inventory/ancestry comparison is retention evidence, not a substitute for
behavior tests. Completed broad and native validation was reused; integration
checks and both installed artifacts were exercised separately.

The local delivery is under `tmp/local-coded-source-6.4.2/`: VSIX, npm tarball,
kit export, `SHA256SUMS`, `delivery-receipt.json`, `retention-audit.json`, and
`retained-tools.json`. These are delivery evidence, not additional source branches.
VSIX SHA256: `23d3fbada891254e7a8ba56881c3e31272e0447f569fb697c18a35128289e49f`.
npm SHA256: `047d15350da4051c9b73efbdb610afc8cfb3e970003bf1ca92e4951620543cfb`.

## Work preserved separately

The typed session API/CLI and adoption of the upstream apply engine are unfinished
on `codex/apply-session-upstream` in `tmp/apply-session-upstream`. Earlier work
remains on `codex/apply-portability-session`. These are not delivered local build
features and are not implicitly certified by 6.4.2. Their current progress and
remaining installed/Linux/native/kit checks are recorded in
`tmp/REFACTORS-IN-FORCE.md`, pointing to `tmp/DESIGN-apply-portability-session.md`.
The previously proposed pause PR is deprecated; do not automatically reapply it.

The main checkout's existing project-instruction and mail-context edits remain
separate. They were neither discarded nor folded into the product delivery.

## Preparing the next public release

Start from the integrated `develop` lineage containing `710fe11b`, not a prior
release worktree. Resolve this full candidate SHA with `git merge-base --is-ancestor`
against the next candidate, and inspect any later removals or feature changes.
When later work supersedes a retained feature, record its replacement and owning
validation here. Add newly delivered local builds to this table. Keep unfinished
work explicit instead of treating every branch as either shipped or disposable.

Follow the release protocol for final artifacts and installed verification. Reuse
valid completed evidence; rerun affected checks when a later change invalidates it.
This reconciliation itself does not require repeating the whole test suite.
