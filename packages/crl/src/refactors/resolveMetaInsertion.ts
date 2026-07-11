// #205 crl-refactors instance #2 (KE #203 Todo 4b Slice B) — the INSERT-meta dual of `rewriteMetaStatus`: resolve the
// grammar-legal insertion point for a NEW `- meta is` line on a concept or decision. Unlike `rewriteMetaStatus` (which
// edits ONE already-known line), this must FIND the slot — and the AST carries no per-line locations for type/code/etc
// (only meta entries do), so it TEXT-SCANS the source within the node's body (gpt55 + Claude design review, disc 227).
//
// Grammar meta slots (CRLParser.g4): a CONCEPT body is
//   (typeLine)? (valueTypeLine)* (metaLine)* (evidence)? (code | codedFrom | definedAs | definitionIs)? sourceRep*
// so a new meta line goes AFTER the last type/valueType/existing-meta line and BEFORE evidence/code/definedAs/
// definitionIs/sourceRep. A DECISION body is `(metaLine)* blockQualifier? branchItem+`, so decision meta is LEADING —
// after the decl + any existing meta, before `first:`/`all:`/`any:`/branches. This resolver scans PAST the pre-meta lines
// and returns the first following line as the insertion point (a stop keyword, a blank, or the next statement — all
// valid slot ends); it never descends into a source-rep's nested `- type is` (source-rep is itself the first stop).

/** The resolved insertion point. `insertLine` is 0-based — insert the new `- meta is …` line (with `indent`) BEFORE it,
 *  pushing the current line down. The apply adapter owns the WorkspaceEdit + save + guards (mirrors rewriteMetaStatus). */
export type MetaInsertionResult =
  | { ok: true; insertLine: number; indent: string }
  | { ok: false; reason: "decl-out-of-range" };

/** Resolve where a new `- meta is` line legally goes on `target` (a concept or decision), scanning `source`. `declLine`
 *  is 1-based (the AST `location.start.line` of the `concept "X":` / `decision "X":` declaration). PURE + total: an
 *  out-of-range decl returns `{ok:false}` rather than guessing a slot. */
export function resolveMetaInsertion(
  source: string,
  target: { kind: "concept" | "decision"; declLine: number },
): MetaInsertionResult {
  const lines = source.split(/\r?\n/);
  const decl0 = target.declLine - 1; // 1-based AST → 0-based
  if (decl0 < 0 || decl0 >= lines.length) return { ok: false, reason: "decl-out-of-range" };
  // The lines that legally PRECEDE a new meta line: for a concept, type/valueType/existing-meta; for a decision, only
  // existing meta (it is leading). The scan stops at the first line that is NOT one of these — the insertion point.
  const precede =
    target.kind === "concept" ? /^\s*-\s*(type is|value type is|meta is)\b/ : /^\s*-\s*meta is\b/;
  let i = decl0 + 1;
  while (i < lines.length && precede.test(lines[i])) i++;
  // Indent the new line to match the body: the last advanced line if any, else the stop line when it is dashed (a
  // `- code is`/`- defined as`), else empty (a top-level concept/decision body dashes at column 0).
  let indent = "";
  if (i > decl0 + 1) indent = /^(\s*)/.exec(lines[i - 1])![1];
  else if (i < lines.length && /^\s*-/.test(lines[i])) indent = /^(\s*)/.exec(lines[i])![1];
  return { ok: true, insertLine: i, indent };
}
