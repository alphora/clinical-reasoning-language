import type { CRL, LibraryDeclaration, Statement, Location } from "../../ast/types";

const dummyLoc: Location = {
  start: { line: 1, column: 0 },
  end: { line: 1, column: 0 },
};

/**
 * Build a minimal CRL AST for validator tests.
 *
 * v2.1.0 makes `library` a required field on the AST root. This helper
 * synthesizes one with a default name ("TestLibrary") so test callsites
 * stay terse — pass an explicit `libraryName` to override.
 *
 * The 22 validator-test files that hand-build CRL literals all use this
 * to add the new required field in one keystroke per call site.
 */
export function makeTestCRL(
  statements: Statement[],
  libraryName = "TestLibrary",
): CRL {
  const library: LibraryDeclaration = {
    type: "LibraryDeclaration",
    name: libraryName,
    location: dummyLoc,
  };
  return {
    type: "CRL",
    library,
    includes: [],
    statements,
    location: dummyLoc,
  };
}
