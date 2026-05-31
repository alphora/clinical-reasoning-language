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
    | inferenceStatement       // v0.5: new top-level statement for narrative predicates
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
//
// Examples:
//   terminology "BMI Valueset":
//      - valueset is `BMI`.
//   terminology "Some Terminology":
//      - valueset is ``.
//   terminology "Colonoscopy":
//      - system is `http://snomed.info/sct`.
//      - code is `73761001`.
//
terminologyStatement
    : TERMINOLOGY terminologyIdentifier COLON terminologyBody
    ;

terminologyBody
    : terminologyLine+
    ;

terminologyLine
    : ( terminologyValueset | terminologySystemCode )
    ;

terminologyValueset
    : DASH VALUESET_IS backtickString DOT
    ;

terminologySystemCode
    : terminologySystem terminologyCode+
    ;

terminologySystem
    : DASH SYSTEM_IS backtickString DOT
    ;

terminologyCode
    : DASH CODE_IS backtickString DOT
    ;

// ============================
// Activity Statement
// ============================
//
// Defines an executable clinical activity.
// Can reference a terminology or a custom CQL string for dynamic configuration.
//
// Examples:
//   activity "Vaccinate":
//      - request Immunization.
//   activity "Indicate":
//      - request ProposeDiagnosis.
//      - with "Colonoscopy".
//   activity "Inform Clinician":
//      - request CPGCommunicationRequest.
//      - with `The message to send.`.
//      - because `Clinician's should be messaged about these things.`.
//
doNotPerform
    : DO_NOT_PERFORM_DO DO_NOT_PERFORM_NOT DO_NOT_PERFORM_PERFORM
    ;

activityStatement
    : ACTIVITY activityIdentifier COLON activityBody
    ;

activityBody
    : activityRequest (activityWith)? (activityBecause)?
    ;

activityRequest
    : DASH REQUEST (doNotPerform)? ACTIVITY_TYPE DOT
    ;

activityWith
    : DASH WITH (terminologyReference | activityTypeValue) DOT
    ;

activityBecause
    : DASH BECAUSE rationale DOT
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
      (metaLine)*
      (evidenceLine)?
      (codedFromLine | inferredFromBody)
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

// ============================
// Inference Statement (v0.5)
// ============================
//
// Names a narrative predicate. The body is a single narrative phrase
// introduced by `-` and terminated by `.`. Optional meta/evidence
// lines (same shape as concept body).
//
// Examples:
//   inference "BMI Evaluation Encounter Performed":
//   - "BMI Evaluation Encounter (not virtual)" performed.
//
//   inference "Aged 18+ at MP Start":
//   - evidence is `USPSTF age guidance`.
//   - age at start of "Measurement Period" at least 18 years.
//
inferenceStatement
    : INFERENCE inferenceIdentifier COLON
      (metaLine)*
      (evidenceLine)?
      DASH narrative DOT
    ;

inferenceIdentifier
    : identifier
    ;

// ============================
// Inference Body (v0.5)
// ============================
//
// A concept's `inferred from` body has two shapes:
//   1. Bare reference to a named inference or concept
//   2. Parenthesized composition with sem-or / sem-and / sem-not operators
//
// Composition operates on bare refs only (no narrative inside composition).
// Narrative belongs in `inference` declarations.
//
// Examples:
//   - inferred from "Underweight Active".
//
//   - inferred from
//   (
//      "BMI Evaluation Encounter During MP"
//      sem-and
//      "BMI Evaluation Encounter Performed"
//   ).
//
inferredFromBody
    : DASH INFERRED_FROM ifBody DOT
    ;

ifBody
    : conceptReference                                  # InferredFromBareRef
    | LPAREN compositionExpression RPAREN               # InferredFromComposition
    ;

compositionExpression
    : semOr
    ;

semOr
    : semAnd (SEM_OR semAnd)*
    ;

semAnd
    : semNot (SEM_AND semNot)*
    ;

semNot
    : SEM_NOT semNot
    | compositionAtom
    ;

compositionAtom
    : conceptReference                                  # CompositionRef
    | LPAREN compositionExpression RPAREN               # CompositionGroup
    ;

// ============================
// Narrative (used by inferenceStatement)
// ============================
//
// A narrative phrase is a sequence of narrative elements: quoted concept
// references, narrative words (lowercase identifiers and the AND/OR/NOT/WITH
// keywords used as English words), quantity literals, and in-arg groups
// (parenthesized disjunctions/conjunctions of values).
//
narrative
    : narrativeElement+
    ;

narrativeElement
    : QUOTED_STRING                                          # NConceptRef
    | quantity                                               # NQuantity
    | (AND | OR | NOT | WITH | NARRATIVE_WORD | TIME_UNIT)   # NWord
    | argGroup                                               # NArgGroupElement
    ;

quantity
    : NUMBER (UCUM_UNIT | TIME_UNIT)   // unit REQUIRED — design choice
    ;

// In-arg group: parenthesized disjunction/conjunction. Homogeneous per group
// (mixed connectors require nested parens). argValue restricted to refs,
// quantities, or nested groups — NO inner multi-token narrative.
argGroup
    : LPAREN argValue (OR argValue)+ RPAREN                  # ArgDisjunction
    | LPAREN argValue (AND argValue)+ RPAREN                 # ArgConjunction
    | LPAREN argValue RPAREN                                 # ArgSingleton
    ;

argValue
    : QUOTED_STRING                                          # AVConceptRef
    | quantity                                               # AVQuantity
    | argGroup                                               # AVNestedGroup
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

activityTypeValue
    : backtickString
    ;

rationale
    : backtickString
    ;
