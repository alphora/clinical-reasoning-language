// Generated from src/grammar/CPGLParser.g4 by ANTLR 4.9.0-SNAPSHOT


import { ParseTreeListener } from "antlr4ts/tree/ParseTreeListener";

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
 * This interface defines a complete listener for a parse tree produced by
 * `CPGLParser`.
 */
export interface CPGLParserListener extends ParseTreeListener {
	/**
	 * Enter a parse tree produced by the `WhenWithBody`
	 * labeled alternative in `CPGLParser.whenBlock`.
	 * @param ctx the parse tree
	 */
	enterWhenWithBody?: (ctx: WhenWithBodyContext) => void;
	/**
	 * Exit a parse tree produced by the `WhenWithBody`
	 * labeled alternative in `CPGLParser.whenBlock`.
	 * @param ctx the parse tree
	 */
	exitWhenWithBody?: (ctx: WhenWithBodyContext) => void;

	/**
	 * Enter a parse tree produced by the `WhenSingleAction`
	 * labeled alternative in `CPGLParser.whenBlock`.
	 * @param ctx the parse tree
	 */
	enterWhenSingleAction?: (ctx: WhenSingleActionContext) => void;
	/**
	 * Exit a parse tree produced by the `WhenSingleAction`
	 * labeled alternative in `CPGLParser.whenBlock`.
	 * @param ctx the parse tree
	 */
	exitWhenSingleAction?: (ctx: WhenSingleActionContext) => void;

	/**
	 * Enter a parse tree produced by the `NestedWhenBlock`
	 * labeled alternative in `CPGLParser.blockStatement`.
	 * @param ctx the parse tree
	 */
	enterNestedWhenBlock?: (ctx: NestedWhenBlockContext) => void;
	/**
	 * Exit a parse tree produced by the `NestedWhenBlock`
	 * labeled alternative in `CPGLParser.blockStatement`.
	 * @param ctx the parse tree
	 */
	exitNestedWhenBlock?: (ctx: NestedWhenBlockContext) => void;

	/**
	 * Enter a parse tree produced by the `BlockAction`
	 * labeled alternative in `CPGLParser.blockStatement`.
	 * @param ctx the parse tree
	 */
	enterBlockAction?: (ctx: BlockActionContext) => void;
	/**
	 * Exit a parse tree produced by the `BlockAction`
	 * labeled alternative in `CPGLParser.blockStatement`.
	 * @param ctx the parse tree
	 */
	exitBlockAction?: (ctx: BlockActionContext) => void;

	/**
	 * Enter a parse tree produced by the `DefinitionConcept`
	 * labeled alternative in `CPGLParser.inferredBody`.
	 * @param ctx the parse tree
	 */
	enterDefinitionConcept?: (ctx: DefinitionConceptContext) => void;
	/**
	 * Exit a parse tree produced by the `DefinitionConcept`
	 * labeled alternative in `CPGLParser.inferredBody`.
	 * @param ctx the parse tree
	 */
	exitDefinitionConcept?: (ctx: DefinitionConceptContext) => void;

	/**
	 * Enter a parse tree produced by the `DefinitionLogic`
	 * labeled alternative in `CPGLParser.inferredBody`.
	 * @param ctx the parse tree
	 */
	enterDefinitionLogic?: (ctx: DefinitionLogicContext) => void;
	/**
	 * Exit a parse tree produced by the `DefinitionLogic`
	 * labeled alternative in `CPGLParser.inferredBody`.
	 * @param ctx the parse tree
	 */
	exitDefinitionLogic?: (ctx: DefinitionLogicContext) => void;

	/**
	 * Enter a parse tree produced by the `ConceptAtom`
	 * labeled alternative in `CPGLParser.atom`.
	 * @param ctx the parse tree
	 */
	enterConceptAtom?: (ctx: ConceptAtomContext) => void;
	/**
	 * Exit a parse tree produced by the `ConceptAtom`
	 * labeled alternative in `CPGLParser.atom`.
	 * @param ctx the parse tree
	 */
	exitConceptAtom?: (ctx: ConceptAtomContext) => void;

	/**
	 * Enter a parse tree produced by the `GroupExpression`
	 * labeled alternative in `CPGLParser.atom`.
	 * @param ctx the parse tree
	 */
	enterGroupExpression?: (ctx: GroupExpressionContext) => void;
	/**
	 * Exit a parse tree produced by the `GroupExpression`
	 * labeled alternative in `CPGLParser.atom`.
	 * @param ctx the parse tree
	 */
	exitGroupExpression?: (ctx: GroupExpressionContext) => void;

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
	 * Enter a parse tree produced by `CPGLParser.typeLine`.
	 * @param ctx the parse tree
	 */
	enterTypeLine?: (ctx: TypeLineContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.typeLine`.
	 * @param ctx the parse tree
	 */
	exitTypeLine?: (ctx: TypeLineContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.valueTypeLine`.
	 * @param ctx the parse tree
	 */
	enterValueTypeLine?: (ctx: ValueTypeLineContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.valueTypeLine`.
	 * @param ctx the parse tree
	 */
	exitValueTypeLine?: (ctx: ValueTypeLineContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.evidenceLine`.
	 * @param ctx the parse tree
	 */
	enterEvidenceLine?: (ctx: EvidenceLineContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.evidenceLine`.
	 * @param ctx the parse tree
	 */
	exitEvidenceLine?: (ctx: EvidenceLineContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.codedFromLine`.
	 * @param ctx the parse tree
	 */
	enterCodedFromLine?: (ctx: CodedFromLineContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.codedFromLine`.
	 * @param ctx the parse tree
	 */
	exitCodedFromLine?: (ctx: CodedFromLineContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.inferredFromLine`.
	 * @param ctx the parse tree
	 */
	enterInferredFromLine?: (ctx: InferredFromLineContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.inferredFromLine`.
	 * @param ctx the parse tree
	 */
	exitInferredFromLine?: (ctx: InferredFromLineContext) => void;

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
	 * Enter a parse tree produced by `CPGLParser.inferredFromConceptReference`.
	 * @param ctx the parse tree
	 */
	enterInferredFromConceptReference?: (ctx: InferredFromConceptReferenceContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.inferredFromConceptReference`.
	 * @param ctx the parse tree
	 */
	exitInferredFromConceptReference?: (ctx: InferredFromConceptReferenceContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.patternStatement`.
	 * @param ctx the parse tree
	 */
	enterPatternStatement?: (ctx: PatternStatementContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.patternStatement`.
	 * @param ctx the parse tree
	 */
	exitPatternStatement?: (ctx: PatternStatementContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.inferredFromDescriptiveLogic`.
	 * @param ctx the parse tree
	 */
	enterInferredFromDescriptiveLogic?: (ctx: InferredFromDescriptiveLogicContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.inferredFromDescriptiveLogic`.
	 * @param ctx the parse tree
	 */
	exitInferredFromDescriptiveLogic?: (ctx: InferredFromDescriptiveLogicContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.inferredFromExpression`.
	 * @param ctx the parse tree
	 */
	enterInferredFromExpression?: (ctx: InferredFromExpressionContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.inferredFromExpression`.
	 * @param ctx the parse tree
	 */
	exitInferredFromExpression?: (ctx: InferredFromExpressionContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.informalOr`.
	 * @param ctx the parse tree
	 */
	enterInformalOr?: (ctx: InformalOrContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.informalOr`.
	 * @param ctx the parse tree
	 */
	exitInformalOr?: (ctx: InformalOrContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.informalAnd`.
	 * @param ctx the parse tree
	 */
	enterInformalAnd?: (ctx: InformalAndContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.informalAnd`.
	 * @param ctx the parse tree
	 */
	exitInformalAnd?: (ctx: InformalAndContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.informalNot`.
	 * @param ctx the parse tree
	 */
	enterInformalNot?: (ctx: InformalNotContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.informalNot`.
	 * @param ctx the parse tree
	 */
	exitInformalNot?: (ctx: InformalNotContext) => void;

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
	 * Enter a parse tree produced by `CPGLParser.decisionIdentifier`.
	 * @param ctx the parse tree
	 */
	enterDecisionIdentifier?: (ctx: DecisionIdentifierContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.decisionIdentifier`.
	 * @param ctx the parse tree
	 */
	exitDecisionIdentifier?: (ctx: DecisionIdentifierContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.decisionReference`.
	 * @param ctx the parse tree
	 */
	enterDecisionReference?: (ctx: DecisionReferenceContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.decisionReference`.
	 * @param ctx the parse tree
	 */
	exitDecisionReference?: (ctx: DecisionReferenceContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.terminologyIdentifier`.
	 * @param ctx the parse tree
	 */
	enterTerminologyIdentifier?: (ctx: TerminologyIdentifierContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.terminologyIdentifier`.
	 * @param ctx the parse tree
	 */
	exitTerminologyIdentifier?: (ctx: TerminologyIdentifierContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.terminologyReference`.
	 * @param ctx the parse tree
	 */
	enterTerminologyReference?: (ctx: TerminologyReferenceContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.terminologyReference`.
	 * @param ctx the parse tree
	 */
	exitTerminologyReference?: (ctx: TerminologyReferenceContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.activityIdentifier`.
	 * @param ctx the parse tree
	 */
	enterActivityIdentifier?: (ctx: ActivityIdentifierContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.activityIdentifier`.
	 * @param ctx the parse tree
	 */
	exitActivityIdentifier?: (ctx: ActivityIdentifierContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.activityReference`.
	 * @param ctx the parse tree
	 */
	enterActivityReference?: (ctx: ActivityReferenceContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.activityReference`.
	 * @param ctx the parse tree
	 */
	exitActivityReference?: (ctx: ActivityReferenceContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.conceptIdentifier`.
	 * @param ctx the parse tree
	 */
	enterConceptIdentifier?: (ctx: ConceptIdentifierContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.conceptIdentifier`.
	 * @param ctx the parse tree
	 */
	exitConceptIdentifier?: (ctx: ConceptIdentifierContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.conceptReference`.
	 * @param ctx the parse tree
	 */
	enterConceptReference?: (ctx: ConceptReferenceContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.conceptReference`.
	 * @param ctx the parse tree
	 */
	exitConceptReference?: (ctx: ConceptReferenceContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.backtickString`.
	 * @param ctx the parse tree
	 */
	enterBacktickString?: (ctx: BacktickStringContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.backtickString`.
	 * @param ctx the parse tree
	 */
	exitBacktickString?: (ctx: BacktickStringContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.patternName`.
	 * @param ctx the parse tree
	 */
	enterPatternName?: (ctx: PatternNameContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.patternName`.
	 * @param ctx the parse tree
	 */
	exitPatternName?: (ctx: PatternNameContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.activityTypeValue`.
	 * @param ctx the parse tree
	 */
	enterActivityTypeValue?: (ctx: ActivityTypeValueContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.activityTypeValue`.
	 * @param ctx the parse tree
	 */
	exitActivityTypeValue?: (ctx: ActivityTypeValueContext) => void;

	/**
	 * Enter a parse tree produced by `CPGLParser.rationale`.
	 * @param ctx the parse tree
	 */
	enterRationale?: (ctx: RationaleContext) => void;
	/**
	 * Exit a parse tree produced by `CPGLParser.rationale`.
	 * @param ctx the parse tree
	 */
	exitRationale?: (ctx: RationaleContext) => void;
}

