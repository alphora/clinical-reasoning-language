---
name: crl-release
description: Cut a CRL release. Invoke for ANY release, re-release, or "let's ship this to the KE" — including a hotfix. Encodes the artifact-execution gate that four consecutive releases failed.
---

# Cutting a CRL release

**The green suite is not the gate. Executing the INSTALLED artifact is the gate.**

Every broken release this project has shipped was green when it shipped. The suite tests the
*working tree*; users run a **vsix** and an **npm tarball**, and those are built by a different set of
copy steps that no unit test exercises. That gap is where all four defects lived:

| release | what shipped | how green it was |
|---|---|---|
| 4.113.0 | questionnaire pane matched nothing (composed a pre-`0e7641da` path) | fully |
| 4.114.0 | `emit_results` required `ApplyDriver`, which was **in neither the vsix nor the tarball** | fully |
| 4.114.0 | setup required a JDK, a 216 MB extraction and a hand-typed `setx CRL_PRODUCER_CLASSPATH` | fully |
| — | four symbols defined, tested, and never called | fully |

Measured 2026-09-04: the 4.114.0 vsix has **36 entries and zero `.class` files**. `vsce package`
happily ships an extension whose advertised tool cannot run.

⚠ **`vsce ls` lies.** In this monorepo it lists ~48,000 entries (all of `tmp/`, `harness/`, the mining
corpus) because it follows workspace links. The real package is ~37 entries. **Only ever inspect the
built `.vsix` as a zip.** Never conclude anything from `vsce ls`.

---

## 0. Before anything: is this release even wanted?

Ask the operator, in chat, unless they have already said to ship. Do NOT self-authorize a release
because the work looks done. Standing operator instruction: *"we can't be releasing garbage"* /
*"STOP SHIPPING SHIT"*.

## 1. Bump FIRST — then everything below runs once, on what actually ships

**Bump all three `package.json` versions to the SAME number** — root (private), `packages/crl`
(`@smile-digital-health/crl`), `packages/crl-vscode` (`crl-language-support`). They move in LOCKSTEP and
have desynced before (crl-vscode at 4.89 while core sat at 4.47). Then `npm install --package-lock-only`.

Bumping first, rather than after the gates, is deliberate: the version is baked into the vsix and into
`emit_results` provenance (`manifest.provenance.crlVersion`), so a pre-bump verification is a
verification of bytes that will never ship. Bump once, verify once, and what you tested is what goes
out. **Do not commit the bump yet** — commit it only once the gates pass, so an abort leaves nothing
to unwind (§8).

⚠ **Gate C needs the crl-vscode bump anyway** — VS Code silently skips installing a same-version
vsix, so without it you verify the OLD bytes. That alone forces the bump to the front.

## 2. Gate A — build EVERYTHING, then test EVERYTHING

There are four build products and they are built by four different commands. Run all four, in order —
each later one consumes the earlier one’s output, so a skipped step silently tests stale bytes.

```bash
# 1. CORE (tsc + copy-catalog: stages the catalog .cql AND the compiled $apply driver into dist/)
npm run build -w @smile-digital-health/crl

# 2. THE $apply DRIVER -- ONLY if packages/crl/src/results/driver/ApplyDriver.java changed.
#    Needs a full JDK + the engine jar; it is a MAINTAINER step, not a per-release one. The
#    committed .class is what ships, and the drift test below fails if you skip this after editing.
node packages/crl/scripts/build-driver.mjs <engine.jar>   # then commit .class AND .build.json

# 3. EXTENSION + MCP SERVER (one esbuild run makes extension.js, mcp-server.js, provision.js,
#    and copies the catalog .cql + driver/ next to the bundle)
npm run compile -w crl-language-support

# 4. TYPECHECK both
npx tsc --noEmit -p packages/crl/tsconfig.json
npx tsc --noEmit -p packages/crl-vscode/tsconfig.json
```

Then all the tests — one command, and it genuinely is all of them:

```bash
npm test    # crl (vitest) + its MCP integration test + crl-vscode (vitest, compiles first)
```

Confirm the MCP test actually ran: `run-mcp-server.test passed` appears in the output. It is the only
test that spawns the real MCP server and calls tools over the protocol — the thing the KE actually
touches — and it spent a long time outside `npm test` entirely, so "the suite is green" excluded it.
It is wired in now (`crl`’s `test` chains `test:mcp`, whose `pretest:mcp` builds core first). **If a
future change unchains it, fix the script rather than documenting the gap.**

⚠ **The workspace name is `crl-language-support`, not `crl-vscode`.** `-w crl-vscode` fails with
"No workspaces found", which is easy to read as "nothing to do". (The *vitest project* IS `crl-vscode`.)

⚠ **A green core run does not build the extension.** `--project crl` leaves every esbuild copy step
unexecuted — exactly how 4.114.0’s missing driver stayed invisible through a 3754-test pass.

- [ ] Every symbol added this cycle has a **caller**, not just a test. Grep each new export; four
      symbols here were defined, tested, and never called.
- [ ] Every import block you touched is free of leftovers. A CLI here carried **20** unused imports
      that read as evidence it still did work it had long since delegated.
- [ ] Any gate you added, you have **watched fail**. Mutate the input, see red, restore, see green. A
      gate that has only ever passed is not known to be a gate — and gates here have compared a helper
      against itself and proved nothing.

## 3. Gate B — the artifacts (THE ONE THAT CATCHES REAL DEFECTS)

Build both published artifacts and **look inside them as archives**:

```bash
cd packages/crl-vscode && npx vsce package --no-dependencies -o /tmp/verify.vsix
# pass the WINDOWS path -- git-bash /tmp is not the path python sees
python3 -c "import zipfile,sys;n=zipfile.ZipFile(sys.argv[1]).namelist();print(len(n));print(chr(10).join(n))" <abs-path-to.vsix>
npm pack -w @smile-digital-health/crl --dry-run --json   # inspect .files[]
```

- [ ] **Every runtime dependency of every tool is physically present in BOTH archives.** Walk the
      TOOLS, not the file list: for each `emit_*` / MCP tool added or touched, name what it reads at
      runtime (`.cql`, `.class`, catalog json) and find that exact path in the zip.
- [ ] Diff against the previous release’s vsix — `namelist()` on both. An entry count that did not
      move when you added a shipped asset is the defect, visible in one line. (4.114.0: 36 entries,
      zero `.class`.)
- [ ] Anything resolved via `join(__dirname, …)` is **triply** suspect: `__dirname` differs between
      `packages/crl/dist/`, the esbuild bundle (`crl-vscode/dist/`), and the **globalStorage stable
      copy**. A file can be right in one and missing in the other two. Check all three.
- [ ] Assets in a **subdirectory** need `mkdirSync(dirname(dst))` in `stageStableServer`; that list was
      flat until `driver/ApplyDriver.class` arrived, and a flat copy would have staged it to the wrong
      place with every test green.
- [ ] Committed binaries carry a **sidecar hash of their source** (`ApplyDriver.build.json`) plus a
      test asserting the two agree — else an edited source with a stale binary ships and nothing
      anywhere disagrees.

## 4. Gate C — execute the installed artifact as a KE

Not the working tree. The thing a user installs.

- [ ] ⚠ **Bump `packages/crl-vscode`’s version FIRST, or you will verify the OLD bytes.** The `crl`
      MCP server does not run from the vsix or the installed extension dir — it runs from a
      **globalStorage copy** that `.mcp.json` points at, restaged from the INSTALLED extension on each
      activation. **VS Code silently skips installing a same-version vsix**, so the installed dir keeps
      its old bundle, activation copies the old bundle, and globalStorage stays stale. You then
      conclude "the build is broken". (#224 hit exactly this at 4.92.2 → fixed by bumping to 4.92.3.)
      A patch bump is enough; `check-core.cjs` does not enforce crl-vscode↔core parity.
- [ ] Reinstall: `code --install-extension <vsix> --force`, **reload the VS Code window** (re-stages
      globalStorage), **and restart Claude Code** — a separate process that re-spawns the MCP server;
      a window reload alone is not enough.
- [ ] Confirm the tools the bundle actually registers:
      `grep -oE 'registerTool\(\s*"[a-z_]+"' packages/crl-vscode/dist/mcp-server.js | sort -u`
      — and against the INSTALLED globalStorage copy, which is the one that runs. v2.4.0, v2.4.1 and
      v2.4.2 all shipped a vsix bundling a stale 5-tool MCP surface; a user reported it, not a test.
- [ ] Call each touched tool over **MCP**, not just the CLI — different entry points, and only one is
      what the KE uses. Read the output; do not infer it from an exit code.
- [ ] For anything spawning a JVM, run where `java` resolves through the **Oracle javapath shim**
      (`java`/`javac`/`javaw`/`jshell`, no `jar`). That configuration alone broke the 4.114.0 design.
- [ ] Anything with a viewer (pane, cockpit): **open it and confirm it matches.** A pane that renders
      empty is indistinguishable from a pane with nothing to show. That shipped for months.

## 5. Gate D — setup cost is part of the product

Write out, literally, every step a KE performs from zero. If that list contains hashing a jar,
extracting an archive, composing a classpath, or `setx`, **the release is not ready** — those are our
steps wearing the user’s clothes.

4.114.0 asked for six. Removing them took one day and deleted code: two of the three required tools
(`javac`, `jar`) turned out to be consequences of OUR design, not the engine’s. **Ask which of the
user’s steps exist only because of a choice we made** — that is usually most of them.

## 6. Gate E — the panel, before it becomes durable

A release is durable by definition. Unless the change is a pure formatting/dependency bump, run the
panel: **both arms, same lens, byte-identical message, same turn**, and carry the DIFF (reviewers
cannot run git). Then:

- [ ] **Verify every checkable claim by running it.** Arm agreement is evidence about reasoning, never
      about facts. Both arms independently found the missing-driver defect here; reading the zip is
      what made it true rather than plausible.
- [ ] Every point gets **accept / refine / reject in writing**. Never silently dropped.
- [ ] Check the packet’s own claims. One here said the change deleted a file that had never been
      committed — a reviewer caught it, and an unchecked packet makes reviewers confidently wrong.

## 7. Cut it — and ship every product, not just the vsix

Four things are built (§1); **three are published, by different mechanisms.** Missing one is a
partial release that looks complete.

| product | how it reaches a user | who publishes it |
|---|---|---|
| **vsix** (extension + bundled MCP server + catalog + `$apply` driver) | GitHub release ASSET — users download and install | **you, by hand** (`npm run package:extension`) |
| **npm tarball** `@smile-digital-health/crl` (core + CLI + driver) | `npm install` | `release.yml` on `release: published` |
| **catalog + CRLCommon.cql + pattern catalog md** | GitHub release assets | **you, by hand** |

The MCP server and the `$apply` driver have **no independent release** — they ride inside the vsix and
the npm tarball. That is precisely why Gate B inspects both archives: a product with no release of its
own is a product nothing checks.

### Steps

1. Commit the bump from §1: `chore(release): X.Y.Z — <what changed>`. The gates have already run
   against these exact bytes.
2. Release notes → **`tmp/RELEASE_NOTES_vX.Y.Z.md`**, never the repo root. The operator posts them to
   the GitHub release page and treats that as canonical; they deleted the ones that accumulated in the
   root and asked for them in `tmp/` instead.
3. Before tagging, **check the in-scope issues are actually closed**: `Closes #N` auto-closes only on
   the DEFAULT branch, so nothing landing on `develop` closes anything. `gh issue view <N> --json state`
   for each is a 30-second check; a release once shipped with 12 of 13 issues still open.
4. `git checkout main && git merge --ff-only develop && git push` — main is strictly behind, so this is
   clean.
5. **Lightweight** tag `vX.Y.Z` on main (prior tags are lightweight, not annotated); push it.
6. `gh release create vX.Y.Z --title … --notes-file tmp/… --target main <assets>` — published, not
   draft. Publishing is what FIRES `release.yml`. Assets:
   - `packages/crl-vscode/crl-language-support-<ver>.vsix`
   - `smile-digital-health-crl-<ver>.tgz` (`npm pack -w @smile-digital-health/crl`)
   - `packages/crl-vscode/dist/catalog.json`
   - `packages/crl/src/cql-emitter/catalog/CRLCommon.cql`
   - `packages/crl/src/cql-emitter/catalog/inference-pattern-catalog.md`
   - **`SHA256SUMS`** — `sha256sum <each asset> > SHA256SUMS`. Without it a consumer can only hash
     their own download, which proves their fetch and not the published bytes.
7. **Watch `release.yml` to green.** A red CI after publish is a FAILED release, not a footnote: the
   GitHub release looks complete while the npm tarball never shipped.

### When CI fails after publishing

- **`publish-npm` 404 on the PUT** — the package exists, so a 404 is an AUTH failure: the `NPM_TOKEN`
  repo secret expired. npm tokens carry an expiry now. Claude cannot see or set it; the operator
  regenerates (granular, `@smile-digital-health` read+write, or a classic Automation token) and updates
  the secret. The GitHub release and its assets are unaffected — only npm is blocked.
- **`npm ci` lockfile errors** — already handled: both jobs use `npm install`, because the lockfile is
  generated on Windows and linux `npm ci` rejects it over platform-resolved optional deps. The reason
  is recorded in `release.yml` itself; do not "fix" it back to `npm ci` without regenerating the
  lockfile on linux first.
- **Re-publishing the same version after fixing the workflow:** a job re-run reuses the ORIGINAL commit
  and workflow version, so `gh run rerun` does NOT pick up your fix. Instead:
  `gh release delete vX.Y.Z --yes --cleanup-tag` → re-tag at the fixed `main` HEAD → `gh release create`
  again. The built vsix/tgz are reusable if only CI files changed. If you committed the fix directly on
  `main`, FF `develop ← main` afterwards.

## 8. Aborting — how to unwind, at each point

A release can fail a gate at any stage. What it costs to back out depends entirely on **how far past
the tag** you got, because everything before the tag is local and everything after is public.

| you are at | to abort |
|---|---|
| **bumped, not committed** (§1) | `git checkout -- package.json packages/*/package.json package-lock.json`. Nothing else touched. **This is why §1 says not to commit the bump.** |
| **bump committed, not tagged** | `git reset --hard HEAD~1` on `develop` if it is the tip and unpushed. If it IS pushed, do NOT rewrite — leave it and land the fix as the next commit; a version bump sitting on `develop` ships nothing by itself. |
| **merged to `main`, not tagged** | `main` is only a fast-forward of `develop`; nothing is published until a tag + release exist. Fix forward on `develop` and FF again. |
| **tagged, no GitHub release** | `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`. Still nothing published. |
| **release published** | `gh release delete vX.Y.Z --yes --cleanup-tag`. ⚠ If `publish-npm` already went green, **the npm version is permanent** — npm forbids republishing a version, and unpublish is heavily restricted. Ship `X.Y.Z+1`; do not try to reuse the number. |

⚠ **The one-way door is `publish-npm` going green, not the tag.** Everything up to that is cheap to
undo. So if a gate is going to fail, it is much better for it to fail LOUD and EARLY — which is the
whole reason Gates A–C run before anything leaves the machine.

Local artifacts left behind by an abort (`crl-language-support-X.Y.Z.vsix`, `*.tgz`) are gitignored
scratch; delete them so a later release cannot attach a stale one.

## 9. After

- [ ] Tell whoever was blocked, **naming what changed for them** — especially if you previously sent
      instructions the release invalidates.
- [ ] Close the issues it fixes (`Closes #N` does not auto-close from `develop`; close via `gh`).
- [ ] If it changed the panel (prompts, protocols, agents), `Vibe Tools: Push to Corpus`.

---

## The rule behind all of it

> A tool whose dependency is not in the artifact that carries the tool is a tool that does not work,
> and it will be green the entire time.

When tempted to skip a gate because the change is small: 4.114.0's defect was a **missing file copy**.
