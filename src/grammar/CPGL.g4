grammar CPGL;

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
//
// Example:
//   decision "IMMZ.D2.D5.Measles":
//       when "Measles Routine Immunization Schedule Incomplete" then:
//           any:
//               when "No Primary Series Doses Administered" then:
//                   when "Client Age Less Than 12 Months" then do "Indicate".
//                   when "Last Live Vaccine Administered has had in 4 Weeks" then use "Elderly Based".
//               done 
//               when "Client Is Due For MCV12" then do "Vaccinate".
//       done
//       when "One Primary Series Dose Administered" then:
//           all:
//               when "Client Age Less Than 15 Months" then do "Indicate".
//               when "Last Live Vaccine Administered has had in 4 Weeks" then use "Elderly Based".
//               when "Client Is Due For MCV12" then do "Vaccinate".
//       done
//       when "Two Primary Series Doses Administered" then do "Indicate".
//   done
//
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

// Block body: after "then:" a list of statements terminated by "done"
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

// PUNCTUATION
COLON        : ':';
DOT          : '.';
LPAREN       : '(';
RPAREN       : ')';

// ACTIVITY_TYPE possibilities
ACTIVITY_TYPE
    : 'AdministerMedication'
    | 'CollectInformation'
    | 'Communication'
    | 'DispenseMedication'
    | 'DocumentMedication'
    | 'Enrollment'
    | 'GenerateReport'
    | 'Hold'
    | 'Immunization'
    | 'MedicationRequest'
    | 'ProposeDiagnosis'
    | 'RecordDetectedIssue'
    | 'RecordInference'
    | 'ReportFlag'
    | 'Resume'
    | 'ServiceRequest'
    | 'Stop'
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

// STRING: quoted string without escapes or internal quotes.
STRING
    : '"' ( ~["\\\r\n] )* '"'
    ;

// identifier: quoted string without escapes or internal quotes.
stringLiteral
    : STRING
    ;

// identifier: quoted string without escapes or internal quotes.
identifier
    : STRING
    ;

// Skip whitespace.
WS
    : [ \t\r\n]+ -> skip
    ;

// Single line comment.
COMMENT
    : '//' ~[\r\n]* -> skip
    ;

// Block comment.
COMMENT_BLOCK
    : '/*' .*? '*/' -> skip
    ;

// Fragments for readability.
fragment CHAR : ~["\\\r\n];
fragment ANY_CHAR : . ;
