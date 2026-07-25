import { describe, it, expect } from "vitest";

import { parseInput } from "../../ast/tests/parseInput";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import type { RegistryEntry } from "../../imports/types";
import { buildCrlStructure } from "../../provenance/crlStructure";
import { occurrencesOf } from "../occurrenceKey";

// #224: end-to-end occurrence signatures through parser → buildCrlStructure →
// occurrencesOf (the layer the hand-built occurrenceKey fixtures cannot reach —
// this is where a conditionSigLabel/refSig mismatch or a delimiter collision
// would actually bite, since occurrence flags are persisted in `; key` fields).

function graphFrom(crlSrc: string, celSrc: string): ResolvedCelGraph {
  const built = buildCEL(celSrc);
  if (!built.success || !built.result)
    throw new Error("inline CEL build failed: " + JSON.stringify(built.errors));
  const coversTarget: RegistryEntry = {
    name: parseInput(crlSrc).library.name,
    filePath: "inline.crl",
    ast: parseInput(crlSrc),
    isRoot: true,
    origin: "root",
  };
  return {
    filePath: "inline.cel",
    cel: built.result,
    coversTarget,
    crlRegistry: { byNameLocal: new Map(), byNamePackage: new Map() },
    celParseErrors: [],
    diagnostics: [],
  } as ResolvedCelGraph;
}

const CEL = `library "TC".
covers "T".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "c":
- subject is "Pat".
- result is "D" is "X".`;

const sigByNodeId = (crl: string) => {
  const dec = buildCrlStructure(graphFrom(crl, CEL)).find((d) => d.decision === "D")!;
  return Object.fromEntries(occurrencesOf(dec).map((o) => [o.nodeId, o.signature]));
};

describe("#224 occurrence signatures (end-to-end)", () => {
  it("single-ref guard signature is byte-identical to the pre-#224 `lib:Name`", () => {
    const crl = `library "T".
concept "Adult":
- type is Condition.
- code is \`adult\`.
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
decision "D":
first:
- when "Adult" then recommend activity "X".
- otherwise then recommend activity "X".`;
    expect(sigByNodeId(crl)["when[0]"]).toBe("T:Adult");
  });

  it("compound guard is a structural, operator-aware signature (not refKeys[0])", () => {
    const crl = `library "T".
concept "Adult":
- type is Condition.
- code is \`adult\`.
concept "Severe":
- type is Condition.
- code is \`severe\`.
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
decision "D":
first:
- when "Adult" and "Severe" then recommend activity "X".
- when "Adult" or "Severe" then recommend activity "X".
- otherwise then recommend activity "X".`;
    const sig = sigByNodeId(crl);
    expect(sig["when[0]"]).toBe("and(T:Adult,T:Severe)");
    expect(sig["when[1]"]).toBe("or(T:Adult,T:Severe)"); // operator survives
    expect(sig["when[0]"]).not.toBe(sig["when[1]"]);
  });

  it("delimiter injection cannot collide two DIFFERENT guards (a `,`/`:` in a concept name is escaped)", () => {
    // Without escaping: `when "A,T:B" and "C"` and `when "A" and "B" and "C"` would
    // BOTH render `and(T:A,T:B,T:C)` — a persisted flag would falsely read as PLACED.
    const crl = `library "T".
concept "A,T:B":
- type is Condition.
- code is \`x1\`.
concept "A":
- type is Condition.
- code is \`x2\`.
concept "B":
- type is Condition.
- code is \`x3\`.
concept "C":
- type is Condition.
- code is \`x4\`.
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
decision "D":
first:
- when "A,T:B" and "C" then recommend activity "X".
- when "A" and "B" and "C" then recommend activity "X".
- otherwise then recommend activity "X".`;
    const sig = sigByNodeId(crl);
    expect(sig["when[0]"]).not.toBe(sig["when[1]"]); // NO collision
  });
});
