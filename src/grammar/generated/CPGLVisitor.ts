// Generated from src/grammar/CPGL.g4 by ANTLR 4.9.0-SNAPSHOT


import { ParseTreeVisitor } from "antlr4ts/tree/ParseTreeVisitor";

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
 * This interface defines a complete generic visitor for a parse tree produced
 * by `CPGLParser`.
 *
 * @param <Result> The return type of the visit operation. Use `void` for
 * operations with no return type.
 */
export interface CPGLVisitor<Result> extends ParseTreeVisitor<Result> {
	/**
	 * Visit a parse tree produced by `CPGLParser.cpgl`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCpgl?: (ctx: CpglContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.statement`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitStatement?: (ctx: StatementContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.decisionStatement`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitDecisionStatement?: (ctx: DecisionStatementContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.decisionBody`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitDecisionBody?: (ctx: DecisionBodyContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.whenBlock`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitWhenBlock?: (ctx: WhenBlockContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.anyOrAllClause`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitAnyOrAllClause?: (ctx: AnyOrAllClauseContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.blockBody`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitBlockBody?: (ctx: BlockBodyContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.singleActionStatement`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitSingleActionStatement?: (ctx: SingleActionStatementContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.blockStatement`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitBlockStatement?: (ctx: BlockStatementContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.actionStatement`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitActionStatement?: (ctx: ActionStatementContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.doStatement`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitDoStatement?: (ctx: DoStatementContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.useStatement`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitUseStatement?: (ctx: UseStatementContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.terminologyStatement`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitTerminologyStatement?: (ctx: TerminologyStatementContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.terminologyValueset`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitTerminologyValueset?: (ctx: TerminologyValuesetContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.terminologyUnknown`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitTerminologyUnknown?: (ctx: TerminologyUnknownContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.terminologySystemCode`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitTerminologySystemCode?: (ctx: TerminologySystemCodeContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.activityStatement`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitActivityStatement?: (ctx: ActivityStatementContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.conceptStatement`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitConceptStatement?: (ctx: ConceptStatementContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.conceptBody`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitConceptBody?: (ctx: ConceptBodyContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.hasTypeLine`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitHasTypeLine?: (ctx: HasTypeLineContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.hasValueTypeLine`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitHasValueTypeLine?: (ctx: HasValueTypeLineContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.provenanceLine`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitProvenanceLine?: (ctx: ProvenanceLineContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.codedByLine`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCodedByLine?: (ctx: CodedByLineContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.inferredByLine`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitInferredByLine?: (ctx: InferredByLineContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.inferredBody`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitInferredBody?: (ctx: InferredBodyContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.inferredByPattern`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitInferredByPattern?: (ctx: InferredByPatternContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.inferredByExpr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitInferredByExpr?: (ctx: InferredByExprContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitExpr?: (ctx: ExprContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.orExpr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitOrExpr?: (ctx: OrExprContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.andExpr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitAndExpr?: (ctx: AndExprContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.atom`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitAtom?: (ctx: AtomContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.identifier`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitIdentifier?: (ctx: IdentifierContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.stringLiteral`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitStringLiteral?: (ctx: StringLiteralContext) => Result;
}

