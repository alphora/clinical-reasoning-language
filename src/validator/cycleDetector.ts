import type {
  CRL,
  Concept,
  CompositionExpression,
  DefinedAsComposition,
  NarrativeClause,
  NarrativeElement,
  ArgValue,
  Location,
} from "../ast/types";

import { ValidationError } from "./validator";

/**
 * Detects cycles in concept reference graphs.
 *
 * Each concept's body may reference other concepts:
 *   - `defined as` composition: walk SemOr/SemAnd/SemNot/CompositionRef/CompositionGroup
 *     for CompositionRef leaves.
 *   - `definition is` narrative: walk NarrativeClause for NConceptRef elements and
 *     recurse into NDisjunction/NConjunction ArgValues.
 *   - `coded from` body: references terminologies, not concepts — out of scope.
 *
 * Cycle = a directed path from concept A back to concept A through these
 * references. Reports the cycle path on first detection per cycle (no
 * duplicates).
 *
 * Algorithm: standard DFS with WHITE/GRAY/BLACK colors. WHITE = unvisited;
 * GRAY = on the current DFS path (back edge to GRAY = cycle); BLACK = fully
 * explored.
 */
export class CycleDetector {
  validate(ast: CRL): ValidationError[] {
    const errors: ValidationError[] = [];

    // Build adjacency: conceptName → Set<referencedConceptName>
    const adjacency = new Map<string, Set<string>>();
    const locations = new Map<string, Location>();

    for (const statement of ast.statements) {
      if (statement.type !== "Concept" || !statement.name) continue;
      const concept = statement as Concept;
      locations.set(concept.name, concept.location);
      const refs = new Set<string>();
      this.collectRefs(concept, refs);
      adjacency.set(concept.name, refs);
    }

    // DFS with coloring
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const cyclesReported = new Set<string>();

    const dfs = (node: string, path: string[]): void => {
      color.set(node, GRAY);
      path.push(node);

      const neighbors = adjacency.get(node) ?? new Set<string>();
      for (const neighbor of neighbors) {
        // Skip neighbors that aren't concepts in this file (would have been
        // caught by ReferenceResolver as unresolved).
        if (!adjacency.has(neighbor)) continue;

        const c = color.get(neighbor) ?? WHITE;
        if (c === WHITE) {
          dfs(neighbor, path);
        } else if (c === GRAY) {
          // Back edge → cycle. Extract the cycle from path.
          const idx = path.indexOf(neighbor);
          if (idx >= 0) {
            const cycle = path.slice(idx);
            cycle.push(neighbor); // close the loop
            const cycleKey = this.canonicalizeCycle(cycle);
            if (!cyclesReported.has(cycleKey)) {
              cyclesReported.add(cycleKey);
              const display = cycle.map((n) => `"${n}"`).join(" → ");
              errors.push({
                message: `Reference cycle detected: ${display}`,
                location: locations.get(node) ?? {
                  start: { line: 1, column: 1 },
                  end: { line: 1, column: 1 },
                },
                severity: "error",
              });
            }
          }
        }
        // BLACK = already fully explored; no cycle through this neighbor.
      }

      color.set(node, BLACK);
      path.pop();
    };

    for (const node of adjacency.keys()) {
      if ((color.get(node) ?? WHITE) === WHITE) {
        dfs(node, []);
      }
    }

    return errors;
  }

  /** Collect all concept refs that a concept's body points to. */
  private collectRefs(concept: Concept, refs: Set<string>): void {
    switch (concept.definition.type) {
      case "CodedFromDefinition":
        return; // terminology ref, not concept
      case "DefinedAsDefinition": {
        const body = concept.definition.body;
        if (body.type === "DefinedAsBareRef") {
          refs.add(body.ref);
        } else if (body.type === "DefinedAsComposition") {
          this.collectFromComposition(
            (body as DefinedAsComposition).expression,
            refs,
          );
        }
        return;
      }
      case "DefinitionIsDefinition":
        this.collectFromNarrative(concept.definition.body, refs);
        return;
    }
  }

  private collectFromComposition(expr: CompositionExpression, refs: Set<string>): void {
    switch (expr.type) {
      case "SemOrExpression":
      case "SemAndExpression":
        for (const term of expr.terms) {
          this.collectFromComposition(term, refs);
        }
        return;
      case "SemNotExpression":
        this.collectFromComposition(expr.expression, refs);
        return;
      case "CompositionGroup":
        this.collectFromComposition(expr.expression, refs);
        return;
      case "CompositionRef":
        refs.add(expr.ref);
        return;
    }
  }

  private collectFromNarrative(clause: NarrativeClause, refs: Set<string>): void {
    for (const el of clause.elements) {
      this.collectFromNarrativeElement(el, refs);
    }
  }

  private collectFromNarrativeElement(el: NarrativeElement, refs: Set<string>): void {
    switch (el.type) {
      case "NConceptRef":
        refs.add(el.value);
        return;
      case "NDisjunction":
        for (const av of el.disjuncts) {
          this.collectFromArgValue(av, refs);
        }
        return;
      case "NConjunction":
        for (const av of el.conjuncts) {
          this.collectFromArgValue(av, refs);
        }
        return;
      // NWord, Quantity — no refs
    }
  }

  private collectFromArgValue(av: ArgValue, refs: Set<string>): void {
    switch (av.type) {
      case "NConceptRef":
        refs.add(av.value);
        return;
      case "NDisjunction":
        for (const inner of av.disjuncts) {
          this.collectFromArgValue(inner, refs);
        }
        return;
      case "NConjunction":
        for (const inner of av.conjuncts) {
          this.collectFromArgValue(inner, refs);
        }
        return;
      // Quantity — no ref
    }
  }

  /**
   * Produce a canonical key for a cycle so we deduplicate.
   * The cycle list is rotated so the alphabetically-smallest node leads;
   * the closing duplicate at the end is dropped before rotation.
   */
  private canonicalizeCycle(cycle: string[]): string {
    if (cycle.length === 0) return "";
    const nodes = cycle.slice(0, -1); // drop closing duplicate
    let min = 0;
    for (let i = 1; i < nodes.length; i++) {
      if (nodes[i] < nodes[min]) min = i;
    }
    const rotated = [...nodes.slice(min), ...nodes.slice(0, min)];
    return rotated.join("→");
  }
}
