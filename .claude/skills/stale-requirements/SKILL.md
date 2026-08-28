---
name: stale-requirements
description: Invoke whenever a RULE is about to change, or a rule is being used to block work — a charter clause, a memory, a doctrine comment, a kit rule, an operator escalation. It exists to stop two failures: a stale requirement vetoing a fix that was just agreed, and a correction that leaves stale copies alive elsewhere. Use it before correcting any rule, and the moment a reviewer (or you) cites a requirement as a reason NOT to do something.
---

# Stale requirements — the rules are also the patient

`large-refactor` says the mid-refactor code is the patient and the target model is the authority.
This skill covers the case that one breaks on: **the authority itself is wrong.** A charter clause,
a memory, a doctrine comment, or an operator escalation can be stale, over-generalized, or never
have said what it is now being used to say.

That matters most at exactly the wrong moment: a fix has been agreed, you write a design, and a
reviewer quotes a rule at you. The rule sounds authoritative — it may even be an all-caps operator
escalation with a "read this before touching X" marker. You fold. The agreed fix dies to a rule that
did not actually cover it.

**Two real instances, both in one session:**

- `feedback_patterns-are-semantic` quoted the operator accurately ("THE PATTERNS SHOULDN'T HAVE
  RETURN TYPES! THEY CARRY THE SEMANTICS") and then added, in *How to apply*, a clause the operator
  never said: "cross-shape composition bridges — wrap in `exists`". The gloss inherited the
  escalation's authority and licensed the emitter to synthesize reductions for years. The operator's
  words were about the emitter being too RIGID; the gloss made it too CLEVER.
- `CRL-NORTH-STAR.md` required boolean totality "per operand, before any `not`". That rule WAS the
  defect a whole slice existed to remove — an unanswered question read as `false`. A reviewer citing
  the charter would have blocked the fix using the defect's own justification.

---

## 1. Separate QUOTED from DERIVED — and only QUOTED binds

Every requirement you write or maintain must make clear which is which.

- **QUOTED** — the operator's actual words. Binding. **Only the operator retires it.**
- **DERIVED** — your inference, elaboration, or "how to apply". A working hypothesis. **Any round may
  overturn it on evidence.**

Unmarked prose sitting under a quoted escalation reads as quoted. That is the whole failure. When you
cannot tell which a clause is, treat it as DERIVED and go find the source.

⚠ Never cite a DERIVED clause to yourself as a blocker. If your reason for not doing the agreed thing
traces to your own gloss, you have talked yourself out of the work with your own voice.

## 2. Scope-narrowing is IN bounds. Retirement is NOT.

- **You (or a reviewer) MAY establish that a rule does not REACH the case at hand.** That is a factual
  claim, checkable against the quote. Make the claim explicitly, with the quote, and say why the case
  falls outside it.
- **You MAY NOT retire an operator requirement.** Neither may a reviewer. That needs the operator.

This is the line that keeps the skill honest. Without the first half, stale rules hold a permanent
veto. Without the second half, this skill becomes a licence to ignore anything inconvenient.

## 3. A requirement that describes BEHAVIOUR is checkable — check it

Before deferring to a rule that says the system does X, run the system. Rules that describe behaviour
go stale silently, and a harness run settles in minutes what a review round will argue about for
hours. The charter's "both lanes read false and therefore agree" survived two design rounds and died
to one `$apply` run.

Arm agreement is evidence about reasoning, never about facts.

## 4. CORRECT IN PLACE. Do not carry history.

When a rule changes: **delete the wrong text and write the right rule.** No amendment blocks, no
"this used to say", no `⚠ CORRECTED (2026-08-27)` trails.

**Why, precisely:** the trail does not solve the ambush — it FEEDS it. An ambush happens because a
stale copy survives somewhere a reviewer can read. An amendment note does not remove that copy; it
reproduces the old text in quotable form right beside the new one. Meanwhile every reader pays to
read both. (Repo rules that already say this: `feedback_memory-not-backlog` — superseded entries are
PURGED, not corrected-to-point-at; `no-legacy-crl` — remove old paths entirely, no transition windows.)

**The negative-clause test.** A negative IS part of the live rule when it prevents a mistake TODAY:

- ✅ "Negation is null-propagating, **not** closed-world" — a reader who has seen a hundred
  closed-world CQL guards will re-derive the wrong rule from the positive statement alone.
- ❌ "This bullet used to require per-operand totality; that was the defect" — records what changed.
  Delete it.

Ask: does removing this clause let a competent reader make the error again? If yes, it is the rule.
If it only tells them the rule moved, it is history.

## 5. The correction is not done until every COPY is corrected

This is the actual mechanism. A rule reaches a reviewer through copies, so coverage — not annotation
— is what stops the ambush. In the SAME transaction, sweep:

- [ ] the memory file(s) — and the `MEMORY.md` index line
- [ ] `docs/` — the charter and any doc that restates the rule
- [ ] doctrine comments in code (grep the rule's distinctive phrasing, not just its name)
- [ ] the authoring kit — rules AND their `text` summaries (that is what a KE agent reads)
- [ ] tests that PIN the old rule (a passing test asserting stale doctrine is the most convincing
      stale copy there is)
- [ ] ⚠ GOLDENS / pinned oracles — these are not tests, they are the SPEC of correct output, and they
      SHIP. A golden embedding a stale doctrine comment is a stale ORACLE: it asserts, with the full
      authority of a passing pin, that the old rule is what we mean to emit. Re-pin them in the same
      transaction and READ the diff — never re-pin blind.
- [ ] catalog / data-table headers that restate it

Grep for the CLAIM, not the citation. A copy that restates the rule without naming it is the one that
survives a sweep and ambushes the next round.

⚠ If some copies cannot land in this transaction (a batched kit pass, another team's file), record the
remainder on the relevant worklist — but the source of authority and every copy a reviewer can read must be
corrected NOW.

## 6. Review packets state the CURRENT rules — and nothing else

Hand reviewers the corrected authority. There is no "amendments" section, because after §4/§5 there
is nothing stale left to amend.

Two things belong in the packet:

- **Which rules you relied on, and their status** — quoted-and-binding, or derived-and-overturnable.
- **Any scope determination you made** under §2, stated as a claim with its quote, so a reviewer can
  attack it.

**A reviewer who restates a rule you have already corrected, or quotes a raw escalation without
engaging the scope claim, has produced a non-finding.** Say so plainly and keep the fix. That is not
dismissing review — it is refusing to relitigate an operator decision against the operator's own
current instruction.

## 7. Correcting the rules can BLIND the review — carry the before-state

⚠ **The sweep in §5 is itself a hazard.** Correct every copy of a rule and you have rewritten every text a
reviewer might have used to REFUTE you. Each edit can be defensible while the aggregate quietly removes the
review's ability to check your central claim. That is self-immunisation, and wanting to prevent ambushes is
exactly the motive that makes it feel principled.

Git is the record your sweep cannot touch. Use it to split three cases:

| the doctrine being cited | what it is | how to treat it |
|---|---|---|
| **predates** the change | real authority | engage it |
| **written in** the change | the author's CLAIM | citing it back as justification is circular |
| **deleted in** the change | the author's CLAIM | **audit the deletion** — if the deleted rule covered the case, that is a finding |

**Reviewer agents are read-only** (Read/Grep/Glob — no shell), so they cannot run git themselves. Materialise
it: `provenance.sh <base-ref> <out-file> <paths…>` writes the BEFORE state of every rule file the change
touches, straight from `git show`. Put it in the PACKET, never in the standing rules (§4). The reviewer
cross-checks its "after" side against the live files they CAN read, which is what makes a doctored
before-file detectable.

State the base ref in the packet, and say plainly: **"here is what I deleted — tell me if any of it actually
covered this case."** Handing reviewers a cleaned-up workspace is not the same as handing them the evidence
to convict you.

⚠ **CHECK THAT THE RULE IS UNDER VERSION CONTROL BEFORE YOU REWRITE IT.** A rule outside git has exactly ONE
copy, and §5's sweep destroys it — and that is usually the rule whose before-state matters MOST, because a
memory file is where an operator escalation and your own gloss sit side by side.

⚠ **Do NOT rely on remembering to commit it.** "Put it somewhere and it gets done" is precisely the failure
this skill exists to name. The store is committed by a HOOK (`.claude/hooks/commit-memory.sh`, wired in
`settings.local.json` on `PostToolUse` for Write/Edit and on `Stop` as the end-of-turn backstop — files are
often written through Bash, which the tool matcher never sees). It is a safety net that guarantees a
before-state exists; a deliberate rule correction still deserves its own hand-written commit saying what was
deleted and why.

The CRL memory store IS a standalone local git repo (`.../.claude/projects/<project>/memory`, no remote —
it holds working notes and quoted escalations and does not belong in the project repo or the corpus). So
`provenance.sh` works on it: **commit before you rewrite**, and the deletion becomes auditable like any other.
It is on a filesystem that does not record ownership, so it needs a one-time
`git config --global --add safe.directory <path>`.

For anything still outside version control: copy the original into the packet FIRST. If you have already
rewritten it, recover it from the session transcript, label it **"not from git — author-reproduced"**, and
say outright that it is weaker evidence. Never present a reproduction as if it were a record.

## 8. The same rule governs YOUR acceptance of review points — narrowly

Applying §7 to your own accept/reject is correct for ONE class of finding and is immunisation for every other.

**The test: does the finding survive deleting its citation?**

- **No — the citation WAS the argument** (a pure appeal to authority: "this violates rule R", nothing more).
  Provenance governs. If R is text you wrote in this change, the finding is circular; say so and keep the fix.
- **Yes — it stands on its own** ("this produces the wrong result in situation S", which merely *mentions* R).
  It is SUBSTANTIVE. Provenance is irrelevant. Engage it on the merits no matter what doctrine it cites.

Three guardrails, because you are the interested party:

1. **Never provenance-decline a finding about your DELETIONS.** That is the one thing §7 exists to let a
   reviewer check. Auditing what you removed is always in scope.
2. **Ties go to the reviewer.** If you cannot cleanly tell whether a finding is substantive, it is substantive.
3. **Every provenance-decline is WRITTEN DOWN** with its evidence (which text, introduced by which change),
   in the same accept/refine/reject ledger as everything else. A silent provenance dismissal is
   indistinguishable from ignoring the finding — and reads identically to the operator.

⚠ The failure to watch for: a reviewer makes a real point, and you reclassify it as "anchoring on doctrine I
changed" to avoid engaging it. That is not applying the rule; it is laundering a rejection through it.

## 9. Done

- Zero copies of the wrong rule remain anywhere a reader or reviewer can reach.
- Every surviving negative clause passes the §4 test.
- Every requirement you touched distinguishes QUOTED from DERIVED.
- Nothing was retired that only the operator may retire.
- The review packet carries the before-state (§7) and names the base ref, so the DELETIONS are auditable.
- Every finding declined on provenance grounds (§8) is written down with its evidence.
