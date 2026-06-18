import * as path from "path";

import { validateCRLImports } from "../validate";

const FIXTURES = path.resolve(__dirname, "fixtures");

describe("validateCRLImports", () => {
  it("passes validation on the cms22-split fixture", () => {
    const root = path.join(FIXTURES, "cms22-split", "cms22.crl");
    const result = validateCRLImports(root);
    expect(result.success).toBe(true);
    expect(result.validationErrors).toHaveLength(0);
    expect(result.importDiagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  it("resolves a ref in the root that points at a concept declared in a leaf library", () => {
    const root = path.join(FIXTURES, "cross-file-ref", "root.crl");
    const result = validateCRLImports(root);
    expect(result.success).toBe(true);
    expect(result.validationErrors).toHaveLength(0);
  });

  it("reports a validator error for a ref that points at no declaration in the include graph", () => {
    const root = path.join(FIXTURES, "cross-file-unresolved-ref", "root.crl");
    const result = validateCRLImports(root);
    expect(result.success).toBe(false);
    const refErr = result.validationErrors.find((e) =>
      /Not Declared Anywhere/.test(e.message),
    );
    expect(refErr).toBeDefined();
    // The error should be attributed to the root file (where the bad ref lives).
    expect(refErr?.filePath).toBe(path.join(FIXTURES, "cross-file-unresolved-ref", "root.crl"));
    expect(refErr?.libraryName).toBe("Root");
  });

  it("soft mode demotes cross-file unresolved-ref errors to warnings", () => {
    const root = path.join(FIXTURES, "cross-file-unresolved-ref", "root.crl");
    const result = validateCRLImports(root, { soft: true });
    expect(result.validationErrors.filter((e) => /Not Declared Anywhere/.test(e.message))).toHaveLength(0);
    expect(result.validationWarnings.find((e) => /Not Declared Anywhere/.test(e.message))).toBeDefined();
  });

  it("soft mode does NOT demote unresolved-include diagnostics from the resolver", () => {
    const root = path.join(FIXTURES, "unresolved", "root.crl");
    const result = validateCRLImports(root, { soft: true });
    const unresolved = result.importDiagnostics.find((d) => d.kind === "unresolved-include");
    expect(unresolved).toBeDefined();
    expect(unresolved?.severity).toBe("error");
    expect(result.success).toBe(false);
  });

  it("detects a cross-file ref cycle via the validator's cycleDetector on the flattened AST", () => {
    const root = path.join(FIXTURES, "cross-file-ref-cycle", "root.crl");
    const result = validateCRLImports(root);
    expect(result.success).toBe(false);
    const cycleErr = result.validationErrors.find((e) => /[Cc]ycle/.test(e.message));
    expect(cycleErr).toBeDefined();
  });

  it("v2.1.0: same concept name across two libraries is benign — no name-conflict, no duplicate-name", () => {
    const root = path.join(FIXTURES, "name-conflict", "root.crl");
    const result = validateCRLImports(root);
    // v2.1.0: cross-library same-name is legal under per-library scoping +
    // per-CRL emit. Neither the resolver-level `name-conflict` nor the
    // validator's `duplicate-name` fires.
    const conflicts = result.importDiagnostics.filter((d) => d.kind === "name-conflict");
    expect(conflicts).toHaveLength(0);
    const duplicateErrors = result.validationErrors.filter((e) => e.kind === "duplicate-name");
    expect(duplicateErrors).toHaveLength(0);
  });

  it("allows cross-kind same-name (concept BMI + terminology BMI) without validation error", () => {
    const root = path.join(FIXTURES, "cross-kind-same-name", "root.crl");
    const result = validateCRLImports(root);
    expect(result.success).toBe(true);
    expect(result.validationErrors).toHaveLength(0);
  });

  it("parse-failure warnings on a broken local file do not block success", () => {
    const root = path.join(FIXTURES, "source-path-parse-failure", "root.crl");
    const result = validateCRLImports(root);
    const warningDiags = result.importDiagnostics.filter(
      (d) => d.kind === "parse-failure" && d.severity === "warning",
    );
    expect(warningDiags.length).toBeGreaterThan(0);
    expect(result.success).toBe(true);
  });

  it("documents global-namespace visibility: any transitive declaration is visible to any library", () => {
    const root = path.join(FIXTURES, "cross-file-ref", "root.crl");
    const result = validateCRLImports(root);
    expect(result.success).toBe(true);
  });
});
