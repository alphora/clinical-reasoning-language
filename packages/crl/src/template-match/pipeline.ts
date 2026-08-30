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

import type { Location, NarrativeElement } from "../ast/types";

/** One stage of a pipeline: the element run between `then` delimiters, in authored order. */
export interface PipelineStage {
  /** The stage's elements, with the delimiter and any trailing comma removed. */
  elements: NarrativeElement[];
  /** 0-based position. Order is LOAD-BEARING — reading order is evaluation order. */
  index: number;
  /**
   * ⭐ THIS STAGE's OWN span, from its first element's start to its last element's end.
   *
   * ⚠ Without it every stage diagnostic points at the WHOLE definition: `matchNarrative` passes
   * `clause.location` to every stage, so "stage 2 of 3 matched nothing" would squiggle all three and leave
   * the author to guess which. A per-stage error that cannot say WHERE is barely an error.
   */
  location: Location;
}

/** Why a `then`-bearing narrative could not be split into stages. Each names the authoring mistake. */
export type PipelineMalformation =
  /** `, then <stage>` with nothing before the first delimiter. */
  | "leading-then"
  /** `<stage>, then, then <stage>` — an empty run between two delimiters. */
  | "doubled-then"
  /** `<stage>, then` — a delimiter with no stage after it. */
  | "dangling-then";

/**
 * The result of splitting. A discriminated union rather than `PipelineStage[] | undefined`, because the
 * three outcomes are genuinely different and collapsing two of them is how a MALFORMED pipeline gets
 * reported as an ordinary unmatched narrative instead of as the authoring error it is.
 */
export type PipelineSplit =
  /** No `then` at all — an ordinary single-stage narrative, not a pipeline. */
  | { kind: "not-a-pipeline" }
  /** A `then` is present but the runs around it do not form stages. Carries WHICH mistake, and WHERE. */
  | { kind: "malformed"; problem: PipelineMalformation; location: Location }
  | { kind: "pipeline"; stages: PipelineStage[] };

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
export function splitPipeline(elements: NarrativeElement[]): PipelineSplit {
  const cuts: number[] = [];
  elements.forEach((element, i) => {
    if (element.type === "NWord" && element.value === "then") cuts.push(i);
  });
  if (cuts.length === 0) return { kind: "not-a-pipeline" };

  const stages: PipelineStage[] = [];
  let from = 0;
  const boundaries = [...cuts, elements.length];
  for (const [n, cut] of boundaries.entries()) {
    let run = elements.slice(from, cut);
    for (;;) {
      const last = run[run.length - 1];
      if (last === undefined || last.type !== "NWord" || last.value !== ",") break;
      run = run.slice(0, -1);
    }
    if (run.length === 0) {
      // WHICH mistake, by where the empty run sits: before the first delimiter, after the last, or between
      // two. The author needs the distinction — the fix differs for each.
      const problem: PipelineMalformation =
        n === 0 ? "leading-then" : n === boundaries.length - 1 ? "dangling-then" : "doubled-then";
      // Point at the delimiter that could not be satisfied, not at the whole narrative.
      const marker = elements[Math.min(cut, elements.length - 1)];
      return { kind: "malformed", problem, location: marker.location };
    }
    stages.push({
      elements: run,
      index: stages.length,
      location: spanOf(run),
    });
    from = cut + 1;
  }
  return { kind: "pipeline", stages };
}

/** The span from the first element's start to the last element's end. `run` is never empty here. */
function spanOf(run: NarrativeElement[]): Location {
  const first = run[0].location;
  const last = run[run.length - 1].location;
  return { start: first.start, end: last.end };
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
