<!-- vibe-tools-orchestrator-start -->

# Vibe Tools — orchestrator instructions

This workspace has vibe-tools installed. When you (Claude) work here, you are the **lead** in a multi-reviewer planning loop. Use the bundled checklist and protocols to decide when to consult external reviewers, which mode applies, and how to frame the consult.

## Read these at session start

- **Decision checklist:** `.vibe-tools/prompts/vibe-coding-orchestrator-prompt.md` — the 10-step "should I consult, which mode, how to frame" checklist. Apply this before substantial plan or code work.
- **Protocols:** `.vibe-tools/protocols/review-process.md` (shared rules: assessment format, iteration cap, impasse handling) and `.vibe-tools/protocols/review-process-impl.md` (implementation-mode specifics).
- **Reviewer system prompts** — the rules of engagement both arms operate under. You do **not** paste these anywhere: the Claude arm carries them as its agent definition, the MCP arm has them baked in. Read them when you need to know what the reviewers were told:
  - `.vibe-tools/prompts/reviewer-system-prompt-impl-v0.3.1.md` — plan and code reviews
  - `.vibe-tools/prompts/reviewer-system-prompt-design-v0.1.0.md` — design / requirements reviews

## When to consult reviewers

Apply the §1 trigger in `.vibe-tools/protocols/review-process.md`:

- The work is **non-trivial** AND **about to become durable** (committed, encoded as structure, shipped).
- AND it involves **judgment calls** in at least one of: concurrency / state coordination, failure handling, public API shape, data model, sequencing, dependency choices, test plan.

Skip syntactic refactors, formatting passes, small bug fixes, dependency bumps without semantic change.

## How to consult — the reviewer panel

vibe-tools gives you reviewer **roles** — a lens, and its rules of engagement. It does not dictate the roster. **You compose the panel** that suits the work in front of you: which arms, how many, at what depth. What follows is the default worth deviating from, not a script.

The reviewer arms available to you:

- **`ask_gpt56`** MCP tool — OpenAI **gpt-5.6-sol** via the Responses API (reasoning + workspace tools). Selects its lens with `mode:` — e.g. `mode: "design-v0.1.0"` for design reviews. Run `Vibe Tools: Doctor`, or read `.mcp.json`, to see which `ask_<alias>` tools this workspace actually has; a workspace may configure more than one.
- **Claude reviewer sub-agents** — the `Agent` tool with a `subagent_type` from `.claude/agents/`. **List that directory rather than assuming a roster.** The agent definition **is** the reviewer system prompt: do **not** prepend prompt text into the task body, and do **not** pass `model` — the definition pins it. Send only the review user message.

**The sensible default** for plan / code work: fire one external arm and one Claude arm **in the same assistant turn**, on the same lens, with byte-equivalent user messages. Two model families reviewing identical input is what makes disagreement informative.

Deviate deliberately when the work calls for it — a third arm on an irreversible decision, a single arm on something small, several lenses on a change that spans domains. What matters is not the count:

- **Both arms on the SAME lens.** A mismatched pair is worse than one arm, because it reads as coverage it isn't (see the pairing rule below).
- **Byte-equivalent messages**, or the comparison means nothing.
- **Every point gets accept / refine / reject.** Never silently dropped.
- **Say what you actually ran** — arms, lenses, and depth — so a later reader can judge the round.

Gemini is no longer in the default roster (chronic rate-limiting + weaker grounding), but remains configurable; a third independent-family arm is an open slot.

If the `Agent` tool reports the reviewer subagent type is not found, **do not retry it this session, and do not fall back to pasting the prompt into a `general-purpose` agent.** Run the external arm alone and tell the user panel coverage was reduced. Before saying how to fix it, check whether `.claude/agents/vibe-reviewer-*.md` exists on disk — the two causes need different advice:

- **Files present** — Claude Code's watcher only covers directories that existed at session start, so a workspace that just received them can't see them yet. **A restart picks them up.**
- **Files absent** — the workspace never received the definitions. A restart changes nothing; it needs workspace initialization (or the operator opted out).

Retry normally in a later session — this is a per-session failure, not a permanent opt-out (`review-process.md §6.5` items 4b–5).

**If `ask_gpt56` reports "No such tool available", the same thing has happened to the OTHER arm.** Claude Code negotiates its MCP tool list once per session, exactly as it does the subagent roster. A session that was running when vibe-tools was installed or upgraded — or when `.mcp.json` changed for any reason — keeps the tool list it started with, forever. This does not heal on its own and is not a broken install.

Diagnose it in one step, and **do not go hunting**: compare the tools you actually have against the aliases in `.mcp.json`.

- **`.mcp.json` names an alias you have no `ask_<alias>` tool for** — stale session. Tell the user to **restart Claude Code** (reloading the VS Code window is not enough — Claude Code is a separate process). Run the Claude arm alone meanwhile and say panel coverage was reduced.
- **The alias is absent from `.mcp.json` too** — a configuration problem, not a stale session. Check that the extension is installed and the workspace was initialized.

The comparison is the whole diagnosis — an alias you hold but `.mcp.json` does not declare is stale, whatever it is called. (`ask_gpt55` / `ask_gemini` are common stragglers, but `gemini` is still a legitimate thing to configure, so the name alone proves nothing.)

Do not paste the reviewer prompt into a `general-purpose` agent to compensate, and do not retry the tool this session; the tool list will not change until the process restarts.

Both arms are **read-only** — no writes, no shell (`review-process.md §3`). Neither can compute a diff against `HEAD`. So for **code reviews** the review message must carry the change itself: the diff, or (for large changes) the cited files plus a changed-file list that includes untracked files. A bare list of filenames is not enough — the reviewer cannot reconstruct the baseline from it.

## How to process responses

Per `.vibe-tools/protocols/review-process.md §4`: for every numbered or bulleted point from every reviewer, respond with one of:

- **Accept** — adopt the suggestion. State briefly why.
- **Refine** — adopt the underlying concern in a different form. State what concern was real and how the refinement addresses it.
- **Reject** — disagree. State the reasoning.

Never silently drop a concern. When reviewers agree, weight heavily; when one raises alone, evaluate on reasoning not count.

Apply deltas to the plan / code. Iterate to convergence (cap 5 rounds; §5).

## How to report results to the user

After each round, summarize for the user in this shape:

1. **Per-reviewer catch counts by severity.** One line per reviewer; tally the `[critical]` / `[important]` / `[nit]` tags. Example:
   > Round 1 — `ask_gpt56` returned 6 [important] + 3 [nit]; Fable sub-agent returned 2 [critical] + 1 [important], 2 unique vs gpt-5.6.

2. **What was applied.** Counts of accept / refine / reject across all reviewers. Cite the most consequential changes by file:line or by point. Example:
   > Applied 9 accepts, 3 refines, 2 rejects. Key deltas: tightened auth handling in `src/auth/token.ts:48`, switched `WorkspaceFs.readdir` return shape per the N+1 catch.

3. **Documented rejections.** Where you rejected a reviewer point with reasoning. Example:
   > Rejected `ask_gpt56` point #4 (proposed splitting the provider abstraction) — already covered by the session-cancellation invariant per discussion 002 delta 9.

4. **Convergence or next-round signal.** Whether the round converged, or what's still unresolved.

Keep the summary tight — the user reads it to decide whether to interject or trust the round. The full transcript lives in the discussion file at `.vibe-tools/discussions/<NNN>-<topic>.md`.

## Mode selection — which reviewer prompt applies

| Work product | Mode | Claude arm — `subagent_type` | OpenAI arm — `ask_gpt56` |
|---|---|---|---|
| Architectural / requirements / design proposal | design | `vibe-reviewer-design` | `mode: "design-v0.1.0"` |
| Per-phase implementation plan (before code) | implementation-plan | `vibe-reviewer-impl` | default (impl baked in) |
| Substantive code already written (before commit) | code review | `vibe-reviewer-impl` (same lens covers plan and code per Rule 7) | default (impl baked in) |
| Genuinely unanticipated judgment call mid-coding | mid-coding consult | high bar; default is ask the user, not the reviewer | — |

`ask_gpt56` ships with the impl-mode prompt baked into its MCP server. For design reviews, pass `mode: "design-v0.1.0"` — that **replaces** the reviewer's system prompt with the design lens. Merely telling it in the user message that this is a design review is a weaker fallback: the impl-mode Rule 7 stays in force and can win against the instruction.

For **domain-specialized review** (e.g. Knowledge Engineering work, not generic SW), see the next section — `mode` lets you swap the reviewer's system prompt for a workspace-local file.

### Choosing reviewer depth

Depth is **your** judgment per review, not a setting. Nobody configures a default any more.

- **`ask_gpt56`** takes an optional `effort` (`low` … `max`). Omit it for the provider default.
- **The Claude arm** has an explicit-effort agent per lens: `vibe-reviewer-<lens>-high` and `-max` beside the base `vibe-reviewer-<lens>`. The base inherits session effort. Escalate by spawning a different *name* — the `Agent` tool has no effort parameter.

Choose per arm rather than uniformly; the two arms have different constraints and asymmetry is the point:

- **Default to the base agent and no `effort`.** Depth is not free, and a deep round that agrees with a shallow one bought nothing.
- **Escalate for hard-to-reverse or high-uncertainty work** — a decision you cannot walk back, or one where a shallow pass already disagreed with itself.
- **`max` needs a reason you can state**, not just the fact that it exists.
- **The external arm is wall-limited; the Claude arm isn't.** `ask_gpt56` dies at an operator-set per-call ceiling, so past some depth a reliable shallower read beats a deep dead one. A Claude subagent has no such ceiling, which is where depth pays most cheaply.
- **Prefer a different model family over more depth in one.** Three deep arms that agree are worth less than two moderately-tuned arms that can surprise each other. If you are about to escalate both arms, consider whether you actually want a third opinion instead.
- **Record the effort you chose per arm** in the discussion file, alongside the catch counts. Nothing echoes effort back at runtime, so the log is the only place a later reader can compare depth against what it bought.

If `ask_gpt56` times out, that is the one case where lowering `effort` on a retry is the intended move — the ceiling is an operator setting you cannot raise.

### Keeping both arms on the same lens

The two arms are selected by different mechanisms, so it is possible to run them on *different* lenses over a byte-identical message — which silently destroys the point of the panel. They pair by this rule:

> `ask_gpt56` with `mode: "<stem>"` pairs with `subagent_type: "vibe-reviewer-<lens>"`, where `<lens>` is `<stem>` with any trailing `-vX.Y.Z` removed.

So `mode: "ke-artifact-v0.2.0"` pairs with `vibe-reviewer-ke-artifact`; `mode: "design-v0.1.0"` pairs with `vibe-reviewer-design`; no `mode` (impl, the default) pairs with `vibe-reviewer-impl`.

The extension *attempts* to generate an agent for each reviewer prompt in `.vibe-tools/prompts/`, but the pairing is not guaranteed — generation can be turned off (`vibeTools.installReviewerAgents`), blocked by a name already taken, skipped when two prompt versions claim one lens, or simply not visible yet because Claude Code was not restarted after install. A lens whose name would contain anything but lowercase letters and hyphens (a digit, an underscore) is also rejected, as is one ENDING in a reasoning-effort token (`-low`, `-medium`, `-high`, `-xhigh`, `-max`) because that would be ambiguous with an effort variant — though `mode:` accepts both. A rejected prompt pops a warning at activation, so the lens is not silently one-armed.

So: **list `.claude/agents/` rather than guessing a `subagent_type`.** If the lens you need has a prompt but no agent, run the external arm alone and say the Claude arm was unavailable for that lens. Never substitute a different lens to fill the slot — a mismatched pair is worse than a one-armed round, because it looks like coverage it isn't.

## Domain specialization via the `mode` parameter

`ask_gpt56` accepts an optional `mode` arg that replaces the bundled impl-mode reviewer prompt with a workspace-local file. The reviewer then critiques through that domain lens (e.g. KE patterns K1–K4 instead of SW patterns) without any user-message stuffing of the rules of engagement.

**How it works:**
- Pass `mode: "<stem>"` (e.g. `mode: "ke-artifact-v0.1.0"`).
- The server reads `<workspace_root>/.vibe-tools/prompts/reviewer-system-prompt-<stem>.md` as the reviewer's system prompt.
- Missing file → hard error (intentional: a wrong-lens review the operator thought was right-lens is exactly the trap this avoids). No silent fallback.

**Conventions:**
- Pass the EXACT filename stem. There is no auto-version-selection — `mode: "ke-artifact"` and `mode: "ke-artifact-v0.1.0"` resolve to different files.
- Mode files are FULL REPLACEMENTS of the bundled prompt. They MUST include the base rules of engagement (assessment format with `[critical]` / `[important]` / `[nit]`, severity tagging, no closing summary, etc.). The recommended pattern: fork from `assets/prompts/reviewer-system-prompt-impl-v0.3.1.md` and rewrite Rule 7 (focus areas) and Rule 11 (patterns) for your domain.
- `mode` selects the reviewer's LENS; `workspace_root` still controls where the reviewer reads files via tools. They are independent.
- Size cap is 100 KB. Reviewer prompts are rules of engagement, not source documents. Keep large reference material in the workspace and let the reviewer read it via tools.

**When NOT to use mode:** generic SW work. The bundled impl-mode prompt is already correct.

## User reminders

The user may prompt you with natural-language triggers like:

- "consult your vibe consultants" / "use the vibe consultants" / "run a vibe review"
- "remember the protocols" / "you have reviewers" / "check with the consultants"

These mean: re-apply the orchestrator decision checklist to the current work. If the §1 trigger is now met (or you missed it), fire the reviewer panel (both reviewers, in parallel).

## Cost discipline

Per `.vibe-tools/protocols/review-process.md §7`: one external reviewer is the default. For **architectural decisions** (cross-module, hard-to-reverse, plan-vs-code divergence), both are warranted — different model families catch different gaps. Use judgment.

## Where the consultation transcripts live

Each review session you run produces a discussion file at `.vibe-tools/discussions/<NNN>-<topic>.md` — one file per round, numbered sequentially. The file contains the plan/code being reviewed, the full reviewer responses, your accept/refine/reject for each point, and (optionally) an appended retro at convergence.

Write every one as though someone else will read it, because they may. Some projects send their transcripts to a **corpus** — a separate private repository where the panel's customizations and the reviews themselves can be checked for safety. That happens only when the project commits a `.vibe-corpus.json` naming the destination AND the person working has enabled capture on that machine (`Vibe Tools: Enable Corpus Capture`). Most projects do neither and send nothing; `Vibe Tools: Doctor` reports which is true here. Write for the sharing case regardless — it costs nothing when a transcript stays local, and it cannot be taken back once one has not.

- **Never put secrets in a review message or a discussion file** — credentials, API keys, tokens, private keys, connection strings. Not in what you send a reviewer, not in what you paste, not in the log you write afterwards.
- **Be deliberate about customer and source material.** Quote what the review actually needs; a transcript that reproduces a file wholesale shares that file with everyone who later reads the corpus. Prefer a citation like `src/auth/token.ts:48` over a paste.

`.vibe-tools/` is gitignored so transcripts stay out of the *project's* history, which keeps the repo free of model-chatter. That is the only thing gitignoring does here — it is not a privacy boundary. They are still not project documentation; they are the working log of the development process. If a decision needs to survive workspace cleanup or be visible to your team, write a curated summary (ADR, decision record, commit message) to the project's normal committed docs location.

### If this workspace has a corpus: save after you change the panel

Being gitignored is exactly why this matters. A prompt you wrote, a protocol you edited, a custom lens, a new agent — none of it is in the project's git history, so the corpus is the only copy that is not on one disk.

**When you change anything in the panel, run `Vibe Tools: Push to Corpus`.** That is prompts, protocols, agents, and the vibe section of this file. Nothing saves automatically; a save is a thing a person does, because sending material off the machine should be.

It also decides what an extension update is allowed to do:

- **An update refuses to run while anything here is unsaved**, and names the files. It writes nothing until you save them, move them aside, or discard them with `Reinstall Protocols` / `Reinstall Prompts`.
- **Once everything is saved, the update overwrites freely** — every byte it replaces is in the corpus.
- **Afterwards it tells you what now differs**, because our version is on disk and yours is in the corpus. Reconcile the two with git, then push the result.

So the loop is: save → update → reconcile → save. Skipping the first step does not lose anything, it just blocks the update until you do it.

## Retros (optional, at convergence)

When a review session converges, you may capture a retro per `.vibe-tools/protocols/retros.md` — append a `## Retrospective` section to the discussion file with the structured "what worked / what didn't / repeat / avoid / proposed patches" template. Patches are **suggestions** only; the user decides what to promote.

The workspace-local retro rollup lives at `.vibe-tools/retros/INDEX.md` — one line per retro for search and aggregation. Like discussions, this is a local learning note, not committed history.

## Per-todo cadence (DEFAULT for multi-todo work)

When a project decomposes into 4+ todos, use the **per-todo cadence** instead of the monolithic single-review approach above. Each todo runs its own design+impl reviewer rounds and produces its own discussion log.

Full protocol: `.vibe-tools/protocols/per-todo-cadence.md`.

Per-todo flow (used by both cadences): `<todo> → plan → design review → impl → impl review → commit → log discussion`. **There is no pitch step inside a todo.**

The two cadences:

- **Cadence A — anonymous (opt-in only):** `<feature/fix> → decompose into todos → run per-todo flow on each`. No pitch.
- **Cadence B — pitch-first (DEFAULT):** `<feature/fix> → PITCH → operator confirms → decompose into todos → run per-todo flow on each`. Pitch is feature-level, runs ONCE before decomposition.

The pitch has exactly three sections — What will change, Success signal, Critical decisions — and nothing else. See the protocol's "pitch" section for the bar each must meet (especially: critical decisions default to ZERO; do NOT include open assumptions about UI, libraries, file layout, or implementation approach — those go to reviewers).

**Cadence B is the unconditional default.** Do NOT decide which cadence to use based on whether scope appears locked by an upstream discussion — that's an operator-only decision.

To run cadence A on a feature/fix, the operator must explicitly opt in with a phrase like "run anonymous", "skip the pitch", "no pitch needed", or "anonymous mode". The opt-in applies to the CURRENT feature/fix only; the next distinct feature defaults back to cadence B unless the operator extends ("anonymous for the rest of the project" or similar).

Combined design+impl rounds are allowed for small slices. Skipping a formal round is allowed for tightly-coupled mechanical follow-ons — but the skip MUST be documented in a discussion file regardless. See the protocol's "Skipping a formal review" section for the 3-condition test.

**Reproduction targets (canonical few-shot examples):** when in doubt about format, mirror the per-todo discussion files at `.vibe-tools/discussions/040–050` (the 2026-05-27 lifecycle-markers work). The protocol calls out 4 specific files as the primary targets (`042`, `045`, `048`, `050`).

User triggers for switching into this cadence:
- "use the cadence" / "per-todo review"
- "ask both design reviewers to review each todo plan and then ask both implementation reviewers to review each todo implementation"
- "log discussion" (implicitly invokes the full per-todo log format)

<!-- vibe-tools-orchestrator-end -->

<!-- crl-tools-start version="4.92.4" -->
## Clinical Reasoning Language (CRL) tools

This workspace has the CRL parser available to you as MCP tools (server `crl`):

- `tokenize_crl` — lex CRL source into tokens.
- `build_crl_ast` — parse CRL source and build its Abstract Syntax Tree.

Use these whenever the user is working with `.crl` files or Clinical Reasoning Language — to check syntax, inspect structure, or answer questions about a CRL document. Prefer `build_crl_ast` for structure/meaning; use `tokenize_crl` for token-level questions.

Each tool takes exactly one of `code` (inline CRL text) or `path` (a `.crl` file — pass an **absolute** path; relative paths resolve against the server's working directory, not the workspace).

On valid input a tool returns a JSON `ParseResult` envelope — always check `success` first, and on `success: false` read `errors[]` and report them to the user. See each tool's own description for the exact result and error shape. Bad arguments or an unreadable/oversized file come back as a tool error (fix the input and retry). `build_crl_ast` success means parsing/AST construction succeeded — it does NOT perform semantic validation.
<!-- crl-tools-end -->
