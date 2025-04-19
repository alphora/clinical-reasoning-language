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
	public static readonly MARKDOWN_STRING = 34;
	public static readonly STRING = 35;
	public static readonly WS = 36;
	public static readonly COMMENT = 37;
	public static readonly COMMENT_BLOCK = 38;
	public static readonly ACTIVITY_TYPE = 39;
	public static readonly ACTIVITY_WS = 40;
	public static readonly ACTIVITY_COMMENT_BLOCK = 41;
	public static readonly ACTIVITY_ErrorChar = 42;
	public static readonly CONCEPT_TYPE = 43;
	public static readonly CONCEPT_WS = 44;
	public static readonly CONCEPT_COMMENT_BLOCK = 45;
	public static readonly CONCEPT_ErrorChar = 46;
	public static readonly CONCEPT_VALUE_TYPE = 47;
	public static readonly VALUE_TYPE_WS = 48;
	public static readonly VALUE_TYPE_COMMENT_BLOCK = 49;
	public static readonly VALUE_TYPE_ErrorChar = 50;
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
		"AND", "OR", "NOT", "DONE", "HAS", "BY", "CODED", "VALUESET", "PERFORM", 
		"ACTIVITY", "OF", "SYSTEM", "CODE", "UNKNOWN", "DO", "USE", "WHEN", "THEN", 
		"ANY", "ALL", "DECISION", "ERROR", "COLON", "DOT", "LPAREN", "RPAREN", 
		"QUOTED_STRING", "MARKDOWN_STRING", "STRING", "BLOCK_COMMENT", "WS", "COMMENT", 
		"COMMENT_BLOCK", "ACTIVITY_TYPE", "ACTIVITY_WS", "ACTIVITY_COMMENT_BLOCK", 
		"ACTIVITY_ErrorChar", "CONCEPT_TYPE", "CONCEPT_WS", "CONCEPT_COMMENT_BLOCK", 
		"CONCEPT_ErrorChar", "CONCEPT_VALUE_TYPE", "VALUE_TYPE_WS", "VALUE_TYPE_COMMENT_BLOCK", 
		"VALUE_TYPE_ErrorChar",
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
		"RPAREN", "QUOTED_STRING", "MARKDOWN_STRING", "STRING", "WS", "COMMENT", 
		"COMMENT_BLOCK", "ACTIVITY_TYPE", "ACTIVITY_WS", "ACTIVITY_COMMENT_BLOCK", 
		"ACTIVITY_ErrorChar", "CONCEPT_TYPE", "CONCEPT_WS", "CONCEPT_COMMENT_BLOCK", 
		"CONCEPT_ErrorChar", "CONCEPT_VALUE_TYPE", "VALUE_TYPE_WS", "VALUE_TYPE_COMMENT_BLOCK", 
		"VALUE_TYPE_ErrorChar",
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
		case 39:
			this.ACTIVITY_TYPE_action(_localctx, actionIndex);
			break;

		case 42:
			this.ACTIVITY_ErrorChar_action(_localctx, actionIndex);
			break;

		case 43:
			this.CONCEPT_TYPE_action(_localctx, actionIndex);
			break;

		case 46:
			this.CONCEPT_ErrorChar_action(_localctx, actionIndex);
			break;

		case 47:
			this.CONCEPT_VALUE_TYPE_action(_localctx, actionIndex);
			break;

		case 50:
			this.VALUE_TYPE_ErrorChar_action(_localctx, actionIndex);
			break;
		}
	}
	private ACTIVITY_TYPE_action(_localctx: RuleContext, actionIndex: number): void {
		switch (actionIndex) {
		case 0:

			        const validTypes = [
			            'CPGCommunicationRequest',
			            'CPGCollectInformation',
			            'CPGEnrollment',
			            'CPGGenerateReport',
			            'CPGMedicationRequest',
			            'CPGDispenseMedication',
			            'CPGAdministerMedication',
			            'CPGDocumentMedication',
			            'CPGImmunizationRequest',
			            'CPGServiceRequest',
			            'CPGProposeDiagnosisTask',
			            'CPGRecordDetectedIssue',
			            'CPGRecordInference',
			            'CPGReportFlagTask'
			        ];
			        if (!validTypes.includes(this.text)) {
			            for (const listener of this.getErrorListeners()) {
			                if (typeof (listener as any).reportCustomError === 'function') {
			                    (listener as any).reportCustomError(
			                        this._tokenStartLine,
			                        this._tokenStartCharPositionInLine,
			                        `Invalid activity type: ${this.text}`,
			                        { validTypes, received: this.text }
			                    );
			                }
			            }
			        }
			    
			break;
		}
	}
	private ACTIVITY_ErrorChar_action(_localctx: RuleContext, actionIndex: number): void {
		switch (actionIndex) {
		case 1:

			        for (const listener of this.getErrorListeners()) {
			            if (typeof (listener as any).reportCustomError === 'function') {
			                (listener as any).reportCustomError(
			                    this._tokenStartLine,
			                    this._tokenStartCharPositionInLine,
			                    `Invalid character in activity type: ${this.text}`,
			                    { received: this.text }
			                );
			            }
			        }
			    
			break;
		}
	}
	private CONCEPT_TYPE_action(_localctx: RuleContext, actionIndex: number): void {
		switch (actionIndex) {
		case 2:

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
			            for (const listener of this.getErrorListeners()) {
			                if (typeof (listener as any).reportCustomError === 'function') {
			                    (listener as any).reportCustomError(
			                        this._tokenStartLine,
			                        this._tokenStartCharPositionInLine,
			                        `Invalid concept type: ${this.text}`,
			                        { validTypes, received: this.text }
			                    );
			                }
			            }
			        }
			    
			break;
		}
	}
	private CONCEPT_ErrorChar_action(_localctx: RuleContext, actionIndex: number): void {
		switch (actionIndex) {
		case 3:

			        for (const listener of this.getErrorListeners()) {
			            if (typeof (listener as any).reportCustomError === 'function') {
			                (listener as any).reportCustomError(
			                    this._tokenStartLine,
			                    this._tokenStartCharPositionInLine,
			                    `Invalid character in concept type: ${this.text}`,
			                    { received: this.text }
			                );
			            }
			        }
			    
			break;
		}
	}
	private CONCEPT_VALUE_TYPE_action(_localctx: RuleContext, actionIndex: number): void {
		switch (actionIndex) {
		case 4:

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
			            for (const listener of this.getErrorListeners()) {
			                if (typeof (listener as any).reportCustomError === 'function') {
			                    (listener as any).reportCustomError(
			                        this._tokenStartLine,
			                        this._tokenStartCharPositionInLine,
			                        `Invalid concept value type: ${this.text}`,
			                        { validTypes, received: this.text }
			                    );
			                }
			            }
			        }
			    
			break;
		}
	}
	private VALUE_TYPE_ErrorChar_action(_localctx: RuleContext, actionIndex: number): void {
		switch (actionIndex) {
		case 5:

			        for (const listener of this.getErrorListeners()) {
			            if (typeof (listener as any).reportCustomError === 'function') {
			                (listener as any).reportCustomError(
			                    this._tokenStartLine,
			                    this._tokenStartCharPositionInLine,
			                    `Invalid character in concept value type: ${this.text}`,
			                    { received: this.text }
			                );
			            }
			        }
			    
			break;
		}
	}

	public static readonly _serializedATN: string =
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x024\u01A7\b\x01" +
		"\b\x01\b\x01\b\x01\x04\x02\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t" +
		"\x05\x04\x06\t\x06\x04\x07\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t" +
		"\v\x04\f\t\f\x04\r\t\r\x04\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11" +
		"\t\x11\x04\x12\t\x12\x04\x13\t\x13\x04\x14\t\x14\x04\x15\t\x15\x04\x16" +
		"\t\x16\x04\x17\t\x17\x04\x18\t\x18\x04\x19\t\x19\x04\x1A\t\x1A\x04\x1B" +
		"\t\x1B\x04\x1C\t\x1C\x04\x1D\t\x1D\x04\x1E\t\x1E\x04\x1F\t\x1F\x04 \t" +
		" \x04!\t!\x04\"\t\"\x04#\t#\x04$\t$\x04%\t%\x04&\t&\x04\'\t\'\x04(\t(" +
		"\x04)\t)\x04*\t*\x04+\t+\x04,\t,\x04-\t-\x04.\t.\x04/\t/\x040\t0\x041" +
		"\t1\x042\t2\x043\t3\x044\t4\x03\x02\x03\x02\x03\x02\x03\x02\x03\x02\x03" +
		"\x02\x03\x02\x03\x02\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03" +
		"\x03\x03\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03" +
		"\x04\x03\x04\x03\x04\x03\x04\x03\x05\x03\x05\x03\x05\x03\x05\x03\x05\x03" +
		"\x05\x03\x05\x03\x05\x03\x05\x03\x05\x03\x05\x03\x05\x03\x06\x03\x06\x03" +
		"\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03" +
		"\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03" +
		"\b\x03\b\x03\b\x03\b\x03\t\x03\t\x03\t\x03\n\x03\n\x03\n\x03\n\x03\v\x03" +
		"\v\x03\v\x03\v\x03\v\x03\f\x03\f\x03\f\x03\f\x03\r\x03\r\x03\r\x03\x0E" +
		"\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x10\x03\x10\x03\x10\x03\x10" +
		"\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x11\x03\x11\x03\x11" +
		"\x03\x11\x03\x11\x03\x11\x03\x11\x03\x11\x03\x11\x03\x12\x03\x12\x03\x12" +
		"\x03\x13\x03\x13\x03\x13\x03\x13\x03\x13\x03\x13\x03\x13\x03\x14\x03\x14" +
		"\x03\x14\x03\x14\x03\x14\x03\x15\x03\x15\x03\x15\x03\x15\x03\x15\x03\x15" +
		"\x03\x15\x03\x15\x03\x16\x03\x16\x03\x16\x03\x17\x03\x17\x03\x17\x03\x17" +
		"\x03\x18\x03\x18\x03\x18\x03\x18\x03\x18\x03\x19\x03\x19\x03\x19\x03\x19" +
		"\x03\x19\x03\x1A\x03\x1A\x03\x1A\x03\x1A\x03\x1B\x03\x1B\x03\x1B\x03\x1B" +
		"\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x03\x1C" +
		"\x03\x1D\x03\x1D\x03\x1D\x03\x1D\x03\x1D\x03\x1D\x03\x1E\x03\x1E\x03\x1F" +
		"\x03\x1F\x03 \x03 \x03!\x03!\x03\"\x03\"\x07\"\u012A\n\"\f\"\x0E\"\u012D" +
		"\v\"\x03\"\x03\"\x03#\x06#\u0132\n#\r#\x0E#\u0133\x03$\x03$\x03$\x03$" +
		"\x07$\u013A\n$\f$\x0E$\u013D\v$\x03$\x03$\x03%\x03%\x03%\x03%\x07%\u0145" +
		"\n%\f%\x0E%\u0148\v%\x03%\x03%\x03%\x03&\x06&\u014E\n&\r&\x0E&\u014F\x03" +
		"&\x03&\x03\'\x03\'\x03\'\x03\'\x07\'\u0158\n\'\f\'\x0E\'\u015B\v\'\x03" +
		"\'\x03\'\x03(\x03(\x03(\x03(\x03)\x06)\u0164\n)\r)\x0E)\u0165\x03)\x03" +
		")\x03)\x03)\x03*\x06*\u016D\n*\r*\x0E*\u016E\x03*\x03*\x03+\x03+\x03+" +
		"\x03+\x03,\x03,\x03,\x03-\x06-\u017B\n-\r-\x0E-\u017C\x03-\x03-\x03-\x03" +
		"-\x03.\x06.\u0184\n.\r.\x0E.\u0185\x03.\x03.\x03/\x03/\x03/\x03/\x030" +
		"\x030\x030\x031\x061\u0192\n1\r1\x0E1\u0193\x031\x031\x031\x031\x032\x06" +
		"2\u019B\n2\r2\x0E2\u019C\x032\x032\x033\x033\x033\x033\x034\x034\x034" +
		"\x04\u0133\u0146\x02\x025\x06\x02\x03\b\x02\x04\n\x02\x05\f\x02\x06\x0E" +
		"\x02\x07\x10\x02\b\x12\x02\t\x14\x02\n\x16\x02\v\x18\x02\f\x1A\x02\r\x1C" +
		"\x02\x0E\x1E\x02\x0F \x02\x10\"\x02\x11$\x02\x12&\x02\x13(\x02\x14*\x02" +
		"\x15,\x02\x16.\x02\x170\x02\x182\x02\x194\x02\x1A6\x02\x1B8\x02\x1C:\x02" +
		"\x1D<\x02\x1E>\x02\x1F@\x02 B\x02!D\x02\"F\x02#H\x02$J\x02%L\x02\x02N" +
		"\x02&P\x02\'R\x02(T\x02)V\x02*X\x02+Z\x02,\\\x02-^\x02.`\x02/b\x020d\x02" +
		"1f\x022h\x023j\x024\x06\x02\x03\x04\x05\x07\x06\x02\f\f\x0F\x0F$$^^\x03" +
		"\x02$$\x05\x02\v\f\x0F\x0F\"\"\x04\x02\f\f\x0F\x0F\x04\x02C\\c|\x02\u01AF" +
		"\x02\x06\x03\x02\x02\x02\x02\b\x03\x02\x02\x02\x02\n\x03\x02\x02\x02\x02" +
		"\f\x03\x02\x02\x02\x02\x0E\x03\x02\x02\x02\x02\x10\x03\x02\x02\x02\x02" +
		"\x12\x03\x02\x02\x02\x02\x14\x03\x02\x02\x02\x02\x16\x03\x02\x02\x02\x02" +
		"\x18\x03\x02\x02\x02\x02\x1A\x03\x02\x02\x02\x02\x1C\x03\x02\x02\x02\x02" +
		"\x1E\x03\x02\x02\x02\x02 \x03\x02\x02\x02\x02\"\x03\x02\x02\x02\x02$\x03" +
		"\x02\x02\x02\x02&\x03\x02\x02\x02\x02(\x03\x02\x02\x02\x02*\x03\x02\x02" +
		"\x02\x02,\x03\x02\x02\x02\x02.\x03\x02\x02\x02\x020\x03\x02\x02\x02\x02" +
		"2\x03\x02\x02\x02\x024\x03\x02\x02\x02\x026\x03\x02\x02\x02\x028\x03\x02" +
		"\x02\x02\x02:\x03\x02\x02\x02\x02<\x03\x02\x02\x02\x02>\x03\x02\x02\x02" +
		"\x02@\x03\x02\x02\x02\x02B\x03\x02\x02\x02\x02D\x03\x02\x02\x02\x02F\x03" +
		"\x02\x02\x02\x02H\x03\x02\x02\x02\x02J\x03\x02\x02\x02\x02N\x03\x02\x02" +
		"\x02\x02P\x03\x02\x02\x02\x02R\x03\x02\x02\x02\x03T\x03\x02\x02\x02\x03" +
		"V\x03\x02\x02\x02\x03X\x03\x02\x02\x02\x03Z\x03\x02\x02\x02\x04\\\x03" +
		"\x02\x02\x02\x04^\x03\x02\x02\x02\x04`\x03\x02\x02\x02\x04b\x03\x02\x02" +
		"\x02\x05d\x03\x02\x02\x02\x05f\x03\x02\x02\x02\x05h\x03\x02\x02\x02\x05" +
		"j\x03\x02\x02\x02\x06l\x03\x02\x02\x02\bt\x03\x02\x02\x02\n{\x03\x02\x02" +
		"\x02\f\x87\x03\x02\x02\x02\x0E\x93\x03\x02\x02\x02\x10\x9E\x03\x02\x02" +
		"\x02\x12\xA7\x03\x02\x02\x02\x14\xAB\x03\x02\x02\x02\x16\xAE\x03\x02\x02" +
		"\x02\x18\xB2\x03\x02\x02\x02\x1A\xB7\x03\x02\x02\x02\x1C\xBB\x03\x02\x02" +
		"\x02\x1E\xBE\x03\x02\x02\x02 \xC4\x03\x02\x02\x02\"\xCD\x03\x02\x02\x02" +
		"$\xD7\x03\x02\x02\x02&\xE0\x03\x02\x02\x02(\xE3\x03\x02\x02\x02*\xEA\x03" +
		"\x02\x02\x02,\xEF\x03\x02\x02\x02.\xF7\x03\x02\x02\x020\xFA\x03\x02\x02" +
		"\x022\xFE\x03\x02\x02\x024\u0103\x03\x02\x02\x026\u0108\x03\x02\x02\x02" +
		"8\u010C\x03\x02\x02\x02:\u0110\x03\x02\x02\x02<\u0119\x03\x02\x02\x02" +
		">\u011F\x03\x02\x02\x02@\u0121\x03\x02\x02\x02B\u0123\x03\x02\x02\x02" +
		"D\u0125\x03\x02\x02\x02F\u0127\x03\x02\x02\x02H\u0131\x03\x02\x02\x02" +
		"J\u0135\x03\x02\x02\x02L\u0140\x03\x02\x02\x02N\u014D\x03\x02\x02\x02" +
		"P\u0153\x03\x02\x02\x02R\u015E\x03\x02\x02\x02T\u0163\x03\x02\x02\x02" +
		"V\u016C\x03\x02\x02\x02X\u0172\x03\x02\x02\x02Z\u0176\x03\x02\x02\x02" +
		"\\\u017A\x03\x02\x02\x02^\u0183\x03\x02\x02\x02`\u0189\x03\x02\x02\x02" +
		"b\u018D\x03\x02\x02\x02d\u0191\x03\x02\x02\x02f\u019A\x03\x02\x02\x02" +
		"h\u01A0\x03\x02\x02\x02j\u01A4\x03\x02\x02\x02lm\x07e\x02\x02mn\x07q\x02" +
		"\x02no\x07p\x02\x02op\x07e\x02\x02pq\x07g\x02\x02qr\x07r\x02\x02rs\x07" +
		"v\x02\x02s\x07\x03\x02\x02\x02tu\x07v\x02\x02uv\x07{\x02\x02vw\x07r\x02" +
		"\x02wx\x07g\x02\x02xy\x03\x02\x02\x02yz\b\x03\x02\x02z\t\x03\x02\x02\x02" +
		"{|\x07x\x02\x02|}\x07c\x02\x02}~\x07n\x02\x02~\x7F\x07w\x02\x02\x7F\x80" +
		"\x07g\x02\x02\x80\x81\x07v\x02\x02\x81\x82\x07{\x02\x02\x82\x83\x07r\x02" +
		"\x02\x83\x84\x07g\x02\x02\x84\x85\x03\x02\x02\x02\x85\x86\b\x04\x03\x02" +
		"\x86\v\x03\x02\x02\x02\x87\x88\x07v\x02\x02\x88\x89\x07g\x02\x02\x89\x8A" +
		"\x07t\x02\x02\x8A\x8B\x07o\x02\x02\x8B\x8C\x07k\x02\x02\x8C\x8D\x07p\x02" +
		"\x02\x8D\x8E\x07q\x02\x02\x8E\x8F\x07n\x02\x02\x8F\x90\x07q\x02\x02\x90" +
		"\x91\x07i\x02\x02\x91\x92\x07{\x02\x02\x92\r\x03\x02\x02\x02\x93\x94\x07" +
		"r\x02\x02\x94\x95\x07t\x02\x02\x95\x96\x07q\x02\x02\x96\x97\x07x\x02\x02" +
		"\x97\x98\x07g\x02\x02\x98\x99\x07p\x02\x02\x99\x9A\x07c\x02\x02\x9A\x9B" +
		"\x07p\x02\x02\x9B\x9C\x07e\x02\x02\x9C\x9D\x07g\x02\x02\x9D\x0F\x03\x02" +
		"\x02\x02\x9E\x9F\x07k\x02\x02\x9F\xA0\x07p\x02\x02\xA0\xA1\x07h\x02\x02" +
		"\xA1\xA2\x07g\x02\x02\xA2\xA3\x07t\x02\x02\xA3\xA4\x07t\x02\x02\xA4\xA5" +
		"\x07g\x02\x02\xA5\xA6\x07f\x02\x02\xA6\x11\x03\x02\x02\x02\xA7\xA8\x07" +
		"c\x02\x02\xA8\xA9\x07p\x02\x02\xA9\xAA\x07f\x02\x02\xAA\x13\x03\x02\x02" +
		"\x02\xAB\xAC\x07q\x02\x02\xAC\xAD\x07t\x02\x02\xAD\x15\x03\x02\x02\x02" +
		"\xAE\xAF\x07p\x02\x02\xAF\xB0\x07q\x02\x02\xB0\xB1\x07v\x02\x02\xB1\x17" +
		"\x03\x02\x02\x02\xB2\xB3\x07f\x02\x02\xB3\xB4\x07q\x02\x02\xB4\xB5\x07" +
		"p\x02\x02\xB5\xB6\x07g\x02\x02\xB6\x19\x03\x02\x02\x02\xB7\xB8\x07j\x02" +
		"\x02\xB8\xB9\x07c\x02\x02\xB9\xBA\x07u\x02\x02\xBA\x1B\x03\x02\x02\x02" +
		"\xBB\xBC\x07d\x02\x02\xBC\xBD\x07{\x02\x02\xBD\x1D\x03\x02\x02\x02\xBE" +
		"\xBF\x07e\x02\x02\xBF\xC0\x07q\x02\x02\xC0\xC1\x07f\x02\x02\xC1\xC2\x07" +
		"g\x02\x02\xC2\xC3\x07f\x02\x02\xC3\x1F\x03\x02\x02\x02\xC4\xC5\x07x\x02" +
		"\x02\xC5\xC6\x07c\x02\x02\xC6\xC7\x07n\x02\x02\xC7\xC8\x07w\x02\x02\xC8" +
		"\xC9\x07g\x02\x02\xC9\xCA\x07u\x02\x02\xCA\xCB\x07g\x02\x02\xCB\xCC\x07" +
		"v\x02\x02\xCC!\x03\x02\x02\x02\xCD\xCE\x07r\x02\x02\xCE\xCF\x07g\x02\x02" +
		"\xCF\xD0\x07t\x02\x02\xD0\xD1\x07h\x02\x02\xD1\xD2\x07q\x02\x02\xD2\xD3" +
		"\x07t\x02\x02\xD3\xD4\x07o\x02\x02\xD4\xD5\x03\x02\x02\x02\xD5\xD6\b\x10" +
		"\x04\x02\xD6#\x03\x02\x02\x02\xD7\xD8\x07c\x02\x02\xD8\xD9\x07e\x02\x02" +
		"\xD9\xDA\x07v\x02\x02\xDA\xDB\x07k\x02\x02\xDB\xDC\x07x\x02\x02\xDC\xDD" +
		"\x07k\x02\x02\xDD\xDE\x07v\x02\x02\xDE\xDF\x07{\x02\x02\xDF%\x03\x02\x02" +
		"\x02\xE0\xE1\x07q\x02\x02\xE1\xE2\x07h\x02\x02\xE2\'\x03\x02\x02\x02\xE3" +
		"\xE4\x07u\x02\x02\xE4\xE5\x07{\x02\x02\xE5\xE6\x07u\x02\x02\xE6\xE7\x07" +
		"v\x02\x02\xE7\xE8\x07g\x02\x02\xE8\xE9\x07o\x02\x02\xE9)\x03\x02\x02\x02" +
		"\xEA\xEB\x07e\x02\x02\xEB\xEC\x07q\x02\x02\xEC\xED\x07f\x02\x02\xED\xEE" +
		"\x07g\x02\x02\xEE+\x03\x02\x02\x02\xEF\xF0\x07w\x02\x02\xF0\xF1\x07p\x02" +
		"\x02\xF1\xF2\x07m\x02\x02\xF2\xF3\x07p\x02\x02\xF3\xF4\x07q\x02\x02\xF4" +
		"\xF5\x07y\x02\x02\xF5\xF6\x07p\x02\x02\xF6-\x03\x02\x02\x02\xF7\xF8\x07" +
		"f\x02\x02\xF8\xF9\x07q\x02\x02\xF9/\x03\x02\x02\x02\xFA\xFB\x07w\x02\x02" +
		"\xFB\xFC\x07u\x02\x02\xFC\xFD\x07g\x02\x02\xFD1\x03\x02\x02\x02\xFE\xFF" +
		"\x07y\x02\x02\xFF\u0100\x07j\x02\x02\u0100\u0101\x07g\x02\x02\u0101\u0102" +
		"\x07p\x02\x02\u01023\x03\x02\x02\x02\u0103\u0104\x07v\x02\x02\u0104\u0105" +
		"\x07j\x02\x02\u0105\u0106\x07g\x02\x02\u0106\u0107\x07p\x02\x02\u0107" +
		"5\x03\x02\x02\x02\u0108\u0109\x07c\x02\x02\u0109\u010A\x07p\x02\x02\u010A" +
		"\u010B\x07{\x02\x02\u010B7\x03\x02\x02\x02\u010C\u010D\x07c\x02\x02\u010D" +
		"\u010E\x07n\x02\x02\u010E\u010F\x07n\x02\x02\u010F9\x03\x02\x02\x02\u0110" +
		"\u0111\x07f\x02\x02\u0111\u0112\x07g\x02\x02\u0112\u0113\x07e\x02\x02" +
		"\u0113\u0114\x07k\x02\x02\u0114\u0115\x07u\x02\x02\u0115\u0116\x07k\x02" +
		"\x02\u0116\u0117\x07q\x02\x02\u0117\u0118\x07p\x02\x02\u0118;\x03\x02" +
		"\x02\x02\u0119\u011A\x07g\x02\x02\u011A\u011B\x07t\x02\x02\u011B\u011C" +
		"\x07t\x02\x02\u011C\u011D\x07q\x02\x02\u011D\u011E\x07t\x02\x02\u011E" +
		"=\x03\x02\x02\x02\u011F\u0120\x07<\x02\x02\u0120?\x03\x02\x02\x02\u0121" +
		"\u0122\x070\x02\x02\u0122A\x03\x02\x02\x02\u0123\u0124\x07*\x02\x02\u0124" +
		"C\x03\x02\x02\x02\u0125\u0126\x07+\x02\x02\u0126E\x03\x02\x02\x02\u0127" +
		"\u012B\x07$\x02\x02\u0128\u012A\n\x02\x02\x02\u0129\u0128\x03\x02\x02" +
		"\x02\u012A\u012D\x03\x02\x02\x02\u012B\u0129\x03\x02\x02\x02\u012B\u012C" +
		"\x03\x02\x02\x02\u012C\u012E\x03\x02\x02\x02\u012D\u012B\x03\x02\x02\x02" +
		"\u012E\u012F\x07$\x02\x02\u012FG\x03\x02\x02\x02\u0130\u0132\v\x02\x02" +
		"\x02\u0131\u0130\x03\x02\x02\x02\u0132\u0133\x03\x02\x02\x02\u0133\u0134" +
		"\x03\x02\x02\x02\u0133\u0131\x03\x02\x02\x02\u0134I\x03\x02\x02\x02\u0135" +
		"\u013B\x07$\x02\x02\u0136\u0137\x07^\x02\x02\u0137\u013A\v\x02\x02\x02" +
		"\u0138\u013A\n\x03\x02\x02\u0139\u0136\x03\x02\x02\x02\u0139\u0138\x03" +
		"\x02\x02\x02\u013A\u013D\x03\x02\x02\x02\u013B\u0139\x03\x02\x02\x02\u013B" +
		"\u013C\x03\x02\x02\x02\u013C\u013E\x03\x02\x02\x02\u013D\u013B\x03\x02" +
		"\x02\x02\u013E\u013F\x07$\x02\x02\u013FK\x03\x02\x02\x02\u0140\u0141\x07" +
		"1\x02\x02\u0141\u0142\x07,\x02\x02\u0142\u0146\x03\x02\x02\x02\u0143\u0145" +
		"\v\x02\x02\x02\u0144\u0143\x03\x02\x02\x02\u0145\u0148\x03\x02\x02\x02" +
		"\u0146\u0147\x03\x02\x02\x02\u0146\u0144\x03\x02\x02\x02\u0147\u0149\x03" +
		"\x02\x02\x02\u0148\u0146\x03\x02\x02\x02\u0149\u014A\x07,\x02\x02\u014A" +
		"\u014B\x071\x02\x02\u014BM\x03\x02\x02\x02\u014C\u014E\t\x04\x02\x02\u014D" +
		"\u014C\x03\x02\x02\x02\u014E\u014F\x03\x02\x02\x02\u014F\u014D\x03\x02" +
		"\x02\x02\u014F\u0150\x03\x02\x02\x02\u0150\u0151\x03\x02\x02\x02\u0151" +
		"\u0152\b&\x05\x02\u0152O\x03\x02\x02\x02\u0153\u0154\x071\x02\x02\u0154" +
		"\u0155\x071\x02\x02\u0155\u0159\x03\x02\x02\x02\u0156\u0158\n\x05\x02" +
		"\x02\u0157\u0156\x03\x02\x02\x02\u0158\u015B\x03\x02\x02\x02\u0159\u0157" +
		"\x03\x02\x02\x02\u0159\u015A\x03\x02\x02\x02\u015A\u015C\x03\x02\x02\x02" +
		"\u015B\u0159\x03\x02\x02\x02\u015C\u015D\b\'\x05\x02\u015DQ\x03\x02\x02" +
		"\x02\u015E\u015F\x05L%\x02\u015F\u0160\x03\x02\x02\x02\u0160\u0161\b(" +
		"\x05\x02\u0161S\x03\x02\x02\x02\u0162\u0164\t\x06\x02\x02\u0163\u0162" +
		"\x03\x02\x02\x02\u0164\u0165\x03\x02\x02\x02\u0165\u0163\x03\x02\x02\x02" +
		"\u0165\u0166\x03\x02\x02\x02\u0166\u0167\x03\x02\x02\x02\u0167\u0168\b" +
		")\x06\x02\u0168\u0169\x03\x02\x02\x02\u0169\u016A\b)\x07\x02\u016AU\x03" +
		"\x02\x02\x02\u016B\u016D\t\x04\x02\x02\u016C\u016B\x03\x02\x02\x02\u016D" +
		"\u016E\x03\x02\x02\x02\u016E\u016C\x03\x02\x02\x02\u016E\u016F\x03\x02" +
		"\x02\x02\u016F\u0170\x03\x02\x02\x02\u0170\u0171\b*\x05\x02\u0171W\x03" +
		"\x02\x02\x02\u0172\u0173\x05L%\x02\u0173\u0174\x03\x02\x02\x02\u0174\u0175" +
		"\b+\x05\x02\u0175Y\x03\x02\x02\x02\u0176\u0177\v\x02\x02\x02\u0177\u0178" +
		"\b,\b\x02\u0178[\x03\x02\x02\x02\u0179\u017B\t\x06\x02\x02\u017A\u0179" +
		"\x03\x02\x02\x02\u017B\u017C\x03\x02\x02\x02\u017C\u017A\x03\x02\x02\x02" +
		"\u017C\u017D\x03\x02\x02\x02\u017D\u017E\x03\x02\x02\x02\u017E\u017F\b" +
		"-\t\x02\u017F\u0180\x03\x02\x02\x02\u0180\u0181\b-\x07\x02\u0181]\x03" +
		"\x02\x02\x02\u0182\u0184\t\x04\x02\x02\u0183\u0182\x03\x02\x02\x02\u0184" +
		"\u0185\x03\x02\x02\x02\u0185\u0183\x03\x02\x02\x02\u0185\u0186\x03\x02" +
		"\x02\x02\u0186\u0187\x03\x02\x02\x02\u0187\u0188\b.\x05\x02\u0188_\x03" +
		"\x02\x02\x02\u0189\u018A\x05L%\x02\u018A\u018B\x03\x02\x02\x02\u018B\u018C" +
		"\b/\x05\x02\u018Ca\x03\x02\x02\x02\u018D\u018E\v\x02\x02\x02\u018E\u018F" +
		"\b0\n\x02\u018Fc\x03\x02\x02\x02\u0190\u0192\t\x06\x02\x02\u0191\u0190" +
		"\x03\x02\x02\x02\u0192\u0193\x03\x02\x02\x02\u0193\u0191\x03\x02\x02\x02" +
		"\u0193\u0194\x03\x02\x02\x02\u0194\u0195\x03\x02\x02\x02\u0195\u0196\b" +
		"1\v\x02\u0196\u0197\x03\x02\x02\x02\u0197\u0198\b1\x07\x02\u0198e\x03" +
		"\x02\x02\x02\u0199\u019B\t\x04\x02\x02\u019A\u0199\x03\x02\x02\x02\u019B" +
		"\u019C\x03\x02\x02\x02\u019C\u019A\x03\x02\x02\x02\u019C\u019D\x03\x02" +
		"\x02\x02\u019D\u019E\x03\x02\x02\x02\u019E\u019F\b2\x05\x02\u019Fg\x03" +
		"\x02\x02\x02\u01A0\u01A1\x05L%\x02\u01A1\u01A2\x03\x02\x02\x02\u01A2\u01A3" +
		"\b3\x05\x02\u01A3i\x03\x02\x02\x02\u01A4\u01A5\v\x02\x02\x02\u01A5\u01A6" +
		"\b4\f\x02\u01A6k\x03\x02\x02\x02\x13\x02\x03\x04\x05\u012B\u0133\u0139" +
		"\u013B\u0146\u014F\u0159\u0165\u016E\u017C\u0185\u0193\u019C\r\x04\x04" +
		"\x02\x04\x05\x02\x04\x03\x02\b\x02\x02\x03)\x02\x04\x02\x02\x03,\x03\x03" +
		"-\x04\x030\x05\x031\x06\x034\x07";
	public static __ATN: ATN;
	public static get _ATN(): ATN {
		if (!CPGLLexer.__ATN) {
			CPGLLexer.__ATN = new ATNDeserializer().deserialize(Utils.toCharArray(CPGLLexer._serializedATN));
		}

		return CPGLLexer.__ATN;
	}

}

