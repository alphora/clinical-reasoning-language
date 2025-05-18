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
  WhenWithBodyContext,
  WhenSingleActionContext,
  NestedWhenBlockContext,
  BlockActionContext,
  BlockStatementContext,
} from "../grammar/generated/antlr/CRLParser";
import { CRLParserVisitor } from "../grammar/generated/antlr/CRLParserVisitor";
import type { CRLError } from "../types/errors";

import {
  ASTNode,
  Statement,
  Decision,
  DecisionBody,
  WhenBlock,
  BlockBody,
  ActionStatement,
  RecommendActivity,
  UseDecision,
  Terminology,
  TerminologyValueset,
  TerminologySystemCode,
  Activity,
  ActivityType,
  Concept,
  ConceptType,
  ConceptDefinition,
  InferredFromDefinition,
  ConceptReference,
  InformalAnd,
  InformalOr,
  NotExpression,
  GroupExpression,
  InferredFromConcept,
  Location,
  ConceptValueType,
} from "./types";
import type { CRL } from "./types";

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
    let header: string | undefined;
    const headerNode = ctx.HEADER();
    if (headerNode) {
      // Remove leading '#' and trim whitespace
      header = headerNode.text.replace(/^#\s*/, "");
    }
    const statements = ctx.statement().map((s) => this.visit(s) as Statement);
    return {
      type: "CRL",
      ...(header ? { identifier: header } : {}),
      statements,
      location: getLocation(ctx),
    };
  }

  visitDecisionStatement(ctx: DecisionStatementContext): Decision {
    const name = ctx.decisionIdentifier().text.slice(1, -1);
    const body = this.visit(ctx.decisionBody()!) as DecisionBody;
    return { type: "Decision", name, body, location: getLocation(ctx) };
  }

  visitDecisionBody(ctx: DecisionBodyContext): DecisionBody {
    const statements = ctx.whenBlock().map((w) => this.visit(w) as WhenBlock);
    return { type: "DecisionBody", statements, location: getLocation(ctx) };
  }

  visitWhenBlock(ctx: WhenBlockContext): WhenBlock {
    if (ctx instanceof WhenWithBodyContext) {
      return this.visitWhenWithBody(ctx);
    } else if (ctx instanceof WhenSingleActionContext) {
      return this.visitWhenSingleAction(ctx);
    }
    this.reportError("Unknown whenBlock alternative", ctx);
    return null as unknown as WhenBlock;
  }

  visitWhenWithBody(ctx: WhenWithBodyContext): WhenBlock {
    const conceptName = ctx.conceptReference().text.slice(1, -1);
    const body = this.visit(ctx.blockBody()) as BlockBody;
    return { type: "WhenBlock", conceptName, body, location: getLocation(ctx) };
  }

  visitWhenSingleAction(ctx: WhenSingleActionContext): WhenBlock {
    const conceptName = ctx.conceptReference().text.slice(1, -1);
    const action = this.visit(ctx.actionStatement()) as ActionStatement;
    return { type: "WhenBlock", conceptName, body: action, location: getLocation(ctx) };
  }

  visitNestedWhenBlock(ctx: NestedWhenBlockContext): WhenBlock {
    return this.visit(ctx.whenBlock()) as WhenBlock;
  }

  visitBlockStatement(ctx: BlockStatementContext): WhenBlock | ActionStatement {
    if (ctx instanceof NestedWhenBlockContext) {
      return this.visitNestedWhenBlock(ctx);
    } else if (ctx instanceof BlockActionContext) {
      return this.visitBlockAction(ctx);
    }
    this.reportError("Unknown blockStatement alternative", ctx);
    return null as unknown as WhenBlock;
  }

  visitBlockBody(ctx: BlockBodyContext): BlockBody {
    const qualifier = ctx.anyOrAllClause() ? ctx.anyOrAllClause()!.text.slice(0, -1) : undefined;
    const statements: (WhenBlock | ActionStatement)[] = [];
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

  visitBlockAction(ctx: BlockActionContext): ActionStatement {
    return this.visit(ctx.actionStatement()) as ActionStatement;
  }

  visitActionStatement(ctx: ActionStatementContext): ActionStatement {
    const recStmt = ctx.recommendStatement?.();
    const useStmt = ctx.useStatement?.();
    let action: RecommendActivity | UseDecision;
    if (recStmt) {
      action = this.visitRecommendStatement(recStmt);
    } else if (useStmt) {
      action = this.visitUseStatement(useStmt);
    } else {
      throw new Error("ActionStatement must have recommendStatement or useStatement");
    }
    return { type: "ActionStatement", action, location: getLocation(ctx) };
  }

  visitRecommendStatement(ctx: RecommendStatementContext): RecommendActivity {
    const activityName = ctx.activityReference().text.slice(1, -1);
    const result = { type: "RecommendActivity" as const, activityName, location: getLocation(ctx) };
    return result;
  }

  visitUseStatement(ctx: UseStatementContext): UseDecision {
    const decisionName = ctx.decisionReference().text.slice(1, -1);
    const result = { type: "UseDecision" as const, decisionName, location: getLocation(ctx) };
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
      definition = {
        type: "TerminologyUnknown",
        value: "",
        location: getLocation(ctx),
      };
    }
    return {
      type: "Terminology",
      name,
      definition: definition!,
      location: getLocation(ctx),
    };
  }

  visitTerminologyValueset(ctx: TerminologyValuesetContext): TerminologyValueset {
    const valuesetName = ctx.backtickString().text.slice(1, -1);
    return { type: "TerminologyValueset", valuesetName, location: getLocation(ctx) };
  }

  visitTerminologySystemCode(ctx: TerminologySystemCodeContext): TerminologySystemCode {
    let system = "";
    let code = "";
    if (ctx.backtickString && ctx.backtickString().length === 2) {
      const systemNode = ctx.backtickString(0);
      const codeNode = ctx.backtickString(1);
      if (systemNode?.text) system = systemNode.text.slice(1, -1);
      if (codeNode?.text) code = codeNode.text.slice(1, -1);
    }
    return { type: "TerminologySystemCode", system, code, location: getLocation(ctx) };
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
        type: "CodedFromDefinition" as const,
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
    return { type: "InferredFromDefinition", body, location: getLocation(ctx) };
  }

  visitDefinitionConcept(ctx: InferredBodyContext): InferredFromConcept {
    const refCtx = ctx.getRuleContext(0, InferredFromConceptReferenceContext);
    let pat: string | undefined = undefined;
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

  visitDefinitionLogic(ctx: InferredBodyContext): GroupExpression | InferredFromConcept {
    const descCtx = ctx.getRuleContext(0, InferredFromDescriptiveLogicContext);
    const exprCtx = descCtx?.inferredFromExpression();
    const expr = this.visit(exprCtx);

    // If the result is a single ConceptReference, wrap as InferredFromConcept
    if (expr && expr.type === "ConceptReference") {
      const conceptRef = expr as ConceptReference;
      return {
        type: "InferredFromDefinitionConcept",
        concept: conceptRef.name,
        location: getLocation(ctx),
      };
    }
    return expr as GroupExpression;
  }

  visitInferredFromExpression(ctx: InferredFromExpressionContext): InformalNode {
    return this.visit(ctx.informalOr()) as InformalNode;
  }

  visitInformalOr(ctx: InformalOrContext): InformalOr {
    const terms = ctx.informalAnd().map((a: InformalAndContext) => this.visit(a) as InformalNode);
    if (ctx.OR().length) {
      return { type: "OrExpression", terms, location: getLocation(ctx) };
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
      return { type: "AndExpression", terms, location: getLocation(ctx) };
    }
    return terms[0];
  }

  visitInformalNot(ctx: InformalNotContext): import("./types").InferredFromExpression {
    if (ctx.NOT()) {
      return {
        type: "NotExpression" as const,
        expression: this.visit(ctx.informalNot()!) as import("./types").InferredFromExpression,
        location: getLocation(ctx),
      };
    }
    return this.visit(ctx.atom()!) as import("./types").InferredFromExpression;
  }

  visitConceptAtom(ctx: AtomContext): ConceptReference {
    const conceptRefCtx = ctx.getRuleContext(0, ConceptReferenceContext);
    const name = conceptRefCtx?.text?.slice(1, -1) ?? "";
    return { type: "ConceptReference", name, location: getLocation(ctx) };
  }
  visitGroupExpression(ctx: AtomContext): GroupExpression {
    const exprCtx = ctx.getRuleContext(0, InferredFromExpressionContext);
    const expr = this.visit(exprCtx) as
      | InformalAnd
      | InformalOr
      | NotExpression
      | ConceptReference
      | GroupExpression;
    return { type: "GroupExpression", expression: expr, location: getLocation(ctx) };
  }
}
