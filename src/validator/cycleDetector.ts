import { ValidationError } from './validator';
//TODO: not working
type NodeId = string;
type AdjacencyList = Map<NodeId, Set<NodeId>>;

interface DecisionDeclaration {
  id: string;
  decisionReferences?: string[];
  conceptInferences?: string[];
}

export class CycleDetector {
  private readonly decisionAdjacencyList: AdjacencyList = new Map();
  private readonly conceptAdjacencyList: AdjacencyList = new Map();

  public validate(declarations: DecisionDeclaration[]): ValidationError[] {
    const errors: ValidationError[] = [];

    // Build adjacency lists
    for (const declaration of declarations) {
      // Add decision references
      if (declaration.decisionReferences) {
        const source = declaration.id;
        if (!this.decisionAdjacencyList.has(source)) {
          this.decisionAdjacencyList.set(source, new Set());
        }
        for (const ref of declaration.decisionReferences) {
          this.decisionAdjacencyList.get(source)!.add(ref);
        }
      }

      // Add concept inferences
      if (declaration.conceptInferences) {
        const source = declaration.id;
        if (!this.conceptAdjacencyList.has(source)) {
          this.conceptAdjacencyList.set(source, new Set());
        }
        for (const inf of declaration.conceptInferences) {
          this.conceptAdjacencyList.get(source)!.add(inf);
        }
      }
    }

    // Detect cycles in decisions
    const decisionCycles = this.detectCycles(this.decisionAdjacencyList, 'Decision');
    errors.push(...decisionCycles);

    // Detect cycles in concepts
    const conceptCycles = this.detectCycles(this.conceptAdjacencyList, 'Concept');
    errors.push(...conceptCycles);

    return errors;
  }

  private detectCycles(adjacencyList: AdjacencyList, nodeType: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const visited = new Set<NodeId>();
    const recursionStack = new Set<NodeId>();
    const cycles = new Set<string>();

    const dfs = (node: NodeId, path: NodeId[]): void => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = adjacencyList.get(node) || new Set<NodeId>();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle - check if it's a true cycle (returns to start)
          const cycleStartIndex = path.indexOf(neighbor);
          const cycle = path.slice(cycleStartIndex);
          cycle.push(neighbor); // Complete the cycle

          // Only report if it's a true cycle (returns to start)
          if (cycle[0] === cycle[cycle.length - 1]) {
            const cyclePath = cycle.map(node => `${nodeType}:${node}`).join(' -> ');
            if (!cycles.has(cyclePath)) {
              cycles.add(cyclePath);
              errors.push({
                message: `Cycle detected in ${nodeType.toLowerCase()} references: ${cyclePath}`,
                severity: 'error',
                location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
              });
            }
          }
        }
      }

      recursionStack.delete(node);
    };

    for (const node of adjacencyList.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return errors;
  }
}
