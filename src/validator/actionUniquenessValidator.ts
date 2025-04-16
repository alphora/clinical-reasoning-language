import { File, DecisionBody, WhenBlock, BlockBody, ActionStatement, Action } from '../ast/types';

import { ValidationError } from './validator';

export class ActionUniquenessValidator {
  private ast: File | null = null;

  validate(ast: File): ValidationError[] {
    this.ast = ast;
    const errors: ValidationError[] = [];

    // Process each decision statement
    for (const statement of ast.statements) {
      if (statement.type === 'Decision') {
        this.validateDecisionBody(statement.body, errors);
      }
    }

    // Check for action dependencies
    const actionGraph = this.buildActionGraph(ast);
    const actionCycles = this.findCycles(actionGraph);
    for (const cycle of actionCycles) {
      errors.push({
        message: `Cycle detected in decision references: ${cycle.join(' -> ')}`,
        location: this.findActionLocation(ast, cycle[0]),
        severity: 'error',
      });
    }

    // Check for undefined actions
    const definedActions = this.collectDefinedActions(ast);
    for (const statement of ast.statements) {
      if (statement.type === 'Decision') {
        this.checkUndefinedActions(statement.body, definedActions, errors);
      }
    }

    this.ast = null;
    return errors;
  }

  private validateDecisionBody(body: DecisionBody, errors: ValidationError[]): void {
    for (const statement of body.statements) {
      if (statement.type === 'WhenBlock') {
        this.validateWhenBlock(statement, errors);
      }
    }
  }

  private validateWhenBlock(whenBlock: WhenBlock, errors: ValidationError[]): void {
    if (whenBlock.body.type === 'BlockBody') {
      this.validateBlockBody(whenBlock.body, errors);
    } else if (whenBlock.body.type === 'SingleAction') {
      // Single actions are unique by definition
      return;
    }
  }

  private validateBlockBody(blockBody: BlockBody, errors: ValidationError[]): void {
    const doStatements = new Set<string>();
    const useStatements = new Set<string>();

    for (const statement of blockBody.statements) {
      if (statement.type === 'WhenBlock') {
        this.validateWhenBlock(statement, errors);
      } else if (statement.type === 'ActionStatement') {
        this.validateActionStatement(statement, doStatements, useStatements, errors);
      }
    }
  }

  private validateActionStatement(
    statement: ActionStatement,
    doStatements: Set<string>,
    useStatements: Set<string>,
    errors: ValidationError[],
  ): void {
    const action = statement.action;
    if (action.type === 'DoActivity') {
      if (doStatements.has(action.activityName)) {
        errors.push({
          message: `Duplicate do statement: ${action.activityName}`,
          location: action.location,
          severity: 'error',
        });
      }
      doStatements.add(action.activityName);
    } else if (action.type === 'UseDecision') {
      if (useStatements.has(action.decisionName)) {
        errors.push({
          message: `Duplicate use statement: ${action.decisionName}`,
          location: action.location,
          severity: 'error',
        });
      }
      useStatements.add(action.decisionName);
    }
  }

  private buildActionGraph(ast: File): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    // Initialize graph with all actions
    for (const statement of ast.statements) {
      if (statement.type === 'Decision') {
        this.collectActions(statement.body).forEach(action => {
          if (action.type === 'DoActivity') {
            graph.set(`Activity:${action.activityName}`, new Set<string>());
          } else if (action.type === 'UseDecision') {
            graph.set(`Decision:${action.decisionName}`, new Set<string>());
          }
        });
      }
    }

    // Build edges from action dependencies
    for (const statement of ast.statements) {
      if (statement.type === 'Decision') {
        this.processActionDependencies(statement.body, graph);
      }
    }

    return graph;
  }

  private collectActions(body: DecisionBody): Action[] {
    const actions: Action[] = [];
    for (const statement of body.statements) {
      if (statement.type === 'WhenBlock') {
        if (statement.body.type === 'BlockBody') {
          statement.body.statements.forEach(s => {
            if (s.type === 'ActionStatement') {
              actions.push(s.action);
            }
          });
        } else if (statement.body.type === 'SingleAction') {
          actions.push(statement.body.action);
        }
      }
    }
    return actions;
  }

  private processActionDependencies(body: DecisionBody, graph: Map<string, Set<string>>): void {
    for (const statement of body.statements) {
      if (statement.type === 'WhenBlock') {
        if (statement.body.type === 'BlockBody') {
          statement.body.statements.forEach(s => {
            if (s.type === 'ActionStatement') {
              const action = s.action;
              if (action.type === 'UseDecision') {
                // Add an edge from the current decision to the referenced decision
                const currentDecision = this.findContainingDecision(body);
                if (currentDecision && currentDecision !== action.decisionName) {
                  const dependencies =
                    graph.get(`Decision:${currentDecision}`) || new Set<string>();
                  dependencies.add(`Decision:${action.decisionName}`);
                  graph.set(`Decision:${currentDecision}`, dependencies);
                }
              }
            }
          });
        } else if (statement.body.type === 'SingleAction') {
          const action = statement.body.action;
          if (action.type === 'UseDecision') {
            // Add an edge from the current decision to the referenced decision
            const currentDecision = this.findContainingDecision(body);
            if (currentDecision && currentDecision !== action.decisionName) {
              const dependencies = graph.get(`Decision:${currentDecision}`) || new Set<string>();
              dependencies.add(`Decision:${action.decisionName}`);
              graph.set(`Decision:${currentDecision}`, dependencies);
            }
          }
        }
      }
    }
  }

  private findContainingDecision(body: DecisionBody): string | null {
    // Find the decision that contains this body by looking at the AST
    for (const statement of this.ast?.statements || []) {
      if (statement.type === 'Decision' && statement.body === body) {
        return statement.name;
      }
    }
    return null;
  }

  private findCycles(graph: Map<string, Set<string>>): string[][] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

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

    const neighbors = graph.get(node) || new Set<string>();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        this.dfs(neighbor, graph, visited, recursionStack, currentPath, cycles);
      } else if (recursionStack.has(neighbor)) {
        const cycleStart = currentPath.indexOf(neighbor);
        cycles.push(currentPath.slice(cycleStart));
      }
    }

    recursionStack.delete(node);
    currentPath.pop();
  }

  private findActionLocation(
    ast: File,
    nodeId: string,
  ): { start: { line: number; column: number }; end: { line: number; column: number } } {
    const [type, name] = nodeId.split(':');
    for (const statement of ast.statements) {
      if (statement.type === 'Decision') {
        const location = this.findActionInBody(statement.body, name);
        if (location) {
          return location;
        }
      }
    }
    return { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } };
  }

  private findActionInBody(
    body: DecisionBody,
    actionName: string,
  ): { start: { line: number; column: number }; end: { line: number; column: number } } | null {
    for (const statement of body.statements) {
      if (statement.type === 'WhenBlock') {
        if (statement.body.type === 'BlockBody') {
          for (const s of statement.body.statements) {
            if (s.type === 'ActionStatement') {
              const action = s.action;
              if (action.type === 'DoActivity' && action.activityName === actionName) {
                return s.location;
              } else if (action.type === 'UseDecision' && action.decisionName === actionName) {
                return s.location;
              }
            }
          }
        } else if (statement.body.type === 'SingleAction') {
          const action = statement.body.action;
          if (action.type === 'DoActivity' && action.activityName === actionName) {
            return statement.body.location;
          } else if (action.type === 'UseDecision' && action.decisionName === actionName) {
            return statement.body.location;
          }
        }
      }
    }
    return null;
  }

  private collectDefinedActions(ast: File): Set<string> {
    const definedActions = new Set<string>();
    for (const statement of ast.statements) {
      if (statement.type === 'Decision') {
        this.collectActions(statement.body).forEach(action => {
          if (action.type === 'DoActivity') {
            definedActions.add(action.activityName);
          } else if (action.type === 'UseDecision') {
            definedActions.add(action.decisionName);
          }
        });
      }
    }
    return definedActions;
  }

  private checkUndefinedActions(
    body: DecisionBody,
    definedActions: Set<string>,
    errors: ValidationError[],
  ): void {
    for (const statement of body.statements) {
      if (statement.type === 'WhenBlock') {
        if (statement.body.type === 'BlockBody') {
          statement.body.statements.forEach(s => {
            if (s.type === 'ActionStatement') {
              const action = s.action;
              if (action.type === 'UseDecision' && !definedActions.has(action.decisionName)) {
                errors.push({
                  message: `Undefined decision: ${action.decisionName}`,
                  location: s.location,
                  severity: 'error',
                });
              }
            }
          });
        } else if (statement.body.type === 'SingleAction') {
          const action = statement.body.action;
          if (action.type === 'UseDecision' && !definedActions.has(action.decisionName)) {
            errors.push({
              message: `Undefined decision: ${action.decisionName}`,
              location: statement.body.location,
              severity: 'error',
            });
          }
        }
      }
    }
  }
}
