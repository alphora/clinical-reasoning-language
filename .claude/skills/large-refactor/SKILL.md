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

## 3. Reviewers must be told the taxonomy — or they anchor too

A reviewer reading unmarked stale code/comments/tests will hand you a confident, well-argued finding
built **on the hack** — which is worse than no review, because a confident wrong finding anchors you
harder. So in every review packet for refactor-in-progress code:

- State the target model (hand them the charter) and that **unmarked code is presumed-wrong**, not the
  spec — they must measure findings against the target model, not the current code.
- When a reviewer returns a finding, verify its **premise** against the target model, not just its
  symptom against the current code. A finding whose premise is "the current code says X" is evidence
  about the hack, not about the target.

## 4. Expect wrong; expect to fix; don't be surprised

Mid-refactor, a failing test or an incoherent behavior is the *expected* state, not an alarming
discovery. Do not spin up a crisis narrative ("the round-trip is broken!") over code you already know
is being replaced. Note it, mark it, move to the target model.

## 5. Done = everything grounded, nothing suspect (NOT "no markers")

The done-signal is the **presence of `REFACTOR:grounded` covering the whole blast radius**, plus the
**absence of `REFACTOR:suspect`** and the absence of any **unmarked** block in scope. Concretely, the
refactor is finished when, across everything you set out to change:

- **zero `REFACTOR:suspect`** remain — each was upgraded to `grounded` or resolved. `suspect` is the live
  to-do list; grep for it as the gate.
- **zero unmarked blocks in scope** remain — unmarked = never verified = presumed-wrong, a to-do, not "fine."

Do NOT gate "done" on *removing* markers — that is backwards. Deleting a `grounded` marker to "reach
done" just relabels verified code as presumed-wrong (unmarked). `grounded` markers are the EVIDENCE of
completion. Only **after** the gate passes and the work is verified + merged do you optionally strip the
now-redundant `grounded` markers in a final cosmetic sweep — that cleanup is not the definition of done,
and you never strip one to make the gate pass.
