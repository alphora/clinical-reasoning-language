"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CPGLAstBuilder = void 0;
const AbstractParseTreeVisitor_1 = require("antlr4ts/tree/AbstractParseTreeVisitor");
const CPGLParser_1 = require("../grammar/generated/CPGLParser");
const types_1 = require("./types");
function getLocation(ctx) {
    const start = ctx.start;
    const stop = ctx.stop ?? start;
    return {
        start: {
            line: start.line,
            column: start.charPositionInLine
        },
        end: {
            line: stop.line,
            column: stop.charPositionInLine + (stop.text?.length ?? 0)
        }
    };
}
class CPGLAstBuilder extends AbstractParseTreeVisitor_1.AbstractParseTreeVisitor {
    defaultResult() { return null; }
    visitCpgl(ctx) {
        const statements = ctx.statement().map(s => this.visit(s));
        return { type: types_1.FileType.type, statements, location: getLocation(ctx) };
    }
    visitDecisionStatement(ctx) {
        const name = (ctx.decisionIdentifier().text.slice(1, -1));
        const body = this.visit(ctx.decisionBody());
        return { type: types_1.DecisionType.type, name, body, location: getLocation(ctx) };
    }
    visitDecisionBody(ctx) {
        const statements = ctx.whenBlock().map(w => this.visit(w));
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
    visitNestedWhenBlock(ctx) { return this.visit(ctx.whenBlock()); }
    visitBlockAction(ctx) { return this.visit(ctx.actionStatement()); }
    visitBlockBody(ctx) {
        const qualifier = ctx.anyOrAllClause()
            ? ctx.anyOrAllClause().text.slice(0, -1)
            : undefined;
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
    visitDoStatement(ctx) {
        const activityName = ctx.activityReference().text.slice(1, -1);
        return { type: types_1.DoActivityType.type, activityName, location: getLocation(ctx) };
    }
    visitUseStatement(ctx) {
        const decisionName = ctx.decisionReference().text.slice(1, -1);
        return { type: types_1.UseDecisionType.type, decisionName, location: getLocation(ctx) };
    }
    visitTerminologyStatement(ctx) {
        const name = ctx.terminologyIdentifier().text.slice(1, -1);
        const defCtx = ctx.terminologyValueset() ?? ctx.terminologyUnknown() ?? ctx.terminologySystemCode();
        const definition = this.visit(defCtx);
        return { type: types_1.TerminologyType.type, name, definition, location: getLocation(ctx) };
    }
    visitTerminologyValueset(ctx) {
        const valuesetName = ctx.identifier().text.slice(1, -1);
        return { type: types_1.TerminologyValuesetType.type, valuesetName, location: getLocation(ctx) };
    }
    visitTerminologyUnknown(ctx) { return { type: types_1.TerminologyUnknownType.type, location: getLocation(ctx) }; }
    visitTerminologySystemCode(ctx) {
        const system = ctx.identifier(0).text.slice(1, -1);
        const code = ctx.identifier(1).text.slice(1, -1);
        return { type: types_1.TerminologySystemCodeType.type, system, code, location: getLocation(ctx) };
    }
    visitActivityStatement(ctx) {
        const name = ctx.activityIdentifier().text.slice(1, -1);
        const perform = ctx.ACTIVITY_TYPE().text;
        const terminologyRef = ctx.terminologyReference()?.text.slice(1, -1);
        return { type: 'Activity', name, perform, terminologyReference: terminologyRef, location: getLocation(ctx) };
    }
    visitConceptStatement(ctx) {
        const name = ctx.conceptIdentifier().text.slice(1, -1);
        const bodyCtx = ctx.conceptBody();
        const conceptType = (bodyCtx.hasTypeLine().CONCEPT_TYPE().text);
        const valueType = (bodyCtx.hasValueTypeLine().CONCEPT_VALUE_TYPE().text);
        const provenance = bodyCtx.provenanceLine()?.stringLiteral().text.slice(1, -1);
        let definition;
        if (bodyCtx.codedByLine()) {
            const termRef = bodyCtx.codedByLine().terminologyReference().text.slice(1, -1);
            definition = { type: types_1.CodedByDefinitionType.type, terminologyName: termRef, location: getLocation(bodyCtx.codedByLine()) };
        }
        else {
            const infCtx = bodyCtx.inferredByLine();
            definition = this.visit(infCtx);
        }
        return { type: 'Concept', name, conceptType, valueType, provenance, definition, location: getLocation(ctx) };
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
            location: getLocation(ctx)
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
        const terms = ctx.informalAnd().map(a => this.visit(a));
        if (ctx.OR().length) {
            return { type: types_1.InformalOrType.type, terms, location: getLocation(ctx) };
        }
        return terms[0];
    }
    visitInformalAnd(ctx) {
        const terms = ctx.informalNot().map(n => this.visit(n));
        if (ctx.AND().length) {
            return { type: types_1.InformalAndType.type, terms, location: getLocation(ctx) };
        }
        return terms[0];
    }
    visitInformalNot(ctx) {
        if (ctx.NOT()) {
            return { type: types_1.NotExpressionType.type, expression: this.visit(ctx.informalNot()), location: getLocation(ctx) };
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