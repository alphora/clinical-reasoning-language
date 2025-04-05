// Generated from src/grammar/CPGL.g4 by ANTLR 4.9.0-SNAPSHOT


import { ParseTreeListener } from "antlr4ts/tree/ParseTreeListener";

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
	 * Enter a parse tree produced by `CPGLParser.qualifier`.
	 * @param ctx the parse tree
	 */
	enterQualifier?: (ctx: QualifierContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.qualifier`.
	 * @param ctx the parse tree
	 */
	exitQualifier?: (ctx: QualifierContext) => void;

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
	 * Enter a parse tree produced by `CPGLParser.actionFhirTypeClause`.
	 * @param ctx the parse tree
	 */
	enterActionFhirTypeClause?: (ctx: ActionFhirTypeClauseContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.actionFhirTypeClause`.
	 * @param ctx the parse tree
	 */
	exitActionFhirTypeClause?: (ctx: ActionFhirTypeClauseContext) => void;

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
	 * Enter a parse tree produced by `CPGLParser.casefeatureLine`.
	 * @param ctx the parse tree
	 */
	enterCasefeatureLine?: (ctx: CasefeatureLineContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.casefeatureLine`.
	 * @param ctx the parse tree
	 */
	exitCasefeatureLine?: (ctx: CasefeatureLineContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.casefeatureCodeClause`.
	 * @param ctx the parse tree
	 */
	enterCasefeatureCodeClause?: (ctx: CasefeatureCodeClauseContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.casefeatureCodeClause`.
	 * @param ctx the parse tree
	 */
	exitCasefeatureCodeClause?: (ctx: CasefeatureCodeClauseContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.casefeatureFhirTypeClause`.
	 * @param ctx the parse tree
	 */
	enterCasefeatureFhirTypeClause?: (ctx: CasefeatureFhirTypeClauseContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.casefeatureFhirTypeClause`.
	 * @param ctx the parse tree
	 */
	exitCasefeatureFhirTypeClause?: (ctx: CasefeatureFhirTypeClauseContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.casefeatureUrlClause`.
	 * @param ctx the parse tree
	 */
	enterCasefeatureUrlClause?: (ctx: CasefeatureUrlClauseContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.casefeatureUrlClause`.
	 * @param ctx the parse tree
	 */
	exitCasefeatureUrlClause?: (ctx: CasefeatureUrlClauseContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.casefeatureValueTypeClause`.
	 * @param ctx the parse tree
	 */
	enterCasefeatureValueTypeClause?: (ctx: CasefeatureValueTypeClauseContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.casefeatureValueTypeClause`.
	 * @param ctx the parse tree
	 */
	exitCasefeatureValueTypeClause?: (ctx: CasefeatureValueTypeClauseContext) => void;
}

