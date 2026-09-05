/**
 * #313 — an OPTIONAL `display is` on a terminology code.
 *
 * ⚠ THE ASYMMETRY THIS CLOSES: `inlineOptionLine` REQUIRES a display, on the stated grounds that it is "the
 * text a clinician READS" and must never be derived by title-casing a code. A terminology code is read by the
 * same people — a medical-validation reviewer opening the emitted ValueSet sees `15822` and learns nothing —
 * yet could not carry one. Requested through the IEHP KE by their operator, for exactly that reason.
 *
 * ⚠ OPTIONAL here and REQUIRED there, deliberately: an inline option is an answer CRL itself offers, so we own
 * its wording; an external code's display belongs to its code system (CPT, SNOMED) and forcing a retype
 * invites drift from the authority.
 */
import { describe, expect, it } from "vitest";

import { emitValueSet } from "../valueSet";
import type { Terminology } from "../../ast/types";
import type { CpgMetadata } from "../types";

const META: CpgMetadata = {
  name: "t",
  canonicalBase: "http://example.org/crl/t",
  version: "1.0.0",
  status: "active",
  experimental: false,
  publisher: "T",
  title: "T",
  description: "T",
  contact: [],
  jurisdiction: [],
  useContext: [],
};
const loc = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } };

function emit(codes: Array<{ code: string; display?: string }>): Record<string, unknown> {
  const t: Terminology = {
    type: "Terminology",
    name: "Service Codes",
    location: loc,
    body: [
      { type: "TerminologySystem", system: "http://www.ama-assn.org/go/cpt", location: loc },
      ...codes.map((c) => ({ type: "TerminologyCode" as const, ...c, location: loc })),
    ],
  } as Terminology;
  return emitValueSet(t, "Lib", META).resource!.resource as Record<string, unknown>;
}

const concepts = (r: Record<string, unknown>) =>
  ((r.compose as { include: Array<{ concept?: unknown[] }> }).include[0].concept ?? []) as unknown[];
const contains = (r: Record<string, unknown>) => (r.expansion as { contains: unknown[] }).contains;

describe("#313 — an authored display reaches BOTH compose and expansion", () => {
  // ⚠ BOTH, and the expansion is the load-bearing one: the case-feature SD binds this value set, the
  // questionnaire generator expands that binding into `answerOption`, and `$apply`'s terminology provider
  // evaluates from the EXPANSION. A display carried only in `compose` would never reach the clinician.
  it("carries the display through to the questionnaire-facing expansion", () => {
    const r = emit([{ code: "15822", display: "Blepharoplasty, upper eyelid" }]);
    expect(concepts(r)).toEqual([{ code: "15822", display: "Blepharoplasty, upper eyelid" }]);
    expect(contains(r)).toEqual([
      { system: "http://www.ama-assn.org/go/cpt", code: "15822", display: "Blepharoplasty, upper eyelid" },
    ]);
  });

  // ⚠ THE RULE THE OPTIONALITY MUST NOT BREAK: absent stays ABSENT. Deriving a display from the code would
  // manufacture clinician-facing wording nobody wrote — the same prohibition inline options carry.
  it("emits NO display when the author gave none — never one derived from the code", () => {
    const r = emit([{ code: "15822" }]);
    expect(concepts(r)).toEqual([{ code: "15822" }]);
    expect(contains(r)).toEqual([{ system: "http://www.ama-assn.org/go/cpt", code: "15822" }]);
  });

  // Mixed authoring is legal — a display on the code the reviewer will see, none on the one taken verbatim
  // from the code system. The key is that the undisplayed code gains no invented text.
  it("keeps displayed and undisplayed codes independent", () => {
    const r = emit([{ code: "15822", display: "Upper eyelid" }, { code: "15823" }]);
    expect(concepts(r)).toEqual([{ code: "15822", display: "Upper eyelid" }, { code: "15823" }]);
  });
});
