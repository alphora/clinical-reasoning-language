import { writeFileSync, mkdtempSync, rmSync } from "fs";
import * as os from "os";
import * as path from "path";

import { buildCEL } from "../index";
import { effectiveCaseId, effectiveCaseIds, CASE_ID_RE, DERIVED_CASE_ID_RE } from "../ast/caseId";
import type { CELCase } from "../ast/types";
import { validateCELFile } from "../validator/validator";

// ── AST: parse + hoist ────────────────────────────────────────────────────────

function cases(source: string): CELCase[] {
  const r = buildCEL(source);
  expect(r.success).toBe(true);
  return (r.result?.statements ?? []).filter((s): s is CELCase => s.type === "CELCase");
}

describe("CEL caseId — grammar + AST hoist (§7)", () => {
  it("hoists the first `- id is` onto CELCase.caseId; omits when absent", () => {
    const [c1, c2] = cases(
      'library "T".\ncovers "L".\ncase "With Id":\n- id is "crohns-adult".\n- subject is "S".\ncase "No Id":\n- subject is "S".',
    );
    expect(c1.caseId).toBe("crohns-adult");
    expect(c2.caseId).toBeUndefined();
    // CELIdField is kept in body[] (no divergence with the hoisted value).
    expect(c1.body.some((b) => b.type === "CELIdField")).toBe(true);
  });

  it("with two `id is` fields, hoists the FIRST and keeps BOTH in body[] (validator flags the extra)", () => {
    const [c] = cases('library "T".\ncovers "L".\ncase "C":\n- id is "first".\n- id is "second".\n- subject is "S".');
    expect(c.caseId).toBe("first");
    expect(c.body.filter((b) => b.type === "CELIdField")).toHaveLength(2);
  });

  it("effectiveCaseId: explicit wins; un-id'd falls back to source-ordinal k<n> (PROVISIONAL)", () => {
    const cs = cases('library "T".\ncovers "L".\ncase "A":\n- id is "alpha".\n- subject is "S".\ncase "B":\n- subject is "S".');
    expect(effectiveCaseId(cs[0], 0)).toBe("alpha");
    expect(effectiveCaseId(cs[1], 1)).toBe("k2");
    expect(effectiveCaseIds(cs)).toEqual(["alpha", "k2"]);
  });

  it("id regexes are bounded + reserve the derived namespace", () => {
    expect(CASE_ID_RE.test("crohns-adult_2")).toBe(true);
    expect(CASE_ID_RE.test("-leading")).toBe(false);
    expect(CASE_ID_RE.test("has space")).toBe(false);
    expect(CASE_ID_RE.test("a".repeat(128))).toBe(true); // ≤128 allowed (raised from 64 per sur716-011 feedback)
    expect(CASE_ID_RE.test("a".repeat(129))).toBe(false);
    expect(DERIVED_CASE_ID_RE.test("k12")).toBe(true);
    expect(DERIVED_CASE_ID_RE.test("k12a")).toBe(false);
  });
});

// ── Validator ─────────────────────────────────────────────────────────────────

function withCel(celBody: string[], fn: (errKinds: string[]) => void): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "cel-caseid-"));
  try {
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "t", version: "0.0.0", private: true }));
    writeFileSync(path.join(root, "lib.crl"), '# L\nlibrary "L".');
    const file = path.join(root, "f.cel");
    writeFileSync(
      file,
      ['# T', 'library "T".', 'covers "L".', 'fact "S":', '- name is "s".', '- defined by "Patient".', ...celBody].join("\n"),
      "utf-8",
    );
    fn(validateCELFile(file).errors.map((e) => e.kind));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("CEL caseId — validator (§7)", () => {
  it("a well-formed unique id produces no caseId errors", () => {
    withCel(['case "C":', '- id is "good-id".', '- subject is "S".'], (kinds) => {
      expect(kinds.filter((k) => k.endsWith("case-id") || k === "multiple-case-ids")).toEqual([]);
    });
  });
  it("malformed id → malformed-case-id", () => {
    withCel(['case "C":', '- id is "bad id".', '- subject is "S".'], (kinds) => {
      expect(kinds).toContain("malformed-case-id");
    });
  });
  it("reserved derived namespace → reserved-case-id", () => {
    withCel(['case "C":', '- id is "k1".', '- subject is "S".'], (kinds) => {
      expect(kinds).toContain("reserved-case-id");
    });
  });
  it("duplicate id across cases → duplicate-case-id", () => {
    withCel(
      ['case "C1":', '- id is "dup".', '- subject is "S".', 'case "C2":', '- id is "dup".', '- subject is "S".'],
      (kinds) => expect(kinds).toContain("duplicate-case-id"),
    );
  });
  it("two `id is` fields in one case → multiple-case-ids", () => {
    withCel(['case "C":', '- id is "a".', '- id is "b".', '- subject is "S".'], (kinds) => {
      expect(kinds).toContain("multiple-case-ids");
    });
  });
});
