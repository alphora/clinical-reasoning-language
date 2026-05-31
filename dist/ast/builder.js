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
        const body = [];
        const terminologyBody = ctx.terminologyBody();
        if (terminologyBody) {
            for (const line of terminologyBody.terminologyLine()) {
                if (line.terminologyValueset) {
                    const valuesetCtx = line.terminologyValueset();
                    if (valuesetCtx) {
                        body.push(this.visitTerminologyValueset(valuesetCtx));
                    }
                }
                if (line.terminologySystemCode) {
                    const systemCodeCtx = line.terminologySystemCode();
                    if (systemCodeCtx) {
                        const systemCtx = systemCodeCtx.terminologySystem();
                        if (systemCtx) {
                            body.push(this.visitTerminologySystem(systemCtx));
                        }
                        for (const codeCtx of systemCodeCtx.terminologyCode()) {
                            body.push(this.visitTerminologyCode(codeCtx));
                        }
                    }
                }
            }
        }
        return {
            type: "Terminology",
            name,
            body,
            location: getLocation(ctx),
        };
    }
    visitTerminologyValueset(ctx) {
        const valuesetName = ctx.backtickString().text.slice(1, -1);
        return { type: "TerminologyValueset", valuesetName, location: getLocation(ctx) };
    }
    visitTerminologySystem(ctx) {
        const system = ctx.backtickString().text.slice(1, -1);
        return { type: "TerminologySystem", system, location: getLocation(ctx) };
    }
    visitTerminologyCode(ctx) {
        const code = ctx.backtickString().text.slice(1, -1);
        return { type: "TerminologyCode", code, location: getLocation(ctx) };
    }
    visitActivityStatement(ctx) {
        const name = ctx.activityIdentifier().text.slice(1, -1);
        const body = this.visitActivityBody(ctx.activityBody());
        return {
            type: "Activity",
            name,
            body: body,
            location: getLocation(ctx),
        };
    }
    visitActivityBody(ctx) {
        const request = this.visitActivityRequest(ctx.activityRequest());
        let withClause;
        let becauseClause;
        if (ctx.activityWith) {
            const withCtx = ctx.activityWith();
            if (withCtx) {
                withClause = this.visitActivityWith(withCtx);
            }
        }
        if (ctx.activityBecause) {
            const becauseCtx = ctx.activityBecause();
            if (becauseCtx) {
                becauseClause = this.visitActivityBecause(becauseCtx);
            }
        }
        return {
            type: "ActivityBody",
            request: request,
            ...(withClause ? { withClause } : {}),
            ...(becauseClause ? { becauseClause } : {}),
            location: getLocation(ctx),
        };
    }
    visitActivityRequest(ctx) {
        const activityType = ctx.ACTIVITY_TYPE().text;
        const doNotPerform = ctx.doNotPerform ? ctx.doNotPerform() != null : false;
        return {
            type: "ActivityRequest",
            activityType,
            ...(doNotPerform ? { doNotPerform } : {}),
            location: getLocation(ctx),
        };
    }
    visitActivityWith(ctx) {
        let terminologyReference;
        let activityTypeValue;
        if (ctx.terminologyReference) {
            const ref = ctx.terminologyReference();
            if (ref)
                terminologyReference = ref.text.slice(1, -1);
        }
        if (ctx.activityTypeValue) {
            const atv = ctx.activityTypeValue();
            if (atv?.backtickString) {
                const backtickCtx = atv.backtickString();
                if (backtickCtx?.text !== undefined) {
                    activityTypeValue = backtickCtx.text.slice(1, -1);
                }
            }
        }
        return {
            type: "ActivityWith",
            ...(terminologyReference ? { terminologyReference } : {}),
            ...(activityTypeValue ? { activityTypeValue } : {}),
            location: getLocation(ctx),
        };
    }
    visitActivityBecause(ctx) {
        const rationale = ctx.rationale().backtickString().text.slice(1, -1);
        return {
            type: "ActivityBecause",
            rationale,
            location: getLocation(ctx),
        };
    }
    parseConceptTypes(bodyCtx, _ctx) {
        const typeLine = bodyCtx.typeLine?.();
        const valueTypeLines = bodyCtx.valueTypeLine?.() ?? [];
        let conceptType;
        if (typeLine) {
            try {
                const tok = typeLine.CONCEPT_TYPE();
                if (tok)
                    conceptType = tok.text;
            }
            catch {
                conceptType = undefined;
            }
        }
        const valueTypes = [];
        for (const vtl of valueTypeLines) {
            try {
                const tok = vtl.CONCEPT_VALUE_TYPE();
                if (tok)
                    valueTypes.push(tok.text);
            }
            catch {
            }
        }
        return { conceptType, valueTypes };
    }
    parseMeta(bodyCtx) {
        const metaLines = bodyCtx.metaLine?.() ?? [];
        const metas = [];
        for (const metaCtx of metaLines) {
            const backtickCtx = metaCtx?.backtickString?.();
            if (backtickCtx?.text !== undefined) {
                metas.push(backtickCtx.text.slice(1, -1));
            }
            else if (backtickCtx?.BACKTICK_STRING) {
                const token = backtickCtx.BACKTICK_STRING();
                if (token?.text !== undefined) {
                    metas.push(token.text.slice(1, -1));
                }
            }
        }
        return metas;
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
        else if (bodyCtx.inferredFromBody?.()) {
            const infCtx = bodyCtx.inferredFromBody();
            if (!infCtx) {
                this.reportError("AstError", ctx, {
                    message: "ConceptStatement: inferredFromBody() unexpectedly returned undefined",
                });
                return null;
            }
            return this.visitInferredFromBody(infCtx);
        }
        else if (bodyCtx.logicIsBody?.()) {
            const logicCtx = bodyCtx.logicIsBody();
            if (!logicCtx) {
                this.reportError("AstError", ctx, {
                    message: "ConceptStatement: logicIsBody() unexpectedly returned undefined",
                });
                return null;
            }
            return this.visitLogicIsBody(logicCtx);
        }
        else {
            this.reportError("AstError", ctx, {
                message: "ConceptStatement must have coded from, inferred from, or logic is body",
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
        const { conceptType, valueTypes } = types;
        const meta = this.parseMeta(bodyCtx);
        const evidence = this.parseEvidence(bodyCtx);
        const definition = this.parseConceptDefinition(bodyCtx, ctx);
        if (!definition) {
            return null;
        }
        return {
            type: "Concept",
            name,
            ...(conceptType ? { conceptType } : {}),
            valueTypes,
            ...(meta.length > 0 ? { meta } : {}),
            ...(evidence ? { evidence } : {}),
            definition,
            location: getLocation(ctx),
        };
    }
    visitInferredFromBareRef(ctx) {
        const ref = ctx.conceptReference().text.slice(1, -1);
        return {
            type: "InferredFromBareRef",
            ref,
            location: getLocation(ctx),
        };
    }
    visitInferredFromComposition(ctx) {
        const expr = this.visit(ctx.compositionExpression());
        return {
            type: "InferredFromComposition",
            expression: expr,
            location: getLocation(ctx),
        };
    }
    visitCompositionExpression(ctx) {
        return this.visit(ctx.semOr());
    }
    visitSemOr(ctx) {
        const terms = ctx.semAnd().map((a) => this.visit(a));
        if (ctx.SEM_OR().length) {
            return { type: "SemOrExpression", terms, location: getLocation(ctx) };
        }
        return terms[0];
    }
    visitSemAnd(ctx) {
        const terms = ctx.semNot().map((n) => this.visit(n));
        if (ctx.SEM_AND().length) {
            return { type: "SemAndExpression", terms, location: getLocation(ctx) };
        }
        return terms[0];
    }
    visitSemNot(ctx) {
        if (ctx.SEM_NOT()) {
            return {
                type: "SemNotExpression",
                expression: this.visit(ctx.semNot()),
                location: getLocation(ctx),
            };
        }
        return this.visit(ctx.compositionAtom());
    }
    visitCompositionRef(ctx) {
        const ref = ctx.conceptReference().text.slice(1, -1);
        return { type: "CompositionRef", ref, location: getLocation(ctx) };
    }
    visitCompositionGroup(ctx) {
        const expr = this.visit(ctx.compositionExpression());
        return { type: "CompositionGroup", expression: expr, location: getLocation(ctx) };
    }
    visitInferredFromBody(ctx) {
        const ifBodyCtx = ctx.ifBody();
        const body = this.visit(ifBodyCtx);
        return {
            type: "InferredFromDefinition",
            body,
            location: getLocation(ctx),
        };
    }
    visitLogicIsBody(ctx) {
        const narrative = this.visitNarrative(ctx.narrative());
        return {
            type: "LogicIsDefinition",
            body: narrative,
            location: getLocation(ctx),
        };
    }
    visitNarrative(ctx) {
        const elements = ctx
            .narrativeElement()
            .map((e) => this.visit(e));
        return {
            type: "NarrativeClause",
            elements,
            location: getLocation(ctx),
        };
    }
    visitNConceptRef(ctx) {
        const value = ctx.QUOTED_STRING().text.slice(1, -1);
        return { type: "NConceptRef", value, location: getLocation(ctx) };
    }
    visitNQuantity(ctx) {
        return this.visitQuantity(ctx.quantity());
    }
    visitNWord(ctx) {
        return { type: "NWord", value: ctx.text, location: getLocation(ctx) };
    }
    visitNArgGroupElement(ctx) {
        return this.visitArgGroup(ctx.argGroup());
    }
    visitQuantity(ctx) {
        const value = parseFloat(ctx.NUMBER().text);
        const ucumCtx = ctx.UCUM_UNIT();
        const timeCtx = ctx.TIME_UNIT();
        const unit = ucumCtx ? ucumCtx.text.slice(1, -1) : timeCtx ? timeCtx.text : "";
        return { type: "Quantity", value, unit, location: getLocation(ctx) };
    }
    visitArgGroup(ctx) {
        return this.visit(ctx);
    }
    visitArgDisjunction(ctx) {
        const disjuncts = ctx.argValue().map((av) => this.visit(av));
        return { type: "NDisjunction", disjuncts, location: getLocation(ctx) };
    }
    visitArgConjunction(ctx) {
        const conjuncts = ctx.argValue().map((av) => this.visit(av));
        return { type: "NConjunction", conjuncts, location: getLocation(ctx) };
    }
    visitArgSingleton(ctx) {
        return this.visit(ctx.argValue());
    }
    visitAVConceptRef(ctx) {
        const value = ctx.QUOTED_STRING().text.slice(1, -1);
        return { type: "NConceptRef", value, location: getLocation(ctx) };
    }
    visitAVQuantity(ctx) {
        return this.visitQuantity(ctx.quantity());
    }
    visitAVNestedGroup(ctx) {
        return this.visitArgGroup(ctx.argGroup());
    }
}
exports.CRLAstBuilder = CRLAstBuilder;
//# sourceMappingURL=builder.js.map