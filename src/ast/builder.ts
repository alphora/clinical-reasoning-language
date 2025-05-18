import { ParserRuleContext } from "antlr4ts/ParserRuleContext";
import { AbstractParseTreeVisitor } from "antlr4ts/tree/AbstractParseTreeVisitor";

import {
  CrlContext,
  DecisionStatementContext,
  DecisionBodyContext,
  WhenBlockContext,
  BlockBodyContext,
  ActionStatementContext,
  RecommendStatementContext,
  UseStatementContext,
  TerminologyStatementContext,
  TerminologyValuesetContext,
  TerminologySystemCodeContext,
  ActivityStatementContext,
  ConceptStatementContext,
  InferredFromLineContext,
  InferredBodyContext,
  InferredFromConceptReferenceContext,
  InferredFromDescriptiveLogicContext,
  InferredFromExpressionContext,
  InformalOrContext,
  InformalAndContext,
  InformalNotContext,
  AtomContext,
  ConceptReferenceContext,
} from "../grammar/generated/antlr/CRLParser";
import { CRLParserVisitor } from "../grammar/generated/antlr/CRLParserVisitor";
import { CRLError } from "../types/errors";

import {
  ASTNode,
  CRL,
  FileType,
  Statement,
  Decision,
  DecisionType,
  DecisionBody,
  DecisionBodyType,
  WhenBlock,
  BlockBody,
  BlockBodyType,
  SingleAction,
  ActionStatement,
  RecommendActivity,
  RecommendActivityType,
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

export class CRLAstBuilder
  extends AbstractParseTreeVisitor<ASTNode>
  implements CRLParserVisitor<ASTNode>
{
  private readonly errors: CRLError[] = [];

  protected defaultResult(): ASTNode {
    return null as unknown as ASTNode;
  }

  getErrors(): CRLError[] {
    return this.errors;
  }

  protected reportError(
    message: string,
    ctx: ParserRuleContext,
    details?: Record<string, unknown>,
  ): void {
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

  visitCrl(ctx: CrlContext): CRL {
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

  visitWhenWithBody(ctx: WhenBlockContext): WhenBlock {
    const conceptName = ctx.conceptReference().text.slice(1, -1);
    const body = this.visit(ctx.blockBody()!) as BlockBody;
    return { type: "WhenBlock", conceptName, body, location: getLocation(ctx) };
  }

  visitWhenSingleAction(ctx: WhenBlockContext): WhenBlock {
    const conceptName = ctx.conceptReference().text.slice(1, -1);
    const action = this.visit(ctx.actionStatement()!) as SingleAction;
    return { type: "WhenBlock", conceptName, body: action, location: getLocation(ctx) };
  }

  visitNestedWhenBlock(ctx: WhenBlockContext): WhenBlock {
    return this.visit(ctx) as WhenBlock;
  }

  visitBlockBody(ctx: BlockBodyContext): BlockBody {
    // qualifier as before
    const qualifier = ctx.anyOrAllClause() ? ctx.anyOrAllClause()!.text.slice(0, -1) : undefined;

    const statements: (WhenBlock | ActionStatement)[] = [];

    // ctx.blockStatement() gives you every BlockStatementContext
    for (const stmtCtx of ctx.blockStatement()) {
      if (stmtCtx instanceof WhenBlockContext) {
        // the 'whenBlock' branch
        statements.push(this.visitNestedWhenBlock(stmtCtx));
      } else if (stmtCtx instanceof ActionStatementContext) {
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

  visitBlockAction(ctx: ActionStatementContext): ActionStatement {
    const result = this.visit(ctx) as ActionStatement;
    return result;
  }

  visitActionStatement(ctx: ActionStatementContext): ActionStatement {
    const recStmt = ctx.recommendStatement?.();
    const useStmt = ctx.useStatement?.();
    let action: RecommendActivity | UseDecision;
    if (recStmt) {
      action = this.visitrecommendStatement(recStmt);
    } else if (useStmt) {
      action = this.visitUseStatement(useStmt);
    } else {
      throw new Error("ActionStatement must have recommendStatement or useStatement");
    }
    return { type: "ActionStatement", action, location: getLocation(ctx) };
  }

  visitrecommendStatement(ctx: RecommendStatementContext): RecommendActivity {
    const activityName = ctx.activityReference().text.slice(1, -1);
    const result = { type: RecommendActivityType.type, activityName, location: getLocation(ctx) };
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
      | { type: "TerminologyUnknown"; value: string; location: Location };
    if (ctx.terminologyValueset()) {
      definition = this.visit(ctx.terminologyValueset()!) as TerminologyValueset;
    } else if (ctx.terminologySystemCode()) {
      definition = this.visit(ctx.terminologySystemCode()!) as TerminologySystemCode;
    } else if (ctx.terminologyUnknown()) {
      // free text/markdown case
      definition = {
        type: "TerminologyUnknown",
        value: "",
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
    const valuesetName = ctx.backtickString().text.slice(1, -1);
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
    ctx: import("../grammar/generated/antlr/CRLParser").ActivityStatementContext,
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
    ctx: import("../grammar/generated/antlr/CRLParser").ActivityStatementContext,
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
    const request = ctx.ACTIVITY_TYPE()!.text as ActivityType;
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

  private parseConceptTypes(
    bodyCtx: import("../grammar/generated/antlr/CRLParser").ConceptBodyContext,
    ctx: import("../grammar/generated/antlr/CRLParser").ConceptStatementContext,
  ): { conceptType: ConceptType; valueType: ConceptValueType } | null {
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
    } catch {
      conceptTypeToken = undefined;
    }
    try {
      valueTypeToken = valueTypeLine.CONCEPT_VALUE_TYPE();
    } catch {
      valueTypeToken = undefined;
    }
    if (!conceptTypeToken || !valueTypeToken) {
      this.reportError("AstError", ctx, {
        message: "ConceptStatement: missing CONCEPT_TYPE or CONCEPT_VALUE_TYPE token",
      });
      return null;
    }
    return {
      conceptType: conceptTypeToken.text as ConceptType,
      valueType: valueTypeToken.text as ConceptValueType,
    };
  }

  private parseEvidence(
    bodyCtx: import("../grammar/generated/antlr/CRLParser").ConceptBodyContext,
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
    bodyCtx: import("../grammar/generated/antlr/CRLParser").ConceptBodyContext,
    ctx: import("../grammar/generated/antlr/CRLParser").ConceptStatementContext,
  ): ConceptDefinition | null {
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
        type: CodedFromDefinitionType.type,
        terminologyName: termRef,
        location: getLocation(bodyCtx.codedFromLine()!),
      };
    } else if (bodyCtx.inferredFromLine?.()) {
      const infCtx = bodyCtx.inferredFromLine();
      if (!infCtx) {
        this.reportError("AstError", ctx, {
          message: "ConceptStatement: inferredFromLine() unexpectedly returned undefined",
        });
        return null;
      }
      return this.visit(infCtx) as InferredFromDefinition;
    } else {
      this.reportError("AstError", ctx, {
        message: "ConceptStatement must have either codedFromLine or inferredFromLine",
      });
      return null;
    }
  }

  visitConceptStatement(ctx: ConceptStatementContext): Concept {
    const name = ctx.conceptIdentifier?.()?.text?.slice(1, -1);
    const bodyCtx = ctx.conceptBody?.();
    if (!name || !bodyCtx) {
      this.reportError("AstError", ctx, {
        message: "ConceptStatement: missing conceptIdentifier or conceptBody",
      });
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

  visitDefinitionConcept(ctx: InferredBodyContext): InferredFromConcept {
    const refCtx = ctx.getRuleContext(0, InferredFromConceptReferenceContext);
    let pat: string | undefined = undefined;
    if (refCtx && refCtx.patternStatement) {
      const patternCtx = refCtx.patternStatement();
      if (patternCtx?.patternName?.().backtickString) {
        const backtickCtx = patternCtx.patternName().backtickString();
        if (backtickCtx?.text !== undefined) {
          pat = backtickCtx.text.slice(1, -1);
        }
      }
    }
    const concept = refCtx?.conceptReference().text.slice(1, -1) ?? "";
    return {
      type: InferredFromConceptType.type,
      pattern: pat,
      concept,
      location: getLocation(ctx),
    };
  }

  visitDefinitionLogic(ctx: InferredBodyContext): GroupExpression {
    const descCtx = ctx.getRuleContext(0, InferredFromDescriptiveLogicContext);
    const exprCtx = descCtx?.inferredFromExpression();
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

  visitConceptAtom(ctx: AtomContext): ConceptReference {
    const conceptRefCtx = ctx.getRuleContext(0, ConceptReferenceContext);
    const name = conceptRefCtx?.text?.slice(1, -1) ?? "";
    return { type: ConceptReferenceType.type, name, location: getLocation(ctx) };
  }
  visitGroupExpression(ctx: AtomContext): GroupExpression {
    const exprCtx = ctx.getRuleContext(0, InferredFromExpressionContext);
    const expr = this.visit(exprCtx) as
      | InformalAnd
      | InformalOr
      | NotExpression
      | ConceptReference
      | GroupExpression;
    return { type: GroupExpressionType.type, expression: expr, location: getLocation(ctx) };
  }
}
