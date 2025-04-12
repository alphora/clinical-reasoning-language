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
	public static readonly RULE_inferredByConceptReference = 25;
	public static readonly RULE_inferredByDescriptiveLogic = 26;
	public static readonly RULE_logicalNarrative = 27;
	public static readonly RULE_informalOr = 28;
	public static readonly RULE_informalAnd = 29;
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
	public static readonly RULE_stringLiteral = 42;
	// tslint:disable:no-trailing-whitespace
	public static readonly ruleNames: string[] = [
		"cpgl", "statement", "decisionStatement", "decisionBody", "whenBlock", 
		"anyOrAllClause", "blockBody", "singleActionStatement", "blockStatement", 
		"actionStatement", "doStatement", "useStatement", "terminologyStatement", 
		"terminologyValueset", "terminologyUnknown", "terminologySystemCode", 
		"activityStatement", "conceptStatement", "conceptBody", "hasTypeLine", 
		"hasValueTypeLine", "provenanceLine", "codedByLine", "inferredByLine", 
		"inferredBody", "inferredByConceptReference", "inferredByDescriptiveLogic", 
		"logicalNarrative", "informalOr", "informalAnd", "atom", "identifier", 
		"decisionIdentifier", "decisionReference", "terminologyIdentifier", "terminologyReference", 
		"activityIdentifier", "activityReference", "conceptIdentifier", "conceptReference", 
		"patternIdentifier", "patternReference", "stringLiteral",
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
			this.state = 89;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input, 0, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					{
					{
					this.state = 86;
					this.statement();
					}
					}
				}
				this.state = 91;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 0, this._ctx);
			}
			this.state = 92;
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
			this.state = 98;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 1, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 94;
				this.decisionStatement();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 95;
				this.terminologyStatement();
				}
				break;

			case 3:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 96;
				this.activityStatement();
				}
				break;

			case 4:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 97;
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
			this.state = 100;
			this.match(CPGLParser.DECISION);
			this.state = 101;
			this.decisionIdentifier();
			this.state = 102;
			this.match(CPGLParser.COLON);
			this.state = 103;
			this.decisionBody();
			this.state = 104;
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
			this.state = 107;
			this._errHandler.sync(this);
			_alt = 1;
			do {
				switch (_alt) {
				case 1:
					{
					{
					this.state = 106;
					this.whenBlock();
					}
					}
					break;
				default:
					throw new NoViableAltException(this);
				}
				this.state = 109;
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
			this.state = 111;
			this.match(CPGLParser.WHEN);
			this.state = 112;
			this.conceptReference();
			this.state = 113;
			this.match(CPGLParser.THEN);
			this.state = 116;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 3, this._ctx) ) {
			case 1:
				{
				this.state = 114;
				this.blockBody();
				}
				break;

			case 2:
				{
				this.state = 115;
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
			this.state = 118;
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
			this.state = 119;
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
			this.state = 121;
			this.match(CPGLParser.COLON);
			{
			this.state = 123;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 4, this._ctx) ) {
			case 1:
				{
				this.state = 122;
				this.anyOrAllClause();
				}
				break;
			}
			this.state = 126;
			this._errHandler.sync(this);
			_alt = 1;
			do {
				switch (_alt) {
				case 1:
					{
					{
					this.state = 125;
					this.blockStatement();
					}
					}
					break;
				default:
					throw new NoViableAltException(this);
				}
				this.state = 128;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 5, this._ctx);
			} while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER);
			}
			this.state = 130;
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
			this.state = 134;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 6, this._ctx) ) {
			case 1:
				{
				this.state = 132;
				this.doStatement();
				}
				break;

			case 2:
				{
				this.state = 133;
				this.useStatement();
				}
				break;
			}
			this.state = 136;
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
			this.state = 140;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 7, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 138;
				this.whenBlock();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 139;
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
			this.state = 144;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 8, this._ctx) ) {
			case 1:
				{
				this.state = 142;
				this.doStatement();
				}
				break;

			case 2:
				{
				this.state = 143;
				this.useStatement();
				}
				break;
			}
			this.state = 146;
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
			this.state = 148;
			this.match(CPGLParser.DO);
			this.state = 149;
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
			this.state = 151;
			this.match(CPGLParser.USE);
			this.state = 152;
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
			this.state = 154;
			this.match(CPGLParser.TERMINOLOGY);
			this.state = 155;
			this.terminologyIdentifier();
			this.state = 159;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 9, this._ctx) ) {
			case 1:
				{
				this.state = 156;
				this.terminologyValueset();
				}
				break;

			case 2:
				{
				this.state = 157;
				this.terminologyUnknown();
				}
				break;

			case 3:
				{
				this.state = 158;
				this.terminologySystemCode();
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
	public terminologyValueset(): TerminologyValuesetContext {
		let _localctx: TerminologyValuesetContext = new TerminologyValuesetContext(this._ctx, this.state);
		this.enterRule(_localctx, 26, CPGLParser.RULE_terminologyValueset);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 163;
			this.match(CPGLParser.VALUESET);
			this.state = 164;
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
			this.state = 166;
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
			this.state = 168;
			this.match(CPGLParser.SYSTEM);
			this.state = 169;
			this.identifier();
			this.state = 170;
			this.match(CPGLParser.CODE);
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
	public activityStatement(): ActivityStatementContext {
		let _localctx: ActivityStatementContext = new ActivityStatementContext(this._ctx, this.state);
		this.enterRule(_localctx, 32, CPGLParser.RULE_activityStatement);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 173;
			this.match(CPGLParser.ACTIVITY);
			this.state = 174;
			this.activityIdentifier();
			this.state = 175;
			this.match(CPGLParser.PERFORM);
			this.state = 176;
			this.match(CPGLParser.ACTIVITY_TYPE);
			this.state = 179;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 10, this._ctx) ) {
			case 1:
				{
				this.state = 177;
				this.match(CPGLParser.OF);
				this.state = 178;
				this.terminologyReference();
				}
				break;
			}
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
	public conceptStatement(): ConceptStatementContext {
		let _localctx: ConceptStatementContext = new ConceptStatementContext(this._ctx, this.state);
		this.enterRule(_localctx, 34, CPGLParser.RULE_conceptStatement);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 183;
			this.match(CPGLParser.CONCEPT);
			this.state = 184;
			this.conceptIdentifier();
			this.state = 185;
			this.match(CPGLParser.COLON);
			this.state = 186;
			this.conceptBody();
			this.state = 187;
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
			this.state = 189;
			this.hasTypeLine();
			this.state = 190;
			this.hasValueTypeLine();
			this.state = 192;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 11, this._ctx) ) {
			case 1:
				{
				this.state = 191;
				this.provenanceLine();
				}
				break;
			}
			this.state = 196;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 12, this._ctx) ) {
			case 1:
				{
				this.state = 194;
				this.codedByLine();
				}
				break;

			case 2:
				{
				this.state = 195;
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
			this.state = 198;
			this.match(CPGLParser.HAS);
			this.state = 199;
			this.match(CPGLParser.TYPE);
			this.state = 200;
			this.match(CPGLParser.CONCEPT_TYPE);
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
	public hasValueTypeLine(): HasValueTypeLineContext {
		let _localctx: HasValueTypeLineContext = new HasValueTypeLineContext(this._ctx, this.state);
		this.enterRule(_localctx, 40, CPGLParser.RULE_hasValueTypeLine);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 203;
			this.match(CPGLParser.HAS);
			this.state = 204;
			this.match(CPGLParser.VALUETYPE);
			this.state = 205;
			this.match(CPGLParser.CONCEPT_VALUE_TYPE);
			this.state = 206;
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
			this.state = 208;
			this.match(CPGLParser.HAS);
			this.state = 209;
			this.match(CPGLParser.PROVENANCE);
			this.state = 210;
			this.stringLiteral();
			this.state = 211;
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
			this.state = 213;
			this.match(CPGLParser.CODED);
			this.state = 214;
			this.match(CPGLParser.BY);
			this.state = 215;
			this.terminologyReference();
			this.state = 216;
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
			this.state = 218;
			this.match(CPGLParser.INFERRED);
			this.state = 219;
			this.match(CPGLParser.BY);
			this.state = 220;
			this.inferredBody();
			this.state = 221;
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
			this.state = 225;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 13, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 223;
				this.inferredByDescriptiveLogic();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 224;
				this.inferredByConceptReference();
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
			this.state = 228;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 14, this._ctx) ) {
			case 1:
				{
				this.state = 227;
				this.patternReference();
				}
				break;
			}
			this.state = 230;
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
			this.state = 232;
			this.match(CPGLParser.LPAREN);
			this.state = 233;
			this.logicalNarrative();
			this.state = 234;
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
	public logicalNarrative(): LogicalNarrativeContext {
		let _localctx: LogicalNarrativeContext = new LogicalNarrativeContext(this._ctx, this.state);
		this.enterRule(_localctx, 54, CPGLParser.RULE_logicalNarrative);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 236;
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
			this.state = 238;
			this.informalAnd();
			this.state = 243;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input, 15, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					{
					{
					this.state = 239;
					this.match(CPGLParser.OR);
					this.state = 240;
					this.informalAnd();
					}
					}
				}
				this.state = 245;
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
			this.state = 246;
			this.atom();
			this.state = 251;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input, 16, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					{
					{
					this.state = 247;
					this.match(CPGLParser.AND);
					this.state = 248;
					this.atom();
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
	public atom(): AtomContext {
		let _localctx: AtomContext = new AtomContext(this._ctx, this.state);
		this.enterRule(_localctx, 60, CPGLParser.RULE_atom);
		try {
			this.state = 259;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 17, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 254;
				this.conceptReference();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 255;
				this.match(CPGLParser.LPAREN);
				this.state = 256;
				this.logicalNarrative();
				this.state = 257;
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
			this.state = 261;
			this.match(CPGLParser.IDENTIFIER);
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
			this.state = 263;
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
			this.state = 265;
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
			this.state = 267;
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
			this.state = 269;
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
		this.enterRule(_localctx, 72, CPGLParser.RULE_activityIdentifier);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 271;
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
			this.state = 273;
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
			this.state = 275;
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
			this.state = 277;
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
			this.state = 279;
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
			this.state = 281;
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
		this.enterRule(_localctx, 84, CPGLParser.RULE_stringLiteral);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 283;
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
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x032\u0120\x04\x02" +
		"\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04\x07" +
		"\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r\x04" +
		"\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11\t\x11\x04\x12\t\x12\x04" +
		"\x13\t\x13\x04\x14\t\x14\x04\x15\t\x15\x04\x16\t\x16\x04\x17\t\x17\x04" +
		"\x18\t\x18\x04\x19\t\x19\x04\x1A\t\x1A\x04\x1B\t\x1B\x04\x1C\t\x1C\x04" +
		"\x1D\t\x1D\x04\x1E\t\x1E\x04\x1F\t\x1F\x04 \t \x04!\t!\x04\"\t\"\x04#" +
		"\t#\x04$\t$\x04%\t%\x04&\t&\x04\'\t\'\x04(\t(\x04)\t)\x04*\t*\x04+\t+" +
		"\x04,\t,\x03\x02\x07\x02Z\n\x02\f\x02\x0E\x02]\v\x02\x03\x02\x03\x02\x03" +
		"\x03\x03\x03\x03\x03\x03\x03\x05\x03e\n\x03\x03\x04\x03\x04\x03\x04\x03" +
		"\x04\x03\x04\x03\x04\x03\x05\x06\x05n\n\x05\r\x05\x0E\x05o\x03\x06\x03" +
		"\x06\x03\x06\x03\x06\x03\x06\x05\x06w\n\x06\x03\x07\x03\x07\x03\x07\x03" +
		"\b\x03\b\x05\b~\n\b\x03\b\x06\b\x81\n\b\r\b\x0E\b\x82\x03\b\x03\b\x03" +
		"\t\x03\t\x05\t\x89\n\t\x03\t\x03\t\x03\n\x03\n\x05\n\x8F\n\n\x03\v\x03" +
		"\v\x05\v\x93\n\v\x03\v\x03\v\x03\f\x03\f\x03\f\x03\r\x03\r\x03\r\x03\x0E" +
		"\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x05\x0E\xA2\n\x0E\x03\x0E\x03\x0E\x03" +
		"\x0F\x03\x0F\x03\x0F\x03\x10\x03\x10\x03\x11\x03\x11\x03\x11\x03\x11\x03" +
		"\x11\x03\x12\x03\x12\x03\x12\x03\x12\x03\x12\x03\x12\x05\x12\xB6\n\x12" +
		"\x03\x12\x03\x12\x03\x13\x03\x13\x03\x13\x03\x13\x03\x13\x03\x13\x03\x14" +
		"\x03\x14\x03\x14\x05\x14\xC3\n\x14\x03\x14\x03\x14\x05\x14\xC7\n\x14\x03" +
		"\x15\x03\x15\x03\x15\x03\x15\x03\x15\x03\x16\x03\x16\x03\x16\x03\x16\x03" +
		"\x16\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x18\x03\x18\x03\x18\x03" +
		"\x18\x03\x18\x03\x19\x03\x19\x03\x19\x03\x19\x03\x19\x03\x1A\x03\x1A\x05" +
		"\x1A\xE4\n\x1A\x03\x1B\x05\x1B\xE7\n\x1B\x03\x1B\x03\x1B\x03\x1C\x03\x1C" +
		"\x03\x1C\x03\x1C\x03\x1D\x03\x1D\x03\x1E\x03\x1E\x03\x1E\x07\x1E\xF4\n" +
		"\x1E\f\x1E\x0E\x1E\xF7\v\x1E\x03\x1F\x03\x1F\x03\x1F\x07\x1F\xFC\n\x1F" +
		"\f\x1F\x0E\x1F\xFF\v\x1F\x03 \x03 \x03 \x03 \x03 \x05 \u0106\n \x03!\x03" +
		"!\x03\"\x03\"\x03#\x03#\x03$\x03$\x03%\x03%\x03&\x03&\x03\'\x03\'\x03" +
		"(\x03(\x03)\x03)\x03*\x03*\x03+\x03+\x03,\x03,\x03,\x02\x02\x02-\x02\x02" +
		"\x04\x02\x06\x02\b\x02\n\x02\f\x02\x0E\x02\x10\x02\x12\x02\x14\x02\x16" +
		"\x02\x18\x02\x1A\x02\x1C\x02\x1E\x02 \x02\"\x02$\x02&\x02(\x02*\x02,\x02" +
		".\x020\x022\x024\x026\x028\x02:\x02<\x02>\x02@\x02B\x02D\x02F\x02H\x02" +
		"J\x02L\x02N\x02P\x02R\x02T\x02V\x02\x02\x03\x03\x02\x1A\x1B\x02\u0109" +
		"\x02[\x03\x02\x02\x02\x04d\x03\x02\x02\x02\x06f\x03\x02\x02\x02\bm\x03" +
		"\x02\x02\x02\nq\x03\x02\x02\x02\fx\x03\x02\x02\x02\x0E{\x03\x02\x02\x02" +
		"\x10\x88\x03\x02\x02\x02\x12\x8E\x03\x02\x02\x02\x14\x92\x03\x02\x02\x02" +
		"\x16\x96\x03\x02\x02\x02\x18\x99\x03\x02\x02\x02\x1A\x9C\x03\x02\x02\x02" +
		"\x1C\xA5\x03\x02\x02\x02\x1E\xA8\x03\x02\x02\x02 \xAA\x03\x02\x02\x02" +
		"\"\xAF\x03\x02\x02\x02$\xB9\x03\x02\x02\x02&\xBF\x03\x02\x02\x02(\xC8" +
		"\x03\x02\x02\x02*\xCD\x03\x02\x02\x02,\xD2\x03\x02\x02\x02.\xD7\x03\x02" +
		"\x02\x020\xDC\x03\x02\x02\x022\xE3\x03\x02\x02\x024\xE6\x03\x02\x02\x02" +
		"6\xEA\x03\x02\x02\x028\xEE\x03\x02\x02\x02:\xF0\x03\x02\x02\x02<\xF8\x03" +
		"\x02\x02\x02>\u0105\x03\x02\x02\x02@\u0107\x03\x02\x02\x02B\u0109\x03" +
		"\x02\x02\x02D\u010B\x03\x02\x02\x02F\u010D\x03\x02\x02\x02H\u010F\x03" +
		"\x02\x02\x02J\u0111\x03\x02\x02\x02L\u0113\x03\x02\x02\x02N\u0115\x03" +
		"\x02\x02\x02P\u0117\x03\x02\x02\x02R\u0119\x03\x02\x02\x02T\u011B\x03" +
		"\x02\x02\x02V\u011D\x03\x02\x02\x02XZ\x05\x04\x03\x02YX\x03\x02\x02\x02" +
		"Z]\x03\x02\x02\x02[Y\x03\x02\x02\x02[\\\x03\x02\x02\x02\\^\x03\x02\x02" +
		"\x02][\x03\x02\x02\x02^_\x07\x02\x02\x03_\x03\x03\x02\x02\x02`e\x05\x06" +
		"\x04\x02ae\x05\x1A\x0E\x02be\x05\"\x12\x02ce\x05$\x13\x02d`\x03\x02\x02" +
		"\x02da\x03\x02\x02\x02db\x03\x02\x02\x02dc\x03\x02\x02\x02e\x05\x03\x02" +
		"\x02\x02fg\x07\x1C\x02\x02gh\x05B\"\x02hi\x07\x1E\x02\x02ij\x05\b\x05" +
		"\x02jk\x07\v\x02\x02k\x07\x03\x02\x02\x02ln\x05\n\x06\x02ml\x03\x02\x02" +
		"\x02no\x03\x02\x02\x02om\x03\x02\x02\x02op\x03\x02\x02\x02p\t\x03\x02" +
		"\x02\x02qr\x07\x18\x02\x02rs\x05P)\x02sv\x07\x19\x02\x02tw\x05\x0E\b\x02" +
		"uw\x05\x10\t\x02vt\x03\x02\x02\x02vu\x03\x02\x02\x02w\v\x03\x02\x02\x02" +
		"xy\t\x02\x02\x02yz\x07\x1E\x02\x02z\r\x03\x02\x02\x02{}\x07\x1E\x02\x02" +
		"|~\x05\f\x07\x02}|\x03\x02\x02\x02}~\x03\x02\x02\x02~\x80\x03\x02\x02" +
		"\x02\x7F\x81\x05\x12\n\x02\x80\x7F\x03\x02\x02\x02\x81\x82\x03\x02\x02" +
		"\x02\x82\x80\x03\x02\x02\x02\x82\x83\x03\x02\x02\x02\x83\x84\x03\x02\x02" +
		"\x02\x84\x85\x07\v\x02\x02\x85\x0F\x03\x02\x02\x02\x86\x89\x05\x16\f\x02" +
		"\x87\x89\x05\x18\r\x02\x88\x86\x03\x02\x02\x02\x88\x87\x03\x02\x02\x02" +
		"\x89\x8A\x03\x02\x02\x02\x8A\x8B\x07\x1F\x02\x02\x8B\x11\x03\x02\x02\x02" +
		"\x8C\x8F\x05\n\x06\x02\x8D\x8F\x05\x14\v\x02\x8E\x8C\x03\x02\x02\x02\x8E" +
		"\x8D\x03\x02\x02\x02\x8F\x13\x03\x02\x02\x02\x90\x93\x05\x16\f\x02\x91" +
		"\x93\x05\x18\r\x02\x92\x90\x03\x02\x02\x02\x92\x91\x03\x02\x02\x02\x93" +
		"\x94\x03\x02\x02\x02\x94\x95\x07\x1F\x02\x02\x95\x15\x03\x02\x02\x02\x96" +
		"\x97\x07\x16\x02\x02\x97\x98\x05L\'\x02\x98\x17\x03\x02\x02\x02\x99\x9A" +
		"\x07\x17\x02\x02\x9A\x9B\x05D#\x02\x9B\x19\x03\x02\x02\x02\x9C\x9D\x07" +
		"\x06\x02\x02\x9D\xA1\x05F$\x02\x9E\xA2\x05\x1C\x0F\x02\x9F\xA2\x05\x1E" +
		"\x10\x02\xA0\xA2\x05 \x11\x02\xA1\x9E\x03\x02\x02\x02\xA1\x9F\x03\x02" +
		"\x02\x02\xA1\xA0\x03\x02\x02\x02\xA2\xA3\x03\x02\x02\x02\xA3\xA4\x07\x1F" +
		"\x02\x02\xA4\x1B\x03\x02\x02\x02\xA5\xA6\x07\x0F\x02\x02\xA6\xA7\x05@" +
		"!\x02\xA7\x1D\x03\x02\x02\x02\xA8\xA9\x07\x15\x02\x02\xA9\x1F\x03\x02" +
		"\x02\x02\xAA\xAB\x07\x13\x02\x02\xAB\xAC\x05@!\x02\xAC\xAD\x07\x14\x02" +
		"\x02\xAD\xAE\x05@!\x02\xAE!\x03\x02\x02\x02\xAF\xB0\x07\x11\x02\x02\xB0" +
		"\xB1\x05J&\x02\xB1\xB2\x07\x10\x02\x02\xB2\xB5\x07\'\x02\x02\xB3\xB4\x07" +
		"\x12\x02\x02\xB4\xB6\x05H%\x02\xB5\xB3\x03\x02\x02\x02\xB5\xB6\x03\x02" +
		"\x02\x02\xB6\xB7\x03\x02\x02\x02\xB7\xB8\x07\x1F\x02\x02\xB8#\x03\x02" +
		"\x02\x02\xB9\xBA\x07\x03\x02\x02\xBA\xBB\x05N(\x02\xBB\xBC\x07\x1E\x02" +
		"\x02\xBC\xBD\x05&\x14\x02\xBD\xBE\x07\v\x02\x02\xBE%\x03\x02\x02\x02\xBF" +
		"\xC0\x05(\x15\x02\xC0\xC2\x05*\x16\x02\xC1\xC3\x05,\x17\x02\xC2\xC1\x03" +
		"\x02\x02\x02\xC2\xC3\x03\x02\x02\x02\xC3\xC6\x03\x02\x02\x02\xC4\xC7\x05" +
		".\x18\x02\xC5\xC7\x050\x19\x02\xC6\xC4\x03\x02\x02\x02\xC6\xC5\x03\x02" +
		"\x02\x02\xC7\'\x03\x02\x02\x02\xC8\xC9\x07\f\x02\x02\xC9\xCA\x07\x04\x02" +
		"\x02\xCA\xCB\x07+\x02\x02\xCB\xCC\x07\x1F\x02\x02\xCC)\x03\x02\x02\x02" +
		"\xCD\xCE\x07\f\x02\x02\xCE\xCF\x07\x05\x02\x02\xCF\xD0\x07/\x02\x02\xD0" +
		"\xD1\x07\x1F\x02\x02\xD1+\x03\x02\x02\x02\xD2\xD3\x07\f\x02\x02\xD3\xD4" +
		"\x07\x07\x02\x02\xD4\xD5\x05V,\x02\xD5\xD6\x07\x1F\x02\x02\xD6-\x03\x02" +
		"\x02\x02\xD7\xD8\x07\x0E\x02\x02\xD8\xD9\x07\r\x02\x02\xD9\xDA\x05H%\x02" +
		"\xDA\xDB\x07\x1F\x02\x02\xDB/\x03\x02\x02\x02\xDC\xDD\x07\b\x02\x02\xDD" +
		"\xDE\x07\r\x02\x02\xDE\xDF\x052\x1A\x02\xDF\xE0\x07\x1F\x02\x02\xE01\x03" +
		"\x02\x02\x02\xE1\xE4\x056\x1C\x02\xE2\xE4\x054\x1B\x02\xE3\xE1\x03\x02" +
		"\x02\x02\xE3\xE2\x03\x02\x02\x02\xE43\x03\x02\x02\x02\xE5\xE7\x05T+\x02" +
		"\xE6\xE5\x03\x02\x02\x02\xE6\xE7\x03\x02\x02\x02\xE7\xE8\x03\x02\x02\x02" +
		"\xE8\xE9\x05P)\x02\xE95\x03\x02\x02\x02\xEA\xEB\x07 \x02\x02\xEB\xEC\x05" +
		"8\x1D\x02\xEC\xED\x07!\x02\x02\xED7\x03\x02\x02\x02\xEE\xEF\x05:\x1E\x02" +
		"\xEF9\x03\x02\x02\x02\xF0\xF5\x05<\x1F\x02\xF1\xF2\x07\n\x02\x02\xF2\xF4" +
		"\x05<\x1F\x02\xF3\xF1\x03\x02\x02\x02\xF4\xF7\x03\x02\x02\x02\xF5\xF3" +
		"\x03\x02\x02\x02\xF5\xF6\x03\x02\x02\x02\xF6;\x03\x02\x02\x02\xF7\xF5" +
		"\x03\x02\x02\x02\xF8\xFD\x05> \x02\xF9\xFA\x07\t\x02\x02\xFA\xFC\x05>" +
		" \x02\xFB\xF9\x03\x02\x02\x02\xFC\xFF\x03\x02\x02\x02\xFD\xFB\x03\x02" +
		"\x02\x02\xFD\xFE\x03\x02\x02\x02\xFE=\x03\x02\x02\x02\xFF\xFD\x03\x02" +
		"\x02\x02\u0100\u0106\x05P)\x02\u0101\u0102\x07 \x02\x02\u0102\u0103\x05" +
		"8\x1D\x02\u0103\u0104\x07!\x02\x02\u0104\u0106\x03\x02\x02\x02\u0105\u0100" +
		"\x03\x02\x02\x02\u0105\u0101\x03\x02\x02\x02\u0106?\x03\x02\x02\x02\u0107" +
		"\u0108\x07#\x02\x02\u0108A\x03\x02\x02\x02\u0109\u010A\x05@!\x02\u010A" +
		"C\x03\x02\x02\x02\u010B\u010C\x05B\"\x02\u010CE\x03\x02\x02\x02\u010D" +
		"\u010E\x05@!\x02\u010EG\x03\x02\x02\x02\u010F\u0110\x05F$\x02\u0110I\x03" +
		"\x02\x02\x02\u0111\u0112\x05@!\x02\u0112K\x03\x02\x02\x02\u0113\u0114" +
		"\x05J&\x02\u0114M\x03\x02\x02\x02\u0115\u0116\x05@!\x02\u0116O\x03\x02" +
		"\x02\x02\u0117\u0118\x05N(\x02\u0118Q\x03\x02\x02\x02\u0119\u011A\x05" +
		"@!\x02\u011AS\x03\x02\x02\x02\u011B\u011C\x05R*\x02\u011CU\x03\x02\x02" +
		"\x02\u011D\u011E\x07\"\x02\x02\u011EW\x03\x02\x02\x02\x14[dov}\x82\x88" +
		"\x8E\x92\xA1\xB5\xC2\xC6\xE3\xE6\xF5\xFD\u0105";
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
	public inferredByDescriptiveLogic(): InferredByDescriptiveLogicContext | undefined {
		return this.tryGetRuleContext(0, InferredByDescriptiveLogicContext);
	}
	public inferredByConceptReference(): InferredByConceptReferenceContext | undefined {
		return this.tryGetRuleContext(0, InferredByConceptReferenceContext);
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
	public logicalNarrative(): LogicalNarrativeContext {
		return this.getRuleContext(0, LogicalNarrativeContext);
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


export class LogicalNarrativeContext extends ParserRuleContext {
	public informalOr(): InformalOrContext {
		return this.getRuleContext(0, InformalOrContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_logicalNarrative; }
	// @Override
	public enterRule(listener: CPGLParserListener): void {
		if (listener.enterLogicalNarrative) {
			listener.enterLogicalNarrative(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLParserListener): void {
		if (listener.exitLogicalNarrative) {
			listener.exitLogicalNarrative(this);
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


export class AtomContext extends ParserRuleContext {
	public conceptReference(): ConceptReferenceContext | undefined {
		return this.tryGetRuleContext(0, ConceptReferenceContext);
	}
	public LPAREN(): TerminalNode | undefined { return this.tryGetToken(CPGLParser.LPAREN, 0); }
	public logicalNarrative(): LogicalNarrativeContext | undefined {
		return this.tryGetRuleContext(0, LogicalNarrativeContext);
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
}


export class IdentifierContext extends ParserRuleContext {
	public IDENTIFIER(): TerminalNode { return this.getToken(CPGLParser.IDENTIFIER, 0); }
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
}


