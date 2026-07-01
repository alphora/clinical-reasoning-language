import { Validator, RESERVED_CATALOG_LIBRARY_NAMES } from "../validator";

import { makeTestCRL } from "./testUtils";

/**
 * #187 — an author `library "<name>"` declared with a name reserved for the
 * emitter's shared catalog libraries (CRLCommon / CaseFeatureCommon / FHIRHelpers)
 * is a HARD validation error, so it can never collide with the emitted catalog
 * copy (whose FHIR Library url is name-based while a policy root Library's is
 * policy-id-based — the downstream url-skip could miss the clash).
 */
describe("reserved catalog library names (#187)", () => {
  const validator = new Validator();

  for (const reserved of ["CRLCommon", "CaseFeatureCommon", "FHIRHelpers"]) {
    it(`rejects an author library named "${reserved}"`, () => {
      const ast = makeTestCRL([], reserved);
      const result = validator.validate(ast);
      expect(result.isValid).toBe(false);
      const err = result.errors.find((e) => e.kind === "reserved-library-name");
      expect(err).toBeDefined();
      expect((err as { reservedName?: string }).reservedName).toBe(reserved);
      expect(err!.severity).toBe("error");
      expect(err!.message).toMatch(/reserved/i);
    });
  }

  it("allows a normal author library name", () => {
    const ast = makeTestCRL([], "My Policy");
    const result = validator.validate(ast);
    expect(result.errors.some((e) => e.kind === "reserved-library-name")).toBe(false);
  });

  it("is a hard error even under soft mode (structural defect, never demoted)", () => {
    const ast = makeTestCRL([], "CRLCommon");
    const result = validator.validate(ast, { soft: true });
    expect(result.errors.some((e) => e.kind === "reserved-library-name")).toBe(true);
    expect(result.warnings.some((e) => e.kind === "reserved-library-name")).toBe(false);
  });

  it("the reserved set is exactly the three catalog library names", () => {
    expect([...RESERVED_CATALOG_LIBRARY_NAMES].sort()).toEqual([
      "CRLCommon",
      "CaseFeatureCommon",
      "FHIRHelpers",
    ]);
  });
});
