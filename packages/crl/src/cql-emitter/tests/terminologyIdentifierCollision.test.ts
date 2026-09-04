/**
 * #316 — a `terminology` carrying BOTH a `valueset is` and `code is` lines emitted 1 + N declarations of
 * ONE identifier, and `emitCQL` returned SUCCESS over it.
 *
 * ⚠⚠ THE MEASURED COST, reported from the field: 3 declarations of one identifier for a 2-code body and 9
 * for an 8-code one. The library failed to compile, every library including it failed with it, `$populate`
 * answered nothing, and all 47 QuestionnaireResponses in a shipped artifact came back EMPTY — behind a
 * 47/47 green `run_decision`. Four separate diagnoses were spent before anyone read the emitted CQL,
 * because nothing in our stack said the output was invalid.
 *
 * Two independent guards are pinned here, and they are deliberately not the same thing:
 *   1. the terminology no longer MINTS the collision (`emitOneTerminology`);
 *   2. `emitCQL` REFUSES any duplicate top-level identifier, whatever mints it (`duplicateTopLevelIdentifiers`).
 * Guard 2 exists because guard 1 is specific to one shape and a postflight cannot go out of date.
 */
import { describe, expect, it } from "vitest";

import { duplicateTopLevelIdentifiers, emitCQL } from "../emitCQL";

function emit(termBody: string[]): { cql: string; success: boolean; kinds: string[] } {
  const src = [
    "# T",
    'library "T".',
    'terminology "X Codes":',
    ...termBody,
    'concept "Requested Service":',
    "- type is ServiceRequest.",
    '- coded from "X Codes".',
    "",
  ].join("\n");
  const r = emitCQL(src, {
    libraryName: "T",
    canonicalBase: "http://example.org/crl/test",
    policyId: "t",
  }) as unknown as Record<string, unknown>;
  const errs = (r.errors ?? []) as Array<{ kind?: string }>;
  return { cql: String(r.result ?? ""), success: r.success === true, kinds: errs.map((e) => String(e.kind)) };
}

/** The top-level declaration lines, in order. */
const decls = (cql: string): string[] =>
  cql.split("\n").map((l) => l.trim()).filter((l) => /^(valueset|codesystem|code) /.test(l));

const SLUG = "http://example.org/crl/test/ValueSet/t-x-codes";
const DECLARED = "http://example.org/ValueSet/x";

describe("#316 — a terminology never mints a duplicate identifier", () => {
  // THE REPORTED DEFECT. Before the fix this emitted a valueset decl plus one `code` decl per code, all
  // named after the TERMINOLOGY.
  it("`valueset is` + MANY codes emits ONE declaration, not 1 + N", () => {
    const r = emit([
      "- valueset is `" + DECLARED + "`.",
      "- system is `http://www.ama-assn.org/go/cpt`.",
      "- code is `15822`.",
      "- code is `15823`.",
    ]);
    expect(decls(r.cql)).toEqual([`valueset "X Codes": '${SLUG}'`]);
    expect(duplicateTopLevelIdentifiers(r.cql).size).toBe(0);
    expect(r.success).toBe(true);
  });

  // One code collided too (2 declarations) — the count was never the discriminator.
  it("`valueset is` + ONE code also emits one declaration", () => {
    const r = emit([
      "- valueset is `" + DECLARED + "`.",
      "- system is `http://www.ama-assn.org/go/cpt`.",
      "- code is `15822`.",
    ]);
    expect(decls(r.cql)).toEqual([`valueset "X Codes": '${SLUG}'`]);
  });

  // ⚠ THE REGRESSION THIS MUST NOT CAUSE. A PURE reference has no codes, and its canonical is the
  // deployment-swap contract: the real value set is swapped in AT THAT URL, so it must be emitted verbatim
  // and must NOT move to our slug.
  it("a PURE reference still binds its DECLARED canonical, not our slug", () => {
    const r = emit(["- valueset is `" + DECLARED + "`."]);
    expect(decls(r.cql)).toEqual([`valueset "X Codes": '${DECLARED}'`]);
  });

  it("a codes-only terminology is unchanged", () => {
    const r = emit(["- system is `http://snomed.info/sct`.", "- code is `73761001`."]);
    expect(decls(r.cql)).toEqual([`valueset "X Codes": '${SLUG}'`]);
  });
});

describe("#316 — a caller with no policy id is told THAT, not blamed for a duplicate", () => {
  // ⚠ THE REVIEW CATCH. The single-`valueset` branch needs `canonicalBase` + `policyId` to build the url.
  // Without them it used to fall through and emit one `code "<terminology>"` per code — which the new
  // postflight then refused, telling the author their terminology declares an identifier three times. That
  // is true of the output and NOT their fault. `emit_cql` over INLINE source is exactly this caller: the
  // policy id is read from a resolved project root, so text has none.
  it("refuses by name, and does NOT report a duplicate", () => {
    const src = [
      "# T",
      'library "T".',
      'terminology "X Codes":',
      "- system is `http://www.ama-assn.org/go/cpt`.",
      "- code is `15822`.",
      "- code is `15823`.",
      'concept "Requested Service":',
      "- type is ServiceRequest.",
      '- coded from "X Codes".',
      "",
    ].join("\n");
    const r = emitCQL(src, { libraryName: "T" }) as unknown as Record<string, unknown>;
    const kinds = ((r.errors ?? []) as Array<{ kind?: string }>).map((e) => String(e.kind));
    expect(kinds).toContain("emit-terminology-needs-policy-id");
    expect(kinds).not.toContain("emit-duplicate-top-level-identifier");
    expect(r.success).toBe(false);
  });
});

describe("#316 — emit REFUSES duplicate top-level identifiers", () => {
  // ⚠ THE END-TO-END GUARD LIVES IN `lowerLocalCodes.test.ts`, beside the D1 conflicting-codesystem
  // fixture — the one remaining path that deliberately emits a duplicate. It is the only vector left:
  // every other route to a duplicate is now refused by name before the postflight sees it.

  it("finds a duplicate whatever declaration form mints it", () => {
    const cql = [
      'library "T"',
      `valueset "X": 'u'`,
      `codesystem "X System": 'u'`,
      `code "X": '1' from "X System"`,
      `code "X": '2' from "X System"`,
      `define "Y": true`,
    ].join("\n");
    expect([...duplicateTopLevelIdentifiers(cql)]).toEqual([["X", 3]]);
  });

  it("is quiet on valid CQL, and does not count `context`/`include`", () => {
    const cql = [
      'library "T"',
      'include "Other" version \'1\'',
      "context Patient",
      `valueset "X": 'u'`,
      `define "Y": true`,
      `define function "F"(a Integer): a`,
    ].join("\n");
    expect(duplicateTopLevelIdentifiers(cql).size).toBe(0);
  });

  // `define function "F"` must be read as declaring `F`, not as a second `define` named `function`.
  it("reads a function's NAME, so two functions do not read as one duplicate", () => {
    const cql = [`define function "F"(a Integer): a`, `define function "G"(a Integer): a`].join("\n");
    expect(duplicateTopLevelIdentifiers(cql).size).toBe(0);
  });
});
