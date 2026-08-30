import { describe, expect, it } from "vitest";

import { buildCRL } from "../../index";
import type { CRL, Concept, NarrativeElement } from "../../ast/types";
import { isPipeline, splitPipeline } from "../pipeline";

/**
 * #189 P2 — the pipeline STRUCTURE, as a shared module.
 *
 * The split used to be private to `matchNarrative`, so the validator and the CRE could not reach it without
 * re-splitting words independently — three implementations of one rule. These tests pin the structure only;
 * stage KIND is DERIVED per occurrence in the shared resolver (design D9), never stored per pattern.
 */

/** The narrative elements of concept `C`'s `definition is` clause. */
function elementsOf(definition: string): NarrativeElement[] {
  const src =
    'library "T".\n' +
    'concept "A":\n- shape is Scalar.\n- type is Observation.\n- value type is Quantity.\n- code is `a`.\n' +
    'concept "B":\n- shape is Scalar.\n- type is Observation.\n- value type is Quantity.\n- code is `b`.\n' +
    'concept "C":\n- shape is Record.\n- type is Observation.\n- value type is Quantity.\n' +
    `- ${definition}\n`;
  const built = buildCRL(src) as unknown as { success: boolean; result?: CRL };
  if (!built.success) throw new Error(`fixture did not parse: ${definition}`);
  const concept = (built.result!.statements as Concept[]).find((s) => s.name === "C");
  const node = concept?.definition as { type: string; body?: { elements: NarrativeElement[] } } | undefined;
  if (node?.type !== "DefinitionIsDefinition" || node.body === undefined) {
    throw new Error(`not a narrative definition (got ${node?.type}): ${definition}`);
  }
  return node.body.elements;
}

/** The stages of a well-formed pipeline, or a thrown failure naming what came back instead. */
function stagesOf(definition: string) {
  const split = splitPipeline(elementsOf(definition));
  if (split.kind !== "pipeline") throw new Error(`expected a pipeline, got ${split.kind}`);
  return split.stages;
}

const GOAL = 'definition is body mass index of "A" and "B", then most recent this.';

describe("splitPipeline", () => {
  it("reports `not-a-pipeline` for an ordinary single-stage narrative", () => {
    expect(splitPipeline(elementsOf('definition is body mass index of "A" and "B".')).kind).toBe(
      "not-a-pipeline",
    );
  });

  it("⭐ splits the goal's own two-stage pipeline, in authored order", () => {
    const stages = stagesOf(GOAL);
    expect(stages.length).toBe(2);
    expect(stages.map((s) => s.index)).toEqual([0, 1]);
    // Stage 2 is the bare reduction words — the comma delimiter is stripped, so a stage never sees it.
    expect(stages[1].elements.map((e) => (e as { value?: unknown }).value)).toEqual([
      "most",
      "recent",
      "this",
    ]);
  });

  it("order is LOAD-BEARING — reading order is evaluation order", () => {
    const stages = stagesOf(GOAL);
    // Stage 0 is the producer, stage 1 the reduction — never sorted, never normalized.
    expect(stages[0].elements.length).toBeGreaterThan(stages[1].elements.length);
    expect(stages[0].index).toBe(0);
  });

  it("bare `then` delimits too — the comma reads correctly but is not load-bearing", () => {
    const withComma = stagesOf(GOAL);
    const without = stagesOf('definition is body mass index of "A" and "B" then most recent this.');
    expect(without.length).toBe(withComma.length);
    expect(without[1].elements.map((e) => (e as { value?: unknown }).value)).toEqual(
      withComma[1].elements.map((e) => (e as { value?: unknown }).value),
    );
  });

  it("⚠ a MALFORMED pipeline names WHICH mistake — never a partial chain", () => {
    // Reporting a partial chain would claim more than was understood. But a bare `undefined` was not enough
    // either: the author needs to know WHICH malformation, because the fix differs for each.
    const split = splitPipeline(elementsOf('definition is body mass index of "A" and "B", then.'));
    expect(split.kind).toBe("malformed");
    expect(split.kind === "malformed" ? split.problem : null).toBe("dangling-then");
  });

  it("⭐ each stage carries its OWN span, so a per-stage diagnostic can point AT the stage", () => {
    // ⚠ Load-bearing for every stage diagnostic. `matchNarrative` used to pass `clause.location` to every
    // stage, so "stage 2 of 3 matched nothing" squiggled all three and left the author to guess which.
    const stages = stagesOf(GOAL);
    const [producer, reduction] = stages;
    // The stages are disjoint and ordered: the producer ends at or before the reduction begins.
    expect(producer.location.start.column).toBeLessThan(reduction.location.start.column);
    expect(producer.location.end.column).toBeLessThanOrEqual(reduction.location.start.column);
    // And neither spans the whole narrative — the reduction starts well after the definition does.
    expect(reduction.location.start.column).toBeGreaterThan(producer.location.start.column);
  });
});

describe("isPipeline", () => {
  it("⭐ answers a DIFFERENT question from splitPipeline — authored-as vs well-formed", () => {
    // A dangling `then` IS authored as a pipeline but does not split. Collapsing the two is how a malformed
    // pipeline gets reported as an ordinary unmatched narrative instead of as the pipeline error it is.
    const dangling = elementsOf('definition is body mass index of "A" and "B", then.');
    expect(isPipeline(dangling)).toBe(true);
    expect(splitPipeline(dangling).kind).toBe("malformed");
  });

  it("is false for an ordinary narrative", () => {
    expect(isPipeline(elementsOf('definition is body mass index of "A" and "B".'))).toBe(false);
  });
});
