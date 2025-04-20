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
  TerminologySystemCodeContext,
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
  visitBlockAction(ctx: BlockActionContext): ActionStatement {
    const result = this.visit(ctx.actionStatement()) as ActionStatement;
    return result;
  }

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

  visitActionStatement(ctx: any): ActionStatement {
    const doStmt = ctx.doStatement?.();
    const useStmt = ctx.useStatement?.();
    let action: DoActivity | UseDecision;
    if (doStmt) {
      action = this.visitDoStatement(doStmt);
    } else if (useStmt) {
      action = this.visitUseStatement(useStmt);
    } else {
      throw new Error('ActionStatement must have doStatement or useStatement');
    }
    return { type: 'ActionStatement', action, location: getLocation(ctx) };
  }

  visitDoStatement(ctx: DoStatementContext): DoActivity {
    const activityName = ctx.activityReference().text.slice(1, -1);
    const result = { type: DoActivityType.type, activityName, location: getLocation(ctx) };
    return result;
  }

  visitUseStatement(ctx: UseStatementContext): UseDecision {
    const decisionName = ctx.decisionReference().text.slice(1, -1);
    const result = { type: UseDecisionType.type, decisionName, location: getLocation(ctx) };
    return result;
  }

  visitTerminologyStatement(ctx: TerminologyStatementContext): Terminology {
    const name = ctx.terminologyIdentifier().text.slice(1, -1);
    let definition: TerminologyValueset | TerminologySystemCode | { type: 'TerminologyFreeText'; value: string; location: Location };
    if (ctx.terminologyValueset()) {
      definition = this.visit(ctx.terminologyValueset()!) as TerminologyValueset;
    } else if (ctx.terminologySystemCode()) {
      definition = this.visit(ctx.terminologySystemCode()!) as TerminologySystemCode;
    } else if (ctx.backtickString()) {
      // free text/markdown case
      definition = {
        type: 'TerminologyFreeText',
        value: ctx.backtickString()!.text.slice(1, -1),
        location: getLocation(ctx)
      };
    }
    return { type: TerminologyType.type, name, definition: definition!, location: getLocation(ctx) };
  }

  visitTerminologyValueset(ctx: TerminologyValuesetContext): TerminologyValueset {
    const valuesetName = ctx.identifier().text.slice(1, -1);
    return { type: TerminologyValuesetType.type, valuesetName, location: getLocation(ctx) };
  }
  visitTerminologySystemCode(ctx: TerminologySystemCodeContext): TerminologySystemCode {
    // SYSTEM backtickString CODE backtickString
    let system = '';
    let code = '';
    if (ctx.backtickString && ctx.backtickString().length === 2) {
      const systemNode = ctx.backtickString(0);
      const codeNode = ctx.backtickString(1);
      if (systemNode?.text) system = systemNode.text.slice(1, -1);
      if (codeNode?.text) code = codeNode.text.slice(1, -1);
    }
    return { type: TerminologySystemCodeType.type, system, code, location: getLocation(ctx) };
  }

  visitActivityStatement(ctx: ActivityStatementContext): Activity {
    const name = ctx.activityIdentifier()!.text.slice(1,-1);
    const perform = ctx.ACTIVITY_TYPE()!.text as ActivityType;
    let terminologyReference: string | undefined;
    let activityTypeValue: string | undefined;
    let rationale: string | undefined;

    // OF clause: can be terminologyReference (identifier) or activityTypeValue (backtickString)
    if (ctx.OF()) {
      if (ctx.terminologyReference()) {
        terminologyReference = ctx.terminologyReference()!.text.slice(1, -1);
      } else if (ctx.activityTypeValue()) {
        // activityTypeValue is a backtickString
        const atv = ctx.activityTypeValue();
        if (atv?.backtickString) {
          const backtickCtx = atv.backtickString();
          if (backtickCtx?.text !== undefined) {
            activityTypeValue = backtickCtx.text.slice(1, -1);
          }
        }
      }
    }
    // rationale (BECAUSE) is always a backtickString
    if (ctx.rationale) {
      const rationaleCtx = ctx.rationale();
      if (rationaleCtx?.backtickString) {
        const backtickCtx = rationaleCtx.backtickString();
        if (backtickCtx?.text !== undefined) {
          rationale = backtickCtx.text.slice(1, -1);
        }
      }
    }
    return { type: 'Activity', name, perform, terminologyReference, activityTypeValue, rationale, location: getLocation(ctx) };
  }

  visitConceptStatement(ctx: ConceptStatementContext): Concept {
    const name = ctx.conceptIdentifier().text.slice(1,-1);
    const bodyCtx = ctx.conceptBody();
    const conceptType = (bodyCtx.hasTypeLine().CONCEPT_TYPE().text) as ConceptType;
    const valueType   = (bodyCtx.hasValueTypeLine().CONCEPT_VALUE_TYPE().text) as any;
    let provenance: string | undefined = undefined;
    if (bodyCtx.provenanceLine?.()) {
      const provCtx = bodyCtx.provenanceLine?.();
      if (provCtx?.backtickString) {
        const backtickCtx = provCtx.backtickString();
        if (backtickCtx?.text !== undefined) {
          provenance = backtickCtx.text.slice(1, -1);
        } else if (backtickCtx?.BACKTICK_STRING) {
          const token = backtickCtx.BACKTICK_STRING();
          if (token?.text !== undefined) {
            provenance = token.text.slice(1, -1);
          }
        }
      }
    }
    let definition: ConceptDefinition;
    if (bodyCtx.codedByLine && bodyCtx.codedByLine()) {
      const termRef = bodyCtx.codedByLine()!.terminologyReference().text.slice(1,-1);
      definition = { type: CodedByDefinitionType.type, terminologyName: termRef, location: getLocation(bodyCtx.codedByLine()!) };
    } else if (bodyCtx.inferredByLine && bodyCtx.inferredByLine()) {
      const infCtx = bodyCtx.inferredByLine();
      if (!infCtx) {
        throw new Error('ConceptStatement: inferredByLine() unexpectedly returned undefined');
      }
      definition = this.visit(infCtx) as InferredByDefinition;
    } else {
      throw new Error('ConceptStatement must have either codedByLine or inferredByLine');
    }
    return { type: 'Concept', name, conceptType, valueType, provenance, definition, location: getLocation(ctx) };
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
    const terms = ctx.informalNot().map(n => this.visit(n) as NotExpression | GroupExpression | ConceptReference);
    if (ctx.AND().length) {
      return { type: InformalAndType.type, terms, location: getLocation(ctx) };
    }
    return terms[0];
  }

  visitInformalNot(ctx: InformalNotContext): InferredByExpression {
    if (ctx.NOT()) {
      return { type: NotExpressionType.type, expression: this.visit(ctx.informalNot()!) as InferredByExpression, location: getLocation(ctx) };
    }
    return this.visit(ctx.atom()!) as InferredByExpression;
  }

  visitConceptAtom(ctx: ConceptAtomContext): ConceptReference {
    const name = ctx.conceptReference().text.slice(1,-1);
    return { type: ConceptReferenceType.type, name, location: getLocation(ctx) };
  }
  visitGroupExpression(ctx: GroupExpressionContext): GroupExpression {
    const expr = this.visit(ctx.inferredByExpression()) as InformalAnd | InformalOr | NotExpression | ConceptReference | GroupExpression;
    return { type: GroupExpressionType.type, expression: expr, location: getLocation(ctx) };
  }
}
