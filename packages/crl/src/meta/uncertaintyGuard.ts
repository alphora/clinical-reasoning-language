import type { Concept, Criterion, MetaEntry } from "../ast/types";
import { parseMetaTag } from "./parseMetaTag";

export const UNCERTAINTY_GUARD_TAG = "tree-uncertainty-guard";
export type UncertaintyGuardMetadata =
  | { kind: "absent" }
  | { kind: "invalid" }
  | { kind: "guard"; passWhen: boolean };

/** REFACTOR:grounded: an explicit display annotation, never inferred from names or clinical answers. */
export function uncertaintyGuardMetadata(meta: readonly MetaEntry[] | undefined): UncertaintyGuardMetadata {
  const entries = (meta ?? []).map(entry => ({ text: entry.text.trim(), parsed: parseMetaTag(entry.text) }))
    .filter(entry => entry.parsed.kind === "tag"
      ? entry.parsed.parsed.tag === UNCERTAINTY_GUARD_TAG
      : /^@tree-uncertainty-guard(?=\s|:|$)/i.test(entry.text));
  if (!entries.length) return { kind: "absent" };
  if (entries.length !== 1) return { kind: "invalid" };
  const { parsed } = entries[0];
  if (parsed.kind !== "tag" || parsed.parsed.duplicateFields.length ||
      parsed.parsed.fields.size !== 1 || !["true", "false"].includes(parsed.parsed.fields.get("pass") ?? "")) return { kind: "invalid" };
  return { kind: "guard", passWhen: parsed.parsed.fields.get("pass") === "true" };
}

/** REFACTOR:grounded: scope/type admission does not assert that any particular predicate checks uncertainty. */
export function supportsUncertaintyGuardMetadata(target: { type: string }): target is Concept | Criterion {
  return target.type === "Criterion" || (target.type === "Concept" &&
    (target as Concept).valueTypes.length === 1 && (target as Concept).valueTypes[0] === "boolean");
}
