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
	public static readonly SINGLE_QUOTED_STRING = 34;
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
		"QUOTED_STRING", "SINGLE_QUOTED_STRING", "BLOCK_COMMENT", "WS", "COMMENT", 
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
		"RPAREN", "QUOTED_STRING", "SINGLE_QUOTED_STRING", "WS", "COMMENT", "COMMENT_BLOCK", 
		"ACTIVITY_TYPE", "ACTIVITY_WS", "ACTIVITY_COMMENT_BLOCK", "ACTIVITY_ErrorChar", 
		"CONCEPT_TYPE", "CONCEPT_WS", "CONCEPT_COMMENT_BLOCK", "CONCEPT_ErrorChar", 
		"CONCEPT_VALUE_TYPE", "VALUE_TYPE_WS", "VALUE_TYPE_COMMENT_BLOCK", "VALUE_TYPE_ErrorChar",
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
		case 38:
			this.ACTIVITY_TYPE_action(_localctx, actionIndex);
			break;

		case 41:
			this.ACTIVITY_ErrorChar_action(_localctx, actionIndex);
			break;

		case 42:
			this.CONCEPT_TYPE_action(_localctx, actionIndex);
			break;

		case 45:
			this.CONCEPT_ErrorChar_action(_localctx, actionIndex);
			break;

		case 46:
			this.CONCEPT_VALUE_TYPE_action(_localctx, actionIndex);
			break;

		case 49:
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
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x023\u01A0\b\x01" +
		"\b\x01\b\x01\b\x01\x04\x02\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t" +
		"\x05\x04\x06\t\x06\x04\x07\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t" +
		"\v\x04\f\t\f\x04\r\t\r\x04\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11" +
		"\t\x11\x04\x12\t\x12\x04\x13\t\x13\x04\x14\t\x14\x04\x15\t\x15\x04\x16" +
		"\t\x16\x04\x17\t\x17\x04\x18\t\x18\x04\x19\t\x19\x04\x1A\t\x1A\x04\x1B" +
		"\t\x1B\x04\x1C\t\x1C\x04\x1D\t\x1D\x04\x1E\t\x1E\x04\x1F\t\x1F\x04 \t" +
		" \x04!\t!\x04\"\t\"\x04#\t#\x04$\t$\x04%\t%\x04&\t&\x04\'\t\'\x04(\t(" +
		"\x04)\t)\x04*\t*\x04+\t+\x04,\t,\x04-\t-\x04.\t.\x04/\t/\x040\t0\x041" +
		"\t1\x042\t2\x043\t3\x03\x02\x03\x02\x03\x02\x03\x02\x03\x02\x03\x02\x03" +
		"\x02\x03\x02\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03" +
		"\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03" +
		"\x04\x03\x04\x03\x04\x03\x05\x03\x05\x03\x05\x03\x05\x03\x05\x03\x05\x03" +
		"\x05\x03\x05\x03\x05\x03\x05\x03\x05\x03\x05\x03\x06\x03\x06\x03\x06\x03" +
		"\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x07\x03" +
		"\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\b\x03" +
		"\b\x03\b\x03\b\x03\t\x03\t\x03\t\x03\n\x03\n\x03\n\x03\n\x03\v\x03\v\x03" +
		"\v\x03\v\x03\v\x03\f\x03\f\x03\f\x03\f\x03\r\x03\r\x03\r\x03\x0E\x03\x0E" +
		"\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10" +
		"\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x11\x03\x11\x03\x11\x03\x11" +
		"\x03\x11\x03\x11\x03\x11\x03\x11\x03\x11\x03\x12\x03\x12\x03\x12\x03\x13" +
		"\x03\x13\x03\x13\x03\x13\x03\x13\x03\x13\x03\x13\x03\x14\x03\x14\x03\x14" +
		"\x03\x14\x03\x14\x03\x15\x03\x15\x03\x15\x03\x15\x03\x15\x03\x15\x03\x15" +
		"\x03\x15\x03\x16\x03\x16\x03\x16\x03\x17\x03\x17\x03\x17\x03\x17\x03\x18" +
		"\x03\x18\x03\x18\x03\x18\x03\x18\x03\x19\x03\x19\x03\x19\x03\x19\x03\x19" +
		"\x03\x1A\x03\x1A\x03\x1A\x03\x1A\x03\x1B\x03\x1B\x03\x1B\x03\x1B\x03\x1C" +
		"\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x03\x1D" +
		"\x03\x1D\x03\x1D\x03\x1D\x03\x1D\x03\x1D\x03\x1E\x03\x1E\x03\x1F\x03\x1F" +
		"\x03 \x03 \x03!\x03!\x03\"\x03\"\x07\"\u0128\n\"\f\"\x0E\"\u012B\v\"\x03" +
		"\"\x03\"\x03#\x03#\x03#\x03#\x07#\u0133\n#\f#\x0E#\u0136\v#\x03#\x03#" +
		"\x03$\x03$\x03$\x03$\x07$\u013E\n$\f$\x0E$\u0141\v$\x03$\x03$\x03$\x03" +
		"%\x06%\u0147\n%\r%\x0E%\u0148\x03%\x03%\x03&\x03&\x03&\x03&\x07&\u0151" +
		"\n&\f&\x0E&\u0154\v&\x03&\x03&\x03\'\x03\'\x03\'\x03\'\x03(\x06(\u015D" +
		"\n(\r(\x0E(\u015E\x03(\x03(\x03(\x03(\x03)\x06)\u0166\n)\r)\x0E)\u0167" +
		"\x03)\x03)\x03*\x03*\x03*\x03*\x03+\x03+\x03+\x03,\x06,\u0174\n,\r,\x0E" +
		",\u0175\x03,\x03,\x03,\x03,\x03-\x06-\u017D\n-\r-\x0E-\u017E\x03-\x03" +
		"-\x03.\x03.\x03.\x03.\x03/\x03/\x03/\x030\x060\u018B\n0\r0\x0E0\u018C" +
		"\x030\x030\x030\x030\x031\x061\u0194\n1\r1\x0E1\u0195\x031\x031\x032\x03" +
		"2\x032\x032\x033\x033\x033\x03\u013F\x02\x024\x06\x02\x03\b\x02\x04\n" +
		"\x02\x05\f\x02\x06\x0E\x02\x07\x10\x02\b\x12\x02\t\x14\x02\n\x16\x02\v" +
		"\x18\x02\f\x1A\x02\r\x1C\x02\x0E\x1E\x02\x0F \x02\x10\"\x02\x11$\x02\x12" +
		"&\x02\x13(\x02\x14*\x02\x15,\x02\x16.\x02\x170\x02\x182\x02\x194\x02\x1A" +
		"6\x02\x1B8\x02\x1C:\x02\x1D<\x02\x1E>\x02\x1F@\x02 B\x02!D\x02\"F\x02" +
		"#H\x02$J\x02\x02L\x02%N\x02&P\x02\'R\x02(T\x02)V\x02*X\x02+Z\x02,\\\x02" +
		"-^\x02.`\x02/b\x020d\x021f\x022h\x023\x06\x02\x03\x04\x05\x07\x06\x02" +
		"\f\f\x0F\x0F$$^^\x04\x02))^^\x05\x02\v\f\x0F\x0F\"\"\x04\x02\f\f\x0F\x0F" +
		"\x04\x02C\\c|\x02\u01A7\x02\x06\x03\x02\x02\x02\x02\b\x03\x02\x02\x02" +
		"\x02\n\x03\x02\x02\x02\x02\f\x03\x02\x02\x02\x02\x0E\x03\x02\x02\x02\x02" +
		"\x10\x03\x02\x02\x02\x02\x12\x03\x02\x02\x02\x02\x14\x03\x02\x02\x02\x02" +
		"\x16\x03\x02\x02\x02\x02\x18\x03\x02\x02\x02\x02\x1A\x03\x02\x02\x02\x02" +
		"\x1C\x03\x02\x02\x02\x02\x1E\x03\x02\x02\x02\x02 \x03\x02\x02\x02\x02" +
		"\"\x03\x02\x02\x02\x02$\x03\x02\x02\x02\x02&\x03\x02\x02\x02\x02(\x03" +
		"\x02\x02\x02\x02*\x03\x02\x02\x02\x02,\x03\x02\x02\x02\x02.\x03\x02\x02" +
		"\x02\x020\x03\x02\x02\x02\x022\x03\x02\x02\x02\x024\x03\x02\x02\x02\x02" +
		"6\x03\x02\x02\x02\x028\x03\x02\x02\x02\x02:\x03\x02\x02\x02\x02<\x03\x02" +
		"\x02\x02\x02>\x03\x02\x02\x02\x02@\x03\x02\x02\x02\x02B\x03\x02\x02\x02" +
		"\x02D\x03\x02\x02\x02\x02F\x03\x02\x02\x02\x02H\x03\x02\x02\x02\x02L\x03" +
		"\x02\x02\x02\x02N\x03\x02\x02\x02\x02P\x03\x02\x02\x02\x03R\x03\x02\x02" +
		"\x02\x03T\x03\x02\x02\x02\x03V\x03\x02\x02\x02\x03X\x03\x02\x02\x02\x04" +
		"Z\x03\x02\x02\x02\x04\\\x03\x02\x02\x02\x04^\x03\x02\x02\x02\x04`\x03" +
		"\x02\x02\x02\x05b\x03\x02\x02\x02\x05d\x03\x02\x02\x02\x05f\x03\x02\x02" +
		"\x02\x05h\x03\x02\x02\x02\x06j\x03\x02\x02\x02\br\x03\x02\x02\x02\ny\x03" +
		"\x02\x02\x02\f\x85\x03\x02\x02\x02\x0E\x91\x03\x02\x02\x02\x10\x9C\x03" +
		"\x02\x02\x02\x12\xA5\x03\x02\x02\x02\x14\xA9\x03\x02\x02\x02\x16\xAC\x03" +
		"\x02\x02\x02\x18\xB0\x03\x02\x02\x02\x1A\xB5\x03\x02\x02\x02\x1C\xB9\x03" +
		"\x02\x02\x02\x1E\xBC\x03\x02\x02\x02 \xC2\x03\x02\x02\x02\"\xCB\x03\x02" +
		"\x02\x02$\xD5\x03\x02\x02\x02&\xDE\x03\x02\x02\x02(\xE1\x03\x02\x02\x02" +
		"*\xE8\x03\x02\x02\x02,\xED\x03\x02\x02\x02.\xF5\x03\x02\x02\x020\xF8\x03" +
		"\x02\x02\x022\xFC\x03\x02\x02\x024\u0101\x03\x02\x02\x026\u0106\x03\x02" +
		"\x02\x028\u010A\x03\x02\x02\x02:\u010E\x03\x02\x02\x02<\u0117\x03\x02" +
		"\x02\x02>\u011D\x03\x02\x02\x02@\u011F\x03\x02\x02\x02B\u0121\x03\x02" +
		"\x02\x02D\u0123\x03\x02\x02\x02F\u0125\x03\x02\x02\x02H\u012E\x03\x02" +
		"\x02\x02J\u0139\x03\x02\x02\x02L\u0146\x03\x02\x02\x02N\u014C\x03\x02" +
		"\x02\x02P\u0157\x03\x02\x02\x02R\u015C\x03\x02\x02\x02T\u0165\x03\x02" +
		"\x02\x02V\u016B\x03\x02\x02\x02X\u016F\x03\x02\x02\x02Z\u0173\x03\x02" +
		"\x02\x02\\\u017C\x03\x02\x02\x02^\u0182\x03\x02\x02\x02`\u0186\x03\x02" +
		"\x02\x02b\u018A\x03\x02\x02\x02d\u0193\x03\x02\x02\x02f\u0199\x03\x02" +
		"\x02\x02h\u019D\x03\x02\x02\x02jk\x07e\x02\x02kl\x07q\x02\x02lm\x07p\x02" +
		"\x02mn\x07e\x02\x02no\x07g\x02\x02op\x07r\x02\x02pq\x07v\x02\x02q\x07" +
		"\x03\x02\x02\x02rs\x07v\x02\x02st\x07{\x02\x02tu\x07r\x02\x02uv\x07g\x02" +
		"\x02vw\x03\x02\x02\x02wx\b\x03\x02\x02x\t\x03\x02\x02\x02yz\x07x\x02\x02" +
		"z{\x07c\x02\x02{|\x07n\x02\x02|}\x07w\x02\x02}~\x07g\x02\x02~\x7F\x07" +
		"v\x02\x02\x7F\x80\x07{\x02\x02\x80\x81\x07r\x02\x02\x81\x82\x07g\x02\x02" +
		"\x82\x83\x03\x02\x02\x02\x83\x84\b\x04\x03\x02\x84\v\x03\x02\x02\x02\x85" +
		"\x86\x07v\x02\x02\x86\x87\x07g\x02\x02\x87\x88\x07t\x02\x02\x88\x89\x07" +
		"o\x02\x02\x89\x8A\x07k\x02\x02\x8A\x8B\x07p\x02\x02\x8B\x8C\x07q\x02\x02" +
		"\x8C\x8D\x07n\x02\x02\x8D\x8E\x07q\x02\x02\x8E\x8F\x07i\x02\x02\x8F\x90" +
		"\x07{\x02\x02\x90\r\x03\x02\x02\x02\x91\x92\x07r\x02\x02\x92\x93\x07t" +
		"\x02\x02\x93\x94\x07q\x02\x02\x94\x95\x07x\x02\x02\x95\x96\x07g\x02\x02" +
		"\x96\x97\x07p\x02\x02\x97\x98\x07c\x02\x02\x98\x99\x07p\x02\x02\x99\x9A" +
		"\x07e\x02\x02\x9A\x9B\x07g\x02\x02\x9B\x0F\x03\x02\x02\x02\x9C\x9D\x07" +
		"k\x02\x02\x9D\x9E\x07p\x02\x02\x9E\x9F\x07h\x02\x02\x9F\xA0\x07g\x02\x02" +
		"\xA0\xA1\x07t\x02\x02\xA1\xA2\x07t\x02\x02\xA2\xA3\x07g\x02\x02\xA3\xA4" +
		"\x07f\x02\x02\xA4\x11\x03\x02\x02\x02\xA5\xA6\x07c\x02\x02\xA6\xA7\x07" +
		"p\x02\x02\xA7\xA8\x07f\x02\x02\xA8\x13\x03\x02\x02\x02\xA9\xAA\x07q\x02" +
		"\x02\xAA\xAB\x07t\x02\x02\xAB\x15\x03\x02\x02\x02\xAC\xAD\x07p\x02\x02" +
		"\xAD\xAE\x07q\x02\x02\xAE\xAF\x07v\x02\x02\xAF\x17\x03\x02\x02\x02\xB0" +
		"\xB1\x07f\x02\x02\xB1\xB2\x07q\x02\x02\xB2\xB3\x07p\x02\x02\xB3\xB4\x07" +
		"g\x02\x02\xB4\x19\x03\x02\x02\x02\xB5\xB6\x07j\x02\x02\xB6\xB7\x07c\x02" +
		"\x02\xB7\xB8\x07u\x02\x02\xB8\x1B\x03\x02\x02\x02\xB9\xBA\x07d\x02\x02" +
		"\xBA\xBB\x07{\x02\x02\xBB\x1D\x03\x02\x02\x02\xBC\xBD\x07e\x02\x02\xBD" +
		"\xBE\x07q\x02\x02\xBE\xBF\x07f\x02\x02\xBF\xC0\x07g\x02\x02\xC0\xC1\x07" +
		"f\x02\x02\xC1\x1F\x03\x02\x02\x02\xC2\xC3\x07x\x02\x02\xC3\xC4\x07c\x02" +
		"\x02\xC4\xC5\x07n\x02\x02\xC5\xC6\x07w\x02\x02\xC6\xC7\x07g\x02\x02\xC7" +
		"\xC8\x07u\x02\x02\xC8\xC9\x07g\x02\x02\xC9\xCA\x07v\x02\x02\xCA!\x03\x02" +
		"\x02\x02\xCB\xCC\x07r\x02\x02\xCC\xCD\x07g\x02\x02\xCD\xCE\x07t\x02\x02" +
		"\xCE\xCF\x07h\x02\x02\xCF\xD0\x07q\x02\x02\xD0\xD1\x07t\x02\x02\xD1\xD2" +
		"\x07o\x02\x02\xD2\xD3\x03\x02\x02\x02\xD3\xD4\b\x10\x04\x02\xD4#\x03\x02" +
		"\x02\x02\xD5\xD6\x07c\x02\x02\xD6\xD7\x07e\x02\x02\xD7\xD8\x07v\x02\x02" +
		"\xD8\xD9\x07k\x02\x02\xD9\xDA\x07x\x02\x02\xDA\xDB\x07k\x02\x02\xDB\xDC" +
		"\x07v\x02\x02\xDC\xDD\x07{\x02\x02\xDD%\x03\x02\x02\x02\xDE\xDF\x07q\x02" +
		"\x02\xDF\xE0\x07h\x02\x02\xE0\'\x03\x02\x02\x02\xE1\xE2\x07u\x02\x02\xE2" +
		"\xE3\x07{\x02\x02\xE3\xE4\x07u\x02\x02\xE4\xE5\x07v\x02\x02\xE5\xE6\x07" +
		"g\x02\x02\xE6\xE7\x07o\x02\x02\xE7)\x03\x02\x02\x02\xE8\xE9\x07e\x02\x02" +
		"\xE9\xEA\x07q\x02\x02\xEA\xEB\x07f\x02\x02\xEB\xEC\x07g\x02\x02\xEC+\x03" +
		"\x02\x02\x02\xED\xEE\x07w\x02\x02\xEE\xEF\x07p\x02\x02\xEF\xF0\x07m\x02" +
		"\x02\xF0\xF1\x07p\x02\x02\xF1\xF2\x07q\x02\x02\xF2\xF3\x07y\x02\x02\xF3" +
		"\xF4\x07p\x02\x02\xF4-\x03\x02\x02\x02\xF5\xF6\x07f\x02\x02\xF6\xF7\x07" +
		"q\x02\x02\xF7/\x03\x02\x02\x02\xF8\xF9\x07w\x02\x02\xF9\xFA\x07u\x02\x02" +
		"\xFA\xFB\x07g\x02\x02\xFB1\x03\x02\x02\x02\xFC\xFD\x07y\x02\x02\xFD\xFE" +
		"\x07j\x02\x02\xFE\xFF\x07g\x02\x02\xFF\u0100\x07p\x02\x02\u01003\x03\x02" +
		"\x02\x02\u0101\u0102\x07v\x02\x02\u0102\u0103\x07j\x02\x02\u0103\u0104" +
		"\x07g\x02\x02\u0104\u0105\x07p\x02\x02\u01055\x03\x02\x02\x02\u0106\u0107" +
		"\x07c\x02\x02\u0107\u0108\x07p\x02\x02\u0108\u0109\x07{\x02\x02\u0109" +
		"7\x03\x02\x02\x02\u010A\u010B\x07c\x02\x02\u010B\u010C\x07n\x02\x02\u010C" +
		"\u010D\x07n\x02\x02\u010D9\x03\x02\x02\x02\u010E\u010F\x07f\x02\x02\u010F" +
		"\u0110\x07g\x02\x02\u0110\u0111\x07e\x02\x02\u0111\u0112\x07k\x02\x02" +
		"\u0112\u0113\x07u\x02\x02\u0113\u0114\x07k\x02\x02\u0114\u0115\x07q\x02" +
		"\x02\u0115\u0116\x07p\x02\x02\u0116;\x03\x02\x02\x02\u0117\u0118\x07g" +
		"\x02\x02\u0118\u0119\x07t\x02\x02\u0119\u011A\x07t\x02\x02\u011A\u011B" +
		"\x07q\x02\x02\u011B\u011C\x07t\x02\x02\u011C=\x03\x02\x02\x02\u011D\u011E" +
		"\x07<\x02\x02\u011E?\x03\x02\x02\x02\u011F\u0120\x070\x02\x02\u0120A\x03" +
		"\x02\x02\x02\u0121\u0122\x07*\x02\x02\u0122C\x03\x02\x02\x02\u0123\u0124" +
		"\x07+\x02\x02\u0124E\x03\x02\x02\x02\u0125\u0129\x07$\x02\x02\u0126\u0128" +
		"\n\x02\x02\x02\u0127\u0126\x03\x02\x02\x02\u0128\u012B\x03\x02\x02\x02" +
		"\u0129\u0127\x03\x02\x02\x02\u0129\u012A\x03\x02\x02\x02\u012A\u012C\x03" +
		"\x02\x02\x02\u012B\u0129\x03\x02\x02\x02\u012C\u012D\x07$\x02\x02\u012D" +
		"G\x03\x02\x02\x02\u012E\u0134\x07)\x02\x02\u012F\u0133\n\x03\x02\x02\u0130" +
		"\u0131\x07^\x02\x02\u0131\u0133\v\x02\x02\x02\u0132\u012F\x03\x02\x02" +
		"\x02\u0132\u0130\x03\x02\x02\x02\u0133\u0136\x03\x02\x02\x02\u0134\u0132" +
		"\x03\x02\x02\x02\u0134\u0135\x03\x02\x02\x02\u0135\u0137\x03\x02\x02\x02" +
		"\u0136\u0134\x03\x02\x02\x02\u0137\u0138\x07)\x02\x02\u0138I\x03\x02\x02" +
		"\x02\u0139\u013A\x071\x02\x02\u013A\u013B\x07,\x02\x02\u013B\u013F\x03" +
		"\x02\x02\x02\u013C\u013E\v\x02\x02\x02\u013D\u013C\x03\x02\x02\x02\u013E" +
		"\u0141\x03\x02\x02\x02\u013F\u0140\x03\x02\x02\x02\u013F\u013D\x03\x02" +
		"\x02\x02\u0140\u0142\x03\x02\x02\x02\u0141\u013F\x03\x02\x02\x02\u0142" +
		"\u0143\x07,\x02\x02\u0143\u0144\x071\x02\x02\u0144K\x03\x02\x02\x02\u0145" +
		"\u0147\t\x04\x02\x02\u0146\u0145\x03\x02\x02\x02\u0147\u0148\x03\x02\x02" +
		"\x02\u0148\u0146\x03\x02\x02\x02\u0148\u0149\x03\x02\x02\x02\u0149\u014A" +
		"\x03\x02\x02\x02\u014A\u014B\b%\x05\x02\u014BM\x03\x02\x02\x02\u014C\u014D" +
		"\x071\x02\x02\u014D\u014E\x071\x02\x02\u014E\u0152\x03\x02\x02\x02\u014F" +
		"\u0151\n\x05\x02\x02\u0150\u014F\x03\x02\x02\x02\u0151\u0154\x03\x02\x02" +
		"\x02\u0152\u0150\x03\x02\x02\x02\u0152\u0153\x03\x02\x02\x02\u0153\u0155" +
		"\x03\x02\x02\x02\u0154\u0152\x03\x02\x02\x02\u0155\u0156\b&\x05\x02\u0156" +
		"O\x03\x02\x02\x02\u0157\u0158\x05J$\x02\u0158\u0159\x03\x02\x02\x02\u0159" +
		"\u015A\b\'\x05\x02\u015AQ\x03\x02\x02\x02\u015B\u015D\t\x06\x02\x02\u015C" +
		"\u015B\x03\x02\x02\x02\u015D\u015E\x03\x02\x02\x02\u015E\u015C\x03\x02" +
		"\x02\x02\u015E\u015F\x03\x02\x02\x02\u015F\u0160\x03\x02\x02\x02\u0160" +
		"\u0161\b(\x06\x02\u0161\u0162\x03\x02\x02\x02\u0162\u0163\b(\x07\x02\u0163" +
		"S\x03\x02\x02\x02\u0164\u0166\t\x04\x02\x02\u0165\u0164\x03\x02\x02\x02" +
		"\u0166\u0167\x03\x02\x02\x02\u0167\u0165\x03\x02\x02\x02\u0167\u0168\x03" +
		"\x02\x02\x02\u0168\u0169\x03\x02\x02\x02\u0169\u016A\b)\x05\x02\u016A" +
		"U\x03\x02\x02\x02\u016B\u016C\x05J$\x02\u016C\u016D\x03\x02\x02\x02\u016D" +
		"\u016E\b*\x05\x02\u016EW\x03\x02\x02\x02\u016F\u0170\v\x02\x02\x02\u0170" +
		"\u0171\b+\b\x02\u0171Y\x03\x02\x02\x02\u0172\u0174\t\x06\x02\x02\u0173" +
		"\u0172\x03\x02\x02\x02\u0174\u0175\x03\x02\x02\x02\u0175\u0173\x03\x02" +
		"\x02\x02\u0175\u0176\x03\x02\x02\x02\u0176\u0177\x03\x02\x02\x02\u0177" +
		"\u0178\b,\t\x02\u0178\u0179\x03\x02\x02\x02\u0179\u017A\b,\x07\x02\u017A" +
		"[\x03\x02\x02\x02\u017B\u017D\t\x04\x02\x02\u017C\u017B\x03\x02\x02\x02" +
		"\u017D\u017E\x03\x02\x02\x02\u017E\u017C\x03\x02\x02\x02\u017E\u017F\x03" +
		"\x02\x02\x02\u017F\u0180\x03\x02\x02\x02\u0180\u0181\b-\x05\x02\u0181" +
		"]\x03\x02\x02\x02\u0182\u0183\x05J$\x02\u0183\u0184\x03\x02\x02\x02\u0184" +
		"\u0185\b.\x05\x02\u0185_\x03\x02\x02\x02\u0186\u0187\v\x02\x02\x02\u0187" +
		"\u0188\b/\n\x02\u0188a\x03\x02\x02\x02\u0189\u018B\t\x06\x02\x02\u018A" +
		"\u0189\x03\x02\x02\x02\u018B\u018C\x03\x02\x02\x02\u018C\u018A\x03\x02" +
		"\x02\x02\u018C\u018D\x03\x02\x02\x02\u018D\u018E\x03\x02\x02\x02\u018E" +
		"\u018F\b0\v\x02\u018F\u0190\x03\x02\x02\x02\u0190\u0191\b0\x07\x02\u0191" +
		"c\x03\x02\x02\x02\u0192\u0194\t\x04\x02\x02\u0193\u0192\x03\x02\x02\x02" +
		"\u0194\u0195\x03\x02\x02\x02\u0195\u0193\x03\x02\x02\x02\u0195\u0196\x03" +
		"\x02\x02\x02\u0196\u0197\x03\x02\x02\x02\u0197\u0198\b1\x05\x02\u0198" +
		"e\x03\x02\x02\x02\u0199\u019A\x05J$\x02\u019A\u019B\x03\x02\x02\x02\u019B" +
		"\u019C\b2\x05\x02\u019Cg\x03\x02\x02\x02\u019D\u019E\v\x02\x02\x02\u019E" +
		"\u019F\b3\f\x02\u019Fi\x03\x02\x02\x02\x12\x02\x03\x04\x05\u0129\u0132" +
		"\u0134\u013F\u0148\u0152\u015E\u0167\u0175\u017E\u018C\u0195\r\x04\x04" +
		"\x02\x04\x05\x02\x04\x03\x02\b\x02\x02\x03(\x02\x04\x02\x02\x03+\x03\x03" +
		",\x04\x03/\x05\x030\x06\x033\x07";
	public static __ATN: ATN;
	public static get _ATN(): ATN {
		if (!CPGLLexer.__ATN) {
			CPGLLexer.__ATN = new ATNDeserializer().deserialize(Utils.toCharArray(CPGLLexer._serializedATN));
		}

		return CPGLLexer.__ATN;
	}

}

