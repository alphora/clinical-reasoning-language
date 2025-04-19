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
	public static readonly BECAUSE = 28;
	public static readonly ERROR = 29;
	public static readonly COLON = 30;
	public static readonly DOT = 31;
	public static readonly LPAREN = 32;
	public static readonly RPAREN = 33;
	public static readonly QUOTED_STRING = 34;
	public static readonly BACKTICK_STRING = 35;
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
		"ANY", "ALL", "DECISION", "BECAUSE", "ERROR", "COLON", "DOT", "LPAREN", 
		"RPAREN", "QUOTED_STRING", "BACKTICK_STRING", "BLOCK_COMMENT", "WS", "COMMENT", 
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
		"'because'", "'error'", "':'", "'.'", "'('", "')'",
	];
	private static readonly _SYMBOLIC_NAMES: Array<string | undefined> = [
		undefined, "CONCEPT", "TYPE", "VALUETYPE", "TERMINOLOGY", "PROVENANCE", 
		"INFERRED", "AND", "OR", "NOT", "DONE", "HAS", "BY", "CODED", "VALUESET", 
		"PERFORM", "ACTIVITY", "OF", "SYSTEM", "CODE", "UNKNOWN", "DO", "USE", 
		"WHEN", "THEN", "ANY", "ALL", "DECISION", "BECAUSE", "ERROR", "COLON", 
		"DOT", "LPAREN", "RPAREN", "QUOTED_STRING", "BACKTICK_STRING", "WS", "COMMENT", 
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
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x024\u01AA\b\x01" +
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
		"\x03\x1D\x03\x1D\x03\x1D\x03\x1D\x03\x1D\x03\x1D\x03\x1D\x03\x1D\x03\x1E" +
		"\x03\x1E\x03\x1E\x03\x1E\x03\x1E\x03\x1E\x03\x1F\x03\x1F\x03 \x03 \x03" +
		"!\x03!\x03\"\x03\"\x03#\x03#\x07#\u0132\n#\f#\x0E#\u0135\v#\x03#\x03#" +
		"\x03$\x03$\x03$\x03$\x07$\u013D\n$\f$\x0E$\u0140\v$\x03$\x03$\x03%\x03" +
		"%\x03%\x03%\x07%\u0148\n%\f%\x0E%\u014B\v%\x03%\x03%\x03%\x03&\x06&\u0151" +
		"\n&\r&\x0E&\u0152\x03&\x03&\x03\'\x03\'\x03\'\x03\'\x07\'\u015B\n\'\f" +
		"\'\x0E\'\u015E\v\'\x03\'\x03\'\x03(\x03(\x03(\x03(\x03)\x06)\u0167\n)" +
		"\r)\x0E)\u0168\x03)\x03)\x03)\x03)\x03*\x06*\u0170\n*\r*\x0E*\u0171\x03" +
		"*\x03*\x03+\x03+\x03+\x03+\x03,\x03,\x03,\x03-\x06-\u017E\n-\r-\x0E-\u017F" +
		"\x03-\x03-\x03-\x03-\x03.\x06.\u0187\n.\r.\x0E.\u0188\x03.\x03.\x03/\x03" +
		"/\x03/\x03/\x030\x030\x030\x031\x061\u0195\n1\r1\x0E1\u0196\x031\x031" +
		"\x031\x031\x032\x062\u019E\n2\r2\x0E2\u019F\x032\x032\x033\x033\x033\x03" +
		"3\x034\x034\x034\x03\u0149\x02\x025\x06\x02\x03\b\x02\x04\n\x02\x05\f" +
		"\x02\x06\x0E\x02\x07\x10\x02\b\x12\x02\t\x14\x02\n\x16\x02\v\x18\x02\f" +
		"\x1A\x02\r\x1C\x02\x0E\x1E\x02\x0F \x02\x10\"\x02\x11$\x02\x12&\x02\x13" +
		"(\x02\x14*\x02\x15,\x02\x16.\x02\x170\x02\x182\x02\x194\x02\x1A6\x02\x1B" +
		"8\x02\x1C:\x02\x1D<\x02\x1E>\x02\x1F@\x02 B\x02!D\x02\"F\x02#H\x02$J\x02" +
		"%L\x02\x02N\x02&P\x02\'R\x02(T\x02)V\x02*X\x02+Z\x02,\\\x02-^\x02.`\x02" +
		"/b\x020d\x021f\x022h\x023j\x024\x06\x02\x03\x04\x05\x07\x06\x02\f\f\x0F" +
		"\x0F$$^^\x04\x02^^bb\x05\x02\v\f\x0F\x0F\"\"\x04\x02\f\f\x0F\x0F\x04\x02" +
		"C\\c|\x02\u01B1\x02\x06\x03\x02\x02\x02\x02\b\x03\x02\x02\x02\x02\n\x03" +
		"\x02\x02\x02\x02\f\x03\x02\x02\x02\x02\x0E\x03\x02\x02\x02\x02\x10\x03" +
		"\x02\x02\x02\x02\x12\x03\x02\x02\x02\x02\x14\x03\x02\x02\x02\x02\x16\x03" +
		"\x02\x02\x02\x02\x18\x03\x02\x02\x02\x02\x1A\x03\x02\x02\x02\x02\x1C\x03" +
		"\x02\x02\x02\x02\x1E\x03\x02\x02\x02\x02 \x03\x02\x02\x02\x02\"\x03\x02" +
		"\x02\x02\x02$\x03\x02\x02\x02\x02&\x03\x02\x02\x02\x02(\x03\x02\x02\x02" +
		"\x02*\x03\x02\x02\x02\x02,\x03\x02\x02\x02\x02.\x03\x02\x02\x02\x020\x03" +
		"\x02\x02\x02\x022\x03\x02\x02\x02\x024\x03\x02\x02\x02\x026\x03\x02\x02" +
		"\x02\x028\x03\x02\x02\x02\x02:\x03\x02\x02\x02\x02<\x03\x02\x02\x02\x02" +
		">\x03\x02\x02\x02\x02@\x03\x02\x02\x02\x02B\x03\x02\x02\x02\x02D\x03\x02" +
		"\x02\x02\x02F\x03\x02\x02\x02\x02H\x03\x02\x02\x02\x02J\x03\x02\x02\x02" +
		"\x02N\x03\x02\x02\x02\x02P\x03\x02\x02\x02\x02R\x03\x02\x02\x02\x03T\x03" +
		"\x02\x02\x02\x03V\x03\x02\x02\x02\x03X\x03\x02\x02\x02\x03Z\x03\x02\x02" +
		"\x02\x04\\\x03\x02\x02\x02\x04^\x03\x02\x02\x02\x04`\x03\x02\x02\x02\x04" +
		"b\x03\x02\x02\x02\x05d\x03\x02\x02\x02\x05f\x03\x02\x02\x02\x05h\x03\x02" +
		"\x02\x02\x05j\x03\x02\x02\x02\x06l\x03\x02\x02\x02\bt\x03\x02\x02\x02" +
		"\n{\x03\x02\x02\x02\f\x87\x03\x02\x02\x02\x0E\x93\x03\x02\x02\x02\x10" +
		"\x9E\x03\x02\x02\x02\x12\xA7\x03\x02\x02\x02\x14\xAB\x03\x02\x02\x02\x16" +
		"\xAE\x03\x02\x02\x02\x18\xB2\x03\x02\x02\x02\x1A\xB7\x03\x02\x02\x02\x1C" +
		"\xBB\x03\x02\x02\x02\x1E\xBE\x03\x02\x02\x02 \xC4\x03\x02\x02\x02\"\xCD" +
		"\x03\x02\x02\x02$\xD7\x03\x02\x02\x02&\xE0\x03\x02\x02\x02(\xE3\x03\x02" +
		"\x02\x02*\xEA\x03\x02\x02\x02,\xEF\x03\x02\x02\x02.\xF7\x03\x02\x02\x02" +
		"0\xFA\x03\x02\x02\x022\xFE\x03\x02\x02\x024\u0103\x03\x02\x02\x026\u0108" +
		"\x03\x02\x02\x028\u010C\x03\x02\x02\x02:\u0110\x03\x02\x02\x02<\u0119" +
		"\x03\x02\x02\x02>\u0121\x03\x02\x02\x02@\u0127\x03\x02\x02\x02B\u0129" +
		"\x03\x02\x02\x02D\u012B\x03\x02\x02\x02F\u012D\x03\x02\x02\x02H\u012F" +
		"\x03\x02\x02\x02J\u0138\x03\x02\x02\x02L\u0143\x03\x02\x02\x02N\u0150" +
		"\x03\x02\x02\x02P\u0156\x03\x02\x02\x02R\u0161\x03\x02\x02\x02T\u0166" +
		"\x03\x02\x02\x02V\u016F\x03\x02\x02\x02X\u0175\x03\x02\x02\x02Z\u0179" +
		"\x03\x02\x02\x02\\\u017D\x03\x02\x02\x02^\u0186\x03\x02\x02\x02`\u018C" +
		"\x03\x02\x02\x02b\u0190\x03\x02\x02\x02d\u0194\x03\x02\x02\x02f\u019D" +
		"\x03\x02\x02\x02h\u01A3\x03\x02\x02\x02j\u01A7\x03\x02\x02\x02lm\x07e" +
		"\x02\x02mn\x07q\x02\x02no\x07p\x02\x02op\x07e\x02\x02pq\x07g\x02\x02q" +
		"r\x07r\x02\x02rs\x07v\x02\x02s\x07\x03\x02\x02\x02tu\x07v\x02\x02uv\x07" +
		"{\x02\x02vw\x07r\x02\x02wx\x07g\x02\x02xy\x03\x02\x02\x02yz\b\x03\x02" +
		"\x02z\t\x03\x02\x02\x02{|\x07x\x02\x02|}\x07c\x02\x02}~\x07n\x02\x02~" +
		"\x7F\x07w\x02\x02\x7F\x80\x07g\x02\x02\x80\x81\x07v\x02\x02\x81\x82\x07" +
		"{\x02\x02\x82\x83\x07r\x02\x02\x83\x84\x07g\x02\x02\x84\x85\x03\x02\x02" +
		"\x02\x85\x86\b\x04\x03\x02\x86\v\x03\x02\x02\x02\x87\x88\x07v\x02\x02" +
		"\x88\x89\x07g\x02\x02\x89\x8A\x07t\x02\x02\x8A\x8B\x07o\x02\x02\x8B\x8C" +
		"\x07k\x02\x02\x8C\x8D\x07p\x02\x02\x8D\x8E\x07q\x02\x02\x8E\x8F\x07n\x02" +
		"\x02\x8F\x90\x07q\x02\x02\x90\x91\x07i\x02\x02\x91\x92\x07{\x02\x02\x92" +
		"\r\x03\x02\x02\x02\x93\x94\x07r\x02\x02\x94\x95\x07t\x02\x02\x95\x96\x07" +
		"q\x02\x02\x96\x97\x07x\x02\x02\x97\x98\x07g\x02\x02\x98\x99\x07p\x02\x02" +
		"\x99\x9A\x07c\x02\x02\x9A\x9B\x07p\x02\x02\x9B\x9C\x07e\x02\x02\x9C\x9D" +
		"\x07g\x02\x02\x9D\x0F\x03\x02\x02\x02\x9E\x9F\x07k\x02\x02\x9F\xA0\x07" +
		"p\x02\x02\xA0\xA1\x07h\x02\x02\xA1\xA2\x07g\x02\x02\xA2\xA3\x07t\x02\x02" +
		"\xA3\xA4\x07t\x02\x02\xA4\xA5\x07g\x02\x02\xA5\xA6\x07f\x02\x02\xA6\x11" +
		"\x03\x02\x02\x02\xA7\xA8\x07c\x02\x02\xA8\xA9\x07p\x02\x02\xA9\xAA\x07" +
		"f\x02\x02\xAA\x13\x03\x02\x02\x02\xAB\xAC\x07q\x02\x02\xAC\xAD\x07t\x02" +
		"\x02\xAD\x15\x03\x02\x02\x02\xAE\xAF\x07p\x02\x02\xAF\xB0\x07q\x02\x02" +
		"\xB0\xB1\x07v\x02\x02\xB1\x17\x03\x02\x02\x02\xB2\xB3\x07f\x02\x02\xB3" +
		"\xB4\x07q\x02\x02\xB4\xB5\x07p\x02\x02\xB5\xB6\x07g\x02\x02\xB6\x19\x03" +
		"\x02\x02\x02\xB7\xB8\x07j\x02\x02\xB8\xB9\x07c\x02\x02\xB9\xBA\x07u\x02" +
		"\x02\xBA\x1B\x03\x02\x02\x02\xBB\xBC\x07d\x02\x02\xBC\xBD\x07{\x02\x02" +
		"\xBD\x1D\x03\x02\x02\x02\xBE\xBF\x07e\x02\x02\xBF\xC0\x07q\x02\x02\xC0" +
		"\xC1\x07f\x02\x02\xC1\xC2\x07g\x02\x02\xC2\xC3\x07f\x02\x02\xC3\x1F\x03" +
		"\x02\x02\x02\xC4\xC5\x07x\x02\x02\xC5\xC6\x07c\x02\x02\xC6\xC7\x07n\x02" +
		"\x02\xC7\xC8\x07w\x02\x02\xC8\xC9\x07g\x02\x02\xC9\xCA\x07u\x02\x02\xCA" +
		"\xCB\x07g\x02\x02\xCB\xCC\x07v\x02\x02\xCC!\x03\x02\x02\x02\xCD\xCE\x07" +
		"r\x02\x02\xCE\xCF\x07g\x02\x02\xCF\xD0\x07t\x02\x02\xD0\xD1\x07h\x02\x02" +
		"\xD1\xD2\x07q\x02\x02\xD2\xD3\x07t\x02\x02\xD3\xD4\x07o\x02\x02\xD4\xD5" +
		"\x03\x02\x02\x02\xD5\xD6\b\x10\x04\x02\xD6#\x03\x02\x02\x02\xD7\xD8\x07" +
		"c\x02\x02\xD8\xD9\x07e\x02\x02\xD9\xDA\x07v\x02\x02\xDA\xDB\x07k\x02\x02" +
		"\xDB\xDC\x07x\x02\x02\xDC\xDD\x07k\x02\x02\xDD\xDE\x07v\x02\x02\xDE\xDF" +
		"\x07{\x02\x02\xDF%\x03\x02\x02\x02\xE0\xE1\x07q\x02\x02\xE1\xE2\x07h\x02" +
		"\x02\xE2\'\x03\x02\x02\x02\xE3\xE4\x07u\x02\x02\xE4\xE5\x07{\x02\x02\xE5" +
		"\xE6\x07u\x02\x02\xE6\xE7\x07v\x02\x02\xE7\xE8\x07g\x02\x02\xE8\xE9\x07" +
		"o\x02\x02\xE9)\x03\x02\x02\x02\xEA\xEB\x07e\x02\x02\xEB\xEC\x07q\x02\x02" +
		"\xEC\xED\x07f\x02\x02\xED\xEE\x07g\x02\x02\xEE+\x03\x02\x02\x02\xEF\xF0" +
		"\x07w\x02\x02\xF0\xF1\x07p\x02\x02\xF1\xF2\x07m\x02\x02\xF2\xF3\x07p\x02" +
		"\x02\xF3\xF4\x07q\x02\x02\xF4\xF5\x07y\x02\x02\xF5\xF6\x07p\x02\x02\xF6" +
		"-\x03\x02\x02\x02\xF7\xF8\x07f\x02\x02\xF8\xF9\x07q\x02\x02\xF9/\x03\x02" +
		"\x02\x02\xFA\xFB\x07w\x02\x02\xFB\xFC\x07u\x02\x02\xFC\xFD\x07g\x02\x02" +
		"\xFD1\x03\x02\x02\x02\xFE\xFF\x07y\x02\x02\xFF\u0100\x07j\x02\x02\u0100" +
		"\u0101\x07g\x02\x02\u0101\u0102\x07p\x02\x02\u01023\x03\x02\x02\x02\u0103" +
		"\u0104\x07v\x02\x02\u0104\u0105\x07j\x02\x02\u0105\u0106\x07g\x02\x02" +
		"\u0106\u0107\x07p\x02\x02\u01075\x03\x02\x02\x02\u0108\u0109\x07c\x02" +
		"\x02\u0109\u010A\x07p\x02\x02\u010A\u010B\x07{\x02\x02\u010B7\x03\x02" +
		"\x02\x02\u010C\u010D\x07c\x02\x02\u010D\u010E\x07n\x02\x02\u010E\u010F" +
		"\x07n\x02\x02\u010F9\x03\x02\x02\x02\u0110\u0111\x07f\x02\x02\u0111\u0112" +
		"\x07g\x02\x02\u0112\u0113\x07e\x02\x02\u0113\u0114\x07k\x02\x02\u0114" +
		"\u0115\x07u\x02\x02\u0115\u0116\x07k\x02\x02\u0116\u0117\x07q\x02\x02" +
		"\u0117\u0118\x07p\x02\x02\u0118;\x03\x02\x02\x02\u0119\u011A\x07d\x02" +
		"\x02\u011A\u011B\x07g\x02\x02\u011B\u011C\x07e\x02\x02\u011C\u011D\x07" +
		"c\x02\x02\u011D\u011E\x07w\x02\x02\u011E\u011F\x07u\x02\x02\u011F\u0120" +
		"\x07g\x02\x02\u0120=\x03\x02\x02\x02\u0121\u0122\x07g\x02\x02\u0122\u0123" +
		"\x07t\x02\x02\u0123\u0124\x07t\x02\x02\u0124\u0125\x07q\x02\x02\u0125" +
		"\u0126\x07t\x02\x02\u0126?\x03\x02\x02\x02\u0127\u0128\x07<\x02\x02\u0128" +
		"A\x03\x02\x02\x02\u0129\u012A\x070\x02\x02\u012AC\x03\x02\x02\x02\u012B" +
		"\u012C\x07*\x02\x02\u012CE\x03\x02\x02\x02\u012D\u012E\x07+\x02\x02\u012E" +
		"G\x03\x02\x02\x02\u012F\u0133\x07$\x02\x02\u0130\u0132\n\x02\x02\x02\u0131" +
		"\u0130\x03\x02\x02\x02\u0132\u0135\x03\x02\x02\x02\u0133\u0131\x03\x02" +
		"\x02\x02\u0133\u0134\x03\x02\x02\x02\u0134\u0136\x03\x02\x02\x02\u0135" +
		"\u0133\x03\x02\x02\x02\u0136\u0137\x07$\x02\x02\u0137I\x03\x02\x02\x02" +
		"\u0138\u013E\x07b\x02\x02\u0139\u013D\n\x03\x02\x02\u013A\u013B\x07^\x02" +
		"\x02\u013B\u013D\v\x02\x02\x02\u013C\u0139\x03\x02\x02\x02\u013C\u013A" +
		"\x03\x02\x02\x02\u013D\u0140\x03\x02\x02\x02\u013E\u013C\x03\x02\x02\x02" +
		"\u013E\u013F\x03\x02\x02\x02\u013F\u0141\x03\x02\x02\x02\u0140\u013E\x03" +
		"\x02\x02\x02\u0141\u0142\x07b\x02\x02\u0142K\x03\x02\x02\x02\u0143\u0144" +
		"\x071\x02\x02\u0144\u0145\x07,\x02\x02\u0145\u0149\x03\x02\x02\x02\u0146" +
		"\u0148\v\x02\x02\x02\u0147\u0146\x03\x02\x02\x02\u0148\u014B\x03\x02\x02" +
		"\x02\u0149\u014A\x03\x02\x02\x02\u0149\u0147\x03\x02\x02\x02\u014A\u014C" +
		"\x03\x02\x02\x02\u014B\u0149\x03\x02\x02\x02\u014C\u014D\x07,\x02\x02" +
		"\u014D\u014E\x071\x02\x02\u014EM\x03\x02\x02\x02\u014F\u0151\t\x04\x02" +
		"\x02\u0150\u014F\x03\x02\x02\x02\u0151\u0152\x03\x02\x02\x02\u0152\u0150" +
		"\x03\x02\x02\x02\u0152\u0153\x03\x02\x02\x02\u0153\u0154\x03\x02\x02\x02" +
		"\u0154\u0155\b&\x05\x02\u0155O\x03\x02\x02\x02\u0156\u0157\x071\x02\x02" +
		"\u0157\u0158\x071\x02\x02\u0158\u015C\x03\x02\x02\x02\u0159\u015B\n\x05" +
		"\x02\x02\u015A\u0159\x03\x02\x02\x02\u015B\u015E\x03\x02\x02\x02\u015C" +
		"\u015A\x03\x02\x02\x02\u015C\u015D\x03\x02\x02\x02\u015D\u015F\x03\x02" +
		"\x02\x02\u015E\u015C\x03\x02\x02\x02\u015F\u0160\b\'\x05\x02\u0160Q\x03" +
		"\x02\x02\x02\u0161\u0162\x05L%\x02\u0162\u0163\x03\x02\x02\x02\u0163\u0164" +
		"\b(\x05\x02\u0164S\x03\x02\x02\x02\u0165\u0167\t\x06\x02\x02\u0166\u0165" +
		"\x03\x02\x02\x02\u0167\u0168\x03\x02\x02\x02\u0168\u0166\x03\x02\x02\x02" +
		"\u0168\u0169\x03\x02\x02\x02\u0169\u016A\x03\x02\x02\x02\u016A\u016B\b" +
		")\x06\x02\u016B\u016C\x03\x02\x02\x02\u016C\u016D\b)\x07\x02\u016DU\x03" +
		"\x02\x02\x02\u016E\u0170\t\x04\x02\x02\u016F\u016E\x03\x02\x02\x02\u0170" +
		"\u0171\x03\x02\x02\x02\u0171\u016F\x03\x02\x02\x02\u0171\u0172\x03\x02" +
		"\x02\x02\u0172\u0173\x03\x02\x02\x02\u0173\u0174\b*\x05\x02\u0174W\x03" +
		"\x02\x02\x02\u0175\u0176\x05L%\x02\u0176\u0177\x03\x02\x02\x02\u0177\u0178" +
		"\b+\x05\x02\u0178Y\x03\x02\x02\x02\u0179\u017A\v\x02\x02\x02\u017A\u017B" +
		"\b,\b\x02\u017B[\x03\x02\x02\x02\u017C\u017E\t\x06\x02\x02\u017D\u017C" +
		"\x03\x02\x02\x02\u017E\u017F\x03\x02\x02\x02\u017F\u017D\x03\x02\x02\x02" +
		"\u017F\u0180\x03\x02\x02\x02\u0180\u0181\x03\x02\x02\x02\u0181\u0182\b" +
		"-\t\x02\u0182\u0183\x03\x02\x02\x02\u0183\u0184\b-\x07\x02\u0184]\x03" +
		"\x02\x02\x02\u0185\u0187\t\x04\x02\x02\u0186\u0185\x03\x02\x02\x02\u0187" +
		"\u0188\x03\x02\x02\x02\u0188\u0186\x03\x02\x02\x02\u0188\u0189\x03\x02" +
		"\x02\x02\u0189\u018A\x03\x02\x02\x02\u018A\u018B\b.\x05\x02\u018B_\x03" +
		"\x02\x02\x02\u018C\u018D\x05L%\x02\u018D\u018E\x03\x02\x02\x02\u018E\u018F" +
		"\b/\x05\x02\u018Fa\x03\x02\x02\x02\u0190\u0191\v\x02\x02\x02\u0191\u0192" +
		"\b0\n\x02\u0192c\x03\x02\x02\x02\u0193\u0195\t\x06\x02\x02\u0194\u0193" +
		"\x03\x02\x02\x02\u0195\u0196\x03\x02\x02\x02\u0196\u0194\x03\x02\x02\x02" +
		"\u0196\u0197\x03\x02\x02\x02\u0197\u0198\x03\x02\x02\x02\u0198\u0199\b" +
		"1\v\x02\u0199\u019A\x03\x02\x02\x02\u019A\u019B\b1\x07\x02\u019Be\x03" +
		"\x02\x02\x02\u019C\u019E\t\x04\x02\x02\u019D\u019C\x03\x02\x02\x02\u019E" +
		"\u019F\x03\x02\x02\x02\u019F\u019D\x03\x02\x02\x02\u019F\u01A0\x03\x02" +
		"\x02\x02\u01A0\u01A1\x03\x02\x02\x02\u01A1\u01A2\b2\x05\x02\u01A2g\x03" +
		"\x02\x02\x02\u01A3\u01A4\x05L%\x02\u01A4\u01A5\x03\x02\x02\x02\u01A5\u01A6" +
		"\b3\x05\x02\u01A6i\x03\x02\x02\x02\u01A7\u01A8\v\x02\x02\x02\u01A8\u01A9" +
		"\b4\f\x02\u01A9k\x03\x02\x02\x02\x12\x02\x03\x04\x05\u0133\u013C\u013E" +
		"\u0149\u0152\u015C\u0168\u0171\u017F\u0188\u0196\u019F\r\x04\x04\x02\x04" +
		"\x05\x02\x04\x03\x02\b\x02\x02\x03)\x02\x04\x02\x02\x03,\x03\x03-\x04" +
		"\x030\x05\x031\x06\x034\x07";
	public static __ATN: ATN;
	public static get _ATN(): ATN {
		if (!CPGLLexer.__ATN) {
			CPGLLexer.__ATN = new ATNDeserializer().deserialize(Utils.toCharArray(CPGLLexer._serializedATN));
		}

		return CPGLLexer.__ATN;
	}

}

