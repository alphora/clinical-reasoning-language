import { describe, it, expect } from "vitest";

import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import { emitCQLFromAST } from "../../cql-emitter/emitCQL";
import { runCel } from "../../cre/run";
import type { RegistryEntry } from "../../imports/types";
import { buildCRL } from "../../index";
import { definitionConceptRefs } from "../../provenance/indexer";
import { Validator } from "../../validator/validator";
import { flattenDefinedAsBody } from "../inferenceWalk";
import {
  Concept,
  DefinedAsDefinition,
  DefinedAsExists,
  DefinitionIsDefinition,
  NWord,
  definedAsExistsNotLowered,
  getRefLibrary,
  getRefName,
} from "../types";

import { parseInput } from "./parseInput";

// Concept-model redesign Todo 1 (disc 394): the grammar/AST additions — `value element is`
// on the local rep and on posreps, the rep-level `definition is` projector, `defined as
// exists (...)`, `exists` as a narrative word — plus the CONSUMER-SAFETY audit that the
// widened `DefinedAsDefinition.body` union does not silently drop the new reference.

const conceptNamed = (src: string, name: string): Concept => {
  const ast = parseInput(src);
  return ast.statements.find((s) => s.type === "Concept" && s.name === name) as Concept;
};

describe("value element is — on the local representation and posreps", () => {
  const src = `library "T".
concept "Local Deviant":
- type is Observation.
- value element is Observation.note.
- value type is boolean.
- code is \`ld\`.

concept "Age 18 Or Older":
- value type is boolean.
- code is \`age-18-or-older\`.
- source representation:
  - type is Patient.
  - value element is Patient.birthDate.
  - value type is dateTime.
  - definition is age today at least 18 years.

concept "BMI Posrep":
- value type is Quantity.
- code is \`bmi\`.
- source representation:
  - type is Observation.
  - value element is Observation.value.
  - value type is Quantity.
  - coded from "BMI VS".
  - definition is convert to canonical units.

terminology "BMI VS":
- valueset is \`http://example.org/bmi\`.`;

  it("captures the concept-local `value element` as { path, location }", () => {
    const c = conceptNamed(src, "Local Deviant");
    expect(c.valueElement?.path).toBe("Observation.note");
    expect(c.valueElement?.location).toBeDefined();
    expect(c.valueElement?.location.start.line).toBeGreaterThan(0);
  });

  it("captures a posrep's value element AND its rep-level `definition is` projector", () => {
    const c = conceptNamed(src, "Age 18 Or Older");
    expect(c.representations).toHaveLength(1);
    const rep = c.representations[0];
    expect(rep.conceptType).toBe("Patient");
    expect(rep.valueElement?.path).toBe("Patient.birthDate");
    // birthDate is really FHIR `date`, but the `date` value type + its authoring-kit sync
    // (schemaVersion bump + KE re-sync) is DEFERRED to Todo 4 (kit+migration, #257) so grammar
    // and kit move together — see disc 394 impl-round disposition. Structural assertion uses
    // `dateTime` (a valid value type) since this test is about AST shape, not FHIR fidelity.
    expect(rep.valueTypes).toEqual(["dateTime"]);
    // Rep-level projector reuses the DefinitionIsDefinition node, placed on the rep.
    expect(rep.projector?.type).toBe("DefinitionIsDefinition");
    expect(rep.projector?.body.type).toBe("NarrativeClause");
    // The concept-level definition slot is NOT filled — the projector is on the rep only.
    expect(c.definition).toBeUndefined();
  });

  it("a posrep may carry BOTH `coded from` and a projector (fixed slot order)", () => {
    const rep = conceptNamed(src, "BMI Posrep").representations[0];
    expect(rep.terminologyName).toBe("BMI VS");
    expect(rep.valueElement?.path).toBe("Observation.value");
    expect(rep.projector?.type).toBe("DefinitionIsDefinition");
  });

  it("a malformed value-element path (repeated dots) does not build cleanly (lex/parse error surfaces)", () => {
    const built = buildCRL(`library "T".
concept "Bad":
- type is Observation.
- value element is Observation..value.
- value type is boolean.
- code is \`bad\`.`);
    expect(built.success).toBe(false);
  });

  it("a concept-level `value element` builds WITHOUT a `code is` (superset artifact; Todo 2 rejects the unpaired shape)", () => {
    const src2 = `library "T".
concept "VE No Code":
- type is Observation.
- value element is Observation.value.
- value type is boolean.
- defined as "Other".`;
    const c = conceptNamed(src2, "VE No Code");
    expect(c.valueElement?.path).toBe("Observation.value");
    expect(c.code).toBeUndefined();
  });
});

describe("defined as exists (…)", () => {
  it("builds a DefinedAsExists node with the operand ref (bare)", () => {
    const src = `library "T".
concept "Clinical Mammogram":
- value type is boolean.
- defined as exists ( "Mammogram (ImagingStudy)" ).`;
    const def = conceptNamed(src, "Clinical Mammogram").definition as DefinedAsDefinition;
    expect(def.type).toBe("DefinedAsDefinition");
    expect(def.body.type).toBe("DefinedAsExists");
    expect(getRefName((def.body as DefinedAsExists).ref)).toBe("Mammogram (ImagingStudy)");
  });

  it("preserves a qualified operand ref", () => {
    const src = `library "T".
concept "X":
- value type is boolean.
- defined as exists ( "Other"."Y" ).`;
    const def = conceptNamed(src, "X").definition as DefinedAsDefinition;
    const ref = (def.body as DefinedAsExists).ref;
    expect(getRefLibrary(ref)).toBe("Other");
    expect(getRefName(ref)).toBe("Y");
  });
});

describe("exists as a narrative word", () => {
  it("`exists` inside a `definition is` narrative is an NWord (not the operator)", () => {
    const src = `library "T".
concept "C":
- value type is boolean.
- definition is "Weight" exists today.`;
    const def = conceptNamed(src, "C").definition as DefinitionIsDefinition;
    expect(def.type).toBe("DefinitionIsDefinition");
    const words = def.body.elements
      .filter((e): e is NWord => e.type === "NWord")
      .map((w) => w.value);
    expect(words).toContain("exists");
  });
});

describe("misattachment characterization (Claude C3 — whitespace-insensitive projector binding)", () => {
  it("a concept-level `definition is` written AFTER a posrep silently binds as that rep's projector", () => {
    // The grammar's concept-level `definition is` slot precedes `source representation:`.
    // So a `definition is` line placed after the posrep has no concept-level slot left and
    // binds to the rep's optional projector. This is the KNOWN hazard Todo 2 diagnoses (a
    // projector narrative carrying a concept ref → "move it above source representation:").
    const src = `library "T".
concept "BMI":
- value type is Quantity.
- code is \`bmi\`.
- source representation:
  - type is Observation.
  - value element is Observation.value.
  - value type is Quantity.
- definition is most recent "Weight".`;
    const c = conceptNamed(src, "BMI");
    expect(c.definition).toBeUndefined(); // NOT a concept-level calculation…
    expect(c.representations[0].projector?.type).toBe("DefinitionIsDefinition"); // …bound to the rep
  });
});

describe("consumer-safety — the widened union does not drop the exists reference", () => {
  it("flattenDefinedAsBody returns the exists operand ref", () => {
    const existsBody: DefinedAsExists = {
      type: "DefinedAsExists",
      ref: "Target",
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
    };
    expect(flattenDefinedAsBody(existsBody)).toEqual(["Target"]);
  });

  it("definitionConceptRefs surfaces the exists ref as a direct edge", () => {
    const src = `library "T".
concept "C":
- value type is boolean.
- defined as exists ( "Target" ).`;
    const c = conceptNamed(src, "C");
    expect(definitionConceptRefs(c).map(getRefName)).toContain("Target");
  });

  it("reference resolution flags an UNRESOLVED exists operand (referenceResolver sees the ref)", () => {
    const src = `library "T".
concept "C":
- value type is boolean.
- defined as exists ( "Missing" ).`;
    const built = buildCRL(src);
    expect(built.success && built.result).toBeTruthy();
    const errors = new Validator().validate(built.result!).errors;
    const unresolved = errors.filter((e) => e.kind === "unresolved-reference");
    expect(unresolved.length).toBeGreaterThan(0);
    expect(JSON.stringify(unresolved)).toContain("Missing");
  });

  it("cycle detection follows exists edges (A exists→B, B exists→A)", () => {
    const src = `library "T".
concept "A":
- value type is boolean.
- defined as exists ( "B" ).

concept "B":
- value type is boolean.
- defined as exists ( "A" ).`;
    const built = buildCRL(src);
    expect(built.success && built.result).toBeTruthy();
    const errors = new Validator().validate(built.result!).errors;
    expect(errors.some((e) => e.kind === "reference-cycle")).toBe(true);
  });
});

describe("increment-1 lowering guard", () => {
  it("definedAsExistsNotLowered throws a Todo-2/3 diagnostic naming the boundary", () => {
    expect(() => definedAsExistsNotLowered("test-site")).toThrow(/not yet lowered \(test-site\)/);
  });

  it("emit_cql on an exists concept fails as a STRUCTURED error (caught by emitCQLFromAST), not a crash", () => {
    const ast = parseInput(`library "T".
concept "Present":
- type is Observation.
- value type is boolean.
- code is \`present\`.
concept "Has Present":
- value type is boolean.
- defined as exists ( "Present" ).`);
    const res = emitCQLFromAST(ast);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.errors ?? [])).toMatch(/exists|not yet lowered/i);
  });

  it("run_decision (runCel) on an exists concept does NOT throw — it surfaces a diagnostic and treats it as unsatisfied", () => {
    const M = `# M
library "M".
concept "Present":
- type is Observation.
- code is \`present\`.
concept "Has Present":
- value type is boolean.
- defined as exists ( "Present" ).
activity "Approve":
- request CPGCommunicationRequest.
- with \`ap\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`dn\`.
decision "D":
first:
- when "Has Present" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
    const cel = `# MC
library "MC".
covers "M".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "no present":
- subject is "Pat".
- result is "D" is "Deny".`;
    const graph: ResolvedCelGraph = (() => {
      const crl = parseInput(M);
      const built = buildCEL(cel);
      if (!built.success || !built.result)
        throw new Error("CEL build failed: " + JSON.stringify(built.errors));
      const coversTarget: RegistryEntry = {
        name: crl.library.name,
        filePath: "inline.crl",
        ast: crl,
        isRoot: true,
        origin: "root",
      };
      return {
        filePath: "inline.cel",
        cel: built.result,
        coversTarget,
        celParseErrors: [],
        diagnostics: [],
      };
    })();
    // The assertion that matters: runCel RETURNS (no uncaught throw out of the read API).
    const [run] = runCel(graph).runs;
    expect(run).toBeDefined();
    // An on-path `defined as exists` reaches the engine's unlowered path → the run is marked
    // ERROR (runtimeError), NOT an authoritative pass/fail derived from an unevaluated
    // existence expression, and the reason is a diagnostic.
    expect(run.status).toBe("error");
    expect(run.diagnostics.some((d) => /defined as exists.*not yet evaluated/i.test(d))).toBe(true);
  });
});

describe("consumer-safety — a rep-level projector's concept refs are walked (Claude impl finding #3)", () => {
  it("reference resolution flags an unresolved concept ref inside a posrep projector", () => {
    // A projector carrying a concept ref is the misattachment case; the ref must NOT vanish —
    // referenceResolver walks rep.projector so it surfaces as unresolved.
    const src = `library "T".
concept "P":
- value type is boolean.
- code is \`p\`.
- source representation:
  - type is Observation.
  - value element is Observation.value.
  - value type is boolean.
  - definition is "Missing Concept" performed.`;
    const built = buildCRL(src);
    expect(built.success && built.result).toBeTruthy();
    const errors = new Validator().validate(built.result!).errors;
    const unresolved = errors.filter((e) => e.kind === "unresolved-reference");
    expect(unresolved.length).toBeGreaterThan(0);
    expect(JSON.stringify(unresolved)).toContain("Missing Concept");
  });
});
