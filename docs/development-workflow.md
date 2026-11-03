# Development, operator testing, and release branches

The operator approved this workflow on November 3, 2026: completed features merge
into `develop` when ready for operator testing, and the normal debug command runs
from `develop`. Release promotion to `main` follows testing and explicit release
authorization.

- `main` contains released code. Do not merge, tag, publish, or deploy merely
  because a development feature is ready to test.
- `develop` is the integration branch for the next release and the normal branch
  in the operator's regular checkout. Include completed features ready for testing.
- Short-lived `codex/<feature>` branches start from current `develop`. Implement,
  review, and verify there, then merge into `develop` before telling the operator
  to test. Operator testing is not a prerequisite to this integration merge.
- Deferred or unfinished features stay on named feature branches. Preserve their
  source and any required example/session state there; do not leave their edits
  mixed into the `develop` working tree. Report a feature that remains on a branch
  as pending, rather than included in the test build or release.

Use the regular checkout for local CRL development and operator testing. Do not
create additional local CRL source clones or worktrees unless the operator
explicitly requests one. A separate verification profile, extensions directory, or generated test
output is not a source checkout; these may isolate tests from operator settings.

The normal **Run Bleph Medical Validation** F5 configuration must compile core and
the extension from `${workspaceFolder}`, load that extension, and open that
checkout's Bleph workspace. Do not redirect it to another checkout or an old
packaged extension. Verify the actual launch, not just a separately tested build.
After a rebuild, stop and restart an existing debug session to load the new code.
Temporary output and caches belong on the operator's designated storage drive.

Before changing branches or integrating work, inspect staged, unstaged, and
untracked files. Preserve pending work with exact identities on its owning branch
before clearing it from `develop`; use scoped paths and verify preservation.
Do not sweep unrelated files into a feature commit, discard work, or hide deferred
implementation in a shared file that can accidentally enter the next release.
Reconcile published fixes into `develop` before cutting new feature branches.

Fix operator findings on `develop`, then repeat the checks affected by the fix.
For release, use the [release skill](../.claude/skills/crl-release/SKILL.md), verify
the exact tested revision and main/develop ancestry, and promote the qualified
revision to `main` under explicit authorization. A `develop` merge or debug pass
does not replace installed-artifact release qualification.
