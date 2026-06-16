import { join } from "path";

import { parseInput } from "../../ast/tests/parseInput";
import { buildCEL } from "../../cel";
import { resolveCelImports } from "../../cel/imports";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import type { RegistryEntry } from "../../imports/types";

import { runCel } from "../run";

/**
 * Unit-test the evaluator on inline CRL+CEL by assembling a ResolvedCelGraph
 * directly (bypasses the import resolver / project root). The covered library is
 * the parsed CRL; the CEL's `defined by` refs resolve against it.
 */
function graphFrom(crlSrc: string, celSrc: string): ResolvedCelGraph {
  const crl = parseInput(crlSrc);
  const built = buildCEL(celSrc);
  if (!built.success || !built.result) {
    throw new Error("inline CEL build failed: " + JSON.stringify(built.errors));
  }
  const coversTarget: RegistryEntry = {
    name: crl.library.name,
    filePath: "inline.crl",
    ast: crl,
    isRoot: true,
    origin: "root",
  };
  return { filePath: "inline.cel", cel: built.result, coversTarget, celParseErrors: [], diagnostics: [] };
}

function statuses(crlSrc: string, celSrc: string): string[] {
  return runCel(graphFrom(crlSrc, celSrc)).runs.map((r) => `${r.case}:${r.status}`);
}

describe("CRE — runCel", () => {
  it("dme101-030: all 3 real cases pass against the fixture (end-to-end)", () => {
    const celPath = join(__dirname, "../../tests/fixtures/policies/dme101-030/dme101-030.cel");
    const r = runCel(resolveCelImports(celPath));
    expect(r.success).toBe(true);
    expect(r.runs.length).toBe(3);
    expect(r.runs.every((x) => x.status === "pass")).toBe(true);
  });

  const COVERAGE_CRL = `# T
library "T".
concept "Excl":
- type is Condition.
- code is \`excl\`.
concept "Indic":
- type is Condition.
- code is \`indic\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`a\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`d\`.
decision "D":
first:
- when "Excl" then recommend activity "Deny".
- when "Indic" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;

  const COVERAGE_CEL = `# TC
library "TC".
covers "T".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fExcl":
- code is "http://example.org|excl".
- date is "2026-01-01".
- defined by "Excl".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
case "indication only -> approve":
- subject is "Pat".
- fact is "fIndic".
- result is "D" is "Approve".
case "exclusion wins over indication -> deny":
- subject is "Pat".
- fact is "fIndic".
- fact is "fExcl".
- result is "D" is "Deny".
case "neither -> otherwise deny":
- subject is "Pat".
- result is "D" is "Deny".`;

  it("first:/otherwise precedence — exclusion wins over a satisfied indication", () => {
    expect(statuses(COVERAGE_CRL, COVERAGE_CEL)).toEqual([
      "indication only -> approve:pass",
      "exclusion wins over indication -> deny:pass",
      "neither -> otherwise deny:pass",
    ]);
  });

  const GUARD_CRL = `# G
library "G".
concept "Indic":
- type is Condition.
- code is \`indic\`.
concept "Contra":
- type is Condition.
- code is \`contra\`.
activity "Referral":
- request CPGCommunicationRequest.
- with \`r\`.
activity "Med":
- request CPGCommunicationRequest.
- with \`m\`.
decision "D":
- when "Indic" then:
  any:
  - recommend activity "Referral".
  - recommend activity "Med" unless "Contra".
  end.`;

  const GUARD_CEL = `# GC
library "GC".
covers "G".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
fact "fContra":
- code is "http://example.org|contra".
- date is "2026-01-01".
- defined by "Contra".
case "no contraindication -> med offered":
- subject is "Pat".
- fact is "fIndic".
- result is "D" is "Med".
case "contraindication -> med dropped, referral still offered":
- subject is "Pat".
- fact is "fIndic".
- fact is "fContra".
- result is "D" is "Referral".
case "contraindication -> med is NOT produced (expected fail)":
- subject is "Pat".
- fact is "fIndic".
- fact is "fContra".
- result is "D" is "Med".`;

  it("unless guard — med offered unless contraindicated; referral always offered", () => {
    expect(statuses(GUARD_CRL, GUARD_CEL)).toEqual([
      "no contraindication -> med offered:pass",
      "contraindication -> med dropped, referral still offered:pass",
      "contraindication -> med is NOT produced (expected fail):fail",
    ]);
  });

  it("produces a trace with guard provenance", () => {
    const r = runCel(graphFrom(GUARD_CRL, GUARD_CEL));
    const contraRun = r.runs.find((x) => x.case.startsWith("contraindication -> med dropped"))!;
    // The Med menu item should be recorded as guarded-out under the contraindication.
    const menu = contraRun.trace[0].children ?? [];
    const med = menu.find((n) => n.node === "Med");
    expect(med?.guardedOut).toBe(true);
    expect(med?.guard?.concept).toBe("Contra");
    expect(contraRun.produced.map((p) => p.recommendation)).toEqual(["Referral"]);
  });
});
