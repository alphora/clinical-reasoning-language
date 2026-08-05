import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { collectIdViolations, scanFhirIds, FHIR_ID_MAX_LEN } from "../checkIds";

/**
 * #237/T3 — the FHIR id conformance checker. Emit-time (#237/T1) keeps NEW ids
 * conformant; this finds resources already committed with an invalid id.
 */

describe("collectIdViolations (pure)", () => {
  const good = "a".repeat(FHIR_ID_MAX_LEN); // exactly 64 — conformant
  const tooLong = "a".repeat(FHIR_ID_MAX_LEN + 1); // 65 — too-long

  it("passes a conformant top-level id (64 chars, on-charset)", () => {
    const { violations, resourceCount } = collectIdViolations(
      { resourceType: "Library", id: good },
      "f.json",
    );
    expect(violations).toEqual([]);
    expect(resourceCount).toBe(1);
  });

  it("flags a > 64 id as too-long", () => {
    const { violations } = collectIdViolations({ resourceType: "Library", id: tooLong }, "f.json");
    expect(violations).toHaveLength(1);
    expect(violations[0].reasons).toEqual(["too-long"]);
    expect(violations[0].idLength).toBe(65);
    expect(violations[0].location).toBe("root");
  });

  it("flags an off-charset id as invalid-char", () => {
    const { violations } = collectIdViolations(
      { resourceType: "Observation", id: "has_underscore" },
      "f.json",
    );
    expect(violations[0].reasons).toEqual(["invalid-char"]);
  });

  it("flags a both-too-long-and-off-charset id with both reasons", () => {
    const { violations } = collectIdViolations(
      { resourceType: "Observation", id: "_".repeat(70) },
      "f.json",
    );
    expect(violations[0].reasons).toEqual(["too-long", "invalid-char"]);
  });

  it("an ABSENT id is not a violation; an empty-string id is", () => {
    expect(collectIdViolations({ resourceType: "Patient" }, "f.json").violations).toEqual([]);
    const empty = collectIdViolations({ resourceType: "Patient", id: "" }, "f.json").violations;
    expect(empty[0].reasons).toEqual(["empty"]);
  });

  it("a PRESENT non-string id (number/null/object) is flagged non-string", () => {
    for (const bad of [123, null, { x: 1 }, true]) {
      const v = collectIdViolations({ resourceType: "Patient", id: bad }, "f.json").violations;
      expect(v).toHaveLength(1);
      expect(v[0].reasons).toEqual(["non-string"]);
    }
  });

  it("accumulates the location path through nested Bundles (no reset/collision)", () => {
    const nested = {
      resourceType: "Bundle",
      id: "outer",
      entry: [
        {
          resource: {
            resourceType: "Bundle",
            id: "inner",
            entry: [{ resource: { resourceType: "Library", id: "a".repeat(70) } }],
          },
        },
      ],
    };
    const { violations } = collectIdViolations(nested, "b.json");
    expect(violations).toHaveLength(1);
    expect(violations[0].location).toBe("entry[0].resource.entry[0].resource");
  });

  it("descends into Bundle.entry[].resource ids and locates them", () => {
    const bundle = {
      resourceType: "Bundle",
      id: "ok",
      entry: [
        { resource: { resourceType: "Library", id: tooLong } },
        { resource: { resourceType: "Patient", id: "fine" } },
      ],
    };
    const { violations, resourceCount } = collectIdViolations(bundle, "b.json");
    expect(resourceCount).toBe(3); // Bundle + 2 entries
    expect(violations).toHaveLength(1);
    expect(violations[0].location).toBe("entry[0].resource");
    expect(violations[0].resourceType).toBe("Library");
  });

  it("ignores a non-FHIR JSON value (no resourceType)", () => {
    const { violations, resourceCount } = collectIdViolations({ foo: "bar", id: "x".repeat(80) }, "f.json");
    expect(violations).toEqual([]);
    expect(resourceCount).toBe(0);
  });
});

describe("scanFhirIds (fs)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "checkids-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("recurses, skips node_modules/.git/dist, reports violations, and passes when clean", () => {
    writeFileSync(join(dir, "ok.json"), JSON.stringify({ resourceType: "Library", id: "fine" }));
    mkdirSync(join(dir, "sub"), { recursive: true });
    writeFileSync(
      join(dir, "sub", "bad.json"),
      JSON.stringify({ resourceType: "Library", id: "a".repeat(80) }),
    );
    // Must be skipped:
    mkdirSync(join(dir, "node_modules"), { recursive: true });
    writeFileSync(
      join(dir, "node_modules", "dep.json"),
      JSON.stringify({ resourceType: "Library", id: "z".repeat(80) }),
    );

    const report = scanFhirIds(dir);
    expect(report.pass).toBe(false);
    expect(report.filesChecked).toBe(2); // ok.json + sub/bad.json, NOT node_modules
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].file).toBe(join(dir, "sub", "bad.json"));
  });

  it("a clean, fully-scanned tree is pass AND complete", () => {
    writeFileSync(join(dir, "a.json"), JSON.stringify({ resourceType: "Library", id: "ok" }));
    const report = scanFhirIds(dir);
    expect(report.pass).toBe(true);
    expect(report.complete).toBe(true);
  });

  it("a JSON parse failure is a non-fatal readError (pass stays true) but flips complete to false", () => {
    writeFileSync(join(dir, "broken.json"), "{ not valid json");
    writeFileSync(join(dir, "ok.json"), JSON.stringify({ resourceType: "Patient", id: "p1" }));
    const report = scanFhirIds(dir);
    expect(report.pass).toBe(true); // a parse error is not a VIOLATION
    expect(report.complete).toBe(false); // ...but the scan did not fully certify
    expect(report.violations).toEqual([]);
    expect(report.readErrors).toHaveLength(1);
    expect(report.readErrors[0].file).toBe(join(dir, "broken.json"));
  });

  it("truncation (file cap) flips complete to false and surfaces `truncated`", () => {
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(dir, `r${i}.json`), JSON.stringify({ resourceType: "Library", id: "ok" }));
    }
    const report = scanFhirIds(dir, { fileCap: 2 });
    expect(report.complete).toBe(false);
    expect(report.truncated?.cap).toBe(2);
  });

  it("accepts a single .json file as the root", () => {
    const file = join(dir, "one.json");
    writeFileSync(file, JSON.stringify({ resourceType: "Library", id: "b".repeat(65) }));
    const report = scanFhirIds(file);
    expect(report.filesChecked).toBe(1);
    expect(report.violations).toHaveLength(1);
  });

  it("throws on a single-file root that is not .json (a caller error, not an empty pass)", () => {
    const file = join(dir, "bundle.ndjson");
    writeFileSync(file, "{}");
    expect(() => scanFhirIds(file)).toThrow(/\.json/);
  });
});
