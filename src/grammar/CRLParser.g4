parser grammar CRLParser;

options {
    tokenVocab=CRLLexer;
}

// ============================
// Quoting Conventions
// ============================
//
// Identifiers and references must be enclosed in double quotes (").
//   Example: "Colonoscopy", "BMI Valueset"
//   Used for: identifiers, references, concept names, etc.
//
// Free text, markdown, and evidence must be enclosed in backticks (`).
//   Example: `it's the right thing to do`, `Some *markdown* text`
//   Used for: evidence, markdown, system/code values, and non-identifier strings.
//
// Single quotes (') are NOT used.
//
// This ensures unambiguous parsing and user-friendly authoring.

// ============================
// Parser Rules
// ============================

crl
    : statement* EOF
    ;

statement
    : decisionStatement
    | terminologyStatement
    | activityStatement
    | conceptStatement
    ;

// ============================
// Decision Statement
// ============================
//
// A reusable decision logic block.
// Consists of "when" conditions leading to "do" or "use" actions.
//
// Examples:
//   decision "Example Decision":
//     when "Concept" then do "Action".
//   done
//
decisionStatement
    : DECISION decisionIdentifier COLON decisionBody DONE
    ;

decisionBody
    : whenBlock+
    ;

// ============================
// When Blocks and Actions
// ============================
//
// A whenBlock covers a "when <concept> then ..." clause.

whenBlock
    : WHEN conceptReference THEN blockBody              # WhenWithBody
    | WHEN conceptReference THEN singleActionStatement  # WhenSingleAction
    ;

anyOrAllClause
    : (ANY | ALL) COLON
    ;

blockBody
    : COLON (anyOrAllClause? blockStatement+ ) DONE
    ;

singleActionStatement
    : (doStatement | useStatement) DOT
    ;

blockStatement
    : whenBlock                # NestedWhenBlock
    | actionStatement          # BlockAction
    ;

actionStatement
    : (doStatement | useStatement) DOT
    ;

doStatement
    : DO activityReference
    ;

useStatement
    : USE decisionReference
    ;

// ============================
// Terminology Statement
// ============================
//
// Defines a terminology reference.
// Terminologies can:
//   - Reference a valueset (exclusive with system/code)
//   - Reference a system/code pair
//   - Provide an explicit empty placeholder (``)
//
// Examples:
//   terminology "BMI Valueset" valueset `BMI`.
//   terminology "Some Terminology" ``.
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

// ============================
// Activity Statement
// ============================
//
// Defines an executable clinical activity.
// Can reference a terminology or a custom CQL string for dynamic configuration.
//
// Examples:
//   activity "Vaccinate" perform Immunization.
//   activity "Indicate" perform ProposeDiagnosis with "Colonoscopy".
//   activity "Inform Clinician" perform CPGCommunicationRequest with `The message to send.` because `Clinician's should be messaged about these things.`.
//
activityStatement
    : ACTIVITY activityIdentifier PERFORM ACTIVITY_TYPE (WITH (terminologyReference | activityTypeValue))? (BECAUSE rationale)? DOT
    ;

// ============================
// Concept Statement
// ============================
//
// Defines a reusable clinical concept.
// Must either be coded from a terminology or inferred from other concepts.
// Evidence (metadata/provenance) is optional.
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
//     type is Observation.
//     valuetype is Quantity.
//     inferred from ("BMI Range" or "BMI Observation").
//   done
//
//   concept "BMI Range":
//     type is Condition.
//     valuetype is CodeableConcept.
//     coded from "BMI Valueset".
//   done
//
conceptStatement
    : CONCEPT conceptIdentifier COLON conceptBody DONE
    ;

conceptBody
    : typeLine
      valueTypeLine
      (evidenceLine)?
      (codedFromLine | inferredFromLine)
    ;

// ============================
// Concept Property Lines
// ============================

typeLine
    : TYPE IS CONCEPT_TYPE DOT
    ;

valueTypeLine
    : VALUETYPE IS CONCEPT_VALUE_TYPE DOT
    ;

evidenceLine
    : EVIDENCE IS backtickString DOT
    ;

codedFromLine
    : CODED FROM terminologyReference DOT
    ;

inferredFromLine
    : INFERRED FROM inferredBody DOT
    ;

// ============================
// Inference Body
// ============================
//
// A concept can be inferred from:
//   - a single concept (optionally applying a pattern)
//   - or a logical expression combining multiple concepts.
//
inferredBody
    : inferredFromConceptReference    # DefinitionConcept
    | inferredFromDescriptiveLogic    # DefinitionLogic
    ;

inferredFromConceptReference
    : conceptReference patternStatement?
    ;

patternStatement
    : APPLY PATTERN patternName
    ;

inferredFromDescriptiveLogic
    : LPAREN inferredFromExpression RPAREN
    ;

// ============================
// Descriptive Logical Narratives
// ============================
//
// Informal logical expressions using AND, OR, and NOT for clarity.

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
    : conceptReference                      # ConceptAtom
    | LPAREN inferredFromExpression RPAREN  # GroupExpression
    ;

// ============================
// Identifier and Token Mappings
// ============================

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
