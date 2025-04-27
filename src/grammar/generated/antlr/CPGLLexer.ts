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
	public static readonly ACTIVITY = 1;
	public static readonly ALL = 2;
	public static readonly AND = 3;
	public static readonly ANY = 4;
	public static readonly APPLY = 5;
	public static readonly BECAUSE = 6;
	public static readonly CODE = 7;
	public static readonly CODED = 8;
	public static readonly CONCEPT = 9;
	public static readonly DECISION = 10;
	public static readonly DONE = 11;
	public static readonly DO = 12;
	public static readonly EVIDENCE = 13;
	public static readonly FROM = 14;
	public static readonly INFERRED = 15;
	public static readonly IS = 16;
	public static readonly NOT = 17;
	public static readonly OR = 18;
	public static readonly PATTERN = 19;
	public static readonly PERFORM = 20;
	public static readonly SYSTEM = 21;
	public static readonly TERMINOLOGY = 22;
	public static readonly THEN = 23;
	public static readonly TYPE = 24;
	public static readonly USE = 25;
	public static readonly VALUETYPE = 26;
	public static readonly VALUESET = 27;
	public static readonly WHEN = 28;
	public static readonly WITH = 29;
	public static readonly ERROR = 30;
	public static readonly COLON = 31;
	public static readonly DOT = 32;
	public static readonly LPAREN = 33;
	public static readonly RPAREN = 34;
	public static readonly QUOTED_STRING = 35;
	public static readonly BACKTICK_STRING = 36;
	public static readonly WS = 37;
	public static readonly COMMENT = 38;
	public static readonly COMMENT_BLOCK = 39;
	public static readonly ACTIVITY_TYPE = 40;
	public static readonly ACTIVITY_WS = 41;
	public static readonly ACTIVITY_COMMENT_BLOCK = 42;
	public static readonly ACTIVITY_ErrorChar = 43;
	public static readonly CONCEPT_TYPE = 44;
	public static readonly CONCEPT_WS = 45;
	public static readonly CONCEPT_COMMENT_BLOCK = 46;
	public static readonly CONCEPT_ErrorChar = 47;
	public static readonly CONCEPT_VALUE_TYPE = 48;
	public static readonly VALUE_TYPE_WS = 49;
	public static readonly VALUE_TYPE_COMMENT_BLOCK = 50;
	public static readonly VALUE_TYPE_ErrorChar = 51;
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
		"ACTIVITY", "ALL", "AND", "ANY", "APPLY", "BECAUSE", "CODE", "CODED", 
		"CONCEPT", "DECISION", "DONE", "DO", "EVIDENCE", "FROM", "INFERRED", "IS", 
		"NOT", "OR", "PATTERN", "PERFORM", "SYSTEM", "TERMINOLOGY", "THEN", "TYPE", 
		"USE", "VALUETYPE", "VALUESET", "WHEN", "WITH", "ERROR", "COLON", "DOT", 
		"LPAREN", "RPAREN", "QUOTED_STRING", "BACKTICK_STRING", "BLOCK_COMMENT", 
		"WS", "COMMENT", "COMMENT_BLOCK", "ACTIVITY_TYPE", "ACTIVITY_WS", "ACTIVITY_COMMENT_BLOCK", 
		"ACTIVITY_ErrorChar", "CONCEPT_TYPE", "CONCEPT_WS", "CONCEPT_COMMENT_BLOCK", 
		"CONCEPT_ErrorChar", "CONCEPT_VALUE_TYPE", "VALUE_TYPE_WS", "VALUE_TYPE_COMMENT_BLOCK", 
		"VALUE_TYPE_ErrorChar",
	];

	private static readonly _LITERAL_NAMES: Array<string | undefined> = [
		undefined, "'activity'", "'all'", "'and'", "'any'", "'apply'", "'because'", 
		"'code'", "'coded'", "'concept'", "'decision'", "'done'", "'do'", "'evidence'", 
		"'from'", "'inferred'", "'is'", "'not'", "'or'", "'pattern'", "'perform'", 
		"'system'", "'terminology'", "'then'", "'type'", "'use'", "'valuetype'", 
		"'valueset'", "'when'", "'with'", "'error'", "':'", "'.'", "'('", "')'",
	];
	private static readonly _SYMBOLIC_NAMES: Array<string | undefined> = [
		undefined, "ACTIVITY", "ALL", "AND", "ANY", "APPLY", "BECAUSE", "CODE", 
		"CODED", "CONCEPT", "DECISION", "DONE", "DO", "EVIDENCE", "FROM", "INFERRED", 
		"IS", "NOT", "OR", "PATTERN", "PERFORM", "SYSTEM", "TERMINOLOGY", "THEN", 
		"TYPE", "USE", "VALUETYPE", "VALUESET", "WHEN", "WITH", "ERROR", "COLON", 
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
		case 40:
			this.ACTIVITY_TYPE_action(_localctx, actionIndex);
			break;

		case 43:
			this.ACTIVITY_ErrorChar_action(_localctx, actionIndex);
			break;

		case 44:
			this.CONCEPT_TYPE_action(_localctx, actionIndex);
			break;

		case 47:
			this.CONCEPT_ErrorChar_action(_localctx, actionIndex);
			break;

		case 48:
			this.CONCEPT_VALUE_TYPE_action(_localctx, actionIndex);
			break;

		case 51:
			this.VALUE_TYPE_ErrorChar_action(_localctx, actionIndex);
			break;
		}
	}
	private ACTIVITY_TYPE_action(_localctx: RuleContext, actionIndex: number): void {
		switch (actionIndex) {
		case 0:

			        const validTypes = [
			            'CPGAdministerMedication',
			            'CPGCollectInformation',
			            'CPGCommunicationRequest',
			            'CPGDispenseMedication',
			            'CPGDocumentMedication',
			            'CPGEnrollment',
			            'CPGGenerateReport',
			            'CPGImmunizationRequest',
			            'CPGMedicationRequest',
			            'CPGProposeDiagnosisTask',
			            'CPGRecordDetectedIssue',
			            'CPGRecordInference',
			            'CPGReportFlagTask',
			            'CPGServiceRequest'
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
			            'AdverseEvent',
			            'AllergyIntolerance',
			            'ClinicalImpression',
			            'Communication',
			            'CommunicationRequest',
			            'Condition',
			            'DetectedIssue',
			            'Device',
			            'DiagnosticReport',
			            'Encounter',
			            'FamilyMemberHistory',
			            'Goal',
			            'Immunization',
			            'MedicationAdministration',
			            'MedicationDispense',
			            'MedicationRequest',
			            'NutritionIntake',
			            'NutritionOrder',
			            'Observation',
			            'Procedure',
			            'QuestionnaireResponse',
			            'RiskAssessment',
			            'ServiceRequest',
			            'Task'
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
			            'Attachment',
			            'boolean',
			            'CodeableConcept',
			            'dateTime',
			            'integer',
			            'Period',
			            'Quantity',
			            'Range',
			            'Ratio',
			            'SampledData',
			            'string',
			            'time'
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
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x025\u01B3\b\x01" +
		"\b\x01\b\x01\b\x01\x04\x02\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t" +
		"\x05\x04\x06\t\x06\x04\x07\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t" +
		"\v\x04\f\t\f\x04\r\t\r\x04\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11" +
		"\t\x11\x04\x12\t\x12\x04\x13\t\x13\x04\x14\t\x14\x04\x15\t\x15\x04\x16" +
		"\t\x16\x04\x17\t\x17\x04\x18\t\x18\x04\x19\t\x19\x04\x1A\t\x1A\x04\x1B" +
		"\t\x1B\x04\x1C\t\x1C\x04\x1D\t\x1D\x04\x1E\t\x1E\x04\x1F\t\x1F\x04 \t" +
		" \x04!\t!\x04\"\t\"\x04#\t#\x04$\t$\x04%\t%\x04&\t&\x04\'\t\'\x04(\t(" +
		"\x04)\t)\x04*\t*\x04+\t+\x04,\t,\x04-\t-\x04.\t.\x04/\t/\x040\t0\x041" +
		"\t1\x042\t2\x043\t3\x044\t4\x045\t5\x03\x02\x03\x02\x03\x02\x03\x02\x03" +
		"\x02\x03\x02\x03\x02\x03\x02\x03\x02\x03\x03\x03\x03\x03\x03\x03\x03\x03" +
		"\x04\x03\x04\x03\x04\x03\x04\x03\x05\x03\x05\x03\x05\x03\x05\x03\x06\x03" +
		"\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x07\x03\x07\x03\x07\x03\x07\x03" +
		"\x07\x03\x07\x03\x07\x03\x07\x03\b\x03\b\x03\b\x03\b\x03\b\x03\t\x03\t" +
		"\x03\t\x03\t\x03\t\x03\t\x03\n\x03\n\x03\n\x03\n\x03\n\x03\n\x03\n\x03" +
		"\n\x03\v\x03\v\x03\v\x03\v\x03\v\x03\v\x03\v\x03\v\x03\v\x03\f\x03\f\x03" +
		"\f\x03\f\x03\f\x03\r\x03\r\x03\r\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0E" +
		"\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0F\x03\x0F\x03\x0F\x03\x0F\x03\x0F" +
		"\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10" +
		"\x03\x11\x03\x11\x03\x11\x03\x12\x03\x12\x03\x12\x03\x12\x03\x13\x03\x13" +
		"\x03\x13\x03\x14\x03\x14\x03\x14\x03\x14\x03\x14\x03\x14\x03\x14\x03\x14" +
		"\x03\x15\x03\x15\x03\x15\x03\x15\x03\x15\x03\x15\x03\x15\x03\x15\x03\x15" +
		"\x03\x15\x03\x16\x03\x16\x03\x16\x03\x16\x03\x16\x03\x16\x03\x16\x03\x17" +
		"\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17" +
		"\x03\x17\x03\x17\x03\x18\x03\x18\x03\x18\x03\x18\x03\x18\x03\x19\x03\x19" +
		"\x03\x19\x03\x19\x03\x19\x03\x19\x03\x19\x03\x1A\x03\x1A\x03\x1A\x03\x1A" +
		"\x03\x1B\x03\x1B\x03\x1B\x03\x1B\x03\x1B\x03\x1B\x03\x1B\x03\x1B\x03\x1B" +
		"\x03\x1B\x03\x1B\x03\x1B\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x03\x1C" +
		"\x03\x1C\x03\x1C\x03\x1C\x03\x1D\x03\x1D\x03\x1D\x03\x1D\x03\x1D\x03\x1E" +
		"\x03\x1E\x03\x1E\x03\x1E\x03\x1E\x03\x1F\x03\x1F\x03\x1F\x03\x1F\x03\x1F" +
		"\x03\x1F\x03 \x03 \x03!\x03!\x03\"\x03\"\x03#\x03#\x03$\x03$\x07$\u013B" +
		"\n$\f$\x0E$\u013E\v$\x03$\x03$\x03%\x03%\x03%\x03%\x07%\u0146\n%\f%\x0E" +
		"%\u0149\v%\x03%\x03%\x03&\x03&\x03&\x03&\x07&\u0151\n&\f&\x0E&\u0154\v" +
		"&\x03&\x03&\x03&\x03\'\x06\'\u015A\n\'\r\'\x0E\'\u015B\x03\'\x03\'\x03" +
		"(\x03(\x03(\x03(\x07(\u0164\n(\f(\x0E(\u0167\v(\x03(\x03(\x03)\x03)\x03" +
		")\x03)\x03*\x06*\u0170\n*\r*\x0E*\u0171\x03*\x03*\x03*\x03*\x03+\x06+" +
		"\u0179\n+\r+\x0E+\u017A\x03+\x03+\x03,\x03,\x03,\x03,\x03-\x03-\x03-\x03" +
		".\x06.\u0187\n.\r.\x0E.\u0188\x03.\x03.\x03.\x03.\x03/\x06/\u0190\n/\r" +
		"/\x0E/\u0191\x03/\x03/\x030\x030\x030\x030\x031\x031\x031\x032\x062\u019E" +
		"\n2\r2\x0E2\u019F\x032\x032\x032\x032\x033\x063\u01A7\n3\r3\x0E3\u01A8" +
		"\x033\x033\x034\x034\x034\x034\x035\x035\x035\x03\u0152\x02\x026\x06\x02" +
		"\x03\b\x02\x04\n\x02\x05\f\x02\x06\x0E\x02\x07\x10\x02\b\x12\x02\t\x14" +
		"\x02\n\x16\x02\v\x18\x02\f\x1A\x02\r\x1C\x02\x0E\x1E\x02\x0F \x02\x10" +
		"\"\x02\x11$\x02\x12&\x02\x13(\x02\x14*\x02\x15,\x02\x16.\x02\x170\x02" +
		"\x182\x02\x194\x02\x1A6\x02\x1B8\x02\x1C:\x02\x1D<\x02\x1E>\x02\x1F@\x02" +
		" B\x02!D\x02\"F\x02#H\x02$J\x02%L\x02&N\x02\x02P\x02\'R\x02(T\x02)V\x02" +
		"*X\x02+Z\x02,\\\x02-^\x02.`\x02/b\x020d\x021f\x022h\x023j\x024l\x025\x06" +
		"\x02\x03\x04\x05\x07\x06\x02\f\f\x0F\x0F$$^^\x04\x02^^bb\x05\x02\v\f\x0F" +
		"\x0F\"\"\x04\x02\f\f\x0F\x0F\x04\x02C\\c|\x02\u01BA\x02\x06\x03\x02\x02" +
		"\x02\x02\b\x03\x02\x02\x02\x02\n\x03\x02\x02\x02\x02\f\x03\x02\x02\x02" +
		"\x02\x0E\x03\x02\x02\x02\x02\x10\x03\x02\x02\x02\x02\x12\x03\x02\x02\x02" +
		"\x02\x14\x03\x02\x02\x02\x02\x16\x03\x02\x02\x02\x02\x18\x03\x02\x02\x02" +
		"\x02\x1A\x03\x02\x02\x02\x02\x1C\x03\x02\x02\x02\x02\x1E\x03\x02\x02\x02" +
		"\x02 \x03\x02\x02\x02\x02\"\x03\x02\x02\x02\x02$\x03\x02\x02\x02\x02&" +
		"\x03\x02\x02\x02\x02(\x03\x02\x02\x02\x02*\x03\x02\x02\x02\x02,\x03\x02" +
		"\x02\x02\x02.\x03\x02\x02\x02\x020\x03\x02\x02\x02\x022\x03\x02\x02\x02" +
		"\x024\x03\x02\x02\x02\x026\x03\x02\x02\x02\x028\x03\x02\x02\x02\x02:\x03" +
		"\x02\x02\x02\x02<\x03\x02\x02\x02\x02>\x03\x02\x02\x02\x02@\x03\x02\x02" +
		"\x02\x02B\x03\x02\x02\x02\x02D\x03\x02\x02\x02\x02F\x03\x02\x02\x02\x02" +
		"H\x03\x02\x02\x02\x02J\x03\x02\x02\x02\x02L\x03\x02\x02\x02\x02P\x03\x02" +
		"\x02\x02\x02R\x03\x02\x02\x02\x02T\x03\x02\x02\x02\x03V\x03\x02\x02\x02" +
		"\x03X\x03\x02\x02\x02\x03Z\x03\x02\x02\x02\x03\\\x03\x02\x02\x02\x04^" +
		"\x03\x02\x02\x02\x04`\x03\x02\x02\x02\x04b\x03\x02\x02\x02\x04d\x03\x02" +
		"\x02\x02\x05f\x03\x02\x02\x02\x05h\x03\x02\x02\x02\x05j\x03\x02\x02\x02" +
		"\x05l\x03\x02\x02\x02\x06n\x03\x02\x02\x02\bw\x03\x02\x02\x02\n{\x03\x02" +
		"\x02\x02\f\x7F\x03\x02\x02\x02\x0E\x83\x03\x02\x02\x02\x10\x89\x03\x02" +
		"\x02\x02\x12\x91\x03\x02\x02\x02\x14\x96\x03\x02\x02\x02\x16\x9C\x03\x02" +
		"\x02\x02\x18\xA4\x03\x02\x02\x02\x1A\xAD\x03\x02\x02\x02\x1C\xB2\x03\x02" +
		"\x02\x02\x1E\xB5\x03\x02\x02\x02 \xBE\x03\x02\x02\x02\"\xC3\x03\x02\x02" +
		"\x02$\xCC\x03\x02\x02\x02&\xCF\x03\x02\x02\x02(\xD3\x03\x02\x02\x02*\xD6" +
		"\x03\x02\x02\x02,\xDE\x03\x02\x02\x02.\xE8\x03\x02\x02\x020\xEF\x03\x02" +
		"\x02\x022\xFB\x03\x02\x02\x024\u0100\x03\x02\x02\x026\u0107\x03\x02\x02" +
		"\x028\u010B\x03\x02\x02\x02:\u0117\x03\x02\x02\x02<\u0120\x03\x02\x02" +
		"\x02>\u0125\x03\x02\x02\x02@\u012A\x03\x02\x02\x02B\u0130\x03\x02\x02" +
		"\x02D\u0132\x03\x02\x02\x02F\u0134\x03\x02\x02\x02H\u0136\x03\x02\x02" +
		"\x02J\u0138\x03\x02\x02\x02L\u0141\x03\x02\x02\x02N\u014C\x03\x02\x02" +
		"\x02P\u0159\x03\x02\x02\x02R\u015F\x03\x02\x02\x02T\u016A\x03\x02\x02" +
		"\x02V\u016F\x03\x02\x02\x02X\u0178\x03\x02\x02\x02Z\u017E\x03\x02\x02" +
		"\x02\\\u0182\x03\x02\x02\x02^\u0186\x03\x02\x02\x02`\u018F\x03\x02\x02" +
		"\x02b\u0195\x03\x02\x02\x02d\u0199\x03\x02\x02\x02f\u019D\x03\x02\x02" +
		"\x02h\u01A6\x03\x02\x02\x02j\u01AC\x03\x02\x02\x02l\u01B0\x03\x02\x02" +
		"\x02no\x07c\x02\x02op\x07e\x02\x02pq\x07v\x02\x02qr\x07k\x02\x02rs\x07" +
		"x\x02\x02st\x07k\x02\x02tu\x07v\x02\x02uv\x07{\x02\x02v\x07\x03\x02\x02" +
		"\x02wx\x07c\x02\x02xy\x07n\x02\x02yz\x07n\x02\x02z\t\x03\x02\x02\x02{" +
		"|\x07c\x02\x02|}\x07p\x02\x02}~\x07f\x02\x02~\v\x03\x02\x02\x02\x7F\x80" +
		"\x07c\x02\x02\x80\x81\x07p\x02\x02\x81\x82\x07{\x02\x02\x82\r\x03\x02" +
		"\x02\x02\x83\x84\x07c\x02\x02\x84\x85\x07r\x02\x02\x85\x86\x07r\x02\x02" +
		"\x86\x87\x07n\x02\x02\x87\x88\x07{\x02\x02\x88\x0F\x03\x02\x02\x02\x89" +
		"\x8A\x07d\x02\x02\x8A\x8B\x07g\x02\x02\x8B\x8C\x07e\x02\x02\x8C\x8D\x07" +
		"c\x02\x02\x8D\x8E\x07w\x02\x02\x8E\x8F\x07u\x02\x02\x8F\x90\x07g\x02\x02" +
		"\x90\x11\x03\x02\x02\x02\x91\x92\x07e\x02\x02\x92\x93\x07q\x02\x02\x93" +
		"\x94\x07f\x02\x02\x94\x95\x07g\x02\x02\x95\x13\x03\x02\x02\x02\x96\x97" +
		"\x07e\x02\x02\x97\x98\x07q\x02\x02\x98\x99\x07f\x02\x02\x99\x9A\x07g\x02" +
		"\x02\x9A\x9B\x07f\x02\x02\x9B\x15\x03\x02\x02\x02\x9C\x9D\x07e\x02\x02" +
		"\x9D\x9E\x07q\x02\x02\x9E\x9F\x07p\x02\x02\x9F\xA0\x07e\x02\x02\xA0\xA1" +
		"\x07g\x02\x02\xA1\xA2\x07r\x02\x02\xA2\xA3\x07v\x02\x02\xA3\x17\x03\x02" +
		"\x02\x02\xA4\xA5\x07f\x02\x02\xA5\xA6\x07g\x02\x02\xA6\xA7\x07e\x02\x02" +
		"\xA7\xA8\x07k\x02\x02\xA8\xA9\x07u\x02\x02\xA9\xAA\x07k\x02\x02\xAA\xAB" +
		"\x07q\x02\x02\xAB\xAC\x07p\x02\x02\xAC\x19\x03\x02\x02\x02\xAD\xAE\x07" +
		"f\x02\x02\xAE\xAF\x07q\x02\x02\xAF\xB0\x07p\x02\x02\xB0\xB1\x07g\x02\x02" +
		"\xB1\x1B\x03\x02\x02\x02\xB2\xB3\x07f\x02\x02\xB3\xB4\x07q\x02\x02\xB4" +
		"\x1D\x03\x02\x02\x02\xB5\xB6\x07g\x02\x02\xB6\xB7\x07x\x02\x02\xB7\xB8" +
		"\x07k\x02\x02\xB8\xB9\x07f\x02\x02\xB9\xBA\x07g\x02\x02\xBA\xBB\x07p\x02" +
		"\x02\xBB\xBC\x07e\x02\x02\xBC\xBD\x07g\x02\x02\xBD\x1F\x03\x02\x02\x02" +
		"\xBE\xBF\x07h\x02\x02\xBF\xC0\x07t\x02\x02\xC0\xC1\x07q\x02\x02\xC1\xC2" +
		"\x07o\x02\x02\xC2!\x03\x02\x02\x02\xC3\xC4\x07k\x02\x02\xC4\xC5\x07p\x02" +
		"\x02\xC5\xC6\x07h\x02\x02\xC6\xC7\x07g\x02\x02\xC7\xC8\x07t\x02\x02\xC8" +
		"\xC9\x07t\x02\x02\xC9\xCA\x07g\x02\x02\xCA\xCB\x07f\x02\x02\xCB#\x03\x02" +
		"\x02\x02\xCC\xCD\x07k\x02\x02\xCD\xCE\x07u\x02\x02\xCE%\x03\x02\x02\x02" +
		"\xCF\xD0\x07p\x02\x02\xD0\xD1\x07q\x02\x02\xD1\xD2\x07v\x02\x02\xD2\'" +
		"\x03\x02\x02\x02\xD3\xD4\x07q\x02\x02\xD4\xD5\x07t\x02\x02\xD5)\x03\x02" +
		"\x02\x02\xD6\xD7\x07r\x02\x02\xD7\xD8\x07c\x02\x02\xD8\xD9\x07v\x02\x02" +
		"\xD9\xDA\x07v\x02\x02\xDA\xDB\x07g\x02\x02\xDB\xDC\x07t\x02\x02\xDC\xDD" +
		"\x07p\x02\x02\xDD+\x03\x02\x02\x02\xDE\xDF\x07r\x02\x02\xDF\xE0\x07g\x02" +
		"\x02\xE0\xE1\x07t\x02\x02\xE1\xE2\x07h\x02\x02\xE2\xE3\x07q\x02\x02\xE3" +
		"\xE4\x07t\x02\x02\xE4\xE5\x07o\x02\x02\xE5\xE6\x03\x02\x02\x02\xE6\xE7" +
		"\b\x15\x02\x02\xE7-\x03\x02\x02\x02\xE8\xE9\x07u\x02\x02\xE9\xEA\x07{" +
		"\x02\x02\xEA\xEB\x07u\x02\x02\xEB\xEC\x07v\x02\x02\xEC\xED\x07g\x02\x02" +
		"\xED\xEE\x07o\x02\x02\xEE/\x03\x02\x02\x02\xEF\xF0\x07v\x02\x02\xF0\xF1" +
		"\x07g\x02\x02\xF1\xF2\x07t\x02\x02\xF2\xF3\x07o\x02\x02\xF3\xF4\x07k\x02" +
		"\x02\xF4\xF5\x07p\x02\x02\xF5\xF6\x07q\x02\x02\xF6\xF7\x07n\x02\x02\xF7" +
		"\xF8\x07q\x02\x02\xF8\xF9\x07i\x02\x02\xF9\xFA\x07{\x02\x02\xFA1\x03\x02" +
		"\x02\x02\xFB\xFC\x07v\x02\x02\xFC\xFD\x07j\x02\x02\xFD\xFE\x07g\x02\x02" +
		"\xFE\xFF\x07p\x02\x02\xFF3\x03\x02\x02\x02\u0100\u0101\x07v\x02\x02\u0101" +
		"\u0102\x07{\x02\x02\u0102\u0103\x07r\x02\x02\u0103\u0104\x07g\x02\x02" +
		"\u0104\u0105\x03\x02\x02\x02\u0105\u0106\b\x19\x03\x02\u01065\x03\x02" +
		"\x02\x02\u0107\u0108\x07w\x02\x02\u0108\u0109\x07u\x02\x02\u0109\u010A" +
		"\x07g\x02\x02\u010A7\x03\x02\x02\x02\u010B\u010C\x07x\x02\x02\u010C\u010D" +
		"\x07c\x02\x02\u010D\u010E\x07n\x02\x02\u010E\u010F\x07w\x02\x02\u010F" +
		"\u0110\x07g\x02\x02\u0110\u0111\x07v\x02\x02\u0111\u0112\x07{\x02\x02" +
		"\u0112\u0113\x07r\x02\x02\u0113\u0114\x07g\x02\x02\u0114\u0115\x03\x02" +
		"\x02\x02\u0115\u0116\b\x1B\x04\x02\u01169\x03\x02\x02\x02\u0117\u0118" +
		"\x07x\x02\x02\u0118\u0119\x07c\x02\x02\u0119\u011A\x07n\x02\x02\u011A" +
		"\u011B\x07w\x02\x02\u011B\u011C\x07g\x02\x02\u011C\u011D\x07u\x02\x02" +
		"\u011D\u011E\x07g\x02\x02\u011E\u011F\x07v\x02\x02\u011F;\x03\x02\x02" +
		"\x02\u0120\u0121\x07y\x02\x02\u0121\u0122\x07j\x02\x02\u0122\u0123\x07" +
		"g\x02\x02\u0123\u0124\x07p\x02\x02\u0124=\x03\x02\x02\x02\u0125\u0126" +
		"\x07y\x02\x02\u0126\u0127\x07k\x02\x02\u0127\u0128\x07v\x02\x02\u0128" +
		"\u0129\x07j\x02\x02\u0129?\x03\x02\x02\x02\u012A\u012B\x07g\x02\x02\u012B" +
		"\u012C\x07t\x02\x02\u012C\u012D\x07t\x02\x02\u012D\u012E\x07q\x02\x02" +
		"\u012E\u012F\x07t\x02\x02\u012FA\x03\x02\x02\x02\u0130\u0131\x07<\x02" +
		"\x02\u0131C\x03\x02\x02\x02\u0132\u0133\x070\x02\x02\u0133E\x03\x02\x02" +
		"\x02\u0134\u0135\x07*\x02\x02\u0135G\x03\x02\x02\x02\u0136\u0137\x07+" +
		"\x02\x02\u0137I\x03\x02\x02\x02\u0138\u013C\x07$\x02\x02\u0139\u013B\n" +
		"\x02\x02\x02\u013A\u0139\x03\x02\x02\x02\u013B\u013E\x03\x02\x02\x02\u013C" +
		"\u013A\x03\x02\x02\x02\u013C\u013D\x03\x02\x02\x02\u013D\u013F\x03\x02" +
		"\x02\x02\u013E\u013C\x03\x02\x02\x02\u013F\u0140\x07$\x02\x02\u0140K\x03" +
		"\x02\x02\x02\u0141\u0147\x07b\x02\x02\u0142\u0146\n\x03\x02\x02\u0143" +
		"\u0144\x07^\x02\x02\u0144\u0146\v\x02\x02\x02\u0145\u0142\x03\x02\x02" +
		"\x02\u0145\u0143\x03\x02\x02\x02\u0146\u0149\x03\x02\x02\x02\u0147\u0145" +
		"\x03\x02\x02\x02\u0147\u0148\x03\x02\x02\x02\u0148\u014A\x03\x02\x02\x02" +
		"\u0149\u0147\x03\x02\x02\x02\u014A\u014B\x07b\x02\x02\u014BM\x03\x02\x02" +
		"\x02\u014C\u014D\x071\x02\x02\u014D\u014E\x07,\x02\x02\u014E\u0152\x03" +
		"\x02\x02\x02\u014F\u0151\v\x02\x02\x02\u0150\u014F\x03\x02\x02\x02\u0151" +
		"\u0154\x03\x02\x02\x02\u0152\u0153\x03\x02\x02\x02\u0152\u0150\x03\x02" +
		"\x02\x02\u0153\u0155\x03\x02\x02\x02\u0154\u0152\x03\x02\x02\x02\u0155" +
		"\u0156\x07,\x02\x02\u0156\u0157\x071\x02\x02\u0157O\x03\x02\x02\x02\u0158" +
		"\u015A\t\x04\x02\x02\u0159\u0158\x03\x02\x02\x02\u015A\u015B\x03\x02\x02" +
		"\x02\u015B\u0159\x03\x02\x02\x02\u015B\u015C\x03\x02\x02\x02\u015C\u015D" +
		"\x03\x02\x02\x02\u015D\u015E\b\'\x05\x02\u015EQ\x03\x02\x02\x02\u015F" +
		"\u0160\x071\x02\x02\u0160\u0161\x071\x02\x02\u0161\u0165\x03\x02\x02\x02" +
		"\u0162\u0164\n\x05\x02\x02\u0163\u0162\x03\x02\x02\x02\u0164\u0167\x03" +
		"\x02\x02\x02\u0165\u0163\x03\x02\x02\x02\u0165\u0166\x03\x02\x02\x02\u0166" +
		"\u0168\x03\x02\x02\x02\u0167\u0165\x03\x02\x02\x02\u0168\u0169\b(\x05" +
		"\x02\u0169S\x03\x02\x02\x02\u016A\u016B\x05N&\x02\u016B\u016C\x03\x02" +
		"\x02\x02\u016C\u016D\b)\x05\x02\u016DU\x03\x02\x02\x02\u016E\u0170\t\x06" +
		"\x02\x02\u016F\u016E\x03\x02\x02\x02\u0170\u0171\x03\x02\x02\x02\u0171" +
		"\u016F\x03\x02\x02\x02\u0171\u0172\x03\x02\x02\x02\u0172\u0173\x03\x02" +
		"\x02\x02\u0173\u0174\b*\x06\x02\u0174\u0175\x03\x02\x02\x02\u0175\u0176" +
		"\b*\x07\x02\u0176W\x03\x02\x02\x02\u0177\u0179\t\x04\x02\x02\u0178\u0177" +
		"\x03\x02\x02\x02\u0179\u017A\x03\x02\x02\x02\u017A\u0178\x03\x02\x02\x02" +
		"\u017A\u017B\x03\x02\x02\x02\u017B\u017C\x03\x02\x02\x02\u017C\u017D\b" +
		"+\x05\x02\u017DY\x03\x02\x02\x02\u017E\u017F\x05N&\x02\u017F\u0180\x03" +
		"\x02\x02\x02\u0180\u0181\b,\x05\x02\u0181[\x03\x02\x02\x02\u0182\u0183" +
		"\v\x02\x02\x02\u0183\u0184\b-\b\x02\u0184]\x03\x02\x02\x02\u0185\u0187" +
		"\t\x06\x02\x02\u0186\u0185\x03\x02\x02\x02\u0187\u0188\x03\x02\x02\x02" +
		"\u0188\u0186\x03\x02\x02\x02\u0188\u0189\x03\x02\x02\x02\u0189\u018A\x03" +
		"\x02\x02\x02\u018A\u018B\b.\t\x02\u018B\u018C\x03\x02\x02\x02\u018C\u018D" +
		"\b.\x07\x02\u018D_\x03\x02\x02\x02\u018E\u0190\t\x04\x02\x02\u018F\u018E" +
		"\x03\x02\x02\x02\u0190\u0191\x03\x02\x02\x02\u0191\u018F\x03\x02\x02\x02" +
		"\u0191\u0192\x03\x02\x02\x02\u0192\u0193\x03\x02\x02\x02\u0193\u0194\b" +
		"/\x05\x02\u0194a\x03\x02\x02\x02\u0195\u0196\x05N&\x02\u0196\u0197\x03" +
		"\x02\x02\x02\u0197\u0198\b0\x05\x02\u0198c\x03\x02\x02\x02\u0199\u019A" +
		"\v\x02\x02\x02\u019A\u019B\b1\n\x02\u019Be\x03\x02\x02\x02\u019C\u019E" +
		"\t\x06\x02\x02\u019D\u019C\x03\x02\x02\x02\u019E\u019F\x03\x02\x02\x02" +
		"\u019F\u019D\x03\x02\x02\x02\u019F\u01A0\x03\x02\x02\x02\u01A0\u01A1\x03" +
		"\x02\x02\x02\u01A1\u01A2\b2\v\x02\u01A2\u01A3\x03\x02\x02\x02\u01A3\u01A4" +
		"\b2\x07\x02\u01A4g\x03\x02\x02\x02\u01A5\u01A7\t\x04\x02\x02\u01A6\u01A5" +
		"\x03\x02\x02\x02\u01A7\u01A8\x03\x02\x02\x02\u01A8\u01A6\x03\x02\x02\x02" +
		"\u01A8\u01A9\x03\x02\x02\x02\u01A9\u01AA\x03\x02\x02\x02\u01AA\u01AB\b" +
		"3\x05\x02\u01ABi\x03\x02\x02\x02\u01AC\u01AD\x05N&\x02\u01AD\u01AE\x03" +
		"\x02\x02\x02\u01AE\u01AF\b4\x05\x02\u01AFk\x03\x02\x02\x02\u01B0\u01B1" +
		"\v\x02\x02\x02\u01B1\u01B2\b5\f\x02\u01B2m\x03\x02\x02\x02\x12\x02\x03" +
		"\x04\x05\u013C\u0145\u0147\u0152\u015B\u0165\u0171\u017A\u0188\u0191\u019F" +
		"\u01A8\r\x04\x03\x02\x04\x04\x02\x04\x05\x02\b\x02\x02\x03*\x02\x04\x02" +
		"\x02\x03-\x03\x03.\x04\x031\x05\x032\x06\x035\x07";
	public static __ATN: ATN;
	public static get _ATN(): ATN {
		if (!CPGLLexer.__ATN) {
			CPGLLexer.__ATN = new ATNDeserializer().deserialize(Utils.toCharArray(CPGLLexer._serializedATN));
		}

		return CPGLLexer.__ATN;
	}

}

