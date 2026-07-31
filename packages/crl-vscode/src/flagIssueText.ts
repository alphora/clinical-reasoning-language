// Compose the GitHub issue TITLE + BODY for a flag's "born-together" issue so the issue is self-describing on GitHub's
// side. Background: the flag links OUT to its issue (`; ref #N`), but the issue itself never named the artifact/target it
// came from — orphaned from GitHub's perspective. Reviewers had been hand-prefixing titles with "<artifact id> - " to get
// scannability back; this makes that automatic AND adds a body header so the issue names its artifact + flagged target.
// Pure + node-testable; the effectful POST lives in githubIssue.ts, the cockpit threads policyId/target/summary/stub here.

/** The flagged declaration, as the body header needs to name it. `label` is the drawer's full human wording
 *  (e.g. `decision "Meets criteria"`); `kind`/`name` are the fallback when there's no label. */
export interface FlagIssueTarget {
  kind: string;
  name: string;
  label?: string;
}

/** GitHub rejects an issue title longer than 256 chars with a 422 — which would write the flag WITHOUT its born-together
 *  issue (the exact orphaning this feature fixes). The prefix WIDENS the title, so clamp here. */
const TITLE_MAX = 256;

/** The issue TITLE: `<policyId> - <summary>` (the reviewers' hand-prefix, now automatic), or the bare summary when the
 *  policy id can't be resolved — never a stray leading `" - "`. `summary` is already single-line + backtick/`;`-free
 *  (the cockpit validates it before we get here). Clamped to `TITLE_MAX` (ellipsis on the summary tail; the prefix — the
 *  scannability payload — is preserved) so the added prefix can't push a previously-fitting title into a GitHub 422. */
export function flagIssueTitle(policyId: string | undefined, summary: string): string {
  const s = summary.trim();
  const full = policyId ? `${policyId} - ${s}` : s;
  if (full.length <= TITLE_MAX) return full;
  return `${full.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

/** The issue BODY: a self-describing header naming the artifact + flagged target (+ the MV Type when known), then the
 *  reviewer's stub. The header is markdown (`**Artifact:** \`id\` · <kind> "<name>"`, then a `**Type:** <typeName>` line);
 *  with no policy id it degrades to just the target descriptor. `typeName` is the flag's human Type (e.g. "CRL vs narrative")
 *  — named in the body so the issue is triageable even if the `mv:*` label is missing (a partial-lookup / unlabeled tag). An
 *  empty stub yields the header alone. */
export function flagIssueBody(policyId: string | undefined, target: FlagIssueTarget, stub: string, typeName?: string): string {
  const desc = (target.label ?? "").trim() || `${target.kind} "${target.name}"`;
  const artifact = policyId ? `**Artifact:** \`${policyId}\` · ${desc}` : desc;
  const header = typeName ? `${artifact}\n**Type:** ${typeName}` : artifact;
  const rest = stub.trim();
  return rest ? `${header}\n\n${rest}` : header;
}

/** Todo 3 (disc 358): re-sync an existing issue body's `**Type:**` line to `typeName` after a flag Type change — surgical (the
 *  reviewer may have edited the rest of the body, so regenerating the whole body would clobber their prose). Replaces the FIRST
 *  `**Type:** …` line in place; if none exists (the flag was filed under an unlabeled/unknown tag), inserts the line right after
 *  the first body line (the Artifact header) — or appends it to a single-line body. Pure + node-testable. */
export function replaceIssueTypeLine(body: string, typeName: string): string {
  const line = `**Type:** ${typeName}`;
  // `[^\r\n]*` (NOT `.*$`) so a CRLF body matches too: `.`/`$` stop before `\n` but leave the `\r`, so `.*$` would MISS a
  // `**Type:** Old\r\n` line and duplicate it (impl-review gpt56 #6). No `$` — the match ends before `\r`/`\n`, so the replace
  // preserves the original line ending.
  const typeLine = /^\*\*Type:\*\* [^\r\n]*/m;
  if (typeLine.test(body)) return body.replace(typeLine, line);
  const nl = body.indexOf("\n");
  if (nl === -1) return body === "" ? line : `${body}\n${line}`;
  return `${body.slice(0, nl)}\n${line}${body.slice(nl)}`;
}
