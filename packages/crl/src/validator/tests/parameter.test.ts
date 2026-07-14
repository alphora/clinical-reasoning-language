import { describe, expect, it } from "vitest";

import { validateCRL } from "../../index";

// v2.2 issue #59 — Todo 2 tests covering NameUniquenessValidator and
// ReferenceResolver for parameter declarations.

describe("parameter declarations — Todo 2: per-library uniqueness", () => {
  it("flags duplicate parameter names in the same library", () => {
    const r = validateCRL(`# T
library "T".
parameter "Measurement Period":
- param type is Period.
parameter "Measurement Period":
- param type is Patient.
`);
    expect(r.success).toBe(false);  // validation fails on the duplicate
    expect(r.errors?.some((e) => e.kind === "duplicate-name" && /parameter/i.test(e.message))).toBe(true);
  });

  // Empty parameter name is intercepted at AST build time (same pattern
  // as ConceptStatement / DecisionStatement). The validator's
  // `empty-name` check fires only on synthetic AST nodes with
  // `name: ""` — not on parser-generated empty quoted strings.

  it("allows cross-kind same-name (parameter X + concept X coexist)", () => {
    const r = validateCRL(`# T
library "T".
parameter "BMI":
- param type is Period.
concept "BMI":
- type is Observation.
- value type is Quantity.
- defined as "BMI".
`);
    // No duplicate-name errors (cross-kind same-name is legal under v2.1.0).
    expect((r.errors ?? []).filter((e) => e.kind === "duplicate-name")).toHaveLength(0);
  });
});

describe("parameter declarations — Todo 2: narrative-slot acceptance (Option C-lite)", () => {
  it("narrative ref resolves to a parameter when the parameter is declared", () => {
    const r = validateCRL(`# T
library "T".
parameter "Measurement Period":
- param type is Period.
concept "Observed":
- type is Observation.
- value type is boolean.
- definition is "Measurement Period" performed.
`);
    // No unresolved-reference for "Measurement Period" — it resolves via the parameter bucket.
    const unresolved = (r.errors ?? []).filter((e) => e.kind === "unresolved-reference" && /Measurement Period/.test(e.message));
    expect(unresolved).toHaveLength(0);
  });

  it("narrative ref to a non-existent name fires unresolved-reference naming both concept AND parameter", () => {
    const r = validateCRL(`# T
library "T".
concept "Observed":
- type is Observation.
- value type is boolean.
- definition is "NoSuchThing" performed.
`);
    const msg = (r.errors ?? []).find((e) => e.kind === "unresolved-reference" && /NoSuchThing/.test(e.message))?.message;
    expect(msg).toBeDefined();
    expect(msg).toMatch(/concept or parameter/);
  });
});

describe("parameter declarations — Todo 2: negative tests for slots that stay single-kind", () => {
  it("`coded from \"P\"` where P is a parameter → terminology unresolved (still single-kind)", () => {
    const r = validateCRL(`# T
library "T".
parameter "BMI":
- param type is Period.
concept "X":
- type is Observation.
- coded from "BMI".
`);
    expect((r.errors ?? []).some((e) => e.kind === "unresolved-reference" && /terminology/i.test(e.message))).toBe(true);
  });

  it("`defined as \"P\"` (bare ref) where P is a parameter → concept unresolved", () => {
    const r = validateCRL(`# T
library "T".
parameter "BMI":
- param type is Period.
concept "X":
- type is Observation.
- value type is Quantity.
- defined as "BMI".
`);
    const msg = (r.errors ?? []).find((e) => e.kind === "unresolved-reference" && /BMI/.test(e.message))?.message;
    expect(msg).toBeDefined();
    expect(msg).toMatch(/no concept declared/);
    // Crucially, the diagnostic does NOT say "or parameter" — single-kind slot.
    expect(msg).not.toMatch(/or parameter/);
  });

  it("activity `with \"P\"` where P is a parameter → terminology unresolved", () => {
    const r = validateCRL(`# T
library "T".
parameter "BMI":
- param type is Period.
activity "A":
- request CPGServiceRequest.
- with "BMI".
`);
    expect((r.errors ?? []).some((e) => e.kind === "unresolved-reference" && /terminology/i.test(e.message))).toBe(true);
  });
});

describe("parameter declarations — Todo 2: qualified-ref slot acceptance (Option C-lite)", () => {
  // Note: single-file validation can't synthesize cross-library scopes,
  // so the qualified-self-ref path is what we can exercise here. The
  // multi-file qualified path is covered by `src/imports/tests/`.

  it("self-qualified narrative ref to a parameter resolves", () => {
    const r = validateCRL(`# T
library "T".
parameter "Measurement Period":
- param type is Period.
concept "Observed":
- type is Observation.
- value type is boolean.
- definition is "T"."Measurement Period" performed.
`);
    const unresolved = (r.errors ?? []).filter((e) => /Measurement Period/.test(e.message));
    expect(unresolved).toHaveLength(0);
  });

  it("self-qualified `coded from` to a parameter still fires terminology unresolved", () => {
    const r = validateCRL(`# T
library "T".
parameter "BMI":
- param type is Period.
concept "X":
- type is Observation.
- coded from "T"."BMI".
`);
    expect((r.errors ?? []).some((e) => /BMI/.test(e.message))).toBe(true);
  });
});

describe("parameter declarations — Todo 2: cross-kind precedence", () => {
  it("when concept X and parameter X coexist, narrative ref X resolves to the concept (concept-first)", () => {
    const r = validateCRL(`# T
library "T".
parameter "BMI":
- param type is Period.
concept "BMI":
- type is Observation.
- value type is Quantity.
- coded from "BMI VS".
terminology "BMI VS":
- valueset is \`\`.
concept "Observed":
- type is Observation.
- value type is boolean.
- definition is "BMI" performed.
`);
    // No unresolved-reference for "BMI" in the narrative — resolves to
    // the concept first (precedence rule). No false collision diagnostic.
    const unresolved = (r.errors ?? []).filter((e) => e.kind === "unresolved-reference" && /BMI/.test(e.message));
    expect(unresolved).toHaveLength(0);
  });
});
