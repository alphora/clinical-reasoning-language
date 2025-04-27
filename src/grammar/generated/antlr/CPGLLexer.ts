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
		"ACTIVITY_ErrorChar", "CONCEPT_IS", "CONCEPT_TYPE", "CONCEPT_WS", "CONCEPT_COMMENT_BLOCK", 
		"CONCEPT_ErrorChar", "VALUE_TYPE_IS", "CONCEPT_VALUE_TYPE", "VALUE_TYPE_WS", 
		"VALUE_TYPE_COMMENT_BLOCK", "VALUE_TYPE_ErrorChar",
	];

	private static readonly _LITERAL_NAMES: Array<string | undefined> = [
		undefined, "'activity'", "'all'", "'and'", "'any'", "'apply'", "'because'", 
		"'code'", "'coded'", "'concept'", "'decision'", "'done'", "'do'", "'evidence'", 
		"'from'", "'inferred'", undefined, "'not'", "'or'", "'pattern'", "'perform'", 
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

		case 45:
			this.CONCEPT_TYPE_action(_localctx, actionIndex);
			break;

		case 48:
			this.CONCEPT_ErrorChar_action(_localctx, actionIndex);
			break;

		case 50:
			this.CONCEPT_VALUE_TYPE_action(_localctx, actionIndex);
			break;

		case 53:
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
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x025\u01C1\b\x01" +
		"\b\x01\b\x01\b\x01\x04\x02\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t" +
		"\x05\x04\x06\t\x06\x04\x07\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t" +
		"\v\x04\f\t\f\x04\r\t\r\x04\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11" +
		"\t\x11\x04\x12\t\x12\x04\x13\t\x13\x04\x14\t\x14\x04\x15\t\x15\x04\x16" +
		"\t\x16\x04\x17\t\x17\x04\x18\t\x18\x04\x19\t\x19\x04\x1A\t\x1A\x04\x1B" +
		"\t\x1B\x04\x1C\t\x1C\x04\x1D\t\x1D\x04\x1E\t\x1E\x04\x1F\t\x1F\x04 \t" +
		" \x04!\t!\x04\"\t\"\x04#\t#\x04$\t$\x04%\t%\x04&\t&\x04\'\t\'\x04(\t(" +
		"\x04)\t)\x04*\t*\x04+\t+\x04,\t,\x04-\t-\x04.\t.\x04/\t/\x040\t0\x041" +
		"\t1\x042\t2\x043\t3\x044\t4\x045\t5\x046\t6\x047\t7\x03\x02\x03\x02\x03" +
		"\x02\x03\x02\x03\x02\x03\x02\x03\x02\x03\x02\x03\x02\x03\x03\x03\x03\x03" +
		"\x03\x03\x03\x03\x04\x03\x04\x03\x04\x03\x04\x03\x05\x03\x05\x03\x05\x03" +
		"\x05\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x07\x03\x07\x03" +
		"\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\x07\x03\b\x03\b\x03\b\x03\b\x03" +
		"\b\x03\t\x03\t\x03\t\x03\t\x03\t\x03\t\x03\n\x03\n\x03\n\x03\n\x03\n\x03" +
		"\n\x03\n\x03\n\x03\v\x03\v\x03\v\x03\v\x03\v\x03\v\x03\v\x03\v\x03\v\x03" +
		"\f\x03\f\x03\f\x03\f\x03\f\x03\r\x03\r\x03\r\x03\x0E\x03\x0E\x03\x0E\x03" +
		"\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0F\x03\x0F\x03\x0F\x03" +
		"\x0F\x03\x0F\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03" +
		"\x10\x03\x10\x03\x11\x03\x11\x03\x11\x03\x12\x03\x12\x03\x12\x03\x12\x03" +
		"\x13\x03\x13\x03\x13\x03\x14\x03\x14\x03\x14\x03\x14\x03\x14\x03\x14\x03" +
		"\x14\x03\x14\x03\x15\x03\x15\x03\x15\x03\x15\x03\x15\x03\x15\x03\x15\x03" +
		"\x15\x03\x15\x03\x15\x03\x16\x03\x16\x03\x16\x03\x16\x03\x16\x03\x16\x03" +
		"\x16\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03" +
		"\x17\x03\x17\x03\x17\x03\x17\x03\x18\x03\x18\x03\x18\x03\x18\x03\x18\x03" +
		"\x19\x03\x19\x03\x19\x03\x19\x03\x19\x03\x19\x03\x19\x03\x1A\x03\x1A\x03" +
		"\x1A\x03\x1A\x03\x1B\x03\x1B\x03\x1B\x03\x1B\x03\x1B\x03\x1B\x03\x1B\x03" +
		"\x1B\x03\x1B\x03\x1B\x03\x1B\x03\x1B\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x03" +
		"\x1C\x03\x1C\x03\x1C\x03\x1C\x03\x1C\x03\x1D\x03\x1D\x03\x1D\x03\x1D\x03" +
		"\x1D\x03\x1E\x03\x1E\x03\x1E\x03\x1E\x03\x1E\x03\x1F\x03\x1F\x03\x1F\x03" +
		"\x1F\x03\x1F\x03\x1F\x03 \x03 \x03!\x03!\x03\"\x03\"\x03#\x03#\x03$\x03" +
		"$\x07$\u013F\n$\f$\x0E$\u0142\v$\x03$\x03$\x03%\x03%\x03%\x03%\x07%\u014A" +
		"\n%\f%\x0E%\u014D\v%\x03%\x03%\x03&\x03&\x03&\x03&\x07&\u0155\n&\f&\x0E" +
		"&\u0158\v&\x03&\x03&\x03&\x03\'\x06\'\u015E\n\'\r\'\x0E\'\u015F\x03\'" +
		"\x03\'\x03(\x03(\x03(\x03(\x07(\u0168\n(\f(\x0E(\u016B\v(\x03(\x03(\x03" +
		")\x03)\x03)\x03)\x03*\x06*\u0174\n*\r*\x0E*\u0175\x03*\x03*\x03*\x03*" +
		"\x03+\x06+\u017D\n+\r+\x0E+\u017E\x03+\x03+\x03,\x03,\x03,\x03,\x03-\x03" +
		"-\x03-\x03.\x03.\x03.\x03.\x03.\x03/\x06/\u0190\n/\r/\x0E/\u0191\x03/" +
		"\x03/\x03/\x03/\x030\x060\u0199\n0\r0\x0E0\u019A\x030\x030\x031\x031\x03" +
		"1\x031\x032\x032\x032\x033\x033\x033\x033\x033\x034\x064\u01AC\n4\r4\x0E" +
		"4\u01AD\x034\x034\x034\x034\x035\x065\u01B5\n5\r5\x0E5\u01B6\x035\x03" +
		"5\x036\x036\x036\x036\x037\x037\x037\x03\u0156\x02\x028\x06\x02\x03\b" +
		"\x02\x04\n\x02\x05\f\x02\x06\x0E\x02\x07\x10\x02\b\x12\x02\t\x14\x02\n" +
		"\x16\x02\v\x18\x02\f\x1A\x02\r\x1C\x02\x0E\x1E\x02\x0F \x02\x10\"\x02" +
		"\x11$\x02\x12&\x02\x13(\x02\x14*\x02\x15,\x02\x16.\x02\x170\x02\x182\x02" +
		"\x194\x02\x1A6\x02\x1B8\x02\x1C:\x02\x1D<\x02\x1E>\x02\x1F@\x02 B\x02" +
		"!D\x02\"F\x02#H\x02$J\x02%L\x02&N\x02\x02P\x02\'R\x02(T\x02)V\x02*X\x02" +
		"+Z\x02,\\\x02-^\x02\x02`\x02.b\x02/d\x020f\x021h\x02\x02j\x022l\x023n" +
		"\x024p\x025\x06\x02\x03\x04\x05\x07\x06\x02\f\f\x0F\x0F$$^^\x04\x02^^" +
		"bb\x05\x02\v\f\x0F\x0F\"\"\x04\x02\f\f\x0F\x0F\x04\x02C\\c|\x02\u01C8" +
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
		"\x02\x02\x02\x02H\x03\x02\x02\x02\x02J\x03\x02\x02\x02\x02L\x03\x02\x02" +
		"\x02\x02P\x03\x02\x02\x02\x02R\x03\x02\x02\x02\x02T\x03\x02\x02\x02\x03" +
		"V\x03\x02\x02\x02\x03X\x03\x02\x02\x02\x03Z\x03\x02\x02\x02\x03\\\x03" +
		"\x02\x02\x02\x04^\x03\x02\x02\x02\x04`\x03\x02\x02\x02\x04b\x03\x02\x02" +
		"\x02\x04d\x03\x02\x02\x02\x04f\x03\x02\x02\x02\x05h\x03\x02\x02\x02\x05" +
		"j\x03\x02\x02\x02\x05l\x03\x02\x02\x02\x05n\x03\x02\x02\x02\x05p\x03\x02" +
		"\x02\x02\x06r\x03\x02\x02\x02\b{\x03\x02\x02\x02\n\x7F\x03\x02\x02\x02" +
		"\f\x83\x03\x02\x02\x02\x0E\x87\x03\x02\x02\x02\x10\x8D\x03\x02\x02\x02" +
		"\x12\x95\x03\x02\x02\x02\x14\x9A\x03\x02\x02\x02\x16\xA0\x03\x02\x02\x02" +
		"\x18\xA8\x03\x02\x02\x02\x1A\xB1\x03\x02\x02\x02\x1C\xB6\x03\x02\x02\x02" +
		"\x1E\xB9\x03\x02\x02\x02 \xC2\x03\x02\x02\x02\"\xC7\x03\x02\x02\x02$\xD0" +
		"\x03\x02\x02\x02&\xD3\x03\x02\x02\x02(\xD7\x03\x02\x02\x02*\xDA\x03\x02" +
		"\x02\x02,\xE2\x03\x02\x02\x02.\xEC\x03\x02\x02\x020\xF3\x03\x02\x02\x02" +
		"2\xFF\x03\x02\x02\x024\u0104\x03\x02\x02\x026\u010B\x03\x02\x02\x028\u010F" +
		"\x03\x02\x02\x02:\u011B\x03\x02\x02\x02<\u0124\x03\x02\x02\x02>\u0129" +
		"\x03\x02\x02\x02@\u012E\x03\x02\x02\x02B\u0134\x03\x02\x02\x02D\u0136" +
		"\x03\x02\x02\x02F\u0138\x03\x02\x02\x02H\u013A\x03\x02\x02\x02J\u013C" +
		"\x03\x02\x02\x02L\u0145\x03\x02\x02\x02N\u0150\x03\x02\x02\x02P\u015D" +
		"\x03\x02\x02\x02R\u0163\x03\x02\x02\x02T\u016E\x03\x02\x02\x02V\u0173" +
		"\x03\x02\x02\x02X\u017C\x03\x02\x02\x02Z\u0182\x03\x02\x02\x02\\\u0186" +
		"\x03\x02\x02\x02^\u0189\x03\x02\x02\x02`\u018F\x03\x02\x02\x02b\u0198" +
		"\x03\x02\x02\x02d\u019E\x03\x02\x02\x02f\u01A2\x03\x02\x02\x02h\u01A5" +
		"\x03\x02\x02\x02j\u01AB\x03\x02\x02\x02l\u01B4\x03\x02\x02\x02n\u01BA" +
		"\x03\x02\x02\x02p\u01BE\x03\x02\x02\x02rs\x07c\x02\x02st\x07e\x02\x02" +
		"tu\x07v\x02\x02uv\x07k\x02\x02vw\x07x\x02\x02wx\x07k\x02\x02xy\x07v\x02" +
		"\x02yz\x07{\x02\x02z\x07\x03\x02\x02\x02{|\x07c\x02\x02|}\x07n\x02\x02" +
		"}~\x07n\x02\x02~\t\x03\x02\x02\x02\x7F\x80\x07c\x02\x02\x80\x81\x07p\x02" +
		"\x02\x81\x82\x07f\x02\x02\x82\v\x03\x02\x02\x02\x83\x84\x07c\x02\x02\x84" +
		"\x85\x07p\x02\x02\x85\x86\x07{\x02\x02\x86\r\x03\x02\x02\x02\x87\x88\x07" +
		"c\x02\x02\x88\x89\x07r\x02\x02\x89\x8A\x07r\x02\x02\x8A\x8B\x07n\x02\x02" +
		"\x8B\x8C\x07{\x02\x02\x8C\x0F\x03\x02\x02\x02\x8D\x8E\x07d\x02\x02\x8E" +
		"\x8F\x07g\x02\x02\x8F\x90\x07e\x02\x02\x90\x91\x07c\x02\x02\x91\x92\x07" +
		"w\x02\x02\x92\x93\x07u\x02\x02\x93\x94\x07g\x02\x02\x94\x11\x03\x02\x02" +
		"\x02\x95\x96\x07e\x02\x02\x96\x97\x07q\x02\x02\x97\x98\x07f\x02\x02\x98" +
		"\x99\x07g\x02\x02\x99\x13\x03\x02\x02\x02\x9A\x9B\x07e\x02\x02\x9B\x9C" +
		"\x07q\x02\x02\x9C\x9D\x07f\x02\x02\x9D\x9E\x07g\x02\x02\x9E\x9F\x07f\x02" +
		"\x02\x9F\x15\x03\x02\x02\x02\xA0\xA1\x07e\x02\x02\xA1\xA2\x07q\x02\x02" +
		"\xA2\xA3\x07p\x02\x02\xA3\xA4\x07e\x02\x02\xA4\xA5\x07g\x02\x02\xA5\xA6" +
		"\x07r\x02\x02\xA6\xA7\x07v\x02\x02\xA7\x17\x03\x02\x02\x02\xA8\xA9\x07" +
		"f\x02\x02\xA9\xAA\x07g\x02\x02\xAA\xAB\x07e\x02\x02\xAB\xAC\x07k\x02\x02" +
		"\xAC\xAD\x07u\x02\x02\xAD\xAE\x07k\x02\x02\xAE\xAF\x07q\x02\x02\xAF\xB0" +
		"\x07p\x02\x02\xB0\x19\x03\x02\x02\x02\xB1\xB2\x07f\x02\x02\xB2\xB3\x07" +
		"q\x02\x02\xB3\xB4\x07p\x02\x02\xB4\xB5\x07g\x02\x02\xB5\x1B\x03\x02\x02" +
		"\x02\xB6\xB7\x07f\x02\x02\xB7\xB8\x07q\x02\x02\xB8\x1D\x03\x02\x02\x02" +
		"\xB9\xBA\x07g\x02\x02\xBA\xBB\x07x\x02\x02\xBB\xBC\x07k\x02\x02\xBC\xBD" +
		"\x07f\x02\x02\xBD\xBE\x07g\x02\x02\xBE\xBF\x07p\x02\x02\xBF\xC0\x07e\x02" +
		"\x02\xC0\xC1\x07g\x02\x02\xC1\x1F\x03\x02\x02\x02\xC2\xC3\x07h\x02\x02" +
		"\xC3\xC4\x07t\x02\x02\xC4\xC5\x07q\x02\x02\xC5\xC6\x07o\x02\x02\xC6!\x03" +
		"\x02\x02\x02\xC7\xC8\x07k\x02\x02\xC8\xC9\x07p\x02\x02\xC9\xCA\x07h\x02" +
		"\x02\xCA\xCB\x07g\x02\x02\xCB\xCC\x07t\x02\x02\xCC\xCD\x07t\x02\x02\xCD" +
		"\xCE\x07g\x02\x02\xCE\xCF\x07f\x02\x02\xCF#\x03\x02\x02\x02\xD0\xD1\x07" +
		"k\x02\x02\xD1\xD2\x07u\x02\x02\xD2%\x03\x02\x02\x02\xD3\xD4\x07p\x02\x02" +
		"\xD4\xD5\x07q\x02\x02\xD5\xD6\x07v\x02\x02\xD6\'\x03\x02\x02\x02\xD7\xD8" +
		"\x07q\x02\x02\xD8\xD9\x07t\x02\x02\xD9)\x03\x02\x02\x02\xDA\xDB\x07r\x02" +
		"\x02\xDB\xDC\x07c\x02\x02\xDC\xDD\x07v\x02\x02\xDD\xDE\x07v\x02\x02\xDE" +
		"\xDF\x07g\x02\x02\xDF\xE0\x07t\x02\x02\xE0\xE1\x07p\x02\x02\xE1+\x03\x02" +
		"\x02\x02\xE2\xE3\x07r\x02\x02\xE3\xE4\x07g\x02\x02\xE4\xE5\x07t\x02\x02" +
		"\xE5\xE6\x07h\x02\x02\xE6\xE7\x07q\x02\x02\xE7\xE8\x07t\x02\x02\xE8\xE9" +
		"\x07o\x02\x02\xE9\xEA\x03\x02\x02\x02\xEA\xEB\b\x15\x02\x02\xEB-\x03\x02" +
		"\x02\x02\xEC\xED\x07u\x02\x02\xED\xEE\x07{\x02\x02\xEE\xEF\x07u\x02\x02" +
		"\xEF\xF0\x07v\x02\x02\xF0\xF1\x07g\x02\x02\xF1\xF2\x07o\x02\x02\xF2/\x03" +
		"\x02\x02\x02\xF3\xF4\x07v\x02\x02\xF4\xF5\x07g\x02\x02\xF5\xF6\x07t\x02" +
		"\x02\xF6\xF7\x07o\x02\x02\xF7\xF8\x07k\x02\x02\xF8\xF9\x07p\x02\x02\xF9" +
		"\xFA\x07q\x02\x02\xFA\xFB\x07n\x02\x02\xFB\xFC\x07q\x02\x02\xFC\xFD\x07" +
		"i\x02\x02\xFD\xFE\x07{\x02\x02\xFE1\x03\x02\x02\x02\xFF\u0100\x07v\x02" +
		"\x02\u0100\u0101\x07j\x02\x02\u0101\u0102\x07g\x02\x02\u0102\u0103\x07" +
		"p\x02\x02\u01033\x03\x02\x02\x02\u0104\u0105\x07v\x02\x02\u0105\u0106" +
		"\x07{\x02\x02\u0106\u0107\x07r\x02\x02\u0107\u0108\x07g\x02\x02\u0108" +
		"\u0109\x03\x02\x02\x02\u0109\u010A\b\x19\x03\x02\u010A5\x03\x02\x02\x02" +
		"\u010B\u010C\x07w\x02\x02\u010C\u010D\x07u\x02\x02\u010D\u010E\x07g\x02" +
		"\x02\u010E7\x03\x02\x02\x02\u010F\u0110\x07x\x02\x02\u0110\u0111\x07c" +
		"\x02\x02\u0111\u0112\x07n\x02\x02\u0112\u0113\x07w\x02\x02\u0113\u0114" +
		"\x07g\x02\x02\u0114\u0115\x07v\x02\x02\u0115\u0116\x07{\x02\x02\u0116" +
		"\u0117\x07r\x02\x02\u0117\u0118\x07g\x02\x02\u0118\u0119\x03\x02\x02\x02" +
		"\u0119\u011A\b\x1B\x04\x02\u011A9\x03\x02\x02\x02\u011B\u011C\x07x\x02" +
		"\x02\u011C\u011D\x07c\x02\x02\u011D\u011E\x07n\x02\x02\u011E\u011F\x07" +
		"w\x02\x02\u011F\u0120\x07g\x02\x02\u0120\u0121\x07u\x02\x02\u0121\u0122" +
		"\x07g\x02\x02\u0122\u0123\x07v\x02\x02\u0123;\x03\x02\x02\x02\u0124\u0125" +
		"\x07y\x02\x02\u0125\u0126\x07j\x02\x02\u0126\u0127\x07g\x02\x02\u0127" +
		"\u0128\x07p\x02\x02\u0128=\x03\x02\x02\x02\u0129\u012A\x07y\x02\x02\u012A" +
		"\u012B\x07k\x02\x02\u012B\u012C\x07v\x02\x02\u012C\u012D\x07j\x02\x02" +
		"\u012D?\x03\x02\x02\x02\u012E\u012F\x07g\x02\x02\u012F\u0130\x07t\x02" +
		"\x02\u0130\u0131\x07t\x02\x02\u0131\u0132\x07q\x02\x02\u0132\u0133\x07" +
		"t\x02\x02\u0133A\x03\x02\x02\x02\u0134\u0135\x07<\x02\x02\u0135C\x03\x02" +
		"\x02\x02\u0136\u0137\x070\x02\x02\u0137E\x03\x02\x02\x02\u0138\u0139\x07" +
		"*\x02\x02\u0139G\x03\x02\x02\x02\u013A\u013B\x07+\x02\x02\u013BI\x03\x02" +
		"\x02\x02\u013C\u0140\x07$\x02\x02\u013D\u013F\n\x02\x02\x02\u013E\u013D" +
		"\x03\x02\x02\x02\u013F\u0142\x03\x02\x02\x02\u0140\u013E\x03\x02\x02\x02" +
		"\u0140\u0141\x03\x02\x02\x02\u0141\u0143\x03\x02\x02\x02\u0142\u0140\x03" +
		"\x02\x02\x02\u0143\u0144\x07$\x02\x02\u0144K\x03\x02\x02\x02\u0145\u014B" +
		"\x07b\x02\x02\u0146\u014A\n\x03\x02\x02\u0147\u0148\x07^\x02\x02\u0148" +
		"\u014A\v\x02\x02\x02\u0149\u0146\x03\x02\x02\x02\u0149\u0147\x03\x02\x02" +
		"\x02\u014A\u014D\x03\x02\x02\x02\u014B\u0149\x03\x02\x02\x02\u014B\u014C" +
		"\x03\x02\x02\x02\u014C\u014E\x03\x02\x02\x02\u014D\u014B\x03\x02\x02\x02" +
		"\u014E\u014F\x07b\x02\x02\u014FM\x03\x02\x02\x02\u0150\u0151\x071\x02" +
		"\x02\u0151\u0152\x07,\x02\x02\u0152\u0156\x03\x02\x02\x02\u0153\u0155" +
		"\v\x02\x02\x02\u0154\u0153\x03\x02\x02\x02\u0155\u0158\x03\x02\x02\x02" +
		"\u0156\u0157\x03\x02\x02\x02\u0156\u0154\x03\x02\x02\x02\u0157\u0159\x03" +
		"\x02\x02\x02\u0158\u0156\x03\x02\x02\x02\u0159\u015A\x07,\x02\x02\u015A" +
		"\u015B\x071\x02\x02\u015BO\x03\x02\x02\x02\u015C\u015E\t\x04\x02\x02\u015D" +
		"\u015C\x03\x02\x02\x02\u015E\u015F\x03\x02\x02\x02\u015F\u015D\x03\x02" +
		"\x02\x02\u015F\u0160\x03\x02\x02\x02\u0160\u0161\x03\x02\x02\x02\u0161" +
		"\u0162\b\'\x05\x02\u0162Q\x03\x02\x02\x02\u0163\u0164\x071\x02\x02\u0164" +
		"\u0165\x071\x02\x02\u0165\u0169\x03\x02\x02\x02\u0166\u0168\n\x05\x02" +
		"\x02\u0167\u0166\x03\x02\x02\x02\u0168\u016B\x03\x02\x02\x02\u0169\u0167" +
		"\x03\x02\x02\x02\u0169\u016A\x03\x02\x02\x02\u016A\u016C\x03\x02\x02\x02" +
		"\u016B\u0169\x03\x02\x02\x02\u016C\u016D\b(\x05\x02\u016DS\x03\x02\x02" +
		"\x02\u016E\u016F\x05N&\x02\u016F\u0170\x03\x02\x02\x02\u0170\u0171\b)" +
		"\x05\x02\u0171U\x03\x02\x02\x02\u0172\u0174\t\x06\x02\x02\u0173\u0172" +
		"\x03\x02\x02\x02\u0174\u0175\x03\x02\x02\x02\u0175\u0173\x03\x02\x02\x02" +
		"\u0175\u0176\x03\x02\x02\x02\u0176\u0177\x03\x02\x02\x02\u0177\u0178\b" +
		"*\x06\x02\u0178\u0179\x03\x02\x02\x02\u0179\u017A\b*\x07\x02\u017AW\x03" +
		"\x02\x02\x02\u017B\u017D\t\x04\x02\x02\u017C\u017B\x03\x02\x02\x02\u017D" +
		"\u017E\x03\x02\x02\x02\u017E\u017C\x03\x02\x02\x02\u017E\u017F\x03\x02" +
		"\x02\x02\u017F\u0180\x03\x02\x02\x02\u0180\u0181\b+\x05\x02\u0181Y\x03" +
		"\x02\x02\x02\u0182\u0183\x05N&\x02\u0183\u0184\x03\x02\x02\x02\u0184\u0185" +
		"\b,\x05\x02\u0185[\x03\x02\x02\x02\u0186\u0187\v\x02\x02\x02\u0187\u0188" +
		"\b-\b\x02\u0188]\x03\x02\x02\x02\u0189\u018A\x07k\x02\x02\u018A\u018B" +
		"\x07u\x02\x02\u018B\u018C\x03\x02\x02\x02\u018C\u018D\b.\t\x02\u018D_" +
		"\x03\x02\x02\x02\u018E\u0190\t\x06\x02\x02\u018F\u018E\x03\x02\x02\x02" +
		"\u0190\u0191\x03\x02\x02\x02\u0191\u018F\x03\x02\x02\x02\u0191\u0192\x03" +
		"\x02\x02\x02\u0192\u0193\x03\x02\x02\x02\u0193\u0194\b/\n\x02\u0194\u0195" +
		"\x03\x02\x02\x02\u0195\u0196\b/\x07\x02\u0196a\x03\x02\x02\x02\u0197\u0199" +
		"\t\x04\x02\x02\u0198\u0197\x03\x02\x02\x02\u0199\u019A\x03\x02\x02\x02" +
		"\u019A\u0198\x03\x02\x02\x02\u019A\u019B\x03\x02\x02\x02\u019B\u019C\x03" +
		"\x02\x02\x02\u019C\u019D\b0\x05\x02\u019Dc\x03\x02\x02\x02\u019E\u019F" +
		"\x05N&\x02\u019F\u01A0\x03\x02\x02\x02\u01A0\u01A1\b1\x05\x02\u01A1e\x03" +
		"\x02\x02\x02\u01A2\u01A3\v\x02\x02\x02\u01A3\u01A4\b2\v\x02\u01A4g\x03" +
		"\x02\x02\x02\u01A5\u01A6\x07k\x02\x02\u01A6\u01A7\x07u\x02\x02\u01A7\u01A8" +
		"\x03\x02\x02\x02\u01A8\u01A9\b3\t\x02\u01A9i\x03\x02\x02\x02\u01AA\u01AC" +
		"\t\x06\x02\x02\u01AB\u01AA\x03\x02\x02\x02\u01AC\u01AD\x03\x02\x02\x02" +
		"\u01AD\u01AB\x03\x02\x02\x02\u01AD\u01AE\x03\x02\x02\x02\u01AE\u01AF\x03" +
		"\x02\x02\x02\u01AF\u01B0\b4\f\x02\u01B0\u01B1\x03\x02\x02\x02\u01B1\u01B2" +
		"\b4\x07\x02\u01B2k\x03\x02\x02\x02\u01B3\u01B5\t\x04\x02\x02\u01B4\u01B3" +
		"\x03\x02\x02\x02\u01B5\u01B6\x03\x02\x02\x02\u01B6\u01B4\x03\x02\x02\x02" +
		"\u01B6\u01B7\x03\x02\x02\x02\u01B7\u01B8\x03\x02\x02\x02\u01B8\u01B9\b" +
		"5\x05\x02\u01B9m\x03\x02\x02\x02\u01BA\u01BB\x05N&\x02\u01BB\u01BC\x03" +
		"\x02\x02\x02\u01BC\u01BD\b6\x05\x02\u01BDo\x03\x02\x02\x02\u01BE\u01BF" +
		"\v\x02\x02\x02\u01BF\u01C0\b7\r\x02\u01C0q\x03\x02\x02\x02\x12\x02\x03" +
		"\x04\x05\u0140\u0149\u014B\u0156\u015F\u0169\u0175\u017E\u0191\u019A\u01AD" +
		"\u01B6\x0E\x04\x03\x02\x04\x04\x02\x04\x05\x02\b\x02\x02\x03*\x02\x04" +
		"\x02\x02\x03-\x03\t\x12\x02\x03/\x04\x032\x05\x034\x06\x037\x07";
	public static __ATN: ATN;
	public static get _ATN(): ATN {
		if (!CPGLLexer.__ATN) {
			CPGLLexer.__ATN = new ATNDeserializer().deserialize(Utils.toCharArray(CPGLLexer._serializedATN));
		}

		return CPGLLexer.__ATN;
	}

}

