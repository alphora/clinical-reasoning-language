import { describe, it, expect } from "vitest";

import { parseCodedValueToken } from "../../cel/canonicalToken";

/**
 * ⭐⭐ #189 — A CEL CODED `value is` MAY BE A BARE INLINE-OPTION CODE.
 *
 * BOTH review arms raised this INDEPENDENTLY as [critical], and the reason is the point: without it the
 * inline-options design does not REMOVE the URL problem, it MOVES IT INTO `.cel` AND MAKES IT WORSE. The
 * concept-level answer CodeSystem is a MINTED url appearing in no authored source, so a CEL author would
 * have to reproduce the emitter's slug scheme by hand — and a typo'd system silently makes the value a
 * NON-MEMBER, i.e. a confident deny in the lane whose whole job is catching confident denies.
 *
 * ⚠ This pins the SHARED parse both lanes use. The CEL FHIR writer builds `valueCodeableConcept` from it and
 * the CRE evaluates membership from it; two hand-mirrored copies would be two chances to disagree on the
 * system axis, where a mismatch is silent.
 *
 * ⚠ END-TO-END is covered separately: `tmp/optprobe` runs a `.cel` whose facts type NO system at all and
 * gets approve/deny through the real CRE. This file pins the rule itself.
 */
const SET = { system: "http://x/CodeSystem/q-answer-codes", codes: new Set(["chronic-blepharitis", "none-of-listed"]) };

describe("#189 — a bare inline-option code resolves its system from the concept", () => {
  it("⭐ resolves a declared bare code against the concept's answer CodeSystem", () => {
    const r = parseCodedValueToken("chronic-blepharitis", SET);
    expect(r).toEqual({ parts: { system: SET.system, code: "chronic-blepharitis" } });
  });

  it("⭐ the explicit `<system>|<code>` form still works — the adversarial rows need it", () => {
    // A wrong-system / external code is how a test states a determinate NON-MEMBER on purpose. Losing this
    // would remove the only way to author the `false` row honestly.
    const r = parseCodedValueToken("http://www.ama-assn.org/go/cpt|37722", SET);
    expect(r).toEqual({ parts: { system: "http://www.ama-assn.org/go/cpt", code: "37722" } });
  });

  it("⚠ an UNOFFERED bare code is an ERROR, and that does not contradict offered-not-admissible", () => {
    // "Offered, not admissible" governs a DATUM already in the record, which may legitimately carry a code
    // nobody offered and is then a determinate non-member. A BARE token is different: there is nothing to
    // resolve its system against except the declared options, so an unoffered one has NO system at all.
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
