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
  ActivityStatementContext,
  ConceptStatementContext,
  ConceptBodyContext,
  InferenceStatementContext,
  InferredFromBodyContext,
  IfBodyContext,
  InferredFromBareRefContext,
  InferredFromCompositionContext,
  CompositionExpressionContext,
  SemOrContext,
  SemAndContext,
  SemNotContext,
  CompositionAtomContext,
  CompositionRefContext,
  CompositionGroupContext,
  NarrativeContext,
  NarrativeElementContext,
  NConceptRefContext,
  NQuantityContext,
  NWordContext,
  NArgGroupElementContext,
  QuantityContext,
  ArgGroupContext,
  ArgDisjunctionContext,
  ArgConjunctionContext,
  ArgSingletonContext,
  ArgValueContext,
  AVConceptRefContext,
  AVQuantityContext,
  AVNestedGroupContext,
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
  TerminologySystem,
  TerminologyCode,
  Activity,
  ActivityBody,
  ActivityRequest,
  ActivityWith,
  ActivityBecause,
  ActivityType,
  Concept,
  ConceptType,
  ConceptDefinition,
  InferredFromDefinition,
  InferredFromBareRef,
  InferredFromComposition,
  CompositionExpression,
  SemOrExpression,
  SemAndExpression,
  SemNotExpression,
  CompositionRef,
  CompositionGroup,
  ConceptReference,
  Inference,
  NarrativeClause,
  NarrativeElement,
  NConceptRef,
  NWord,
  NDisjunction,
  NConjunction,
  Quantity,
  ArgValue,
  Location,
  ConceptValueType,
} from "./types";
import type { CRL } from "./types";

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
    const body: (TerminologyValueset | TerminologySystem | TerminologyCode)[] = [];
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
            // system line
            const systemCtx = systemCodeCtx.terminologySystem();
            if (systemCtx) {
              body.push(this.visitTerminologySystem(systemCtx));
            }
            // code lines
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

  visitTerminologyValueset(ctx: TerminologyValuesetContext): TerminologyValueset {
    const valuesetName = ctx.backtickString().text.slice(1, -1);
    return { type: "TerminologyValueset", valuesetName, location: getLocation(ctx) };
  }

  visitTerminologySystem(
    ctx: import("../grammar/generated/antlr/CRLParser").TerminologySystemContext,
  ): TerminologySystem {
    const system = ctx.backtickString().text.slice(1, -1);
    return { type: "TerminologySystem", system, location: getLocation(ctx) };
  }

  visitTerminologyCode(
    ctx: import("../grammar/generated/antlr/CRLParser").TerminologyCodeContext,
  ): TerminologyCode {
    const code = ctx.backtickString().text.slice(1, -1);
    return { type: "TerminologyCode", code, location: getLocation(ctx) };
  }

  visitActivityStatement(ctx: ActivityStatementContext): Activity {
    const name = ctx.activityIdentifier().text.slice(1, -1);
    const body = this.visitActivityBody(ctx.activityBody());
    return {
      type: "Activity",
      name,
      body: body as ActivityBody,
      location: getLocation(ctx),
    };
  }

  visitActivityBody(
    ctx: import("../grammar/generated/antlr/CRLParser").ActivityBodyContext,
  ): ActivityBody {
    const request = this.visitActivityRequest(ctx.activityRequest());
    let withClause: ActivityWith | undefined;
    let becauseClause: ActivityBecause | undefined;
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
      request: request as ActivityRequest,
      ...(withClause ? { withClause } : {}),
      ...(becauseClause ? { becauseClause } : {}),
      location: getLocation(ctx),
    };
  }

  visitActivityRequest(
    ctx: import("../grammar/generated/antlr/CRLParser").ActivityRequestContext,
  ): ActivityRequest {
    const activityType = ctx.ACTIVITY_TYPE().text as ActivityType;
    const doNotPerform = ctx.doNotPerform ? ctx.doNotPerform() != null : false;
    return {
      type: "ActivityRequest",
      activityType,
      ...(doNotPerform ? { doNotPerform } : {}),
      location: getLocation(ctx),
    };
  }

  visitActivityWith(
    ctx: import("../grammar/generated/antlr/CRLParser").ActivityWithContext,
  ): ActivityWith {
    let terminologyReference: string | undefined;
    let activityTypeValue: string | undefined;
    if (ctx.terminologyReference) {
      const ref = ctx.terminologyReference();
      if (ref) terminologyReference = ref.text.slice(1, -1);
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

  visitActivityBecause(
    ctx: import("../grammar/generated/antlr/CRLParser").ActivityBecauseContext,
  ): ActivityBecause {
    const rationale = ctx.rationale().backtickString().text.slice(1, -1);
    return {
      type: "ActivityBecause",
      rationale,
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

  private parseMeta(
    bodyCtx: import("../grammar/generated/antlr/CRLParser").ConceptBodyContext,
  ): string[] {
    const metaLines = bodyCtx.metaLine?.() ?? [];
    const metas: string[] = [];
    for (const metaCtx of metaLines) {
      const backtickCtx = metaCtx?.backtickString?.();
      if (backtickCtx?.text !== undefined) {
        metas.push(backtickCtx.text.slice(1, -1));
      } else if (backtickCtx?.BACKTICK_STRING) {
        const token = backtickCtx.BACKTICK_STRING();
        if (token?.text !== undefined) {
          metas.push(token.text.slice(1, -1));
        }
      }
    }
    return metas;
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
    } else if (bodyCtx.inferredFromBody?.()) {
      const infCtx = bodyCtx.inferredFromBody();
      if (!infCtx) {
        this.reportError("AstError", ctx, {
          message: "ConceptStatement: inferredFromBody() unexpectedly returned undefined",
        });
        return null;
      }
      return this.visitInferredFromBody(infCtx);
    } else {
      this.reportError("AstError", ctx, {
        message: "ConceptStatement must have either codedFromLine or inferredFromBody",
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
    const meta = this.parseMeta(bodyCtx);
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
      ...(meta.length > 0 ? { meta } : {}),
      ...(evidence ? { evidence } : {}),
      definition,
      location: getLocation(ctx),
    };
  }

  // === v0.5 inferred from + composition visitors ===

  visitInferredFromBareRef(ctx: InferredFromBareRefContext): InferredFromBareRef {
    const ref = ctx.conceptReference().text.slice(1, -1);
    return {
      type: "InferredFromBareRef",
      ref,
      location: getLocation(ctx),
    };
  }

  visitInferredFromComposition(ctx: InferredFromCompositionContext): InferredFromComposition {
    const expr = this.visit(ctx.compositionExpression()) as CompositionExpression;
    return {
      type: "InferredFromComposition",
      expression: expr,
      location: getLocation(ctx),
    };
  }

  visitCompositionExpression(ctx: CompositionExpressionContext): CompositionExpression {
    return this.visit(ctx.semOr()) as CompositionExpression;
  }

  visitSemOr(ctx: SemOrContext): CompositionExpression {
    const terms = ctx.semAnd().map((a) => this.visit(a) as CompositionExpression);
    if (ctx.SEM_OR().length) {
      return { type: "SemOrExpression", terms, location: getLocation(ctx) };
    }
    return terms[0];
  }

  visitSemAnd(ctx: SemAndContext): CompositionExpression {
    const terms = ctx.semNot().map((n) => this.visit(n) as CompositionExpression);
    if (ctx.SEM_AND().length) {
      return { type: "SemAndExpression", terms, location: getLocation(ctx) };
    }
    return terms[0];
  }

  visitSemNot(ctx: SemNotContext): CompositionExpression {
    if (ctx.SEM_NOT()) {
      return {
        type: "SemNotExpression",
        expression: this.visit(ctx.semNot()!) as CompositionExpression,
        location: getLocation(ctx),
      };
    }
    return this.visit(ctx.compositionAtom()!) as CompositionExpression;
  }

  visitCompositionRef(ctx: CompositionRefContext): CompositionRef {
    const ref = ctx.conceptReference().text.slice(1, -1);
    return { type: "CompositionRef", ref, location: getLocation(ctx) };
  }

  visitCompositionGroup(ctx: CompositionGroupContext): CompositionGroup {
    const expr = this.visit(ctx.compositionExpression()) as CompositionExpression;
    return { type: "CompositionGroup", expression: expr, location: getLocation(ctx) };
  }

  // Wrapper for inferredFromBody — dispatches to the labeled alternatives via visit().
  visitInferredFromBody(ctx: InferredFromBodyContext): InferredFromDefinition {
    const ifBodyCtx = ctx.ifBody();
    const body = this.visit(ifBodyCtx) as InferredFromBareRef | InferredFromComposition;
    return {
      type: "InferredFromDefinition",
      body,
      location: getLocation(ctx),
    };
  }

  // === v0.5 inference statement + narrative visitors ===

  visitInferenceStatement(ctx: InferenceStatementContext): Inference {
    const name = ctx.inferenceIdentifier().text.slice(1, -1);
    const metaCtxs = ctx.metaLine();
    const evidenceCtx = ctx.evidenceLine();
    const meta = metaCtxs.map((m) => m.backtickString().text.slice(1, -1));
    const evidence = evidenceCtx ? evidenceCtx.backtickString().text.slice(1, -1) : undefined;
    const narrative = this.visitNarrative(ctx.narrative());
    return {
      type: "Inference",
      name,
      ...(meta.length > 0 ? { meta } : {}),
      ...(evidence ? { evidence } : {}),
      body: narrative,
      location: getLocation(ctx),
    };
  }

  visitNarrative(ctx: NarrativeContext): NarrativeClause {
    const elements = ctx
      .narrativeElement()
      .map((e) => this.visit(e) as NarrativeElement);
    return {
      type: "NarrativeClause",
      elements,
      location: getLocation(ctx),
    };
  }

  visitNConceptRef(ctx: NConceptRefContext): NConceptRef {
    const value = ctx.QUOTED_STRING().text.slice(1, -1);
    return { type: "NConceptRef", value, location: getLocation(ctx) };
  }

  visitNQuantity(ctx: NQuantityContext): Quantity {
    return this.visitQuantity(ctx.quantity());
  }

  visitNWord(ctx: NWordContext): NWord {
    return { type: "NWord", value: ctx.text, location: getLocation(ctx) };
  }

  visitNArgGroupElement(ctx: NArgGroupElementContext): NDisjunction | NConjunction | NConceptRef | Quantity {
    return this.visitArgGroup(ctx.argGroup()) as
      | NDisjunction
      | NConjunction
      | NConceptRef
      | Quantity;
  }

  visitQuantity(ctx: QuantityContext): Quantity {
    const value = parseFloat(ctx.NUMBER().text);
    const ucumCtx = ctx.UCUM_UNIT();
    const timeCtx = ctx.TIME_UNIT();
    const unit = ucumCtx ? ucumCtx.text.slice(1, -1) : timeCtx ? timeCtx.text : "";
    return { type: "Quantity", value, unit, location: getLocation(ctx) };
  }

  // argGroup dispatches to ArgDisjunction / ArgConjunction / ArgSingleton labeled alts.
  // NSingleton is collapsed here — `("X")` returns just the inner ArgValue, not a wrapper.
  visitArgGroup(ctx: ArgGroupContext): NDisjunction | NConjunction | NConceptRef | Quantity {
    return this.visit(ctx) as NDisjunction | NConjunction | NConceptRef | Quantity;
  }

  visitArgDisjunction(ctx: ArgDisjunctionContext): NDisjunction {
    const disjuncts = ctx.argValue().map((av) => this.visit(av) as ArgValue);
    return { type: "NDisjunction", disjuncts, location: getLocation(ctx) };
  }

  visitArgConjunction(ctx: ArgConjunctionContext): NConjunction {
    const conjuncts = ctx.argValue().map((av) => this.visit(av) as ArgValue);
    return { type: "NConjunction", conjuncts, location: getLocation(ctx) };
  }

  // ArgSingleton: `("X")` collapses to just the inner value (no wrapper node).
  visitArgSingleton(ctx: ArgSingletonContext): NConceptRef | Quantity | NDisjunction | NConjunction {
    return this.visit(ctx.argValue()) as
      | NConceptRef
      | Quantity
      | NDisjunction
      | NConjunction;
  }

  visitAVConceptRef(ctx: AVConceptRefContext): NConceptRef {
    const value = ctx.QUOTED_STRING().text.slice(1, -1);
    return { type: "NConceptRef", value, location: getLocation(ctx) };
  }

  visitAVQuantity(ctx: AVQuantityContext): Quantity {
    return this.visitQuantity(ctx.quantity());
  }

  visitAVNestedGroup(ctx: AVNestedGroupContext): NDisjunction | NConjunction | NConceptRef | Quantity {
    return this.visitArgGroup(ctx.argGroup());
  }
}
