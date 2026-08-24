// #189 T5 — boolean-totality classifier + enrollment ledger + whole-boundary proof (build order §8.1).
// Design of record: `docs/emit-189-boolean-totality.md` §1–5. Classifier tests parse real CRL through the
// SOURCE grammar (`parseInput`) so AST shapes match production; ledger/proof tests construct entries.
// Revised per crl-emit panel disc 429 (E1-rejected cells, age-first, fixed-point cycles, discharge union,
// result-type-only subject set, fail-closed catalog default, multiset completeness).

import { describe, it, expect } from "vitest";

import { parseInput } from "../../ast/tests/parseInput";
import type { Concept } from "../../ast/types";
import {
  classifyBooleanTotality,
  DefineLedger,
  extractEmittedDefineHeaders,
  proveWholeBoundaryTotality,
  type BooleanTotalityObligation,
  type EmittedDefineEntry,
} from "../booleanTotality";

const concept = (src: string, name: string): Concept => {
  const c = parseInput(src).statements.find((s) => s.type === "Concept" && s.name === name);
  if (!c) throw new Error(`concept "${name}" not found`);
  return c as Concept;
};

const classify = (src: string, name: string): BooleanTotalityObligation =>
  classifyBooleanTotality(concept(src, name));

describe("classifyBooleanTotality — boolean composition (#189 Slice 0b, banner G)", () => {
  const COMP = (parentDecl: string): string =>
    `library "T".\nconcept "A":\n- value type is boolean.\n- code is \`a\`.\nconcept "B":\n- value type is boolean.\n- code is \`b\`.\nconcept "C":\n${parentDecl}\n- defined as ( "A" and "B" ).\n`;

  it("`Scalar<boolean>` parent → composite (operands listed for the ledger proof)", () => {
    expect(classify(COMP("- value type is boolean."), "C").kind).toBe("composite");
  });

  it("`Scalar<Quantity>` parent → rejected (boolean composition under a non-boolean declaration; validator-free lane)", () => {
    expect(classify(COMP("- value type is Quantity."), "C").kind).toBe("rejected");
  });

  it("`shape is Record` parent → not-applicable (the shape gate short-circuits before the composition arm)", () => {
    expect(classify(COMP("- type is Observation.\n- shape is Record."), "C").kind).toBe("not-applicable");
  });
});

describe("classifyBooleanTotality — reduction forms", () => {
  it("`exists this` (valueless Condition) → intrinsically-total", () => {
    expect(
      classify(
        `library "T".\nconcept "C":\n- type is Condition.\n- value type is boolean.\n- code is \`c\`.\n- definition is exists this.\n`,
        "C",
      ).kind,
    ).toBe("intrinsically-total");
  });

  it("`exists \"X\"` (named RecordSet target) → intrinsically-total", () => {
    expect(
      classify(
        `library "T".\nconcept "S":\n- type is Condition.\n- shape is RecordSet.\n- code is \`s\`.\nconcept "E":\n- value type is boolean.\n- definition is exists "S".\n`,
        "E",
      ).kind,
    ).toBe("intrinsically-total");
  });

  it("`exists this` on a NON-boolean scalar → rejected (value type keyed first, disc 429 #3)", () => {
    expect(
      classify(
        `library "T".\nconcept "C":\n- type is Observation.\n- value type is integer.\n- code is \`c\`.\n- definition is exists this.\n`,
        "C",
      ).kind,
    ).toBe("rejected");
  });

  it("`count this at least 2` → intrinsically-total", () => {
    expect(
      classify(
        `library "T".\nconcept "C":\n- type is Procedure.\n- value type is boolean.\n- code is \`c\`.\n- definition is count this at least 2.\n`,
        "C",
      ).kind,
    ).toBe("intrinsically-total");
  });

  it("`count this at least 0` → rejected (always true)", () => {
    expect(
      classify(
        `library "T".\nconcept "C":\n- type is Procedure.\n- value type is boolean.\n- code is \`c\`.\n- definition is count this at least 0.\n`,
        "C",
      ).kind,
    ).toBe("rejected");
  });

  it("`most recent this` on a boolean Observation → requires-boundary", () => {
    expect(
      classify(
        `library "T".\nconcept "M":\n- type is Observation.\n- value type is boolean.\n- code is \`m\`.\n- definition is most recent this.\n`,
        "M",
      ).kind,
    ).toBe("requires-boundary");
  });

  it("`most recent this` on a non-boolean scalar → not-applicable (nullable)", () => {
    expect(
      classify(
        `library "T".\nconcept "M":\n- type is Observation.\n- value type is integer.\n- code is \`m\`.\n- definition is most recent this.\n`,
        "M",
      ),
    ).toEqual({ kind: "not-applicable", nullable: true, reason: expect.any(String) });
  });
});

describe("classifyBooleanTotality — defined-as forms", () => {
  it("`defined as exists (\"A\")` → intrinsically-total", () => {
    expect(
      classify(`library "T".\nconcept "D":\n- value type is boolean.\n- defined as exists ( "A" ).\n`, "D").kind,
    ).toBe("intrinsically-total");
  });

  it("`defined as ( \"A\" sem-and \"B\" )` → composite with both operands", () => {
    const o = classify(`library "T".\nconcept "D":\n- value type is boolean.\n- defined as ( "A" sem-and "B" ).\n`, "D");
    expect(o.kind).toBe("composite");
    if (o.kind !== "composite") return;
    expect(o.operands.map((r) => (typeof r === "string" ? r : r.name))).toEqual(["A", "B"]);
  });

  it("`defined as ( sem-not \"A\" )` → composite with the single operand (no negated flag)", () => {
    const o = classify(`library "T".\nconcept "D":\n- value type is boolean.\n- defined as ( sem-not "A" ).\n`, "D");
    expect(o.kind).toBe("composite");
    if (o.kind !== "composite") return;
    expect(o.operands.map((r) => (typeof r === "string" ? r : r.name))).toEqual(["A"]);
  });

  it("`defined as \"A\"` (bare ref) → composite delegated to referent", () => {
    const o = classify(`library "T".\nconcept "D":\n- value type is boolean.\n- defined as "A".\n`, "D");
    expect(o.kind).toBe("composite");
    if (o.kind !== "composite") return;
    expect(o.operands.map((r) => (typeof r === "string" ? r : r.name))).toEqual(["A"]);
  });
});

describe("classifyBooleanTotality — E1 rejects (disc 429 C1) + age exception (C2)", () => {
  it("`code is` + `defined as` (both-rep fold) → rejected (#257)", () => {
    const o = classify(
      `library "T".\nconcept "D":\n- type is Observation.\n- value type is boolean.\n- code is \`d\`.\n- defined as "A".\n`,
      "D",
    );
    expect(o.kind).toBe("rejected");
    if (o.kind === "rejected") expect(o.reason).toContain("#257");
  });

  it("`code is` + `source representation` (local + source multi-rep) → rejected (#257)", () => {
    const o = classify(
      `library "T".\nconcept "D":\n- type is Observation.\n- value type is boolean.\n- code is \`d\`.\n- definition is exists this.\n- source representation:\n  - type is Observation.\n  - value element is Observation.value.\n  - value type is boolean.\n`,
      "D",
    );
    expect(o.kind).toBe("rejected");
  });

  it("standalone patient-age posrep (no local code) → requires-boundary via resolveAgeConcept", () => {
    const o = classify(
      `library "T".\nconcept "Adult":\n- value type is boolean.\n- source representation:\n  - type is Patient.\n  - value element is Patient.birthDate.\n  - value type is date.\n  - value projection is age today at least 18 years.\n`,
      "Adult",
    );
    expect(o.kind).toBe("requires-boundary");
  });
});

describe("classifyBooleanTotality — catalog patterns & shapes", () => {
  it("catalog list pattern (`\"S\" performed`) → intrinsically-total", () => {
    expect(
      classify(
        `library "T".\nconcept "S":\n- type is Procedure.\n- shape is RecordSet.\n- code is \`s\`.\nconcept "P":\n- type is Procedure.\n- value type is boolean.\n- definition is "S" performed.\n`,
        "P",
      ).kind,
    ).toBe("intrinsically-total");
  });

  it("catalog boolean comparator (`\"BMI\" high`) → requires-boundary", () => {
    expect(
      classify(`library "T".\nconcept "H":\n- type is Observation.\n- value type is boolean.\n- definition is "BMI" high.\n`, "H").kind,
    ).toBe("requires-boundary");
  });

  it("catalog instance read (`most recent \"S\"`) on a boolean concept → unclassified (§4 gap-3, disc 429 C3)", () => {
    expect(
      classify(
        `library "T".\nconcept "S":\n- type is Observation.\n- shape is RecordSet.\n- code is \`s\`.\nconcept "M":\n- type is Observation.\n- value type is boolean.\n- definition is most recent "S".\n`,
        "M",
      ).kind,
    ).toBe("unclassified");
  });

  it("unmatched narrative → unclassified (enumerated, not rejected)", () => {
    expect(
      classify(`library "T".\nconcept "U":\n- type is Observation.\n- value type is boolean.\n- definition is flurbulated wonglecheese.\n`, "U").kind,
    ).toBe("unclassified");
  });

  it("RecordSet → not-applicable (publishes records)", () => {
    expect(classify(`library "T".\nconcept "S":\n- type is Condition.\n- shape is RecordSet.\n- code is \`s\`.\n`, "S")).toEqual({
      kind: "not-applicable",
      nullable: false,
      reason: expect.any(String),
    });
  });

  it("Record + `most recent this` → not-applicable", () => {
    expect(
      classify(
        `library "T".\nconcept "R":\n- type is Procedure.\n- shape is Record.\n- code is \`r\`.\n- definition is most recent this.\n`,
        "R",
      ).kind,
    ).toBe("not-applicable");
  });

  it("bare Scalar `code is` (no reduction) → rejected", () => {
    expect(
      classify(`library "T".\nconcept "B":\n- type is Observation.\n- value type is boolean.\n- code is \`b\`.\n`, "B").kind,
    ).toBe("rejected");
  });

  it("Scalar with 0 value types → rejected (malformed in boolean position)", () => {
    expect(
      classify(`library "T".\nconcept "N":\n- type is Observation.\n- code is \`n\`.\n- definition is most recent this.\n`, "N").kind,
    ).toBe("rejected");
  });
});

// ---------------------------------------------------------------------------
// Ledger + proof (constructed entries — the discharge is produced by T5 emit)
// ---------------------------------------------------------------------------

const entry = (
  over: Partial<EmittedDefineEntry> & Pick<EmittedDefineEntry, "name" | "obligation" | "discharge">,
): EmittedDefineEntry => ({
  library: "L",
  resultType: "Boolean",
  origin: "authored",
  cql: `define "${over.name}": exists([Condition: "X"])`,
  ...over,
});

const intrinsic = (name: string): EmittedDefineEntry =>
  entry({
    name,
    obligation: { kind: "intrinsically-total", form: "exists this", cell: "§2" },
    discharge: { booleanEffect: "total", dischargedBy: "intrinsic-exists" },
  });

describe("extractEmittedDefineHeaders", () => {
  it("pulls quoted and bare define identities, ignores non-defines", () => {
    const cql = `library "L"\n\ndefine "Foo": true\n\nparameter "P" Integer\n\ndefine Bar:\n  false`;
    expect(extractEmittedDefineHeaders(cql, "L")).toEqual([
      { library: "L", name: "Foo" },
      { library: "L", name: "Bar" },
    ]);
  });

  it("ESCAPE-AWARE (disc 439 #8): a name with an escaped quote/backslash round-trips, not truncated", () => {
    // `cqlQuotedIdentifier('a"b\\c')` → `"a\"b\\c"`; the parser must capture it whole and unescape.
    const cql = `define "a\\"b\\\\c": true`;
    expect(extractEmittedDefineHeaders(cql, "L")).toEqual([{ library: "L", name: `a"b\\c` }]);
  });
});

describe("DefineLedger", () => {
  it("appendDefine enrolls AND appends; appendStatement only appends", () => {
    const led = new DefineLedger();
    led.appendStatement(`library "L" version '1'`);
    led.appendDefine(intrinsic("X"));
    expect(led.entries()).toHaveLength(1);
    expect(led.render()).toContain(`library "L"`);
    expect(led.render()).toContain(`define "X":`);
  });

  it("appendDefine throws when the entry name is not the define its cql declares (disc 429 G6/C8)", () => {
    const led = new DefineLedger();
    expect(() => led.appendDefine(entry({ name: "X", cql: `define "Y": true`, obligation: { kind: "intrinsically-total", form: "", cell: "" }, discharge: { booleanEffect: "total", dischargedBy: "intrinsic-exists" } }))).toThrow(/mismatch/);
  });

  it("appendStatement throws when handed a top-level define", () => {
    const led = new DefineLedger();
    expect(() => led.appendStatement(`define "Sneaky": true`)).toThrow(/appendDefine/);
  });
});

describe("proveWholeBoundaryTotality", () => {
  it("proven when every boolean define is total via a MATCHING discharge", () => {
    const r = proveWholeBoundaryTotality([intrinsic("Exists")]);
    expect(r.status).toBe("proven");
    expect(r.ok).toBe(true);
  });

  it("FAILS a requires-boundary obligation discharged without a boundary mechanism", () => {
    const bad = entry({
      name: "MostRecent",
      obligation: { kind: "requires-boundary", form: "most recent this", cell: "§2" },
      discharge: { booleanEffect: "total", dischargedBy: "intrinsic-exists" }, // wrong mechanism
    });
    const r = proveWholeBoundaryTotality([bad]);
    expect(r.status).toBe("failed");
    expect(r.failures).toHaveLength(1);
  });

  it("proven for a requires-boundary discharged by boundary-coalesce", () => {
    const good = entry({
      name: "MostRecent",
      obligation: { kind: "requires-boundary", form: "most recent this", cell: "§2" },
      discharge: { booleanEffect: "total", dischargedBy: "boundary-coalesce" },
    });
    expect(proveWholeBoundaryTotality([good]).ok).toBe(true);
  });

  it("proven for intrinsically-total discharged by null-presence (#189 B3 — `<X> is not null`)", () => {
    // The value/interface boolean interface: `defined as exists (scalar-value)` → `(<X> is not null)`, total by
    // construction. Its obligation stays the generic `intrinsically-total` (classifyBooleanTotality can't resolve
    // operands); the emit-side discharge is `null-presence`, which must satisfy it (disc 500).
    const good = entry({
      name: "IsPresent",
      obligation: { kind: "intrinsically-total", form: "defined as exists (scalar-value)", cell: "§2/B3" },
      discharge: { booleanEffect: "total", dischargedBy: "null-presence" },
    });
    expect(proveWholeBoundaryTotality([good]).ok).toBe(true);
  });

  it("FAILS a nullable-effect boolean define (never proven total, disc 429 #1)", () => {
    const nullableEffect = entry({
      name: "Leaky",
      obligation: { kind: "requires-boundary", form: "most recent this", cell: "§2" },
      discharge: { booleanEffect: "nullable", reason: "unwrapped read" },
    });
    expect(proveWholeBoundaryTotality([nullableEffect]).status).toBe("failed");
  });

  it("FAILS a Boolean define enrolled with a not-boolean discharge (contradiction, disc 429 C4)", () => {
    const contradiction = entry({
      name: "Contra",
      obligation: { kind: "intrinsically-total", form: "exists this", cell: "§2" },
      discharge: { booleanEffect: "not-boolean" },
    });
    const r = proveWholeBoundaryTotality([contradiction]);
    expect(r.status).toBe("failed");
    expect(r.failures[0].reason).toContain("contradictory");
  });

  it("FAILS an enrolled `rejected` obligation (E1 forms must fail by non-enrollment)", () => {
    const rejected = entry({
      name: "BothRep",
      obligation: { kind: "rejected", code: "e1-defined-as", reason: "both-rep fold" },
      discharge: { booleanEffect: "total", dischargedBy: "intrinsic-exists" },
    });
    const r = proveWholeBoundaryTotality([rejected]);
    expect(r.status).toBe("failed");
    expect(r.failures[0].reason).toContain("rejected form was emitted");
  });

  it("INCOMPLETE (not proven, not failed) for an unclassified boolean define (disc 429 #9/C6)", () => {
    const unclassified = entry({
      name: "Unknown",
      obligation: { kind: "unclassified", reason: "unmatched narrative" },
      discharge: { booleanEffect: "total", dischargedBy: "intrinsic-exists" },
    });
    const r = proveWholeBoundaryTotality([unclassified]);
    expect(r.unclassified).toHaveLength(1);
    expect(r.failures).toHaveLength(0);
    expect(r.status).toBe("incomplete");
    expect(r.ok).toBe(false); // a caller must NOT ship an uncertified boolean define
  });

  it("origin coupling: an authored form claiming `axiom` fails; a criterion-axiom origin passes (disc 429 #8/C7)", () => {
    const authoredClaimingAxiom = entry({
      name: "Fake",
      obligation: { kind: "intrinsically-total", form: "exists this", cell: "§2" },
      discharge: { booleanEffect: "total", dischargedBy: "axiom" },
      origin: "authored",
    });
    expect(proveWholeBoundaryTotality([authoredClaimingAxiom]).status).toBe("failed");

    const criterion = entry({
      name: "Crit",
      obligation: { kind: "intrinsically-total", form: "criterion", cell: "§3" },
      discharge: { booleanEffect: "total", dischargedBy: "axiom" },
      origin: "criterion-axiom",
    });
    expect(proveWholeBoundaryTotality([criterion]).ok).toBe(true);
  });

  it("composite passes iff every operand resolves to a total boolean entry", () => {
    const comp = entry({
      name: "AandB",
      obligation: { kind: "composite", operands: ["A", "B"], cell: "§2" },
      discharge: { booleanEffect: "total", dischargedBy: "composite-delegated" },
    });
    // Only A total, B missing → composite fails.
    const r = proveWholeBoundaryTotality([intrinsic("A"), comp]);
    expect(r.status).toBe("failed");
    // Add B total → composite passes.
    expect(proveWholeBoundaryTotality([intrinsic("A"), intrinsic("B"), comp]).ok).toBe(true);
  });

  it("composite CYCLES fail rather than passing vacuously (disc 429 #5/C10)", () => {
    const composite = (name: string, operands: string[]): EmittedDefineEntry =>
      entry({ name, obligation: { kind: "composite", operands, cell: "§2" }, discharge: { booleanEffect: "total", dischargedBy: "composite-delegated" } });
    // Self-alias A → A.
    expect(proveWholeBoundaryTotality([composite("A", ["A"])]).status).toBe("failed");
    // Mutual A → B, B → A.
    expect(proveWholeBoundaryTotality([composite("A", ["B"]), composite("B", ["A"])]).status).toBe("failed");
  });

  it("completeness: an emitted define header with NO ledger entry is uncovered (multiset)", () => {
    const r = proveWholeBoundaryTotality(
      [intrinsic("Exists")],
      [
        { library: "L", name: "Exists" },
        { library: "L", name: "Unenrolled" },
      ],
    );
    expect(r.status).toBe("failed");
    expect(r.uncovered).toEqual([{ library: "L", name: "Unenrolled" }]);
  });

  it("completeness: a duplicate enrolled identity is a failure", () => {
    const r = proveWholeBoundaryTotality([intrinsic("Dup"), intrinsic("Dup")], [{ library: "L", name: "Dup" }]);
    expect(r.status).toBe("failed");
    expect(r.failures.some((f) => f.reason.includes("duplicate"))).toBe(true);
  });

  it("completeness REVERSE (disc 439 #3): an ENROLLED entry with NO emitted header is an orphan", () => {
    // The dual-write divergence: a define enrolled into the ledger whose text never reached the output.
    const r = proveWholeBoundaryTotality(
      [intrinsic("Emitted"), intrinsic("EnrolledButOmitted")],
      [{ library: "L", name: "Emitted" }],
    );
    expect(r.status).toBe("failed");
    expect(r.orphanEntries).toEqual([{ library: "L", name: "EnrolledButOmitted" }]);
    expect(r.uncovered).toEqual([]);
  });

  it("completeness: exact multiset both directions is clean (no uncovered, no orphan)", () => {
    const r = proveWholeBoundaryTotality(
      [intrinsic("A"), intrinsic("B")],
      [
        { library: "L", name: "A" },
        { library: "L", name: "B" },
      ],
    );
    expect(r.status).toBe("proven");
    expect(r.uncovered).toEqual([]);
    expect(r.orphanEntries).toEqual([]);
  });
});
