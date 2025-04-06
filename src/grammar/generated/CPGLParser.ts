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
	public static readonly T__11 = 12;
	public static readonly T__12 = 13;
	public static readonly T__13 = 14;
	public static readonly T__14 = 15;
	public static readonly T__15 = 16;
	public static readonly INDENT = 17;
	public static readonly DEDENT = 18;
	public static readonly NEWLINE = 19;
	public static readonly WS = 20;
	public static readonly COMMENT = 21;
	public static readonly COMMENT_BLOCK = 22;
	public static readonly STRING = 23;
	public static readonly OR = 24;
	public static readonly AND = 25;
	public static readonly NOT = 26;
	public static readonly ACTION_FHIR_TYPE = 27;
	public static readonly CASEFEATURE_FHIR_TYPE = 28;
	public static readonly FHIR_VALUE_TYPE = 29;
	public static readonly RULE_file = 0;
	public static readonly RULE_statement = 1;
	public static readonly RULE_decision = 2;
	public static readonly RULE_decisionBlock = 3;
	public static readonly RULE_whenClause = 4;
	public static readonly RULE_whenBlock = 5;
	public static readonly RULE_nestedWhenBlock = 6;
	public static readonly RULE_terminalBlock = 7;
	public static readonly RULE_terminalAction = 8;
	public static readonly RULE_doClause = 9;
	public static readonly RULE_useClause = 10;
	public static readonly RULE_optionalQualifier = 11;
	public static readonly RULE_action = 12;
	public static readonly RULE_actionBlock = 13;
	public static readonly RULE_actionClause = 14;
	public static readonly RULE_casefeature = 15;
	public static readonly RULE_casefeatureBlock = 16;
	public static readonly RULE_casefeatureCodeClause = 17;
	public static readonly RULE_casefeatureFhirTypeClause = 18;
	public static readonly RULE_casefeatureProfileUrlClause = 19;
	public static readonly RULE_casefeatureValueTypeClause = 20;
	public static readonly RULE_compositeExpression = 21;
	public static readonly RULE_booleanExpr = 22;
	public static readonly RULE_booleanTerm = 23;
	public static readonly RULE_booleanFactor = 24;
	// tslint:disable:no-trailing-whitespace
	public static readonly ruleNames: string[] = [
		"file", "statement", "decision", "decisionBlock", "whenClause", "whenBlock", 
		"nestedWhenBlock", "terminalBlock", "terminalAction", "doClause", "useClause", 
		"optionalQualifier", "action", "actionBlock", "actionClause", "casefeature", 
		"casefeatureBlock", "casefeatureCodeClause", "casefeatureFhirTypeClause", 
		"casefeatureProfileUrlClause", "casefeatureValueTypeClause", "compositeExpression", 
		"booleanExpr", "booleanTerm", "booleanFactor",
	];

	private static readonly _LITERAL_NAMES: Array<string | undefined> = [
		undefined, "'decision'", "'when'", "'then'", "'do'", "'use'", "'any'", 
		"'all'", "'action'", "'fhirtype'", "'casefeature'", "'casefeaturecode'", 
		"'profileurl'", "'valuetype'", "'expression'", "'('", "')'", "'    '", 
		"'<DEDENT>'", undefined, undefined, undefined, undefined, undefined, "'OR'", 
		"'AND'", "'NOT'",
	];
	private static readonly _SYMBOLIC_NAMES: Array<string | undefined> = [
		undefined, undefined, undefined, undefined, undefined, undefined, undefined, 
		undefined, undefined, undefined, undefined, undefined, undefined, undefined, 
		undefined, undefined, undefined, "INDENT", "DEDENT", "NEWLINE", "WS", 
		"COMMENT", "COMMENT_BLOCK", "STRING", "OR", "AND", "NOT", "ACTION_FHIR_TYPE", 
		"CASEFEATURE_FHIR_TYPE", "FHIR_VALUE_TYPE",
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
			this.state = 56;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while ((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << CPGLParser.T__0) | (1 << CPGLParser.T__7) | (1 << CPGLParser.T__9))) !== 0)) {
				{
				{
				this.state = 50;
				this.statement();
				this.state = 52;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === CPGLParser.NEWLINE) {
					{
					this.state = 51;
					this.match(CPGLParser.NEWLINE);
					}
				}

				}
				}
				this.state = 58;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 59;
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
			this.state = 64;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case CPGLParser.T__0:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 61;
				this.decision();
				}
				break;
			case CPGLParser.T__7:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 62;
				this.action();
				}
				break;
			case CPGLParser.T__9:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 63;
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
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 66;
			this.match(CPGLParser.T__0);
			this.state = 68;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 67;
				this.match(CPGLParser.WS);
				}
				}
				this.state = 70;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === CPGLParser.WS);
			this.state = 72;
			this.match(CPGLParser.STRING);
			this.state = 73;
			this.match(CPGLParser.NEWLINE);
			this.state = 74;
			this.decisionBlock();
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
	public decisionBlock(): DecisionBlockContext {
		let _localctx: DecisionBlockContext = new DecisionBlockContext(this._ctx, this.state);
		this.enterRule(_localctx, 6, CPGLParser.RULE_decisionBlock);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 76;
			this.match(CPGLParser.INDENT);
			this.state = 78;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 77;
				this.whenClause();
				}
				}
				this.state = 80;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === CPGLParser.T__1);
			this.state = 82;
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
	public whenClause(): WhenClauseContext {
		let _localctx: WhenClauseContext = new WhenClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 8, CPGLParser.RULE_whenClause);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 84;
			this.match(CPGLParser.T__1);
			this.state = 86;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 85;
				this.match(CPGLParser.WS);
				}
				}
				this.state = 88;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === CPGLParser.WS);
			this.state = 90;
			this.match(CPGLParser.STRING);
			this.state = 92;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 91;
				this.match(CPGLParser.WS);
				}
				}
				this.state = 94;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === CPGLParser.WS);
			this.state = 96;
			this.match(CPGLParser.T__2);
			this.state = 97;
			this.match(CPGLParser.NEWLINE);
			this.state = 98;
			this.whenBlock();
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
		this.enterRule(_localctx, 10, CPGLParser.RULE_whenBlock);
		try {
			this.state = 102;
			this._errHandler.sync(this);
			switch ( this.interpreter.adaptivePredict(this._input, 7, this._ctx) ) {
			case 1:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 100;
				this.nestedWhenBlock();
				}
				break;

			case 2:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 101;
				this.terminalBlock();
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
	public nestedWhenBlock(): NestedWhenBlockContext {
		let _localctx: NestedWhenBlockContext = new NestedWhenBlockContext(this._ctx, this.state);
		this.enterRule(_localctx, 12, CPGLParser.RULE_nestedWhenBlock);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 104;
			this.match(CPGLParser.INDENT);
			this.state = 106;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === CPGLParser.T__5 || _la === CPGLParser.T__6) {
				{
				this.state = 105;
				this.optionalQualifier();
				}
			}

			this.state = 109;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 108;
				this.whenClause();
				}
				}
				this.state = 111;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === CPGLParser.T__1);
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
	public terminalBlock(): TerminalBlockContext {
		let _localctx: TerminalBlockContext = new TerminalBlockContext(this._ctx, this.state);
		this.enterRule(_localctx, 14, CPGLParser.RULE_terminalBlock);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 115;
			this.match(CPGLParser.INDENT);
			this.state = 117;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 116;
				this.terminalAction();
				}
				}
				this.state = 119;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === CPGLParser.T__3 || _la === CPGLParser.T__4);
			this.state = 121;
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
	public terminalAction(): TerminalActionContext {
		let _localctx: TerminalActionContext = new TerminalActionContext(this._ctx, this.state);
		this.enterRule(_localctx, 16, CPGLParser.RULE_terminalAction);
		try {
			this.state = 125;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case CPGLParser.T__3:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 123;
				this.doClause();
				}
				break;
			case CPGLParser.T__4:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 124;
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
	public doClause(): DoClauseContext {
		let _localctx: DoClauseContext = new DoClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 18, CPGLParser.RULE_doClause);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 127;
			this.match(CPGLParser.T__3);
			this.state = 129;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 128;
				this.match(CPGLParser.WS);
				}
				}
				this.state = 131;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === CPGLParser.WS);
			this.state = 133;
			this.match(CPGLParser.STRING);
			this.state = 134;
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
		this.enterRule(_localctx, 20, CPGLParser.RULE_useClause);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 136;
			this.match(CPGLParser.T__4);
			this.state = 138;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 137;
				this.match(CPGLParser.WS);
				}
				}
				this.state = 140;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === CPGLParser.WS);
			this.state = 142;
			this.match(CPGLParser.STRING);
			this.state = 143;
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
	public optionalQualifier(): OptionalQualifierContext {
		let _localctx: OptionalQualifierContext = new OptionalQualifierContext(this._ctx, this.state);
		this.enterRule(_localctx, 22, CPGLParser.RULE_optionalQualifier);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 145;
			_la = this._input.LA(1);
			if (!(_la === CPGLParser.T__5 || _la === CPGLParser.T__6)) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			this.state = 146;
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
		this.enterRule(_localctx, 24, CPGLParser.RULE_action);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 148;
			this.match(CPGLParser.T__7);
			this.state = 150;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 149;
				this.match(CPGLParser.WS);
				}
				}
				this.state = 152;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === CPGLParser.WS);
			this.state = 154;
			this.match(CPGLParser.STRING);
			this.state = 155;
			this.match(CPGLParser.NEWLINE);
			this.state = 156;
			this.actionBlock();
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
		this.enterRule(_localctx, 26, CPGLParser.RULE_actionBlock);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 158;
			this.match(CPGLParser.INDENT);
			this.state = 159;
			this.actionClause();
			this.state = 160;
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
	public actionClause(): ActionClauseContext {
		let _localctx: ActionClauseContext = new ActionClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 28, CPGLParser.RULE_actionClause);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 162;
			this.match(CPGLParser.T__8);
			this.state = 164;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 163;
				this.match(CPGLParser.WS);
				}
				}
				this.state = 166;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === CPGLParser.WS);
			this.state = 168;
			this.match(CPGLParser.ACTION_FHIR_TYPE);
			this.state = 169;
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
		this.enterRule(_localctx, 30, CPGLParser.RULE_casefeature);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 171;
			this.match(CPGLParser.T__9);
			this.state = 173;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 172;
				this.match(CPGLParser.WS);
				}
				}
				this.state = 175;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === CPGLParser.WS);
			this.state = 177;
			this.match(CPGLParser.STRING);
			this.state = 178;
			this.match(CPGLParser.NEWLINE);
			this.state = 179;
			this.casefeatureBlock();
			this.state = 183;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === CPGLParser.T__13) {
				{
				this.state = 180;
				this.compositeExpression();
				this.state = 181;
				this.match(CPGLParser.NEWLINE);
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
		this.enterRule(_localctx, 32, CPGLParser.RULE_casefeatureBlock);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 185;
			this.match(CPGLParser.INDENT);
			this.state = 186;
			this.casefeatureCodeClause();
			this.state = 187;
			this.casefeatureFhirTypeClause();
			this.state = 188;
			this.casefeatureProfileUrlClause();
			this.state = 189;
			this.casefeatureValueTypeClause();
			this.state = 190;
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
	public casefeatureCodeClause(): CasefeatureCodeClauseContext {
		let _localctx: CasefeatureCodeClauseContext = new CasefeatureCodeClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 34, CPGLParser.RULE_casefeatureCodeClause);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 192;
			this.match(CPGLParser.T__10);
			this.state = 194;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 193;
				this.match(CPGLParser.WS);
				}
				}
				this.state = 196;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === CPGLParser.WS);
			this.state = 198;
			this.match(CPGLParser.STRING);
			this.state = 199;
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
		this.enterRule(_localctx, 36, CPGLParser.RULE_casefeatureFhirTypeClause);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 201;
			this.match(CPGLParser.T__8);
			this.state = 203;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 202;
				this.match(CPGLParser.WS);
				}
				}
				this.state = 205;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === CPGLParser.WS);
			this.state = 207;
			this.match(CPGLParser.CASEFEATURE_FHIR_TYPE);
			this.state = 208;
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
	public casefeatureProfileUrlClause(): CasefeatureProfileUrlClauseContext {
		let _localctx: CasefeatureProfileUrlClauseContext = new CasefeatureProfileUrlClauseContext(this._ctx, this.state);
		this.enterRule(_localctx, 38, CPGLParser.RULE_casefeatureProfileUrlClause);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 210;
			this.match(CPGLParser.T__11);
			this.state = 212;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 211;
				this.match(CPGLParser.WS);
				}
				}
				this.state = 214;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === CPGLParser.WS);
			this.state = 216;
			this.match(CPGLParser.STRING);
			this.state = 217;
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
		this.enterRule(_localctx, 40, CPGLParser.RULE_casefeatureValueTypeClause);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 219;
			this.match(CPGLParser.T__12);
			this.state = 221;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			do {
				{
				{
				this.state = 220;
				this.match(CPGLParser.WS);
				}
				}
				this.state = 223;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			} while (_la === CPGLParser.WS);
			this.state = 225;
			this.match(CPGLParser.FHIR_VALUE_TYPE);
			this.state = 226;
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
	public compositeExpression(): CompositeExpressionContext {
		let _localctx: CompositeExpressionContext = new CompositeExpressionContext(this._ctx, this.state);
		this.enterRule(_localctx, 42, CPGLParser.RULE_compositeExpression);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 228;
			this.match(CPGLParser.T__13);
			this.state = 232;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === CPGLParser.WS) {
				{
				{
				this.state = 229;
				this.match(CPGLParser.WS);
				}
				}
				this.state = 234;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 235;
			this.match(CPGLParser.T__14);
			this.state = 236;
			this.booleanExpr();
			this.state = 237;
			this.match(CPGLParser.T__15);
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
	public booleanExpr(): BooleanExprContext {
		let _localctx: BooleanExprContext = new BooleanExprContext(this._ctx, this.state);
		this.enterRule(_localctx, 44, CPGLParser.RULE_booleanExpr);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 239;
			this.booleanTerm();
			this.state = 256;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === CPGLParser.WS || _la === CPGLParser.OR) {
				{
				{
				this.state = 243;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === CPGLParser.WS) {
					{
					{
					this.state = 240;
					this.match(CPGLParser.WS);
					}
					}
					this.state = 245;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 246;
				this.match(CPGLParser.OR);
				this.state = 250;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === CPGLParser.WS) {
					{
					{
					this.state = 247;
					this.match(CPGLParser.WS);
					}
					}
					this.state = 252;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 253;
				this.booleanTerm();
				}
				}
				this.state = 258;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
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
	public booleanTerm(): BooleanTermContext {
		let _localctx: BooleanTermContext = new BooleanTermContext(this._ctx, this.state);
		this.enterRule(_localctx, 46, CPGLParser.RULE_booleanTerm);
		let _la: number;
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 259;
			this.booleanFactor();
			this.state = 276;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input, 28, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					{
					{
					this.state = 263;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
					while (_la === CPGLParser.WS) {
						{
						{
						this.state = 260;
						this.match(CPGLParser.WS);
						}
						}
						this.state = 265;
						this._errHandler.sync(this);
						_la = this._input.LA(1);
					}
					this.state = 266;
					this.match(CPGLParser.AND);
					this.state = 270;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
					while (_la === CPGLParser.WS) {
						{
						{
						this.state = 267;
						this.match(CPGLParser.WS);
						}
						}
						this.state = 272;
						this._errHandler.sync(this);
						_la = this._input.LA(1);
					}
					this.state = 273;
					this.booleanFactor();
					}
					}
				}
				this.state = 278;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input, 28, this._ctx);
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
	public booleanFactor(): BooleanFactorContext {
		let _localctx: BooleanFactorContext = new BooleanFactorContext(this._ctx, this.state);
		this.enterRule(_localctx, 48, CPGLParser.RULE_booleanFactor);
		let _la: number;
		try {
			this.state = 292;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case CPGLParser.NOT:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 279;
				this.match(CPGLParser.NOT);
				this.state = 283;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === CPGLParser.WS) {
					{
					{
					this.state = 280;
					this.match(CPGLParser.WS);
					}
					}
					this.state = 285;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				this.state = 286;
				this.booleanFactor();
				}
				break;
			case CPGLParser.T__14:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 287;
				this.match(CPGLParser.T__14);
				this.state = 288;
				this.booleanExpr();
				this.state = 289;
				this.match(CPGLParser.T__15);
				}
				break;
			case CPGLParser.STRING:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 291;
				this.match(CPGLParser.STRING);
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

	public static readonly _serializedATN: string =
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x03\x1F\u0129\x04" +
		"\x02\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04" +
		"\x07\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r" +
		"\x04\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11\t\x11\x04\x12\t\x12" +
		"\x04\x13\t\x13\x04\x14\t\x14\x04\x15\t\x15\x04\x16\t\x16\x04\x17\t\x17" +
		"\x04\x18\t\x18\x04\x19\t\x19\x04\x1A\t\x1A\x03\x02\x03\x02\x05\x027\n" +
		"\x02\x07\x029\n\x02\f\x02\x0E\x02<\v\x02\x03\x02\x03\x02\x03\x03\x03\x03" +
		"\x03\x03\x05\x03C\n\x03\x03\x04\x03\x04\x06\x04G\n\x04\r\x04\x0E\x04H" +
		"\x03\x04\x03\x04\x03\x04\x03\x04\x03\x05\x03\x05\x06\x05Q\n\x05\r\x05" +
		"\x0E\x05R\x03\x05\x03\x05\x03\x06\x03\x06\x06\x06Y\n\x06\r\x06\x0E\x06" +
		"Z\x03\x06\x03\x06\x06\x06_\n\x06\r\x06\x0E\x06`\x03\x06\x03\x06\x03\x06" +
		"\x03\x06\x03\x07\x03\x07\x05\x07i\n\x07\x03\b\x03\b\x05\bm\n\b\x03\b\x06" +
		"\bp\n\b\r\b\x0E\bq\x03\b\x03\b\x03\t\x03\t\x06\tx\n\t\r\t\x0E\ty\x03\t" +
		"\x03\t\x03\n\x03\n\x05\n\x80\n\n\x03\v\x03\v\x06\v\x84\n\v\r\v\x0E\v\x85" +
		"\x03\v\x03\v\x03\v\x03\f\x03\f\x06\f\x8D\n\f\r\f\x0E\f\x8E\x03\f\x03\f" +
		"\x03\f\x03\r\x03\r\x03\r\x03\x0E\x03\x0E\x06\x0E\x99\n\x0E\r\x0E\x0E\x0E" +
		"\x9A\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03" +
		"\x10\x03\x10\x06\x10\xA7\n\x10\r\x10\x0E\x10\xA8\x03\x10\x03\x10\x03\x10" +
		"\x03\x11\x03\x11\x06\x11\xB0\n\x11\r\x11\x0E\x11\xB1\x03\x11\x03\x11\x03" +
		"\x11\x03\x11\x03\x11\x03\x11\x05\x11\xBA\n\x11\x03\x12\x03\x12\x03\x12" +
		"\x03\x12\x03\x12\x03\x12\x03\x12\x03\x13\x03\x13\x06\x13\xC5\n\x13\r\x13" +
		"\x0E\x13\xC6\x03\x13\x03\x13\x03\x13\x03\x14\x03\x14\x06\x14\xCE\n\x14" +
		"\r\x14\x0E\x14\xCF\x03\x14\x03\x14\x03\x14\x03\x15\x03\x15\x06\x15\xD7" +
		"\n\x15\r\x15\x0E\x15\xD8\x03\x15\x03\x15\x03\x15\x03\x16\x03\x16\x06\x16" +
		"\xE0\n\x16\r\x16\x0E\x16\xE1\x03\x16\x03\x16\x03\x16\x03\x17\x03\x17\x07" +
		"\x17\xE9\n\x17\f\x17\x0E\x17\xEC\v\x17\x03\x17\x03\x17\x03\x17\x03\x17" +
		"\x03\x18\x03\x18\x07\x18\xF4\n\x18\f\x18\x0E\x18\xF7\v\x18\x03\x18\x03" +
		"\x18\x07\x18\xFB\n\x18\f\x18\x0E\x18\xFE\v\x18\x03\x18\x07\x18\u0101\n" +
		"\x18\f\x18\x0E\x18\u0104\v\x18\x03\x19\x03\x19\x07\x19\u0108\n\x19\f\x19" +
		"\x0E\x19\u010B\v\x19\x03\x19\x03\x19\x07\x19\u010F\n\x19\f\x19\x0E\x19" +
		"\u0112\v\x19\x03\x19\x07\x19\u0115\n\x19\f\x19\x0E\x19\u0118\v\x19\x03" +
		"\x1A\x03\x1A\x07\x1A\u011C\n\x1A\f\x1A\x0E\x1A\u011F\v\x1A\x03\x1A\x03" +
		"\x1A\x03\x1A\x03\x1A\x03\x1A\x03\x1A\x05\x1A\u0127\n\x1A\x03\x1A\x02\x02" +
		"\x02\x1B\x02\x02\x04\x02\x06\x02\b\x02\n\x02\f\x02\x0E\x02\x10\x02\x12" +
		"\x02\x14\x02\x16\x02\x18\x02\x1A\x02\x1C\x02\x1E\x02 \x02\"\x02$\x02&" +
		"\x02(\x02*\x02,\x02.\x020\x022\x02\x02\x03\x03\x02\b\t\x02\u0130\x02:" +
		"\x03\x02\x02\x02\x04B\x03\x02\x02\x02\x06D\x03\x02\x02\x02\bN\x03\x02" +
		"\x02\x02\nV\x03\x02\x02\x02\fh\x03\x02\x02\x02\x0Ej\x03\x02\x02\x02\x10" +
		"u\x03\x02\x02\x02\x12\x7F\x03\x02\x02\x02\x14\x81\x03\x02\x02\x02\x16" +
		"\x8A\x03\x02\x02\x02\x18\x93\x03\x02\x02\x02\x1A\x96\x03\x02\x02\x02\x1C" +
		"\xA0\x03\x02\x02\x02\x1E\xA4\x03\x02\x02\x02 \xAD\x03\x02\x02\x02\"\xBB" +
		"\x03\x02\x02\x02$\xC2\x03\x02\x02\x02&\xCB\x03\x02\x02\x02(\xD4\x03\x02" +
		"\x02\x02*\xDD\x03\x02\x02\x02,\xE6\x03\x02\x02\x02.\xF1\x03\x02\x02\x02" +
		"0\u0105\x03\x02\x02\x022\u0126\x03\x02\x02\x0246\x05\x04\x03\x0257\x07" +
		"\x15\x02\x0265\x03\x02\x02\x0267\x03\x02\x02\x0279\x03\x02\x02\x0284\x03" +
		"\x02\x02\x029<\x03\x02\x02\x02:8\x03\x02\x02\x02:;\x03\x02\x02\x02;=\x03" +
		"\x02\x02\x02<:\x03\x02\x02\x02=>\x07\x02\x02\x03>\x03\x03\x02\x02\x02" +
		"?C\x05\x06\x04\x02@C\x05\x1A\x0E\x02AC\x05 \x11\x02B?\x03\x02\x02\x02" +
		"B@\x03\x02\x02\x02BA\x03\x02\x02\x02C\x05\x03\x02\x02\x02DF\x07\x03\x02" +
		"\x02EG\x07\x16\x02\x02FE\x03\x02\x02\x02GH\x03\x02\x02\x02HF\x03\x02\x02" +
		"\x02HI\x03\x02\x02\x02IJ\x03\x02\x02\x02JK\x07\x19\x02\x02KL\x07\x15\x02" +
		"\x02LM\x05\b\x05\x02M\x07\x03\x02\x02\x02NP\x07\x13\x02\x02OQ\x05\n\x06" +
		"\x02PO\x03\x02\x02\x02QR\x03\x02\x02\x02RP\x03\x02\x02\x02RS\x03\x02\x02" +
		"\x02ST\x03\x02\x02\x02TU\x07\x14\x02\x02U\t\x03\x02\x02\x02VX\x07\x04" +
		"\x02\x02WY\x07\x16\x02\x02XW\x03\x02\x02\x02YZ\x03\x02\x02\x02ZX\x03\x02" +
		"\x02\x02Z[\x03\x02\x02\x02[\\\x03\x02\x02\x02\\^\x07\x19\x02\x02]_\x07" +
		"\x16\x02\x02^]\x03\x02\x02\x02_`\x03\x02\x02\x02`^\x03\x02\x02\x02`a\x03" +
		"\x02\x02\x02ab\x03\x02\x02\x02bc\x07\x05\x02\x02cd\x07\x15\x02\x02de\x05" +
		"\f\x07\x02e\v\x03\x02\x02\x02fi\x05\x0E\b\x02gi\x05\x10\t\x02hf\x03\x02" +
		"\x02\x02hg\x03\x02\x02\x02i\r\x03\x02\x02\x02jl\x07\x13\x02\x02km\x05" +
		"\x18\r\x02lk\x03\x02\x02\x02lm\x03\x02\x02\x02mo\x03\x02\x02\x02np\x05" +
		"\n\x06\x02on\x03\x02\x02\x02pq\x03\x02\x02\x02qo\x03\x02\x02\x02qr\x03" +
		"\x02\x02\x02rs\x03\x02\x02\x02st\x07\x14\x02\x02t\x0F\x03\x02\x02\x02" +
		"uw\x07\x13\x02\x02vx\x05\x12\n\x02wv\x03\x02\x02\x02xy\x03\x02\x02\x02" +
		"yw\x03\x02\x02\x02yz\x03\x02\x02\x02z{\x03\x02\x02\x02{|\x07\x14\x02\x02" +
		"|\x11\x03\x02\x02\x02}\x80\x05\x14\v\x02~\x80\x05\x16\f\x02\x7F}\x03\x02" +
		"\x02\x02\x7F~\x03\x02\x02\x02\x80\x13\x03\x02\x02\x02\x81\x83\x07\x06" +
		"\x02\x02\x82\x84\x07\x16\x02\x02\x83\x82\x03\x02\x02\x02\x84\x85\x03\x02" +
		"\x02\x02\x85\x83\x03\x02\x02\x02\x85\x86\x03\x02\x02\x02\x86\x87\x03\x02" +
		"\x02\x02\x87\x88\x07\x19\x02\x02\x88\x89\x07\x15\x02\x02\x89\x15\x03\x02" +
		"\x02\x02\x8A\x8C\x07\x07\x02\x02\x8B\x8D\x07\x16\x02\x02\x8C\x8B\x03\x02" +
		"\x02\x02\x8D\x8E\x03\x02\x02\x02\x8E\x8C\x03\x02\x02\x02\x8E\x8F\x03\x02" +
		"\x02\x02\x8F\x90\x03\x02\x02\x02\x90\x91\x07\x19\x02\x02\x91\x92\x07\x15" +
		"\x02\x02\x92\x17\x03\x02\x02\x02\x93\x94\t\x02\x02\x02\x94\x95\x07\x15" +
		"\x02\x02\x95\x19\x03\x02\x02\x02\x96\x98\x07\n\x02\x02\x97\x99\x07\x16" +
		"\x02\x02\x98\x97\x03\x02\x02\x02\x99\x9A\x03\x02\x02\x02\x9A\x98\x03\x02" +
		"\x02\x02\x9A\x9B\x03\x02\x02\x02\x9B\x9C\x03\x02\x02\x02\x9C\x9D\x07\x19" +
		"\x02\x02\x9D\x9E\x07\x15\x02\x02\x9E\x9F\x05\x1C\x0F\x02\x9F\x1B\x03\x02" +
		"\x02\x02\xA0\xA1\x07\x13\x02\x02\xA1\xA2\x05\x1E\x10\x02\xA2\xA3\x07\x14" +
		"\x02\x02\xA3\x1D\x03\x02\x02\x02\xA4\xA6\x07\v\x02\x02\xA5\xA7\x07\x16" +
		"\x02\x02\xA6\xA5\x03\x02\x02\x02\xA7\xA8\x03\x02\x02\x02\xA8\xA6\x03\x02" +
		"\x02\x02\xA8\xA9\x03\x02\x02\x02\xA9\xAA\x03\x02\x02\x02\xAA\xAB\x07\x1D" +
		"\x02\x02\xAB\xAC\x07\x15\x02\x02\xAC\x1F\x03\x02\x02\x02\xAD\xAF\x07\f" +
		"\x02\x02\xAE\xB0\x07\x16\x02\x02\xAF\xAE\x03\x02\x02\x02\xB0\xB1\x03\x02" +
		"\x02\x02\xB1\xAF\x03\x02\x02\x02\xB1\xB2\x03\x02\x02\x02\xB2\xB3\x03\x02" +
		"\x02\x02\xB3\xB4\x07\x19\x02\x02\xB4\xB5\x07\x15\x02\x02\xB5\xB9\x05\"" +
		"\x12\x02\xB6\xB7\x05,\x17\x02\xB7\xB8\x07\x15\x02\x02\xB8\xBA\x03\x02" +
		"\x02\x02\xB9\xB6\x03\x02\x02\x02\xB9\xBA\x03\x02\x02\x02\xBA!\x03\x02" +
		"\x02\x02\xBB\xBC\x07\x13\x02\x02\xBC\xBD\x05$\x13\x02\xBD\xBE\x05&\x14" +
		"\x02\xBE\xBF\x05(\x15\x02\xBF\xC0\x05*\x16\x02\xC0\xC1\x07\x14\x02\x02" +
		"\xC1#\x03\x02\x02\x02\xC2\xC4\x07\r\x02\x02\xC3\xC5\x07\x16\x02\x02\xC4" +
		"\xC3\x03\x02\x02\x02\xC5\xC6\x03\x02\x02\x02\xC6\xC4\x03\x02\x02\x02\xC6" +
		"\xC7\x03\x02\x02\x02\xC7\xC8\x03\x02\x02\x02\xC8\xC9\x07\x19\x02\x02\xC9" +
		"\xCA\x07\x15\x02\x02\xCA%\x03\x02\x02\x02\xCB\xCD\x07\v\x02\x02\xCC\xCE" +
		"\x07\x16\x02\x02\xCD\xCC\x03\x02\x02\x02\xCE\xCF\x03\x02\x02\x02\xCF\xCD" +
		"\x03\x02\x02\x02\xCF\xD0\x03\x02\x02\x02\xD0\xD1\x03\x02\x02\x02\xD1\xD2" +
		"\x07\x1E\x02\x02\xD2\xD3\x07\x15\x02\x02\xD3\'\x03\x02\x02\x02\xD4\xD6" +
		"\x07\x0E\x02\x02\xD5\xD7\x07\x16\x02\x02\xD6\xD5\x03\x02\x02\x02\xD7\xD8" +
		"\x03\x02\x02\x02\xD8\xD6\x03\x02\x02\x02\xD8\xD9\x03\x02\x02\x02\xD9\xDA" +
		"\x03\x02\x02\x02\xDA\xDB\x07\x19\x02\x02\xDB\xDC\x07\x15\x02\x02\xDC)" +
		"\x03\x02\x02\x02\xDD\xDF\x07\x0F\x02\x02\xDE\xE0\x07\x16\x02\x02\xDF\xDE" +
		"\x03\x02\x02\x02\xE0\xE1\x03\x02\x02\x02\xE1\xDF\x03\x02\x02\x02\xE1\xE2" +
		"\x03\x02\x02\x02\xE2\xE3\x03\x02\x02\x02\xE3\xE4\x07\x1F\x02\x02\xE4\xE5" +
		"\x07\x15\x02\x02\xE5+\x03\x02\x02\x02\xE6\xEA\x07\x10\x02\x02\xE7\xE9" +
		"\x07\x16\x02\x02\xE8\xE7\x03\x02\x02\x02\xE9\xEC\x03\x02\x02\x02\xEA\xE8" +
		"\x03\x02\x02\x02\xEA\xEB\x03\x02\x02\x02\xEB\xED\x03\x02\x02\x02\xEC\xEA" +
		"\x03\x02\x02\x02\xED\xEE\x07\x11\x02\x02\xEE\xEF\x05.\x18\x02\xEF\xF0" +
		"\x07\x12\x02\x02\xF0-\x03\x02\x02\x02\xF1\u0102\x050\x19\x02\xF2\xF4\x07" +
		"\x16\x02\x02\xF3\xF2\x03\x02\x02\x02\xF4\xF7\x03\x02\x02\x02\xF5\xF3\x03" +
		"\x02\x02\x02\xF5\xF6\x03\x02\x02\x02\xF6\xF8\x03\x02\x02\x02\xF7\xF5\x03" +
		"\x02\x02\x02\xF8\xFC\x07\x1A\x02\x02\xF9\xFB\x07\x16\x02\x02\xFA\xF9\x03" +
		"\x02\x02\x02\xFB\xFE\x03\x02\x02\x02\xFC\xFA\x03\x02\x02\x02\xFC\xFD\x03" +
		"\x02\x02\x02\xFD\xFF\x03\x02\x02\x02\xFE\xFC\x03\x02\x02\x02\xFF\u0101" +
		"\x050\x19\x02\u0100\xF5\x03\x02\x02\x02\u0101\u0104\x03\x02\x02\x02\u0102" +
		"\u0100\x03\x02\x02\x02\u0102\u0103\x03\x02\x02\x02\u0103/\x03\x02\x02" +
		"\x02\u0104\u0102\x03\x02\x02\x02\u0105\u0116\x052\x1A\x02\u0106\u0108" +
		"\x07\x16\x02\x02\u0107\u0106\x03\x02\x02\x02\u0108\u010B\x03\x02\x02\x02" +
		"\u0109\u0107\x03\x02\x02\x02\u0109\u010A\x03\x02\x02\x02\u010A\u010C\x03" +
		"\x02\x02\x02\u010B\u0109\x03\x02\x02\x02\u010C\u0110\x07\x1B\x02\x02\u010D" +
		"\u010F\x07\x16\x02\x02\u010E\u010D\x03\x02\x02\x02\u010F\u0112\x03\x02" +
		"\x02\x02\u0110\u010E\x03\x02\x02\x02\u0110\u0111\x03\x02\x02\x02\u0111" +
		"\u0113\x03\x02\x02\x02\u0112\u0110\x03\x02\x02\x02\u0113\u0115\x052\x1A" +
		"\x02\u0114\u0109\x03\x02\x02\x02\u0115\u0118\x03\x02\x02\x02\u0116\u0114" +
		"\x03\x02\x02\x02\u0116\u0117\x03\x02\x02\x02\u01171\x03\x02\x02\x02\u0118" +
		"\u0116\x03\x02\x02\x02\u0119\u011D\x07\x1C\x02\x02\u011A\u011C\x07\x16" +
		"\x02\x02\u011B\u011A\x03\x02\x02\x02\u011C\u011F\x03\x02\x02\x02\u011D" +
		"\u011B\x03\x02\x02\x02\u011D\u011E\x03\x02\x02\x02\u011E\u0120\x03\x02" +
		"\x02\x02\u011F\u011D\x03\x02\x02\x02\u0120\u0127\x052\x1A\x02\u0121\u0122" +
		"\x07\x11\x02\x02\u0122\u0123\x05.\x18\x02\u0123\u0124\x07\x12\x02\x02" +
		"\u0124\u0127\x03\x02\x02\x02\u0125\u0127\x07\x19\x02\x02\u0126\u0119\x03" +
		"\x02\x02\x02\u0126\u0121\x03\x02\x02\x02\u0126\u0125\x03\x02\x02\x02\u0127" +
		"3\x03\x02\x02\x02!6:BHRZ`hlqy\x7F\x85\x8E\x9A\xA8\xB1\xB9\xC6\xCF\xD8" +
		"\xE1\xEA\xF5\xFC\u0102\u0109\u0110\u0116\u011D\u0126";
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
	public decisionBlock(): DecisionBlockContext {
		return this.getRuleContext(0, DecisionBlockContext);
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


export class DecisionBlockContext extends ParserRuleContext {
	public INDENT(): TerminalNode { return this.getToken(CPGLParser.INDENT, 0); }
	public DEDENT(): TerminalNode { return this.getToken(CPGLParser.DEDENT, 0); }
	public whenClause(): WhenClauseContext[];
	public whenClause(i: number): WhenClauseContext;
	public whenClause(i?: number): WhenClauseContext | WhenClauseContext[] {
		if (i === undefined) {
			return this.getRuleContexts(WhenClauseContext);
		} else {
			return this.getRuleContext(i, WhenClauseContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_decisionBlock; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterDecisionBlock) {
			listener.enterDecisionBlock(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitDecisionBlock) {
			listener.exitDecisionBlock(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitDecisionBlock) {
			return visitor.visitDecisionBlock(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class WhenClauseContext extends ParserRuleContext {
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	public whenBlock(): WhenBlockContext {
		return this.getRuleContext(0, WhenBlockContext);
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


export class WhenBlockContext extends ParserRuleContext {
	public nestedWhenBlock(): NestedWhenBlockContext | undefined {
		return this.tryGetRuleContext(0, NestedWhenBlockContext);
	}
	public terminalBlock(): TerminalBlockContext | undefined {
		return this.tryGetRuleContext(0, TerminalBlockContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_whenBlock; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterWhenBlock) {
			listener.enterWhenBlock(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitWhenBlock) {
			listener.exitWhenBlock(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitWhenBlock) {
			return visitor.visitWhenBlock(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class NestedWhenBlockContext extends ParserRuleContext {
	public INDENT(): TerminalNode { return this.getToken(CPGLParser.INDENT, 0); }
	public DEDENT(): TerminalNode { return this.getToken(CPGLParser.DEDENT, 0); }
	public optionalQualifier(): OptionalQualifierContext | undefined {
		return this.tryGetRuleContext(0, OptionalQualifierContext);
	}
	public whenClause(): WhenClauseContext[];
	public whenClause(i: number): WhenClauseContext;
	public whenClause(i?: number): WhenClauseContext | WhenClauseContext[] {
		if (i === undefined) {
			return this.getRuleContexts(WhenClauseContext);
		} else {
			return this.getRuleContext(i, WhenClauseContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_nestedWhenBlock; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterNestedWhenBlock) {
			listener.enterNestedWhenBlock(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitNestedWhenBlock) {
			listener.exitNestedWhenBlock(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitNestedWhenBlock) {
			return visitor.visitNestedWhenBlock(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TerminalBlockContext extends ParserRuleContext {
	public INDENT(): TerminalNode { return this.getToken(CPGLParser.INDENT, 0); }
	public DEDENT(): TerminalNode { return this.getToken(CPGLParser.DEDENT, 0); }
	public terminalAction(): TerminalActionContext[];
	public terminalAction(i: number): TerminalActionContext;
	public terminalAction(i?: number): TerminalActionContext | TerminalActionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(TerminalActionContext);
		} else {
			return this.getRuleContext(i, TerminalActionContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_terminalBlock; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterTerminalBlock) {
			listener.enterTerminalBlock(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitTerminalBlock) {
			listener.exitTerminalBlock(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitTerminalBlock) {
			return visitor.visitTerminalBlock(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TerminalActionContext extends ParserRuleContext {
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
	public get ruleIndex(): number { return CPGLParser.RULE_terminalAction; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterTerminalAction) {
			listener.enterTerminalAction(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitTerminalAction) {
			listener.exitTerminalAction(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitTerminalAction) {
			return visitor.visitTerminalAction(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class DoClauseContext extends ParserRuleContext {
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
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
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
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


export class OptionalQualifierContext extends ParserRuleContext {
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_optionalQualifier; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterOptionalQualifier) {
			listener.enterOptionalQualifier(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitOptionalQualifier) {
			listener.exitOptionalQualifier(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitOptionalQualifier) {
			return visitor.visitOptionalQualifier(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ActionContext extends ParserRuleContext {
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
	public actionBlock(): ActionBlockContext {
		return this.getRuleContext(0, ActionBlockContext);
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
	public actionClause(): ActionClauseContext {
		return this.getRuleContext(0, ActionClauseContext);
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


export class ActionClauseContext extends ParserRuleContext {
	public ACTION_FHIR_TYPE(): TerminalNode { return this.getToken(CPGLParser.ACTION_FHIR_TYPE, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
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
	public get ruleIndex(): number { return CPGLParser.RULE_actionClause; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterActionClause) {
			listener.enterActionClause(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitActionClause) {
			listener.exitActionClause(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitActionClause) {
			return visitor.visitActionClause(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class CasefeatureContext extends ParserRuleContext {
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
	public WS(): TerminalNode[];
	public WS(i: number): TerminalNode;
	public WS(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(CPGLParser.WS);
		} else {
			return this.getToken(CPGLParser.WS, i);
		}
	}
	public compositeExpression(): CompositeExpressionContext | undefined {
		return this.tryGetRuleContext(0, CompositeExpressionContext);
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
	public casefeatureCodeClause(): CasefeatureCodeClauseContext {
		return this.getRuleContext(0, CasefeatureCodeClauseContext);
	}
	public casefeatureFhirTypeClause(): CasefeatureFhirTypeClauseContext {
		return this.getRuleContext(0, CasefeatureFhirTypeClauseContext);
	}
	public casefeatureProfileUrlClause(): CasefeatureProfileUrlClauseContext {
		return this.getRuleContext(0, CasefeatureProfileUrlClauseContext);
	}
	public casefeatureValueTypeClause(): CasefeatureValueTypeClauseContext {
		return this.getRuleContext(0, CasefeatureValueTypeClauseContext);
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


export class CasefeatureCodeClauseContext extends ParserRuleContext {
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
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
	public CASEFEATURE_FHIR_TYPE(): TerminalNode { return this.getToken(CPGLParser.CASEFEATURE_FHIR_TYPE, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
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


export class CasefeatureProfileUrlClauseContext extends ParserRuleContext {
	public STRING(): TerminalNode { return this.getToken(CPGLParser.STRING, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
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
	public get ruleIndex(): number { return CPGLParser.RULE_casefeatureProfileUrlClause; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterCasefeatureProfileUrlClause) {
			listener.enterCasefeatureProfileUrlClause(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitCasefeatureProfileUrlClause) {
			listener.exitCasefeatureProfileUrlClause(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitCasefeatureProfileUrlClause) {
			return visitor.visitCasefeatureProfileUrlClause(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class CasefeatureValueTypeClauseContext extends ParserRuleContext {
	public FHIR_VALUE_TYPE(): TerminalNode { return this.getToken(CPGLParser.FHIR_VALUE_TYPE, 0); }
	public NEWLINE(): TerminalNode { return this.getToken(CPGLParser.NEWLINE, 0); }
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


export class CompositeExpressionContext extends ParserRuleContext {
	public booleanExpr(): BooleanExprContext {
		return this.getRuleContext(0, BooleanExprContext);
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
	public get ruleIndex(): number { return CPGLParser.RULE_compositeExpression; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterCompositeExpression) {
			listener.enterCompositeExpression(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitCompositeExpression) {
			listener.exitCompositeExpression(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitCompositeExpression) {
			return visitor.visitCompositeExpression(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class BooleanExprContext extends ParserRuleContext {
	public booleanTerm(): BooleanTermContext[];
	public booleanTerm(i: number): BooleanTermContext;
	public booleanTerm(i?: number): BooleanTermContext | BooleanTermContext[] {
		if (i === undefined) {
			return this.getRuleContexts(BooleanTermContext);
		} else {
			return this.getRuleContext(i, BooleanTermContext);
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
	public get ruleIndex(): number { return CPGLParser.RULE_booleanExpr; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterBooleanExpr) {
			listener.enterBooleanExpr(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitBooleanExpr) {
			listener.exitBooleanExpr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitBooleanExpr) {
			return visitor.visitBooleanExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class BooleanTermContext extends ParserRuleContext {
	public booleanFactor(): BooleanFactorContext[];
	public booleanFactor(i: number): BooleanFactorContext;
	public booleanFactor(i?: number): BooleanFactorContext | BooleanFactorContext[] {
		if (i === undefined) {
			return this.getRuleContexts(BooleanFactorContext);
		} else {
			return this.getRuleContext(i, BooleanFactorContext);
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
	public get ruleIndex(): number { return CPGLParser.RULE_booleanTerm; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterBooleanTerm) {
			listener.enterBooleanTerm(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitBooleanTerm) {
			listener.exitBooleanTerm(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitBooleanTerm) {
			return visitor.visitBooleanTerm(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class BooleanFactorContext extends ParserRuleContext {
	public NOT(): TerminalNode | undefined { return this.tryGetToken(CPGLParser.NOT, 0); }
	public booleanFactor(): BooleanFactorContext | undefined {
		return this.tryGetRuleContext(0, BooleanFactorContext);
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
	public booleanExpr(): BooleanExprContext | undefined {
		return this.tryGetRuleContext(0, BooleanExprContext);
	}
	public STRING(): TerminalNode | undefined { return this.tryGetToken(CPGLParser.STRING, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return CPGLParser.RULE_booleanFactor; }
	// @Override
	public enterRule(listener: CPGLListener): void {
		if (listener.enterBooleanFactor) {
			listener.enterBooleanFactor(this);
		}
	}
	// @Override
	public exitRule(listener: CPGLListener): void {
		if (listener.exitBooleanFactor) {
			listener.exitBooleanFactor(this);
		}
	}
	// @Override
	public accept<Result>(visitor: CPGLVisitor<Result>): Result {
		if (visitor.visitBooleanFactor) {
			return visitor.visitBooleanFactor(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


