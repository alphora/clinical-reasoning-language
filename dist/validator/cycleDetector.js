"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CycleDetector = void 0;
class CycleDetector {
    constructor() {
        this.decisionAdjacencyList = new Map();
        this.conceptAdjacencyList = new Map();
    }
    validate(declarations) {
        const errors = [];
        for (const declaration of declarations) {
            if (declaration.decisionReferences) {
                const source = declaration.id;
                if (!this.decisionAdjacencyList.has(source)) {
                    this.decisionAdjacencyList.set(source, new Set());
                }
                for (const ref of declaration.decisionReferences) {
                    this.decisionAdjacencyList.get(source).add(ref);
                }
            }
            if (declaration.conceptInferences) {
                const source = declaration.id;
                if (!this.conceptAdjacencyList.has(source)) {
                    this.conceptAdjacencyList.set(source, new Set());
                }
                for (const inf of declaration.conceptInferences) {
                    this.conceptAdjacencyList.get(source).add(inf);
                }
            }
        }
        const decisionCycles = this.detectCycles(this.decisionAdjacencyList, 'Decision');
        errors.push(...decisionCycles);
        const conceptCycles = this.detectCycles(this.conceptAdjacencyList, 'Concept');
        errors.push(...conceptCycles);
        return errors;
    }
    detectCycles(adjacencyList, nodeType) {
        const errors = [];
        const visited = new Set();
        const recursionStack = new Set();
        const cycles = new Set();
        const dfs = (node, path) => {
            visited.add(node);
            recursionStack.add(node);
            path.push(node);
            const neighbors = adjacencyList.get(node) || new Set();
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    dfs(neighbor, [...path]);
                }
                else if (recursionStack.has(neighbor)) {
                    const cycleStartIndex = path.indexOf(neighbor);
                    const cycle = path.slice(cycleStartIndex);
                    cycle.push(neighbor);
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
exports.CycleDetector = CycleDetector;
//# sourceMappingURL=cycleDetector.js.map