import { ATN } from "antlr4ts/atn/ATN";
import { FailedPredicateException } from "antlr4ts/FailedPredicateException";
import { Parser } from "antlr4ts/Parser";
import { ParserRuleContext } from "antlr4ts/ParserRuleContext";
import { TerminalNode } from "antlr4ts/tree/TerminalNode";
import { TokenStream } from "antlr4ts/TokenStream";
import { Vocabulary } from "antlr4ts/Vocabulary";
import { CPGLParserListener } from "./CPGLParserListener";
import { CPGLParserVisitor } from "./CPGLParserVisitor";
export declare class CPGLParser extends Parser {
    static readonly ACTIVITY = 1;
    static readonly ALL = 2;
    static readonly AND = 3;
    static readonly ANY = 4;
    static readonly APPLY = 5;
    static readonly BECAUSE = 6;
    static readonly CODE = 7;
    static readonly CODED = 8;
    static readonly CONCEPT = 9;
    static readonly DECISION = 10;
    static readonly DONE = 11;
    static readonly DO = 12;
    static readonly EVIDENCE = 13;
    static readonly FROM = 14;
    static readonly INFERRED = 15;
    static readonly IS = 16;
    static readonly NOT = 17;
    static readonly OR = 18;
    static readonly PATTERN = 19;
    static readonly PERFORM = 20;
    static readonly SYSTEM = 21;
    static readonly TERMINOLOGY = 22;
    static readonly THEN = 23;
    static readonly TYPE = 24;
    static readonly USE = 25;
    static readonly VALUETYPE = 26;
    static readonly VALUESET = 27;
    static readonly WHEN = 28;
    static readonly WITH = 29;
    static readonly ERROR = 30;
    static readonly COLON = 31;
    static readonly DOT = 32;
    static readonly LPAREN = 33;
    static readonly RPAREN = 34;
    static readonly QUOTED_STRING = 35;
    static readonly BACKTICK_STRING = 36;
    static readonly WS = 37;
    static readonly COMMENT = 38;
    static readonly COMMENT_BLOCK = 39;
    static readonly ACTIVITY_TYPE = 40;
    static readonly ACTIVITY_WS = 41;
    static readonly ACTIVITY_COMMENT_BLOCK = 42;
    static readonly ACTIVITY_ErrorChar = 43;
    static readonly CONCEPT_TYPE = 44;
    static readonly CONCEPT_WS = 45;
    static readonly CONCEPT_COMMENT_BLOCK = 46;
    static readonly CONCEPT_ErrorChar = 47;
    static readonly CONCEPT_VALUE_TYPE = 48;
    static readonly VALUE_TYPE_WS = 49;
    static readonly VALUE_TYPE_COMMENT_BLOCK = 50;
    static readonly VALUE_TYPE_ErrorChar = 51;
    static readonly RULE_cpgl = 0;
    static readonly RULE_statement = 1;
    static readonly RULE_decisionStatement = 2;
    static readonly RULE_decisionBody = 3;
    static readonly RULE_whenBlock = 4;
    static readonly RULE_anyOrAllClause = 5;
    static readonly RULE_blockBody = 6;
    static readonly RULE_singleActionStatement = 7;
    static readonly RULE_blockStatement = 8;
    static readonly RULE_actionStatement = 9;
    static readonly RULE_doStatement = 10;
    static readonly RULE_useStatement = 11;
    static readonly RULE_terminologyStatement = 12;
    static readonly RULE_terminologyValueset = 13;
    static readonly RULE_terminologySystemCode = 14;
    static readonly RULE_activityStatement = 15;
    static readonly RULE_conceptStatement = 16;
    static readonly RULE_conceptBody = 17;
    static readonly RULE_typeLine = 18;
    static readonly RULE_valueTypeLine = 19;
    static readonly RULE_evidenceLine = 20;
    static readonly RULE_codedFromLine = 21;
    static readonly RULE_inferredFromLine = 22;
    static readonly RULE_inferredBody = 23;
    static readonly RULE_inferredFromConceptReference = 24;
    static readonly RULE_patternStatement = 25;
    static readonly RULE_inferredFromDescriptiveLogic = 26;
    static readonly RULE_inferredFromExpression = 27;
    static readonly RULE_informalOr = 28;
    static readonly RULE_informalAnd = 29;
    static readonly RULE_informalNot = 30;
    static readonly RULE_atom = 31;
    static readonly RULE_identifier = 32;
    static readonly RULE_decisionIdentifier = 33;
    static readonly RULE_decisionReference = 34;
    static readonly RULE_terminologyIdentifier = 35;
    static readonly RULE_terminologyReference = 36;
    static readonly RULE_activityIdentifier = 37;
    static readonly RULE_activityReference = 38;
    static readonly RULE_conceptIdentifier = 39;
    static readonly RULE_conceptReference = 40;
    static readonly RULE_backtickString = 41;
    static readonly RULE_patternName = 42;
    static readonly RULE_activityTypeValue = 43;
    static readonly RULE_rationale = 44;
    static readonly ruleNames: string[];
    private static readonly _LITERAL_NAMES;
    private static readonly _SYMBOLIC_NAMES;
    static readonly VOCABULARY: Vocabulary;
    get vocabulary(): Vocabulary;
    get grammarFileName(): string;
    get ruleNames(): string[];
    get serializedATN(): string;
    protected createFailedPredicateException(predicate?: string, message?: string): FailedPredicateException;
    constructor(input: TokenStream);
    cpgl(): CpglContext;
    statement(): StatementContext;
    decisionStatement(): DecisionStatementContext;
    decisionBody(): DecisionBodyContext;
    whenBlock(): WhenBlockContext;
    anyOrAllClause(): AnyOrAllClauseContext;
    blockBody(): BlockBodyContext;
    singleActionStatement(): SingleActionStatementContext;
    blockStatement(): BlockStatementContext;
    actionStatement(): ActionStatementContext;
    doStatement(): DoStatementContext;
    useStatement(): UseStatementContext;
    terminologyStatement(): TerminologyStatementContext;
    terminologyValueset(): TerminologyValuesetContext;
    terminologySystemCode(): TerminologySystemCodeContext;
    activityStatement(): ActivityStatementContext;
    conceptStatement(): ConceptStatementContext;
    conceptBody(): ConceptBodyContext;
    typeLine(): TypeLineContext;
    valueTypeLine(): ValueTypeLineContext;
    evidenceLine(): EvidenceLineContext;
    codedFromLine(): CodedFromLineContext;
    inferredFromLine(): InferredFromLineContext;
    inferredBody(): InferredBodyContext;
    inferredFromConceptReference(): InferredFromConceptReferenceContext;
    patternStatement(): PatternStatementContext;
    inferredFromDescriptiveLogic(): InferredFromDescriptiveLogicContext;
    inferredFromExpression(): InferredFromExpressionContext;
    informalOr(): InformalOrContext;
    informalAnd(): InformalAndContext;
    informalNot(): InformalNotContext;
    atom(): AtomContext;
    identifier(): IdentifierContext;
    decisionIdentifier(): DecisionIdentifierContext;
    decisionReference(): DecisionReferenceContext;
    terminologyIdentifier(): TerminologyIdentifierContext;
    terminologyReference(): TerminologyReferenceContext;
    activityIdentifier(): ActivityIdentifierContext;
    activityReference(): ActivityReferenceContext;
    conceptIdentifier(): ConceptIdentifierContext;
    conceptReference(): ConceptReferenceContext;
    backtickString(): BacktickStringContext;
    patternName(): PatternNameContext;
    activityTypeValue(): ActivityTypeValueContext;
    rationale(): RationaleContext;
    static readonly _serializedATN: string;
    static __ATN: ATN;
    static get _ATN(): ATN;
}
export declare class CpglContext extends ParserRuleContext {
    EOF(): TerminalNode;
    statement(): StatementContext[];
    statement(i: number): StatementContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class StatementContext extends ParserRuleContext {
    decisionStatement(): DecisionStatementContext | undefined;
    terminologyStatement(): TerminologyStatementContext | undefined;
    activityStatement(): ActivityStatementContext | undefined;
    conceptStatement(): ConceptStatementContext | undefined;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class DecisionStatementContext extends ParserRuleContext {
    DECISION(): TerminalNode;
    decisionIdentifier(): DecisionIdentifierContext;
    COLON(): TerminalNode;
    decisionBody(): DecisionBodyContext;
    DONE(): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class DecisionBodyContext extends ParserRuleContext {
    whenBlock(): WhenBlockContext[];
    whenBlock(i: number): WhenBlockContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class WhenBlockContext extends ParserRuleContext {
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    copyFrom(ctx: WhenBlockContext): void;
}
export declare class WhenWithBodyContext extends WhenBlockContext {
    WHEN(): TerminalNode;
    conceptReference(): ConceptReferenceContext;
    THEN(): TerminalNode;
    blockBody(): BlockBodyContext;
    constructor(ctx: WhenBlockContext);
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class WhenSingleActionContext extends WhenBlockContext {
    WHEN(): TerminalNode;
    conceptReference(): ConceptReferenceContext;
    THEN(): TerminalNode;
    singleActionStatement(): SingleActionStatementContext;
    constructor(ctx: WhenBlockContext);
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class AnyOrAllClauseContext extends ParserRuleContext {
    COLON(): TerminalNode;
    ANY(): TerminalNode | undefined;
    ALL(): TerminalNode | undefined;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class BlockBodyContext extends ParserRuleContext {
    COLON(): TerminalNode;
    DONE(): TerminalNode;
    anyOrAllClause(): AnyOrAllClauseContext | undefined;
    blockStatement(): BlockStatementContext[];
    blockStatement(i: number): BlockStatementContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class SingleActionStatementContext extends ParserRuleContext {
    DOT(): TerminalNode;
    doStatement(): DoStatementContext | undefined;
    useStatement(): UseStatementContext | undefined;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class BlockStatementContext extends ParserRuleContext {
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    copyFrom(ctx: BlockStatementContext): void;
}
export declare class NestedWhenBlockContext extends BlockStatementContext {
    whenBlock(): WhenBlockContext;
    constructor(ctx: BlockStatementContext);
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class BlockActionContext extends BlockStatementContext {
    actionStatement(): ActionStatementContext;
    constructor(ctx: BlockStatementContext);
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class ActionStatementContext extends ParserRuleContext {
    DOT(): TerminalNode;
    doStatement(): DoStatementContext | undefined;
    useStatement(): UseStatementContext | undefined;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class DoStatementContext extends ParserRuleContext {
    DO(): TerminalNode;
    activityReference(): ActivityReferenceContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class UseStatementContext extends ParserRuleContext {
    USE(): TerminalNode;
    decisionReference(): DecisionReferenceContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class TerminologyStatementContext extends ParserRuleContext {
    TERMINOLOGY(): TerminalNode;
    terminologyIdentifier(): TerminologyIdentifierContext;
    DOT(): TerminalNode;
    terminologyValueset(): TerminologyValuesetContext | undefined;
    backtickString(): BacktickStringContext | undefined;
    terminologySystemCode(): TerminologySystemCodeContext | undefined;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class TerminologyValuesetContext extends ParserRuleContext {
    VALUESET(): TerminalNode;
    identifier(): IdentifierContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class TerminologySystemCodeContext extends ParserRuleContext {
    SYSTEM(): TerminalNode;
    backtickString(): BacktickStringContext[];
    backtickString(i: number): BacktickStringContext;
    CODE(): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class ActivityStatementContext extends ParserRuleContext {
    ACTIVITY(): TerminalNode;
    activityIdentifier(): ActivityIdentifierContext;
    PERFORM(): TerminalNode;
    ACTIVITY_TYPE(): TerminalNode;
    DOT(): TerminalNode;
    WITH(): TerminalNode | undefined;
    BECAUSE(): TerminalNode | undefined;
    rationale(): RationaleContext | undefined;
    terminologyReference(): TerminologyReferenceContext | undefined;
    activityTypeValue(): ActivityTypeValueContext | undefined;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class ConceptStatementContext extends ParserRuleContext {
    CONCEPT(): TerminalNode;
    conceptIdentifier(): ConceptIdentifierContext;
    COLON(): TerminalNode;
    conceptBody(): ConceptBodyContext;
    DONE(): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class ConceptBodyContext extends ParserRuleContext {
    typeLine(): TypeLineContext;
    valueTypeLine(): ValueTypeLineContext;
    codedFromLine(): CodedFromLineContext | undefined;
    inferredFromLine(): InferredFromLineContext | undefined;
    evidenceLine(): EvidenceLineContext | undefined;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class TypeLineContext extends ParserRuleContext {
    TYPE(): TerminalNode;
    IS(): TerminalNode;
    CONCEPT_TYPE(): TerminalNode;
    DOT(): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class ValueTypeLineContext extends ParserRuleContext {
    VALUETYPE(): TerminalNode;
    IS(): TerminalNode;
    CONCEPT_VALUE_TYPE(): TerminalNode;
    DOT(): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class EvidenceLineContext extends ParserRuleContext {
    EVIDENCE(): TerminalNode;
    IS(): TerminalNode;
    backtickString(): BacktickStringContext;
    DOT(): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class CodedFromLineContext extends ParserRuleContext {
    CODED(): TerminalNode;
    FROM(): TerminalNode;
    terminologyReference(): TerminologyReferenceContext;
    DOT(): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class InferredFromLineContext extends ParserRuleContext {
    INFERRED(): TerminalNode;
    FROM(): TerminalNode;
    inferredBody(): InferredBodyContext;
    DOT(): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class InferredBodyContext extends ParserRuleContext {
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    copyFrom(ctx: InferredBodyContext): void;
}
export declare class DefinitionConceptContext extends InferredBodyContext {
    inferredFromConceptReference(): InferredFromConceptReferenceContext;
    constructor(ctx: InferredBodyContext);
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class DefinitionLogicContext extends InferredBodyContext {
    inferredFromDescriptiveLogic(): InferredFromDescriptiveLogicContext;
    constructor(ctx: InferredBodyContext);
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class InferredFromConceptReferenceContext extends ParserRuleContext {
    conceptReference(): ConceptReferenceContext;
    patternStatement(): PatternStatementContext | undefined;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class PatternStatementContext extends ParserRuleContext {
    APPLY(): TerminalNode;
    PATTERN(): TerminalNode;
    patternName(): PatternNameContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class InferredFromDescriptiveLogicContext extends ParserRuleContext {
    LPAREN(): TerminalNode;
    inferredFromExpression(): InferredFromExpressionContext;
    RPAREN(): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class InferredFromExpressionContext extends ParserRuleContext {
    informalOr(): InformalOrContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class InformalOrContext extends ParserRuleContext {
    informalAnd(): InformalAndContext[];
    informalAnd(i: number): InformalAndContext;
    OR(): TerminalNode[];
    OR(i: number): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class InformalAndContext extends ParserRuleContext {
    informalNot(): InformalNotContext[];
    informalNot(i: number): InformalNotContext;
    AND(): TerminalNode[];
    AND(i: number): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class InformalNotContext extends ParserRuleContext {
    NOT(): TerminalNode | undefined;
    informalNot(): InformalNotContext | undefined;
    atom(): AtomContext | undefined;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class AtomContext extends ParserRuleContext {
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    copyFrom(ctx: AtomContext): void;
}
export declare class ConceptAtomContext extends AtomContext {
    conceptReference(): ConceptReferenceContext;
    constructor(ctx: AtomContext);
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class GroupExpressionContext extends AtomContext {
    LPAREN(): TerminalNode;
    inferredFromExpression(): InferredFromExpressionContext;
    RPAREN(): TerminalNode;
    constructor(ctx: AtomContext);
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class IdentifierContext extends ParserRuleContext {
    QUOTED_STRING(): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class DecisionIdentifierContext extends ParserRuleContext {
    identifier(): IdentifierContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class DecisionReferenceContext extends ParserRuleContext {
    decisionIdentifier(): DecisionIdentifierContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class TerminologyIdentifierContext extends ParserRuleContext {
    identifier(): IdentifierContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class TerminologyReferenceContext extends ParserRuleContext {
    identifier(): IdentifierContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class ActivityIdentifierContext extends ParserRuleContext {
    identifier(): IdentifierContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class ActivityReferenceContext extends ParserRuleContext {
    activityIdentifier(): ActivityIdentifierContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class ConceptIdentifierContext extends ParserRuleContext {
    identifier(): IdentifierContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class ConceptReferenceContext extends ParserRuleContext {
    conceptIdentifier(): ConceptIdentifierContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class BacktickStringContext extends ParserRuleContext {
    BACKTICK_STRING(): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class PatternNameContext extends ParserRuleContext {
    backtickString(): BacktickStringContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class ActivityTypeValueContext extends ParserRuleContext {
    backtickString(): BacktickStringContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class RationaleContext extends ParserRuleContext {
    backtickString(): BacktickStringContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
