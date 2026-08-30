// #189 P2 — THE PIPELINE, as a SHARED structure rather than a matcher-private split.
//
// REFACTOR:grounded (#189 P2) — re-derived from `tmp/DESIGN-P2-pipeline-uncollapse.md` and the pipeline
// model in `tmp/DESIGN-bothrep-derivation-merge.md` §4/§7, NOT from `matchNarrative`'s fold, which is the
// PATIENT (it hands stage 2 a scalar and does not translate).
//
// WHY THIS EXISTS. `- definition is <stage>, then <stage>, then …` is a PIPELINE: reading order is
// evaluation order, and `this` in a stage denotes THE SPACE handed to it by the stage before — never a
// scalar. Three consumers need that structure and until now only one could see it:
//
//   · the MATCHER   — matches each stage individually (the economy the grammar comment argues for);
//   · the VALIDATOR — a SELECTION may not be followed by another SELECTION, and the last stage's output
//                     shape must conform to the declared `shape is` (design P2-D2);
//   · the CRE       — must evaluate the same stages the CQL lane lowers, or the lanes drift
//                     (`bothrep` §6: "a classifier that only routes CQL emission does not close the goal").
//
// The split was private to `matchNarrative`, so the validator and the CRE had no way to reach it without
// re-splitting words independently — three implementations of one rule. This module is the single one.
//
// ⚠ SCOPE. This is the STRUCTURE only: where the stage boundaries are, and what each stage's element run
// is. Stage KIND (producer / filter / selection / aggregate) is a CATALOG question and lands separately —
// `bothrep` §13 measured the catalog's return-shape classification as unverified and defective
// (`Highest`/`Lowest` misclassed as `other`), so a kind classifier built on it today would inherit that.

import type { NarrativeElement } from "../ast/types";

/** One stage of a pipeline: the element run between `then` delimiters, in authored order. */
export interface PipelineStage {
  /** The stage's elements, with the delimiter and any trailing comma removed. */
  elements: NarrativeElement[];
  /** 0-based position. Order is LOAD-BEARING — reading order is evaluation order. */
  index: number;
}

/**
 * Split a narrative's elements into pipeline stages, or `undefined` when it is not a pipeline.
 *
 * `undefined` means "no `then` at all" — a single-stage narrative, which callers handle as an ordinary
 * narrative rather than as a one-stage pipeline. A MALFORMED pipeline (leading / doubled / dangling `then`)
 * also returns `undefined`: the narrative is then unmatchable as a whole, which is the honest outcome —
 * reporting a partial chain would claim more than was understood.
 *
 * The canonical delimiter is `, then`. The comma is PUNCTUATION, carried through the lexer as its own token
 * so the greedy catch-all cannot swallow it, and stripped here so a stage never sees it. Bare `then` also
 * delimits; the comma is not load-bearing, it just reads correctly.
 */
export function splitPipeline(elements: NarrativeElement[]): PipelineStage[] | undefined {
  const cuts: number[] = [];
  elements.forEach((element, i) => {
    if (element.type === "NWord" && element.value === "then") cuts.push(i);
  });
  if (cuts.length === 0) return undefined;

  const stages: PipelineStage[] = [];
  let from = 0;
  for (const cut of [...cuts, elements.length]) {
    let run = elements.slice(from, cut);
    for (;;) {
      const last = run[run.length - 1];
      if (last === undefined || last.type !== "NWord" || last.value !== ",") break;
      run = run.slice(0, -1);
    }
    if (run.length === 0) return undefined; // leading / doubled / dangling `then`
    stages.push({ elements: run, index: stages.length });
    from = cut + 1;
  }
  return stages;
}

/** Whether a narrative is authored as a pipeline (has at least one `then` delimiter).
 *
 *  ⚠ TRUE even for a MALFORMED pipeline, where `splitPipeline` returns `undefined`. The two answer
 *  different questions — "did the author write a pipeline" vs "is it well-formed" — and collapsing them is
 *  how a malformed pipeline gets reported as an ordinary unmatched narrative instead of as the pipeline
 *  error it is. */
export function isPipeline(elements: NarrativeElement[]): boolean {
  return elements.some((element) => element.type === "NWord" && element.value === "then");
}
