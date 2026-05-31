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
// v0.6: a concept has one of THREE body kinds (cardinality 1..1):
//   - asserted:   `coded from "Valueset"` (refs are valueset names)
//   - inferred:   `inferred from (composition)` (refs are concept names)
//   - inference:  `logic is <narrative>` (refs are concept names; body is a
//                                         narrative phrase per catalog templates)
//
// `type is X` is OPTIONAL for inferred/inference (inferred from body refs if
// omitted); REQUIRED for asserted (valuesets don't carry FHIR-type info).
// `valuetype is X` is OPTIONAL and 0..* (lazily required when something
// depends on it; inferred from type's default).
//
// Examples:
//   concept "BMI Range as a Condition":
//     - type is Condition.
//     - valuetype is CodeableConcept.
//     - coded from "BMI Valueset".
//
//   concept "Qualifying Encounter":
//     - type is Encounter.
//     - inferred from
//       (
//         "BMI Evaluation Encounter (not virtual) During MP"
//         sem-and
//         "BMI Evaluation Encounter (not virtual) Performed"
//       ).
//
//   concept "BMI Evaluation Encounter (not virtual) Performed":
//     - type is Encounter.
//     - logic is "BMI Evaluation Encounter (not virtual)" performed.
//
conceptStatement
    : CONCEPT conceptIdentifier COLON conceptBody
    ;

conceptBody
    : (typeLine)?
      (valueTypeLine)*
      (metaLine)*
      (evidenceLine)?
      (codedFromLine | inferredFromBody | logicIsBody)
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
// Logic Is Body (v0.6)
// ============================
//
// `logic is <narrative>.` — body keyword for an "inference type" concept
// whose value is determined by a narrative predicate matched against the
// catalog. The narrative phrase is a sequence of narrative elements
// (concept refs, narrative words, quantities, in-arg groups).
//
// Examples:
//   concept "BMI Evaluation Encounter (not virtual) Performed":
//   - type is Encounter.
//   - logic is "BMI Evaluation Encounter (not virtual)" performed.
//
//   concept "Aged 18+ at MP Start":
//   - type is Encounter.
//   - evidence is `USPSTF age guidance`.
//   - logic is age at start of "Measurement Period" at least 18 years.
//
logicIsBody
    : DASH LOGIC_IS narrative DOT
    ;

// ============================
// Inferred From Body (v0.6)
// ============================
//
// A concept's `inferred from` body has two shapes:
//   1. Bare reference to a named concept
//   2. Parenthesized composition with sem-or / sem-and / sem-not operators
//
// Composition operates on bare refs only (no narrative inside composition).
// Narrative belongs in concept bodies with `logic is`.
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
