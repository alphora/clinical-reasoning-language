grammar CPGL;

// --------------------------------------------------------------------------
// PARSER RULES
// --------------------------------------------------------------------------

cpgl
    : statement* EOF
    ;

// A statement can be one of the four types below
statement
    : decisionStatement
    | terminologyStatement
    | activityStatement
    | conceptStatement
    ;

// --------------------------- DECISION STATEMENT ----------------------------
//
// Example (simplified excerpt):
//   decision "IMMZ.D2.D5.Measles":
//       when "Measles Routine Immunization Schedule Incomplete" then:
//           when "No Primary Series Doses Administered" then:
//               any:
//               when "Client Age Less Than 12 Months" then do "Indicate".
//               when "Last Live Vaccine Administered Within 4 Weeks" then use "Elderly Based".
//           done
//           when "Client Is Due For MCV12" then do "Vaccinate".
//       done
//       when "Two Primary Series Doses Administered" then do "Indicate".
//   done
//
decisionStatement
    : DECISION stringLiteral COLON decisionBody DONE
    ;

decisionBody
    : whenBlock+
    ;

// A `whenBlock` is the grammar element for lines starting with "when ... then ..."
whenBlock
    : WHEN stringLiteral THEN ( blockBody | singleActionStatement )
    ;

// If the `when` has a colon after 'then', we parse multiple statements until 'done'
blockBody
    : COLON (anyOrAllClause? blockStatement+ ) DONE
    ;

// If the `when` has a single action on the same line, we parse it as do/use
singleActionStatement
    : (doStatement | useStatement) DOT
    ;

// Optional "any:" or "all:"
anyOrAllClause
    : (ANY | ALL) COLON
    ;

// A block can contain nested `when` or action statements
blockStatement
    : whenBlock
    | actionStatement
    ;

// An action statement is either `do "something".` or `use "something".`
actionStatement
    : (doStatement | useStatement) DOT
    ;

doStatement
    : DO stringLiteral
    ;

useStatement
    : USE stringLiteral
    ;

// ------------------------- TERMINOLOGY STATEMENT --------------------------
//
// Examples:
//   terminology "some terminology" unknown.
//   terminology "Colonoscopy" system "http://snomed.info/sct" code "73761001".
//
terminologyStatement
    : TERMINOLOGY stringLiteral (terminologyValueset | terminologyUnknown | terminologySystemCode) DOT
    ;

terminologyValueset
    : VALUESET stringLiteral
    ;

terminologyUnknown
    : UNKNOWN
    ;

terminologySystemCode
    : SYSTEM stringLiteral CODE stringLiteral
    ;

// --------------------------- ACTIVITY STATEMENT ---------------------------
//
// Examples:
//   activity "Vaccinate" perform Immunization.
//   activity "Indicate" perform ProposeDiagnosis of "Colonoscopy".
//
activityStatement
    : ACTIVITY stringLiteral PERFORM ACTIVITY_TYPE (OF stringLiteral)? DOT
    ;

// ---------------------------- CONCEPT STATEMENT ---------------------------
//
// Example:
//   concept "Most Recent BMI":
//       type Observation
//       valuetype boolean
//       pattern "some pattern"
//       provenance "some provenance"
//       inferred:
//           ("Most Recent Height" and "Most Recent Weight").
//           ("BMI as a Condition" or "BMI as a Observation").
//   done
//
conceptStatement
    : CONCEPT stringLiteral COLON conceptBody DONE
    ;

conceptBody
    : typeLine
      valueTypeLine
      codingLine?
      patternLine?
      provenanceLine?
      inferredBlock?
    ;

typeLine
    : TYPE CONCEPT_TYPE
    ;

valueTypeLine
    : VALUETYPE CONCEPT_VALUE_TYPE
    ;

patternLine
    : PATTERN stringLiteral
    ;

provenanceLine
    : PROVENANCE stringLiteral
    ;

codedLine
    : CODING (OF stringLiteral)
    ;

// inferred block like:
//   inferred:
//       ("Most Recent Height" and "Most Recent Weight").
//       ("BMI as a Condition" or "BMI as a Observation").
//
inferredBlock
    : INFERRED COLON inferredExpression+
    ;

inferredExpression
    : LPAREN expr RPAREN DOT
    ;

// ----------------------------- EXPRESSIONS -------------------------------
//
// For the "inferred" block, we allow expressions with "and"/"or" referencing
// concept identifiers (quoted strings). Parentheses are allowed.
//
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
    : stringLiteral
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
PATTERN      : 'pattern';
PROVENANCE   : 'provenance';
INFERRED     : 'inferred';
AND          : 'and';
OR           : 'or';
DONE         : 'done';
CODING       : 'coding';

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

// Quoted string with no internal quotes or backslashes
STRING
    : '"' ( ~["\\\r\n] )* '"'
    ;

// Treat whitespace as skip
WS
    : [ \t\r\n]+ -> skip
    ;

// Single line comment
COMMENT
    : '//' ~[\r\n]* -> skip
    ;

// Block comment
COMMENT_BLOCK
    : '/*' .*? '*/' -> skip
    ;

// For readability in code, capture these as parser tokens
fragment CHAR : ~["\\\r\n];
fragment ANY_CHAR : . ;
