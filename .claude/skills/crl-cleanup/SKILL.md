---
name: crl-cleanup
description: "Purge obsolete CRL build, test, probe, and release scratch files; reclaim disk space and redirect generated caches and temporary output to the operator's storage drive. Use for workspace cleanup or a filling system drive."
---

# CRL cleanup

Reclaim space by deleting disposable outputs and preventing their recreation in
the wrong location. Old files are candidates, not proof that deletion is safe.
Use the current session's authorization; this skill adds no approval gate for
cleanup already requested. Retain ambiguous material and explain why.

## Identify what can go

Measure free space and the largest relevant directories before choosing targets.
Include the effective TEMP/TMP directories on D as well as leftovers at their old
C locations. Relocation is not retention: D temp files need the same purge checks.
Include generated files at the checkout root and tool cache locations, not only
`tmp/`. Count physical storage without following junctions or double-counting
linked trees; file sizes may include shared hardlinked storage.
Inspect the active task, `git status` (including untracked files), `git worktree
list`, running jobs, and the current state/handoff documents. Read the generator
or build/test command for candidate scratch directories; names alone do not
establish ownership. Search references in active docs, scripts, and review records
before removing a referenced path.
Include ignored discussion records, archives, handoff files, and the configured
project memory store in that reference check. Current `tmp/REFACTORS-IN-FORCE.md`,
unresolved design notes, discussions, memory/history repositories, and issue
handoffs are project state, not cache. A corpus configuration is not proof that
their actual contents were saved elsewhere.

Classify each exact target:

- **Purge:** obsolete, reproducible generated build/test/probe output whose job
  has ended and whose contents are no longer needed. Include abandoned staging
  copies after checking they contain no unique work. Use age only to prioritize
  inspection. Neither ignored nor untracked means disposable.
- **Relocate:** caches or generated artifacts still worth retaining, currently
  on the wrong drive. Preserve required data and verify the destination before
  removing its original copy.
- **Retain:** source, fixtures, customer input, current deliverables, dirty
  worktrees, active sessions/databases, sole copies of required evidence, local
  configuration/credentials, and working storage redirections. Read prior cleanup
  receipts before changing a junction or considering its old backup for removal.

Produce an explicit list of eligible paths and their containing allowed directories.
Inside a checkout, use `git ls-files -- <relative-target>` to distinguish tracked
fixtures (including fixture `node_modules`) from generated dependencies. Changes
to tracked files are normal source changes, not routine scratch purges.

Keep the current kit source checkout and delivery artifacts while kit work is in
progress. Keep release/acceptance receipts and any inputs or outputs still needed
for review, reproduction, handoff, or a current defect. A smaller durable receipt
can replace bulky reproducible payload only after those dependencies are clear;
record source revision, reproduction command/configuration, tool versions,
result, artifact hashes, and where any necessary inputs remain available.
Keep receipts and review logs free of credentials and unnecessary customer data.
Put material needed for review or delivery in a named durable artifact directory
outside Temp. Do not leave its only copy among disposable scratch files. Old
working notes can be purged once their still-relevant decisions and evidence are
captured durably and no active reference depends on them.

For a completed Git worktree, check staged, unstaged, untracked, and ignored
contents for unique material, plus unfinished jobs and nested repositories.
Confirm its commits remain reachable from a retained ref in the parent repository.
Retain any nested repository whose unique work or commits are not preserved.
Use `git worktree remove` without force. A refusal is a reason to inspect and
retain it, not to switch to recursive deletion. Proven disposable ignored build
output can be purged first under the same path checks. Do not delete the main
checkout, current working directory, or its ancestors. Branch deletion and Git
history pruning are outside ordinary scratch cleanup; preserve cited revisions.
Removal can succeed with ignored files present: the ignored-content inspection,
not absence of a refusal, protects those files.

## Stop new writes filling C

Honor the operator's destination. For this workspace, generated temporary files
and caches belong on D; do not move source checkouts already on E. Derive the
current user paths and mirror each selected C path on D. Keep resolved machine
paths in local operation records, not committed skill text.

Pay particular attention to agent-created files anywhere below the C user profile:
one-off scripts, downloaded tools, probes, logs, screenshots, build staging and test
outputs. Set an explicit working directory for commands and use a named task
directory under the chosen D scratch root. Do not fall back to the profile root,
Downloads, or a tool's C temp default for convenience. Preserve requested final
artifacts outside scratch. Do not redefine USERPROFILE/HOME or junction the entire
profile to redirect a few generators.

Separate writes under the agent's control from application-managed session history,
attachments, caches and databases. Identify the actual writer before changing its
storage. Configure supported runtime locations when safe; if a live application
must close first, record that dependency instead of claiming all C writes stopped.

Prefer supported cache/output settings. Check user and process TEMP/TMP and the
tools actually used by the task (for example npm and pip cache configuration).
Create the destination, verify a write, and set the current command's environment
explicitly. Persistent user settings affect future processes; an already running
editor or agent may retain its old environment until restarted. Verify the
tool's effective path, not just the setting that was written.

A junction can preserve a hard-coded old cache path when settings are insufficient.
Use it only for a specifically identified directory. Before moving it, stop or
otherwise exclude its writers, inspect link targets, check destination space, and
record rollback paths. Never relocate a live agent's session/database directory
or the entire user Temp directory under running applications.

Copy without overwriting unrelated destination contents. Verify relative paths
and SHA256 file contents; report progress for large trees instead of weakening
verification to a sample. Check the local destination volume supports the link
and will remain available. Rename the source to a sibling backup while writers
remain quiescent, create the junction at the original path, then verify its target
plus a write through the old path. Preserve the original or
backup on any copy, access, reconciliation, or verification failure. Do not treat
a process-name search alone as proof of exclusive access. Defer live application
state until a coordinated shutdown; report that remaining dependency explicitly.
After successful retained-data verification, remove the named sibling backup
within authorized scope, remeasure free space, and record its removal. If it must
remain, record its exact path and pending verification/removal status. A disposable
cache may instead be classified for purge without claiming a verified data move;
never apply that exception to unique files or evidence.

## Purge and verify

Before any recursive delete or move, resolve and inspect the exact absolute
target against the named allowed directory. Check ancestor and descendant reparse
points without following them; check the actual shell's behavior when needed.
Do not recurse through any tree containing a link. A junction cleanup must target
the link itself deliberately, never recurse into its storage destination.
Classify children individually rather than treating the entire Temp directory as
a purge target. Retain existing working redirections; purge only the inspected
subtrees verified free of links. Do not delete, move, or rename the current working
directory or its ancestors.

On Windows use native PowerShell with `-LiteralPath` in one shell end to end.
Do not construct deletion commands from wildcard matches or pass enumerated paths
to another shell. Discovery may use patterns; mutation uses the inspected exact
paths. Stop on access errors or changed contents and report what was retained.
Never broaden a failed cleanup to its parent directory.
Recheck inspected targets immediately before acting; skip anything changed by
another job. `Remove-Item -Force` for inspected hidden/read-only output is distinct
from forbidden `git worktree remove --force`. Report partial deletion explicitly;
PowerShell deletion bypasses the Recycle Bin. Do not unlink a temporarily unavailable
storage drive's junction as if its target were disposable or already gone.
If a partial deletion leaves a dependency tree or cache unusable, mark it invalid
and requiring regeneration before use; directory existence is not a health check.

Save a local receipt outside the deleted trees: exact targets, provenance and
reason, action, verification, bytes removed or relocated, and retained exceptions.
Keep it in a named maintenance-artifact folder outside Temp and include that folder
among retained evidence on later runs.
Recheck free space and the effective output/cache paths. Distinguish measured
free-space change from the sum of removed file sizes, and relocation from purging.
Do not claim C is fully redirected while live applications still write there.

When recurring scratch leaks come from tests or scripts, identify the generator
and fix its lifecycle cleanup in a separate scoped change with relevant checks.
New jobs should use an identifiable task directory and clean completed scratch
in their normal/failure teardown after preserving any diagnostics still needed.
Do not delete a failing test's only diagnostic before recording the failure.
