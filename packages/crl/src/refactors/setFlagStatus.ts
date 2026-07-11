// #205 crl-refactors — the SOURCE-level `set_flag_status` transform: locate ONE flag in a `.crl` by a selector and flip
// its `; status`, as a PURE transform. It is the agent-surface wrapper over the already-factored `rewriteMetaStatus`
// atom (which edits a known line): here we first LOCATE the line via `collectFlags`, then apply the atom. The MV cockpit
// keeps its OWN write-back (it locates via a loaded FlagInstance + a live-buffer re-read for byte-safety), so this is the
// headless counterpart, not a cockpit re-shim. Every domain failure is a typed reason; it never throws.
import { buildCRL, validateCRL } from "../index";
import { collectFlags, type FlagInstance } from "../meta/collectFlags";
import { canonicalTag } from "../meta/registry";
import { rewriteMetaStatus, type FlagStatus } from "./rewriteMetaStatus";
import { newDiagnostics, slimDiagnostics, type SlimDiagnostic } from "./createFlag";

export interface FlagSelector {
  scope: "concept" | "decision" | "library";
  name: string;
  /** the declaring library; optional (a CRL file declares exactly one, so `(scope,name)` already picks the node). */
  library?: string;
  /** the flag TAG (canonical or alias — matched canonically). */
  tag: string;
  /** the stable join key, when present — disambiguates two same-tag flags on one node. */
  key?: string;
}

/** A matching flag surfaced when the selector is ambiguous — enough for the caller to disambiguate (its `key`/`line`). */
export interface FlagCandidate {
  line: number; // 1-based source line of the `- meta is` line
  status: string;
  key?: string;
  gist: string; // the body up to the first `;` (the human gist), for eyeballing
}

export type SetFlagStatusFailure =
  | "parse-failed" // the source didn't parse
  | "not-found" // no flag matched the selector
  | "ambiguous" // >1 flag matched and no unique key disambiguated (see `candidates`)
  | "invalid-result"; // the rewrite made the document invalid (should not happen for a status flip)

export type SetFlagStatusResult =
  | { ok: true; source: string; changed: boolean; flag: FlagInstance }
  | { ok: false; reason: SetFlagStatusFailure; message: string; candidates?: FlagCandidate[]; diagnostics?: SlimDiagnostic[] };

const slim = slimDiagnostics;

const gistOf = (body: string): string => {
  const i = body.indexOf(";");
  const seg = (i === -1 ? body : body.slice(0, i)).trim();
  const colon = seg.indexOf(":"); // strip the leading `@tag:` if present
  return (colon === -1 ? seg : seg.slice(colon + 1)).trim();
};

/** Flip the `; status` of the flag `selector` picks out in `source` to `nextStatus`. Pure; returns the rewritten source
 *  (+ whether it actually changed) or a typed reason. On >1 match with no disambiguating key, returns `ambiguous` with
 *  the candidates (never guesses which to flip — mirrors the cockpit write-back's same-flag-identity discipline). */
export function setFlagStatus(source: string, selector: FlagSelector, nextStatus: FlagStatus): SetFlagStatusResult {
  const parsed = buildCRL(source);
  if (!parsed.success || !parsed.result) {
    return { ok: false, reason: "parse-failed", message: "the source did not parse", diagnostics: slim(parsed.errors as unknown[]) };
  }
  const wantTag = canonicalTag(selector.tag) ?? selector.tag;
  const matches = collectFlags(parsed.result).filter(
    (f) =>
      f.scope === selector.scope &&
      f.targetName === selector.name &&
      (selector.library === undefined || f.libraryName === selector.library) &&
      f.canonicalTag === wantTag &&
      (selector.key === undefined || f.key === selector.key),
  );
  if (matches.length === 0) return { ok: false, reason: "not-found", message: `no @${wantTag} flag on ${selector.scope} "${selector.name}"` };
  if (matches.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      message: `${matches.length} @${wantTag} flags on ${selector.scope} "${selector.name}" — pass a distinguishing key`,
      candidates: matches.map((f) => ({ line: f.lineLocation.start.line, status: f.status, key: f.key, gist: gistOf(f.body) })),
    };
  }

  const flag = matches[0];
  // The meta line's FULL span — a backtick body can legally contain newlines (lexer `BACKTICK_STRING` allows them), so a
  // flag may span several physical lines. Operate on start..end, not just the start line — else `rewriteMetaStatus` sees
  // a line with only the OPENING backtick, no-ops, and we'd falsely report `changed:false` (Claude impl review).
  const startIdx = flag.lineLocation.start.line - 1; // 1-based AST → 0-based
  const endIdx = flag.lineLocation.end.line - 1;
  // The returned `source` is normalized to the file's dominant EOL (like createFlag) — a whole-file rejoin. Agents that
  // write it back to a genuinely mixed-EOL file see it unified; a uniform LF/CRLF file is unchanged.
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  if (startIdx < 0 || endIdx >= lines.length || endIdx < startIdx) return { ok: false, reason: "invalid-result", message: "the flag's source span is out of range" };
  const original = lines.slice(startIdx, endIdx + 1).join(eol); // the whole `- meta is \`…\`.` (possibly multi-line)
  const rewritten = rewriteMetaStatus(original, nextStatus);
  const changed = rewritten !== original;
  if (!changed) {
    // Already at nextStatus — return the source unchanged (a sweeper can skip the write). `flag` is the located identity.
    return { ok: true, source, changed: false, flag };
  }
  lines.splice(startIdx, endIdx - startIdx + 1, ...rewritten.split(/\r?\n/));
  const after = lines.join(eol);

  // Re-validate: a status flip should never break the document, but guard anyway (introduced errors by multiset diff).
  const introduced = newDiagnostics(slim(validateCRL(source).errors as unknown[]), slim(validateCRL(after).errors as unknown[]));
  if (introduced.length) return { ok: false, reason: "invalid-result", message: "the status change made the document invalid", diagnostics: introduced };

  const outAst = buildCRL(after);
  const out = outAst.success && outAst.result ? collectFlags(outAst.result).find((f) => f.lineLocation.start.line === flag.lineLocation.start.line) : undefined;
  return { ok: true, source: after, changed: true, flag: out ?? flag };
}
