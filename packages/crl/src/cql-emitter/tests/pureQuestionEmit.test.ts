import * as path from "node:path";

import { describe, it, expect } from "vitest";

import { emitCQLImports } from "../../imports/emit";

/**
 * #189 null/pause — the PURE QUESTION emits a THREE-STATE read.
 *
 * `asTruths().satisfied()` collapses three distinct states into one: no answer record, a record valued
 * `false`, and a valueless record all become the empty set, hence `false`. That makes an UNANSWERED question
 * indistinguishable from one answered "no", so a decision DENIES where it must PAUSE and ask — the #189
 * null/pause defect, verified against two unaltered reference PA IGs (`tmp/NOTES-apply-null-behavior.md`).
 *
 * A pure question (local `code is` + `value type is boolean`, NO derivation, NO source rep) has nothing that
 * could compute it, so it reads `answeredValue()`: true / false / **null**. Deliberately NOT `Coalesce`d —
 * totality belongs at the ARM, never per operand (design of record §3.3).
 */
const FIXTURE = path.resolve(__dirname, "fixtures/pure-question/pure-question.crl");

const cqlFor = (libSuffix: string): string => {
  const r = emitCQLImports(FIXTURE);
  expect(r.success).toBe(true);
  const lib = (r.cqlByLibrary ?? []).find((l) => l.libraryName.endsWith(libSuffix));
  expect(lib, `library *${libSuffix} not emitted`).toBeDefined();
  return lib!.cql;
};

describe("#189 null/pause — pure-question three-state read", () => {
  it("a PURE QUESTION reads `answeredValue()` (true / false / null), never the truth-set collapse", () => {
    const iface = cqlFor("Interface");
    expect(iface).toMatch(/define "Can Use Equipment At Home":\s*\n\s*\S+\."Can Use Equipment At Home"\.answeredValue\(\)/);
    // The collapse is what folds "unanswered" into "false" — it must not be on this concept.
    expect(iface).not.toMatch(/"Can Use Equipment At Home"\.asTruths\(\)/);
  });

  it("`exists this` is a DERIVATION, not a question — absence stays closed-world false", () => {
    const iface = cqlFor("Interface");
    // Its truth is `exists` over its own records: computable, so it never pauses. Unchanged behavior.
    expect(iface).not.toMatch(/"Has EDS Evidence"\.answeredValue\(\)/);
  });

  it("the pure question's records retrieve is unchanged — only the READ differs", () => {
    expect(cqlFor("LocalPrimitives")).toMatch(
      /define "Can Use Equipment At Home":\s*\n\s*\[Observation: \S+\."Can Use Equipment At Home"\]/,
    );
  });
});
