/**
 * F2 (impl-review) — foreign-qualified-condition clobber guard for
 * `collectCaseFeatures`.
 *
 * `collectCaseFeatures` keys each condition's recursive `code is` inputs by the
 * NORMALIZED bare name. A genuinely FOREIGN condition (`OtherLib."X"`, still
 * qualified after same-library normalization) collects NOTHING (cross-library
 * case-features are unsupported in v0). Before the F2 fix it was still keyed by
 * its bare name `getRefName` → an `inputsByCondition` entry of `[]` that
 * CLOBBERED a LOCAL `when "X"` of the same bare name. The fix skips foreign refs
 * entirely so the local condition's collected inputs survive.
 */

import { describe, expect, it } from "vitest";

import { buildCRL } from "../../index";
import { lowerLocalCodes } from "../../cql-emitter/lowerLocalCodes";
import type { Decision, QualifiedReference, WhenBlock } from "../../ast/types";
import { collectCaseFeatures } from "../closureOrchestrator";

const LIBRARY_NAME = "Code Is Decision";

const SOURCE = `library "Code Is Decision".

concept "Active Crohns Disease":
- type is Condition.
- value type is boolean.
- code is \`active-crohns-disease\`.

activity "Refer to GI":
- request CPGServiceRequest.

decision "Triage Crohns":
- when "Active Crohns Disease" then recommend activity "Refer to GI".
`;

function loweredAndDecisions() {
  const parsed = buildCRL(SOURCE);
  if (!parsed.success || !parsed.result) {
    throw new Error(`parse failed: ${JSON.stringify(parsed.errors)}`);
  }
  const ast = parsed.result;
  const lowered = lowerLocalCodes(ast, {
    canonicalBase: "http://example.org/crl/code-is-decision",
    localDomainId: "code-is-decision-fixture",
  });
  expect(lowered.errors).toEqual([]);
  const decisions = ast.statements.filter((s): s is Decision => s.type === "Decision");
  return { lowered, decisions };
}

describe("collectCaseFeatures — foreign-qualified condition does not clobber a same-named local condition (F2)", () => {
  it("a local `when \"X\"` and a foreign `when OtherLib.\"X\"` → the local X keeps its collected inputs", () => {
    const { lowered, decisions } = loweredAndDecisions();
    const localDecision = decisions[0]!;
    const localWhen = localDecision.body.statements[0] as WhenBlock;
    expect(localWhen.type).toBe("WhenBlock");

    // Synthesize a FOREIGN `when OtherLib."Active Crohns Disease"` branch with the
    // SAME bare name. It normalizes to a still-qualified ref (foreign lib), so it
    // collects nothing — and must NOT overwrite the local condition's entry.
    const foreignRef: QualifiedReference = {
      type: "QualifiedReference",
      libraryName: "Other Library",
      name: "Active Crohns Disease",
      location: localWhen.location,
    };
    const foreignWhen: WhenBlock = {
      ...localWhen,
      condition: { type: "BranchConditionRef", ref: foreignRef, location: localWhen.location },
    };
    // Put the foreign branch FIRST so a clobber (if the bug regressed) would
    // overwrite the later local entry — proving the skip, not just last-wins luck.
    const decisionWithForeign: Decision = {
      ...localDecision,
      body: {
        ...localDecision.body,
        statements: [foreignWhen, localWhen],
      },
    };

    const collection = collectCaseFeatures(lowered, [decisionWithForeign], LIBRARY_NAME);

    // The local condition keeps its recursive `code is` inputs (Active Crohns
    // Disease has a `code is` → exactly one collected concept).
    const localInputs = collection.inputsByCondition.get("Active Crohns Disease");
    expect(localInputs).toBeDefined();
    expect(localInputs!.map((c) => c.name)).toEqual(["Active Crohns Disease"]);
    // The foreign ref inserted NO entry (it is skipped, not keyed by its bare name).
    expect(collection.inputsByCondition.size).toBe(1);
    // The union still carries the local case-feature (not erased by the foreign []).
    expect(collection.unionConcepts.map((c) => c.name)).toEqual(["Active Crohns Disease"]);
  });
});
