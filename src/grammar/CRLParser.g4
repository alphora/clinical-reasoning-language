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
    : HEADER statement* EOF
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
    : DECISION decisionIdentifier COLON decisionBody
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
    : DASH WHEN conceptReference THEN blockBody DASH END_WHEN         # WhenWithBody
    | DASH WHEN conceptReference THEN actionStatement                 # WhenSingleAction
    ;

blockBody
    : COLON ( anyOrAllClause? blockStatement+ )
    ;

anyOrAllClause
    : ANY_BLOCK
    | ALL_BLOCK
    ;

blockStatement
    : whenBlock                     # NestedWhenBlock
    | DASH actionStatement          # BlockAction
    ;

actionStatement
    : recommendStatement
    | useStatement
    ;

recommendStatement
    : RECOMMEND_ACTIVITY activityReference DOT
    ;

useStatement
    : USE_DECISION decisionReference DOT
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
    : TERMINOLOGY terminologyIdentifier ( terminologyValueset | terminologySystemCode | terminologyUnknown ) DOT
    ;

terminologyValueset
    : IS_VALUESET backtickString
    ;

terminologySystemCode
    : IS_SYSTEM backtickString AND_CODE backtickString
    ;

terminologyUnknown
    : IS_UNKNOWN_BACKTICK
    ;

doNotPerform
    : DO_NOT_PERFORM_DO DO_NOT_PERFORM_NOT DO_NOT_PERFORM_PERFORM
    ;

// ============================
// Activity Statement
// ============================
//
// Defines an executable clinical activity.
// Can reference a terminology or a custom CQL string for dynamic configuration.
//
// Examples:
//   activity "Vaccinate" request Immunization.
//   activity "Indicate" request ProposeDiagnosis with "Colonoscopy".
//   activity "Inform Clinician" request CPGCommunicationRequest with `The message to send.` because `Clinician's should be messaged about these things.`.
//
activityStatement
    : ACTIVITY activityIdentifier REQUEST (doNotPerform)? ACTIVITY_TYPE 
      (WITH (terminologyReference | activityTypeValue))? 
      (BECAUSE rationale)? 
      DOT
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
    : CONCEPT conceptIdentifier COLON conceptBody
    ;

conceptBody
    : typeLine
      valueTypeLine
      (metaLine)?
      (evidenceLine)?
      (codedFromLine | inferredFromLine)
    ;

// ============================
// Concept Property Lines
// ============================

typeLine
    : DASH TYPE_IS CONCEPT_TYPE DOT
    ;

valueTypeLine
    : DASH VALUETYPE_IS CONCEPT_VALUE_TYPE DOT
    ;

metaLine
    : DASH META_IS backtickString DOT
    ;
    
evidenceLine
    : DASH EVIDENCE_IS backtickString DOT
    ;

codedFromLine
    : DASH CODED_FROM terminologyReference DOT
    ;

inferredFromLine
    : DASH INFERRED_FROM inferredBody DOT
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
    : APPLY_PATTERN patternName
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
