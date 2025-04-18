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
    static readonly CONCEPT = 1;
    static readonly TYPE = 2;
    static readonly VALUETYPE = 3;
    static readonly TERMINOLOGY = 4;
    static readonly PROVENANCE = 5;
    static readonly INFERRED = 6;
    static readonly AND = 7;
    static readonly OR = 8;
    static readonly NOT = 9;
    static readonly DONE = 10;
    static readonly HAS = 11;
    static readonly BY = 12;
    static readonly CODED = 13;
    static readonly VALUESET = 14;
    static readonly PERFORM = 15;
    static readonly ACTIVITY = 16;
    static readonly OF = 17;
    static readonly SYSTEM = 18;
    static readonly CODE = 19;
    static readonly UNKNOWN = 20;
    static readonly DO = 21;
    static readonly USE = 22;
    static readonly WHEN = 23;
    static readonly THEN = 24;
    static readonly ANY = 25;
    static readonly ALL = 26;
    static readonly DECISION = 27;
    static readonly ERROR = 28;
    static readonly COLON = 29;
    static readonly DOT = 30;
    static readonly LPAREN = 31;
    static readonly RPAREN = 32;
    static readonly QUOTED_STRING = 33;
    static readonly STRING = 34;
    static readonly WS = 35;
    static readonly COMMENT = 36;
    static readonly COMMENT_BLOCK = 37;
    static readonly ACTIVITY_TYPE = 38;
    static readonly ACTIVITY_WS = 39;
    static readonly ACTIVITY_COMMENT_BLOCK = 40;
    static readonly ACTIVITY_ErrorChar = 41;
    static readonly CONCEPT_TYPE = 42;
    static readonly CONCEPT_WS = 43;
    static readonly CONCEPT_COMMENT_BLOCK = 44;
    static readonly CONCEPT_ErrorChar = 45;
    static readonly CONCEPT_VALUE_TYPE = 46;
    static readonly VALUE_TYPE_WS = 47;
    static readonly VALUE_TYPE_COMMENT_BLOCK = 48;
    static readonly VALUE_TYPE_ErrorChar = 49;
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
    static readonly RULE_terminologyUnknown = 14;
    static readonly RULE_terminologySystemCode = 15;
    static readonly RULE_activityStatement = 16;
    static readonly RULE_conceptStatement = 17;
    static readonly RULE_conceptBody = 18;
    static readonly RULE_hasTypeLine = 19;
    static readonly RULE_hasValueTypeLine = 20;
    static readonly RULE_provenanceLine = 21;
    static readonly RULE_codedByLine = 22;
    static readonly RULE_inferredByLine = 23;
    static readonly RULE_inferredBody = 24;
    static readonly RULE_inferredByConceptReference = 25;
    static readonly RULE_inferredByDescriptiveLogic = 26;
    static readonly RULE_inferredByExpression = 27;
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
    static readonly RULE_patternIdentifier = 41;
    static readonly RULE_patternReference = 42;
    static readonly RULE_stringLiteral = 43;
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
    terminologyUnknown(): TerminologyUnknownContext;
    terminologySystemCode(): TerminologySystemCodeContext;
    activityStatement(): ActivityStatementContext;
    conceptStatement(): ConceptStatementContext;
    conceptBody(): ConceptBodyContext;
    hasTypeLine(): HasTypeLineContext;
    hasValueTypeLine(): HasValueTypeLineContext;
    provenanceLine(): ProvenanceLineContext;
    codedByLine(): CodedByLineContext;
    inferredByLine(): InferredByLineContext;
    inferredBody(): InferredBodyContext;
    inferredByConceptReference(): InferredByConceptReferenceContext;
    inferredByDescriptiveLogic(): InferredByDescriptiveLogicContext;
    inferredByExpression(): InferredByExpressionContext;
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
    patternIdentifier(): PatternIdentifierContext;
    patternReference(): PatternReferenceContext;
    stringLiteral(): StringLiteralContext;
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
    terminologyUnknown(): TerminologyUnknownContext | undefined;
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
export declare class TerminologyUnknownContext extends ParserRuleContext {
    UNKNOWN(): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class TerminologySystemCodeContext extends ParserRuleContext {
    SYSTEM(): TerminalNode;
    identifier(): IdentifierContext[];
    identifier(i: number): IdentifierContext;
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
    OF(): TerminalNode | undefined;
    terminologyReference(): TerminologyReferenceContext | undefined;
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
    hasTypeLine(): HasTypeLineContext;
    hasValueTypeLine(): HasValueTypeLineContext;
    codedByLine(): CodedByLineContext | undefined;
    inferredByLine(): InferredByLineContext | undefined;
    provenanceLine(): ProvenanceLineContext | undefined;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class HasTypeLineContext extends ParserRuleContext {
    HAS(): TerminalNode;
    TYPE(): TerminalNode;
    CONCEPT_TYPE(): TerminalNode;
    DOT(): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class HasValueTypeLineContext extends ParserRuleContext {
    HAS(): TerminalNode;
    VALUETYPE(): TerminalNode;
    CONCEPT_VALUE_TYPE(): TerminalNode;
    DOT(): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class ProvenanceLineContext extends ParserRuleContext {
    HAS(): TerminalNode;
    PROVENANCE(): TerminalNode;
    stringLiteral(): StringLiteralContext;
    DOT(): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class CodedByLineContext extends ParserRuleContext {
    CODED(): TerminalNode;
    BY(): TerminalNode;
    terminologyReference(): TerminologyReferenceContext;
    DOT(): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class InferredByLineContext extends ParserRuleContext {
    INFERRED(): TerminalNode;
    BY(): TerminalNode;
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
    inferredByConceptReference(): InferredByConceptReferenceContext;
    constructor(ctx: InferredBodyContext);
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class DefinitionLogicContext extends InferredBodyContext {
    inferredByDescriptiveLogic(): InferredByDescriptiveLogicContext;
    constructor(ctx: InferredBodyContext);
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class InferredByConceptReferenceContext extends ParserRuleContext {
    conceptReference(): ConceptReferenceContext;
    patternReference(): PatternReferenceContext | undefined;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class InferredByDescriptiveLogicContext extends ParserRuleContext {
    LPAREN(): TerminalNode;
    inferredByExpression(): InferredByExpressionContext;
    RPAREN(): TerminalNode;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class InferredByExpressionContext extends ParserRuleContext {
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
    inferredByExpression(): InferredByExpressionContext;
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
    terminologyIdentifier(): TerminologyIdentifierContext;
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
export declare class PatternIdentifierContext extends ParserRuleContext {
    identifier(): IdentifierContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class PatternReferenceContext extends ParserRuleContext {
    patternIdentifier(): PatternIdentifierContext;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
export declare class StringLiteralContext extends ParserRuleContext {
    STRING(): TerminalNode | undefined;
    QUOTED_STRING(): TerminalNode | undefined;
    constructor(parent: ParserRuleContext | undefined, invokingState: number);
    get ruleIndex(): number;
    enterRule(listener: CPGLParserListener): void;
    exitRule(listener: CPGLParserListener): void;
    accept<Result>(visitor: CPGLParserVisitor<Result>): Result;
}
