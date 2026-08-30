import { readFileSync } from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { buildCRL } from "../../index";
import type { CRL, Concept } from "../../ast/types";
import { resolveConceptPipeline, type PipelineResolution } from "../resolvePipeline";

/**
 * #189 P2 (design D6) — the shared pipeline resolver.
 *
 * ⭐ THE EFFECT MATRIX IS THE POINT. An earlier draft derived the effect from return shape and a value-match
 * only, dropping two of D9's three axes — and the design round proved that under-implementation would have
 * called a terminal `Scalar<boolean>` comparator a PRODUCER, made its output a SPACE, and then failed
 * terminal-shape conformance against `Scalar`: a spurious author-time error on a legal form. These tests
 * pin the corrected four-axis derivation, including the cases the old rule got wrong.
 */

const PRELUDE = [
  'library "T".',
  'terminology "VS":',
  "- valueset is `http://example.org/x`.",
  'concept "W":',
  "- shape is Record.",
  "- type is Observation.",
  "- value type is Quantity.",
  "- code is `w`.",
  "- definition is most recent this.",
  'concept "H":',
  "- shape is Record.",
  "- type is Observation.",
  "- value type is Quantity.",
  "- code is `h`.",
  "- definition is most recent this.",
].join("\n");

function resolve(conceptBody: string[], name = "C"): PipelineResolution {
  const src = [PRELUDE, `concept "${name}":`, ...conceptBody, ""].join("\n");
  const built = buildCRL(src) as unknown as { success: boolean; result?: CRL };
  if (!built.success) throw new Error(`fixture did not parse:\n${src}`);
  const concept = (built.result!.statements as Concept[]).find((s) => s.name === name);
  if (concept === undefined) throw new Error(`no concept ${name}`);
  return resolveConceptPipeline(concept);
}

const effects = (r: PipelineResolution): string[] =>
  r.kind === "resolved" ? r.stages.map((s) => s.effect) : [`INVALID:${r.kind}`];

const diagnostics = (r: PipelineResolution): string[] =>
  r.kind === "invalid" ? r.diagnostics.map((d) => d.kind) : [];

describe("resolveConceptPipeline — the effect matrix", () => {
  it("⭐ non-terminal comparator in a RECORD concept -> PRODUCER, then SELECTION", () => {
    // The goal's own `Obese`. The comparator reads NAMED operands (`AtLeast(rec Observation, target)` takes a
    // singleton, verified against CRLCommon.cql), so its value JOINS the space rather than replacing it.
    const r = resolve([
      "- shape is Record.",
      "- type is Observation.",
      "- value type is boolean.",
      "- code is `c`.",
      "- definition is \"W\" at least 30 'kg/m2', then most recent this.",
    ]);
    expect(effects(r)).toEqual(["producer", "selection"]);
  });

  it("⭐ TERMINAL comparator in a SCALAR concept -> DIRECT, not producer", () => {
    // ⚠ THE CASE THE OLD RULE GOT WRONG. There is no record space for a candidate to join, so the stage
    // computes the published value itself. Calling it a producer made its output a space and then failed
    // conformance against `Scalar`.
    const r = resolve([
      "- shape is Scalar.",
      "- type is Observation.",
      "- value type is boolean.",
      "- definition is \"W\" at least 30 'kg/m2'.",
    ]);
    expect(effects(r)).toEqual(["direct"]);
  });

  it("⭐ BOTH SPELLINGS of `most recent this` resolve IDENTICALLY", () => {
    // ⚠ The structural `ReductionDefinition` and the narrative stage are the same operation. Two spellings
    // classifying differently is the drift the shared resolver exists to remove — and it is already a live
    // defect in the CRE, whose refusal keys on the AST node kind.
    const structural = resolve([
      "- shape is Record.",
      "- type is Observation.",
      "- value type is Quantity.",
      "- code is `c`.",
      "- definition is most recent this.",
    ]);
    const staged = resolve([
      "- shape is Record.",
      "- type is Observation.",
      "- value type is boolean.",
      "- code is `c`.",
      "- definition is \"W\" at least 30 'kg/m2', then most recent this.",
    ]);
    expect(effects(structural)).toEqual(["selection"]);
    expect(effects(staged)[1]).toBe("selection");
  });

  it("⭐ a PRODUCER's output is a SPACE, not its raw value — the collapse this module removes", () => {
    // ⚠ LOAD-BEARING. `BodyMassIndex` returns a Quantity; if that raw value were the stage's output, the next
    // `most recent` would appear to receive a scalar — which is exactly what the FOLD does today, and why it
    // does not translate ("Could not resolve call to operator MostRecent with signature (System.Quantity)").
    const r = resolve([
      "- shape is Record.",
      "- type is Observation.",
      "- value type is Quantity.",
      "- code is `c`.",
      '- definition is body mass index of "W" and "H", then most recent this.',
    ]);
    expect(effects(r)).toEqual(["producer", "selection"]);
    const [producer, selection] = r.kind === "resolved" ? r.stages : [];
    expect(producer.outputShape).toEqual({ kind: "space", recordType: "Observation", cardinality: "many" });
    expect(selection.inputShape).toEqual({ kind: "space", recordType: "Observation", cardinality: "many" });
    expect(producer.constructs).toBe(true);
    expect(selection.constructs).toBe(false);
  });

  it("⚠ an UNGROUNDED pattern in a stage position is REFUSED, not classified", () => {
    // Having a return shape is NOT grounding. `component of` is classed "list" but returns List<Quantity> —
    // a MAP, not a filter. Fail closed until its stage behaviour is verified against CRLCommon.cql.
    const r = resolve([
      "- shape is Record.",
      "- type is Observation.",
      "- value type is Quantity.",
      "- code is `c`.",
      '- definition is "W" component of "H", then most recent this.',
    ]);
    expect(diagnostics(r)).toContain("stage-ungrounded");
  });

  it("⚠ a rep-local PROJECTION as a stage is refused", () => {
    const r = resolve([
      "- shape is Record.",
      "- type is Observation.",
      "- value type is boolean.",
      "- code is `c`.",
      "- definition is matches this, then most recent this.",
      "- source representation:",
      "  - type is ServiceRequest.",
      '  - coded from "VS".',
    ]);
    expect(diagnostics(r)).toContain("stage-projection-only");
  });

  it("⭐ the CONCEPT-LEVEL `exists this` resolves — it is NOT the rep-local projection", () => {
    // ⚠⚠ THE CASE THE MODULE SHIPPED WRONG. `reductionAsCall` mapped a structural `exists` reduction to the
    // catalog's `Exists` entry, which is the REP-LOCAL projection (`slot: "projection-only"`), so this — the
    // CANONICAL `type is Condition` + `value type is boolean` + `exists this` — was refused as "a rep-local
    // projection cannot be a pipeline stage". MEASURED at 55 in-tree concepts. No test reached it because
    // none of these tests exercised a structural reduction other than `most recent`.
    const r = resolve([
      "- type is Condition.",
      "- value type is boolean.",
      "- code is `c`.",
      "- definition is exists this.",
    ]);
    expect(effects(r)).toEqual(["direct"]);
    expect(r.kind === "resolved" && r.stages[0].call.pattern).toBe("ExistsOverSpace");
    // ⭐ It reads the FLOW, not named operands — the fact that distinguishes its lowering from a terminal
    // `AtLeast`, which is also `direct`.
    expect(r.kind === "resolved" && r.stages[0].reads).toBe("flow");
  });

  it("⭐ BOTH SPELLINGS of concept-level `exists this` resolve identically", () => {
    // ⚠ The matcher is slot-blind: it emits `Exists` for the words `exists this` wherever they appear. If
    // the rename lived only in `reductionAsCall`, the structural spelling would resolve while a terminal
    // `, then exists this` stage refused — the same two-spellings drift, moved rather than removed.
    const structural = resolve([
      "- type is Condition.",
      "- value type is boolean.",
      "- code is `c`.",
      "- definition is exists this.",
    ]);
    const staged = resolve([
      "- type is Condition.",
      "- value type is boolean.",
      "- code is `c`.",
      "- definition is most recent this, then exists this.",
    ]);
    expect(effects(structural)).toEqual(["direct"]);
    expect(effects(staged)).toEqual(["selection", "direct"]);
    const patterns = staged.kind === "resolved" ? staged.stages.map((s) => s.call.pattern) : [];
    expect(patterns).toEqual(["MostRecent", "ExistsOverSpace"]);
  });

  it("⚠ `matches this` is NOT renamed into the definition slot", () => {
    // Its comparand is the representation's own `coded from`, so it has no concept-level counterpart. The
    // rename table is deliberately one entry, not "projections become their concept-level twin".
    const r = resolve([
      "- type is Observation.",
      "- value type is boolean.",
      "- code is `c`.",
      "- definition is matches this.",
      "- source representation:",
      "  - type is ServiceRequest.",
      '  - coded from "VS".',
    ]);
    expect(diagnostics(r)).toContain("stage-projection-only");
  });

  it("⭐ a NAMED reduction target reaches the call — it is not silently dropped", () => {
    // ⚠⚠ `ReductionTarget` is `ThisRecords | ReductionConceptRef`, and `reductionAsCall` returned
    // `args: []` UNCONDITIONALLY — so `exists "W"` resolved byte-identically to `exists this`, reducing a
    // different space with no diagnostic. Latent only because every named-target form was refused upstream;
    // it goes live the moment concept-level existence resolves, which is this same change.
    const named = resolve([
      "- type is Condition.",
      "- value type is boolean.",
      "- code is `c`.",
      '- definition is exists "W".',
    ]);
    const bare = resolve([
      "- type is Condition.",
      "- value type is boolean.",
      "- code is `c`.",
      "- definition is exists this.",
    ]);
    // ⚠ ASSERT THE IDENTITY, not the arg COUNT. A regression that kept an arg but dropped the concept name
    // or the library qualifier would sail past a count/type check.
    const arg = named.kind === "resolved" ? named.stages[0].call.args[0] : undefined;
    expect(arg?.type).toBe("ConceptRefArg");
    expect(arg && "value" in arg && arg.value).toBe("W");
    expect(bare.kind === "resolved" && bare.stages[0].call.args).toEqual([]);
  });

  it("⭐ a QUALIFIED named target keeps its library", () => {
    const r = resolve([
      "- type is Condition.",
      "- value type is boolean.",
      "- code is `c`.",
      '- definition is exists "Other"."W".',
    ]);
    const arg = r.kind === "resolved" ? r.stages[0].call.args[0] : undefined;
    expect(arg && "value" in arg && arg.value).toBe("W");
    expect(arg && "library" in arg && arg.library).toBe("Other");
  });

  it("⭐ a named target makes the occurrence read BOTH the flow and the operand", () => {
    // ⚠ THE CHARTER, `docs/CRL-NORTH-STAR.md:208`: "A reduction over a NAMED set reduces `this` ∪ that set,
    // so a coded concept's own assertions compete". Copying the catalog's binary `reads: "flow"` onto the
    // occurrence would tell a lowering it consumes only the handed space — and the emitter's own
    // `localUnionRef` path (emitCQL.ts:3654) exists precisely because it does not.
    const named = resolve([
      "- type is Condition.",
      "- value type is boolean.",
      "- code is `c`.",
      '- definition is exists "W".',
    ]);
    const bare = resolve([
      "- type is Condition.",
      "- value type is boolean.",
      "- code is `c`.",
      "- definition is exists this.",
    ]);
    expect(named.kind === "resolved" && named.stages[0].reads).toBe("flow-and-operands");
    expect(bare.kind === "resolved" && bare.stages[0].reads).toBe("flow");
  });

  it("⭐ a PRODUCER outputs `many` even from a one-record input — it ADDS", () => {
    // ⚠⚠ THE CASE THAT PASSED CONFORMANCE ON A FALSE CLAIM. Producer output used to inherit the input's
    // cardinality, so a selection followed by a producer stayed `one` and a `shape is Record` concept was
    // blessed while publishing a 2-member space. Per the model at the head of `resolvePipeline.ts`, a
    // producer "adds its candidate to what it was given": n+1 ≥ 2 even from one.
    const r = resolve([
      "- shape is Record.",
      "- type is Observation.",
      "- value type is boolean.",
      "- code is `c`.",
      "- definition is most recent this, then \"W\" at least 30 'kg/m2'.",
    ]);
    expect(diagnostics(r)).toEqual(["terminal-shape-mismatch"]);
  });

  it("⚠ a value stage whose CONCRETE result type disagrees is refused", () => {
    // `returnShape: "other"` cannot tell `BodyMassIndex → Quantity` from a Period-returning pattern, so the
    // old presence check let this resolve clean.
    const r = resolve([
      "- shape is Record.",
      "- type is Observation.",
      "- value type is date.",
      "- code is `c`.",
      '- definition is body mass index of "W" and "H", then most recent this.',
    ]);
    expect(diagnostics(r)).toEqual(["value-incompatible"]);
  });

  it("⚠ an UNDECLARED shape is asked for rather than guessed, on the arm that depends on it", () => {
    // ⚠ `isRecordSpaced` routes through `assumedShapePreMigration` (undeclared → `Scalar`), so this would
    // have been refused `value-stage-not-terminal` — an author-facing diagnostic naming a defect that is not
    // the one present. RETIRE:189-shape-declared.
    const r = resolve([
      "- type is Observation.",
      "- value type is boolean.",
      "- code is `c`.",
      "- definition is \"W\" at least 30 'kg/m2', then most recent this.",
    ]);
    expect(diagnostics(r)).toEqual(["shape-required-to-classify"]);
  });

  it("⚠ a `defined as` composition is NOT reported as having no program", () => {
    // `no-program` says the source space is the whole answer. For a composition that is false — the
    // composition IS the answer — and a consumer branching on it would silently drop the composition.
    const r = resolve([
      "- type is Observation.",
      "- value type is boolean.",
      "- code is `c`.",
      '- defined as exists ("W").',
    ]);
    expect(r.kind).toBe("not-a-pipeline-program");
  });

  it("⚠ `count … at least N` is REFUSED, not lowered lossily", () => {
    // `CountReduction.atLeast` is a bare integer and `CanonicalArg` has no number member. Encoding it as a
    // unitless QuantityArg would be a lie; dropping it repeats the silent-drop defect above. `AtLeastN` is
    // ungrounded today so nothing resolves either way — but relying on the DOWNSTREAM refusal is the
    // coupling that breaks the day someone grounds it.
    const r = resolve([
      "- type is Condition.",
      "- value type is boolean.",
      '- definition is count "W" at least 2.',
    ]);
    expect(diagnostics(r)).toEqual(["reduction-unrepresentable"]);
  });

  it("⭐ TERMINAL CONFORMANCE — a Record concept may not publish a boolean", () => {
    // ⚠ Owed by design R9 and absent: this resolved CLEAN while publishing a value the concept's declared
    // shape contradicts. The producer arm's own comment already spoke of "failing terminal conformance
    // against Scalar" as though the check existed.
    const r = resolve([
      "- shape is Record.",
      "- type is Condition.",
      "- value type is boolean.",
      "- code is `c`.",
      "- definition is exists this.",
    ]);
    expect(diagnostics(r)).toEqual(["terminal-shape-mismatch"]);
  });

  it("⭐ TERMINAL CONFORMANCE — a Scalar concept may not publish a space", () => {
    const r = resolve([
      "- shape is Scalar.",
      "- type is Observation.",
      "- value type is Quantity.",
      "- code is `c`.",
      "- definition is most recent this.",
    ]);
    expect(diagnostics(r)).toEqual(["terminal-shape-mismatch"]);
  });

  it("⚠ a boolean stage in a non-boolean concept is REFUSED — presence is not a type check", () => {
    // `matchesDatum` was `sig.valueType !== undefined`, which let a boolean-returning stage publish itself
    // as a Quantity.
    const r = resolve([
      "- shape is Scalar.",
      "- type is Observation.",
      "- value type is Quantity.",
      "- definition is exists this.",
    ]);
    expect(diagnostics(r)).toEqual(["value-incompatible"]);
  });

  it("a concept with no `definition is` has no program", () => {
    const r = resolve([
      "- shape is RecordSet.",
      "- type is Observation.",
      "- value type is Quantity.",
      "- code is `c`.",
    ]);
    expect(r.kind).toBe("no-program");
  });

  it("a malformed pipeline resolves INVALID, carrying which malformation", () => {
    const r = resolve([
      "- shape is Record.",
      "- type is Observation.",
      "- value type is Quantity.",
      "- code is `c`.",
      '- definition is body mass index of "W" and "H", then.',
    ]);
    expect(diagnostics(r)).toEqual(["malformed"]);
  });
});

describe("resolveConceptPipeline — the GOAL fixture", () => {
  it("⭐ resolves every concept in the canonical target", () => {
    // ⚠ The acceptance check for D6: the resolver must handle BOTH spellings, because `Height`/`Weight` are
    // structural `ReductionDefinition`s while `BMI`/`Obese` are narrative pipelines. A resolver reading only
    // narratives would resolve HALF the target.
    const src = readFileSync(
      path.resolve(__dirname, "../../tests/fixtures/obesity/policy.crl"),
      "utf8",
    );
    const built = buildCRL(src) as unknown as { result?: CRL };
    const concepts = (built.result!.statements as Concept[]).filter((s) => s.type === "Concept");
    expect(concepts.map((c) => c.name)).toEqual(["Obese", "BMI", "Height", "Weight"]);

    const byName = Object.fromEntries(
      concepts.map((c) => [c.name, effects(resolveConceptPipeline(c))]),
    );
    expect(byName).toEqual({
      Obese: ["producer", "selection"],
      BMI: ["producer", "selection"],
      Height: ["selection"],
      Weight: ["selection"],
    });
  });
});
