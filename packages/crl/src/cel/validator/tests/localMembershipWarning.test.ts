import * as path from "node:path";

import { describe, it, expect } from "vitest";

import { validateCELFile } from "../validator";

// #189 Piece 2 (disc 508) — the `fact-code-not-in-local-set` WARNING. A fact naming a LOCAL concept that authors a
// well-formed `code is` NOT equal to the concept's own local `{system, code}` is a non-member (the legitimate
// wrong-code datum) → warned, never errored. A correct code and a bare fact do not warn.

const MEMBERSHIP_CEL = path.resolve(
  __dirname,
  "../../../cre/tests/fixtures/dme101-030-membership/cases.cel",
);

describe("#189 Piece 2 — CEL validator local-membership warning", () => {
  const r = validateCELFile(MEMBERSHIP_CEL);
  const memberWarnings = r.warnings.filter((w) => w.kind === "fact-code-not-in-local-set");

  it("is a WARNING, not an error (the wrong-code datum stays authorable)", () => {
    expect(r.errors.filter((e) => e.kind === "fact-code-not-in-local-set")).toEqual([]);
    expect(memberWarnings.length).toBeGreaterThan(0);
  });

  it("fires for a wrong-code fact and a cross-concept fact; NOT for a correct or bare fact", () => {
    const msgs = memberWarnings.map((w) => w.message).join("\n");
    expect(msgs).toMatch(/Skull Wrong Code/); // wrong code (not any concept's) → non-member of the named concept
    expect(msgs).toMatch(/Named Tumor Coded Skull/); // Skull's code, but it NAMES Tumor → not Tumor's own set
    expect(msgs).not.toMatch(/Skull Correct/); // authors the concept's own code → member → no warning
    expect(msgs).not.toMatch(/Tumor Bare/); // bare → degenerate member → no warning
    expect(memberWarnings.length).toBe(2);
  });
});
