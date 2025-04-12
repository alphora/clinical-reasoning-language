// Generated from src/grammar/CPGLParser.g4 by ANTLR 4.9.0-SNAPSHOT


import { ParseTreeListener } from "antlr4ts/tree/ParseTreeListener";

import { CpglContext } from "./CPGLParser";
import { StatementContext } from "./CPGLParser";
import { DecisionStatementContext } from "./CPGLParser";
import { DecisionBodyContext } from "./CPGLParser";
import { WhenBlockContext } from "./CPGLParser";
import { AnyOrAllClauseContext } from "./CPGLParser";
import { BlockBodyContext } from "./CPGLParser";
import { SingleActionStatementContext } from "./CPGLParser";
import { BlockStatementContext } from "./CPGLParser";
import { ActionStatementContext } from "./CPGLParser";
import { DoStatementContext } from "./CPGLParser";
import { UseStatementContext } from "./CPGLParser";
import { TerminologyStatementContext } from "./CPGLParser";
import { TerminologyValuesetContext } from "./CPGLParser";
import { TerminologyUnknownContext } from "./CPGLParser";
import { TerminologySystemCodeContext } from "./CPGLParser";
import { ActivityStatementContext } from "./CPGLParser";
import { ConceptStatementContext } from "./CPGLParser";
import { ConceptBodyContext } from "./CPGLParser";
import { HasTypeLineContext } from "./CPGLParser";
import { HasValueTypeLineContext } from "./CPGLParser";
import { ProvenanceLineContext } from "./CPGLParser";
import { CodedByLineContext } from "./CPGLParser";
import { InferredByLineContext } from "./CPGLParser";
import { InferredBodyContext } from "./CPGLParser";
import { InferredByPatternContext } from "./CPGLParser";
import { InferredByExprContext } from "./CPGLParser";
import { ExprContext } from "./CPGLParser";
import { OrExprContext } from "./CPGLParser";
import { AndExprContext } from "./CPGLParser";
import { AtomContext } from "./CPGLParser";
import { IdentifierContext } from "./CPGLParser";
import { StringLiteralContext } from "./CPGLParser";


/**
 * This interface defines a complete listener for a parse tree produced by
 * `CPGLParser`.
 */
export interface CPGLParserListener extends ParseTreeListener {
	/**
	 * Enter a parse tree produced by `CPGLParser.cpgl`.
	 * @param ctx the parse tree
	 */
	enterCpgl?: (ctx: CpglContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.cpgl`.
	 * @param ctx the parse tree
	 */
	exitCpgl?: (ctx: CpglContext) => void;

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
	 * Enter a parse tree produced by `CPGLParser.decisionStatement`.
	 * @param ctx the parse tree
	 */
	enterDecisionStatement?: (ctx: DecisionStatementContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.decisionStatement`.
	 * @param ctx the parse tree
	 */
	exitDecisionStatement?: (ctx: DecisionStatementContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.decisionBody`.
	 * @param ctx the parse tree
	 */
	enterDecisionBody?: (ctx: DecisionBodyContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.decisionBody`.
	 * @param ctx the parse tree
	 */
	exitDecisionBody?: (ctx: DecisionBodyContext) => void;

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
	 * Enter a parse tree produced by `CPGLParser.anyOrAllClause`.
	 * @param ctx the parse tree
	 */
	enterAnyOrAllClause?: (ctx: AnyOrAllClauseContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.anyOrAllClause`.
	 * @param ctx the parse tree
	 */
	exitAnyOrAllClause?: (ctx: AnyOrAllClauseContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.blockBody`.
	 * @param ctx the parse tree
	 */
	enterBlockBody?: (ctx: BlockBodyContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.blockBody`.
	 * @param ctx the parse tree
	 */
	exitBlockBody?: (ctx: BlockBodyContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.singleActionStatement`.
	 * @param ctx the parse tree
	 */
	enterSingleActionStatement?: (ctx: SingleActionStatementContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.singleActionStatement`.
	 * @param ctx the parse tree
	 */
	exitSingleActionStatement?: (ctx: SingleActionStatementContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.blockStatement`.
	 * @param ctx the parse tree
	 */
	enterBlockStatement?: (ctx: BlockStatementContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.blockStatement`.
	 * @param ctx the parse tree
	 */
	exitBlockStatement?: (ctx: BlockStatementContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.actionStatement`.
	 * @param ctx the parse tree
	 */
	enterActionStatement?: (ctx: ActionStatementContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.actionStatement`.
	 * @param ctx the parse tree
	 */
	exitActionStatement?: (ctx: ActionStatementContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.doStatement`.
	 * @param ctx the parse tree
	 */
	enterDoStatement?: (ctx: DoStatementContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.doStatement`.
	 * @param ctx the parse tree
	 */
	exitDoStatement?: (ctx: DoStatementContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.useStatement`.
	 * @param ctx the parse tree
	 */
	enterUseStatement?: (ctx: UseStatementContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.useStatement`.
	 * @param ctx the parse tree
	 */
	exitUseStatement?: (ctx: UseStatementContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.terminologyStatement`.
	 * @param ctx the parse tree
	 */
	enterTerminologyStatement?: (ctx: TerminologyStatementContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.terminologyStatement`.
	 * @param ctx the parse tree
	 */
	exitTerminologyStatement?: (ctx: TerminologyStatementContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.terminologyValueset`.
	 * @param ctx the parse tree
	 */
	enterTerminologyValueset?: (ctx: TerminologyValuesetContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.terminologyValueset`.
	 * @param ctx the parse tree
	 */
	exitTerminologyValueset?: (ctx: TerminologyValuesetContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.terminologyUnknown`.
	 * @param ctx the parse tree
	 */
	enterTerminologyUnknown?: (ctx: TerminologyUnknownContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.terminologyUnknown`.
	 * @param ctx the parse tree
	 */
	exitTerminologyUnknown?: (ctx: TerminologyUnknownContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.terminologySystemCode`.
	 * @param ctx the parse tree
	 */
	enterTerminologySystemCode?: (ctx: TerminologySystemCodeContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.terminologySystemCode`.
	 * @param ctx the parse tree
	 */
	exitTerminologySystemCode?: (ctx: TerminologySystemCodeContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.activityStatement`.
	 * @param ctx the parse tree
	 */
	enterActivityStatement?: (ctx: ActivityStatementContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.activityStatement`.
	 * @param ctx the parse tree
	 */
	exitActivityStatement?: (ctx: ActivityStatementContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.conceptStatement`.
	 * @param ctx the parse tree
	 */
	enterConceptStatement?: (ctx: ConceptStatementContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.conceptStatement`.
	 * @param ctx the parse tree
	 */
	exitConceptStatement?: (ctx: ConceptStatementContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.conceptBody`.
	 * @param ctx the parse tree
	 */
	enterConceptBody?: (ctx: ConceptBodyContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.conceptBody`.
	 * @param ctx the parse tree
	 */
	exitConceptBody?: (ctx: ConceptBodyContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.hasTypeLine`.
	 * @param ctx the parse tree
	 */
	enterHasTypeLine?: (ctx: HasTypeLineContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.hasTypeLine`.
	 * @param ctx the parse tree
	 */
	exitHasTypeLine?: (ctx: HasTypeLineContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.hasValueTypeLine`.
	 * @param ctx the parse tree
	 */
	enterHasValueTypeLine?: (ctx: HasValueTypeLineContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.hasValueTypeLine`.
	 * @param ctx the parse tree
	 */
	exitHasValueTypeLine?: (ctx: HasValueTypeLineContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.provenanceLine`.
	 * @param ctx the parse tree
	 */
	enterProvenanceLine?: (ctx: ProvenanceLineContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.provenanceLine`.
	 * @param ctx the parse tree
	 */
	exitProvenanceLine?: (ctx: ProvenanceLineContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.codedByLine`.
	 * @param ctx the parse tree
	 */
	enterCodedByLine?: (ctx: CodedByLineContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.codedByLine`.
	 * @param ctx the parse tree
	 */
	exitCodedByLine?: (ctx: CodedByLineContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.inferredByLine`.
	 * @param ctx the parse tree
	 */
	enterInferredByLine?: (ctx: InferredByLineContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.inferredByLine`.
	 * @param ctx the parse tree
	 */
	exitInferredByLine?: (ctx: InferredByLineContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.inferredBody`.
	 * @param ctx the parse tree
	 */
	enterInferredBody?: (ctx: InferredBodyContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.inferredBody`.
	 * @param ctx the parse tree
	 */
	exitInferredBody?: (ctx: InferredBodyContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.inferredByPattern`.
	 * @param ctx the parse tree
	 */
	enterInferredByPattern?: (ctx: InferredByPatternContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.inferredByPattern`.
	 * @param ctx the parse tree
	 */
	exitInferredByPattern?: (ctx: InferredByPatternContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.inferredByExpr`.
	 * @param ctx the parse tree
	 */
	enterInferredByExpr?: (ctx: InferredByExprContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.inferredByExpr`.
	 * @param ctx the parse tree
	 */
	exitInferredByExpr?: (ctx: InferredByExprContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.expr`.
	 * @param ctx the parse tree
	 */
	enterExpr?: (ctx: ExprContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.expr`.
	 * @param ctx the parse tree
	 */
	exitExpr?: (ctx: ExprContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.orExpr`.
	 * @param ctx the parse tree
	 */
	enterOrExpr?: (ctx: OrExprContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.orExpr`.
	 * @param ctx the parse tree
	 */
	exitOrExpr?: (ctx: OrExprContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.andExpr`.
	 * @param ctx the parse tree
	 */
	enterAndExpr?: (ctx: AndExprContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.andExpr`.
	 * @param ctx the parse tree
	 */
	exitAndExpr?: (ctx: AndExprContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.atom`.
	 * @param ctx the parse tree
	 */
	enterAtom?: (ctx: AtomContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.atom`.
	 * @param ctx the parse tree
	 */
	exitAtom?: (ctx: AtomContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.identifier`.
	 * @param ctx the parse tree
	 */
	enterIdentifier?: (ctx: IdentifierContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.identifier`.
	 * @param ctx the parse tree
	 */
	exitIdentifier?: (ctx: IdentifierContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.stringLiteral`.
	 * @param ctx the parse tree
	 */
	enterStringLiteral?: (ctx: StringLiteralContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.stringLiteral`.
	 * @param ctx the parse tree
	 */
	exitStringLiteral?: (ctx: StringLiteralContext) => void;
}

