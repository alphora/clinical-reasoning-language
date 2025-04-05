// Generated from src/grammar/CPGL.g4 by ANTLR 4.9.0-SNAPSHOT


import { ParseTreeVisitor } from "antlr4ts/tree/ParseTreeVisitor";

import { FileContext } from "./CPGLParser";
import { StatementContext } from "./CPGLParser";
import { DecisionContext } from "./CPGLParser";
import { BlockContext } from "./CPGLParser";
import { QualifierContext } from "./CPGLParser";
import { StatementLineContext } from "./CPGLParser";
import { WhenClauseContext } from "./CPGLParser";
import { DoClauseContext } from "./CPGLParser";
import { UseClauseContext } from "./CPGLParser";
import { ActionContext } from "./CPGLParser";
import { ActionBlockContext } from "./CPGLParser";
import { ActionFhirTypeClauseContext } from "./CPGLParser";
import { CasefeatureContext } from "./CPGLParser";
import { CasefeatureBlockContext } from "./CPGLParser";
import { CasefeatureLineContext } from "./CPGLParser";
import { CasefeatureCodeClauseContext } from "./CPGLParser";
import { CasefeatureFhirTypeClauseContext } from "./CPGLParser";
import { CasefeatureUrlClauseContext } from "./CPGLParser";
import { CasefeatureValueTypeClauseContext } from "./CPGLParser";


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
	 * Visit a parse tree produced by `CPGLParser.qualifier`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitQualifier?: (ctx: QualifierContext) => Result;

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
	 * Visit a parse tree produced by `CPGLParser.actionFhirTypeClause`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitActionFhirTypeClause?: (ctx: ActionFhirTypeClauseContext) => Result;

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
	 * Visit a parse tree produced by `CPGLParser.casefeatureLine`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCasefeatureLine?: (ctx: CasefeatureLineContext) => Result;

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
	 * Visit a parse tree produced by `CPGLParser.casefeatureUrlClause`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCasefeatureUrlClause?: (ctx: CasefeatureUrlClauseContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.casefeatureValueTypeClause`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCasefeatureValueTypeClause?: (ctx: CasefeatureValueTypeClauseContext) => Result;
}

