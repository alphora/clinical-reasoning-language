// Generated from src/grammar/CPGLLexer.g4 by ANTLR 4.9.0-SNAPSHOT


import { ATN } from "antlr4ts/atn/ATN";
import { ATNDeserializer } from "antlr4ts/atn/ATNDeserializer";
import { CharStream } from "antlr4ts/CharStream";
import { Lexer } from "antlr4ts/Lexer";
import { LexerATNSimulator } from "antlr4ts/atn/LexerATNSimulator";
import { NotNull } from "antlr4ts/Decorators";
import { Override } from "antlr4ts/Decorators";
import { RuleContext } from "antlr4ts/RuleContext";
import { Vocabulary } from "antlr4ts/Vocabulary";
import { VocabularyImpl } from "antlr4ts/VocabularyImpl";

import * as Utils from "antlr4ts/misc/Utils";


export class CPGLLexer extends Lexer {
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
	public static readonly COLON = 27;
	public static readonly DOT = 28;
	public static readonly LPAREN = 29;
	public static readonly RPAREN = 30;
	public static readonly STRING = 31;
	public static readonly IDENTIFIER = 32;
	public static readonly WS = 33;
	public static readonly COMMENT = 34;
	public static readonly COMMENT_BLOCK = 35;
	public static readonly ErrorChar = 36;
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
	public static readonly ACTIVITY_MODE = 1;
	public static readonly CONCEPT_MODE = 2;
	public static readonly VALUE_TYPE_MODE = 3;

	// tslint:disable:no-trailing-whitespace
	public static readonly channelNames: string[] = [
		"DEFAULT_TOKEN_CHANNEL", "HIDDEN",
	];

	// tslint:disable:no-trailing-whitespace
	public static readonly modeNames: string[] = [
		"DEFAULT_MODE", "ACTIVITY_MODE", "CONCEPT_MODE", "VALUE_TYPE_MODE",
	];

	public static readonly ruleNames: string[] = [
		"CONCEPT", "TYPE", "VALUETYPE", "TERMINOLOGY", "PROVENANCE", "INFERRED", 
		"AND", "OR", "DONE", "HAS", "BY", "CODED", "VALUESET", "PERFORM", "ACTIVITY", 
		"OF", "SYSTEM", "CODE", "UNKNOWN", "DO", "USE", "WHEN", "THEN", "ANY", 
		"ALL", "DECISION", "COLON", "DOT", "LPAREN", "RPAREN", "STRING", "IDENTIFIER", 
		"BLOCK_COMMENT", "WS", "COMMENT", "COMMENT_BLOCK", "ErrorChar", "ACTIVITY_TYPE", 
		"ACTIVITY_WS", "ACTIVITY_COMMENT_BLOCK", "ACTIVITY_ErrorChar", "CONCEPT_TYPE", 
		"CONCEPT_WS", "CONCEPT_COMMENT_BLOCK", "CONCEPT_ErrorChar", "CONCEPT_VALUE_TYPE", 
		"VALUE_TYPE_WS", "VALUE_TYPE_COMMENT_BLOCK", "VALUE_TYPE_ErrorChar",
	];

	private static readonly _LITERAL_NAMES: Array<string | undefined> = [
		undefined, "'concept'", "'type'", "'valuetype'", "'terminology'", "'provenance'", 
		"'inferred'", "'and'", "'or'", "'done'", "'has'", "'by'", "'coded'", "'valueset'", 
		"'perform'", "'activity'", "'of'", "'system'", "'code'", "'unknown'", 
		"'do'", "'use'", "'when'", "'then'", "'any'", "'all'", "'decision'", "':'", 
		"'.'", "'('", "')'",
	];
	private static readonly _SYMBOLIC_NAMES: Array<string | undefined> = [
		undefined, "CONCEPT", "TYPE", "VALUETYPE", "TERMINOLOGY", "PROVENANCE", 
		"INFERRED", "AND", "OR", "DONE", "HAS", "BY", "CODED", "VALUESET", "PERFORM", 
		"ACTIVITY", "OF", "SYSTEM", "CODE", "UNKNOWN", "DO", "USE", "WHEN", "THEN", 
		"ANY", "ALL", "DECISION", "COLON", "DOT", "LPAREN", "RPAREN", "STRING", 
		"IDENTIFIER", "WS", "COMMENT", "COMMENT_BLOCK", "ErrorChar", "ACTIVITY_TYPE", 
		"ACTIVITY_WS", "ACTIVITY_COMMENT_BLOCK", "ACTIVITY_ErrorChar", "CONCEPT_TYPE", 
		"CONCEPT_WS", "CONCEPT_COMMENT_BLOCK", "CONCEPT_ErrorChar", "CONCEPT_VALUE_TYPE", 
		"VALUE_TYPE_WS", "VALUE_TYPE_COMMENT_BLOCK", "VALUE_TYPE_ErrorChar",
	];
	public static readonly VOCABULARY: Vocabulary = new VocabularyImpl(CPGLLexer._LITERAL_NAMES, CPGLLexer._SYMBOLIC_NAMES, []);

	// @Override
	// @NotNull
	public get vocabulary(): Vocabulary {
		return CPGLLexer.VOCABULARY;
	}
	// tslint:enable:no-trailing-whitespace


	constructor(input: CharStream) {
		super(input);
		this._interp = new LexerATNSimulator(CPGLLexer._ATN, this);
	}

	// @Override
	public get grammarFileName(): string { return "CPGLLexer.g4"; }

	// @Override
	public get ruleNames(): string[] { return CPGLLexer.ruleNames; }

	// @Override
	public get serializedATN(): string { return CPGLLexer._serializedATN; }

	// @Override
	public get channelNames(): string[] { return CPGLLexer.channelNames; }

	// @Override
	public get modeNames(): string[] { return CPGLLexer.modeNames; }

	// @Override
	public action(_localctx: RuleContext, ruleIndex: number, actionIndex: number): void {
		switch (ruleIndex) {
		case 30:
			this.STRING_action(_localctx, actionIndex);
			break;

		case 36:
			this.ErrorChar_action(_localctx, actionIndex);
			break;

		case 37:
			this.ACTIVITY_TYPE_action(_localctx, actionIndex);
			break;

		case 40:
			this.ACTIVITY_ErrorChar_action(_localctx, actionIndex);
			break;

		case 41:
			this.CONCEPT_TYPE_action(_localctx, actionIndex);
			break;

		case 44:
			this.CONCEPT_ErrorChar_action(_localctx, actionIndex);
			break;

		case 45:
			this.CONCEPT_VALUE_TYPE_action(_localctx, actionIndex);
			break;

		case 48:
			this.VALUE_TYPE_ErrorChar_action(_localctx, actionIndex);
			break;
		}
	}
	private STRING_action(_localctx: RuleContext, actionIndex: number): void {
		switch (actionIndex) {
		case 0:

			        throw new Error(`Line ${this._tokenStartLine}:${this._tokenStartCharPositionInLine} - Unterminated string`);
			    
			break;
		}
	}
	private ErrorChar_action(_localctx: RuleContext, actionIndex: number): void {
		switch (actionIndex) {
		case 1:

			        throw new Error(`Line ${this._tokenStartLine}:${this._tokenStartCharPositionInLine} - Invalid character: ${this.text}`);
			    
			break;
		}
	}
	private ACTIVITY_TYPE_action(_localctx: RuleContext, actionIndex: number): void {
		switch (actionIndex) {
		case 2:
			 
			        const validTypes = [
			            'CPGAdministerMedication',
			            'CPGCollectInformation',
			            'CPGCommunication',
			            'CPGDispenseMedication',
			            'CPGDocumentMedication',
			            'CPGEnrollment',
			            'CPGGenerateReport',
			            'CPGHold',
			            'CPGImmunization',
			            'CPGMedicationRequest',
			            'CPGProposeDiagnosis',
			            'CPGRecordDetectedIssue',
			            'CPGRecordInference',
			            'CPGReportFlag',
			            'CPGResume',
			            'CPGServiceRequest',
			            'CPGStop'
			        ];
			        if (!validTypes.includes(this.text)) {
			            throw new Error(`Line ${this._tokenStartLine}:${this._tokenStartCharPositionInLine} - Invalid activity type: ${this.text}. Valid types are: ${validTypes.join(', ')}`);
			        }
			    
			break;
		}
	}
	private ACTIVITY_ErrorChar_action(_localctx: RuleContext, actionIndex: number): void {
		switch (actionIndex) {
		case 3:

			        throw new Error(`Line ${this._tokenStartLine}:${this._tokenStartCharPositionInLine} - Invalid character in activity type: ${this.text}`);
			    
			break;
		}
	}
	private CONCEPT_TYPE_action(_localctx: RuleContext, actionIndex: number): void {
		switch (actionIndex) {
		case 4:

			        const validTypes = [
			            'Communication',
			            'CommunicationRequest',
			            'Condition',
			            'QuestionnaireTask',
			            'QuestionnaireResponse',
			            'MedicationRequest',
			            'MedicationDispense',
			            'MedicationAdministration',
			            'MedicationStatement',
			            'ImmunizationRequest',
			            'Immunization',
			            'ServiceRequest',
			            'Procedure',
			            'Observation'
			        ];
			        if (!validTypes.includes(this.text)) {
			            throw new Error(`Line ${this._tokenStartLine}:${this._tokenStartCharPositionInLine} - Invalid concept type: ${this.text}. Valid types are: ${validTypes.join(', ')}`);
			        }
			    
			break;
		}
	}
	private CONCEPT_ErrorChar_action(_localctx: RuleContext, actionIndex: number): void {
		switch (actionIndex) {
		case 5:

			        throw new Error(`Line ${this._tokenStartLine}:${this._tokenStartCharPositionInLine} - Invalid character in concept type: ${this.text}`);
			    
			break;
		}
	}
	private CONCEPT_VALUE_TYPE_action(_localctx: RuleContext, actionIndex: number): void {
		switch (actionIndex) {
		case 6:

			        const validTypes = [
			            'Quantity',
			            'CodeableConcept',
			            'string',
			            'boolean',
			            'integer',
			            'Range',
			            'Ratio',
			            'SampledData',
			            'time',
			            'dateTime',
			            'Period',
			            'Attachment'
			        ];
			        if (!validTypes.includes(this.text)) {
			            throw new Error(`Line ${this._tokenStartLine}:${this._tokenStartCharPositionInLine} - Invalid concept value type: ${this.text}. Valid types are: ${validTypes.join(', ')}`);
			        }
			    
			break;
		}
	}
	private VALUE_TYPE_ErrorChar_action(_localctx: RuleContext, actionIndex: number): void {
		switch (actionIndex) {
		case 7:

			        throw new Error(`Line ${this._tokenStartLine}:${this._tokenStartCharPositionInLine} - Invalid character in value type: ${this.text}`);
			    
			break;
		}
	}

	public static readonly _serializedATN: string =
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x022\u0195\b\x01" +
		"\b\x01\b\x01\b\x01\x04\x02\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t" +
		"\x05\x04\x06\t\x06\x04\x07\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t" +
		"\v\x04\f\t\f\x04\r\t\r\x04\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11" +
		"\t\x11\x04\x12\t\x12\x04\x13\t\x13\x04\x14\t\x14\x04\x15\t\x15\x04\x16" +
		"\t\x16\x04\x17\t\x17\x04\x18\t\x18\x04\x19\t\x19\x04\x1A\t\x1A\x04\x1B" +
		"\t\x1B\x04\x1C\t\x1C\x04\x1D\t\x1D\x04\x1E\t\x1E\x04\x1F\t\x1F\x04 \t" +
		" \x04!\t!\x04\"\t\"\x04#\t#\x04$\t$\x04%\t%\x04&\t&\x04\'\t\'\x04(\t(" +
		"\x04)\t)\x04*\t*\x04+\t+\x04,\t,\x04-\t-\x04.\t.\x04/\t/\x040\t0\x041" +
		"\t1\x042\t2\x03\x02\x03\x02\x03\x02\x03\x02\x03\x02\x03\x02\x03\x02\x03" +
		"\x02\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x04\x03" +
		"\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03" +
		"\x04\x03\x04\x03\x05\x03\x05\x03\x05\x03\x05\x03\x05\x03\x05\x03\x05\x03" +
		"\x05\x03\x05\x03\x05\x03\x05\x03\x05\x03\x06\x03\x06\x03\x06\x03\x06\x03" +
		"\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x07\x03\x07\x03" +
		"\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\b\x03\b\x03\b" +
		"\x03\b\x03\t\x03\t\x03\t\x03\n\x03\n\x03\n\x03\n\x03\n\x03\v\x03\v\x03" +
		"\v\x03\v\x03\f\x03\f\x03\f\x03\r\x03\r\x03\r\x03\r\x03\r\x03\r\x03\x0E" +
		"\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0F" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10" +
		"\x03\x11\x03\x11\x03\x11\x03\x12\x03\x12\x03\x12\x03\x12\x03\x12\x03\x12" +
		"\x03\x12\x03\x13\x03\x13\x03\x13\x03\x13\x03\x13\x03\x14\x03\x14\x03\x14" +
		"\x03\x14\x03\x14\x03\x14\x03\x14\x03\x14\x03\x15\x03\x15\x03\x15\x03\x16" +
		"\x03\x16\x03\x16\x03\x16\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x18" +
		"\x03\x18\x03\x18\x03\x18\x03\x18\x03\x19\x03\x19\x03\x19\x03\x19\x03\x1A" +
		"\x03\x1A\x03\x1A\x03\x1A\x03\x1B\x03\x1B\x03\x1B\x03\x1B\x03\x1B\x03\x1B" +
		"\x03\x1B\x03\x1B\x03\x1B\x03\x1C\x03\x1C\x03\x1D\x03\x1D\x03\x1E\x03\x1E" +
		"\x03\x1F\x03\x1F\x03 \x03 \x07 \u011C\n \f \x0E \u011F\v \x03 \x03 \x05" +
		" \u0123\n \x03!\x03!\x07!\u0127\n!\f!\x0E!\u012A\v!\x03\"\x03\"\x03\"" +
		"\x03\"\x07\"\u0130\n\"\f\"\x0E\"\u0133\v\"\x03\"\x03\"\x03\"\x03#\x06" +
		"#\u0139\n#\r#\x0E#\u013A\x03#\x03#\x03$\x03$\x03$\x03$\x07$\u0143\n$\f" +
		"$\x0E$\u0146\v$\x03$\x03$\x03%\x03%\x03%\x03%\x03&\x03&\x03&\x03\'\x06" +
		"\'\u0152\n\'\r\'\x0E\'\u0153\x03\'\x03\'\x03\'\x03\'\x03(\x06(\u015B\n" +
		"(\r(\x0E(\u015C\x03(\x03(\x03)\x03)\x03)\x03)\x03*\x03*\x03*\x03+\x06" +
		"+\u0169\n+\r+\x0E+\u016A\x03+\x03+\x03+\x03+\x03,\x06,\u0172\n,\r,\x0E" +
		",\u0173\x03,\x03,\x03-\x03-\x03-\x03-\x03.\x03.\x03.\x03/\x06/\u0180\n" +
		"/\r/\x0E/\u0181\x03/\x03/\x03/\x03/\x030\x060\u0189\n0\r0\x0E0\u018A\x03" +
		"0\x030\x031\x031\x031\x031\x032\x032\x032\x03\u0131\x02\x023\x06\x02\x03" +
		"\b\x02\x04\n\x02\x05\f\x02\x06\x0E\x02\x07\x10\x02\b\x12\x02\t\x14\x02" +
		"\n\x16\x02\v\x18\x02\f\x1A\x02\r\x1C\x02\x0E\x1E\x02\x0F \x02\x10\"\x02" +
		"\x11$\x02\x12&\x02\x13(\x02\x14*\x02\x15,\x02\x16.\x02\x170\x02\x182\x02" +
		"\x194\x02\x1A6\x02\x1B8\x02\x1C:\x02\x1D<\x02\x1E>\x02\x1F@\x02 B\x02" +
		"!D\x02\"F\x02\x02H\x02#J\x02$L\x02%N\x02&P\x02\'R\x02(T\x02)V\x02*X\x02" +
		"+Z\x02,\\\x02-^\x02.`\x02/b\x020d\x021f\x022\x06\x02\x03\x04\x05\x07\x06" +
		"\x02\f\f\x0F\x0F$$^^\x04\x02C\\c|\x06\x022;C\\aac|\x05\x02\v\f\x0F\x0F" +
		"\"\"\x04\x02\f\f\x0F\x0F\x02\u019C\x02\x06\x03\x02\x02\x02\x02\b\x03\x02" +
		"\x02\x02\x02\n\x03\x02\x02\x02\x02\f\x03\x02\x02\x02\x02\x0E\x03\x02\x02" +
		"\x02\x02\x10\x03\x02\x02\x02\x02\x12\x03\x02\x02\x02\x02\x14\x03\x02\x02" +
		"\x02\x02\x16\x03\x02\x02\x02\x02\x18\x03\x02\x02\x02\x02\x1A\x03\x02\x02" +
		"\x02\x02\x1C\x03\x02\x02\x02\x02\x1E\x03\x02\x02\x02\x02 \x03\x02\x02" +
		"\x02\x02\"\x03\x02\x02\x02\x02$\x03\x02\x02\x02\x02&\x03\x02\x02\x02\x02" +
		"(\x03\x02\x02\x02\x02*\x03\x02\x02\x02\x02,\x03\x02\x02\x02\x02.\x03\x02" +
		"\x02\x02\x020\x03\x02\x02\x02\x022\x03\x02\x02\x02\x024\x03\x02\x02\x02" +
		"\x026\x03\x02\x02\x02\x028\x03\x02\x02\x02\x02:\x03\x02\x02\x02\x02<\x03" +
		"\x02\x02\x02\x02>\x03\x02\x02\x02\x02@\x03\x02\x02\x02\x02B\x03\x02\x02" +
		"\x02\x02D\x03\x02\x02\x02\x02H\x03\x02\x02\x02\x02J\x03\x02\x02\x02\x02" +
		"L\x03\x02\x02\x02\x02N\x03\x02\x02\x02\x03P\x03\x02\x02\x02\x03R\x03\x02" +
		"\x02\x02\x03T\x03\x02\x02\x02\x03V\x03\x02\x02\x02\x04X\x03\x02\x02\x02" +
		"\x04Z\x03\x02\x02\x02\x04\\\x03\x02\x02\x02\x04^\x03\x02\x02\x02\x05`" +
		"\x03\x02\x02\x02\x05b\x03\x02\x02\x02\x05d\x03\x02\x02\x02\x05f\x03\x02" +
		"\x02\x02\x06h\x03\x02\x02\x02\bp\x03\x02\x02\x02\nw\x03\x02\x02\x02\f" +
		"\x83\x03\x02\x02\x02\x0E\x8F\x03\x02\x02\x02\x10\x9A\x03\x02\x02\x02\x12" +
		"\xA3\x03\x02\x02\x02\x14\xA7\x03\x02\x02\x02\x16\xAA\x03\x02\x02\x02\x18" +
		"\xAF\x03\x02\x02\x02\x1A\xB3\x03\x02\x02\x02\x1C\xB6\x03\x02\x02\x02\x1E" +
		"\xBC\x03\x02\x02\x02 \xC5\x03\x02\x02\x02\"\xCF\x03\x02\x02\x02$\xD8\x03" +
		"\x02\x02\x02&\xDB\x03\x02\x02\x02(\xE2\x03\x02\x02\x02*\xE7\x03\x02\x02" +
		"\x02,\xEF\x03\x02\x02\x02.\xF2\x03\x02\x02\x020\xF6\x03\x02\x02\x022\xFB" +
		"\x03\x02\x02\x024\u0100\x03\x02\x02\x026\u0104\x03\x02\x02\x028\u0108" +
		"\x03\x02\x02\x02:\u0111\x03\x02\x02\x02<\u0113\x03\x02\x02\x02>\u0115" +
		"\x03\x02\x02\x02@\u0117\x03\x02\x02\x02B\u0119\x03\x02\x02\x02D\u0124" +
		"\x03\x02\x02\x02F\u012B\x03\x02\x02\x02H\u0138\x03\x02\x02\x02J\u013E" +
		"\x03\x02\x02\x02L\u0149\x03\x02\x02\x02N\u014D\x03\x02\x02\x02P\u0151" +
		"\x03\x02\x02\x02R\u015A\x03\x02\x02\x02T\u0160\x03\x02\x02\x02V\u0164" +
		"\x03\x02\x02\x02X\u0168\x03\x02\x02\x02Z\u0171\x03\x02\x02\x02\\\u0177" +
		"\x03\x02\x02\x02^\u017B\x03\x02\x02\x02`\u017F\x03\x02\x02\x02b\u0188" +
		"\x03\x02\x02\x02d\u018E\x03\x02\x02\x02f\u0192\x03\x02\x02\x02hi\x07e" +
		"\x02\x02ij\x07q\x02\x02jk\x07p\x02\x02kl\x07e\x02\x02lm\x07g\x02\x02m" +
		"n\x07r\x02\x02no\x07v\x02\x02o\x07\x03\x02\x02\x02pq\x07v\x02\x02qr\x07" +
		"{\x02\x02rs\x07r\x02\x02st\x07g\x02\x02tu\x03\x02\x02\x02uv\b\x03\x02" +
		"\x02v\t\x03\x02\x02\x02wx\x07x\x02\x02xy\x07c\x02\x02yz\x07n\x02\x02z" +
		"{\x07w\x02\x02{|\x07g\x02\x02|}\x07v\x02\x02}~\x07{\x02\x02~\x7F\x07r" +
		"\x02\x02\x7F\x80\x07g\x02\x02\x80\x81\x03\x02\x02\x02\x81\x82\b\x04\x03" +
		"\x02\x82\v\x03\x02\x02\x02\x83\x84\x07v\x02\x02\x84\x85\x07g\x02\x02\x85" +
		"\x86\x07t\x02\x02\x86\x87\x07o\x02\x02\x87\x88\x07k\x02\x02\x88\x89\x07" +
		"p\x02\x02\x89\x8A\x07q\x02\x02\x8A\x8B\x07n\x02\x02\x8B\x8C\x07q\x02\x02" +
		"\x8C\x8D\x07i\x02\x02\x8D\x8E\x07{\x02\x02\x8E\r\x03\x02\x02\x02\x8F\x90" +
		"\x07r\x02\x02\x90\x91\x07t\x02\x02\x91\x92\x07q\x02\x02\x92\x93\x07x\x02" +
		"\x02\x93\x94\x07g\x02\x02\x94\x95\x07p\x02\x02\x95\x96\x07c\x02\x02\x96" +
		"\x97\x07p\x02\x02\x97\x98\x07e\x02\x02\x98\x99\x07g\x02\x02\x99\x0F\x03" +
		"\x02\x02\x02\x9A\x9B\x07k\x02\x02\x9B\x9C\x07p\x02\x02\x9C\x9D\x07h\x02" +
		"\x02\x9D\x9E\x07g\x02\x02\x9E\x9F\x07t\x02\x02\x9F\xA0\x07t\x02\x02\xA0" +
		"\xA1\x07g\x02\x02\xA1\xA2\x07f\x02\x02\xA2\x11\x03\x02\x02\x02\xA3\xA4" +
		"\x07c\x02\x02\xA4\xA5\x07p\x02\x02\xA5\xA6\x07f\x02\x02\xA6\x13\x03\x02" +
		"\x02\x02\xA7\xA8\x07q\x02\x02\xA8\xA9\x07t\x02\x02\xA9\x15\x03\x02\x02" +
		"\x02\xAA\xAB\x07f\x02\x02\xAB\xAC\x07q\x02\x02\xAC\xAD\x07p\x02\x02\xAD" +
		"\xAE\x07g\x02\x02\xAE\x17\x03\x02\x02\x02\xAF\xB0\x07j\x02\x02\xB0\xB1" +
		"\x07c\x02\x02\xB1\xB2\x07u\x02\x02\xB2\x19\x03\x02\x02\x02\xB3\xB4\x07" +
		"d\x02\x02\xB4\xB5\x07{\x02\x02\xB5\x1B\x03\x02\x02\x02\xB6\xB7\x07e\x02" +
		"\x02\xB7\xB8\x07q\x02\x02\xB8\xB9\x07f\x02\x02\xB9\xBA\x07g\x02\x02\xBA" +
		"\xBB\x07f\x02\x02\xBB\x1D\x03\x02\x02\x02\xBC\xBD\x07x\x02\x02\xBD\xBE" +
		"\x07c\x02\x02\xBE\xBF\x07n\x02\x02\xBF\xC0\x07w\x02\x02\xC0\xC1\x07g\x02" +
		"\x02\xC1\xC2\x07u\x02\x02\xC2\xC3\x07g\x02\x02\xC3\xC4\x07v\x02\x02\xC4" +
		"\x1F\x03\x02\x02\x02\xC5\xC6\x07r\x02\x02\xC6\xC7\x07g\x02\x02\xC7\xC8" +
		"\x07t\x02\x02\xC8\xC9\x07h\x02\x02\xC9\xCA\x07q\x02\x02\xCA\xCB\x07t\x02" +
		"\x02\xCB\xCC\x07o\x02\x02\xCC\xCD\x03\x02\x02\x02\xCD\xCE\b\x0F\x04\x02" +
		"\xCE!\x03\x02\x02\x02\xCF\xD0\x07c\x02\x02\xD0\xD1\x07e\x02\x02\xD1\xD2" +
		"\x07v\x02\x02\xD2\xD3\x07k\x02\x02\xD3\xD4\x07x\x02\x02\xD4\xD5\x07k\x02" +
		"\x02\xD5\xD6\x07v\x02\x02\xD6\xD7\x07{\x02\x02\xD7#\x03\x02\x02\x02\xD8" +
		"\xD9\x07q\x02\x02\xD9\xDA\x07h\x02\x02\xDA%\x03\x02\x02\x02\xDB\xDC\x07" +
		"u\x02\x02\xDC\xDD\x07{\x02\x02\xDD\xDE\x07u\x02\x02\xDE\xDF\x07v\x02\x02" +
		"\xDF\xE0\x07g\x02\x02\xE0\xE1\x07o\x02\x02\xE1\'\x03\x02\x02\x02\xE2\xE3" +
		"\x07e\x02\x02\xE3\xE4\x07q\x02\x02\xE4\xE5\x07f\x02\x02\xE5\xE6\x07g\x02" +
		"\x02\xE6)\x03\x02\x02\x02\xE7\xE8\x07w\x02\x02\xE8\xE9\x07p\x02\x02\xE9" +
		"\xEA\x07m\x02\x02\xEA\xEB\x07p\x02\x02\xEB\xEC\x07q\x02\x02\xEC\xED\x07" +
		"y\x02\x02\xED\xEE\x07p\x02\x02\xEE+\x03\x02\x02\x02\xEF\xF0\x07f\x02\x02" +
		"\xF0\xF1\x07q\x02\x02\xF1-\x03\x02\x02\x02\xF2\xF3\x07w\x02\x02\xF3\xF4" +
		"\x07u\x02\x02\xF4\xF5\x07g\x02\x02\xF5/\x03\x02\x02\x02\xF6\xF7\x07y\x02" +
		"\x02\xF7\xF8\x07j\x02\x02\xF8\xF9\x07g\x02\x02\xF9\xFA\x07p\x02\x02\xFA" +
		"1\x03\x02\x02\x02\xFB\xFC\x07v\x02\x02\xFC\xFD\x07j\x02\x02\xFD\xFE\x07" +
		"g\x02\x02\xFE\xFF\x07p\x02\x02\xFF3\x03\x02\x02\x02\u0100\u0101\x07c\x02" +
		"\x02\u0101\u0102\x07p\x02\x02\u0102\u0103\x07{\x02\x02\u01035\x03\x02" +
		"\x02\x02\u0104\u0105\x07c\x02\x02\u0105\u0106\x07n\x02\x02\u0106\u0107" +
		"\x07n\x02\x02\u01077\x03\x02\x02\x02\u0108\u0109\x07f\x02\x02\u0109\u010A" +
		"\x07g\x02\x02\u010A\u010B\x07e\x02\x02\u010B\u010C\x07k\x02\x02\u010C" +
		"\u010D\x07u\x02\x02\u010D\u010E\x07k\x02\x02\u010E\u010F\x07q\x02\x02" +
		"\u010F\u0110\x07p\x02\x02\u01109\x03\x02\x02\x02\u0111\u0112\x07<\x02" +
		"\x02\u0112;\x03\x02\x02\x02\u0113\u0114\x070\x02\x02\u0114=\x03\x02\x02" +
		"\x02\u0115\u0116\x07*\x02\x02\u0116?\x03\x02\x02\x02\u0117\u0118\x07+" +
		"\x02\x02\u0118A\x03\x02\x02\x02\u0119\u011D\x07$\x02\x02\u011A\u011C\n" +
		"\x02\x02\x02\u011B\u011A\x03\x02\x02\x02\u011C\u011F\x03\x02\x02\x02\u011D" +
		"\u011B\x03\x02\x02\x02\u011D\u011E\x03\x02\x02\x02\u011E\u0122\x03\x02" +
		"\x02\x02\u011F\u011D\x03\x02\x02\x02\u0120\u0123\x07$\x02\x02\u0121\u0123" +
		"\b \x05\x02\u0122\u0120\x03\x02\x02\x02\u0122\u0121\x03\x02\x02\x02\u0123" +
		"C\x03\x02\x02\x02\u0124\u0128\t\x03\x02\x02\u0125\u0127\t\x04\x02\x02" +
		"\u0126\u0125\x03\x02\x02\x02\u0127\u012A\x03\x02\x02\x02\u0128\u0126\x03" +
		"\x02\x02\x02\u0128\u0129\x03\x02\x02\x02\u0129E\x03\x02\x02\x02\u012A" +
		"\u0128\x03\x02\x02\x02\u012B\u012C\x071\x02\x02\u012C\u012D\x07,\x02\x02" +
		"\u012D\u0131\x03\x02\x02\x02\u012E\u0130\v\x02\x02\x02\u012F\u012E\x03" +
		"\x02\x02\x02\u0130\u0133\x03\x02\x02\x02\u0131\u0132\x03\x02\x02\x02\u0131" +
		"\u012F\x03\x02\x02\x02\u0132\u0134\x03\x02\x02\x02\u0133\u0131\x03\x02" +
		"\x02\x02\u0134\u0135\x07,\x02\x02\u0135\u0136\x071\x02\x02\u0136G\x03" +
		"\x02\x02\x02\u0137\u0139\t\x05\x02\x02\u0138\u0137\x03\x02\x02\x02\u0139" +
		"\u013A\x03\x02\x02\x02\u013A\u0138\x03\x02\x02\x02\u013A\u013B\x03\x02" +
		"\x02\x02\u013B\u013C\x03\x02\x02\x02\u013C\u013D\b#\x06\x02\u013DI\x03" +
		"\x02\x02\x02\u013E\u013F\x071\x02\x02\u013F\u0140\x071\x02\x02\u0140\u0144" +
		"\x03\x02\x02\x02\u0141\u0143\n\x06\x02\x02\u0142\u0141\x03\x02\x02\x02" +
		"\u0143\u0146\x03\x02\x02\x02\u0144\u0142\x03\x02\x02\x02\u0144\u0145\x03" +
		"\x02\x02\x02\u0145\u0147\x03\x02\x02\x02\u0146\u0144\x03\x02\x02\x02\u0147" +
		"\u0148\b$\x06\x02\u0148K\x03\x02\x02\x02\u0149\u014A\x05F\"\x02\u014A" +
		"\u014B\x03\x02\x02\x02\u014B\u014C\b%\x06\x02\u014CM\x03\x02\x02\x02\u014D" +
		"\u014E\v\x02\x02\x02\u014E\u014F\b&\x07\x02\u014FO\x03\x02\x02\x02\u0150" +
		"\u0152\t\x03\x02\x02\u0151\u0150\x03\x02\x02\x02\u0152\u0153\x03\x02\x02" +
		"\x02\u0153\u0151\x03\x02\x02\x02\u0153\u0154\x03\x02\x02\x02\u0154\u0155" +
		"\x03\x02\x02\x02\u0155\u0156\b\'\b\x02\u0156\u0157\x03\x02\x02\x02\u0157" +
		"\u0158\b\'\t\x02\u0158Q\x03\x02\x02\x02\u0159\u015B\t\x05\x02\x02\u015A" +
		"\u0159\x03\x02\x02\x02\u015B\u015C\x03\x02\x02\x02\u015C\u015A\x03\x02" +
		"\x02\x02\u015C\u015D\x03\x02\x02\x02\u015D\u015E\x03\x02\x02\x02\u015E" +
		"\u015F\b(\x06\x02\u015FS\x03\x02\x02\x02\u0160\u0161\x05F\"\x02\u0161" +
		"\u0162\x03\x02\x02\x02\u0162\u0163\b)\x06\x02\u0163U\x03\x02\x02\x02\u0164" +
		"\u0165\v\x02\x02\x02\u0165\u0166\b*\n\x02\u0166W\x03\x02\x02\x02\u0167" +
		"\u0169\t\x03\x02\x02\u0168\u0167\x03\x02\x02\x02\u0169\u016A\x03\x02\x02" +
		"\x02\u016A\u0168\x03\x02\x02\x02\u016A\u016B\x03\x02\x02\x02\u016B\u016C" +
		"\x03\x02\x02\x02\u016C\u016D\b+\v\x02\u016D\u016E\x03\x02\x02\x02\u016E" +
		"\u016F\b+\t\x02\u016FY\x03\x02\x02\x02\u0170\u0172\t\x05\x02\x02\u0171" +
		"\u0170\x03\x02\x02\x02\u0172\u0173\x03\x02\x02\x02\u0173\u0171\x03\x02" +
		"\x02\x02\u0173\u0174\x03\x02\x02\x02\u0174\u0175\x03\x02\x02\x02\u0175" +
		"\u0176\b,\x06\x02\u0176[\x03\x02\x02\x02\u0177\u0178\x05F\"\x02\u0178" +
		"\u0179\x03\x02\x02\x02\u0179\u017A\b-\x06\x02\u017A]\x03\x02\x02\x02\u017B" +
		"\u017C\v\x02\x02\x02\u017C\u017D\b.\f\x02\u017D_\x03\x02\x02\x02\u017E" +
		"\u0180\t\x03\x02\x02\u017F\u017E\x03\x02\x02\x02\u0180\u0181\x03\x02\x02" +
		"\x02\u0181\u017F\x03\x02\x02\x02\u0181\u0182\x03\x02\x02\x02\u0182\u0183" +
		"\x03\x02\x02\x02\u0183\u0184\b/\r\x02\u0184\u0185\x03\x02\x02\x02\u0185" +
		"\u0186\b/\t\x02\u0186a\x03\x02\x02\x02\u0187\u0189\t\x05\x02\x02\u0188" +
		"\u0187\x03\x02\x02\x02\u0189\u018A\x03\x02\x02\x02\u018A\u0188\x03\x02" +
		"\x02\x02\u018A\u018B\x03\x02\x02\x02\u018B\u018C\x03\x02\x02\x02\u018C" +
		"\u018D\b0\x06\x02\u018Dc\x03\x02\x02\x02\u018E\u018F\x05F\"\x02\u018F" +
		"\u0190\x03\x02\x02\x02\u0190\u0191\b1\x06\x02\u0191e\x03\x02\x02\x02\u0192" +
		"\u0193\v\x02\x02\x02\u0193\u0194\b2\x0E\x02\u0194g\x03\x02\x02\x02\x12" +
		"\x02\x03\x04\x05\u011D\u0122\u0128\u0131\u013A\u0144\u0153\u015C\u016A" +
		"\u0173\u0181\u018A\x0F\x04\x04\x02\x04\x05\x02\x04\x03\x02\x03 \x02\b" +
		"\x02\x02\x03&\x03\x03\'\x04\x04\x02\x02\x03*\x05\x03+\x06\x03.\x07\x03" +
		"/\b\x032\t";
	public static __ATN: ATN;
	public static get _ATN(): ATN {
		if (!CPGLLexer.__ATN) {
			CPGLLexer.__ATN = new ATNDeserializer().deserialize(Utils.toCharArray(CPGLLexer._serializedATN));
		}

		return CPGLLexer.__ATN;
	}

}

