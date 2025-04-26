"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CPGLAstBuilder = void 0;
const AbstractParseTreeVisitor_1 = require("antlr4ts/tree/AbstractParseTreeVisitor");
const CPGLParser_1 = require("../grammar/generated/antlr/CPGLParser");
const types_1 = require("./types");
function getLocation(ctx) {
    const start = ctx.start;
    const stop = ctx.stop ?? start;
    return {
        start: {
            line: start.line,
            column: start.charPositionInLine,
        },
        end: {
            line: stop.line,
            column: stop.charPositionInLine + (stop.text?.length ?? 0),
        },
    };
}
class CPGLAstBuilder extends AbstractParseTreeVisitor_1.AbstractParseTreeVisitor {
    constructor() {
        super(...arguments);
        this.errors = [];
    }
    reportError(type, message, location, details) {
        const errorObj = {
            type,
            message,
            location,
            details,
        };
        this.errors.push(JSON.stringify(errorObj));
    }
    getErrors() {
        return this.errors;
    }
    defaultResult() {
        return null;
    }
    visitCpgl(ctx) {
        const statements = ctx.statement().map((s) => this.visit(s));
        return { type: types_1.FileType.type, statements, location: getLocation(ctx) };
    }
    visitDecisionStatement(ctx) {
        const name = ctx.decisionIdentifier().text.slice(1, -1);
        const body = this.visit(ctx.decisionBody());
        return { type: types_1.DecisionType.type, name, body, location: getLocation(ctx) };
    }
    visitDecisionBody(ctx) {
        const statements = ctx.whenBlock().map((w) => this.visit(w));
        return { type: types_1.DecisionBodyType.type, statements, location: getLocation(ctx) };
    }
    visitWhenWithBody(ctx) {
        const conceptName = ctx.conceptReference().text.slice(1, -1);
        const body = this.visit(ctx.blockBody());
        return { type: types_1.WhenBlockType.type, conceptName, body, location: getLocation(ctx) };
    }
    visitWhenSingleAction(ctx) {
        const conceptName = ctx.conceptReference().text.slice(1, -1);
        const action = this.visit(ctx.singleActionStatement());
        return { type: types_1.WhenBlockType.type, conceptName, body: action, location: getLocation(ctx) };
    }
    visitNestedWhenBlock(ctx) {
        return this.visit(ctx.whenBlock());
    }
    visitBlockAction(ctx) {
        const result = this.visit(ctx.actionStatement());
        return result;
    }
    visitBlockBody(ctx) {
        const qualifier = ctx.anyOrAllClause() ? ctx.anyOrAllClause().text.slice(0, -1) : undefined;
        const statements = [];
        for (const stmtCtx of ctx.blockStatement()) {
            if (stmtCtx instanceof CPGLParser_1.NestedWhenBlockContext) {
                statements.push(this.visitNestedWhenBlock(stmtCtx));
            }
            else if (stmtCtx instanceof CPGLParser_1.BlockActionContext) {
                statements.push(this.visitBlockAction(stmtCtx));
            }
        }
        return {
            type: types_1.BlockBodyType.type,
            qualifier,
            statements,
            location: getLocation(ctx),
        };
    }
    visitSingleActionStatement(ctx) {
        const action = this.visit(ctx.doStatement() ?? ctx.useStatement());
        return { type: types_1.SingleActionType.type, action, location: getLocation(ctx) };
    }
    visitActionStatement(ctx) {
        const doStmt = ctx.doStatement?.();
        const useStmt = ctx.useStatement?.();
        let action;
        if (doStmt) {
            action = this.visitDoStatement(doStmt);
        }
        else if (useStmt) {
            action = this.visitUseStatement(useStmt);
        }
        else {
            throw new Error("ActionStatement must have doStatement or useStatement");
        }
        return { type: "ActionStatement", action, location: getLocation(ctx) };
    }
    visitDoStatement(ctx) {
        const activityName = ctx.activityReference().text.slice(1, -1);
        const result = { type: types_1.DoActivityType.type, activityName, location: getLocation(ctx) };
        return result;
    }
    visitUseStatement(ctx) {
        const decisionName = ctx.decisionReference().text.slice(1, -1);
        const result = { type: types_1.UseDecisionType.type, decisionName, location: getLocation(ctx) };
        return result;
    }
    visitTerminologyStatement(ctx) {
        const name = ctx.terminologyIdentifier().text.slice(1, -1);
        let definition;
        if (ctx.terminologyValueset()) {
            definition = this.visit(ctx.terminologyValueset());
        }
        else if (ctx.terminologySystemCode()) {
            definition = this.visit(ctx.terminologySystemCode());
        }
        else if (ctx.backtickString()) {
            definition = {
                type: "TerminologyFreeText",
                value: ctx.backtickString().text.slice(1, -1),
                location: getLocation(ctx),
            };
        }
        return {
            type: types_1.TerminologyType.type,
            name,
            definition: definition,
            location: getLocation(ctx),
        };
    }
    visitTerminologyValueset(ctx) {
        const valuesetName = ctx.identifier().text.slice(1, -1);
        return { type: types_1.TerminologyValuesetType.type, valuesetName, location: getLocation(ctx) };
    }
    visitTerminologySystemCode(ctx) {
        let system = "";
        let code = "";
        if (ctx.backtickString && ctx.backtickString().length === 2) {
            const systemNode = ctx.backtickString(0);
            const codeNode = ctx.backtickString(1);
            if (systemNode?.text)
                system = systemNode.text.slice(1, -1);
            if (codeNode?.text)
                code = codeNode.text.slice(1, -1);
        }
        return { type: types_1.TerminologySystemCodeType.type, system, code, location: getLocation(ctx) };
    }
    visitActivityStatement(ctx) {
        const name = ctx.activityIdentifier().text.slice(1, -1);
        const perform = ctx.ACTIVITY_TYPE().text;
        let terminologyReference;
        let activityTypeValue;
        let rationale;
        if (ctx.OF()) {
            if (ctx.terminologyReference()) {
                terminologyReference = ctx.terminologyReference().text.slice(1, -1);
            }
            else if (ctx.activityTypeValue()) {
                const atv = ctx.activityTypeValue();
                if (atv?.backtickString) {
                    const backtickCtx = atv.backtickString();
                    if (backtickCtx?.text !== undefined) {
                        activityTypeValue = backtickCtx.text.slice(1, -1);
                    }
                }
            }
        }
        if (ctx.rationale) {
            const rationaleCtx = ctx.rationale();
            if (rationaleCtx?.backtickString) {
                const backtickCtx = rationaleCtx.backtickString();
                if (backtickCtx?.text !== undefined) {
                    rationale = backtickCtx.text.slice(1, -1);
                }
            }
        }
        return {
            type: "Activity",
            name,
            perform,
            terminologyReference,
            activityTypeValue,
            rationale,
            location: getLocation(ctx),
        };
    }
    visitConceptStatement(ctx) {
        const name = ctx.conceptIdentifier?.()?.text?.slice(1, -1);
        const bodyCtx = ctx.conceptBody?.();
        if (!name || !bodyCtx) {
            this.reportError("AstError", "ConceptStatement: missing conceptIdentifier or conceptBody", getLocation(ctx));
            return null;
        }
        const typeLine = bodyCtx.hasTypeLine?.();
        const valueTypeLine = bodyCtx.hasValueTypeLine?.();
        if (!typeLine || !valueTypeLine) {
            this.reportError("AstError", "ConceptStatement: missing type or valueType line", getLocation(ctx));
            return null;
        }
        let conceptTypeToken, valueTypeToken;
        try {
            conceptTypeToken = typeLine.CONCEPT_TYPE();
        }
        catch {
            conceptTypeToken = undefined;
        }
        try {
            valueTypeToken = valueTypeLine.CONCEPT_VALUE_TYPE();
        }
        catch {
            valueTypeToken = undefined;
        }
        if (!conceptTypeToken || !valueTypeToken) {
            this.reportError("AstError", "ConceptStatement: missing CONCEPT_TYPE or CONCEPT_VALUE_TYPE token", getLocation(ctx));
            return null;
        }
        const conceptType = conceptTypeToken.text;
        const valueType = valueTypeToken.text;
        let provenance = undefined;
        if (bodyCtx.provenanceLine?.()) {
            const provCtx = bodyCtx.provenanceLine?.();
            if (provCtx?.backtickString) {
                const backtickCtx = provCtx.backtickString();
                if (backtickCtx?.text !== undefined) {
                    provenance = backtickCtx.text.slice(1, -1);
                }
                else if (backtickCtx?.BACKTICK_STRING) {
                    const token = backtickCtx.BACKTICK_STRING();
                    if (token?.text !== undefined) {
                        provenance = token.text.slice(1, -1);
                    }
                }
            }
        }
        let definition;
        if (bodyCtx.codedByLine && bodyCtx.codedByLine()) {
            const codedBy = bodyCtx.codedByLine();
            const termRef = codedBy?.terminologyReference?.()?.text?.slice(1, -1);
            if (!termRef) {
                this.reportError("AstError", "ConceptStatement: missing terminologyReference in codedByLine", getLocation(ctx));
                return null;
            }
            definition = {
                type: types_1.CodedByDefinitionType.type,
                terminologyName: termRef,
                location: getLocation(bodyCtx.codedByLine()),
            };
        }
        else if (bodyCtx.inferredByLine && bodyCtx.inferredByLine()) {
            const infCtx = bodyCtx.inferredByLine();
            if (!infCtx) {
                this.reportError("AstError", "ConceptStatement: inferredByLine() unexpectedly returned undefined", getLocation(ctx));
                return null;
            }
            definition = this.visit(infCtx);
        }
        else {
            this.reportError("AstError", "ConceptStatement must have either codedByLine or inferredByLine", getLocation(ctx));
            return null;
        }
        return {
            type: "Concept",
            name,
            conceptType,
            valueType,
            provenance,
            definition,
            location: getLocation(ctx),
        };
    }
    visitInferredByLine(ctx) {
        const defCtx = ctx.inferredBody();
        const body = this.visit(defCtx);
        return { type: types_1.InferredByDefinitionType.type, body, location: getLocation(ctx) };
    }
    visitDefinitionConcept(ctx) {
        const refCtx = ctx.inferredByConceptReference();
        const pat = refCtx.patternReference()?.text.slice(1, -1);
        const concept = refCtx.conceptReference().text.slice(1, -1);
        return {
            type: types_1.InferredByConceptType.type,
            pattern: pat,
            concept,
            location: getLocation(ctx),
        };
    }
    visitDefinitionLogic(ctx) {
        const descCtx = ctx.inferredByDescriptiveLogic();
        const exprCtx = descCtx.inferredByExpression();
        return this.visit(exprCtx);
    }
    visitInferredByExpression(ctx) {
        return this.visit(ctx.informalOr());
    }
    visitInformalOr(ctx) {
        const terms = ctx.informalAnd().map((a) => this.visit(a));
        if (ctx.OR().length) {
            return { type: types_1.InformalOrType.type, terms, location: getLocation(ctx) };
        }
        return terms[0];
    }
    visitInformalAnd(ctx) {
        const terms = ctx
            .informalNot()
            .map((n) => this.visit(n));
        if (ctx.AND().length) {
            return { type: types_1.InformalAndType.type, terms, location: getLocation(ctx) };
        }
        return terms[0];
    }
    visitInformalNot(ctx) {
        if (ctx.NOT()) {
            return {
                type: types_1.NotExpressionType.type,
                expression: this.visit(ctx.informalNot()),
                location: getLocation(ctx),
            };
        }
        return this.visit(ctx.atom());
    }
    visitConceptAtom(ctx) {
        const name = ctx.conceptReference().text.slice(1, -1);
        return { type: types_1.ConceptReferenceType.type, name, location: getLocation(ctx) };
    }
    visitGroupExpression(ctx) {
        const expr = this.visit(ctx.inferredByExpression());
        return { type: types_1.GroupExpressionType.type, expression: expr, location: getLocation(ctx) };
    }
}
exports.CPGLAstBuilder = CPGLAstBuilder;
//# sourceMappingURL=builder.js.map