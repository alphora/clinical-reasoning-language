// Unit tests for the shared AST-Location → ZeroBasedRange converter. Pinned because both the
// language-service diagnostics and the CRE scenario/trace contract depend on its exact semantics
// (1-based line → 0-based; column already 0-based; end-exclusive; degenerate spans → one char).
import { toZeroBasedRange } from "../contracts";

describe("toZeroBasedRange (#132 follow-on / item #2)", () => {
  it("maps a 1-based line to 0-based and keeps the 0-based column, end-exclusive", () => {
    expect(toZeroBasedRange({ start: { line: 1, column: 0 }, end: { line: 1, column: 5 } })).toEqual({
      startLine: 0,
      startCol: 0,
      endLine: 0,
      endCol: 5,
    });
  });

  it("maps a multi-line span", () => {
    expect(toZeroBasedRange({ start: { line: 3, column: 2 }, end: { line: 5, column: 7 } })).toEqual({
      startLine: 2,
      startCol: 2,
      endLine: 4,
      endCol: 7,
    });
  });

  it("collapses a degenerate (empty / inverted) span to a one-char range", () => {
    expect(toZeroBasedRange({ start: { line: 2, column: 4 }, end: { line: 2, column: 4 } })).toEqual({
      startLine: 1,
      startCol: 4,
      endLine: 1,
      endCol: 5,
    });
    expect(toZeroBasedRange({ start: { line: 4, column: 9 }, end: { line: 2, column: 1 } })).toEqual({
      startLine: 3,
      startCol: 9,
      endLine: 3,
      endCol: 10,
    });
  });

  it("clamps negatives to 0 (defensive)", () => {
    expect(toZeroBasedRange({ start: { line: 0, column: -2 }, end: { line: 0, column: 3 } })).toEqual({
      startLine: 0,
      startCol: 0,
      endLine: 0,
      endCol: 3,
    });
  });
});
