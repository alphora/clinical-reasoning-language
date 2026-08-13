// #224 ii.1c (design §5.1 / disc 303 I2) — the emit family builds a criterion table from the
// RAW graph AST (S6 closure) AND from the LOWERED AST (S7 case-features / S8 interface). #236: a
// criterion lowers to a named define referenced by identity, and its atom-closure input[] is
// derived from the criterion table — so the raw-AST and lowered-AST tables MUST stay EQUAL, i.e.
// `lowerLocalCodes` must pass `Criterion` statements (and guard conditions) through UNCHANGED. This
// test PINS that invariant so a future lowering pass that touches criteria can't desynchronize the
// criterion index / define emission without a failing test.

import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import { buildCriterionTable } from "../../ast/criterionExpansion";
import { lowerLocalCodes as lowerLocalCodesRaw } from "../lowerLocalCodes";

// #271 — lowering local `code is` now REQUIRES `crl.canonicalBase` (no urn
// fallback); inline-AST tests thread a fixed test base by default.
const TEST_CB = "http://example.org/crl/test";
const lowerLocalCodes: typeof lowerLocalCodesRaw = (ast, opts = {}) =>
  lowerLocalCodesRaw(ast, { canonicalBase: TEST_CB, ...opts });
import type { CRL } from "../../ast/types";

function parse(body: string): CRL {
  const r = buildCRL("# fixture\n" + body);
  if (!r.success || !r.result) throw new Error("parse failed: " + JSON.stringify(r.errors));
  return r.result;
}

describe("#224 ii.1c — lowerLocalCodes preserves criteria (raw↔lowered table equivalence)", () => {
  it("Criterion statements pass through lowering by reference (same table)", () => {
    // A `code is` concept (which lowering DOES rewrite) alongside a criterion referencing it.
    const ast = parse(`library "Policy".
concept "Gate":
- type is Observation.
- code is \`gate\`.
criterion "Eligible":
- when ( "Gate" ).
decision "D":
first:
- when "Eligible" then recommend activity "Act".
- otherwise then recommend activity "No".
activity "Act":
- request CPGServiceRequest.
- with \`ok\`.
activity "No":
- request CPGCommunicationRequest.
- with \`no\`.`);

    const lowered = lowerLocalCodes(ast);
    // Lowering DID rewrite the concept (proving this is a non-trivial lowering, not the
    // fast-path identity return).
    expect(lowered.ast).not.toBe(ast);

    const rawTable = buildCriterionTable(ast.statements);
    const loweredTable = buildCriterionTable(lowered.ast.statements);
    // Same criterion names, and the SAME Criterion object (pass-through by reference) — so the
    // raw-AST table (S6) and lowered-AST table (S7/S8) are interchangeable.
    expect([...loweredTable.keys()]).toEqual([...rawTable.keys()]);
    expect(loweredTable.get("Eligible")).toBe(rawTable.get("Eligible"));
  });
});
