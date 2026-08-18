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
  getRefLibrary,
  getRefName,
} from "../types";

import { parseInput } from "./parseInput";

// Concept-model redesign Todo 1 (disc 394): the grammar/AST additions — `value element is`
// on the local rep and on posreps, the rep-level `value projection is` projector, `defined as
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
  - value projection is age today at least 18 years.

concept "BMI Posrep":
- value type is Quantity.
- code is \`bmi\`.
- source representation:
  - type is Observation.
  - value element is Observation.value.
  - value type is Quantity.
  - coded from "BMI VS".
  - value projection is convert to canonical units.

terminology "BMI VS":
- valueset is \`http://example.org/bmi\`.`;

  it("captures the concept-local `value element` as { path, location }", () => {
    const c = conceptNamed(src, "Local Deviant");
    expect(c.valueElement?.path).toBe("Observation.note");
    expect(c.valueElement?.location).toBeDefined();
    expect(c.valueElement?.location.start.line).toBeGreaterThan(0);
  });

  it("captures a posrep's value element AND its rep-level `value projection is` projector", () => {
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
    // The rep-level projector is its OWN node (`ValueProjection`), placed on the rep.
    expect(rep.valueProjection?.type).toBe("ValueProjection");
    expect(rep.valueProjection?.body.type).toBe("NarrativeClause");
    // The concept-level definition slot is NOT filled — the projection is on the rep only.
    expect(c.definition).toBeUndefined();
  });

  it("a posrep may carry BOTH `coded from` and a value projection (fixed slot order)", () => {
    const rep = conceptNamed(src, "BMI Posrep").representations[0];
    expect(rep.terminologyName).toBe("BMI VS");
    expect(rep.valueElement?.path).toBe("Observation.value");
    expect(rep.valueProjection?.type).toBe("ValueProjection");
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

describe("line-order footgun is now a LOUD parse error (value projection is its own term)", () => {
  it("a concept-level `definition is` written AFTER a source representation is a PARSE ERROR", () => {
    // The grammar's concept-level `definition is` slot precedes `source representation:`, and a
    // representation now accepts ONLY `value projection is` (not a bare `definition is`). So a
    // `definition is` placed after the source rep has no valid slot — it FAILS LOUDLY instead of
    // silently binding as a projector (the iehp finding; position still matters, but a misplaced
    // clause can no longer silently mean something else). This is the fix, asserted.
    const built = buildCRL(`library "T".
concept "BMI":
- value type is Quantity.
- code is \`bmi\`.
- source representation:
  - type is Observation.
  - value element is Observation.value.
  - value type is Quantity.
- definition is most recent "Weight".`);
    expect(built.success).toBe(false);
  });

  it("the SAME narrative as an explicit `value projection is` builds — as the rep's projection", () => {
    // Making the intent explicit is legal; the ambiguity only ever bit the SHARED keyword.
    const c = conceptNamed(
      `library "T".
concept "Age 18 Or Older":
- value type is boolean.
- source representation:
  - type is Patient.
  - value element is Patient.birthDate.
  - value type is dateTime.
  - value projection is age today at least 18 years.`,
      "Age 18 Or Older",
    );
    expect(c.definition).toBeUndefined();
    expect(c.representations[0].valueProjection?.type).toBe("ValueProjection");
  });

  it("a CONCEPT-LEVEL `value projection is` (no source representation) is a PARSE ERROR", () => {
    // `value projection is` is scoped to representations only — conceptBody has no slot for it.
    // Pins the "representations only" contract against future grammar restructuring.
    const built = buildCRL(`library "T".
concept "C":
- value type is boolean.
- code is \`c\`.
- value projection is age today at least 18 years.`);
    expect(built.success).toBe(false);
  });

  it("the WORDS `projection` / `projects` remain ordinary narrative (only the exact phrase is reserved)", () => {
    // Longest-match reserves `value projection is` as a phrase token; the bare words do not.
    const c = conceptNamed(
      `library "T".
concept "C":
- value type is boolean.
- code is \`c\`.
- definition is projection of the plan projects forward.`,
      "C",
    );
    expect(c.definition?.type).toBe("DefinitionIsDefinition");
  });

  it("a trailing `value projection is` attaches to the LAST representation (positional, by design)", () => {
    // The one residual of position-mattering: with multiple reps, a trailing projection binds to
    // the last. This is intended (position is meant to matter; misplacement just fails LOUD now),
    // characterized so it reads as deliberate, not missed.
    const c = conceptNamed(
      `library "T".
concept "C":
- value type is dateTime.
- source representation:
  - type is ImagingStudy.
  - value element is ImagingStudy.started.
  - value type is dateTime.
- source representation:
  - type is Patient.
  - value element is Patient.birthDate.
  - value type is dateTime.
  - value projection is age today at least 18 years.`,
      "C",
    );
    expect(c.representations[0].valueProjection).toBeUndefined();
    expect(c.representations[1].valueProjection?.type).toBe("ValueProjection");
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
  it("emit_cql LOWERS an exists concept to a boolean `exists (<X>)` (#265; was a guarded structured error pre-#265)", () => {
    const ast = parseInput(`library "T".
concept "Present":
- type is Observation.
- value type is boolean.
- code is \`present\`.
concept "Has Present":
- value type is boolean.
- defined as exists ( "Present" ).`);
    const res = emitCQLFromAST(ast, { canonicalBase: "http://example.org/crl/test" }); // #271 — canonicalBase required to lower local `code is`
    expect(res.success).toBe(true);
    expect(res.result ?? "").toMatch(/define "Has Present":\s*\n\s*exists \("Present"\)/);
    expect(res.result ?? "").not.toContain("not yet lowered");
  });

  it("run_decision (runCel) EVALUATES a `defined as exists` guard closed-world (#270 Slice 0a-cre) — no runtimeError", () => {
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
    // #270 Slice 0a-cre: `defined as exists` now EVALUATES on the engine. Closed-world — the case asserts
    // NO `Present` fact, so `Has Present` is false → the decision falls to `otherwise` → "Deny", which
    // MATCHES the case expectation, so the run PASSES. No runtimeError, no "not yet evaluated" diagnostic.
    const [run] = runCel(graph).runs;
    expect(run).toBeDefined();
    expect(run.status).toBe("pass");
    expect(run.diagnostics.some((d) => /not yet evaluated/i.test(d))).toBe(false);
    // The closed-world existence answer is authoritative: `Has Present` is false (no `Present` record).
    const hasPresent = run.conceptTruth.find((r) => r.name === "Has Present");
    expect(hasPresent?.satisfied).toBe(false);
  });

  it("run_decision marks a `count`/`most recent` reduction guard ERROR, never a fabricated presence answer (#270 Slice 0a-cre)", () => {
    // A named `count ... at least N` reduction is never in `directFacts` (the case asserts the underlying
    // records, not the derived concept), so a presence answer would silently Deny an eligible case. The
    // engine refuses it loud rather than fabricate authority (banner E) — unlike `defined as exists`, which
    // IS sound as presence and evaluates (above).
    const M = `# M
library "M".
concept "Trial Records":
- type is Observation.
- shape is RecordSet.
- code is \`trial\`.
concept "Enough Trials":
- value type is boolean.
- definition is count "Trial Records" at least 2.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ap\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`dn\`.
decision "D":
first:
- when "Enough Trials" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
    const cel = `# MC
library "MC".
covers "M".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "some":
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
      return { filePath: "inline.cel", cel: built.result, coversTarget, celParseErrors: [], diagnostics: [] };
    })();
    const [run] = runCel(graph).runs;
    expect(run).toBeDefined();
    expect(run.status).toBe("error");
    expect(run.diagnostics.some((d) => /count.*reduction.*is not evaluated/i.test(d))).toBe(true);
  });

  it("run_decision — a SATISFIED `defined as exists` guard (a record present) → true → Approve (#270 Slice 0a-cre positive twin)", () => {
    // The negative twin (above) proves closed-world false; this proves a present record makes it TRUE (an
    // impl hardcoding `false` would fail here — disc 462 Claude #4).
    const M = `# M
library "M".
concept "Present":
- type is Observation.
- shape is RecordSet.
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
fact "A Present Record":
- code is "http://example.org/x|present".
- defined by "Present".
case "has present":
- subject is "Pat".
- fact is "A Present Record".
- result is "D" is "Approve".`;
    const graph: ResolvedCelGraph = (() => {
      const crl = parseInput(M);
      const built = buildCEL(cel);
      if (!built.success || !built.result) throw new Error("CEL build failed: " + JSON.stringify(built.errors));
      const coversTarget: RegistryEntry = { name: crl.library.name, filePath: "inline.crl", ast: crl, isRoot: true, origin: "root" };
      return { filePath: "inline.cel", cel: built.result, coversTarget, celParseErrors: [], diagnostics: [] };
    })();
    const [run] = runCel(graph).runs;
    expect(run).toBeDefined();
    expect(run.status).toBe("pass");
    expect(run.conceptTruth.find((r) => r.name === "Has Present")?.satisfied).toBe(true);
  });

  it("run_decision — a NAMED `definition is exists \"X\"` reduction EVALUATES its target (records present → true → Approve), not a silent Deny (#270 Slice 0a-cre, disc 462 Claude #1)", () => {
    // Pre-fix a named-exists reduction fell through to `directFacts.has(self)` = always false → silent Deny of
    // an eligible case. It now evaluates existence of the TARGET, identical to `defined as exists`.
    const M = `# M
library "M".
concept "Trial Records":
- type is Observation.
- shape is RecordSet.
- code is \`trial\`.
concept "Has Trials":
- value type is boolean.
- definition is exists "Trial Records".
activity "Approve":
- request CPGCommunicationRequest.
- with \`ap\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`dn\`.
decision "D":
first:
- when "Has Trials" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
    const cel = `# MC
library "MC".
covers "M".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "A Trial Record":
- code is "http://example.org/x|trial".
- defined by "Trial Records".
case "has trials":
- subject is "Pat".
- fact is "A Trial Record".
- result is "D" is "Approve".`;
    const graph: ResolvedCelGraph = (() => {
      const crl = parseInput(M);
      const built = buildCEL(cel);
      if (!built.success || !built.result) throw new Error("CEL build failed: " + JSON.stringify(built.errors));
      const coversTarget: RegistryEntry = { name: crl.library.name, filePath: "inline.crl", ast: crl, isRoot: true, origin: "root" };
      return { filePath: "inline.cel", cel: built.result, coversTarget, celParseErrors: [], diagnostics: [] };
    })();
    const [run] = runCel(graph).runs;
    expect(run).toBeDefined();
    expect(run.status, JSON.stringify(run.diagnostics)).toBe("pass");
    expect(run.conceptTruth.find((r) => r.name === "Has Trials")?.satisfied).toBe(true);
  });
});

describe("consumer-safety — a rep-level value projection's concept refs are walked (Claude impl finding #3)", () => {
  it("reference resolution flags an unresolved concept ref inside a posrep value projection", () => {
    // A value projection carrying a concept ref is the shape-defect case; the ref must NOT vanish
    // — referenceResolver walks rep.valueProjection so it surfaces as unresolved.
    const src = `library "T".
concept "P":
- value type is boolean.
- code is \`p\`.
- source representation:
  - type is Observation.
  - value element is Observation.value.
  - value type is boolean.
  - value projection is "Missing Concept" performed.`;
    const built = buildCRL(src);
    expect(built.success && built.result).toBeTruthy();
    const errors = new Validator().validate(built.result!).errors;
    const unresolved = errors.filter((e) => e.kind === "unresolved-reference");
    expect(unresolved.length).toBeGreaterThan(0);
    expect(JSON.stringify(unresolved)).toContain("Missing Concept");
  });
});
