// #205 crl-refactors — instance #1 (seeded by #203 flags): the meta-quickfix family's status flip.
// A PURE, source-preserving transform over a single `- meta is `…`.` line. It edits ONLY the `; status`
// field INSIDE the backticks and preserves everything else (indentation, `- meta is `, the backticks, the
// trailing `.`, any newline) byte-for-byte. This is the shared atom; each surface (MV cockpit / editor code
// action / MCP automation) wraps it in its own apply adapter (WorkspaceEdit / fs) — see #205 for the seam.
//
// Round-trip contract (tested): apply → re-parse with parseMetaTag → the `status` field reads back as `next`.
// A rewrite the parser then re-reads differently would be a silent stuck-open bug, so the tests assert it.

/** The two MV-toggleable flag states. (open↔resolved only — delete lives in a separate learning system.) */
export type FlagStatus = "open" | "resolved";

// A field segment whose KEY (first whitespace-token) is `status`. Applied to a single `;`-delimited field segment's
// CONTENT (never seg0/body), so a `status` word in the body is never touched. Group 1 = `<ws>status<ws>`, 2 = the whole
// value (open/resolved plus any trailing text). We replace the ENTIRE value with the bare token: `parseMetaTag` stores a
// field's value as everything after the key, so `status resolved (ruling)` would read back as the literal status
// `"resolved (ruling)"` — never `=== "resolved"` — and the flag would be stuck counted-open (gpt55 impl review). The
// status field is a bare enum token by contract; a ruling belongs in the body / a separate field / the issue, not here.
const STATUS_WITH_VALUE = /^(\s*status\s+)(.+)$/;
const STATUS_NO_VALUE = /^(\s*status\s*)$/;

/**
 * Rewrite the `status` field of a meta backtick BODY to `next`.
 * - open↔resolved: sets the value of EVERY `status` field to the bare token `next` (robust to a malformed duplicate —
 *   the parser is last-wins, so leaving a later `status open` would keep it open; rewriting all is deterministic). The
 *   whole value is replaced (any trailing text is dropped) so the parser reads back exactly `next` (not `resolved (x)`).
 * - absent → appends `; status <next>` before the end of the body (stripping a lone trailing `;`/whitespace).
 * Only the `status` value changes; the tag, body, and other fields are untouched.
 */
export function rewriteStatusInBody(body: string, next: FlagStatus): string {
  // Walk `;`-delimited segments by offset (seg0 = body text, never scanned; seg1.. = fields).
  const spans: Array<[number, number]> = [];
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === ";") {
      spans.push([start, i]);
      start = i + 1;
    }
  }
  spans.push([start, body.length]);

  let found = false;
  // Rebuild left→right so offsets stay valid; skip seg0 (index 0 — the body text).
  let out = spans.length ? body.slice(0, spans[0][1]) : body; // seg0 content
  for (let idx = 1; idx < spans.length; idx++) {
    const [s, e] = spans[idx];
    const content = body.slice(s, e);
    let rewritten = content;
    const withVal = STATUS_WITH_VALUE.exec(content);
    if (withVal) {
      rewritten = `${withVal[1]}${next}`; // replace the WHOLE value with the bare token (drop any trailing ruling)
      found = true;
    } else if (STATUS_NO_VALUE.test(content)) {
      rewritten = `${content.replace(/\s*$/, "")} ${next}`;
      found = true;
    }
    out += ";" + rewritten; // the `;` that preceded this segment
  }

  if (found) return out;
  // No status field → append one, stripping any lone trailing `;`/whitespace (an empty final segment the parser ignores).
  return `${body.replace(/\s*;?\s*$/, "")}; status ${next}`;
}

/**
 * Rewrite the `; status` of a full `- meta is `…`.` source LINE to `next`, preserving everything outside the
 * backtick body byte-for-byte. If the line has no backtick pair (not a well-formed meta line), it is returned
 * unchanged — the apply layer is responsible for only calling this on a real meta line (`flag.lineLocation`).
 */
export function rewriteMetaStatus(rawLine: string, next: FlagStatus): string {
  const open = rawLine.indexOf("`");
  const close = rawLine.lastIndexOf("`");
  if (open === -1 || close <= open) return rawLine;
  const body = rawLine.slice(open + 1, close);
  return rawLine.slice(0, open + 1) + rewriteStatusInBody(body, next) + rawLine.slice(close);
}
