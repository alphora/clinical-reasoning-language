// Generated from src/grammar/CPGLParser.g4 by ANTLR 4.9.0-SNAPSHOT


import { ParseTreeVisitor } from "antlr4ts/tree/ParseTreeVisitor";

import { WhenWithBodyContext } from "./CPGLParser";
import { WhenSingleActionContext } from "./CPGLParser";
import { NestedWhenBlockContext } from "./CPGLParser";
import { BlockActionContext } from "./CPGLParser";
import { DefinitionConceptContext } from "./CPGLParser";
import { DefinitionLogicContext } from "./CPGLParser";
import { ConceptAtomContext } from "./CPGLParser";
import { GroupExpressionContext } from "./CPGLParser";
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
import { TerminologySystemCodeContext } from "./CPGLParser";
import { ActivityStatementContext } from "./CPGLParser";
import { ConceptStatementContext } from "./CPGLParser";
import { ConceptBodyContext } from "./CPGLParser";
import { TypeLineContext } from "./CPGLParser";
import { ValueTypeLineContext } from "./CPGLParser";
import { EvidenceLineContext } from "./CPGLParser";
import { CodedFromLineContext } from "./CPGLParser";
import { InferredFromLineContext } from "./CPGLParser";
import { InferredBodyContext } from "./CPGLParser";
import { InferredFromConceptReferenceContext } from "./CPGLParser";
import { PatternStatementContext } from "./CPGLParser";
import { InferredFromDescriptiveLogicContext } from "./CPGLParser";
import { InferredFromExpressionContext } from "./CPGLParser";
import { InformalOrContext } from "./CPGLParser";
import { InformalAndContext } from "./CPGLParser";
import { InformalNotContext } from "./CPGLParser";
import { AtomContext } from "./CPGLParser";
import { IdentifierContext } from "./CPGLParser";
import { DecisionIdentifierContext } from "./CPGLParser";
import { DecisionReferenceContext } from "./CPGLParser";
import { TerminologyIdentifierContext } from "./CPGLParser";
import { TerminologyReferenceContext } from "./CPGLParser";
import { ActivityIdentifierContext } from "./CPGLParser";
import { ActivityReferenceContext } from "./CPGLParser";
import { ConceptIdentifierContext } from "./CPGLParser";
import { ConceptReferenceContext } from "./CPGLParser";
import { BacktickStringContext } from "./CPGLParser";
import { PatternNameContext } from "./CPGLParser";
import { ActivityTypeValueContext } from "./CPGLParser";
import { RationaleContext } from "./CPGLParser";


/**
 * This interface defines a complete generic visitor for a parse tree produced
 * by `CPGLParser`.
 *
 * @param <Result> The return type of the visit operation. Use `void` for
 * operations with no return type.
 */
export interface CPGLParserVisitor<Result> extends ParseTreeVisitor<Result> {
	/**
	 * Visit a parse tree produced by the `WhenWithBody`
	 * labeled alternative in `CPGLParser.whenBlock`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitWhenWithBody?: (ctx: WhenWithBodyContext) => Result;

	/**
	 * Visit a parse tree produced by the `WhenSingleAction`
	 * labeled alternative in `CPGLParser.whenBlock`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitWhenSingleAction?: (ctx: WhenSingleActionContext) => Result;

	/**
	 * Visit a parse tree produced by the `NestedWhenBlock`
	 * labeled alternative in `CPGLParser.blockStatement`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitNestedWhenBlock?: (ctx: NestedWhenBlockContext) => Result;

	/**
	 * Visit a parse tree produced by the `BlockAction`
	 * labeled alternative in `CPGLParser.blockStatement`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitBlockAction?: (ctx: BlockActionContext) => Result;

	/**
	 * Visit a parse tree produced by the `DefinitionConcept`
	 * labeled alternative in `CPGLParser.inferredBody`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitDefinitionConcept?: (ctx: DefinitionConceptContext) => Result;

	/**
	 * Visit a parse tree produced by the `DefinitionLogic`
	 * labeled alternative in `CPGLParser.inferredBody`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitDefinitionLogic?: (ctx: DefinitionLogicContext) => Result;

	/**
	 * Visit a parse tree produced by the `ConceptAtom`
	 * labeled alternative in `CPGLParser.atom`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitConceptAtom?: (ctx: ConceptAtomContext) => Result;

	/**
	 * Visit a parse tree produced by the `GroupExpression`
	 * labeled alternative in `CPGLParser.atom`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitGroupExpression?: (ctx: GroupExpressionContext) => Result;

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
	 * Visit a parse tree produced by `CPGLParser.typeLine`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitTypeLine?: (ctx: TypeLineContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.valueTypeLine`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitValueTypeLine?: (ctx: ValueTypeLineContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.evidenceLine`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitEvidenceLine?: (ctx: EvidenceLineContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.codedFromLine`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCodedFromLine?: (ctx: CodedFromLineContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.inferredFromLine`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitInferredFromLine?: (ctx: InferredFromLineContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.inferredBody`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitInferredBody?: (ctx: InferredBodyContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.inferredFromConceptReference`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitInferredFromConceptReference?: (ctx: InferredFromConceptReferenceContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.patternStatement`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitPatternStatement?: (ctx: PatternStatementContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.inferredFromDescriptiveLogic`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitInferredFromDescriptiveLogic?: (ctx: InferredFromDescriptiveLogicContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.inferredFromExpression`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitInferredFromExpression?: (ctx: InferredFromExpressionContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.informalOr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitInformalOr?: (ctx: InformalOrContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.informalAnd`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitInformalAnd?: (ctx: InformalAndContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.informalNot`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitInformalNot?: (ctx: InformalNotContext) => Result;

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
	 * Visit a parse tree produced by `CPGLParser.decisionIdentifier`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitDecisionIdentifier?: (ctx: DecisionIdentifierContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.decisionReference`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitDecisionReference?: (ctx: DecisionReferenceContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.terminologyIdentifier`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitTerminologyIdentifier?: (ctx: TerminologyIdentifierContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.terminologyReference`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitTerminologyReference?: (ctx: TerminologyReferenceContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.activityIdentifier`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitActivityIdentifier?: (ctx: ActivityIdentifierContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.activityReference`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitActivityReference?: (ctx: ActivityReferenceContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.conceptIdentifier`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitConceptIdentifier?: (ctx: ConceptIdentifierContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.conceptReference`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitConceptReference?: (ctx: ConceptReferenceContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.backtickString`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitBacktickString?: (ctx: BacktickStringContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.patternName`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitPatternName?: (ctx: PatternNameContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.activityTypeValue`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitActivityTypeValue?: (ctx: ActivityTypeValueContext) => Result;

	/**
	 * Visit a parse tree produced by `CPGLParser.rationale`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitRationale?: (ctx: RationaleContext) => Result;
}

