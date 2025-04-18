"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionUniquenessValidator = void 0;
class ActionUniquenessValidator {
    constructor() {
        this.ast = null;
    }
    validate(ast) {
        this.ast = ast;
        const errors = [];
        for (const statement of ast.statements) {
            if (statement.type === 'Decision') {
                this.validateDecisionBody(statement.body, errors);
            }
        }
        const actionGraph = this.buildActionGraph(ast);
        const actionCycles = this.findCycles(actionGraph);
        for (const cycle of actionCycles) {
            errors.push({
                message: `Cycle detected in decision references: ${cycle.join(' -> ')}`,
                location: this.findActionLocation(ast, cycle[0]),
                severity: 'error',
            });
        }
        const definedActions = this.collectDefinedActions(ast);
        for (const statement of ast.statements) {
            if (statement.type === 'Decision') {
                this.checkUndefinedActions(statement.body, definedActions, errors);
            }
        }
        this.ast = null;
        return errors;
    }
    validateDecisionBody(body, errors) {
        for (const statement of body.statements) {
            if (statement.type === 'WhenBlock') {
                this.validateWhenBlock(statement, errors);
            }
        }
    }
    validateWhenBlock(whenBlock, errors) {
        if (whenBlock.body.type === 'BlockBody') {
            this.validateBlockBody(whenBlock.body, errors);
        }
        else if (whenBlock.body.type === 'SingleAction') {
            return;
        }
    }
    validateBlockBody(blockBody, errors) {
        const doStatements = new Set();
        const useStatements = new Set();
        for (const statement of blockBody.statements) {
            if (statement.type === 'WhenBlock') {
                this.validateWhenBlock(statement, errors);
            }
            else if (statement.type === 'ActionStatement') {
                this.validateActionStatement(statement, doStatements, useStatements, errors);
            }
        }
    }
    validateActionStatement(statement, doStatements, useStatements, errors) {
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
        }
        else if (action.type === 'UseDecision') {
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
    buildActionGraph(ast) {
        const graph = new Map();
        for (const statement of ast.statements) {
            if (statement.type === 'Decision') {
                this.collectActions(statement.body).forEach(action => {
                    if (action.type === 'DoActivity') {
                        graph.set(`Activity:${action.activityName}`, new Set());
                    }
                    else if (action.type === 'UseDecision') {
                        graph.set(`Decision:${action.decisionName}`, new Set());
                    }
                });
            }
        }
        for (const statement of ast.statements) {
            if (statement.type === 'Decision') {
                this.processActionDependencies(statement.body, graph);
            }
        }
        return graph;
    }
    collectActions(body) {
        const actions = [];
        for (const statement of body.statements) {
            if (statement.type === 'WhenBlock') {
                if (statement.body.type === 'BlockBody') {
                    statement.body.statements.forEach(s => {
                        if (s.type === 'ActionStatement') {
                            actions.push(s.action);
                        }
                    });
                }
                else if (statement.body.type === 'SingleAction') {
                    actions.push(statement.body.action);
                }
            }
        }
        return actions;
    }
    processActionDependencies(body, graph) {
        for (const statement of body.statements) {
            if (statement.type === 'WhenBlock') {
                if (statement.body.type === 'BlockBody') {
                    statement.body.statements.forEach(s => {
                        if (s.type === 'ActionStatement') {
                            const action = s.action;
                            if (action.type === 'UseDecision') {
                                const currentDecision = this.findContainingDecision(body);
                                if (currentDecision && currentDecision !== action.decisionName) {
                                    const dependencies = graph.get(`Decision:${currentDecision}`) || new Set();
                                    dependencies.add(`Decision:${action.decisionName}`);
                                    graph.set(`Decision:${currentDecision}`, dependencies);
                                }
                            }
                        }
                    });
                }
                else if (statement.body.type === 'SingleAction') {
                    const action = statement.body.action;
                    if (action.type === 'UseDecision') {
                        const currentDecision = this.findContainingDecision(body);
                        if (currentDecision && currentDecision !== action.decisionName) {
                            const dependencies = graph.get(`Decision:${currentDecision}`) || new Set();
                            dependencies.add(`Decision:${action.decisionName}`);
                            graph.set(`Decision:${currentDecision}`, dependencies);
                        }
                    }
                }
            }
        }
    }
    findContainingDecision(body) {
        for (const statement of this.ast?.statements || []) {
            if (statement.type === 'Decision' && statement.body === body) {
                return statement.name;
            }
        }
        return null;
    }
    findCycles(graph) {
        const visited = new Set();
        const recursionStack = new Set();
        const cycles = [];
        for (const node of graph.keys()) {
            if (!visited.has(node)) {
                this.dfs(node, graph, visited, recursionStack, [], cycles);
            }
        }
        return cycles;
    }
    dfs(node, graph, visited, recursionStack, currentPath, cycles) {
        visited.add(node);
        recursionStack.add(node);
        currentPath.push(node);
        const neighbors = graph.get(node) || new Set();
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                this.dfs(neighbor, graph, visited, recursionStack, currentPath, cycles);
            }
            else if (recursionStack.has(neighbor)) {
                const cycleStart = currentPath.indexOf(neighbor);
                cycles.push(currentPath.slice(cycleStart));
            }
        }
        recursionStack.delete(node);
        currentPath.pop();
    }
    findActionLocation(ast, nodeId) {
        const [, name] = nodeId.split(':');
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
    findActionInBody(body, actionName) {
        for (const statement of body.statements) {
            if (statement.type === 'WhenBlock') {
                if (statement.body.type === 'BlockBody') {
                    for (const s of statement.body.statements) {
                        if (s.type === 'ActionStatement') {
                            const action = s.action;
                            if (action.type === 'DoActivity' && action.activityName === actionName) {
                                return s.location;
                            }
                            else if (action.type === 'UseDecision' && action.decisionName === actionName) {
                                return s.location;
                            }
                        }
                    }
                }
                else if (statement.body.type === 'SingleAction') {
                    const action = statement.body.action;
                    if (action.type === 'DoActivity' && action.activityName === actionName) {
                        return statement.body.location;
                    }
                    else if (action.type === 'UseDecision' && action.decisionName === actionName) {
                        return statement.body.location;
                    }
                }
            }
        }
        return null;
    }
    collectDefinedActions(ast) {
        const definedActions = new Set();
        for (const statement of ast.statements) {
            if (statement.type === 'Decision') {
                this.collectActions(statement.body).forEach(action => {
                    if (action.type === 'DoActivity') {
                        definedActions.add(action.activityName);
                    }
                    else if (action.type === 'UseDecision') {
                        definedActions.add(action.decisionName);
                    }
                });
            }
        }
        return definedActions;
    }
    checkUndefinedActions(body, definedActions, errors) {
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
                }
                else if (statement.body.type === 'SingleAction') {
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
exports.ActionUniquenessValidator = ActionUniquenessValidator;
//# sourceMappingURL=actionUniquenessValidator.js.map