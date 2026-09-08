import { describe, it, expect } from "vitest";

import { parseCodedValueToken } from "../../cel/canonicalToken";

const SET = ["chronic-blepharitis", "none-of-listed"].map((code) => ({ system: "http://x/CodeSystem/q-answer-codes", code }));

describe("#189 — a bare inline-option code resolves its system from the concept", () => {
  it("⭐ resolves a declared bare code against the concept's answer CodeSystem", () => {
    const r = parseCodedValueToken("chronic-blepharitis", SET);
    expect(r).toEqual({ parts: { system: SET[0].system, code: "chronic-blepharitis" } });
  });

  it("⭐ the explicit `<system>|<code>` form still works — the adversarial rows need it", () => {
    // Explicit system/code tokens permit adversarial inputs; parsing does not
    // determine whether later answer interpretation returns false or an error.
    const r = parseCodedValueToken("http://www.ama-assn.org/go/cpt|37722", SET);
    expect(r).toEqual({ parts: { system: "http://www.ama-assn.org/go/cpt", code: "37722" } });
  });

  it("⚠ an UNOFFERED bare code is an ERROR, and that does not contradict offered-not-admissible", () => {
    // A bare token needs a unique offered system. An unoffered explicit token can
    // be parsed, but a selected publication can still reject its interpretation.
    const r = parseCodedValueToken("never-declared", SET);
    expect("error" in r).toBe(true);
    // The message must name the escape hatch, or an author reads this as "unoffered values are illegal".
    expect((r as { error: string }).error).toContain("<system>|<code>");
  });

  it("⚠ a bare code with NO answer set still fails — no set, nothing to resolve against", () => {
    // A concept without inline options gets the unchanged strict rule: a systemless coded value is an
    // author error, because nothing can say what system it belongs to.
    const r = parseCodedValueToken("chronic-blepharitis", undefined);
    expect("error" in r).toBe(true);
  });

  it("⚠ an empty bare token is refused rather than resolved to an empty code", () => {
    expect("error" in parseCodedValueToken("   ", SET)).toBe(true);
  });
});
