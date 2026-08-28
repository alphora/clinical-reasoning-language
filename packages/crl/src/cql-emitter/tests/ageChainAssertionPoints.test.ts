import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import { buildCRL, validateCRL } from "../../index";

/**
 * Age chain — the ASSERTION POINTS for one gate, and the language gap that limits them.
 *
 * A user must be able to satisfy a gate from whatever they actually have. Patient age has two working
 * assertion points (supply `Patient.birthDate`, or assert the boolean) which recency-merge on one concept.
 * A third — asserting a BIRTH DATE as its own sub-question — is not expressible, and the tests below pin
 * exactly WHY, so the reason survives as executable fact rather than as a claim in a comment.
 *
 * Both failing forms below were things I asserted "don't exist", checked, and found DO exist
 * (`"X" at least <Q>` and `age at <anchor>`). What actually blocks the chain is different and narrower.
 */
const FIXTURE = path.resolve(__dirname, "fixtures/age-chain/age-chain.crl");
const src = () => fs.readFileSync(FIXTURE, "utf8");

const errorsFor = (crl: string): { kind?: string; message: string }[] => {
  const v = validateCRL(crl) as unknown as { errors?: { kind?: string; message: string }[] };
  return v.errors ?? [];
};

describe("age chain — assertion points", () => {
  it("the two WORKING points live on one concept and validate clean", () => {
    expect(buildCRL(src()).success).toBe(true);
    expect(errorsFor(src())).toEqual([]);
  });

  // ── GAP 1: a numeric age concept cannot be authored via `definition is age today`.
  it("`definition is age today` is RETIRED — age is a posrep `value projection` (#257)", () => {
    const crl = `library "T".\nconcept "Patient Age":\n- type is Observation.\n- value type is Quantity.\n- definition is age today.\n`;
    expect(errorsFor(crl).map((e) => e.kind)).toContain("age-predicate-unsupported");
  });

  // ── GAP 2 — the real blocker for an assertable birth date. `age today …` lowers to CQL
  // `AgeInYearsAt(anchor)`, which reads `birthDate` from the PATIENT CONTEXT. There is no overload
  // taking a birth date operand, so a locally-asserted `Patient Birth Date` concept can never feed the
  // age calculation — which is what makes point 2 inexpressible. Pinned on the catalog so the constraint
  // is visible where it actually lives.
  it("age is hard-wired to Patient.birthDate — no overload takes an asserted date", () => {
    const crlCommon = fs.readFileSync(
      path.resolve(__dirname, "../catalog/CRLCommon.cql"),
      "utf8",
    );
    expect(crlCommon).toMatch(/AgeInYearsAt\(/);
    // No `AgeInYearsAt(<birthDate>, <asOf>)`-style two-argument call exists. Checked with a PAREN-DEPTH scan,
    // not a regex: `/AgeInYearsAt\([^)]+,[^)]+\)/` false-fails the day a SINGLE-argument call carries a nested
    // expression containing a comma (`AgeInYearsAt(start of Interval[a, b])`). Only a comma at argument depth
    // separates arguments.
    const twoArgCalls = [...crlCommon.matchAll(/AgeInYearsAt\s*\(/g)].filter((m) => {
      let depth = 0;
      for (let i = m.index! + m[0].length - 1; i < crlCommon.length; i++) {
        const ch = crlCommon[i];
        if (ch === "(") depth++;
        else if (ch === ")") {
          depth--;
          if (depth === 0) return false; // closed with no top-level comma → single argument
        } else if (ch === "," && depth === 1) return true;
      }
      return false;
    });
    expect(twoArgCalls).toEqual([]);
  });
});
