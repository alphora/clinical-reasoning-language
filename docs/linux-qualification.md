# Remote installed Linux qualification

Run `.github/workflows/linux-qualification.yml` on GitHub-hosted Ubuntu. It uses
an independent checkout, Node 22, Java 17 and runner-local storage. No customer
content, local WSL/Docker or mount of a maintainer drive is required. Windows
VSIX activation/staged MCP and Windows process checks remain local, using the
existing VS Code installation and isolated test profiles.

For release qualification, dispatch the workflow at the candidate source revision
with `release_tag` and the independently recorded `artifact_sha256`. It downloads
that release's exact npm asset, rejects a hash mismatch and installs into a separate
directory outside the checkout. The version must match the checked-out source.
Without a release tag it builds and packs this checkout. Receipts distinguish
`release-asset` from `source-build`; the latter does not prove release-asset identity.

The runner verifies the full audited kit, the 25-tool MCP inventory and three
generic preview cases through the installed MCP server. Installed `emit_results`
then exercises two generic cases, checking failure states, default engine selection,
engine identity, per-case artifact hashes, exact Q/QR association and populated or
unanswered Boolean values. Batch output contains Q/QR, not action dispositions.
The separate six-step answer/change/clear and four-step dateTime/Coding controls
assert actions against full native results and check extraction and retained answers.
Process/cancellation changes also require the affected process tests; these fixed
controls alone do not establish every cancellation behavior.

Download the workflow artifact and inspect `results/verification.json`, MCP logs,
native forms, session progress/results and package hashes. A pass requires the
workflow itself to succeed and the final receipt's `passed` to be true. Keep the
run URL and source/package/engine/driver identities in the release receipt. Engine
cache and installed dependencies are excluded from the evidence archive.

The job allows 35 minutes: preparation is bounded to seven and qualification to
25, leaving time for the always-run artifact upload. Downloads, MCP requests and
native calls have shorter individual deadlines. The `timeout_probe` input performs
a deliberate five-second timeout; that run must fail while preserving a downloadable
diagnostic receipt. A wrong release hash must also fail before installed execution.
Inspect these negative runs when changing the workflow's failure handling.

## Verified runs

The initial workflow revision `1387c571bc76488b15d4861172402309431e1fd1`
was qualified on GitHub-hosted Ubuntu on 2026-09-21:

- [Source-build success](https://github.com/alphora/clinical-reasoning-language/actions/runs/35644248764).
- [Published 6.4.7 package success](https://github.com/alphora/clinical-reasoning-language/actions/runs/35644250658): audited kit 2.17, 25 MCP tools, three preview cases, two native emission cases, six session steps and four typed session steps.
- [Wrong-hash control](https://github.com/alphora/clinical-reasoning-language/actions/runs/35644670806): preparation failed with exit 1 before installed execution; diagnostic upload succeeded.
- [Timeout control](https://github.com/alphora/clinical-reasoning-language/actions/runs/35644670827): deliberate timeout exited 124; false verification receipt and diagnostic upload preserved.

The source-built and downloaded release archives both had SHA256
`fd555f5b9d685f0438d69b530a39a68184f65787b6d35d5730647ce8b222b050`.
The engine SHA256 was
`fea41d5f6cc669b119b0666460855dc188c3a28f316c495b4c8ff0760d6f180f`,
and the driver SHA256 was
`84392646979904f48fe2d4aa37e90f78efc81f62308e2a4d9e36c698216b76cf`.
These are bounded tooling/runtime controls, not customer-policy acceptance.
