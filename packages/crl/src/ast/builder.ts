import { ParserRuleContext } from "antlr4ts/ParserRuleContext";
import { AbstractParseTreeVisitor } from "antlr4ts/tree/AbstractParseTreeVisitor";

import {
  CrlContext,
  DecisionStatementContext,
  DecisionBodyContext,
  BranchItemContext,
  BlockBodyContext,
  BlockQualifierContext,
  ActionItemContext,
  ActionStatementContext,
  ActionGuardContext,
  RecommendStatementContext,
  UseStatementContext,
  TerminologyStatementContext,
  TerminologyValuesetContext,
  ActivityStatementContext,
  ConceptStatementContext,
  ParameterStatementContext,
  LibraryStatementContext,
  IncludeStatementContext,
  QualifiableReferenceContext,
  ConceptReferenceContext,
  DecisionReferenceContext,
  ActivityReferenceContext,
  TerminologyReferenceContext,
  ConceptBodyContext,
  DefinitionIsBodyContext,
  DefinedAsBodyContext,
  DaBodyContext,
  DefinedAsBareRefContext,
  DefinedAsCompositionContext,
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
  WhenWithBodyContext,
  WhenSingleActionContext,
  OtherwiseWithBodyContext,
  OtherwiseSingleActionContext,
} from "../grammar/generated/antlr/CRLParser";
import { CRLParserVisitor } from "../grammar/generated/antlr/CRLParserVisitor";
import type { CRLError } from "../types/errors";

import {
  ASTNode,
  Statement,
  Decision,
  DecisionBody,
  WhenBlock,
  OtherwiseBlock,
  BranchBlock,
  BlockMember,
  BlockQualifier,
  BlockBody,
  ActionStatement,
  ActionGuard,
  ActionGuardPolarity,
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
  Parameter,
  ConceptDefinition,
  DefinedAsDefinition,
  DefinedAsBareRef,
  DefinedAsComposition,
  CompositionExpression,
  SemOrExpression,
  SemAndExpression,
  SemNotExpression,
  CompositionRef,
  CompositionGroup,
  ConceptReference,
  DefinitionIsDefinition,
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
  Representation,
} from "./types";
import type { CRL, LibraryDeclaration, Include, ReferenceName, QualifiedReference } from "./types";

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

/**
 * A `blockQualifier` token carries its colon (`first:`/`any:`/`all:`); strip it
 * to the bare `BlockQualifier`. Returns undefined when no qualifier is present.
 */
function qualifierFrom(ctx: BlockQualifierContext | undefined): BlockQualifier | undefined {
  if (!ctx) return undefined;
  return ctx.text.slice(0, -1) as BlockQualifier;
}

/** Strip the surrounding `"..."` from a `QUOTED_STRING` token's text. */
function unquote(text: string): string {
  return text.slice(1, -1);
}

/**
 * Build a `ReferenceName` (string for bare, QualifiedReference for `"Lib"."X"`)
 * from a qualifiableReference parser context. Used by every visitor that
 * reads a reference slot.
 */
function refFromQualifiable(ctx: QualifiableReferenceContext): ReferenceName {
  const parts = ctx.QUOTED_STRING();
  if (parts.length === 1) {
    return unquote(parts[0].text);
  }
  const libraryName = unquote(parts[0].text);
  const name = unquote(parts[1].text);
  return {
    type: "QualifiedReference",
    libraryName,
    name,
    location: getLocation(ctx),
  };
}

/**
 * The four `*Reference` contexts (conceptReference, decisionReference,
 * activityReference, terminologyReference) each delegate to a single
 * `qualifiableReference` child. This helper finds it.
 */
function refFromRefContext(
  ctx:
    | ConceptReferenceContext
    | DecisionReferenceContext
    | ActivityReferenceContext
    | TerminologyReferenceContext,
): ReferenceName {
  return refFromQualifiable(ctx.qualifiableReference());
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

    // v2.1.0: library is required by grammar. Parser already rejects files
    // without it; if we somehow reached here past error recovery, synthesize
    // an empty-name placeholder so the AST stays well-typed AND report a
    // builder error so callers that read the AST without parser-error checks
    // (e.g. tests using `parseInput` directly) still fail loudly.
    const libraryCtx = ctx.libraryStatement();
    let library: LibraryDeclaration;
    if (libraryCtx) {
      library = this.visitLibraryStatement(libraryCtx);
    } else {
      this.reportError(
        "AstError",
        ctx,
        { message: "CRL file must declare `library \"Foo\".` (v2.1.0 — anonymous-file mode removed)" },
      );
      library = { type: "LibraryDeclaration", name: "", location: getLocation(ctx) };
    }

    const includes = ctx
      .includeStatement()
      .map((i) => this.visitIncludeStatement(i));

    const statements = ctx.statement().map((s) => this.visit(s) as Statement);
    return {
      type: "CRL",
      ...(header ? { header } : {}),
      library,
      includes,
      statements,
      location: getLocation(ctx),
    };
  }

  visitLibraryStatement(ctx: LibraryStatementContext): LibraryDeclaration {
    const name = ctx.identifier().text.slice(1, -1);
    return {
      type: "LibraryDeclaration",
      name,
      location: getLocation(ctx),
    };
  }

  visitIncludeStatement(ctx: IncludeStatementContext): Include {
    const idents = ctx.identifier();
    const name = unquote(idents[0].text);
    const alias = idents.length > 1 ? unquote(idents[1].text) : undefined;
    return {
      type: "Include",
      name,
      ...(alias !== undefined ? { alias } : {}),
      location: getLocation(ctx),
    };
  }

  visitDecisionStatement(ctx: DecisionStatementContext): Decision {
    const name = ctx.decisionIdentifier().text.slice(1, -1);
    const body = this.visit(ctx.decisionBody()!) as DecisionBody;
    return { type: "Decision", name, body, location: getLocation(ctx) };
  }

  visitDecisionBody(ctx: DecisionBodyContext): DecisionBody {
    const qualifier = qualifierFrom(ctx.blockQualifier());
    const statements = ctx.branchItem().map((b) => this.visitBranchItem(b));
    return {
      type: "DecisionBody",
      ...(qualifier ? { qualifier } : {}),
      statements,
      location: getLocation(ctx),
    };
  }

  visitBranchItem(ctx: BranchItemContext): BranchBlock {
    if (ctx instanceof WhenWithBodyContext) return this.visitWhenWithBody(ctx);
    if (ctx instanceof WhenSingleActionContext) return this.visitWhenSingleAction(ctx);
    if (ctx instanceof OtherwiseWithBodyContext) return this.visitOtherwiseWithBody(ctx);
    if (ctx instanceof OtherwiseSingleActionContext) return this.visitOtherwiseSingleAction(ctx);
    this.reportError("Unknown branchItem alternative", ctx);
    return null as unknown as BranchBlock;
  }

  visitWhenWithBody(ctx: WhenWithBodyContext): WhenBlock {
    const conceptName = refFromRefContext(ctx.conceptReference());
    const body = this.visit(ctx.blockBody()) as BlockBody;
    return { type: "WhenBlock", conceptName, body, location: getLocation(ctx) };
  }

  visitWhenSingleAction(ctx: WhenSingleActionContext): WhenBlock {
    const conceptName = refFromRefContext(ctx.conceptReference());
    const action = this.visit(ctx.actionStatement()) as ActionStatement;
    return { type: "WhenBlock", conceptName, body: action, location: getLocation(ctx) };
  }

  visitOtherwiseWithBody(ctx: OtherwiseWithBodyContext): OtherwiseBlock {
    const body = this.visit(ctx.blockBody()) as BlockBody;
    return { type: "OtherwiseBlock", body, location: getLocation(ctx) };
  }

  visitOtherwiseSingleAction(ctx: OtherwiseSingleActionContext): OtherwiseBlock {
    const action = this.visit(ctx.actionStatement()) as ActionStatement;
    return { type: "OtherwiseBlock", body: action, location: getLocation(ctx) };
  }

  visitBlockBody(ctx: BlockBodyContext): BlockBody {
    const qualifier = qualifierFrom(ctx.blockQualifier());
    const statements: BlockMember[] = [];
    const branchItems = ctx.branchItem();
    if (branchItems.length > 0) {
      for (const b of branchItems) statements.push(this.visitBranchItem(b));
    } else {
      for (const a of ctx.actionItem()) statements.push(this.visitActionItem(a));
    }
    return {
      type: "BlockBody",
      ...(qualifier ? { qualifier } : {}),
      statements,
      location: getLocation(ctx),
    };
  }

  visitActionItem(ctx: ActionItemContext): ActionStatement {
    const stmt = this.visit(ctx.actionStatement()) as ActionStatement;
    const guardCtx = ctx.actionGuard();
    if (guardCtx) {
      stmt.guard = this.buildActionGuard(guardCtx);
    }
    return stmt;
  }

  private buildActionGuard(ctx: ActionGuardContext): ActionGuard {
    const polarity: ActionGuardPolarity = ctx.UNLESS() ? "unless" : "only-when";
    return {
      type: "ActionGuard",
      polarity,
      conceptName: refFromRefContext(ctx.conceptReference()),
      location: getLocation(ctx),
    };
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
    const activityName = refFromRefContext(ctx.activityReference());
    return { type: "RecommendActivity" as const, activityName, location: getLocation(ctx) };
  }

  visitUseStatement(ctx: UseStatementContext): UseDecision {
    const decisionName = refFromRefContext(ctx.decisionReference());
    return { type: "UseDecision" as const, decisionName, location: getLocation(ctx) };
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
    let terminologyReference: ReferenceName | undefined;
    let activityTypeValue: string | undefined;
    if (ctx.terminologyReference) {
      const ref = ctx.terminologyReference();
      if (ref) terminologyReference = refFromRefContext(ref);
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

  // v0.7: type is optional (REQUIRED for asserted concepts; OPTIONAL for
  // composition/predicate body kinds). value type is optional and 0..*.
  // Returns whatever was declared; absence is fine here — the validator
  // enforces type-required-for-asserted and the body-kind rules.
  private parseConceptTypes(
    bodyCtx: import("../grammar/generated/antlr/CRLParser").ConceptBodyContext,
    _ctx: import("../grammar/generated/antlr/CRLParser").ConceptStatementContext,
  ): { conceptType?: ConceptType; valueTypes: ConceptValueType[] } {
    const typeLine = bodyCtx.typeLine?.();
    const valueTypeLines = bodyCtx.valueTypeLine?.() ?? [];

    let conceptType: ConceptType | undefined;
    if (typeLine) {
      try {
        const tok = typeLine.CONCEPT_TYPE();
        if (tok) conceptType = tok.text as ConceptType;
      } catch {
        conceptType = undefined;
      }
    }

    const valueTypes: ConceptValueType[] = [];
    for (const vtl of valueTypeLines) {
      try {
        const tok = vtl.CONCEPT_VALUE_TYPE();
        if (tok) valueTypes.push(tok.text as ConceptValueType);
      } catch {
        // skip malformed valuetype line; lexer should have already reported
      }
    }

    return { conceptType, valueTypes };
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
      return this.buildCodedFrom(bodyCtx.codedFromLine()!, ctx);
    } else if (bodyCtx.definedAsBody?.()) {
      const infCtx = bodyCtx.definedAsBody();
      if (!infCtx) {
        this.reportError("AstError", ctx, {
          message: "ConceptStatement: definedAsBody() unexpectedly returned undefined",
        });
        return null;
      }
      return this.visitDefinedAsBody(infCtx);
    } else if (bodyCtx.definitionIsBody?.()) {
      const logicCtx = bodyCtx.definitionIsBody();
      if (!logicCtx) {
        this.reportError("AstError", ctx, {
          message: "ConceptStatement: definitionIsBody() unexpectedly returned undefined",
        });
        return null;
      }
      return this.visitDefinitionIsBody(logicCtx);
    }
    // No top-level definition body — valid only when representations exist;
    // visitConceptStatement enforces "definition OR >=1 representation".
    return null;
  }

  // `coded from` binds to a named terminology / value set (external source).
  private buildCodedFrom(
    codedFrom: import("../grammar/generated/antlr/CRLParser").CodedFromLineContext,
    ctx: import("../grammar/generated/antlr/CRLParser").ConceptStatementContext,
  ): ConceptDefinition | null {
    const termRefCtx = codedFrom.terminologyReference?.();
    if (!termRefCtx) {
      this.reportError("AstError", ctx, {
        message: "ConceptStatement: missing terminologyReference in codedFromLine",
      });
      return null;
    }
    return {
      type: "CodedFromDefinition" as const,
      terminologyName: refFromRefContext(termRefCtx),
      location: getLocation(codedFrom),
    };
  }

  // The concept's own local code (`- code is `…`.`); the system is the package's
  // local domain (implicit). Present => the concept is locally assertable.
  //
  // Returns `undefined` when there is NO `code is` line at all, and the (possibly
  // EMPTY) backtick contents when the line IS present. The empty-string case is
  // preserved deliberately: the CQL emit lowering pass (`lowerLocalCodes`)
  // diagnoses an empty `code is` as a hard error, which requires the empty value
  // to survive in the AST rather than be coalesced away to `undefined`.
  private parseCode(
    bodyCtx: import("../grammar/generated/antlr/CRLParser").ConceptBodyContext,
  ): string | undefined {
    const codeLine = bodyCtx.codeIsLine?.();
    if (!codeLine) return undefined;
    const bt = codeLine.backtickString?.();
    return bt?.text !== undefined ? bt.text.slice(1, -1) : undefined;
  }

  // Build the `possible representation:` entries — anonymous inheriting source
  // shapes. Each is type/value-type/coded-from (named or inline); inherited
  // fields are absent (ADR 0001 §3).
  private parseRepresentations(
    bodyCtx: import("../grammar/generated/antlr/CRLParser").ConceptBodyContext,
  ): Representation[] {
    const repLines = bodyCtx.sourceRepresentationLine?.() ?? [];
    const reps: Representation[] = [];
    for (const rl of repLines) {
      const rb = rl.representationBody();
      if (!rb) continue;

      let conceptType: ConceptType | undefined;
      const tl = rb.typeLine?.();
      if (tl) {
        try {
          const tok = tl.CONCEPT_TYPE();
          if (tok) conceptType = tok.text as ConceptType;
        } catch {
          conceptType = undefined;
        }
      }

      const valueTypes: ConceptValueType[] = [];
      for (const vtl of rb.valueTypeLine?.() ?? []) {
        try {
          const tok = vtl.CONCEPT_VALUE_TYPE();
          if (tok) valueTypes.push(tok.text as ConceptValueType);
        } catch {
          // skip malformed value-type line
        }
      }

      let terminologyName: ReferenceName | undefined;
      const cf = rb.codedFromLine?.();
      if (cf) {
        const termRef = cf.terminologyReference?.();
        if (termRef) terminologyName = refFromRefContext(termRef);
      }

      reps.push({
        type: "Representation",
        ...(conceptType ? { conceptType } : {}),
        valueTypes,
        ...(terminologyName ? { terminologyName } : {}),
        location: getLocation(rl),
      });
    }
    return reps;
  }

  visitParameterStatement(ctx: ParameterStatementContext): Parameter {
    const ident = ctx.parameterIdentifier?.();
    const name = ident?.text?.slice(1, -1);
    if (!name) {
      this.reportError("AstError", ctx, {
        message: "ParameterStatement: missing parameterIdentifier",
      });
      return null as unknown as Parameter;
    }
    const body = ctx.parameterBody?.();
    const typeLine = body?.parameterTypeLine?.();
    const typeToken = typeLine?.PARAMETER_TYPE?.();
    const rawText = typeToken?.text ?? "";
    let parameterType = rawText;
    // The lexer error path stores a JSON envelope as the token text when
    // the type name isn't in the allowlist. Try/catch + reportError
    // mirrors how `parseConceptTypes` handles InvalidConceptType.
    try {
      const parsed = JSON.parse(rawText);
      if (parsed && parsed.errorType === "InvalidParameterType") {
        this.reportError("AstError", ctx, {
          message: `Invalid parameter type "${parsed.value}". Valid types: ${parsed.validTypes.join(", ")}`,
        });
        parameterType = "";
      }
    } catch {
      // Not a JSON envelope — keep rawText as the type name.
    }
    return {
      type: "Parameter",
      name,
      parameterType,
      location: getLocation(ctx),
    };
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
    const { conceptType, valueTypes } = types;
    const meta = this.parseMeta(bodyCtx);
    const evidence = this.parseEvidence(bodyCtx);
    const code = this.parseCode(bodyCtx);
    const definition = this.parseConceptDefinition(bodyCtx, ctx);
    const representations = this.parseRepresentations(bodyCtx);
    // A concept must carry SOME real body. An EMPTY `code is ``.` is not a real
    // body (it leaves the concept un-assertable), so a concept whose only body
    // is an empty code still fails this check — but the empty `code` value is
    // PRESERVED on the AST below (when the line is present) so the CQL emit's
    // `lowerLocalCodes` can surface an explicit empty-code diagnostic for the
    // mixed case (empty code + a real definition).
    if (!definition && representations.length === 0 && !code) {
      this.reportError("AstError", ctx, {
        message:
          "ConceptStatement must have a local code, coded from, defined as, definition is, or at least one possible representation",
      });
      return null as unknown as Concept;
    }
    return {
      type: "Concept",
      name,
      ...(conceptType ? { conceptType } : {}),
      valueTypes,
      ...(code !== undefined ? { code } : {}),
      ...(meta.length > 0 ? { meta } : {}),
      ...(evidence ? { evidence } : {}),
      ...(definition ? { definition } : {}),
      representations,
      location: getLocation(ctx),
    };
  }

  // === v0.7 defined as + composition visitors ===

  visitDefinedAsBareRef(ctx: DefinedAsBareRefContext): DefinedAsBareRef {
    const ref = refFromRefContext(ctx.conceptReference());
    return {
      type: "DefinedAsBareRef",
      ref,
      location: getLocation(ctx),
    };
  }

  visitDefinedAsComposition(ctx: DefinedAsCompositionContext): DefinedAsComposition {
    const expr = this.visit(ctx.compositionExpression()) as CompositionExpression;
    return {
      type: "DefinedAsComposition",
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
    const ref = refFromRefContext(ctx.conceptReference());
    return { type: "CompositionRef", ref, location: getLocation(ctx) };
  }

  visitCompositionGroup(ctx: CompositionGroupContext): CompositionGroup {
    const expr = this.visit(ctx.compositionExpression()) as CompositionExpression;
    return { type: "CompositionGroup", expression: expr, location: getLocation(ctx) };
  }

  // Wrapper for definedAsBody — dispatches to the labeled alternatives via visit().
  // The labeled alts (DefinedAsBareRef / DefinedAsComposition) live on the daBody rule.
  visitDefinedAsBody(ctx: DefinedAsBodyContext): DefinedAsDefinition {
    const daBodyCtx = ctx.daBody();
    const body = this.visit(daBodyCtx) as DefinedAsBareRef | DefinedAsComposition;
    return {
      type: "DefinedAsDefinition",
      body,
      location: getLocation(ctx),
    };
  }

  // === v0.7 definition-is body + narrative visitors ===

  visitDefinitionIsBody(ctx: DefinitionIsBodyContext): DefinitionIsDefinition {
    const narrative = this.visitNarrative(ctx.narrative());
    return {
      type: "DefinitionIsDefinition",
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
    // narrativeElement#NConceptRef now uses qualifiableReference instead of
    // raw QUOTED_STRING — refs inside `definition is` bodies can be qualified.
    const value = refFromQualifiable(ctx.qualifiableReference());
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
    const ucumCtx = ctx.SINGLE_QUOTED_STRING();
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
    // argValue#AVConceptRef now uses qualifiableReference — argGroup refs
    // can be qualified.
    const value = refFromQualifiable(ctx.qualifiableReference());
    return { type: "NConceptRef", value, location: getLocation(ctx) };
  }

  visitAVQuantity(ctx: AVQuantityContext): Quantity {
    return this.visitQuantity(ctx.quantity());
  }

  visitAVNestedGroup(ctx: AVNestedGroupContext): NDisjunction | NConjunction | NConceptRef | Quantity {
    return this.visitArgGroup(ctx.argGroup());
  }
}
