// A scenario/case name authored in CEL often carries the EXPECTED disposition as a suffix, e.g.
// `Contraindication present (absence-of-contraindications criterion fails) -> Unmet`. The `-> <outcome>` is
// redundant with the computed result the panes already show (the questionnaire's `Outcome:` line, the worklist's
// `→ produced` badge), so strip it for DISPLAY only — NEVER from the identity name (caseIdByName lookups key on the
// raw name). Shared by the questionnaire header + the worklist row so the two can't drift.
//
// Conservative match: an arrow (`->` or `→`) FLANKED BY WHITESPACE, then the trailing text to end — so a mid-token
// `a->b` is left alone and only the authored trailing annotation is removed. A name with no such suffix is unchanged.
export function caseDisplayName(name: string): string {
  return name.replace(/\s+(?:->|→)\s+.*$/, "").trimEnd();
}
