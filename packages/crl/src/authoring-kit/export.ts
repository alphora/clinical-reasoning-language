import { createHash } from "node:crypto";
import type { AuthoringKit } from "./types";

/** Delivery gate; development retrieval can still expose an honestly stale audit. */
export function assertAuditedKit(kit: AuthoringKit): void {
  const { contentHash, audit, ...content } = kit;
  const actual = createHash("sha256").update(JSON.stringify(content)).digest("hex");
  const scopeSchema = new RegExp("\\bschema\\s+" + kit.schemaVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\d.])", "i");
  if (actual !== contentHash || audit.auditedContentHash !== actual ||
      audit.auditedSchemaVersion !== kit.schemaVersion || !audit.contentMatchesAudit ||
      !/^[0-9a-f]{40}$/.test(audit.auditedRevision) || !scopeSchema.test(audit.scope) || !audit.evidence.trim()) {
    throw new Error("Kit export requires a completed audit matching this schema and content. Follow crl-kit-update; a build must not advance the stamp.");
  }
}

const title = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
// Keep authored inline code intact; literal placeholders outside it must not become HTML tags.
const prose = (value: unknown) => String(value).replace(/(`+)([\s\S]*?)\1|<[^>\n]+>/g,
  (match, ticks) => ticks ? match : match.replace(/</g, "\\<").replace(/>/g, "\\>"));

/** Render every canonical field, including proof limits and the actual tested sources. */
function render(value: unknown, depth: number, language = "text"): string {
  if (value === null || typeof value !== "object") return `${prose(value)}\n\n`;
  if (Array.isArray(value)) return value.map((item, i) => {
    if (item === null || typeof item !== "object") return `- ${prose(item)}\n`;
    const record = item as Record<string, unknown>;
    const name = record.title ?? record.name ?? record.id ?? record.check ?? record.tier ?? `Item ${i + 1}`;
    return `${"#".repeat(Math.min(depth, 6))} ${prose(name)}\n\n${render(item, depth + 1, language)}`;
  }).join("\n") + "\n";
  const record = value as Record<string, unknown>;
  const sourceLanguage = typeof record.language === "string" ? record.language : language;
  return Object.entries(record).filter(([, item]) => item !== undefined).map(([key, item]) => {
    const heading = `${"#".repeat(Math.min(depth, 6))} ${title(key)}\n\n`;
    if ((key === "source" || key === "snippet") && typeof item === "string") {
      const longest = Math.max(2, ...(item.match(/`+/g) ?? []).map(run => run.length));
      const fence = "`".repeat(longest + 1);
      return `${heading}${fence}${sourceLanguage}\n${item}\n${fence}\n\n`;
    }
    return heading + render(item, depth + 1, sourceLanguage);
  }).join("");
}

export function exportAuthoringKit(kit: AuthoringKit): { json: string; markdown: string } {
  assertAuditedKit(kit);
  return {
    json: JSON.stringify(kit, null, 2) + "\n",
    markdown: renderAuthoringKitMarkdown(kit),
  };
}

/** Read-only retrieval preserves honest audit metadata, including stale stamps.
 * File delivery must use exportAuthoringKit, which enforces the audit gate. */
export function renderAuthoringKitMarkdown(kit: AuthoringKit): string {
  return "# CRL authoring kit\n\nGenerated from the canonical kit. The JSON companion preserves its machine-readable structure. " +
    "The audit identifies reviewed content; it does not certify later implementation changes or clinical fidelity.\n\n" + render(kit, 2);
}
