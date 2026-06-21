import { ParserRuleContext } from "antlr4ts/ParserRuleContext";
import { AbstractParseTreeVisitor } from "antlr4ts/tree/AbstractParseTreeVisitor";

import {
  CelContext,
  LibraryStatementContext,
  CoversStatementContext,
  IncludeStatementContext,
  StringLiteralContext,
  BacktickLiteralContext,
  StatementContext,
  FactStatementContext,
  FactBodyContext,
  NameFieldContext,
  BirthDateFieldContext,
  CodeFieldContext,
  DateFieldContext,
  ValueFieldContext,
  StageFieldContext,
  DefinedByFieldContext,
  QualifiedRefContext,
  BareRefContext,
  CaseStatementContext,
  CaseBodyContext,
  DescriptionFieldContext,
  SubjectFieldContext,
  EncounterFieldContext,
  AmbientAnchorContext,
  NamedAnchorContext,
  NowAnchorContext,
  FixedDateAnchorContext,
  FactRefFieldContext,
  AtAmbientAnchorContext,
  AtNamedAnchorContext,
  AtAbsoluteDateContext,
  WithIntentContext,
  BecauseClauseContext,
  ResultFieldContext,
  TrueResultContext,
  FalseResultContext,
  BranchResultContext,
  CrossResourceFieldContext,
  CrossResourceRelationContext,
} from "../../grammar/generated/antlr/CELParser";
import { CELParserVisitor } from "../../grammar/generated/antlr/CELParserVisitor";
import type { CRLError } from "../../types/errors";

import type {
  CEL,
  CELLibraryDeclaration,
  CELCoversDeclaration,
  CELInclude,
  CELStatement,
  CELFact,
  CELFactBody,
  CELNameField,
  CELBirthDateField,
  CELCodeField,
  CELDateField,
  CELValueField,
  CELStageField,
  CELDefinedByField,
  CELCase,
  CELCaseBody,
  CELDescriptionField,
  CELSubjectField,
  CELEncounterField,
  CELAnchorField,
  CELAnchorExpr,
  CELNowAnchor,
  CELFixedDateAnchor,
  CELFactRefField,
  CELAtClause,
  CELAtAnchor,
  CELAtNamedAnchor,
  CELAtAbsoluteDate,
  CELDurationOffset,
  CELResultField,
  CELResultValue,
  CELCrossResourceField,
  CELReferenceName,
  IntentModifier,
  CrossResourceRelation,
  Location,
  QualifiedReference,
} from "./types";

// Union of every concrete CEL AST node the builder can emit. Visitor return
// type bottom — see `defaultResult()`. Individual visitor methods narrow.
type CELAstNode =
  | CEL
  | CELLibraryDeclaration
  | CELCoversDeclaration
  | CELInclude
  | CELStatement
  | CELFactBody
  | CELCaseBody
  | CELAnchorExpr
  | CELAtClause
  | CELDurationOffset
  | CELResultValue
  | CrossResourceRelation
  | QualifiedReference
  | StringLiteralShim
  | BacktickLiteralShim
  | IntentModifierShim
  | BecauseShim
  | ReferenceShim;

// Internal shims — the visitor's return-any-AST-node contract means some
// methods return non-CEL-AST helper values that flow into parent nodes.
// Wrapping in nominal objects keeps the union meaningful.
interface StringLiteralShim {
  type: "_StringLiteralShim";
  value: string;
  location: Location;
}

interface BacktickLiteralShim {
  type: "_BacktickLiteralShim";
  value: string;
  location: Location;
}

interface IntentModifierShim {
  type: "_IntentModifierShim";
  value: IntentModifier;
  location: Location;
}

interface BecauseShim {
  type: "_BecauseShim";
  value: string;
  location: Location;
}

interface ReferenceShim {
  type: "_ReferenceShim";
  ref: CELReferenceName;
  location: Location;
}

function getLocation(ctx: ParserRuleContext): Location {
  const start = ctx.start;
  const stop = ctx.stop ?? start;
  return {
    start: { line: start.line, column: start.charPositionInLine },
    end: { line: stop.line, column: stop.charPositionInLine + (stop.text?.length ?? 0) },
  };
}

function unquote(text: string): string {
  return text.slice(1, -1);
}

/**
 * Strip the surrounding backticks. Backslash-escapes are preserved
 * verbatim per the AST contract in `types.ts` (BACKTICK_STRING contents).
 */
function unbacktick(text: string): string {
  return text.slice(1, -1);
}

export class CELAstBuilder
  extends AbstractParseTreeVisitor<CELAstNode>
  implements CELParserVisitor<CELAstNode>
{
  private readonly errors: CRLError[] = [];

  protected defaultResult(): CELAstNode {
    return null as unknown as CELAstNode;
  }

  getErrors(): CRLError[] {
    return this.errors;
  }

  // ============================================================
  // Root
  // ============================================================

  visitCel = (ctx: CelContext): CEL => {
    const headerTok = ctx.HEADER(); // optional — omit the field when absent (don't synthesize "")
    const library = this.visit(ctx.libraryStatement()) as CELLibraryDeclaration;
    const coversCtx = ctx.coversStatement();
    const covers = coversCtx ? (this.visit(coversCtx) as CELCoversDeclaration) : undefined;
    const includes = ctx.includeStatement().map((i) => this.visit(i) as CELInclude);
    const statements = ctx.statement().map((s) => this.visit(s) as CELStatement);
    return {
      type: "CEL",
      ...(headerTok ? { header: headerTok.text } : {}),
      library,
      ...(covers ? { covers } : {}),
      includes,
      statements,
      location: getLocation(ctx),
    };
  };

  visitLibraryStatement = (ctx: LibraryStatementContext): CELLibraryDeclaration => {
    const name = unquote(ctx.stringLiteral().text);
    return { type: "CELLibraryDeclaration", name, location: getLocation(ctx) };
  };

  visitCoversStatement = (ctx: CoversStatementContext): CELCoversDeclaration => {
    const name = unquote(ctx.stringLiteral().text);
    return { type: "CELCoversDeclaration", name, location: getLocation(ctx) };
  };

  visitIncludeStatement = (ctx: IncludeStatementContext): CELInclude => {
    const literals = ctx.stringLiteral();
    const name = unquote(literals[0].text);
    const alias = literals.length > 1 ? unquote(literals[1].text) : undefined;
    return {
      type: "CELInclude",
      name,
      ...(alias !== undefined ? { alias } : {}),
      location: getLocation(ctx),
    };
  };

  visitStringLiteral = (ctx: StringLiteralContext): StringLiteralShim => ({
    type: "_StringLiteralShim",
    value: unquote(ctx.text),
    location: getLocation(ctx),
  });

  visitBacktickLiteral = (ctx: BacktickLiteralContext): BacktickLiteralShim => ({
    type: "_BacktickLiteralShim",
    value: unbacktick(ctx.text),
    location: getLocation(ctx),
  });

  visitStatement = (ctx: StatementContext): CELStatement => {
    const fact = ctx.factStatement();
    if (fact) return this.visit(fact) as CELFact;
    const c = ctx.caseStatement();
    if (c) return this.visit(c) as CELCase;
    throw new Error(`Unreachable: empty statement at ${getLocation(ctx).start.line}`);
  };

  // ============================================================
  // Fact
  // ============================================================

  visitFactStatement = (ctx: FactStatementContext): CELFact => {
    const name = unquote(ctx.stringLiteral().text);
    const body = ctx.factBody().map((b) => this.visit(b) as CELFactBody);
    return { type: "CELFact", name, body, location: getLocation(ctx) };
  };

  visitFactBody = (ctx: FactBodyContext): CELFactBody => {
    const child =
      ctx.nameField() ??
      ctx.birthDateField() ??
      ctx.codeField() ??
      ctx.dateField() ??
      ctx.valueField() ??
      ctx.stageField() ??
      ctx.definedByField();
    if (!child) throw new Error(`Empty factBody at ${getLocation(ctx).start.line}`);
    return this.visit(child) as CELFactBody;
  };

  visitNameField = (ctx: NameFieldContext): CELNameField => ({
    type: "CELNameField",
    value: unquote(ctx.stringLiteral().text),
    location: getLocation(ctx),
  });

  visitBirthDateField = (ctx: BirthDateFieldContext): CELBirthDateField => ({
    type: "CELBirthDateField",
    value: unquote(ctx.stringLiteral().text),
    location: getLocation(ctx),
  });

  visitCodeField = (ctx: CodeFieldContext): CELCodeField => ({
    type: "CELCodeField",
    value: unquote(ctx.stringLiteral().text),
    location: getLocation(ctx),
  });

  visitDateField = (ctx: DateFieldContext): CELDateField => ({
    type: "CELDateField",
    value: unquote(ctx.stringLiteral().text),
    location: getLocation(ctx),
  });

  visitValueField = (ctx: ValueFieldContext): CELValueField => {
    const numTok = ctx.NUMBER();
    if (numTok) {
      return { type: "CELValueField", value: Number(numTok.text), location: getLocation(ctx) };
    }
    const sl = ctx.stringLiteral();
    if (sl) {
      return { type: "CELValueField", value: unquote(sl.text), location: getLocation(ctx) };
    }
    throw new Error(`Empty valueField at ${getLocation(ctx).start.line}`);
  };

  visitStageField = (ctx: StageFieldContext): CELStageField => ({
    type: "CELStageField",
    value: ctx.STAGE_VALUE().text,
    location: getLocation(ctx),
  });

  visitDefinedByField = (ctx: DefinedByFieldContext): CELDefinedByField => {
    const refShim = this.visit(ctx.reference()) as ReferenceShim;
    return {
      type: "CELDefinedByField",
      ref: refShim.ref,
      location: getLocation(ctx),
    };
  };

  visitQualifiedRef = (ctx: QualifiedRefContext): ReferenceShim => {
    const parts = ctx.stringLiteral();
    const libraryName = unquote(parts[0].text);
    const name = unquote(parts[1].text);
    const qualified: QualifiedReference = {
      type: "QualifiedReference",
      libraryName,
      name,
      location: getLocation(ctx),
    };
    return { type: "_ReferenceShim", ref: qualified, location: getLocation(ctx) };
  };

  visitBareRef = (ctx: BareRefContext): ReferenceShim => {
    return {
      type: "_ReferenceShim",
      ref: unquote(ctx.stringLiteral().text),
      location: getLocation(ctx),
    };
  };

  // ============================================================
  // Case
  // ============================================================

  visitCaseStatement = (ctx: CaseStatementContext): CELCase => {
    const name = unquote(ctx.stringLiteral().text);
    const body = ctx.caseBody().map((b) => this.visit(b) as CELCaseBody);
    return { type: "CELCase", name, body, location: getLocation(ctx) };
  };

  visitCaseBody = (ctx: CaseBodyContext): CELCaseBody => {
    const child =
      ctx.descriptionField() ??
      ctx.subjectField() ??
      ctx.encounterField() ??
      ctx.anchorField() ??
      ctx.factRefField() ??
      ctx.resultField() ??
      ctx.crossResourceField();
    if (!child) throw new Error(`Empty caseBody at ${getLocation(ctx).start.line}`);
    return this.visit(child) as CELCaseBody;
  };

  visitDescriptionField = (ctx: DescriptionFieldContext): CELDescriptionField => {
    const shim = this.visit(ctx.backtickLiteral()) as BacktickLiteralShim;
    return { type: "CELDescriptionField", value: shim.value, location: getLocation(ctx) };
  };

  visitSubjectField = (ctx: SubjectFieldContext): CELSubjectField => ({
    type: "CELSubjectField",
    factName: unquote(ctx.stringLiteral().text),
    location: getLocation(ctx),
  });

  visitEncounterField = (ctx: EncounterFieldContext): CELEncounterField => ({
    type: "CELEncounterField",
    factName: unquote(ctx.stringLiteral().text),
    location: getLocation(ctx),
  });

  // anchorField labeled alternatives:
  visitAmbientAnchor = (ctx: AmbientAnchorContext): CELAnchorField => {
    const expr = this.visit(ctx.anchorExpr()) as CELAnchorExpr;
    return { type: "CELAnchorField", expr, location: getLocation(ctx) };
  };

  visitNamedAnchor = (ctx: NamedAnchorContext): CELAnchorField => {
    const name = unquote(ctx.stringLiteral().text);
    const expr = this.visit(ctx.anchorExpr()) as CELAnchorExpr;
    return { type: "CELAnchorField", name, expr, location: getLocation(ctx) };
  };

  // anchorExpr labeled alternatives:
  visitNowAnchor = (ctx: NowAnchorContext): CELNowAnchor => {
    const offset = readOffset(ctx);
    return {
      type: "CELNowAnchor",
      ...(offset ? { offset } : {}),
      location: getLocation(ctx),
    };
  };

  visitFixedDateAnchor = (ctx: FixedDateAnchorContext): CELFixedDateAnchor => ({
    type: "CELFixedDateAnchor",
    date: ctx.DATE_LITERAL().text,
    location: getLocation(ctx),
  });

  visitFactRefField = (ctx: FactRefFieldContext): CELFactRefField => {
    const factName = unquote(ctx.stringLiteral().text);
    const atCtx = ctx.atClause();
    const at = atCtx ? (this.visit(atCtx) as CELAtClause) : undefined;
    const wiCtx = ctx.withIntent();
    const intent = wiCtx ? (this.visit(wiCtx) as IntentModifierShim).value : undefined;
    const bcCtx = ctx.becauseClause();
    const because = bcCtx ? (this.visit(bcCtx) as BecauseShim).value : undefined;
    return {
      type: "CELFactRefField",
      factName,
      ...(at ? { at } : {}),
      ...(intent !== undefined ? { intent } : {}),
      ...(because !== undefined ? { because } : {}),
      location: getLocation(ctx),
    };
  };

  // atClause labeled alternatives:
  visitAtAmbientAnchor = (ctx: AtAmbientAnchorContext): CELAtAnchor => {
    const offset = readOffset(ctx);
    return {
      type: "CELAtAnchor",
      ...(offset ? { offset } : {}),
      location: getLocation(ctx),
    };
  };

  visitAtNamedAnchor = (ctx: AtNamedAnchorContext): CELAtNamedAnchor => {
    const anchorName = unquote(ctx.stringLiteral().text);
    const offset = readOffset(ctx);
    return {
      type: "CELAtNamedAnchor",
      anchorName,
      ...(offset ? { offset } : {}),
      location: getLocation(ctx),
    };
  };

  visitAtAbsoluteDate = (ctx: AtAbsoluteDateContext): CELAtAbsoluteDate => ({
    type: "CELAtAbsoluteDate",
    date: ctx.DATE_LITERAL().text,
    location: getLocation(ctx),
  });

  visitWithIntent = (ctx: WithIntentContext): IntentModifierShim => {
    const value: IntentModifier = ctx.ABSENT_INTENT() ? "absent" : "negative";
    return { type: "_IntentModifierShim", value, location: getLocation(ctx) };
  };

  visitBecauseClause = (ctx: BecauseClauseContext): BecauseShim => {
    const shim = this.visit(ctx.backtickLiteral()) as BacktickLiteralShim;
    return { type: "_BecauseShim", value: shim.value, location: getLocation(ctx) };
  };

  visitResultField = (ctx: ResultFieldContext): CELResultField => {
    const leafName = unquote(ctx.stringLiteral().text);
    const value = this.visit(ctx.resultValue()) as CELResultValue;
    return { type: "CELResultField", leafName, value, location: getLocation(ctx) };
  };

  // resultValue labeled alternatives:
  visitTrueResult = (ctx: TrueResultContext): CELResultValue => ({
    type: "CELBooleanResult",
    value: true,
    location: getLocation(ctx),
  });

  visitFalseResult = (ctx: FalseResultContext): CELResultValue => ({
    type: "CELBooleanResult",
    value: false,
    location: getLocation(ctx),
  });

  visitBranchResult = (ctx: BranchResultContext): CELResultValue => ({
    type: "CELBranchResult",
    branchName: unquote(ctx.stringLiteral().text),
    location: getLocation(ctx),
  });

  visitCrossResourceField = (ctx: CrossResourceFieldContext): CELCrossResourceField => {
    const literals = ctx.stringLiteral();
    const sourceName = unquote(literals[0].text);
    const targetName = unquote(literals[1].text);
    const relation = relationFromCtx(ctx.crossResourceRelation());
    return {
      type: "CELCrossResourceField",
      sourceName,
      relation,
      targetName,
      location: getLocation(ctx),
    };
  };

  visitCrossResourceRelation = (_ctx: CrossResourceRelationContext): CELAstNode => {
    // Reached when the parent calls this.visit() directly. Parent reads the
    // relation via relationFromCtx() instead — this method is essentially a
    // no-op placeholder satisfying the visitor interface.
    return null as unknown as CELAstNode;
  };
}

/**
 * Read an optional `(PLUS | DASH) NUMBER TIME_UNIT` offset from any
 * anchor-position context. Returns undefined if no offset is present.
 *
 * Used by `NowAnchor`, `AtAmbientAnchor`, `AtNamedAnchor` — all share the
 * same offset shape per the grammar.
 */
function readOffset(
  ctx: NowAnchorContext | AtAmbientAnchorContext | AtNamedAnchorContext,
): CELDurationOffset | undefined {
  const numTok = ctx.NUMBER();
  const unitTok = ctx.TIME_UNIT();
  if (!numTok || !unitTok) return undefined;
  const sign: "+" | "-" = ctx.PLUS() ? "+" : "-";
  return {
    type: "CELDurationOffset",
    sign,
    value: Number(numTok.text),
    unit: unitTok.text,
    location: getLocation(ctx),
  };
}

function relationFromCtx(ctx: CrossResourceRelationContext): CrossResourceRelation {
  if (ctx.BASED_ON()) return "based-on";
  if (ctx.PART_OF()) return "part-of";
  if (ctx.DURING_ENCOUNTER()) return "during-encounter";
  if (ctx.REQUESTED_BY()) return "requested-by";
  if (ctx.PERFORMED_BY()) return "performed-by";
  if (ctx.NOT_DONE_BECAUSE()) return "not-done-because";
  throw new Error(`Unknown cross-resource relation at ${getLocation(ctx).start.line}`);
}
