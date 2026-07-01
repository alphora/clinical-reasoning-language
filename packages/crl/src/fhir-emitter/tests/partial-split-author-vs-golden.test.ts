import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import * as path from "path";

import { describe, expect, it } from "@jest/globals";

import { emitFhirDefFromPath } from "../closureOrchestrator";

/**
 * D4 (slice-4c review verification gap) — PARTIAL-split AUTHOR-ValueSet routing.
 *
 * `code-is-decision` (the existing partial-split golden) has ONLY local `code is`
 * → a CodeSystem, no external `coded from <valueset>`. So it never pinned that an
 * AUTHOR ValueSet's canonical follows the relocated terminology into the
 * `<source> Concepts` Library (rather than the Root).
 *
 * `code-is-decision-vs` adds exactly that: a DECISION-bearing library (forces the
 * PARTIAL split) carrying BOTH a `code is` concept (→ CodeSystem) AND a concept
 * `coded from "GI Referral Reasons"` where that terminology is an author
 * ValueSet (`valueset is <url>`). D4 pins:
 *   - the Concepts Library depends-on BOTH the author ValueSet canonical AND the
 *     local CodeSystem (the terminology relocated into Concepts), and
 *   - the Root depends-on ONLY the Concepts Library — NEITHER the ValueSet nor
 *     the CodeSystem leaks onto the Root.
 *
 * FOLLOW-UP (gpt55 dynamicValue concern): this fixture's ActivityDefinition does
 * NOT reference the author terminology, so the general "an activity/`with` that
 * references a Concepts-relocated terminology must reach it" case is NOT solved
 * here. D4 pins ONLY the Library depends-on routing. The broader activity →
 * Concepts-terminology routing is left for a separate slice.
 *
 * Regenerate after an INTENTIONAL emit change:
 *   UPDATE_GOLDEN=1 npx jest src/fhir-emitter/tests/partial-split-author-vs-golden.test.ts
 */

const HERE = __dirname;
const FIXTURE = path.join(HERE, "fixtures", "code-is-decision-vs", "code-is-decision-vs.crl");
const GOLDEN_DIR = path.join(HERE, "golden", "code-is-decision-vs");
const UPDATE = process.env.UPDATE_GOLDEN === "1";

const FIXED_DATE = new Date("2020-01-01T00:00:00.000Z");
const ser = (body: unknown): string => JSON.stringify(body, null, 2) + "\n";

// R1 — ids derive from the fixture POLICY ID ("code-is-decision-vs-fixture"),
// not the library-name slug ("code-is-decision-vs").
const VS_CANONICAL =
  "http://example.org/crl/code-is-decision-vs/ValueSet/code-is-decision-vs-fixture-gi-referral-reasons";
const CS_CANONICAL =
  "http://example.org/crl/code-is-decision-vs/CodeSystem/code-is-decision-vs-fixture-local";
// #186 — Library canonicals are keyed on the unified hyphen-free `S`
// (id == url-tail == name), NOT the lowercase layer-token suffix.
const LOCALCONCEPTS_CANONICAL =
  "http://example.org/crl/code-is-decision-vs/Library/CodeIsDecisionVsFixtureLocalConcepts";
const RECORDCONCEPTS_CANONICAL =
  "http://example.org/crl/code-is-decision-vs/Library/CodeIsDecisionVsFixtureRecordConcepts";

function listGolden(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const acc: string[] = [];
  const walk = (d: string, prefix: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), rel);
      else if (e.name.endsWith(".json")) acc.push(rel);
    }
  };
  walk(dir, "");
  return acc.sort();
}

describe("CRL → FHIR partial-split AUTHOR-VS golden (code-is-decision-vs)", () => {
  const result = emitFhirDefFromPath(FIXTURE, { date: FIXED_DATE });

  it("emits with no errors and no unmatched", () => {
    expect(result.errors).toEqual([]);
    expect(result.unmatched).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("the relocated terminology routes by SOURCE FAMILY: local CodeSystem → LocalConcepts, author ValueSet → RecordConcepts", () => {
    // R2 — the source-typed split fans the relocated terminology into TWO concept
    // layers by family: the synthetic local CodeSystem (from `code is`) lives in
    // `LocalConcepts`; the hand-authored author ValueSet (from `coded from`) lives
    // in `RecordConcepts`. NEITHER leaks onto the consuming source layers or the
    // Interface re-export.
    // #187 — exclude the always-emitted shared catalog Libraries
    // (CRLCommon/CaseFeatureCommon); this asserts the POLICY layer Libraries.
    const CATALOG_LIB_IDS = new Set(["CRLCommon", "CaseFeatureCommon"]);
    const libs = result.resources.filter(
      (r) => r.resourceType === "Library" && !CATALOG_LIB_IDS.has(r.resource.id as string),
    );
    // 5 layer Libraries: LocalConcepts, RecordConcepts, LocalSource, RecordSource,
    // Interface (no Inferred — this fixture has no `defined as`).
    expect(libs).toHaveLength(5);
    const byId = new Map(
      libs.map((l) => [l.resource.id as string, l.resource as Record<string, unknown>]),
    );
    const localConcepts = byId.get("CodeIsDecisionVsFixtureLocalConcepts")!;
    const recordConcepts = byId.get("CodeIsDecisionVsFixtureRecordConcepts")!;
    const localSource = byId.get("CodeIsDecisionVsFixtureLocalSource")!;
    const recordSource = byId.get("CodeIsDecisionVsFixtureRecordSource")!;
    expect(localConcepts).toBeDefined();
    expect(recordConcepts).toBeDefined();

    const depsOf = (r: Record<string, unknown>): string[] =>
      ((r.relatedArtifact as Array<{ type?: string; resource?: string }>) ?? [])
        .filter((e) => e.type === "depends-on")
        .map((e) => e.resource as string);

    // LocalConcepts owns the local CodeSystem (only) — NOT the author ValueSet.
    expect(depsOf(localConcepts)).toEqual([CS_CANONICAL]);
    // RecordConcepts owns the author ValueSet (only) — NOT the local CodeSystem.
    expect(depsOf(recordConcepts)).toEqual([VS_CANONICAL]);

    // The source layers depend-on their OWN-family concepts sibling; the terminology
    // resources do NOT leak onto them.
    expect(depsOf(localSource)).toEqual([LOCALCONCEPTS_CANONICAL]);
    expect(depsOf(recordSource)).toEqual([RECORDCONCEPTS_CANONICAL]);
    for (const layer of [localSource, recordSource]) {
      expect(depsOf(layer)).not.toContain(VS_CANONICAL);
      expect(depsOf(layer)).not.toContain(CS_CANONICAL);
    }
  });

  it("emits exactly one author ValueSet for the relocated terminology", () => {
    const vs = result.resources.filter((r) => r.resourceType === "ValueSet");
    expect(vs).toHaveLength(1);
    expect((vs[0]!.resource as { url?: string }).url).toBe(VS_CANONICAL);
  });

  // ── Byte-for-byte golden ──
  const files = new Map<string, string>();
  for (const res of result.resources) files.set(res.relativePath, ser(res.resource));

  if (UPDATE) {
    it("regenerates the code-is-decision-vs golden", () => {
      for (const [rel, content] of files) {
        const file = path.join(GOLDEN_DIR, rel);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, content);
      }
      expect(files.size).toBeGreaterThan(0);
    });
  } else {
    for (const [rel, content] of files) {
      it(`matches golden ${rel}`, () => {
        const file = path.join(GOLDEN_DIR, rel);
        if (!existsSync(file)) {
          throw new Error(`Missing golden ${rel} — run UPDATE_GOLDEN=1 to create.`);
        }
        expect(content).toBe(readFileSync(file, "utf-8"));
      });
    }

    it("golden file set matches the emitted set", () => {
      expect(listGolden(GOLDEN_DIR)).toEqual([...files.keys()].sort());
    });
  }
});
