import { buildCRL } from "../../index";
import { CRL, LibraryDeclaration, Include } from "../types";

import { parseInput } from "./parseInput";

describe("Library + Include Structure", () => {
  describe("library declaration", () => {
    it("should parse a library declaration without version", () => {
      const input = `# H
library "Foo".
concept "X":
- type is Observation.
- coded from "Y".
`;
      const ast: CRL = parseInput(input);
      expect(ast.library).toBeDefined();
      expect(ast.library?.name).toBe("Foo");
      expect(ast.library?.version).toBeUndefined();
    });

    it("should parse a library declaration with version", () => {
      const input = `# H
library "Foo" version '1.0.0'.
concept "X":
- type is Observation.
- coded from "Y".
`;
      const ast: CRL = parseInput(input);
      expect(ast.library).toBeDefined();
      expect(ast.library?.name).toBe("Foo");
      expect(ast.library?.version).toBe("1.0.0");
    });

    it("should preserve library location info", () => {
      const input = `# H
library "Foo" version '1.0.0'.
concept "X":
- type is Observation.
- coded from "Y".
`;
      const ast: CRL = parseInput(input);
      expect(ast.library?.location.start.line).toBe(2);
    });
  });

  describe("include declarations", () => {
    it("should parse a single include", () => {
      const input = `# H
include "Bar" version '2.0.0'.
concept "X":
- type is Observation.
- coded from "Y".
`;
      const ast: CRL = parseInput(input);
      expect(ast.includes).toHaveLength(1);
      expect(ast.includes[0].name).toBe("Bar");
      expect(ast.includes[0].version).toBe("2.0.0");
    });

    it("should parse a single include without version", () => {
      const input = `# H
include "Bar".
concept "X":
- type is Observation.
- coded from "Y".
`;
      const ast: CRL = parseInput(input);
      expect(ast.includes).toHaveLength(1);
      expect(ast.includes[0].name).toBe("Bar");
      expect(ast.includes[0].version).toBeUndefined();
    });

    it("should parse multiple includes preserving order", () => {
      const input = `# H
include "A" version '1.0.0'.
include "B".
include "C" version '3.0.0'.
concept "X":
- type is Observation.
- coded from "Y".
`;
      const ast: CRL = parseInput(input);
      expect(ast.includes).toHaveLength(3);
      expect(ast.includes.map((i: Include) => i.name)).toEqual(["A", "B", "C"]);
      expect(ast.includes[0].version).toBe("1.0.0");
      expect(ast.includes[1].version).toBeUndefined();
      expect(ast.includes[2].version).toBe("3.0.0");
    });

    it("should preserve include location info", () => {
      const input = `# H
include "Bar" version '2.0.0'.
concept "X":
- type is Observation.
- coded from "Y".
`;
      const ast: CRL = parseInput(input);
      expect(ast.includes[0].location.start.line).toBe(2);
    });
  });

  describe("library + includes together (cms22 shell shape)", () => {
    it("should parse library followed by multiple includes", () => {
      const input = `# CMS22 BMI Screening and Follow-Up
library "CMS22" version '1.0.0'.
include "CMS22 Terminology" version '1.0.0'.
include "CMS22 Asserted" version '1.0.0'.
include "CMS22 Inferred" version '1.0.0'.
include "CMS22 Interface" version '1.0.0'.
`;
      const ast: CRL = parseInput(input);
      expect(ast.library?.name).toBe("CMS22");
      expect(ast.library?.version).toBe("1.0.0");
      expect(ast.includes).toHaveLength(4);
      expect(ast.includes.map((i: Include) => i.name)).toEqual([
        "CMS22 Terminology",
        "CMS22 Asserted",
        "CMS22 Inferred",
        "CMS22 Interface",
      ]);
    });
  });

  describe("backward compatibility (no library / no includes)", () => {
    it("should parse zero library + zero includes — every existing file continues to parse", () => {
      const input = `# H
concept "X":
- type is Observation.
- coded from "Y".
`;
      const ast: CRL = parseInput(input);
      expect(ast.library).toBeUndefined();
      expect(ast.includes).toEqual([]);
      expect(ast.statements).toHaveLength(1);
    });

    it("should parse zero library + includes-only (anonymous file with deps)", () => {
      const input = `# H
include "Common".
concept "X":
- type is Observation.
- coded from "Y".
`;
      const ast: CRL = parseInput(input);
      expect(ast.library).toBeUndefined();
      expect(ast.includes).toHaveLength(1);
    });

    it("should parse library-only (no includes, no statements)", () => {
      const input = `# H
library "Empty" version '1.0.0'.
`;
      const ast: CRL = parseInput(input);
      expect(ast.library?.name).toBe("Empty");
      expect(ast.includes).toEqual([]);
      expect(ast.statements).toEqual([]);
    });
  });

  describe("parse-error rejections", () => {
    it("should reject library after include (strict ordering)", () => {
      const input = `# H
include "Bar".
library "Foo".
`;
      const result = buildCRL(input);
      expect(result.success).toBe(false);
    });

    it("should reject library after a statement", () => {
      const input = `# H
concept "X":
- type is Observation.
- coded from "Y".
library "Foo".
`;
      const result = buildCRL(input);
      expect(result.success).toBe(false);
    });

    it("should reject include after a statement", () => {
      const input = `# H
concept "X":
- type is Observation.
- coded from "Y".
include "Bar".
`;
      const result = buildCRL(input);
      expect(result.success).toBe(false);
    });

    it("should reject multiple library declarations", () => {
      const input = `# H
library "A".
library "B".
`;
      const result = buildCRL(input);
      expect(result.success).toBe(false);
    });

    it("should reject library without trailing dot", () => {
      const input = `# H
library "Foo"
concept "X":
- type is Observation.
- coded from "Y".
`;
      const result = buildCRL(input);
      expect(result.success).toBe(false);
    });

    it("should reject include without trailing dot", () => {
      const input = `# H
include "Bar"
concept "X":
- type is Observation.
- coded from "Y".
`;
      const result = buildCRL(input);
      expect(result.success).toBe(false);
    });

    it("should reject empty single-quoted version (lex error per regex `+`)", () => {
      const input = `# H
library "Foo" version ''.
`;
      const result = buildCRL(input);
      expect(result.success).toBe(false);
    });
  });

  describe("narrative use of new reserved words", () => {
    // The new LIBRARY / INCLUDE / VERSION keywords are added to the
    // narrativeElement#NWord alternative — they remain usable as narrative
    // words inside `definition is` bodies so existing narrative authoring
    // is not constrained by the new top-level grammar.
    it("should allow 'library' as a narrative word in definition is", () => {
      const input = `# H
concept "X":
- type is Encounter.
- definition is "Y" library performed.
`;
      const result = buildCRL(input);
      expect(result.success).toBe(true);
    });

    it("should allow 'include' as a narrative word in definition is", () => {
      const input = `# H
concept "X":
- type is Encounter.
- definition is "Y" include performed.
`;
      const result = buildCRL(input);
      expect(result.success).toBe(true);
    });

    it("should allow 'version' as a narrative word in definition is", () => {
      const input = `# H
concept "X":
- type is Encounter.
- definition is "Y" version performed.
`;
      const result = buildCRL(input);
      expect(result.success).toBe(true);
    });
  });

  describe("LibraryDeclaration / Include AST node shape", () => {
    it("should produce LibraryDeclaration with correct type tag", () => {
      const input = `# H
library "Foo" version '1.0.0'.
`;
      const ast: CRL = parseInput(input);
      const lib = ast.library as LibraryDeclaration;
      expect(lib.type).toBe("LibraryDeclaration");
    });

    it("should produce Include with correct type tag", () => {
      const input = `# H
include "Bar" version '2.0.0'.
`;
      const ast: CRL = parseInput(input);
      expect(ast.includes[0].type).toBe("Include");
    });
  });
});
