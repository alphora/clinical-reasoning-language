import { describe, expect, it } from "vitest";
import { parseInput } from "./parseInput";
import type { Criterion } from "../types";

// REFACTOR:grounded: descriptions preserve literal wording and are never predicate operands.
const source = (description: string) => `library "T".\ncriterion "Group":\n${description}\n- when ("A" and "B").`;
const criterion = (text: string) => parseInput(source(text)).statements[0] as Criterion;
describe("criterion description syntax", () => {
  // @kit criterion:description-syntax
  it.each(['"Supporting text."', '`First line\nSecond line <literal>.`'])("preserves %s exactly", (literal) => {
    const plain = criterion("");
    const described = criterion(`- description is ${literal}.`);
    expect(described.description).toBe(literal.slice(1, -1));
    const withoutLocations = (v: unknown) => JSON.parse(JSON.stringify(v, (key, value) => key === "location" ? undefined : value));
    expect(withoutLocations(described.condition)).toEqual(withoutLocations(plain.condition));
    expect(plain).not.toHaveProperty("description");
  });
  it.each(['""', '` \n `'])("rejects empty text %s", literal => {
    expect(() => criterion(`- description is ${literal}.`)).toThrow(/nonempty/);
  });
  it("rejects duplicate or misplaced descriptions", () => {
    expect(() => criterion('- description is "One".\n- description is "Two".')).toThrow(/syntax errors/);
    expect(() => parseInput(source("") + '\n- description is "Late".')).toThrow(/syntax errors/);
  });
  it("retains description is as ordinary narrative vocabulary", () => {
    const ast = parseInput('library "T".\nconcept "A":\n- definition is description is explanatory.');
    expect(ast.statements).toHaveLength(1);
  });
});
