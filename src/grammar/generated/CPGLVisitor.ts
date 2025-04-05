// Generated from src/grammar/CPGL.g4 by ANTLR 4.9.0-SNAPSHOT


import { ParseTreeVisitor } from "antlr4ts/tree/ParseTreeVisitor";

import { FileContext } from "./CPGLParser";
import { StatementContext } from "./CPGLParser";
import { DecisionContext } from "./CPGLParser";
import { BlockContext } from "./CPGLParser";
import { StatementLineContext } from "./CPGLParser";
import { WhenClauseContext } from "./CPGLParser";
import { DoClauseContext } from "./CPGLParser";
import { UseClauseContext } from "./CPGLParser";
import { ActionContext } from "./CPGLParser";
import { ActionBlockContext } from "./CPGLParser";
import { ActionBodyContext } from "./CPGLParser";
import { FhirtypeClauseContext } from "./CPGLParser";
import { CasefeatureContext } from "./CPGLParser";
import { CasefeatureBlockContext } from "./CPGLParser";
import { CasefeatureBodyContext } from "./CPGLParser";
import { CodeClauseContext } from "./CPGLParser";
import { CasefeatureFhirtypeClauseContext } from "./CPGLParser";
import { UrlClauseContext } from "./CPGLParser";
import { ValuetypeClauseContext } from "./CPGLParser";


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
	 * Visit a parse tree produced by `CPGLParser.block`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitBlock?: (ctx: BlockContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.statementLine`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitStatementLine?: (ctx: StatementLineContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.whenClause`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitWhenClause?: (ctx: WhenClauseContext) => Result;

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
	 * Visit a parse tree produced by `CPGLParser.actionBody`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitActionBody?: (ctx: ActionBodyContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.fhirtypeClause`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitFhirtypeClause?: (ctx: FhirtypeClauseContext) => Result;

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
	 * Visit a parse tree produced by `CPGLParser.casefeatureBody`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCasefeatureBody?: (ctx: CasefeatureBodyContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.codeClause`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCodeClause?: (ctx: CodeClauseContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.casefeatureFhirtypeClause`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCasefeatureFhirtypeClause?: (ctx: CasefeatureFhirtypeClauseContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.urlClause`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitUrlClause?: (ctx: UrlClauseContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.valuetypeClause`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitValuetypeClause?: (ctx: ValuetypeClauseContext) => Result;
}

