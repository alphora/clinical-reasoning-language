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
	public static readonly DONE = 9;
	public static readonly HAS = 10;
	public static readonly BY = 11;
	public static readonly CODED = 12;
	public static readonly VALUESET = 13;
	public static readonly PERFORM = 14;
	public static readonly ACTIVITY = 15;
	public static readonly OF = 16;
	public static readonly SYSTEM = 17;
	public static readonly CODE = 18;
	public static readonly UNKNOWN = 19;
	public static readonly DO = 20;
	public static readonly USE = 21;
	public static readonly WHEN = 22;
	public static readonly THEN = 23;
	public static readonly ANY = 24;
	public static readonly ALL = 25;
	public static readonly DECISION = 26;
	public static readonly ERROR = 27;
	public static readonly COLON = 28;
	public static readonly DOT = 29;
	public static readonly LPAREN = 30;
	public static readonly RPAREN = 31;
	public static readonly STRING = 32;
	public static readonly IDENTIFIER = 33;
	public static readonly WS = 34;
	public static readonly COMMENT = 35;
	public static readonly COMMENT_BLOCK = 36;
	public static readonly ACTIVITY_TYPE = 37;
	public static readonly ACTIVITY_WS = 38;
	public static readonly ACTIVITY_COMMENT_BLOCK = 39;
	public static readonly ACTIVITY_ErrorChar = 40;
	public static readonly CONCEPT_TYPE = 41;
	public static readonly CONCEPT_WS = 42;
	public static readonly CONCEPT_COMMENT_BLOCK = 43;
	public static readonly CONCEPT_ErrorChar = 44;
	public static readonly CONCEPT_VALUE_TYPE = 45;
	public static readonly VALUE_TYPE_WS = 46;
	public static readonly VALUE_TYPE_COMMENT_BLOCK = 47;
	public static readonly VALUE_TYPE_ErrorChar = 48;
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
	public static readonly RULE_inferredByPattern = 25;
	public static readonly RULE_inferredByExpr = 26;
	public static readonly RULE_expr = 27;
	public static readonly RULE_orExpr = 28;
	public static readonly RULE_andExpr = 29;
	public static readonly RULE_atom = 30;
	public static readonly RULE_identifier = 31;
	public static readonly RULE_stringLiteral = 32;
	// tslint:disable:no-trailing-whitespace
	public static readonly ruleNames: string[] = [
		"cpgl", "statement", "decisionStatement", "decisionBody", "whenBlock", 
		"anyOrAllClause", "blockBody", "singleActionStatement", "blockStatement", 
		"actionStatement", "doStatement", "useStatement", "terminologyStatement", 
		"terminologyValueset", "terminologyUnknown", "terminologySystemCode", 
		"activityStatement", "conceptStatement", "conceptBody", "hasTypeLine", 
		"hasValueTypeLine", "provenanceLine", "codedByLine", "inferredByLine", 
		"inferredBody", "inferredByPattern", "inferredByExpr", "expr", "orExpr", 
		"andExpr", "atom", "identifier", "stringLiteral",
	];

	private static readonly _LITERAL_NAMES: Array<string | undefined> = [
		undefined, "'concept'", "'type'", "'valuetype'", "'terminology'", "'provenance'", 
		"'inferred'", "'and'", "'or'", "'done'", "'has'", "'by'", "'coded'", "'valueset'", 
		"'perform'", "'activity'", "'of'", "'system'", "'code'", "'unknown'", 
		"'do'", "'use'", "'when'", "'then'", "'any'", "'all'", "'decision'", "'error'", 
		"':'", "'.'", "'('", "')'",
	];
	private static readonly _SYMBOLIC_NAMES: Array<string | undefined> = [
		undefined, "CONCEPT", "TYPE", "VALUETYPE", "TERMINOLOGY", "PROVENANCE", 
		"INFERRED", "AND", "OR", "DONE", "HAS", "BY", "CODED", "VALUESET", "PERFORM", 
		"ACTIVITY", "OF", "SYSTEM", "CODE", "UNKNOWN", "DO", "USE", "WHEN", "THEN", 
		"ANY", "ALL", "DECISION", "ERROR", "COLON", "DOT", "LPAREN", "RPAREN", 
		"STRING", "IDENTIFIER", "WS", "COMMENT", "COMMENT_BLOCK", "ACTIVITY_TYPE", 
		"ACTIVITY_WS", "ACTIVITY_COMMENT_BLOCK", "ACTIVITY_ErrorChar", "CONCEPT_TYPE", 
		"CONCEPT_WS", "CONCEPT_COMMENT_BLOCK", "CONCEPT_ErrorChar", "CONCEPT_VALUE_TYPE", 
		"VALUE_TYPE_WS", "VALUE_TYPE_COMMENT_BLOCK", "VALUE_TYPE_ErrorChar",
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
			this.state = 69;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input, 0, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					{
					{
					this.state = 66;
					this.statement();
					}
					}
				}
				this.state = 71;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 0, this._ctx);
			}
			this.state = 72;
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
			this.state = 78;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 1, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 74;
				this.decisionStatement();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 75;
				this.terminologyStatement();
				}
				break;

			case 3:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 76;
				this.activityStatement();
				}
				break;

			case 4:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 77;
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
			this.state = 80;
			this.match(CPGLParser.DECISION);
			this.state = 81;
			this.identifier();
			this.state = 82;
			this.match(CPGLParser.COLON);
			this.state = 83;
			this.decisionBody();
			this.state = 84;
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
			this.state = 87;
			this._errHandler.sync(this);
			_alt = 1;
			do {
				switch (_alt) {
				case 1:
					{
					{
					this.state = 86;
					this.whenBlock();
					}
					}
					break;
				default:
					throw new NoViableAltException(this);
				}
				this.state = 89;
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
			this.state = 91;
			this.match(CPGLParser.WHEN);
			this.state = 92;
			this.identifier();
			this.state = 93;
			this.match(CPGLParser.THEN);
			this.state = 96;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 3, this._ctx) ) {
			case 1:
				{
				this.state = 94;
				this.blockBody();
				}
				break;

			case 2:
				{
				this.state = 95;
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
			this.state = 98;
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
			this.state = 99;
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
			this.state = 101;
			this.match(CPGLParser.COLON);
			{
			this.state = 103;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 4, this._ctx) ) {
			case 1:
				{
				this.state = 102;
				this.anyOrAllClause();
				}
				break;
			}
			this.state = 106;
			this._errHandler.sync(this);
			_alt = 1;
			do {
				switch (_alt) {
				case 1:
					{
					{
					this.state = 105;
					this.blockStatement();
					}
					}
					break;
				default:
					throw new NoViableAltException(this);
				}
				this.state = 108;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 5, this._ctx);
			} while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER);
			}
			this.state = 110;
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
			this.state = 114;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 6, this._ctx) ) {
			case 1:
				{
				this.state = 112;
				this.doStatement();
				}
				break;

			case 2:
				{
				this.state = 113;
				this.useStatement();
				}
				break;
			}
			this.state = 116;
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
			this.state = 120;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 7, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 118;
				this.whenBlock();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 119;
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
			this.state = 124;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 8, this._ctx) ) {
			case 1:
				{
				this.state = 122;
				this.doStatement();
				}
				break;

			case 2:
				{
				this.state = 123;
				this.useStatement();
				}
				break;
			}
			this.state = 126;
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
			this.state = 128;
			this.match(CPGLParser.DO);
			this.state = 129;
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
	public useStatement(): UseStatementContext {
		let _localctx: UseStatementContext = new UseStatementContext(this._ctx, this.state);
		this.enterRule(_localctx, 22, CPGLParser.RULE_useStatement);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 131;
			this.match(CPGLParser.USE);
			this.state = 132;
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
	public terminologyStatement(): TerminologyStatementContext {
		let _localctx: TerminologyStatementContext = new TerminologyStatementContext(this._ctx, this.state);
		this.enterRule(_localctx, 24, CPGLParser.RULE_terminologyStatement);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 134;
			this.match(CPGLParser.TERMINOLOGY);
			this.state = 135;
			this.identifier();
			this.state = 139;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 9, this._ctx) ) {
			case 1:
				{
				this.state = 136;
				this.terminologyValueset();
				}
				break;

			case 2:
				{
				this.state = 137;
				this.terminologyUnknown();
				}
				break;

			case 3:
				{
				this.state = 138;
				this.terminologySystemCode();
				}
				break;
			}
			this.state = 141;
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
			this.state = 143;
			this.match(CPGLParser.VALUESET);
			this.state = 144;
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
			this.state = 146;
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
			this.state = 148;
			this.match(CPGLParser.SYSTEM);
			this.state = 149;
			this.identifier();
			this.state = 150;
			this.match(CPGLParser.CODE);
			this.state = 151;
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
			this.state = 153;
			this.match(CPGLParser.ACTIVITY);
			this.state = 154;
			this.identifier();
			this.state = 155;
			this.match(CPGLParser.PERFORM);
			this.state = 156;
			this.match(CPGLParser.ACTIVITY_TYPE);
			this.state = 159;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 10, this._ctx) ) {
			case 1:
				{
				this.state = 157;
				this.match(CPGLParser.OF);
				this.state = 158;
				this.identifier();
				}
				break;
			}
			this.state = 161;
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
			this.state = 163;
			this.match(CPGLParser.CONCEPT);
			this.state = 164;
			this.identifier();
			this.state = 165;
			this.match(CPGLParser.COLON);
			this.state = 166;
			this.conceptBody();
			this.state = 167;
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
			this.state = 169;
			this.hasTypeLine();
			this.state = 170;
			this.hasValueTypeLine();
			this.state = 172;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 11, this._ctx) ) {
			case 1:
				{
				this.state = 171;
				this.provenanceLine();
				}
				break;
			}
			this.state = 176;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 12, this._ctx) ) {
			case 1:
				{
				this.state = 174;
				this.codedByLine();
				}
				break;

			case 2:
				{
				this.state = 175;
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
			this.state = 178;
			this.match(CPGLParser.HAS);
			this.state = 179;
			this.match(CPGLParser.TYPE);
			this.state = 180;
			this.match(CPGLParser.CONCEPT_TYPE);
			this.state = 181;
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
			this.state = 183;
			this.match(CPGLParser.HAS);
			this.state = 184;
			this.match(CPGLParser.VALUETYPE);
			this.state = 185;
			this.match(CPGLParser.CONCEPT_VALUE_TYPE);
			this.state = 186;
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
			this.state = 188;
			this.match(CPGLParser.HAS);
			this.state = 189;
			this.match(CPGLParser.PROVENANCE);
			this.state = 190;
			this.stringLiteral();
			this.state = 191;
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
			this.state = 193;
			this.match(CPGLParser.CODED);
			this.state = 194;
			this.match(CPGLParser.BY);
			this.state = 195;
			this.identifier();
			this.state = 196;
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
			this.state = 198;
			this.match(CPGLParser.INFERRED);
			this.state = 199;
			this.match(CPGLParser.BY);
			this.state = 200;
			this.inferredBody();
			this.state = 201;
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
			this.state = 205;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 13, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 203;
				this.inferredByExpr();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 204;
				this.inferredByPattern();
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
	public inferredByPattern(): InferredByPatternContext {
		let _localctx: InferredByPatternContext = new InferredByPatternContext(this._ctx, this.state);
		this.enterRule(_localctx, 50, CPGLParser.RULE_inferredByPattern);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 208;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 14, this._ctx) ) {
			case 1:
				{
				this.state = 207;
				this.identifier();
				}
				break;
			}
			this.state = 210;
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
	public inferredByExpr(): InferredByExprContext {
		let _localctx: InferredByExprContext = new InferredByExprContext(this._ctx, this.state);
		this.enterRule(_localctx, 52, CPGLParser.RULE_inferredByExpr);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 212;
			this.match(CPGLParser.LPAREN);
			this.state = 213;
			this.expr();
			this.state = 214;
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
	public expr(): ExprContext {
		let _localctx: ExprContext = new ExprContext(this._ctx, this.state);
		this.enterRule(_localctx, 54, CPGLParser.RULE_expr);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 216;
			this.orExpr();
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
	public orExpr(): OrExprContext {
		let _localctx: OrExprContext = new OrExprContext(this._ctx, this.state);
		this.enterRule(_localctx, 56, CPGLParser.RULE_orExpr);
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 218;
			this.andExpr();
			this.state = 223;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input, 15, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					{
					{
					this.state = 219;
					this.match(CPGLParser.OR);
					this.state = 220;
					this.andExpr();
					}
					}
				}
				this.state = 225;
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
	public andExpr(): AndExprContext {
		let _localctx: AndExprContext = new AndExprContext(this._ctx, this.state);
		this.enterRule(_localctx, 58, CPGLParser.RULE_andExpr);
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 226;
			this.atom();
			this.state = 231;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input, 16, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					{
					{
					this.state = 227;
					this.match(CPGLParser.AND);
					this.state = 228;
					this.atom();
					}
					}
				}
				this.state = 233;
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
	public atom(): AtomContext {
		let _localctx: AtomContext = new AtomContext(this._ctx, this.state);
		this.enterRule(_localctx, 60, CPGLParser.RULE_atom);
		try {
			this.state = 239;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 17, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 234;
				this.identifier();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 235;
				this.match(CPGLParser.LPAREN);
				this.state = 236;
				this.orExpr();
				this.state = 237;
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
			this.state = 241;
			this.match(CPGLParser.STRING);
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
		this.enterRule(_localctx, 64, CPGLParser.RULE_stringLiteral);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 243;
			this.match(CPGLParser.STRING);
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
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x032\xF8\x04\x02" +
		"\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04\x07" +
		"\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r\x04" +
		"\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11\t\x11\x04\x12\t\x12\x04" +
		"\x13\t\x13\x04\x14\t\x14\x04\x15\t\x15\x04\x16\t\x16\x04\x17\t\x17\x04" +
		"\x18\t\x18\x04\x19\t\x19\x04\x1A\t\x1A\x04\x1B\t\x1B\x04\x1C\t\x1C\x04" +
		"\x1D\t\x1D\x04\x1E\t\x1E\x04\x1F\t\x1F\x04 \t \x04!\t!\x04\"\t\"\x03\x02" +
		"\x07\x02F\n\x02\f\x02\x0E\x02I\v\x02\x03\x02\x03\x02\x03\x03\x03\x03\x03" +
		"\x03\x03\x03\x05\x03Q\n\x03\x03\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03" +
		"\x04\x03\x05\x06\x05Z\n\x05\r\x05\x0E\x05[\x03\x06\x03\x06\x03\x06\x03" +
		"\x06\x03\x06\x05\x06c\n\x06\x03\x07\x03\x07\x03\x07\x03\b\x03\b\x05\b" +
		"j\n\b\x03\b\x06\bm\n\b\r\b\x0E\bn\x03\b\x03\b\x03\t\x03\t\x05\tu\n\t\x03" +
		"\t\x03\t\x03\n\x03\n\x05\n{\n\n\x03\v\x03\v\x05\v\x7F\n\v\x03\v\x03\v" +
		"\x03\f\x03\f\x03\f\x03\r\x03\r\x03\r\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03" +
		"\x0E\x05\x0E\x8E\n\x0E\x03\x0E\x03\x0E\x03\x0F\x03\x0F\x03\x0F\x03\x10" +
		"\x03\x10\x03\x11\x03\x11\x03\x11\x03\x11\x03\x11\x03\x12\x03\x12\x03\x12" +
		"\x03\x12\x03\x12\x03\x12\x05\x12\xA2\n\x12\x03\x12\x03\x12\x03\x13\x03" +
		"\x13\x03\x13\x03\x13\x03\x13\x03\x13\x03\x14\x03\x14\x03\x14\x05\x14\xAF" +
		"\n\x14\x03\x14\x03\x14\x05\x14\xB3\n\x14\x03\x15\x03\x15\x03\x15\x03\x15" +
		"\x03\x15\x03\x16\x03\x16\x03\x16\x03\x16\x03\x16\x03\x17\x03\x17\x03\x17" +
		"\x03\x17\x03\x17\x03\x18\x03\x18\x03\x18\x03\x18\x03\x18\x03\x19\x03\x19" +
		"\x03\x19\x03\x19\x03\x19\x03\x1A\x03\x1A\x05\x1A\xD0\n\x1A\x03\x1B\x05" +
		"\x1B\xD3\n\x1B\x03\x1B\x03\x1B\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x03\x1D" +
		"\x03\x1D\x03\x1E\x03\x1E\x03\x1E\x07\x1E\xE0\n\x1E\f\x1E\x0E\x1E\xE3\v" +
		"\x1E\x03\x1F\x03\x1F\x03\x1F\x07\x1F\xE8\n\x1F\f\x1F\x0E\x1F\xEB\v\x1F" +
		"\x03 \x03 \x03 \x03 \x03 \x05 \xF2\n \x03!\x03!\x03\"\x03\"\x03\"\x02" +
		"\x02\x02#\x02\x02\x04\x02\x06\x02\b\x02\n\x02\f\x02\x0E\x02\x10\x02\x12" +
		"\x02\x14\x02\x16\x02\x18\x02\x1A\x02\x1C\x02\x1E\x02 \x02\"\x02$\x02&" +
		"\x02(\x02*\x02,\x02.\x020\x022\x024\x026\x028\x02:\x02<\x02>\x02@\x02" +
		"B\x02\x02\x03\x03\x02\x1A\x1B\x02\xEB\x02G\x03\x02\x02\x02\x04P\x03\x02" +
		"\x02\x02\x06R\x03\x02\x02\x02\bY\x03\x02\x02\x02\n]\x03\x02\x02\x02\f" +
		"d\x03\x02\x02\x02\x0Eg\x03\x02\x02\x02\x10t\x03\x02\x02\x02\x12z\x03\x02" +
		"\x02\x02\x14~\x03\x02\x02\x02\x16\x82\x03\x02\x02\x02\x18\x85\x03\x02" +
		"\x02\x02\x1A\x88\x03\x02\x02\x02\x1C\x91\x03\x02\x02\x02\x1E\x94\x03\x02" +
		"\x02\x02 \x96\x03\x02\x02\x02\"\x9B\x03\x02\x02\x02$\xA5\x03\x02\x02\x02" +
		"&\xAB\x03\x02\x02\x02(\xB4\x03\x02\x02\x02*\xB9\x03\x02\x02\x02,\xBE\x03" +
		"\x02\x02\x02.\xC3\x03\x02\x02\x020\xC8\x03\x02\x02\x022\xCF\x03\x02\x02" +
		"\x024\xD2\x03\x02\x02\x026\xD6\x03\x02\x02\x028\xDA\x03\x02\x02\x02:\xDC" +
		"\x03\x02\x02\x02<\xE4\x03\x02\x02\x02>\xF1\x03\x02\x02\x02@\xF3\x03\x02" +
		"\x02\x02B\xF5\x03\x02\x02\x02DF\x05\x04\x03\x02ED\x03\x02\x02\x02FI\x03" +
		"\x02\x02\x02GE\x03\x02\x02\x02GH\x03\x02\x02\x02HJ\x03\x02\x02\x02IG\x03" +
		"\x02\x02\x02JK\x07\x02\x02\x03K\x03\x03\x02\x02\x02LQ\x05\x06\x04\x02" +
		"MQ\x05\x1A\x0E\x02NQ\x05\"\x12\x02OQ\x05$\x13\x02PL\x03\x02\x02\x02PM" +
		"\x03\x02\x02\x02PN\x03\x02\x02\x02PO\x03\x02\x02\x02Q\x05\x03\x02\x02" +
		"\x02RS\x07\x1C\x02\x02ST\x05@!\x02TU\x07\x1E\x02\x02UV\x05\b\x05\x02V" +
		"W\x07\v\x02\x02W\x07\x03\x02\x02\x02XZ\x05\n\x06\x02YX\x03\x02\x02\x02" +
		"Z[\x03\x02\x02\x02[Y\x03\x02\x02\x02[\\\x03\x02\x02\x02\\\t\x03\x02\x02" +
		"\x02]^\x07\x18\x02\x02^_\x05@!\x02_b\x07\x19\x02\x02`c\x05\x0E\b\x02a" +
		"c\x05\x10\t\x02b`\x03\x02\x02\x02ba\x03\x02\x02\x02c\v\x03\x02\x02\x02" +
		"de\t\x02\x02\x02ef\x07\x1E\x02\x02f\r\x03\x02\x02\x02gi\x07\x1E\x02\x02" +
		"hj\x05\f\x07\x02ih\x03\x02\x02\x02ij\x03\x02\x02\x02jl\x03\x02\x02\x02" +
		"km\x05\x12\n\x02lk\x03\x02\x02\x02mn\x03\x02\x02\x02nl\x03\x02\x02\x02" +
		"no\x03\x02\x02\x02op\x03\x02\x02\x02pq\x07\v\x02\x02q\x0F\x03\x02\x02" +
		"\x02ru\x05\x16\f\x02su\x05\x18\r\x02tr\x03\x02\x02\x02ts\x03\x02\x02\x02" +
		"uv\x03\x02\x02\x02vw\x07\x1F\x02\x02w\x11\x03\x02\x02\x02x{\x05\n\x06" +
		"\x02y{\x05\x14\v\x02zx\x03\x02\x02\x02zy\x03\x02\x02\x02{\x13\x03\x02" +
		"\x02\x02|\x7F\x05\x16\f\x02}\x7F\x05\x18\r\x02~|\x03\x02\x02\x02~}\x03" +
		"\x02\x02\x02\x7F\x80\x03\x02\x02\x02\x80\x81\x07\x1F\x02\x02\x81\x15\x03" +
		"\x02\x02\x02\x82\x83\x07\x16\x02\x02\x83\x84\x05@!\x02\x84\x17\x03\x02" +
		"\x02\x02\x85\x86\x07\x17\x02\x02\x86\x87\x05@!\x02\x87\x19\x03\x02\x02" +
		"\x02\x88\x89\x07\x06\x02\x02\x89\x8D\x05@!\x02\x8A\x8E\x05\x1C\x0F\x02" +
		"\x8B\x8E\x05\x1E\x10\x02\x8C\x8E\x05 \x11\x02\x8D\x8A\x03\x02\x02\x02" +
		"\x8D\x8B\x03\x02\x02\x02\x8D\x8C\x03\x02\x02\x02\x8E\x8F\x03\x02\x02\x02" +
		"\x8F\x90\x07\x1F\x02\x02\x90\x1B\x03\x02\x02\x02\x91\x92\x07\x0F\x02\x02" +
		"\x92\x93\x05@!\x02\x93\x1D\x03\x02\x02\x02\x94\x95\x07\x15\x02\x02\x95" +
		"\x1F\x03\x02\x02\x02\x96\x97\x07\x13\x02\x02\x97\x98\x05@!\x02\x98\x99" +
		"\x07\x14\x02\x02\x99\x9A\x05@!\x02\x9A!\x03\x02\x02\x02\x9B\x9C\x07\x11" +
		"\x02\x02\x9C\x9D\x05@!\x02\x9D\x9E\x07\x10\x02\x02\x9E\xA1\x07\'\x02\x02" +
		"\x9F\xA0\x07\x12\x02\x02\xA0\xA2\x05@!\x02\xA1\x9F\x03\x02\x02\x02\xA1" +
		"\xA2\x03\x02\x02\x02\xA2\xA3\x03\x02\x02\x02\xA3\xA4\x07\x1F\x02\x02\xA4" +
		"#\x03\x02\x02\x02\xA5\xA6\x07\x03\x02\x02\xA6\xA7\x05@!\x02\xA7\xA8\x07" +
		"\x1E\x02\x02\xA8\xA9\x05&\x14\x02\xA9\xAA\x07\v\x02\x02\xAA%\x03\x02\x02" +
		"\x02\xAB\xAC\x05(\x15\x02\xAC\xAE\x05*\x16\x02\xAD\xAF\x05,\x17\x02\xAE" +
		"\xAD\x03\x02\x02\x02\xAE\xAF\x03\x02\x02\x02\xAF\xB2\x03\x02\x02\x02\xB0" +
		"\xB3\x05.\x18\x02\xB1\xB3\x050\x19\x02\xB2\xB0\x03\x02\x02\x02\xB2\xB1" +
		"\x03\x02\x02\x02\xB3\'\x03\x02\x02\x02\xB4\xB5\x07\f\x02\x02\xB5\xB6\x07" +
		"\x04\x02\x02\xB6\xB7\x07+\x02\x02\xB7\xB8\x07\x1F\x02\x02\xB8)\x03\x02" +
		"\x02\x02\xB9\xBA\x07\f\x02\x02\xBA\xBB\x07\x05\x02\x02\xBB\xBC\x07/\x02" +
		"\x02\xBC\xBD\x07\x1F\x02\x02\xBD+\x03\x02\x02\x02\xBE\xBF\x07\f\x02\x02" +
		"\xBF\xC0\x07\x07\x02\x02\xC0\xC1\x05B\"\x02\xC1\xC2\x07\x1F\x02\x02\xC2" +
		"-\x03\x02\x02\x02\xC3\xC4\x07\x0E\x02\x02\xC4\xC5\x07\r\x02\x02\xC5\xC6" +
		"\x05@!\x02\xC6\xC7\x07\x1F\x02\x02\xC7/\x03\x02\x02\x02\xC8\xC9\x07\b" +
		"\x02\x02\xC9\xCA\x07\r\x02\x02\xCA\xCB\x052\x1A\x02\xCB\xCC\x07\x1F\x02" +
		"\x02\xCC1\x03\x02\x02\x02\xCD\xD0\x056\x1C\x02\xCE\xD0\x054\x1B\x02\xCF" +
		"\xCD\x03\x02\x02\x02\xCF\xCE\x03\x02\x02\x02\xD03\x03\x02\x02\x02\xD1" +
		"\xD3\x05@!\x02\xD2\xD1\x03\x02\x02\x02\xD2\xD3\x03\x02\x02\x02\xD3\xD4" +
		"\x03\x02\x02\x02\xD4\xD5\x05@!\x02\xD55\x03\x02\x02\x02\xD6\xD7\x07 \x02" +
		"\x02\xD7\xD8\x058\x1D\x02\xD8\xD9\x07!\x02\x02\xD97\x03\x02\x02\x02\xDA" +
		"\xDB\x05:\x1E\x02\xDB9\x03\x02\x02\x02\xDC\xE1\x05<\x1F\x02\xDD\xDE\x07" +
		"\n\x02\x02\xDE\xE0\x05<\x1F\x02\xDF\xDD\x03\x02\x02\x02\xE0\xE3\x03\x02" +
		"\x02\x02\xE1\xDF\x03\x02\x02\x02\xE1\xE2\x03\x02\x02\x02\xE2;\x03\x02" +
		"\x02\x02\xE3\xE1\x03\x02\x02\x02\xE4\xE9\x05> \x02\xE5\xE6\x07\t\x02\x02" +
		"\xE6\xE8\x05> \x02\xE7\xE5\x03\x02\x02\x02\xE8\xEB\x03\x02\x02\x02\xE9" +
		"\xE7\x03\x02\x02\x02\xE9\xEA\x03\x02\x02\x02\xEA=\x03\x02\x02\x02\xEB" +
		"\xE9\x03\x02\x02\x02\xEC\xF2\x05@!\x02\xED\xEE\x07 \x02\x02\xEE\xEF\x05" +
		":\x1E\x02\xEF\xF0\x07!\x02\x02\xF0\xF2\x03\x02\x02\x02\xF1\xEC\x03\x02" +
		"\x02\x02\xF1\xED\x03\x02\x02\x02\xF2?\x03\x02\x02\x02\xF3\xF4\x07\"\x02" +
		"\x02\xF4A\x03\x02\x02\x02\xF5\xF6\x07\"\x02\x02\xF6C\x03\x02\x02\x02\x14" +
		"GP[bintz~\x8D\xA1\xAE\xB2\xCF\xD2\xE1\xE9\xF1";
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
	public identifier(): IdentifierContext {
		return this.getRuleContext(0, IdentifierContext);
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
	public WHEN(): TerminalNode { return this.getToken(CPGLParser.WHEN, 0); }
	public identifier(): IdentifierContext {
		return this.getRuleContext(0, IdentifierContext);
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
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitWhenBlock) {
			return visitor.visitWhenBlock(this);
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
	public whenBlock(): WhenBlockContext | undefined {
		return this.tryGetRuleContext(0, WhenBlockContext);
	}
	public actionStatement(): ActionStatementContext | undefined {
		return this.tryGetRuleContext(0, ActionStatementContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_blockStatement; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterBlockStatement) {
			listener.enterBlockStatement(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitBlockStatement) {
			listener.exitBlockStatement(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitBlockStatement) {
			return visitor.visitBlockStatement(this);
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
	public identifier(): IdentifierContext {
		return this.getRuleContext(0, IdentifierContext);
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
	public identifier(): IdentifierContext {
		return this.getRuleContext(0, IdentifierContext);
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
	public identifier(): IdentifierContext {
		return this.getRuleContext(0, IdentifierContext);
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
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitTerminologyUnknown) {
			return visitor.visitTerminologyUnknown(this);
		} else {
			return visitor.visitChildren(this);
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
	public identifier(): IdentifierContext[];
	public identifier(i: number): IdentifierContext;
	public identifier(i?: number): IdentifierContext | IdentifierContext[] {
		if (i === undefined) {
			return this.getRuleContexts(IdentifierContext);
		} else {
			return this.getRuleContext(i, IdentifierContext);
		}
	}
	public PERFORM(): TerminalNode { return this.getToken(CPGLParser.PERFORM, 0); }
	public ACTIVITY_TYPE(): TerminalNode { return this.getToken(CPGLParser.ACTIVITY_TYPE, 0); }
	public DOT(): TerminalNode { return this.getToken(CPGLParser.DOT, 0); }
	public OF(): TerminalNode | undefined { return this.tryGetToken(CPGLParser.OF, 0); }
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
	public identifier(): IdentifierContext {
		return this.getRuleContext(0, IdentifierContext);
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
	public identifier(): IdentifierContext {
		return this.getRuleContext(0, IdentifierContext);
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
	public inferredByExpr(): InferredByExprContext | undefined {
		return this.tryGetRuleContext(0, InferredByExprContext);
	}
	public inferredByPattern(): InferredByPatternContext | undefined {
		return this.tryGetRuleContext(0, InferredByPatternContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_inferredBody; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterInferredBody) {
			listener.enterInferredBody(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitInferredBody) {
			listener.exitInferredBody(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitInferredBody) {
			return visitor.visitInferredBody(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class InferredByPatternContext extends ParserRuleContext {
	public identifier(): IdentifierContext[];
	public identifier(i: number): IdentifierContext;
	public identifier(i?: number): IdentifierContext | IdentifierContext[] {
		if (i === undefined) {
			return this.getRuleContexts(IdentifierContext);
		} else {
			return this.getRuleContext(i, IdentifierContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_inferredByPattern; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterInferredByPattern) {
			listener.enterInferredByPattern(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitInferredByPattern) {
			listener.exitInferredByPattern(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitInferredByPattern) {
			return visitor.visitInferredByPattern(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class InferredByExprContext extends ParserRuleContext {
	public LPAREN(): TerminalNode { return this.getToken(CPGLParser.LPAREN, 0); }
	public expr(): ExprContext {
		return this.getRuleContext(0, ExprContext);
	}
	public RPAREN(): TerminalNode { return this.getToken(CPGLParser.RPAREN, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_inferredByExpr; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterInferredByExpr) {
			listener.enterInferredByExpr(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitInferredByExpr) {
			listener.exitInferredByExpr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitInferredByExpr) {
			return visitor.visitInferredByExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ExprContext extends ParserRuleContext {
	public orExpr(): OrExprContext {
		return this.getRuleContext(0, OrExprContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_expr; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterExpr) {
			listener.enterExpr(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitExpr) {
			listener.exitExpr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitExpr) {
			return visitor.visitExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class OrExprContext extends ParserRuleContext {
	public andExpr(): AndExprContext[];
	public andExpr(i: number): AndExprContext;
	public andExpr(i?: number): AndExprContext | AndExprContext[] {
		if (i === undefined) {
			return this.getRuleContexts(AndExprContext);
		} else {
			return this.getRuleContext(i, AndExprContext);
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
	public get ruleIndex(): number { return CPGLParser.RULE_orExpr; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterOrExpr) {
			listener.enterOrExpr(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitOrExpr) {
			listener.exitOrExpr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitOrExpr) {
			return visitor.visitOrExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class AndExprContext extends ParserRuleContext {
	public atom(): AtomContext[];
	public atom(i: number): AtomContext;
	public atom(i?: number): AtomContext | AtomContext[] {
		if (i === undefined) {
			return this.getRuleContexts(AtomContext);
		} else {
			return this.getRuleContext(i, AtomContext);
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
	public get ruleIndex(): number { return CPGLParser.RULE_andExpr; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterAndExpr) {
			listener.enterAndExpr(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitAndExpr) {
			listener.exitAndExpr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitAndExpr) {
			return visitor.visitAndExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class AtomContext extends ParserRuleContext {
	public identifier(): IdentifierContext | undefined {
		return this.tryGetRuleContext(0, IdentifierContext);
	}
	public LPAREN(): TerminalNode | undefined { return this.tryGetToken(CPGLParser.LPAREN, 0); }
	public orExpr(): OrExprContext | undefined {
		return this.tryGetRuleContext(0, OrExprContext);
	}
	public RPAREN(): TerminalNode | undefined { return this.tryGetToken(CPGLParser.RPAREN, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_atom; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterAtom) {
			listener.enterAtom(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitAtom) {
			listener.exitAtom(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitAtom) {
			return visitor.visitAtom(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class IdentifierContext extends ParserRuleContext {
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
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


export class StringLiteralContext extends ParserRuleContext {
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
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
	// @Override
	public accept<Result>(visitor: CPGLParserVisitor<Result>): Result {
		if (visitor.visitStringLiteral) {
			return visitor.visitStringLiteral(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


