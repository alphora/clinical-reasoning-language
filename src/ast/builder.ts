import { ParserRuleContext } from "antlr4ts/ParserRuleContext";

import { AbstractParseTreeVisitor } from "antlr4ts/tree/AbstractParseTreeVisitor";
import { CPGLParserVisitor } from "../grammar/generated/CPGLParserVisitor";
import {
  CpglContext, 
  DecisionStatementContext, DecisionBodyContext,
  WhenWithBodyContext, WhenSingleActionContext,
  NestedWhenBlockContext, BlockActionContext,
  BlockBodyContext, SingleActionStatementContext,
  DoStatementContext, UseStatementContext,
  TerminologyStatementContext, TerminologyValuesetContext,
  TerminologyUnknownContext, TerminologySystemCodeContext,
  ActivityStatementContext, ConceptStatementContext,
  InferredByLineContext,
  DefinitionConceptContext, DefinitionLogicContext,
  InferredByExpressionContext, InformalOrContext,
  InformalAndContext, InformalNotContext,
  ConceptAtomContext, GroupExpressionContext} from "../grammar/generated/CPGLParser";

import {
  ASTNode, CPGL, FileType, Statement,
  Decision, DecisionType, DecisionBody, DecisionBodyType,
  WhenBlock, WhenBlockType, BlockBody, BlockBodyType,
  SingleAction, SingleActionType, ActionStatement, 
  DoActivity, DoActivityType, UseDecision, UseDecisionType,
  Terminology, TerminologyType,
  TerminologyValueset, TerminologyValuesetType,
  TerminologyUnknown, TerminologyUnknownType,
  TerminologySystemCode, TerminologySystemCodeType,
  Activity, ActivityType,
  Concept, ConceptType, ConceptDefinition,
  CodedByDefinitionType,
  InferredByDefinition, InferredByDefinitionType,
  ConceptReference, ConceptReferenceType,
  InformalAnd, InformalAndType,
  InformalOr, InformalOrType,
  NotExpression, NotExpressionType,
  GroupExpression, GroupExpressionType,
  InferredByConcept, InferredByConceptType,
  InferredByExpression,
  Location
} from "./types";

function getLocation(ctx: ParserRuleContext): Location {
  const start = ctx.start;
  const stop  = ctx.stop ?? start;

  return {
    start: {
      line:   start.line,
      column: start.charPositionInLine
    },
    end: {
      line:   stop.line,
      column: stop.charPositionInLine + (stop.text?.length ?? 0)
    }
  };
}

export class CPGLAstBuilder extends AbstractParseTreeVisitor<ASTNode> implements CPGLParserVisitor<ASTNode> {
  protected defaultResult() { return null as any; }

  visitCpgl(ctx: CpglContext): CPGL {
    const statements = ctx.statement().map(s => this.visit(s) as Statement);
    return { type: FileType.type, statements, location: getLocation(ctx) };  }

  visitDecisionStatement(ctx: DecisionStatementContext): Decision {
    const name = (ctx.decisionIdentifier().text.slice(1, -1));
    const body = this.visit(ctx.decisionBody()!) as DecisionBody;
    return { type: DecisionType.type, name, body, location: getLocation(ctx) };
  }

  visitDecisionBody(ctx: DecisionBodyContext): DecisionBody {
    const statements = ctx.whenBlock().map(w => this.visit(w) as WhenBlock);
    return { type: DecisionBodyType.type, statements, location: getLocation(ctx) };
  }

  visitWhenWithBody(ctx: WhenWithBodyContext): WhenBlock {
    const conceptName = ctx.conceptReference().text.slice(1, -1);
    const body = this.visit(ctx.blockBody()!) as BlockBody;
    return { type: WhenBlockType.type, conceptName, body, location: getLocation(ctx) };
  }

  visitWhenSingleAction(ctx: WhenSingleActionContext): WhenBlock {
    const conceptName = ctx.conceptReference().text.slice(1, -1);
    const action = this.visit(ctx.singleActionStatement()!) as SingleAction;
    return { type: WhenBlockType.type, conceptName, body: action, location: getLocation(ctx) };
  }

  visitNestedWhenBlock(ctx: NestedWhenBlockContext): WhenBlock { return this.visit(ctx.whenBlock()) as WhenBlock; }
  visitBlockAction(ctx: BlockActionContext): ActionStatement { return this.visit(ctx.actionStatement()) as ActionStatement; }

  visitBlockBody(ctx: BlockBodyContext): BlockBody {
    // qualifier as before
    const qualifier = ctx.anyOrAllClause()
      ? ctx.anyOrAllClause()!.text.slice(0, -1)
      : undefined;
  
    const statements: (WhenBlock | ActionStatement)[] = [];
  
    // ctx.blockStatement() gives you every BlockStatementContext
    for (const stmtCtx of ctx.blockStatement()) {
      if (stmtCtx instanceof NestedWhenBlockContext) {
        // the 'whenBlock' branch
        statements.push(this.visitNestedWhenBlock(stmtCtx));
      } else if (stmtCtx instanceof BlockActionContext) {
        // the 'actionStatement' branch
        statements.push(this.visitBlockAction(stmtCtx));
      }
    }
  
    return {
      type: BlockBodyType.type,
      qualifier,
      statements,
      location: getLocation(ctx),
    };
  }

  visitSingleActionStatement(ctx: SingleActionStatementContext): SingleAction {
    const action = this.visit(ctx.doStatement() ?? ctx.useStatement()!) as DoActivity | UseDecision;
    return { type: SingleActionType.type, action, location: getLocation(ctx) };
  }

  visitDoStatement(ctx: DoStatementContext): DoActivity {
    const activityName = ctx.activityReference().text.slice(1, -1);
    return { type: DoActivityType.type, activityName, location: getLocation(ctx) };
  }

  visitUseStatement(ctx: UseStatementContext): UseDecision {
    const decisionName = ctx.decisionReference().text.slice(1, -1);
    return { type: UseDecisionType.type, decisionName, location: getLocation(ctx) };
  }

  visitTerminologyStatement(ctx: TerminologyStatementContext): Terminology {
    const name = ctx.terminologyIdentifier().text.slice(1, -1);
    const defCtx = ctx.terminologyValueset() ?? ctx.terminologyUnknown() ?? ctx.terminologySystemCode();
    const definition = this.visit(defCtx!) as TerminologyValueset | TerminologyUnknown | TerminologySystemCode;
    return { type: TerminologyType.type, name, definition, location: getLocation(ctx) };
  }

  visitTerminologyValueset(ctx: TerminologyValuesetContext): TerminologyValueset {
    const valuesetName = ctx.identifier().text.slice(1, -1);
    return { type: TerminologyValuesetType.type, valuesetName, location: getLocation(ctx) };
  }
  visitTerminologyUnknown(ctx: TerminologyUnknownContext): TerminologyUnknown { return { type: TerminologyUnknownType.type, location: getLocation(ctx) }; }
  visitTerminologySystemCode(ctx: TerminologySystemCodeContext): TerminologySystemCode {
    const system = ctx.identifier(0).text.slice(1,-1);
    const code   = ctx.identifier(1).text.slice(1,-1);
    return { type: TerminologySystemCodeType.type, system, code, location: getLocation(ctx) };
  }

  visitActivityStatement(ctx: ActivityStatementContext): Activity {
    const name = ctx.activityIdentifier().text.slice(1,-1);
    const perform = ctx.ACTIVITY_TYPE().text as ActivityType;
    const terminologyRef = ctx.terminologyReference()?.text.slice(1,-1);
    return { type: ActivityType.type, name, perform, terminologyReference: terminologyRef, location: getLocation(ctx) };
  }

  visitConceptStatement(ctx: ConceptStatementContext): Concept {
    const name = ctx.conceptIdentifier().text.slice(1,-1);
    const bodyCtx = ctx.conceptBody();
    const conceptType = (bodyCtx.hasTypeLine().CONCEPT_TYPE().text) as ConceptType;
    const valueType   = (bodyCtx.hasValueTypeLine().CONCEPT_VALUE_TYPE().text) as any;
    const provenance  = bodyCtx.provenanceLine()?.stringLiteral().text.slice(1,-1);
    let definition: ConceptDefinition;
    if (bodyCtx.codedByLine()) {
      const termRef = bodyCtx.codedByLine()!.terminologyReference().text.slice(1,-1);
      definition = { type: CodedByDefinitionType.type, terminologyName: termRef, location: getLocation(bodyCtx.codedByLine()!) };
    } else {
      const infCtx = bodyCtx.inferredByLine()!;
      definition = this.visit(infCtx) as InferredByDefinition;
    }
    return { type: ConceptType.type, name, conceptType, valueType, provenance, definition, location: getLocation(ctx) };
  }

  visitInferredByLine(ctx: InferredByLineContext): InferredByDefinition {
    const defCtx = ctx.inferredBody();
    const body = this.visit(defCtx) as InferredByConcept | InformalAnd | InformalOr | NotExpression | GroupExpression;
    return { type: InferredByDefinitionType.type, body, location: getLocation(ctx) };
  }

  visitDefinitionConcept(ctx: DefinitionConceptContext): InferredByConcept {
    const refCtx = ctx.inferredByConceptReference();
    const pat     = refCtx.patternReference()?.text.slice(1, -1);
    const concept = refCtx.conceptReference().text.slice(1, -1);
  
    return {
      type: InferredByConceptType.type,
      pattern: pat,
      concept,
      location: getLocation(ctx)
    };
  }
  visitDefinitionLogic(ctx: DefinitionLogicContext): GroupExpression {
    // first grab the InferredByDescriptiveLogicContext…
    const descCtx = ctx.inferredByDescriptiveLogic();
    // …then get its inner InferredByExpressionContext
    const exprCtx = descCtx.inferredByExpression();
    // now delegate to your existing visitor for that rule
    return this.visit(exprCtx) as GroupExpression;
  }

  visitInferredByExpression(ctx: InferredByExpressionContext): InformalOr | InformalAnd | NotExpression | ConceptReference | GroupExpression {
    return this.visit(ctx.informalOr()) as InferredByExpression;
  }

  visitInformalOr(ctx: InformalOrContext): InformalOr {
    const terms = ctx.informalAnd().map(a => this.visit(a) as any);
    if (ctx.OR().length) {
      // flatten
      return { type: InformalOrType.type, terms, location: getLocation(ctx) };
    }
    return terms[0] as InformalOr;
  }

  visitInformalAnd(ctx: InformalAndContext): InformalAnd | NotExpression | GroupExpression | ConceptReference {
    const terms = ctx.informalNot().map(n => this.visit(n) as any);
    if (ctx.AND().length) {
      return { type: InformalAndType.type, terms, location: getLocation(ctx) };
    }
    return terms[0] as any;
  }

  visitInformalNot(ctx: InformalNotContext): NotExpression | any {
    if (ctx.NOT()) {
      return { type: NotExpressionType.type, expression: this.visit(ctx.informalNot()!), location: getLocation(ctx) };
    }
    return this.visit(ctx.atom()!);
  }

  visitConceptAtom(ctx: ConceptAtomContext): ConceptReference {
    const name = ctx.conceptReference().text.slice(1,-1);
    return { type: ConceptReferenceType.type, name, location: getLocation(ctx) };
  }
  visitGroupExpression(ctx: GroupExpressionContext): GroupExpression {
    const expr = this.visit(ctx.inferredByExpression()) as any;
    return { type: GroupExpressionType.type, expression: expr, location: getLocation(ctx) };
  }
}
