#!/usr/bin/env bash
# Surface live REFACTOR trust-mark counts at session start, and flag when a refactor may be ready to CLOSE.
#
#   refactor-state.sh [<repo-root>]
#
# WHY: `large-refactor` is a MODE carried as state in tmp/REFACTORS-IN-FORCE.md. State has an on-switch and
# needs an off-switch. A STALE "in force" entry is actively harmful — it tells every reader and every
# reviewer that finished, correct code is "presumed-wrong and may not be cited as authority", which is the
# exact inverse of the truth once the refactor lands.
#
# Hand-maintained counts in that file rot. These are computed live, so they cannot.
#
# BOTH done-gate conditions are reported, at the granularity each can be measured:
#   - "zero REFACTOR:suspect"  — exact.
#   - "zero UNMARKED in scope" — exact at FILE granularity, approximate at block granularity. You cannot
#     grep for a block that should have been marked; you CAN diff the refactor's own commit range against
#     the set of files carrying markers. A file the refactor modified and never marked is unmarked-in-scope
#     by definition. Blocks inside an already-marked file still need eyes.
# So this never says "done" — it says which conditions are mechanically satisfied and what is left by hand.
#
# Contract: never fail, never chatter when there is nothing to say.
set -uo pipefail

ROOT="${1:-$PWD}"
STATE="$ROOT/tmp/REFACTORS-IN-FORCE.md"
SRC="$ROOT/packages"

[ -f "$STATE" ] || exit 0
grep -q '^### ' "$STATE" 2>/dev/null || exit 0          # nothing listed under ACTIVE
grep -q '^## ACTIVE' "$STATE" 2>/dev/null || exit 0
[ -d "$SRC" ] || exit 0

# Excluded from the COUNT, for two different reasons — neither is "these do not matter":
#   - catalog/*.cql is SHIPPED content, copied verbatim into every emitted IG. A trust-mark token there
#     goes out to consumers, so it carries its warning in PROSE instead and is tracked in the state file.
#   - tests/golden/** are ORACLES — they pin what correct emit looks like, and they SHIP. They are copies
#     of authored content, so they are counted at their SOURCE; counting them again would score one
#     decision nine times. ⚠ That is a counting rule, NOT permission to ignore them: a golden carrying
#     stale doctrine is a stale ORACLE, which is exactly as convincing as a passing test that asserts it.
#     Re-pin them whenever the source doctrine changes.
notcode() { grep -vE '/tests/golden/|/catalog/[^/]*\.cql$'; }
count() { grep -rl "$1" "$SRC" --include=*.ts --include=*.cql 2>/dev/null | notcode | grep -c . || true; }
SUSPECT="$(count 'REFACTOR:suspect')"
GROUNDED="$(count 'REFACTOR:grounded')"

# Touched-but-unmarked, over the refactor's own commit range. Base ref comes from the state file
# (`Base ref | <rev>`); it falls back to the merge-base with the default branch, which is the usual
# meaning of "where this refactor started". Working-tree changes count too — unmarked is unmarked.
BASE="$(sed -n 's/^| \*\*Base ref\*\* | `\([^`]*\)`.*/\1/p' "$STATE" | head -1)"
if [ -z "$BASE" ]; then
  BASE="$(git -C "$ROOT" merge-base main HEAD 2>/dev/null)"
fi
UNMARKED=""
if [ -n "$BASE" ]; then
  TOUCHED="$( { git -C "$ROOT" diff --name-only "$BASE" HEAD 2>/dev/null; \
                git -C "$ROOT" diff --name-only HEAD 2>/dev/null; } \
              | grep -E '^packages/.*/src/.*\.(ts|cql)$' | notcode | sort -u )"
  for f in $TOUCHED; do
    [ -f "$ROOT/$f" ] || continue
    grep -q "REFACTOR:" "$ROOT/$f" 2>/dev/null || UNMARKED="$UNMARKED$f"$'\n'
  done
fi
UNMARKED="$(printf '%s' "$UNMARKED" | sed '/^$/d')"
NUNMARKED="$(printf '%s' "$UNMARKED" | grep -c . || true)"

# RETIRE:<trigger> — constructs that are deliberately temporary and must be DELETED when their trigger
# fires (a pre-flip warning, an inert arm, a compatibility sentinel). Prose words like "transient" are
# useless to grep: half the hits are transient worktrees and transient failures. A marker is not.
RETIRE_N="$(grep -rho 'RETIRE:[A-Za-z0-9_.#-]*' "$SRC" --include=*.ts --include=*.cql 2>/dev/null \
            | sort | uniq -c | sort -rn | head -8)"
RETIRE_TOTAL="$(grep -rho 'RETIRE:[A-Za-z0-9_.#-]*' "$SRC" --include=*.ts --include=*.cql 2>/dev/null | grep -c . || true)"

# Only the WORKLIST knows whether a refactor is finished; marker counts are per-slice hygiene, not
# completion. Closing therefore requires an explicit declaration in the state file.
SLICES_LEFT="$(sed -n 's/^| \*\*Slices remaining\*\* | \(.*\) |.*/\1/p' "$STATE" | head -1 | tr -d '` ')"

echo "large-refactor MODE IS IN FORCE (tmp/REFACTORS-IN-FORCE.md). Code in the listed paths is the PATIENT:"
echo "  unmarked code is PRESUMED-WRONG and must never be cited as authority; review packets touching"
echo "  those paths must hand reviewers the taxonomy."
echo "  trust-marks now: ${GROUNDED} file(s) REFACTOR:grounded, ${SUSPECT} file(s) REFACTOR:suspect."

if [ -n "$BASE" ]; then
  echo "  touched by this refactor but carrying NO marker: ${NUNMARKED} file(s) — presumed-wrong by the trust-mark rule."
  if [ "$NUNMARKED" != "0" ] && [ "$NUNMARKED" -le 12 ] 2>/dev/null; then
    printf '%s\n' "$UNMARKED" | sed 's/^/      /'
  fi
fi

# ⚠ Markers REMOVED since the slice base, while the refactor is still open. This is the most damaging move
# available: a marker is the record that code was re-derived from the target model, so deleting one converts
# verified code into something indistinguishable from never-checked — and defeats the grep that is the only
# way to tell them apart. It usually happens under pressure to make a gate pass. Markers come out ONCE, at
# refactor close, in a single deliberate sweep.
if [ -n "$BASE" ]; then
  # PER FILE, not net-across-the-diff. Two aggregations look right and are not:
  #   - raw `-` lines: rewording a marker is one `-` and one `+`, so ordinary edits cry wolf;
  #   - net over the whole diff: a slice that ADDS markers elsewhere masks a deletion here entirely
  #     (measured: 16 added vs 4 deleted — the alarm could never fire during active work).
  # A file that carried N markers at the base and carries fewer now has LOST evidence, whatever happened
  # in other files. Sum those per-file decreases.
  MPAT='REFACTOR:\(grounded\|suspect\)'
  REMOVED=0
  LOST=""
  while IFS=: read -r bf bn; do
    [ -n "$bf" ] || continue
    if [ -f "$ROOT/$bf" ]; then
      now="$(grep -c "$MPAT" "$ROOT/$bf" 2>/dev/null || true)"
    else
      now=0
    fi
    if [ "${now:-0}" -lt "${bn:-0}" ] 2>/dev/null; then
      REMOVED=$(( REMOVED + bn - now ))
      LOST="$LOST      $bf ($bn -> $now)"$'\n'
    fi
  done <<EOF
$(git -C "$ROOT" grep -c "$MPAT" "$BASE" -- packages 2>/dev/null | sed "s|^$BASE:||")
EOF
  if [ "$REMOVED" != "0" ]; then
    echo ""
    echo "  !! ${REMOVED} REFACTOR: marker(s) DELETED since the slice base, refactor still open."
    echo "     Markers are verification EVIDENCE, not clutter. If this was to clear a gate, put them back"
    echo "     and use the gate's override instead. If the refactor is genuinely closing, that sweep is a"
    echo "     single deliberate commit and the state entry moves to CLOSED."
    printf '%s' "$LOST"
  fi
fi

if [ "$RETIRE_TOTAL" != "0" ]; then
  echo "  RETIRE: markers open (delete when their trigger fires): ${RETIRE_TOTAL}"
  printf '%s\n' "$RETIRE_N" | sed 's/^ */      /'
fi

if [ "$SUSPECT" = "0" ] && [ "${NUNMARKED:-1}" = "0" ] && [ "$SLICES_LEFT" = "none" ]; then
  echo ""
  echo "  >> READY TO CLOSE: zero suspect, every touched file marked, and the state file declares no"
  echo "     slices remaining. Still NOT automatic — two things need eyes:"
  echo "       (a) unmarked BLOCKS inside already-marked files; no grep can find those."
  echo "       (b) every open RETIRE: marker above — those are deletions this refactor still owes."
  echo "     Then close it: sweep every REFACTOR:grounded marker in ONE final commit, move the entry to"
  echo "     CLOSED in tmp/REFACTORS-IN-FORCE.md, and say so in the response."
  echo "     Leaving a finished refactor 'in force' tells readers that correct code is presumed-wrong."
else
  echo "  open suspects are the live to-do list; see the state file for what each is waiting on."
fi

# ⭐ THE PLAN-SPRAWL GUARD.
#
# WHY: on 2026-08-31 a sweep found 65 HANDOFF files, 51 of them claiming to be THE resume point, plus 48
# PLANs and 28 files saying "NEXT" — 264 markdown files in a gitignored directory that nothing prunes. There
# was no single source of truth about what to do next; there were 51, and each session picked whichever it
# happened to find. Measured cost: a fresh plan written for work that already had a converged design doc and
# two panel rounds, because there was nowhere single to look. Worse, the sprawl PRESERVED a wrong framing
# ("all that is left is the emit") across sessions, so every prerequisite arrived looking like a surprise and
# produced another handoff.
#
# tmp/ is gitignored, so no review, no PR and no cleanup pass will ever catch this regrowing. A session-start
# check is the only thing that can. It never fails the session — it just refuses to let the regrowth be
# invisible.
NEXT_CLAIMANTS=$(grep -lE '^#+ .*NEXT|NEXT:' "$ROOT"/tmp/*.md 2>/dev/null | grep -v 'REFACTORS-IN-FORCE.md' || true)
HANDOFFS=$(ls "$ROOT"/tmp/HANDOFF-*.md 2>/dev/null | wc -l | tr -d ' ')
if [ -n "$NEXT_CLAIMANTS" ] || [ "${HANDOFFS:-0}" -gt 0 ]; then
  echo ""
  echo "  WARNING: PLAN SPRAWL is regrowing - the thing that cost a week of wrong framing."
  [ "${HANDOFFS:-0}" -gt 0 ] && echo "     ${HANDOFFS} tmp/HANDOFF-*.md file(s). Do NOT write handoffs; update the state file's NEXT section."
  if [ -n "$NEXT_CLAIMANTS" ]; then
    echo "     file(s) other than the state file claiming NEXT:"
    printf '%s
' "$NEXT_CLAIMANTS" | sed "s|$ROOT/||" | sed 's/^/       /'
  fi
  echo "     tmp/REFACTORS-IN-FORCE.md section 'THE ONE NEXT STEP' is the single source of truth. Fold these"
  echo "     into it and move them to tmp/archive/ - a second answer to 'what next' is worse than none."
fi

exit 0
