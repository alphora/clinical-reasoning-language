import * as path from "path";

import { describe, expect, it } from "@jest/globals";

import { emitFhirDefFromPath } from "../closureOrchestrator";
import { resolveEmitClock } from "../reproDate";
import type { CpgMetadata } from "../types";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const md = (crlDate?: string): CpgMetadata => ({ crlDate }) as unknown as CpgMetadata;
const env = (o: Record<string, string> = {}): NodeJS.ProcessEnv => o as NodeJS.ProcessEnv;

describe("resolveEmitClock — reproducible date precedence", () => {
  it("opts.date wins over env and crl.date", () => {
    const { clock, errors } = resolveEmitClock(
      { date: "2021-02-03T00:00:00.000Z" },
      md("2030-01-01T00:00:00.000Z"),
      env({ SOURCE_DATE_EPOCH: "1700000000" }),
    );
    expect(errors).toEqual([]);
    expect(clock().toISOString()).toBe("2021-02-03T00:00:00.000Z");
  });

  it("SOURCE_DATE_EPOCH (seconds) used when no opts.date", () => {
    const { clock, errors } = resolveEmitClock(
      {},
      md("2030-01-01T00:00:00.000Z"),
      env({ SOURCE_DATE_EPOCH: "1000000000" }),
    );
    expect(errors).toEqual([]);
    expect(clock().toISOString()).toBe(new Date(1_000_000_000 * 1000).toISOString());
  });

  it("crl.date used when no opts.date / env", () => {
    const { clock, errors } = resolveEmitClock({}, md("2024-06-15T00:00:00.000Z"), env());
    expect(errors).toEqual([]);
    expect(clock().toISOString()).toBe("2024-06-15T00:00:00.000Z");
  });

  it("invalid opts.date → invalid-emit-date hard error", () => {
    const { errors } = resolveEmitClock({ date: "not-a-date" }, md(), env());
    expect(errors.some((e) => e.kind === "invalid-emit-date")).toBe(true);
  });

  it("rejects non-integer / negative / millisecond-shaped SOURCE_DATE_EPOCH", () => {
    // capability shareable so a missing publishable date doesn't add noise.
    for (const bad of ["abc", "1600000000.5", "-5", "1700000000000"]) {
      const { errors } = resolveEmitClock(
        { capability: "shareable" },
        md(),
        env({ SOURCE_DATE_EPOCH: bad }),
      );
      expect(errors.some((e) => e.kind === "invalid-source-date-epoch")).toBe(true);
    }
  });

  it("blank SOURCE_DATE_EPOCH is ignored (treated as unset)", () => {
    const { errors } = resolveEmitClock(
      { capability: "shareable" },
      md(),
      env({ SOURCE_DATE_EPOCH: "  " }),
    );
    expect(errors).toEqual([]);
  });

  it("opts.clock is the test seam when nothing else set", () => {
    const fixed = new Date("2019-01-01T00:00:00.000Z");
    const { clock, errors } = resolveEmitClock({ clock: () => fixed }, md(), env());
    expect(errors).toEqual([]);
    expect(clock().toISOString()).toBe("2019-01-01T00:00:00.000Z");
  });

  it("publishable + no resolvable date → missing-publishable-date (reproducibility not opt-in)", () => {
    const { errors } = resolveEmitClock({ capability: "publishable" }, md(), env());
    expect(errors.some((e) => e.kind === "missing-publishable-date")).toBe(true);
  });

  it("shareable + no resolvable date → no error (date not required below publishable)", () => {
    const { errors } = resolveEmitClock({ capability: "shareable" }, md(), env());
    expect(errors).toEqual([]);
  });
});

describe("capability gate — version always, date only at publishable+", () => {
  const STRATEGY = path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms22-split/cms22-strategy.crl");
  const FIXED = new Date("2020-01-01T00:00:00.000Z");

  it("publishable (default): version present, date present, publishable profile + 3 knowledgeCapability codes", () => {
    const r = emitFhirDefFromPath(STRATEGY, { date: FIXED, capability: "publishable" });
    expect(r.errors.length).toBe(0);
    const pd = r.resources.find((x) => x.relativePath.startsWith("PlanDefinition/"))!
      .resource as Record<string, unknown>;
    expect(pd.version).toBe("1.0.0");
    expect(pd.date).toBe("2020-01-01T00:00:00.000Z");
    expect(
      (pd.meta as { profile: string[] }).profile.some((p) =>
        p.endsWith("crmi-publishableplandefinition"),
      ),
    ).toBe(true);
    const caps = (pd.extension as { valueCode?: string }[])
      .filter(
        (e) =>
          e.valueCode &&
          ["shareable", "computable", "publishable", "executable"].includes(e.valueCode),
      )
      .map((e) => e.valueCode);
    expect(caps).toEqual(["shareable", "computable", "publishable"]);
  });

  it("shareable: version present, NO date, shareable profile + only the shareable knowledgeCapability code", () => {
    const r = emitFhirDefFromPath(STRATEGY, { date: FIXED, capability: "shareable" });
    expect(r.errors.length).toBe(0);
    for (const res of r.resources) {
      const body = res.resource as Record<string, unknown>;
      expect(body.version).toBe("1.0.0");
      expect(body.date).toBeUndefined();
    }
    const pd = r.resources.find((x) => x.relativePath.startsWith("PlanDefinition/"))!
      .resource as Record<string, unknown>;
    expect(
      (pd.meta as { profile: string[] }).profile.some((p) =>
        p.endsWith("crmi-shareableplandefinition"),
      ),
    ).toBe(true);
    expect(
      (pd.meta as { profile: string[] }).profile.some((p) =>
        p.endsWith("crmi-publishableplandefinition"),
      ),
    ).toBe(false);
    const caps = (pd.extension as { valueCode?: string }[])
      .filter(
        (e) =>
          e.valueCode &&
          ["shareable", "computable", "publishable", "executable"].includes(e.valueCode),
      )
      .map((e) => e.valueCode);
    expect(caps).toEqual(["shareable"]);
  });
});

describe("capability profile matrix — additive CRMI lifecycle profiles per resource", () => {
  const STRATEGY = path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms22-split/cms22-strategy.crl");
  const FIXED = new Date("2020-01-01T00:00:00.000Z");
  const C = "http://hl7.org/fhir/uv/crmi/StructureDefinition";

  const crmiProfilesOf = (
    resources: { relativePath: string; resource: Record<string, unknown> }[],
    prefix: string,
  ): string[] => {
    const r = resources.find((x) => x.relativePath.startsWith(prefix));
    if (!r) throw new Error(`no emitted ${prefix} resource`);
    return ((r.resource as { meta?: { profile?: string[] } }).meta?.profile ?? []).filter((p) =>
      p.includes("/crmi-"),
    );
  };
  const emitAt = (capability: "shareable" | "computable" | "publishable" | "executable") => {
    const r = emitFhirDefFromPath(STRATEGY, { date: FIXED, capability });
    expect(r.errors.length).toBe(0);
    return r.resources as { relativePath: string; resource: Record<string, unknown> }[];
  };

  it("ValueSet accumulates shareable→computable→publishable (no executable profile exists)", () => {
    expect(crmiProfilesOf(emitAt("shareable"), "ValueSet/")).toEqual([
      `${C}/crmi-shareablevalueset`,
    ]);
    expect(crmiProfilesOf(emitAt("computable"), "ValueSet/")).toEqual([
      `${C}/crmi-shareablevalueset`,
      `${C}/crmi-computablevalueset`,
    ]);
    expect(crmiProfilesOf(emitAt("executable"), "ValueSet/")).toEqual([
      `${C}/crmi-shareablevalueset`,
      `${C}/crmi-computablevalueset`,
      `${C}/crmi-publishablevalueset`,
    ]);
  });

  it("Library accumulates all four levels including executable", () => {
    expect(crmiProfilesOf(emitAt("shareable"), "Library/")).toEqual([`${C}/crmi-shareablelibrary`]);
    expect(crmiProfilesOf(emitAt("executable"), "Library/")).toEqual([
      `${C}/crmi-shareablelibrary`,
      `${C}/crmi-computablelibrary`,
      `${C}/crmi-publishablelibrary`,
      `${C}/crmi-executablelibrary`,
    ]);
  });

  it("ActivityDefinition has only shareable+publishable profiles (computable/executable filtered out)", () => {
    expect(crmiProfilesOf(emitAt("computable"), "ActivityDefinition/")).toEqual([
      `${C}/crmi-shareableactivitydefinition`,
    ]);
    expect(crmiProfilesOf(emitAt("executable"), "ActivityDefinition/")).toEqual([
      `${C}/crmi-shareableactivitydefinition`,
      `${C}/crmi-publishableactivitydefinition`,
    ]);
  });

  it("PlanDefinition has only shareable+publishable profiles (computable/executable filtered out)", () => {
    expect(crmiProfilesOf(emitAt("computable"), "PlanDefinition/")).toEqual([
      `${C}/crmi-shareableplandefinition`,
    ]);
    expect(crmiProfilesOf(emitAt("executable"), "PlanDefinition/")).toEqual([
      `${C}/crmi-shareableplandefinition`,
      `${C}/crmi-publishableplandefinition`,
    ]);
  });
});
