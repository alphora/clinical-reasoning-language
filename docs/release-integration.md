# Local build integration

Audited September 21, 2026. Public baseline: `v6.3.0` at
`46102010de434b9e89c02159c4c796c813bf80c2`.
Release candidate: **6.4.6**, isolated branch `codex/upstream-engine-6.4.6`.
Reviewed product and audit checkpoint: `d48fc5c009d18321e7e9b6d5fdfd81e032f4444d`;
tested version checkpoint: `9b36ece7b6b31b511e7600d0373bcd595bec5228`.
Public release is authorized. Publication and registry verification are recorded
separately from candidate qualification.

| Local build/work | Retained behavior | Integrated revision |
|---|---|---|
| 6.3.1, superseded by 6.3.2 | Preferred flag `title`, compatible `gist`, separate description, unchanged stored schema | `1e16e14f14aef1c95b3fb70ba62070e15b56ff61` |
| 6.3.2 | Corrected kit 2.10 audit and synchronized installable versions | `c3ff590bb4eb56308e6f76e8ef5b1e7a3f68a845` |
| 6.4.0 | Shared presentation wording preview/apply/revert, editor undo and stale-edit handling; kit 2.11 | `bc847098d58b0af1e7642718fc2e9562a353bc20` |
| 6.4.1 | Source-only age binding; Condition coding URI; embedded native error classification; qualified FHIRHelpers with automatic adapter registration; identifier-only PlanDefinition expressions; kit 2.12 | `5574fc1d349e06f52b593ddb14e2cbc4e36878f3` |
| FHIR packaging | Existing definitions packaged into FHIR NPM manifest, ImplementationGuide, index and portable archive; API, CLI and MCP | Original `1fefb03f2ee418edb4021aec5ff2fa2beac95875`, integrated in `a9c841c416078343b369752cc99ca66e53292e44` |
| 6.4.2 | Selected coded Observation sources, local/source arbitration using existing semantics; packaging guidance; audited kit 2.13 | Content `a9c841c416078343b369752cc99ca66e53292e44`, audit `08dacb0f`, delivery `710fe11b` |
| 6.4.3 | Shared-input Result Questionnaire deduplication with retained owners; kit 2.13 | `13a19095`, audit `7b2421c9` |
| 6.4.4 | Library ownership corrections, definitions Bundle and typed native sessions; kit 2.14 | `db02b9cbe4d40afa047c372ab1452299d6d6902c` |
| 6.4.5 | Supported record-status filtering in CRE/MV preview; kit 2.15 | `03da1eb1356a726271c24465c33fb598ba7c34dc` |
| 6.4.6 | Unmodified upstream asked-unknown and shared-input fixes; kit 2.16 | Content/audit `d48fc5c0`, tested build `9b36ece7` |

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

## Historical upstream qualification before the shared-input fix

The typed session API/CLI in 6.4.4 uses the retained qualified engine SHA256
`9870fc867547f65518c5cd6e698ace77b60a9e98797ed38330c25d06cbf5cb2e`.
The next engine candidate is [cqframework PR1121](https://github.com/cqframework/clinical-reasoning/pull/1121),
commit `ac74433ea0b7d426bf44f042aa30826b449c38e6`, based on
`feature-definition-based-population` at `c34dc910255a70cd503ead5283f313ae8082e1cb`.
Its only production change supplies `valueCode: asked-unknown` to the absent
condition-result extension in DSTU3, R4 and R5. Three scoped regression tests
accompany that change. The 45 adapter tests, Checkstyle and scoped formatting pass.

The locally built PR jar has SHA256
`f04bab8f0167c35cfb96614b8337d0819bc748ab0fe87a70d0fd9d695831bbc5`.
Qualification uses the exact installed 6.4.4 SDK and unchanged driver through
explicit engine path/hash selection. No retired pause patch or output repair
is applied. Evidence and executable probes are under `tmp/upstream-pr1121/`.

Windows six-step answer/edit/clear and four-step typed sessions pass. Five HCSC
controls and all sixteen Bleph examples pass. Of eleven additional source-data
controls, eight pass and three return duplicate questions: STEADI all-no,
prior-fall-yes and unsteady-yes each return six questions for three definitions.
Their terminal outcomes still match. Condition controls verify false/unknown
in both orders, exclusive first-route outcomes, nested unknown pauses, and
reported evaluation errors. The standard non-session driver invocation passes.
Linux six-step sessions and all four typed steps pass using JRE 17.

A generic two-action/single-input reproduction returns two questions on both
unpatched c34dc91 and PR1121, versus one on the retained engine. The candidate's
`ApplyRequest` records item definitions containing an element fragment, then
checks them against the input profile canonical without that fragment. This
supports the observed duplicate; it does not claim a new statement of upstream
maintainer intent. The separate CRL MV deduplication fix does not repair native
Questionnaire generation.

At that checkpoint, duplicate controls prevented adoption. The later 6.4.6
qualification below covers their upstream correction and the replacement engine.
The 6.4.4 artifacts remain intact as evidence of their own tested runtime.

The main checkout's existing project-instruction and mail-context edits remain
separate. They were neither discarded nor folded into the product delivery.

## Preparing the next public release

Retain the complete candidate lineage through
`9b36ece7b6b31b511e7600d0373bcd595bec5228`, including the 6.4.4 delivery
`db02b9cbe4d40afa047c372ab1452299d6d6902c`, not merely the older `develop`
checkpoint `710fe11b`. Verify these full candidate SHAs with `git merge-base --is-ancestor`
against the next candidate, and inspect any later removals or feature changes.
When later work supersedes a retained feature, record its replacement and owning
validation here. Add newly delivered local builds to this table. Keep unfinished
work explicit instead of treating every branch as either shipped or disposable.

Follow the release protocol for final artifacts and installed verification. Reuse
valid completed evidence; rerun affected checks when a later change invalidates it.
This reconciliation itself does not require repeating the whole test suite.

## Local 6.4.6 — upstream engine adoption checkpoint

This local build retains the complete 6.4.5 delivery at
`03da1eb1356a726271c24465c33fb598ba7c34dc` and its earlier local features.
Reviewed source and audited kit are saved through
`d48fc5c009d18321e7e9b6d5fdfd81e032f4444d` on
`codex/upstream-engine-6.4.6`. These checkpoints bind the tested runtime and
version metadata; later release-record updates do not change those artifact bytes.

The new engine is unmodified upstream `feature-definition-based-population`
commit `dcac972fc38bc9a29aae2c662dfb5c4917d27234`, including merged PR1121's
asked-unknown correction and the shared-input duplicate-question fix. The generic
shared-input reproduction and three previously failing controls now pass;
upstream issue1122 is closed. There are no local engine patches. Kit 2.16 updates
the engine identity and cache instructions; it adds no language syntax.

Qualification completed on Windows: 211 focused tests, the core MCP suite and
36 extension MCP checks; fresh installed npm and actual VSIX MCPs retain all
25 tools and return the audited kit. Each installed transport generates the two
generic native cases using the new default engine from an isolated seeded cache.
The visible installed MV FHIR pane shows one Boolean question and the saved Yes
answer. Archive comparisons cover 969 npm files and 34 VSIX files. The 63 native
runtime/catalog files outside the engine-acquisition module are unchanged from
6.4.5, including the driver and session implementation. Previously completed
new-engine condition/error, six-step session and four-step typed-answer checks
are retained evidence, not described as new installed-6.4.6 runs. No full-suite
rerun or customer clinical acceptance is claimed.

Artifacts and evidence: `tmp/local-upstream-6.4.6/`, including
`delivery-receipt.json`, `SHA256SUMS`, installed MCP/native/UI receipts and the
engine JAR/provenance. Earlier new-engine controls are in `tmp/upstream-dcac972/`.

| Artifact | SHA256 |
| --- | --- |
| `crl-language-support-6.4.6-local.vsix` | `368aa13bd924c3a836949a5c16d2a5a20d428be23a0b070e76b183ab548691fd` |
| `smile-digital-health-crl-6.4.6.tgz` | `46eeafddb550703e33afdb28427f10733d469614b948eb51849a0f82e7cd6957` |
| `cqf-fhir-cr-cli-definition-dcac972f.jar` | `fea41d5f6cc669b119b0666460855dc188c3a28f316c495b4c8ff0760d6f180f` |

The remaining candidate gates passed on September 21: the exact pinned engine,
checksum and provenance were published under `v4.122.0`; a fresh download matched
the tested bytes and passed installed Windows native MCP execution without an
engine override. Fresh installed Linux npm MCP passed kit, inventory, definitions
Bundle and preview checks. Six answer/change/clear steps and four dateTime/Coding
steps passed using this installed 6.4.6 package and Java 17. The initial Linux MCP
cold-start request timed out; its bounded retry passed without a product change.

Release assets and candidate evidence are staged in `tmp/release-6.4.6/`.
Native readiness review839 found 0 critical, 0 important and 0 nit issues; external
review remained unavailable. Publication CI gates npm delivery. Fresh registry
contents must match the candidate, because CI rebuilds npm from source. The
post-publication receipt records that separate verification. No customer migration
is part of this release.

## Local 6.4.5 — record-status preview

CRE now evaluates the supported explicit Condition/Observation RecordSet status
filters against the actual CEL-emitted resources, including same-record Condition
active/verified checks and explicit existence. Unsupported reached collection forms
remain errors; off-path probes do not contaminate reached supported results. Kit 2.15
documents that bounded support without claiming universal native parity.

Qualification: 713 focused kit/CRE/AST tests, the core MCP suite and 36 extension
MCP checks passed. Fresh installed npm and VSIX MCPs retain all 25 tools and return
the same audited kit. The actual npm package also passed the three generic cases
on Linux through the shared WSL coordinator. Visible installed MV checks show
true → Eligible and false → Not Eligible with result navigation. The UI fixture
uses stable case IDs; it has no source correspondence or generated FHIR form.

The three previously completed native controls agree with the preview. All 66
packaged native-runtime files, dependencies, CLI bins and exports match 6.4.4;
its broader native/session evidence is retained. The full regression and long
native suite were not rerun. Installed files match both archives (VS Code's
installation metadata in package.json is compared separately).

Artifacts and receipt: `tmp/local-cre-preview-6.4.5/`.
VSIX SHA256: `3e6f61cac888d53426a6743a2287afe22ac642fba593904232889c2d24e5079b`.
npm SHA256: `ecbbdf855b0af4d3588b799927594a0c4b611c23e2ce95fbb921efba547ad94c`.
Native reviews converged; the external reviewer was unavailable. Source and audit
are backed up on the recovery branch. No public release, customer migration or
upstream engine adoption occurred in 6.4.5. The subsequent 6.4.6 engine qualification
above covers the upstream correction for duplication issue1122.

## Local6.4.3 ? Result Questionnaire duplicate-input fix

This follow-up is based on the complete6.4.2 retention checkpoint8c8897c8. It preserves every earlier local release feature, the FHIR packager, coded Observation sources, pinned engine and kit2.13. Only MV question grouping/numbering/edit-state display changes; no customer migration. Evidence is in local build tmp/local-mv-question-dedup-6.4.3. Session/upstream work remains isolated at ec226205 and is not part of this local build.

## Local6.4.4 — definition Bundle and native session delivery

Based on the complete6.4.3 integration7b2421c9257dde3971c3a841ba364cef388467f4. Retains all prior local features and packaging. Includes independently committed cross-library emitter correction cab9ec369eca429cb7649f75585741d87460d3d0 and reviewed session checkpoint9401f5f3 through merge8a610ad5ea078152ff8c0298484d53363407e9e8. No customer migration or new language syntax.

Uncoded support libraries no longer falsely claim a coded policy's CodeSystem. Physical CQL filenames stay distinct, and PlanDefinitions bind the Library owning their named conditions. `emit_crl_bundle` and `emitCrlBundle` return a read-only definitions collection with local CQL embedded; `package_fhir` remains the separate NPM packaging operation. The stateless session API/CLI supports explicit typed edits and clears, with caller-owned retained state and documented repeating-group limitations. Kit2.14 is synchronized and audited.

Delivery evidence: `tmp/local-hcsc-session-6.4.4/`, including archives, kit export, SHA256SUMS, installed MCP and native receipts, exact archive/staged-file comparisons and delivery-receipt.json. Reuse prior unaffected broad-suite evidence; affected209core/kit and41extension tests passed. Actual installed artifacts are independently qualified. This is a local build, not a public release.

The 6.4.6 candidate includes this completed delivery commit and the session branch;
their ancestry is verified. Its subsequent upstream adoption is recorded above.
