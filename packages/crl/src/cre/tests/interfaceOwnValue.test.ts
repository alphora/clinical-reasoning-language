import * as path from "node:path";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";

import { describe, it, expect } from "vitest";

import { resolveCelImports } from "../../cel/imports";
import { emitCelToFhir } from "../../cel/emitter/emitFhir";
import { localCodeSystemUrl } from "../../fhir-emitter/slug";
import { runCel } from "../run";

// The inline project's primary policy id is its package name ("iface"), so the local CodeSystem domain is "iface".
const IFACE_LOCAL_SYSTEM = localCodeSystemUrl("http://example.org/hcsc/dme-iface", "iface");

// #189 Piece 3 (Option C, disc 512) — a value-reading boolean INTERFACE (member-existence: `code is` + `defined as
// exists`) asserted DIRECTLY reads its OWN value in the CRE, matching the emitted CQL own-arm
// `Last(...).value as FHIR.boolean is true`. Before Option C the CRE presence-satisfied ANY direct assertion → a
// `value is false` computed the interface TRUE (Approve) while `$apply` read false (Deny). Now the CRE reads the
// value; a bare / non-boolean direct assertion is refused loud (its determination must be stated explicitly).

const IFACE_CEL = path.resolve(__dirname, "fixtures/dme-interface-ownvalue/cases.cel");

const POLICY = [
  '# P',
  'library "IfaceTest".',
  'terminology "Covered Devices":',
  '- valueset is `http://example.org/hcsc/dme-iface/ValueSet/covered-devices`.',
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
  // A second boolean Observation concept, used to author a REDIRECTED fact (names this, carries the interface's code).
  'concept "Other Flag":',
  '- type is Observation.',
  '- value type is boolean.',
  '- code is `other-flag`.',
  '- definition is exists this.',
  'activity "Approve":',
  '- request CPGCommunicationRequest.',
  '- with `approve`.',
  'activity "Deny":',
  '- request CPGCommunicationRequest.',
  '- with `deny`.',
  'decision "D":',
  'first:',
  '- when "Covered Device Requested" then recommend activity "Approve".',
  '- otherwise then recommend activity "Deny".',
].join('\n');

/** Build a throwaway project (IfaceTest policy + one inline `.cel` body) and hand its resolved graph to `fn`. */
function withInlineGraph<T>(caseBody: string, fn: (graph: ReturnType<typeof resolveCelImports>) => T): T {
  const root = mkdtempSync(path.join(os.tmpdir(), "iface-ownvalue-"));
  try {
    writeFileSync(path.join(root, "package.json"), JSON.stringify({
      name: "iface", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/hcsc/dme-iface" },
    }));
    writeFileSync(path.join(root, "policy.crl"), POLICY);
    const cel = path.join(root, "cases.cel");
    writeFileSync(cel, ['# C', 'library "C".', 'covers "IfaceTest".',
      'fact "Pat":', '- name is "Pat".', '- birth date is "1970-01-01".', '- defined by "Patient".',
      caseBody,
    ].join('\n'));
    return fn(resolveCelImports(cel));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Run a single inline case (its `.cel` body) against the IfaceTest policy in a throwaway project. */
function runInlineCase(caseBody: string): ReturnType<typeof runCel>["runs"][number] {
  return withInlineGraph(caseBody, (graph) => runCel(graph).runs[0]);
}

describe("#189 Piece 3 (Option C) — value-reading interface reads its own value", () => {
  const result = runCel(resolveCelImports(IFACE_CEL));
  const byCase = (needle: string) => result.runs.find((r) => r.case.includes(needle))!;

  it("all three explicit cases pass the oracle", () => {
    const failures = result.runs.filter((r) => r.status !== "pass").map((r) => `${r.case}:${r.status}`);
    expect(failures).toEqual([]);
    expect(result.runs.length).toBe(3);
  });

  it("`value is true` → own-arm true → approve", () => {
    expect(byCase("explicit true").produced.map((p) => p.recommendation)).toEqual(["Approve"]);
  });

  it("`value is false`, no value concept → own-arm false → DENY (the divergence Option C closes)", () => {
    expect(byCase("explicit false -> deny").produced.map((p) => p.recommendation)).toEqual(["Deny"]);
  });

  it("`value is false` BUT the value concept exists → true via the composed `exists` arm → approve", () => {
    // The own-arm is false, but `sat = ownArm OR composed`; the value concept populates → exists → approve.
    expect(byCase("value present").produced.map((p) => p.recommendation)).toEqual(["Approve"]);
  });
});

describe("#189 Piece 3 (Option C) — a valueless value-reading fact reads FALSE (matches $apply), not a runtime error", () => {
  // disc 513: the bare/non-boolean assertion is an AUTHOR-TIME error (validator + emitter). At RUN time both lanes
  // read a valueless value-reading record as false (closed-world → Deny), so the CRE must NOT refuse — that would
  // diverge from `$apply`'s Deny verdict. The CRE surfaces a non-fatal diagnostic instead.
  it("a BARE direct assertion → own-arm reads false → Deny (+ non-fatal diagnostic), NOT an error", () => {
    const run = runInlineCase([
      'fact "Bare":', '- defined by "IfaceTest"."Covered Device Requested".',
      'case "bare":', '- subject is "Pat".', '- fact is "Bare".', '- result is "D" is "Deny".',
    ].join('\n'));
    expect(run.status).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["Deny"]);
    expect(run.diagnostics.join("\n")).toMatch(/no boolean value.*reads false/s);
  });

  it("a NON-BOOLEAN value → own-arm reads false → Deny, NOT an error", () => {
    const run = runInlineCase([
      'fact "NonBool":', '- value is 1.', '- defined by "IfaceTest"."Covered Device Requested".',
      'case "nonbool":', '- subject is "Pat".', '- fact is "NonBool".', '- result is "D" is "Deny".',
    ].join('\n'));
    expect(run.status).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["Deny"]);
  });
});

describe("#189 Piece 3 (Option C) — CRE refuses loud ONLY on a decisive conflict (cannot replicate the $apply sort)", () => {
  it("CONFLICTING own values (true+false), no value concept, NO dates → decisive → run error", () => {
    const run = runInlineCase([
      'fact "T":', '- value is true.', '- defined by "IfaceTest"."Covered Device Requested".',
      'fact "F":', '- value is false.', '- defined by "IfaceTest"."Covered Device Requested".',
      'case "conflict":', '- subject is "Pat".', '- fact is "T".', '- fact is "F".', '- result is "D" is "Deny".',
    ].join('\n'));
    expect(run.status).toBe("error");
    expect(run.diagnostics.join("\n")).toMatch(/CONFLICTING own values/);
  });

  it("CONFLICTING own values with DISTINCT dates → CRE still refuses (does not replicate the emitted (effective,id) sort)", () => {
    const run = runInlineCase([
      'fact "T":', '- value is true.', '- date is "2026-01-01".', '- defined by "IfaceTest"."Covered Device Requested".',
      'fact "F":', '- value is false.', '- date is "2026-02-01".', '- defined by "IfaceTest"."Covered Device Requested".',
      'case "dated-conflict":', '- subject is "Pat".', '- fact is "T".', '- fact is "F".', '- result is "D" is "Deny".',
    ].join('\n'));
    expect(run.status).toBe("error");
  });

  it("CONFLICTING own values BUT the value concept exists → composed arm true → approve (NOT decisive)", () => {
    const run = runInlineCase([
      'fact "T":', '- value is true.', '- defined by "IfaceTest"."Covered Device Requested".',
      'fact "F":', '- value is false.', '- defined by "IfaceTest"."Covered Device Requested".',
      'fact "Val":', '- defined by "IfaceTest"."Covered Device".',
      'case "conflict-with-value":', '- subject is "Pat".',
      '- fact is "T".', '- fact is "F".', '- fact is "Val".', '- result is "D" is "Approve".',
    ].join('\n'));
    expect(run.status).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["Approve"]);
  });
});

describe("#189 Piece 3 (Option C) — CODE-DRIVEN own value: a REDIRECTED code carries its own authored boolean", () => {
  // A fact NAMES `Other Flag` but authors the interface's local code → code-driven membership populates the INTERFACE
  // (not Other Flag), and the fact's OWN authored boolean rides that record — exactly as `$apply` retrieves the
  // emitted Observation (interface code + valueBoolean) into the interface own-arm. (disc 513, both arms.)
  it("redirect + `value is false` → own-arm false → Deny", () => {
    const run = runInlineCase([
      'fact "R":', `- code is "${IFACE_LOCAL_SYSTEM}|covered-device-requested".`, '- value is false.',
      '- defined by "IfaceTest"."Other Flag".',
      'case "redirect-false":', '- subject is "Pat".', '- fact is "R".', '- result is "D" is "Deny".',
    ].join('\n'));
    expect(run.status).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["Deny"]);
  });

  it("redirect + `value is true` → own-arm true → Approve", () => {
    const run = runInlineCase([
      'fact "R":', `- code is "${IFACE_LOCAL_SYSTEM}|covered-device-requested".`, '- value is true.',
      '- defined by "IfaceTest"."Other Flag".',
      'case "redirect-true":', '- subject is "Pat".', '- fact is "R".', '- result is "D" is "Approve".',
    ].join('\n'));
    expect(run.status).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["Approve"]);
  });
});

describe("#189 Piece 3 (Option C) — emitter author-time backstop (three-lane symmetry)", () => {
  // A bare value-reading assertion is an author-time error in the emitter too (so projectless/unvalidated `emit_cel`
  // still sees it). The offending Observation is skipped; the verdict is unchanged (a valueless record reads false).
  it("bare interface fact → `value-reading-assertion-needs-boolean` diagnostic + the fact is skipped", () => {
    const diags = withInlineGraph([
      'fact "Bare":', '- defined by "IfaceTest"."Covered Device Requested".',
      'case "bare":', '- subject is "Pat".', '- fact is "Bare".', '- result is "D" is "Deny".',
    ].join('\n'), (graph) => emitCelToFhir(graph).diagnostics);
    expect(diags.map((d) => d.kind)).toContain("value-reading-assertion-needs-boolean");
  });

  it("`value is true` interface fact → no diagnostic (the sanctioned explicit form emits cleanly)", () => {
    const diags = withInlineGraph([
      'fact "T":', '- value is true.', '- defined by "IfaceTest"."Covered Device Requested".',
      'case "t":', '- subject is "Pat".', '- fact is "T".', '- result is "D" is "Approve".',
    ].join('\n'), (graph) => emitCelToFhir(graph).diagnostics);
    expect(diags.map((d) => d.kind)).not.toContain("value-reading-assertion-needs-boolean");
  });
});
