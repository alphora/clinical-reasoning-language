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
    : DECISION decisionIdentifier COLON decisionBody DONE
    ;

decisionBody
    : whenBlock+
    ;

// A whenBlock covers a "when <concept> then ..." clause
whenBlock
    : WHEN conceptReference THEN blockBody              # WhenWithBody
    | WHEN conceptReference THEN singleActionStatement  # WhenSingleAction
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
    : whenBlock                # NestedWhenBlock
    | actionStatement          # BlockAction
    ;

// Action statements for do and use operations.
actionStatement
    : (doStatement | useStatement) DOT
    ;

doStatement
    : DO activityReference
    ;

useStatement
    : USE decisionReference
    ;

// ------------------------- TERMINOLOGY STATEMENT --------------------------
//
// Examples:
//   terminology "BMI Valueset" valueset "bmi valueset".
//   terminology "some terminology" unknown.
//   terminology "Colonoscopy" system "http://snomed.info/sct" code "73761001".
//
terminologyStatement
    : TERMINOLOGY terminologyIdentifier ( terminologyValueset | terminologyUnknown | terminologySystemCode ) DOT
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
    : ACTIVITY activityIdentifier PERFORM ACTIVITY_TYPE (OF terminologyReference)? DOT
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
    : CONCEPT conceptIdentifier COLON conceptBody DONE
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
    : CODED BY terminologyReference DOT
    ;

// "inferred by" clause for how a concept can be informally derived from other concepts.
inferredByLine
    : INFERRED BY inferredBody DOT
    ;

// The body of an "inferred by" statement describes how a concept can be informally derived
// from other concepts. It can either reference a single concept (optionally paired with a 
// pattern—a named expression applied later), or provide a descriptive narrative using 
// informal logical operators (AND, OR). These narratives document logical relationships
// among concepts without representing formal evaluatable logic.
inferredBody
    : inferredByConceptReference    # DefinitionConcept
    | inferredByDescriptiveLogic    # DefinitionLogic
    ;

// References a single concept identifier, optionally preceded by a pattern identifier.
// The optional pattern identifier corresponds to the name (signature) of a referenced Clinical Quality 
// Language expression to be applied to the referenced concept in subsequent processing.
inferredByConceptReference
    : patternReference? conceptReference
    ;

// A descriptive narrative (enclosed in parentheses) describing informal logical relationships 
// among concepts using the operators AND and OR. These operators serve documentation and 
// readability purposes only and are not computationally evaluated at this stage.
inferredByDescriptiveLogic
    : LPAREN inferredByExpression RPAREN
    ;

// ----------------------- DESCRIPTIVE LOGICAL NARRATIVES -----------------------
//
// Inferred by expressions use informal Boolean operators AND, OR purely as descriptive 
// connectors among concept references. No formal computational logic is implied.
inferredByExpression
    : informalOr
    ;

informalOr
    : informalAnd (OR informalAnd)*
    ;

informalAnd
    : informalNot (AND informalNot)*
    ;

informalNot
    : NOT informalNot
    | atom
    ;

atom
    : conceptReference                             # ConceptAtom
    | LPAREN inferredByExpression RPAREN           # GroupExpression
    ;

// ----------------------------- IDENTIFIER RULE ------------------------------

identifier
    : QUOTED_STRING
    ;

decisionIdentifier
    : identifier
    ;

decisionReference
    : decisionIdentifier
    ;

terminologyIdentifier
    : identifier
    ;

terminologyReference
    : terminologyIdentifier
    ;

activityIdentifier
    : identifier
    ;

activityReference
    : activityIdentifier
    ;

conceptIdentifier
    : identifier
    ;

conceptReference
    : conceptIdentifier
    ;

patternIdentifier
    : identifier
    ;

patternReference
    : patternIdentifier
    ;

// A helper rule to also refer to a string literal.
stringLiteral
    : STRING
    | QUOTED_STRING
    ; 