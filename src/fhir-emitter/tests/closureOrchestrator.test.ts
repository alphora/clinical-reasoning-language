import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "@jest/globals";

import { emitFhirDefClosure, emitFhirDefFromPath } from "../closureOrchestrator";
import type { CpgMetadata } from "../types";

const ROOT = join(__dirname, "..", "..", "..");
const FIXED_CLOCK = () => new Date("2026-06-05T15:30:00.000Z");

const METADATA: CpgMetadata = {
  version: "1.0.0",
  name: "cc-screening-cognitive-support",
  title: "CC Screening",
  description: "Round-trip fixture",
  publisher: "Smile Digital Health",
  contact: [],
  canonicalBase: "http://example.org/sdh/demo",
  status: "draft",
  experimental: true,
  jurisdiction: [],
  useContext: [],
};

const FIXTURE = join(ROOT, "src/tests/fixtures/cpg-roundtrip/cc-screening-cognitive-support/cc-screening.crl");

describe("closureOrchestrator — emitFhirDefFromPath (cc-screening end-to-end)", () => {
  it("emits the expected resource set for the cc-screening fixture", () => {
    const result = emitFhirDefFromPath(FIXTURE, { clock: FIXED_CLOCK });

    // Resource counts
    const byType = new Map<string, number>();
    for (const r of result.resources) {
      byType.set(r.resourceType, (byType.get(r.resourceType) ?? 0) + 1);
    }

    // 4 activities → 4 ActivityDef + 4 Recommendation PlanDef
    expect(byType.get("ActivityDefinition")).toBe(4);
    // 2 decisions: 1 Strategy + 1 Sub-decision
    // Plus 4 Recommendation PlanDefs (1 per activity)
    expect(byType.get("PlanDefinition")).toBe(2 + 4);
    expect(byType.get("Library")).toBe(1);
    // 1 terminology = 1 ValueSet (after the v3.2 fixture extension)
    expect(byType.get("ValueSet")).toBe(1);
  });

  it("emits Library.content[0].attachment.url = `../../cql/<name>.cql` per plan v3.2 layout", () => {
    const result = emitFhirDefFromPath(FIXTURE, { clock: FIXED_CLOCK });
    const lib = result.resources.find((r) => r.resourceType === "Library");
    expect(lib).toBeDefined();
    const content = (lib!.resource as { content?: Array<{ url?: string }> }).content;
    expect(content?.[0]?.url).toBe(
      "../../cql/CRC Recommendation.cql",
    );
  });

  it("populates sourceKind + sourceName on every emitted resource (attribution for Inv 1)", () => {
    const result = emitFhirDefFromPath(FIXTURE, { clock: FIXED_CLOCK });
    for (const r of result.resources) {
      expect(r.sourceKind).toBeDefined();
      expect(r.sourceName).toBeDefined();
    }
  });

  it("every emitted resource carries `version` from package.json (CRMI shareable floor)", () => {
    const result = emitFhirDefFromPath(FIXTURE, { clock: FIXED_CLOCK });
    for (const r of result.resources) {
      expect((r.resource as Record<string, unknown>).version).toBe("0.0.0");
    }
  });

  it("Library.relatedArtifact[depends-on] includes the ValueSet canonical URL (Inv 2(b) coverage)", () => {
    const result = emitFhirDefFromPath(FIXTURE, { clock: FIXED_CLOCK });
    const lib = result.resources.find((r) => r.resourceType === "Library");
    const ra = (lib!.resource as { relatedArtifact?: Array<{ type?: string; resource?: string }> }).relatedArtifact;
    const dependsOnUrls = ra!.filter((e) => e.type === "depends-on").map((e) => e.resource);
    // The Coverage Concern VS canonical URL should be there
    expect(
      dependsOnUrls.some((u) => typeof u === "string" && u.includes("ValueSet/")),
    ).toBe(true);
  });

  it("every PlanDef.action.definitionCanonical resolves to an emitted resource (Inv 3)", () => {
    const result = emitFhirDefFromPath(FIXTURE, { clock: FIXED_CLOCK });
    const emittedUrls = new Set(
      result.resources
        .map((r) => (r.resource as { url?: string }).url)
        .filter((u): u is string => typeof u === "string"),
    );

    function collectCanonicals(actions: Array<Record<string, unknown>>): string[] {
      const out: string[] = [];
      for (const a of actions) {
        if (typeof a.definitionCanonical === "string") out.push(a.definitionCanonical);
        if (Array.isArray(a.action)) {
          out.push(...collectCanonicals(a.action as Array<Record<string, unknown>>));
        }
      }
      return out;
    }

    let totalRefs = 0;
    for (const r of result.resources) {
      if (r.resourceType !== "PlanDefinition") continue;
      const actions = (r.resource as { action?: Array<Record<string, unknown>> }).action;
      if (!Array.isArray(actions)) continue;
      const refs = collectCanonicals(actions);
      totalRefs += refs.length;
      for (const ref of refs) {
        expect(emittedUrls.has(ref)).toBe(true);
      }
    }
    expect(totalRefs).toBeGreaterThan(0);
  });

  it("success = true on clean cc-screening emit (no errors, no unmatched)", () => {
    const result = emitFhirDefFromPath(FIXTURE, { clock: FIXED_CLOCK });
    expect(result.errors).toEqual([]);
    // The cc-screening corpus has no free-text `with` (only terminology refs)
    // after the v3.2 fixture extension; unmatched should be empty.
    expect(result.unmatched).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("cc-screening fixture has exactly 10 concepts (regression guard against duplicate-name reintroduction)", () => {
    // Body-only swap of "Has Coverage Concern" must keep concept count at 10.
    const src = readFileSync(FIXTURE, "utf-8");
    // Match top-level `concept "Name":` declarations (not inside nested CRL structures)
    const conceptDecls = src.match(/^concept\s+"[^"]+"\s*:/gm) ?? [];
    expect(conceptDecls.length).toBe(10);
  });
});

describe("closureOrchestrator — direct API (emitFhirDefClosure)", () => {
  it("returns 0-resources gracefully when the closure is empty", () => {
    // Synthesize an empty ResolvedGraph
    const result = emitFhirDefClosure(
      {
        rootPath: "/tmp/empty",
        resolvedLibraries: [],
        localLibraries: [],
        namespace: { byPath: new Map(), byLibraryName: new Map() },
        diagnostics: [],
      },
      METADATA,
      { clock: FIXED_CLOCK },
    );
    expect(result.resources).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});
