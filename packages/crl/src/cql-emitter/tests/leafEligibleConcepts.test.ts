// Tests for leafEligibleConcepts (#187 Todo 1b) — the fail-closed leaf-eligibility authority the MV concept-shape
// model shares with the emitter. Guards the two load-bearing claims: membership is OPTS-INDEPENDENT, and a library
// with ANY lowering error yields ∅ (fail-closed, matching the emitter's closed caseFeatureGateOpen).
import { parseInput } from "../../ast/tests/parseInput";
import { leafEligibleConcepts, lowerLocalCodes as lowerLocalCodesRaw } from "../lowerLocalCodes";

// #271 — lowering local `code is` now REQUIRES `crl.canonicalBase` (no urn
// fallback); inline-AST tests thread a fixed test base by default.
const TEST_CB = "http://example.org/crl/test";
const lowerLocalCodes: typeof lowerLocalCodesRaw = (ast, opts = {}) =>
  lowerLocalCodesRaw(ast, { canonicalBase: TEST_CB, ...opts });

const CLEAN = `# L
library "L".
terminology "H VS":
- valueset is \`urn:h\`.
concept "A":
- type is Condition.
- code is \`a\`.
concept "B":
- type is Observation.
- code is \`b\`.
- defined as ( "A" ).
concept "Height":
- type is Observation.
- value type is Quantity.
- code is \`h\`.
- source representation:
- coded from "H VS".
concept "Comp":
- defined as ( "A" sem-and "B" ).`;

// Two `code is` concepts sharing a code VALUE → emit-duplicate-local-code (a lowering hard error).
const DUP = `# D
library "D".
concept "A":
- type is Condition.
- code is \`same\`.
concept "B":
- type is Condition.
- code is \`same\`.`;

describe("leafEligibleConcepts", () => {
  it("returns the lowered `code is` names; excludes representation-bearing + non-code concepts", () => {
    const set = leafEligibleConcepts(parseInput(CLEAN));
    // A (code), B (code + defined-as both-rep) are lowered leaves; Height (code + representation) is SKIPPED;
    // Comp (defined-as only) has no code.
    expect([...set].sort()).toEqual(["A", "B"]);
  });

  it("membership is OPTS-INDEPENDENT (canonicalBase / localDomainId only shape the URL, not the gate)", () => {
    const ast = parseInput(CLEAN);
    // #271 — an ABSENT base now hard-errors, so this compares TWO DIFFERENT bases (the
    // wrapper's TEST_CB vs an explicit one) rather than absent-vs-present: membership
    // must be identical either way. `leafEligibleConcepts` covers the base-free path
    // (it passes a probe base internally).
    const withBaseA = new Set(lowerLocalCodes(ast).localCodes.map((c) => c.concept));
    const withBaseB = new Set(
      lowerLocalCodes(ast, {
        canonicalBase: "https://x/base",
        localDomainId: "policy-id",
      }).localCodes.map((c) => c.concept),
    );
    expect([...withBaseB].sort()).toEqual([...withBaseA].sort());
  });

  it("FAIL-CLOSED: a library with a lowering error → ∅ (even though localCodes is partially populated pre-error)", () => {
    const ast = parseInput(DUP);
    // Precondition: lowering DOES error, and DOES push the first concept before erroring on the second.
    const lowered = lowerLocalCodes(ast);
    expect(lowered.errors.length).toBeGreaterThan(0);
    expect(lowered.localCodes.length).toBeGreaterThan(0);
    // leafEligibleConcepts must nonetheless report nothing — the emitter emits no case-features for this library.
    expect(leafEligibleConcepts(ast).size).toBe(0);
  });
});
