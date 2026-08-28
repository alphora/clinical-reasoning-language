---
name: large-refactor
description: Invoke at the START of any large refactor — where a body of existing code is deliberately being changed from a known-wrong model to a target model (an emit flip, a representation redesign, a hack removal). It exists to stop the single most expensive failure of refactor work: anchoring on the code being fixed as if it were authority. Use it when the work spans many files and the point is that the current behavior is wrong until you finish.
---

# Large-refactor protocol — the code is the patient, not the doctor

You are changing a body of code from a KNOWN-WRONG model to a TARGET model. The most expensive
mistake in this kind of work — made repeatedly — is **treating the mid-refactor code as authority.**
It is not. Until the refactor is done, the code (and its comments, and its tests) is *presumed wrong*.
The authority is the **target model** — the charter / spec / design of record — never the code in
front of you.

Concrete failure this prevents: reading a line like `readsNoValue = … || row.valueless` plus a comment
saying "value-filtered exists," and thinking *"so that's how it works, let me reconcile against it"* —
instead of *"this is the hack I'm here to remove; of course it's wrong."* Anchoring on the sickness as
if it were health.

## 1. Fix the authority, in writing, before you touch code

Name the target model and where it lives (the charter/spec/design doc). Everything you read in the
code gets measured against THAT, not the other way round. If the code and the target model disagree,
the default assumption is **the code is wrong** — that is literally why you are here.

⚠ **But the authority can ITSELF be wrong**, and that is the more expensive failure, because it wears
the target model's clothes. A charter clause can be stale, an operator escalation can be over-generalised,
and your own gloss on one can inherit its authority. Symptom: a rule is cited to BLOCK a fix that was just
agreed — often an all-caps escalation with a "read before touching X" marker. **That is the
`stale-requirements` skill, not this one.** Invoke it the moment a rule seems to settle the matter.
This skill assumes the target model is sound; that one is what you use when it is not.

## 2. Trust-mark everything you touch

Every block you change gets a marker recording how much it can be trusted. **Unmarked = untouched =
part of the old wrong world = presumed-wrong.** Do not cite unmarked code as evidence of correct
behavior, ever.

| Marker (leave in the code) | Meaning | Your stance |
|---|---|---|
| **(none)** | untouched — the old model | **presumed-wrong**; never cite as authority, re-derive from the target model |
| `REFACTOR:suspect` | touched, but may still rest on old assumptions you haven't re-derived | suspicious; verify against the charter before trusting |
| `REFACTOR:grounded` | touched AND re-derived from the target model (not from adjacent old code) | optimistic-but-wary |

A comment that merely *describes current behavior* is not `grounded` — grounding means you checked the
behavior against the target model and it agrees. Stale doctrine comments that describe the OLD model as
if current are a primary trap: they are unmarked-wrong, and they actively mislead. Rewrite or mark them
the moment you touch their file.

**SCOPE — this is checkable, so it is not aspirational.** Every file in the blast radius that the refactor
MODIFIES must carry a marker by the time its slice lands. That set is computable: the files the refactor's
commits touched, minus the files carrying markers. `.claude/hooks/refactor-state.sh` reports the difference
at session start. Measured once and it was **10 of 25** — meaning the taxonomy classified two-thirds of
finished, reviewed work as presumed-wrong. A signal that noisy gets ignored, which costs more than not
having it. If the backlog is large the honest fixes are to MARK them or to NARROW the blast radius — never
to lower the bar.

⚠ **TESTS COUNT, and they are the highest-value target.** A *passing* test asserting old doctrine is the
most convincing stale copy in the repo: it looks like proof. Mark every test whose assertions you
re-derived from the target model, and treat an unmarked test in the blast radius exactly like unmarked
code — presumed-wrong, never citable as evidence that current behavior is intended.

## 3. Reviewers must be told the taxonomy — or they anchor too

A reviewer reading unmarked stale code/comments/tests will hand you a confident, well-argued finding
built **on the hack** — which is worse than no review, because a confident wrong finding anchors you
harder. So in every review packet for refactor-in-progress code:

- State the target model (hand them the charter) and that **unmarked code is presumed-wrong**, not the
  spec — they must measure findings against the target model, not the current code.
- When a reviewer returns a finding, verify its **premise** against the target model, not just its
  symptom against the current code. A finding whose premise is "the current code says X" is evidence
  about the hack, not about the target.

## 4. Expect wrong — and route it, don't narrate it

Mid-refactor, a failing test or an incoherent behavior is the *expected* state, not an alarming
discovery. Do not spin up a crisis narrative ("the round-trip is broken!") over code you already know
is being replaced.

Route it instead — every such find lands in exactly one of three places, and "I noticed it" is not one:

1. **Fix it now** if it is in this slice → mark `grounded`.
2. **Mark it `REFACTOR:suspect`** if it is real but belongs to a later slice, WITH what it is waiting on.
   This is the live to-do list; the state file's entry is where it becomes visible across sessions.
3. **The rule is what is wrong**, not the code → `stale-requirements` (§1).

An observation that gets narrated and then dropped is the failure this section exists to prevent.

## 5. How this composes with `stale-requirements` — complementary, not overlapping

They share a shape ("X is the patient, not the doctor") and split cleanly on what X is:

| | `large-refactor` | `stale-requirements` |
|---|---|---|
| **the patient** | the CODE being changed | the RULES, including this skill's own target model |
| **fires** | continuously, as a MODE, for the refactor's duration | at MOMENTS — a rule changes, or a rule blocks work |
| **carried by** | `tmp/REFACTORS-IN-FORCE.md` + the in-code markers | invocation; the memory store's git history |
| **hands reviewers** | the trust-mark taxonomy (which CODE is presumed-wrong) | the rule provenance (which RULES are the author's own claim) |

The seam is §1 of this skill: it names an authority, and the sibling handles the case where that authority
is the thing that is wrong. A refactor round frequently needs BOTH packets — reviewers must know which code
is the patient AND which rules the change itself rewrote, or they will anchor on one or the other.

## 6. Done = everything grounded, nothing suspect (NOT "no markers")

The done-signal is the **presence of `REFACTOR:grounded` covering the whole blast radius**, plus the
**absence of `REFACTOR:suspect`** and the absence of any **unmarked** block in scope. Concretely, the
refactor is finished when, across everything you set out to change:

- **zero `REFACTOR:suspect`** remain — each was upgraded to `grounded` or resolved. `suspect` is the live
  to-do list; grep for it as the gate.
- **zero unmarked blocks in scope** remain — unmarked = never verified = presumed-wrong, a to-do, not "fine."

Do NOT gate "done" on *removing* markers — that is backwards. Deleting a `grounded` marker to "reach
done" just relabels verified code as presumed-wrong (unmarked). `grounded` markers are the EVIDENCE of
completion.

**Strip markers only when the WHOLE refactor is done — not per sub-phase.** A large refactor often lands in
phases (an emit flip's definition lane, then its instance lane, then a grammar migration), sharing the same
files. As long as ANY phase is still open, leave every `grounded` marker in place: they tell the next phase's
work (and its reviewers) which code in these shared files has already been re-derived from the target model
vs. which is still presumed-wrong. Stripping them mid-refactor throws away exactly the signal that stops the
next phase from re-anchoring. Only once the entire set of phases has landed do you strip all `grounded`
markers in one final cosmetic sweep — and you never strip one to make a phase's gate pass.
