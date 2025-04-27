parser grammar CPGLParser;

options {
    tokenVocab=CPGLLexer;
}

// --------------------------------------------------------------------------
// QUOTING CONVENTIONS
// --------------------------------------------------------------------------
// Identifiers and references must be enclosed in double quotes (").
//   Example: "Colonoscopy", "BMI Valueset"
//   Used for: identifiers, references, concept names, etc.
//
// Free text, markdown, and evidence must be enclosed in backticks (`).
//   Example: `it's the right thing to do`, `Some *markdown* text`
//   Used for: evidence, markdown, system/code values, and any non-identifier string.
//
// Single quotes (') are NOT used as delimiters in this grammar.
//
// This convention ensures unambiguous parsing and user-friendly authoring.
// --------------------------------------------------------------------------

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
// A terminology may:
// - reference a valueset (mutually exclusive with system/code)
// - reference a system/code pair
// - provide an explicit empty placeholder (``) if unknown
// Terminology statements are terminated by DOT (no 'done').
//
// Examples:
//   terminology "BMI Valueset" valueset `bmi valueset`.
//   terminology "some terminology" ``.
//   terminology "Colonoscopy" system `http://snomed.info/sct` code `73761001`.
//
terminologyStatement
    : TERMINOLOGY terminologyIdentifier ( terminologyValueset | backtickString | terminologySystemCode ) DOT
    ;

terminologyValueset
    : VALUESET identifier
    ;

terminologySystemCode
    : SYSTEM backtickString CODE backtickString
    ;

// --------------------------- ACTIVITY STATEMENT ---------------------------
//
// Examples:
//   activity "Vaccinate" perform Immunization.
//   activity "Indicate" perform ProposeDiagnosis with "Colonoscopy".
//   activity "Inform Clinician" perform CPGCommunicationRequest with `The message to send.` because `Clinician's should be messaged about these things.`.
//
activityStatement
    : ACTIVITY activityIdentifier PERFORM ACTIVITY_TYPE (WITH (terminologyReference | activityTypeValue))? (BECAUSE rationale)? DOT
    ;

// ---------------------------- CONCEPT STATEMENT ---------------------------
//
// Examples:
//   concept "Most Recent BMI":
//       type is Observation.
//       valuetype is boolean.
//       evidence is `some evidence`.
//       inferred from "BMI" apply pattern `Most Recent(this, lookbackMonths)`.
//   done
//
//   concept "BMI":
//       type is Observation.
//       valuetype is Quantity.
//       inferred from ("BMI Range as a Condition" or "BMI as an Observation" or "Calculated BMI").
//   done
//
//   concept "BMI Range as a Condition":
//       type is Condition.
//       valuetype is CodeableConcept.
//       coded from "BMI Valueset".
//   done
//
conceptStatement
    : CONCEPT conceptIdentifier COLON conceptBody DONE
    ;

conceptBody
    : TypeLine
      ValueTypeLine
      (evidenceLine)?
      (codedFromLine | inferredFromLine)
    ;

// "type" clause to specify how the concept is modeled.
typeLine
    : TYPE IS CONCEPT_TYPE DOT
    ;

// "valueType" clause to specify the concept's low-level data type.
valueTypeLine
    : VALUETYPE IS CONCEPT_VALUE_TYPE DOT
    ;

// "evidence" clause to capture who, what, where, when, and how a concept is produced.
evidenceLine
    : EVIDENCE IS backtickString DOT
    ;

// "coded from" clause for concepts that reference a terminology.
codedFromLine
    : CODED FROM terminologyReference DOT
    ;

// "inferred from" clause for how a concept can be informally derived from other concepts.
inferredFromLine
    : INFERRED FROM inferredBody DOT
    ;

// The body of an "inferred from" statement describes how a concept can be informally derived
// from other concepts. It can either reference a single concept (optionally paired with a 
// pattern—a named expression applied later), or provide a descriptive narrative using 
// informal logical operators (AND, OR). These narratives document logical relationships
// among concepts without implying formal evaluatable logic.
inferredBody
    : inferredFromConceptReference    # DefinitionConcept
    | inferredFromDescriptiveLogic    # DefinitionLogic
    ;

// References a single concept identifier, optionally followed by a pattern.
// The optional pattern corresponds to the name (signature) of a referenced Clinical Quality 
// Language expression to be applied to the referenced concept in subsequent processing.
inferredFromConceptReference
    : conceptReference patternStatement?
    ;

// Optional apply pattern clause to specify a transformation applied during inference.
patternStatement
    : APPLY PATTERN patternName
    ;

// A descriptive narrative (enclosed in parentheses) describing informal logical relationships 
// among concepts using the operators AND and OR. These operators serve documentation and 
// readability purposes only and are not computationally evaluated at this stage.
inferredFromDescriptiveLogic
    : LPAREN inferredFromExpression RPAREN
    ;

// ----------------------- DESCRIPTIVE LOGICAL NARRATIVES -----------------------
//
// Inferred from expressions use informal Boolean operators AND, OR purely as descriptive 
// connectors among concept references. No formal computational logic is implied.
inferredFromExpression
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
    | LPAREN inferredFromExpression RPAREN           # GroupExpression
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
    : identifier
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

backtickString
    : BACKTICK_STRING
    ;

patternName
    : backtickString
    ;

activityTypeValue
    : backtickString
    ;

rationale
    : backtickString
    ;
