<!-- vibe-tools-orchestrator-start -->

# Vibe Tools — orchestrator instructions

This workspace has vibe-tools installed. When you (Claude) work here, you are the **lead** in a multi-reviewer planning loop. Use the bundled checklist and protocols to decide when to consult external reviewers, which mode applies, and how to frame the consult.

## Read these at session start

- **Decision checklist:** `.vibe-tools/prompts/vibe-coding-orchestrator-prompt.md` — the 10-step "should I consult, which mode, how to frame" checklist. Apply this before substantial plan or code work.
- **Protocols:** `.vibe-tools/protocols/review-process.md` (shared rules: assessment format, iteration cap, impasse handling) and `.vibe-tools/protocols/review-process-impl.md` (implementation-mode specifics).
- **Reviewer system prompts** (these are the prompts the external reviewers ALREADY have; you read them so the Claude sub-agent you spawn can use the same role):
  - `.vibe-tools/prompts/reviewer-system-prompt-impl-v0.3.1.md` — for plan reviews and code reviews
  - `.vibe-tools/prompts/reviewer-system-prompt-design-v0.1.0.md` — for design / requirements reviews

## When to consult reviewers

Apply the §1 trigger in `.vibe-tools/protocols/review-process.md`:

- The work is **non-trivial** AND **about to become durable** (committed, encoded as structure, shipped).
- AND it involves **judgment calls** in at least one of: concurrency / state coordination, failure handling, public API shape, data model, sequencing, dependency choices, test plan.

Skip syntactic refactors, formatting passes, small bug fixes, dependency bumps without semantic change.

## How to consult — three reviewers in parallel

For applicable plan / code work, fire all three reviewers **in one assistant turn**:

1. **`ask_gpt55`** MCP tool — OpenAI gpt-5.5 via direct API
2. **`ask_gemini`** MCP tool — Google gemini-2.5-pro via direct API
3. **Claude sub-agent** — `Agent` tool with `subagent_type: "general-purpose"`. The Agent tool does **not** accept a system-prompt override, so **prepend** the appropriate reviewer system prompt (impl or design from `.vibe-tools/prompts/`) into the task `prompt` body. Then append the same plan-review user message you sent to the other two reviewers.

Send byte-equivalent user messages to all three for clean coverage.

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
   > Round 1 — `ask_gpt55` returned 6 [important] + 3 [nit]; `ask_gemini` returned 4 [important], 2 unique vs gpt-5.5; Claude sub-agent returned 2 [critical] + 1 [important].

2. **What was applied.** Counts of accept / refine / reject across all reviewers. Cite the most consequential changes by file:line or by point. Example:
   > Applied 9 accepts, 3 refines, 2 rejects. Key deltas: tightened auth handling in `src/auth/token.ts:48`, switched `WorkspaceFs.readdir` return shape per the N+1 catch.

3. **Documented rejections.** Where you rejected a reviewer point with reasoning. Example:
   > Rejected `ask_gemini` point #4 (proposed splitting the provider abstraction) — already covered by the session-cancellation invariant per discussion 002 delta 9.

4. **Convergence or next-round signal.** Whether the round converged, or what's still unresolved.

Keep the summary tight — the user reads it to decide whether to interject or trust the round. The full transcript lives in the discussion file at `.vibe-tools/discussions/<NNN>-<topic>.md`.

## Mode selection — which reviewer prompt applies

| Work product | Mode | Reviewer prompt to use for the sub-agent |
|---|---|---|
| Architectural / requirements / design proposal | design | `reviewer-system-prompt-design-v0.1.0.md` |
| Per-phase implementation plan (before code) | implementation-plan | `reviewer-system-prompt-impl-v0.3.1.md` |
| Substantive code already written (before commit) | code review | `reviewer-system-prompt-impl-v0.3.1.md` (same prompt covers both plan and code per its Rule 7) |
| Genuinely unanticipated judgment call mid-coding | mid-coding consult | high bar; default is ask the user, not the reviewer |

`ask_gpt55` and `ask_gemini` already have the impl-mode prompt built into their MCP server. For design-mode reviews, instruct each reviewer in the user message that this is a **design review** (mode = design, focus areas per the design prompt's Rule 7); they'll adjust their lens.

## User reminders

The user may prompt you with natural-language triggers like:

- "consult your vibe consultants" / "use the vibe consultants" / "run a vibe review"
- "remember the protocols" / "you have reviewers" / "check with the consultants"

These mean: re-apply the orchestrator decision checklist to the current work. If the §1 trigger is now met (or you missed it), fire the three-reviewer parallel consultation.

## Cost discipline

Per `.vibe-tools/protocols/review-process.md §7`: one external reviewer is the default. For **architectural decisions** (cross-module, hard-to-reverse, plan-vs-code divergence), all three are warranted — different model families catch different gaps. Use judgment.

## Where the consultation transcripts live

Each review session you run produces a discussion file at `.vibe-tools/discussions/<NNN>-<topic>.md` — one file per round, numbered sequentially. The file contains the plan/code being reviewed, the full reviewer responses, your accept/refine/reject for each point, and (optionally) an appended retro at convergence.

These are **local consultation transcripts** — gitignored by default. They are not project documentation; they are the working log of the development process. If a particular decision needs to survive workspace cleanup or be visible to the team, write a curated summary (ADR, decision record, commit message) to the project's normal committed docs location. The raw transcript stays local.

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
- "ask all three design reviewers to review each todo plan and then ask all three implementation reviewers to review each todo implementation"
- "log discussion" (implicitly invokes the full per-todo log format)

<!-- vibe-tools-orchestrator-end -->
