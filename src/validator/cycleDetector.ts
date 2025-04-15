import { File, DecisionBody, WhenBlock, BlockBody, Action } from '../ast/types';

import { ValidationError } from './validator';

export class CycleDetector {
  validate(ast: File): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check for decision cycles
    const decisionGraph = this.buildDecisionGraph(ast);
    const decisionCycles = this.findCycles(decisionGraph);
    for (const cycle of decisionCycles) {
      errors.push({
        message: `Cycle detected in decision references: ${cycle.join(' -> ')}`,
        location: this.findDecisionLocation(ast, cycle[0]),
        severity: 'error',
      });
    }

    // Check for concept inference cycles
    const conceptGraph = this.buildConceptGraph(ast);
    const conceptCycles = this.findCycles(conceptGraph);
    for (const cycle of conceptCycles) {
      errors.push({
        message: `Cycle detected in concept inferences: ${cycle.join(' -> ')}`,
        location: this.findConceptLocation(ast, cycle[0]),
        severity: 'error',
      });
    }

    return errors;
  }

  private buildDecisionGraph(ast: File): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    // Initialize graph with all decisions
    for (const statement of ast.statements) {
      if (statement.type === 'Decision') {
        graph.set(statement.name, new Set<string>());
      }
    }

    // Build edges from use statements
    for (const statement of ast.statements) {
      if (statement.type === 'Decision') {
        this.processDecisionBody(statement.body, statement.name, graph);
      }
    }

    return graph;
  }

  private processDecisionBody(
    body: DecisionBody,
    sourceName: string,
    graph: Map<string, Set<string>>,
  ): void {
    for (const statement of body.statements) {
      if (statement.type === 'WhenBlock') {
        this.processWhenBlock(statement, sourceName, graph);
      }
    }
  }

  private processWhenBlock(
    whenBlock: WhenBlock,
    sourceName: string,
    graph: Map<string, Set<string>>,
  ): void {
    if (whenBlock.body.type === 'BlockBody') {
      this.processBlockBody(whenBlock.body, sourceName, graph);
    } else if (whenBlock.body.type === 'SingleAction') {
      this.processAction(whenBlock.body.action, sourceName, graph);
    }
  }

  private processBlockBody(
    blockBody: BlockBody,
    sourceName: string,
    graph: Map<string, Set<string>>,
  ): void {
    for (const statement of blockBody.statements) {
      if (statement.type === 'WhenBlock') {
        this.processWhenBlock(statement, sourceName, graph);
      } else if (statement.type === 'ActionStatement') {
        this.processAction(statement.action, sourceName, graph);
      }
    }
  }

  private processAction(action: Action, sourceName: string, graph: Map<string, Set<string>>): void {
    if (action.type === 'UseDecision') {
      const edges = graph.get(sourceName);
      if (edges) {
        edges.add(action.decisionName);
      }
    }
  }

  private buildConceptGraph(ast: File): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    // Initialize graph with all concepts
    for (const statement of ast.statements) {
      if (statement.type === 'Concept') {
        graph.set(statement.name, new Set<string>());
      }
    }

    // Build edges from inferred by statements
    for (const statement of ast.statements) {
      if (statement.type === 'Concept' && statement.definition.type === 'InferredByDefinition') {
        const edges = graph.get(statement.name);
        if (edges && statement.definition.concept) {
          edges.add(statement.definition.concept);
        }
      }
    }

    return graph;
  }

  private findCycles(graph: Map<string, Set<string>>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        this.dfs(node, graph, visited, recursionStack, [], cycles);
      }
    }

    return cycles;
  }

  private dfs(
    node: string,
    graph: Map<string, Set<string>>,
    visited: Set<string>,
    recursionStack: Set<string>,
    currentPath: string[],
    cycles: string[][],
  ): void {
    visited.add(node);
    recursionStack.add(node);
    currentPath.push(node);

    const neighbors = graph.get(node);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          this.dfs(neighbor, graph, visited, recursionStack, currentPath, cycles);
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = currentPath.indexOf(neighbor);
          cycles.push(currentPath.slice(cycleStart));
        }
      }
    }

    recursionStack.delete(node);
    currentPath.pop();
  }

  private findDecisionLocation(
    ast: File,
    decisionName: string,
  ): { start: { line: number; column: number }; end: { line: number; column: number } } {
    for (const statement of ast.statements) {
      if (statement.type === 'Decision' && statement.name === decisionName) {
        return statement.location;
      }
    }
    return { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } };
  }

  private findConceptLocation(
    ast: File,
    conceptName: string,
  ): { start: { line: number; column: number }; end: { line: number; column: number } } {
    for (const statement of ast.statements) {
      if (statement.type === 'Concept' && statement.name === conceptName) {
        return statement.location;
      }
    }
    return { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } };
  }
}
