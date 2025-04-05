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
	public static readonly T__0 = 1;
	public static readonly T__1 = 2;
	public static readonly T__2 = 3;
	public static readonly T__3 = 4;
	public static readonly T__4 = 5;
	public static readonly T__5 = 6;
	public static readonly T__6 = 7;
	public static readonly T__7 = 8;
	public static readonly T__8 = 9;
	public static readonly T__9 = 10;
	public static readonly T__10 = 11;
	public static readonly STRING = 12;
	public static readonly ACTION_FHIR_TYPE = 13;
	public static readonly CASEFEATURE_FHIR_TYPE = 14;
	public static readonly FHIR_VALUE_TYPE = 15;
	public static readonly NEWLINE = 16;
	public static readonly WS = 17;
	public static readonly COMMENT = 18;
	public static readonly COMMENT_BLOCK = 19;
	public static readonly INDENT = 20;
	public static readonly DEDENT = 21;
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
	public static readonly RULE_actionBody = 10;
	public static readonly RULE_fhirtypeClause = 11;
	public static readonly RULE_casefeature = 12;
	public static readonly RULE_casefeatureBlock = 13;
	public static readonly RULE_casefeatureBody = 14;
	public static readonly RULE_codeClause = 15;
	public static readonly RULE_casefeatureFhirtypeClause = 16;
	public static readonly RULE_urlClause = 17;
	public static readonly RULE_valuetypeClause = 18;
	// tslint:disable:no-trailing-whitespace
	public static readonly ruleNames: string[] = [
		"file", "statement", "decision", "block", "statementLine", "whenClause", 
		"doClause", "useClause", "action", "actionBlock", "actionBody", "fhirtypeClause", 
		"casefeature", "casefeatureBlock", "casefeatureBody", "codeClause", "casefeatureFhirtypeClause", 
		"urlClause", "valuetypeClause",
	];

	private static readonly _LITERAL_NAMES: Array<string | undefined> = [
		undefined, "'decision'", "'when'", "'then'", "'do'", "'use'", "'action'", 
		"'fhirtype'", "'casefeature'", "'code'", "'url'", "'valuetype'", undefined, 
		undefined, undefined, undefined, undefined, undefined, undefined, undefined, 
		"'<INDENT>'", "'<DEDENT>'",
	];
	private static readonly _SYMBOLIC_NAMES: Array<string | undefined> = [
		undefined, undefined, undefined, undefined, undefined, undefined, undefined, 
		undefined, undefined, undefined, undefined, undefined, "STRING", "ACTION_FHIR_TYPE", 
		"CASEFEATURE_FHIR_TYPE", "FHIR_VALUE_TYPE", "NEWLINE", "WS", "COMMENT", 
		"COMMENT_BLOCK", "INDENT", "DEDENT",
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
			this.state = 41;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === CPGLParser.NEWLINE || _la === CPGLParser.WS) {
				{
				{
				this.state = 38;
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
				this.state = 43;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 47;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << CPGLParser.T__0) | (1 << CPGLParser.T__5) | (1 << CPGLParser.T__7))) !== 0)) {
				{
				{
				this.state = 44;
				this.statement();
				}
				}
				this.state = 49;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 50;
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
			this.state = 55;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case CPGLParser.T__0:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 52;
				this.decision();
				}
				break;
			case CPGLParser.T__5:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 53;
				this.action();
				}
				break;
			case CPGLParser.T__7:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 54;
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
			this.state = 57;
			this.match(CPGLParser.T__0);
			this.state = 58;
			this.match(CPGLParser.STRING);
			this.state = 59;
			this.match(CPGLParser.NEWLINE);
			this.state = 60;
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
			this.state = 62;
			this.match(CPGLParser.INDENT);
			this.state = 64;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 63;
				this.statementLine();
				}
				}
				this.state = 66;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << CPGLParser.T__1) | (1 << CPGLParser.T__3) | (1 << CPGLParser.T__4))) !== 0));
			this.state = 68;
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
			this.state = 73;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case CPGLParser.T__1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 70;
				this.whenClause();
				}
				break;
			case CPGLParser.T__3:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 71;
				this.doClause();
				}
				break;
			case CPGLParser.T__4:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 72;
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
			this.state = 75;
			this.match(CPGLParser.T__1);
			this.state = 76;
			this.match(CPGLParser.STRING);
			this.state = 77;
			this.match(CPGLParser.T__2);
			this.state = 78;
			this.match(CPGLParser.NEWLINE);
			this.state = 79;
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
			this.state = 81;
			this.match(CPGLParser.T__3);
			this.state = 82;
			this.match(CPGLParser.STRING);
			this.state = 83;
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
			this.state = 85;
			this.match(CPGLParser.T__4);
			this.state = 86;
			this.match(CPGLParser.STRING);
			this.state = 87;
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
			this.state = 89;
			this.match(CPGLParser.T__5);
			this.state = 90;
			this.match(CPGLParser.STRING);
			this.state = 91;
			this.match(CPGLParser.NEWLINE);
			this.state = 93;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === CPGLParser.INDENT) {
				{
				this.state = 92;
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
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 95;
			this.match(CPGLParser.INDENT);
			this.state = 96;
			this.actionBody();
			this.state = 97;
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
	public actionBody(): ActionBodyContext {
		let _localctx: ActionBodyContext = new ActionBodyContext(this._ctx, this.state);
		this.enterRule(_localctx, 20, CPGLParser.RULE_actionBody);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 99;
			this.fhirtypeClause();
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
	public fhirtypeClause(): FhirtypeClauseContext {
		let _localctx: FhirtypeClauseContext = new FhirtypeClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 22, CPGLParser.RULE_fhirtypeClause);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 101;
			this.match(CPGLParser.T__6);
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
		this.enterRule(_localctx, 24, CPGLParser.RULE_casefeature);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 105;
			this.match(CPGLParser.T__7);
			this.state = 106;
			this.match(CPGLParser.STRING);
			this.state = 107;
			this.match(CPGLParser.NEWLINE);
			this.state = 108;
			this.casefeatureBlock();
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
		this.enterRule(_localctx, 26, CPGLParser.RULE_casefeatureBlock);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 110;
			this.match(CPGLParser.INDENT);
			this.state = 111;
			this.casefeatureBody();
			this.state = 112;
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
	public casefeatureBody(): CasefeatureBodyContext {
		let _localctx: CasefeatureBodyContext = new CasefeatureBodyContext(this._ctx, this.state);
		this.enterRule(_localctx, 28, CPGLParser.RULE_casefeatureBody);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 118;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				this.state = 118;
				this._errHandler.sync(this);
				switch (this._input.LA(1)) {
				case CPGLParser.T__8:
					{
					this.state = 114;
					this.codeClause();
					}
					break;
				case CPGLParser.T__6:
					{
					this.state = 115;
					this.casefeatureFhirtypeClause();
					}
					break;
				case CPGLParser.T__9:
					{
					this.state = 116;
					this.urlClause();
					}
					break;
				case CPGLParser.T__10:
					{
					this.state = 117;
					this.valuetypeClause();
					}
					break;
				default:
					throw new NoViableAltException(this);
				}
				}
				this.state = 120;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << CPGLParser.T__6) | (1 << CPGLParser.T__8) | (1 << CPGLParser.T__9) | (1 << CPGLParser.T__10))) !== 0));
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
	public codeClause(): CodeClauseContext {
		let _localctx: CodeClauseContext = new CodeClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 30, CPGLParser.RULE_codeClause);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 122;
			this.match(CPGLParser.T__8);
			this.state = 123;
			this.match(CPGLParser.STRING);
			this.state = 124;
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
	public casefeatureFhirtypeClause(): CasefeatureFhirtypeClauseContext {
		let _localctx: CasefeatureFhirtypeClauseContext = new CasefeatureFhirtypeClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 32, CPGLParser.RULE_casefeatureFhirtypeClause);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 126;
			this.match(CPGLParser.T__6);
			this.state = 127;
			this.match(CPGLParser.CASEFEATURE_FHIR_TYPE);
			this.state = 128;
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
	public urlClause(): UrlClauseContext {
		let _localctx: UrlClauseContext = new UrlClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 34, CPGLParser.RULE_urlClause);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 130;
			this.match(CPGLParser.T__9);
			this.state = 131;
			this.match(CPGLParser.STRING);
			this.state = 132;
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
	public valuetypeClause(): ValuetypeClauseContext {
		let _localctx: ValuetypeClauseContext = new ValuetypeClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 36, CPGLParser.RULE_valuetypeClause);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 134;
			this.match(CPGLParser.T__10);
			this.state = 135;
			this.match(CPGLParser.FHIR_VALUE_TYPE);
			this.state = 136;
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
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x03\x17\x8D\x04\x02" +
		"\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04\x07" +
		"\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r\x04" +
		"\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11\t\x11\x04\x12\t\x12\x04" +
		"\x13\t\x13\x04\x14\t\x14\x03\x02\x07\x02*\n\x02\f\x02\x0E\x02-\v\x02\x03" +
		"\x02\x07\x020\n\x02\f\x02\x0E\x023\v\x02\x03\x02\x03\x02\x03\x03\x03\x03" +
		"\x03\x03\x05\x03:\n\x03\x03\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03\x05" +
		"\x03\x05\x06\x05C\n\x05\r\x05\x0E\x05D\x03\x05\x03\x05\x03\x06\x03\x06" +
		"\x03\x06\x05\x06L\n\x06\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07" +
		"\x03\b\x03\b\x03\b\x03\b\x03\t\x03\t\x03\t\x03\t\x03\n\x03\n\x03\n\x03" +
		"\n\x05\n`\n\n\x03\v\x03\v\x03\v\x03\v\x03\f\x03\f\x03\r\x03\r\x03\r\x03" +
		"\r\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0F\x03\x0F\x03\x0F\x03" +
		"\x0F\x03\x10\x03\x10\x03\x10\x03\x10\x06\x10y\n\x10\r\x10\x0E\x10z\x03" +
		"\x11\x03\x11\x03\x11\x03\x11\x03\x12\x03\x12\x03\x12\x03\x12\x03\x13\x03" +
		"\x13\x03\x13\x03\x13\x03\x14\x03\x14\x03\x14\x03\x14\x03\x14\x02\x02\x02" +
		"\x15\x02\x02\x04\x02\x06\x02\b\x02\n\x02\f\x02\x0E\x02\x10\x02\x12\x02" +
		"\x14\x02\x16\x02\x18\x02\x1A\x02\x1C\x02\x1E\x02 \x02\"\x02$\x02&\x02" +
		"\x02\x04\x03\x02\x12\x13\x03\x03\x12\x12\x02\x85\x02+\x03\x02\x02\x02" +
		"\x049\x03\x02\x02\x02\x06;\x03\x02\x02\x02\b@\x03\x02\x02\x02\nK\x03\x02" +
		"\x02\x02\fM\x03\x02\x02\x02\x0ES\x03\x02\x02\x02\x10W\x03\x02\x02\x02" +
		"\x12[\x03\x02\x02\x02\x14a\x03\x02\x02\x02\x16e\x03\x02\x02\x02\x18g\x03" +
		"\x02\x02\x02\x1Ak\x03\x02\x02\x02\x1Cp\x03\x02\x02\x02\x1Ex\x03\x02\x02" +
		"\x02 |\x03\x02\x02\x02\"\x80\x03\x02\x02\x02$\x84\x03\x02\x02\x02&\x88" +
		"\x03\x02\x02\x02(*\t\x02\x02\x02)(\x03\x02\x02\x02*-\x03\x02\x02\x02+" +
		")\x03\x02\x02\x02+,\x03\x02\x02\x02,1\x03\x02\x02\x02-+\x03\x02\x02\x02" +
		".0\x05\x04\x03\x02/.\x03\x02\x02\x0203\x03\x02\x02\x021/\x03\x02\x02\x02" +
		"12\x03\x02\x02\x0224\x03\x02\x02\x0231\x03\x02\x02\x0245\x07\x02\x02\x03" +
		"5\x03\x03\x02\x02\x026:\x05\x06\x04\x027:\x05\x12\n\x028:\x05\x1A\x0E" +
		"\x0296\x03\x02\x02\x0297\x03\x02\x02\x0298\x03\x02\x02\x02:\x05\x03\x02" +
		"\x02\x02;<\x07\x03\x02\x02<=\x07\x0E\x02\x02=>\x07\x12\x02\x02>?\x05\b" +
		"\x05\x02?\x07\x03\x02\x02\x02@B\x07\x16\x02\x02AC\x05\n\x06\x02BA\x03" +
		"\x02\x02\x02CD\x03\x02\x02\x02DB\x03\x02\x02\x02DE\x03\x02\x02\x02EF\x03" +
		"\x02\x02\x02FG\x07\x17\x02\x02G\t\x03\x02\x02\x02HL\x05\f\x07\x02IL\x05" +
		"\x0E\b\x02JL\x05\x10\t\x02KH\x03\x02\x02\x02KI\x03\x02\x02\x02KJ\x03\x02" +
		"\x02\x02L\v\x03\x02\x02\x02MN\x07\x04\x02\x02NO\x07\x0E\x02\x02OP\x07" +
		"\x05\x02\x02PQ\x07\x12\x02\x02QR\x05\b\x05\x02R\r\x03\x02\x02\x02ST\x07" +
		"\x06\x02\x02TU\x07\x0E\x02\x02UV\t\x03\x02\x02V\x0F\x03\x02\x02\x02WX" +
		"\x07\x07\x02\x02XY\x07\x0E\x02\x02YZ\t\x03\x02\x02Z\x11\x03\x02\x02\x02" +
		"[\\\x07\b\x02\x02\\]\x07\x0E\x02\x02]_\x07\x12\x02\x02^`\x05\x14\v\x02" +
		"_^\x03\x02\x02\x02_`\x03\x02\x02\x02`\x13\x03\x02\x02\x02ab\x07\x16\x02" +
		"\x02bc\x05\x16\f\x02cd\x07\x17\x02\x02d\x15\x03\x02\x02\x02ef\x05\x18" +
		"\r\x02f\x17\x03\x02\x02\x02gh\x07\t\x02\x02hi\x07\x0F\x02\x02ij\x07\x12" +
		"\x02\x02j\x19\x03\x02\x02\x02kl\x07\n\x02\x02lm\x07\x0E\x02\x02mn\x07" +
		"\x12\x02\x02no\x05\x1C\x0F\x02o\x1B\x03\x02\x02\x02pq\x07\x16\x02\x02" +
		"qr\x05\x1E\x10\x02rs\x07\x17\x02\x02s\x1D\x03\x02\x02\x02ty\x05 \x11\x02" +
		"uy\x05\"\x12\x02vy\x05$\x13\x02wy\x05&\x14\x02xt\x03\x02\x02\x02xu\x03" +
		"\x02\x02\x02xv\x03\x02\x02\x02xw\x03\x02\x02\x02yz\x03\x02\x02\x02zx\x03" +
		"\x02\x02\x02z{\x03\x02\x02\x02{\x1F\x03\x02\x02\x02|}\x07\v\x02\x02}~" +
		"\x07\x0E\x02\x02~\x7F\x07\x12\x02\x02\x7F!\x03\x02\x02\x02\x80\x81\x07" +
		"\t\x02\x02\x81\x82\x07\x10\x02\x02\x82\x83\x07\x12\x02\x02\x83#\x03\x02" +
		"\x02\x02\x84\x85\x07\f\x02\x02\x85\x86\x07\x0E\x02\x02\x86\x87\x07\x12" +
		"\x02\x02\x87%\x03\x02\x02\x02\x88\x89\x07\r\x02\x02\x89\x8A\x07\x11\x02" +
		"\x02\x8A\x8B\x07\x12\x02\x02\x8B\'\x03\x02\x02\x02\n+19DK_xz";
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
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
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
	public actionBody(): ActionBodyContext {
		return this.getRuleContext(0, ActionBodyContext);
	}
	public DEDENT(): TerminalNode { return this.getToken(CPGLParser.DEDENT, 0); }
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


export class ActionBodyContext extends ParserRuleContext {
	public fhirtypeClause(): FhirtypeClauseContext {
		return this.getRuleContext(0, FhirtypeClauseContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_actionBody; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterActionBody) {
			listener.enterActionBody(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitActionBody) {
			listener.exitActionBody(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitActionBody) {
			return visitor.visitActionBody(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class FhirtypeClauseContext extends ParserRuleContext {
	public ACTION_FHIR_TYPE(): TerminalNode { return this.getToken(CPGLParser.ACTION_FHIR_TYPE, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_fhirtypeClause; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterFhirtypeClause) {
			listener.enterFhirtypeClause(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitFhirtypeClause) {
			listener.exitFhirtypeClause(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitFhirtypeClause) {
			return visitor.visitFhirtypeClause(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class CasefeatureContext extends ParserRuleContext {
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	public casefeatureBlock(): CasefeatureBlockContext {
		return this.getRuleContext(0, CasefeatureBlockContext);
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
	public casefeatureBody(): CasefeatureBodyContext {
		return this.getRuleContext(0, CasefeatureBodyContext);
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


export class CasefeatureBodyContext extends ParserRuleContext {
	public codeClause(): CodeClauseContext[];
	public codeClause(i: number): CodeClauseContext;
	public codeClause(i?: number): CodeClauseContext | CodeClauseContext[] {
		if (i === undefined) {
			return this.getRuleContexts(CodeClauseContext);
		} else {
			return this.getRuleContext(i, CodeClauseContext);
		}
	}
	public casefeatureFhirtypeClause(): CasefeatureFhirtypeClauseContext[];
	public casefeatureFhirtypeClause(i: number): CasefeatureFhirtypeClauseContext;
	public casefeatureFhirtypeClause(i?: number): CasefeatureFhirtypeClauseContext | CasefeatureFhirtypeClauseContext[] {
		if (i === undefined) {
			return this.getRuleContexts(CasefeatureFhirtypeClauseContext);
		} else {
			return this.getRuleContext(i, CasefeatureFhirtypeClauseContext);
		}
	}
	public urlClause(): UrlClauseContext[];
	public urlClause(i: number): UrlClauseContext;
	public urlClause(i?: number): UrlClauseContext | UrlClauseContext[] {
		if (i === undefined) {
			return this.getRuleContexts(UrlClauseContext);
		} else {
			return this.getRuleContext(i, UrlClauseContext);
		}
	}
	public valuetypeClause(): ValuetypeClauseContext[];
	public valuetypeClause(i: number): ValuetypeClauseContext;
	public valuetypeClause(i?: number): ValuetypeClauseContext | ValuetypeClauseContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ValuetypeClauseContext);
		} else {
			return this.getRuleContext(i, ValuetypeClauseContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_casefeatureBody; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterCasefeatureBody) {
			listener.enterCasefeatureBody(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitCasefeatureBody) {
			listener.exitCasefeatureBody(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitCasefeatureBody) {
			return visitor.visitCasefeatureBody(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class CodeClauseContext extends ParserRuleContext {
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_codeClause; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterCodeClause) {
			listener.enterCodeClause(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitCodeClause) {
			listener.exitCodeClause(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitCodeClause) {
			return visitor.visitCodeClause(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class CasefeatureFhirtypeClauseContext extends ParserRuleContext {
	public CASEFEATURE_FHIR_TYPE(): TerminalNode { return this.getToken(CPGLParser.CASEFEATURE_FHIR_TYPE, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_casefeatureFhirtypeClause; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterCasefeatureFhirtypeClause) {
			listener.enterCasefeatureFhirtypeClause(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitCasefeatureFhirtypeClause) {
			listener.exitCasefeatureFhirtypeClause(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitCasefeatureFhirtypeClause) {
			return visitor.visitCasefeatureFhirtypeClause(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class UrlClauseContext extends ParserRuleContext {
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_urlClause; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterUrlClause) {
			listener.enterUrlClause(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitUrlClause) {
			listener.exitUrlClause(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitUrlClause) {
			return visitor.visitUrlClause(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ValuetypeClauseContext extends ParserRuleContext {
	public FHIR_VALUE_TYPE(): TerminalNode { return this.getToken(CPGLParser.FHIR_VALUE_TYPE, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_valuetypeClause; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterValuetypeClause) {
			listener.enterValuetypeClause(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitValuetypeClause) {
			listener.exitValuetypeClause(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitValuetypeClause) {
			return visitor.visitValuetypeClause(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


