parser grammar CPGLParser;

options {
    tokenVocab=CPGLLexer;
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