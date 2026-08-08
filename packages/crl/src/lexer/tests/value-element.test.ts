import { describe, test, expect } from "vitest";

import { CRLLexer } from "../../grammar/generated/antlr/CRLLexer";
import { createLexer } from "../createLexer";

// Concept-model redesign Todo 1 (disc 394): the new `value element is <path>.` surface
// (a dedicated VALUE_ELEMENT_MODE dotted-path token with house error-recovery) and the
// `exists` keyword that must still tokenize as a narrative word in kebab context.

function lexAll(input: string): { types: number[]; texts: string[] } {
  const { lexer } = createLexer(input);
  const types: number[] = [];
  const texts: string[] = [];
  let token = lexer.nextToken();
  while (token.type !== CRLLexer.EOF) {
    types.push(token.type);
    texts.push(token.text ?? "");
    token = lexer.nextToken();
  }
  return { types, texts };
}

function lexErrors(input: string): { type: string; message: string }[] {
  const { lexer, errorListener } = createLexer(input);
  while (lexer.nextToken().type !== CRLLexer.EOF) {
    /* drain */
  }
  return errorListener.getErrors();
}

describe("value element is — path tokenization (VALUE_ELEMENT_MODE)", () => {
  test("a two-segment path is ONE VALUE_ELEMENT_PATH token; the trailing `.` is DOT", () => {
    const { types, texts } = lexAll("value element is Observation.value.");
    expect(types).toEqual([CRLLexer.VALUE_ELEMENT_IS, CRLLexer.VALUE_ELEMENT_PATH, CRLLexer.DOT]);
    expect(texts).toEqual(["value element is", "Observation.value", "."]);
  });

  test("recognizes Patient.birthDate", () => {
    const { texts } = lexAll("value element is Patient.birthDate.");
    expect(texts).toEqual(["value element is", "Patient.birthDate", "."]);
  });

  test("a single-segment path LEXES (validator rejects non-resource-qualified in Todo 2)", () => {
    const { types, texts } = lexAll("value element is value.");
    expect(types).toEqual([CRLLexer.VALUE_ELEMENT_IS, CRLLexer.VALUE_ELEMENT_PATH, CRLLexer.DOT]);
    expect(texts).toEqual(["value element is", "value", "."]);
  });

  test("`value element is` diverges from `value type is` — no prefix collision", () => {
    // Both share the `value ` prefix; the lexer must not mis-tokenize one as the other.
    expect(lexAll("value type is Quantity.").types[0]).toBe(CRLLexer.VALUE_TYPE_IS);
    expect(lexAll("value element is Observation.value.").types[0]).toBe(CRLLexer.VALUE_ELEMENT_IS);
  });

  test("whitespace and a block comment inside the mode are skipped", () => {
    const { texts } = lexAll("value element is   /* note */  Observation.value  .");
    expect(texts).toEqual(["value element is", "Observation.value", "."]);
  });
});

describe("value element is — malformed-path error recovery (house pattern)", () => {
  test("a bracketed choice path `value[x]` fires a structured lexical error, not a stuck mode", () => {
    const errors = lexErrors("value element is value[x].");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].type).toBe("LexicalError");
  });

  test("a stray leading dot recovers with an error", () => {
    const errors = lexErrors("value element is .value.");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].type).toBe("LexicalError");
  });

  test("structural delimiters `(` / `)` in the mode are enveloped (broadened alt1), not left to raw recovery", () => {
    const errors = lexErrors("value element is (x).");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].type).toBe("LexicalError");
  });

  test("after a malformed path the lexer has returned to DEFAULT_MODE (recovery is clean)", () => {
    // The `.` terminator after `value[x]` must lex as a normal structural DOT, proving the
    // error token exited VALUE_ELEMENT_MODE rather than cascading raw recognition errors.
    const { types } = lexAll("value element is value[x].");
    expect(types[types.length - 1]).toBe(CRLLexer.DOT);
  });
});

describe("exists — keyword vs narrative word", () => {
  test("bare `exists` is the EXISTS keyword", () => {
    const { types, texts } = lexAll("exists");
    expect(types).toEqual([CRLLexer.EXISTS]);
    expect(texts).toEqual(["exists"]);
  });

  test("`defined as exists` lexes DEFINED_AS then EXISTS", () => {
    const { types } = lexAll("defined as exists");
    expect(types).toEqual([CRLLexer.DEFINED_AS, CRLLexer.EXISTS]);
  });

  test("a kebab word `exists-foo` stays NARRATIVE_WORD (longest match wins)", () => {
    const { types, texts } = lexAll("exists-foo");
    expect(types).toEqual([CRLLexer.NARRATIVE_WORD]);
    expect(texts).toEqual(["exists-foo"]);
  });
});
