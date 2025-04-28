import { ParserRuleContext } from "antlr4ts/ParserRuleContext";
import { AbstractParseTreeVisitor } from "antlr4ts/tree/AbstractParseTreeVisitor";

import {
  CpglContext,
  DecisionStatementContext,
  DecisionBodyContext,
  WhenWithBodyContext,
  WhenSingleActionContext,
  NestedWhenBlockContext,
  BlockActionContext,
  BlockBodyContext,
  SingleActionStatementContext,
  DoStatementContext,
  UseStatementContext,
  TerminologyStatementContext,
  TerminologyValuesetContext,
  TerminologySystemCodeContext,
  ActivityStatementContext,
  ConceptStatementContext,
  InferredFromLineContext,
  DefinitionConceptContext,
  DefinitionLogicContext,
  InferredFromExpressionContext,
  InformalOrContext,
  InformalAndContext,
  InformalNotContext,
  ConceptAtomContext,
  GroupExpressionContext,
} from "../grammar/generated/antlr/CPGLParser";
import { CPGLParserVisitor } from "../grammar/generated/antlr/CPGLParserVisitor";

import {
  ASTNode,
  CPGL,
  FileType,
  Statement,
  Decision,
  DecisionType,
  DecisionBody,
  DecisionBodyType,
  WhenBlock,
  WhenBlockType,
  BlockBody,
  BlockBodyType,
  SingleAction,
  SingleActionType,
  ActionStatement,
  DoActivity,
  DoActivityType,
  UseDecision,
  UseDecisionType,
  Terminology,
  TerminologyType,
  TerminologyValueset,
  TerminologyValuesetType,
  TerminologySystemCode,
  TerminologySystemCodeType,
  Activity,
  ActivityType,
  Concept,
  ConceptType,
  ConceptDefinition,
  CodedFromDefinitionType,
  InferredFromDefinition,
  InferredFromDefinitionType,
  ConceptReference,
  ConceptReferenceType,
  InformalAnd,
  InformalAndType,
  InformalOr,
  InformalOrType,
  NotExpression,
  NotExpressionType,
  GroupExpression,
  GroupExpressionType,
  InferredFromConcept,
  InferredFromConceptType,
  InferredFromExpression,
  Location,
  ConceptValueType,
} from "./types";

// Alias for all possible informal expression node types
type InformalNode = GroupExpression | ConceptReference | InformalAnd | NotExpression | InformalOr;

function getLocation(ctx: ParserRuleContext): Location {
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

export class CPGLAstBuilder
  extends AbstractParseTreeVisitor<ASTNode>
  implements CPGLParserVisitor<ASTNode>
{
  private readonly errors: string[] = [];

  protected reportError(
    type: string,
    message: string,
    location?: Location,
    details?: unknown,
  ): void {
    const errorObj = {
      type,
      message,
      location,
      details,
    };
    this.errors.push(JSON.stringify(errorObj));
  }

  public getErrors(): string[] {
    return this.errors;
  }

  protected defaultResult(): ASTNode {
    return null as unknown as ASTNode;
  }

  visitCpgl(ctx: CpglContext): CPGL {
    const statements = ctx.statement().map((s) => this.visit(s) as Statement);
    return { type: FileType.type, statements, location: getLocation(ctx) };
  }

  visitDecisionStatement(ctx: DecisionStatementContext): Decision {
    const name = ctx.decisionIdentifier().text.slice(1, -1);
    const body = this.visit(ctx.decisionBody()!) as DecisionBody;
    return { type: DecisionType.type, name, body, location: getLocation(ctx) };
  }

  visitDecisionBody(ctx: DecisionBodyContext): DecisionBody {
    const statements = ctx.whenBlock().map((w) => this.visit(w) as WhenBlock);
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

  visitNestedWhenBlock(ctx: NestedWhenBlockContext): WhenBlock {
    return this.visit(ctx.whenBlock()) as WhenBlock;
  }
  visitBlockAction(ctx: BlockActionContext): ActionStatement {
    const result = this.visit(ctx.actionStatement()) as ActionStatement;
    return result;
  }

  visitBlockBody(ctx: BlockBodyContext): BlockBody {
    // qualifier as before
    const qualifier = ctx.anyOrAllClause() ? ctx.anyOrAllClause()!.text.slice(0, -1) : undefined;

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

  visitActionStatement(
    ctx: import("../grammar/generated/antlr/CPGLParser").ActionStatementContext,
  ): ActionStatement {
    const doStmt = ctx.doStatement?.();
    const useStmt = ctx.useStatement?.();
    let action: DoActivity | UseDecision;
    if (doStmt) {
      action = this.visitDoStatement(doStmt);
    } else if (useStmt) {
      action = this.visitUseStatement(useStmt);
    } else {
      throw new Error("ActionStatement must have doStatement or useStatement");
    }
    return { type: "ActionStatement", action, location: getLocation(ctx) };
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
    let definition:
      | TerminologyValueset
      | TerminologySystemCode
      | { type: "TerminologyFreeText"; value: string; location: Location };
    if (ctx.terminologyValueset()) {
      definition = this.visit(ctx.terminologyValueset()!) as TerminologyValueset;
    } else if (ctx.terminologySystemCode()) {
      definition = this.visit(ctx.terminologySystemCode()!) as TerminologySystemCode;
    } else if (ctx.backtickString()) {
      // free text/markdown case
      definition = {
        type: "TerminologyFreeText",
        value: ctx.backtickString()!.text.slice(1, -1),
        location: getLocation(ctx),
      };
    }
    return {
      type: TerminologyType.type,
      name,
      definition: definition!,
      location: getLocation(ctx),
    };
  }

  visitTerminologyValueset(ctx: TerminologyValuesetContext): TerminologyValueset {
    const valuesetName = ctx.identifier().text.slice(1, -1);
    return { type: TerminologyValuesetType.type, valuesetName, location: getLocation(ctx) };
  }
  visitTerminologySystemCode(ctx: TerminologySystemCodeContext): TerminologySystemCode {
    // SYSTEM backtickString CODE backtickString
    let system = "";
    let code = "";
    if (ctx.backtickString && ctx.backtickString().length === 2) {
      const systemNode = ctx.backtickString(0);
      const codeNode = ctx.backtickString(1);
      if (systemNode?.text) system = systemNode.text.slice(1, -1);
      if (codeNode?.text) code = codeNode.text.slice(1, -1);
    }
    return { type: TerminologySystemCodeType.type, system, code, location: getLocation(ctx) };
  }

  private parseWithClause(
    ctx: import("../grammar/generated/antlr/CPGLParser").ActivityStatementContext,
  ): { terminologyReference?: string; activityTypeValue?: string } {
    let terminologyReference: string | undefined;
    let activityTypeValue: string | undefined;
    if (ctx.WITH()) {
      if (ctx.terminologyReference()) {
        terminologyReference = ctx.terminologyReference()!.text.slice(1, -1);
      } else if (ctx.activityTypeValue()) {
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

  private parseRationaleClause(
    ctx: import("../grammar/generated/antlr/CPGLParser").ActivityStatementContext,
  ): string | undefined {
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

  visitActivityStatement(ctx: ActivityStatementContext): Activity {
    const name = ctx.activityIdentifier()!.text.slice(1, -1);
    const perform = ctx.ACTIVITY_TYPE()!.text as ActivityType;
    const { terminologyReference, activityTypeValue } = this.parseWithClause(ctx);
    const rationale = this.parseRationaleClause(ctx);
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

  private parseConceptTypes(
    bodyCtx: import("../grammar/generated/antlr/CPGLParser").ConceptBodyContext,
    ctx: import("../grammar/generated/antlr/CPGLParser").ConceptStatementContext,
  ): { conceptType: ConceptType; valueType: ConceptValueType } | null {
    const typeLine = bodyCtx.typeLine?.();
    const valueTypeLine = bodyCtx.valueTypeLine?.();
    if (!typeLine || !valueTypeLine) {
      this.reportError(
        "AstError",
        "ConceptStatement: missing type or valueType line",
        getLocation(ctx),
      );
      return null;
    }
    let conceptTypeToken, valueTypeToken;
    try {
      conceptTypeToken = typeLine.CONCEPT_TYPE();
    } catch {
      conceptTypeToken = undefined;
    }
    try {
      valueTypeToken = valueTypeLine.CONCEPT_VALUE_TYPE();
    } catch {
      valueTypeToken = undefined;
    }
    if (!conceptTypeToken || !valueTypeToken) {
      this.reportError(
        "AstError",
        "ConceptStatement: missing CONCEPT_TYPE or CONCEPT_VALUE_TYPE token",
        getLocation(ctx),
      );
      return null;
    }
    return {
      conceptType: conceptTypeToken.text as ConceptType,
      valueType: valueTypeToken.text as ConceptValueType,
    };
  }

  private parseEvidence(
    bodyCtx: import("../grammar/generated/antlr/CPGLParser").ConceptBodyContext,
  ): string | undefined {
    if (bodyCtx.evidenceLine?.()) {
      const evidenceCtx = bodyCtx.evidenceLine?.();
      if (evidenceCtx?.backtickString) {
        const backtickCtx = evidenceCtx.backtickString();
        if (backtickCtx?.text !== undefined) {
          return backtickCtx.text.slice(1, -1);
        } else if (backtickCtx?.BACKTICK_STRING) {
          const token = backtickCtx.BACKTICK_STRING();
          if (token?.text !== undefined) {
            return token.text.slice(1, -1);
          }
        }
      }
    }
    return undefined;
  }

  private parseConceptDefinition(
    bodyCtx: import("../grammar/generated/antlr/CPGLParser").ConceptBodyContext,
    ctx: import("../grammar/generated/antlr/CPGLParser").ConceptStatementContext,
  ): ConceptDefinition | null {
    if (bodyCtx.codedFromLine?.()) {
      const codedFrom = bodyCtx.codedFromLine();
      const termRef = codedFrom?.terminologyReference?.()?.text?.slice(1, -1);
      if (!termRef) {
        this.reportError(
          "AstError",
          "ConceptStatement: missing terminologyReference in codedFromLine",
          getLocation(ctx),
        );
        return null;
      }
      return {
        type: CodedFromDefinitionType.type,
        terminologyName: termRef,
        location: getLocation(bodyCtx.codedFromLine()!),
      };
    } else if (bodyCtx.inferredFromLine?.()) {
      const infCtx = bodyCtx.inferredFromLine();
      if (!infCtx) {
        this.reportError(
          "AstError",
          "ConceptStatement: inferredFromLine() unexpectedly returned undefined",
          getLocation(ctx),
        );
        return null;
      }
      return this.visit(infCtx) as InferredFromDefinition;
    } else {
      this.reportError(
        "AstError",
        "ConceptStatement must have either codedFromLine or inferredFromLine",
        getLocation(ctx),
      );
      return null;
    }
  }

  visitConceptStatement(ctx: ConceptStatementContext): Concept {
    const name = ctx.conceptIdentifier?.()?.text?.slice(1, -1);
    const bodyCtx = ctx.conceptBody?.();
    if (!name || !bodyCtx) {
      this.reportError(
        "AstError",
        "ConceptStatement: missing conceptIdentifier or conceptBody",
        getLocation(ctx),
      );
      return null as unknown as Concept;
    }

    const types = this.parseConceptTypes(bodyCtx, ctx);
    if (!types) {
      return null as unknown as Concept;
    }
    const { conceptType, valueType } = types;
    const evidence = this.parseEvidence(bodyCtx);
    const definition = this.parseConceptDefinition(bodyCtx, ctx);
    if (!definition) {
      return null as unknown as Concept;
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

  visitInferredFromLine(ctx: InferredFromLineContext): InferredFromDefinition {
    const defCtx = ctx.inferredBody();
    const body = this.visit(defCtx) as
      | InferredFromConcept
      | InformalAnd
      | InformalOr
      | NotExpression
      | GroupExpression;
    return { type: InferredFromDefinitionType.type, body, location: getLocation(ctx) };
  }

  visitDefinitionConcept(ctx: DefinitionConceptContext): InferredFromConcept {
    const refCtx = ctx.inferredFromConceptReference();
    let pat: string | undefined = undefined;
    if (refCtx.patternStatement) {
      const patternCtx = refCtx.patternStatement();
      if (patternCtx?.patternName?.().backtickString) {
        const backtickCtx = patternCtx.patternName().backtickString();
        if (backtickCtx?.text !== undefined) {
          pat = backtickCtx.text.slice(1, -1);
        }
      }
    }
    const concept = refCtx.conceptReference().text.slice(1, -1);
    return {
      type: InferredFromConceptType.type,
      pattern: pat,
      concept,
      location: getLocation(ctx),
    };
  }

  visitDefinitionLogic(ctx: DefinitionLogicContext): GroupExpression {
    // first grab the InferredFromDescriptiveLogicContext…
    const descCtx = ctx.inferredFromDescriptiveLogic();
    // …then get its inner inferredFromExpression
    const exprCtx = descCtx.inferredFromExpression();
    // now delegate to your existing visitor for that rule
    return this.visit(exprCtx) as GroupExpression;
  }

  visitInferredFromExpression(ctx: InferredFromExpressionContext): InformalNode {
    return this.visit(ctx.informalOr()) as InformalNode;
  }

  visitInformalOr(ctx: InformalOrContext): InformalOr {
    const terms = ctx.informalAnd().map((a: InformalAndContext) => this.visit(a) as InformalNode);
    if (ctx.OR().length) {
      // flatten
      return { type: InformalOrType.type, terms, location: getLocation(ctx) };
    }
    return terms[0] as InformalOr;
  }

  visitInformalAnd(
    ctx: InformalAndContext,
  ): InformalAnd | NotExpression | GroupExpression | ConceptReference {
    const terms = ctx
      .informalNot()
      .map(
        (n: InformalNotContext) =>
          this.visit(n) as GroupExpression | ConceptReference | InformalAnd | NotExpression,
      );
    if (ctx.AND().length) {
      return { type: InformalAndType.type, terms, location: getLocation(ctx) };
    }
    return terms[0];
  }

  visitInformalNot(ctx: InformalNotContext): InferredFromExpression {
    if (ctx.NOT()) {
      return {
        type: NotExpressionType.type,
        expression: this.visit(ctx.informalNot()!) as InferredFromExpression,
        location: getLocation(ctx),
      };
    }
    return this.visit(ctx.atom()!) as InferredFromExpression;
  }

  visitConceptAtom(ctx: ConceptAtomContext): ConceptReference {
    const name = ctx.conceptReference().text.slice(1, -1);
    return { type: ConceptReferenceType.type, name, location: getLocation(ctx) };
  }
  visitGroupExpression(ctx: GroupExpressionContext): GroupExpression {
    const expr = this.visit(ctx.inferredFromExpression()) as
      | InformalAnd
      | InformalOr
      | NotExpression
      | ConceptReference
      | GroupExpression;
    return { type: GroupExpressionType.type, expression: expr, location: getLocation(ctx) };
  }
}

