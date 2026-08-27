import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import type { CRL, Concept } from "../../ast/types";
import {
  resolveRecencyValueConcept,
  isMemberExistenceInterface,
  isValueReadingBooleanConcept,
} from "../recencyValueConcept";

// #189 Piece 1 (disc 506 Claude #2) — the shared recency-value shape classifier. Parses against the WORKING-TREE
// parser (`buildCRL`), NOT the CRL MCP tool (which lags the branch). SHAPE-EXACT: only the exact both-rep
// recency-value form matches; every off-shape variant returns `not-recency-value` so the existing E1 rejects still fire.

function conceptNamed(src: string, name: string): Concept {
  const parsed = buildCRL(src);
  if (!parsed.success || !parsed.result) {
    throw new Error(`parse failed: ${JSON.stringify(parsed.errors)}`);
  }
  const ast: CRL = parsed.result;
  const c = ast.statements.find((s): s is Concept => s.type === "Concept" && s.name === name);
  if (!c) throw new Error(`concept "${name}" not found`);
  return c;
}

const HEADER = 'library "T".\n\nterminology "Covered Devices":\n- valueset is `http://example.org/vs/covered-devices`.\n\n';

describe("resolveRecencyValueConcept (#189 Piece 1 shared classifier)", () => {
  it("MATCHES the canonical both-rep recency-value form (Covered Device)", () => {
    const c = conceptNamed(
      HEADER +
        'concept "Covered Device":\n' +
        "- type is Observation.\n" +
        "- value type is CodeableConcept.\n" +
        "- code is `covered-device`.\n" +
        "- definition is most recent this.\n" +
        "- source representation:\n" +
        "  - type is ServiceRequest.\n" +
        "  - value element is ServiceRequest.code.\n" +
        "  - value type is CodeableConcept.\n" +
        '  - coded from "Covered Devices".\n',
      "Covered Device",
    );
    const res = resolveRecencyValueConcept(c);
    expect(res.kind).toBe("recency-value");
    if (res.kind === "recency-value") {
      expect(res.sourceRep.conceptType).toBe("ServiceRequest");
      expect(res.sourceRep.terminologyName).toBe("Covered Devices");
    }
  });

  it("REJECTS a boolean value/interface concept (defined as exists, not most-recent-this)", () => {
    const c = conceptNamed(
      HEADER +
        'concept "Covered Device Requested":\n' +
        "- type is Observation.\n" +
        "- value type is boolean.\n" +
        "- code is `covered-device-requested`.\n" +
        '- defined as exists ("Covered Device").\n' +
        'concept "Covered Device":\n' +
        "- type is Observation.\n" +
        "- value type is boolean.\n" +
        "- code is `covered-device`.\n" +
        "- definition is exists this.\n",
      "Covered Device Requested",
    );
    expect(resolveRecencyValueConcept(c).kind).toBe("not-recency-value");
  });

  it("REJECTS a boolean `most recent this` (B2a cell, not a value merge)", () => {
    const c = conceptNamed(
      HEADER +
        'concept "Bool Recent":\n' +
        "- type is Observation.\n" +
        "- value type is boolean.\n" +
        "- code is `bool-recent`.\n" +
        "- definition is most recent this.\n" +
        "- source representation:\n" +
        "  - type is Observation.\n" +
        "  - value element is Observation.value.\n" +
        "  - value type is boolean.\n" +
        '  - coded from "Covered Devices".\n',
      "Bool Recent",
    );
    expect(resolveRecencyValueConcept(c).kind).toBe("not-recency-value");
  });

  it("REJECTS a non-coded-from source representation", () => {
    const c = conceptNamed(
      HEADER +
        'concept "Uncoded Src":\n' +
        "- type is Observation.\n" +
        "- value type is CodeableConcept.\n" +
        "- code is `uncoded-src`.\n" +
        "- definition is most recent this.\n" +
        "- source representation:\n" +
        "  - type is ServiceRequest.\n" +
        "  - value element is ServiceRequest.code.\n" +
        "  - value type is CodeableConcept.\n",
      "Uncoded Src",
    );
    expect(resolveRecencyValueConcept(c).kind).toBe("not-recency-value");
  });

  it("REJECTS a pure `code is` (no reduction, no source rep)", () => {
    const c = conceptNamed(
      HEADER +
        'concept "Plain":\n' +
        "- type is Observation.\n" +
        "- value type is boolean.\n" +
        "- code is `plain`.\n" +
        "- definition is exists this.\n",
      "Plain",
    );
    expect(resolveRecencyValueConcept(c).kind).toBe("not-recency-value");
  });

  it("REJECTS the patient-age recency form (value projection, owned by resolveAgeConcept)", () => {
    const c = conceptNamed(
      HEADER +
        'concept "Adult Eighteen Or Older":\n' +
        "- value type is boolean.\n" +
        "- code is `adult-18-or-older`.\n" +
        "- source representation:\n" +
        "  - type is Patient.\n" +
        "  - value element is Patient.birthDate.\n" +
        "  - value type is date.\n" +
        "  - value projection is age today at least 18 years.\n",
      "Adult Eighteen Or Older",
    );
    expect(resolveRecencyValueConcept(c).kind).toBe("not-recency-value");
  });
});

// disc 507 A/B — the SHARED member-existence-interface predicate. Its activation is shape-exact on BOTH the referent
// (recency-value) AND the interface's own arm (unqualified ref, Scalar<boolean> Observation, default value carrier),
// so a wrong-referent-library rebind (A) and a non-Observation/non-boolean interface (B) are refused, not silently
// emitted. The referent predicate is stubbed to accept "Covered Device" (the fixture's recency-value concept name).
describe("isMemberExistenceInterface (#189 Piece 1, disc 507 A/B)", () => {
  const isCovered = (name: string): boolean => name === "Covered Device";
  const cdr = (extra: string, defExists = '- defined as exists ("Covered Device").\n', name = "Covered Device Requested") =>
    conceptNamed(
      HEADER + `concept "${name}":\n- type is Observation.\n- value type is boolean.\n- code is \`covered-device-requested\`.\n${extra}${defExists}`,
      name,
    );

  it("ACCEPTS the canonical boolean Observation interface over a recency-value referent", () => {
    expect(isMemberExistenceInterface(cdr(""), isCovered)).toBe(true);
  });

  it("REJECTS a CROSS-LIBRARY referent (A — no silent local rebind)", () => {
    const c = cdr("", '- defined as exists ("Other"."Covered Device").\n');
    expect(isMemberExistenceInterface(c, isCovered)).toBe(false);
  });

  it("REJECTS when the referent is NOT recency-value (predicate says no)", () => {
    expect(isMemberExistenceInterface(cdr(""), () => false)).toBe(false);
  });

  it("REJECTS a non-Observation interface (B — hardcoded Observation read would be invalid CQL)", () => {
    const c = conceptNamed(
      HEADER +
        'concept "Requested Via Condition":\n- type is Condition.\n- value type is boolean.\n- code is `req`.\n- defined as exists ("Covered Device").\n',
      "Requested Via Condition",
    );
    expect(isMemberExistenceInterface(c, isCovered)).toBe(false);
  });

  it("REJECTS an interface with an authored non-default value carrier (B)", () => {
    const c = cdr("- value element is Observation.component.\n");
    expect(isMemberExistenceInterface(c, isCovered)).toBe(false);
  });

  it("REJECTS a `defined as` that is not `exists` (a bare ref / composition)", () => {
    const c = cdr("", '- defined as "Covered Device".\n');
    expect(isMemberExistenceInterface(c, isCovered)).toBe(false);
  });
});

// #189 Piece 3 (Option C, disc 512) — the SHARED value-reading classifier the validator + CRE consult. It resolves
// the member-existence referent from the concept's OWN-LIBRARY siblings (the recency-value referent set), so a
// cross-library same-named concept never activates it.
describe("isValueReadingBooleanConcept (#189 Piece 3, disc 512)", () => {
  function conceptsOf(src: string): Concept[] {
    const parsed = buildCRL(src);
    if (!parsed.success || !parsed.result) throw new Error(`parse failed: ${JSON.stringify(parsed.errors)}`);
    return parsed.result.statements.filter((s): s is Concept => s.type === "Concept");
  }
  const RECENCY_VALUE =
    'concept "Covered Device":\n- type is Observation.\n- value type is CodeableConcept.\n- code is `covered-device`.\n' +
    "- definition is most recent this.\n- source representation:\n  - type is ServiceRequest.\n" +
    "  - value element is ServiceRequest.code.\n  - value type is CodeableConcept.\n  - coded from \"Covered Devices\".\n";
  const INTERFACE =
    'concept "Covered Device Requested":\n- type is Observation.\n- value type is boolean.\n' +
    "- code is `covered-device-requested`.\n- defined as exists (\"Covered Device\").\n";
  const byName = (cs: Concept[], n: string) => cs.find((c) => c.name === n)!;

  it("ACCEPTS the interface when its recency-value referent is a same-library sibling", () => {
    const cs = conceptsOf(HEADER + RECENCY_VALUE + INTERFACE);
    expect(isValueReadingBooleanConcept(byName(cs, "Covered Device Requested"), cs)).toBe(true);
  });

  it("REJECTS the interface when the referent sibling is NOT recency-value (a plain `exists this`)", () => {
    const plain =
      'concept "Covered Device":\n- type is Observation.\n- value type is boolean.\n- code is `covered-device`.\n- definition is exists this.\n';
    const cs = conceptsOf(HEADER + plain + INTERFACE);
    expect(isValueReadingBooleanConcept(byName(cs, "Covered Device Requested"), cs)).toBe(false);
  });

  it("REJECTS the recency-value value concept itself (it is not the boolean interface)", () => {
    const cs = conceptsOf(HEADER + RECENCY_VALUE + INTERFACE);
    expect(isValueReadingBooleanConcept(byName(cs, "Covered Device"), cs)).toBe(false);
  });

  it("REJECTS a presence-based (`exists this`) boolean concept", () => {
    const cs = conceptsOf(
      HEADER +
        'concept "Has Widget":\n- type is Observation.\n- value type is boolean.\n- code is `has-widget`.\n- definition is exists this.\n',
    );
    expect(isValueReadingBooleanConcept(byName(cs, "Has Widget"), cs)).toBe(false);
  });
});
