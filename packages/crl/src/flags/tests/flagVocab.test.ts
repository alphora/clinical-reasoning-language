// #212 step 4 — the CORE-owned flag vocabulary + the PURE field validator (flagVocab.ts). Covers the accessors + every
// validateFlagFields reason. (Its equivalence-with-the-registry is asserted separately in flagVocab.equivalence.test.ts,
// which is deleted in 4b when the registry flag entries are stripped.)
import {
  canonicalFlagTag,
  flagCategoryOf,
  flagFieldRulesOf,
  flagTags,
  isFlagTag,
  validateFlagFields,
} from "../flagVocab";

describe("flagVocab accessors", () => {
  test("flagTags() returns the five flag tags with their categories", () => {
    const byId = new Map(flagTags().map((t) => [t.id, t]));
    expect([...byId.keys()].sort()).toEqual(
      ["customer-confirmable", "fidelity-defect", "internal-inconsistency", "open-fork", "validation-concern"],
    );
    expect(byId.get("validation-concern")!.category).toBe("validation");
    expect(byId.get("fidelity-defect")!.category).toBe("extraction");
  });

  test("canonicalFlagTag resolves canonical ids AND aliases; isFlagTag agrees", () => {
    expect(canonicalFlagTag("validation-concern")).toBe("validation-concern");
    expect(canonicalFlagTag("over-reach-to-fix")).toBe("fidelity-defect");
    expect(canonicalFlagTag("criterion-drop-to-fix")).toBe("fidelity-defect");
    expect(canonicalFlagTag("not-a-flag")).toBeUndefined();
    expect(isFlagTag("over-reach-to-fix")).toBe(true);
    expect(isFlagTag("gap-filed")).toBe(false); // a real non-flag tag
  });

  test("flagCategoryOf / flagFieldRulesOf read through aliases", () => {
    expect(flagCategoryOf("over-reach-to-fix")).toBe("extraction");
    const rules = flagFieldRulesOf("over-reach-to-fix");
    const direction = rules.find((r) => r.key === "direction");
    expect(direction).toMatchObject({ key: "direction", required: true, values: ["over-reach", "criterion-drop"] });
  });
});

describe("validateFlagFields", () => {
  test("a valid validation-concern → ok (canonical tag, its category, open status, empty fields)", () => {
    const r = validateFlagFields({ tag: "validation-concern", gist: "looks off" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r).toMatchObject({ canon: "validation-concern", category: "validation", gist: "looks off", status: "open", fields: {} });
  });

  test("an unknown tag → unknown-tag", () => {
    const r = validateFlagFields({ tag: "not-a-flag-tag", gist: "x" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("unknown-tag");
  });

  test("an empty gist → invalid-value", () => {
    const r = validateFlagFields({ tag: "validation-concern", gist: "   " });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid-value");
  });

  test("a gist with a backtick or `;` → invalid-value; a MULTI-LINE gist is ALLOWED", () => {
    expect(validateFlagFields({ tag: "validation-concern", gist: "a `code` span" }).ok).toBe(false);
    expect(validateFlagFields({ tag: "validation-concern", gist: "a; b" }).ok).toBe(false);
    const multi = validateFlagFields({ tag: "validation-concern", gist: "line one\nline two" });
    expect(multi.ok).toBe(true);
    if (multi.ok) expect(multi.gist).toBe("line one\nline two");
  });

  test("a fields.status → invalid-value (status is a top-level param)", () => {
    const r = validateFlagFields({ tag: "validation-concern", gist: "x", fields: { status: "open" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid-value");
  });

  test("a missing registry-required field → missing-field (@fidelity-defect needs direction)", () => {
    const r = validateFlagFields({ tag: "fidelity-defect", gist: "x" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing-field");
  });

  test("@fidelity-defect with a valid direction → ok (canonicalized, extraction, direction rides along)", () => {
    const r = validateFlagFields({ tag: "over-reach-to-fix", gist: "dosage mismatch", fields: { direction: "over-reach" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r).toMatchObject({ canon: "fidelity-defect", category: "extraction" });
    expect(r.fields.direction).toBe("over-reach");
  });

  test("a bad enum value → invalid-value", () => {
    const r = validateFlagFields({ tag: "fidelity-defect", gist: "x", fields: { direction: "sideways" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid-value");
  });

  test("a non-bare-identifier field key → invalid-value", () => {
    const r = validateFlagFields({ tag: "validation-concern", gist: "x", fields: { "Bad Key": "v" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid-value");
  });

  test("a forbidden char in a field value → invalid-value", () => {
    const r = validateFlagFields({ tag: "validation-concern", gist: "x", fields: { ref: "a; b" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid-value");
  });

  test("an empty optional field is dropped; a present one is kept (trimmed)", () => {
    const r = validateFlagFields({ tag: "validation-concern", gist: "x", fields: { ref: "  ", kind: " narrative-error " } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields).toEqual({ kind: "narrative-error" }); // ref dropped (empty), kind trimmed
  });

  test("a `; key` value rides along in fields (the seam extracts/strips it — not the pure validator's job)", () => {
    const r = validateFlagFields({ tag: "validation-concern", gist: "x", fields: { key: "when[0]~guard" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields.key).toBe("when[0]~guard");
  });

  test("status resolved → ok; an out-of-enum status → invalid-value", () => {
    expect(validateFlagFields({ tag: "validation-concern", gist: "x", status: "resolved" }).ok).toBe(true);
    const bad = validateFlagFields({ tag: "validation-concern", gist: "x", status: "deferred" });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.reason).toBe("invalid-value");
  });
});
