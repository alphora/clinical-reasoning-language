// Generated from src/grammar/CPGL.g4 by ANTLR 4.9.0-SNAPSHOT


import { ParseTreeVisitor } from "antlr4ts/tree/ParseTreeVisitor";

import { FileContext } from "./CPGLParser";
import { StatementContext } from "./CPGLParser";
import { DecisionContext } from "./CPGLParser";
import { DecisionBlockContext } from "./CPGLParser";
import { WhenClauseContext } from "./CPGLParser";
import { WhenBlockContext } from "./CPGLParser";
import { NestedWhenBlockContext } from "./CPGLParser";
import { TerminalBlockContext } from "./CPGLParser";
import { TerminalActionContext } from "./CPGLParser";
import { DoClauseContext } from "./CPGLParser";
import { UseClauseContext } from "./CPGLParser";
import { OptionalQualifierContext } from "./CPGLParser";
import { ActionContext } from "./CPGLParser";
import { ActionBlockContext } from "./CPGLParser";
import { ActionClauseContext } from "./CPGLParser";
import { CasefeatureContext } from "./CPGLParser";
import { CasefeatureBlockContext } from "./CPGLParser";
import { CasefeatureCodeClauseContext } from "./CPGLParser";
import { CasefeatureFhirTypeClauseContext } from "./CPGLParser";
import { CasefeatureProfileUrlClauseContext } from "./CPGLParser";
import { CasefeatureValueTypeClauseContext } from "./CPGLParser";
import { CompositeExpressionContext } from "./CPGLParser";
import { BooleanExprContext } from "./CPGLParser";
import { BooleanTermContext } from "./CPGLParser";
import { BooleanFactorContext } from "./CPGLParser";


/**
 * This interface defines a complete generic visitor for a parse tree produced
 * by `CPGLParser`.
 *
 * @param <Result> The return type of the visit operation. Use `void` for
 * operations with no return type.
 */
export interface CPGLVisitor<Result> extends ParseTreeVisitor<Result> {
	/**
	 * Visit a parse tree produced by `CPGLParser.file`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitFile?: (ctx: FileContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.statement`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitStatement?: (ctx: StatementContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.decision`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitDecision?: (ctx: DecisionContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.decisionBlock`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitDecisionBlock?: (ctx: DecisionBlockContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.whenClause`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitWhenClause?: (ctx: WhenClauseContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.whenBlock`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitWhenBlock?: (ctx: WhenBlockContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.nestedWhenBlock`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitNestedWhenBlock?: (ctx: NestedWhenBlockContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.terminalBlock`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitTerminalBlock?: (ctx: TerminalBlockContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.terminalAction`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitTerminalAction?: (ctx: TerminalActionContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.doClause`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitDoClause?: (ctx: DoClauseContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.useClause`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitUseClause?: (ctx: UseClauseContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.optionalQualifier`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitOptionalQualifier?: (ctx: OptionalQualifierContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.action`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitAction?: (ctx: ActionContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.actionBlock`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitActionBlock?: (ctx: ActionBlockContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.actionClause`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitActionClause?: (ctx: ActionClauseContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.casefeature`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCasefeature?: (ctx: CasefeatureContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.casefeatureBlock`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCasefeatureBlock?: (ctx: CasefeatureBlockContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.casefeatureCodeClause`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCasefeatureCodeClause?: (ctx: CasefeatureCodeClauseContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.casefeatureFhirTypeClause`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCasefeatureFhirTypeClause?: (ctx: CasefeatureFhirTypeClauseContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.casefeatureProfileUrlClause`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCasefeatureProfileUrlClause?: (ctx: CasefeatureProfileUrlClauseContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.casefeatureValueTypeClause`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCasefeatureValueTypeClause?: (ctx: CasefeatureValueTypeClauseContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.compositeExpression`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCompositeExpression?: (ctx: CompositeExpressionContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.booleanExpr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitBooleanExpr?: (ctx: BooleanExprContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.booleanTerm`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitBooleanTerm?: (ctx: BooleanTermContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.booleanFactor`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitBooleanFactor?: (ctx: BooleanFactorContext) => Result;
}

