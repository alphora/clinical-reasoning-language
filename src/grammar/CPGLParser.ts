// Generated from docs\CPGL.g4 by ANTLR 4.9.0-SNAPSHOT


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
	public static readonly IDENTIFIER = 13;
	public static readonly NEWLINE = 14;
	public static readonly WS = 15;
	public static readonly COMMENT = 16;
	public static readonly COMMENT_BLOCK = 17;
	public static readonly INDENT = 18;
	public static readonly DEDENT = 19;
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
		undefined, undefined, undefined, undefined, undefined, "'<INDENT>'", "'<DEDENT>'",
	];
	private static readonly _SYMBOLIC_NAMES: Array<string | undefined> = [
		undefined, undefined, undefined, undefined, undefined, undefined, undefined, 
		undefined, undefined, undefined, undefined, undefined, "STRING", "IDENTIFIER", 
		"NEWLINE", "WS", "COMMENT", "COMMENT_BLOCK", "INDENT", "DEDENT",
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
			while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << CPGLParser.T__0) | (1 << CPGLParser.T__5) | (1 << CPGLParser.T__7))) !== 0)) {
				{
				{
				this.state = 38;
				this.statement();
				}
				}
				this.state = 43;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 44;
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
			this.state = 49;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case CPGLParser.T__0:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 46;
				this.decision();
				}
				break;
			case CPGLParser.T__5:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 47;
				this.action();
				}
				break;
			case CPGLParser.T__7:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 48;
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
			this.state = 51;
			this.match(CPGLParser.T__0);
			this.state = 52;
			this.match(CPGLParser.STRING);
			this.state = 53;
			this.match(CPGLParser.NEWLINE);
			this.state = 54;
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
			this.state = 56;
			this.match(CPGLParser.INDENT);
			this.state = 58;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 57;
				this.statementLine();
				}
				}
				this.state = 60;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << CPGLParser.T__1) | (1 << CPGLParser.T__3) | (1 << CPGLParser.T__4))) !== 0));
			this.state = 62;
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
			this.state = 67;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case CPGLParser.T__1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 64;
				this.whenClause();
				}
				break;
			case CPGLParser.T__3:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 65;
				this.doClause();
				}
				break;
			case CPGLParser.T__4:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 66;
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
			this.state = 69;
			this.match(CPGLParser.T__1);
			this.state = 70;
			this.match(CPGLParser.STRING);
			this.state = 71;
			this.match(CPGLParser.T__2);
			this.state = 72;
			this.match(CPGLParser.NEWLINE);
			this.state = 73;
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
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 75;
			this.match(CPGLParser.T__3);
			this.state = 76;
			this.match(CPGLParser.STRING);
			this.state = 77;
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
	public useClause(): UseClauseContext {
		let _localctx: UseClauseContext = new UseClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 14, CPGLParser.RULE_useClause);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 79;
			this.match(CPGLParser.T__4);
			this.state = 80;
			this.match(CPGLParser.STRING);
			this.state = 81;
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
	public action(): ActionContext {
		let _localctx: ActionContext = new ActionContext(this._ctx, this.state);
		this.enterRule(_localctx, 16, CPGLParser.RULE_action);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 83;
			this.match(CPGLParser.T__5);
			this.state = 84;
			this.match(CPGLParser.STRING);
			this.state = 85;
			this.match(CPGLParser.NEWLINE);
			this.state = 87;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === CPGLParser.INDENT) {
				{
				this.state = 86;
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
			this.state = 89;
			this.match(CPGLParser.INDENT);
			this.state = 90;
			this.actionBody();
			this.state = 91;
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
			this.state = 93;
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
			this.state = 95;
			this.match(CPGLParser.T__6);
			this.state = 96;
			this.match(CPGLParser.IDENTIFIER);
			this.state = 97;
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
			this.state = 99;
			this.match(CPGLParser.T__7);
			this.state = 100;
			this.match(CPGLParser.STRING);
			this.state = 101;
			this.match(CPGLParser.NEWLINE);
			this.state = 102;
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
			this.state = 104;
			this.match(CPGLParser.INDENT);
			this.state = 105;
			this.casefeatureBody();
			this.state = 106;
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
			this.state = 112;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				this.state = 112;
				this._errHandler.sync(this);
				switch (this._input.LA(1)) {
				case CPGLParser.T__8:
					{
					this.state = 108;
					this.codeClause();
					}
					break;
				case CPGLParser.T__6:
					{
					this.state = 109;
					this.casefeatureFhirtypeClause();
					}
					break;
				case CPGLParser.T__9:
					{
					this.state = 110;
					this.urlClause();
					}
					break;
				case CPGLParser.T__10:
					{
					this.state = 111;
					this.valuetypeClause();
					}
					break;
				default:
					throw new NoViableAltException(this);
				}
				}
				this.state = 114;
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
			this.state = 116;
			this.match(CPGLParser.T__8);
			this.state = 117;
			this.match(CPGLParser.STRING);
			this.state = 118;
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
			this.state = 120;
			this.match(CPGLParser.T__6);
			this.state = 121;
			this.match(CPGLParser.IDENTIFIER);
			this.state = 122;
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
			this.state = 124;
			this.match(CPGLParser.T__9);
			this.state = 125;
			this.match(CPGLParser.STRING);
			this.state = 126;
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
			this.state = 128;
			this.match(CPGLParser.T__10);
			this.state = 129;
			this.match(CPGLParser.IDENTIFIER);
			this.state = 130;
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
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x03\x15\x87\x04\x02" +
		"\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04\x07" +
		"\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r\x04" +
		"\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11\t\x11\x04\x12\t\x12\x04" +
		"\x13\t\x13\x04\x14\t\x14\x03\x02\x07\x02*\n\x02\f\x02\x0E\x02-\v\x02\x03" +
		"\x02\x03\x02\x03\x03\x03\x03\x03\x03\x05\x034\n\x03\x03\x04\x03\x04\x03" +
		"\x04\x03\x04\x03\x04\x03\x05\x03\x05\x06\x05=\n\x05\r\x05\x0E\x05>\x03" +
		"\x05\x03\x05\x03\x06\x03\x06\x03\x06\x05\x06F\n\x06\x03\x07\x03\x07\x03" +
		"\x07\x03\x07\x03\x07\x03\x07\x03\b\x03\b\x03\b\x03\b\x03\t\x03\t\x03\t" +
		"\x03\t\x03\n\x03\n\x03\n\x03\n\x05\nZ\n\n\x03\v\x03\v\x03\v\x03\v\x03" +
		"\f\x03\f\x03\r\x03\r\x03\r\x03\r\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0E" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x10\x03\x10\x03\x10\x03\x10\x06\x10" +
		"s\n\x10\r\x10\x0E\x10t\x03\x11\x03\x11\x03\x11\x03\x11\x03\x12\x03\x12" +
		"\x03\x12\x03\x12\x03\x13\x03\x13\x03\x13\x03\x13\x03\x14\x03\x14\x03\x14" +
		"\x03\x14\x03\x14\x02\x02\x02\x15\x02\x02\x04\x02\x06\x02\b\x02\n\x02\f" +
		"\x02\x0E\x02\x10\x02\x12\x02\x14\x02\x16\x02\x18\x02\x1A\x02\x1C\x02\x1E" +
		"\x02 \x02\"\x02$\x02&\x02\x02\x02\x02~\x02+\x03\x02\x02\x02\x043\x03\x02" +
		"\x02\x02\x065\x03\x02\x02\x02\b:\x03\x02\x02\x02\nE\x03\x02\x02\x02\f" +
		"G\x03\x02\x02\x02\x0EM\x03\x02\x02\x02\x10Q\x03\x02\x02\x02\x12U\x03\x02" +
		"\x02\x02\x14[\x03\x02\x02\x02\x16_\x03\x02\x02\x02\x18a\x03\x02\x02\x02" +
		"\x1Ae\x03\x02\x02\x02\x1Cj\x03\x02\x02\x02\x1Er\x03\x02\x02\x02 v\x03" +
		"\x02\x02\x02\"z\x03\x02\x02\x02$~\x03\x02\x02\x02&\x82\x03\x02\x02\x02" +
		"(*\x05\x04\x03\x02)(\x03\x02\x02\x02*-\x03\x02\x02\x02+)\x03\x02\x02\x02" +
		"+,\x03\x02\x02\x02,.\x03\x02\x02\x02-+\x03\x02\x02\x02./\x07\x02\x02\x03" +
		"/\x03\x03\x02\x02\x0204\x05\x06\x04\x0214\x05\x12\n\x0224\x05\x1A\x0E" +
		"\x0230\x03\x02\x02\x0231\x03\x02\x02\x0232\x03\x02\x02\x024\x05\x03\x02" +
		"\x02\x0256\x07\x03\x02\x0267\x07\x0E\x02\x0278\x07\x10\x02\x0289\x05\b" +
		"\x05\x029\x07\x03\x02\x02\x02:<\x07\x14\x02\x02;=\x05\n\x06\x02<;\x03" +
		"\x02\x02\x02=>\x03\x02\x02\x02><\x03\x02\x02\x02>?\x03\x02\x02\x02?@\x03" +
		"\x02\x02\x02@A\x07\x15\x02\x02A\t\x03\x02\x02\x02BF\x05\f\x07\x02CF\x05" +
		"\x0E\b\x02DF\x05\x10\t\x02EB\x03\x02\x02\x02EC\x03\x02\x02\x02ED\x03\x02" +
		"\x02\x02F\v\x03\x02\x02\x02GH\x07\x04\x02\x02HI\x07\x0E\x02\x02IJ\x07" +
		"\x05\x02\x02JK\x07\x10\x02\x02KL\x05\b\x05\x02L\r\x03\x02\x02\x02MN\x07" +
		"\x06\x02\x02NO\x07\x0E\x02\x02OP\x07\x10\x02\x02P\x0F\x03\x02\x02\x02" +
		"QR\x07\x07\x02\x02RS\x07\x0E\x02\x02ST\x07\x10\x02\x02T\x11\x03\x02\x02" +
		"\x02UV\x07\b\x02\x02VW\x07\x0E\x02\x02WY\x07\x10\x02\x02XZ\x05\x14\v\x02" +
		"YX\x03\x02\x02\x02YZ\x03\x02\x02\x02Z\x13\x03\x02\x02\x02[\\\x07\x14\x02" +
		"\x02\\]\x05\x16\f\x02]^\x07\x15\x02\x02^\x15\x03\x02\x02\x02_`\x05\x18" +
		"\r\x02`\x17\x03\x02\x02\x02ab\x07\t\x02\x02bc\x07\x0F\x02\x02cd\x07\x10" +
		"\x02\x02d\x19\x03\x02\x02\x02ef\x07\n\x02\x02fg\x07\x0E\x02\x02gh\x07" +
		"\x10\x02\x02hi\x05\x1C\x0F\x02i\x1B\x03\x02\x02\x02jk\x07\x14\x02\x02" +
		"kl\x05\x1E\x10\x02lm\x07\x15\x02\x02m\x1D\x03\x02\x02\x02ns\x05 \x11\x02" +
		"os\x05\"\x12\x02ps\x05$\x13\x02qs\x05&\x14\x02rn\x03\x02\x02\x02ro\x03" +
		"\x02\x02\x02rp\x03\x02\x02\x02rq\x03\x02\x02\x02st\x03\x02\x02\x02tr\x03" +
		"\x02\x02\x02tu\x03\x02\x02\x02u\x1F\x03\x02\x02\x02vw\x07\v\x02\x02wx" +
		"\x07\x0E\x02\x02xy\x07\x10\x02\x02y!\x03\x02\x02\x02z{\x07\t\x02\x02{" +
		"|\x07\x0F\x02\x02|}\x07\x10\x02\x02}#\x03\x02\x02\x02~\x7F\x07\f\x02\x02" +
		"\x7F\x80\x07\x0E\x02\x02\x80\x81\x07\x10\x02\x02\x81%\x03\x02\x02\x02" +
		"\x82\x83\x07\r\x02\x02\x83\x84\x07\x0F\x02\x02\x84\x85\x07\x10\x02\x02" +
		"\x85\'\x03\x02\x02\x02\t+3>EYrt";
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
}


export class DoClauseContext extends ParserRuleContext {
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
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
}


export class UseClauseContext extends ParserRuleContext {
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
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
}


export class FhirtypeClauseContext extends ParserRuleContext {
	public IDENTIFIER(): TerminalNode { return this.getToken(CPGLParser.IDENTIFIER, 0); }
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
}


export class CasefeatureFhirtypeClauseContext extends ParserRuleContext {
	public IDENTIFIER(): TerminalNode { return this.getToken(CPGLParser.IDENTIFIER, 0); }
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
}


export class ValuetypeClauseContext extends ParserRuleContext {
	public IDENTIFIER(): TerminalNode { return this.getToken(CPGLParser.IDENTIFIER, 0); }
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
}


