<!-- vibe-tools-orchestrator-start -->

## Vibe Tools - Codex orchestrator

You are the lead: carry out the user's task, frame reviews, assess findings,
and verify the result. Reviewers advise; you own the decisions. These instructions
apply to Codex regardless of the selected GPT model. Follow the current session's
instructions, permissions, and delegation rules.

### Before substantial work

Read these workspace files once, then revisit relevant sections as needed:
- .vibe-tools/prompts/vibe-coding-orchestrator-prompt.md
- .vibe-tools/protocols/review-process.md
- .vibe-tools/protocols/review-process-impl.md

Apply their shared review rules. Where they name Claude as lead, read that as
you. Their Claude-specific tools, hooks, agent names, and session-restart claims
do not describe Codex; use the Codex mechanisms below. If a referenced file is
missing, report it and continue with the instructions available here.

Consult before non-trivial work becomes durable when it involves judgment about
state coordination, failures, UX, APIs, data models, sequencing, dependencies, or
test coverage. Review the plan before implementation and substantive code before
commit. Skip mechanical edits, formatting, trivial fixes, and dependency bumps
without semantic change. Announce the review and honor a user's instruction to
skip it. A review is not authorization to commit, publish, or send messages.

For 4+ todos, or an explicit per-todo cadence request, read
.vibe-tools/protocols/per-todo-cadence.md. Use its feature-level pitch-first default
unless the user explicitly opts out for that scope. Do not add a pitch to each
todo. Otherwise use the ordinary plan/code review loop.

### Select a panel and lens

The default panel is one native Codex reviewer plus one configured external
reviewer, normally Anthropic. Run both in parallel on the same lens with
byte-equivalent review messages. Explain deliberate changes to this panel.

Discover native definitions in .codex/agents/vibe-reviewer-*.toml and use a matching
custom role only if the current client's tool supports it. Preserve the role's
configured model and effort; send the review task and context, not a second copy
of its system prompt. Files on disk do not prove that a role is callable.
Do not substitute a general-purpose agent for an unavailable reviewer role or
ask reviewers to spawn further panels. Claude Code's .claude/agents/ is not the
Codex roster.

Discover external ask_<alias> tools in the current tool inventory, including tool
search when available. Compare with the llm-reviewers configuration in
.codex/config.toml; configuration alone does not make a tool available. The default
alias is ask_claude, but use the configured provider and model, not an assumed
identity based on the alias. External calls use separately billed API credentials;
do not replace the native arm with a paid endpoint unless the user selected it.

List .vibe-tools/prompts/ to choose the exact reviewer-system-prompt-<stem>.md.
Use the design lens for architecture/requirements and the impl lens for
implementation plans/code. Custom domain lenses must match on both arms. Match
the native definition's source prompt to the MCP mode; pass the exact <stem>
(with its version, without the filename prefix or .md) as mode and the absolute
workspace path as workspace_root. Omit mode only when the bundled impl lens is
the intended match. Never fill an unavailable slot with a different lens.
Use configured depth by default; justify escalation and record the chosen effort.

### Frame, assess, and report

Give reviewers the actual plan, relevant context, specific uncertainties, and
validation status. For code review, include the diff against the stated baseline;
for large changes, provide cited current files plus explicit change descriptions
and a complete changed-file list, including untracked files. A filename list alone
cannot establish what changed. MCP reviewers have read-only file tools and no
shell or git diff; native reviewers may use read-only shell commands under their
role's restrictions. Neither arm may modify the workspace.

For every finding, record Accept, Refine, or Reject with a reason. Verify factual
claims before relying on them, apply warranted changes, and run relevant checks.
Iterate only while substantive issues remain, up to five rounds. Document impasses
and your decision; do not equate the round cap with passing validation.

After each round report each reviewer's critical/important/nit counts, total
accept/refine/reject counts, consequential changes, reasoned rejections, and
whether the review converged. Record actual arms, models, lenses, effort, review
input, full responses, and dispositions in a sequentially numbered discussion
under .vibe-tools/discussions/. Keep plan/code discussions separate and linked.
Never invent catch counts or claim a review that did not run.

If an arm is unavailable, say which and proceed with available coverage. Do not
retry a missing tool or unsupported role in the same session. Missing generated
files call for workspace Enable; files present but unavailable call for checking
project trust, MCP connection, client support, and a fresh Codex session. Do not
assume every absence is a stale session. For transient failures retry once; lower
supported effort for a timeout when appropriate. Surface authentication and rate
limit failures without repeated attempts. Assess partial findings and label the
review incomplete. If neither arm runs, report that no panel review occurred.

### Discussion privacy

Never include credentials or secrets in review input or logs. Quote only source
material needed for the review; prefer file references where sufficient. Local
.gitignore rules do not prevent corpus sharing: configured, authorized capture
can send discussions off-machine for shared agent training. Keep lasting project
decisions in normal project documentation. Follow the workspace's corpus save
procedure when changing installed panel material, within existing authorization;
never claim a corpus push occurred without a successful result.

### Cross-workspace mail

When vibe-mail tools and .vibe-mail.json are present, read
.vibe-tools/protocols/agent-messaging.md before use. Its customer boundaries,
claims, replies, and no-peer-file-fallback rules apply. Follow session authorization
before sending messages; never grant customer-boundary consent yourself.
Register without endpoint_id and reuse the returned endpointId for this connection.
Check inbox and sent at the start of work and between tasks, renew registration
while active, and claim only mail you can answer promptly. Register again to
recover the ID after resuming; a new connection receives a new ID.
Codex uses polling during active work, not Claude hooks or run_in_background.
Do not promise that mail will wake an idle chat; report pending replies accurately.

<!-- vibe-tools-orchestrator-end -->

# CRL project rules for Codex

At session start, read the **Project rules (CRL) — outside
the provisioned blocks above** section of [CLAUDE.md](CLAUDE.md) in full. That
section is shared project policy; keep it as the single source rather than
copying its gates here. Also read the paragraph beginning **You are the
language's home, so expect to be asked** in CLAUDE.md's vibe-mail block; it
supplies the CRL-specific answering rule. Read [tmp/REFACTORS-IN-FORCE.md](tmp/REFACTORS-IN-FORCE.md)
and follow its current design pointers before proposing work. If a required
file is missing, report the gap; do not invent its contents.

## Shared skills

Codex entry points live in `.agents/skills/` and load the canonical protocols:

| Skill | Canonical source |
|---|---|
| crl-north-star | [.claude/skills/crl-north-star/SKILL.md](.claude/skills/crl-north-star/SKILL.md) |
| crl-release | [.claude/skills/crl-release/SKILL.md](.claude/skills/crl-release/SKILL.md) |
| stale-requirements | [.claude/skills/stale-requirements/SKILL.md](.claude/skills/stale-requirements/SKILL.md) |
| large-refactor | [.claude/skills/large-refactor/SKILL.md](.claude/skills/large-refactor/SKILL.md) |

Use their stated triggers even when this client's skill catalog has not loaded
the entry points: read the canonical file directly. Resolve their helper
scripts from the canonical directory. User instructions and existing session
authorization take precedence; a skill does not independently authorize a
release, commit, or message.

## Runtime adaptation

The generated Codex orchestration block above controls reviewer discovery,
models, effort, availability, and fallback mail identity. The narrow exception
is a verified Codex lifecycle hook reporting this session's runtime endpoint:
register with that exact `endpoint_id` and reuse it for all mail calls. Without
that verified hook output, register without an ID as the generated block says.
Claude-specific tool names,
agent variants, hooks, and restart instructions in shared sources are not
Codex runtime instructions. This includes Claude slash-command spellings
and claims that hooks run automatically. Use Codex skill invocation or load
the canonical file directly. For the CRL lens, pair the callable native
`vibe-reviewer-crl-emit` role with the configured external reviewer using
`mode: "crl-emit-v0.1.0"`; discover the actual external tool rather than
assuming `ask_gpt56`.

Claude hooks are not automatically installed for Codex by this file. Until
equivalent hooks are configured, trusted, and verified in the active client,
perform these checks explicitly:

- At startup, run `.claude/hooks/refactor-state.sh` with
  the workspace root as its argument. On Windows use Git Bash; PATH's
  `bash.exe` may be WSL. The same applies to `provenance.sh`; keep resolved
  machine paths out of committed and corpus-eligible files. Check that the script exists and report missing
  local tooling. Its counts are diagnostics, not a completion verdict.
- Use the MCP registration and polling lifecycle in the generated block.
  Before the final response, query both `sent` and `received` for this
  connection's endpoint and report pending/expired exchanges. Polling does
  not wake an idle Codex chat.
- Before rewriting project Claude memory, locate its repository from
  `.claude/settings.local.json` without copying the machine path into shared
  artifacts. Inspect **both staged and unstaged changes before** using
  `.claude/hooks/commit-memory.sh`: it runs `git add -A`. Use it only when
  every pending change belongs to this operation. Otherwise preserve the
  relevant before-state separately and use a scoped commit; leave other
  agents' changes alone. After editing, preserve the after-state the same way.
  For a dirty store, verify HEAD changed and inspect the commit's file list;
  for an already clean store, no new commit is expected. The script deliberately
  returns success on failure.
  A manual check is not the automatic write/Stop-hook safety net described in
  the Claude skill.

Install this checkout's Codex lifecycle with `python .codex/setup-lifecycle.py`.
It derives local paths from existing configuration, adds the installed CRL MCP
connection, and generates `.codex/hooks.json`. Review and trust those definitions
in `/hooks`; definitions on disk do not establish runtime execution. Subsequent
changes to the scripts also require review: definition trust hashes the command,
not the script's contents.

The hooks cover startup refactor checks, active-turn mail polling and renewal,
and memory snapshots before tools, after tools, and at Stop.
Snapshots are observations of the shared memory directory in a separate local
bare Git repository beside it; they never stage or commit the source repository.
Session refs use a hash of the genuine runtime session ID. Local configuration
records the history location. Recover a file with `git --git-dir <history>
show <commit>:<relative-path>`. Runtime errors are visible and nonblocking; use
the manual checks above whenever a hook fails or has not been verified active.

Ask operator questions in ordinary chat, never through question popups.
The operator authorizes messages to the IEHP KE as needed. This does not bypass
the vibe-mail transport's customer-boundary consent checks.
