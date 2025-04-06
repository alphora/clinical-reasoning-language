// Generated from src/grammar/CPGL.g4 by ANTLR 4.9.0-SNAPSHOT


import { ParseTreeListener } from "antlr4ts/tree/ParseTreeListener";

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
	 * Enter a parse tree produced by `CPGLParser.decisionBlock`.
	 * @param ctx the parse tree
	 */
	enterDecisionBlock?: (ctx: DecisionBlockContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.decisionBlock`.
	 * @param ctx the parse tree
	 */
	exitDecisionBlock?: (ctx: DecisionBlockContext) => void;

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
	 * Enter a parse tree produced by `CPGLParser.whenBlock`.
	 * @param ctx the parse tree
	 */
	enterWhenBlock?: (ctx: WhenBlockContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.whenBlock`.
	 * @param ctx the parse tree
	 */
	exitWhenBlock?: (ctx: WhenBlockContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.nestedWhenBlock`.
	 * @param ctx the parse tree
	 */
	enterNestedWhenBlock?: (ctx: NestedWhenBlockContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.nestedWhenBlock`.
	 * @param ctx the parse tree
	 */
	exitNestedWhenBlock?: (ctx: NestedWhenBlockContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.terminalBlock`.
	 * @param ctx the parse tree
	 */
	enterTerminalBlock?: (ctx: TerminalBlockContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.terminalBlock`.
	 * @param ctx the parse tree
	 */
	exitTerminalBlock?: (ctx: TerminalBlockContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.terminalAction`.
	 * @param ctx the parse tree
	 */
	enterTerminalAction?: (ctx: TerminalActionContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.terminalAction`.
	 * @param ctx the parse tree
	 */
	exitTerminalAction?: (ctx: TerminalActionContext) => void;

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
	 * Enter a parse tree produced by `CPGLParser.optionalQualifier`.
	 * @param ctx the parse tree
	 */
	enterOptionalQualifier?: (ctx: OptionalQualifierContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.optionalQualifier`.
	 * @param ctx the parse tree
	 */
	exitOptionalQualifier?: (ctx: OptionalQualifierContext) => void;

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
	 * Enter a parse tree produced by `CPGLParser.actionClause`.
	 * @param ctx the parse tree
	 */
	enterActionClause?: (ctx: ActionClauseContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.actionClause`.
	 * @param ctx the parse tree
	 */
	exitActionClause?: (ctx: ActionClauseContext) => void;

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
	 * Enter a parse tree produced by `CPGLParser.casefeatureProfileUrlClause`.
	 * @param ctx the parse tree
	 */
	enterCasefeatureProfileUrlClause?: (ctx: CasefeatureProfileUrlClauseContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.casefeatureProfileUrlClause`.
	 * @param ctx the parse tree
	 */
	exitCasefeatureProfileUrlClause?: (ctx: CasefeatureProfileUrlClauseContext) => void;

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

	/**
	 * Enter a parse tree produced by `CPGLParser.compositeExpression`.
	 * @param ctx the parse tree
	 */
	enterCompositeExpression?: (ctx: CompositeExpressionContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.compositeExpression`.
	 * @param ctx the parse tree
	 */
	exitCompositeExpression?: (ctx: CompositeExpressionContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.booleanExpr`.
	 * @param ctx the parse tree
	 */
	enterBooleanExpr?: (ctx: BooleanExprContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.booleanExpr`.
	 * @param ctx the parse tree
	 */
	exitBooleanExpr?: (ctx: BooleanExprContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.booleanTerm`.
	 * @param ctx the parse tree
	 */
	enterBooleanTerm?: (ctx: BooleanTermContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.booleanTerm`.
	 * @param ctx the parse tree
	 */
	exitBooleanTerm?: (ctx: BooleanTermContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.booleanFactor`.
	 * @param ctx the parse tree
	 */
	enterBooleanFactor?: (ctx: BooleanFactorContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.booleanFactor`.
	 * @param ctx the parse tree
	 */
	exitBooleanFactor?: (ctx: BooleanFactorContext) => void;
}

