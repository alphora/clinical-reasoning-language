import { describe, expect, it } from "vitest";

import { buildCRL } from "../../index";
import type { CRL, Concept, NarrativeElement } from "../../ast/types";
import { isPipeline, splitPipeline } from "../pipeline";

/**
 * #189 P2 — the pipeline STRUCTURE, as a shared module.
 *
 * The split used to be private to `matchNarrative`, so the validator and the CRE could not reach it without
 * re-splitting words independently — three implementations of one rule. These tests pin the structure only;
 * stage KIND is a catalog question and lands separately (`bothrep` §13 measured the catalog's return-shape
 * classification as defective, so a kind classifier built on it today would inherit that).
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

describe("splitPipeline", () => {
  it("returns undefined for an ordinary single-stage narrative", () => {
    expect(splitPipeline(elementsOf('definition is body mass index of "A" and "B".'))).toBeUndefined();
  });

  it("⭐ splits the goal's own two-stage pipeline, in authored order", () => {
    const stages = splitPipeline(
      elementsOf('definition is body mass index of "A" and "B", then most recent this.'),
    );
    expect(stages).toBeDefined();
    expect(stages!.length).toBe(2);
    expect(stages!.map((s) => s.index)).toEqual([0, 1]);
    // Stage 2 is the bare reduction words — the comma delimiter is stripped, so a stage never sees it.
    expect(stages![1].elements.map((e) => (e as { value?: unknown }).value)).toEqual([
      "most",
      "recent",
      "this",
    ]);
  });

  it("order is LOAD-BEARING — reading order is evaluation order", () => {
    const stages = splitPipeline(
      elementsOf('definition is body mass index of "A" and "B", then most recent this.'),
    )!;
    // Stage 0 is the producer, stage 1 the reduction — never sorted, never normalized.
    expect(stages[0].elements.length).toBeGreaterThan(stages[1].elements.length);
    expect(stages[0].index).toBe(0);
  });

  it("bare `then` delimits too — the comma reads correctly but is not load-bearing", () => {
    const withComma = splitPipeline(
      elementsOf('definition is body mass index of "A" and "B", then most recent this.'),
    )!;
    const without = splitPipeline(
      elementsOf('definition is body mass index of "A" and "B" then most recent this.'),
    )!;
    expect(without.length).toBe(withComma.length);
    expect(without[1].elements.map((e) => (e as { value?: unknown }).value)).toEqual(
      withComma[1].elements.map((e) => (e as { value?: unknown }).value),
    );
  });

  it("⚠ a MALFORMED pipeline yields undefined — never a partial chain", () => {
    // Reporting a partial chain would claim more than was understood. A dangling `then` has no stage after
    // it, so the narrative is unmatchable as a whole.
    expect(splitPipeline(elementsOf('definition is body mass index of "A" and "B", then.'))).toBeUndefined();
  });
});

describe("isPipeline", () => {
  it("⭐ answers a DIFFERENT question from splitPipeline — authored-as vs well-formed", () => {
    // A dangling `then` IS authored as a pipeline but does not split. Collapsing the two is how a malformed
    // pipeline gets reported as an ordinary unmatched narrative instead of as the pipeline error it is.
    const dangling = elementsOf('definition is body mass index of "A" and "B", then.');
    expect(isPipeline(dangling)).toBe(true);
    expect(splitPipeline(dangling)).toBeUndefined();
  });

  it("is false for an ordinary narrative", () => {
    expect(isPipeline(elementsOf('definition is body mass index of "A" and "B".'))).toBe(false);
  });
});
