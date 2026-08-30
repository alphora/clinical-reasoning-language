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
    expect(producer.outputShape).toEqual({ kind: "space", recordType: "Observation" });
    expect(selection.inputShape).toEqual({ kind: "space", recordType: "Observation" });
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
