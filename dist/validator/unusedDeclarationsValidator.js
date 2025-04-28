"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnusedDeclarationsValidator = void 0;
const types_1 = require("../ast/types");
class UnusedDeclarationsValidator {
    constructor(ast) {
        this.decisionDeclarations = new Map();
        this.conceptDeclarations = new Map();
        this.activityDeclarations = new Map();
        this.terminologyDeclarations = new Map();
        this.ast = ast || null;
    }
    validate(ast) {
        this.clear();
        const targetAst = ast || this.ast;
        if (!targetAst) {
            throw new Error("No AST provided to validate");
        }
        this.collectDeclarations(targetAst);
        this.processDeclarations(targetAst);
        return this.generateResults();
    }
    clear() {
        this.decisionDeclarations.clear();
        this.conceptDeclarations.clear();
        this.activityDeclarations.clear();
        this.terminologyDeclarations.clear();
    }
    collectDeclarations(ast) {
        for (const statement of ast.statements) {
            switch (statement.type) {
                case types_1.DecisionType.type:
                    this.decisionDeclarations.set(statement.name, {
                        used: false,
                        location: statement.location,
                    });
                    break;
                case "Concept":
                    this.conceptDeclarations.set(statement.name, {
                        used: false,
                        location: statement.location,
                    });
                    break;
                case "Activity":
                    this.activityDeclarations.set(statement.name, {
                        used: false,
                        location: statement.location,
                    });
                    break;
                case "Terminology":
                    this.terminologyDeclarations.set(statement.name, {
                        used: false,
                        location: statement.location,
                    });
                    break;
            }
        }
    }
    processDeclarations(ast) {
        for (const statement of ast.statements) {
            switch (statement.type) {
                case types_1.DecisionType.type:
                    this.processDecisionBody(statement.body, statement.name);
                    break;
                case "Concept":
                    break;
            }
        }
    }
    processDecisionBody(body, containingDecisionName) {
        if (containingDecisionName && body.statements.length > 0) {
            const decisionInfo = this.decisionDeclarations.get(containingDecisionName);
            if (decisionInfo) {
                decisionInfo.used = true;
            }
        }
        for (const statement of body.statements) {
            if (statement.type === types_1.WhenBlockType.type) {
                this.processWhenBlock(statement);
            }
            else if (statement.type === "ActionStatement") {
                if ("action" in statement && this.isAction(statement.action)) {
                    this.processAction(statement.action);
                }
            }
        }
    }
    processWhenBlock(whenBlock) {
        const conceptInfo = this.conceptDeclarations.get(whenBlock.conceptName);
        if (conceptInfo) {
            conceptInfo.used = true;
        }
        if (whenBlock.body.type === "BlockBody") {
            this.processBlockBody(whenBlock.body);
        }
        else if (whenBlock.body.type === "SingleAction" && this.isAction(whenBlock.body.action)) {
            this.processAction(whenBlock.body.action);
        }
    }
    processBlockBody(body) {
        for (const statement of body.statements) {
            if (statement.type === "ActionStatement" &&
                "action" in statement &&
                this.isAction(statement.action)) {
                this.processAction(statement.action);
            }
            else if (statement.type === types_1.WhenBlockType.type) {
                this.processWhenBlock(statement);
            }
        }
    }
    processAction(action) {
        if (action.type === "DoActivity") {
            const activityInfo = this.activityDeclarations.get(action.activityName);
            if (activityInfo) {
                activityInfo.used = true;
            }
        }
        else if (action.type === "UseDecision") {
            const decisionInfo = this.decisionDeclarations.get(action.decisionName);
            if (decisionInfo) {
                decisionInfo.used = true;
            }
            const referencedDecision = this.findDecision(action.decisionName);
            if (referencedDecision) {
                this.processDecisionBody(referencedDecision.body);
            }
        }
    }
    findDecision(name) {
        if (!this.ast) {
            return undefined;
        }
        for (const statement of this.ast.statements) {
            if (statement.type === types_1.DecisionType.type && statement.name === name) {
                return statement;
            }
        }
        return undefined;
    }
    isAction(action) {
        return (typeof action === "object" &&
            action !== null &&
            "type" in action &&
            (action.type === "DoActivity" || action.type === "UseDecision"));
    }
    generateResults() {
        const errors = [];
        for (const [name, info] of this.decisionDeclarations) {
            if (!info.used) {
                console.log("] Found unused decision:", name);
                errors.push({
                    message: `Unused decision: ${name}`,
                    location: info.location,
                    severity: "warning",
                });
            }
        }
        for (const [name, info] of this.conceptDeclarations) {
            if (!info.used) {
                errors.push({
                    message: `Unused concept: ${name}`,
                    location: info.location,
                    severity: "warning",
                });
            }
        }
        for (const [name, info] of this.activityDeclarations) {
            if (!info.used) {
                errors.push({
                    message: `Unused activity: ${name}`,
                    location: info.location,
                    severity: "warning",
                });
            }
        }
        for (const [name, info] of this.terminologyDeclarations) {
            if (!info.used) {
                errors.push({
                    message: `Unused terminology: ${name}`,
                    location: info.location,
                    severity: "warning",
                });
            }
        }
        return errors;
    }
}
exports.UnusedDeclarationsValidator = UnusedDeclarationsValidator;
//# sourceMappingURL=unusedDeclarationsValidator.js.map