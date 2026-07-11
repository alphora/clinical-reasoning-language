// #205 crl-refactors — instance #2 (the CREATE half of the meta-quickfix family): author a review FLAG on a concept or
// decision in a `.crl`, as a PURE, source-preserving transform. This is the shared atom the MV cockpit's Add-flag AND
// the `create_flag` MCP tool both wrap, each with its own apply adapter (WorkspaceEdit / return-source) — factored OUT of
// the cockpit's `addFlagAtNode` so the editor and the agent surface can't drift (#205 seam). It validates the tag +
// registry-required fields, sanitizes the gist/field values, locates the declaration, finds the grammar-legal meta slot
// (`resolveMetaInsertion`), builds the `- meta is` line, splices it in, and RE-VALIDATES the result — never returning
// source that would red-squiggle. Every domain failure is a typed reason; it never throws.
import type { CRL } from "../ast/types";
import { buildCRL, validateCRL } from "../index";
import { collectFlags, type FlagInstance } from "../meta/collectFlags";
import { canonicalTag, fieldRulesOf, isFlag } from "../meta/registry";
import { resolveMetaInsertion } from "./resolveMetaInsertion";

export interface CreateFlagTarget {
  kind: "concept" | "decision" | "library";
  /** the concept/decision name, or (for kind "library") the library name. */
  name: string;
  /** the declaring library; when omitted, matches regardless (a CRL file declares exactly one library). Ignored for
   *  kind "library" (the library IS the target). */
  library?: string;
}

export interface CreateFlagInput {
  tag: string;
  gist: string;
  /** extra `; key value` fields (e.g. `direction`, `ref`, `assumption`); registry-required ones are enforced. */
  fields?: Record<string, string>;
  /** the `; status` value; defaults to `open`. */
  status?: string;
}

export interface SlimDiagnostic {
  kind: string;
  message: string;
  line?: number;
  column?: number;
}

export type CreateFlagFailure =
  | "parse-failed" // the INPUT source didn't parse
  | "unknown-tag" // the tag isn't a registered flag tag
  | "missing-field" // a registry-required field is absent
  | "invalid-value" // a gist/field/status value is empty, malformed, or fails an enum
  | "decl-not-found" // no concept/decision of that (name, library)
  | "resolve-failed" // no legal meta slot for that declaration
  | "invalid-result"; // the insert would make the document invalid

export type CreateFlagResult =
  | {
      ok: true;
      /** the rewritten CRL source with the flag inserted (the source's dominant EOL preserved). */
      source: string;
      /** 0-based line the meta line was inserted BEFORE (may equal the line count at EOF). */
      insertLine: number;
      /** the inserted line text (indent + `- meta is …`, NO trailing newline) — for a line-inserting apply adapter. */
      lineText: string;
      /** the created flag, re-collected from the output — the caller's selector for a later set_flag_status. */
      flag: FlagInstance;
    }
  | { ok: false; reason: CreateFlagFailure; message: string; diagnostics?: SlimDiagnostic[] };

/** The chars a flag gist / field value must NOT contain — a backtick or newline would break the `…` body, a `;` would
 *  spoof a field delimiter. Exported so a surface's live input-validation (the cockpit's `validateInput`) shares the
 *  EXACT rule the transform enforces, and the two can't drift (Claude design review, disc 230). */
export const FORBIDDEN_FLAG_CHARS = /[`\r\n;]/;
/** Does `v` contain a char that's illegal inside a flag gist/field value? */
export function hasForbiddenFlagChars(v: string): boolean {
  return FORBIDDEN_FLAG_CHARS.test(v);
}
const BARE_IDENT = /^[a-z][a-z0-9-]*$/; // a field key is a bare lowercase identifier
const FLAG_STATUSES = ["open", "resolved"] as const; // the FlagStatus lifecycle — status is a bare enum token

/** Project raw validator errors into slim diagnostics (shared by createFlag + setFlagStatus). */
export function slimDiagnostics(errs: readonly unknown[] | undefined): SlimDiagnostic[] {
  return (errs ?? []).map((e) => {
    const v = e as { kind?: string; message?: string; location?: { start?: { line?: number; column?: number } } };
    return { kind: v.kind ?? "error", message: v.message ?? "", line: v.location?.start?.line, column: v.location?.start?.column };
  });
}
const slim = slimDiagnostics;

/** The diagnostics genuinely INTRODUCED by an edit: a MULTISET diff keyed by `kind|message`. An after-diagnostic counts
 *  as new only once the after-count for its key exceeds the before-count — so a line-shift of an existing error doesn't
 *  false-positive, and a NEW duplicate of a pre-existing error isn't masked (gpt55 impl review). Shared by both transforms. */
export function newDiagnostics(before: SlimDiagnostic[], after: SlimDiagnostic[]): SlimDiagnostic[] {
  const budget = new Map<string, number>();
  for (const d of before) budget.set(`${d.kind}|${d.message}`, (budget.get(`${d.kind}|${d.message}`) ?? 0) + 1);
  const introduced: SlimDiagnostic[] = [];
  for (const d of after) {
    const key = `${d.kind}|${d.message}`;
    const remaining = budget.get(key) ?? 0;
    if (remaining > 0) budget.set(key, remaining - 1);
    else introduced.push(d);
  }
  return introduced;
}

/** Author a review flag on `target` in `source`. Pure; returns the rewritten source + the created flag, or a typed reason. */
export function createFlag(source: string, target: CreateFlagTarget, input: CreateFlagInput): CreateFlagResult {
  const parsed = buildCRL(source);
  if (!parsed.success || !parsed.result) {
    return { ok: false, reason: "parse-failed", message: "the source did not parse", diagnostics: slim(parsed.errors as unknown[]) };
  }
  const ast: CRL = parsed.result;

  // 1. Tag must be a registered flag tag (canonicalize aliases → the canonical id we emit).
  const canon = canonicalTag(input.tag);
  if (!canon || !isFlag(input.tag)) return { ok: false, reason: "unknown-tag", message: `"${input.tag}" is not a registered flag tag` };

  // 2. Gist: required + sanitized.
  const gist = (input.gist ?? "").trim();
  if (gist === "") return { ok: false, reason: "invalid-value", message: "a gist is required" };
  if (hasForbiddenFlagChars(gist)) return { ok: false, reason: "invalid-value", message: "the gist must not contain a backtick, newline, or `;`" };

  // 3. Fields: registry-required present; every provided field value sanitized + enum-checked; emitted in a stable order
  //    (registry-rule order first, then any extra provided keys). `status` is set explicitly below, never from fields.
  const fields = input.fields ?? {};
  // `status` is set from the top-level `status` param, never from `fields` — reject a `fields.status` explicitly rather
  // than silently dropping it (a caller who put status there would otherwise get an unexpectedly-open flag; gpt55).
  if (Object.prototype.hasOwnProperty.call(fields, "status")) {
    return { ok: false, reason: "invalid-value", message: "set the flag status via the top-level `status`, not `fields.status`" };
  }
  const rules = fieldRulesOf(canon);
  const ruleByKey = new Map(rules.map((r) => [r.key, r] as const));
  for (const rule of rules) {
    if (!rule.required) continue;
    const v = fields[rule.key] === undefined ? "" : String(fields[rule.key]).trim();
    if (v === "") return { ok: false, reason: "missing-field", message: `field "${rule.key}" is required for @${canon}` };
  }
  // Emit registry fields in registry order, then any EXTRA provided keys sorted alphabetically — a deterministic order
  // independent of the producer's object-key order (gpt55), so two callers with the same fields yield identical source.
  const orderedKeys = [
    ...rules.map((r) => r.key).filter((k) => k !== "status" && fields[k] !== undefined && String(fields[k]).trim() !== ""),
    ...Object.keys(fields)
      .filter((k) => k !== "status" && !ruleByKey.has(k))
      .sort(),
  ];
  const fieldParts: string[] = [];
  for (const key of orderedKeys) {
    if (!BARE_IDENT.test(key)) return { ok: false, reason: "invalid-value", message: `field name "${key}" is not a bare identifier` };
    const val = String(fields[key] ?? "").trim();
    if (val === "") continue;
    if (hasForbiddenFlagChars(val)) return { ok: false, reason: "invalid-value", message: `field "${key}" must not contain a backtick, newline, or ;` };
    const rule = ruleByKey.get(key);
    if (rule?.values && rule.values.length && !rule.values.includes(val)) {
      return { ok: false, reason: "invalid-value", message: `field "${key}" must be one of: ${rule.values.join(", ")}` };
    }
    fieldParts.push(`; ${key} ${val}`);
  }

  // 4. Status: the FlagStatus lifecycle enum only (default open). An arbitrary status would be treated as non-resolved
  //    (stuck-open) by collectFlags, and `resolved (x)` reads back wrong — see rewriteMetaStatus (Claude design review).
  const status = (input.status ?? "open").trim() || "open";
  if (!(FLAG_STATUSES as readonly string[]).includes(status)) return { ok: false, reason: "invalid-value", message: `status must be one of: ${FLAG_STATUSES.join(", ")}` };

  const body = `@${canon}: ${gist}${fieldParts.join("")}; status ${status}`;

  // 5. Locate the declaration line. For a library target it IS the (singular) `library "X".` decl; for a concept/
  //    decision it's the matching statement (unique per kind in a valid CRL; a duplicate name is a pre-existing
  //    validity error the caller should fix — we take the first).
  let declLine: number;
  if (target.kind === "library") {
    if (!ast.library || ast.library.name !== target.name) {
      return { ok: false, reason: "decl-not-found", message: `no library "${target.name}" in this source` };
    }
    declLine = ast.library.location.start.line;
  } else {
    const astType = target.kind === "concept" ? "Concept" : "Decision";
    if (target.library !== undefined && ast.library?.name !== target.library) {
      return { ok: false, reason: "decl-not-found", message: `no library "${target.library}" in this source` };
    }
    const decl = ast.statements.find((s) => s.type === astType && (s as { name?: string }).name === target.name);
    if (!decl) return { ok: false, reason: "decl-not-found", message: `no ${target.kind} "${target.name}" in this source` };
    declLine = decl.location.start.line;
  }

  // 6. Find the grammar-legal meta slot, build the line, splice it in (preserving the source's dominant EOL).
  const res = resolveMetaInsertion(source, { kind: target.kind, declLine });
  if (!res.ok) return { ok: false, reason: "resolve-failed", message: "couldn't find a legal meta slot for that declaration" };
  const lineText = `${res.indent}- meta is \`${body}\`.`;
  // NOTE: the returned `source` is normalized to the file's dominant EOL (CRLF if any CRLF is present, else LF) — a
  // genuinely mixed-EOL file is unified. The cockpit adapter ignores this `source` and inserts `lineText` with the live
  // doc's own EOL (byte-safe); only a caller that writes back `source` wholesale sees the normalization.
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  lines.splice(res.insertLine, 0, lineText);
  const after = lines.join(eol);

  // 7. Re-validate: reject if the insert INTRODUCES a validator error. Diff as a MULTISET keyed by kind|message (an
  //    after-count exceeding the before-count is genuinely new) so a line-shift can't false-positive AND a duplicate of
  //    a pre-existing error isn't masked (gpt55). Up-front field validation is the primary gate; this is the backstop.
  //    Open flags emit an expected `open-flag` WARNING (not an error), so a valid insert stays clean.
  const introduced = newDiagnostics(slim(validateCRL(source).errors as unknown[]), slim(validateCRL(after).errors as unknown[]));
  if (introduced.length) return { ok: false, reason: "invalid-result", message: "the flag would make the document invalid", diagnostics: introduced };

  // 8. Re-collect the created flag from the output as the caller's identity/selector (must be found — we just inserted it).
  const outAst = buildCRL(after);
  const flag = outAst.success && outAst.result ? collectFlags(outAst.result).find((f) => f.lineLocation.start.line === res.insertLine + 1) : undefined;
  if (!flag) return { ok: false, reason: "invalid-result", message: "the inserted flag could not be read back" };

  return { ok: true, source: after, insertLine: res.insertLine, lineText, flag };
}
