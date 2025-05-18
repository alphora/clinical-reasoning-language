"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CRLAstBuilder = void 0;
const AbstractParseTreeVisitor_1 = require("antlr4ts/tree/AbstractParseTreeVisitor");
const CRLParser_1 = require("../grammar/generated/antlr/CRLParser");
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
class CRLAstBuilder extends AbstractParseTreeVisitor_1.AbstractParseTreeVisitor {
    constructor() {
        super(...arguments);
        this.errors = [];
    }
    defaultResult() {
        return null;
    }
    getErrors() {
        return this.errors;
    }
    reportError(message, ctx, details) {
        this.errors.push({
            type: "Exception",
            message,
            line: ctx.start.line,
            column: ctx.start.charPositionInLine,
            details: {
                location: getLocation(ctx),
                ...details,
            },
        });
    }
    visitCrl(ctx) {
        let header;
        const headerNode = ctx.HEADER();
        if (headerNode) {
            header = headerNode.text.replace(/^#\s*/, "");
        }
        const statements = ctx.statement().map((s) => this.visit(s));
        return {
            type: "CRL",
            ...(header ? { identifier: header } : {}),
            statements,
            location: getLocation(ctx),
        };
    }
    visitDecisionStatement(ctx) {
        const name = ctx.decisionIdentifier().text.slice(1, -1);
        const body = this.visit(ctx.decisionBody());
        return { type: "Decision", name, body, location: getLocation(ctx) };
    }
    visitDecisionBody(ctx) {
        const statements = ctx.whenBlock().map((w) => this.visit(w));
        return { type: "DecisionBody", statements, location: getLocation(ctx) };
    }
    visitWhenBlock(ctx) {
        if (ctx instanceof CRLParser_1.WhenWithBodyContext) {
            return this.visitWhenWithBody(ctx);
        }
        else if (ctx instanceof CRLParser_1.WhenSingleActionContext) {
            return this.visitWhenSingleAction(ctx);
        }
        this.reportError("Unknown whenBlock alternative", ctx);
        return null;
    }
    visitWhenWithBody(ctx) {
        const conceptName = ctx.conceptReference().text.slice(1, -1);
        const body = this.visit(ctx.blockBody());
        return { type: "WhenBlock", conceptName, body, location: getLocation(ctx) };
    }
    visitWhenSingleAction(ctx) {
        const conceptName = ctx.conceptReference().text.slice(1, -1);
        const action = this.visit(ctx.actionStatement());
        return { type: "WhenBlock", conceptName, body: action, location: getLocation(ctx) };
    }
    visitNestedWhenBlock(ctx) {
        return this.visit(ctx.whenBlock());
    }
    visitBlockStatement(ctx) {
        if (ctx instanceof CRLParser_1.NestedWhenBlockContext) {
            return this.visitNestedWhenBlock(ctx);
        }
        else if (ctx instanceof CRLParser_1.BlockActionContext) {
            return this.visitBlockAction(ctx);
        }
        this.reportError("Unknown blockStatement alternative", ctx);
        return null;
    }
    visitBlockBody(ctx) {
        const qualifier = ctx.anyOrAllClause() ? ctx.anyOrAllClause().text.slice(0, -1) : undefined;
        const statements = [];
        for (const stmtCtx of ctx.blockStatement()) {
            statements.push(this.visitBlockStatement(stmtCtx));
        }
        return {
            type: "BlockBody",
            qualifier,
            statements,
            location: getLocation(ctx),
        };
    }
    visitBlockAction(ctx) {
        return this.visit(ctx.actionStatement());
    }
    visitActionStatement(ctx) {
        const recStmt = ctx.recommendStatement?.();
        const useStmt = ctx.useStatement?.();
        let action;
        if (recStmt) {
            action = this.visitRecommendStatement(recStmt);
        }
        else if (useStmt) {
            action = this.visitUseStatement(useStmt);
        }
        else {
            throw new Error("ActionStatement must have recommendStatement or useStatement");
        }
        return { type: "ActionStatement", action, location: getLocation(ctx) };
    }
    visitRecommendStatement(ctx) {
        const activityName = ctx.activityReference().text.slice(1, -1);
        const result = { type: "RecommendActivity", activityName, location: getLocation(ctx) };
        return result;
    }
    visitUseStatement(ctx) {
        const decisionName = ctx.decisionReference().text.slice(1, -1);
        const result = { type: "UseDecision", decisionName, location: getLocation(ctx) };
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
        else if (ctx.terminologyUnknown()) {
            definition = {
                type: "TerminologyUnknown",
                value: "",
                location: getLocation(ctx),
            };
        }
        return {
            type: "Terminology",
            name,
            definition: definition,
            location: getLocation(ctx),
        };
    }
    visitTerminologyValueset(ctx) {
        const valuesetName = ctx.backtickString().text.slice(1, -1);
        return { type: "TerminologyValueset", valuesetName, location: getLocation(ctx) };
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
        return { type: "TerminologySystemCode", system, code, location: getLocation(ctx) };
    }
    parseWithClause(ctx) {
        let terminologyReference;
        let activityTypeValue;
        if (ctx.WITH()) {
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
        return { terminologyReference, activityTypeValue };
    }
    parseRationaleClause(ctx) {
        if (ctx.rationale) {
            const rationaleCtx = ctx.rationale();
            if (rationaleCtx?.backtickString) {
                const backtickCtx = rationaleCtx.backtickString();
                if (backtickCtx?.text !== undefined) {
                    return backtickCtx.text.slice(1, -1);
                }
            }
        }
        return undefined;
    }
    visitActivityStatement(ctx) {
        const name = ctx.activityIdentifier().text.slice(1, -1);
        const request = ctx.ACTIVITY_TYPE().text;
        const { terminologyReference, activityTypeValue } = this.parseWithClause(ctx);
        const rationale = this.parseRationaleClause(ctx);
        const doNotPerform = ctx.doNotPerform?.() != null;
        return {
            type: "Activity",
            name,
            request,
            terminologyReference,
            activityTypeValue,
            rationale,
            doNotPerform,
            location: getLocation(ctx),
        };
    }
    parseConceptTypes(bodyCtx, ctx) {
        const typeLine = bodyCtx.typeLine?.();
        const valueTypeLine = bodyCtx.valueTypeLine?.();
        if (!typeLine || !valueTypeLine) {
            this.reportError("AstError", ctx, {
                message: "ConceptStatement: missing type or valueType line",
            });
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
            this.reportError("AstError", ctx, {
                message: "ConceptStatement: missing CONCEPT_TYPE or CONCEPT_VALUE_TYPE token",
            });
            return null;
        }
        return {
            conceptType: conceptTypeToken.text,
            valueType: valueTypeToken.text,
        };
    }
    parseEvidence(bodyCtx) {
        if (bodyCtx.evidenceLine?.()) {
            const evidenceCtx = bodyCtx.evidenceLine?.();
            if (evidenceCtx?.backtickString) {
                const backtickCtx = evidenceCtx.backtickString();
                if (backtickCtx?.text !== undefined) {
                    return backtickCtx.text.slice(1, -1);
                }
                else if (backtickCtx?.BACKTICK_STRING) {
                    const token = backtickCtx.BACKTICK_STRING();
                    if (token?.text !== undefined) {
                        return token.text.slice(1, -1);
                    }
                }
            }
        }
        return undefined;
    }
    parseConceptDefinition(bodyCtx, ctx) {
        if (bodyCtx.codedFromLine?.()) {
            const codedFrom = bodyCtx.codedFromLine();
            const termRef = codedFrom?.terminologyReference?.()?.text?.slice(1, -1);
            if (!termRef) {
                this.reportError("AstError", ctx, {
                    message: "ConceptStatement: missing terminologyReference in codedFromLine",
                });
                return null;
            }
            return {
                type: "CodedFromDefinition",
                terminologyName: termRef,
                location: getLocation(bodyCtx.codedFromLine()),
            };
        }
        else if (bodyCtx.inferredFromLine?.()) {
            const infCtx = bodyCtx.inferredFromLine();
            if (!infCtx) {
                this.reportError("AstError", ctx, {
                    message: "ConceptStatement: inferredFromLine() unexpectedly returned undefined",
                });
                return null;
            }
            return this.visit(infCtx);
        }
        else {
            this.reportError("AstError", ctx, {
                message: "ConceptStatement must have either codedFromLine or inferredFromLine",
            });
            return null;
        }
    }
    visitConceptStatement(ctx) {
        const name = ctx.conceptIdentifier?.()?.text?.slice(1, -1);
        const bodyCtx = ctx.conceptBody?.();
        if (!name || !bodyCtx) {
            this.reportError("AstError", ctx, {
                message: "ConceptStatement: missing conceptIdentifier or conceptBody",
            });
            return null;
        }
        const types = this.parseConceptTypes(bodyCtx, ctx);
        if (!types) {
            return null;
        }
        const { conceptType, valueType } = types;
        const evidence = this.parseEvidence(bodyCtx);
        const definition = this.parseConceptDefinition(bodyCtx, ctx);
        if (!definition) {
            return null;
        }
        return {
            type: "Concept",
            name,
            conceptType,
            valueType,
            evidence,
            definition,
            location: getLocation(ctx),
        };
    }
    visitInferredFromLine(ctx) {
        const defCtx = ctx.inferredBody();
        const body = this.visit(defCtx);
        return { type: "InferredFromDefinition", body, location: getLocation(ctx) };
    }
    visitDefinitionConcept(ctx) {
        const refCtx = ctx.getRuleContext(0, CRLParser_1.InferredFromConceptReferenceContext);
        let pat = undefined;
        const patternCtx = refCtx?.patternStatement?.();
        if (patternCtx?.patternName?.().backtickString) {
            const backtickCtx = patternCtx.patternName().backtickString();
            if (backtickCtx?.text !== undefined) {
                pat = backtickCtx.text.slice(1, -1);
            }
        }
        const concept = refCtx?.conceptReference().text.slice(1, -1) ?? "";
        return {
            type: "InferredFromDefinitionConcept",
            pattern: pat,
            concept,
            location: getLocation(ctx),
        };
    }
    visitDefinitionLogic(ctx) {
        const descCtx = ctx.getRuleContext(0, CRLParser_1.InferredFromDescriptiveLogicContext);
        const exprCtx = descCtx?.inferredFromExpression();
        const expr = this.visit(exprCtx);
        if (expr && expr.type === "ConceptReference") {
            const conceptRef = expr;
            return {
                type: "InferredFromDefinitionConcept",
                concept: conceptRef.name,
                location: getLocation(ctx),
            };
        }
        return expr;
    }
    visitInferredFromExpression(ctx) {
        return this.visit(ctx.informalOr());
    }
    visitInformalOr(ctx) {
        const terms = ctx.informalAnd().map((a) => this.visit(a));
        if (ctx.OR().length) {
            return { type: "OrExpression", terms, location: getLocation(ctx) };
        }
        return terms[0];
    }
    visitInformalAnd(ctx) {
        const terms = ctx
            .informalNot()
            .map((n) => this.visit(n));
        if (ctx.AND().length) {
            return { type: "AndExpression", terms, location: getLocation(ctx) };
        }
        return terms[0];
    }
    visitInformalNot(ctx) {
        if (ctx.NOT()) {
            return {
                type: "NotExpression",
                expression: this.visit(ctx.informalNot()),
                location: getLocation(ctx),
            };
        }
        return this.visit(ctx.atom());
    }
    visitConceptAtom(ctx) {
        const conceptRefCtx = ctx.getRuleContext(0, CRLParser_1.ConceptReferenceContext);
        const name = conceptRefCtx?.text?.slice(1, -1) ?? "";
        return { type: "ConceptReference", name, location: getLocation(ctx) };
    }
    visitGroupExpression(ctx) {
        const exprCtx = ctx.getRuleContext(0, CRLParser_1.InferredFromExpressionContext);
        const expr = this.visit(exprCtx);
        return { type: "GroupExpression", expression: expr, location: getLocation(ctx) };
    }
}
exports.CRLAstBuilder = CRLAstBuilder;
//# sourceMappingURL=builder.js.map