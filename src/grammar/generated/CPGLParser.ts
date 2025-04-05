// Generated from src/grammar/CPGL.g4 by ANTLR 4.9.0-SNAPSHOT


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

import { CPGLListener } from "./CPGLListener";
import { CPGLVisitor } from "./CPGLVisitor";


export class CPGLParser extends Parser {
	public static readonly DECISION = 1;
	public static readonly WHEN = 2;
	public static readonly THEN = 3;
	public static readonly DO = 4;
	public static readonly USE = 5;
	public static readonly ACTION = 6;
	public static readonly FHIRTYPE = 7;
	public static readonly CASEFEATURE = 8;
	public static readonly VALUETYPE = 9;
	public static readonly CODE = 10;
	public static readonly URL = 11;
	public static readonly ACTION_FHIR_TYPE = 12;
	public static readonly CASEFEATURE_FHIR_TYPE = 13;
	public static readonly FHIR_VALUE_TYPE = 14;
	public static readonly NEWLINE = 15;
	public static readonly WS = 16;
	public static readonly COMMENT = 17;
	public static readonly COMMENT_BLOCK = 18;
	public static readonly INDENT = 19;
	public static readonly DEDENT = 20;
	public static readonly STRING = 21;
	public static readonly ERROR = 22;
	public static readonly RULE_file = 0;
	public static readonly RULE_statement = 1;
	public static readonly RULE_decision = 2;
	public static readonly RULE_block = 3;
	public static readonly RULE_statementLine = 4;
	public static readonly RULE_whenClause = 5;
	public static readonly RULE_doClause = 6;
	public static readonly RULE_useClause = 7;
	public static readonly RULE_action = 8;
	public static readonly RULE_actionBlock = 9;
	public static readonly RULE_actionFhirTypeClause = 10;
	public static readonly RULE_casefeature = 11;
	public static readonly RULE_casefeatureBlock = 12;
	public static readonly RULE_casefeatureLine = 13;
	public static readonly RULE_casefeatureCodeClause = 14;
	public static readonly RULE_casefeatureFhirTypeClause = 15;
	public static readonly RULE_casefeatureUrlClause = 16;
	public static readonly RULE_casefeatureValueTypeClause = 17;
	// tslint:disable:no-trailing-whitespace
	public static readonly ruleNames: string[] = [
		"file", "statement", "decision", "block", "statementLine", "whenClause", 
		"doClause", "useClause", "action", "actionBlock", "actionFhirTypeClause", 
		"casefeature", "casefeatureBlock", "casefeatureLine", "casefeatureCodeClause", 
		"casefeatureFhirTypeClause", "casefeatureUrlClause", "casefeatureValueTypeClause",
	];

	private static readonly _LITERAL_NAMES: Array<string | undefined> = [
		undefined, "'decision'", "'when'", "'then'", "'do'", "'use'", "'action'", 
		"'fhirtype'", "'casefeature'", "'valuetype'", "'code'", "'url'", undefined, 
		undefined, undefined, undefined, undefined, undefined, undefined, "'    '",
	];
	private static readonly _SYMBOLIC_NAMES: Array<string | undefined> = [
		undefined, "DECISION", "WHEN", "THEN", "DO", "USE", "ACTION", "FHIRTYPE", 
		"CASEFEATURE", "VALUETYPE", "CODE", "URL", "ACTION_FHIR_TYPE", "CASEFEATURE_FHIR_TYPE", 
		"FHIR_VALUE_TYPE", "NEWLINE", "WS", "COMMENT", "COMMENT_BLOCK", "INDENT", 
		"DEDENT", "STRING", "ERROR",
	];
	public static readonly VOCABULARY: Vocabulary = new VocabularyImpl(CPGLParser._LITERAL_NAMES, CPGLParser._SYMBOLIC_NAMES, []);

	// @Override
	// @NotNull
	public get vocabulary(): Vocabulary {
		return CPGLParser.VOCABULARY;
	}
	// tslint:enable:no-trailing-whitespace

	// @Override
	public get grammarFileName(): string { return "CPGL.g4"; }

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
	public file(): FileContext {
		let _localctx: FileContext = new FileContext(this._ctx, this.state);
		this.enterRule(_localctx, 0, CPGLParser.RULE_file);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 39;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === CPGLParser.NEWLINE || _la === CPGLParser.WS) {
				{
				{
				this.state = 36;
				_la = this._input.LA(1);
				if (!(_la === CPGLParser.NEWLINE || _la === CPGLParser.WS)) {
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
				this.state = 41;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 45;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << CPGLParser.DECISION) | (1 << CPGLParser.ACTION) | (1 << CPGLParser.CASEFEATURE))) !== 0)) {
				{
				{
				this.state = 42;
				this.statement();
				}
				}
				this.state = 47;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 48;
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
			this.state = 53;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case CPGLParser.DECISION:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 50;
				this.decision();
				}
				break;
			case CPGLParser.ACTION:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 51;
				this.action();
				}
				break;
			case CPGLParser.CASEFEATURE:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 52;
				this.casefeature();
				}
				break;
			default:
				throw new NoViableAltException(this);
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
	public decision(): DecisionContext {
		let _localctx: DecisionContext = new DecisionContext(this._ctx, this.state);
		this.enterRule(_localctx, 4, CPGLParser.RULE_decision);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 55;
			this.match(CPGLParser.DECISION);
			this.state = 56;
			this.match(CPGLParser.STRING);
			this.state = 57;
			this.match(CPGLParser.NEWLINE);
			this.state = 58;
			this.block();
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
	public block(): BlockContext {
		let _localctx: BlockContext = new BlockContext(this._ctx, this.state);
		this.enterRule(_localctx, 6, CPGLParser.RULE_block);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 60;
			this.match(CPGLParser.INDENT);
			this.state = 62;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 61;
				this.statementLine();
				}
				}
				this.state = 64;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << CPGLParser.WHEN) | (1 << CPGLParser.DO) | (1 << CPGLParser.USE))) !== 0));
			this.state = 66;
			this.match(CPGLParser.DEDENT);
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
	public statementLine(): StatementLineContext {
		let _localctx: StatementLineContext = new StatementLineContext(this._ctx, this.state);
		this.enterRule(_localctx, 8, CPGLParser.RULE_statementLine);
		try {
			this.state = 71;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case CPGLParser.WHEN:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 68;
				this.whenClause();
				}
				break;
			case CPGLParser.DO:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 69;
				this.doClause();
				}
				break;
			case CPGLParser.USE:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 70;
				this.useClause();
				}
				break;
			default:
				throw new NoViableAltException(this);
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
	public whenClause(): WhenClauseContext {
		let _localctx: WhenClauseContext = new WhenClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 10, CPGLParser.RULE_whenClause);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 73;
			this.match(CPGLParser.WHEN);
			this.state = 74;
			this.match(CPGLParser.STRING);
			this.state = 75;
			this.match(CPGLParser.THEN);
			this.state = 76;
			this.match(CPGLParser.NEWLINE);
			this.state = 77;
			this.block();
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
	public doClause(): DoClauseContext {
		let _localctx: DoClauseContext = new DoClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 12, CPGLParser.RULE_doClause);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 79;
			this.match(CPGLParser.DO);
			this.state = 80;
			this.match(CPGLParser.STRING);
			this.state = 81;
			_la = this._input.LA(1);
			if (!(_la === CPGLParser.EOF || _la === CPGLParser.NEWLINE)) {
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
	// @RuleVersion(0)
	public useClause(): UseClauseContext {
		let _localctx: UseClauseContext = new UseClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 14, CPGLParser.RULE_useClause);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 83;
			this.match(CPGLParser.USE);
			this.state = 84;
			this.match(CPGLParser.STRING);
			this.state = 85;
			_la = this._input.LA(1);
			if (!(_la === CPGLParser.EOF || _la === CPGLParser.NEWLINE)) {
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
	// @RuleVersion(0)
	public action(): ActionContext {
		let _localctx: ActionContext = new ActionContext(this._ctx, this.state);
		this.enterRule(_localctx, 16, CPGLParser.RULE_action);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 87;
			this.match(CPGLParser.ACTION);
			this.state = 88;
			this.match(CPGLParser.STRING);
			this.state = 89;
			this.match(CPGLParser.NEWLINE);
			this.state = 90;
			this.actionBlock();
			this.state = 91;
			_la = this._input.LA(1);
			if (!(_la === CPGLParser.EOF || _la === CPGLParser.NEWLINE)) {
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
	// @RuleVersion(0)
	public actionBlock(): ActionBlockContext {
		let _localctx: ActionBlockContext = new ActionBlockContext(this._ctx, this.state);
		this.enterRule(_localctx, 18, CPGLParser.RULE_actionBlock);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 93;
			this.match(CPGLParser.INDENT);
			this.state = 95;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 94;
				this.actionFhirTypeClause();
				}
				}
				this.state = 97;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === CPGLParser.FHIRTYPE);
			this.state = 99;
			this.match(CPGLParser.DEDENT);
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
	public actionFhirTypeClause(): ActionFhirTypeClauseContext {
		let _localctx: ActionFhirTypeClauseContext = new ActionFhirTypeClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 20, CPGLParser.RULE_actionFhirTypeClause);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 101;
			this.match(CPGLParser.FHIRTYPE);
			this.state = 102;
			this.match(CPGLParser.ACTION_FHIR_TYPE);
			this.state = 103;
			this.match(CPGLParser.NEWLINE);
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
	public casefeature(): CasefeatureContext {
		let _localctx: CasefeatureContext = new CasefeatureContext(this._ctx, this.state);
		this.enterRule(_localctx, 22, CPGLParser.RULE_casefeature);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 105;
			this.match(CPGLParser.CASEFEATURE);
			this.state = 106;
			this.match(CPGLParser.STRING);
			this.state = 107;
			this.match(CPGLParser.NEWLINE);
			this.state = 108;
			this.casefeatureBlock();
			this.state = 109;
			_la = this._input.LA(1);
			if (!(_la === CPGLParser.EOF || _la === CPGLParser.NEWLINE)) {
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
	// @RuleVersion(0)
	public casefeatureBlock(): CasefeatureBlockContext {
		let _localctx: CasefeatureBlockContext = new CasefeatureBlockContext(this._ctx, this.state);
		this.enterRule(_localctx, 24, CPGLParser.RULE_casefeatureBlock);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 111;
			this.match(CPGLParser.INDENT);
			this.state = 112;
			this.casefeatureLine();
			this.state = 113;
			this.match(CPGLParser.DEDENT);
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
	public casefeatureLine(): CasefeatureLineContext {
		let _localctx: CasefeatureLineContext = new CasefeatureLineContext(this._ctx, this.state);
		this.enterRule(_localctx, 26, CPGLParser.RULE_casefeatureLine);
		try {
			this.state = 230;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 6, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 115;
				this.casefeatureCodeClause();
				this.state = 116;
				this.casefeatureFhirTypeClause();
				this.state = 117;
				this.casefeatureUrlClause();
				this.state = 118;
				this.casefeatureValueTypeClause();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 120;
				this.casefeatureCodeClause();
				this.state = 121;
				this.casefeatureFhirTypeClause();
				this.state = 122;
				this.casefeatureValueTypeClause();
				this.state = 123;
				this.casefeatureUrlClause();
				}
				break;

			case 3:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 125;
				this.casefeatureCodeClause();
				this.state = 126;
				this.casefeatureUrlClause();
				this.state = 127;
				this.casefeatureFhirTypeClause();
				this.state = 128;
				this.casefeatureValueTypeClause();
				}
				break;

			case 4:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 130;
				this.casefeatureCodeClause();
				this.state = 131;
				this.casefeatureUrlClause();
				this.state = 132;
				this.casefeatureValueTypeClause();
				this.state = 133;
				this.casefeatureFhirTypeClause();
				}
				break;

			case 5:
				this.enterOuterAlt(_localctx, 5);
				{
				this.state = 135;
				this.casefeatureCodeClause();
				this.state = 136;
				this.casefeatureValueTypeClause();
				this.state = 137;
				this.casefeatureFhirTypeClause();
				this.state = 138;
				this.casefeatureUrlClause();
				}
				break;

			case 6:
				this.enterOuterAlt(_localctx, 6);
				{
				this.state = 140;
				this.casefeatureCodeClause();
				this.state = 141;
				this.casefeatureValueTypeClause();
				this.state = 142;
				this.casefeatureUrlClause();
				this.state = 143;
				this.casefeatureFhirTypeClause();
				}
				break;

			case 7:
				this.enterOuterAlt(_localctx, 7);
				{
				this.state = 145;
				this.casefeatureFhirTypeClause();
				this.state = 146;
				this.casefeatureCodeClause();
				this.state = 147;
				this.casefeatureUrlClause();
				this.state = 148;
				this.casefeatureValueTypeClause();
				}
				break;

			case 8:
				this.enterOuterAlt(_localctx, 8);
				{
				this.state = 150;
				this.casefeatureFhirTypeClause();
				this.state = 151;
				this.casefeatureCodeClause();
				this.state = 152;
				this.casefeatureValueTypeClause();
				this.state = 153;
				this.casefeatureUrlClause();
				}
				break;

			case 9:
				this.enterOuterAlt(_localctx, 9);
				{
				this.state = 155;
				this.casefeatureFhirTypeClause();
				this.state = 156;
				this.casefeatureUrlClause();
				this.state = 157;
				this.casefeatureCodeClause();
				this.state = 158;
				this.casefeatureValueTypeClause();
				}
				break;

			case 10:
				this.enterOuterAlt(_localctx, 10);
				{
				this.state = 160;
				this.casefeatureFhirTypeClause();
				this.state = 161;
				this.casefeatureUrlClause();
				this.state = 162;
				this.casefeatureValueTypeClause();
				this.state = 163;
				this.casefeatureCodeClause();
				}
				break;

			case 11:
				this.enterOuterAlt(_localctx, 11);
				{
				this.state = 165;
				this.casefeatureFhirTypeClause();
				this.state = 166;
				this.casefeatureValueTypeClause();
				this.state = 167;
				this.casefeatureCodeClause();
				this.state = 168;
				this.casefeatureUrlClause();
				}
				break;

			case 12:
				this.enterOuterAlt(_localctx, 12);
				{
				this.state = 170;
				this.casefeatureFhirTypeClause();
				this.state = 171;
				this.casefeatureValueTypeClause();
				this.state = 172;
				this.casefeatureUrlClause();
				this.state = 173;
				this.casefeatureCodeClause();
				}
				break;

			case 13:
				this.enterOuterAlt(_localctx, 13);
				{
				this.state = 175;
				this.casefeatureUrlClause();
				this.state = 176;
				this.casefeatureCodeClause();
				this.state = 177;
				this.casefeatureFhirTypeClause();
				this.state = 178;
				this.casefeatureValueTypeClause();
				}
				break;

			case 14:
				this.enterOuterAlt(_localctx, 14);
				{
				this.state = 180;
				this.casefeatureUrlClause();
				this.state = 181;
				this.casefeatureCodeClause();
				this.state = 182;
				this.casefeatureValueTypeClause();
				this.state = 183;
				this.casefeatureFhirTypeClause();
				}
				break;

			case 15:
				this.enterOuterAlt(_localctx, 15);
				{
				this.state = 185;
				this.casefeatureUrlClause();
				this.state = 186;
				this.casefeatureFhirTypeClause();
				this.state = 187;
				this.casefeatureCodeClause();
				this.state = 188;
				this.casefeatureValueTypeClause();
				}
				break;

			case 16:
				this.enterOuterAlt(_localctx, 16);
				{
				this.state = 190;
				this.casefeatureUrlClause();
				this.state = 191;
				this.casefeatureFhirTypeClause();
				this.state = 192;
				this.casefeatureValueTypeClause();
				this.state = 193;
				this.casefeatureCodeClause();
				}
				break;

			case 17:
				this.enterOuterAlt(_localctx, 17);
				{
				this.state = 195;
				this.casefeatureUrlClause();
				this.state = 196;
				this.casefeatureValueTypeClause();
				this.state = 197;
				this.casefeatureFhirTypeClause();
				this.state = 198;
				this.casefeatureCodeClause();
				}
				break;

			case 18:
				this.enterOuterAlt(_localctx, 18);
				{
				this.state = 200;
				this.casefeatureValueTypeClause();
				this.state = 201;
				this.casefeatureCodeClause();
				this.state = 202;
				this.casefeatureFhirTypeClause();
				this.state = 203;
				this.casefeatureUrlClause();
				}
				break;

			case 19:
				this.enterOuterAlt(_localctx, 19);
				{
				this.state = 205;
				this.casefeatureValueTypeClause();
				this.state = 206;
				this.casefeatureCodeClause();
				this.state = 207;
				this.casefeatureUrlClause();
				this.state = 208;
				this.casefeatureFhirTypeClause();
				}
				break;

			case 20:
				this.enterOuterAlt(_localctx, 20);
				{
				this.state = 210;
				this.casefeatureValueTypeClause();
				this.state = 211;
				this.casefeatureFhirTypeClause();
				this.state = 212;
				this.casefeatureCodeClause();
				this.state = 213;
				this.casefeatureUrlClause();
				}
				break;

			case 21:
				this.enterOuterAlt(_localctx, 21);
				{
				this.state = 215;
				this.casefeatureValueTypeClause();
				this.state = 216;
				this.casefeatureFhirTypeClause();
				this.state = 217;
				this.casefeatureUrlClause();
				this.state = 218;
				this.casefeatureCodeClause();
				}
				break;

			case 22:
				this.enterOuterAlt(_localctx, 22);
				{
				this.state = 220;
				this.casefeatureValueTypeClause();
				this.state = 221;
				this.casefeatureUrlClause();
				this.state = 222;
				this.casefeatureCodeClause();
				this.state = 223;
				this.casefeatureFhirTypeClause();
				}
				break;

			case 23:
				this.enterOuterAlt(_localctx, 23);
				{
				this.state = 225;
				this.casefeatureValueTypeClause();
				this.state = 226;
				this.casefeatureUrlClause();
				this.state = 227;
				this.casefeatureFhirTypeClause();
				this.state = 228;
				this.casefeatureCodeClause();
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
	public casefeatureCodeClause(): CasefeatureCodeClauseContext {
		let _localctx: CasefeatureCodeClauseContext = new CasefeatureCodeClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 28, CPGLParser.RULE_casefeatureCodeClause);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 232;
			this.match(CPGLParser.CODE);
			this.state = 233;
			this.match(CPGLParser.STRING);
			this.state = 234;
			this.match(CPGLParser.NEWLINE);
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
	public casefeatureFhirTypeClause(): CasefeatureFhirTypeClauseContext {
		let _localctx: CasefeatureFhirTypeClauseContext = new CasefeatureFhirTypeClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 30, CPGLParser.RULE_casefeatureFhirTypeClause);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 236;
			this.match(CPGLParser.FHIRTYPE);
			this.state = 237;
			this.match(CPGLParser.CASEFEATURE_FHIR_TYPE);
			this.state = 238;
			this.match(CPGLParser.NEWLINE);
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
	public casefeatureUrlClause(): CasefeatureUrlClauseContext {
		let _localctx: CasefeatureUrlClauseContext = new CasefeatureUrlClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 32, CPGLParser.RULE_casefeatureUrlClause);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 240;
			this.match(CPGLParser.URL);
			this.state = 241;
			this.match(CPGLParser.STRING);
			this.state = 242;
			this.match(CPGLParser.NEWLINE);
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
	public casefeatureValueTypeClause(): CasefeatureValueTypeClauseContext {
		let _localctx: CasefeatureValueTypeClauseContext = new CasefeatureValueTypeClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 34, CPGLParser.RULE_casefeatureValueTypeClause);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 244;
			this.match(CPGLParser.VALUETYPE);
			this.state = 245;
			this.match(CPGLParser.FHIR_VALUE_TYPE);
			this.state = 246;
			this.match(CPGLParser.NEWLINE);
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
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x03\x18\xFB\x04\x02" +
		"\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04\x07" +
		"\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r\x04" +
		"\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11\t\x11\x04\x12\t\x12\x04" +
		"\x13\t\x13\x03\x02\x07\x02(\n\x02\f\x02\x0E\x02+\v\x02\x03\x02\x07\x02" +
		".\n\x02\f\x02\x0E\x021\v\x02\x03\x02\x03\x02\x03\x03\x03\x03\x03\x03\x05" +
		"\x038\n\x03\x03\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03\x05\x03\x05\x06" +
		"\x05A\n\x05\r\x05\x0E\x05B\x03\x05\x03\x05\x03\x06\x03\x06\x03\x06\x05" +
		"\x06J\n\x06\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\b\x03" +
		"\b\x03\b\x03\b\x03\t\x03\t\x03\t\x03\t\x03\n\x03\n\x03\n\x03\n\x03\n\x03" +
		"\n\x03\v\x03\v\x06\vb\n\v\r\v\x0E\vc\x03\v\x03\v\x03\f\x03\f\x03\f\x03" +
		"\f\x03\r\x03\r\x03\r\x03\r\x03\r\x03\r\x03\x0E\x03\x0E\x03\x0E\x03\x0E" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x05\x0F\xE9\n" +
		"\x0F\x03\x10\x03\x10\x03\x10\x03\x10\x03\x11\x03\x11\x03\x11\x03\x11\x03" +
		"\x12\x03\x12\x03\x12\x03\x12\x03\x13\x03\x13\x03\x13\x03\x13\x03\x13\x02" +
		"\x02\x02\x14\x02\x02\x04\x02\x06\x02\b\x02\n\x02\f\x02\x0E\x02\x10\x02" +
		"\x12\x02\x14\x02\x16\x02\x18\x02\x1A\x02\x1C\x02\x1E\x02 \x02\"\x02$\x02" +
		"\x02\x04\x03\x02\x11\x12\x03\x03\x11\x11\x02\u0106\x02)\x03\x02\x02\x02" +
		"\x047\x03\x02\x02\x02\x069\x03\x02\x02\x02\b>\x03\x02\x02\x02\nI\x03\x02" +
		"\x02\x02\fK\x03\x02\x02\x02\x0EQ\x03\x02\x02\x02\x10U\x03\x02\x02\x02" +
		"\x12Y\x03\x02\x02\x02\x14_\x03\x02\x02\x02\x16g\x03\x02\x02\x02\x18k\x03" +
		"\x02\x02\x02\x1Aq\x03\x02\x02\x02\x1C\xE8\x03\x02\x02\x02\x1E\xEA\x03" +
		"\x02\x02\x02 \xEE\x03\x02\x02\x02\"\xF2\x03\x02\x02\x02$\xF6\x03\x02\x02" +
		"\x02&(\t\x02\x02\x02\'&\x03\x02\x02\x02(+\x03\x02\x02\x02)\'\x03\x02\x02" +
		"\x02)*\x03\x02\x02\x02*/\x03\x02\x02\x02+)\x03\x02\x02\x02,.\x05\x04\x03" +
		"\x02-,\x03\x02\x02\x02.1\x03\x02\x02\x02/-\x03\x02\x02\x02/0\x03\x02\x02" +
		"\x0202\x03\x02\x02\x021/\x03\x02\x02\x0223\x07\x02\x02\x033\x03\x03\x02" +
		"\x02\x0248\x05\x06\x04\x0258\x05\x12\n\x0268\x05\x18\r\x0274\x03\x02\x02" +
		"\x0275\x03\x02\x02\x0276\x03\x02\x02\x028\x05\x03\x02\x02\x029:\x07\x03" +
		"\x02\x02:;\x07\x17\x02\x02;<\x07\x11\x02\x02<=\x05\b\x05\x02=\x07\x03" +
		"\x02\x02\x02>@\x07\x15\x02\x02?A\x05\n\x06\x02@?\x03\x02\x02\x02AB\x03" +
		"\x02\x02\x02B@\x03\x02\x02\x02BC\x03\x02\x02\x02CD\x03\x02\x02\x02DE\x07" +
		"\x16\x02\x02E\t\x03\x02\x02\x02FJ\x05\f\x07\x02GJ\x05\x0E\b\x02HJ\x05" +
		"\x10\t\x02IF\x03\x02\x02\x02IG\x03\x02\x02\x02IH\x03\x02\x02\x02J\v\x03" +
		"\x02\x02\x02KL\x07\x04\x02\x02LM\x07\x17\x02\x02MN\x07\x05\x02\x02NO\x07" +
		"\x11\x02\x02OP\x05\b\x05\x02P\r\x03\x02\x02\x02QR\x07\x06\x02\x02RS\x07" +
		"\x17\x02\x02ST\t\x03\x02\x02T\x0F\x03\x02\x02\x02UV\x07\x07\x02\x02VW" +
		"\x07\x17\x02\x02WX\t\x03\x02\x02X\x11\x03\x02\x02\x02YZ\x07\b\x02\x02" +
		"Z[\x07\x17\x02\x02[\\\x07\x11\x02\x02\\]\x05\x14\v\x02]^\t\x03\x02\x02" +
		"^\x13\x03\x02\x02\x02_a\x07\x15\x02\x02`b\x05\x16\f\x02a`\x03\x02\x02" +
		"\x02bc\x03\x02\x02\x02ca\x03\x02\x02\x02cd\x03\x02\x02\x02de\x03\x02\x02" +
		"\x02ef\x07\x16\x02\x02f\x15\x03\x02\x02\x02gh\x07\t\x02\x02hi\x07\x0E" +
		"\x02\x02ij\x07\x11\x02\x02j\x17\x03\x02\x02\x02kl\x07\n\x02\x02lm\x07" +
		"\x17\x02\x02mn\x07\x11\x02\x02no\x05\x1A\x0E\x02op\t\x03\x02\x02p\x19" +
		"\x03\x02\x02\x02qr\x07\x15\x02\x02rs\x05\x1C\x0F\x02st\x07\x16\x02\x02" +
		"t\x1B\x03\x02\x02\x02uv\x05\x1E\x10\x02vw\x05 \x11\x02wx\x05\"\x12\x02" +
		"xy\x05$\x13\x02y\xE9\x03\x02\x02\x02z{\x05\x1E\x10\x02{|\x05 \x11\x02" +
		"|}\x05$\x13\x02}~\x05\"\x12\x02~\xE9\x03\x02\x02\x02\x7F\x80\x05\x1E\x10" +
		"\x02\x80\x81\x05\"\x12\x02\x81\x82\x05 \x11\x02\x82\x83\x05$\x13\x02\x83" +
		"\xE9\x03\x02\x02\x02\x84\x85\x05\x1E\x10\x02\x85\x86\x05\"\x12\x02\x86" +
		"\x87\x05$\x13\x02\x87\x88\x05 \x11\x02\x88\xE9\x03\x02\x02\x02\x89\x8A" +
		"\x05\x1E\x10\x02\x8A\x8B\x05$\x13\x02\x8B\x8C\x05 \x11\x02\x8C\x8D\x05" +
		"\"\x12\x02\x8D\xE9\x03\x02\x02\x02\x8E\x8F\x05\x1E\x10\x02\x8F\x90\x05" +
		"$\x13\x02\x90\x91\x05\"\x12\x02\x91\x92\x05 \x11\x02\x92\xE9\x03\x02\x02" +
		"\x02\x93\x94\x05 \x11\x02\x94\x95\x05\x1E\x10\x02\x95\x96\x05\"\x12\x02" +
		"\x96\x97\x05$\x13\x02\x97\xE9\x03\x02\x02\x02\x98\x99\x05 \x11\x02\x99" +
		"\x9A\x05\x1E\x10\x02\x9A\x9B\x05$\x13\x02\x9B\x9C\x05\"\x12\x02\x9C\xE9" +
		"\x03\x02\x02\x02\x9D\x9E\x05 \x11\x02\x9E\x9F\x05\"\x12\x02\x9F\xA0\x05" +
		"\x1E\x10\x02\xA0\xA1\x05$\x13\x02\xA1\xE9\x03\x02\x02\x02\xA2\xA3\x05" +
		" \x11\x02\xA3\xA4\x05\"\x12\x02\xA4\xA5\x05$\x13\x02\xA5\xA6\x05\x1E\x10" +
		"\x02\xA6\xE9\x03\x02\x02\x02\xA7\xA8\x05 \x11\x02\xA8\xA9\x05$\x13\x02" +
		"\xA9\xAA\x05\x1E\x10\x02\xAA\xAB\x05\"\x12\x02\xAB\xE9\x03\x02\x02\x02" +
		"\xAC\xAD\x05 \x11\x02\xAD\xAE\x05$\x13\x02\xAE\xAF\x05\"\x12\x02\xAF\xB0" +
		"\x05\x1E\x10\x02\xB0\xE9\x03\x02\x02\x02\xB1\xB2\x05\"\x12\x02\xB2\xB3" +
		"\x05\x1E\x10\x02\xB3\xB4\x05 \x11\x02\xB4\xB5\x05$\x13\x02\xB5\xE9\x03" +
		"\x02\x02\x02\xB6\xB7\x05\"\x12\x02\xB7\xB8\x05\x1E\x10\x02\xB8\xB9\x05" +
		"$\x13\x02\xB9\xBA\x05 \x11\x02\xBA\xE9\x03\x02\x02\x02\xBB\xBC\x05\"\x12" +
		"\x02\xBC\xBD\x05 \x11\x02\xBD\xBE\x05\x1E\x10\x02\xBE\xBF\x05$\x13\x02" +
		"\xBF\xE9\x03\x02\x02\x02\xC0\xC1\x05\"\x12\x02\xC1\xC2\x05 \x11\x02\xC2" +
		"\xC3\x05$\x13\x02\xC3\xC4\x05\x1E\x10\x02\xC4\xE9\x03\x02\x02\x02\xC5" +
		"\xC6\x05\"\x12\x02\xC6\xC7\x05$\x13\x02\xC7\xC8\x05 \x11\x02\xC8\xC9\x05" +
		"\x1E\x10\x02\xC9\xE9\x03\x02\x02\x02\xCA\xCB\x05$\x13\x02\xCB\xCC\x05" +
		"\x1E\x10\x02\xCC\xCD\x05 \x11\x02\xCD\xCE\x05\"\x12\x02\xCE\xE9\x03\x02" +
		"\x02\x02\xCF\xD0\x05$\x13\x02\xD0\xD1\x05\x1E\x10\x02\xD1\xD2\x05\"\x12" +
		"\x02\xD2\xD3\x05 \x11\x02\xD3\xE9\x03\x02\x02\x02\xD4\xD5\x05$\x13\x02" +
		"\xD5\xD6\x05 \x11\x02\xD6\xD7\x05\x1E\x10\x02\xD7\xD8\x05\"\x12\x02\xD8" +
		"\xE9\x03\x02\x02\x02\xD9\xDA\x05$\x13\x02\xDA\xDB\x05 \x11\x02\xDB\xDC" +
		"\x05\"\x12\x02\xDC\xDD\x05\x1E\x10\x02\xDD\xE9\x03\x02\x02\x02\xDE\xDF" +
		"\x05$\x13\x02\xDF\xE0\x05\"\x12\x02\xE0\xE1\x05\x1E\x10\x02\xE1\xE2\x05" +
		" \x11\x02\xE2\xE9\x03\x02\x02\x02\xE3\xE4\x05$\x13\x02\xE4\xE5\x05\"\x12" +
		"\x02\xE5\xE6\x05 \x11\x02\xE6\xE7\x05\x1E\x10\x02\xE7\xE9\x03\x02\x02" +
		"\x02\xE8u\x03\x02\x02\x02\xE8z\x03\x02\x02\x02\xE8\x7F\x03\x02\x02\x02" +
		"\xE8\x84\x03\x02\x02\x02\xE8\x89\x03\x02\x02\x02\xE8\x8E\x03\x02\x02\x02" +
		"\xE8\x93\x03\x02\x02\x02\xE8\x98\x03\x02\x02\x02\xE8\x9D\x03\x02\x02\x02" +
		"\xE8\xA2\x03\x02\x02\x02\xE8\xA7\x03\x02\x02\x02\xE8\xAC\x03\x02\x02\x02" +
		"\xE8\xB1\x03\x02\x02\x02\xE8\xB6\x03\x02\x02\x02\xE8\xBB\x03\x02\x02\x02" +
		"\xE8\xC0\x03\x02\x02\x02\xE8\xC5\x03\x02\x02\x02\xE8\xCA\x03\x02\x02\x02" +
		"\xE8\xCF\x03\x02\x02\x02\xE8\xD4\x03\x02\x02\x02\xE8\xD9\x03\x02\x02\x02" +
		"\xE8\xDE\x03\x02\x02\x02\xE8\xE3\x03\x02\x02\x02\xE9\x1D\x03\x02\x02\x02" +
		"\xEA\xEB\x07\f\x02\x02\xEB\xEC\x07\x17\x02\x02\xEC\xED\x07\x11\x02\x02" +
		"\xED\x1F\x03\x02\x02\x02\xEE\xEF\x07\t\x02\x02\xEF\xF0\x07\x0F\x02\x02" +
		"\xF0\xF1\x07\x11\x02\x02\xF1!\x03\x02\x02\x02\xF2\xF3\x07\r\x02\x02\xF3" +
		"\xF4\x07\x17\x02\x02\xF4\xF5\x07\x11\x02\x02\xF5#\x03\x02\x02\x02\xF6" +
		"\xF7\x07\v\x02\x02\xF7\xF8\x07\x10\x02\x02\xF8\xF9\x07\x11\x02\x02\xF9" +
		"%\x03\x02\x02\x02\t)/7BIc\xE8";
	public static __ATN: ATN;
	public static get _ATN(): ATN {
		if (!CPGLParser.__ATN) {
			CPGLParser.__ATN = new ATNDeserializer().deserialize(Utils.toCharArray(CPGLParser._serializedATN));
		}

		return CPGLParser.__ATN;
	}

}

export class FileContext extends ParserRuleContext {
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
	public NEWLINE(): TerminalNode[];
	public NEWLINE(i: number): TerminalNode;
	public NEWLINE(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(CPGLParser.NEWLINE);
		} else {
			return this.getToken(CPGLParser.NEWLINE, i);
		}
	}
	public WS(): TerminalNode[];
	public WS(i: number): TerminalNode;
	public WS(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(CPGLParser.WS);
		} else {
			return this.getToken(CPGLParser.WS, i);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_file; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterFile) {
			listener.enterFile(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitFile) {
			listener.exitFile(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitFile) {
			return visitor.visitFile(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class StatementContext extends ParserRuleContext {
	public decision(): DecisionContext | undefined {
		return this.tryGetRuleContext(0, DecisionContext);
	}
	public action(): ActionContext | undefined {
		return this.tryGetRuleContext(0, ActionContext);
	}
	public casefeature(): CasefeatureContext | undefined {
		return this.tryGetRuleContext(0, CasefeatureContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_statement; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterStatement) {
			listener.enterStatement(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitStatement) {
			listener.exitStatement(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitStatement) {
			return visitor.visitStatement(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class DecisionContext extends ParserRuleContext {
	public DECISION(): TerminalNode { return this.getToken(CPGLParser.DECISION, 0); }
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	public block(): BlockContext {
		return this.getRuleContext(0, BlockContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_decision; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterDecision) {
			listener.enterDecision(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitDecision) {
			listener.exitDecision(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitDecision) {
			return visitor.visitDecision(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class BlockContext extends ParserRuleContext {
	public INDENT(): TerminalNode { return this.getToken(CPGLParser.INDENT, 0); }
	public DEDENT(): TerminalNode { return this.getToken(CPGLParser.DEDENT, 0); }
	public statementLine(): StatementLineContext[];
	public statementLine(i: number): StatementLineContext;
	public statementLine(i?: number): StatementLineContext | StatementLineContext[] {
		if (i === undefined) {
			return this.getRuleContexts(StatementLineContext);
		} else {
			return this.getRuleContext(i, StatementLineContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_block; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterBlock) {
			listener.enterBlock(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitBlock) {
			listener.exitBlock(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitBlock) {
			return visitor.visitBlock(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class StatementLineContext extends ParserRuleContext {
	public whenClause(): WhenClauseContext | undefined {
		return this.tryGetRuleContext(0, WhenClauseContext);
	}
	public doClause(): DoClauseContext | undefined {
		return this.tryGetRuleContext(0, DoClauseContext);
	}
	public useClause(): UseClauseContext | undefined {
		return this.tryGetRuleContext(0, UseClauseContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_statementLine; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterStatementLine) {
			listener.enterStatementLine(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitStatementLine) {
			listener.exitStatementLine(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitStatementLine) {
			return visitor.visitStatementLine(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class WhenClauseContext extends ParserRuleContext {
	public WHEN(): TerminalNode { return this.getToken(CPGLParser.WHEN, 0); }
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public THEN(): TerminalNode { return this.getToken(CPGLParser.THEN, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	public block(): BlockContext {
		return this.getRuleContext(0, BlockContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_whenClause; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterWhenClause) {
			listener.enterWhenClause(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitWhenClause) {
			listener.exitWhenClause(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitWhenClause) {
			return visitor.visitWhenClause(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class DoClauseContext extends ParserRuleContext {
	public DO(): TerminalNode { return this.getToken(CPGLParser.DO, 0); }
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public NEWLINE(): TerminalNode | undefined { return this.tryGetToken(CPGLParser.NEWLINE, 0); }
	public EOF(): TerminalNode | undefined { return this.tryGetToken(CPGLParser.EOF, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_doClause; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterDoClause) {
			listener.enterDoClause(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitDoClause) {
			listener.exitDoClause(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitDoClause) {
			return visitor.visitDoClause(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class UseClauseContext extends ParserRuleContext {
	public USE(): TerminalNode { return this.getToken(CPGLParser.USE, 0); }
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public NEWLINE(): TerminalNode | undefined { return this.tryGetToken(CPGLParser.NEWLINE, 0); }
	public EOF(): TerminalNode | undefined { return this.tryGetToken(CPGLParser.EOF, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_useClause; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterUseClause) {
			listener.enterUseClause(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitUseClause) {
			listener.exitUseClause(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitUseClause) {
			return visitor.visitUseClause(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ActionContext extends ParserRuleContext {
	public ACTION(): TerminalNode { return this.getToken(CPGLParser.ACTION, 0); }
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public NEWLINE(): TerminalNode[];
	public NEWLINE(i: number): TerminalNode;
	public NEWLINE(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(CPGLParser.NEWLINE);
		} else {
			return this.getToken(CPGLParser.NEWLINE, i);
		}
	}
	public actionBlock(): ActionBlockContext {
		return this.getRuleContext(0, ActionBlockContext);
	}
	public EOF(): TerminalNode | undefined { return this.tryGetToken(CPGLParser.EOF, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_action; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterAction) {
			listener.enterAction(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitAction) {
			listener.exitAction(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitAction) {
			return visitor.visitAction(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ActionBlockContext extends ParserRuleContext {
	public INDENT(): TerminalNode { return this.getToken(CPGLParser.INDENT, 0); }
	public DEDENT(): TerminalNode { return this.getToken(CPGLParser.DEDENT, 0); }
	public actionFhirTypeClause(): ActionFhirTypeClauseContext[];
	public actionFhirTypeClause(i: number): ActionFhirTypeClauseContext;
	public actionFhirTypeClause(i?: number): ActionFhirTypeClauseContext | ActionFhirTypeClauseContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ActionFhirTypeClauseContext);
		} else {
			return this.getRuleContext(i, ActionFhirTypeClauseContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_actionBlock; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterActionBlock) {
			listener.enterActionBlock(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitActionBlock) {
			listener.exitActionBlock(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitActionBlock) {
			return visitor.visitActionBlock(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ActionFhirTypeClauseContext extends ParserRuleContext {
	public FHIRTYPE(): TerminalNode { return this.getToken(CPGLParser.FHIRTYPE, 0); }
	public ACTION_FHIR_TYPE(): TerminalNode { return this.getToken(CPGLParser.ACTION_FHIR_TYPE, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_actionFhirTypeClause; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterActionFhirTypeClause) {
			listener.enterActionFhirTypeClause(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitActionFhirTypeClause) {
			listener.exitActionFhirTypeClause(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitActionFhirTypeClause) {
			return visitor.visitActionFhirTypeClause(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class CasefeatureContext extends ParserRuleContext {
	public CASEFEATURE(): TerminalNode { return this.getToken(CPGLParser.CASEFEATURE, 0); }
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public NEWLINE(): TerminalNode[];
	public NEWLINE(i: number): TerminalNode;
	public NEWLINE(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(CPGLParser.NEWLINE);
		} else {
			return this.getToken(CPGLParser.NEWLINE, i);
		}
	}
	public casefeatureBlock(): CasefeatureBlockContext {
		return this.getRuleContext(0, CasefeatureBlockContext);
	}
	public EOF(): TerminalNode | undefined { return this.tryGetToken(CPGLParser.EOF, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_casefeature; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterCasefeature) {
			listener.enterCasefeature(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitCasefeature) {
			listener.exitCasefeature(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitCasefeature) {
			return visitor.visitCasefeature(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class CasefeatureBlockContext extends ParserRuleContext {
	public INDENT(): TerminalNode { return this.getToken(CPGLParser.INDENT, 0); }
	public casefeatureLine(): CasefeatureLineContext {
		return this.getRuleContext(0, CasefeatureLineContext);
	}
	public DEDENT(): TerminalNode { return this.getToken(CPGLParser.DEDENT, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_casefeatureBlock; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterCasefeatureBlock) {
			listener.enterCasefeatureBlock(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitCasefeatureBlock) {
			listener.exitCasefeatureBlock(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitCasefeatureBlock) {
			return visitor.visitCasefeatureBlock(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class CasefeatureLineContext extends ParserRuleContext {
	public casefeatureCodeClause(): CasefeatureCodeClauseContext {
		return this.getRuleContext(0, CasefeatureCodeClauseContext);
	}
	public casefeatureFhirTypeClause(): CasefeatureFhirTypeClauseContext {
		return this.getRuleContext(0, CasefeatureFhirTypeClauseContext);
	}
	public casefeatureUrlClause(): CasefeatureUrlClauseContext {
		return this.getRuleContext(0, CasefeatureUrlClauseContext);
	}
	public casefeatureValueTypeClause(): CasefeatureValueTypeClauseContext {
		return this.getRuleContext(0, CasefeatureValueTypeClauseContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_casefeatureLine; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterCasefeatureLine) {
			listener.enterCasefeatureLine(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitCasefeatureLine) {
			listener.exitCasefeatureLine(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitCasefeatureLine) {
			return visitor.visitCasefeatureLine(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class CasefeatureCodeClauseContext extends ParserRuleContext {
	public CODE(): TerminalNode { return this.getToken(CPGLParser.CODE, 0); }
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_casefeatureCodeClause; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterCasefeatureCodeClause) {
			listener.enterCasefeatureCodeClause(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitCasefeatureCodeClause) {
			listener.exitCasefeatureCodeClause(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitCasefeatureCodeClause) {
			return visitor.visitCasefeatureCodeClause(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class CasefeatureFhirTypeClauseContext extends ParserRuleContext {
	public FHIRTYPE(): TerminalNode { return this.getToken(CPGLParser.FHIRTYPE, 0); }
	public CASEFEATURE_FHIR_TYPE(): TerminalNode { return this.getToken(CPGLParser.CASEFEATURE_FHIR_TYPE, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_casefeatureFhirTypeClause; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterCasefeatureFhirTypeClause) {
			listener.enterCasefeatureFhirTypeClause(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitCasefeatureFhirTypeClause) {
			listener.exitCasefeatureFhirTypeClause(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitCasefeatureFhirTypeClause) {
			return visitor.visitCasefeatureFhirTypeClause(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class CasefeatureUrlClauseContext extends ParserRuleContext {
	public URL(): TerminalNode { return this.getToken(CPGLParser.URL, 0); }
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_casefeatureUrlClause; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterCasefeatureUrlClause) {
			listener.enterCasefeatureUrlClause(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitCasefeatureUrlClause) {
			listener.exitCasefeatureUrlClause(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitCasefeatureUrlClause) {
			return visitor.visitCasefeatureUrlClause(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class CasefeatureValueTypeClauseContext extends ParserRuleContext {
	public VALUETYPE(): TerminalNode { return this.getToken(CPGLParser.VALUETYPE, 0); }
	public FHIR_VALUE_TYPE(): TerminalNode { return this.getToken(CPGLParser.FHIR_VALUE_TYPE, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_casefeatureValueTypeClause; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterCasefeatureValueTypeClause) {
			listener.enterCasefeatureValueTypeClause(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitCasefeatureValueTypeClause) {
			listener.exitCasefeatureValueTypeClause(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitCasefeatureValueTypeClause) {
			return visitor.visitCasefeatureValueTypeClause(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


