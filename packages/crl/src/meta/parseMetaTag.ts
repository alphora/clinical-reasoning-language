// #154/#203: parse a `- meta is` line's inner text (`@tag: body; key value; …`) into its tag, body, and fields.
// FIELD-vs-BODY rule (R2, disc 222): the BODY is everything before the first `;`; each subsequent `; key value`
// segment is a FIELD (first whitespace-token = key, the rest = value). No "first-token-is-a-field-key" heuristic —
// so `@open-fork: status quo is unclear; status open` reads body="status quo is unclear", fields={status:open},
// while `@fidelity-defect: axillary-only over-reach; direction over-reach; status open` reads its `direction`/`status`
// as trailing fields. The `@tag` parse is registry-agnostic here; the Validator decides known/unknown/flag + field rules.
const TAG_RE = /^@([a-z][a-z0-9-]*):\s*([\s\S]*)$/;

export interface ParsedMetaTag {
  /** raw tag id as written (may be a registered alias). */
  tag: string;
  /** the free body (seg0), trimmed. */
  body: string;
  /** field key → value (last-wins on duplicates; duplicates also listed in `duplicateFields`). */
  fields: Map<string, string>;
  /** field keys that appeared more than once (the Validator errors on duplicate gating fields). */
  duplicateFields: string[];
}

export type ParseMetaResult =
  | { kind: "note" } // not `@`-prefixed → a legit untyped note (back-compat), no diagnostic
  | { kind: "malformed" } // `@`-prefixed but not `^@[a-z][a-z0-9-]*:` → probable malformed tag
  | { kind: "tag"; parsed: ParsedMetaTag };

/** Parse a meta line's inner text. `text` is the backtick body (no `- meta is` / backticks / trailing `.`). */
export function parseMetaTag(text: string): ParseMetaResult {
  const trimmed = text.trim();
  if (!trimmed.startsWith("@")) return { kind: "note" };
  const m = TAG_RE.exec(trimmed);
  if (!m) return { kind: "malformed" };
  const tag = m[1];
  const rest = m[2];
  const segments = rest.split(";");
  const body = segments[0].trim();
  const fields = new Map<string, string>();
  const seen = new Set<string>();
  const duplicateFields: string[] = [];
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i].trim();
    if (seg === "") continue; // a trailing/empty `;` segment is ignored
    const sp = seg.search(/\s/);
    const key = (sp === -1 ? seg : seg.slice(0, sp)).trim();
    const value = sp === -1 ? "" : seg.slice(sp + 1).trim();
    if (seen.has(key) && !duplicateFields.includes(key)) duplicateFields.push(key);
    seen.add(key);
    fields.set(key, value); // last-wins for the stored value
  }
  return { kind: "tag", parsed: { tag, body, fields, duplicateFields } };
}
