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
	public static readonly STRING = 34;
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
	public static readonly RULE_terminologyUnknown = 14;
	public static readonly RULE_terminologySystemCode = 15;
	public static readonly RULE_activityStatement = 16;
	public static readonly RULE_conceptStatement = 17;
	public static readonly RULE_conceptBody = 18;
	public static readonly RULE_hasTypeLine = 19;
	public static readonly RULE_hasValueTypeLine = 20;
	public static readonly RULE_provenanceLine = 21;
	public static readonly RULE_codedByLine = 22;
	public static readonly RULE_inferredByLine = 23;
	public static readonly RULE_inferredBody = 24;
	public static readonly RULE_inferredByConceptReference = 25;
	public static readonly RULE_inferredByDescriptiveLogic = 26;
	public static readonly RULE_inferredByExpression = 27;
	public static readonly RULE_informalOr = 28;
	public static readonly RULE_informalAnd = 29;
	public static readonly RULE_informalNot = 30;
	public static readonly RULE_atom = 31;
	public static readonly RULE_identifier = 32;
	public static readonly RULE_decisionIdentifier = 33;
	public static readonly RULE_decisionReference = 34;
	public static readonly RULE_terminologyIdentifier = 35;
	public static readonly RULE_terminologyReference = 36;
	public static readonly RULE_activityIdentifier = 37;
	public static readonly RULE_activityReference = 38;
	public static readonly RULE_conceptIdentifier = 39;
	public static readonly RULE_conceptReference = 40;
	public static readonly RULE_patternIdentifier = 41;
	public static readonly RULE_patternReference = 42;
	public static readonly RULE_stringLiteral = 43;
	// tslint:disable:no-trailing-whitespace
	public static readonly ruleNames: string[] = [
		"cpgl", "statement", "decisionStatement", "decisionBody", "whenBlock", 
		"anyOrAllClause", "blockBody", "singleActionStatement", "blockStatement", 
		"actionStatement", "doStatement", "useStatement", "terminologyStatement", 
		"terminologyValueset", "terminologyUnknown", "terminologySystemCode", 
		"activityStatement", "conceptStatement", "conceptBody", "hasTypeLine", 
		"hasValueTypeLine", "provenanceLine", "codedByLine", "inferredByLine", 
		"inferredBody", "inferredByConceptReference", "inferredByDescriptiveLogic", 
		"inferredByExpression", "informalOr", "informalAnd", "informalNot", "atom", 
		"identifier", "decisionIdentifier", "decisionReference", "terminologyIdentifier", 
		"terminologyReference", "activityIdentifier", "activityReference", "conceptIdentifier", 
		"conceptReference", "patternIdentifier", "patternReference", "stringLiteral",
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
		"RPAREN", "QUOTED_STRING", "STRING", "WS", "COMMENT", "COMMENT_BLOCK", 
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
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 113;
			this.match(CPGLParser.WHEN);
			this.state = 114;
			this.conceptReference();
			this.state = 115;
			this.match(CPGLParser.THEN);
			this.state = 118;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 3, this._ctx) ) {
			case 1:
				{
				this.state = 116;
				this.blockBody();
				}
				break;

			case 2:
				{
				this.state = 117;
				this.singleActionStatement();
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
	public anyOrAllClause(): AnyOrAllClauseContext {
		let _localctx: AnyOrAllClauseContext = new AnyOrAllClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 10, CPGLParser.RULE_anyOrAllClause);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 120;
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
			this.state = 121;
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
			this.state = 123;
			this.match(CPGLParser.COLON);
			{
			this.state = 125;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 4, this._ctx) ) {
			case 1:
				{
				this.state = 124;
				this.anyOrAllClause();
				}
				break;
			}
			this.state = 128;
			this._errHandler.sync(this);
			_alt = 1;
			do {
				switch (_alt) {
				case 1:
					{
					{
					this.state = 127;
					this.blockStatement();
					}
					}
					break;
				default:
					throw new NoViableAltException(this);
				}
				this.state = 130;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 5, this._ctx);
			} while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER);
			}
			this.state = 132;
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
			this.state = 136;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 6, this._ctx) ) {
			case 1:
				{
				this.state = 134;
				this.doStatement();
				}
				break;

			case 2:
				{
				this.state = 135;
				this.useStatement();
				}
				break;
			}
			this.state = 138;
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
			this.state = 142;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 7, this._ctx) ) {
			case 1:
				_localctx = new NestedWhenBlockContext(_localctx);
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 140;
				this.whenBlock();
				}
				break;

			case 2:
				_localctx = new BlockActionContext(_localctx);
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 141;
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
			this.state = 146;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 8, this._ctx) ) {
			case 1:
				{
				this.state = 144;
				this.doStatement();
				}
				break;

			case 2:
				{
				this.state = 145;
				this.useStatement();
				}
				break;
			}
			this.state = 148;
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
			this.state = 150;
			this.match(CPGLParser.DO);
			this.state = 151;
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
			this.state = 153;
			this.match(CPGLParser.USE);
			this.state = 154;
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
			this.state = 156;
			this.match(CPGLParser.TERMINOLOGY);
			this.state = 157;
			this.terminologyIdentifier();
			this.state = 161;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 9, this._ctx) ) {
			case 1:
				{
				this.state = 158;
				this.terminologyValueset();
				}
				break;

			case 2:
				{
				this.state = 159;
				this.terminologyUnknown();
				}
				break;

			case 3:
				{
				this.state = 160;
				this.terminologySystemCode();
				}
				break;
			}
			this.state = 163;
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
			this.state = 165;
			this.match(CPGLParser.VALUESET);
			this.state = 166;
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
	public terminologyUnknown(): TerminologyUnknownContext {
		let _localctx: TerminologyUnknownContext = new TerminologyUnknownContext(this._ctx, this.state);
		this.enterRule(_localctx, 28, CPGLParser.RULE_terminologyUnknown);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 168;
			this.match(CPGLParser.UNKNOWN);
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
		this.enterRule(_localctx, 30, CPGLParser.RULE_terminologySystemCode);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 170;
			this.match(CPGLParser.SYSTEM);
			this.state = 171;
			this.identifier();
			this.state = 172;
			this.match(CPGLParser.CODE);
			this.state = 173;
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
	public activityStatement(): ActivityStatementContext {
		let _localctx: ActivityStatementContext = new ActivityStatementContext(this._ctx, this.state);
		this.enterRule(_localctx, 32, CPGLParser.RULE_activityStatement);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 175;
			this.match(CPGLParser.ACTIVITY);
			this.state = 176;
			this.activityIdentifier();
			this.state = 177;
			this.match(CPGLParser.PERFORM);
			this.state = 178;
			this.match(CPGLParser.ACTIVITY_TYPE);
			this.state = 181;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 10, this._ctx) ) {
			case 1:
				{
				this.state = 179;
				this.match(CPGLParser.OF);
				this.state = 180;
				this.terminologyReference();
				}
				break;
			}
			this.state = 183;
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
		this.enterRule(_localctx, 34, CPGLParser.RULE_conceptStatement);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 185;
			this.match(CPGLParser.CONCEPT);
			this.state = 186;
			this.conceptIdentifier();
			this.state = 187;
			this.match(CPGLParser.COLON);
			this.state = 188;
			this.conceptBody();
			this.state = 189;
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
		this.enterRule(_localctx, 36, CPGLParser.RULE_conceptBody);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 191;
			this.hasTypeLine();
			this.state = 192;
			this.hasValueTypeLine();
			this.state = 194;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 11, this._ctx) ) {
			case 1:
				{
				this.state = 193;
				this.provenanceLine();
				}
				break;
			}
			this.state = 198;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 12, this._ctx) ) {
			case 1:
				{
				this.state = 196;
				this.codedByLine();
				}
				break;

			case 2:
				{
				this.state = 197;
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
		this.enterRule(_localctx, 38, CPGLParser.RULE_hasTypeLine);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 200;
			this.match(CPGLParser.HAS);
			this.state = 201;
			this.match(CPGLParser.TYPE);
			this.state = 202;
			this.match(CPGLParser.CONCEPT_TYPE);
			this.state = 203;
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
		this.enterRule(_localctx, 40, CPGLParser.RULE_hasValueTypeLine);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 205;
			this.match(CPGLParser.HAS);
			this.state = 206;
			this.match(CPGLParser.VALUETYPE);
			this.state = 207;
			this.match(CPGLParser.CONCEPT_VALUE_TYPE);
			this.state = 208;
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
		this.enterRule(_localctx, 42, CPGLParser.RULE_provenanceLine);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 210;
			this.match(CPGLParser.HAS);
			this.state = 211;
			this.match(CPGLParser.PROVENANCE);
			this.state = 212;
			this.stringLiteral();
			this.state = 213;
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
		this.enterRule(_localctx, 44, CPGLParser.RULE_codedByLine);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 215;
			this.match(CPGLParser.CODED);
			this.state = 216;
			this.match(CPGLParser.BY);
			this.state = 217;
			this.terminologyReference();
			this.state = 218;
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
		this.enterRule(_localctx, 46, CPGLParser.RULE_inferredByLine);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 220;
			this.match(CPGLParser.INFERRED);
			this.state = 221;
			this.match(CPGLParser.BY);
			this.state = 222;
			this.inferredBody();
			this.state = 223;
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
		this.enterRule(_localctx, 48, CPGLParser.RULE_inferredBody);
		try {
			this.state = 227;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 13, this._ctx) ) {
			case 1:
				_localctx = new DefinitionConceptContext(_localctx);
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 225;
				this.inferredByConceptReference();
				}
				break;

			case 2:
				_localctx = new DefinitionLogicContext(_localctx);
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 226;
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
		this.enterRule(_localctx, 50, CPGLParser.RULE_inferredByConceptReference);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 230;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 14, this._ctx) ) {
			case 1:
				{
				this.state = 229;
				this.patternReference();
				}
				break;
			}
			this.state = 232;
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
		this.enterRule(_localctx, 52, CPGLParser.RULE_inferredByDescriptiveLogic);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 234;
			this.match(CPGLParser.LPAREN);
			this.state = 235;
			this.inferredByExpression();
			this.state = 236;
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
		this.enterRule(_localctx, 54, CPGLParser.RULE_inferredByExpression);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 238;
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
		this.enterRule(_localctx, 56, CPGLParser.RULE_informalOr);
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 240;
			this.informalAnd();
			this.state = 245;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input, 15, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					{
					{
					this.state = 241;
					this.match(CPGLParser.OR);
					this.state = 242;
					this.informalAnd();
					}
					}
				}
				this.state = 247;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 15, this._ctx);
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
		this.enterRule(_localctx, 58, CPGLParser.RULE_informalAnd);
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 248;
			this.informalNot();
			this.state = 253;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input, 16, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					{
					{
					this.state = 249;
					this.match(CPGLParser.AND);
					this.state = 250;
					this.informalNot();
					}
					}
				}
				this.state = 255;
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
	public informalNot(): InformalNotContext {
		let _localctx: InformalNotContext = new InformalNotContext(this._ctx, this.state);
		this.enterRule(_localctx, 60, CPGLParser.RULE_informalNot);
		try {
			this.state = 259;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 17, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 256;
				this.match(CPGLParser.NOT);
				this.state = 257;
				this.informalNot();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 258;
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
		this.enterRule(_localctx, 62, CPGLParser.RULE_atom);
		try {
			this.state = 266;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 18, this._ctx) ) {
			case 1:
				_localctx = new ConceptAtomContext(_localctx);
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 261;
				this.conceptReference();
				}
				break;

			case 2:
				_localctx = new GroupExpressionContext(_localctx);
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 262;
				this.match(CPGLParser.LPAREN);
				this.state = 263;
				this.inferredByExpression();
				this.state = 264;
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
		this.enterRule(_localctx, 64, CPGLParser.RULE_identifier);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 268;
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
		this.enterRule(_localctx, 66, CPGLParser.RULE_decisionIdentifier);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 270;
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
		this.enterRule(_localctx, 68, CPGLParser.RULE_decisionReference);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 272;
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
		this.enterRule(_localctx, 70, CPGLParser.RULE_terminologyIdentifier);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 274;
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
		this.enterRule(_localctx, 72, CPGLParser.RULE_terminologyReference);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 276;
			this.terminologyIdentifier();
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
		this.enterRule(_localctx, 74, CPGLParser.RULE_activityIdentifier);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 278;
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
		this.enterRule(_localctx, 76, CPGLParser.RULE_activityReference);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 280;
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
		this.enterRule(_localctx, 78, CPGLParser.RULE_conceptIdentifier);
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
	public conceptReference(): ConceptReferenceContext {
		let _localctx: ConceptReferenceContext = new ConceptReferenceContext(this._ctx, this.state);
		this.enterRule(_localctx, 80, CPGLParser.RULE_conceptReference);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 284;
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
		this.enterRule(_localctx, 82, CPGLParser.RULE_patternIdentifier);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 286;
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
		this.enterRule(_localctx, 84, CPGLParser.RULE_patternReference);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 288;
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
	public stringLiteral(): StringLiteralContext {
		let _localctx: StringLiteralContext = new StringLiteralContext(this._ctx, this.state);
		this.enterRule(_localctx, 86, CPGLParser.RULE_stringLiteral);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 290;
			_la = this._input.LA(1);
			if (!(_la === CPGLParser.QUOTED_STRING || _la === CPGLParser.STRING)) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
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

	public static readonly _serializedATN: string =
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x033\u0127\x04\x02" +
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
		"q\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x05\x06y\n\x06\x03\x07\x03\x07" +
		"\x03\x07\x03\b\x03\b\x05\b\x80\n\b\x03\b\x06\b\x83\n\b\r\b\x0E\b\x84\x03" +
		"\b\x03\b\x03\t\x03\t\x05\t\x8B\n\t\x03\t\x03\t\x03\n\x03\n\x05\n\x91\n" +
		"\n\x03\v\x03\v\x05\v\x95\n\v\x03\v\x03\v\x03\f\x03\f\x03\f\x03\r\x03\r" +
		"\x03\r\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x05\x0E\xA4\n\x0E\x03\x0E" +
		"\x03\x0E\x03\x0F\x03\x0F\x03\x0F\x03\x10\x03\x10\x03\x11\x03\x11\x03\x11" +
		"\x03\x11\x03\x11\x03\x12\x03\x12\x03\x12\x03\x12\x03\x12\x03\x12\x05\x12" +
		"\xB8\n\x12\x03\x12\x03\x12\x03\x13\x03\x13\x03\x13\x03\x13\x03\x13\x03" +
		"\x13\x03\x14\x03\x14\x03\x14\x05\x14\xC5\n\x14\x03\x14\x03\x14\x05\x14" +
		"\xC9\n\x14\x03\x15\x03\x15\x03\x15\x03\x15\x03\x15\x03\x16\x03\x16\x03" +
		"\x16\x03\x16\x03\x16\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x18\x03" +
		"\x18\x03\x18\x03\x18\x03\x18\x03\x19\x03\x19\x03\x19\x03\x19\x03\x19\x03" +
		"\x1A\x03\x1A\x05\x1A\xE6\n\x1A\x03\x1B\x05\x1B\xE9\n\x1B\x03\x1B\x03\x1B" +
		"\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x03\x1D\x03\x1D\x03\x1E\x03\x1E\x03\x1E" +
		"\x07\x1E\xF6\n\x1E\f\x1E\x0E\x1E\xF9\v\x1E\x03\x1F\x03\x1F\x03\x1F\x07" +
		"\x1F\xFE\n\x1F\f\x1F\x0E\x1F\u0101\v\x1F\x03 \x03 \x03 \x05 \u0106\n " +
		"\x03!\x03!\x03!\x03!\x03!\x05!\u010D\n!\x03\"\x03\"\x03#\x03#\x03$\x03" +
		"$\x03%\x03%\x03&\x03&\x03\'\x03\'\x03(\x03(\x03)\x03)\x03*\x03*\x03+\x03" +
		"+\x03,\x03,\x03-\x03-\x03-\x02\x02\x02.\x02\x02\x04\x02\x06\x02\b\x02" +
		"\n\x02\f\x02\x0E\x02\x10\x02\x12\x02\x14\x02\x16\x02\x18\x02\x1A\x02\x1C" +
		"\x02\x1E\x02 \x02\"\x02$\x02&\x02(\x02*\x02,\x02.\x020\x022\x024\x026" +
		"\x028\x02:\x02<\x02>\x02@\x02B\x02D\x02F\x02H\x02J\x02L\x02N\x02P\x02" +
		"R\x02T\x02V\x02X\x02\x02\x04\x03\x02\x1B\x1C\x03\x02#$\x02\u0110\x02]" +
		"\x03\x02\x02\x02\x04f\x03\x02\x02\x02\x06h\x03\x02\x02\x02\bo\x03\x02" +
		"\x02\x02\ns\x03\x02\x02\x02\fz\x03\x02\x02\x02\x0E}\x03\x02\x02\x02\x10" +
		"\x8A\x03\x02\x02\x02\x12\x90\x03\x02\x02\x02\x14\x94\x03\x02\x02\x02\x16" +
		"\x98\x03\x02\x02\x02\x18\x9B\x03\x02\x02\x02\x1A\x9E\x03\x02\x02\x02\x1C" +
		"\xA7\x03\x02\x02\x02\x1E\xAA\x03\x02\x02\x02 \xAC\x03\x02\x02\x02\"\xB1" +
		"\x03\x02\x02\x02$\xBB\x03\x02\x02\x02&\xC1\x03\x02\x02\x02(\xCA\x03\x02" +
		"\x02\x02*\xCF\x03\x02\x02\x02,\xD4\x03\x02\x02\x02.\xD9\x03\x02\x02\x02" +
		"0\xDE\x03\x02\x02\x022\xE5\x03\x02\x02\x024\xE8\x03\x02\x02\x026\xEC\x03" +
		"\x02\x02\x028\xF0\x03\x02\x02\x02:\xF2\x03\x02\x02\x02<\xFA\x03\x02\x02" +
		"\x02>\u0105\x03\x02\x02\x02@\u010C\x03\x02\x02\x02B\u010E\x03\x02\x02" +
		"\x02D\u0110\x03\x02\x02\x02F\u0112\x03\x02\x02\x02H\u0114\x03\x02\x02" +
		"\x02J\u0116\x03\x02\x02\x02L\u0118\x03\x02\x02\x02N\u011A\x03\x02\x02" +
		"\x02P\u011C\x03\x02\x02\x02R\u011E\x03\x02\x02\x02T\u0120\x03\x02\x02" +
		"\x02V\u0122\x03\x02\x02\x02X\u0124\x03\x02\x02\x02Z\\\x05\x04\x03\x02" +
		"[Z\x03\x02\x02\x02\\_\x03\x02\x02\x02][\x03\x02\x02\x02]^\x03\x02\x02" +
		"\x02^`\x03\x02\x02\x02_]\x03\x02\x02\x02`a\x07\x02\x02\x03a\x03\x03\x02" +
		"\x02\x02bg\x05\x06\x04\x02cg\x05\x1A\x0E\x02dg\x05\"\x12\x02eg\x05$\x13" +
		"\x02fb\x03\x02\x02\x02fc\x03\x02\x02\x02fd\x03\x02\x02\x02fe\x03\x02\x02" +
		"\x02g\x05\x03\x02\x02\x02hi\x07\x1D\x02\x02ij\x05D#\x02jk\x07\x1F\x02" +
		"\x02kl\x05\b\x05\x02lm\x07\f\x02\x02m\x07\x03\x02\x02\x02np\x05\n\x06" +
		"\x02on\x03\x02\x02\x02pq\x03\x02\x02\x02qo\x03\x02\x02\x02qr\x03\x02\x02" +
		"\x02r\t\x03\x02\x02\x02st\x07\x19\x02\x02tu\x05R*\x02ux\x07\x1A\x02\x02" +
		"vy\x05\x0E\b\x02wy\x05\x10\t\x02xv\x03\x02\x02\x02xw\x03\x02\x02\x02y" +
		"\v\x03\x02\x02\x02z{\t\x02\x02\x02{|\x07\x1F\x02\x02|\r\x03\x02\x02\x02" +
		"}\x7F\x07\x1F\x02\x02~\x80\x05\f\x07\x02\x7F~\x03\x02\x02\x02\x7F\x80" +
		"\x03\x02\x02\x02\x80\x82\x03\x02\x02\x02\x81\x83\x05\x12\n\x02\x82\x81" +
		"\x03\x02\x02\x02\x83\x84\x03\x02\x02\x02\x84\x82\x03\x02\x02\x02\x84\x85" +
		"\x03\x02\x02\x02\x85\x86\x03\x02\x02\x02\x86\x87\x07\f\x02\x02\x87\x0F" +
		"\x03\x02\x02\x02\x88\x8B\x05\x16\f\x02\x89\x8B\x05\x18\r\x02\x8A\x88\x03" +
		"\x02\x02\x02\x8A\x89\x03\x02\x02\x02\x8B\x8C\x03\x02\x02\x02\x8C\x8D\x07" +
		" \x02\x02\x8D\x11\x03\x02\x02\x02\x8E\x91\x05\n\x06\x02\x8F\x91\x05\x14" +
		"\v\x02\x90\x8E\x03\x02\x02\x02\x90\x8F\x03\x02\x02\x02\x91\x13\x03\x02" +
		"\x02\x02\x92\x95\x05\x16\f\x02\x93\x95\x05\x18\r\x02\x94\x92\x03\x02\x02" +
		"\x02\x94\x93\x03\x02\x02\x02\x95\x96\x03\x02\x02\x02\x96\x97\x07 \x02" +
		"\x02\x97\x15\x03\x02\x02\x02\x98\x99\x07\x17\x02\x02\x99\x9A\x05N(\x02" +
		"\x9A\x17\x03\x02\x02\x02\x9B\x9C\x07\x18\x02\x02\x9C\x9D\x05F$\x02\x9D" +
		"\x19\x03\x02\x02\x02\x9E\x9F\x07\x06\x02\x02\x9F\xA3\x05H%\x02\xA0\xA4" +
		"\x05\x1C\x0F\x02\xA1\xA4\x05\x1E\x10\x02\xA2\xA4\x05 \x11\x02\xA3\xA0" +
		"\x03\x02\x02\x02\xA3\xA1\x03\x02\x02\x02\xA3\xA2\x03\x02\x02\x02\xA4\xA5" +
		"\x03\x02\x02\x02\xA5\xA6\x07 \x02\x02\xA6\x1B\x03\x02\x02\x02\xA7\xA8" +
		"\x07\x10\x02\x02\xA8\xA9\x05B\"\x02\xA9\x1D\x03\x02\x02\x02\xAA\xAB\x07" +
		"\x16\x02\x02\xAB\x1F\x03\x02\x02\x02\xAC\xAD\x07\x14\x02\x02\xAD\xAE\x05" +
		"B\"\x02\xAE\xAF\x07\x15\x02\x02\xAF\xB0\x05B\"\x02\xB0!\x03\x02\x02\x02" +
		"\xB1\xB2\x07\x12\x02\x02\xB2\xB3\x05L\'\x02\xB3\xB4\x07\x11\x02\x02\xB4" +
		"\xB7\x07(\x02\x02\xB5\xB6\x07\x13\x02\x02\xB6\xB8\x05J&\x02\xB7\xB5\x03" +
		"\x02\x02\x02\xB7\xB8\x03\x02\x02\x02\xB8\xB9\x03\x02\x02\x02\xB9\xBA\x07" +
		" \x02\x02\xBA#\x03\x02\x02\x02\xBB\xBC\x07\x03\x02\x02\xBC\xBD\x05P)\x02" +
		"\xBD\xBE\x07\x1F\x02\x02\xBE\xBF\x05&\x14\x02\xBF\xC0\x07\f\x02\x02\xC0" +
		"%\x03\x02\x02\x02\xC1\xC2\x05(\x15\x02\xC2\xC4\x05*\x16\x02\xC3\xC5\x05" +
		",\x17\x02\xC4\xC3\x03\x02\x02\x02\xC4\xC5\x03\x02\x02\x02\xC5\xC8\x03" +
		"\x02\x02\x02\xC6\xC9\x05.\x18\x02\xC7\xC9\x050\x19\x02\xC8\xC6\x03\x02" +
		"\x02\x02\xC8\xC7\x03\x02\x02\x02\xC9\'\x03\x02\x02\x02\xCA\xCB\x07\r\x02" +
		"\x02\xCB\xCC\x07\x04\x02\x02\xCC\xCD\x07,\x02\x02\xCD\xCE\x07 \x02\x02" +
		"\xCE)\x03\x02\x02\x02\xCF\xD0\x07\r\x02\x02\xD0\xD1\x07\x05\x02\x02\xD1" +
		"\xD2\x070\x02\x02\xD2\xD3\x07 \x02\x02\xD3+\x03\x02\x02\x02\xD4\xD5\x07" +
		"\r\x02\x02\xD5\xD6\x07\x07\x02\x02\xD6\xD7\x05X-\x02\xD7\xD8\x07 \x02" +
		"\x02\xD8-\x03\x02\x02\x02\xD9\xDA\x07\x0F\x02\x02\xDA\xDB\x07\x0E\x02" +
		"\x02\xDB\xDC\x05J&\x02\xDC\xDD\x07 \x02\x02\xDD/\x03\x02\x02\x02\xDE\xDF" +
		"\x07\b\x02\x02\xDF\xE0\x07\x0E\x02\x02\xE0\xE1\x052\x1A\x02\xE1\xE2\x07" +
		" \x02\x02\xE21\x03\x02\x02\x02\xE3\xE6\x054\x1B\x02\xE4\xE6\x056\x1C\x02" +
		"\xE5\xE3\x03\x02\x02\x02\xE5\xE4\x03\x02\x02\x02\xE63\x03\x02\x02\x02" +
		"\xE7\xE9\x05V,\x02\xE8\xE7\x03\x02\x02\x02\xE8\xE9\x03\x02\x02\x02\xE9" +
		"\xEA\x03\x02\x02\x02\xEA\xEB\x05R*\x02\xEB5\x03\x02\x02\x02\xEC\xED\x07" +
		"!\x02\x02\xED\xEE\x058\x1D\x02\xEE\xEF\x07\"\x02\x02\xEF7\x03\x02\x02" +
		"\x02\xF0\xF1\x05:\x1E\x02\xF19\x03\x02\x02\x02\xF2\xF7\x05<\x1F\x02\xF3" +
		"\xF4\x07\n\x02\x02\xF4\xF6\x05<\x1F\x02\xF5\xF3\x03\x02\x02\x02\xF6\xF9" +
		"\x03\x02\x02\x02\xF7\xF5\x03\x02\x02\x02\xF7\xF8\x03\x02\x02\x02\xF8;" +
		"\x03\x02\x02\x02\xF9\xF7\x03\x02\x02\x02\xFA\xFF\x05> \x02\xFB\xFC\x07" +
		"\t\x02\x02\xFC\xFE\x05> \x02\xFD\xFB\x03\x02\x02\x02\xFE\u0101\x03\x02" +
		"\x02\x02\xFF\xFD\x03\x02\x02\x02\xFF\u0100\x03\x02\x02\x02\u0100=\x03" +
		"\x02\x02\x02\u0101\xFF\x03\x02\x02\x02\u0102\u0103\x07\v\x02\x02\u0103" +
		"\u0106\x05> \x02\u0104\u0106\x05@!\x02\u0105\u0102\x03\x02\x02\x02\u0105" +
		"\u0104\x03\x02\x02\x02\u0106?\x03\x02\x02\x02\u0107\u010D\x05R*\x02\u0108" +
		"\u0109\x07!\x02\x02\u0109\u010A\x058\x1D\x02\u010A\u010B\x07\"\x02\x02" +
		"\u010B\u010D\x03\x02\x02\x02\u010C\u0107\x03\x02\x02\x02\u010C\u0108\x03" +
		"\x02\x02\x02\u010DA\x03\x02\x02\x02\u010E\u010F\x07#\x02\x02\u010FC\x03" +
		"\x02\x02\x02\u0110\u0111\x05B\"\x02\u0111E\x03\x02\x02\x02\u0112\u0113" +
		"\x05D#\x02\u0113G\x03\x02\x02\x02\u0114\u0115\x05B\"\x02\u0115I\x03\x02" +
		"\x02\x02\u0116\u0117\x05H%\x02\u0117K\x03\x02\x02\x02\u0118\u0119\x05" +
		"B\"\x02\u0119M\x03\x02\x02\x02\u011A\u011B\x05L\'\x02\u011BO\x03\x02\x02" +
		"\x02\u011C\u011D\x05B\"\x02\u011DQ\x03\x02\x02\x02\u011E\u011F\x05P)\x02" +
		"\u011FS\x03\x02\x02\x02\u0120\u0121\x05B\"\x02\u0121U\x03\x02\x02\x02" +
		"\u0122\u0123\x05T+\x02\u0123W\x03\x02\x02\x02\u0124\u0125\t\x03\x02\x02" +
		"\u0125Y\x03\x02\x02\x02\x15]fqx\x7F\x84\x8A\x90\x94\xA3\xB7\xC4\xC8\xE5" +
		"\xE8\xF7\xFF\u0105\u010C";
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
}


export class WhenBlockContext extends ParserRuleContext {
	public WHEN(): TerminalNode { return this.getToken(CPGLParser.WHEN, 0); }
	public conceptReference(): ConceptReferenceContext {
		return this.getRuleContext(0, ConceptReferenceContext);
	}
	public THEN(): TerminalNode { return this.getToken(CPGLParser.THEN, 0); }
	public blockBody(): BlockBodyContext | undefined {
		return this.tryGetRuleContext(0, BlockBodyContext);
	}
	public singleActionStatement(): SingleActionStatementContext | undefined {
		return this.tryGetRuleContext(0, SingleActionStatementContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_whenBlock; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterWhenBlock) {
			listener.enterWhenBlock(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitWhenBlock) {
			listener.exitWhenBlock(this);
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
	public terminologyUnknown(): TerminologyUnknownContext | undefined {
		return this.tryGetRuleContext(0, TerminologyUnknownContext);
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
}


export class TerminologyUnknownContext extends ParserRuleContext {
	public UNKNOWN(): TerminalNode { return this.getToken(CPGLParser.UNKNOWN, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_terminologyUnknown; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterTerminologyUnknown) {
			listener.enterTerminologyUnknown(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitTerminologyUnknown) {
			listener.exitTerminologyUnknown(this);
		}
	}
}


export class TerminologySystemCodeContext extends ParserRuleContext {
	public SYSTEM(): TerminalNode { return this.getToken(CPGLParser.SYSTEM, 0); }
	public identifier(): IdentifierContext[];
	public identifier(i: number): IdentifierContext;
	public identifier(i?: number): IdentifierContext | IdentifierContext[] {
		if (i === undefined) {
			return this.getRuleContexts(IdentifierContext);
		} else {
			return this.getRuleContext(i, IdentifierContext);
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
}


export class ProvenanceLineContext extends ParserRuleContext {
	public HAS(): TerminalNode { return this.getToken(CPGLParser.HAS, 0); }
	public PROVENANCE(): TerminalNode { return this.getToken(CPGLParser.PROVENANCE, 0); }
	public stringLiteral(): StringLiteralContext {
		return this.getRuleContext(0, StringLiteralContext);
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
}


export class TerminologyReferenceContext extends ParserRuleContext {
	public terminologyIdentifier(): TerminologyIdentifierContext {
		return this.getRuleContext(0, TerminologyIdentifierContext);
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
}


export class StringLiteralContext extends ParserRuleContext {
	public STRING(): TerminalNode | undefined { return this.tryGetToken(CPGLParser.STRING, 0); }
	public QUOTED_STRING(): TerminalNode | undefined { return this.tryGetToken(CPGLParser.QUOTED_STRING, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_stringLiteral; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterStringLiteral) {
			listener.enterStringLiteral(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitStringLiteral) {
			listener.exitStringLiteral(this);
		}
	}
}


