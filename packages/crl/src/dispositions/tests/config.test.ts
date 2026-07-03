import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DISPOSITION_CATEGORIES } from "../categories";
import { leafId, normalizeDispositionConfig, resolveDispositionConfig } from "../config";

describe("dispositions/config — normalizeDispositionConfig (pure)", () => {
  it("absent config → the default Approve/Deny vocabulary, standalone, version 1, no errors", () => {
    const { config, errors } = normalizeDispositionConfig(undefined);
    expect(errors).toEqual([]);
    expect(config.version).toBe(1);
    expect(config.mode).toBe("standalone");
    expect(config.options.map((o) => leafId(o.category, o.key))).toEqual(["certify/approve", "not-certify/deny"]);
    expect(config.byLeaf["certify/approve"].label).toBe("Approve");
    expect(config.byLeaf["not-certify/deny"].label).toBe("Deny");
  });

  it("resolves the PAS review-action code + finality onto each leaf from the framework category", () => {
    const { config } = normalizeDispositionConfig(undefined);
    expect(config.byLeaf["certify/approve"].reviewActionCode).toBe("A1");
    expect(config.byLeaf["certify/approve"].finality).toBe("final");
    expect(config.byLeaf["not-certify/deny"].reviewActionCode).toBe("A3");
    expect(config.byLeaf["not-certify/deny"].finality).toBe("final");
  });

  it("declared options FULLY define the vocabulary (no merge with defaults) + carry narrative + a PAS reason code", () => {
    const { config, errors } = normalizeDispositionConfig({
      mode: "embedded",
      options: {
        "not-certify": {
          "medical-necessity": { label: "Deny", narrative: "Not medically necessary." },
          experimental: {
            label: "Deny EIU",
            code: { system: "https://codesystem.x12.org/external/886", code: "T1" },
          },
        },
      },
    });
    expect(errors).toEqual([]);
    expect(config.mode).toBe("embedded");
    // certify/approve default is GONE — options replace, not merge.
    expect(Object.keys(config.byLeaf).sort()).toEqual(["not-certify/experimental", "not-certify/medical-necessity"]);
    expect(config.byLeaf["not-certify/experimental"].label).toBe("Deny EIU");
    expect(config.byLeaf["not-certify/experimental"].code).toEqual({
      system: "https://codesystem.x12.org/external/886",
      code: "T1",
    });
    expect(config.byLeaf["not-certify/medical-necessity"].narrative).toBe("Not medically necessary.");
    // Two keys under one category both carry the category's A3 action code — distinguishable by key.
    expect(config.byLeaf["not-certify/experimental"].reviewActionCode).toBe("A3");
    expect(config.byLeaf["not-certify/medical-necessity"].reviewActionCode).toBe("A3");
  });

  it("a Met/Unmet (larger-system) option carries a custom-system code the config specifies", () => {
    const { config, errors } = normalizeDispositionConfig({
      mode: "embedded",
      options: { certify: { met: { label: "Met", code: { system: "http://example.org/util-review", code: "MET" } } } },
    });
    expect(errors).toEqual([]);
    expect(config.byLeaf["certify/met"].code).toEqual({ system: "http://example.org/util-review", code: "MET" });
  });

  it("malformed option code (missing system/code) → error, code dropped, option kept", () => {
    const { config, errors } = normalizeDispositionConfig({
      options: { certify: { approve: { label: "Approve", code: { code: "A1" } } } },
    });
    expect(errors.some((e) => e.kind === "malformed-code")).toBe(true);
    expect(config.byLeaf["certify/approve"].label).toBe("Approve");
    expect(config.byLeaf["certify/approve"].code).toBeUndefined();
  });

  it("configures a non-final pended leaf (opt-in) — resolves to A4 / non-final", () => {
    const { config, errors } = normalizeDispositionConfig({
      mode: "embedded",
      options: { pended: { "need-info": { label: "Pend for records" } } },
    });
    expect(errors).toEqual([]);
    expect(config.byLeaf["pended/need-info"].reviewActionCode).toBe("A4");
    expect(config.byLeaf["pended/need-info"].finality).toBe("non-final");
  });

  it("unknown mode → error + falls back to standalone", () => {
    const { config, errors } = normalizeDispositionConfig({ mode: "sideways" });
    expect(errors.some((e) => e.kind === "unknown-mode" && e.severity === "error")).toBe(true);
    expect(config.mode).toBe("standalone");
  });

  it("unknown category → error, that category skipped (others resolve)", () => {
    const { config, errors } = normalizeDispositionConfig({
      options: {
        certify: { approve: { label: "OK" } },
        "made-up": { x: { label: "X" } },
      },
    });
    expect(errors.some((e) => e.kind === "unknown-category")).toBe(true);
    expect(config.byLeaf["certify/approve"].label).toBe("OK");
    expect(Object.keys(config.byLeaf)).not.toContain("made-up/x");
  });

  it("empty / missing label → error, that option skipped", () => {
    const { config, errors } = normalizeDispositionConfig({
      options: { certify: { a: { label: "" }, b: { label: "Fine" } } },
    });
    expect(errors.some((e) => e.kind === "empty-label")).toBe(true);
    expect(config.byLeaf["certify/b"].label).toBe("Fine");
    expect(Object.keys(config.byLeaf)).not.toContain("certify/a");
  });

  it("malformed config (not an object) → error + defaults", () => {
    const { config, errors } = normalizeDispositionConfig("nope");
    expect(errors.some((e) => e.kind === "malformed-config")).toBe(true);
    expect(config.byLeaf["certify/approve"].label).toBe("Approve");
  });

  it("unknown version → WARNING (graceful forward-compat), declared version preserved, rest still parsed", () => {
    const { config, errors } = normalizeDispositionConfig({ version: 99, mode: "embedded" });
    const v = errors.find((e) => e.kind === "unknown-version");
    expect(v?.severity).toBe("warning");
    expect(config.version).toBe(99);
    expect(config.mode).toBe("embedded"); // best-effort-parsed despite the unknown version
  });

  it("non-integer version → malformed-version error", () => {
    expect(normalizeDispositionConfig({ version: 1.5 }).errors.some((e) => e.kind === "malformed-version")).toBe(true);
    expect(normalizeDispositionConfig({ version: "1" }).errors.some((e) => e.kind === "malformed-version")).toBe(true);
  });

  it("declared-but-empty options → empty-vocabulary WARNING + zero leaves (NOT silently defaulted)", () => {
    const { config, errors } = normalizeDispositionConfig({ options: {} });
    expect(config.options).toEqual([]);
    const w = errors.find((e) => e.kind === "empty-vocabulary");
    expect(w?.severity).toBe("warning");
  });

  it("a category whose every option is invalid → empty-vocabulary (no silent default)", () => {
    const { config, errors } = normalizeDispositionConfig({ options: { certify: { a: { label: "" } } } });
    expect(config.options).toEqual([]);
    expect(errors.some((e) => e.kind === "empty-label")).toBe(true);
    expect(errors.some((e) => e.kind === "empty-vocabulary")).toBe(true);
  });

  it("options as an ARRAY → malformed-options + defaults", () => {
    const { config, errors } = normalizeDispositionConfig({ options: [] });
    expect(errors.some((e) => e.kind === "malformed-options")).toBe(true);
    expect(config.byLeaf["certify/approve"].label).toBe("Approve");
  });

  it("mode a non-string → unknown-mode + standalone", () => {
    const { config, errors } = normalizeDispositionConfig({ mode: 3 });
    expect(errors.some((e) => e.kind === "unknown-mode")).toBe(true);
    expect(config.mode).toBe("standalone");
  });

  it("empty / slash / prototype-polluting option keys are rejected (no prototype pollution)", () => {
    const { config, errors } = normalizeDispositionConfig({
      options: {
        certify: { "": { label: "X" }, "a/b": { label: "Y" }, __proto__: { label: "Z" }, ok: { label: "OK" } },
      },
    });
    expect(errors.some((e) => e.kind === "empty-key")).toBe(true);
    expect(errors.some((e) => e.kind === "malformed-key")).toBe(true);
    // Only the valid key survives; the prototype was NOT polluted.
    expect(Object.keys(config.byLeaf)).toEqual(["certify/ok"]);
    expect(({} as Record<string, unknown>).label).toBeUndefined();
  });

  it("trims label / narrative / code.system / code.code on store; blank narrative → undefined", () => {
    const { config } = normalizeDispositionConfig({
      options: {
        certify: {
          ok: { label: "  Approve  ", narrative: "   ", code: { system: " http://x ", code: " A1 " } },
        },
      },
    });
    const leaf = config.byLeaf["certify/ok"];
    expect(leaf.label).toBe("Approve");
    expect(leaf.narrative).toBeUndefined();
    expect(leaf.code).toEqual({ system: "http://x", code: "A1" });
  });

  it("every error carries a structured `path` a validator can anchor to", () => {
    const { errors } = normalizeDispositionConfig({ mode: "x", options: { "made-up": { k: { label: "L" } } } });
    for (const e of errors) expect(Array.isArray(e.path)).toBe(true);
    expect(errors.find((e) => e.kind === "unknown-mode")?.path).toEqual(["mode"]);
    expect(errors.find((e) => e.kind === "unknown-category")?.path).toEqual(["options", "made-up"]);
  });

  it("leaves sort by framework category order then declared order", () => {
    const { config } = normalizeDispositionConfig({
      options: {
        // declared not-certify BEFORE certify — output should still be certify-first (framework order).
        "not-certify": { deny: { label: "Deny" } },
        certify: { approve: { label: "Approve" } },
      },
    });
    expect(config.options.map((o) => o.category)).toEqual(["certify", "not-certify"]);
  });

  it("the framework category table is PAS-grounded: certify/not-certify/pended with A1/A3/A4", () => {
    const byName = new Map(DISPOSITION_CATEGORIES.map((c) => [c.name, c]));
    expect(byName.get("certify")?.reviewActionCode).toBe("A1");
    expect(byName.get("not-certify")?.reviewActionCode).toBe("A3");
    expect(byName.get("pended")?.reviewActionCode).toBe("A4");
    expect(byName.get("pended")?.finality).toBe("non-final");
  });
});

describe("dispositions/config — resolveDispositionConfig (file-reading)", () => {
  function projectWith(pkg: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), "disp-config-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
    return dir;
  }

  it("reads crl.dispositions from the project package.json", () => {
    const root = projectWith({
      name: "p",
      version: "1.0.0",
      crl: { dispositions: { mode: "embedded", options: { certify: { ok: { label: "Certified" } } } } },
    });
    const { config, errors } = resolveDispositionConfig(root);
    expect(errors).toEqual([]);
    expect(config.mode).toBe("embedded");
    expect(config.byLeaf["certify/ok"].label).toBe("Certified");
  });

  it("no crl.dispositions → defaults, no error", () => {
    const root = projectWith({ name: "p", version: "1.0.0", crl: { canonicalBase: "http://x" } });
    const { config, errors } = resolveDispositionConfig(root);
    expect(errors).toEqual([]);
    expect(config.byLeaf["certify/approve"].label).toBe("Approve");
  });

  it("unreadable package.json → error + defaults (never throws)", () => {
    const { config, errors } = resolveDispositionConfig(join(tmpdir(), "does-not-exist-disp-xyz"));
    expect(errors.some((e) => e.kind === "unreadable-package-json")).toBe(true);
    expect(config.byLeaf["certify/approve"].label).toBe("Approve");
  });

  it("a malformed crl block (crl not an object) → defaults, no crash", () => {
    const root = projectWith({ name: "p", version: "1.0.0", crl: "oops" });
    const { config } = resolveDispositionConfig(root);
    expect(config.byLeaf["certify/approve"].label).toBe("Approve");
  });

  it("package.json that parses to a non-object (e.g. an array) → defaults, no crash", () => {
    const dir = mkdtempSync(join(tmpdir(), "disp-config-arr-"));
    writeFileSync(join(dir, "package.json"), "[1,2,3]");
    const { config } = resolveDispositionConfig(dir);
    expect(config.byLeaf["certify/approve"].label).toBe("Approve");
  });

  it("invalid JSON in package.json → unreadable-package-json error + defaults (never throws)", () => {
    const dir = mkdtempSync(join(tmpdir(), "disp-config-bad-"));
    writeFileSync(join(dir, "package.json"), "{ not valid json");
    const { config, errors } = resolveDispositionConfig(dir);
    expect(errors.some((e) => e.kind === "unreadable-package-json")).toBe(true);
    expect(config.byLeaf["certify/approve"].label).toBe("Approve");
  });
});
