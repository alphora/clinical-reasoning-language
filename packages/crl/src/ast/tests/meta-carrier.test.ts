// #203 Todo 2: the `- meta is `@tag: body`.` carrier extends from concept-only to also parse on DECISION and
// LIBRARY (the KE flags need decision/policy scope). This suite proves: (a) decision + library meta parse into
// `Decision.meta` / `LibraryDeclaration.meta`; (b) the #203 ParserError is gone; (c) POSITION is constrained
// (a real parser error for misplaced meta — via the error listener, since parseInput only surfaces builder errors);
// (d) meta-less nodes stay byte-identical (no `meta` key).
import { createParser } from "../../parser/createParser";
import { CRL, Decision, LibraryDeclaration } from "../types";

import { parseInput } from "./parseInput";

/** Parse-only: does the SYNTAX accept `input`? Returns the parser error count (0 = clean). */
const syntaxErrors = (input: string): number => {
  const { parser, parserErrorListener } = createParser(input);
  parser.crl();
  return parserErrorListener.getErrors().length;
};

const libOf = (ast: CRL): LibraryDeclaration => ast.library!;
const decisionsOf = (ast: CRL): Decision[] => ast.statements.filter((s): s is Decision => s.type === "Decision");

describe("#203 Todo 2 — meta carrier on decision + library", () => {
  describe("decision-scope meta", () => {
    it("parses leading `- meta is` on a decision → Decision.meta", () => {
      const ast = parseInput(`library "L".
decision "D":
- meta is \`@open-fork: AR vs IL; chosen AR; status open\`.
- meta is \`@fidelity-defect: axillary-only over-reach; direction over-reach; status open\`.
first:
- when "C" then recommend activity "Not Certify".
- otherwise then recommend activity "Certify".
`);
      const d = decisionsOf(ast)[0];
      expect(d.meta?.map((m) => m.text)).toEqual([
        "@open-fork: AR vs IL; chosen AR; status open",
        "@fidelity-defect: axillary-only over-reach; direction over-reach; status open",
      ]);
    });

    it("a decision with NO meta has no `meta` key (byte-identical)", () => {
      const ast = parseInput(`library "L".
decision "D":
- when "C" then recommend activity "Certify".
`);
      expect("meta" in decisionsOf(ast)[0]).toBe(false);
    });

    it("REJECTS meta AFTER the qualifier (meta must lead the body)", () => {
      expect(syntaxErrors(`library "L".
decision "D":
first:
- meta is \`@x: y\`.
- when "C" then recommend activity "Certify".
`)).toBeGreaterThan(0);
    });

    it("REJECTS meta AFTER a branch", () => {
      expect(syntaxErrors(`library "L".
decision "D":
- when "C" then recommend activity "Certify".
- meta is \`@x: y\`.
`)).toBeGreaterThan(0);
    });
  });

  describe("library-scope meta", () => {
    it("parses `- meta is` after the library declaration → LibraryDeclaration.meta", () => {
      const ast = parseInput(`library "Policy".
- meta is \`@internal-inconsistency: preamble vs operative; status open\`.
concept "X":
- type is Observation.
- code is \`x\`.
`);
      expect(libOf(ast).meta?.map((m) => m.text)).toEqual(["@internal-inconsistency: preamble vs operative; status open"]);
    });

    it("library meta comes BEFORE includes; a library with no meta has no `meta` key", () => {
      const ast = parseInput(`library "Policy".
- meta is \`@customer-confirmable: BMI reading; status open\`.
include "Shared".
concept "X":
- type is Observation.
- code is \`x\`.
`);
      expect(libOf(ast).meta?.map((m) => m.text)).toEqual(["@customer-confirmable: BMI reading; status open"]);

      const noMeta = parseInput(`library "Bare".
concept "X":
- type is Observation.
- code is \`x\`.
`);
      expect("meta" in libOf(noMeta)).toBe(false);
    });

    it("REJECTS library meta AFTER an include (meta rides the library declaration, before includes)", () => {
      expect(syntaxErrors(`library "Policy".
include "Shared".
- meta is \`@x: y\`.
concept "X":
- type is Observation.
- code is \`x\`.
`)).toBeGreaterThan(0);
    });
  });

  describe("regression — concept meta unchanged", () => {
    it("concept meta still parses (before `code is`) and a stray top-level `- when` still errors", () => {
      const ast = parseInput(`library "L".
concept "X":
- type is Observation.
- meta is \`@description: gloss\`.
- code is \`x\`.
`);
      const c = ast.statements.find((s) => s.type === "Concept") as { meta?: { text: string }[] };
      expect(c.meta?.map((m) => m.text)).toEqual(["@description: gloss"]);
      // only `- meta is` is newly admitted at the top level; a stray dashed line still errors.
      expect(syntaxErrors(`library "L".\n- when "C" then recommend activity "Certify".\n`)).toBeGreaterThan(0);
    });
  });
});
