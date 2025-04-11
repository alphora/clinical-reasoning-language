grammar CPGL;

// --------------------------------------------------------------------------
// PARSER ERROR HANDLING MEMBERS
// --------------------------------------------------------------------------
@parser::members {
    /**
     * Override to customize error reporting.
     */
    public override notifyErrorListeners(offendingToken: Token, msg: string, e: RecognitionException): void {
        const formattedMessage = `Syntax error at line ${offendingToken.line}:${offendingToken.charPositionInLine} - ${msg}`;
        super.notifyErrorListeners(offendingToken, formattedMessage, e);
    }

    /**
     * Override inline recovery to throw an exception for unexpected tokens.
     */
    public override recoverInline(recognizer: Parser): Token {
        const e = new InputMismatchException(this);
        this.notifyErrorListeners(this._input.LT(1), `Unexpected token: ${this.getCurrentToken().text}`, e);
        throw e;
    }

    /**
     * Override recovery to halt parsing immediately on error.
     */
    public override recover(e: RecognitionException): void {
        throw new Error(e.message);
    }
}

@lexer::members {
    /**
     * Override to customize error reporting and throw exceptions for invalid tokens.
     */
    public override notifyErrorListeners(msg: string, offendingSymbol: Token | null, e: RecognitionException | null): void {
        const formattedMessage = `Lexer error - ${msg}`;
        super.notifyErrorListeners(formattedMessage, offendingSymbol, e);
        throw new Error(formattedMessage);
    }

    public notifyListeners(e: antlr4ts.LexerNoViableAltException): void {
        const formattedMessage = `Invalid token at line ${e.startIndex}: ${e.message}`;
        throw new Error(formattedMessage);
    }
}

// --------------------------------------------------------------------------
// PARSER RULES
// --------------------------------------------------------------------------

cpgl
    : statement* EOF
    ;

statement
    : decisionStatement
    | terminologyStatement
    | activityStatement
    | conceptStatement
    ;

// --------------------------- DECISION STATEMENT ----------------------------

decisionStatement
    : DECISION identifier COLON decisionBody DONE
    ;

decisionBody
    : whenBlock+
    ;

// A whenBlock covers a "when <concept> then ..." clause
whenBlock
    : WHEN identifier THEN ( blockBody | singleActionStatement )
    ;

// "any:" or "all:" clause for lists
anyOrAllClause
    : (ANY | ALL) COLON
    ;

// Block body: a list of statements terminated by "done"
blockBody
    : COLON (anyOrAllClause? blockStatement+ ) DONE
    ;

// Single action statement: a one-line action ending with DOT.
singleActionStatement
    : (doStatement | useStatement) DOT
    ;

// A block statement is either a nested whenBlock or an action statement.
blockStatement
    : whenBlock
    | actionStatement
    ;

// Action statements for do and use operations.
actionStatement
    : (doStatement | useStatement) DOT
    ;

doStatement
    : DO identifier
    ;

useStatement
    : USE identifier
    ;

// ------------------------- TERMINOLOGY STATEMENT --------------------------
//
// Examples:
//   terminology "BMI Valueset" valueset "bmi valueset".
//   terminology "some terminology" unknown.
//   terminology "Colonoscopy" system "http://snomed.info/sct" code "73761001".
//
terminologyStatement
    : TERMINOLOGY identifier ( terminologyValueset | terminologyUnknown | terminologySystemCode ) DOT
    ;

terminologyValueset
    : VALUESET identifier
    ;

terminologyUnknown
    : UNKNOWN
    ;

terminologySystemCode
    : SYSTEM identifier CODE identifier
    ;

// --------------------------- ACTIVITY STATEMENT ---------------------------
//
// Examples:
//   activity "Vaccinate" perform Immunization.
//   activity "Indicate" perform ProposeDiagnosis of "Colonoscopy".
//
activityStatement
    : ACTIVITY identifier PERFORM ACTIVITY_TYPE (OF identifier)? DOT
    ;

// ---------------------------- CONCEPT STATEMENT ---------------------------
//
// Examples:
//   concept "Most Recent BMI":
//       has type Observation.
//       has valuetype boolean.
//       has provenance "some provenance".
//       inferred by "Most Recent(this, lookbackMonths)" "BMI".
//   done
//
//   concept "BMI":
//       has type Observation.
//       has valuetype Quantity.
//       inferred by ("BMI Range as a Condition" or "BMI as an Observation" or "Calculated BMI").
//   done
//
//   concept "BMI Range as a Condition":
//       has type Condition.
//       has valuetype CodeableConcept.
//       coded by "BMI Valueset".
//   done
//
conceptStatement
    : CONCEPT identifier COLON conceptBody DONE
    ;

conceptBody
    : hasTypeLine
      hasValueTypeLine
      (provenanceLine)?
      (codedByLine | inferredByLine)
    ;

// "has" property lines for concept definitions.
hasTypeLine
    : HAS TYPE CONCEPT_TYPE DOT
    ;

hasValueTypeLine
    : HAS VALUETYPE CONCEPT_VALUE_TYPE DOT
    ;

provenanceLine
    : HAS PROVENANCE stringLiteral DOT
    ;

// "coded by" clause for concepts that reference a terminology.
codedByLine
    : CODED BY identifier DOT
    ;

// "inferred by" clause for concepts with logic expressions.
inferredByLine
    : INFERRED BY inferredBody DOT
    ;

// The body of an "inferred by" statement can be either an optional pattern and concept
// or a parenthesized logical expression.
inferredBody
    : inferredByExpr
    | inferredByPattern
    ;

inferredByPattern
    : identifier? identifier
    ;

inferredByExpr
    : LPAREN expr RPAREN
    ;

// ----------------------------- EXPRESSIONS -------------------------------
//
// Expressions used in inferred by lines allow logical operators AND, OR.
expr
    : orExpr
    ;

orExpr
    : andExpr (OR andExpr)*
    ;

andExpr
    : atom (AND atom)*
    ;

atom
    : identifier
    | LPAREN orExpr RPAREN
    ;

// ----------------------------- IDENTIFIER RULE ------------------------------

// In CPGL, quoted strings are treated as identifiers.
identifier
    : STRING
    ;

// A helper rule to also refer to a string literal.
stringLiteral
    : STRING
    ;

// --------------------------------------------------------------------------
// LEXER RULES
// --------------------------------------------------------------------------

// KEYWORDS (case sensitive)
DECISION     : 'decision';
WHEN         : 'when';
THEN         : 'then';
ANY          : 'any';
ALL          : 'all';
DO           : 'do';
USE          : 'use';
ACTIVITY     : 'activity';
UNKNOWN      : 'unknown';
SYSTEM       : 'system';
CODE         : 'code';
PERFORM      : 'perform';
OF           : 'of';
CONCEPT      : 'concept';
TYPE         : 'type';
VALUETYPE    : 'valuetype';
TERMINOLOGY  : 'terminology';
PROVENANCE   : 'provenance';
INFERRED     : 'inferred';
AND          : 'and';
OR           : 'or';
DONE         : 'done';
HAS          : 'has';
BY           : 'by';
CODED        : 'coded';
VALUESET     : 'valueset';

// Punctuation
COLON        : ':';
DOT          : '.';
LPAREN       : '(';
RPAREN       : ')';

// ACTIVITY_TYPE possibilities
ACTIVITY_TYPE
    : 'AdministerMedicationActivity'
    | 'CollectInformationActivity'
    | 'CommunicationActivity'
    | 'DispenseMedicationActivity'
    | 'DocumentMedicationActivity'
    | 'EnrollmentActivity'
    | 'GenerateReportActivity'
    | 'HoldActivity'
    | 'ImmunizationActivity'
    | 'MedicationRequestActivity'
    | 'ProposeDiagnosisActivity'
    | 'RecordDetectedIssueActivity'
    | 'RecordInferenceActivity'
    | 'ReportFlagv'
    | 'ResumeActivity'
    | 'ServiceRequestActivity'
    | 'StopActivity'
    ;

// CONCEPT_TYPE possibilities
CONCEPT_TYPE
    : 'Communication'
    | 'CommunicationRequest'
    | 'Condition'
    | 'QuestionnaireTask'
    | 'QuestionnaireResponse'
    | 'MedicationRequest'
    | 'MedicationDispense'
    | 'MedicationAdministration'
    | 'MedicationStatement'
    | 'ImmunizationRequest'
    | 'Immunization'
    | 'ServiceRequest'
    | 'Procedure'
    | 'Observation'
    ;

// CONCEPT_VALUE_TYPE possibilities
CONCEPT_VALUE_TYPE
    : 'Quantity'
    | 'CodeableConcept'
    | 'string'
    | 'boolean'
    | 'integer'
    | 'Range'
    | 'Ratio'
    | 'SampledData'
    | 'time'
    | 'dateTime'
    | 'Period'
    | 'Attachment'
    ;

// STRING: quoted string without escape sequences or internal quotes.
STRING
    : '"' ( ~["\\\r\n] )* '"'
    ;

// Skip whitespace.
WS
    : [ \t\r\n]+ -> skip
    ;

// Single-line comment.
COMMENT
    : '//' ~[\r\n]* -> skip
    ;

// Block comment.
COMMENT_BLOCK
    : '/*' .*? '*/' -> skip
    ;

// Fragments for readability.
fragment CHAR : ~["\\\r\n] ;
fragment ANY_CHAR : . ;
