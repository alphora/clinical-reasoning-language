import * as path from "path";

import { validateCRL } from "../../index";
import { validateCRLImports } from "../validate";
import { resolveImports } from "../index";

const FIXTURES = path.resolve(__dirname, "fixtures");

describe("v2.1.0 per-library scoping (commit 2c)", () => {
  describe("qualified ref to local sibling — auto-resolves without include", () => {
    it("validates cleanly when the qualified ref names a non-included local library and a declared name", () => {
      const root = path.join(FIXTURES, "qualified-ref-positive", "root.crl");
      const result = validateCRLImports(root);
      expect(result.success).toBe(true);
      expect(result.validationErrors).toHaveLength(0);
    });
  });

  describe("qualified-ref-unresolved", () => {
    it("fires qualified-ref-unresolved when target library is in scope but the name is not declared", () => {
      const root = path.join(FIXTURES, "qualified-ref-unresolved", "root.crl");
      const result = validateCRLImports(root);
      expect(result.success).toBe(false);
      const err = result.validationErrors.find(
        (e) => e.kind === "qualified-ref-unresolved",
      );
      expect(err).toBeDefined();
      if (err?.kind === "qualified-ref-unresolved") {
        expect(err.targetLibrary).toBe("Sib");
        expect(err.targetName).toBe("MissingName");
        expect(err.libraryName).toBe("Root");
      }
    });

    it("soft mode demotes qualified-ref-unresolved to a warning", () => {
      const root = path.join(FIXTURES, "qualified-ref-unresolved", "root.crl");
      const result = validateCRLImports(root, { soft: true });
      const errs = result.validationErrors.filter(
        (e) => e.kind === "qualified-ref-unresolved",
      );
      expect(errs).toHaveLength(0);
      const warns = result.validationWarnings.filter(
        (e) => e.kind === "qualified-ref-unresolved",
      );
      expect(warns).toHaveLength(1);
    });
  });

  describe("external-library-not-included", () => {
    it("fires external-library-not-included when a package qualified ref is missing its include", () => {
      const root = path.join(FIXTURES, "qualified-ref-no-include", "root.crl");
      const result = validateCRLImports(root);
      expect(result.success).toBe(false);
      const err = result.validationErrors.find(
        (e) => e.kind === "external-library-not-included",
      );
      expect(err).toBeDefined();
      if (err?.kind === "external-library-not-included") {
        expect(err.targetLibrary).toBe("SomePkg");
      }
    });

    it("soft mode does NOT demote external-library-not-included (structural)", () => {
      const root = path.join(FIXTURES, "qualified-ref-no-include", "root.crl");
      const result = validateCRLImports(root, { soft: true });
      const errs = result.validationErrors.filter(
        (e) => e.kind === "external-library-not-included",
      );
      expect(errs.length).toBeGreaterThan(0);
    });
  });

  describe("cross-library cycle", () => {
    it("detects A → B → A cycle when refs are qualified across libraries", () => {
      // Load A.crl as root so the include-walk closure has at least one node;
      // B.crl is then reached as an implicit local sibling.
      const root = path.join(FIXTURES, "cross-lib-cycle-qualified", "A.crl");
      const result = validateCRLImports(root);
      const cycle = result.validationErrors.find(
        (e) => e.kind === "reference-cycle",
      );
      expect(cycle).toBeDefined();
      expect(cycle?.message).toContain('"A"."X"');
      expect(cycle?.message).toContain('"B"."Y"');
    });
  });

  describe("per-library name uniqueness", () => {
    it("same concept name across two unrelated local libraries is benign (no duplicate-name fires)", () => {
      const root = path.join(FIXTURES, "per-library-name-uniqueness", "root.crl");
      const result = validateCRLImports(root);
      const dupes = result.validationErrors.filter(
        (e) => e.kind === "duplicate-name",
      );
      expect(dupes).toHaveLength(0);
    });
  });

  describe("alias-not-yet-supported", () => {
    it("emits a warning when an include carries an alias clause", () => {
      const root = path.join(FIXTURES, "alias-not-yet-supported", "root.crl");
      const graph = resolveImports(root);
      const aliasWarn = graph.diagnostics.find(
        (d) => d.kind === "alias-not-yet-supported",
      );
      expect(aliasWarn).toBeDefined();
      if (aliasWarn?.kind === "alias-not-yet-supported") {
        expect(aliasWarn.include.name).toBe("SomePkg");
        expect(aliasWarn.include.alias).toBe("P");
      }
    });

    it("treats the include as raw-name (v2.1 semantics) so refs to the raw name still resolve", () => {
      const root = path.join(FIXTURES, "alias-not-yet-supported", "root.crl");
      const result = validateCRLImports(root);
      // Root's `defined as "SomePkg"."Pkg C"` should resolve cleanly — alias
      // is warned but ignored.
      const refErrs = result.validationErrors.filter(
        (e) => e.kind === "external-library-not-included" || e.kind === "qualified-ref-unresolved",
      );
      expect(refErrs).toHaveLength(0);
    });
  });

  describe("redundant-local-include (v2.1.0 commit 2e)", () => {
    it("warns when an `include` resolves to a local sibling (auto-resolve makes it redundant)", () => {
      const root = path.join(FIXTURES, "redundant-local-include", "root.crl");
      const result = validateCRLImports(root);
      // Local include is redundant but the file is otherwise clean.
      expect(result.success).toBe(true);
      const warning = result.graph.diagnostics.find(
        (d) => d.kind === "redundant-local-include",
      );
      expect(warning).toBeDefined();
      if (warning?.kind === "redundant-local-include") {
        expect(warning.include.name).toBe("Sibling");
        expect(warning.from.libraryName).toBe("Root");
      }
    });

    it("does NOT warn when an include resolves to a package (even if a local of same name shadows)", () => {
      // local-package-same-name fixture: root explicitly includes Foo;
      // both local Foo and package Foo exist. Package wins package-first.
      // No redundant-local-include should fire — the include legitimately
      // resolved to the package.
      const root = path.join(FIXTURES, "local-package-same-name", "root.crl");
      const result = validateCRLImports(root);
      const warning = result.graph.diagnostics.find(
        (d) => d.kind === "redundant-local-include",
      );
      expect(warning).toBeUndefined();
    });
  });

  describe("multi-slot ref validation (v2.1.0 commit 2e)", () => {
    it("validates clean decision + activity body refs", () => {
      const root = path.join(FIXTURES, "multi-slot-refs", "root.crl");
      const result = validateCRLImports(root);
      expect(result.success).toBe(true);
      expect(result.validationErrors).toHaveLength(0);
    });

    it("fires unresolved-reference for each missing decision/activity body ref", () => {
      const root = path.join(FIXTURES, "multi-slot-refs-unresolved", "root.crl");
      const result = validateCRLImports(root);
      expect(result.success).toBe(false);
      const errs = result.validationErrors.filter(
        (e) => e.kind === "unresolved-reference",
      );
      // Expected:
      //   activity "Some Activity" with "Missing Terminology"     → 1
      //   decision "Bad Triage" when "Missing Concept" ...         → 1
      //   decision "Bad Triage" do "Missing Activity"              → 1
      //   decision "Calls Other" use decision "Missing Decision"   → 1
      expect(errs.length).toBeGreaterThanOrEqual(4);
      expect(errs.some((e) => e.message.includes("Missing Terminology"))).toBe(true);
      expect(errs.some((e) => e.message.includes("Missing Concept"))).toBe(true);
      expect(errs.some((e) => e.message.includes("Missing Activity"))).toBe(true);
      expect(errs.some((e) => e.message.includes("Missing Decision"))).toBe(true);
    });
  });

  describe("single-file validateCRL self-scope (operator-approved squiggles)", () => {
    it("treats qualified refs to the self library as bare", () => {
      const src = `# self-scope same-lib
library "Self".

concept "X":
- type is Observation.
- coded from "Self T".

terminology "Self T":
- valueset is \`urn:vs\`.

concept "Y":
- type is Observation.
- defined as "Self"."X".
`;
      const result = validateCRL(src);
      expect(result.success).toBe(true);
      expect(result.errors ?? []).toHaveLength(0);
    });

    it("fires external-library-not-included for qualified refs to non-self libraries (single-file mode)", () => {
      const src = `# self-scope other-lib qualified ref
library "Self".

concept "X":
- type is Observation.
- coded from "Self T".

terminology "Self T":
- valueset is \`urn:vs\`.

concept "Y":
- type is Observation.
- defined as "Other"."X".
`;
      const result = validateCRL(src);
      const err = result.errors.find(
        (e) => e.type === "Validation" && /external-library-not-included|"Other"/.test(e.message),
      );
      expect(err).toBeDefined();
    });
  });
});
