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
import { getRefName, getRefLibrary, isQualifiedRef } from "../ast/types";
import type { LibraryScope, SourceContext } from "../imports/scopes";
import { lookupKnownLibrary } from "../imports/scopes";

import { ValidationError } from "./validator";

/**
 * Detects cycles in concept reference graphs.
 *
 * Single-file mode (no `sources`): bare-name adjacency over the AST's
 * concepts. Same behavior as v2.0.
 *
 * Multi-file mode (with `sources`): adjacency keyed by
 * `${currentLibrary}|${conceptName}`. Bare refs in library L create an
 * edge to `L|refName`; qualified refs `"Other"."X"` create an edge to
 * `Other|X`. DFS once over the union; cycles report with library prefixes
 * when the path crosses libraries.
 *
 * Algorithm: standard WHITE/GRAY/BLACK DFS. Back edge to GRAY = cycle;
 * the cycle path is canonicalized before deduplication.
 */
export class CycleDetector {
  validate(ast: CRL, sources?: SourceContext[]): ValidationError[] {
    if (sources) {
      return this.validateScoped(sources);
    }
    return this.validateFlat(ast);
  }

  // -------------------------- single-file path --------------------------

  private validateFlat(ast: CRL): ValidationError[] {
    const adjacency = new Map<string, Set<string>>();
    const locations = new Map<string, Location>();

    for (const statement of ast.statements) {
      if (statement.type !== "Concept" || !statement.name) continue;
      const concept = statement as Concept;
      locations.set(concept.name, concept.location);
      const refs = new Set<string>();
      this.collectRefs(concept, refs, undefined);
      adjacency.set(concept.name, refs);
    }

    return this.runDfs(
      adjacency,
      locations,
      undefined,
      (display) => display.map((n) => `"${n}"`).join(" → "),
    );
  }

  // --------------------------- multi-file path --------------------------

  private validateScoped(sources: SourceContext[]): ValidationError[] {
    const adjacency = new Map<string, Set<string>>();
    const locations = new Map<string, Location>();
    // Track owner metadata per node key so cycle errors carry source
    // attribution (libraryName + filePath of the node where the back-edge
    // was detected).
    const sourcesByNode = new Map<string, { libraryName: string; filePath: string }>();

    for (const { stmt, scope } of sources) {
      if (stmt.type !== "Concept" || !stmt.name) continue;
      const concept = stmt as Concept;
      const key = nodeKey(scope.origin, scope.currentLibrary, concept.name);
      locations.set(key, concept.location);
      sourcesByNode.set(key, {
        libraryName: scope.currentLibrary,
        filePath: scope.filePath,
      });
      const refs = new Set<string>();
      // Note: edges to package-origin libraries the asker did NOT include
      // would still be added (this CycleDetector doesn't enforce visibility);
      // the back-edge would also not exist because that package's statements
      // get keyed under "package|...". If the user's bug is "qualified ref
      // to unincluded package", ReferenceResolver fires
      // external-library-not-included; the cycle path through that ref
      // simply doesn't close because no edge from the package back to the
      // asker exists. So no false cycles in practice.
      this.collectRefs(concept, refs, scope);
      adjacency.set(key, refs);
    }

    // Render cycle as `"LibA"."C1" → "LibB"."C2" → "LibA"."C1"` so authors
    // see which library each node lives in.
    return this.runDfs(adjacency, locations, sourcesByNode, (display) =>
      display
        .map((k) => {
          const parts = k.split("|");
          // Keys are ${origin}|${lib}|${name}; render as `"lib"."name"`.
          if (parts.length === 3) return `"${parts[1]}"."${parts[2]}"`;
          return `"${k}"`;
        })
        .join(" → "),
    );
  }

  // ------------------------ shared DFS routine --------------------------

  private runDfs(
    adjacency: Map<string, Set<string>>,
    locations: Map<string, Location>,
    sourcesByNode: Map<string, { libraryName: string; filePath: string }> | undefined,
    formatDisplay: (path: string[]) => string,
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const cyclesReported = new Set<string>();

    const dfs = (node: string, path: string[]): void => {
      color.set(node, GRAY);
      path.push(node);

      const neighbors = adjacency.get(node) ?? new Set<string>();
      for (const neighbor of neighbors) {
        // Skip neighbors not in adjacency — ReferenceResolver would have
        // caught them as unresolved-reference or external-library-not-included.
        if (!adjacency.has(neighbor)) continue;

        const c = color.get(neighbor) ?? WHITE;
        if (c === WHITE) {
          dfs(neighbor, path);
        } else if (c === GRAY) {
          const idx = path.indexOf(neighbor);
          if (idx >= 0) {
            const cycle = path.slice(idx);
            cycle.push(neighbor); // close the loop
            const cycleKey = this.canonicalizeCycle(cycle);
            if (!cyclesReported.has(cycleKey)) {
              cyclesReported.add(cycleKey);
              const sourceMeta = sourcesByNode?.get(node);
              errors.push({
                kind: "reference-cycle",
                message: `Reference cycle detected: ${formatDisplay(cycle)}`,
                location: locations.get(node) ?? {
                  start: { line: 1, column: 1 },
                  end: { line: 1, column: 1 },
                },
                severity: "error",
                ...(sourceMeta ? { libraryName: sourceMeta.libraryName, filePath: sourceMeta.filePath } : {}),
              });
            }
          }
        }
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

  // ------------------------ ref collection ------------------------------

  /**
   * Walk a concept body and add edge keys for every concept ref it makes.
   * Multi-file mode passes `currentLibrary`; bare refs go to
   * `currentLibrary|refName`, qualified refs to `qualifier|refName`.
   * Single-file mode passes undefined; refs stay bare.
   */
  private collectRefs(
    concept: Concept,
    refs: Set<string>,
    scope: LibraryScope | undefined,
  ): void {
    switch (concept.definition.type) {
      case "CodedFromDefinition":
        return; // terminology ref, not concept
      case "DefinedAsDefinition": {
        const body = concept.definition.body;
        if (body.type === "DefinedAsBareRef") {
          this.addEdge(body.ref, refs, scope);
        } else if (body.type === "DefinedAsComposition") {
          this.collectFromComposition(
            (body as DefinedAsComposition).expression,
            refs,
            scope,
          );
        }
        return;
      }
      case "DefinitionIsDefinition":
        this.collectFromNarrative(concept.definition.body, refs, scope);
        return;
    }
  }

  private collectFromComposition(
    expr: CompositionExpression,
    refs: Set<string>,
    scope: LibraryScope | undefined,
  ): void {
    switch (expr.type) {
      case "SemOrExpression":
      case "SemAndExpression":
        for (const term of expr.terms) {
          this.collectFromComposition(term, refs, scope);
        }
        return;
      case "SemNotExpression":
        this.collectFromComposition(expr.expression, refs, scope);
        return;
      case "CompositionGroup":
        this.collectFromComposition(expr.expression, refs, scope);
        return;
      case "CompositionRef":
        this.addEdge(expr.ref, refs, scope);
        return;
    }
  }

  private collectFromNarrative(
    clause: NarrativeClause,
    refs: Set<string>,
    scope: LibraryScope | undefined,
  ): void {
    for (const el of clause.elements) {
      this.collectFromNarrativeElement(el, refs, scope);
    }
  }

  private collectFromNarrativeElement(
    el: NarrativeElement,
    refs: Set<string>,
    scope: LibraryScope | undefined,
  ): void {
    switch (el.type) {
      case "NConceptRef":
        this.addEdge(el.value, refs, scope);
        return;
      case "NDisjunction":
        for (const av of el.disjuncts) {
          this.collectFromArgValue(av, refs, scope);
        }
        return;
      case "NConjunction":
        for (const av of el.conjuncts) {
          this.collectFromArgValue(av, refs, scope);
        }
        return;
      // NWord, Quantity — no refs
    }
  }

  private collectFromArgValue(
    av: ArgValue,
    refs: Set<string>,
    scope: LibraryScope | undefined,
  ): void {
    switch (av.type) {
      case "NConceptRef":
        this.addEdge(av.value, refs, scope);
        return;
      case "NDisjunction":
        for (const inner of av.disjuncts) {
          this.collectFromArgValue(inner, refs, scope);
        }
        return;
      case "NConjunction":
        for (const inner of av.conjuncts) {
          this.collectFromArgValue(inner, refs, scope);
        }
        return;
      // Quantity — no ref
    }
  }

  /**
   * Add an adjacency edge for a concept reference.
   * Multi-file: bare ref → `${scope.origin}|${scope.currentLibrary}|${refName}`;
   * qualified ref `"Other"."X"` → resolved via `lookupKnownLibrary` to its
   * actual origin (local vs. package) then keyed accordingly.
   * Single-file: bare name only.
   *
   * Returns silently when the qualified ref's library can't be resolved
   * (ReferenceResolver fires `external-library-not-included` for those).
   */
  private addEdge(
    ref: import("../ast/types").ReferenceName,
    refs: Set<string>,
    scope: LibraryScope | undefined,
  ): void {
    const refName = getRefName(ref);
    if (!refName) return;
    if (scope === undefined) {
      refs.add(refName);
      return;
    }
    if (isQualifiedRef(ref)) {
      const qual = getRefLibrary(ref);
      if (!qual) return; // malformed qualified ref — let the parser surface it
      // Resolve to the right origin so adjacency keys match the target
      // node's key (which was registered by validateScoped using its own
      // scope.origin).
      if (qual === scope.currentLibrary) {
        refs.add(nodeKey(scope.origin, qual, refName));
        return;
      }
      const target = lookupKnownLibrary(scope, qual);
      if (!target) return; // unknown lib — external-library-not-included
      refs.add(nodeKey(target.origin, target.libraryName, refName));
      return;
    }
    refs.add(nodeKey(scope.origin, scope.currentLibrary, refName));
  }

  private canonicalizeCycle(cycle: string[]): string {
    if (cycle.length === 0) return "";
    const nodes = cycle.slice(0, -1);
    let min = 0;
    for (let i = 1; i < nodes.length; i++) {
      if (nodes[i] < nodes[min]) min = i;
    }
    const rotated = [...nodes.slice(min), ...nodes.slice(0, min)];
    return rotated.join("→");
  }
}

function nodeKey(origin: "local" | "package" | "root", libraryName: string, name: string): string {
  return `${origin}|${libraryName}|${name}`;
}
