// #212 step 4 — the CORE-owned flag vocabulary + the PURE field validator (flagVocab.ts). Covers the accessors (tags,
// categories, the human MV Type `displayName`s + `mv:*` labels) + every validateFlagFields reason. The registry's flag
// entries were stripped in v0.3.4, so flagVocab is the sole home (the former equivalence test is gone).
import {
  allFlagLabels,
  canonicalFlagTag,
  flagCategoryOf,
  flagDisplayNameOf,
  flagFieldRulesOf,
  flagLabelOf,
  flagTags,
  isFlagTag,
  validateFlagFields,
} from "../flagVocab";

describe("flagVocab accessors", () => {
  test("flagTags() returns the eight flag tags with their categories", () => {
    const byId = new Map(flagTags().map((t) => [t.id, t]));
    expect([...byId.keys()].sort()).toEqual([
      "customer-confirmable",
      "fidelity-defect",
      "internal-inconsistency",
      "narrative-defect",
      "open-fork",
      "other",
      "tooling-bug",
      "validation-concern",
    ]);
    expect(byId.get("validation-concern")!.category).toBe("validation");
    expect(byId.get("fidelity-defect")!.category).toBe("extraction");
    // the three new MV Types are all validation-category
    for (const id of ["narrative-defect", "tooling-bug", "other"]) expect(byId.get(id)!.category).toBe("validation");
  });

  test("displayName marks EXACTLY the four human MV Types (extraction tags OMIT the property, not set it undefined)", () => {
    const byId = new Map(flagTags().map((t) => [t.id, t]));
    const named = flagTags().filter((t) => t.displayName).map((t) => t.id).sort();
    expect(named).toEqual(["narrative-defect", "other", "tooling-bug", "validation-concern"]);
    expect(byId.get("validation-concern")!.displayName).toBe("CRL vs customer intent");
    expect(byId.get("narrative-defect")!.displayName).toBe("CRL vs narrative");
    // an AI-authoring tag: the property is ABSENT (so `in` / hasOwn is a true "is-a-Type" test, not just truthiness)
    expect(Object.hasOwn(byId.get("fidelity-defect")!, "displayName")).toBe(false);
    expect(Object.hasOwn(byId.get("validation-concern")!, "displayName")).toBe(true);
    expect(flagDisplayNameOf("validation-concern")).toBe("CRL vs customer intent");
    expect(flagDisplayNameOf("fidelity-defect")).toBeUndefined();
  });

  test("flagLabelOf: only the MV Types carry an mv:* label; the lookup is partial (extraction/unknown → undefined)", () => {
    expect(flagLabelOf("validation-concern")).toMatchObject({ name: "mv:crl-vs-intent" });
    expect(flagLabelOf("narrative-defect")!.name).toBe("mv:crl-vs-narrative");
    expect(flagLabelOf("tooling-bug")!.name).toBe("mv:tooling-bug");
    expect(flagLabelOf("other")!.name).toBe("mv:other");
    expect(flagLabelOf("fidelity-defect")).toBeUndefined(); // AI-authoring tag → no MV label
    expect(flagLabelOf("not-a-tag")).toBeUndefined();
    // the derived description leads with the displayName (single source) — no drift
    expect(flagLabelOf("narrative-defect")!.description.startsWith("CRL vs narrative — ")).toBe(true);
    // every label is a valid GitHub label: 6-hex color, non-empty name, description within GitHub's 100-char cap; names unique
    const labels = allFlagLabels();
    expect(labels).toHaveLength(4);
    expect(new Set(labels.map((l) => l.name)).size).toBe(4);
    for (const l of labels) {
      expect(l.color).toMatch(/^[0-9a-f]{6}$/);
      expect(l.name.length).toBeGreaterThan(0);
      expect(l.description.length).toBeGreaterThan(0);
      expect(l.description.length).toBeLessThanOrEqual(100); // GitHub label-description cap
    }
  });

  test("label INVARIANT: a tag has an mv:* label IFF it is an MV Type (displayName present) — no drawer Type emits label-less, no AI tag gets one", () => {
    for (const t of flagTags()) {
      expect(flagLabelOf(t.id) !== undefined).toBe(t.displayName !== undefined);
    }
  });

  test("flagLabelOf returns a FRESH object — a caller can't corrupt the registry", () => {
    const a = flagLabelOf("validation-concern")!;
    a.name = "mutated";
    expect(flagLabelOf("validation-concern")!.name).toBe("mv:crl-vs-intent"); // unaffected
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
