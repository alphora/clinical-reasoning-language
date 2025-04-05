// Generated from docs\CPGL.g4 by ANTLR 4.9.0-SNAPSHOT


import { ParseTreeListener } from "antlr4ts/tree/ParseTreeListener";

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
 * This interface defines a complete listener for a parse tree produced by
 * `CPGLParser`.
 */
export interface CPGLListener extends ParseTreeListener {
	/**
	 * Enter a parse tree produced by `CPGLParser.file`.
	 * @param ctx the parse tree
	 */
	enterFile?: (ctx: FileContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.file`.
	 * @param ctx the parse tree
	 */
	exitFile?: (ctx: FileContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.statement`.
	 * @param ctx the parse tree
	 */
	enterStatement?: (ctx: StatementContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.statement`.
	 * @param ctx the parse tree
	 */
	exitStatement?: (ctx: StatementContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.decision`.
	 * @param ctx the parse tree
	 */
	enterDecision?: (ctx: DecisionContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.decision`.
	 * @param ctx the parse tree
	 */
	exitDecision?: (ctx: DecisionContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.block`.
	 * @param ctx the parse tree
	 */
	enterBlock?: (ctx: BlockContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.block`.
	 * @param ctx the parse tree
	 */
	exitBlock?: (ctx: BlockContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.statementLine`.
	 * @param ctx the parse tree
	 */
	enterStatementLine?: (ctx: StatementLineContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.statementLine`.
	 * @param ctx the parse tree
	 */
	exitStatementLine?: (ctx: StatementLineContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.whenClause`.
	 * @param ctx the parse tree
	 */
	enterWhenClause?: (ctx: WhenClauseContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.whenClause`.
	 * @param ctx the parse tree
	 */
	exitWhenClause?: (ctx: WhenClauseContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.doClause`.
	 * @param ctx the parse tree
	 */
	enterDoClause?: (ctx: DoClauseContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.doClause`.
	 * @param ctx the parse tree
	 */
	exitDoClause?: (ctx: DoClauseContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.useClause`.
	 * @param ctx the parse tree
	 */
	enterUseClause?: (ctx: UseClauseContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.useClause`.
	 * @param ctx the parse tree
	 */
	exitUseClause?: (ctx: UseClauseContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.action`.
	 * @param ctx the parse tree
	 */
	enterAction?: (ctx: ActionContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.action`.
	 * @param ctx the parse tree
	 */
	exitAction?: (ctx: ActionContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.actionBlock`.
	 * @param ctx the parse tree
	 */
	enterActionBlock?: (ctx: ActionBlockContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.actionBlock`.
	 * @param ctx the parse tree
	 */
	exitActionBlock?: (ctx: ActionBlockContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.actionBody`.
	 * @param ctx the parse tree
	 */
	enterActionBody?: (ctx: ActionBodyContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.actionBody`.
	 * @param ctx the parse tree
	 */
	exitActionBody?: (ctx: ActionBodyContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.fhirtypeClause`.
	 * @param ctx the parse tree
	 */
	enterFhirtypeClause?: (ctx: FhirtypeClauseContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.fhirtypeClause`.
	 * @param ctx the parse tree
	 */
	exitFhirtypeClause?: (ctx: FhirtypeClauseContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.casefeature`.
	 * @param ctx the parse tree
	 */
	enterCasefeature?: (ctx: CasefeatureContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.casefeature`.
	 * @param ctx the parse tree
	 */
	exitCasefeature?: (ctx: CasefeatureContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.casefeatureBlock`.
	 * @param ctx the parse tree
	 */
	enterCasefeatureBlock?: (ctx: CasefeatureBlockContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.casefeatureBlock`.
	 * @param ctx the parse tree
	 */
	exitCasefeatureBlock?: (ctx: CasefeatureBlockContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.casefeatureBody`.
	 * @param ctx the parse tree
	 */
	enterCasefeatureBody?: (ctx: CasefeatureBodyContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.casefeatureBody`.
	 * @param ctx the parse tree
	 */
	exitCasefeatureBody?: (ctx: CasefeatureBodyContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.codeClause`.
	 * @param ctx the parse tree
	 */
	enterCodeClause?: (ctx: CodeClauseContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.codeClause`.
	 * @param ctx the parse tree
	 */
	exitCodeClause?: (ctx: CodeClauseContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.casefeatureFhirtypeClause`.
	 * @param ctx the parse tree
	 */
	enterCasefeatureFhirtypeClause?: (ctx: CasefeatureFhirtypeClauseContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.casefeatureFhirtypeClause`.
	 * @param ctx the parse tree
	 */
	exitCasefeatureFhirtypeClause?: (ctx: CasefeatureFhirtypeClauseContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.urlClause`.
	 * @param ctx the parse tree
	 */
	enterUrlClause?: (ctx: UrlClauseContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.urlClause`.
	 * @param ctx the parse tree
	 */
	exitUrlClause?: (ctx: UrlClauseContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.valuetypeClause`.
	 * @param ctx the parse tree
	 */
	enterValuetypeClause?: (ctx: ValuetypeClauseContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.valuetypeClause`.
	 * @param ctx the parse tree
	 */
	exitValuetypeClause?: (ctx: ValuetypeClauseContext) => void;
}

