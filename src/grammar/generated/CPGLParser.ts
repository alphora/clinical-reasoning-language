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
	public static readonly NEWLINE = 10;
	public static readonly WS = 11;
	public static readonly COMMENT = 12;
	public static readonly COMMENT_BLOCK = 13;
	public static readonly INDENT = 14;
	public static readonly DEDENT = 15;
	public static readonly ACTION_FHIR_TYPE = 16;
	public static readonly CASEFEATURE_FHIR_TYPE = 17;
	public static readonly FHIR_VALUE_TYPE = 18;
	public static readonly STRING = 19;
	public static readonly ERROR = 20;
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
	public static readonly RULE_actionLine = 10;
	public static readonly RULE_fhirTypeClause = 11;
	public static readonly RULE_valueTypeClause = 12;
	public static readonly RULE_casefeature = 13;
	public static readonly RULE_casefeatureBlock = 14;
	public static readonly RULE_casefeatureLine = 15;
	public static readonly RULE_casefeatureFhirTypeClause = 16;
	public static readonly RULE_casefeatureValueTypeClause = 17;
	// tslint:disable:no-trailing-whitespace
	public static readonly ruleNames: string[] = [
		"file", "statement", "decision", "block", "statementLine", "whenClause", 
		"doClause", "useClause", "action", "actionBlock", "actionLine", "fhirTypeClause", 
		"valueTypeClause", "casefeature", "casefeatureBlock", "casefeatureLine", 
		"casefeatureFhirTypeClause", "casefeatureValueTypeClause",
	];

	private static readonly _LITERAL_NAMES: Array<string | undefined> = [
		undefined, "'decision'", "'when'", "'then'", "'do'", "'use'", "'action'", 
		"'fhirtype'", "'casefeature'", "'valuetype'", undefined, undefined, undefined, 
		undefined, "'    '",
	];
	private static readonly _SYMBOLIC_NAMES: Array<string | undefined> = [
		undefined, "DECISION", "WHEN", "THEN", "DO", "USE", "ACTION", "FHIRTYPE", 
		"CASEFEATURE", "VALUETYPE", "NEWLINE", "WS", "COMMENT", "COMMENT_BLOCK", 
		"INDENT", "DEDENT", "ACTION_FHIR_TYPE", "CASEFEATURE_FHIR_TYPE", "FHIR_VALUE_TYPE", 
		"STRING", "ERROR",
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
			this.state = 91;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === CPGLParser.INDENT) {
				{
				this.state = 90;
				this.actionBlock();
				}
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
				this.actionLine();
				}
				}
				this.state = 97;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === CPGLParser.FHIRTYPE || _la === CPGLParser.VALUETYPE);
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
	public actionLine(): ActionLineContext {
		let _localctx: ActionLineContext = new ActionLineContext(this._ctx, this.state);
		this.enterRule(_localctx, 20, CPGLParser.RULE_actionLine);
		try {
			this.state = 103;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case CPGLParser.FHIRTYPE:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 101;
				this.fhirTypeClause();
				}
				break;
			case CPGLParser.VALUETYPE:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 102;
				this.valueTypeClause();
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
	public fhirTypeClause(): FhirTypeClauseContext {
		let _localctx: FhirTypeClauseContext = new FhirTypeClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 22, CPGLParser.RULE_fhirTypeClause);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 105;
			this.match(CPGLParser.FHIRTYPE);
			this.state = 106;
			this.match(CPGLParser.ACTION_FHIR_TYPE);
			this.state = 107;
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
	public valueTypeClause(): ValueTypeClauseContext {
		let _localctx: ValueTypeClauseContext = new ValueTypeClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 24, CPGLParser.RULE_valueTypeClause);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 109;
			this.match(CPGLParser.VALUETYPE);
			this.state = 110;
			this.match(CPGLParser.FHIR_VALUE_TYPE);
			this.state = 111;
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
		this.enterRule(_localctx, 26, CPGLParser.RULE_casefeature);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 113;
			this.match(CPGLParser.CASEFEATURE);
			this.state = 114;
			this.match(CPGLParser.STRING);
			this.state = 115;
			this.match(CPGLParser.NEWLINE);
			this.state = 117;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === CPGLParser.INDENT) {
				{
				this.state = 116;
				this.casefeatureBlock();
				}
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
		this.enterRule(_localctx, 28, CPGLParser.RULE_casefeatureBlock);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 119;
			this.match(CPGLParser.INDENT);
			this.state = 121;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 120;
				this.casefeatureLine();
				}
				}
				this.state = 123;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === CPGLParser.FHIRTYPE || _la === CPGLParser.VALUETYPE);
			this.state = 125;
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
		this.enterRule(_localctx, 30, CPGLParser.RULE_casefeatureLine);
		try {
			this.state = 129;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case CPGLParser.FHIRTYPE:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 127;
				this.casefeatureFhirTypeClause();
				}
				break;
			case CPGLParser.VALUETYPE:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 128;
				this.casefeatureValueTypeClause();
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
	public casefeatureFhirTypeClause(): CasefeatureFhirTypeClauseContext {
		let _localctx: CasefeatureFhirTypeClauseContext = new CasefeatureFhirTypeClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 32, CPGLParser.RULE_casefeatureFhirTypeClause);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 131;
			this.match(CPGLParser.FHIRTYPE);
			this.state = 132;
			this.match(CPGLParser.CASEFEATURE_FHIR_TYPE);
			this.state = 133;
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
			this.state = 135;
			this.match(CPGLParser.VALUETYPE);
			this.state = 136;
			this.match(CPGLParser.FHIR_VALUE_TYPE);
			this.state = 137;
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
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x03\x16\x8E\x04\x02" +
		"\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04\x07" +
		"\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r\x04" +
		"\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11\t\x11\x04\x12\t\x12\x04" +
		"\x13\t\x13\x03\x02\x07\x02(\n\x02\f\x02\x0E\x02+\v\x02\x03\x02\x07\x02" +
		".\n\x02\f\x02\x0E\x021\v\x02\x03\x02\x03\x02\x03\x03\x03\x03\x03\x03\x05" +
		"\x038\n\x03\x03\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03\x05\x03\x05\x06" +
		"\x05A\n\x05\r\x05\x0E\x05B\x03\x05\x03\x05\x03\x06\x03\x06\x03\x06\x05" +
		"\x06J\n\x06\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\b\x03" +
		"\b\x03\b\x03\b\x03\t\x03\t\x03\t\x03\t\x03\n\x03\n\x03\n\x03\n\x05\n^" +
		"\n\n\x03\v\x03\v\x06\vb\n\v\r\v\x0E\vc\x03\v\x03\v\x03\f\x03\f\x05\fj" +
		"\n\f\x03\r\x03\r\x03\r\x03\r\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0F\x03" +
		"\x0F\x03\x0F\x03\x0F\x05\x0Fx\n\x0F\x03\x10\x03\x10\x06\x10|\n\x10\r\x10" +
		"\x0E\x10}\x03\x10\x03\x10\x03\x11\x03\x11\x05\x11\x84\n\x11\x03\x12\x03" +
		"\x12\x03\x12\x03\x12\x03\x13\x03\x13\x03\x13\x03\x13\x03\x13\x02\x02\x02" +
		"\x14\x02\x02\x04\x02\x06\x02\b\x02\n\x02\f\x02\x0E\x02\x10\x02\x12\x02" +
		"\x14\x02\x16\x02\x18\x02\x1A\x02\x1C\x02\x1E\x02 \x02\"\x02$\x02\x02\x04" +
		"\x03\x02\f\r\x03\x03\f\f\x02\x88\x02)\x03\x02\x02\x02\x047\x03\x02\x02" +
		"\x02\x069\x03\x02\x02\x02\b>\x03\x02\x02\x02\nI\x03\x02\x02\x02\fK\x03" +
		"\x02\x02\x02\x0EQ\x03\x02\x02\x02\x10U\x03\x02\x02\x02\x12Y\x03\x02\x02" +
		"\x02\x14_\x03\x02\x02\x02\x16i\x03\x02\x02\x02\x18k\x03\x02\x02\x02\x1A" +
		"o\x03\x02\x02\x02\x1Cs\x03\x02\x02\x02\x1Ey\x03\x02\x02\x02 \x83\x03\x02" +
		"\x02\x02\"\x85\x03\x02\x02\x02$\x89\x03\x02\x02\x02&(\t\x02\x02\x02\'" +
		"&\x03\x02\x02\x02(+\x03\x02\x02\x02)\'\x03\x02\x02\x02)*\x03\x02\x02\x02" +
		"*/\x03\x02\x02\x02+)\x03\x02\x02\x02,.\x05\x04\x03\x02-,\x03\x02\x02\x02" +
		".1\x03\x02\x02\x02/-\x03\x02\x02\x02/0\x03\x02\x02\x0202\x03\x02\x02\x02" +
		"1/\x03\x02\x02\x0223\x07\x02\x02\x033\x03\x03\x02\x02\x0248\x05\x06\x04" +
		"\x0258\x05\x12\n\x0268\x05\x1C\x0F\x0274\x03\x02\x02\x0275\x03\x02\x02" +
		"\x0276\x03\x02\x02\x028\x05\x03\x02\x02\x029:\x07\x03\x02\x02:;\x07\x15" +
		"\x02\x02;<\x07\f\x02\x02<=\x05\b\x05\x02=\x07\x03\x02\x02\x02>@\x07\x10" +
		"\x02\x02?A\x05\n\x06\x02@?\x03\x02\x02\x02AB\x03\x02\x02\x02B@\x03\x02" +
		"\x02\x02BC\x03\x02\x02\x02CD\x03\x02\x02\x02DE\x07\x11\x02\x02E\t\x03" +
		"\x02\x02\x02FJ\x05\f\x07\x02GJ\x05\x0E\b\x02HJ\x05\x10\t\x02IF\x03\x02" +
		"\x02\x02IG\x03\x02\x02\x02IH\x03\x02\x02\x02J\v\x03\x02\x02\x02KL\x07" +
		"\x04\x02\x02LM\x07\x15\x02\x02MN\x07\x05\x02\x02NO\x07\f\x02\x02OP\x05" +
		"\b\x05\x02P\r\x03\x02\x02\x02QR\x07\x06\x02\x02RS\x07\x15\x02\x02ST\t" +
		"\x03\x02\x02T\x0F\x03\x02\x02\x02UV\x07\x07\x02\x02VW\x07\x15\x02\x02" +
		"WX\t\x03\x02\x02X\x11\x03\x02\x02\x02YZ\x07\b\x02\x02Z[\x07\x15\x02\x02" +
		"[]\x07\f\x02\x02\\^\x05\x14\v\x02]\\\x03\x02\x02\x02]^\x03\x02\x02\x02" +
		"^\x13\x03\x02\x02\x02_a\x07\x10\x02\x02`b\x05\x16\f\x02a`\x03\x02\x02" +
		"\x02bc\x03\x02\x02\x02ca\x03\x02\x02\x02cd\x03\x02\x02\x02de\x03\x02\x02" +
		"\x02ef\x07\x11\x02\x02f\x15\x03\x02\x02\x02gj\x05\x18\r\x02hj\x05\x1A" +
		"\x0E\x02ig\x03\x02\x02\x02ih\x03\x02\x02\x02j\x17\x03\x02\x02\x02kl\x07" +
		"\t\x02\x02lm\x07\x12\x02\x02mn\x07\f\x02\x02n\x19\x03\x02\x02\x02op\x07" +
		"\v\x02\x02pq\x07\x14\x02\x02qr\x07\f\x02\x02r\x1B\x03\x02\x02\x02st\x07" +
		"\n\x02\x02tu\x07\x15\x02\x02uw\x07\f\x02\x02vx\x05\x1E\x10\x02wv\x03\x02" +
		"\x02\x02wx\x03\x02\x02\x02x\x1D\x03\x02\x02\x02y{\x07\x10\x02\x02z|\x05" +
		" \x11\x02{z\x03\x02\x02\x02|}\x03\x02\x02\x02}{\x03\x02\x02\x02}~\x03" +
		"\x02\x02\x02~\x7F\x03\x02\x02\x02\x7F\x80\x07\x11\x02\x02\x80\x1F\x03" +
		"\x02\x02\x02\x81\x84\x05\"\x12\x02\x82\x84\x05$\x13\x02\x83\x81\x03\x02" +
		"\x02\x02\x83\x82\x03\x02\x02\x02\x84!\x03\x02\x02\x02\x85\x86\x07\t\x02" +
		"\x02\x86\x87\x07\x13\x02\x02\x87\x88\x07\f\x02\x02\x88#\x03\x02\x02\x02" +
		"\x89\x8A\x07\v\x02\x02\x8A\x8B\x07\x14\x02\x02\x8B\x8C\x07\f\x02\x02\x8C" +
		"%\x03\x02\x02\x02\r)/7BI]ciw}\x83";
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
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	public actionBlock(): ActionBlockContext | undefined {
		return this.tryGetRuleContext(0, ActionBlockContext);
	}
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
	public actionLine(): ActionLineContext[];
	public actionLine(i: number): ActionLineContext;
	public actionLine(i?: number): ActionLineContext | ActionLineContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ActionLineContext);
		} else {
			return this.getRuleContext(i, ActionLineContext);
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


export class ActionLineContext extends ParserRuleContext {
	public fhirTypeClause(): FhirTypeClauseContext | undefined {
		return this.tryGetRuleContext(0, FhirTypeClauseContext);
	}
	public valueTypeClause(): ValueTypeClauseContext | undefined {
		return this.tryGetRuleContext(0, ValueTypeClauseContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_actionLine; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterActionLine) {
			listener.enterActionLine(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitActionLine) {
			listener.exitActionLine(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitActionLine) {
			return visitor.visitActionLine(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class FhirTypeClauseContext extends ParserRuleContext {
	public FHIRTYPE(): TerminalNode { return this.getToken(CPGLParser.FHIRTYPE, 0); }
	public ACTION_FHIR_TYPE(): TerminalNode { return this.getToken(CPGLParser.ACTION_FHIR_TYPE, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_fhirTypeClause; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterFhirTypeClause) {
			listener.enterFhirTypeClause(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitFhirTypeClause) {
			listener.exitFhirTypeClause(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitFhirTypeClause) {
			return visitor.visitFhirTypeClause(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ValueTypeClauseContext extends ParserRuleContext {
	public VALUETYPE(): TerminalNode { return this.getToken(CPGLParser.VALUETYPE, 0); }
	public FHIR_VALUE_TYPE(): TerminalNode { return this.getToken(CPGLParser.FHIR_VALUE_TYPE, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_valueTypeClause; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterValueTypeClause) {
			listener.enterValueTypeClause(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitValueTypeClause) {
			listener.exitValueTypeClause(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitValueTypeClause) {
			return visitor.visitValueTypeClause(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class CasefeatureContext extends ParserRuleContext {
	public CASEFEATURE(): TerminalNode { return this.getToken(CPGLParser.CASEFEATURE, 0); }
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	public casefeatureBlock(): CasefeatureBlockContext | undefined {
		return this.tryGetRuleContext(0, CasefeatureBlockContext);
	}
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
	public DEDENT(): TerminalNode { return this.getToken(CPGLParser.DEDENT, 0); }
	public casefeatureLine(): CasefeatureLineContext[];
	public casefeatureLine(i: number): CasefeatureLineContext;
	public casefeatureLine(i?: number): CasefeatureLineContext | CasefeatureLineContext[] {
		if (i === undefined) {
			return this.getRuleContexts(CasefeatureLineContext);
		} else {
			return this.getRuleContext(i, CasefeatureLineContext);
		}
	}
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
	public casefeatureFhirTypeClause(): CasefeatureFhirTypeClauseContext | undefined {
		return this.tryGetRuleContext(0, CasefeatureFhirTypeClauseContext);
	}
	public casefeatureValueTypeClause(): CasefeatureValueTypeClauseContext | undefined {
		return this.tryGetRuleContext(0, CasefeatureValueTypeClauseContext);
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


