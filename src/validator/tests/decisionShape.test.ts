import { readFileSync } from "fs";
import { join } from "path";

import type { Decision } from "../../ast/types";
import type { SourceContext } from "../../imports/scopes";
import { DecisionShapeValidator } from "../decisionShapeValidator";
import type { DecisionShapeError, ValidationError } from "../validator";
import { Validator } from "../validator";

import { parseInput } from "../../ast/tests/parseInput";
import { createParser } from "../../parser/createParser";

/**
 * Decision-shape structural rules (first/any/all/otherwise legality).
 * See src/validator/decisionShapeValidator.ts and docs/decision-shapes.md.
 *
 * These cases are all grammatically VALID — homogeneity and the `end` closer
 * are grammar-enforced — so they parse cleanly and exercise only the semantic
 * rules. Unresolved-reference errors (the snippets reference undeclared
 * concepts/activities) are filtered out; we assert only on `decision-shape`.
 */
function validate(src: string): ValidationError[] {
  const ast = parseInput(`# T\nlibrary "T".\n${src}`);
  return new Validator().validate(ast).errors;
}

function shapeRules(src: string): string[] {
  return validate(src)
    .filter((e) => e.kind === "decision-shape")
    .map((e) => (e as DecisionShapeError).rule);
}

describe("decision-shape validator", () => {
  describe("valid shapes (no decision-shape errors)", () => {
    it("first: over branches with trailing otherwise", () => {
      expect(
        shapeRules(`decision "D":
first:
- when "A" then recommend activity "X".
- when "B" then recommend activity "Y".
- otherwise then recommend activity "Z".`),
      ).toEqual([]);
    });

    it("first: with one when + otherwise (otherwise counts toward cardinality)", () => {
      // 2-member block — qualifier required and satisfied; not single-member.
      expect(
        shapeRules(`decision "D":
first:
- when "A" then recommend activity "X".
- otherwise then recommend activity "Z".`),
      ).toEqual([]);
    });

    it("all: over branches (no otherwise required)", () => {
      expect(
        shapeRules(`decision "D":
all:
- when "A" then recommend activity "X".
- when "B" then recommend activity "Y".`),
      ).toEqual([]);
    });

    it("any: over actions inside a matched branch", () => {
      expect(
        shapeRules(`decision "D":
first:
- when "A" then:
  any:
  - recommend activity "X".
  - recommend activity "Y".
  end.
- otherwise then recommend activity "Z".`),
      ).toEqual([]);
    });

    it("single-branch decision needs no qualifier", () => {
      expect(
        shapeRules(`decision "D":
- when "A" then recommend activity "X".`),
      ).toEqual([]);
    });

    it("nested first: may omit otherwise (optional when nested)", () => {
      expect(
        shapeRules(`decision "D":
first:
- when "A" then:
  first:
  - when "B" then recommend activity "X".
  - when "C" then recommend activity "Y".
  end.
- otherwise then recommend activity "Z".`),
      ).toEqual([]);
    });
  });

  describe("invalid shapes", () => {
    it("any: over branches → any-over-branches", () => {
      expect(
        shapeRules(`decision "D":
any:
- when "A" then recommend activity "X".
- when "B" then recommend activity "Y".`),
      ).toContain("any-over-branches");
    });

    it("first: over actions → first-over-actions", () => {
      expect(
        shapeRules(`decision "D":
- when "A" then:
  first:
  - recommend activity "X".
  - recommend activity "Y".
  end`),
      ).toContain("first-over-actions");
    });

    it("multi-branch with no qualifier → qualifier-required", () => {
      expect(
        shapeRules(`decision "D":
- when "A" then recommend activity "X".
- when "B" then recommend activity "Y".`),
      ).toContain("qualifier-required");
    });

    it("single-member block with a qualifier → qualifier-on-single-member", () => {
      expect(
        shapeRules(`decision "D":
first:
- when "A" then recommend activity "X".`),
      ).toContain("qualifier-on-single-member");
    });

    it("top-level first: without otherwise → otherwise-required", () => {
      expect(
        shapeRules(`decision "D":
first:
- when "A" then recommend activity "X".
- when "B" then recommend activity "Y".`),
      ).toContain("otherwise-required");
    });

    it("otherwise not last → otherwise-misplaced", () => {
      expect(
        shapeRules(`decision "D":
first:
- when "A" then recommend activity "X".
- otherwise then recommend activity "Z".
- when "B" then recommend activity "Y".`),
      ).toContain("otherwise-misplaced");
    });

    it("otherwise in an all: block → otherwise-misplaced", () => {
      expect(
        shapeRules(`decision "D":
all:
- when "A" then recommend activity "X".
- otherwise then recommend activity "Z".`),
      ).toContain("otherwise-misplaced");
    });

    it("decision body of only otherwise → otherwise-only", () => {
      expect(
        shapeRules(`decision "D":
- otherwise then recommend activity "Z".`),
      ).toContain("otherwise-only");
    });

    it("single otherwise with a qualifier → both otherwise-only and qualifier-on-single-member", () => {
      const rules = shapeRules(`decision "D":
first:
- otherwise then recommend activity "Z".`);
      expect(rules).toContain("otherwise-only");
      expect(rules).toContain("qualifier-on-single-member");
    });

    it("unqualified when+otherwise reports only qualifier-required (no double otherwise-misplaced)", () => {
      expect(
        shapeRules(`decision "D":
- when "A" then recommend activity "X".
- otherwise then recommend activity "Z".`),
      ).toEqual(["qualifier-required"]);
    });
  });
});

describe("empty reference is no longer a silent sentinel", () => {
  it("when \"\" fires a normal unresolved-reference (the old `when \"\"` sentinel is gone)", () => {
    // `X` is declared so the only unresolved ref is the empty concept name.
    const errs = validate(`decision "D":
- when "" then recommend activity "X".
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.`);
    expect(errs.some((e) => e.kind === "unresolved-reference")).toBe(true);
    // It is NOT silently skipped, and it is not a decision-shape error.
    expect(errs.some((e) => e.kind === "decision-shape")).toBe(false);
  });
});

describe("dme101-030 fixture (the real authoring artifact)", () => {
  it("parses and has a valid decision shape (no decision-shape errors)", () => {
    // Guards the first real policy encoding against grammar/shape regressions.
    // Concepts are now implemented as `coded from` case-features (see the .cel
    // cases that assert against them); the decision SHAPE must stay clean.
    const src = readFileSync(
      join(__dirname, "../../tests/fixtures/policies/dme101-030/dme101-030.crl"),
      "utf-8",
    );
    const ast = parseInput(src);
    const shape = new Validator()
      .validate(ast)
      .errors.filter((e) => e.kind === "decision-shape");
    expect(shape).toEqual([]);
  });
});

describe("decision-shape errors carry source attribution in multi-file mode", () => {
  it("stamps libraryName/filePath from the owning scope", () => {
    const ast = parseInput(`# T
library "Lib A".
decision "D":
first:
- when "A" then recommend activity "X".
- when "B" then recommend activity "Y".`);
    const decision = ast.statements.find((s) => s.type === "Decision") as Decision;
    // Minimal SourceContext: the validator only reads stmt + scope.currentLibrary/filePath.
    const sources = [
      { stmt: decision, scope: { currentLibrary: "Lib A", filePath: "/proj/a.crl" } },
    ] as unknown as SourceContext[];

    const errs = new DecisionShapeValidator().validate(ast, sources);
    const shape = errs.find((e) => e.kind === "decision-shape") as DecisionShapeError;
    expect(shape.rule).toBe("otherwise-required");
    expect(shape.libraryName).toBe("Lib A");
    expect(shape.filePath).toBe("/proj/a.crl");
  });
});

describe("per-action guards (unless / only when)", () => {
  it("guarded menu items in an any: block are valid", () => {
    expect(
      shapeRules(`decision "D":
- when "A" then:
  any:
  - recommend activity "X".
  - recommend activity "Y" unless "C".
  - recommend activity "Z" only when "E".
  end.`),
    ).toEqual([]);
  });

  it("guarded menu items in an all: block are valid", () => {
    expect(
      shapeRules(`decision "D":
- when "A" then:
  all:
  - recommend activity "X" unless "C".
  - recommend activity "Y".
  end.`),
    ).toEqual([]);
  });

  it("a guard on a single (menu-less) action is rejected", () => {
    expect(
      shapeRules(`decision "D":
- when "A" then:
  - recommend activity "X" unless "C".
  end.`),
    ).toEqual(["guard-on-single-action"]);
  });
});

/** Count parser (syntax) errors — for grammar-placement assertions. */
function parseErrorCount(src: string): number {
  const { parser, parserErrorListener } = createParser(`# T\nlibrary "T".\n${src}`);
  parser.crl();
  return parserErrorListener.getErrors().length;
}

describe("per-action guard grammar placement", () => {
  it("accepts guards on action-block members (recommend + use decision)", () => {
    expect(
      parseErrorCount(`decision "D":
- when "A" then:
  any:
  - recommend activity "X" unless "C".
  - use decision "Sub" only when "E".
  end.`),
    ).toBe(0);
  });

  it("rejects a guard on an inline when-action", () => {
    expect(
      parseErrorCount(`decision "D":
- when "A" then recommend activity "X" unless "C".`),
    ).toBeGreaterThan(0);
  });

  it("rejects a guard on an otherwise action", () => {
    expect(
      parseErrorCount(`decision "D":
first:
- when "A" then recommend activity "X".
- otherwise then recommend activity "Y" unless "C".`),
    ).toBeGreaterThan(0);
  });

  it("'unless' / 'only when' still parse as narrative words", () => {
    expect(
      parseErrorCount(`concept "X":
- type is Observation.
- definition is documented unless only when later.`),
    ).toBe(0);
  });
});

describe("per-action guard reference resolution", () => {
  it("an unknown guard concept is an unresolved reference", () => {
    const errs = validate(`decision "D":
- when "A" then:
  any:
  - recommend activity "X".
  - recommend activity "Y" unless "Ghost".
  end.`);
    expect(
      errs.some((e) => e.kind === "unresolved-reference" && /Ghost/.test(e.message)),
    ).toBe(true);
  });
});
