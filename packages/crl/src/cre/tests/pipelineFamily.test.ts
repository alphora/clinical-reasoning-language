import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import type { RegistryEntry } from "../../imports/types";
import { parseInput } from "../../ast/tests/parseInput";
import { resolveCelImports } from "../../cel/imports";
import { runCel } from "../run";

/**
 * #189 P2 — THE PIPELINE FAMILY in the CRE: the collection algebra and the one-sided emptiness proof.
 *
 * ⭐⭐ WHY THIS FILE EXISTS. `pipelineVerdict` activates for EVERY exactly-boolean concept whose `definition
 * is` resolves — not only the two goal fixtures. Both review arms said the same thing about the first cut:
 * the behaviour surface it changed was far wider than the rows pinned, so a path that started EVALUATING
 * where it used to refuse (or the reverse) could move silently. These are those paths.
 *
 * ⚠ Each case is a shape the reviews named as a silent-wrong or unproved cell, and several pin a REFUSAL —
 * a refusal is a verdict about the ENGINE's reach, and it is exactly as much a regression when it quietly
 * turns into an answer as an answer is when it turns into a refusal.
 */

const POLICY_TAIL = `activity "Approve":
- request CPGCommunicationRequest.
- with \`ap\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`dn\`.
decision "D":
first:
- when "Guard" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;

interface Outcome {
  status?: string;
  produced: string[];
  refused: boolean;
}

function run(concepts: string, facts: string): Outcome {
  const crl = parseInput(`library "M".\n${concepts}\n${POLICY_TAIL}`);
  const cel = `# MC
library "MC".
covers "M".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
${facts}
case "c":
- subject is "Pat".
${facts.trim() === "" ? "" : factRefs(facts)}- result is "D" is "Approve".`;
  const built = buildCEL(cel);
  if (!built.success || !built.result) throw new Error("CEL build failed: " + JSON.stringify(built.errors));
  const coversTarget: RegistryEntry = {
    name: crl.library.name,
    filePath: "inline.crl",
    ast: crl,
    isRoot: true,
    origin: "root",
  };
  const graph: ResolvedCelGraph = {
    filePath: "inline.cel",
    cel: built.result,
    coversTarget,
    celParseErrors: [],
    diagnostics: [],
  };
  const [r] = runCel(graph).runs as unknown as {
    status?: string;
    produced?: { recommendation: string }[];
    diagnostics?: string[];
  }[];
  return {
    status: r.status,
    produced: (r.produced ?? []).map((p) => p.recommendation),
    refused: (r.diagnostics ?? []).some((d) => d.includes("is not evaluated by run_decision")),
  };
}

/** Every `fact "X":` declared in the block, as `- fact is "X".` lines for the case. */
function factRefs(facts: string): string {
  return [...facts.matchAll(/^fact "([^"]+)":/gm)].map((m) => `- fact is "${m[1]}".\n`).join("");
}

describe("CRE — the pipeline family", () => {
  it("⭐ zero candidates PAUSE — they do not deny", () => {
    // The row the whole slice exists for. `otherwise` must NOT fire: absence is never established, and a
    // Deny requires an established false.
    const out = run(
      `concept "Guard":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`g\`.
- definition is most recent this.`,
      "",
    );
    expect(out.produced).toEqual([]);
    expect(out.refused, "a pause is not a refusal").toBe(false);
  });

  it("⭐ agreeing candidates decide — recency cannot change an order-independent answer", () => {
    const out = run(
      `concept "Guard":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`g\`.
- definition is most recent this.`,
      `fact "A":
- value is false.
- defined by "Guard".
fact "B":
- value is false.
- defined by "Guard".`,
    );
    expect(out.produced).toEqual(["Deny"]);
    expect(out.refused).toBe(false);
  });

  it("⚠ DISAGREEING candidates refuse — picking the newest needs the emitted date+id sort", () => {
    const out = run(
      `concept "Guard":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`g\`.
- definition is most recent this.`,
      `fact "A":
- value is true.
- defined by "Guard".
fact "B":
- value is false.
- defined by "Guard".`,
    );
    expect(out.refused).toBe(true);
    expect(out.status).toBe("error");
  });

  it("⭐ ALL-valueless candidates PAUSE — the read is null whichever record is newest", () => {
    // ⚠ WAS A REFUSAL, and both arms called it over-refusal against the charter's own runtime contract: "a
    // valueless value-reading record reads NULL in both lanes — NOT false … and both PAUSE". No ordering is
    // needed when every candidate reads the same null.
    const out = run(
      `concept "Guard":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`g\`.
- definition is most recent this.`,
      `fact "A":
- defined by "Guard".`,
    );
    expect(out.produced).toEqual([]);
    expect(out.refused, "all-valueless is decidable as a pause").toBe(false);
  });

  it("⚠ MIXED valued and valueless candidates refuse — there the newest genuinely decides", () => {
    const out = run(
      `concept "Guard":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`g\`.
- definition is most recent this.`,
      `fact "A":
- value is true.
- defined by "Guard".
fact "B":
- defined by "Guard".`,
    );
    expect(out.refused).toBe(true);
  });

  it("⚠⚠ a NAMED reduction target is not dropped — it refuses rather than answering from the own arm", () => {
    // ⚠ THE SILENT-WRONG PATH THE CODE REVIEW CAUGHT. `most recent "X"` reduces `this` ∪ X (charter §3). An
    // earlier version checked named operands on PRODUCERS only, so a selection's named space vanished and the
    // verdict came from the own arm alone — X populated with an empty own arm read as a pause, and an own
    // `true` beat a newer X record of `false`. Both on validator-clean input.
    const out = run(
      `concept "X":
- shape is RecordSet.
- type is Observation.
- value type is boolean.
- code is \`x\`.
concept "Guard":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`g\`.
- definition is most recent "X".`,
      `fact "XA":
- value is false.
- defined by "X".`,
    );
    expect(out.refused, "the named space is populated, so the verdict is not ours to give").toBe(true);
  });

  it("⭐ a named reduction target that is PROVABLY absent does not block the own arm", () => {
    // The other side of the same rule: `this ∪ ∅` is `this`, so the own candidates decide.
    const out = run(
      `concept "X":
- shape is RecordSet.
- type is Observation.
- value type is boolean.
- code is \`x\`.
concept "Guard":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`g\`.
- definition is most recent "X".`,
      `fact "GA":
- value is true.
- defined by "Guard".`,
    );
    expect(out.produced).toEqual(["Approve"]);
    expect(out.refused).toBe(false);
  });

  it("⚠ a producer whose operand is PRESENT refuses — its datum is not ours to compute", () => {
    const out = run(
      `concept "W":
- shape is Record.
- type is Observation.
- value type is Quantity.
- code is \`w\`.
- definition is most recent this.
concept "Guard":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`g\`.
- definition is "W" at least 30 'kg/m2', then most recent this.`,
      `fact "WA":
- value is 31.
- defined by "W".`,
    );
    expect(out.refused).toBe(true);
  });

  it("⭐ a producer whose operand is provably ABSENT is skipped — zero invocations contribute nothing", () => {
    const out = run(
      `concept "W":
- shape is Record.
- type is Observation.
- value type is Quantity.
- code is \`w\`.
- definition is most recent this.
concept "Guard":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`g\`.
- definition is "W" at least 30 'kg/m2', then most recent this.`,
      `fact "GA":
- value is true.
- defined by "Guard".`,
    );
    expect(out.produced).toEqual(["Approve"]);
    expect(out.refused).toBe(false);
  });

  it("⚠ an UNCLASSIFIABLE program refuses — presence-evaluating a program we cannot read IS fabrication", () => {
    // `WasPerformed`'s stage behaviour is not grounded against its realization, so the resolver refuses to
    // classify it. The CRE must not fall back to presence.
    const out = run(
      `concept "S":
- shape is RecordSet.
- type is Observation.
- value type is boolean.
- code is \`s\`.
concept "Guard":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`g\`.
- definition is "S" performed.`,
      `fact "GA":
- value is true.
- defined by "Guard".`,
    );
    expect(out.refused).toBe(true);
  });

  it("⭐ a lone `exists this` keeps its EXISTING presence arm — it is not in this family", () => {
    // A records-read: absence is a closed-world established false, and presence IS its existence. Pinned
    // because routing it into the collection algebra would turn a total answer into a pause.
    const empty = run(
      `concept "Guard":
- type is Condition.
- value type is boolean.
- code is \`g\`.
- definition is exists this.`,
      "",
    );
    expect(empty.produced, "closed-world false, not a pause").toEqual(["Deny"]);
    expect(empty.refused).toBe(false);
  });
});

describe("CRE — a PROJECTION-LESS coded posrep reads the record's own value", () => {
  it("⚠⚠ a source member STATING false denies — it is not a fabricated `true`", () => {
    // ⚠ THE SILENT WRONG VERDICT THE CODE REVIEW CAUGHT, and the reason it needed its own fixture: the
    // in-tree source-membership fixtures are all non-boolean, so a MUTATION restoring the bug
    // (`arm === "source"` ⇒ `true`) passed the entire suite. `exists this` DOES yield `true`
    // per retrieved record — but a posrep with NO `value projection is` is read as the concept's VALUE
    // (charter §3), so this record's `value is false` is the candidate.
    const cases = path.resolve(__dirname, "fixtures/source-projectionless/cases.cel");
    const res = runCel(resolveCelImports(cases) as never) as unknown as {
      runs?: { status?: string; produced?: { recommendation: string }[]; diagnostics?: string[] }[];
    };
    const [r] = res.runs ?? [];
    expect((r?.produced ?? []).map((p) => p.recommendation)).toEqual(["Deny"]);
    expect(
      (r?.diagnostics ?? []).some((d) => d.includes("is not evaluated by run_decision")),
      "decidable: one candidate, so no ordering is needed",
    ).toBe(false);
  });
});
