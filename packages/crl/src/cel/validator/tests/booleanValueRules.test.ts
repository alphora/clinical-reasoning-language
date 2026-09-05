import * as path from "node:path";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";

import { describe, it, expect } from "vitest";

import { validateCELFile } from "../validator";
import type { CELValidationResult } from "../types";

// #189 Piece 3 (Option C, disc 512) — the value-reading boolean assertion rules.
//  - Recognized value-reading boolean concepts allow omitted values (unknown) and reject authored non-booleans.
//  - Values outside the validator's recognized value-reading forms get a conditional warning. That includes
//    existence-only computations and some answer/merge forms; the warning must not tell authors to discard answers.

const POLICY = [
  '# P',
  'library "L".',
  'terminology "Covered Devices":',
  '- valueset is `http://example.org/hcsc/dme-iface/ValueSet/covered-devices`.',
  // value-reading interface (member-existence over a recency-value referent)
  'concept "Covered Device":',
  '- type is Observation.',
  '- value type is CodeableConcept.',
  '- code is `covered-device`.',
  '- definition is most recent this.',
  '- source representation:',
  '  - type is ServiceRequest.',
  '  - value element is ServiceRequest.code.',
  '  - value type is CodeableConcept.',
  '  - coded from "Covered Devices".',
  'concept "Covered Device Requested":',
  '- type is Observation.',
  '- value type is boolean.',
  '- code is `covered-device-requested`.',
  '- defined as exists ("Covered Device").',
  // presence-based (value-blind) boolean concept
  'concept "Has Widget":',
  '- type is Observation.',
  '- value type is boolean.',
  '- code is `has-widget`.',
  '- definition is exists this.',
].join('\n');

function validateInline(factsAndCases: string, additionalCrl = ""): CELValidationResult {
  const root = mkdtempSync(path.join(os.tmpdir(), "bool-value-rules-"));
  try {
    writeFileSync(path.join(root, "package.json"), JSON.stringify({
      name: "l", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/hcsc/dme-iface" },
    }));
    writeFileSync(path.join(root, "policy.crl"), POLICY + "\n" + additionalCrl);
    const cel = path.join(root, "cases.cel");
    writeFileSync(cel, [
      '# C', 'library "C".', 'covers "L".',
      'fact "Pat":', '- name is "Pat".', '- birth date is "1970-01-01".', '- defined by "Patient".',
      factsAndCases,
    ].join('\n'));
    return validateCELFile(cel);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const kinds = (r: CELValidationResult) => ({
  errors: r.errors.map((e) => e.kind),
  warnings: r.warnings.map((w) => w.kind),
});

describe("#189 Piece 3 (Option C) — value-reading boolean assertion rules", () => {
  it("bare direct assertion of a value-reading interface → error", () => {
    const r = validateInline([
      'fact "Bare":', '- defined by "L"."Covered Device Requested".',
      'case "c":', '- subject is "Pat".', '- fact is "Bare".', '- result is "D" is "Deny".',
    ].join('\n'));
    expect(kinds(r).errors).toContain("value-reading-assertion-needs-boolean");
  });

  it("non-boolean `value is` on a value-reading interface → error", () => {
    const r = validateInline([
      'fact "NonBool":', '- value is 1.', '- defined by "L"."Covered Device Requested".',
      'case "c":', '- subject is "Pat".', '- fact is "NonBool".', '- result is "D" is "Deny".',
    ].join('\n'));
    expect(kinds(r).errors).toContain("value-reading-assertion-needs-boolean");
  });

  it("`value is true` / `value is false` on the interface → clean (the sanctioned explicit forms)", () => {
    const rTrue = validateInline([
      'fact "T":', '- value is true.', '- defined by "L"."Covered Device Requested".',
      'case "c":', '- subject is "Pat".', '- fact is "T".', '- result is "D" is "Deny".',
    ].join('\n'));
    const rFalse = validateInline([
      'fact "F":', '- value is false.', '- defined by "L"."Covered Device Requested".',
      'case "c":', '- subject is "Pat".', '- fact is "F".', '- result is "D" is "Deny".',
    ].join('\n'));
    expect(kinds(rTrue).errors).not.toContain("value-reading-assertion-needs-boolean");
    expect(kinds(rFalse).errors).not.toContain("value-reading-assertion-needs-boolean");
  });

  it("`value is` on a PRESENCE-based (value-blind) boolean concept → warning (value ignored)", () => {
    const r = validateInline([
      'fact "W":', '- value is false.', '- defined by "L"."Has Widget".',
      'case "c":', '- subject is "Pat".', '- fact is "W".', '- result is "D" is "Deny".',
    ].join('\n'));
    expect(kinds(r).warnings).toContain("value-ignored-on-presence-concept");
    const message = r.warnings.find(w => w.kind === "value-ignored-on-presence-concept")!.message;
    expect(message).toContain("preserve an explicit false answer");
    expect(message).toContain("For an existence-only determination");
    expect(message).not.toMatch(/omit the fact/i);
    expect(message).not.toMatch(/explicit absence is an? absence code/i);
    // It is a WARNING, not an error — the fact still populates by presence.
    expect(kinds(r).errors).not.toContain("value-reading-assertion-needs-boolean");
  });

  it("a BARE presence-based boolean fact → clean (bare = present = true, no warning)", () => {
    const r = validateInline([
      'fact "W":', '- defined by "L"."Has Widget".',
      'case "c":', '- subject is "Pat".', '- fact is "W".', '- result is "D" is "Deny".',
    ].join('\n'));
    expect(kinds(r).warnings).not.toContain("value-ignored-on-presence-concept");
  });

  it("the current broader classifier warns on composition without discarding its explicit answer", () => {
    // Current diagnostic coverage, not an endorsement of the broad classifier; update when #320 repairs it.
    const r = validateInline([
      'fact "Composite No":', '- value is false.', '- defined by "L"."Widget Documented".',
      'case "c":', '- subject is "Pat".', '- fact is "Composite No".',
    ].join('\n'), [
      'concept "Widget Documented":', '- type is Observation.', '- value type is boolean.',
      '- code is `widget-documented`.', '- defined as ("Has Widget" sem-or "Has Widget").',
    ].join('\n'));
    const warning = r.warnings.find(w => w.kind === "value-ignored-on-presence-concept");
    expect(warning?.message).toContain("preserve an explicit false answer");
    expect(warning?.message).toContain("For an existence-only determination");
    expect(warning?.message).not.toMatch(/omit the fact/i);
  });

  it("a WRONG code naming the interface (non-member) → NO value-reading error (owned by fact-code-not-in-local-set)", () => {
    // disc 513: the rule is MEMBERSHIP-scoped — a wrong code populates a different/no concept, not the named
    // interface, so the explicit-value rule does not apply (the wrong-code warning owns it).
    const r = validateInline([
      'fact "Wrong":', '- code is "http://example.org/other|not-the-code".',
      '- defined by "L"."Covered Device Requested".',
      'case "c":', '- subject is "Pat".', '- fact is "Wrong".', '- result is "D" is "Deny".',
    ].join('\n'));
    expect(kinds(r).errors).not.toContain("value-reading-assertion-needs-boolean");
    expect(kinds(r).warnings).toContain("fact-code-not-in-local-set");
  });
});
