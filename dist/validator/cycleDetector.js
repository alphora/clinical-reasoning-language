"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CycleDetector = void 0;
class CycleDetector {
    validate(ast) {
        const errors = [];
        const adjacency = new Map();
        const locations = new Map();
        for (const statement of ast.statements) {
            if (statement.type !== "Concept" || !statement.name)
                continue;
            const concept = statement;
            locations.set(concept.name, concept.location);
            const refs = new Set();
            this.collectRefs(concept, refs);
            adjacency.set(concept.name, refs);
        }
        const WHITE = 0, GRAY = 1, BLACK = 2;
        const color = new Map();
        const cyclesReported = new Set();
        const dfs = (node, path) => {
            color.set(node, GRAY);
            path.push(node);
            const neighbors = adjacency.get(node) ?? new Set();
            for (const neighbor of neighbors) {
                if (!adjacency.has(neighbor))
                    continue;
                const c = color.get(neighbor) ?? WHITE;
                if (c === WHITE) {
                    dfs(neighbor, path);
                }
                else if (c === GRAY) {
                    const idx = path.indexOf(neighbor);
                    if (idx >= 0) {
                        const cycle = path.slice(idx);
                        cycle.push(neighbor);
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
    collectRefs(concept, refs) {
        switch (concept.definition.type) {
            case "CodedFromDefinition":
                return;
            case "InferredFromDefinition": {
                const body = concept.definition.body;
                if (body.type === "InferredFromBareRef") {
                    refs.add(body.ref);
                }
                else if (body.type === "InferredFromComposition") {
                    this.collectFromComposition(body.expression, refs);
                }
                return;
            }
            case "LogicIsDefinition":
                this.collectFromNarrative(concept.definition.body, refs);
                return;
        }
    }
    collectFromComposition(expr, refs) {
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
    collectFromNarrative(clause, refs) {
        for (const el of clause.elements) {
            this.collectFromNarrativeElement(el, refs);
        }
    }
    collectFromNarrativeElement(el, refs) {
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
        }
    }
    collectFromArgValue(av, refs) {
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
        }
    }
    canonicalizeCycle(cycle) {
        if (cycle.length === 0)
            return "";
        const nodes = cycle.slice(0, -1);
        let min = 0;
        for (let i = 1; i < nodes.length; i++) {
            if (nodes[i] < nodes[min])
                min = i;
        }
        const rotated = [...nodes.slice(min), ...nodes.slice(0, min)];
        return rotated.join("→");
    }
}
exports.CycleDetector = CycleDetector;
//# sourceMappingURL=cycleDetector.js.map