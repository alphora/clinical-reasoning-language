import { describe, expect, it } from "vitest";
import { getAuthoringKit } from "../index";
import { assertAuditedKit, exportAuthoringKit } from "../export";

const kit = getAuthoringKit();
// Fixture represents the post-review metadata operation; never writes the real stamp.
const reviewed = { ...kit, audit: { ...kit.audit, auditedSchemaVersion: kit.schemaVersion,
  auditedContentHash: kit.contentHash, contentMatchesAudit: true, scope: `Schema ${kit.schemaVersion} export fixture` } };

describe("authoring kit export delivery", () => {
  it("rejects stale or corrupt content even if the audit flag claims success", () => {
    expect(() => assertAuditedKit({ ...reviewed, audit: { ...reviewed.audit, auditedContentHash: "0".repeat(64) } })).toThrow(/completed audit/);
    expect(() => assertAuditedKit({ ...reviewed, audit: { ...reviewed.audit, auditedSchemaVersion: "stale" } })).toThrow(/completed audit/);
    expect(() => assertAuditedKit({ ...reviewed, summary: "Unreviewed changed guidance" })).toThrow(/completed audit/);
    expect(() => assertAuditedKit({ ...reviewed, audit: { ...reviewed.audit, scope: "Full historical 1.38 prior-auth payload" } })).toThrow(/completed audit/);
    expect(() => assertAuditedKit({ ...reviewed, audit: { ...reviewed.audit, scope: `Schema ${kit.schemaVersion}0` } })).toThrow(/completed audit/);
  });

  it("exports the entire canonical structure and preserves every tested source verbatim", () => {
    const output = exportAuthoringKit(reviewed);
    expect(JSON.parse(output.json)).toEqual(reviewed);
    for (const artifact of reviewed.referenceArtifacts) expect(output.markdown).toContain(artifact.source);
    for (const example of reviewed.examples) expect(output.markdown).toContain(example.snippet);
    for (const rule of reviewed.rules) expect(output.markdown).toContain(rule.id);
    for (const tier of reviewed.verificationLegend) expect(output.markdown).toContain(tier.doesNotProve);
    expect(output.markdown).toContain(reviewed.audit.auditedRevision);
    expect(output.markdown).toContain(reviewed.contentHash);
    expect(output.markdown).not.toMatch(/^undefined$/m);
    const leaves = (value: unknown): string[] => typeof value === "string" ? [value]
      : value && typeof value === "object" ? Object.values(value).flatMap(leaves) : [];
    const unescaped = output.markdown.replace(/\\([<>])/g, "$1");
    for (const leaf of leaves(reviewed)) expect(unescaped).toContain(leaf);
  });

  it("rendered prose retains literal syntax placeholders, including with HTML enabled", () => {
    const MarkdownIt = require("markdown-it");
    const renderer = new MarkdownIt({ html: true });
    const rule = reviewed.rules.find(r => r.id === "criterion")!;
    // Known-bad control: the unescaped old output turns this placeholder into an HTML tag.
    expect(renderer.render(rule.rule)).toContain("<condition>");
    const html = renderer.render(exportAuthoringKit(reviewed).markdown);
    for (const placeholder of ["condition", "comparison", "threshold", "home", "code"])
      expect(html).toContain(`&lt;${placeholder}&gt;`);
    expect(html).not.toContain("<condition>");
    expect(html).toContain("<code>&lt;code&gt;</code>");
  });
});
