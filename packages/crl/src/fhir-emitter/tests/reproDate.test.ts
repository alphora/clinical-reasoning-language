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
  const STRATEGY = path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms22/cms22-strategy.crl");
  const FIXED = new Date("2020-01-01T00:00:00.000Z");
  // #187 — always-emitted shared catalog Library ids; they carry fixed catalog
  // versions, not the package version.
  const CATALOG_LIB_IDS = new Set(["CRLCommon", "CaseFeatureCommon"]);

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
      // #187 — the shared catalog Libraries (CRLCommon/CaseFeatureCommon) carry
      // their FIXED catalog CQL-header version (0.2.0 / 1.0.0), NOT the package
      // version, since they are fixed emitter assets independent of the policy.
      // They still respect the capability date gate (no date at shareable).
      if (res.resourceType !== "Library" || !CATALOG_LIB_IDS.has(body.id as string)) {
        expect(body.version).toBe("1.0.0");
      }
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
  const STRATEGY = path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms22/cms22-strategy.crl");
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
  // Supported (emittable) capability levels only — `executable` is rejected
  // (covered by its own test below), so this helper asserts a clean emit.
  const emitAt = (capability: "shareable" | "computable" | "publishable") => {
    const r = emitFhirDefFromPath(STRATEGY, { date: FIXED, capability });
    expect(r.errors.length).toBe(0);
    return r.resources as { relativePath: string; resource: Record<string, unknown> }[];
  };

  it("ValueSet accumulates shareable→computable→publishable", () => {
    expect(crmiProfilesOf(emitAt("shareable"), "ValueSet/")).toEqual([
      `${C}/crmi-shareablevalueset`,
    ]);
    expect(crmiProfilesOf(emitAt("computable"), "ValueSet/")).toEqual([
      `${C}/crmi-shareablevalueset`,
      `${C}/crmi-computablevalueset`,
    ]);
    expect(crmiProfilesOf(emitAt("publishable"), "ValueSet/")).toEqual([
      `${C}/crmi-shareablevalueset`,
      `${C}/crmi-computablevalueset`,
      `${C}/crmi-publishablevalueset`,
    ]);
  });

  it("Library accumulates shareable→computable→publishable (executable profile needs ELM — capped)", () => {
    expect(crmiProfilesOf(emitAt("shareable"), "Library/")).toEqual([`${C}/crmi-shareablelibrary`]);
    expect(crmiProfilesOf(emitAt("publishable"), "Library/")).toEqual([
      `${C}/crmi-shareablelibrary`,
      `${C}/crmi-computablelibrary`,
      `${C}/crmi-publishablelibrary`,
    ]);
  });

  it("ActivityDefinition has only shareable+publishable profiles (no computable profile)", () => {
    expect(crmiProfilesOf(emitAt("computable"), "ActivityDefinition/")).toEqual([
      `${C}/crmi-shareableactivitydefinition`,
    ]);
    expect(crmiProfilesOf(emitAt("publishable"), "ActivityDefinition/")).toEqual([
      `${C}/crmi-shareableactivitydefinition`,
      `${C}/crmi-publishableactivitydefinition`,
    ]);
  });

  it("PlanDefinition has only shareable+publishable profiles (no computable profile)", () => {
    expect(crmiProfilesOf(emitAt("computable"), "PlanDefinition/")).toEqual([
      `${C}/crmi-shareableplandefinition`,
    ]);
    expect(crmiProfilesOf(emitAt("publishable"), "PlanDefinition/")).toEqual([
      `${C}/crmi-shareableplandefinition`,
      `${C}/crmi-publishableplandefinition`,
    ]);
  });

  it("`--capability executable` is rejected (emit produces design-time forms, not ELM/expansion)", () => {
    const r = emitFhirDefFromPath(STRATEGY, { date: FIXED, capability: "executable" });
    expect(r.success).toBe(false);
    expect(r.errors.some((e) => e.kind === "executable-capability-unsupported")).toBe(true);
    expect(r.resources.length).toBe(0);
  });
});

describe("knowledge extensions per artifact (cqf-knowledgeCapability + representationLevel)", () => {
  const STRATEGY = path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms22/cms22-strategy.crl");
  const FIXED = new Date("2020-01-01T00:00:00.000Z");
  const KC = "http://hl7.org/fhir/StructureDefinition/cqf-knowledgeCapability";
  const KRL = "http://hl7.org/fhir/StructureDefinition/cqf-knowledgeRepresentationLevel";

  const ext = (prefix: string): { url: string; valueCode: string }[] => {
    const r = emitFhirDefFromPath(STRATEGY, { date: FIXED, capability: "publishable" });
    expect(r.errors.length).toBe(0);
    const res = r.resources.find((x) => x.relativePath.startsWith(prefix))!.resource as {
      extension?: { url: string; valueCode: string }[];
    };
    return res.extension ?? [];
  };
  const caps = (e: { url: string; valueCode: string }[]): string[] =>
    e.filter((x) => x.url === KC).map((x) => x.valueCode);
  const repLevel = (e: { url: string; valueCode: string }[]): string | undefined =>
    e.find((x) => x.url === KRL)?.valueCode;

  it("ValueSet: knowledgeCapability only (no representationLevel — terminology)", () => {
    const e = ext("ValueSet/");
    expect(caps(e)).toEqual(["shareable", "computable", "publishable"]);
    expect(repLevel(e)).toBeUndefined();
  });

  it("Library: knowledgeCapability + representationLevel `structured` (CQL source, not compiled ELM)", () => {
    const e = ext("Library/");
    expect(caps(e)).toEqual(["shareable", "computable", "publishable"]);
    expect(repLevel(e)).toBe("structured");
  });

  it("ActivityDefinition: knowledgeCapability + representationLevel `structured`", () => {
    const e = ext("ActivityDefinition/");
    expect(caps(e)).toEqual(["shareable", "computable", "publishable"]);
    expect(repLevel(e)).toBe("structured");
  });

  it("PlanDefinition: knowledgeCapability + representationLevel `structured`", () => {
    const e = ext("PlanDefinition/");
    expect(caps(e)).toEqual(["shareable", "computable", "publishable"]);
    expect(repLevel(e)).toBe("structured");
  });
});
