import type { MetaEntry } from "../ast/types";
import { parseMetaTag } from "./parseMetaTag";

export type ConceptIdentity = { kind: "absent" } | { kind: "id"; id: string } | { kind: "invalid" };

/** Read the existing authored @id. Never manufacture identity or choose among
 * repeated/malformed declarations. Used by flag creation and the live index. */
export function conceptIdentity(meta: readonly MetaEntry[] | undefined): ConceptIdentity {
  const entries = (meta ?? []).map(m => ({ text: m.text.trim(), parsed: parseMetaTag(m.text) }))
    .filter(m => m.parsed.kind === "tag"
      ? m.parsed.parsed.tag === "id"
      : /^@id(?=\s|:|$)/i.test(m.text));
  if (!entries.length) return { kind: "absent" };
  if (entries.length !== 1) return { kind: "invalid" };
  const { parsed } = entries[0];
  if (parsed.kind !== "tag" || parsed.parsed.tag !== "id" ||
      !parsed.parsed.body || parsed.parsed.fields.size) return { kind: "invalid" };
  return { kind: "id", id: parsed.parsed.body };
}
