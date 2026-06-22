import { buildCRL } from "../../index";
import { CRL, LibraryDeclaration, Include } from "../types";

import { parseInput } from "./parseInput";

describe("Library + Include Structure", () => {
  describe("library declaration", () => {
    it("parses a library declaration", () => {
      const input = `# H
library "Foo".
concept "X":
- type is Observation.
- coded from "Y".
`;
      const ast: CRL = parseInput(input);
      expect(ast.library).toBeDefined();
      expect(ast.library?.name).toBe("Foo");
    });

    it("preserves library location info", () => {
      const input = `# H
library "Foo".
concept "X":
- type is Observation.
- coded from "Y".
`;
      const ast: CRL = parseInput(input);
      expect(ast.library?.location.start.line).toBe(2);
    });

    it("rejects a library statement carrying a version clause", () => {
      // version was dropped in the npm-resolution redesign; the parser must reject
      // any leftover `version '...'` syntax so old files fail loudly.
      const input = `# H
library "Foo" version '1.0.0'.
`;
      const result = buildCRL(input);
      expect(result.success).toBe(false);
    });
  });

  describe("include declarations", () => {
    it("parses a single include", () => {
      const input = `# H
library "Root".
include "Bar".
concept "X":
- type is Observation.
- coded from "Y".
`;
      const ast: CRL = parseInput(input);
      expect(ast.includes).toHaveLength(1);
      expect(ast.includes[0].name).toBe("Bar");
    });

    it("parses multiple includes preserving order", () => {
      const input = `# H
library "Root".
include "A".
include "B".
include "C".
concept "X":
- type is Observation.
- coded from "Y".
`;
      const ast: CRL = parseInput(input);
      expect(ast.includes).toHaveLength(3);
      expect(ast.includes.map((i: Include) => i.name)).toEqual(["A", "B", "C"]);
    });

    it("preserves include location info", () => {
      const input = `# H
library "Root".
include "Bar".
concept "X":
- type is Observation.
- coded from "Y".
`;
      const ast: CRL = parseInput(input);
      expect(ast.includes[0].location.start.line).toBe(3);
    });

    it("rejects an include statement carrying a version clause", () => {
      const input = `# H
include "Bar" version '1.0.0'.
`;
      const result = buildCRL(input);
      expect(result.success).toBe(false);
    });
  });

  describe("library + includes together (cms22 shell shape)", () => {
    it("parses library followed by multiple includes", () => {
      const input = `# CMS22
library "CMS22".
include "CMS22 Terminology".
include "CMS22 Asserted".
include "CMS22 Inferred".
include "CMS22 Interface".
`;
      const ast: CRL = parseInput(input);
      expect(ast.library?.name).toBe("CMS22");
      expect(ast.includes).toHaveLength(4);
    });
  });

  describe("library-required (v2.1.0)", () => {
    // The anonymous-file mode that existed in v2.0.0 is gone in v2.1.0.
    // Files without a `library "Foo".` declaration fail to parse.

    it("rejects a file with no library declaration", () => {
      const input = `# H
concept "X":
- type is Observation.
- coded from "Y".
`;
      const result = buildCRL(input);
      expect(result.success).toBe(false);
    });

    it("rejects a file with includes but no library declaration", () => {
      const input = `# H
include "Common".
concept "X":
- type is Observation.
- coded from "Y".
`;
      const result = buildCRL(input);
      expect(result.success).toBe(false);
    });

    it("parses library-only (no includes, no statements)", () => {
      const input = `# H
library "Empty".
`;
      const ast: CRL = parseInput(input);
      expect(ast.library?.name).toBe("Empty");
      expect(ast.includes).toEqual([]);
      expect(ast.statements).toEqual([]);
    });
  });

  describe("#135 — leading `# header` is optional (library stays required)", () => {
    it("parses a file with no header (starts directly with `library`)", () => {
      const ast: CRL = parseInput(`library "NoHdr".\n`);
      expect(ast.library?.name).toBe("NoHdr");
      expect(ast.header).toBeUndefined(); // omitted, not ""
    });

    it("still accepts a header when present (CRL strips the leading '#')", () => {
      const ast: CRL = parseInput(`# A Title\nlibrary "Hdr".\n`);
      expect(ast.header).toBe("A Title");
      expect(ast.library?.name).toBe("Hdr");
    });

    it("rejects a header after the library statement", () => {
      expect(buildCRL(`library "Late".\n# late\n`).success).toBe(false);
    });

    it("rejects two leading `#` lines", () => {
      expect(buildCRL(`# one\n# two\nlibrary "Two".\n`).success).toBe(false);
    });
  });

  describe("parse-error rejections", () => {
    it("rejects library after include (strict ordering)", () => {
      const input = `# H
include "Bar".
library "Foo".
`;
      const result = buildCRL(input);
      expect(result.success).toBe(false);
    });

    it("rejects library after a statement", () => {
      const input = `# H
concept "X":
- type is Observation.
- coded from "Y".
library "Foo".
`;
      const result = buildCRL(input);
      expect(result.success).toBe(false);
    });

    it("rejects include after a statement", () => {
      const input = `# H
concept "X":
- type is Observation.
- coded from "Y".
include "Bar".
`;
      const result = buildCRL(input);
      expect(result.success).toBe(false);
    });

    it("rejects multiple library declarations", () => {
      const input = `# H
library "A".
library "B".
`;
      const result = buildCRL(input);
      expect(result.success).toBe(false);
    });

    it("rejects library without trailing dot", () => {
      const input = `# H
library "Foo"
concept "X":
- type is Observation.
- coded from "Y".
`;
      const result = buildCRL(input);
      expect(result.success).toBe(false);
    });

    it("rejects include without trailing dot", () => {
      const input = `# H
include "Bar"
concept "X":
- type is Observation.
- coded from "Y".
`;
      const result = buildCRL(input);
      expect(result.success).toBe(false);
    });
  });

  describe("narrative use of new reserved words", () => {
    // `library` and `include` are reserved at the top level but still
    // usable as narrative words inside `definition is` bodies.
    it("allows 'library' as a narrative word in definition is", () => {
      const input = `# H
library "Root".
concept "X":
- type is Encounter.
- definition is "Y" library performed.
`;
      const result = buildCRL(input);
      expect(result.success).toBe(true);
    });

    it("allows 'include' as a narrative word in definition is", () => {
      const input = `# H
library "Root".
concept "X":
- type is Encounter.
- definition is "Y" include performed.
`;
      const result = buildCRL(input);
      expect(result.success).toBe(true);
    });
  });

  describe("LibraryDeclaration / Include AST node shape", () => {
    it("LibraryDeclaration has the correct type tag", () => {
      const input = `# H
library "Foo".
`;
      const ast: CRL = parseInput(input);
      const lib = ast.library as LibraryDeclaration;
      expect(lib.type).toBe("LibraryDeclaration");
    });

    it("Include has the correct type tag", () => {
      const input = `# H
library "Root".
include "Bar".
`;
      const ast: CRL = parseInput(input);
      expect(ast.includes[0].type).toBe("Include");
    });
  });
});
