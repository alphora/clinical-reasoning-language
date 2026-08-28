#!/usr/bin/env bash
# Materialise the BEFORE-state of every rule file a change touches, so a read-only reviewer
# (Read/Grep/Glob, no shell) can audit what the change ADDED and — more importantly — what it DELETED.
#
#   ./provenance.sh <base-ref> <out-file> <path> [<path> ...]
#
# Generated MECHANICALLY from git on purpose: the point is that the author does not get to paraphrase
# what the rule used to say. The reviewer cross-checks the "after" side against the live files they can
# read, which is what makes a doctored before-file detectable.
#
# Emit this into the review packet, NEVER into the standing rules — an amendment trail inside the
# authority is bloat that invites re-litigation (skill §4). Scoped to one round, then discarded.
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: $0 <base-ref> <out-file> <path> [<path> ...]" >&2
  exit 2
fi

base="$1"; out="$2"; shift 2

{
  echo "# Rule provenance — BEFORE state at \`$base\`"
  echo
  echo "Generated mechanically via \`git show\`. Nothing here is paraphrased."
  echo
  echo "**How to use this.** For each file below, compare against the LIVE file in the workspace:"
  echo
  echo "- Text present here and GONE from the live file was **DELETED by this change**. That deletion is"
  echo "  the author's claim, not authority — and auditing it is the point. If any deleted rule genuinely"
  echo "  covered the case under review, that is a finding."
  echo "- Text present in the live file but NOT here was **WRITTEN by this change**. It is the author's"
  echo "  claim. Do not cite it back as justification for the change; that is circular."
  echo "- Text unchanged between the two **predates the change** and is real authority. Engage it."
  echo
  for p in "$@"; do
    echo "---"
    echo
    echo "## \`$p\`"
    echo
    if git cat-file -e "$base:$p" 2>/dev/null; then
      echo '```'
      git show "$base:$p"
      echo '```'
    else
      echo "_(did not exist at \`$base\` — this file is NEW in the change)_"
    fi
    echo
  done
} > "$out"

echo "wrote $out ($(wc -l < "$out") lines, $# path(s), base $base)"
