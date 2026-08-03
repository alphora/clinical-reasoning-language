// #154/#203/#212: the registry-backed @tag validator + parseMetaTag. (#212 step 4b: review FLAGS left the `.crl` meta-registry
// — they now live in the `medical-validation/flags/` store — so the collectFlags/openFlags/open-flag/flag-field blocks are gone; the former
// flag tags now validate as `meta-unknown-tag`, which this file's "former flag tags" block guards.)
import * as fs from "node:fs";
import * as path from "node:path";

import { parseMetaTag, validateCRL } from "../../index";

const kinds = (list: { kind?: string }[]): string[] => list.map((e) => e.kind ?? "");

describe("#154 parseMetaTag — body(seg0) + `; key value` fields", () => {
  it("body = seg0; trailing `; key value` segments are fields", () => {
    const r = parseMetaTag("@ke-feedback: AR vs IL; chosen AR; status open");
    expect(r.kind).toBe("tag");
    if (r.kind !== "tag") return;
    expect(r.parsed.body).toBe("AR vs IL");
    expect(r.parsed.fields.get("chosen")).toBe("AR");
    expect(r.parsed.fields.get("status")).toBe("open");
  });

  it("a body whose first word equals a field key stays BODY (no first-token heuristic)", () => {
    const r = parseMetaTag("@ke-feedback: status quo is unclear; status open");
    if (r.kind !== "tag") throw new Error("expected tag");
    expect(r.parsed.body).toBe("status quo is unclear");
    expect(r.parsed.fields.get("status")).toBe("open");
  });

  it("non-@ line → note; malformed @ → malformed; duplicate field recorded", () => {
    expect(parseMetaTag("just a note").kind).toBe("note");
    expect(parseMetaTag("@Not-Valid: x").kind).toBe("malformed"); // uppercase → fails ^@[a-z…]
    const dup = parseMetaTag("@ke-feedback: x; status open; status resolved");
    if (dup.kind !== "tag") throw new Error("tag");
    expect(dup.parsed.duplicateFields).toContain("status");
  });
});

describe("#154 validateCRL — registry-backed @tag enforcement", () => {
  const validate = (input: string) => validateCRL(input);

  it("a typo'd tag → meta-unknown-tag WARNING (the booby-trap is closed)", () => {
    const r = validate(`library "L".
concept "C":
- type is Observation.
- meta is \`@ke-feeback: oops\`.
- code is \`c\`.
`);
    expect(kinds(r.warnings ?? [])).toContain("meta-unknown-tag");
  });

  it("@gap-filed without a `ref` → meta-missing-field error", () => {
    const r = validate(`library "L".
concept "C":
- type is Observation.
- meta is \`@gap-filed: needs an issue id\`.
- code is \`c\`.
`);
    expect(kinds(r.errors ?? [])).toContain("meta-missing-field");
  });

  it("@ke-feedback with an out-of-enum `status` → meta-invalid-field error", () => {
    const r = validate(`library "L".
concept "C":
- type is Observation.
- meta is \`@ke-feedback: note; status sideways\`.
- code is \`c\`.
`);
    expect(kinds(r.errors ?? [])).toContain("meta-invalid-field");
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
- meta is \`@ke-feedback: note; status sideways\`.
- code is \`c\`.
`, { soft: true });
    // invalid enum stays a hard error even in soft mode
    expect(kinds(r.errors ?? [])).toContain("meta-invalid-field");
  });
});

describe("#212 step 4b — review FLAGS left the `.crl` meta-registry (now `medical-validation/flags/` store records)", () => {
  const validate = (input: string) => validateCRL(input);
  const withMeta = (metaLine: string) =>
    `library "L".\nconcept "C":\n- type is Observation.\n- meta is \`${metaLine}\`.\n- code is \`c\`.\n`;

  it.each(["validation-concern", "fidelity-defect", "open-fork", "internal-inconsistency", "customer-confirmable"])(
    "@%s is no longer a registered tag → meta-unknown-tag (not a flag gate)",
    (tag) => {
      const r = validate(withMeta(`@${tag}: some concern; status open`));
      expect(kinds(r.warnings ?? [])).toContain("meta-unknown-tag");
      expect(kinds(r.warnings ?? [])).not.toContain("open-flag"); // the open-flag warning no longer exists
    },
  );

  it("a former flag's required field is NOT enforced anymore (the tag is unknown, not a known-tag-missing-field)", () => {
    // @fidelity-defect used to error without a `direction`; now it's just an unknown tag.
    const r = validate(withMeta("@fidelity-defect: over-reached somewhere; status open"));
    expect(kinds(r.errors ?? [])).not.toContain("meta-missing-field");
    expect(kinds(r.warnings ?? [])).toContain("meta-unknown-tag");
  });

  it("the registry carries NO flag entries and no flagModel", () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "..", "..", "spec", "metadata-registry.json"), "utf-8"),
    ) as { tags: { id: string; flag?: boolean }[]; flagModel?: unknown };
    expect(registry.tags.some((t) => t.flag === true)).toBe(false);
    expect(registry.flagModel).toBeUndefined();
  });
});
