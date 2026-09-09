import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { getAuthoringKit } from "../index";
import * as kitSource from "../index";
import { assertAuditedKit, renderAuthoringKitMarkdown } from "../export";
import { queryAuthoringKit } from "../query";
import { buildKitIndex, kitEntryContent } from "../navigation";

const kit = getAuthoringKit();
const query = (input?: unknown): any => queryAuthoringKit(input);

describe("one authoring kit: discovery and complete guidance", () => {
  // @kit verify-loop:kit-markdown
  it("advertises and returns the same complete Markdown as the audited file export", () => {
    const args = query().exports.markdown;
    expect(args).toEqual({ view: "full", format: "markdown" });
    const result = query(args);
    expect(result).toMatchObject({ view: "full", complete: true, format: "markdown",
      contentHash: kit.contentHash, fullContentHash: kit.contentHash, audit: kit.audit });
    expect(result.markdown).toBe(renderAuthoringKitMarkdown(kit));
    expect(result.markdown).toMatch(/^# CRL authoring kit\n/);
  });

  it.each([{}, { view: "full" }, { view: "search", query: "dropdown" }, { view: "entry", id: "rule:named-answer-options" }])(
    "explicit JSON preserves the default response for %j", args => {
      expect(query({ ...args, format: "json" })).toEqual(query(args));
    });

  it.each([{ format: "markdown" }, { view: "overview", format: "markdown" },
    { view: "search", query: "dropdown", format: "markdown" },
    { view: "entry", id: "rule:named-answer-options", format: "markdown" },
    { view: "full", format: "html" }, { view: "full", format: null }])(
    "rejects unsupported format/view combinations %j", args => {
      expect(() => query(args)).toThrow(/format|Markdown requires/);
    });

  it("retains visible stale audit metadata in both Markdown and JSON retrieval", () => {
    const stale = { ...kit, audit: { ...kit.audit, contentMatchesAudit: false } };
    const spy = vi.spyOn(kitSource, "getAuthoringKit").mockReturnValue(stale);
    try {
      expect(query({ view: "full" }).audit.contentMatchesAudit).toBe(false);
      const markdown = query({ view: "full", format: "markdown" }).markdown;
      expect(markdown).toBe(renderAuthoringKitMarkdown(stale));
      expect(markdown).toMatch(/Content Matches Audit\n\nfalse/);
      expect(() => assertAuditedKit(stale)).toThrow(/completed audit/);
    } finally { spy.mockRestore(); }
  });

  it("defaults to a bounded introduction and untruncated, complete index", () => {
    const overview = query();
    expect(overview).toMatchObject({ view: "overview", complete: false, fullContentHash: kit.contentHash });
    expect(overview).not.toHaveProperty("contentHash");
    expect(overview).not.toHaveProperty("rules");
    expect(overview.index).toEqual(kit.navigation);
    expect(JSON.stringify(overview.introduction).length).toBeLessThan(7000);
    expect(JSON.stringify(overview).length).toBeLessThan(30000);
  });

  it("every content section and unit is reachable once; navigation cannot hide a new rule", () => {
    const ids = kit.navigation.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const key of Object.keys(kit).filter(k => !["contentHash", "navigation", "audit"].includes(k))) expect(ids).toContain(`section:${key}`);
    for (const rule of kit.rules) expect(ids).toContain(`rule:${rule.id}`);
    for (const example of kit.examples) expect(ids).toContain(`example:${example.id}`);
    for (const artifact of kit.referenceArtifacts) expect(ids).toContain(`artifact:${artifact.name}`);
    for (const entry of kit.navigation) {
      expect(kitEntryContent(kit, entry.id), entry.id).toBeDefined();
      for (const id of entry.requires) expect(ids, entry.id).toContain(id);
      const focused = query({ view: "entry", id: entry.id });
      if (entry.members) expect(focused.entries[0].content.memberIds).toEqual(entry.members);
      else expect(focused.entries[0].content).toEqual(kitEntryContent(kit, entry.id));
    }
    expect(buildKitIndex({ ...kit, rules: [...kit.rules, { id: "new-rule", category: "process", applicability: "All authoring", rule: "New rule" }] }).some(e => e.id === "rule:new-rule")).toBe(true);
  });

  // @kit verify-loop:kit-discovery
  it.each([
    ["dropdown with a none answer", "rule:named-answer-options"],
    ["coded answers", "rule:named-answer-options"],
    ["age today", "rule:patient-age-projection"],
    ["Scalar", "rule:concept-form"],
    ["sem-or", "rule:decision-composition"],
    ["question wording", "rule:concept-presentation"],
    ["PA without configuration", "rule:pa-disposition-set"],
    ["unknown", "rule:branch-guards"],
    ["pause", "rule:branch-guards"],
    ["missing answer", "rule:branch-guards"],
    ["explicit false", "rule:branch-guards"],
    ["completeness", "rule:concept-form"],
    ["narrative completeness", "rule:review-flags"],
  ])("%s discovers %s, not an isolated warning or old template", (text, id) => {
    const result = query({ view: "search", query: text });
    expect(result.results[0]).toMatchObject({ id, status: "current" });
    expect(result.complete).toBe(false);
    expect(result).not.toHaveProperty("contentHash");
    expect(result.results.length).toBeLessThanOrEqual(8);
    expect(result.results.every((e: any) => e.summary.length <= 240)).toBe(true);
  });

  it("no hits is explicit and counterexamples identify themselves", () => {
    expect(query({ view: "search", query: "zzzznotakitword" })).toMatchObject({ total: 0, results: [], truncated: false });
    const result = query({ view: "entry", id: "example:vacuity-trap" });
    expect(result.entries[0]).toMatchObject({ status: "counterexample", content: { valid: false } });
  });

  it("discovery exposes applicability before an agent selects guidance", () => {
    const overview = query();
    expect(overview.index.find((e: any) => e.id === "rule:pa-disposition-set").applicability)
      .toContain("before project configuration exists");
    const result = query({ view: "search", query: "authorization determination" });
    expect(result.results[0].applicability).toContain("authorization or coverage determinations");
    expect(overview.index.find((e: any) => e.id === "example:criterion-reuse").applicability)
      .toContain("authorization or coverage determinations");
  });

  it("one canonical entry can appear under several authoring topics", () => {
    const entry = kit.navigation.find(e => e.id === "rule:named-answer-options")!;
    expect(entry.topics).toEqual(["answers", "terminology"]);
    expect(kit.navigation.filter(e => e.id === entry.id)).toHaveLength(1);
    expect(kit.navigation.find(e => e.id === "artifact:named-answer-reference.crl")!.topics)
      .toEqual(entry.topics);
  });

  it("a mechanical counterexample is discoverable by its diagnostic identifier", () => {
    const example = kit.examples.find(e => e.expectRule)!;
    expect(query({ view: "search", query: example.expectRule }).results.some((e: any) => e.id === `example:${example.id}`)).toBe(true);
  });

  it.each(["rules", "examples", "referenceArtifacts"])("%s collection lists members without duplicating their content", section => {
    const result = query({ view: "entry", id: `section:${section}` });
    expect(result.entries).toHaveLength(1);
    const members = result.entries[0].content.memberIds;
    expect(members.length).toBe((kit as any)[section].length);
    expect(JSON.stringify(result).length).toBeLessThan(JSON.stringify(query({ view: "full" })).length / 2);
    for (const id of members) expect(query({ view: "entry", id }).entries[0].id).toBe(id);
  });

  it("a removed navigation owner fails visibly instead of silently dropping its aliases", () => {
    expect(() => buildKitIndex({ ...kit, rules: kit.rules.filter(r => r.id !== "guards") }))
      .toThrow('missing rule "guards"');
  });

  it("named-answer entry contains selected-answer semantics and the complete import/CEL/config closure", () => {
    const result = query({ view: "entry", id: "rule:named-answer-options" });
    const byId = new Map(result.entries.map((e: any) => [e.id, e.content]));
    for (const id of ["rule:publication-selection", "rule:concept-form", "rule:terminology-forms", "rule:concept-presentation",
      "artifact:named-answer-reference.crl", "artifact:named-answer-reference.cel", "artifact:named-answer-terms.crl"]) expect(byId.has(id), id).toBe(true);
    const artifact: any = byId.get("artifact:named-answer-reference.crl");
    expect(artifact.requires.crl).toMatchObject({ canonicalBase: "https://example.org/answers", date: "2026-01-01T00:00:00.000Z" });
    expect(artifact.source).toBe(kit.referenceArtifacts.find(a => a.name === "named-answer-reference.crl")!.source);
  });

  it("determination guidance applies before configuration exists and carries all completion checks", () => {
    const result = query({ view: "entry", id: "rule:pa-disposition-set" });
    expect(result.entries[0].content.applicability).toContain("before project configuration exists");
    for (const id of ["rule:configure-dispositions", "rule:disposition-mode", "rule:dispositions", "section:dispositionModel"]) expect(result.entries.some((e: any) => e.id === id)).toBe(true);
    const config = result.entries.find((e: any) => e.id === "rule:configure-dispositions");
    expect(JSON.stringify(config.content)).toMatch(/empty-vocabulary/);
    for (const id of ["communicated-not-ordered", "configured-membership", "finality-by-mode", "mutual-exclusivity-spans-closure"]) expect(result.context.verifyLoop.methodologyRequirements.some((m: any) => m.id === id)).toBe(true);
  });

  it.each([
    ["artifact:named-answer-reference.crl", ["rule:named-answer-options", "rule:publication-selection"]],
    ["artifact:patient-age-both-rep-reference.crl", ["rule:patient-age-projection", "rule:publication-selection"]],
    ["artifact:source-delegated-decision-reference.crl", ["rule:chaining-necessity", "rule:configure-dispositions", "rule:pa-disposition-set"]],
    ["artifact:disposition-arbitration-reference.cel", ["rule:decision-composition", "rule:disposition-mode"]],
    ["example:quantity-answer", ["rule:cel-cases", "rule:cel-quantity"]],
    ["example:vacuity-trap", ["rule:decision-composition"]],
    ["example:criterion-reuse", ["rule:criterion", "rule:configure-dispositions", "rule:disposition-mode"]],
    ["example:menu-less-guard", ["rule:branch-guards", "rule:decision-composition"]],
    ["rule:branch-guards", ["rule:publication-selection", "rule:cel-cases"]],
    ["section:conceptLayerModel", ["rule:concept-form", "rule:value-type", "rule:publication-selection"]],
    ["section:dispositionModel", ["rule:configure-dispositions", "rule:pa-disposition-set"]],
  ])("direct %s retrieval includes its semantic prerequisites", (id, required) => {
    const result = query({ view: "entry", id });
    for (const dependency of required) expect(result.entries.some((e: any) => e.id === dependency), dependency).toBe(true);
  });

  it("every shipped artifact and excerpt has reviewed owning-rule links", () => {
    for (const e of kit.navigation.filter(e => /^(artifact|example):/.test(e.id)))
      expect(e.requires.some(id => id.startsWith("rule:")), e.id).toBe(true);
  });

  it("every excerpt using configured disposition names carries the configuration contract", () => {
    const examples = kit.examples.filter(e => /(?:certify|not-certify|pended)\./.test(e.snippet));
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) {
      const result = query({ view: "entry", id: `example:${example.id}` });
      for (const id of ["rule:configure-dispositions", "rule:disposition-mode"])
        expect(result.entries.some((e: any) => e.id === id), example.id).toBe(true);
    }
  });

  it("every focused invariant anchor resolves in the delivered context, with force and proof definitions", () => {
    for (const rule of kit.rules) {
      const result = query({ view: "entry", id: `rule:${rule.id}` });
      expect(result.context.forceModel).toEqual(kit.forceModel);
      expect(result.context.verificationLegend).toEqual(kit.verificationLegend);
      for (const clause of rule.clauses ?? []) {
        if (clause.force !== "invariant") continue;
        const [kind, name] = clause.test!.split(":");
        if (kind === "verifyLoop") expect(result.context.verifyLoop.methodologyRequirements.some((m: any) => m.id === name)).toBe(true);
        else expect(result.context.judgeLens.composition.some((c: any) => c.check === name)).toBe(true);
      }
    }
  });

  it.each([{ view: "bad" }, { view: null }, { stage: "local-decision-support" }, { useCase: "prior-auth" }, { view: "full", query: "x" }, { view: "search" }, { view: "entry" }, { id: "x" }, null, []])("rejects invalid or obsolete calls %j", input => {
    expect(() => query(input)).toThrow(/one kit|requires|Only/);
  });
  it("unknown IDs fail without falling back to unrelated guidance", () => {
    expect(() => query({ view: "entry", id: "rule:unknown" })).toThrow(/Unknown kit entry/);
  });

  it("content identity includes navigation but excludes audit metadata; only full is complete", () => {
    const { contentHash, audit, ...content } = kit;
    const hash = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
    expect(hash(content)).toBe(contentHash);
    expect(hash({ ...content, navigation: content.navigation.slice(1) })).not.toBe(contentHash);
    const full = query({ view: "full" });
    expect(full).toMatchObject({ contentHash, fullContentHash: contentHash, complete: true });
    expect(full.audit).toEqual(audit);
    expect(audit.auditedRevision).toMatch(/^[0-9a-f]{40}$/);
    expect(audit.contentMatchesAudit).toBe(audit.auditedContentHash === contentHash && audit.auditedSchemaVersion === kit.schemaVersion);
    // There is deliberately no runtime Git/current-repository audit assertion:
    // an implementation-only commit can change behavior without changing kit bytes.
    expect(audit).not.toHaveProperty("currentRevision");
    expect(audit).not.toHaveProperty("repositoryAudited");
  });
});
