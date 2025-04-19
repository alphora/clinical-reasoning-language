// Generated from src/grammar/CPGLParser.g4 by ANTLR 4.9.0-SNAPSHOT


import { ATN } from "antlr4ts/atn/ATN";
import { ATNDeserializer } from "antlr4ts/atn/ATNDeserializer";
import { FailedPredicateException } from "antlr4ts/FailedPredicateException";
import { NotNull } from "antlr4ts/Decorators";
import { NoViableAltException } from "antlr4ts/NoViableAltException";
import { Override } from "antlr4ts/Decorators";
import { Parser } from "antlr4ts/Parser";
import { ParserRuleContext } from "antlr4ts/ParserRuleContext";
import { ParserATNSimulator } from "antlr4ts/atn/ParserATNSimulator";
import { ParseTreeListener } from "antlr4ts/tree/ParseTreeListener";
import { ParseTreeVisitor } from "antlr4ts/tree/ParseTreeVisitor";
import { RecognitionException } from "antlr4ts/RecognitionException";
import { RuleContext } from "antlr4ts/RuleContext";
//import { RuleVersion } from "antlr4ts/RuleVersion";
import { TerminalNode } from "antlr4ts/tree/TerminalNode";
import { Token } from "antlr4ts/Token";
import { TokenStream } from "antlr4ts/TokenStream";
import { Vocabulary } from "antlr4ts/Vocabulary";
import { VocabularyImpl } from "antlr4ts/VocabularyImpl";

import * as Utils from "antlr4ts/misc/Utils";

import { CPGLParserListener } from "./CPGLParserListener";
import { CPGLParserVisitor } from "./CPGLParserVisitor";


export class CPGLParser extends Parser {
	public static readonly CONCEPT = 1;
	public static readonly TYPE = 2;
	public static readonly VALUETYPE = 3;
	public static readonly TERMINOLOGY = 4;
	public static readonly PROVENANCE = 5;
	public static readonly INFERRED = 6;
	public static readonly AND = 7;
	public static readonly OR = 8;
	public static readonly NOT = 9;
	public static readonly DONE = 10;
	public static readonly HAS = 11;
	public static readonly BY = 12;
	public static readonly CODED = 13;
	public static readonly VALUESET = 14;
	public static readonly PERFORM = 15;
	public static readonly ACTIVITY = 16;
	public static readonly OF = 17;
	public static readonly SYSTEM = 18;
	public static readonly CODE = 19;
	public static readonly UNKNOWN = 20;
	public static readonly DO = 21;
	public static readonly USE = 22;
	public static readonly WHEN = 23;
	public static readonly THEN = 24;
	public static readonly ANY = 25;
	public static readonly ALL = 26;
	public static readonly DECISION = 27;
	public static readonly ERROR = 28;
	public static readonly COLON = 29;
	public static readonly DOT = 30;
	public static readonly LPAREN = 31;
	public static readonly RPAREN = 32;
	public static readonly QUOTED_STRING = 33;
	public static readonly BACKTICK_STRING = 34;
	public static readonly WS = 35;
	public static readonly COMMENT = 36;
	public static readonly COMMENT_BLOCK = 37;
	public static readonly ACTIVITY_TYPE = 38;
	public static readonly ACTIVITY_WS = 39;
	public static readonly ACTIVITY_COMMENT_BLOCK = 40;
	public static readonly ACTIVITY_ErrorChar = 41;
	public static readonly CONCEPT_TYPE = 42;
	public static readonly CONCEPT_WS = 43;
	public static readonly CONCEPT_COMMENT_BLOCK = 44;
	public static readonly CONCEPT_ErrorChar = 45;
	public static readonly CONCEPT_VALUE_TYPE = 46;
	public static readonly VALUE_TYPE_WS = 47;
	public static readonly VALUE_TYPE_COMMENT_BLOCK = 48;
	public static readonly VALUE_TYPE_ErrorChar = 49;
	public static readonly RULE_cpgl = 0;
	public static readonly RULE_statement = 1;
	public static readonly RULE_decisionStatement = 2;
	public static readonly RULE_decisionBody = 3;
	public static readonly RULE_whenBlock = 4;
	public static readonly RULE_anyOrAllClause = 5;
	public static readonly RULE_blockBody = 6;
	public static readonly RULE_singleActionStatement = 7;
	public static readonly RULE_blockStatement = 8;
	public static readonly RULE_actionStatement = 9;
	public static readonly RULE_doStatement = 10;
	public static readonly RULE_useStatement = 11;
	public static readonly RULE_terminologyStatement = 12;
	public static readonly RULE_terminologyValueset = 13;
	public static readonly RULE_terminologySystemCode = 14;
	public static readonly RULE_activityStatement = 15;
	public static readonly RULE_conceptStatement = 16;
	public static readonly RULE_conceptBody = 17;
	public static readonly RULE_hasTypeLine = 18;
	public static readonly RULE_hasValueTypeLine = 19;
	public static readonly RULE_provenanceLine = 20;
	public static readonly RULE_codedByLine = 21;
	public static readonly RULE_inferredByLine = 22;
	public static readonly RULE_inferredBody = 23;
	public static readonly RULE_inferredByConceptReference = 24;
	public static readonly RULE_inferredByDescriptiveLogic = 25;
	public static readonly RULE_inferredByExpression = 26;
	public static readonly RULE_informalOr = 27;
	public static readonly RULE_informalAnd = 28;
	public static readonly RULE_informalNot = 29;
	public static readonly RULE_atom = 30;
	public static readonly RULE_identifier = 31;
	public static readonly RULE_decisionIdentifier = 32;
	public static readonly RULE_decisionReference = 33;
	public static readonly RULE_terminologyIdentifier = 34;
	public static readonly RULE_terminologyReference = 35;
	public static readonly RULE_activityIdentifier = 36;
	public static readonly RULE_activityReference = 37;
	public static readonly RULE_conceptIdentifier = 38;
	public static readonly RULE_conceptReference = 39;
	public static readonly RULE_patternIdentifier = 40;
	public static readonly RULE_patternReference = 41;
	public static readonly RULE_backtickString = 42;
	public static readonly RULE_activityTypeValue = 43;
	// tslint:disable:no-trailing-whitespace
	public static readonly ruleNames: string[] = [
		"cpgl", "statement", "decisionStatement", "decisionBody", "whenBlock", 
		"anyOrAllClause", "blockBody", "singleActionStatement", "blockStatement", 
		"actionStatement", "doStatement", "useStatement", "terminologyStatement", 
		"terminologyValueset", "terminologySystemCode", "activityStatement", "conceptStatement", 
		"conceptBody", "hasTypeLine", "hasValueTypeLine", "provenanceLine", "codedByLine", 
		"inferredByLine", "inferredBody", "inferredByConceptReference", "inferredByDescriptiveLogic", 
		"inferredByExpression", "informalOr", "informalAnd", "informalNot", "atom", 
		"identifier", "decisionIdentifier", "decisionReference", "terminologyIdentifier", 
		"terminologyReference", "activityIdentifier", "activityReference", "conceptIdentifier", 
		"conceptReference", "patternIdentifier", "patternReference", "backtickString", 
		"activityTypeValue",
	];

	private static readonly _LITERAL_NAMES: Array<string | undefined> = [
		undefined, "'concept'", "'type'", "'valuetype'", "'terminology'", "'provenance'", 
		"'inferred'", "'and'", "'or'", "'not'", "'done'", "'has'", "'by'", "'coded'", 
		"'valueset'", "'perform'", "'activity'", "'of'", "'system'", "'code'", 
		"'unknown'", "'do'", "'use'", "'when'", "'then'", "'any'", "'all'", "'decision'", 
		"'error'", "':'", "'.'", "'('", "')'",
	];
	private static readonly _SYMBOLIC_NAMES: Array<string | undefined> = [
		undefined, "CONCEPT", "TYPE", "VALUETYPE", "TERMINOLOGY", "PROVENANCE", 
		"INFERRED", "AND", "OR", "NOT", "DONE", "HAS", "BY", "CODED", "VALUESET", 
		"PERFORM", "ACTIVITY", "OF", "SYSTEM", "CODE", "UNKNOWN", "DO", "USE", 
		"WHEN", "THEN", "ANY", "ALL", "DECISION", "ERROR", "COLON", "DOT", "LPAREN", 
		"RPAREN", "QUOTED_STRING", "BACKTICK_STRING", "WS", "COMMENT", "COMMENT_BLOCK", 
		"ACTIVITY_TYPE", "ACTIVITY_WS", "ACTIVITY_COMMENT_BLOCK", "ACTIVITY_ErrorChar", 
		"CONCEPT_TYPE", "CONCEPT_WS", "CONCEPT_COMMENT_BLOCK", "CONCEPT_ErrorChar", 
		"CONCEPT_VALUE_TYPE", "VALUE_TYPE_WS", "VALUE_TYPE_COMMENT_BLOCK", "VALUE_TYPE_ErrorChar",
	];
	public static readonly VOCABULARY: Vocabulary = new VocabularyImpl(CPGLParser._LITERAL_NAMES, CPGLParser._SYMBOLIC_NAMES, []);

	// @Override
	// @NotNull
	public get vocabulary(): Vocabulary {
		return CPGLParser.VOCABULARY;
	}
	// tslint:enable:no-trailing-whitespace

	// @Override
	public get grammarFileName(): string { return "CPGLParser.g4"; }

	// @Override
	public get ruleNames(): string[] { return CPGLParser.ruleNames; }

	// @Override
	public get serializedATN(): string { return CPGLParser._serializedATN; }

	protected createFailedPredicateException(predicate?: string, message?: string): FailedPredicateException {
		return new FailedPredicateException(this, predicate, message);
	}

	constructor(input: TokenStream) {
		super(input);
		this._interp = new ParserATNSimulator(CPGLParser._ATN, this);
	}
	// @RuleVersion(0)
	public cpgl(): CpglContext {
		let _localctx: CpglContext = new CpglContext(this._ctx, this.state);
		this.enterRule(_localctx, 0, CPGLParser.RULE_cpgl);
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 91;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input, 0, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					{
					{
					this.state = 88;
					this.statement();
					}
					}
				}
				this.state = 93;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 0, this._ctx);
			}
			this.state = 94;
			this.match(CPGLParser.EOF);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public statement(): StatementContext {
		let _localctx: StatementContext = new StatementContext(this._ctx, this.state);
		this.enterRule(_localctx, 2, CPGLParser.RULE_statement);
		try {
			this.state = 100;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 1, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 96;
				this.decisionStatement();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 97;
				this.terminologyStatement();
				}
				break;

			case 3:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 98;
				this.activityStatement();
				}
				break;

			case 4:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 99;
				this.conceptStatement();
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public decisionStatement(): DecisionStatementContext {
		let _localctx: DecisionStatementContext = new DecisionStatementContext(this._ctx, this.state);
		this.enterRule(_localctx, 4, CPGLParser.RULE_decisionStatement);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 102;
			this.match(CPGLParser.DECISION);
			this.state = 103;
			this.decisionIdentifier();
			this.state = 104;
			this.match(CPGLParser.COLON);
			this.state = 105;
			this.decisionBody();
			this.state = 106;
			this.match(CPGLParser.DONE);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public decisionBody(): DecisionBodyContext {
		let _localctx: DecisionBodyContext = new DecisionBodyContext(this._ctx, this.state);
		this.enterRule(_localctx, 6, CPGLParser.RULE_decisionBody);
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 109;
			this._errHandler.sync(this);
			_alt = 1;
			do {
				switch (_alt) {
				case 1:
					{
					{
					this.state = 108;
					this.whenBlock();
					}
					}
					break;
				default:
					throw new NoViableAltException(this);
				}
				this.state = 111;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 2, this._ctx);
			} while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public whenBlock(): WhenBlockContext {
		let _localctx: WhenBlockContext = new WhenBlockContext(this._ctx, this.state);
		this.enterRule(_localctx, 8, CPGLParser.RULE_whenBlock);
		try {
			this.state = 123;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 3, this._ctx) ) {
			case 1:
				_localctx = new WhenWithBodyContext(_localctx);
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 113;
				this.match(CPGLParser.WHEN);
				this.state = 114;
				this.conceptReference();
				this.state = 115;
				this.match(CPGLParser.THEN);
				this.state = 116;
				this.blockBody();
				}
				break;

			case 2:
				_localctx = new WhenSingleActionContext(_localctx);
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 118;
				this.match(CPGLParser.WHEN);
				this.state = 119;
				this.conceptReference();
				this.state = 120;
				this.match(CPGLParser.THEN);
				this.state = 121;
				this.singleActionStatement();
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public anyOrAllClause(): AnyOrAllClauseContext {
		let _localctx: AnyOrAllClauseContext = new AnyOrAllClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 10, CPGLParser.RULE_anyOrAllClause);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 125;
			_la = this._input.LA(1);
			if (!(_la === CPGLParser.ANY || _la === CPGLParser.ALL)) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			this.state = 126;
			this.match(CPGLParser.COLON);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public blockBody(): BlockBodyContext {
		let _localctx: BlockBodyContext = new BlockBodyContext(this._ctx, this.state);
		this.enterRule(_localctx, 12, CPGLParser.RULE_blockBody);
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 128;
			this.match(CPGLParser.COLON);
			{
			this.state = 130;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 4, this._ctx) ) {
			case 1:
				{
				this.state = 129;
				this.anyOrAllClause();
				}
				break;
			}
			this.state = 133;
			this._errHandler.sync(this);
			_alt = 1;
			do {
				switch (_alt) {
				case 1:
					{
					{
					this.state = 132;
					this.blockStatement();
					}
					}
					break;
				default:
					throw new NoViableAltException(this);
				}
				this.state = 135;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 5, this._ctx);
			} while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER);
			}
			this.state = 137;
			this.match(CPGLParser.DONE);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public singleActionStatement(): SingleActionStatementContext {
		let _localctx: SingleActionStatementContext = new SingleActionStatementContext(this._ctx, this.state);
		this.enterRule(_localctx, 14, CPGLParser.RULE_singleActionStatement);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 141;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 6, this._ctx) ) {
			case 1:
				{
				this.state = 139;
				this.doStatement();
				}
				break;

			case 2:
				{
				this.state = 140;
				this.useStatement();
				}
				break;
			}
			this.state = 143;
			this.match(CPGLParser.DOT);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public blockStatement(): BlockStatementContext {
		let _localctx: BlockStatementContext = new BlockStatementContext(this._ctx, this.state);
		this.enterRule(_localctx, 16, CPGLParser.RULE_blockStatement);
		try {
			this.state = 147;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 7, this._ctx) ) {
			case 1:
				_localctx = new NestedWhenBlockContext(_localctx);
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 145;
				this.whenBlock();
				}
				break;

			case 2:
				_localctx = new BlockActionContext(_localctx);
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 146;
				this.actionStatement();
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public actionStatement(): ActionStatementContext {
		let _localctx: ActionStatementContext = new ActionStatementContext(this._ctx, this.state);
		this.enterRule(_localctx, 18, CPGLParser.RULE_actionStatement);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 151;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 8, this._ctx) ) {
			case 1:
				{
				this.state = 149;
				this.doStatement();
				}
				break;

			case 2:
				{
				this.state = 150;
				this.useStatement();
				}
				break;
			}
			this.state = 153;
			this.match(CPGLParser.DOT);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public doStatement(): DoStatementContext {
		let _localctx: DoStatementContext = new DoStatementContext(this._ctx, this.state);
		this.enterRule(_localctx, 20, CPGLParser.RULE_doStatement);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 155;
			this.match(CPGLParser.DO);
			this.state = 156;
			this.activityReference();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public useStatement(): UseStatementContext {
		let _localctx: UseStatementContext = new UseStatementContext(this._ctx, this.state);
		this.enterRule(_localctx, 22, CPGLParser.RULE_useStatement);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 158;
			this.match(CPGLParser.USE);
			this.state = 159;
			this.decisionReference();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public terminologyStatement(): TerminologyStatementContext {
		let _localctx: TerminologyStatementContext = new TerminologyStatementContext(this._ctx, this.state);
		this.enterRule(_localctx, 24, CPGLParser.RULE_terminologyStatement);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 161;
			this.match(CPGLParser.TERMINOLOGY);
			this.state = 162;
			this.terminologyIdentifier();
			this.state = 166;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 9, this._ctx) ) {
			case 1:
				{
				this.state = 163;
				this.terminologyValueset();
				}
				break;

			case 2:
				{
				this.state = 164;
				this.backtickString();
				}
				break;

			case 3:
				{
				this.state = 165;
				this.terminologySystemCode();
				}
				break;
			}
			this.state = 168;
			this.match(CPGLParser.DOT);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public terminologyValueset(): TerminologyValuesetContext {
		let _localctx: TerminologyValuesetContext = new TerminologyValuesetContext(this._ctx, this.state);
		this.enterRule(_localctx, 26, CPGLParser.RULE_terminologyValueset);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 170;
			this.match(CPGLParser.VALUESET);
			this.state = 171;
			this.identifier();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public terminologySystemCode(): TerminologySystemCodeContext {
		let _localctx: TerminologySystemCodeContext = new TerminologySystemCodeContext(this._ctx, this.state);
		this.enterRule(_localctx, 28, CPGLParser.RULE_terminologySystemCode);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 173;
			this.match(CPGLParser.SYSTEM);
			this.state = 174;
			this.backtickString();
			this.state = 175;
			this.match(CPGLParser.CODE);
			this.state = 176;
			this.backtickString();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public activityStatement(): ActivityStatementContext {
		let _localctx: ActivityStatementContext = new ActivityStatementContext(this._ctx, this.state);
		this.enterRule(_localctx, 30, CPGLParser.RULE_activityStatement);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 178;
			this.match(CPGLParser.ACTIVITY);
			this.state = 179;
			this.activityIdentifier();
			this.state = 180;
			this.match(CPGLParser.PERFORM);
			this.state = 181;
			this.match(CPGLParser.ACTIVITY_TYPE);
			this.state = 187;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 11, this._ctx) ) {
			case 1:
				{
				this.state = 182;
				this.match(CPGLParser.OF);
				this.state = 185;
				this._errHandler.sync(this);
				switch ( this.interpreter.adaptivePredict(this._input, 10, this._ctx) ) {
				case 1:
					{
					this.state = 183;
					this.terminologyReference();
					}
					break;

				case 2:
					{
					this.state = 184;
					this.activityTypeValue();
					}
					break;
				}
				}
				break;
			}
			this.state = 189;
			this.match(CPGLParser.DOT);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public conceptStatement(): ConceptStatementContext {
		let _localctx: ConceptStatementContext = new ConceptStatementContext(this._ctx, this.state);
		this.enterRule(_localctx, 32, CPGLParser.RULE_conceptStatement);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 191;
			this.match(CPGLParser.CONCEPT);
			this.state = 192;
			this.conceptIdentifier();
			this.state = 193;
			this.match(CPGLParser.COLON);
			this.state = 194;
			this.conceptBody();
			this.state = 195;
			this.match(CPGLParser.DONE);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public conceptBody(): ConceptBodyContext {
		let _localctx: ConceptBodyContext = new ConceptBodyContext(this._ctx, this.state);
		this.enterRule(_localctx, 34, CPGLParser.RULE_conceptBody);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 197;
			this.hasTypeLine();
			this.state = 198;
			this.hasValueTypeLine();
			this.state = 200;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 12, this._ctx) ) {
			case 1:
				{
				this.state = 199;
				this.provenanceLine();
				}
				break;
			}
			this.state = 204;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 13, this._ctx) ) {
			case 1:
				{
				this.state = 202;
				this.codedByLine();
				}
				break;

			case 2:
				{
				this.state = 203;
				this.inferredByLine();
				}
				break;
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public hasTypeLine(): HasTypeLineContext {
		let _localctx: HasTypeLineContext = new HasTypeLineContext(this._ctx, this.state);
		this.enterRule(_localctx, 36, CPGLParser.RULE_hasTypeLine);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 206;
			this.match(CPGLParser.HAS);
			this.state = 207;
			this.match(CPGLParser.TYPE);
			this.state = 208;
			this.match(CPGLParser.CONCEPT_TYPE);
			this.state = 209;
			this.match(CPGLParser.DOT);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public hasValueTypeLine(): HasValueTypeLineContext {
		let _localctx: HasValueTypeLineContext = new HasValueTypeLineContext(this._ctx, this.state);
		this.enterRule(_localctx, 38, CPGLParser.RULE_hasValueTypeLine);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 211;
			this.match(CPGLParser.HAS);
			this.state = 212;
			this.match(CPGLParser.VALUETYPE);
			this.state = 213;
			this.match(CPGLParser.CONCEPT_VALUE_TYPE);
			this.state = 214;
			this.match(CPGLParser.DOT);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public provenanceLine(): ProvenanceLineContext {
		let _localctx: ProvenanceLineContext = new ProvenanceLineContext(this._ctx, this.state);
		this.enterRule(_localctx, 40, CPGLParser.RULE_provenanceLine);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 216;
			this.match(CPGLParser.HAS);
			this.state = 217;
			this.match(CPGLParser.PROVENANCE);
			this.state = 218;
			this.backtickString();
			this.state = 219;
			this.match(CPGLParser.DOT);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public codedByLine(): CodedByLineContext {
		let _localctx: CodedByLineContext = new CodedByLineContext(this._ctx, this.state);
		this.enterRule(_localctx, 42, CPGLParser.RULE_codedByLine);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 221;
			this.match(CPGLParser.CODED);
			this.state = 222;
			this.match(CPGLParser.BY);
			this.state = 223;
			this.terminologyReference();
			this.state = 224;
			this.match(CPGLParser.DOT);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public inferredByLine(): InferredByLineContext {
		let _localctx: InferredByLineContext = new InferredByLineContext(this._ctx, this.state);
		this.enterRule(_localctx, 44, CPGLParser.RULE_inferredByLine);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 226;
			this.match(CPGLParser.INFERRED);
			this.state = 227;
			this.match(CPGLParser.BY);
			this.state = 228;
			this.inferredBody();
			this.state = 229;
			this.match(CPGLParser.DOT);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public inferredBody(): InferredBodyContext {
		let _localctx: InferredBodyContext = new InferredBodyContext(this._ctx, this.state);
		this.enterRule(_localctx, 46, CPGLParser.RULE_inferredBody);
		try {
			this.state = 233;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 14, this._ctx) ) {
			case 1:
				_localctx = new DefinitionConceptContext(_localctx);
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 231;
				this.inferredByConceptReference();
				}
				break;

			case 2:
				_localctx = new DefinitionLogicContext(_localctx);
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 232;
				this.inferredByDescriptiveLogic();
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public inferredByConceptReference(): InferredByConceptReferenceContext {
		let _localctx: InferredByConceptReferenceContext = new InferredByConceptReferenceContext(this._ctx, this.state);
		this.enterRule(_localctx, 48, CPGLParser.RULE_inferredByConceptReference);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 236;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 15, this._ctx) ) {
			case 1:
				{
				this.state = 235;
				this.patternReference();
				}
				break;
			}
			this.state = 238;
			this.conceptReference();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public inferredByDescriptiveLogic(): InferredByDescriptiveLogicContext {
		let _localctx: InferredByDescriptiveLogicContext = new InferredByDescriptiveLogicContext(this._ctx, this.state);
		this.enterRule(_localctx, 50, CPGLParser.RULE_inferredByDescriptiveLogic);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 240;
			this.match(CPGLParser.LPAREN);
			this.state = 241;
			this.inferredByExpression();
			this.state = 242;
			this.match(CPGLParser.RPAREN);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public inferredByExpression(): InferredByExpressionContext {
		let _localctx: InferredByExpressionContext = new InferredByExpressionContext(this._ctx, this.state);
		this.enterRule(_localctx, 52, CPGLParser.RULE_inferredByExpression);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 244;
			this.informalOr();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public informalOr(): InformalOrContext {
		let _localctx: InformalOrContext = new InformalOrContext(this._ctx, this.state);
		this.enterRule(_localctx, 54, CPGLParser.RULE_informalOr);
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 246;
			this.informalAnd();
			this.state = 251;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input, 16, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					{
					{
					this.state = 247;
					this.match(CPGLParser.OR);
					this.state = 248;
					this.informalAnd();
					}
					}
				}
				this.state = 253;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 16, this._ctx);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public informalAnd(): InformalAndContext {
		let _localctx: InformalAndContext = new InformalAndContext(this._ctx, this.state);
		this.enterRule(_localctx, 56, CPGLParser.RULE_informalAnd);
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 254;
			this.informalNot();
			this.state = 259;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input, 17, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					{
					{
					this.state = 255;
					this.match(CPGLParser.AND);
					this.state = 256;
					this.informalNot();
					}
					}
				}
				this.state = 261;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 17, this._ctx);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public informalNot(): InformalNotContext {
		let _localctx: InformalNotContext = new InformalNotContext(this._ctx, this.state);
		this.enterRule(_localctx, 58, CPGLParser.RULE_informalNot);
		try {
			this.state = 265;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 18, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 262;
				this.match(CPGLParser.NOT);
				this.state = 263;
				this.informalNot();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 264;
				this.atom();
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public atom(): AtomContext {
		let _localctx: AtomContext = new AtomContext(this._ctx, this.state);
		this.enterRule(_localctx, 60, CPGLParser.RULE_atom);
		try {
			this.state = 272;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 19, this._ctx) ) {
			case 1:
				_localctx = new ConceptAtomContext(_localctx);
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 267;
				this.conceptReference();
				}
				break;

			case 2:
				_localctx = new GroupExpressionContext(_localctx);
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 268;
				this.match(CPGLParser.LPAREN);
				this.state = 269;
				this.inferredByExpression();
				this.state = 270;
				this.match(CPGLParser.RPAREN);
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public identifier(): IdentifierContext {
		let _localctx: IdentifierContext = new IdentifierContext(this._ctx, this.state);
		this.enterRule(_localctx, 62, CPGLParser.RULE_identifier);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 274;
			this.match(CPGLParser.QUOTED_STRING);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public decisionIdentifier(): DecisionIdentifierContext {
		let _localctx: DecisionIdentifierContext = new DecisionIdentifierContext(this._ctx, this.state);
		this.enterRule(_localctx, 64, CPGLParser.RULE_decisionIdentifier);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 276;
			this.identifier();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public decisionReference(): DecisionReferenceContext {
		let _localctx: DecisionReferenceContext = new DecisionReferenceContext(this._ctx, this.state);
		this.enterRule(_localctx, 66, CPGLParser.RULE_decisionReference);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 278;
			this.decisionIdentifier();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public terminologyIdentifier(): TerminologyIdentifierContext {
		let _localctx: TerminologyIdentifierContext = new TerminologyIdentifierContext(this._ctx, this.state);
		this.enterRule(_localctx, 68, CPGLParser.RULE_terminologyIdentifier);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 280;
			this.identifier();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public terminologyReference(): TerminologyReferenceContext {
		let _localctx: TerminologyReferenceContext = new TerminologyReferenceContext(this._ctx, this.state);
		this.enterRule(_localctx, 70, CPGLParser.RULE_terminologyReference);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 282;
			this.identifier();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public activityIdentifier(): ActivityIdentifierContext {
		let _localctx: ActivityIdentifierContext = new ActivityIdentifierContext(this._ctx, this.state);
		this.enterRule(_localctx, 72, CPGLParser.RULE_activityIdentifier);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 284;
			this.identifier();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public activityReference(): ActivityReferenceContext {
		let _localctx: ActivityReferenceContext = new ActivityReferenceContext(this._ctx, this.state);
		this.enterRule(_localctx, 74, CPGLParser.RULE_activityReference);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 286;
			this.activityIdentifier();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public conceptIdentifier(): ConceptIdentifierContext {
		let _localctx: ConceptIdentifierContext = new ConceptIdentifierContext(this._ctx, this.state);
		this.enterRule(_localctx, 76, CPGLParser.RULE_conceptIdentifier);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 288;
			this.identifier();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public conceptReference(): ConceptReferenceContext {
		let _localctx: ConceptReferenceContext = new ConceptReferenceContext(this._ctx, this.state);
		this.enterRule(_localctx, 78, CPGLParser.RULE_conceptReference);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 290;
			this.conceptIdentifier();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public patternIdentifier(): PatternIdentifierContext {
		let _localctx: PatternIdentifierContext = new PatternIdentifierContext(this._ctx, this.state);
		this.enterRule(_localctx, 80, CPGLParser.RULE_patternIdentifier);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 292;
			this.identifier();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public patternReference(): PatternReferenceContext {
		let _localctx: PatternReferenceContext = new PatternReferenceContext(this._ctx, this.state);
		this.enterRule(_localctx, 82, CPGLParser.RULE_patternReference);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 294;
			this.patternIdentifier();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public backtickString(): BacktickStringContext {
		let _localctx: BacktickStringContext = new BacktickStringContext(this._ctx, this.state);
		this.enterRule(_localctx, 84, CPGLParser.RULE_backtickString);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 296;
			this.match(CPGLParser.BACKTICK_STRING);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public activityTypeValue(): ActivityTypeValueContext {
		let _localctx: ActivityTypeValueContext = new ActivityTypeValueContext(this._ctx, this.state);
		this.enterRule(_localctx, 86, CPGLParser.RULE_activityTypeValue);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 298;
			this.backtickString();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}

	public static readonly _serializedATN: string =
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x033\u012F\x04\x02" +
		"\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04\x07" +
		"\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r\x04" +
		"\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11\t\x11\x04\x12\t\x12\x04" +
		"\x13\t\x13\x04\x14\t\x14\x04\x15\t\x15\x04\x16\t\x16\x04\x17\t\x17\x04" +
		"\x18\t\x18\x04\x19\t\x19\x04\x1A\t\x1A\x04\x1B\t\x1B\x04\x1C\t\x1C\x04" +
		"\x1D\t\x1D\x04\x1E\t\x1E\x04\x1F\t\x1F\x04 \t \x04!\t!\x04\"\t\"\x04#" +
		"\t#\x04$\t$\x04%\t%\x04&\t&\x04\'\t\'\x04(\t(\x04)\t)\x04*\t*\x04+\t+" +
		"\x04,\t,\x04-\t-\x03\x02\x07\x02\\\n\x02\f\x02\x0E\x02_\v\x02\x03\x02" +
		"\x03\x02\x03\x03\x03\x03\x03\x03\x03\x03\x05\x03g\n\x03\x03\x04\x03\x04" +
		"\x03\x04\x03\x04\x03\x04\x03\x04\x03\x05\x06\x05p\n\x05\r\x05\x0E\x05" +
		"q\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03" +
		"\x06\x03\x06\x05\x06~\n\x06\x03\x07\x03\x07\x03\x07\x03\b\x03\b\x05\b" +
		"\x85\n\b\x03\b\x06\b\x88\n\b\r\b\x0E\b\x89\x03\b\x03\b\x03\t\x03\t\x05" +
		"\t\x90\n\t\x03\t\x03\t\x03\n\x03\n\x05\n\x96\n\n\x03\v\x03\v\x05\v\x9A" +
		"\n\v\x03\v\x03\v\x03\f\x03\f\x03\f\x03\r\x03\r\x03\r\x03\x0E\x03\x0E\x03" +
		"\x0E\x03\x0E\x03\x0E\x05\x0E\xA9\n\x0E\x03\x0E\x03\x0E\x03\x0F\x03\x0F" +
		"\x03\x0F\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x11\x03\x11\x03\x11" +
		"\x03\x11\x03\x11\x03\x11\x03\x11\x05\x11\xBC\n\x11\x05\x11\xBE\n\x11\x03" +
		"\x11\x03\x11\x03\x12\x03\x12\x03\x12\x03\x12\x03\x12\x03\x12\x03\x13\x03" +
		"\x13\x03\x13\x05\x13\xCB\n\x13\x03\x13\x03\x13\x05\x13\xCF\n\x13\x03\x14" +
		"\x03\x14\x03\x14\x03\x14\x03\x14\x03\x15\x03\x15\x03\x15\x03\x15\x03\x15" +
		"\x03\x16\x03\x16\x03\x16\x03\x16\x03\x16\x03\x17\x03\x17\x03\x17\x03\x17" +
		"\x03\x17\x03\x18\x03\x18\x03\x18\x03\x18\x03\x18\x03\x19\x03\x19\x05\x19" +
		"\xEC\n\x19\x03\x1A\x05\x1A\xEF\n\x1A\x03\x1A\x03\x1A\x03\x1B\x03\x1B\x03" +
		"\x1B\x03\x1B\x03\x1C\x03\x1C\x03\x1D\x03\x1D\x03\x1D\x07\x1D\xFC\n\x1D" +
		"\f\x1D\x0E\x1D\xFF\v\x1D\x03\x1E\x03\x1E\x03\x1E\x07\x1E\u0104\n\x1E\f" +
		"\x1E\x0E\x1E\u0107\v\x1E\x03\x1F\x03\x1F\x03\x1F\x05\x1F\u010C\n\x1F\x03" +
		" \x03 \x03 \x03 \x03 \x05 \u0113\n \x03!\x03!\x03\"\x03\"\x03#\x03#\x03" +
		"$\x03$\x03%\x03%\x03&\x03&\x03\'\x03\'\x03(\x03(\x03)\x03)\x03*\x03*\x03" +
		"+\x03+\x03,\x03,\x03-\x03-\x03-\x02\x02\x02.\x02\x02\x04\x02\x06\x02\b" +
		"\x02\n\x02\f\x02\x0E\x02\x10\x02\x12\x02\x14\x02\x16\x02\x18\x02\x1A\x02" +
		"\x1C\x02\x1E\x02 \x02\"\x02$\x02&\x02(\x02*\x02,\x02.\x020\x022\x024\x02" +
		"6\x028\x02:\x02<\x02>\x02@\x02B\x02D\x02F\x02H\x02J\x02L\x02N\x02P\x02" +
		"R\x02T\x02V\x02X\x02\x02\x03\x03\x02\x1B\x1C\x02\u0119\x02]\x03\x02\x02" +
		"\x02\x04f\x03\x02\x02\x02\x06h\x03\x02\x02\x02\bo\x03\x02\x02\x02\n}\x03" +
		"\x02\x02\x02\f\x7F\x03\x02\x02\x02\x0E\x82\x03\x02\x02\x02\x10\x8F\x03" +
		"\x02\x02\x02\x12\x95\x03\x02\x02\x02\x14\x99\x03\x02\x02\x02\x16\x9D\x03" +
		"\x02\x02\x02\x18\xA0\x03\x02\x02\x02\x1A\xA3\x03\x02\x02\x02\x1C\xAC\x03" +
		"\x02\x02\x02\x1E\xAF\x03\x02\x02\x02 \xB4\x03\x02\x02\x02\"\xC1\x03\x02" +
		"\x02\x02$\xC7\x03\x02\x02\x02&\xD0\x03\x02\x02\x02(\xD5\x03\x02\x02\x02" +
		"*\xDA\x03\x02\x02\x02,\xDF\x03\x02\x02\x02.\xE4\x03\x02\x02\x020\xEB\x03" +
		"\x02\x02\x022\xEE\x03\x02\x02\x024\xF2\x03\x02\x02\x026\xF6\x03\x02\x02" +
		"\x028\xF8\x03\x02\x02\x02:\u0100\x03\x02\x02\x02<\u010B\x03\x02\x02\x02" +
		">\u0112\x03\x02\x02\x02@\u0114\x03\x02\x02\x02B\u0116\x03\x02\x02\x02" +
		"D\u0118\x03\x02\x02\x02F\u011A\x03\x02\x02\x02H\u011C\x03\x02\x02\x02" +
		"J\u011E\x03\x02\x02\x02L\u0120\x03\x02\x02\x02N\u0122\x03\x02\x02\x02" +
		"P\u0124\x03\x02\x02\x02R\u0126\x03\x02\x02\x02T\u0128\x03\x02\x02\x02" +
		"V\u012A\x03\x02\x02\x02X\u012C\x03\x02\x02\x02Z\\\x05\x04\x03\x02[Z\x03" +
		"\x02\x02\x02\\_\x03\x02\x02\x02][\x03\x02\x02\x02]^\x03\x02\x02\x02^`" +
		"\x03\x02\x02\x02_]\x03\x02\x02\x02`a\x07\x02\x02\x03a\x03\x03\x02\x02" +
		"\x02bg\x05\x06\x04\x02cg\x05\x1A\x0E\x02dg\x05 \x11\x02eg\x05\"\x12\x02" +
		"fb\x03\x02\x02\x02fc\x03\x02\x02\x02fd\x03\x02\x02\x02fe\x03\x02\x02\x02" +
		"g\x05\x03\x02\x02\x02hi\x07\x1D\x02\x02ij\x05B\"\x02jk\x07\x1F\x02\x02" +
		"kl\x05\b\x05\x02lm\x07\f\x02\x02m\x07\x03\x02\x02\x02np\x05\n\x06\x02" +
		"on\x03\x02\x02\x02pq\x03\x02\x02\x02qo\x03\x02\x02\x02qr\x03\x02\x02\x02" +
		"r\t\x03\x02\x02\x02st\x07\x19\x02\x02tu\x05P)\x02uv\x07\x1A\x02\x02vw" +
		"\x05\x0E\b\x02w~\x03\x02\x02\x02xy\x07\x19\x02\x02yz\x05P)\x02z{\x07\x1A" +
		"\x02\x02{|\x05\x10\t\x02|~\x03\x02\x02\x02}s\x03\x02\x02\x02}x\x03\x02" +
		"\x02\x02~\v\x03\x02\x02\x02\x7F\x80\t\x02\x02\x02\x80\x81\x07\x1F\x02" +
		"\x02\x81\r\x03\x02\x02\x02\x82\x84\x07\x1F\x02\x02\x83\x85\x05\f\x07\x02" +
		"\x84\x83\x03\x02\x02\x02\x84\x85\x03\x02\x02\x02\x85\x87\x03\x02\x02\x02" +
		"\x86\x88\x05\x12\n\x02\x87\x86\x03\x02\x02\x02\x88\x89\x03\x02\x02\x02" +
		"\x89\x87\x03\x02\x02\x02\x89\x8A\x03\x02\x02\x02\x8A\x8B\x03\x02\x02\x02" +
		"\x8B\x8C\x07\f\x02\x02\x8C\x0F\x03\x02\x02\x02\x8D\x90\x05\x16\f\x02\x8E" +
		"\x90\x05\x18\r\x02\x8F\x8D\x03\x02\x02\x02\x8F\x8E\x03\x02\x02\x02\x90" +
		"\x91\x03\x02\x02\x02\x91\x92\x07 \x02\x02\x92\x11\x03\x02\x02\x02\x93" +
		"\x96\x05\n\x06\x02\x94\x96\x05\x14\v\x02\x95\x93\x03\x02\x02\x02\x95\x94" +
		"\x03\x02\x02\x02\x96\x13\x03\x02\x02\x02\x97\x9A\x05\x16\f\x02\x98\x9A" +
		"\x05\x18\r\x02\x99\x97\x03\x02\x02\x02\x99\x98\x03\x02\x02\x02\x9A\x9B" +
		"\x03\x02\x02\x02\x9B\x9C\x07 \x02\x02\x9C\x15\x03\x02\x02\x02\x9D\x9E" +
		"\x07\x17\x02\x02\x9E\x9F\x05L\'\x02\x9F\x17\x03\x02\x02\x02\xA0\xA1\x07" +
		"\x18\x02\x02\xA1\xA2\x05D#\x02\xA2\x19\x03\x02\x02\x02\xA3\xA4\x07\x06" +
		"\x02\x02\xA4\xA8\x05F$\x02\xA5\xA9\x05\x1C\x0F\x02\xA6\xA9\x05V,\x02\xA7" +
		"\xA9\x05\x1E\x10\x02\xA8\xA5\x03\x02\x02\x02\xA8\xA6\x03\x02\x02\x02\xA8" +
		"\xA7\x03\x02\x02\x02\xA9\xAA\x03\x02\x02\x02\xAA\xAB\x07 \x02\x02\xAB" +
		"\x1B\x03\x02\x02\x02\xAC\xAD\x07\x10\x02\x02\xAD\xAE\x05@!\x02\xAE\x1D" +
		"\x03\x02\x02\x02\xAF\xB0\x07\x14\x02\x02\xB0\xB1\x05V,\x02\xB1\xB2\x07" +
		"\x15\x02\x02\xB2\xB3\x05V,\x02\xB3\x1F\x03\x02\x02\x02\xB4\xB5\x07\x12" +
		"\x02\x02\xB5\xB6\x05J&\x02\xB6\xB7\x07\x11\x02\x02\xB7\xBD\x07(\x02\x02" +
		"\xB8\xBB\x07\x13\x02\x02\xB9\xBC\x05H%\x02\xBA\xBC\x05X-\x02\xBB\xB9\x03" +
		"\x02\x02\x02\xBB\xBA\x03\x02\x02\x02\xBC\xBE\x03\x02\x02\x02\xBD\xB8\x03" +
		"\x02\x02\x02\xBD\xBE\x03\x02\x02\x02\xBE\xBF\x03\x02\x02\x02\xBF\xC0\x07" +
		" \x02\x02\xC0!\x03\x02\x02\x02\xC1\xC2\x07\x03\x02\x02\xC2\xC3\x05N(\x02" +
		"\xC3\xC4\x07\x1F\x02\x02\xC4\xC5\x05$\x13\x02\xC5\xC6\x07\f\x02\x02\xC6" +
		"#\x03\x02\x02\x02\xC7\xC8\x05&\x14\x02\xC8\xCA\x05(\x15\x02\xC9\xCB\x05" +
		"*\x16\x02\xCA\xC9\x03\x02\x02\x02\xCA\xCB\x03\x02\x02\x02\xCB\xCE\x03" +
		"\x02\x02\x02\xCC\xCF\x05,\x17\x02\xCD\xCF\x05.\x18\x02\xCE\xCC\x03\x02" +
		"\x02\x02\xCE\xCD\x03\x02\x02\x02\xCF%\x03\x02\x02\x02\xD0\xD1\x07\r\x02" +
		"\x02\xD1\xD2\x07\x04\x02\x02\xD2\xD3\x07,\x02\x02\xD3\xD4\x07 \x02\x02" +
		"\xD4\'\x03\x02\x02\x02\xD5\xD6\x07\r\x02\x02\xD6\xD7\x07\x05\x02\x02\xD7" +
		"\xD8\x070\x02\x02\xD8\xD9\x07 \x02\x02\xD9)\x03\x02\x02\x02\xDA\xDB\x07" +
		"\r\x02\x02\xDB\xDC\x07\x07\x02\x02\xDC\xDD\x05V,\x02\xDD\xDE\x07 \x02" +
		"\x02\xDE+\x03\x02\x02\x02\xDF\xE0\x07\x0F\x02\x02\xE0\xE1\x07\x0E\x02" +
		"\x02\xE1\xE2\x05H%\x02\xE2\xE3\x07 \x02\x02\xE3-\x03\x02\x02\x02\xE4\xE5" +
		"\x07\b\x02\x02\xE5\xE6\x07\x0E\x02\x02\xE6\xE7\x050\x19\x02\xE7\xE8\x07" +
		" \x02\x02\xE8/\x03\x02\x02\x02\xE9\xEC\x052\x1A\x02\xEA\xEC\x054\x1B\x02" +
		"\xEB\xE9\x03\x02\x02\x02\xEB\xEA\x03\x02\x02\x02\xEC1\x03\x02\x02\x02" +
		"\xED\xEF\x05T+\x02\xEE\xED\x03\x02\x02\x02\xEE\xEF\x03\x02\x02\x02\xEF" +
		"\xF0\x03\x02\x02\x02\xF0\xF1\x05P)\x02\xF13\x03\x02\x02\x02\xF2\xF3\x07" +
		"!\x02\x02\xF3\xF4\x056\x1C\x02\xF4\xF5\x07\"\x02\x02\xF55\x03\x02\x02" +
		"\x02\xF6\xF7\x058\x1D\x02\xF77\x03\x02\x02\x02\xF8\xFD\x05:\x1E\x02\xF9" +
		"\xFA\x07\n\x02\x02\xFA\xFC\x05:\x1E\x02\xFB\xF9\x03\x02\x02\x02\xFC\xFF" +
		"\x03\x02\x02\x02\xFD\xFB\x03\x02\x02\x02\xFD\xFE\x03\x02\x02\x02\xFE9" +
		"\x03\x02\x02\x02\xFF\xFD\x03\x02\x02\x02\u0100\u0105\x05<\x1F\x02\u0101" +
		"\u0102\x07\t\x02\x02\u0102\u0104\x05<\x1F\x02\u0103\u0101\x03\x02\x02" +
		"\x02\u0104\u0107\x03\x02\x02\x02\u0105\u0103\x03\x02\x02\x02\u0105\u0106" +
		"\x03\x02\x02\x02\u0106;\x03\x02\x02\x02\u0107\u0105\x03\x02\x02\x02\u0108" +
		"\u0109\x07\v\x02\x02\u0109\u010C\x05<\x1F\x02\u010A\u010C\x05> \x02\u010B" +
		"\u0108\x03\x02\x02\x02\u010B\u010A\x03\x02\x02\x02\u010C=\x03\x02\x02" +
		"\x02\u010D\u0113\x05P)\x02\u010E\u010F\x07!\x02\x02\u010F\u0110\x056\x1C" +
		"\x02\u0110\u0111\x07\"\x02\x02\u0111\u0113\x03\x02\x02\x02\u0112\u010D" +
		"\x03\x02\x02\x02\u0112\u010E\x03\x02\x02\x02\u0113?\x03\x02\x02\x02\u0114" +
		"\u0115\x07#\x02\x02\u0115A\x03\x02\x02\x02\u0116\u0117\x05@!\x02\u0117" +
		"C\x03\x02\x02\x02\u0118\u0119\x05B\"\x02\u0119E\x03\x02\x02\x02\u011A" +
		"\u011B\x05@!\x02\u011BG\x03\x02\x02\x02\u011C\u011D\x05@!\x02\u011DI\x03" +
		"\x02\x02\x02\u011E\u011F\x05@!\x02\u011FK\x03\x02\x02\x02\u0120\u0121" +
		"\x05J&\x02\u0121M\x03\x02\x02\x02\u0122\u0123\x05@!\x02\u0123O\x03\x02" +
		"\x02\x02\u0124\u0125\x05N(\x02\u0125Q\x03\x02\x02\x02\u0126\u0127\x05" +
		"@!\x02\u0127S\x03\x02\x02\x02\u0128\u0129\x05R*\x02\u0129U\x03\x02\x02" +
		"\x02\u012A\u012B\x07$\x02\x02\u012BW\x03\x02\x02\x02\u012C\u012D\x05V" +
		",\x02\u012DY\x03\x02\x02\x02\x16]fq}\x84\x89\x8F\x95\x99\xA8\xBB\xBD\xCA" +
		"\xCE\xEB\xEE\xFD\u0105\u010B\u0112";
	public static __ATN: ATN;
	public static get _ATN(): ATN {
		if (!CPGLParser.__ATN) {
			CPGLParser.__ATN = new ATNDeserializer().deserialize(Utils.toCharArray(CPGLParser._serializedATN));
		}

		return CPGLParser.__ATN;
	}

}

export class CpglContext extends ParserRuleContext {
	public EOF(): TerminalNode { return this.getToken(CPGLParser.EOF, 0); }
	public statement(): StatementContext[];
	public statement(i: number): StatementContext;
	public statement(i?: number): StatementContext | StatementContext[] {
		if (i === undefined) {
			return this.getRuleContexts(StatementContext);
		} else {
			return this.getRuleContext(i, StatementContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_cpgl; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterCpgl) {
			listener.enterCpgl(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitCpgl) {
			listener.exitCpgl(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitCpgl) {
			return visitor.visitCpgl(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class StatementContext extends ParserRuleContext {
	public decisionStatement(): DecisionStatementContext | undefined {
		return this.tryGetRuleContext(0, DecisionStatementContext);
	}
	public terminologyStatement(): TerminologyStatementContext | undefined {
		return this.tryGetRuleContext(0, TerminologyStatementContext);
	}
	public activityStatement(): ActivityStatementContext | undefined {
		return this.tryGetRuleContext(0, ActivityStatementContext);
	}
	public conceptStatement(): ConceptStatementContext | undefined {
		return this.tryGetRuleContext(0, ConceptStatementContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_statement; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterStatement) {
			listener.enterStatement(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitStatement) {
			listener.exitStatement(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitStatement) {
			return visitor.visitStatement(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class DecisionStatementContext extends ParserRuleContext {
	public DECISION(): TerminalNode { return this.getToken(CPGLParser.DECISION, 0); }
	public decisionIdentifier(): DecisionIdentifierContext {
		return this.getRuleContext(0, DecisionIdentifierContext);
	}
	public COLON(): TerminalNode { return this.getToken(CPGLParser.COLON, 0); }
	public decisionBody(): DecisionBodyContext {
		return this.getRuleContext(0, DecisionBodyContext);
	}
	public DONE(): TerminalNode { return this.getToken(CPGLParser.DONE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_decisionStatement; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterDecisionStatement) {
			listener.enterDecisionStatement(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitDecisionStatement) {
			listener.exitDecisionStatement(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitDecisionStatement) {
			return visitor.visitDecisionStatement(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class DecisionBodyContext extends ParserRuleContext {
	public whenBlock(): WhenBlockContext[];
	public whenBlock(i: number): WhenBlockContext;
	public whenBlock(i?: number): WhenBlockContext | WhenBlockContext[] {
		if (i === undefined) {
			return this.getRuleContexts(WhenBlockContext);
		} else {
			return this.getRuleContext(i, WhenBlockContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_decisionBody; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterDecisionBody) {
			listener.enterDecisionBody(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitDecisionBody) {
			listener.exitDecisionBody(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitDecisionBody) {
			return visitor.visitDecisionBody(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class WhenBlockContext extends ParserRuleContext {
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_whenBlock; }
	public copyFrom(ctx: WhenBlockContext): void {
		super.copyFrom(ctx);
	}
}
export class WhenWithBodyContext extends WhenBlockContext {
	public WHEN(): TerminalNode { return this.getToken(CPGLParser.WHEN, 0); }
	public conceptReference(): ConceptReferenceContext {
		return this.getRuleContext(0, ConceptReferenceContext);
	}
	public THEN(): TerminalNode { return this.getToken(CPGLParser.THEN, 0); }
	public blockBody(): BlockBodyContext {
		return this.getRuleContext(0, BlockBodyContext);
	}
	constructor(ctx: WhenBlockContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterWhenWithBody) {
			listener.enterWhenWithBody(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitWhenWithBody) {
			listener.exitWhenWithBody(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitWhenWithBody) {
			return visitor.visitWhenWithBody(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class WhenSingleActionContext extends WhenBlockContext {
	public WHEN(): TerminalNode { return this.getToken(CPGLParser.WHEN, 0); }
	public conceptReference(): ConceptReferenceContext {
		return this.getRuleContext(0, ConceptReferenceContext);
	}
	public THEN(): TerminalNode { return this.getToken(CPGLParser.THEN, 0); }
	public singleActionStatement(): SingleActionStatementContext {
		return this.getRuleContext(0, SingleActionStatementContext);
	}
	constructor(ctx: WhenBlockContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterWhenSingleAction) {
			listener.enterWhenSingleAction(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitWhenSingleAction) {
			listener.exitWhenSingleAction(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitWhenSingleAction) {
			return visitor.visitWhenSingleAction(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class AnyOrAllClauseContext extends ParserRuleContext {
	public COLON(): TerminalNode { return this.getToken(CPGLParser.COLON, 0); }
	public ANY(): TerminalNode | undefined { return this.tryGetToken(CPGLParser.ANY, 0); }
	public ALL(): TerminalNode | undefined { return this.tryGetToken(CPGLParser.ALL, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_anyOrAllClause; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterAnyOrAllClause) {
			listener.enterAnyOrAllClause(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitAnyOrAllClause) {
			listener.exitAnyOrAllClause(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitAnyOrAllClause) {
			return visitor.visitAnyOrAllClause(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class BlockBodyContext extends ParserRuleContext {
	public COLON(): TerminalNode { return this.getToken(CPGLParser.COLON, 0); }
	public DONE(): TerminalNode { return this.getToken(CPGLParser.DONE, 0); }
	public anyOrAllClause(): AnyOrAllClauseContext | undefined {
		return this.tryGetRuleContext(0, AnyOrAllClauseContext);
	}
	public blockStatement(): BlockStatementContext[];
	public blockStatement(i: number): BlockStatementContext;
	public blockStatement(i?: number): BlockStatementContext | BlockStatementContext[] {
		if (i === undefined) {
			return this.getRuleContexts(BlockStatementContext);
		} else {
			return this.getRuleContext(i, BlockStatementContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_blockBody; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterBlockBody) {
			listener.enterBlockBody(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitBlockBody) {
			listener.exitBlockBody(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitBlockBody) {
			return visitor.visitBlockBody(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class SingleActionStatementContext extends ParserRuleContext {
	public DOT(): TerminalNode { return this.getToken(CPGLParser.DOT, 0); }
	public doStatement(): DoStatementContext | undefined {
		return this.tryGetRuleContext(0, DoStatementContext);
	}
	public useStatement(): UseStatementContext | undefined {
		return this.tryGetRuleContext(0, UseStatementContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_singleActionStatement; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterSingleActionStatement) {
			listener.enterSingleActionStatement(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitSingleActionStatement) {
			listener.exitSingleActionStatement(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitSingleActionStatement) {
			return visitor.visitSingleActionStatement(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class BlockStatementContext extends ParserRuleContext {
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_blockStatement; }
	public copyFrom(ctx: BlockStatementContext): void {
		super.copyFrom(ctx);
	}
}
export class NestedWhenBlockContext extends BlockStatementContext {
	public whenBlock(): WhenBlockContext {
		return this.getRuleContext(0, WhenBlockContext);
	}
	constructor(ctx: BlockStatementContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterNestedWhenBlock) {
			listener.enterNestedWhenBlock(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitNestedWhenBlock) {
			listener.exitNestedWhenBlock(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitNestedWhenBlock) {
			return visitor.visitNestedWhenBlock(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class BlockActionContext extends BlockStatementContext {
	public actionStatement(): ActionStatementContext {
		return this.getRuleContext(0, ActionStatementContext);
	}
	constructor(ctx: BlockStatementContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterBlockAction) {
			listener.enterBlockAction(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitBlockAction) {
			listener.exitBlockAction(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitBlockAction) {
			return visitor.visitBlockAction(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ActionStatementContext extends ParserRuleContext {
	public DOT(): TerminalNode { return this.getToken(CPGLParser.DOT, 0); }
	public doStatement(): DoStatementContext | undefined {
		return this.tryGetRuleContext(0, DoStatementContext);
	}
	public useStatement(): UseStatementContext | undefined {
		return this.tryGetRuleContext(0, UseStatementContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_actionStatement; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterActionStatement) {
			listener.enterActionStatement(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitActionStatement) {
			listener.exitActionStatement(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitActionStatement) {
			return visitor.visitActionStatement(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class DoStatementContext extends ParserRuleContext {
	public DO(): TerminalNode { return this.getToken(CPGLParser.DO, 0); }
	public activityReference(): ActivityReferenceContext {
		return this.getRuleContext(0, ActivityReferenceContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_doStatement; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterDoStatement) {
			listener.enterDoStatement(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitDoStatement) {
			listener.exitDoStatement(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitDoStatement) {
			return visitor.visitDoStatement(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class UseStatementContext extends ParserRuleContext {
	public USE(): TerminalNode { return this.getToken(CPGLParser.USE, 0); }
	public decisionReference(): DecisionReferenceContext {
		return this.getRuleContext(0, DecisionReferenceContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_useStatement; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterUseStatement) {
			listener.enterUseStatement(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitUseStatement) {
			listener.exitUseStatement(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitUseStatement) {
			return visitor.visitUseStatement(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TerminologyStatementContext extends ParserRuleContext {
	public TERMINOLOGY(): TerminalNode { return this.getToken(CPGLParser.TERMINOLOGY, 0); }
	public terminologyIdentifier(): TerminologyIdentifierContext {
		return this.getRuleContext(0, TerminologyIdentifierContext);
	}
	public DOT(): TerminalNode { return this.getToken(CPGLParser.DOT, 0); }
	public terminologyValueset(): TerminologyValuesetContext | undefined {
		return this.tryGetRuleContext(0, TerminologyValuesetContext);
	}
	public backtickString(): BacktickStringContext | undefined {
		return this.tryGetRuleContext(0, BacktickStringContext);
	}
	public terminologySystemCode(): TerminologySystemCodeContext | undefined {
		return this.tryGetRuleContext(0, TerminologySystemCodeContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_terminologyStatement; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterTerminologyStatement) {
			listener.enterTerminologyStatement(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitTerminologyStatement) {
			listener.exitTerminologyStatement(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitTerminologyStatement) {
			return visitor.visitTerminologyStatement(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TerminologyValuesetContext extends ParserRuleContext {
	public VALUESET(): TerminalNode { return this.getToken(CPGLParser.VALUESET, 0); }
	public identifier(): IdentifierContext {
		return this.getRuleContext(0, IdentifierContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_terminologyValueset; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterTerminologyValueset) {
			listener.enterTerminologyValueset(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitTerminologyValueset) {
			listener.exitTerminologyValueset(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitTerminologyValueset) {
			return visitor.visitTerminologyValueset(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TerminologySystemCodeContext extends ParserRuleContext {
	public SYSTEM(): TerminalNode { return this.getToken(CPGLParser.SYSTEM, 0); }
	public backtickString(): BacktickStringContext[];
	public backtickString(i: number): BacktickStringContext;
	public backtickString(i?: number): BacktickStringContext | BacktickStringContext[] {
		if (i === undefined) {
			return this.getRuleContexts(BacktickStringContext);
		} else {
			return this.getRuleContext(i, BacktickStringContext);
		}
	}
	public CODE(): TerminalNode { return this.getToken(CPGLParser.CODE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_terminologySystemCode; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterTerminologySystemCode) {
			listener.enterTerminologySystemCode(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitTerminologySystemCode) {
			listener.exitTerminologySystemCode(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitTerminologySystemCode) {
			return visitor.visitTerminologySystemCode(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ActivityStatementContext extends ParserRuleContext {
	public ACTIVITY(): TerminalNode { return this.getToken(CPGLParser.ACTIVITY, 0); }
	public activityIdentifier(): ActivityIdentifierContext {
		return this.getRuleContext(0, ActivityIdentifierContext);
	}
	public PERFORM(): TerminalNode { return this.getToken(CPGLParser.PERFORM, 0); }
	public ACTIVITY_TYPE(): TerminalNode { return this.getToken(CPGLParser.ACTIVITY_TYPE, 0); }
	public DOT(): TerminalNode { return this.getToken(CPGLParser.DOT, 0); }
	public OF(): TerminalNode | undefined { return this.tryGetToken(CPGLParser.OF, 0); }
	public terminologyReference(): TerminologyReferenceContext | undefined {
		return this.tryGetRuleContext(0, TerminologyReferenceContext);
	}
	public activityTypeValue(): ActivityTypeValueContext | undefined {
		return this.tryGetRuleContext(0, ActivityTypeValueContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_activityStatement; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterActivityStatement) {
			listener.enterActivityStatement(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitActivityStatement) {
			listener.exitActivityStatement(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitActivityStatement) {
			return visitor.visitActivityStatement(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ConceptStatementContext extends ParserRuleContext {
	public CONCEPT(): TerminalNode { return this.getToken(CPGLParser.CONCEPT, 0); }
	public conceptIdentifier(): ConceptIdentifierContext {
		return this.getRuleContext(0, ConceptIdentifierContext);
	}
	public COLON(): TerminalNode { return this.getToken(CPGLParser.COLON, 0); }
	public conceptBody(): ConceptBodyContext {
		return this.getRuleContext(0, ConceptBodyContext);
	}
	public DONE(): TerminalNode { return this.getToken(CPGLParser.DONE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_conceptStatement; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterConceptStatement) {
			listener.enterConceptStatement(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitConceptStatement) {
			listener.exitConceptStatement(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitConceptStatement) {
			return visitor.visitConceptStatement(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ConceptBodyContext extends ParserRuleContext {
	public hasTypeLine(): HasTypeLineContext {
		return this.getRuleContext(0, HasTypeLineContext);
	}
	public hasValueTypeLine(): HasValueTypeLineContext {
		return this.getRuleContext(0, HasValueTypeLineContext);
	}
	public codedByLine(): CodedByLineContext | undefined {
		return this.tryGetRuleContext(0, CodedByLineContext);
	}
	public inferredByLine(): InferredByLineContext | undefined {
		return this.tryGetRuleContext(0, InferredByLineContext);
	}
	public provenanceLine(): ProvenanceLineContext | undefined {
		return this.tryGetRuleContext(0, ProvenanceLineContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_conceptBody; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterConceptBody) {
			listener.enterConceptBody(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitConceptBody) {
			listener.exitConceptBody(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitConceptBody) {
			return visitor.visitConceptBody(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class HasTypeLineContext extends ParserRuleContext {
	public HAS(): TerminalNode { return this.getToken(CPGLParser.HAS, 0); }
	public TYPE(): TerminalNode { return this.getToken(CPGLParser.TYPE, 0); }
	public CONCEPT_TYPE(): TerminalNode { return this.getToken(CPGLParser.CONCEPT_TYPE, 0); }
	public DOT(): TerminalNode { return this.getToken(CPGLParser.DOT, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_hasTypeLine; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterHasTypeLine) {
			listener.enterHasTypeLine(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitHasTypeLine) {
			listener.exitHasTypeLine(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitHasTypeLine) {
			return visitor.visitHasTypeLine(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class HasValueTypeLineContext extends ParserRuleContext {
	public HAS(): TerminalNode { return this.getToken(CPGLParser.HAS, 0); }
	public VALUETYPE(): TerminalNode { return this.getToken(CPGLParser.VALUETYPE, 0); }
	public CONCEPT_VALUE_TYPE(): TerminalNode { return this.getToken(CPGLParser.CONCEPT_VALUE_TYPE, 0); }
	public DOT(): TerminalNode { return this.getToken(CPGLParser.DOT, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_hasValueTypeLine; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterHasValueTypeLine) {
			listener.enterHasValueTypeLine(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitHasValueTypeLine) {
			listener.exitHasValueTypeLine(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitHasValueTypeLine) {
			return visitor.visitHasValueTypeLine(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ProvenanceLineContext extends ParserRuleContext {
	public HAS(): TerminalNode { return this.getToken(CPGLParser.HAS, 0); }
	public PROVENANCE(): TerminalNode { return this.getToken(CPGLParser.PROVENANCE, 0); }
	public backtickString(): BacktickStringContext {
		return this.getRuleContext(0, BacktickStringContext);
	}
	public DOT(): TerminalNode { return this.getToken(CPGLParser.DOT, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_provenanceLine; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterProvenanceLine) {
			listener.enterProvenanceLine(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitProvenanceLine) {
			listener.exitProvenanceLine(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitProvenanceLine) {
			return visitor.visitProvenanceLine(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class CodedByLineContext extends ParserRuleContext {
	public CODED(): TerminalNode { return this.getToken(CPGLParser.CODED, 0); }
	public BY(): TerminalNode { return this.getToken(CPGLParser.BY, 0); }
	public terminologyReference(): TerminologyReferenceContext {
		return this.getRuleContext(0, TerminologyReferenceContext);
	}
	public DOT(): TerminalNode { return this.getToken(CPGLParser.DOT, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_codedByLine; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterCodedByLine) {
			listener.enterCodedByLine(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitCodedByLine) {
			listener.exitCodedByLine(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitCodedByLine) {
			return visitor.visitCodedByLine(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class InferredByLineContext extends ParserRuleContext {
	public INFERRED(): TerminalNode { return this.getToken(CPGLParser.INFERRED, 0); }
	public BY(): TerminalNode { return this.getToken(CPGLParser.BY, 0); }
	public inferredBody(): InferredBodyContext {
		return this.getRuleContext(0, InferredBodyContext);
	}
	public DOT(): TerminalNode { return this.getToken(CPGLParser.DOT, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_inferredByLine; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterInferredByLine) {
			listener.enterInferredByLine(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitInferredByLine) {
			listener.exitInferredByLine(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitInferredByLine) {
			return visitor.visitInferredByLine(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class InferredBodyContext extends ParserRuleContext {
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_inferredBody; }
	public copyFrom(ctx: InferredBodyContext): void {
		super.copyFrom(ctx);
	}
}
export class DefinitionConceptContext extends InferredBodyContext {
	public inferredByConceptReference(): InferredByConceptReferenceContext {
		return this.getRuleContext(0, InferredByConceptReferenceContext);
	}
	constructor(ctx: InferredBodyContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterDefinitionConcept) {
			listener.enterDefinitionConcept(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitDefinitionConcept) {
			listener.exitDefinitionConcept(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitDefinitionConcept) {
			return visitor.visitDefinitionConcept(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class DefinitionLogicContext extends InferredBodyContext {
	public inferredByDescriptiveLogic(): InferredByDescriptiveLogicContext {
		return this.getRuleContext(0, InferredByDescriptiveLogicContext);
	}
	constructor(ctx: InferredBodyContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterDefinitionLogic) {
			listener.enterDefinitionLogic(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitDefinitionLogic) {
			listener.exitDefinitionLogic(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitDefinitionLogic) {
			return visitor.visitDefinitionLogic(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class InferredByConceptReferenceContext extends ParserRuleContext {
	public conceptReference(): ConceptReferenceContext {
		return this.getRuleContext(0, ConceptReferenceContext);
	}
	public patternReference(): PatternReferenceContext | undefined {
		return this.tryGetRuleContext(0, PatternReferenceContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_inferredByConceptReference; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterInferredByConceptReference) {
			listener.enterInferredByConceptReference(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitInferredByConceptReference) {
			listener.exitInferredByConceptReference(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitInferredByConceptReference) {
			return visitor.visitInferredByConceptReference(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class InferredByDescriptiveLogicContext extends ParserRuleContext {
	public LPAREN(): TerminalNode { return this.getToken(CPGLParser.LPAREN, 0); }
	public inferredByExpression(): InferredByExpressionContext {
		return this.getRuleContext(0, InferredByExpressionContext);
	}
	public RPAREN(): TerminalNode { return this.getToken(CPGLParser.RPAREN, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_inferredByDescriptiveLogic; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterInferredByDescriptiveLogic) {
			listener.enterInferredByDescriptiveLogic(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitInferredByDescriptiveLogic) {
			listener.exitInferredByDescriptiveLogic(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitInferredByDescriptiveLogic) {
			return visitor.visitInferredByDescriptiveLogic(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class InferredByExpressionContext extends ParserRuleContext {
	public informalOr(): InformalOrContext {
		return this.getRuleContext(0, InformalOrContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_inferredByExpression; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterInferredByExpression) {
			listener.enterInferredByExpression(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitInferredByExpression) {
			listener.exitInferredByExpression(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitInferredByExpression) {
			return visitor.visitInferredByExpression(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class InformalOrContext extends ParserRuleContext {
	public informalAnd(): InformalAndContext[];
	public informalAnd(i: number): InformalAndContext;
	public informalAnd(i?: number): InformalAndContext | InformalAndContext[] {
		if (i === undefined) {
			return this.getRuleContexts(InformalAndContext);
		} else {
			return this.getRuleContext(i, InformalAndContext);
		}
	}
	public OR(): TerminalNode[];
	public OR(i: number): TerminalNode;
	public OR(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(CPGLParser.OR);
		} else {
			return this.getToken(CPGLParser.OR, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_informalOr; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterInformalOr) {
			listener.enterInformalOr(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitInformalOr) {
			listener.exitInformalOr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitInformalOr) {
			return visitor.visitInformalOr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class InformalAndContext extends ParserRuleContext {
	public informalNot(): InformalNotContext[];
	public informalNot(i: number): InformalNotContext;
	public informalNot(i?: number): InformalNotContext | InformalNotContext[] {
		if (i === undefined) {
			return this.getRuleContexts(InformalNotContext);
		} else {
			return this.getRuleContext(i, InformalNotContext);
		}
	}
	public AND(): TerminalNode[];
	public AND(i: number): TerminalNode;
	public AND(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(CPGLParser.AND);
		} else {
			return this.getToken(CPGLParser.AND, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_informalAnd; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterInformalAnd) {
			listener.enterInformalAnd(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitInformalAnd) {
			listener.exitInformalAnd(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitInformalAnd) {
			return visitor.visitInformalAnd(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class InformalNotContext extends ParserRuleContext {
	public NOT(): TerminalNode | undefined { return this.tryGetToken(CPGLParser.NOT, 0); }
	public informalNot(): InformalNotContext | undefined {
		return this.tryGetRuleContext(0, InformalNotContext);
	}
	public atom(): AtomContext | undefined {
		return this.tryGetRuleContext(0, AtomContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_informalNot; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterInformalNot) {
			listener.enterInformalNot(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitInformalNot) {
			listener.exitInformalNot(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitInformalNot) {
			return visitor.visitInformalNot(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class AtomContext extends ParserRuleContext {
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_atom; }
	public copyFrom(ctx: AtomContext): void {
		super.copyFrom(ctx);
	}
}
export class ConceptAtomContext extends AtomContext {
	public conceptReference(): ConceptReferenceContext {
		return this.getRuleContext(0, ConceptReferenceContext);
	}
	constructor(ctx: AtomContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterConceptAtom) {
			listener.enterConceptAtom(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitConceptAtom) {
			listener.exitConceptAtom(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitConceptAtom) {
			return visitor.visitConceptAtom(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class GroupExpressionContext extends AtomContext {
	public LPAREN(): TerminalNode { return this.getToken(CPGLParser.LPAREN, 0); }
	public inferredByExpression(): InferredByExpressionContext {
		return this.getRuleContext(0, InferredByExpressionContext);
	}
	public RPAREN(): TerminalNode { return this.getToken(CPGLParser.RPAREN, 0); }
	constructor(ctx: AtomContext) {
		super(ctx.parent, ctx.invokingState);
		this.copyFrom(ctx);
	}
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterGroupExpression) {
			listener.enterGroupExpression(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitGroupExpression) {
			listener.exitGroupExpression(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitGroupExpression) {
			return visitor.visitGroupExpression(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class IdentifierContext extends ParserRuleContext {
	public QUOTED_STRING(): TerminalNode { return this.getToken(CPGLParser.QUOTED_STRING, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_identifier; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterIdentifier) {
			listener.enterIdentifier(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitIdentifier) {
			listener.exitIdentifier(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitIdentifier) {
			return visitor.visitIdentifier(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class DecisionIdentifierContext extends ParserRuleContext {
	public identifier(): IdentifierContext {
		return this.getRuleContext(0, IdentifierContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_decisionIdentifier; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterDecisionIdentifier) {
			listener.enterDecisionIdentifier(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitDecisionIdentifier) {
			listener.exitDecisionIdentifier(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitDecisionIdentifier) {
			return visitor.visitDecisionIdentifier(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class DecisionReferenceContext extends ParserRuleContext {
	public decisionIdentifier(): DecisionIdentifierContext {
		return this.getRuleContext(0, DecisionIdentifierContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_decisionReference; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterDecisionReference) {
			listener.enterDecisionReference(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitDecisionReference) {
			listener.exitDecisionReference(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitDecisionReference) {
			return visitor.visitDecisionReference(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TerminologyIdentifierContext extends ParserRuleContext {
	public identifier(): IdentifierContext {
		return this.getRuleContext(0, IdentifierContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_terminologyIdentifier; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterTerminologyIdentifier) {
			listener.enterTerminologyIdentifier(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitTerminologyIdentifier) {
			listener.exitTerminologyIdentifier(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitTerminologyIdentifier) {
			return visitor.visitTerminologyIdentifier(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TerminologyReferenceContext extends ParserRuleContext {
	public identifier(): IdentifierContext {
		return this.getRuleContext(0, IdentifierContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_terminologyReference; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterTerminologyReference) {
			listener.enterTerminologyReference(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitTerminologyReference) {
			listener.exitTerminologyReference(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitTerminologyReference) {
			return visitor.visitTerminologyReference(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ActivityIdentifierContext extends ParserRuleContext {
	public identifier(): IdentifierContext {
		return this.getRuleContext(0, IdentifierContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_activityIdentifier; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterActivityIdentifier) {
			listener.enterActivityIdentifier(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitActivityIdentifier) {
			listener.exitActivityIdentifier(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitActivityIdentifier) {
			return visitor.visitActivityIdentifier(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ActivityReferenceContext extends ParserRuleContext {
	public activityIdentifier(): ActivityIdentifierContext {
		return this.getRuleContext(0, ActivityIdentifierContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_activityReference; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterActivityReference) {
			listener.enterActivityReference(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitActivityReference) {
			listener.exitActivityReference(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitActivityReference) {
			return visitor.visitActivityReference(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ConceptIdentifierContext extends ParserRuleContext {
	public identifier(): IdentifierContext {
		return this.getRuleContext(0, IdentifierContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_conceptIdentifier; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterConceptIdentifier) {
			listener.enterConceptIdentifier(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitConceptIdentifier) {
			listener.exitConceptIdentifier(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitConceptIdentifier) {
			return visitor.visitConceptIdentifier(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ConceptReferenceContext extends ParserRuleContext {
	public conceptIdentifier(): ConceptIdentifierContext {
		return this.getRuleContext(0, ConceptIdentifierContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_conceptReference; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterConceptReference) {
			listener.enterConceptReference(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitConceptReference) {
			listener.exitConceptReference(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitConceptReference) {
			return visitor.visitConceptReference(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class PatternIdentifierContext extends ParserRuleContext {
	public identifier(): IdentifierContext {
		return this.getRuleContext(0, IdentifierContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_patternIdentifier; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterPatternIdentifier) {
			listener.enterPatternIdentifier(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitPatternIdentifier) {
			listener.exitPatternIdentifier(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitPatternIdentifier) {
			return visitor.visitPatternIdentifier(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class PatternReferenceContext extends ParserRuleContext {
	public patternIdentifier(): PatternIdentifierContext {
		return this.getRuleContext(0, PatternIdentifierContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_patternReference; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterPatternReference) {
			listener.enterPatternReference(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitPatternReference) {
			listener.exitPatternReference(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitPatternReference) {
			return visitor.visitPatternReference(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class BacktickStringContext extends ParserRuleContext {
	public BACKTICK_STRING(): TerminalNode { return this.getToken(CPGLParser.BACKTICK_STRING, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_backtickString; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterBacktickString) {
			listener.enterBacktickString(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitBacktickString) {
			listener.exitBacktickString(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitBacktickString) {
			return visitor.visitBacktickString(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ActivityTypeValueContext extends ParserRuleContext {
	public backtickString(): BacktickStringContext {
		return this.getRuleContext(0, BacktickStringContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_activityTypeValue; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterActivityTypeValue) {
			listener.enterActivityTypeValue(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitActivityTypeValue) {
			listener.exitActivityTypeValue(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitActivityTypeValue) {
			return visitor.visitActivityTypeValue(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


