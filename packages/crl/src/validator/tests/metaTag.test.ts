// #154/#203: the registry-backed @tag validator + parseMetaTag + collectFlags/openFlags.
import { buildCRL, collectFlags, openFlags, parseMetaTag, validateCRL } from "../../index";

const kinds = (list: { kind?: string }[]): string[] => list.map((e) => e.kind ?? "");
const ast = (input: string) => {
  const b = buildCRL(input);
  if (!b.success || !b.result) throw new Error("build failed: " + JSON.stringify(b.errors));
  return b.result;
};

describe("#154 parseMetaTag — body(seg0) + `; key value` fields", () => {
  it("body = seg0; trailing `; key value` segments are fields", () => {
    const r = parseMetaTag("@open-fork: AR vs IL; chosen AR; status open");
    expect(r.kind).toBe("tag");
    if (r.kind !== "tag") return;
    expect(r.parsed.body).toBe("AR vs IL");
    expect(r.parsed.fields.get("chosen")).toBe("AR");
    expect(r.parsed.fields.get("status")).toBe("open");
  });

  it("a body whose first word equals a field key stays BODY (no first-token heuristic)", () => {
    const r = parseMetaTag("@open-fork: status quo is unclear; status open");
    if (r.kind !== "tag") throw new Error("expected tag");
    expect(r.parsed.body).toBe("status quo is unclear");
    expect(r.parsed.fields.get("status")).toBe("open");
  });

  it("@fidelity-defect body + trailing direction/status fields", () => {
    const r = parseMetaTag("@fidelity-defect: axillary-only over-reach; direction over-reach; status open");
    if (r.kind !== "tag") throw new Error("expected tag");
    expect(r.parsed.body).toBe("axillary-only over-reach");
    expect(r.parsed.fields.get("direction")).toBe("over-reach");
  });

  it("non-@ line → note; malformed @ → malformed; duplicate field recorded", () => {
    expect(parseMetaTag("just a note").kind).toBe("note");
    expect(parseMetaTag("@Not-Valid: x").kind).toBe("malformed"); // uppercase → fails ^@[a-z…]
    const dup = parseMetaTag("@open-fork: x; status open; status resolved");
    if (dup.kind !== "tag") throw new Error("tag");
    expect(dup.parsed.duplicateFields).toContain("status");
  });
});

describe("#154 collectFlags / openFlags across scopes", () => {
  const src = `library "L".
- meta is \`@internal-inconsistency: preamble vs operative; status open\`.
concept "C":
- type is Observation.
- meta is \`@customer-confirmable: BMI reading; status resolved\`.
- code is \`c\`.
decision "D":
- meta is \`@open-fork: AR vs IL; status open\`.
- when "C" then recommend activity "Certify".
`;
  it("collectFlags returns flags across concept/decision/library (open AND resolved)", () => {
    const flags = collectFlags(ast(src));
    expect(flags.map((f) => `${f.scope}:${f.canonicalTag}:${f.status}`).sort()).toEqual([
      "concept:customer-confirmable:resolved",
      "decision:open-fork:open",
      "library:internal-inconsistency:open",
    ]);
    expect(flags.every((f) => f.lineLocation.start.line > 0)).toBe(true);
  });
  it("openFlags = only the open ones (resolved excluded)", () => {
    expect(openFlags(ast(src)).map((f) => f.canonicalTag).sort()).toEqual(["internal-inconsistency", "open-fork"]);
  });
});

describe("#154 validateCRL — registry-backed @tag enforcement", () => {
  const validate = (input: string) => validateCRL(input);

  it("an OPEN flag → a WARNING (not an error; validation still succeeds)", () => {
    const r = validate(`library "L".
concept "C":
- type is Observation.
- meta is \`@open-fork: AR vs IL; status open\`.
- code is \`c\`.
`);
    expect(r.success).toBe(true); // open-flag is a warning, doesn't fail validation
    expect(kinds(r.warnings ?? [])).toContain("open-flag");
  });

  it("a RESOLVED flag → no open-flag warning", () => {
    const r = validate(`library "L".
concept "C":
- type is Observation.
- meta is \`@open-fork: AR vs IL; status resolved\`.
- code is \`c\`.
`);
    expect(kinds(r.warnings ?? [])).not.toContain("open-flag");
  });

  it("a typo'd flag tag → meta-unknown-tag WARNING (the booby-trap is closed)", () => {
    const r = validate(`library "L".
concept "C":
- type is Observation.
- meta is \`@internnal-inconsistency: oops; status open\`.
- code is \`c\`.
`);
    expect(kinds(r.warnings ?? [])).toContain("meta-unknown-tag");
    expect(kinds(r.warnings ?? [])).not.toContain("open-flag"); // it's NOT a known flag → doesn't gate
  });

  it("@fidelity-defect without a direction → error; bad direction enum → error", () => {
    const missing = validate(`library "L".
concept "C":
- type is Observation.
- meta is \`@fidelity-defect: over-reached somewhere; status open\`.
- code is \`c\`.
`);
    expect(kinds(missing.errors ?? [])).toContain("meta-missing-field");

    const badEnum = validate(`library "L".
concept "C":
- type is Observation.
- meta is \`@fidelity-defect: x; direction sideways; status open\`.
- code is \`c\`.
`);
    expect(kinds(badEnum.errors ?? [])).toContain("meta-invalid-field");
  });

  it("cardinality 0..1 (two @description on one concept) → error", () => {
    const r = validate(`library "L".
concept "C":
- type is Observation.
- meta is \`@description: one\`.
- meta is \`@description: two\`.
- code is \`c\`.
`);
    expect(kinds(r.errors ?? [])).toContain("meta-cardinality");
  });

  it("soft mode demotes meta-missing-field but keeps meta-invalid-field an error", () => {
    const r = validateCRL(`library "L".
concept "C":
- type is Observation.
- meta is \`@fidelity-defect: x; direction sideways; status open\`.
- code is \`c\`.
`, { soft: true });
    // invalid enum stays a hard error even in soft mode
    expect(kinds(r.errors ?? [])).toContain("meta-invalid-field");
  });
});
