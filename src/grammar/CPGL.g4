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
// Example:
//   decision "IMMZ.D2.D5.Measles":
//       when "Measles Routine Immunization Schedule Incomplete" then:
//           when "No Primary Series Doses Administered" then:
//               any:
//               - when "Client Age Less Than 12 Months" then do "Indicate".
//               - when "Last Live Vaccine Administered Within 4 Weeks" then use "Elderly Based".
//               - when "Client Is Due For MCV12" then do "Vaccinate".
//       when "One Primary Series Dose Administered" then:
//           all:
//           - when "Client Age Less Than 15 Months" then do "Indicate".
//           - when "Last Live Vaccine Administered Within 4 Weeks" then use "Elderly Based".
//           - when "Client Is Due For MCV12" then do "Vaccinate".
//       when "Two Primary Series Doses Administered" then do "Indicate".
//
decisionStatement
    : DECISION stringLiteral COLON decisionBody
    ;

// Top-level body of a decision: one or more `when` clauses
decisionBody
    : whenClause+
    ;

// A `when` clause: 
//   when "some concept" then do/use ...
//   or
//   when "some concept" then:
//       [any|all]: (optional)
//       - <listItem>
//       - <listItem>
//       ...
whenClause
    : WHEN stringLiteral THEN (whenThenBlock | singleActionStatement)
    ;

// Block introduced by "then:"
whenThenBlock
    : COLON (anyOrAllClause? listItem+)
    ;

anyOrAllClause
    : (ANY | ALL) COLON
    ;

// A single action line, e.g.  then do "Indicate".
singleActionStatement
    : (doStatement | useStatement) DOT
    ;

// Items in the list after "any:" or "all:" or default
listItem
    : DASH listItemContent
    ;

listItemContent
    // Can be a nested `when` inside (with a possible block or single do/use),
    // or a direct action statement
    : whenClause
    | actionStatement
    ;

// An action statement is either `do "someActivity".` or `use "someDecision".`
actionStatement
    : (doStatement | useStatement) DOT
    ;

// For lines such as:  do "Indicate"
doStatement
    : DO stringLiteral
    ;

// For lines such as:  use "Elderly Based"
useStatement
    : USE stringLiteral
    ;

// ------------------------- TERMINOLOGY STATEMENT --------------------------
//
// Example:
//   terminology "some terminology" unknown.
//   terminology "Colonoscopy" system "http://snomed.info/sct" code "73761001".
//
terminologyStatement
    : TERMINOLOGY stringLiteral (terminologyUnknown | terminologySystemCode) DOT
    ;

terminologyUnknown
    : UNKNOWN
    ;

terminologySystemCode
    : SYSTEM stringLiteral CODE stringLiteral
    ;

// --------------------------- ACTIVITY STATEMENT ---------------------------
//
// Example:
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
//       type Observation.
//       valuetype boolean.
//       pattern "some pattern".
//       provenance "some provenance".
//       inferred:
//           - ("Most Recent Height" and "Most Recent Weight").
//           - ("BMI as a Condition" or "BMI as a Observation").
//
conceptStatement
    : CONCEPT stringLiteral COLON conceptBody
    ;

// Enforce exactly one of each line in this order:
//
//  1. type ...
//  2. valuetype ...
//  3. pattern ...
//  4. provenance ...
//  5. inferred: ...
//
conceptBody
    : typeLine 
      valueTypeLine
      patternLine
      provenanceLine
      inferredBlock
    ;

// type Observation.
typeLine
    : TYPE CONCEPT_TYPE DOT
    ;

// valuetype boolean.
valueTypeLine
    : VALUETYPE CONCEPT_VALUE_TYPE DOT
    ;

// pattern "some pattern".
patternLine
    : PATTERN stringLiteral DOT
    ;

// provenance "some provenance".
provenanceLine
    : PROVENANCE stringLiteral DOT
    ;

// inferred: - (expr). - (expr).
// The inferred block describes how this concept might be derived from other concepts, under the assumption that each referenced concept is true. 
// The syntax uses logical keywords (and/or) to indicate how the referenced concepts collectively contribute to inferring the target. 
// Though it resembles a Boolean expression, it should be understood more as guidance or a shorthand for indicating a logical combination of references, 
// rather than a strict evaluatable expression.
inferredBlock
    : INFERRED COLON inferredList
    ;

inferredList
    : inferredItem+
    ;

inferredItem
    : DASH LPAREN expr RPAREN DOT
    ;

// ----------------------------- EXPRESSIONS -------------------------------
//
// For the "inferred" block, we allow boolean expressions with "and"/"or"
// referencing concept identifiers (quoted strings). Parentheses are allowed.
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

// KEYWORDS (case sensitive, as stated)
DECISION     : 'decision';
WHEN         : 'when';
THEN         : 'then';
ANY          : 'any';
DO           : 'do';
USE          : 'use';
ALL          : 'all';
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

// PUNCTUATION
COLON        : ':';
DASH         : '-';
DOT          : '.';
LPAREN       : '(';
RPAREN       : ')';

// ACTIVITY_TYPE possibilities
// e.g. "activity "Vaccinate" perform Immunization."
// Must exactly match one of these strings if used.
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
// e.g. "concept "Most Recent BMI": type Observation."
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
// e.g. "concept ... valuetype boolean."
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

// STRING cannot contain escape characters or internal quotes.
// This rule forbids backslashes and double-quotes inside the string contents.
STRING
    : '"' ( ~["\r\n] )* '"'
    ;

// Skip whitespace
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
